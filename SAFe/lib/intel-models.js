Ext.define('IntelVelocity', {
	extend: 'Ext.data.Model',
	fields: [
		{name: 'Name', type: 'string'},
		{name: 'PlannedVelocity', type: 'string'},
		{name: 'RealVelocity', type:'string'}
	]
});

Ext.define('IntelTeamCommits', {
	extend: 'Ext.data.Model',
	fields: [
		{name: 'Name', type: 'string'},
		{name: 'ObjectID', type: 'string'},
		{name: 'FormattedID', type:'string'},
		{name: 'Commitment', type: 'string'},
		{name: 'Objective', type:'string'},
		{name: 'Product', type:'string'},
		{name: 'PlannedEnd', type:'string'}
	]
});

Ext.define('IntelRisk', {
	extend: 'Ext.data.Model',
	fields: [
		{name: 'RiskID', type:'string'},
		{name: 'ObjectID', type:'number'},
		{name: 'FormattedID',  type: 'string'},
		{name: 'FeatureName', type:'string'},
		{name: 'Description', type: 'string'},
		{name: 'Impact', type: 'string'},			
		{name: 'Status', type: 'string'},
		{name: 'Contact', type: 'string'},
		{name: 'Checkpoint', type: 'string'},
		{name: 'Edited', type: 'boolean'}
	]
});

Ext.define('IntelDepTeam', {
	extend: 'Ext.data.Model',
	fields: [
		{name: 'TID',  type: 'string'},  //teamDep ID
		{name: 'PID',  type: 'string'},  //pred team id
		{name: 'Sup', type: 'string'}, 
		{name: 'USID', type: 'string'}, //pred formatted id
		{name: 'USName', type: 'string'},
		{name: 'A', type: 'boolean'} //yes/no
	]
});

Ext.define('IntelPredDep', { //predecessor dependencies
	extend: 'Ext.data.Model',
	fields: [
		{name: 'ObjectID', type: 'number'},
		{name: 'DependencyID', type:'string'},
		{name: 'FormattedID',  type: 'string'}, 
		{name: 'UserStoryName',  type: 'string'},
		{name: 'Description', type: 'string'},
		{name: 'Checkpoint', type: 'string'},
		{name: 'Status', type:'string'}, //only set by chief engineers. not viewable in this app
		{name: 'Predecessors', type: 'auto'}, //TID: Pred: ProjectID, supported, UserStoryID, Assigned
		{name: 'Edited', type: 'boolean'}
	]
});		
	
Ext.define('IntelSuccDep', { //predecessor dependency
	extend: 'Ext.data.Model',
	fields: [
		{name: 'ObjectID', type: 'number'},
		{name: 'DependencyID', type:'string'}, //same id as the pred id that references it
		{name: 'SuccUserStoryName', type: 'string' },
		{name: 'SuccFormattedID',  type: 'string'}, 
		{name: 'SuccProjectID', type: 'string'}, //of predecessor team
		{name: 'UserStoryName', type: 'string'}, //can be null!!!!!!!!!!!!
		{name: 'FormattedID',  type: 'string'},  //CAN BE NULL!!!!!!!!!!!!
		{name: 'ReleaseStartDate',  type: 'string'}, 
		{name: 'ReleaseDate',  type: 'string'}, 
		{name: 'Description', type: 'string'}, 
		{name: 'Checkpoint', type: 'string'},
		{name: 'Supported', type: 'string'}, //Yes, No
		{name: 'Assigned', type: 'boolean'}, //yes/no
		{name: 'Edited', type: 'boolean'}
	]
});	