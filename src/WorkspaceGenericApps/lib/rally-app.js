/** this extends Rally.app.app. if you want to use it's utility functions, just
		extend IntelRallyApp instead of Rally.app.App
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	//increase timeouts to 2 minutes since rally can be slow sometimes
	var timeout = 120000;
	Ext.override(Ext.data.proxy.Ajax, { timeout: timeout });
	Ext.override(Ext.data.proxy.JsonP, { timeout: timeout });
	
	//rally's built-in jsonpproxy does not handle timeouts
	Ext.override(Rally.sdk.data.lookback.JsonPProxy, {
		setException: function(operation, response){
			var error = operation.getError() || {};
			operation.setException(Ext.apply(error, {
				errors:(response || {}).Errors || []
			}));
		}
	});
				
	Ext.define('Intel.lib.RallyApp', {
		alias: 'widget.intelrallyapp',
		extend: 'Rally.app.App',
		
		_ScrumGroupConfigPrefName: 'intel-portfolio-locations-config', //preference to store portfolio locations config for workspace
		
		_projectFields: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name', 'TeamMembers'],
		_portfolioItemFields: ['Name', 'ObjectID', 'FormattedID', 'Release','c_TeamCommits', 'c_MoSCoW', 
			'c_Risks', 'Project', 'PlannedEndDate', 'Parent', 'Children', 'PortfolioItemType', 'Ordinal'],
		_userStoryFields: ['Name', 'ObjectID', 'Release', 'Project', 'PortfolioItem', 'PlannedEndDate', 'ActualEndDate',
			'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
		_releaseFields: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project', 'TeamMembers'],
		
		/********************************************** APP CONFIGURATION **************************************/
		_loadScheduleStates: function(){ 
			var me=this, deferred = Q.defer();
			Rally.data.ModelFactory.getModel({
				type: 'UserStory',
				success: function(model) {
					model.getField('ScheduleState').getAllowedValueStore().load({
						callback: function(records, operation, success) {
							me.ScheduleStates = _.map(records, function(r){ return r.data.StringValue; });
							deferred.resolve();
						}
					});
				}
			});
			return deferred.promise;
		},
		_loadPortfolioItemStatesForEachType: function(){ 
			var me=this;
			me.PortfolioItemTypeStates = [];
			return Q.all(_.map(me.PortfolioItemTypes, function(portfolioType, ordinal){
				var store = Ext.create('Rally.data.wsapi.Store', {
					model: 'State',
					autoLoad:false,
					limit:Infinity,
					disableMetaChangeEvent: true,
					fetch:['Name', 'Enabled', 'OrderIndex'],
					filters: [{
						property: 'TypeDef.Name',
						value: portfolioType
					},{
						property: 'Enabled',
						value: true
					}]
				});
				return me._reloadStore(store).then(function(store){
					me.PortfolioItemTypeStates[ordinal] = store.getRange();
				});
			}));
		},
		_loadPortfolioItemTypes: function(){ 
			/** loads all the portfolioitem names into sorted array [smallest ordinal --> biggest ordinal] */
			var me=this,
				deferred = Q.defer(),
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'TypeDefinition',
					autoLoad:true,
					limit:Infinity,
					disableMetaChangeEvent: true,
					fetch:['Ordinal', 'Name'],
					filters: [{
						property: 'Parent.Name',
						value: 'Portfolio Item'
					},{
						property: 'Creatable',
						value: true
					}],
					listeners:{
						load:function(portfolioTypeStore){
							me.PortfolioItemTypes = _.map(_.sortBy(_.map(portfolioTypeStore.getRange(), 
								function(item){ return {Name: item.data.Name, Ordinal: item.data.Ordinal}; }),
								function(item){ return item.Ordinal; }),
								function(item){ return item.Name; });
							deferred.resolve();
						}
					}
				});
			return deferred.promise;
		},
		_loadModels: function(){ 
			/** loads models for project, userstories, and all the portfolio items */
			var me=this, 
				promises = [],
				models = {
					Project: 'Project',
					UserStory: 'HierarchicalRequirement',
					PortfolioItem: 'PortfolioItem'
				};
			_.each(me.PortfolioItemTypes, function(name){ models['PortfolioItem/' + name] = 'PortfolioItem/' + name; });
			_.each(models, function(modelType, modelName){
				var deferred = Q.defer();
				Rally.data.WsapiModelFactory.getModel({
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
		_loadScrumGroupConfig: function(){
			/** scrum-groups are groups of scrums that share the same portfolio. The group of scrums may or may not be a train */
			/** me.ScrumGroupConfig is an array of these objects: 
				{
					ScrumGroupRootProjectOID: configItem.ScrumGroupRootProjectOID || 0,
					ScrumGroupName: configItem.ScrumGroupName || '',
					ScrumGroupAndPortfolioLocationTheSame: configItem.ScrumGroupAndPortfolioLocationTheSame ? true : false,
					PortfolioProjectOID: configItem.PortfolioProjectOID || 0,
					IsTrain: configItem.IsTrain ? true : false
				}
			*/
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: me._ScrumGroupConfigPrefName,
				success: function(prefs) {
					var configString = prefs[me._ScrumGroupConfigPrefName], scrumGroupConfig;
					try{ scrumGroupConfig = JSON.parse(configString); }
					catch(e){ scrumGroupConfig = []; }
					me.ScrumGroupConfig = scrumGroupConfig;
					deferred.resolve();
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_saveScrumGroupConfig: function(scrumGroupConfig){
			var me=this, s = {}, deferred = Q.defer();
			s[me._ScrumGroupConfigPrefName] = JSON.stringify(scrumGroupConfig); 
			Rally.data.PreferenceManager.update({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: me._ScrumGroupConfigPrefName,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_configureIntelRallyApp: function(){
			var me=this;
			me.BaseUrl = Rally.environment.getServer().getBaseUrl(); //is "" when in custom app iframe
			return Q.all([
				me._loadPortfolioItemTypes().then(function(){ 
					me._userStoryFields.push(me.PortfolioItemTypes[0]);  //HOLY PROGRAM BOARD BUG, BATMAN! (me._isUserStoryInRelease false for those who: (release == null && portfolioItrem.release.name == me.ReleaseRecord.data.Name)).
					return Q.all([
						me._loadModels(),
						me._loadPortfolioItemStatesForEachType()
					]);
				}),
				me._loadScrumGroupConfig(),
				me._loadScheduleStates()
			]);
		},
				
		/**************************** Generic store loading with Q wrapper, returns promise *************************************/		
		_reloadStore: function(store){
			var deferred = Q.defer();
			store.load({
				callback: function(records, operation, success){
					if(!success) deferred.reject(operation.getError() || 'Could not load data');
					else deferred.resolve(store);
				}
			});
			return deferred.promise;
		},
		
		/********************************************** LOADING SINGLE MODELS **************************************/	
		_loadProject: function(oid){ 
			var me = this, deferred = Q.defer();
			if(!oid) return Q.reject('Invalid arguments: LP');
			else if(!me.Project) return Q.reject('IntelRallyApp is not configured!');
			else {
				me.Project.load(oid, {
					fetch: me._projectFields,
					context: { 
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					callback: deferred.resolve
				});
				return deferred.promise;
			}
		},	
		_loadUserStory: function(oid, projectRecord){
			var me = this, deferred = Q.defer();
			if(!oid) return Q.reject('Invalid arguments: LUS');
			else if(!me.UserStory) return Q.reject('IntelRallyApp is not configured!');
			else {
				me.UserStory.load(oid, {
					fetch: me._userStoryFields,
					context: {
						workspace: projectRecord ? null : me.getContext().getWorkspace()._ref,
						project: projectRecord ? projectRecord.data._ref : null
					},
					callback: deferred.resolve
				});
				return deferred.promise;
			}
		},	
		_loadPortfolioItemByType: function(oid, type){
			var me = this, deferred = Q.defer();
			if(!oid || !type) return Q.reject('Invalid arguments: LPIBT');
			else {
				me[type].load(oid, {
					fetch: me._portfolioItemFields,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					callback: deferred.resolve
				});
				return deferred.promise;
			}
		},	
		_loadPortfolioItemByOrdinal: function(oid, ordinal){
			var me = this, deferred = Q.defer(),
				type = me.PortfolioItemTypes[ordinal];
			return me._loadPortfolioItemByType(oid, type);
		},	
		
		/**************************************** ScrumGroup Funcs ***************************************************/
		_projectInWhichScrumGroup: function(projectRecord){ 
			/** returns scrumgroup the projectRecord is in, otherwise null. */
			if(!projectRecord) return Q();
			else {
				var me=this,
					foundScrumGroupConfig = _.find(me.ScrumGroupConfig, function(scrumGroupConfig){ 
						return scrumGroupConfig.ScrumGroupRootProjectOID == projectRecord.data.ObjectID; 
					});
				if(foundScrumGroupConfig) return Q(projectRecord);
				else { 
					var parent = projectRecord.data.Parent;
					if(!parent) return Q();
					else {
						return me._loadProject(parent.ObjectID).then(function(parentRecord){
							return me._projectInWhichScrumGroup(parentRecord);
						});
					}
				}
			}
		},
		_loadScrumGroupPortfolioProject: function(scrumGroupRootProjectRecord){
			if(!scrumGroupRootProjectRecord) return Q.reject('Invalid arguments: _loadScrumGroupPortfolioProject');
			var me=this,
				foundScrumGroupConfig = _.find(me.ScrumGroupConfig, function(scrumGroupConfig){ 
					return scrumGroupConfig.ScrumGroupRootProjectOID == scrumGroupRootProjectRecord.data.ObjectID; 
				});
			if(!foundScrumGroupConfig) return Q.reject('Project ' + scrumGroupRootProjectRecord.data.Name + ' is not a scrum group!');
			if(foundScrumGroupConfig.ScrumGroupAndPortfolioLocationTheSame) return Q(scrumGroupRootProjectRecord);
			else return me._loadProject(foundScrumGroupConfig.PortfolioProjectOID);
		},
		_getScrumGroupName: function(scrumGroupRootProjectRecord){
			if(!scrumGroupRootProjectRecord) throw 'Invalid arguments: _getScrumGroupName';
			var me=this,
				foundScrumGroupConfig = _.find(me.ScrumGroupConfig, function(scrumGroupConfig){ 
					return scrumGroupConfig.ScrumGroupRootProjectOID == scrumGroupRootProjectRecord.data.ObjectID; 
				});
			if(!foundScrumGroupConfig) throw 'Project ' + scrumGroupRootProjectRecord.data.Name + ' is not a scrum-group!';
			if(foundScrumGroupConfig.ScrumGroupName) return foundScrumGroupConfig.ScrumGroupName;
			else return scrumGroupRootProjectRecord.data.Name;
		},
		_loadAllScrumGroups: function(){
			var me=this,
				filter = _.reduce(me.ScrumGroupConfig, function(filter, scrumGroupConfig){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', { property:'ObjectID', value: scrumGroupConfig.ScrumGroupRootProjectOID });
					return filter ? filter.or(newFilter) : newFilter;
				}, null);
			if(!filter) return Q([]);
			else {
				var store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Project',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me._projectFields,
					filters:[filter],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
				return me._reloadStore(store).then(function(store){ return store.getRange(); });
			}
		},
		
		/**************************************** UserStory Funcs ************************************************/
		__getUserStoryInReleaseTimeFrameFilter: function(releaseRecord){ 
			/** only pull look at PortfolioItem Release if US.Release == null */
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				twoWeeks = 1000*60*60*24*7*2,
				releaseStartPadding = new Date(new Date(releaseRecord.data.ReleaseStartDate)*1 + twoWeeks).toISOString(),
				releaseEndPadding = new Date(new Date(releaseRecord.data.ReleaseDate)*1 - twoWeeks).toISOString();
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseStartDate',
				operator: '<',
				value: releaseStartPadding
			}).and(Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseDate',
				operator: '>',
				value: releaseEndPadding
			})).or(
				Ext.create('Rally.data.wsapi.Filter', {
					property:'Release.ObjectID',
					value: null
				}).and(
					Ext.create('Rally.data.wsapi.Filter', {
						property: lowestPortfolioItem + '.Release.ReleaseStartDate',
						operator: '<',
						value: releaseStartPadding
					}).and(Ext.create('Rally.data.wsapi.Filter', { 
						property: lowestPortfolioItem + '.Release.ReleaseDate',
						operator: '>',
						value: releaseEndPadding
					}))
				)
			);
		},
		_loadRandomUserStory: function(projectRecord){
			if(!projectRecord) return Q.reject('Invalid arguments: LRUS');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'HierarchicalRequirement',
					limit:1,
					pageSize:1,
					disableMetaChangeEvent: true,
					fetch: false,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters:[{ 
						property:'Project.ObjectID', 
						value: projectRecord.data.ObjectID 
					}]
				});
			return me._reloadStore(store).then(function(store){ return store.getRange().pop(); });
		},
		_loadRandomUserStoryFromReleaseTimeframe: function(projectRecord, releaseRecord){
			if(!projectRecord || !releaseRecord) return Q.reject('Invalid arguments: LRUSFR');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'HierarchicalRequirement',
					limit:5,
					pageSize:5,
					disableMetaChangeEvent: true,
					fetch: me._userStoryFields,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: undefined
					},
					sorters: [{
						property: 'CreationDate', 
						direction:'DESC'
					}],
					filters:[
						Ext.create('Rally.data.wsapi.Filter', { property:'Project.ObjectID', value: projectRecord.data.ObjectID }).and(
						me.__getUserStoryInReleaseTimeFrameFilter(releaseRecord))
					]
				});
			return me._reloadStore(store).then(function(store){
				var records = store.data.items;
				if(records.length) return Q(records[Math.floor(Math.random()*records.length)]);
				else return Q(undefined);
			});
		},
		_loadUserStoryByFID: function(formattedID, projectRecord){
			if(!formattedID || !projectRecord) return Q.reject('Invalid arguments: LUSBFID');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'HierarchicalRequirement',
					limit:1,
					pageSize:1,
					disableMetaChangeEvent: true,
					fetch: ['Name', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: undefined
					},
					filters: [{
						property:'FormattedID',
						value:formattedID
					},{
						property:'Project.ObjectID',
						value: projectRecord.data.ObjectID
					}]
				});
			return me._reloadStore(store).then(function(store){
				return Q(store.data.items.pop());
			});
		},	
		
		/**************************************** PortfolioItem Funcs ************************************************/
		_loadPortfolioItemsOfType: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: OPIOT');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: me._portfolioItemFields,
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me._reloadStore(store);
		},		
		_loadPortfolioItemsOfOrdinal: function(portfolioProject, ordinal){
			if(!portfolioProject || typeof ordinal === 'undefined') return Q.reject('Invalid arguments: LPIOO');
			var me=this, type = me.PortfolioItemTypes[ordinal];
			if(type) return me._loadPortfolioItemsOfType(portfolioProject, type);
			else return Q.reject('Invalid PortfolioItem ordinal');
		},
		_portfolioItemTypeToOrdinal: function(type){
			return this.PortfolioItemTypes.indexOf(type);
		},
		_getPortfolioItemTypeStateByOrdinal: function(ordinal, stateName){
			return _.find(this.PortfolioItemTypeStates[ordinal], function(state){ return state.data.Name == stateName; });
		},
		_getPortfolioItemTypeStateByName: function(portfolioType, stateName){
			return this._getPortfolioItemTypeStateByOrdinal(this._portfolioItemTypeToOrdinal(portfolioType), stateName);
		},
		
		/********************************************** Project Funcs ********************************************/
		/****************************** THESE DO NOT WORK WITH sdk 2.0. USE SDK 2.0rc3 *******************/
		__storeItemsToProjTree: function(projects){
			var me=this, projTree = {};
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
			return projTree;
		},
		_loadAllProjects: function(){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me._projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){
				var map = _.reduce(store.getRange(), function(map, project){
					map[project.data.ObjectID] = project;
					return map;
				}, {});
				return map;
			});	
		},
		__addProjectsWithTeamMembersToList: function(projTree, hash){
			var me=this, curProj = projTree.ProjectRecord;
			if(curProj.data.TeamMembers.Count >0) 
				hash[curProj.data.ObjectID] = curProj;
			for(var childProjRef in projTree){
				if(childProjRef !== 'ProjectRecord')
					me.__addProjectsWithTeamMembersToList(projTree[childProjRef], hash);
			}
		},	
		_loadProjectsWithTeamMembers: function(rootProjectRecord){
			//rootProjectRecord is optional
			var me=this,
				projectsWithTeamMembers = {},
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me._projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){
				if(rootProjectRecord){
					var projTree = me.__storeItemsToProjTree(store.getRange());
					me.__addProjectsWithTeamMembersToList(projTree[rootProjectRecord.data.ObjectID], projectsWithTeamMembers);
					return projectsWithTeamMembers;
				} else {
					return _.reduce(_.filter(store.getRange(),
						function(project){ return project.data.TeamMembers.Count > 0; }),
						function(map, project){
							map[project.data.ObjectID] = project;
							return map;
						}, {});
				}
			});
		},	
		__allChildProjectToList: function(projTree, hash){
			var me=this, curProj = projTree.ProjectRecord;
			hash[curProj.data.ObjectID] = curProj;
			for(var childProjRef in projTree){
				if(childProjRef !== 'ProjectRecord')
					me.__allChildProjectToList(projTree[childProjRef], hash);
			}
		},
		_loadAllChildrenProjects: function(rootProjectRecord){
			//rootProjectRecord is optional
			var me=this,
				childrenProjects = {},
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me._projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){
				if(rootProjectRecord){
					var projTree = me.__storeItemsToProjTree(store.getRange());
					me.__allChildProjectToList(projTree[rootProjectRecord.data.ObjectID], childrenProjects);
					return childrenProjects;
				} else {
					return _.reduce(store.getRange(), function(map, project){
						map[project.data.ObjectID] = project;
						return map;
					}, {});
				}
			});
		},	
		__allLeafProjectsToList: function(projTree, hash){
			var me=this, curProj = projTree.ProjectRecord;
			if(curProj.data.Children.Count === 0) 
				hash[curProj.data.ObjectID] = curProj;
			for(var childProjRef in projTree){
				if(childProjRef !== 'ProjectRecord')
					me.__allLeafProjectsToList(projTree[childProjRef], hash);
			}
		},	
		_loadAllLeafProjects: function(rootProjectRecord){
			//rootProjectRecord is optional
			var me=this,
				leafProjects = {}, 
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me._projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){
				if(rootProjectRecord){
					var projTree = me.__storeItemsToProjTree(store.getRange());
					me.__allLeafProjectsToList(projTree[rootProjectRecord.data.ObjectID], leafProjects);
					return leafProjects;
				} else {
					return _.reduce(_.filter(store.getRange(),
						function(project){ return project.data.Children.Count === 0; }),
						function(map, project){
							map[project.data.ObjectID] = project;
							return map;
						}, {});
				}
			});
		},
		_loadProjectByName: function(projectName){
			if(!projectName) return Q.reject('Invalid arguments: LPBN');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Project',
					limit:1,
					pageSize:1,
					fetch: ['Name', 'ObjectID'],
					disableMetaChangeEvent: true,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters: [{
						property:'Name',
						value:projectName
					}]
				});
			return me._reloadStore(store).then(function(store){
				return Q(store.data.items.pop());
			});
		},
		
		/********************************************** Release loading ********************************************/	
		_loadAllReleases: function(projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me._releaseFields,
					filters:[{
						property:'Project.ObjectID',
						value:projectRecord.data.ObjectID
					}],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){ return store.getRange(); });
		},	
		_loadReleasesAfterGivenDate: function(projectRecord, givenDate){
			/** gets releases for this project that have release date >= givenDate. returns promise that resolves to the releaseStore */
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me._releaseFields,
					filters:[{
						property:'ReleaseDate',
						operator:'>=',
						value: new Date(givenDate).toISOString()
					},{
						property:'Project.ObjectID',
						value:projectRecord.data.ObjectID
					}],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){ return store.getRange(); });
		},
		_loadReleasesBeforeGivenDate: function(projectRecord, givenDate){
			/** gets releases for this project that have release date <= givenDate. returns promise that resolves to the releaseStore */
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					autoLoad:false,
					disableMetaChangeEvent: true,
					fetch: me._releaseFields,
					filters:[{
						property:'ReleaseDate',
						operator:'<=',
						value: new Date(givenDate).toISOString()
					},{
						property:'Project.ObjectID',
						value:projectRecord.data.ObjectID
					}],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){ return store.getRange(); });
		},
		_loadReleasesBetweenDates: function(projectRecord, startDate, endDate){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit: Infinity,
					autoLoad:false,
					fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters:[{
						property:'Project.ObjectID',
						value: projectRecord.data.ObjectID
					},{
						property:'ReleaseDate',
						operator:'>',
						value: new Date(startDate).toISOString()
					},{
						property:'ReleaseStartDate',
						operator:'<',
						value: new Date(endDate).toISOString()
					}]
				});
			return me._reloadStore(store).then(function(store){ return store.getRange(); });
		},
		_loadReleasesInTheFuture: function(projectRecord){
			return this._loadReleasesAfterGivenDate(projectRecord, new Date());
		},
		_loadReleasesByNameUnderProject: function(releaseName, projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me._releaseFields,
					filters:[{
						property:'Name',
						value: releaseName
					}],
					context:{
						project:projectRecord.data._ref,
						projectScopeDown:true,
						projectScopeUp:false
					}
				});
			return me._reloadStore(store).then(function(store){ return store.getRange(); });
		},	
		_loadReleaseByNameForProject: function(releaseName, projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me._releaseFields,
					filters:[{
						property:'Name',
						value: releaseName
					},{
						property:'Project.ObjectID',
						value:projectRecord.data.ObjectID
					}],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){ return store.getRange().pop(); });
		},
		_loadReleasesByNameContainsForProject: function(releaseName, projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me._releaseFields,
					filters:[{
						property:'Name',
						operator:'contains',
						value: releaseName
					},{
						property:'Project.ObjectID',
						value:projectRecord.data.ObjectID
					}],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me._reloadStore(store).then(function(store){ return store.getRange(); });
		},
		_getScopedRelease: function(releaseRecords, projectOID, appPrefs){			
			/** gets the most likely release to scope to base on the following order:
				1) if this.AppPrefs.projs[pid] is set to a release ObjectID, and the ReleaseStore has that release (you need 
								to use preferences for this one)
				2) if we are currently in one of the releases
				3) the closest release planning date to the current date
			*/
			var me=this,
				d = new Date(),
				rs = releaseRecords,
				prefOID = appPrefs && appPrefs.projs && appPrefs.projs[projectOID] && appPrefs.projs[projectOID].Release;
			return (prefOID && _.find(rs, function(r){ return r.data.ObjectID == prefOID; })) ||
				_.find(rs, function(r){
					return (new Date(r.data.ReleaseDate) >= d) && (new Date(r.data.ReleaseStartDate) <= d);
				}) ||
				_.reduce(rs, function(best, r){
					if(best===null) return r;
					else {
						var d1 = new Date(best.data.ReleaseStartDate)*1, d2 = new Date(r.data.ReleaseStartDate)*1, now = new Date()*1;
						return (Math.abs(d1-now) < Math.abs(d2-now)) ? best : r;
					}
				}, null);
		}
	});
}());