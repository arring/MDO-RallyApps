/** this app shows Cumulative flows for teams of a specific type, and their aggregate output.
	this is scoped to a release. This app assumes you follow scrum naming conventions across your trains
	example: show all 'Array' teams' across all trains for release Q414
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('FunctionalCFDCharts', {
		extend: 'IntelRallyApp',
		cls:'app',
		requires:[
			'FastCumulativeFlowCalculator'
		],
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'CumulativeFlowChartMixin',
			'ParallelLoader',
			'UserAppsPreference'
		],
		minWidth:910,
		items:[{
			xtype:'container',
			id:'navBar'
		},{
			xtype:'container',
			width:'100%',
			layout:{
				type:'hbox',
				pack:'center'
			},
			items:[{
				xtype:'container',
				width:'66%',
				id:'aggregateChart'
			}]
		},{
			xtype:'container',
			id:'scrumCharts',
			layout:'column',
			width:'100%'
		}],

		_userAppsPref: 'intel-Func-CFD', //dont share release scope settings with other apps	

		/********************************************************** UTIL FUNC ******************************/
		_getTeamTypeAndNumber: function(scrumName){ //NOTE this assumes that your teamNames are "<TeamType> <Number> - <TrainName>"
			var name = scrumName.split('-')[0],
				teamType = name.split(/\d/)[0],
				number = (teamType === name ? 1 : name.split(teamType)[1])*1;
			return {
				TeamType: teamType.trim(),
				Number: number
			};
		},
		
		/****************************************************** DATA STORE METHODS ********************************************************/
		_loadSnapshotStores: function(){
			var me = this;	
			me.TeamStores = {};
			me.AllSnapshots = [];
			return Q.all(_.map(me.ReleasesWithName, function(releaseRecords){
				return Q.all(_.map(releaseRecords, function(releaseRecord){
					var parallelLoaderConfig = {
						url: me.BaseUrl + '/analytics/v2.0/service/rally/workspace/' + 
							me.getContext().getWorkspace().ObjectID + '/artifact/snapshot/query.js',
						params: {
							workspace: me.getContext().getWorkspace()._ref,
							compress:true,
							find: JSON.stringify({ 
								_TypeHierarchy: 'HierarchicalRequirement',
								Children:null,
								Release: releaseRecord.data.ObjectID
							}),
							fields:JSON.stringify(['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID']),
							hydrate:JSON.stringify(['ScheduleState'])
						}
					};
					return me._parallelLoadLookbackStore(parallelLoaderConfig)
						.then(function(snapshotStore){ 
							var records = snapshotStore.getRange();
							if(records.length > 0){
								var teamName = releaseRecords[0].data.Project.Name;
								if(!me.TeamStores[teamName]) me.TeamStores[teamName] = [];
								me.TeamStores[teamName] = me.TeamStores[teamName].concat(records);
								me.AllSnapshots = me.AllSnapshots.concat(records);
							}
						});
				}));
			}));
		},
		_loadAllProjectReleases: function(){ 
			var me = this,
				releaseName = me.ReleaseRecord.data.Name.split(' ')[0]; //we must split this so we get Light/Rave on the same page!
			me.ReleasesWithName = []; //NOTE: this is a list of lists
			return Q.all(_.map(me.ProjectsOfFunction, function(projectRecord){		
				return me._loadReleasesByNameContainsForProject(releaseName, projectRecord)
					.then(function(releases){ if(releases.length) me.ReleasesWithName.push(releases); });
			}));
		},

		/******************************************************* Reloading ********************************************************/			
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		_reloadEverything:function(){
			var me=this;
			me.setLoading('Loading Stores');		
			return me._loadAllProjectReleases()
				.then(function(){ return me._loadSnapshotStores(); })
				.then(function(){
					$('#scrumCharts-innerCt').empty();
					me.setLoading('Loading Charts');	
					if(!me.ReleasePicker) me._buildReleasePicker();
					me._buildCharts();
					me._hideHighchartsLinks();
					me.setLoading(false);
				});
		},

		/******************************************************* LAUNCH ********************************************************/		
		launch: function(){
			var me = this;
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me.setLoading('Loading Configuration');
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //parallel loads
						me._loadAllLeafProjects() /******** load stream 1 *****/
							.then(function(leafProjects){
								me.LeafProjects = leafProjects;
								if(!me.LeafProjects[me.ProjectRecord.data.ObjectID]) 
									return Q.reject('You are not Scoped to a valid Project');
								me.TeamType = me._getTeamTypeAndNumber(me.ProjectRecord.data.Name).TeamType;
								me.ProjectsOfFunction = _.filter(me.LeafProjects, function(proj){
									return me._getTeamTypeAndNumber(proj.data.Name).TeamType == me.TeamType; 
								});
							}),
						me._loadAppsPreference()	/******** load stream 2 *****/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){	return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},
		
		/**************************************************** RENDERING Navbar ******************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me._alert('ERROR', reason || '');
					me.setLoading(false);
				})
				.done();
		},		
		_buildReleasePicker: function(){
			var me=this;
			me.ReleasePicker = Ext.getCmp('navBar').add({
				xtype:'intelreleasepicker',
				labelWidth: 80,
				width: 240,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me._releasePickerSelected.bind(me) }
			});
		},
		
		/**************************************************** RENDERING CHARTS ******************************************/
		_buildCharts: function(){
			var me = this, 
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				calc = Ext.create('FastCumulativeFlowCalculator', {
					startDate: releaseStart,
					endDate: releaseEnd,
					scheduleStates: me.ScheduleStates
				});

			if(me.AllSnapshots.length === 0){
				me._alert('ERROR', me.TeamType + ' has no data for release: ' + me.ReleaseRecord.data.Name);
				return;
			}	

			/************************************** Aggregate panel STUFF *********************************************/
			var updateOptions = {trendType:'Last2Sprints'},
				aggregateChartData = me._updateCumulativeFlowChartData(calc.runCalculation(me.AllSnapshots), updateOptions),
				aggregateChartContainer = $('#aggregateChart-innerCt').highcharts(
					Ext.Object.merge({}, me._defaultCumulativeFlowChartConfig, me._getCumulativeFlowChartColors(), {
						chart: { height:400 },
						legend:{
							enabled:true,
							borderWidth:0,
							width:500,
							itemWidth:100
						},
						title: {
							text: me.TeamType
						},
						subtitle:{
							text: me.ReleaseRecord.data.Name.split(' ')[0]
						},
						xAxis:{
							categories: aggregateChartData.categories,
							tickInterval: me._getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.66)
						},
						series: aggregateChartData.series
					})
				)[0];
			me._setCumulativeFlowChartDatemap(aggregateChartContainer.childNodes[0].id, aggregateChartData.datemap);
			
			/************************************** Scrum CHARTS STUFF *********************************************/	
			var sortedProjectNames = _.sortBy(Object.keys(me.TeamStores), function(projName){ 
					return projName.split('-')[1].trim() + projName; 
				}),
				scrumChartConfiguredChartTicks = me._getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.32);
			_.each(sortedProjectNames, function(projectName){
				var updateOptions = {trendType:'Last2Sprints'},
					scrumChartData = me._updateCumulativeFlowChartData(calc.runCalculation(me.TeamStores[projectName]), updateOptions),		
					scrumCharts = $('#scrumCharts-innerCt'),
					scrumChartID = 'scrumChart-no-' + (scrumCharts.children().length + 1);
				scrumCharts.append('<div class="scrum-chart" id="' + scrumChartID + '"></div>');
				
				var chartContainersContainer = $('#' + scrumChartID).highcharts(
					Ext.Object.merge({}, me._defaultCumulativeFlowChartConfig, me._getCumulativeFlowChartColors(), {
						chart: { height:300 },
						legend: { enabled: false },
						title: { text: null },
						subtitle:{ text: projectName },
						xAxis: {
							categories: scrumChartData.categories,
							tickInterval: scrumChartConfiguredChartTicks
						},
						series: scrumChartData.series
					})
				)[0];
				me._setCumulativeFlowChartDatemap(chartContainersContainer.childNodes[0].id, scrumChartData.datemap);
			});
			me.doLayout();
		}
	});
}());