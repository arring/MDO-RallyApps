Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		this.add({xtype:'text', text:text});
	},
	
	/****************************************************** SOME CONFIG CONSTANTS *******************************************************/
	
	_defaultChartConfig: {
		chart: {
			defaultSeriesType: "area",
			zoomType: "xy"
		},
		colors:['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F', '#000000','#26FF00'],
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
		var pixelTickWidth = 40;
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
				context:{ 
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				sort:{_ValidFrom:1},
				compress:false,
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
		Ext.define("lameCalculator", {
			scheduleStates: ['Undefined', 'Defined', 'In-Progress', 'Completed', 'Accepted'],
			
			constructor: function(config) { //you MUST give this calculator startDate, and endDate. That is all
				for(var k in config) this[k] = config[k];
				return this;
			},
			
			_getDates:function(){
				var dates = [], curDay = this.startDate, day=1000*60*60*24;
				while(curDay<=this.endDate){
					var n = curDay.getDay(); 
					if(n!==0 && n!==6) dates.push(curDay); //dont get weekends
					curDay = new Date(curDay*1 + day);
				}
				return dates;
			},
			
			_dateToStringDisplay: function (date) {
				return Ext.Date.format(date, 'm/d/Y');
			},
			
			_getIndexHelper:function(d,ds){ //binsearches for the closest date to d
				var curVal = (ds.length/2), curInt = (curVal>>0), div=(curVal/2), lastInt=-1;
				while(curInt !== lastInt){
					if(ds[curInt]===d) return curInt;
					else if(ds[curInt]>d) curVal-=div;
					else curVal+=div;
					div/=2;
					lastInt = curInt;
					curInt = curVal>>0;
				}
				return curInt;
			},
			
			_getIndexOnOrBefore: function(d, ds){
				if(ds.length===0) return -1;
				var pos = this._getIndexHelper(d,ds);
				if(pos===0) { if(ds[pos] <= d) return pos; else return -1; } //either start of list or everything is after d
				else if(ds[pos] <= d) return pos;
				else return pos-1;
			},
			
			_getIndexOnOrAfter: function(d, ds){
				if(ds.length===0) return -1;
				var pos = this._getIndexHelper(d,ds);
				if(pos===ds.length-1) { if(ds[pos] >= d) return pos; else return -1; } //either start of list or everything is after d
				else if(ds[pos] >= d) return pos;
				else return pos+1;
			},
			
			runCalculation:function(items){
				if(!this.scheduleStates || !this.startDate || !this.endDate) {
					console.log('invalid constructor config', this); return; }
				var dates = this._getDates();
				var totals = _.reduce(this.scheduleStates, function(map, ss){ 
					map[ss] = _.map(new Array(dates.length), function(){ return 0;}); 
					return map; 
				}, {});
				_.each(items, function(item){
					item = item.raw; //dont work with records;
					var iStart = new Date(item._ValidFrom),
						iEnd = new Date(item._ValidTo), 
						state = item.ScheduleState, 
						pe = item.PlanEstimate;
					if(!pe) return; //no need to continue with this one
					var startIndex = this._getIndexOnOrAfter(iStart, dates), 
						endIndex = this._getIndexOnOrBefore(iEnd, dates);
					if(startIndex===-1 || endIndex===-1) return; //no need to continue here
					for(var i=startIndex;i<=endIndex;++i)
						totals[state][i]+=pe;
				}, this);
				return {
					categories:_.map(dates, function(d){ return this._dateToStringDisplay(d); }, this), 
					series: _.reduce(this.scheduleStates, function(ar, ss){
						return ar.concat([{name:ss, type:'area', dashStyle:'Solid', data:totals[ss]}]);
					}, [])
				};
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
		return weekCount < ww ? (ww - weekCount) : ww;
	},	
	
	/******************************************************* LAUNCH ********************************************************/
    launch: function(){
		var me = this;
		me._defineClasses();
		me._showError('Loading Data...');
		if (Rally && Rally.sdk && Rally.sdk.dependencies && Rally.sdk.dependencies.Analytics) {
			Rally.sdk.dependencies.Analytics.load(function(){	
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
			});
		}
    },
	
	
	/******************************************************* RENDERING CHARTS ********************************************************/

    _renderStuff: function(){
		var me = this;
		me.removeAll();
		
		if(me.AllSnapshots.length === 0){
			me._showError(me.TrainRecord.get('Name') + ' has no data for release: ' + me.ReleaseRecord.get('Name'));
			return;
		}
				
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
	
		var calc = Ext.create('lameCalculator', {
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
			chartData: me._updateChartData(calc.runCalculation(me.AllSnapshots), true),
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
			}, me._defaultChartConfig)
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
				columnWidth:0.33,
				loadMask:false,
				height:400,
				padding:"50px 0 0 0",
				chartData: me._updateChartData(calc.runCalculation(me.TeamStores[projectName]), false),
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
				}, me._defaultChartConfig)
			});
			delete me.TeamStores[projectName];
		}
		delete me.AllSnapshots;
	},
	
	_updateChartData: function(data, isTrianData){
		var me = this, now = new Date();
		if(isTrianData) window.Datemap = []; //for the tooltip to have extra info to display on the chart

		//get ideal trendline
		var total = _.reduce(data.series, function(sum, s){return sum + (s.data[s.data.length-1] || 0); }, 0) || 0,
			idealTrend = {type:'spline', dashStyle:'Solid', name:'Ideal', data:new Array(data.categories.length)},
			ratio = (total/(data.categories.length-1)) || 0; //for NaN
		idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
		
		//zero future points, convert to workweeks, and set window.Datemap
		_.each(data.categories, function(c, i, a){
			var d = new Date(c);
			a[i] = 'WW' + me._getWorkweek(d);
			if(isTrianData) window.Datemap[i] = c;
			if(d>now){
				_.each(data.series, function(s, j){
					s.data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
				});
			}
		});

		//get projected trendline
		var s = _.find(data.series, function(s){ return s.name === 'Accepted'; }), i,
			projectedTrend = {type:'spline', dashStyle:'Solid', name:'Projected', data:s.data.slice()},
			begin=0, end=projectedTrend.data.length-1;
		for(i=1;i<projectedTrend.data.length;++i)
			if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
				begin = i-1; break; }
		for(i=begin+1;i<projectedTrend.data.length;++i)
			if(projectedTrend.data[i]===0){
				end = i-1; break; }
		ratio = end===begin ? 0 : (projectedTrend.data[end] - 0)/(end-begin);
		projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
			if(j>=begin) return Math.round(100*(0 + (j-begin)*ratio))/100;
			else return p; 
		});

		//apply label to correct point if needed
		for(i=0;i<projectedTrend.data.length;++i)
			if(projectedTrend.data[i] >= total){
				projectedTrend.data[i] = {
					dataLabels: {
						enabled: true,
						backgroundColor:'white',
						borderColor:'black',
						borderRadius:3,
						borderWidth:1,
						formatter: function () {
							return "<b>100% Complete</b><br />" + 
								"<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ")";
						},
						align:'center', y:-24
					},
					color:'red',
					marker:{
						enabled:true,
						lineWidth:4,
						symbol:'circle',
						fillColor:'red',
						lineColor:'red'
					},
					y: projectedTrend.data[i]
				};
				break;
			}
		
		data.series.push(projectedTrend);
		data.series.push(idealTrend);
		return data;
	}
});
