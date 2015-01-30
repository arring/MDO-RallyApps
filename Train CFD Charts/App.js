/** this app shows the cumulative flow charts for a train, and the scrums in it
	it is scoped to a specific release (and optionally) product
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	console = { log: function(){} };

	var datemap = []; //closure variable that maps the data points in the grids to the date string
	
	Ext.define('TrainCfdCharts', {
		extend: 'IntelRallyApp',
		cls:'app',
		requires:[
			'FastCfdCalculator'
		],
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ReleaseQuery',
			'ChartUpdater',
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
		
		_userAppsPref: 'intel-ART-CFD',	
		
		/********************************************** SOME CONFIG CONSTANTS *******************************************/
		_chartColors: [
			'#ABABAB', 
			'#E57E3A',
			'#E5D038', 
			'#0080FF', 
			'#3A874F', 
			'#000000',
			'#26FF00'
		],		
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
					return "<b>" + this.x + '</b> (' + datemap[this.point.x] + ')' + 
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
		_getConfiguredChartTicks: function(startDate, endDate, width){
			var pixelTickWidth = 40,
				ticks = width/pixelTickWidth>>0,
				oneDay = 1000*60*60*24,
				days = (endDate*1 - startDate*1)/(oneDay*5/7)>>0, //only workdays
				interval = ((days/ticks>>0)/5>>0)*5;
			return (interval < 5) ? 5 : interval; //make it weekly at the minimum
		},
		
		/****************************************************** DATA STORE METHODS ********************************************************/
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
					me.ReleasesWithName = _.filter(releaseStore.getRange(), function(r){ 
						return r.data.Project && r.data.Project.TeamMembers.Count > 0; 
					});
				});
		},

		/******************************************************* Reloading ********************************************************/			
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},	
		_reloadEverything:function(){
			var me=this;
			me.setLoading('Loading Stores');	
			return me._loadAllChildReleases()
				.then(function(){ return me._loadSnapshotStores(); })
				.then(function(){
					$('#scrumCharts-innerCt').empty();
					me.setLoading('Loading Charts');	
					if(!me.ReleasePicker) me._buildReleasePicker();
					//if(!me.ProductPicker) me._buildProductPicker();
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
			Highcharts.setOptions({ colors: me._chartColors });
			me.setLoading(true);
			me._loadModels()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //parallel loads
						me._projectInWhichTrain(me.ProjectRecord) /******** load stream 1 *****/
							.then(function(trainRecord){
								if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID) me.TrainRecord = trainRecord;
								else return Q.reject('You are not scoped to a train.');
								me._loadProducts(trainRecord);
							})
							.then(function(products){
								me.Products = products;
							}),
						me._loadAppsPreference() /******** load stream 2 *****/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseStore){
								me.ReleaseStore = releaseStore;
								var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This train has no releases.');
							})
					]);
				})
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},
		
		/******************************************************* RENDERING CHARTS ********************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);		
			me._workweekData = me._getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);	
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
				releases: me.ReleaseStore.data.items,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},
		_buildCharts: function(){
			var me = this,
				calc = Ext.create('FastCfdCalculator', {
					startDate: me.ReleaseRecord.data.ReleaseStartDate,
					endDate: me.ReleaseRecord.data.ReleaseDate
				});
			
			if(me.AllSnapshots.length === 0){
				me._alert('ERROR', me.TrainRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name);
				return;
			}
			
			/************************************** CHART STUFF *********************************************/
			var aggregateChartData = me._updateChartData(calc.runCalculation(me.AllSnapshots));
			datemap = aggregateChartData.datemap;
			$('#aggregateChart-innerCt').highcharts(Ext.Object.merge(me._defaultChartConfig, {
				chart: {
					height:400,
					events:{
						load: function(){  }
					}
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
					categories: aggregateChartData.categories,
					tickInterval: me._getConfiguredChartTicks(
						me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.66)
				},
				series: aggregateChartData.series
			}));

			/************************************** Scrum CHARTS STUFF *********************************************/	
			var sortedProjectNames = _.sortBy(Object.keys(me.TeamStores), function(projName){ 
				return projName.split('-')[1].trim() + projName; 
			});
			_.each(sortedProjectNames, function(projectName){
				var scrumChartData = me._updateChartData(calc.runCalculation(me.TeamStores[projectName])),		
					scrumCharts = $('#scrumCharts-innerCt'),
					scrumChartID = 'scrumChart-no-' + (scrumCharts.children().length + 1);
				scrumCharts.append('<div class="scrum-chart" id="' + scrumChartID + '"></div>');
				$('#' + scrumChartID).highcharts(Ext.Object.merge(me._defaultChartConfig, {
					chart: { height:300 },
					legend: { enabled: false },
					title: { text: null },
					subtitle:{ text: projectName },
					xAxis: {
						categories: scrumChartData.categories,
						tickInterval: me._getConfiguredChartTicks(
							me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.32)
					},
					series: scrumChartData.series
				}));
			});
			me.doLayout();
		}
	});
}());