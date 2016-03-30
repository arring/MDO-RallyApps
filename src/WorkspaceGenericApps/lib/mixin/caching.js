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
		- appSetting														(add app setting for the cacheUrl)
		
	the app has the following cache functions added to it:
	
		- getCache() -> Promise(cacheHit)                  (cacheHit === true if successfully got cache from server)
		- updateCache() -> Promise()                       (returns when the cache has been successfully updated)
		- deleteCache() -> Promise()                       (returns when the cache has been successfully delete)
		
	the config.json MUST include the following files:
		https://cdn.rawgit.com/henrya/js-jquery/master/BinaryTransport/jquery.binarytransport.js
	
	useful readings:
		http://stackoverflow.com/questions/6965107/converting-between-strings-and-arraybuffers/9673053#9673053
		https://github.com/nodeca/pako
*/

(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.Caching', {
		getCache: function(){
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			var cacheUrl = me.getCacheUrlSetting();
			if (typeof key === 'undefined' || _.isEmpty(cacheUrl) ){
				return Promise.resolve(false);//cache miss		
			}
			var url = cacheUrl + key ;
			var deferred = Q.defer();
			
			$.ajax({
				url: url,
				method: 'GET',
				processData: false,
				dataType: 'text',
				success: function(requestData){ 
					try { 
						payload = JSON.parse(requestData);
						me.getCacheIntelRallyAppSettings(payload);
						Q(me.getCachePayloadFn(payload)).then(function(){ 
							deferred.resolve(true); 
						});
					}             
					catch(e){ 
						console.log('corrupt cache payload'); 
						deferred.resolve(false);
					}
				},
				error: function(reason){ 
					console.log('cache GET error', reason); 
					deferred.resolve(false); 
				}
			});
			
			return deferred.promise;
		},
		updateCache: function(){
			var me = this;
			var payload = {};
			var key = me.cacheKeyGenerator(); //generate key for the app
			var cacheUrl = me.getCacheUrlSetting();
			var timeoutDate = me.getCacheTimeoutDate();
			var url = cacheUrl + key;
			var deferred = Q.defer();
			
			if (typeof key === 'undefined' || _.isEmpty(cacheUrl) ){
				return Promise.reject('cannot PUT to cache, invalid key');	
			}
			
			if(timeoutDate){
				url += '?timeout=' + timeoutDate.toISOString();
			}
            
			me.setIntelRallyAppSettings(payload);
			me.setCachePayLoadFn(payload);		
			
			$.ajax({
				url: url,
				method: 'PUT',
				headers: {'Content-Type': 'text/plain'},
				data: JSON.stringify(payload),
				processData: false,
				success: function(){ deferred.resolve(); },
				error: function(reason){ deferred.reject(reason); }
			});

			return deferred.promise;
		},
		deleteCache: function(keyGenerator){
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			var cacheUrl = me.getCacheUrlSetting();
			if (typeof key === 'undefined' || _.isEmpty(cacheUrl)){
				return Promise.reject('cannot DELETE from cache, invalid key');	
			}			
			var deferred = Q.defer();
			var url = cacheUrl + key;
			
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