(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('TrainPreferenceConfig', {
		
		_TrainConfigPrefName: 'intel-train-config', 
		
		_loadTrainConfig: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace(),
				filterByName: me._TrainConfigPrefName,
				success: function(prefs) {
					var workspaceConfigString = prefs[me._TrainConfigPrefName], trainConfig;
					try{ trainConfig = JSON.parse(workspaceConfigString); }
					catch(e){ trainConfig = []; }
					deferred.resolve(trainConfig);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_saveTrainConfig: function(trainConfig){
			var me=this, s = {}, deferred = Q.defer();
			s[me._TrainConfigPrefName] = JSON.stringify(trainConfig); 
			Rally.data.PreferenceManager.update({
				workspace: me.getContext().getWorkspace(),
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		}
	});
}());