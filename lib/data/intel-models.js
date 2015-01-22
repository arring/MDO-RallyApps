(function(){
	var Ext = window.Ext4 || window.Ext;
	
		/************************* MODEL FOR WORKWEEK DROPDOWNS *********************************************/
	Ext.define('WorkweekDropdown', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'Workweek', type:'string'},
			{name: 'DateVal', type:'number'}
		]
	});
}());