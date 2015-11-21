/** 
	SUMMARY:
		This extends Rally.app.app. All Intel Apps should extend from this if they want to use the functionality it provides,
		as well as numerous other lib/* files that require you to extend from this.
		
		If you extend from Intel.lib.IntelRallyApp, you have to call me.configureIntelRallyApp() before anything else in your launch() 
		function. After you call me.configureIntelRallyApp, you will be able to access a lot of things, such as:
			- me.ScheduleStates: possible UserStory schedule States
			- me.PortfolioItemTypes: Ordered Array of PortfolioItem Types. e.g.: ['Feature', 'Milestone', 'Product']
			- me.ScrumGroupConfig: the scrum group portfolio location config for the workspace
			- me.HorizontalGroupingConfig: the horizontal scrum groupings by keywords
			- All the most-used Rally models, such as me.Project, me.UserStory, me.PortfolioItem, etc... 
		
	DEPENDENCIES:
		Q promise library
		
	ISSUES:
		sdk 2.0 does not work with the project function due to a bug in the sdk. use sdk 2.0rc3
	*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		ScrumGroupConfigPrefName = 'intel-portfolio-locations-config', //preference to store portfolio locations config for workspace
		HorizontalGroupingConfigPrefName = 'intel-horizontal-grouping-config'; //preference to store map of keywords in project names to horizontal
	
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
				
	Ext.define('Intel.lib.IntelRallyApp', {
		extend: 'Rally.app.App',
		minWidth:910, //when Rally adds its own scrollbar anyways
		
		projectFields: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name', 'TeamMembers'],
		portfolioItemFields: ['Name', 'ObjectID', 'FormattedID', 'Release','c_TeamCommits', 'c_MoSCoW', 
			'c_Risks', 'Project', 'PlannedEndDate', 'Parent', 'Children', 'PortfolioItemType', 'Ordinal',
			'PercentDoneByStoryPlanEstimate'],
		userStoryFields: ['Name', 'ObjectID', 'Release', 'Project', 'PortfolioItem', 'PlannedEndDate', 'ActualEndDate',
			'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
		releaseFields: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project', 'TeamMembers'],
		
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
				return me.reloadStore(store).then(function(store){
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
					User: 'User',
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
				filterByName: ScrumGroupConfigPrefName,
				success: function(prefs) {
					var configString = prefs[ScrumGroupConfigPrefName], scrumGroupConfig;
					try{ scrumGroupConfig = JSON.parse(configString); }
					catch(e){ scrumGroupConfig = []; }
					me.ScrumGroupConfig = scrumGroupConfig;
					deferred.resolve();
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		_loadHorizontalGroupingConfig: function(){
			/** HorizontalGroupingConfig is this:
			{
				enabled: boolean,
				groups: {
					<horizontal1Name>: ['keyword1', 'keyword2'],
					<horizontal2Name>: ['keyword1', 'keyword2'],
					...
				}
			}
			*/
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: HorizontalGroupingConfigPrefName,
				success: function(prefs) {
					var configString = prefs[HorizontalGroupingConfigPrefName], horizontalGroupingConfig;
					try{ horizontalGroupingConfig = JSON.parse(configString); }
					catch(e){ horizontalGroupingConfig = {enabled:false, groups:{}}; }
					me.HorizontalGroupingConfig = horizontalGroupingConfig;
					deferred.resolve();
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		saveScrumGroupConfig: function(scrumGroupConfig){
			var me=this, s = {}, deferred = Q.defer();
			s[ScrumGroupConfigPrefName] = JSON.stringify(scrumGroupConfig); 
			Rally.data.PreferenceManager.update({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: ScrumGroupConfigPrefName,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		},
		saveHorizontalGroupingConfig: function(horizontalGroupingConfig){
			var me=this, s = {}, deferred = Q.defer();
			s[HorizontalGroupingConfigPrefName] = JSON.stringify(horizontalGroupingConfig); 
			Rally.data.PreferenceManager.update({
				workspace: me.getContext().getWorkspace()._ref,
				filterByName: HorizontalGroupingConfigPrefName,
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		},
		configureIntelRallyApp: function(){
			var me=this;
			me.BaseUrl = Rally.environment.getServer().getBaseUrl(); //is "" when in custom app iframe
			return Q.all([
				me._loadPortfolioItemTypes().then(function(){ 
					me.userStoryFields.push(me.PortfolioItemTypes[0]);  
					return Q.all([
						me._loadModels(),
						me._loadPortfolioItemStatesForEachType()
					]);
				}),
				me._loadScrumGroupConfig(),
				me._loadHorizontalGroupingConfig(),
				me._loadScheduleStates()
			]);
		},
				
		/**************************** Generic store loading with Q wrapper, returns promise *************************************/		
		reloadStore: function(store){
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
		loadProject: function(oid){ 
			var me = this, deferred = Q.defer();
			if(!oid) return Q.reject('Invalid arguments: loadProject');
			else if(!me.Project) return Q.reject('IntelRallyApp is not configured!');
			else {
				me.Project.load(oid, {
					fetch: me.projectFields,
					context: { 
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					callback: deferred.resolve
				});
				return deferred.promise;
			}
		},	
		loadUserStory: function(oid, projectRecord){
			var me = this, deferred = Q.defer();
			if(!oid) return Q.reject('Invalid arguments: loadUserStory');
			else if(!me.UserStory) return Q.reject('IntelRallyApp is not configured!');
			else {
				me.UserStory.load(oid, {
					fetch: me.userStoryFields,
					context: {
						workspace: projectRecord ? null : me.getContext().getWorkspace()._ref,
						project: projectRecord ? projectRecord.data._ref : null
					},
					callback: deferred.resolve
				});
				return deferred.promise;
			}
		},	
		loadPortfolioItemByType: function(oid, type){
			var me = this, deferred = Q.defer();
			if(!oid || !type) return Q.reject('Invalid arguments: loadPortfolioItemByType');
			else {
				type = (type.indexOf('PortfolioItem/') === 0) ? type : ('PortfolioItem/' + type);	
				me[type].load(oid, {
					fetch: me.portfolioItemFields,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					callback: deferred.resolve
				});
				return deferred.promise;
			}
		},	
		loadPortfolioItemByOrdinal: function(oid, ordinal){
			var me = this, deferred = Q.defer(),
				type = me.PortfolioItemTypes[ordinal];
			return me.loadPortfolioItemByType(oid, type);
		},	
		
		/**************************************** ScrumGroup Funcs ***************************************************/
		projectInWhichScrumGroup: function(projectRecord){ 
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
						return me.loadProject(parent.ObjectID).then(function(parentRecord){
							return me.projectInWhichScrumGroup(parentRecord);
						});
					}
				}
			}
		},
		loadScrumGroupPortfolioProject: function(scrumGroupRootProjectRecord){
			if(!scrumGroupRootProjectRecord) return Q.reject('Invalid arguments: loadScrumGroupPortfolioProject');
			var me=this,
				foundScrumGroupConfig = _.find(me.ScrumGroupConfig, function(scrumGroupConfig){ 
					return scrumGroupConfig.ScrumGroupRootProjectOID == scrumGroupRootProjectRecord.data.ObjectID; 
				});
			if(!foundScrumGroupConfig) return Q.reject('Project ' + scrumGroupRootProjectRecord.data.Name + ' is not a scrum group!');
			if(foundScrumGroupConfig.ScrumGroupAndPortfolioLocationTheSame) return Q(scrumGroupRootProjectRecord);
			else return me.loadProject(foundScrumGroupConfig.PortfolioProjectOID);
		},
		getScrumGroupName: function(scrumGroupRootProjectRecord){
			if(!scrumGroupRootProjectRecord) throw 'Invalid arguments: getScrumGroupName';
			var me=this,
				foundScrumGroupConfig = _.find(me.ScrumGroupConfig, function(scrumGroupConfig){ 
					return scrumGroupConfig.ScrumGroupRootProjectOID == scrumGroupRootProjectRecord.data.ObjectID; 
				});
			if(!foundScrumGroupConfig) throw 'Project ' + scrumGroupRootProjectRecord.data.Name + ' is not a scrum-group!';
			if(foundScrumGroupConfig.ScrumGroupName) return foundScrumGroupConfig.ScrumGroupName;
			else return scrumGroupRootProjectRecord.data.Name;
		},
		loadAllScrumGroups: function(){
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
					fetch: me.projectFields,
					filters:[filter],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
				return me.reloadStore(store).then(function(store){ return store.getRange(); });
			}
		},
		getScrumGroupPortfolioObjectIDs: function(){
			return _.map(me.ScrumGroupConfig, function(item){
				return item.ScrumGroupAndPortfolioLocationTheSame ? item.ScrumGroupRootProjectOID : item.PortfolioProjectOID;
			});
		},
		getPortfolioOIDForScrumGroupRootProjectRecord: function(scrumGroupRootProjectRecord){
			var configItem = _.find(this.ScrumGroupConfig, function(item){ 
				return item.ScrumGroupRootProjectOID === scrumGroupRootProjectRecord.data.ObjectID; 
			});
			return configItem.ScrumGroupAndPortfolioLocationTheSame ? configItem.ScrumGroupRootProjectOID : configItem.PortfolioProjectOID;
		},
		
		/**************************************** UserStory Funcs ************************************************/
		_getUserStoryInReleaseTimeFrameFilter: function(releaseRecord){ 
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
		loadRandomUserStory: function(projectRecord){
			if(!projectRecord) return Q.reject('Invalid arguments: loadRandomUserStory');
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
			return me.reloadStore(store).then(function(store){ return store.getRange().pop(); });
		},
		loadRandomUserStoryFromReleaseTimeframe: function(projectRecord, releaseRecord){
			if(!projectRecord || !releaseRecord) return Q.reject('Invalid arguments: loadRandomUserStoryFromReleaseTimeframe');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'HierarchicalRequirement',
					limit:5,
					pageSize:5,
					disableMetaChangeEvent: true,
					fetch: me.userStoryFields,
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
						me._getUserStoryInReleaseTimeFrameFilter(releaseRecord))
					]
				});
			return me.reloadStore(store).then(function(store){
				var records = store.data.items;
				if(records.length) return Q(records[Math.floor(Math.random()*records.length)]);
				else return Q(undefined);
			});
		},
		loadUserStoryByFID: function(formattedID, projectRecord){
			if(!formattedID || !projectRecord) return Q.reject('Invalid arguments: loadUserStoryByFID');
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
			return me.reloadStore(store).then(function(store){
				return Q(store.data.items.pop());
			});
		},	
		
		/**************************************** PortfolioItem Funcs ************************************************/
		loadPortfolioItemsOfType: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: loadPortfolioItemsOfType');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: me.portfolioItemFields,
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me.reloadStore(store);
		},		
		loadPortfolioItemsOfTypeInRelease: function(releaseRecord, portfolioProject, type){
			debugger;
			if(!releaseRecord || !portfolioProject || !type) return Q.reject('Invalid arguments: loadPortfolioItemsOfTypeInRelease');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: me.portfolioItemFields,
					filters:[{ property:'Release.Name', value:releaseRecord.data.Name}],
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me.reloadStore(store);
		},
		loadPortfolioItemsOfOrdinal: function(portfolioProject, ordinal){
			if(!portfolioProject || typeof ordinal === 'undefined') return Q.reject('Invalid arguments: loadPortfolioItemsOfOrdinal');
			var me=this, type = me.PortfolioItemTypes[ordinal];
			if(type) return me.loadPortfolioItemsOfType(portfolioProject, type);
			else return Q.reject('Invalid PortfolioItem ordinal');
		},
		portfolioItemTypeToOrdinal: function(type){
			return this.PortfolioItemTypes.indexOf(type);
		},
		getPortfolioItemTypeStateByOrdinal: function(ordinal, stateName){
			return _.find(this.PortfolioItemTypeStates[ordinal], function(state){ return state.data.Name == stateName; });
		},
		getPortfolioItemTypeStateByName: function(portfolioType, stateName){
			return this.getPortfolioItemTypeStateByOrdinal(this.portfolioItemTypeToOrdinal(portfolioType), stateName);
		},
		createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap: function(portfolioItemStores){
			var portfolioItemMap = {};
			_.each(portfolioItemStores[0].getRange(), function(lowPortfolioItemRecord){ //create the portfolioItem mapping
				var ordinal = 0, 
					parentPortfolioItemRecord = lowPortfolioItemRecord,
					getParentRecord = function(child, parentList){
						return _.find(parentList, function(parent){ 
							return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; 
						});
					};
				while(ordinal < (portfolioItemStores.length-1) && parentPortfolioItemRecord){
					parentPortfolioItemRecord = getParentRecord(parentPortfolioItemRecord, portfolioItemStores[ordinal+1].getRange());
					++ordinal;
				}
				if(ordinal === (portfolioItemStores.length-1) && parentPortfolioItemRecord) //has a mapping, so add it
					portfolioItemMap[lowPortfolioItemRecord.data.ObjectID] = parentPortfolioItemRecord.data.Name;
			});
			return portfolioItemMap;
		},
			
		/********************************************** Project Funcs ********************************************/
		/****************************** THESE DO NOT WORK WITH sdk 2.0. USE SDK 2.0rc3 *******************/
		_storeItemsToProjTree: function(projects){
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
		_addProjectsWithTeamMembersToList: function(projTree, hash){
			var me=this, curProj = projTree.ProjectRecord;
			if(curProj.data.TeamMembers.Count >0) 
				hash[curProj.data.ObjectID] = curProj;
			for(var childProjRef in projTree){
				if(childProjRef !== 'ProjectRecord')
					me._addProjectsWithTeamMembersToList(projTree[childProjRef], hash);
			}
		},	
		_allChildProjectToList: function(projTree, hash){
			var me=this, curProj = projTree.ProjectRecord;
			hash[curProj.data.ObjectID] = curProj;
			for(var childProjRef in projTree){
				if(childProjRef !== 'ProjectRecord')
					me._allChildProjectToList(projTree[childProjRef], hash);
			}
		},
		_allLeafProjectsToList: function(projTree, hash){
			var me=this, curProj = projTree.ProjectRecord;
			if(curProj.data.Children.Count === 0) 
				hash[curProj.data.ObjectID] = curProj;
			for(var childProjRef in projTree){
				if(childProjRef !== 'ProjectRecord')
					me._allLeafProjectsToList(projTree[childProjRef], hash);
			}
		},	
		loadAllProjects: function(){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me.projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me.reloadStore(store).then(function(store){
				var map = _.reduce(store.getRange(), function(map, project){
					map[project.data.ObjectID] = project;
					return map;
				}, {});
				return map;
			});	
		},
		loadProjectsWithTeamMembers: function(rootProjectRecord){
			//rootProjectRecord is optional
			var me=this,
				projectsWithTeamMembers = {},
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me.projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me.reloadStore(store).then(function(store){
				if(rootProjectRecord){
					var projTree = me._storeItemsToProjTree(store.getRange());
					me._addProjectsWithTeamMembersToList(projTree[rootProjectRecord.data.ObjectID], projectsWithTeamMembers);
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
		loadAllChildrenProjects: function(rootProjectRecord){
			//rootProjectRecord is optional
			var me=this,
				childrenProjects = {},
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me.projectFields,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me.reloadStore(store).then(function(store){
				if(rootProjectRecord){
					var projTree = me._storeItemsToProjTree(store.getRange());
					me._allChildProjectToList(projTree[rootProjectRecord.data.ObjectID], childrenProjects);
					return childrenProjects;
				} else {
					return _.reduce(store.getRange(), function(map, project){
						map[project.data.ObjectID] = project;
						return map;
					}, {});
				}
			});
		},	
		loadAllLeafProjects: function(rootProjectRecord){
			//rootProjectRecord is optional
			var me=this,
				leafProjects = {}, 
				store = Ext.create('Rally.data.wsapi.Store', {
					model: "Project",
					fetch: me.projectFields,
					compact: false,
					limit:Infinity,
					disableMetaChangeEvent: true,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me.reloadStore(store).then(function(store){
				if(rootProjectRecord){
					var projTree = me._storeItemsToProjTree(store.getRange());
					me._allLeafProjectsToList(projTree[rootProjectRecord.data.ObjectID], leafProjects);
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
		loadProjectByName: function(projectName){
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
			return me.reloadStore(store).then(function(store){
				return Q(store.data.items.pop());
			});
		},
		
		/********************************************** Release loading ********************************************/	
		loadAllReleases: function(projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me.releaseFields,
					filters:[{
						property:'Project.ObjectID',
						value:projectRecord.data.ObjectID
					}],
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},	
		loadReleasesAfterGivenDate: function(projectRecord, givenDate){
			/** gets releases for this project that have release date >= givenDate. returns promise that resolves to the releaseStore */
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me.releaseFields,
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
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},
		loadReleasesBeforeGivenDate: function(projectRecord, givenDate){
			/** gets releases for this project that have release date <= givenDate. returns promise that resolves to the releaseStore */
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					autoLoad:false,
					disableMetaChangeEvent: true,
					fetch: me.releaseFields,
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
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},
		loadReleasesBetweenDates: function(projectRecord, startDate, endDate){
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
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},
		loadReleasesInTheFuture: function(projectRecord){
			return this.loadReleasesAfterGivenDate(projectRecord, new Date());
		},
		loadReleasesByNameUnderProject: function(releaseName, projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me.releaseFields,
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
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},	
		loadReleaseByNameForProject: function(releaseName, projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me.releaseFields,
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
			return me.reloadStore(store).then(function(store){ return store.getRange().pop(); });
		},
		loadReleasesByNameContainsForProject: function(releaseName, projectRecord){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'Release',
					limit:Infinity,
					disableMetaChangeEvent: true,
					autoLoad:false,
					fetch: me.releaseFields,
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
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},
		getScopedRelease: function(releaseRecords, projectOID, appPrefs){			
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