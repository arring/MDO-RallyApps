/** this app shows the cumulative flow charts for a train, and the scrums in it
	it is scoped to a specific release (and optionally) top portfolioItem
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('TrainCfdCharts', { 
		extend: 'IntelRallyApp',
		cls:'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ParallelLoader',
			'UserAppsPreference'
		],
		minWidth:910,
		items:[{
			xtype:'container',
			id:'navBar'
		}],
		
		_userAppsPref: 'figure-out-lookback-discrepency-with-stories-lolol',	//dont share release scope settings with other apps	
		
		/****************************************************** DATA STORE METHODS ********************************************************/
		_loadUserStorySnapshots: function(){
			/** NOTE: _ValiTo is non-inclusive, _ValidFrom is inclusive **/
			var me = this, 
				releaseStart = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseEnd = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.LookbackProductStoryMap = _.reduce(me.Products, function(hash, product){
				hash[product.data.ObjectID] = [];
				return hash;
			}, {'No Product': []});
			return Q.all(_.map(me.TrainChildren, function(project){
				var parallelLoaderConfig = {
					url: me.BaseUrl + '/analytics/v2.0/service/rally/workspace/' + 
						me.getContext().getWorkspace().ObjectID + '/artifact/snapshot/query.js',
					params: {
						workspace: me.getContext().getWorkspace()._ref,
						compress:true,
						find: JSON.stringify({ 
							_TypeHierarchy: 'HierarchicalRequirement',
							Children: null,
							Project: project.data.ObjectID,
							__At: 'current'
							// _ValidFrom: { $lte: releaseEnd },
							// _ValidTo: { $gt: releaseStart }
						}),
						fields:JSON.stringify(['ScheduleState', 'Release', 'PlanEstimate', lowestPortfolioItem, '_ValidFrom', '_ValidTo', 'ObjectID']),
						hydrate:JSON.stringify(['ScheduleState'])
					}
				};
				return me._parallelLoadLookbackStore(parallelLoaderConfig)
					.then(function(snapshotStore){ 
						//only keep snapshots where (release.name == releasName || (!release && portfolioItem.Release.Name == releaseName))
						var records = _.uniq(_.filter(snapshotStore.getRange(), function(snapshot){
							return (me.ReleasesWithNameHash[snapshot.data.Release] || 
								(!snapshot.data.Release && me.LowestPortfolioItemsHash[snapshot.data[lowestPortfolioItem]]));
						}),
						function(s){ return s.data.ObjectID; });
						_.each(records, function(snapshot){
							var product = me.PortfolioItemMap[snapshot.data.Feature];
							if(product) me.LookbackProductStoryMap[product.data.ObjectID].push(snapshot);
							else if(snapshot.data.Feature) me.LookbackProductStoryMap['Other Products'].push(snapshot);
							else me.LookbackProductStoryMap['No Product'].push(snapshot);
						});
					});
			}));
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
			me.Products = {};
			me.PortfolioItemMap = {};
			
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
						lowestPortfolioItemStore = orderedPortfolioItemStores[0].store,
						highestPortfolioItemStore = orderedPortfolioItemStores.slice(-1)[0].store;
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
							me.PortfolioItemMap[lowPortfolioItem.data.ObjectID] = parentPortfolioItem;
					});
					
					me.Products = [{data: {Name:'No Product', ObjectID:'No Product'}}, {data: {Name:'Other Products', ObjectID:'Other Products'}}]
						.concat(_.sortBy(_.map(highestPortfolioItemStore.getRange(), function(p){ return p; }), function(s){ return s.data.Name; }));
					me.LowestPortfolioItemsHash = _.reduce(lowestPortfolioItemStore.getRange(), function(hash, r){
						hash[r.data.ObjectID] = true;
						return hash;
					}, {});
				});
		},
		_loadUserStories: function(){ 
			var me=this;
			me.WsapiProductStoryMap = _.reduce(me.Products, function(hash, product){
				hash[product.data.ObjectID] = [];
				return hash;
			}, {'No Product': []});
			var projectFilter = _.reduce(me.TrainChildren, function(str, p){ 
				if(!str.length) return '(Project.ObjectID = "' + p.data.ObjectID + '")';
				else return '(' + str + ' OR (Project.ObjectID = "' + p.data.ObjectID + '"))';
			}, '');
			return Q.all(_.map(me.Products, function(product){
				if(product.data.Name == 'No Product' || product.data.Name == 'Other Products') return Q();
				var parallelLoaderConfig = {
					model:me.UserStory,
					url: me.BaseUrl + '/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						workspace:me.getContext().getWorkspace()._ref,
						query: '(' + projectFilter + ' AND ' + '((Feature.Parent.Parent.ObjectID = "' + product.data.ObjectID + '")' + ' AND ' + 
							'((Release.Name = "' + me.ReleaseRecord.data.Name + '") OR ((DirectChildrenCount = 0) AND ' + 
							'((Release.Name = null) AND (Feature.Release.Name = "' + me.ReleaseRecord.data.Name + '"))))))',
						fetch: 'Name,ObjectID,Release,Feature,FormattedID,PlanEstimate'
					}
				};
				return me._parallelLoadWsapiStore(parallelLoaderConfig).then(function(store){ 
					me.WsapiProductStoryMap[product.data.ObjectID] = store.getRange();
				});
			}));
		},
		_loadAllChildReleases: function(){ 
			var me = this, releaseName = me.ReleaseRecord.data.Name;			
			return me._loadReleasesByNameUnderProject(releaseName, me.TrainRecord)
				.then(function(releaseRecords){
					me.ReleasesWithNameHash = _.reduce(releaseRecords, function(hash, rr){
						hash[rr.data.ObjectID] = true;
						return hash;
					}, {});
				});
		},
		
		/******************************************************* Reloading ********************************************************/			
		_redrawEverything: function(){
			var me=this;
			if(!me.ReleasePicker) me._buildReleasePicker();
			me._buildLists();
			me.setLoading(false);
		},
		_reloadEverything:function(){ 
			var me=this;
			me.setLoading('Loading Stores');	
			return me._loadAllChildReleases()
			.then(function(){ return me._loadPortfolioItems(); })
			.then(function(){
				return Q.all([
					me._loadUserStories(),
					me._loadUserStorySnapshots()
				]);
			})
			.then(function(){ 
				return me._redrawEverything(); 
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
								return me._loadAllChildrenProjects(me.TrainRecord);
							})
							.then(function(scrums){
								me.TrainChildren = scrums;
							}),
						me._loadAppsPreference() /******** load stream 2 *****/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var fourteenWeeks = 1000*60*60*24*7*14;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - fourteenWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = _.sortBy(releaseRecords, function(r){ return  new Date(r.data.ReleaseDate)*(-1); });
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

		/********************************************** RENDERING CHARTS ***********************************************/
		_buildLists: function(){
			var me=this;
			
			me.UniqueWsapiProductStoryMap = _.reduce(me.WsapiProductStoryMap, function(hash, stories, productOID){
				if(!me.LookbackProductStoryMap[productOID]) hash[productOID] = stories;
				else hash[productOID] = _.filter(stories, function(f1){ 
					return !_.some(me.LookbackProductStoryMap[productOID], function(f2){ return f1.data.ObjectID == f2.data.ObjectID; });
				});
				return hash;
			}, {});
			me.UniqueLookbackProductStoryMap = _.reduce(me.LookbackProductStoryMap, function(hash, stories, productOID){
				if(!me.WsapiProductStoryMap[productOID]) hash[productOID] = stories;
				else hash[productOID] = _.filter(stories, function(f1){ 
					return !_.some(me.WsapiProductStoryMap[productOID], function(f2){ return f1.data.ObjectID == f2.data.ObjectID; });
				});
				return hash;
			}, {});
			
			me.add({
				xtype:'container',
				html:([
					'<div style="display:flex;width:100%;">',
						'<div style="flex:1"><h1>Using WSAPI</h1>',
						'<b>Total Points: </b>' + 
							_.reduce(me.WsapiProductStoryMap, function(sum, stories){ 
								return sum + _.reduce(stories, function(sum, s){ return sum+(s.data.PlanEstimate||0); }, 0);
							}, 0),
						'<br/>',
						'<br/>',
							].concat(_.map(me.Products, function(p){
								return [
									'<b>Product: </b>' + p.data.Name + '<br/>',
									'<b>Product Points: </b>' + 
										_.reduce(me.WsapiProductStoryMap[p.data.ObjectID], function(sum, s){ return sum+(s.data.PlanEstimate||0); }, 0) + 
									'<br/>',
									'<b>Product ObjectID: </b>' + p.data.ObjectID + '<br/>',
									'<b>Product FormattedID: </b>' + p.data.FormattedID + '<br/>',
									'<b>TotalStoryCount: </b>' + me.WsapiProductStoryMap[p.data.ObjectID].length + '<br/>',
									'<b>UniqueStoryCount: </b>' + me.UniqueWsapiProductStoryMap[p.data.ObjectID].length + '<br/>',
									'<b>Unique Stories: </b><br/>'
										].concat(_.map(me.UniqueWsapiProductStoryMap[p.data.ObjectID], function(f){ 
											return [
												'<div style="padding-left:10px;">',
													'<b>Story: </b>' + f.data.Name + '<br/>',
													'<b>Story ObjectID: </b>' + f.data.ObjectID + '<br/>',
													'<b>Story FormattedID: </b>' + f.data.FormattedID + '<br/>',
												'</div>'
											].join('');
										})).concat([
									'<br/>'
								]).join('');
							})).concat([
						'</div>',
						'<div style="flex:1"><h1>Using Lookback</h1>',
						'<b>Total Points: </b>' + 
							_.reduce(me.LookbackProductStoryMap, function(sum, stories){ 
								return sum + _.reduce(stories, function(sum, s){ return sum+(s.data.PlanEstimate||0); }, 0);
							}, 0),
						'<br/>',
						'<br/>',
							]).concat(_.map(me.Products, function(p){
								return [
									'<b>Product: </b>' + p.data.Name + '<br/>',
									'<b>Product Points: </b>' + 
										_.reduce(me.LookbackProductStoryMap[p.data.ObjectID], function(sum, s){ return sum+(s.data.PlanEstimate||0); }, 0) + 
									'<br/>',
									'<b>Product ObjectID: </b>' + p.data.ObjectID + '<br/>',
									'<b>Product FormattedID: </b>' + p.data.FormattedID + '<br/>',
									'<b>TotalStoryCount: </b>' + me.LookbackProductStoryMap[p.data.ObjectID].length + '<br/>',
									'<b>UniqueStoryCount: </b>' + me.UniqueLookbackProductStoryMap[p.data.ObjectID].length + '<br/>',
									'<b>Unique Stories: </b><br/>'
										].concat(_.map(me.UniqueLookbackProductStoryMap[p.data.ObjectID], function(f){
											return [
												'<div style="padding-left:10px;">',
													'<b>Story: </b>' + f.data.Name + '<br/>',
													'<b>Story ObjectID: </b>' + f.data.ObjectID + '<br/>',
													'<b>Story FormattedID: </b>' + f.data.FormattedID + '<br/>',
												'</div>'
											].join('');
										})).concat([
									'<br/>'
								]).join('');
							})).concat([
						'</div>',
					'</div>'
				])).join('')
			});
		}
	});
}());