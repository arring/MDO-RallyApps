(function(){
	var Ext = window.Ext4 || window.Ext;
		
	/**
		Cell editing has redundant calls to store.afterEdit, which in turn renders the page multiple times per edit. 
		fastcellediting solves this by wrapping all the calls in beginEdit and endEdit, so store.afterEdit is called only once
	*/
	Ext.define('Intel.grid.plugin.CellEditing', {
		alias: 'plugin.fastcellediting',
		extend: 'Ext.grid.plugin.CellEditing',

		triggerEvent:'cellclick',
		
		onEditComplete : function(ed, value, startValue) {
			var me = this,
				activeColumn = me.getActiveColumn(),
				context = me.context,
				record;
			if (activeColumn) {
				record = context.record;

				me.setActiveEditor(null);
				me.setActiveColumn(null);
				me.setActiveRecord(null);

				context.value = value;
				if (!me.validateEdit()) {
						me.editing = false;
						return;
				}
				record.beginEdit(); //only call store.AfterEdit at the very End 
				if (!record.isEqual(value, startValue)) 
						record.set(activeColumn.dataIndex, value); //dont call store.AfterEdit

				context.view.focusRow(context.rowIdx, 100);
				me.fireEvent('edit', me, context); //dont call store.AfterEdit if record.set() is called in here
				record.endEdit(); //now call store.AfterEdit!
				me.editing = false;
			}
		}
	});
}());