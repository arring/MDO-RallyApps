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
		
	/************************* USED FOR WORKSPACE TRAIN CONFIG *********************************************/
	Ext.define('ScrumGroupPortfolioConfigItem', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'ScrumGroupRootProjectOID', type: 'number'},
			{name: 'ScrumGroupName', type: 'string'},
			{name: 'ScrumGroupAndPortfolioLocationTheSame', type:'boolean'},
			{name: 'PortfolioProjectOID', type:'number'},
			{name: 'IsTrain', type:'boolean'}
		]
	});
}());