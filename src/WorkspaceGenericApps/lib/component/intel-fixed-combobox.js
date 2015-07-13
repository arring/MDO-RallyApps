/** 
	SUMMARY:
		This combo has some built in defaults for static-comboboxes (which means you dont type into it, you just select from it)
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.FixedComboBox', {
		extend:'Ext.form.field.ComboBox',
		alias: ['widget.intelfixedcombo', 'widget.intelfixedcombobox'],
		
		editable: false,	
		allowBlank:true,
		queryMode:'local',
		matchFieldWidth: false,
		listeners: {
			change:function(combo, newval, oldval){ 
				if(newval.length===0) combo.setValue(oldval || ''); 
			},
			focus: function(combo) {
				if(combo.store.findExact(combo.valueField, combo.getValue()) === -1) combo.setValue('');
				combo.expand();
			}
		}
	});
}());