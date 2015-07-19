/** 
	SUMMARY:
		This mixin is used to communicate between apps the location of the data-integrity dashboard by
		saving it in a preference tied to the workspace. This allows apps to dynamically link to the DI
		dashboard without having to hardcode the URL into it. The ObjectID that is saved is the ObjectID
		of the Custom App. 
		
	DEPENDENCIES:
		Q promise library
**/
(function(){
	var Ext = window.Ext4 || window.Ext,
		dataIntegrityObjectIdPref = 'intel-data-integrity-dashboard-objectid-preference';

	Ext.define('Intel.lib.mixin.DataIntegrityDashboardObjectIDPreference', {
		getDataIntegrityDashboardObjectID: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: dataIntegrityObjectIdPref,
				success: function(prefs){
					var objectID = prefs[dataIntegrityObjectIdPref]*1;
					deferred.resolve(objectID);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		setDataIntegrityDashboardObjectID: function(){
			var me=this, s = {}, deferred = Q.defer(),
				objectID = window.parent.location.hash.split("/").pop();
			s[dataIntegrityObjectIdPref] = objectID; 
			Rally.data.PreferenceManager.update({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: dataIntegrityObjectIdPref,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());