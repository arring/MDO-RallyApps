/** This class is used to save user preferences per project, that can follow the user from app to app **/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('UserAppsPreference', {
		
		_userAppsPref: 'intel-user-apps-preference', //this preference can be overridden, unless you want all apps to share prefs
		
		_loadAppsPreference: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				filterByUser:true,
				filterByName:me._userAppsPref,
				success: function(prefs) {
					var appPrefs = prefs[me._userAppsPref];
					try{ appPrefs = JSON.parse(appPrefs); }
					catch(e){ appPrefs = { projs:{}, refresh:30};}
					console.log('loaded prefs', appPrefs);
					deferred.resolve(appPrefs);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_saveAppsPreference: function(prefs){
			var me=this, s = {}, deferred = Q.defer();
			prefs = {projs:prefs.projs, refresh:prefs.refresh};
			s[me._userAppsPref] = JSON.stringify(prefs); 
			console.log('saving prefs', prefs);
			Rally.data.PreferenceManager.update({
				filterByUser: true,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());