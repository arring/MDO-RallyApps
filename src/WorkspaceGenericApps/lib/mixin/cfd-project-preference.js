/** 
	SUMMARY: 
		This mixin is used to save user preferences per project per release, that can follow the user from one cumulative flow chart app to app. So 
		when you call saveAppsPreference it saves it to a preference filtered by user and the value of me.cfdProjPref.
		
		Different apps can share the me.cfdProjPref which is useful if you have 5 apps that should all scope to the same
		Release. So if the user scopes to Release R1 on one of the apps, when she goes to any of the other apps, it should
		scope to Release R1 as well.
**/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.CfdProjectPreference', {
		
		/** preference name SHOULD be overridden, unless you want all apps to share default preference-name */
		cfdProjPref : 'intel-workspace-admin-cfd-releasedatechange',

		loadCfdProjPreference: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				project: me.getContext().getProject()._ref,
				filterByName: me.cfdProjPref,
				success: function(prefs) {
					var appPrefs = prefs[me.cfdProjPref];
					try{ appPrefs = JSON.parse(appPrefs); }
					catch(e){ appPrefs = { releases:{}, refresh:0};}
					deferred.resolve(appPrefs);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		saveCfdProjPreference: function(prefs){
			var me=this, s = {}, deferred = Q.defer();
			prefs = {releases:prefs.releases, refresh:prefs.refresh};
			s[me.cfdProjPref] = JSON.stringify(prefs); 
			Rally.data.PreferenceManager.update({
				project:me.getContext().getProject()._ref,
				filterByName: me.cfdProjPref,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}		
	});
}());