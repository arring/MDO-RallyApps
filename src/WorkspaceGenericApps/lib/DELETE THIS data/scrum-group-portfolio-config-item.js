(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.data.ScrumGroupPortfolioConfigItem', {
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