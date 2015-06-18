/** 
	SUMMARY:
		This combo has some built in defaults for static-comboboxes (which means you dont type into it, you just select from it)
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.FixedComboBox', {
		extend:'Ext.form.field.ComboBox',
		alias: ['widget.intelfixedcombo', 'widget.intelfixedcombobox'],
		
		constructor: function(options) {
			options = options || {};
			options = Ext.merge({
				editable: false,	
				allowBlank:true,
				queryMode:'local',
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					focus: function(combo) {
						combo.setValue('');
						combo.expand();
					}
				}
			}, options);
			this.callParent([options]);
		}	
	});
}());