Ext.define('Intel.form.field.FixedComboBox', {
	extend:'Ext.form.field.ComboBox',
	alias: ['widget.intelfixedcombo', 'widget.intelfixedcombobox'],
	
	editable: false,	
	listeners: {
		focus: function(combo) {
			combo.setValue('');
			combo.expand();
		}
	}
});