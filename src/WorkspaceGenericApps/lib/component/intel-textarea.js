/**
	SUMMARY:
		Textarea with some defaults built into it.
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.Textarea', {
		extend: 'Ext.form.field.TextArea',
		alias: ['widget.inteltextarea'],
		
		grow:true,
		growMin:20,
		growMax:160,
		maxLength:150,
		enforceMaxLength:true,
		enterIsSpecial:true
	});
}());