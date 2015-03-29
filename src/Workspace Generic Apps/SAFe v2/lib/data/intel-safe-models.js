(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/************************* USED FOR PROGRAM-BOARD VIEW *********************************************/
	Ext.define('IntelVelocity', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'Name', type: 'string'},
			{name: 'PlannedVelocity', type: 'number'},
			{name: 'RealVelocity', type:'number'}
		]
	});
	Ext.define('IntelTeamCommits', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'PortfolioItemObjectID', type: 'number'},
			{name: 'PortfolioItemRank', type: 'number'},
			{name: 'PortfolioItemName', type: 'string'},
			{name: 'PortfolioItemFormattedID', type:'string'},
			{name: 'PortfolioItemPlannedEnd', type:'number'},
			{name: 'TopPortfolioItemName', type:'string'},
			{name: 'Commitment', type: 'string'},
			{name: 'Expected', type: 'boolean'},
			{name: 'Objective', type:'string'}
		]
	});
	Ext.define('IntelRisk', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'RiskID', type:'string'},
			{name: 'PortfolioItemObjectID', type:'number'},
			{name: 'PortfolioItemFormattedID',  type: 'string'}, //can be different than PortfolioItemObjectID
			{name: 'PortfolioItemName', type:'string'}, //can be different than PortfolioItemObjectID
			{name: 'Description', type: 'string'}, 
			{name: 'Impact', type: 'string'},	
			{name: 'MitigationPlan', type: 'string'},					
			{name: 'Urgency', type: 'string'},
			{name: 'Status', type: 'string'},
			{name: 'Contact', type: 'string'},
			{name: 'Checkpoint', type: 'number'},
			{name: 'Edited', type: 'boolean'}
		]
	});

	Ext.define('IntelPredecessorItem', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'PredecessorItemID',  type: 'string'}, 
			{name: 'PredecessorUserStoryObjectID', type: 'number'},
			{name: 'PredecessorProjectObjectID',  type: 'number'},
			{name: 'Supported', type: 'string'},
			{name: 'Assigned', type: 'boolean'} 
		]
	});

	Ext.define('IntelPredecessorDependency', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'DependencyID', type:'string'},
			{name: 'UserStoryObjectID', type: 'number'},
			{name: 'UserStoryFormattedID',  type: 'string'}, //can be different than UserStoryObjectID
			{name: 'UserStoryName',  type: 'string'}, //can be different than UserStoryObjectID
			{name: 'Description', type: 'string'},
			{name: 'NeededBy', type: 'number'},
			{name: 'Status', type:'string'},
			{name: 'PredecessorItems', type: 'auto'}, 
			{name: 'Edited', type: 'boolean'}
		]
	});		
		
	Ext.define('IntelSuccessorDependency', { 
		extend: 'Ext.data.Model',
		fields: [
			{name: 'DependencyID', type:'string'},
			{name: 'SuccessorUserStoryObjectID', type: 'string' },
			{name: 'SuccessorProjectObjectID', type: 'string'},
			{name: 'UserStoryObjectID', type: 'number'},
			{name: 'UserStoryFormattedID',  type: 'string'}, //can be different than UserStoryObjectID (or null)
			{name: 'UserStoryName', type: 'string'}, //can be different than UserStoryObjectID (or null)
			{name: 'Description', type: 'string'}, 
			{name: 'NeededBy', type: 'number'},
			{name: 'Supported', type: 'string'}, 
			{name: 'Assigned', type: 'boolean'},
			{name: 'Edited', type: 'boolean'}
		]
	});	

	/************************* USED FOR RISKS/DEPS VIEW *********************************************/

	Ext.define('IntelRiskForTracking', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'RiskID', type:'string'},
			{name: 'PortfolioItemObjectID', type:'number'},
			{name: 'PortfolioItemFormattedID',  type: 'string'},
			{name: 'PortfolioItemName', type:'string'},
			{name: 'TopPortfolioItemName', type:'string'},
			{name: 'ProjectObjectID', type:'number'},
			{name: 'Description', type: 'string'},
			{name: 'Impact', type: 'string'},	
			{name: 'MitigationPlan', type: 'string'},					
			{name: 'Urgency', type: 'string'},
			{name: 'Status', type: 'string'},
			{name: 'Contact', type: 'string'},
			{name: 'Checkpoint', type: 'number'},
			{name: 'Edited', type: 'boolean'}
		]
	});

	Ext.define('IntelPredecessorDependencyForTracking', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'DependencyID', type:'string'},
			{name: 'UserStoryObjectID', type: 'number'},
			{name: 'UserStoryFormattedID',  type: 'string'}, 
			{name: 'UserStoryName',  type: 'string'},
			{name: 'TopPortfolioItemName', type:'string'},
			{name: 'ProjectObjectID', type:'number'},
			{name: 'Description', type: 'string'},
			{name: 'NeededBy', type: 'number'},
			{name: 'Status', type:'string'},
			{name: 'PredecessorItems', type: 'auto'}, 
			{name: 'Edited', type: 'boolean'}
		]
	});		


	/************************* USED FOR TEAMCOMMITS VIEW *********************************************/
	Ext.define('CommitsMatrixPortfolioItem', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'PortfolioItemObjectID', type: 'number'},
			{name: 'PortfolioItemRank', type: 'number'},
			{name: 'PortfolioItemName', type: 'string'},
			{name: 'PortfolioItemFormattedID', type:'string'},
			{name: 'PortfolioItemPlannedEnd', type:'number'},
			{name: 'TopPortfolioItemName', type:'string'},
			{name: 'MoSCoW', type: 'string'}
		]
	});

	/************************* USED FOR CUSTOM-FIELD EDITOR *********************************************/
	Ext.define('SAFeCustomFieldsEditorModel', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'ItemFormattedID', type:'string'},
			{name: 'ItemName', type:'string'},
			{name: 'ProjectName', type:'string'},
			{name: 'ReleaseName', type:'string'},
			{name: 'CustomFieldValue',  type: 'string'}
		]
	});
}());