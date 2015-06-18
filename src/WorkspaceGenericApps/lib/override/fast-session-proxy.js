/**
	SUMMARY:
		This override improves performance for sessionStorage proxy mostly by removing redundant page refreshes.
		
		The regular proxy calls record.commit() and later on, datarefresh event is called. since these both cause a rerender, 
		we make the record edits SILENT, so only the datarefresh actually re-render the page
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.override.SessionStorage', {
		extend: 'Ext.data.proxy.SessionStorage',
		constructor: function(cfg) {
			this.callParent(arguments);
		},
		
		create: function(operation, callback, scope) {
			var me = this,
				records = operation.records,
				length = records.length,
				ids = me.getIds(),
				id, record, i;

			operation.setStarted();
			if(me.isHierarchical === undefined) {
					
					
				me.isHierarchical = !!records[0].isNode;
				if(me.isHierarchical) {
					me.getStorageObject().setItem(me.getTreeKey(), true);
				}
			}
			for (i = 0; i < length; i++) {
				record = records[i];

				if (record.phantom) {
					record.phantom = false;
					id = me.getNextId();
				} else {
					id = record.getId();
				}
				
				record.beginEdit();
				me.setRecord(record, id);
				record.endEdit(true); //SILENT!!!
				record.commit(true); //SILENT, dataview refresh will get called anyways!!!!!!!!!!!
				
				ids.push(id);
			}
			me.setIds(ids);

			operation.setCompleted();
			operation.setSuccessful();

			if (typeof callback == 'function') {
				callback.call(scope || me, operation);
			}
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

				id = record.getId();
				if (id !== undefined && Ext.Array.indexOf(ids, id) == -1) ids.push(id);
			}
			this.setIds(ids);

			operation.setCompleted();
			operation.setSuccessful();
			if (typeof callback == 'function') callback.call(scope || this, operation);
		}
	});
}());