/** 
	SUMMARY: 
		This mixin is used to save user preferences per project, that can follow the user from app to app. So 
		when you call saveAppsPreference it saves it to a preference filtered by user and the value of me.userAppsPref.
		
		Different apps can share the me.userAppsPref which is useful if you have 5 apps that should all scope to the same
		Release. So if the user scopes to Release R1 on one of the apps, when she goes to any of the other apps, it should
		scope to Release R1 as well.
**/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.UserAppsPreference', {
		
		 /** preference name SHOULD be overridden, unless you want all apps to share default preference-name */
		userAppsPref: 'intel-user-apps-preference',
		
		loadAppsPreference: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				filterByUser:true,
				filterByName: me._userAppsPref,
				success: function(prefs) {
					var appPrefs = prefs[me._userAppsPref];
					try{ appPrefs = JSON.parse(appPrefs); }
					catch(e){ appPrefs = { projs:{}, refresh:0};}
					deferred.resolve(appPrefs);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		saveAppsPreference: function(prefs){
			var me=this, s = {}, deferred = Q.defer();
			prefs = {projs:prefs.projs, refresh:prefs.refresh};
			s[me._userAppsPref] = JSON.stringify(prefs); 
			Rally.data.PreferenceManager.update({
				filterByUser: true,
				filterByName: me._userAppsPref,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());