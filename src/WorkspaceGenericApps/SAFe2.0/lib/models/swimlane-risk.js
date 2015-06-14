(function(){
	var Ext = window.Ext4 || window.Ext;

	/************************* USED FOR SWIMLANES VIEW *********************************************/
	Ext.define('Intel.SAFe.lib.models.SwimlaneRisk', {
		extend: 'Rally.data.Model',							//rally cardboard is heavily tied to wsapi objects so we have to override a lot of stuff...
		fields: [
			{name: '_originalRiskData', type:'auto'},
			{name: 'RiskID', type:'string'},
			{name: 'Rank', type:'string'},										//only needed because of Rally
			{name: 'PortfolioItem #', type: 'string'},
			{name: 'PortfolioItem Name', type:'string'},
			{name: 'Project', type:'string'},
			{name: 'Description', type: 'string'},				//change from Description because Description is a wsapi field... and it causes an error			
			{name: 'Impact', type: 'string'},	
			{name: 'MitigationPlan', type: 'string'},
			{name: 'Urgency', type: 'string'}, //add attributeDefinition because rallycardboard looks for this
			{name: 'Status', type: 'string'},
			{name: 'Contact', type: 'string'},
			{name: 'Checkpoint', type: 'number'},
			{name: 'updatable', type: 'boolean', defaultValue:true}	//have to set updatable:true for each record or else they won't be draggable
		],
		idField: {name: 'RiskID'},							//so record.getId() works off of the RiskID field
		idProperty: 'RiskID',										//so sessionstorage proxy works off of the RiskID field
		isTask: function(){ return false; },		//rallycardboard calls this
		isSearch: function(){ return false;}		//rallypopoverfactory calls this for some reason
	});

}());