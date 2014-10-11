/************************** PRODUCTION *****************************/
console = { log: function(){} };	////DEBUG!!!	
preferenceName = 'intel-ART-CFD';

/****************************************************************/

Ext.define('TrainCfdCharts', {
	extend: 'Rally.app.App',
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
				return "<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ")<br />" + this.series.name + ": " + this.y;
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
			ticks = Math.floor(width / pixelTickWidth);
		var days = Math.floor((endDate*1 - startDate*1) / (86400000*5/7)); //only workdays
		var interval = Math.floor(Math.floor(days / ticks) / 5) * 5;
		if(interval < 5) return 5; //make it weekly at the minimum
		else return interval;
	},
	
	/****************************************************** DATA STORE METHODS ********************************************************/

	_loadModels: function(cb){
		Rally.data.ModelFactory.getModel({ //load project
			type:'Project',
			scope:this,
			success: function(model){ 
				this.Project = model; 
				cb(); 
			}
		});
	},
	
	_loadProject: function(project, cb){ //callback(project) project IS NOT a projectRecord
		var me = this;
		me.Project.load(project.ObjectID, {
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: function(record, operation){
				if(operation.wasSuccessful()) cb(record);
				else {
					me._alert('ERROR', 'failed to retreive project: ' + project.ObjectID);
					cb();
				}
			}
		});
	},

	_loadSnapshotStores: function(){
		var me = this, 
			promises = [];		
		me.AllSnapshots = [];
		me.TeamStores = {};
		me.ReleasesWithName.forEach(function(releaseRecord){
			var deferred = Q.defer();
			promises.push(deferred.promise);
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
					Release: releaseRecord.get('ObjectID')
				},
				fetch:['ScheduleState', 'PlanEstimate'],
				hydrate:['ScheduleState', 'PlanEstimate'],
				listeners: {
					load: function(store, records){
						if(records.length > 0){
							me.TeamStores[releaseRecord.data.Project.Name] = records;
							me.AllSnapshots = me.AllSnapshots.concat(records);
						}
						deferred.resolve();
					},
					single:true
				}
			});
		});
		return Q.all(promises).then(function(){ 
			console.log('all snapshots done', me.AllSnapshots, me.TeamStores);
		});
	},
			
	_loadAllChildReleases: function(){ 
		var me = this,
			releaseName = me.ReleaseRecord.data.Name,
			trainName = me.TrainRecord.data.Name.split(' ART')[0];			
		return me._loadReleasesWithName(releaseName, trainName)
			.then(function(releaseStore){
				me.ReleasesWithName = releaseStore.getRange();
			});
	},
	
	/************************************************** Preferences FUNCTIONS ***************************************************/
	
	_loadPreferences: function(cb){ //parse all settings too
		var me = this,uid = me.getContext().getUser().ObjectID;
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
      filterByName:preferenceName+ uid,
			success: function(prefs) {
				prefs = prefs[preferenceName + uid];
				try{ prefs = JSON.parse(prefs); }
				catch(e){ prefs = {projs: {}}; }
				me.AppPrefs = prefs;
				console.log('loaded prefs', prefs);
        cb();
			}
		});
	},

	_savePreferences: function(prefs, cb){ // stringify and save only the updated settings
		var me = this, s = {}, uid = me.getContext().getUser().ObjectID;
		prefs = {projs: prefs.projs};
    s[preferenceName + uid] = JSON.stringify(prefs);
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: me.getAppId(),
			settings: s,
			success: cb,
			scope:me
		});
	},
	
	/*************************************************** RANDOM HELPERS ******************************************************/	
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		var me = this;
		if(!projectRecord) cb();
		var split = projectRecord.data.Name.split(' ART');
		if(split.length>1) cb(projectRecord);
		else { 
			var parent = projectRecord.data.Parent;
			if(!parent) cb();
			else {
				me._loadProject(parent, function(parentRecord){
					me._projectInWhichTrain(parentRecord, cb);
				});
			}
		}
	},

	/******************************************************* LAUNCH ********************************************************/
		
	_resizeWhenRendered: function(){
		var me = this;
		setTimeout(function(){ 
			me._fireParentWindowEvent('resize');
		}, 0);
	},
	
	_reloadEverything:function(){
		var me=this;
		me.setLoading(true);		
		me._loadAllChildReleases().then(function(){
			me._loadSnapshotStores().then(function(){
				me.removeAll();
				me.setLoading(false);
				me._renderReleasePicker();
				me._renderCharts(); 
			});
		});
	},
	
	_loadReleases: function(){
		var me=this;
		me._loadReleasesInTheFuture(me.TrainRecord).then(function(releaseStore){
			me.ReleaseStore = releaseStore;
			var currentRelease = me._getScopedRelease(me.ReleaseStore.getRange(), me.TrainRecord.data.ObjectID, me.AppPrefs);
			if(currentRelease){
				me.ReleaseRecord = currentRelease;
				console.log('release loaded', currentRelease);
				me._reloadEverything();
			} else {
				me.setLoading(false);
				me._alert('ERROR', 'This ART has no valid releases');
			}
		});
	},

	launch: function(){
		var me = this;
		me._initPrettyAlert();
		me._initIframeResize();	
		me.setLoading(true);
		if (Rally && Rally.sdk && Rally.sdk.dependencies && Rally.sdk.dependencies.Analytics) {
			Rally.sdk.dependencies.Analytics.load(function(){	
				me._loadPreferences(function(){
					me._loadModels(function(){
						var scopeProject = me.getContext().getProject();
						me._loadProject(scopeProject, function(scopeProjectRecord){
							me._projectInWhichTrain(scopeProjectRecord, function(trainRecord){
								if(trainRecord){
									me.TrainRecord = trainRecord; 
									console.log('train loaded:', trainRecord);
									me._loadReleases();
								} else {
									me.removeAll();
									me._alert('ERROR', 'Project "' + scopeProject.Name + '" not a train or sub-project of train');
								}
							});
						});
					});
				});
			});
		}
	},
	
	
	/******************************************************* RENDERING CHARTS ********************************************************/

	_renderReleasePicker: function(){
		var me=this;
		me.ReleasePicker = me.add({
			xtype:'combobox',
			padding:'0 0 10px 0',
			store: Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: _.map(me.ReleaseStore.getRecords(), function(r){ return {Name: r.get('Name') }; })
			}),
			displayField: 'Name',
			fieldLabel: 'Release:',
			editable:false,
			value:me.ReleaseRecord.get('Name'),
			listeners: {
				select: function(combo, records){
					if(me.ReleaseRecord.get('Name') === records[0].get('Name')) return;
					me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].get('Name'));
					var pid = me.TrainRecord.data.ObjectID;
					if(!me.AppPrefs.projs[pid]) me.AppPrefs.projs[pid] = {};
					me.AppPrefs.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
					me._savePreferences(me.AppPrefs, function(){ me._reloadEverything(); });					
				}, 
				focus: function(combo){ combo.expand(); }
			}
		});
	},
	
  _renderCharts: function(){
		var me = this;
		
		if(me.AllSnapshots.length === 0){
			me._alert('ERROR', me.TrainRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name);
			return;
		}
		
		/************************************** CHART STUFF *********************************************/
		me.panel = me.add({
			xtype: 'container',
			layout: 'column',
			width:'100%'
		});	
		me.trainPanel = me.panel.add({	
			xtype: 'container',
			layout: 'column',
			columnWidth:1
		});
	
		var calc = Ext.create('FastCfdCalculator', {
			startDate: me.ReleaseRecord.get('ReleaseStartDate'),
			endDate: me.ReleaseRecord.get('ReleaseDate')
		});
		
		me.trainPanel.add({
			xtype:'panel',
			html:'',
			columnWidth:0.16
		});
		me.trainPanel.add({
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
					text: me.TrainRecord.get('Name')
				},
				subtitle:{
					text: me.ReleaseRecord.get('Name')
				},
				xAxis:{
					tickInterval: me._getConfiguredChartTicks(
						me.ReleaseRecord.get('ReleaseStartDate'), me.ReleaseRecord.get('ReleaseDate'), me.getWidth()*0.66)
				}
			}, me._defaultChartConfig),
			listeners:{
				afterrender: me._resizeWhenRendered.bind(me)
			}
		});
		me.trainPanel.add({
			xtype:'panel',
			html:'',
			columnWidth:0.16
		});	
		
		/************************************** Scrum CHARTS STUFF *********************************************/	
		for(var projectName in me.TeamStores){
			me.panel.add({
				xtype:'rallychart',
				columnWidth:0.32,
				loadMask:false,
				height:360,
				padding:"20px 0 0 0",
				chartColors:me._chartColors,
				chartData: me._updateChartData(calc.runCalculation(me.TeamStores[projectName]), {noDatemap:true}),
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
							me.ReleaseRecord.get('ReleaseStartDate'), me.ReleaseRecord.get('ReleaseDate'), me.getWidth()*0.32)
					}
				}, me._defaultChartConfig),
				listeners:{
					afterrender: me._resizeWhenRendered.bind(me)
				}
			});
		}
	}
});
