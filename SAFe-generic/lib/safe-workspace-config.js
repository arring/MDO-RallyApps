(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('SAFeWorkspaceConfig', {
		
		_SAFeWorkspaceConfigPrefName: 'intel-SAFe-workspace-config', 
		
		_loadSAFeWorkspaceConfig: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace(),
				filterByName: me._SAFeWorkspaceConfigPrefName,
				success: function(prefs) {
					var workspaceConfigString = prefs[me._SAFeWorkspaceConfigPrefName], workspaceConfig;
					try{ workspaceConfig = JSON.parse(workspaceConfigString); }
					catch(e){ workspaceConfig = []; }
					deferred.resolve(workspaceConfig);
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_saveSAFeWorkspaceConfig: function(workspaceConfig){
			var me=this, s = {}, deferred = Q.defer();
			s[me._SAFeWorkspaceConfigPrefName] = JSON.stringify(workspaceConfig); 
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