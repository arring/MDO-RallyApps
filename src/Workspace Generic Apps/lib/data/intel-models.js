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
	Ext.define('TrainConfigItem', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'TrainProjectOID', type: 'number'},
			{name: 'TrainName', type: 'string'},
			{name: 'TrainAndPortfolioLocationTheSame', type:'boolean'},
			{name: 'PortfolioProjectOID', type:'number'}
		]
	});
}());