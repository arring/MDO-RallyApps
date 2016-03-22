/** 
	SUMMARY:
	THis file will allows any app with caching enable to get cache 
	it expects the app using it sets up a key generators
	the app should have a function call cacheKeyGenerator
	
	app MUST impelement the following functions:
		
		- cacheKeyGenerator() -> string									(return the 'key' the cache mixin should store/load/delete the data under)
		- getCacheTimeoutDate() -> Date									(returns the date the cache should timeout from relative to NOW)
		- getCachePayloadFn(payload)										(JSON data that was returned from the cache is passed to this function after a cache-hit)
		- setCachePayLoadFn(payload)										(add fields to the json payload to be stored in the cache)
		
	the app has the following cache functions added to it:
	
		- getCache() -> Promise(cacheHit)                  (cacheHit === true if successfully got cache from server)
		- updateCache() -> Promise()                       (returns when the cache has been successfully updated)
		- deleteCache() -> Promise()                       (returns when the cache has been successfully delete)
*/

(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.Caching', {
		cacheUrl:'https://mdoproceffrpt:45555/api/v1.0/custom/rally-app-cache/',
		getCache: function(){ //TODO
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			if (typeof key === 'undefined' ){
				return Promise.resolve(false);//cache miss		
			}
			var url = me.cacheUrl + key ;
			var deferred = Q.defer();
			
			$.ajax({
				url: url,
				type: 'GET',
				success: function(payloadJSON){
					var payload;
					try { payload = JSON.parse(payloadJSON); }
					catch(e){ 
						console.log('corrupt cache payload'); 
						deferred.resolve(false);
					}
					//TODO: to think if we need try catch
					//me.__loadModels();
					me.getCacheIntelRallyAppSettings(payload);
					me.getCachePayloadFn(payload);
					
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
			var payload = {};
			var key = me.cacheKeyGenerator(); //generate key for the app
			var timeoutDate = me.getCacheTimeoutDate();
			if (typeof key === 'undefined' ){
				return Promise.reject('cannot PUT to cache, invalid key');	
			}
			
			var url = me.cacheUrl + key;
			if(timeoutDate){
				url += '?timeout=' + timeoutDate.toISOString();
			}
			
			me.setIntelRallyAppSettings(payload);
			me.setCachePayLoadFn(payload);
			
			var deferred = Q.defer();
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
		deleteCache: function(keyGenerator){
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			if (typeof key === 'undefined'){
				return Promise.reject('cannot DELETE from cache, invalid key');	
			}			
			var deferred = Q.defer();
			var url = me.cacheUrl + key;
			
			$.ajax({
				url: url,
				type: 'DELETE',
				success: function(data) { deferred.resolve(data); },
				error: function(xhr, status, reason){ deferred.reject(reason); }
			});
			return deferred.promise;
		},
		getCacheIntelRallyAppSettings: function(payload){
			var me = this;
			//intel-rally-app sets these (copy these for each app that uses the cache!)
			me.BaseUrl = Rally.environment.getServer().getBaseUrl();
			me.PortfolioItemTypes = payload.PortfolioItemTypes;
			me.userStoryFields.push(me.PortfolioItemTypes[0]);  //userStoryFields supposed to be lowercase, dont worry
			me.ScrumGroupConfig = payload.ScrumGroupConfig;
			me.HorizontalGroupingConfig = payload.HorizontalGroupingConfig;
			me.ScheduleStates = payload.ScheduleStates;
		},
		setIntelRallyAppSettings: function(payload){
			var me = this;
			payload.PortfolioItemTypes = me.PortfolioItemTypes;
			payload.ScrumGroupConfig = me.ScrumGroupConfig;
			payload.HorizontalGroupingConfig = me.HorizontalGroupingConfig;
			payload.ScheduleStates = me.ScheduleStates;
		}
	});
}());		