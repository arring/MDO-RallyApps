/** 
	SUMMARY: 
		This mixin is used to save user preferences per project per release, that can follow the user from one cumulative flow chart app to app. So 
		when you call saveAppsPreference it saves it to a preference filtered by user and the value of me.cfdAppsPref.
		
		Different apps can share the me.cfdAppsPref which is useful if you have 5 apps that should all scope to the same
		Release. So if the user scopes to Release R1 on one of the apps, when she goes to any of the other apps, it should
		scope to Release R1 as well.
**/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.CfdAppsPreference', {
		
		/** preference name SHOULD be overridden, unless you want all apps to share default preference-name */
		cfdAppsPref : 'intel-cfd-releaseDateChange',

		loadCfdAppsPreference: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				filterByUser:true,
				filterByName: me.cfdAppsPref,
				success: function(prefs) {
					var appPrefs = prefs[me.cfdAppsPref];
					try{ appPrefs = JSON.parse(appPrefs); }
					catch(e){ appPrefs = { projs:{}, refresh:0};}
					deferred.resolve(appPrefs);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		saveCfdAppsPreference: function(prefs){
			var me=this, s = {}, deferred = Q.defer();
			prefs = {projs:prefs.projs, refresh:prefs.refresh};
			s[me.cfdAppsPref] = JSON.stringify(prefs); 
			Rally.data.PreferenceManager.update({
				filterByUser: true,
				filterByName: me.cfdAppsPref,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());