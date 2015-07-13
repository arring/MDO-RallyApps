(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.data.WorkweekDropdown', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'Workweek', type:'string'},
			{name: 'DateVal', type:'number'}
		]
	});
}());