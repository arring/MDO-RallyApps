(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/************************** PRODUCTION *****************************/
	console = { log: function(){} };	////DEBUG!!!	

	/****************************************************************/
	Ext.define('FunctionalCFDCharts', {
		extend: 'IntelRallyApp',
		requires:[
			'FastCfdCalculator'
		],
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ReleaseQuery',
			'ChartUpdater'
		],
		_prefName: 'intel-ART-CFD',	
		minWidth:910,
		
		/****************************************************** SOME CONFIG CONSTANTS *******************************************************/
		_chartColors: ['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F', '#000000','#26FF00'],	
		_defaultChartConfig: {
			chart: {
				defaultSeriesType: "area",
				zoomType: "xy"
			},
			xAxis: {
				tickmarkPlacement: "on",
				title: {
					text: "Days",
					margin: 10
				},
				labels: {
					y: 20
				}
			},
			yAxis: {
				title: {
					text: "Points"
				},
				labels: {
					x: -5,
					y: 4
				}
			},			
			tooltip: {
				formatter: function () {
					var sum = 0;
					for(var i=4; i>= this.series.index; --i) 
						sum += this.series.chart.series[i].data[this.point.x].y;
					return "<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ')' + 
						"<br /><b>" + this.series.name + "</b>: " + this.y +
						(this.series.index <=4 ? "<br /><b>Total</b>: " + sum : '');
				}
			},
			plotOptions: {
				series: {
					marker: {
						enabled: false,
						states: {
							hover: {
								enabled: true
							}
						}
					},
					groupPadding: 0.01
				},
				area: {
					stacking: 'normal',
					lineColor: '#666666',
					lineWidth: 2,
					marker: {
						enabled: false
					}
				}
			}
		},
		_getConfiguredChartTicks: function (startDate, endDate, width) {
			var pixelTickWidth = 40,
				ticks = Math.floor(width / pixelTickWidth),
				days = Math.floor((endDate*1 - startDate*1) / (86400000*5/7)), //only workdays
				interval = Math.floor(Math.floor(days / ticks) / 5) * 5;
			if(interval < 5) return 5; //make it weekly at the minimum
			else return interval;
		},
		
		/********************************************************** UTIL FUNC ******************************/
		_getTeamTypeAndNumber: function(scrumName){
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
				var deferred = Q.defer();
				Ext.create('Rally.data.lookback.SnapshotStore', {
					autoLoad:true,
					limit: Infinity,
					context:{ 
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					sort:{_ValidFrom:1},
					compress:true,
					find: { 
						_TypeHierarchy:-51038, 
						Children:null,
						PlanEstimate: {$gte:0},
						Release: {$in: _.map(releaseRecords, function(releaseRecord){ return releaseRecord.data.ObjectID; })}
					},
					fetch:['ScheduleState', 'PlanEstimate'],
					hydrate:['ScheduleState', 'PlanEstimate'],
					listeners: {
						load: function(store, records){
							if(records.length > 0){
								me.TeamStores[releaseRecords[0].data.Project.Name] = records;
								me.AllSnapshots = me.AllSnapshots.concat(records);
							}
							deferred.resolve();
						},
						single:true
					}
				});
				return deferred.promise;
			}));
		},
		_loadAllProjectReleases: function(){ 
			var me = this,
				releaseName = me.ReleaseRecord.data.Name.split(' ')[0]; //we must split this yo so we get Light/Rave on the same page!
			me.ReleasesWithName = [];
			return Q.all(_.map(me.ProjectsOfFunction, function(proj){		
				return me._loadReleasesByNameContainsForProject(releaseName, proj)
					.then(function(releases){ if(releases.length) me.ReleasesWithName.push(releases); });
			}));
		},
		
		/************************************************** Preferences FUNCTIONS ***************************************************/
		_loadPreferences: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				filterByUser: true,
				filterByName: me._prefName,
				success: function(prefs) {
					var appPrefs = prefs[me._prefName];
					try{ appPrefs = JSON.parse(appPrefs); }
					catch(e){ appPrefs = { projs:{}};}
					console.log('loaded prefs', appPrefs);
					deferred.resolve(appPrefs);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_savePreferences: function(prefs){ 
			var me=this, s = {}, deferred = Q.defer();
			prefs = {projs: prefs.projs};
			s[me._prefName] = JSON.stringify(prefs);
			console.log('saving prefs', prefs);
			Rally.data.PreferenceManager.update({
				filterByUser: true,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		},

		/******************************************************* Reloading ********************************************************/			
		_resizeWhenRendered: function(){
			var me = this;
			setTimeout(function(){ me._fireParentWindowEvent('resize'); }, 0);
		},	
		_reloadEverything:function(){
			var me=this;
			me.setLoading(true);		
			return me._loadAllProjectReleases()
				.then(function(){ return me._loadSnapshotStores(); })
				.then(function(){
					me.removeAll();
					me.setLoading(false);
					me._loadReleasePicker();
					me._renderCharts(); 
				});
		},

		/******************************************************* LAUNCH ********************************************************/		
		launch: function(){
			var me = this;
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me.setLoading(true);
			if (Rally && Rally.sdk && Rally.sdk.dependencies && Rally.sdk.dependencies.Analytics) {
				Rally.sdk.dependencies.Analytics.load(function(){	
					me._loadModels()
						.then(function(){
							var scopeProject = me.getContext().getProject();
							return me._loadProject(scopeProject.ObjectID);
						})
						.then(function(scopeProjectRecord){
							me.ProjectRecord = scopeProjectRecord;
							return me._loadRootProject(me.ProjectRecord);
						})
						.then(function(rootProject){
							me.RootProject = rootProject;
							return me._loadAllLeafProjects(rootProject);
						})
						.then(function(leafProjects){
							me.LeafProjects = leafProjects;
							if(!me.LeafProjects[me.ProjectRecord.data.ObjectID]) 
								return Q.reject('You are not Scoped to a valid Scrum in a Train');
							me.TeamType = me._getTeamTypeAndNumber(me.ProjectRecord.data.Name).TeamType;
							me.ProjectsOfFunction = _.filter(me.LeafProjects, function(proj){
								return me._getTeamTypeAndNumber(proj.data.Name).TeamType == me.TeamType; 
							});
							return me._loadPreferences();
						})
						.then(function(appPrefs){
							me.AppPrefs = appPrefs;
							var twelveWeeks = 1000*60*60*24*12;
							return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
						})
						.then(function(releaseStore){
							me.ReleaseStore = releaseStore;
							var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppPrefs);
							if(currentRelease){
								me.ReleaseRecord = currentRelease;
								console.log('release loaded', currentRelease);
								return me._reloadEverything();
							}
							else return Q.reject('This project has no releases.');
						})
						.fail(function(reason){
							me.setLoading(false);
							me._alert('ERROR', reason || '');
						})
						.done();
				});
			}
		},
		
		/******************************************************* RENDERING CHARTS ********************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);		
			me._workweekData = me._getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);	
			var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppPrefs.projs[pid] !== 'object') me.AppPrefs.projs[pid] = {};
			me.AppPrefs.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._savePreferences(me.AppPrefs)
				.then(function(){ 
					return me._reloadEverything(); 
				})
				.fail(function(reason){
					me._alert('ERROR', reason || '');
					me.setLoading(false);
				})
				.done();
		},		
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.add({
				xtype:'intelreleasepicker',
				labelWidth: 80,
				width: 240,
				releases: me.ReleaseStore.data.items,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},
		_renderCharts: function(){
			var me = this;

			if(me.AllSnapshots.length === 0){
				me._alert('ERROR', me.TeamType + ' has no data for release: ' + me.ReleaseRecord.data.Name);
				return;
			}
		
			/************************************** CHART STUFF *********************************************/
			me.panel = me.add({
				xtype: 'container',
				layout: 'column',
				width:'100%'
			});	
			me.aggregatePanel = me.panel.add({	
				xtype: 'container',
				layout: 'column',
				columnWidth:1
			});

			var calc = Ext.create('FastCfdCalculator', {
				startDate: me.ReleaseRecord.data.ReleaseStartDate,
				endDate: me.ReleaseRecord.data.ReleaseDate
			});
		
			me.aggregatePanel.add({
				xtype:'panel',
				html:'',
				columnWidth:0.16
			});
			me.aggregatePanel.add({
				xtype:'rallychart',
				columnWidth:0.66,
				loadMask:false,
				chartColors:me._chartColors,
				chartData: me._updateChartData(calc.runCalculation(me.AllSnapshots)),
				chartConfig: Ext.Object.merge({
					chart: {
						height:400
					},
					legend:{
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
						tickInterval: me._getConfiguredChartTicks(
							me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.66)
					}
				}, me._defaultChartConfig),
				listeners:{
					afterrender: me._resizeWhenRendered.bind(me)
				}
			});
			me.aggregatePanel.add({
				xtype:'panel',
				html:'',
				columnWidth:0.16
			});	
			
			/************************************** Scrum CHARTS STUFF *********************************************/	
			var sortedProjectNames = _.sortBy(Object.keys(me.TeamStores), function(projName){ 
				return projName.split('-')[1].trim() + projName; 
			});
			_.each(sortedProjectNames, function(projectName){
				me.panel.add({
					xtype:'rallychart',
					columnWidth:0.32,
					loadMask:false,
					height:360,
					padding:"20px 0 0 0",
					chartColors:me._chartColors,
					chartData: me._updateChartData(calc.runCalculation(me.TeamStores[projectName])),
					chartConfig: Ext.Object.merge({
						chart: {
							height:300
						},
						legend: {
							enabled: false
						},
						title: {
							text: null
						},
						subtitle:{
							text: projectName
						},
						xAxis: {
							tickInterval: me._getConfiguredChartTicks(
								me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.32)
						}
					}, me._defaultChartConfig),
					listeners:{
						afterrender: me._resizeWhenRendered.bind(me)
					}
				});
			});
		}
	});
}());