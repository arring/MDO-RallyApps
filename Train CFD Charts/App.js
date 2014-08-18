Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		this.add({xtype:'text', text:text});
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
					me._showError('failed to retreive project: ' + project.ObjectID);
					cb();
				}
			}
		});
	},

	_loadReleases: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Name',
					operator:'contains',
					value: me.TrainRecord.get('Name').split(' ART ')[0]
				},{
					property:'Project.ObjectID',
					value: me.TrainRecord.get('ObjectID')
				}
			],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						me.ReleaseStore = releaseStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	_loadReleasesWithName: function(cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Project', 'Name', 'ObjectID'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Name',
					value: me.ReleaseRecord.get('Name')
				},{
					property:'Project.Name',
					operator:'contains',
					value:me.TrainRecord.get('Name').split(' ART ')[0]
				}
			],
			listeners: {
				load: {
					fn: function(store, records){
						console.log('Releases loaded:', records);
						me.ReleasesWithName = records;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	_loadSnapshotStore: function(cb){
		var me = this;
		
		me.AllSnapshots = [];
		me.TeamStores = {};
		
		var finished = -1;
		var done = function(){ 
			if(++finished == me.ReleasesWithName.length){ 
				console.log('all snapshots done', me.AllSnapshots, me.TeamStores);
				cb();
			}
		};
		done();
		
		me.ReleasesWithName.forEach(function(releaseRecord){
			Ext.create('Rally.data.lookback.SnapshotStore', {
				autoLoad:true,
				limit: Infinity,
				compress:true,
				context:{ 
					workspace: me.getContext().getWorkspace()._ref,
					project: releaseRecord.get('Project')._ref
				},
				find: { 
					_TypeHierarchy: {'$in': ['HierarchicalRequirement', 'Defect']},
					Release: releaseRecord.get('ObjectID')
				},
				fetch:['ScheduleState', 'PlanEstimate'],
				hydrate:['ScheduleState', 'PlanEstimate'],
				listeners: {
					load: function(store, records){
						if(records.length > 0){
							records = _.map(records, function(ss){ return ss.raw; } );
							me.TeamStores[releaseRecord.get('Project').Name] = records;
							me.AllSnapshots = me.AllSnapshots.concat(records);
						}
						done();
					}
				}
			});
		});
	},
	
	/*************************************************** RANDOM HELPERS ******************************************************/	
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		var me = this;
		if(!projectRecord) cb();
		var split = projectRecord.data.Name.split(' ART ');
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
	
	_getCurrentOrFirstRelease: function(){
		var me = this;
		var d = new Date();
		var rs = me.ReleaseStore.getRecords();
		if(!rs.length) return;
		for(var i=0; i<rs.length; ++i){
			if(new Date(rs[i].data.ReleaseDate) >= d && new Date(rs[i].data.ReleaseStartDate) <= d) 
				return rs[i];
		}
		return rs[0]; //pick a random one then 
	},
	
	/******************************************************* DEFINE THE CFD CALCULATOR ********************************************************/
	_defineClasses: function(){
		Ext.define('Intel.TrainCFDCalculator', {
			extend: 'Rally.data.lookback.calculator.TimeSeriesCalculator',
			config: {
				stateFieldValues: ['Undefined', 'Defined', 'In-Progress', 'Completed', 'Accepted']
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
		
	/************************************************** DATE FUNCTIONS ***************************************************/

	_getWorkweek: function(date){ //calculates intel workweek, returns integer
		var me = this, oneDay = 1000 * 60 * 60 * 24,
			yearStart = new Date(date.getFullYear(), 0, 1),
			dayIndex = yearStart.getDay(),
			ww01Start = yearStart - dayIndex*oneDay,
			timeDiff = date - ww01Start,
			dayDiff = timeDiff / oneDay,
			ww = Math.floor(dayDiff/7) + 1,
			leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay(),
			weekCount = ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52; //weeks in this year
		return weekCount < ww ? 1 : ww;
	},
	
	_getWeekCount: function(date){ //returns the number of intel workweeks in the year the date is in
		var leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay();
		return ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52;
	},
	
	_getWorkweeks: function(){ //gets list of workweeks in the release
		var me = this, i,
			start = me.ReleaseRecord.get('ReleaseStartDate'),
			end = me.ReleaseRecord.get('ReleaseDate'),
			sd_week = me._getWorkweek(start),
			ed_week = me._getWorkweek(end),
			week_count = me._getWeekCount(start);

		var weeks = [];
		if(ed_week < sd_week){
			for(i=sd_week; i<=week_count; ++i) weeks.push({'Week': 'ww' + i});
			for(i = 1; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
		}
		else for(i = sd_week; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
		return weeks;
	},	
	
	/******************************************************* LAUNCH ********************************************************/
    launch: function(){
		var me = this;
		me._defineClasses();
		me._showError('Loading Data...');
		me._loadModels(function(){
			var scopeProject = me.getContext().getProject();
			me._loadProject(scopeProject, function(scopeProjectRecord){
				me._projectInWhichTrain(scopeProjectRecord, function(trainRecord){
					if(trainRecord){
						me.TrainRecord = trainRecord; 
						console.log('train loaded:', trainRecord);					
						me._loadReleases(function(){
							var currentRelease = me._getCurrentOrFirstRelease();
							if(currentRelease){
								me.ReleaseRecord = currentRelease;
								console.log('release loaded', currentRelease);
								me._loadReleasesWithName(function(){
									me._loadSnapshotStore(function(){
										me._renderStuff(); 
									});
								});
							} else {
								me.removeAll();
								me._showError('This ART has no valid releases');
							}
						});
					} else {
						me.removeAll();
						me._showError('Project "' + scopeProject.Name + '" not a train or sub-project of train');
					}
				});
			});
		});
    },
	
	
	/******************************************************* RENDERING CHARTS ********************************************************/
	
	_fixData: function(chartData){
		var me = this;
		var currentDate = new Date();
		chartData.categories.forEach(function(e, i, a){
			if(currentDate < new Date(e)){
				chartData.series.forEach(function(e){
					for(var j=i;j<e.data.length;++j) 
						e.data[j] = 0;				
				});
			}
			a[i] = 'WW' + me._getWorkweek(new Date(e));
		});
		return chartData;
	},
	
    _renderStuff: function(){
		var me = this;
		
		if(me.AllSnapshots.length === 0){
			me.removeAll();
			me._showError(me.TrainRecord.get('Name') + ' has no data for release: ' + me.ReleaseRecord.get('Name'));
			return;
		}
		
		if (Rally && Rally.sdk && Rally.sdk.dependencies && Rally.sdk.dependencies.Analytics) {
			Rally.sdk.dependencies.Analytics.load(function(){			
				me.removeAll();
				/************************************** Release picker STUFF *********************************************/			
				me.ReleasePicker = me.add({
					xtype:'combobox',
					margin:'0 0 10 0',
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
							me.ReleaseRecord = me.ReleaseStore.findRecord('Name', records[0].get('Name'));						
							setTimeout(function(){
								me._loadReleasesWithName(function(){
									me._loadSnapshotStore(function(){
										me.removeAll();
										me._renderStuff(); 
									});
								});
							}, 0);
						}, 
						focus: function(combo){ combo.expand(); }
					}
				});
				
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
			
				var calc = Ext.create('Intel.TrainCFDCalculator', {
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
					chartData: me._fixData(calc.runCalculation(me.AllSnapshots)),
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
							text: me.TrainRecord.get('Name')
						},
						subtitle:{
							text: me.ReleaseRecord.get('Name')
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
						chartData: me._fixData(calc.runCalculation(me.TeamStores[projectName])),
						columnWidth:0.33,
						loadMask:false,
						height:400,
						padding:"50px 0 0 0",
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
								text: projectName
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
						}
					});
				}
			});
		}
		else{
			me.removeAll();
			me._showError('Cannot load Rally Analytics');
		}
	}
});
