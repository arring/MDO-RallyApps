Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		this.add({xtype:'text', text:text});
	},
	
	/****************************************************** DATA STORE METHODS ********************************************************/

	_loadProjectModel: function(cb){
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
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name', '_ref'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: function(record, operation){
				if(operation.wasSuccessful()) cb(record);
				else {
					me._showError('failed to retreive project: ' + project.ObjectID);
					cb();
				}
			}
		});
	},

	_loadReleaseStore: function(releaseName, trainName, cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store', {
			model:'Release',
			autoLoad:true,		
			fetch: ['ObjectID', 'Project', 'Name', '_ref'],
			filters: [
				{
					property: 'Name',
					value: releaseName
				}
			],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			limit:Infinity,
			listeners:{
				load: function(store, records){
					me.Releases = [];
					records.forEach(function(record){
						var name = record.get('Project').Name;
						if(name && name.indexOf(trainName) != -1)
							me.Releases.push(record);
					});
					console.log('Releases loaded: ', me.Releases);
					cb();
				}
			}
		});
	},
	
	/******************************************************* OTHER HELPERS ********************************************************/
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		var me = this;
		if(!projectRecord) cb();
		var split = projectRecord.get('Name').split(' ART ');
		if(split.length>1) cb(projectRecord);
		else { 
			var parent = projectRecord.get('Parent');
			if(!parent) cb();
			else {
				me._loadProject(parent, function(parentRecord){
					me._projectInWhichTrain(parentRecord, cb);
				});
			}
		}
	},
	
	_getScrumRecords: function(projectRecord, cb){	//gets all the scrums (scrums don't have children projects).callback(err, scrumRecords)
		var me = this;
		var projects = [];
		var finished = 0;
		var trainName = me.trainRecord.get('Name').split(' ART ')[0];
		me.Releases.forEach(function(releaseRecord){
			me._loadProject(releaseRecord.get('Project'), function(projectRecord){
				if(projectRecord && projectRecord.get('Name').indexOf(trainName) != -1)
					projects.push(projectRecord);
				if(++finished == me.Releases.length) 
					cb(projects);
			});
		});
	},
	
	/******************************************************* DEFINE THE CFD CALCULATOR ********************************************************/
	_defineClasses: function(){
		Ext.define('Intel.trainRelease.CFDCalculator', {
			extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
			config: {
				stateFieldValues: ['Undefined', 'Defined', 'In-Progress', 'Completed', 'Accepted']
			},

			constructor: function(config) {
				this.initConfig(config);
				this.callParent(arguments);
			},

			getMetrics: function() {
				return _.map(this.getStateFieldValues(), function(stateFieldValue) {
					return  {
						as: stateFieldValue,
						allowedValues: [stateFieldValue],
						groupByField: 'ScheduleState',
						f: 'groupBySum',
						field: 'PlanEstimate',
						display: 'area'
					};
				}, this);
			}
		});
	},
	/******************************************************* LAUNCH ********************************************************/
	
	_timeboxScopeValid: function(timeboxScope){
		var me = this;
		me._loadProjectModel(function(){
			var scopeProject = me.getContext().getProject();
			me._loadProject(scopeProject, function(scopeProjectRecord){
				if(scopeProjectRecord){
					me._projectInWhichTrain(scopeProjectRecord, function(trainRecord){
						if(trainRecord){
							me.trainRecord = trainRecord; 
							console.log('train loaded:', trainRecord);						
							me.releaseRecord = timeboxScope.record;
							console.log('Release name: ', me.releaseRecord.get('Name'));
							me._loadReleaseStore(me.releaseRecord.get('Name'), me.trainRecord.get('Name').split(' ART ')[0], function(){
								me._renderCharts();
							});
						} else  me._showError('Project "' + scopeProject.Name + '" not a train or sub-project of train');
					});
				} else me._showError('could not load project: ' + scopeProject.Name);
			});
		});
	},
	
    launch: function(){
		var me = this;
		me._defineClasses();
		var timeboxScope = me.getContext().getTimeboxScope();
		if(timeboxScope && timeboxScope.type == 'release') me._timeboxScopeValid(timeboxScope);
		else me._showError('please scope page to a release timebox');
    },
	
	/******************************************************* EVENT HANDLERS ********************************************************/
	
	onTimeboxScopeChange: function(timeboxScope){
		this._timeboxScopeValid(timeboxScope);
	},
	
	/******************************************************* RENDERING CHARTS ********************************************************/
	
    _renderCharts: function(){
		var me = this;
		var trainRecord = me.trainRecord;
		var releaseRecord = this.releaseRecord;
		var startDate = new Date(releaseRecord.get('ReleaseStartDate'));
		var endDate = new Date(releaseRecord.get('ReleaseDate'));
		console.log(startDate, endDate);
		me._getScrumRecords(trainRecord, function(scrumRecords){
			console.log('scrums loaded: ', scrumRecords);
			var scrumIDs = [];
			scrumRecords.forEach(function(scrumRecord){ scrumIDs.push(scrumRecord.get('ObjectID')); });
			var releaseIDs = [];
			me.Releases.forEach(function(releaseRecord){ releaseIDs.push(releaseRecord.get('ObjectID')); });
			
			if(me.panel) 
				me.remove(me.panel);
			if(me.trainPanel)
				me.remove(me.trainPanel);
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
			me._getTrainChart(scrumIDs, releaseIDs, startDate, endDate, me.trainPanel);	
			me.Releases.forEach(function(releaseRecord, index){
				scrumRecords.forEach(function(scrumRecord){
					if(scrumRecord.get('ObjectID') == releaseRecord.get('Project').ObjectID)
						me._getScrumChart(scrumRecord, releaseRecord.get('ObjectID'), startDate, endDate, me.panel);
				});
			});

		});
	},

	_filterDataByDate: function(data, startDate, endDate){	//this function does too many things
		
		function getWorkWeek(date){ //calculates intel workweek, returns integer
			var oneDay = 1000 * 60 * 60 * 24,
				yearStart = new Date(date.getFullYear(), 0, 0),
				dayIndex = yearStart.getDay(),
				ww01Start = yearStart - dayIndex*oneDay,
				timeDiff = date - ww01Start;
				dayDiff = timeDiff / oneDay;
			return Math.floor(dayDiff/7) + 1;
		}
		
		var currentDate = new Date();
		var c = data.categories;
		var s = data.series;
		var k;
		for(var index=c.length-1; index>=0; --index){
			var d = new Date(data.categories[index]);
			if(d<startDate || d>endDate){
				for(k=0;k<s.length;++k)
					s[k].data.splice(index,1);
				c.splice(index, 1);
			}
			if(d>currentDate){
				for(k=0; k<s.length; ++k)
					s[k].data[index] = 0;
			}
			c[index] = 'WW' + getWorkWeek(d);			
		}
		return data;
	},
	
	_getTrainChart: function(scrumIDs, releaseIDs, startDate, endDate, panel){
		var me = this;
		var releaseRecord = me.releaseRecord;
		Ext.create('Rally.ui.chart.Chart', {
			columnWidth:0.66,
			storeType: 'Rally.data.lookback.SnapshotStore',
			storeConfig: {
				find: { //use this or filter. find uses mongoDB syntax
					_TypeHierarchy: { '$in' : [ 'Defect', 'HierarchicalRequirement'] },
					_ProjectHierarchy: { '$in': scrumIDs},
					Release: { '$in': releaseIDs }
				},
				fetch: ['ScheduleState', 'PlanEstimate'],
				hydrate: ['ScheduleState', 'PlanEstimate'],
				context:{ workspace: me.getContext().getWorkspace()._ref },
				limit: Infinity
			},
			calculatorType: 'Intel.trainRelease.CFDCalculator',
			calculatorConfig: {
				startDate: startDate,
				endDate: endDate
			},
			chartColors:['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F'],
			chartConfig: {
				chart: {
					zoomType: 'xy',
					height:400,
					width:900
				},
				legend:{
					borderWidth:0
				},
				title: {
					text: 'Train: ' + me.trainRecord.get('Name')
				},
				subtitle:{
					text: 'Release: ' + releaseRecord.get('Name')
				},
				xAxis: {
                    tickmarkPlacement: 'on',
					tickInterval: 5,
					title: {
						text: 'WorkWeek'
					},
					labels: {
						rotation:-45
					}
				},
				yAxis: [
					{
						title: {
							text: 'Plan Estimate (Points)'
						}
					}
				],
				plotOptions: {
					series: {
						marker: {
							enabled: false
						}
					},
					area: {
						stacking: 'normal'
					}
				}
			},
			listeners:{
				readyToRender: function(item){ 
					var data = item.getChartData();
					item.setChartData(me._filterDataByDate(data, startDate, endDate));	
					var goodData = false;
					Outer:
					for(var i=0;i<data.series.length;++i){
						var values = data.series[i].data;
						for(var j=0;j<values.length;++j){
							if(values[j]===null)
								break Outer;
							if(values[j]!==0){
								goodData = true;
								break Outer;
							}
						}
					}
					if(goodData){
						console.log('train data successfully aggregated', item);
						panel.add({
							xtype:'panel',
							html:'',
							columnWidth:0.16
						});
						panel.add(item);
						panel.add({
							xtype:'panel',
							html:'',
							columnWidth:0.16
						});				
					} else {
						console.log('showing no data error', item);
						panel.add({
							xtype:'text',
							text:'Train ' + me.trainRecord.get('Name') + ' has nothing in release ' + releaseRecord.get('Name')
						});
					}
				}
			}
		});
	},
	
	_getScrumChart: function(scrumRecord, releaseID, startDate, endDate, panel){
		var me = this;
		var scrumID = scrumRecord.get('ObjectID');
		var scrumName = scrumRecord.get('Name');
		var releaseRecord = me.releaseRecord;
		Ext.create('Rally.ui.chart.Chart', {
			columnWidth:0.33,
			height:400,
			padding:"50px 0 0 0",
			storeType: 'Rally.data.lookback.SnapshotStore',
			storeConfig: {
				find: { //use this or filter. find uses mongoDB syntax
					_TypeHierarchy: { '$in' : [ 'Defect', 'HierarchicalRequirement'] },
					_ProjectHierarchy: scrumID,
					Release: releaseID
				},
				fetch: ['ScheduleState', 'PlanEstimate'],
				hydrate: ['ScheduleState', 'PlanEstimate'],
				context:{ workspace: me.getContext().getWorkspace()._ref },
				limit: Infinity
			},
			calculatorType: 'Intel.trainRelease.CFDCalculator',
			calculatorConfig: {
				startDate: startDate,
				endDate: endDate
			},
			chartColors:['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F'],
			chartConfig: {
				chart: {
					zoomType: 'xy',
					height:300
				},
				legend: {
					enabled: false
				},
				title: {
					text: null
				},
				subtitle:{
					text: 'Scrum: ' + scrumName
				},
				xAxis: {
                    tickmarkPlacement: 'on',
					tickInterval: 10,
					title: {
						text: 'WorkWeek'
					},
					labels: {
						rotation:-45
					}
				},
				yAxis: [
					{
						title: {
							text: 'Plan Estimate (Points)'
						}
					}
				],
				plotOptions: {
					series: {
						marker: {
							enabled: false
						}
					},
					area: {
						stacking: 'normal'
					}
				}
			},
			listeners:{
				readyToRender: function(item){ 
					var data = item.getChartData();
					item.setChartData(me._filterDataByDate(data, startDate, endDate));
					var goodData = false;
					for(var i=0;i<data.series.length;++i){
						var values = data.series[i].data;
						for(var j=0;j<values.length;++j){
							if(values[j]===null) return;
							if(values[j]!==0) goodData = true;
						}
					}
					if(goodData){
						console.log('passed scrum: ', item);
						panel.add(item);
					}
				}
			}
		});
	}
});
