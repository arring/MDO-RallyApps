/** This class is used to communicate between apps the location of the sanity dashboard **/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('SanityDashboardObjectIDPreference', {
		
		_sanityObjectIdPref: 'intel-sanity-objectid',
		
		_loadSanityDashboardObjectID: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				filterByUser:true,
				filterByName:me._sanityObjectIdPref,
				success: function(prefs){
					var objectID = prefs[me._sanityObjectIdPref]*1;
					deferred.resolve(objectID);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_setSanityDashboardObjectID: function(){
			var me=this, s = {}, deferred = Q.defer(),
				objectID = window.parent.location.href.split("/").pop();
			s[me._sanityObjectIdPref] = objectID; 
			Rally.data.PreferenceManager.update({
				filterByUser: true,
				filterByName:me._sanityObjectIdPref,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());