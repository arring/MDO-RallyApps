Ext.define('Intel.data.FastStore', {  //doesn't redundantly call fireEvent... me.sync() calls that downstream 
	extend: 'Ext.data.Store',
	alias: 'store.faststore',

	constructor: function(cfg) {
		var me = this;
		me.callParent(arguments);
	},
	
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