/** 
	SUMMARY:
		This mixin is used to communicate between apps the objectID of eachother, so they can link to eachother
		by saving their ObjectIDs in a preference tied to the workspace. 
		
		To get the ObjectID of an app in teh workspace, you need to pass the ClassName of the app,
		which is the string that you pass you Ext.define(<className>, {appConfigObject})
	
	DEPENDENCIES:
		Q promise library
**/
(function(){
	var Ext = window.Ext4 || window.Ext,
		customAppRegisterObjectIdPref = 'intel-custom-app-objectid-register-preference';

	Ext.define('Intel.lib.mixin.CustomAppObjectIDRegister', {
		_loadCustomAppObjectIDSettings: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: customAppRegisterObjectIdPref,
				success: function(prefs){
					var map;
					try{ map = JSON.parse(prefs[customAppRegisterObjectIdPref]); }
					catch(e){ map = {}; }
					deferred.resolve(map);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		getCustomAppObjectID: function(appClassName){
			var me=this;
			return me._loadCustomAppObjectIDSettings().then(function(customAppOIDSettings){
				return customAppOIDSettings[appClassName] || null;
			});
		},
		setCustomAppObjectID: function(appClassName){
			var me=this, s = {},
				//addding updater script in the url
				objectID = window.parent.location.hash.split("?")[0].split("/").pop();
			if(!appClassName) return Q.reject('invalid appClassName');
			return me._loadCustomAppObjectIDSettings().then(function(customAppOIDSettings){
				var deferred = Q.defer();
				customAppOIDSettings[appClassName] = objectID;
				s[customAppRegisterObjectIdPref] = JSON.stringify(customAppOIDSettings, null, '  ');
				Rally.data.PreferenceManager.update({
					workspace: me.getContext().getWorkspace()._ref,
					filterByName: customAppRegisterObjectIdPref,
					settings: s,
					success: deferred.resolve,
					failure: deferred.reject
				});
				return deferred.promise;
			});
		}
	});
}());