(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('UserAppPreferences', {
		
		_prefName: 'intel-user-app-preferences', //this preference can be overridden, unless you want all apps to share prefs
		
		_loadPreferences: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				filterByUser:true,
				filterByName:me._prefName,
				success: function(prefs) {
					var appPrefs = prefs[me._prefName];
					try{ appPrefs = JSON.parse(appPrefs); }
					catch(e){ appPrefs = { projs:{}, refresh:30};}
					console.log('loaded prefs', appPrefs);
					deferred.resolve(appPrefs);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_savePreferences: function(prefs){
			var me=this, s = {}, deferred = Q.defer();
			prefs = {projs:prefs.projs, refresh:prefs.refresh};
			s[me._prefName] = JSON.stringify(prefs); 
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