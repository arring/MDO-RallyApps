/** use this to load stores that have lots of records. it will load them in parallel instead of serially.
		config needs to be: {
			pageSize: <defaults to 200>
			url:<host:port/path>
			params: query parameter object with keys and vals
			model: the instantiated wsapi/lookback model (need to load this first)
		}
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('ParallelLoader', { 
		_parallelLoadStore: function(config){
			var me=this,
				pageSize = (config.pageSize > 0 && config.pageSize <= 200) config.pageSize || 200,
				url = config.url,
				params = config.params,
				promises = [],
				items = [];
				totalRequestsSent = 10; //10 is the minimum number of requests sent
			_.times(totalRequestsSent, function(pageNum){
				var thisDeferred = Q.defer(),
					thisParams = Ext.merge({}, params);
				promises.push(thisDeferred.promise);
				thisParams.start = 1 + pageSize*pageNum;
				Ext.Ajax.request({
					url:url,
					method:'GET',
					params: thisParams,
					success: function(response){
						var resJSON  = JSON.parse(response.responseText).QueryResult,
							totalCount = resJSON.TotalResultCount,
							totalPages = (totalCount/pageSize>>0)+(totalCount%pageSize ? 1 : 0);			
						items = items.concat(resJSON.Results);
						if(totalRequestsSent < totalPages){
							var	additionalPromises = [];
							_.times(totalPages - totalRequestsSent, function(){
								var nextDeferred = Q.defer(),
									thisParams = Ext.merge({}, params);
								additionalPromises.push(nextDeferred.promise);
								thisParams.start = 1 + pageSize*totalRequestsSent;
								++totalRequestsSent;
								Ext.Ajax.request({
									url:url,
									method:'GET',
									params: thisParams,
									success: function(response){
										var resJSON  = JSON.parse(response.responseText).QueryResult;
										items = items.concat(resJSON.Results);
										nextDeferred.resolve();
									},
									failure: function(response){ nextDeferred.resolve(); }
								});
							});
							Q.all(additionalPromises).then(function(){ thisDeferred.resolve(); });
						}
						else thisDeferred.resolve();
					},
					failure: function(response){ thisDeferred.resolve(); }
				});
			});
			return Q.all(promises).then(function(){
				return Ext.create('Rally.data.wsapi.Store', {
					model: config.model,
					totalCount: items.length,
					data: items,
					load: function(){}
				});
			});
		}
	});
}());