/** 
	SUMMARY:
		This component is an easy user search picker based off ComboBox. It searches all users in Rally as you type.
		
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.UserPicker', {
		extend:'Ext.form.field.ComboBox',
		alias: ['widget.inteluserpicker'],

		constructor: function(options) {
			options = options || {};
			options = Ext.merge({
				enableKeyEvents:true,
				queryMode: 'remote',
				store: Ext.create('Rally.data.wsapi.Store', {
					model: 'user',
					fetch: ['FirstName', 'LastName', 'UserName', 'EmailAddress', 'ObjectID'],
					limit: 20
				}),
				ignoreNoChange:true,
				allowBlank:true
			}, options);
			this.callParent([options]);
		}
	});
}());
