//TODO: move these models into their own files and name them appropriately (e.g.: Intel.SAFe.lib.model.<model name>)

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
			{name: 'PortfolioItemMoSCoW', type:'string'},
			{name: 'PortfolioItemName', type: 'string'},
			{name: 'PortfolioItemFormattedID', type:'string'},
			{name: 'PortfolioItemPlannedEnd', type:'number'},
			{name: 'TopPortfolioItemName', type:'string'},
			{name: 'Commitment', type: 'string'},
			{name: 'Expected', type: 'boolean'},
			{name: 'FeatureStatus', type: 'boolean'},
			{name: 'Objective', type:'string'}
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
			{name: 'Plan', type:'string'},
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

	/************************* USED FOR RISKS/DEPS AND SWIMLANE(RISKS ONLY) VIEW *********************************************/
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
			{name: 'Plan', type:'string'},
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
			{name: 'MoSCoW', type: 'string'},
			{name: 'Rank', type: 'string'}
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