/** this app shows the cumulative flow charts for a train, and the scrums in it
	it is scoped to a specific release (and optionally) top portfolioItem
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('TrainCfdCharts', {
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
		
		_userAppsPref: 'intel-ART-CFD',	//dont share release scope settings with other apps	
		
		/****************************************************** DATA STORE METHODS ********************************************************/
		_loadSnapshotStores: function(){
			var me = this, 
				promises = [],
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.AllSnapshots = [];
			me.TeamStores = {};
			return Q.all(_.map(me.ReleasesWithName, function(releaseRecord){
				var parallelLoaderConfig = {
					pagesize:20000,
					url: 'https://rally1.rallydev.com/analytics/v2.0/service/rally/workspace/' + 
						me.getContext().getWorkspace().ObjectID + '/artifact/snapshot/query.js',
					params: {
						workspace: me.getContext().getWorkspace()._ref,
						compress:false, //makes it very slow sometimes
						pagesize:20000,
						find: JSON.stringify({ 
							_TypeHierarchy: 'HierarchicalRequirement',  // USE lowestPortfolioItem NOT 'PortfolioItem'!!!!!!!! think child user stories!
							Children: null,
							Release: releaseRecord.data.ObjectID
						}),
						fields:JSON.stringify(['ScheduleState', 'PlanEstimate', lowestPortfolioItem, '_ValidFrom', '_ValidTo', 'ObjectID']),
						hydrate:JSON.stringify(['ScheduleState'])
					}
				};
				return me._parallelLoadLookbackStore(parallelLoaderConfig)
					.then(function(snapshotStore){ 
						var records = snapshotStore.getRange();
						if(records.length > 0){
							me.TeamStores[releaseRecord.data.Project.Name] = records;
							me.AllSnapshots = me.AllSnapshots.concat(records);
						}
					});
			}));
		},				
		_loadAllChildReleases: function(){ 
			var me = this, releaseName = me.ReleaseRecord.data.Name;			
			return me._loadReleasesByNameUnderProject(releaseName, me.TrainRecord)
				.then(function(releaseRecords){
					me.ReleasesWithName = _.filter(releaseRecords, function(r){ 
						return r.data.Project && r.data.Project.TeamMembers.Count > 0; 
					});
				});
		},
		_loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: OPIOT');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					remoteSort:false,
					fetch: me._portfolioItemFields,
					filters:[{ property:'Release.Name', value:me.ReleaseRecord.data.Name}],
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me._reloadStore(store);
		},	
		_loadPortfolioItems: function(){ 
			var me=this;
			
			me.PortfolioItemMap = {}; 
			me.TopPortfolioItemNames = [];
			me.CurrentTopPortfolioItemName = null;
			
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me._loadPortfolioItemsOfType(me.TrainPortfolioProject, type) : 
						me._loadPortfolioItemsOfTypeInRelease(me.TrainPortfolioProject, type)
					)
					.then(function(portfolioStore){
						return {
							ordinal: ordinal,
							store: portfolioStore
						};
					});
				}))
				.then(function(items){
					var orderedPortfolioItemStores = _.sortBy(items, function(item){ return item.ordinal; }),
						lowestPortfolioItemStore = orderedPortfolioItemStores[0].store;
					me.PortfolioItemMap = {};
					_.each(lowestPortfolioItemStore.getRange(), function(lowPortfolioItem){ //create the portfolioItem mapping
						var ordinal = 0, 
							parentPortfolioItem = lowPortfolioItem,
							getParentRecord = function(child, parentList){
								return _.find(parentList, function(parent){ 
									return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; 
								});
							};
						while(ordinal < (orderedPortfolioItemStores.length-1) && parentPortfolioItem){
							parentPortfolioItem = getParentRecord(parentPortfolioItem, orderedPortfolioItemStores[ordinal+1].store.getRange());
							++ordinal;
						}
						if(ordinal === (orderedPortfolioItemStores.length-1) && parentPortfolioItem)
							me.PortfolioItemMap[lowPortfolioItem.data.ObjectID] = parentPortfolioItem.data.Name;
					});
					
					me.TopPortfolioItemNames = _.sortBy(_.map(_.union(_.values(me.PortfolioItemMap)),
						function(name){ return {Name: name}; }),
						function(name){ return name.Name; });
				});
		},
		_filterUserStoriesByTopPortfolioItem: function(){
			var me=this,
				topPiName = me.CurrentTopPortfolioItemName,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			if(topPiName===null){
				me.FilteredAllSnapshots = me.AllSnapshots;
				me.FilteredTeamStores = me.TeamStores;
			} else {
				me.FilteredAllSnapshots = [];
				me.FilteredTeamStores = {};
				_.each(me.TeamStores, function(records, teamName){
					var filteredRecords = _.filter(records, function(record){
						return me.PortfolioItemMap[record.data[lowestPortfolioItem]] == topPiName;
					});
					me.FilteredTeamStores[teamName] = filteredRecords;
					me.FilteredAllSnapshots = me.FilteredAllSnapshots.concat(filteredRecords);
				});
			}
			return Q();
		},
		
		/******************************************************* Reloading ********************************************************/			
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},	
		_redrawEverything: function(){
			var me=this;
			me.setLoading('Loading Charts');	
			return me._filterUserStoriesByTopPortfolioItem()
				.then(function(){
					$('#scrumCharts-innerCt').empty();
					if(!me.ReleasePicker) me._buildReleasePicker();
					if(me.TopPortfolioItemPicker) me.TopPortfolioItemPicker.destroy();
					me._buildTopPortfolioItemPicker();
					me._buildCharts();
					me._hideHighchartsLinks();
					me.setLoading(false);
				});
		},
		_reloadEverything:function(){ 
			/** performance NOTE: i tried scoping the user stories to the train instead of loading individually per scrum. 
					It was really slow. So we have to deal with not being 100% sure that the data is accurate in the CFD 
					(if a project got closed)
				*/
			var me=this;
			me.setLoading('Loading Stores');	
			return me._loadAllChildReleases().then(function(){ 
				return Q.all([
					me._loadSnapshotStores(),
					me._loadPortfolioItems()
				]);
			})
			.then(function(){ return me._redrawEverything(); });
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
						me._projectInWhichTrain(me.ProjectRecord) /******** load stream 1 *****/
							.then(function(trainRecord){
								if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID){
									me.TrainRecord = trainRecord;
									return me._loadTrainPortfolioProject(trainRecord);
								}
								else return Q.reject('You are not scoped to a train.');
							})
							.then(function(trainPortfolioProject){
								me.TrainPortfolioProject = trainPortfolioProject;
							}),
						me._loadAppsPreference() /******** load stream 2 *****/
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
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},
		
		/*************************************************** RENDERING NavBar **************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
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
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me._releasePickerSelected.bind(me) }
			});
		},
		_topPortfolioItemPickerSelected: function(combo, records){
			var me=this, 
				topPiType = me.PortfolioItemTypes.length && me.PortfolioItemTypes[me.PortfolioItemTypes.length-1],
				allPiOfTypeLabel = topPiType ? ('All ' + topPiType + 's') : 'All',
				value = records[0].data.Name;
			if((value === null && me.CurrentTopPortfolioItemName===null) || (value === me.CurrentTopPortfolioItemName)) return;
			if(value === allPiOfTypeLabel) me.CurrentTopPortfolioItemName = null;
			else me.CurrentTopPortfolioItemName = value;
			me._redrawEverything();
		},				
		_buildTopPortfolioItemPicker: function(){
			var me=this,
				topPiType = me.PortfolioItemTypes.length && me.PortfolioItemTypes[me.PortfolioItemTypes.length-1],
				allPiOfTypeLabel = topPiType ? ('All ' + topPiType + 's') : 'All';
			me.TopPortfolioItemPicker = Ext.getCmp('navBar').add({
				xtype:'intelfixedcombo',
				fieldLabel: (topPiType || 'Portfolio') + ' Filter',
				labelWidth: 80,
				width: 240,
				store: Ext.create('Ext.data.Store', {
					fields:['Name'],
					data: [{Name:allPiOfTypeLabel}].concat(me.TopPortfolioItemNames)
				}),
				displayField: 'Name',
				value: me.CurrentTopPortfolioItemName || allPiOfTypeLabel,
				listeners: { select: me._topPortfolioItemPickerSelected.bind(me) }
			});
		},		
		
		/********************************************** RENDERING CHARTS ***********************************************/
		_buildCharts: function(){
			var me = this,
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				calc = Ext.create('FastCumulativeFlowCalculator', {
					startDate: releaseStart,
					endDate: releaseEnd,
					scheduleStates: me.ScheduleStates
				});

			/************************************** Train CHART STUFF *********************************************/
			var aggregateChartData = me._updateCumulativeFlowChartData(calc.runCalculation(me.FilteredAllSnapshots)),
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
							text: me._getTrainName(me.TrainRecord)
						},
						subtitle:{
							text: me.ReleaseRecord.data.Name.split(' ')[0] + 
								(me.CurrentTopPortfolioItemName ? (' (' + me.CurrentTopPortfolioItemName) +')' : '')
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
			var sortedProjectNames = _.sortBy(Object.keys(me.FilteredTeamStores), function(projName){ return projName; }),
				scrumChartConfiguredChartTicks = me._getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.32);
			_.each(sortedProjectNames, function(projectName){
				var scrumChartData = me._updateCumulativeFlowChartData(calc.runCalculation(me.FilteredTeamStores[projectName])),		
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