/** This class is used to communicate between apps the location of the data-integrity dashboard **/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('DataIntegrityDashboardObjectIDPreference', {
		
		_dataIntegrityObjectIdPref: 'intel-data-integrity-dashboard-objectid',
		
		_loadDataIntegrityDashboardObjectID: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName:me._dataIntegrityObjectIdPref,
				success: function(prefs){
					var objectID = prefs[me._dataIntegrityObjectIdPref]*1;
					deferred.resolve(objectID);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_setDataIntegrityDashboardObjectID: function(){
			var me=this, s = {}, deferred = Q.defer(),
				objectID = window.parent.location.hash.split("/").pop();
			s[me._dataIntegrityObjectIdPref] = objectID; 
			Rally.data.PreferenceManager.update({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName:me._dataIntegrityObjectIdPref,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());