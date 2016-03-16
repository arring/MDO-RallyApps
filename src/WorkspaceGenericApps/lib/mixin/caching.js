/** 
	SUMMARY:
	THis file will allows any app with caching enable to get cache 
	it expects the app using it sets up a key generators
	the app should have a function call cacheKeyGenerator
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
					me.populateAppSetting(payload);
					me.populatePayloadFn.call(me, payload);
					deferred.resolve(true);
				},
				error: function(xhr, status, reason){ 
					if(xhr.status === 404) deferred.resolve(false);
					else deferred.reject(reason);
				}
			});
			return deferred.promise;
		},
		updateCache: function(payload){
			var me = this;
			var key = me.cacheKeyGenerator(); //generate key for the app
			if (typeof key === 'undefined' ){
				return Promise.resolve(false);//cache miss		
			}
			var timeout = new Date(new Date()*1 + 1000*60*60*24).toISOString();
			var url = me.cacheUrl + key ;
			me.updateAppSetting(payload);

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
			if (typeof key === 'undefined' ){
				return Promise.resolve(false);//cache miss		
			}			
			var deferred = Q.defer(),
				url = me.cacheUrl + key ;
			$.ajax({
				url: url,
				type: 'DELETE',
				success: function(data) { deferred.resolve(data); },
				error: function(xhr, status, reason){ deferred.reject(reason); }
			});
			return deferred.promise;
		},
 		populateAppSetting: function(payload){
			var me = this;
			//intel-rally-app sets these (copy these for each app that uses the cache!)
			me.BaseUrl = Rally.environment.getServer().getBaseUrl();
			me.PortfolioItemTypes = payload.PortfolioItemTypes;
			me.userStoryFields.push(me.PortfolioItemTypes[0]);  //userStoryFields supposed to be lowercase, dont worry
			me.ScrumGroupConfig = payload.ScrumGroupConfig;
			me.HorizontalGroupingConfig = payload.HorizontalGroupingConfig;
			me.ScheduleStates = payload.ScheduleStates;
		},
		updateAppSetting: function(payload){
			var me = this;
			payload.PortfolioItemTypes = me.PortfolioItemTypes;
			payload.ScrumGroupConfig = me.ScrumGroupConfig;
			payload.HorizontalGroupingConfig = me.HorizontalGroupingConfig;
			payload.ScheduleStates = me.ScheduleStates;
		}
	});
}());		