/** 
	SUMMARY:
		Use this mixin to load stores that have lots of records. it will load them in parallel instead of serially.
		what it does is loads 1 page and then based on the totalCount it loads the rest of the pages in parallel.
		
		The config you pass to parallelLoadLookbackStore and parallelLoadWsapiStore are the same configs you would pass
		to Rally.data.lookback.Store (or something like that) and Rally.data.wsapi.Store.
*/
(function(){
	var Ext = window.Ext4 || window.Ext;	
	
	Ext.define('Intel.lib.mixin.ParallelLoader', {		
		parallelLoadWsapiStore: function(config){
			var me=this, data = [], model;
			function doStoreLoad(page){
				var deferred = Q.defer(),
					store = Ext.create('Rally.data.wsapi.Store', _.merge({}, config, {
						pageSize:200,
						listeners:{ 
							load: function(store, records, successful){
								if(!successful) deferred.reject('could not load data from server');
								else deferred.resolve(store);
							}
						}
					}));
				store.loadPage(page);
				return deferred.promise;
			}
			function makeStore(){
				return Ext.create('Rally.data.wsapi.Store', {
					model: model,
					totalCount: data.length,
					data: data,
					disableMetaChangeEvent: true,
					load: function(){}
				});
			}
			return doStoreLoad(1).then(function(store){
				data = data.concat(store.getRange());
				model = store.model;
				var pages = ((store.totalCount/200>>0) + (store.totalCount%200 ? 1 : 0)) || 1;
				if(pages === 1) return makeStore();
				else return Q.all(_.times(pages-1, function(pageNum){
					return doStoreLoad(pageNum + 2).then(function(store){ data = data.concat(store.getRange()); });
				})).then(makeStore);
			});
		},
		parallelLoadLookbackStore: function(config){
			var me=this, data = [], model;
			function doStoreLoad(page){
				var deferred = Q.defer(),
					store = Ext.create('Rally.data.lookback.SnapshotStore', _.merge({}, config, {
						pageSize:20000,
						listeners:{ 
							load: function(store, records, successful){
								if(!successful) deferred.reject('could not load data from server');
								else deferred.resolve(store);
							}
						}
					}));
				store.loadPage(page);
				return deferred.promise;
			}
			function makeStore(){
				return Ext.create('Rally.data.lookback.SnapshotStore', {
					model: model,
					totalCount: data.length,
					data: data,
					disableMetaChangeEvent: true,
					load: function(){}
				});
			}
			return doStoreLoad(1).then(function(store){
				data = data.concat(store.getRange());
				model = store.model;
				var pages = ((store.totalCount/20000>>0) + (store.totalCount%20000 ? 1 : 0)) || 1;
				if(pages === 1) return makeStore();
				else return Q.all(_.times(pages-1, function(pageNum){
					return doStoreLoad(pageNum + 2).then(function(store){ data = data.concat(store.getRange()); });
				})).then(makeStore);
			});
		}
	});
}());
