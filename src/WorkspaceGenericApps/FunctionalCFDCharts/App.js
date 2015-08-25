/** this app shows Cumulative flows for teams of a specific type, and their aggregate output.
	this is scoped to a release. This app assumes you follow scrum naming conventions across your trains
	example: show all 'Array' teams' across all trains for release Q414
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.FunctionalCFDCharts', {
		extend: 'Intel.lib.IntelRallyApp',
		cls:'app',
		requires:[
			'Intel.lib.chart.FastCumulativeFlowCalculator'
		],
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.CumulativeFlowChartMixin',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.HorizontalTeamTypes'
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

		userAppsPref: 'intel-Func-CFD',

		/****************************************************** DATA STORE METHODS ********************************************************/
		loadSnapshotStores: function(){
			var me = this;	
			me.TeamStores = {};
			me.AllSnapshots = [];
			return Q.all(_.map(me.ReleasesWithName, function(releaseRecords){
				return Q.all(_.map(releaseRecords, function(releaseRecord){
					var parallelLoaderConfig = {
						context:{ 
							workspace: me.getContext().getWorkspace()._ref,
							project: null
						},
						compress:true,
						findConfig: { 
							_TypeHierarchy: 'HierarchicalRequirement',
							Children:null,
							Release: releaseRecord.data.ObjectID
						},
						fetch:['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID'],
						hydrate:['ScheduleState']
					};
					return me.parallelLoadLookbackStore(parallelLoaderConfig)
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
		loadAllProjectReleases: function(){ 
			var me = this,
				releaseName = me.ReleaseRecord.data.Name.split(' ')[0]; //we must split this so we get Light/Rave on the same page!
			me.ReleasesWithName = []; //NOTE: this is a list of lists
			return Q.all(_.map(me.ProjectsOfFunction, function(projectRecord){		
				return me.loadReleasesByNameContainsForProject(releaseName, projectRecord)
					.then(function(releases){ if(releases.length) me.ReleasesWithName.push(releases); });
			}));
		},

		/******************************************************* Reloading ********************************************************/			
		hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		reloadEverything:function(){
			var me=this;
			me.setLoading('Loading Data');		
			return me.loadAllProjectReleases()
				.then(function(){ return me.loadSnapshotStores(); })
				.then(function(){
					$('#scrumCharts-innerCt').empty();
					me.setLoading('Loading Charts');	
					if(!me.ReleasePicker) me.renderReleasePicker();
					me.renderCharts();
					me.hideHighchartsLinks();
					me.setLoading(false);
				});
		},

		/******************************************************* LAUNCH ********************************************************/		
		launch: function(){
			var me = this;
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.setLoading('Loading Configuration');
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //parallel loads
						me.loadAllLeafProjects() /******** load stream 1 *****/
							.then(function(leafProjects){
								me.LeafProjects = leafProjects;
								if(!me.LeafProjects[me.ProjectRecord.data.ObjectID]) 
									return Q.reject('You are not Scoped to a valid Project');
								me.TeamType = me.getAllHorizontalTeamTypeInfos([me.ProjectRecord])[0].teamType;
								me.ProjectsOfFunction = _.filter(me.LeafProjects, function(projectRecord){
									return me.getAllHorizontalTeamTypeInfos([projectRecord])[0].teamType === me.TeamType; 
								});
							}),
						me.loadAppsPreference()	/******** load stream 2 *****/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){	return me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		
		/**************************************************** RENDERING Navbar ******************************************/
		releasePickerSelected: function(combo, records){
			var me=this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},		
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = Ext.getCmp('navBar').add({
				xtype:'intelreleasepicker',
				labelWidth: 80,
				width: 240,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},
		
		/**************************************************** RENDERING CHARTS ******************************************/
		renderCharts: function(){
			var me = this, 
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
					startDate: releaseStart,
					endDate: releaseEnd,
					scheduleStates: me.ScheduleStates
				});

			if(me.AllSnapshots.length === 0){
				me.alert('ERROR', me.TeamType + ' has no data for release: ' + me.ReleaseRecord.data.Name);
				return;
			}	

			/************************************** Aggregate panel STUFF *********************************************/
			var updateOptions = {trendType:'Last2Sprints'},
				aggregateChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.AllSnapshots), updateOptions),
				aggregateChartContainer = $('#aggregateChart-innerCt').highcharts(
					Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
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
							tickInterval: me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.66)
						},
						series: aggregateChartData.series
					})
				)[0];
			me.setCumulativeFlowChartDatemap(aggregateChartContainer.childNodes[0].id, aggregateChartData.datemap);
			
			/************************************** Scrum CHARTS STUFF *********************************************/	
			var sortedProjectNames = _.sortBy(Object.keys(me.TeamStores), function(projName){ 
					return (projName.split('-')[1] || '').trim() + projName; 
				}),
				scrumChartConfiguredChartTicks = me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.32);
			_.each(sortedProjectNames, function(projectName){
				var updateOptions = {trendType:'Last2Sprints'},
					scrumChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.TeamStores[projectName]), updateOptions),		
					scrumCharts = $('#scrumCharts-innerCt'),
					scrumChartID = 'scrumChart-no-' + (scrumCharts.children().length + 1);
				scrumCharts.append('<div class="scrum-chart" id="' + scrumChartID + '"></div>');
				
				var chartContainersContainer = $('#' + scrumChartID).highcharts(
					Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
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
				me.setCumulativeFlowChartDatemap(chartContainersContainer.childNodes[0].id, scrumChartData.datemap);
			});
			me.doLayout();
		}
	});
}());