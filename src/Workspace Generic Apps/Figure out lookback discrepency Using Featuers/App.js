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
		
		_userAppsPref: 'figure-out-lookback-discrepency-lolol',	//dont share release scope settings with other apps	
		
		/****************************************************** DATA STORE METHODS ********************************************************/
		_loadSnapshotStores: function(){
			var me = this, 
				releaseName = me.ReleaseRecord.data.Name;
			me.LookbackProducts = {};
			me.LookbackProductFeatureMap = {};
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				var parallelLoaderConfig = {
					url: me.BaseUrl + '/analytics/v2.0/service/rally/workspace/' + 
						me.getContext().getWorkspace().ObjectID + '/artifact/snapshot/query.js',
					params: {
						workspace: me.getContext().getWorkspace()._ref,
						compress:true,
						find: JSON.stringify({ 
							_TypeHierarchy: 'PortfolioItem/' + type,
							_ProjectHierarchy: me.TrainPortfolioProject.data.ObjectID,
							__At: "current"
						}),
						fields:JSON.stringify(['Name', 'FormattedID', 'ObjectID', 'Parent', 'Release']),
						hydrate:JSON.stringify(['Release'])
					}
				};
				return me._parallelLoadLookbackStore(parallelLoaderConfig).then(function(store){
					return {
						ordinal: ordinal,
						store: store
					};
				});
			}))
			.then(function(items){
				_.each(items, function(item){ 
					item.records = item.store.getRange();
					if(item.ordinal === 0) item.records = _.filter(item.records, function(x){ return (x.data.Release || {}).Name === releaseName; });
				});
				
				var orderedPortfolioItemStores = _.sortBy(items, function(item){ return item.ordinal; }),
						lowestPortfolioItemRecords = orderedPortfolioItemStores[0].records;
					_.each(lowestPortfolioItemRecords, function(lowPortfolioItem){ //create the portfolioItem mapping
						var ordinal = 0, 
							parentPortfolioItem = lowPortfolioItem,
							getParentRecord = function(child, parentList){
								return _.find(parentList, function(parent){ 
									return parent.data.ObjectID == child.data.Parent; 
								});
							};
						while(ordinal < (orderedPortfolioItemStores.length-1) && parentPortfolioItem){
							parentPortfolioItem = getParentRecord(parentPortfolioItem, orderedPortfolioItemStores[ordinal+1].records);
							++ordinal;
						}
						if(ordinal === (orderedPortfolioItemStores.length-1) && parentPortfolioItem){
							if(!me.LookbackProductFeatureMap[parentPortfolioItem.data.ObjectID]) 
								me.LookbackProductFeatureMap[parentPortfolioItem.data.ObjectID] = [];
							if(!me.LookbackProducts[parentPortfolioItem.data.ObjectID]) 
									me.LookbackProducts[parentPortfolioItem.data.ObjectID] = parentPortfolioItem;
							me.LookbackProductFeatureMap[parentPortfolioItem.data.ObjectID].push(lowPortfolioItem);
						}
					});
					
					me.LookbackProducts = _.sortBy(_.map(me.LookbackProducts, function(p){ return p; }), function(s){ return s.data.Name; });
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
			me.WsapiProducts = {};
			me.WsapiProductFeatureMap = {};
			
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
						if(ordinal === (orderedPortfolioItemStores.length-1) && parentPortfolioItem){
							if(!me.WsapiProductFeatureMap[parentPortfolioItem.data.ObjectID]) me.WsapiProductFeatureMap[parentPortfolioItem.data.ObjectID] = [];
							if(!me.WsapiProducts[parentPortfolioItem.data.ObjectID]) me.WsapiProducts[parentPortfolioItem.data.ObjectID] = parentPortfolioItem;
							me.WsapiProductFeatureMap[parentPortfolioItem.data.ObjectID].push(lowPortfolioItem);
						}
					});
					
					me.WsapiProducts = _.sortBy(_.map(me.WsapiProducts, function(p){ return p; }), function(s){ return s.data.Name; });
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
			return Q.all([me._loadPortfolioItems(), me._loadSnapshotStores()]).then(function(){ return me._redrawEverything(); });
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
			
			me.UniqueWsapiProductFeatureMap = _.reduce(me.WsapiProductFeatureMap, function(hash, features, productOID){
				if(!me.LookbackProductFeatureMap[productOID]) hash[productOID] = features;
				else hash[productOID] = _.filter(features, function(f1){ 
					return !_.some(me.LookbackProductFeatureMap[productOID], function(f2){ return f1.data.ObjectID == f2.data.ObjectID; });
				});
				return hash;
			}, {});
			me.UniqueLookbackProductFeatureMap = _.reduce(me.LookbackProductFeatureMap, function(hash, features, productOID){
				if(!me.WsapiProductFeatureMap[productOID]) hash[productOID] = features;
				else hash[productOID] = _.filter(features, function(f1){ 
					return !_.some(me.WsapiProductFeatureMap[productOID], function(f2){ return f1.data.ObjectID == f2.data.ObjectID; });
				});
				return hash;
			}, {});
			
			me.add({
				xtype:'container',
				html:([
					'<div style="display:flex;width:100%;">',
						'<div style="flex:1"><h1>Using WSAPI</h1>'
							].concat(_.map(me.WsapiProducts, function(p){
								return [
									'<b>Product: </b>' + p.data.Name + '<br/>',
									'<b>Product ObjectID: </b>' + p.data.ObjectID + '<br/>',
									'<b>Product FormattedID: </b>' + p.data.FormattedID + '<br/>',
									'<b>TotalFeatureCount: </b>' + me.WsapiProductFeatureMap[p.data.ObjectID].length + '<br/>',
									'<b>UniqueFeatureCount: </b>' + me.UniqueWsapiProductFeatureMap[p.data.ObjectID].length + '<br/>',
									'<b>Unique Features: </b><br/>'
										].concat(_.map(me.UniqueWsapiProductFeatureMap[p.data.ObjectID], function(f){ 
											return [
												'<div style="padding-left:10px;">',
													'<b>Feature: </b>' + f.data.Name + '<br/>',
													'<b>Feature ObjectID: </b>' + f.data.ObjectID + '<br/>',
													'<b>Feature FormattedID: </b>' + f.data.FormattedID + '<br/>',
												'</div>'
											].join('');
										})).concat([
									'<br/>'
								]).join('');
							})).concat([
						'</div>',
						'<div style="flex:1"><h1>Using Lookback</h1>'
							]).concat(_.map(me.LookbackProducts, function(p){
								return [
									'<b>Product: </b>' + p.data.Name + '<br/>',
									'<b>Product ObjectID: </b>' + p.data.ObjectID + '<br/>',
									'<b>Product FormattedID: </b>' + p.data.FormattedID + '<br/>',
									'<b>TotalFeatureCount: </b>' + me.LookbackProductFeatureMap[p.data.ObjectID].length + '<br/>',
									'<b>UniqueFeatureCount: </b>' + me.UniqueLookbackProductFeatureMap[p.data.ObjectID].length + '<br/>',
									'<b>Unique Features: </b><br/>'
										].concat(_.map(me.UniqueLookbackProductFeatureMap[p.data.ObjectID], function(f){
											return [
												'<div style="padding-left:10px;">',
													'<b>Feature: </b>' + f.data.Name + '<br/>',
													'<b>Feature ObjectID: </b>' + f.data.ObjectID + '<br/>',
													'<b>Feature FormattedID: </b>' + f.data.FormattedID + '<br/>',
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