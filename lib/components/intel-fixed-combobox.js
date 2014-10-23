Ext.define('Intel.form.field.FixedComboBox', {
	extend:'Ext.form.field.ComboBox',
	alias: ['widget.intelfixedcombo', 'widget.intelfixedcombobox'],
	
	constructor: function(options) {
		options = options || {};
		options = Ext.merge({
			editable: false,	
			allowBlank:false,
			listeners: {
				focus: function(combo) {
					combo.setValue('');
					combo.expand();
				}
			}
		}, options);
		this.callParent([options]);
	}	
});