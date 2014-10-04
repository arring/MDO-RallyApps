Ext.define('Intel.data.proxy.SessionStorage', {
	extend: 'Ext.data.proxy.SessionStorage',
	alias: 'proxy.fastsessionproxy',

	constructor: function(cfg) {
		var me = this;
		me.callParent(arguments);
	},
	
	update: function(operation, callback, scope) {
		var records = operation.records,
			length = records.length,
			ids = this.getIds(),
			record, id, i;
			
		operation.setStarted();
		for (i = 0; i < length; i++) {
			record = records[i];
			this.setRecord(record);
		
			record.commit(true); //SILENT, dataview refresh will get called anyways!!!!!!!!!!!

			//we need to update the set of ids here because it's possible that a non-phantom record was added
			//to this proxy - in which case the record's id would never have been added via the normal 'create' call
			id = record.getId();
			if (id !== undefined && Ext.Array.indexOf(ids, id) == -1) ids.push(id);
		}
		this.setIds(ids);

		operation.setCompleted();
		operation.setSuccessful();
		if (typeof callback == 'function') callback.call(scope || this, operation);
	}
});