/** this app shows the cumulative flow charts for a scrum-group, and the scrums in it
	it is scoped to a specific release (and optionally) top portfolioItem
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.ScrumGroupCfdCharts', { 
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
			'Intel.lib.mixin.UserAppsPreference'
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
		
		userAppsPref: 'intel-ScrumGroup-CFD',
		
		/****************************************************** DATA STORE METHODS ********************************************************/
		loadSnapshotStores: function(){
			/** NOTE: _ValiTo is non-inclusive, _ValidFrom is inclusive **/
			var me = this, 
				releaseStart = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseEnd = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseName = me.ReleaseRecord.data.Name,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.AllSnapshots = [];
			me.TeamStores = {};
			return Q.all(_.map(me.LeafProjects, function(project){
				var parallelLoaderConfig = {
					context:{ 
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					compress:true,
					findConfig: { 
						_TypeHierarchy: 'HierarchicalRequirement',
						Children: null,
						Project: project.data.ObjectID,
						_ValidFrom: { $lte: releaseEnd },
						_ValidTo: { $gt: releaseStart }
					},
					fetch: ['ScheduleState', 'Release', 'PlanEstimate', lowestPortfolioItem, '_ValidFrom', '_ValidTo', 'ObjectID'],
					hydrate: ['ScheduleState']
				};
				return me.parallelLoadLookbackStore(parallelLoaderConfig).then(function(snapshotStore){ 
					//only keep snapshots where (release.name == releaseName || (!release && portfolioItem.Release.Name == releaseName))
					//	AND have length > 0 (another bug ('feature') in LBAPI!)
					var records = _.filter(snapshotStore.getRange(), function(snapshot){
						return (me.ReleasesWithNameHash[snapshot.data.Release] || 
								(!snapshot.data.Release && me.LowestPortfolioItemsHash[snapshot.data[lowestPortfolioItem]] == releaseName)) &&
							(snapshot.data._ValidFrom != snapshot.data._ValidTo);
					});						
					if(records.length > 0){
						me.TeamStores[project.data.Name] = records;
						me.AllSnapshots = me.AllSnapshots.concat(records);
					}
				});
			}));
		},				
		loadPortfolioItems: function(){ 
			var me=this;
			
			me.LowestPortfolioItemsHash = {};
			me.PortfolioItemMap = {}; //map of lowestPortfolioItem -> its upper-most portfolioItem
			me.TopPortfolioItemNames = [];
			me.CurrentTopPortfolioItemName = null;
			
			return Q.all(_.map(me.PortfolioItemTypes, function(type){
				//NOTE: we are loading ALL lowestPortfolioItems b/c sometimes we run into issues where
				//userstories in one release are under portfolioItems in another release (probably a user
				// mistake). And this messes up the numbers in the topPortfolioItem filter box
				return me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type);			
			}))
			.then(function(portfolioItemStores){
				me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);		
				me.TopPortfolioItemNames = _.sortBy(_.map(_.union(_.values(me.PortfolioItemMap)),
					function(name){ return {Name: name}; }),
					function(name){ return name.Name; });
				me.LowestPortfolioItemsHash = _.reduce(portfolioItemStores[0].getRange(), function(hash, r){
					hash[r.data.ObjectID] = (r.data.Release || {}).Name || 'No Release';
					return hash;
				}, {});
			});
		},
		loadAllChildReleases: function(){ 
			var me = this, releaseName = me.ReleaseRecord.data.Name;			
			return me.loadReleasesByNameUnderProject(releaseName, me.ScrumGroupRootRecord)
				.then(function(releaseRecords){
					me.ReleasesWithNameHash = _.reduce(releaseRecords, function(hash, rr){
						hash[rr.data.ObjectID] = true;
						return hash;
					}, {});
				});
		},
		
		/******************************************************* Reloading ********************************************************/			
		hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},	
		filterUserStoriesByTopPortfolioItem: function(){
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
			//add all scrums in scrum group if they dont exist yet
			_.each(me.LeafProjects, function(projectRecord){
				me.FilteredTeamStores[projectRecord.data.Name] = me.FilteredTeamStores[projectRecord.data.Name] || {};
			});
			
			return Q();
		},
		redrawEverything: function(){
			var me=this;
			me.setLoading('Loading Charts');	
			return me.filterUserStoriesByTopPortfolioItem()
				.then(function(){
					$('#scrumCharts-innerCt').empty();
					if(!me.DeleteCacheButton) me.renderDeleteCache();
					if(!me.UpdateCacheButton) me.renderUpdateCache();
					if(!me.ReleasePicker) me.renderReleasePicker();
					if(me.TopPortfolioItemPicker) me.TopPortfolioItemPicker.destroy();
					me.renderTopPortfolioItemPicker();
					me.renderCharts();
					me.hideHighchartsLinks();
					me.setLoading(false);
				});
		},
		
		reloadData:function(){ 
			var me=this;
			me.setLoading('Loading Data');	
			return me.loadAllChildReleases()
				.then(function(){ return me.loadPortfolioItems(); })
				.then(function(){ return me.loadSnapshotStores(); });
		},
		loadConfiguration: function(){
			var me = this;
			return me.configureIntelRallyApp().then(function(){
				var scopeProject = me.getContext().getProject();
				return me.loadProject(scopeProject.ObjectID);
			})
			.then(function(scopeProjectRecord){
				me.ProjectRecord = scopeProjectRecord;
				return Q.all([ //parallel loads
					me.projectInWhichScrumGroup(me.ProjectRecord) /******** load stream 1 *****/
						.then(function(scrumGroupRootRecord){
							if(scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID){
								me.ScrumGroupRootRecord = scrumGroupRootRecord;
								return me.loadScrumGroupPortfolioProject(scrumGroupRootRecord);
							}
							else return Q.reject('You are not scoped to a valid project.');
						})
						.then(function(scrumGroupPortfolioProject){
							me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
							return me.loadAllLeafProjects(me.ScrumGroupRootRecord);
						})
						.then(function(scrums){
							me.LeafProjects = _.filter(scrums, function(s){ return s.data.TeamMembers.Count > 0; });
						}),
					me.loadAppsPreference() /******** load stream 2 *****/
						.then(function(appsPref){
							me.AppsPref = appsPref;
							var fourteenWeeks = 1000*60*60*24*7*14;
							return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - fourteenWeeks));
						})
						.then(function(releaseRecords){
							me.ReleaseRecords = _.sortBy(releaseRecords, function(r){ return  new Date(r.data.ReleaseDate)*(-1); });
							var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
							if(currentRelease) me.ReleaseRecord = currentRelease;
							else return Q.reject('This project has no releases.');
						})	
				]);
			});
		},
		
		/******************************************************* Cache operations ********************************************************/		
		getCache: function(){ //TODO
			var me = this;
			var key = 'scrum-group-cfd-' + me.getContext().getProject().ObjectID;
			var url = 'https://mdoproceffrpt:45555/api/v1.0/custom/rally-app-cache/' + key;
			var deferred = Q.defer();
			
			$.ajax({
				url: url,
				type: 'GET',
				success: function(payload){
					var payloadJSON;
					try { payloadJSON = JSON.parse(payload); }
					catch(e){ 
						console.log('corrupt cache payload'); 
						deferred.resolve(false);
					}
					
					//intel-rally-app sets these
					me.BaseUrl = Rally.environment.getServer().getBaseUrl();
					me.PortfolioItemTypes = payloadJSON.PortfolioItemTypes;
					me.userStoryFields.push(me.PortfolioItemTypes[0]);  //userStoryFields supposed to be lowercase, dont worry
					me.ScrumGroupConfig = payloadJSON.ScrumGroupConfig;
					me.HorizontalGroupingConfig = payloadJSON.HorizontalGroupingConfig;
					me.ScheduleStates = payloadJSON.ScheduleStates;
					
					//this app sets these
					me.ProjectRecord = payloadJSON.ProjectRecord;
					me.ScrumGroupRootRecord = payloadJSON.ScrumGroupRootRecord;
					me.ScrumGroupPortfolioProject = payloadJSON.ScrumGroupPortfolioProject; 
					me.LeafProjects = payloadJSON.LeafProjects;
					me.ReleaseRecords = payloadJSON.ReleaseRecords;
					me.AppsPref = {};
					me.ReleaseRecord = payloadJSON.ReleaseRecord;
					me.ReleasesWithNameHash = payloadJSON.ReleasesWithNameHash; 
					me.LowestPortfolioItemsHash = payloadJSON.LowestPortfolioItemsHash;
					me.PortfolioItemMap = payloadJSON.PortfolioItemMap;
					me.TopPortfolioItemNames = payloadJSON.TopPortfolioItemNames;
					me.CurrentTopPortfolioItemName = null;
					me.AllSnapshots = payloadJSON.AllSnapshots;
					me.TeamStores = payloadJSON.TeamStores;
					
					deferred.resolve(true);
				},
				error: function(xhr, status, reason){ 
					if(xhr.status === 404) deferred.resolve(false);
					else deferred.reject(reason);
				}
			});
			return deferred.promise;
		},
		updateCache: function(){
			var me = this;
			var key = 'scrum-group-cfd-' + me.getContext().getProject().ObjectID;
			var url = 'https://mdoproceffrpt:45555/api/v1.0/custom/rally-app-cache/' + key;
			var deferred = Q.defer();
			var payload = {};
			
			payload.PortfolioItemTypes = me.PortfolioItemTypes;
			payload.ScrumGroupConfig = me.ScrumGroupConfig;
			payload.HorizontalGroupingConfig = me.HorizontalGroupingConfig;
			payload.ScheduleStates = me.ScheduleStates;
			
			//this app sets these
			payload.ProjectRecord = {data: me.ProjectRecord.data};
			payload.ScrumGroupRootRecord = {data: me.ScrumGroupRootRecord.data};
			payload.ScrumGroupPortfolioProject = {data: me.ScrumGroupPortfolioProject.data}; 
			payload.LeafProjects = _.map(me.LeafProjects, function(lp){ return {data: lp.data}; });
			payload.ReleaseRecords = _.map(me.ReleaseRecords, function(rr){ return {data: rr.data}; });
			payload.ReleaseRecord = {data: me.ReleaseRecord.data};
			payload.ReleasesWithNameHash = me.ReleasesWithNameHash; 
			
			payload.LowestPortfolioItemsHash = me.LowestPortfolioItemsHash;
			payload.PortfolioItemMap = me.PortfolioItemMap;
			payload.TopPortfolioItemNames = me.TopPortfolioItemNames;
			payload.AllSnapshots = _.map(me.AllSnapshots, function(ss){ return {raw: ss.raw}; });
			payload.TeamStores = _.reduce(me.TeamStores, function(map, sss, key){ 
				map[key] = _.map(sss, function(ss){ return {raw: ss.raw}; });
				return map;
			}, {}); 
			
			$.ajax({
				url: url,
				data: JSON.stringify(payload),
				type: 'PUT',
				headers: { 'Content-Type': 'application/json'},
				success: function(data) { deferred.resolve(data); },
				error: function(xhr, status, reason){ deferred.reject(reason); }
			});
			return deferred.promise;
		},
		deleteCache: function(){
			var me = this;
			var key = 'scrum-group-cfd-' + me.getContext().getProject().ObjectID;
			var url = 'https://mdoproceffrpt:45555/api/v1.0/custom/rally-app-cache/' + key;
			var deferred = Q.defer();
			
			$.ajax({
				url: url,
				type: 'DELETE',
				success: function(data) { deferred.resolve(data); },
				error: function(xhr, status, reason){ deferred.reject(reason); }
			});
			return deferred.promise;
		},
		
		/******************************************************* LAUNCH ********************************************************/		
		launch: function(){
			var me = this;
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.setLoading('Loading Configuration');
			return Q.all([
				me.loadAppsPreference().then(function(appsPref){ me.AppsPref = appsPref; }), //cant cache. per user basis
				me.getCache().then(function(cached){
					if(!cached){
						return me.loadConfiguration()
							.then(function(){ return me.reloadData(); })
							.then(function(){ 
								//NOTE: not returning promise here!
								me.updateCache().fail(function(e){
									alert(e);
									console.log(e);
								});
							});
					}
				})
			])
			.then(function(){ return me.redrawEverything(); })
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();
		},
		
		/*************************************************** RENDERING NavBar **************************************************/
		renderDeleteCache: function(){
			var me=this;
			me.DeleteCacheButton = Ext.getCmp('navBar').add({
				xtype:'button',
				text: 'Clear Cached Data',
				listeners: { 
					click: function(){
						me.setLoading('Clearing cache, please wait');
						return me.deleteCache()
							.then(function(){ me.setLoading(false); });
					}
				}
			});
		},
		renderUpdateCache: function(){
			var me=this;
			me.UpdateCacheButton = Ext.getCmp('navBar').add({
				xtype:'button',
				text: 'Get Live Data',
				listeners: { 
					click: function(){
						me.setLoading('Pulling Live Data, please wait');
						return me.loadConfiguration()
							.then(function(){ return me.reloadData(); })
							.then(function(){ return me.updateCache(); })
							.then(function(){ me.setLoading(false); });
					}
				}
			});
		},
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
		topPortfolioItemPickerSelected: function(combo, records){
			var me=this, 
				topPiType = me.PortfolioItemTypes.length && me.PortfolioItemTypes[me.PortfolioItemTypes.length-1],
				value = records[0].data.Name;
			if((value === null && me.CurrentTopPortfolioItemName===null) || (value === me.CurrentTopPortfolioItemName)) return;
			if(value === 'All Work') me.CurrentTopPortfolioItemName = null;
			else me.CurrentTopPortfolioItemName = value;
			me.redrawEverything();
		},				
		renderTopPortfolioItemPicker: function(){
			var me=this,
				topPiType = me.PortfolioItemTypes.length && me.PortfolioItemTypes[me.PortfolioItemTypes.length-1];
			me.TopPortfolioItemPicker = Ext.getCmp('navBar').add({
				xtype:'intelfixedcombo',
				fieldLabel: (topPiType || 'Portfolio') + ' Filter',
				labelWidth: 80,
				width: 240,
				store: Ext.create('Ext.data.Store', {
					fields:['Name'],
					data: [{Name:'All Work'}].concat(me.TopPortfolioItemNames)
				}),
				displayField: 'Name',
				value: me.CurrentTopPortfolioItemName || 'All Work',
				listeners: { select: me.topPortfolioItemPickerSelected.bind(me) }
			});
		},		
		
		/********************************************** RENDERING CHARTS ***********************************************/
		renderCharts: function(){
			var me = this,
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
					startDate: releaseStart,
					endDate: releaseEnd,
					scheduleStates: me.ScheduleStates
				});

			/************************************** Scrum Group CHART STUFF *********************************************/
			var updateOptions = {trendType:'Last2Sprints'},
				aggregateChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.FilteredAllSnapshots), updateOptions),
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
							text: me.getScrumGroupName(me.ScrumGroupRootRecord)
						},
						subtitle:{
							text: me.ReleaseRecord.data.Name.split(' ')[0] + 
								(me.CurrentTopPortfolioItemName ? (' (' + me.CurrentTopPortfolioItemName) +')' : '')
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
			var sortedProjectNames = _.sortBy(Object.keys(me.FilteredTeamStores), function(projName){ return projName; }),
				scrumChartConfiguredChartTicks = me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.32);
			_.each(sortedProjectNames, function(projectName){
				var updateOptions = {trendType:'Last2Sprints'},
					scrumChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.FilteredTeamStores[projectName]), updateOptions),		
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
			me.doLayout(); //or else they don't render initially
		}
	});
}());