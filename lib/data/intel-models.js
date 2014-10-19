/************************* MODEL FOR WORKWEEK DROPDOWNS *********************************************/
Ext.define('WorkweekDropdown', {
	extend: 'Ext.data.Model',
	fields: [
		{name: 'Workweek', type:'string'},
		{name: 'DateVal', type:'number'}
	]
});