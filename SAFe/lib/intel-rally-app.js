Ext.define('IntelRallyApp', {
	alias: 'widget.intelrallyapp',
  extend: 'Rally.app.App',
	
	/** these are the necessary models to load for the apps. you should call this */
	_loadModels: function(){
		var me=this, 
			promises = [],
			models = {
				Project: 'Project',
				UserStory: 'HierarchicalRequirement',
				Feature:'PortfolioItem/Feature',
				Milestone:'PortfolioItem/Milestone'
			};
		_.each(models, function(modelType, modelName){
			var deferred = Q.defer();
			Rally.data.WsapiModelFactory.getModel({ //load project
				type:modelType, 
				success: function(loadedModel){ 
					me[modelName] = loadedModel;
					deferred.resolve();
				}
			});
			promises.push(deferred.promise);
		});
		return Q.all(promises);
	},
	
	_loadProject: function(oid){ 
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.Project){ 
			return me._loadModels().then(function(){ 
				return me._loadProject(oid); 
			});
		}
		else {
			me.Project.load(oid, {
				fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},
	
	_loadFeature: function(oid, projectRef){ //projectRef is optional
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.Feature){ 
			return me._loadModels().then(function(){ 
				return me._loadFeature(oid, projectRef); 
			});
		}
		else {
			me.Feature.load(oid, {
				fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: projectRef
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},
	
	_loadUserStory: function(oid, projectRef){ 
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.UserStory){ 
			return me._loadModels().then(function(){ 
				return me._loadUserStory(oid, projectRef); 
			});
		}
		else {
			me.UserStory.load(oid, {
				fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
					'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: projectRef
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},
	
	_loadMilestone: function(oid, projectRef){ 
		var me = this, deferred = Q.defer();
		if(!oid) return Q.resolve();
		else if(!me.Milestone){ 
			return me._loadModels().then(function(){ 
				return me._loadMilestone(oid); 
			});
		}
		else {
			me.Milestone.load(oid, {
				fetch: ['ObjectID', 'Parent', 'Name'],
				context: {
					workspace: me.getContext().getWorkspace()._ref,
					project: projectRef
				},
				callback: deferred.resolve
			});
			return deferred.promise;
		}
	},
	
	/**************************************** SOME UTIL FUNCS ***************************************************/
	_loadRootProject: function(projectRecord){
		var me=this, 
			n = projectRecord.data.Name;
		if(n === 'All Scrums' || n === 'All Scrums Sandbox') return Q(projectRecord);
		else if(!projectRecord.data.Parent) return Q.reject('Please Scope to a valid team for Release Planning');
		else {
			return me._loadProject(projectRecord.data.Parent.ObjectID).then(function(parentRecord){
				return me._loadRootProject(parentRecord);
			});
		}
	},
	
	_projectInWhichTrain: function(projectRecord){ // returns train the projectRecord is in, otherwise null.
		if(!projectRecord) return Q.reject();
		else {
			var me=this, split = projectRecord.data.Name.split(' ART');
			if(split.length>1) return Q(projectRecord);
			else { 
				var parent = projectRecord.data.Parent;
				if(!parent) return Q.reject();
				else {
					return me._loadProject(parent.ObjectID).then(function(parentRecord){
						return me._projectInWhichTrain(parentRecord);
					});
				}
			}
		}
	},
	
	_loadAllTrains: function(rootProjectRecord){
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name', 'ObjectID'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
						property:'Name',
						operator: 'contains',
						value: ' ART'
					},{
						property: 'Name',
						operator: (rootProjectRecord.data.Name === 'All Scrums Sandbox' ? 'contains' : '!contains'),
						value: 'Test'
					}
				]
			});
		return me._reloadStore(store).then(function(store){
			console.log('AllTrainRecords loaded', store.data.items);
			return Q(store);
		});
	},
			
	_loadRandomUserStory: function(projectRef){ //get the most recent 5 in the project!!
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:5,
				pageSize:5,
				fetch: ['Name', 'CreationDate', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: projectRef
				},
				sorters: [
					{
						property: 'CreationDate', 
						direction:'DESC'
					}
				]
			});
		return me._reloadStore(store).then(function(store){
			var records = store.data.items;
			if(records.length) return Q(records[Math.floor(Math.random()*records.length)]);
			else return Q(undefined);
		});
	},
	
	_loadUserStoryByFID: function(formattedID, projectRef){
		var me=this,
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:1,
				pageSize:1,
				fetch: ['Name', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: projectRef
				},
				filters: [
					{
						property:'FormattedID',
						value:formattedID
					}
				]
			});
		return me._reloadStore(store).then(function(store){
			return Q(store.data.items.pop());
		});
	},
	
	/********************************************** FEATURES  ********************************************/
	_getFeatureFilterString: function(trainRecord, releaseRecord){
		var me=this,
			trainName = trainRecord.data.Name.split(' ART')[0];
			coreFilter = Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.Name',
				value: releaseRecord.data.Name
			});
		if(trainRecord.data.Name == 'Test ART (P&E)'){
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Name',
				value: 'Test ART (P&E)'
			}).and(coreFilter).toString();
		}
		else {
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Parent.Name',
				value: trainName + ' POWG Portfolios'
			}).and(coreFilter).toString();
		}
	},
	
	/*************************************************** Products ********************************************/
	
	_loadProducts: function(trainRecord){
		var me=this,
			trainName = trainRecord.data.Name.split(' ART')[0],
			store = Ext.create('Rally.data.wsapi.Store',{
				model: 'PortfolioItem/Product',
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
					property:'Project.Parent.Name',
					value: trainName + ' POWG Portfolios'
				}]
			});
		return me._reloadStore(store).then(function(store){
			console.log('Products loaded', store.data.items);
			return Q(store);
		});
	},
	
	/********************************************** Load Valid Projects ********************************************/
	
	_addProjectsToList: function(projTree, list){
		var me=this, 
			curProj = projTree.ProjectRecord;
		if(curProj.data.TeamMembers.Count >0) 
			list[curProj.data.ObjectID] = curProj;
		for(var childProjRef in projTree){
			if(childProjRef !== 'ProjectRecord')
				me._addProjectsToList(projTree[childProjRef], list);
		}
	},
	
	_loadValidProjects: function(rootProjectRecord){ 
		var me=this,
			validProjects = {}, 
			projTree = {},
			deferred = Q.defer();
		var store = Ext.create('Rally.data.wsapi.Store', {
			model: "Project",
			fetch: ['Name', 'Parent', 'ObjectID', 'TeamMembers'],
			limit:Infinity,
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project:null
			}
		});
		store.load({
			callback: function(projects){
				for(var i=0, len=projects.length; i<len; ++i){
					var project = projects[i],
						thisRef = project.data.ObjectID, 
						parentRef = project.data.Parent ? project.data.Parent.ObjectID : undefined;
					if(!projTree[thisRef]) projTree[thisRef] = {};
					projTree[thisRef].ProjectRecord = project;
					if(parentRef){
						if(!projTree[parentRef]) projTree[parentRef] = {};
						projTree[parentRef][thisRef] = projTree[thisRef];
					}
				}
				me._addProjectsToList(projTree[rootProjectRecord.data.ObjectID], validProjects);
				console.log('valid projects', validProjects);
				deferred.resolve(validProjects);
			}
		});
		return deferred.promise;
	},

	/********************************************** Generic store loading, returns promise ********************************************/
	
	_reloadStore: function(store){
		var deferred = Q.defer();
		store.load({
			callback: function(records, operation, success){
				if(!success) deferred.reject(operation.getError() || 'Could not load data');
				else deferred.resolve(store);
			}
		});
		return deferred.promise;
	}
});