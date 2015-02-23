/** use this to load stores that have lots of records. it will load them in parallel instead of serially.
	what it does is loads 1 page and then based on the totalResultCount it loads the rest of the pages in parallel.
	
		for wsapiStore, the config needs to be: {
			pagesize: <defaults to 200>
			url:<host:port/path>
			params: query parameter object with keys and vals
			model: the instantiated wsapi model (need to load this first)
		}
		for lookbackStore, the config needs to be: {
			pagesize: <defaults to 20000>
			url:<host:port/path defaults to standard analytics url. host is window.location.host>
			params: query parameter object with keys and vals
		}
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('ParallelLoader', { 
		
		__parallelLoadData: function(config){
			var me=this,
				pagesize = config.pagesize,
				url = config.url,
				params = config.params,
				promises = [],
				outputItems = [];
				totalRequestsSent = 1; //1 is the minimum number of requests sent
			_.times(totalRequestsSent, function(pageNum){
				var thisDeferred = Q.defer(),
					thisParams = Ext.merge({}, params);
				promises.push(thisDeferred.promise);
				thisParams.start = config.itemOffset + pagesize*pageNum;
				Ext.Ajax.request({
					url:url,
					method:'GET',
					params: thisParams,
					success: function(response){
						var resJSON  = JSON.parse(response.responseText),
							items = resJSON.QueryResult ? resJSON.QueryResult.Results : resJSON.Results,
							totalCount = resJSON.QueryResult ? resJSON.QueryResult.TotalResultCount : resJSON.TotalResultCount,
							totalPages = (totalCount/pagesize>>0)+(totalCount%pagesize ? 1 : 0);			
						outputItems = outputItems.concat(items);
						if(totalRequestsSent < totalPages){
							var	additionalPromises = [];
							_.times(totalPages - totalRequestsSent, function(){
								var nextDeferred = Q.defer(),
									thisParams = Ext.merge({}, params);
								additionalPromises.push(nextDeferred.promise);
								thisParams.start = config.itemOffset + pagesize*totalRequestsSent;
								++totalRequestsSent;
								Ext.Ajax.request({
									url:url,
									method:'GET',
									params: thisParams,
									success: function(response){
										var resJSON  = JSON.parse(response.responseText),
											items = resJSON.QueryResult ? resJSON.QueryResult.Results : resJSON.Results;
										outputItems = outputItems.concat(items);
										nextDeferred.resolve();
									},
									failure: function(response){ nextDeferred.reject(response); }
								});
							});
							Q.all(additionalPromises).then(function(){ thisDeferred.resolve(); });
						}
						else thisDeferred.resolve();
					},
					failure: function(response){ thisDeferred.reject(response); }
				});
			});
			return Q.all(promises).then(function(){ return outputItems; });
		},		
		_parallelLoadWsapiStore: function(config){
			var me=this;
			config.itemOffset = 1; //page index starts at 1 for wsapi
			config.pagesize = (config.pagesize > 0 && config.pagesize <= 200) ? config.pagesize : 200;
			return me.__parallelLoadData(config).then(function(items){
				return Ext.create('Rally.data.wsapi.Store', {
					model: config.model,
					totalCount: items.length,
					data: items,
					load: function(){}
				});
			});
		},
		_parallelLoadLookbackStore: function(config){
			var me=this;
			config.itemOffset = 0; //page index starts at 0 for lookback
			config.pagesize = (config.pagesize > 0 && config.pagesize <= 20000) ? config.pagesize : 20000;
			return me.__parallelLoadData(config).then(function(items){
				return Ext.create('Rally.data.lookback.SnapshotStore', {
					totalCount: items.length,
					data: items,
					model: Ext.define('Rally.data.lookback.SnapshotModel-' + Ext.id(), {
						extend: 'Rally.data.lookback.SnapshotModel',
						fields:items.length ? Object.keys(items[0]) : []
					}),
					load: function(){}
				});
			});
		}
	});
}());