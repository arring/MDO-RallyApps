/** 
	SUMMARY:
	
	------------------------------------------------ RALLY APP REQUIREMENTS ---------------------------------------------------------------------
	app MUST impelement the following functions:
		
		- cacheKeyGenerator() -> string										(return the 'key' the cache mixin should store/load/delete the data under)
		- getCacheTimeoutDate() -> Date										(returns the date the cache should timeout from relative to NOW)
		- getCachePayloadFn(payload)											(JSON data that was returned from the cache is passed to this function after a cache-hit)
		- setCachePayLoadFn(payload)											(add fields to the json payload to be stored in the cache)
		- getCacheUrlSetting()														(add app setting for the cacheUrl)

	the app has the following cache functions added to it:
	
		- getCache() -> Promise(cacheHit)                 (cacheHit === true if successfully got cache from server)
		- updateCache() -> Promise()                      (returns when the cache has been successfully updated)
		- deleteCache() -> Promise()                      (returns when the cache has been successfully delete)
	
	------------------------------------------------ SERVER REQUIREMENTS ---------------------------------------------------------------------
	This mixin is used to enable caching for large apps that pull lots of data. This requires that you also
	set up a server to handle the key/value database. The server should support timeouts and it should 
	gzip the PUTted cache JSON payloads for faster transmission times for the cache hits (35 MB takes a while
	to send, gzip can take a 35 MB JSON down to 1 MB). Since the server should gzip, it should also set the 
	Content-Encoding = gzip when it returns cached data. Lastly, you should also have an updater script that
	runs periodically and updates the cache. This cache mixin and the updater script should agree to the following
	terms:
	
		the script loads the page with the following query parameter:
			rally/projectId/stuff/data-ingrity-oibjectid?cache-update-script=true

		the app adds an invisible div with id="cache-mixin-update-complete" 

		The script (phantomjs probably), should wait for the above <div> to be placed to know it is finished. There 
		should be a 5 minute timeout for errors on loading as well:
*/

(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.Caching', {
		getCache: function(){
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			var cacheUrl = me.getCacheUrlSetting();
			var isUpdateScript = me._isCacheUpdateScript();
			var url = cacheUrl + key ;
			var deferred = Q.defer();
			
			if (typeof key === 'undefined' || _.isEmpty(cacheUrl) || isUpdateScript){
				return Q.resolve(false); //pretend there was cache miss		
			}
			
			$.ajax({
				url: url,
				method: 'GET',
				processData: false,
				dataType: 'text',
				success: function(requestData){ 
					try { 
						payload = JSON.parse(requestData);
						me._getCacheIntelRallyAppSettings(payload);
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
			var isUpdateScript = me._isCacheUpdateScript();
			var url = cacheUrl + key;
			var deferred = Q.defer();
			
			if (typeof key === 'undefined' || _.isEmpty(cacheUrl) ){
				return Q.reject('cannot PUT to cache, invalid key');	
			}
			
			if(timeoutDate){
				url += '?timeout=' + timeoutDate.toISOString();
			}
            
			me._setIntelRallyAppSettings(payload);
			me.setCachePayLoadFn(payload);		
			$('#cache-mixin-update-complete', window.parent.document).remove();//remove and add each time
			$.ajax({
				url: url,
				method: 'PUT',
				headers: {'Content-Type': 'text/plain'},
				data: JSON.stringify(payload),
				processData: false,
				success: function(){
					if(isUpdateScript){
						$(window.parent.document.body).append('<div id="cache-mixin-update-complete"></div>'); //signal to update script that we are finished
					}
					deferred.resolve(); 
				},
				error: function(reason){ deferred.reject(reason); }
			});

			return deferred.promise;
		},
		deleteCache: function(keyGenerator){
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			var cacheUrl = me.getCacheUrlSetting();
			var deferred = Q.defer();
			var url = cacheUrl + key;
			
			if (typeof key === 'undefined' || _.isEmpty(cacheUrl)){
				return Q.reject('cannot DELETE from cache, invalid key');	
			}			
			
			$.ajax({
				url: url,
				type: 'DELETE',
				success: function(data) { deferred.resolve(data); },
				error: function(xhr, status, reason){ deferred.reject(reason); }
			});
			
			return deferred.promise;
		},
		_isCacheUpdateScript: function(){
			return decodeURI(window.parent.location.href).indexOf('cache-update-script=true') > -1;
		},
		_getCacheIntelRallyAppSettings: function(payload){
			var me = this;
			//intel-rally-app sets these (copy these for each app that uses the cache!)
			me.BaseUrl = Rally.environment.getServer().getBaseUrl();
			me.PortfolioItemTypes = payload.PortfolioItemTypes;
			me.userStoryFields.push(me.PortfolioItemTypes[0]);  //userStoryFields supposed to be lowercase, dont worry
			me.ScrumGroupConfig = payload.ScrumGroupConfig;
			me.HorizontalGroupingConfig = payload.HorizontalGroupingConfig;
			me.ScheduleStates = payload.ScheduleStates;
		},
		_setIntelRallyAppSettings: function(payload){
			var me = this;
			payload.PortfolioItemTypes = me.PortfolioItemTypes;
			payload.ScrumGroupConfig = me.ScrumGroupConfig;
			payload.HorizontalGroupingConfig = me.HorizontalGroupingConfig;
			payload.ScheduleStates = me.ScheduleStates;
		}
	});
}());		