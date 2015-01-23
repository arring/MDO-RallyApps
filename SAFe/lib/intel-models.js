(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/************************* USED FOR PROGRAMBOARD VIEW *********************************************/

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
			{name: 'Rank', type: 'number'},
			{name: 'Name', type: 'string'},
			{name: 'ObjectID', type: 'string'},
			{name: 'FormattedID', type:'string'},
			{name: 'Commitment', type: 'string'},
			{name: 'Expected', type: 'boolean'},
			{name: 'Objective', type:'string'},
			{name: 'Product', type:'string'},
			{name: 'PlannedEnd', type:'number'}
		]
	});

	Ext.define('IntelRisk', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'RiskID', type:'string'},
			{name: 'ObjectID', type:'number'}, //what feature OID the risk is saved to in Rally (not necessarily the FormattedID/FeatureName)
			{name: 'FormattedID',  type: 'string'},
			{name: 'FeatureName', type:'string'},
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

	Ext.define('IntelDepTeam', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'TID',  type: 'string'},  //teamDep ID
			{name: 'PID',  type: 'string'},  //pred team id
			{name: 'Sup', type: 'string'},  //Yes, No, Undefined
			{name: 'USID', type: 'string'}, //pred formatted id
			{name: 'USName', type: 'string'},
			{name: 'A', type: 'boolean'} //yes/no
		]
	});

	Ext.define('IntelPredDep', { //predecessor dependencies
		extend: 'Ext.data.Model',
		fields: [
			{name: 'ObjectID', type: 'number'},//what US OID the risk is saved to in Rally (not necessarily the FormattedID/UserStoryName)
			{name: 'DependencyID', type:'string'},
			{name: 'FormattedID',  type: 'string'}, 
			{name: 'UserStoryName',  type: 'string'},
			{name: 'Description', type: 'string'},
			{name: 'Checkpoint', type: 'number'},
			{name: 'Status', type:'string'}, //only set by chief engineers. not viewable in this app
			{name: 'Predecessors', type: 'auto'}, //TID: Pred: ProjectID, supported, UserStoryID, Assigned
			{name: 'Edited', type: 'boolean'}
		]
	});		
		
	Ext.define('IntelSuccDep', { //predecessor dependency
		extend: 'Ext.data.Model',
		fields: [
			{name: 'ObjectID', type: 'number'},//what US OID the risk is saved to in Rally (not necessarily the FormattedID/UserStoryName)
			{name: 'DependencyID', type:'string'}, //same id as the pred id that references it
			{name: 'SuccUserStoryName', type: 'string' },
			{name: 'SuccFormattedID',  type: 'string'}, 
			{name: 'SuccProjectID', type: 'string'}, //of predecessor team
			{name: 'UserStoryName', type: 'string'}, //can be null!!!!!!!!!!!!
			{name: 'FormattedID',  type: 'string'},  //CAN BE NULL!!!!!!!!!!!!
			{name: 'ReleaseStartDate',  type: 'number'}, 
			{name: 'ReleaseDate',  type: 'number'}, 
			{name: 'Description', type: 'string'}, 
			{name: 'Checkpoint', type: 'number'},
			{name: 'Supported', type: 'string'}, //Yes, No, Undefined
			{name: 'Assigned', type: 'boolean'}, //yes/no
			{name: 'Edited', type: 'boolean'}
		]
	});	

	/************************* USED FOR RISKS/DEPS VIEW *********************************************/

	Ext.define('IntelRiskWithProject', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'RiskID', type:'string'},
			{name: 'ProjectName', type:'string'},
			{name: 'ProjectID', type:'number'},
			{name: 'Product', type:'string'},
			{name: 'ObjectID', type:'number'},
			{name: 'FormattedID',  type: 'string'},
			{name: 'FeatureName', type:'string'},
			{name: 'Description', type: 'string'},
			{name: 'Impact', type: 'string'},			
			{name: 'Status', type: 'string'},
			{name: 'MitigationPlan', type: 'string'},					
			{name: 'Urgency', type: 'string'},
			{name: 'Contact', type: 'string'},
			{name: 'Checkpoint', type: 'number'},
			{name: 'Edited', type: 'boolean'}
		]
	});

	Ext.define('IntelPredDepWithProject', { //predecessor dependencies
		extend: 'Ext.data.Model',
		fields: [
			{name: 'DependencyID', type:'string'},
			{name: 'ProjectName', type:'string'},
			{name: 'ProjectID', type:'number'},
			{name: 'Product', type:'string'},
			{name: 'ObjectID', type: 'number'},
			{name: 'FormattedID',  type: 'string'}, 
			{name: 'UserStoryName',  type: 'string'},
			{name: 'Description', type: 'string'},
			{name: 'Checkpoint', type: 'number'},
			{name: 'Status', type:'string'}, 
			{name: 'Predecessors', type: 'auto'}, //TID: Pred: ProjectID, supported, UserStoryID, Assigned
			{name: 'Edited', type: 'boolean'}
		]
	});		


	/************************* USED FOR TEAMCOMMITS VIEW *********************************************/
	Ext.define('CommitsMatrixFeature', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'Rank', type:'number'},
			{name: 'FormattedID', type:'string'},
			{name: 'ObjectID', type:'number'},
			{name: 'FeatureName',  type: 'string'},
			{name: 'ProductName', type:'string'},
			{name: 'PlannedEndDate', type:'number'}
		]
	});

	/************************* USED FOR CUSTOMFIELD EDITOR *********************************************/
	Ext.define('CFEditorModel', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'FormattedID', type:'string'},
			{name: 'Name', type:'string'},
			{name: 'Release', type:'string'},
			{name: 'CustomFieldValue',  type: 'string'}
		]
	});
}());