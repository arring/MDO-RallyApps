/**
	SUMMARY:
		performance optimized Ext.data.Store. Improvements found using Chrome Profiling.
		Improvements include removing redundant call to me.sync() which triggers another grid refresh
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
		
	Ext.define('Intel.lib.component.Store', {
		extend: 'Ext.data.Store',
		alias: ['store.intelstore'],
		
		afterEdit: function(record, modifiedFieldNames) {
			var me = this, i, shouldSync;
			if (me.autoSync && !me.autoSyncSuspended) {
				for (i = modifiedFieldNames.length; i--;) {
					if (record.fields.get(modifiedFieldNames[i]).persist) {
						me.sync();  //all rendering changes made here
						break;
					}
				}
			}
			me.onUpdate(record, Ext.data.Model.EDIT, modifiedFieldNames);
			//me.fireEvent('update', me, record, Ext.data.Model.EDIT, modifiedFieldNames); //redundant with me.sync()
		}
	});
}());