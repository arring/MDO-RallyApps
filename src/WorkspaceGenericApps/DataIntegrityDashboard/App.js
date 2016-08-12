/**
	This is the hyper-optimized version of the Data Integrity Dashboard. It is capable of viewing
	integrity both horizontally and vertically. Use of lodash is minimized for the sake of reducing
	function overhead and increasing performance (SS: i dont think lodash usage is as big a deal as network
	overhead and DOM manipulation)(SS: but little things add up over time)(SS: i dont need you for
	this conversation)
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	/************************** Data Integrity Dashboard *****************************/
	Ext.define('Intel.DataIntegrityDashboard', {
		extend: 'Intel.lib.IntelRallyApp',
		cls:'app',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.CustomAppObjectIDRegister',
			'Intel.lib.mixin.HorizontalTeamTypes',
			'Intel.lib.mixin.Caching'
		],
		minWidth:1100,
		
		/**
			This layout consists of:
			Top horizontal bar for controls
			Horizontal bar for a pie chart and heat map (the 'ribbon')
			Two columns (referred to as Left and Right) for grids
		*/
		items:[{
			xtype:'container',
			id: 'cacheButtonsContainer'
			},{
			xtype: 'container',
			id: 'navContainer',
			layout:'hbox',
			items:[{
				xtype:'container',
				id: 'controlsContainer',
				layout:'vbox',
				width:260
			},{ 
				xtype:'container',
				id: 'emailLinkContainer',
				width: 150
			},{ 
				xtype:'container',
				id: 'cacheMessageContainer'
			},{ 
				xtype:'container',
				id: 'integrityIndicatorContainer',
				flex:1
			}]
		},{ 
			xtype: 'container',
			id: 'ribbon',
			cls:'ribbon',
			layout: 'column',
			items: [{
				xtype: 'container',
				width:480,
				id: 'pie'
			},{
				xtype: 'container',
				columnWidth:0.999,
				id: 'heatmap'
			}]
		},{
			xtype: 'button',
			id: 'expand-heatmap-button',
			text: 'Expand Heatmap'
		},{
			xtype:'container',
			id:'gridsContainer',
			cls:'grids-container',
			layout: 'column',
			items: [{
				xtype: 'container',
				columnWidth:0.495,
				id: 'gridsLeft',
				cls:'grids-left'
			},{
				xtype: 'container',
				columnWidth:0.495,
				id: 'gridsRight',
				cls:'grids-right'
			}]
		}],
		chartColors: [
			'#AAAAAA', //GRAY
			'#2ECC40', //GREEN
			'#7FDBFF', //AQUA
			'#DDDDDD', //SILVER
			'#39CCCC', //TEAL
			'#01FF70', //LIME
			'#FFDC00', //YELLOW
			'#0074D9' //BLUE
		],
		
		/**************************************** Settings ***************************************/
		settingsScope: 'workspace',
		getSettingsFields: function() {
			return [{
				name: 'Horizontal', 
				xtype: 'rallycheckboxfield'
			},{
				name: 'cacheUrl',
				xtype: 'rallytextfield'
			}];
		},
		config: {
			defaultSettings: {
				cacheUrl:'https://localhost:45557/api/v1.0/custom/rally-app-cache/'
			}
		},
		
		/******************************************************* Caching Mixin operations ********************************************************/
		/**
			NOTE: this requires that me.PortfolioItemTypes is already populated. This is done in 
			the _getCacheIntelRallyAppSettings() function of caching.js
			*/
		_loadModelsForCachedView: function(){ 
			var me=this, 
				promises = [],
				models = { UserStory: 'HierarchicalRequirement' };
			models['PortfolioItem/' + me.PortfolioItemTypes[0]] = 'PortfolioItem/' + me.PortfolioItemTypes[0];
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
		getCacheUrlSetting: function(){
			var me = this;
			return me.getSetting('cacheUrl');
		},	
		getCachePayloadFn: function(payload){
			var me = this;
			
			me.ProjectRecord = payload.ProjectRecord;
			//me.isScopedToScrum = payload.isScopedToScrum ;
			me.ScrumGroupRootRecords = payload.ScrumGroupRootRecords;
			me.ScrumGroupPortfolioOIDs = payload.ScrumGroupPortfolioOIDs;
			me.LeafProjects = payload.LeafProjects;
			me.LeafProjectsByScrumGroup = payload.LeafProjectsByScrumGroup;
			me.LeafProjectsByHorizontal = payload.LeafProjectsByHorizontal;
			me.LeafProjectsByTeamTypeComponent = payload.LeafProjectsByTeamTypeComponent;
			me.ScrumGroupRootRecords = payload.ScrumGroupRootRecords;
			me.FilteredLeafProjects = payload.FilteredLeafProjects;
			me.PortfolioProjectToPortfolioItemMap = payload.PortfolioProjectToPortfolioItemMap;
			me.PortfolioUserStoryCount = payload.PortfolioUserStoryCount;	
			
			return me._loadModelsForCachedView().then(function(){
				me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
						autoLoad: false,
						model: me.UserStory,
						pageSize: 200,
						data: payload.UserStories
				});
				me.fixRawUserStoryAttributes();
				me.fixScheduleStateEditor();				
				me.PortfolioItemStore = Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me['PortfolioItem/' + me.PortfolioItemTypes[0]],
					pageSize: 200,
					data: []
				}); 
			});
		},
		setCachePayLoadFn: function(payload){
			var me = this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				userStoryFields = ['Name', 'ObjectID', 'Project', 'Iteration', 
					'Release',  'PlanEstimate', 'FormattedID', 'ScheduleState','Owner',
					'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem,'_p','_ref',
					'_refObjectUUID','_type','_objectVersion','_CreatedAt'],			
				portfolioItemFields = ['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 
					'Release', 'Description', 'FormattedID', 'UserStories', 'Parent','_p','_ref',
					'_refObjectUUID','_type','_objectVersion','_CreatedAt','InvestmentCategory',
					'DirectChildrenCount'],
				projectFields = ['Children', 'Name', 'ObjectID', 'Parent'];

			function filterProjectData(projectData){
				var data = _.pick(projectData, projectFields);
				data.Parent = _.pick(data.Parent, projectFields);
				data.Children = _.pick(data.Children, ['Count']);
				return { data: data };
			}
			function filterUserStoryForCache(userStoryRecord){
				var data = _.pick(userStoryRecord.data, userStoryFields);
				data.Iteration = data.Iteration ? _.pick(data.Iteration, ['EndDate', 'Name', 'ObjectID', 'StartDate','_refObjectName']) : null;
				data.Project =  _.pick(data.Project, ['Name', 'ObjectID','_refObjectName']);
				data.Owner =  _.pick(data.Owner, ['_refObjectName']);
				data.Release = data.Release ? _.pick(data.Release, ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate']) : null;
				return data;
			}
			
			payload.ProjectRecord = filterProjectData(me.ProjectRecord.data);
		//	payload.isScopedToScrum = me.isScopedToScrum ;
			payload.ScrumGroupRootRecords = _.map(me.ScrumGroupRootRecords, function(ss){ return filterProjectData(ss.data); });
			payload.ScrumGroupPortfolioOIDs = me.ScrumGroupPortfolioOIDs;
			payload.LeafProjects = _.map(me.LeafProjects, function(ss){ return filterProjectData(ss.data); });
			payload.LeafProjectsByScrumGroup = _.reduce(me.LeafProjectsByScrumGroup, function(map, sss, key){ 
				map[key] = _.map(sss, function(ss){ return filterProjectData(ss.data); });
				return map;
			}, {});
			payload.LeafProjectsByHorizontal = _.reduce(me.LeafProjectsByHorizontal, function(map, sss, key){ 
				map[key] = _.map(sss, function(ss){ return filterProjectData(ss.data); });
				return map;
			}, {});
			payload.LeafProjectsByTeamTypeComponent = _.reduce( me.LeafProjectsByTeamTypeComponent, function(map, sss, key){ 
				map[key] = _.map(sss, function(ss){ return filterProjectData(ss.data); });
				return map;
			}, {});
			payload.FilteredLeafProjects = _.map(me.FilteredLeafProjects, function(ss){ return filterProjectData(ss.data); });
			payload.PortfolioProjectToPortfolioItemMap = _.reduce(  me.PortfolioProjectToPortfolioItemMap, function(map, sss, key){ 
				map[key] = _.map(sss, function(ss){ return  _.pick(ss.data,portfolioItemFields); });
				return map;
			}, {});	
			payload.PortfolioUserStoryCount = me.PortfolioUserStoryCount;

			payload.UserStories = _.map(me.UserStoryStore.getRange(), filterUserStoryForCache);
		},
		cacheKeyGenerator: function(){
			var me = this;
			var projectOID = me.getContext().getProject().ObjectID;
			var horizontalName = "";
			if(me.isHorizontalView){
				var horizontalInUrl = !me.isScopedToScrum && me.isHorizontalView && !me.ScopedTeamType;
				horizontalName = horizontalInUrl ? me.Overrides.ScopedHorizontal : me.HorizontalTeamTypeInfo.horizontal;
				horizontalName = horizontalName ? horizontalName :(!me.ScopedHorizontalPicker ?  _.keys(me.HorizontalGroupingConfig.groups).sort()[0] : me.ScopedHorizontalPicker.value) ;				
			}
			var releaseOID = me.ReleaseRecord.data.ObjectID;
			var releaseName = me.ReleaseRecord.data.Name;
			return 'DI-' + (me.isHorizontalView ? horizontalName : projectOID) + '-' + (me.isHorizontalView ? releaseName : releaseOID);
		},
		getCacheTimeoutDate: function(){
		/******************************************************* LAUNCH ********************************************************/
			return new Date(new Date()*1 + 1000*60*60);
		},
		
		loadNonConfigDataFromCacheOrRally: function(){
			var me = this;
			
			Ext.getCmp('cacheMessageContainer').removeAll();
			Ext.getCmp('cacheButtonsContainer').removeAll();
			return me.getCache().then(function(cacheHit){
				if(!cacheHit){
					return me.loadData().then(function(){ 
						if(!me.isScopedToScrum){
							//dont want to cache in the horizontal view if only a team is selected
							//we want to only cache for All in a horizontal view, me.isStandalone checks if its the caching script						
							var doCaching = me.isHorizontalView ? (me.ScopedTeamType === 'All' || (me.TeamPicker ? me.TeamPicker.value === 'All' : "") || me.isStandalone ) : !me.isScopedToScrum;
							if(doCaching){
								me.updateCache().fail(function(e){
									alert(e);
									console.log(e);
								});
							}							
						}
					});
				}else{
					me.renderCacheMessage();
					me.renderGetLiveDataButton();
				}
			});
		},
		loadDataFromCacheOrRally: function(){
			var me = this;
			
			Ext.getCmp('cacheMessageContainer').removeAll();
			Ext.getCmp('cacheButtonsContainer').removeAll();
			return me.getCache().then(function(cacheHit){
				if(!cacheHit){
					return me.loadRemainingConfiguration()
						.then(function(){return me.loadData(); })
						.then(function(){ 
							//dont want to cache in the horizontal view if only a team is selected
							//we want to only cache for All in a horizontal view, me.isStandalone checks if its the caching script							
							var doCaching = me.isHorizontalView ? (me.ScopedTeamType === 'All' || (me.TeamPicker ? me.TeamPicker.value === 'All' : "") || me.isStandalone ) : !me.isScopedToScrum;
							if(doCaching){
								me.updateCache().fail(function(e){
									alert(e);
									console.log(e); 
								});								
							}
						});
				}else{
					me.isHorizontalView ? me.applyProjectFilters() : me.applyScopingOverrides();
					me.renderCacheMessage();
					me.renderGetLiveDataButton();
				}
			});
		},
		loadCacheIndependentConfig: function(){
			var me = this;
			return Q.all([
				me.isHorizontalView ? me._loadHorizontalGroupingConfig() : Q(),
				me.loadReleases()
			])
			.then(function(){
				if(me.isHorizontalView && !me.isStandalone){
					me.ProjectRecord = me.createDummyProjectRecord(me.getContext().getProject());
					me.HorizontalTeamTypeInfo =  me.getHorizontalTeamTypeInfoFromProjectName(me.ProjectRecord.data.Name);
					me.applyScopingOverrides();
				}
			});
		},
		launch: function() {
			var me = this;

			me.isHorizontalView = me.getSetting('Horizontal');
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.initRemoveTooltipOnScroll();
			me.processURLOverrides();
			
			me.setLoading('Loading Configuration');
			me.loadCacheIndependentConfig()
			.then(function(){ return me.loadDataFromCacheOrRally(); })
			.then(function(){ return me.loadUI(); })
			// .then(function(){ return me.registerCustomAppId();  })
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();			
		},

		/**************************************** registerCustomAppId ***************************************/
		registerCustomAppId: function(){
			return this.setCustomAppObjectID(this.getSetting('Horizontal') ? 
				'Intel.DataIntegrityDashboard.Horizontal' : 
				'Intel.DataIntegrityDashboard.Vertical'
			);
		},
		
		/**************************************** Loading Config Items ***********************************/		
		/**
			load releases for current scoped project and set the me.ReleaseRecord appropriately.
		*/
		loadReleases: function() {
			var me = this,
				twelveWeeksAgo = new Date(new Date()*1 - 12*7*24*60*60*1000),
				projectRecord = me.createDummyProjectRecord(me.getContext().getProject());
			
			return me.loadReleasesAfterGivenDate(projectRecord, twelveWeeksAgo).then(function(releaseRecords){
				me.ReleaseRecords = releaseRecords;
				
				// Set the current release to the release we're in or the closest release to the date
				// Important! This sets the current release to an overridden value if necessary
				me.ReleaseRecord = (me.isStandalone ? 
					_.find(me.ReleaseRecords, function(release){ return release.data.Name === me.Overrides.ReleaseName; }) : 
					false) || 
					me.getScopedRelease(me.ReleaseRecords, null, null);
			});
		},
		
		loadRemainingConfiguration: function(){
			var me = this;
			me.ProjectRecord = me.createDummyProjectRecord(me.getContext().getProject());
			//for horizontal view you want to make sure that projects from all the trains are loaded not just that project
			me.isScopedToScrum = me.isHorizontalView ? false :( me.ProjectRecord.data.Children.Count === 0);			
			return me.configureIntelRallyApp()
			.then(function(){ 
				//things that need to be done immediately after configuraing app
				me.fixScheduleStateEditor();
				if(me.isHorizontalView && (!me.HorizontalGroupingConfig || !me.HorizontalGroupingConfig.enabled)) 
					throw "workspace is not configured for horizontals";	
			})
			.then(function(){ return me.loadScrumGroups(); })
			.then(function(){ return me.loadProjects(); })
			.then(function(){ me.applyScopingOverrides(); });
		},
		
		/**
			Load all scrumGroups in horizontal mode, regardless of project scoping. Load scrum group in 
			vertical mode ONLY if we are scoped to a scrumGroupRootRecord
		*/
		loadScrumGroups: function() {
			var me = this;
			me.ScrumGroupRootRecords = [];
			me.ScrumGroupPortfolioOIDs = [];
			
			if(me.isHorizontalView){
				for (var i = 0; i < me.ScrumGroupConfig.length; i++) {
					if (me.ScrumGroupConfig[i].IsTrain){ //only load train scrumGroups in horizontal view
						var dummyScrumGroupRootRecord = me.createDummyProjectRecord({ObjectID: me.ScrumGroupConfig[i].ScrumGroupRootProjectOID});
						me.ScrumGroupRootRecords.push(dummyScrumGroupRootRecord);
						me.ScrumGroupPortfolioOIDs.push(me.getPortfolioOIDForScrumGroupRootProjectRecord(dummyScrumGroupRootRecord));
					}
				}
			}
			else {
				return me.loadProject(me.ProjectRecord.data.ObjectID)
				.then(function(projectRecord){ return me.projectInWhichScrumGroup(projectRecord); })
				.then(function(scrumGroupRootRecord){
					if(scrumGroupRootRecord){
						if(scrumGroupRootRecord.data.ObjectID === me.ProjectRecord.data.ObjectID){ //if scoped to a scrumGroupRootRecord
							me.ScrumGroupRootRecords.push(scrumGroupRootRecord);
							me.ScrumGroupPortfolioOIDs.push(me.getPortfolioOIDForScrumGroupRootProjectRecord(scrumGroupRootRecord));
						}
					}
				});
			}
		},
		
		/**
			NOTE: this does NOT set me.FilteredLeafProjects, which is the list of projects that should be used
			in querying userStories. This only loads all relevent projects 1 time, up front, during the app
			configuration.
		*/
		loadProjects: function() {
			var me = this;	
			me.LeafProjects = [];
			me.LeafProjectsByScrumGroup = {};
			me.LeafProjectsByHorizontal = {};
			me.LeafProjectsByTeamTypeComponent = {};
				
			return Q.all(_.map(me.ScrumGroupRootRecords, function(scrumGroupRootRecord){
				return me.loadAllLeafProjects(scrumGroupRootRecord).then(function(leafProjects){
					me.LeafProjects = me.LeafProjects.concat(_.values(leafProjects));
					me.LeafProjectsByScrumGroup[scrumGroupRootRecord.data.ObjectID] = _.values(leafProjects);
					
					var teamTypes = me.getAllHorizontalTeamTypeInfos(leafProjects);
					for(var i in teamTypes){ 
						me.LeafProjectsByHorizontal[teamTypes[i].horizontal] = me.LeafProjectsByHorizontal[teamTypes[i].horizontal] || [];
						me.LeafProjectsByHorizontal[teamTypes[i].horizontal].push(teamTypes[i].projectRecord);
						for(var j in teamTypes[i].teamTypeComponents){
							var cmp =  teamTypes[i].teamTypeComponents[j];
							me.LeafProjectsByTeamTypeComponent[cmp] = me.LeafProjectsByTeamTypeComponent[cmp] || [];
							me.LeafProjectsByTeamTypeComponent[cmp].push(teamTypes[i].projectRecord);
						}
					}
				});
			}));
		},
		
		applyScopingOverrides: function(){
			var me = this;
			
			//the following code validates URL overrides and sets defaults for viewing projects/horizontals/scrumGroups
			if(!me.isScopedToScrum){
				me.ScopedTeamType = me.Overrides.TeamName || (me.isHorizontalView && !me.isStandalone ? me.HorizontalTeamTypeInfo.teamType : '' ); //could be a teamTypeComponent (for horizontal mode) or scrumName (for vertical mode)
				if(me.isHorizontalView){
					if(me.ScopedTeamType){
						if(!_.contains(me.getAllHorizontalTeamTypeComponents(), me.ScopedTeamType)) throw me.ScopedTeamType + ' is not configured as horizontal teamType';
						me.ScopedHorizontal = me.teamTypeComponentInWhichHorizontal(me.ScopedTeamType);
					}
					else me.ScopedHorizontal = me.Overrides.ScopedHorizontal || _.keys(me.HorizontalGroupingConfig.groups).sort()[0];
					
					if(typeof me.HorizontalGroupingConfig.groups[me.ScopedHorizontal] === 'undefined')
						throw me.ScopedHorizontal + ' is not a valid horizontal';
				}
				else {
					if(me.ScopedTeamType){
						if(!me.ScrumGroupRootRecords.length) throw "cannot specify team when not in ScrumGroup";
						var matchingTeam = _.find(me.LeafProjectsByScrumGroup[me.ScrumGroupRootRecords[0].data.ObjectID], function(p){ 
							return p.data.Name === me.ScopedTeamType;
						});
						if(!matchingTeam) throw me.ScopedTeamType + " is not a valid team";
					}
				}
			}
		},
		
		/**************************************** Data Loading ************************************/
		/**
			Filters only apply if we are in horizontal-mode OR we are scoped to a train in vertical mode 
		*/
		applyProjectFilters: function(){
			var me = this, filteredProjects;
			
			if(me.isScopedToScrum) filteredProjects = [me.ProjectRecord];
			else if(me.isHorizontalView){
				if(me.ScopedTeamType && me.ScopedTeamType !== 'All') filteredProjects = me.LeafProjectsByTeamTypeComponent[me.ScopedTeamType] || [];
				else {
					if(!me.ScopedHorizontal || me.ScopedHorizontal === 'All') filteredProjects = [].concat.apply([], _.values(me.LeafProjectsByHorizontal));
					else filteredProjects = me.LeafProjectsByHorizontal[me.ScopedHorizontal] || [];
				}				
			}
			else {
				if(!me.ScrumGroupRootRecords.length) filteredProjects = [me.ProjectRecord];
				else {
					if(me.ScopedTeamType && me.ScopedTeamType !== 'All') 
						filteredProjects = [_.find(me.LeafProjects, function(leafProject){ return leafProject.data.Name === me.ScopedTeamType; })];
					else filteredProjects = me.LeafProjectsByScrumGroup[me.ScrumGroupRootRecords[0].data.ObjectID] || [];
				}
			}
			me.FilteredLeafProjects = filteredProjects;
			return Q();
		},
		
		/**
			Creates a filter for the portfolio items
		*/
		createPortfolioItemFilter: function() {
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release.Name',
					operator: '=',
					value: releaseName
				}),
				oids = [];
			return releaseFilter;
		},
		
		/**
			Gets portfolio items in the current release associated with the scrum groups (if there are any)
			Also: creates a map of portfolioOID to the portfolioItems loaded under it
		*/
		loadPortfolioItems: function() {
			var me = this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			
			me.PortfolioProjectToPortfolioItemMap = {};
			return Q.all(_.map(me.ScrumGroupPortfolioOIDs, function(portfolioOID){
				var store = Ext.create('Rally.data.wsapi.Store', {
					model: me['PortfolioItem/' + lowestPortfolioItemType],
					filters: [me.createPortfolioItemFilter()],
					autoLoad: false,
					pageSize: 200,
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 
						'Release', 'Description', 'FormattedID', 'UserStories', 'Parent'],
					context: {
						project: '/project/' + portfolioOID,
						projectScopeUp: false,
						projectScopeDown: true
					}
				});
				return me.reloadStore(store).tap(function(store){ 
					me.PortfolioProjectToPortfolioItemMap[portfolioOID] = store.getRange();
				});
			}))
			.then(function(stores){ 
				me.PortfolioItemStore = Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me['PortfolioItem/' + lowestPortfolioItemType],
					pageSize: 200,
					data: [].concat.apply([], _.invoke(stores, 'getRange'))
				});
			});
		},
	
		/**
			Creates a filter for stories that:
				Belong to one of the projects
					AND
				Are in an during the release but not the release OR in the release
		*/
		createStoryFilter: function(leafProjects){			//NOTE: we are filtering for leaf stories here
			var me = this,	
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
				leafStoriesInIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', operator: '=', value: null })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }))),
				projectFilter = _.reduce(leafProjects, function(filter, leafProject){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.ObjectID', value:leafProject.data.ObjectID});
					return filter ? filter.or(newFilter) : newFilter;
				}, null);

			return projectFilter.and(leafStoriesInIterationButNotReleaseFilter.or(releaseNameFilter));
		},
		
		/**
			Loads userstories under leafProjects in chunks of projects at a time. we batch projects to reduce requests sent
		*/
		loadUserStories: function() {
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
				
			me.UserStoryFetchFields = ['Name', 'ObjectID', 'Project', 'Owner', 'PlannedEndDate', 'ActualEndDate', 
				'StartDate', 'EndDate', 'Iteration[StartDate;EndDate]', 'DirectChildrenCount',
				'Release', 'ReleaseStartDate', 'ReleaseDate', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
				'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', 'Description', lowestPortfolioItem];
			
			if(!me.FilteredLeafProjects) throw "No leaf projects for userstory filter";
			
			return Q.all(_.map(_.chunk(me.FilteredLeafProjects, 20), function(leafProjects){
				return me.parallelLoadWsapiStore({
					model: me.UserStory,
					enablePostGet: true,
					autoLoad: false,
					filters: [me.createStoryFilter(leafProjects)],
					fetch: me.UserStoryFetchFields,
					context: { 
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					},
					pageSize: 200
				});
			}))
			.then(function(stores){
				me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					model: me.UserStory,
					pageSize: 200,
					data: [].concat.apply([], _.invoke(stores, 'getRange'))
				});
					/* US436545: Remove this to get back improperly sized user stories */
				_.each(me.UserStoryStore.getRange(), function(item,key){
					var pe = item.data.PlanEstimate;
					if(pe && pe !== 0 && pe !== 1 && pe !== 2 && pe !== 4 && pe !== 8 && pe !== 16){
						me.UserStoryStore.removeAt(key);
					}
				});				
				me.fixRawUserStoryAttributes();
			});
		},
		
		/**
			Counts the number of stories associated with each portfolio item.
			This is only used for 1 of the portfolioItem integrity grids
		*/
		countPortfolioItemStories: function() {
			var me = this;
			if(me.PortfolioItemStore){
				var lowestPortfolioItemType = me.PortfolioItemTypes[0];
				me.PortfolioUserStoryCount = {};
				_.each(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
					me.PortfolioUserStoryCount[portfolioItemRecord.data.ObjectID] = portfolioItemRecord.data.UserStories.Count;
				});
			}
		},
		
		/**
			Control function for loading projects, portfolio items, and stories
		*/
		loadData: function() {
			var me = this;
			me.setLoading('Loading Data');
			return me.applyProjectFilters()
			.then(function(){ return me.loadPortfolioItems(); })
			.then(function() { return me.loadUserStories(); })
			.then(function() {
				me.setLoading(false);
				return me.countPortfolioItemStories();
			});
		},
		
		/**************************************** UI Component Loading/Removing ****************************/
		/**
			Removes the chart, heat map, and all grids
		*/
		removeAllItems: function(){
			var me = this;
			Ext.getCmp('pie').removeAll();
			Ext.getCmp('heatmap').removeAll();
			Ext.getCmp('gridsLeft').removeAll();
			Ext.getCmp('gridsRight').removeAll();
			var indicator = Ext.getCmp('integrityIndicator');
			if(indicator) indicator.destroy();
		},
		
		/**
			the team picker acts as a horizontal TeamType picker in horizontal view mode, and a leaf project picker
			in vertical view mode while scoped to a scrumGroupRootRecord
		*/
		getTeamPickerValues: function() {
			var me = this;
			if(me.isHorizontalView){
				return [{Type:'All'}].concat(
					_.sortBy(_.map(me.HorizontalGroupingConfig.groups[me.ScopedHorizontal] || [], 
						function(type){return {Type:type}; }),
						function(type){return type.Type; })
				);
			}
			else {
				return [{Type: 'All'}].concat(_.sortBy(_.map(me.FilteredLeafProjects, 
					function(project){ return {Type: project.data.Name}; }),
					function(type){ return type.Type; })
				);
			}
		},
		
		/**
			Adds comboboxes in the nav section to filter data on the page
		*/
		renderGetLiveDataButton: function(){
			var me=this;
			me.UpdateCacheButton = Ext.getCmp('cacheButtonsContainer').add({
				xtype:'button',
				text: 'Get Live Data',
				listeners: { 
					click: function(){
						me.setLoading('Pulling Live Data, please wait');
						Ext.getCmp('cacheMessageContainer').removeAll();
						return Q.all([
							me.isHorizontalView ? Q() : me.loadRemainingConfiguration()
						])
						.then(function(){ return me.loadData() ; }) 
						.then(function(){	return me.renderVisuals();})
						.then(function(){ 
							//NOTE: not returning promise here, performs in the background!
							//dont want to cache in the horizontal view if only a team is selected
							//we want to only cache for All in a horizontal view, me.isStandalone checks if its the caching script
							Ext.getCmp('cacheButtonsContainer').removeAll();							
							var doCaching = me.isHorizontalView ? (me.ScopedTeamType === 'All' || ( me.TeamPicker ? me.TeamPicker.value === 'All' : "") || me.isStandalone ) : !me.isScopedToScrum;
							if(doCaching){								
								me.updateCache().fail(function(e){
									alert(e);
									console.log(e);
								});
							}
						})
						.then(function(){ me.setLoading(false); });			
				}
				}
			});
		},		
		renderReleasePicker: function(){
			var me = this;
			me.ReleasePicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelreleasepicker',
				labelWidth: 60,
				width: 240,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.releasePickerSelected.bind(me)
				}
			});
		},
		renderHorizontalGroupPicker: function () {
			var me = this;
			me.ScopedHorizontalPicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelcombobox',
				labelWidth: 60,
				width: 240,
				fieldLabel: 'Horizontal:',
				store: Ext.create('Ext.data.Store', {
					fields: ['Horizontal', 'TeamTypes'],
					data: [{Horizontal:'All', TeamTypes: []}].concat(_.sortBy(_.map(me.HorizontalGroupingConfig.groups, 
						function(teamTypes, horizontal){ return {Horizontal: horizontal, TeamTypes: teamTypes}; }),
						function(item){ return item.Horizontal; })
					)
				}),
				displayField:'Horizontal',
				value:me.ScopedHorizontal,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.horizontalGroupPickerSelected.bind(me)
				}
			});
		},
		renderTeamPicker: function(){
			var me=this;
			me.TeamPicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelcombobox',
				id: 'teampicker',
				labelWidth: 60,
				width: 240,
				fieldLabel: 'Team:',
				store: Ext.create('Ext.data.Store', {
					fields: ['Type'],
					data: me.getTeamPickerValues()
				}),
				displayField:'Type',
				value: me.isHorizontalView ? me.ScopedTeamType : 'All',
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.teamPickerSelected.bind(me)
				}
			});
		},
		
		/**
			MailTo link generating and rendering functions.
		*/
		generateMailtoLink: function() {
			var me = this;
			var base = 'mailto:',
				subject = '&subject=Data%20Integrity%20Dashboard%20View',
				urlSegments = me.Overrides.decodedUrl.split('?'),
				options = [];
				
			// Push options that will always be present
			options.push('isStandalone=true');
			options.push('release=' + me.ReleaseRecord.data.Name);
			
			// Push variable options
			if (me.isHorizontalView) {
				if(me.ScopedTeamType !== '') options.push('team=' + me.ScopedTeamType);
				if(me.ScopedHorizontal) options.push('group=' + me.ScopedHorizontal);
			}
			else if (!me.isScopedToScrum) {
				if(me.ScopedTeamType !== '') options.push('team=' + me.ScopedTeamType);
			}
			
			// Create the correctly encoded app url
			var appUrl = urlSegments[0] + '%3F' + options.join('%26');
			appUrl = appUrl.replace(/\s/g, '%2520');
			
			// Create the full mailto url
			var body = '&body=' + appUrl,
				url = base + subject + body;
			return url;
		},
		setNewEmailLink: function() {
			var me = this;
			if (me.EmailLink) {
				me.EmailLink.setText('<a href="' + me.generateMailtoLink() + '">Email this view</a>', false);
			}
		},
		renderEmailLink: function() {
			var me = this;
			me.EmailLink = Ext.getCmp('emailLinkContainer').add({
				xtype: 'label',
				width:'100%',
				html: '<a href="' + me.generateMailtoLink() + '">Email this view</a>'
			});
		},
		renderCacheMessage: function() {
			var me = this;
			Ext.getCmp('cacheMessageContainer').add({
				xtype: 'label',
				width:'100%',
				html: 'You are looking at the cached version of the data, update last on: ' + '<span class = "modified-date">' + me.lastCacheModified +  '</span>'
			});
		},		
		/**
			Loads all nav controls
		*/
		renderControlsAndEmailLink: function() {
			var me = this;
			
			// Conditionally loads controls
			//if(!me.DeleteCacheButton && !me.isScopedToScrum) me.renderDeleteCache();
			//if(!me.UpdateCacheButton && !me.isScopedToScrum) me.renderGetLiveDataButton();
			if(!me.ReleasePicker) me.renderReleasePicker();
			if(!me.ScopedHorizontalPicker && !me.isScopedToScrum && me.isHorizontalView) me.renderHorizontalGroupPicker();
			if(!me.TeamPicker && !me.isScopedToScrum) me.renderTeamPicker();
			if(me.isStandalone){
				me.ReleasePicker.hide();
				if(me.UpdateCacheButton) me.UpdateCacheButton.hide();
				if(me.ScopedHorizontalPicker) me.ScopedHorizontalPicker.hide();
				if(me.TeamPicker) me.TeamPicker.hide();
			}
			if(!me.EmailLink) me.renderEmailLink();
		},
		
		/**
			Adds the click listener to the expand heatmap button
		*/
		initializeExpandHeatmapButton: function() {
			var me = this;
			me.isPieHidden = false;
			
			// Add click listener to button
			me.down('#expand-heatmap-button').on('click', function() {
				var heatmap = $('#heatmap'),
					ribbon = me.down('#ribbon');
				// Show pie chart
				if (me.isPieHidden) {
					me.down('#pie').setWidth(480);
					button = me.down('#expand-heatmap-button').setText('Expand Heatmap');
				}
				// Hide pie chart
				else {
					me.down('#pie').setWidth(0);
					button = me.down('#expand-heatmap-button').setText('Show Pie');
				}
				
				// Create heat map
				heatmap.empty();
				heatmap.highcharts(me.getHeatMapConfig());
				
				me.isPieHidden = !me.isPieHidden;
				me.hideHighchartsLinks();
			});
		},
		
		/**
			Creates and adds the overall indicator of integrity to the app
		*/
		buildIntegrityIndicator: function(){
			var me=this,
				userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
					return grid.originalConfig.model == 'UserStory'; 
				}).reverse(),
				storyNum = {},
				storyDen = userStoryGrids[0].originalConfig.totalCount,
				pointNum,
				pointDen = userStoryGrids[0].originalConfig.totalPoints,
				storyPer,
				pointPer;
			// Sums the point estimates and number of stories
			_.each(userStoryGrids, function(grid){
				_.each(grid.originalConfig.data, function(item){ 
					storyNum[item.data.ObjectID] = item.data.PlanEstimate || 0; 
				});
			});
			pointNum = (100*(pointDen - _.reduce(storyNum, function(sum, planEstimate){ return sum + planEstimate; }, 0))>>0)/100;
			storyNum = storyDen - Object.keys(storyNum).length;
			storyPer = (storyNum/storyDen*10000>>0)/100;
			pointPer = (pointNum/pointDen*10000>>0)/100;
			
			// Creates the integrity scope label
			// Collective (Release) || Horizontal[/Team] (Release) || ScrumGroup[/Team] (Release) || Team (Release) || ProjectName (Release)
			var scopeLabel = '';
			if(me.isScopedToScrum) scopeLabel = me.ProjectRecord.data.Name;
			else if(me.isHorizontalView){
				if(me.ScopedHorizontal && me.ScopedHorizontal !== 'All'){
					scopeLabel = me.ScopedHorizontal;
					if(me.ScopedTeamType !== '') scopeLabel = scopeLabel.concat('/' + me.ScopedTeamType);
				}
				else scopeLabel = 'Collective';
			}
			else {
				if(me.ScrumGroupRootRecords.length){
					scopeLabel = me.getScrumGroupName(me.ScrumGroupRootRecords[0]);
					if(me.ScopedTeamType !== '') scopeLabel = scopeLabel.concat('/' + me.ScopedTeamType);
				}
				else scopeLabel = me.ProjectRecord.data.Name; //some random non-leaf, non-scrum-group project
			}
			scopeLabel = scopeLabel.concat(' (' + me.ReleaseRecord.data.Name + ')');
			
			// Creates and adds the integrity indicator
			Ext.getCmp('integrityIndicatorContainer').removeAll();
			me.IntegrityIndicator = Ext.getCmp('integrityIndicatorContainer').add({
				xtype:'container',
				id:'integrityIndicator',
				padding:'5px 20px 0 0',
				flex:1,
				layout:{
					type:'hbox',
					pack:'end'
				},
				items:[{
					xtype:'container',
					html:'<span class="integrity-inticator-title">' + 
						scopeLabel +
						' Integrity <em>(% Correct)</em></span><br/>' + 
						'<span class="integrity-indicator-value"><b>Stories: </b>' + storyNum + '/' + storyDen + ' <em>(' + storyPer + '%)</em></span><br/>' +
						'<span class="integrity-indicator-value"><b>Points: </b>' + pointNum + '/' + pointDen + ' <em>(' + pointPer + '%)<em/></span>'
				}]
			});
		},
		
		/**
			Loads all data visuals
		*/
		renderVisuals: function() {
			var me = this;
			me.setLoading('Loading Visuals');
			me.setNewEmailLink();
			me.removeAllItems();
			return me.buildGrids()
				.then(function(){ return Q.all([me.buildRibbon(), me.buildIntegrityIndicator()]); })
				.then(function(){ me.setLoading(false);});
		},
		
		/**		Loads all controls and visuals		*/
		loadUI: function() {
			var me = this;
			me.renderControlsAndEmailLink();
			me.initializeExpandHeatmapButton();
			return me.renderVisuals();
		},
		
		/**************************************** Grids and Charts ********************************/
		getProjectStoriesForGrid: function(project, grid){
			return _.filter(grid.originalConfig.data, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},
		getProjectStoriesForRelease: function(project, grid){
			return _.filter(grid.originalConfig.totalStories, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},
		getProjectPointsForGrid: function(project, grid){
			return _.reduce(this.getProjectStoriesForGrid(project, grid), function(sum, story){
				return sum + story.data.PlanEstimate;
			}, 0);
		},		
		getProjectPointsForRelease: function(project, grid){
			return _.reduce(this.getProjectStoriesForRelease(project, grid), function(sum, story){
				return sum + story.data.PlanEstimate;
			}, 0);
		},
		
		/**
			This is only necessary when we are scoped to a scrumGroupRootRecord or in horizontalMode, and we have
			the me.ScopedTeamType set to a value, in which case we need to filter the user stories we have loaded into memory
		*/
		getFilteredStories: function(){
			var me = this;
			if (!me.isScopedToScrum) {
				if (me.ScopedTeamType !== '' && me.ScopedTeamType !== 'All') {
					if(me.isHorizontalView){
						var validProjectOidMap = _.reduce(me.LeafProjectsByTeamTypeComponent[me.ScopedTeamType], function(m, p){ 
							m[p.data.ObjectID] = true; 
							return m; 
						}, {});
						return _.filter(me.UserStoryStore.getRange(), function(story){ return validProjectOidMap[story.data.Project.ObjectID]; });
					}
					else return _.filter(me.UserStoryStore.getRange(), function(story){ return story.data.Project.Name === me.ScopedTeamType; });
				}
				else return me.UserStoryStore.getRange();
			}
			else return me.UserStoryStore.getRange();
		},
		
		/**
			if in horizontal mode, it only gets the portfolio items attached to scrumGroups 
			that have teams visibile in the DI Dashboard. (e.g.: if two 'H' horizontal teams
			are showing on the page, but they are in trains "Foo" and "Bar", then the portfolioItems
			for "Foo" and "Bar" will be returned.
		
			In Vertical mode, it returns whatever scrumGroup that is scoped to.
		*/
		getFilteredLowestPortfolioItems: function(){ 
			var me = this,
				/* portfolioItems = me.PortfolioItemStore.getRange(), */
				activeScrumGroups, activePortfolioOIDs;
			
			if(me.isScopedToScrum) return [];
			else {
				activeScrumGroups = _.filter(me.ScrumGroupConfig, function(sgc){
					//todo
					return _.filter(me.LeafProjectsByScrumGroup[sgc.ScrumGroupRootProjectOID] || [], function(item1) {
						return _.some(me.FilteredLeafProjects,function(item2){
							return item1.data.ObjectID == item2.data.ObjectID;
						});
					}).length;
					
				});
				activePortfolioOIDs = _.map(activeScrumGroups, function(sgc){
					return me.getPortfolioOIDForScrumGroupRootProjectRecord(me.createDummyProjectRecord({ObjectID: sgc.ScrumGroupRootProjectOID}));
				});
				return [].concat.apply([], _.map(activePortfolioOIDs, function(oid){ return me.PortfolioProjectToPortfolioItemMap[oid]; }));
			}
		},
		
		/************************************ Ribbon rendering ************************************/
		getPieChartConfig: function() { 
			var me=this,
				// Create data for the chart using each grid's data
				chartData = _.map(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid) { 
					return {
						name: grid.originalConfig.title,
						y: grid.originalConfig.data.length,
						totalCount: grid.originalConfig.totalCount,
						gridID: grid.originalConfig.id,
						model: grid.originalConfig.model
					};
				});
			
			// Change data if no problem stories are found
			if(_.every(chartData, function(item){ return item.y === 0; })){
				chartData = [{
					name: 'Everything is correct!',
					y:1,
					totalCount:1,
					color:'#2ECC40', //GREEN
					model:''
				}];
			}
			
			// Create the chart config
			return {
				chart: {
					height:370,
					marginLeft: -15,
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				colors: me.chartColors,
				title: { text: null },
				tooltip: { enabled:false },
				plotOptions: {
					pie: {
						dataLabels: {
							enabled: true,
							distance:25,
							crop:false,
							overflow:'none',
							formatter: function() {
								var str = '<b>' + this.point.name + '</b>: ' + this.point.y;
								return str + '/' + this.point.totalCount;
							},
							style: { 
								cursor:'pointer',
								color: 'black'
							}
						},
						startAngle: 10,
						endAngle: 170,
						center: ['0%', '50%']
					}
				},
				series: [{
					type: 'pie',
					name: 'Grid Count',
					innerSize: '25%',
					size:260,
					point: {
						events: {
							click: function(e) {
								if(e.point.gridID) Ext.get(e.point.gridID).scrollIntoView(me.el);
								e.preventDefault();
							}
						}
					},
					data: chartData
				}]
			};
		},
		getHeatMapConfig: function() { 
			var me=this,
				highestNum = 0,
				userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
					return grid.originalConfig.model == 'UserStory'; 
				}).reverse(),
				chartData = [],
				selectIdFunctionName = '_selectId' + (Math.random()*10000>>0);
			// Get the data for each scrum from each grid
			_.each(userStoryGrids, function(grid, gindex) {
				_.each(_.sortBy(me.FilteredLeafProjects, function(p){ return p.data.Name; }), function(project, pindex){
					var gridCount = me.getProjectStoriesForGrid(project, grid).length;
					highestNum = Math.max(gridCount, highestNum);
					chartData.push([pindex, gindex, gridCount]);
				});
			});
			
			// Function for scrolling to grid
			window[selectIdFunctionName] = function(gridId){
				Ext.get(gridId).scrollIntoView(me.el);
			};
			
			// Create the map config
			return {       
				chart: {
					type: 'heatmap',
					height:370,
					marginTop: 10,
					marginLeft: 140,
					marginBottom: 80
				},
				colors: ['#AAAAAA'],
				title: { text: null },
				xAxis: {
					categories: _.sortBy(_.map(me.FilteredLeafProjects, 
						function(project){ return project.data.Name; }),
						function(p){ return p; }),
					labels: {
						style: { width:100 },
						formatter: function(){
							var text = '<span title="' + this.value + '" class="heatmap-xlabel-text">' + this.value + '</span>';
							return '<a class="heatmap-xlabel">' + text + '</a>';
						},
						useHTML:true,
						rotation: -45
					}
				},
				yAxis: {
					categories: _.map(userStoryGrids, function(grid){ return grid.originalConfig.title; }),
					title: null,
					labels: {
						formatter: function(){
							var text = this.value,
								index = _.indexOf(this.axis.categories, text),
								gridID = userStoryGrids[index].originalConfig.id,
								styleAttr='style="background-color:' + me.chartColors[userStoryGrids.length - index - 1] + '"';
							return '<div class="heatmap-ylabel"' + styleAttr + ' onclick="' + 
												selectIdFunctionName + '(\'' + gridID +  '\')">' + text + '</div>';
						},
						useHTML:true
					}
				},
				colorAxis: {
					min: 0,
					minColor: '#FFFFFF',
					maxColor: highestNum ? '#ec5b5b' : '#FFFFFF' //if they are all 0 make white
				},
				plotOptions: {
					series: {
						point: {
							events: {
								click: function(e){
									var point = this,
										scrum = _.sortBy(me.FilteredLeafProjects, function(p){ return p.data.Name; })[point.x],
										grid = userStoryGrids[point.y];
									me.onHeatmapClick(point, scrum, grid);
								}
							}
						}
					}
				},
				legend: { enabled:false },
				tooltip: { enabled:false },
				series: [{
					name: 'Errors per Violation per Scrum',
					borderWidth: 1,
					data: chartData,
					dataLabels: {
						enabled: true,
						color: 'black',
						style: {
							textShadow: 'none'
						}
					}
				}]  
			};
		},
		hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		buildRibbon: function() {
			var me = this;
			$('#pie').highcharts(me.getPieChartConfig());
			$('#heatmap').highcharts(me.getHeatMapConfig());
			me.hideHighchartsLinks();
		},
		
		/**
			Creates a Rally grid based on the given configuration
		*/
		addGrid: function(gridConfig){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				randFunctionName = '_scrollToTop' + (Math.random()*10000>>0);
				
			window[randFunctionName] = function(){ Ext.get('controlsContainer').scrollIntoView(me.el); };
			
			var getGridTitleLink = function(data, model){
					var hasData = !!data,
						countNum = data && data.length,
						countDen = gridConfig.totalCount,
						pointNum = data && (100*_.reduce(data, function(sum, item){ 
							item = item.data || item;//having issue due to caching so hacking it
							return sum + (item.PlanEstimate || 0); }, 0)>>0)/100,
						pointDen = gridConfig.totalPoints,
						type = (model==='UserStory' ? 'Stories' : lowestPortfolioItemType + 's');
					return sprintf([
						'<span class="data-integrity-grid-header-left">',
							'%s',
							'<span class="data-integrity-grid-header-stats">%s<br/>%s</span>',
						'</span>',
						'<span class="data-integrity-grid-header-top-link"><a onclick="%s()">Top</a></span>'
					].join(''),
					gridConfig.title + (hasData ? '<br>' : ''),
					hasData ? sprintf('<b>%s:</b> %s/%s (%s%%)', type, countNum, countDen, (countNum/countDen*10000>>0)/100) : '',
					(hasData && model=='UserStory') ? sprintf('<b>Points:</b> %s/%s (%s%%)', pointNum, pointDen, (pointNum/pointDen*10000>>0)/100) : '',
					randFunctionName);
				},
				storeModel = (gridConfig.model == 'UserStory') ? me.UserStoryStore.model : me.PortfolioItemStore.model,
				grid = Ext.getCmp('grids' + gridConfig.side).add(gridConfig.data.length ? 
					Ext.create('Rally.ui.grid.Grid', {
						title: getGridTitleLink(gridConfig.data, gridConfig.model),
						id: gridConfig.id,
						cls:'grid-unhealthy data-integrity-grid rally-grid',
						context:this.getContext(),
						columnCfgs: gridConfig.columns,
						enableBulkEdit: true,
						emptyText: ' ',
						originalConfig:gridConfig,
						gridContainer: Ext.getCmp('grids' + gridConfig.side),
						pagingToolbarCfg: {
							pageSizes: [10, 15, 25, 100],
							autoRender: true,
							resizable: false,
							changePageSize: function(combobox, newSize) {
								newSize = newSize[0].get('value');
								if(this._isCurrentPageSize(newSize)) return false;
								else {
									Ext.getCmp(gridConfig.id).reconfigure(Ext.create('Rally.data.custom.Store', {
										model: storeModel,
										pageSize:newSize,
										data: gridConfig.data,
										autoLoad: false
									}));
									this._reRender();
									return true;
								}
							}
						},
						store: Ext.create('Rally.data.custom.Store', {
							model: storeModel,
							pageSize:10,
							data: gridConfig.data,
							autoLoad: false
						})
					}) : 
					Ext.create('Rally.ui.grid.Grid', {
						title: getGridTitleLink(),
						id: gridConfig.id,
						cls:' data-integrity-grid grid-healthy',
						context:this.getContext(),
						showPagingToolbar: false,
						showRowActionsColumn: false,
						emptyText: '0 Problems!',
						originalConfig: gridConfig,
						gridContainer: Ext.getCmp('grids' + gridConfig.side),
						store: Ext.create('Rally.data.custom.Store', {data:[] })
					})
				);
			return grid;
		},
		
		isUserStoryInRelease: function(userStoryRecord, releaseRecord){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			return ((userStoryRecord.data.Release || {}).Name === releaseRecord.data.Name) || 
				(!userStoryRecord.data.Release && ((userStoryRecord.data[lowestPortfolioItem] || {}).Release || {}).Name === releaseRecord.data.Name);
		},	
		
		/**
			Creates grids with filtered results for the user stories/Portfolio items and adds them to the screen
		*/
		buildGrids: function() { 
			var me = this,
				filteredStories = me.getFilteredStories(),
				filteredLowestPortfolioItems = me.getFilteredLowestPortfolioItems(),
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate),
				now = new Date(),
				defaultUserStoryColumns = [{
						text:'FormattedID',
						dataIndex:'FormattedID', 
						editor:false
					},{
						text:'Name',
						dataIndex:'Name', 
						editor:false
					}].concat(!me.CurrentScrum ? [{
						text: 'Scrum', 
						dataIndex: 'Project',
						editor:false
					}] : []).concat([{
						text: 'Owner',
						dataIndex: 'Owner',
						editor: false
					}]),
				defaultLowestPortfolioItemColumns = [{
						text:'FormattedID',
						dataIndex:'FormattedID', 
						editor:false
					},{
						text:'Name',
						dataIndex:'Name', 
						editor:false
					},{
						text:'PlannedEndDate',
						dataIndex:'PlannedEndDate', 
						editor:false
					}],
				gridConfigs = [{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Blocked Stories',
					id: 'grid-blocked-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Blocked',
						dataIndex:'Blocked'
					},{
						text:'Days Blocked',
						tdCls:'editor-cell',
						editor:false,
						renderer:function(val, meta, record){
							var day = 1000*60*60*24;
							// Look, I know this seems silly, but otherwise after editing the refresh will not work
							return record.data.Blocker ? (now - new Date(record.data.Blocker.CreationDate))/day>>0 : 0;
						}
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if((item.data.Release || {}).Name !== releaseName) return false;
						return item.data.Blocked; 
					}
				},{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Unsized Stories',
					id: 'grid-unsized-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'PlanEstimate',
						dataIndex:'PlanEstimate',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if((item.data.Release || {}).Name !== releaseName) return false;
						return item.data.PlanEstimate === null; 
					}
				},/* US436545{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Improperly Sized Stories',
					id: 'grid-improperly-sized-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'PlanEstimate',
						dataIndex:'PlanEstimate',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){
						if((item.data.Release || {}).Name !== releaseName) return false;
						var pe = item.data.PlanEstimate;
						return pe && pe !== 0 && pe !== 1 && pe !== 2 && pe !== 4 && pe !== 8 && pe !== 16;
					}
				}, */{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Stories in Release without Iteration',
					id: 'grid-stories-in-release-without-iteration',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if((item.data.Release || {}).Name !== releaseName) return false;
						return !item.data.Iteration; 
					}
				},{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Stories in Iteration not attached to Release',
					id: 'grid-stories-in-iteration-not-attached-to-release',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						tdCls:'editor-cell'
					},{
						text:'Release',
						dataIndex:'Release',
						tdCls:'editor-cell'
					}]),
					side: 'Right',
					filterFn:function(item){
						if (!item.data.Iteration) return false;
						return (new Date(item.data.Iteration.StartDate) < releaseDate && new Date(item.data.Iteration.EndDate) > releaseStartDate) &&
							(!item.data.Release || item.data.Release.Name.indexOf(releaseName) < 0);
					}
				},{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Unaccepted Stories in Past Iterations',
					id: 'grid-unaccepted-stories-in-past-iterations',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						editor:false
					},{
						text:'ScheduleState',
						dataIndex:'ScheduleState',
						tdCls:'editor-cell'
					}/* ,{
						text:'Description',
						dataIndex:'Description',
						tdCls:'editor-cell'
					} */]),
					side: 'Right',
					filterFn:function(item){
						if((item.data.Release || {}).Name !== releaseName) return false;
						if(!item.data.Iteration) return false;
						return new Date(item.data.Iteration.EndDate) < now && item.data.ScheduleState != 'Accepted';
					}
				},{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'Stories Scheduled After ' + lowestPortfolioItemType + ' End Date',
					id: 'grid-stories-scheduled-after-' + lowestPortfolioItemType + '-end',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						editor:false
					},{
						text: lowestPortfolioItemType,
						dataIndex: lowestPortfolioItemType,
						editor:false
					}]),
					side: 'Right',
					filterFn:function(item){
						if((item.data.Release || {}).Name !== releaseName) return false;
						if(!item.data.Iteration || !item.data[lowestPortfolioItemType] || 
							!item.data[lowestPortfolioItemType].PlannedEndDate || !item.data.Iteration.StartDate) return false;
						if(item.data.ScheduleState == 'Accepted') return false;
						return item.data[lowestPortfolioItemType].PlannedEndDate < item.data.Iteration.StartDate;
					}
				},{
					showIfLeafProject:false,
					showIfHorizontalMode:false,
					title: 'Features with No Stories',
					id: 'grid-features-with-no-stories',
					model: 'PortfolioItem/' + lowestPortfolioItemType,
					columns: defaultLowestPortfolioItemColumns,
					side: 'Right',
					filterFn:function(item){ 
						item = item.data || item;//having issue due to caching so hacking it
						if(!item.Release || item.Release.Name != releaseName) return false;
						return !me.PortfolioUserStoryCount[item.ObjectID];
					}
				}/* ,{
					showIfLeafProject:true,
					showIfHorizontalMode:true,
					title: 'User Stories with No Description',
					id: 'grid-features-with-no-description-for-user-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						editor:false
					},{
						text:'ScheduleState',
						dataIndex:'ScheduleState',
						tdCls:'editor-cell'
					},{
						text:'Description',
						dataIndex:'Description',
						tdCls:'editor-cell'
					}]),
					side: 'Right',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(item.data.Description) return false;												
						if(!item.data.Iteration) return false;											
						return new Date(item.data.Iteration.StartDate) <= now && new Date(item.data.Iteration.EndDate) >= now && !item.data.Description;						
					}
				}	 */			
				];

			return Q.all(_.map(gridConfigs, function(gridConfig){
				if(!gridConfig.showIfLeafProject && (me.isScopedToScrum || me.ScopedTeamType)) return Q();
				else if(!gridConfig.showIfHorizontalMode && me.isHorizontalView) return Q();
				else {
					var list = gridConfig.model == 'UserStory' ? filteredStories : filteredLowestPortfolioItems;
					gridConfig.data = _.filter(list, gridConfig.filterFn);
					gridConfig['total' + (gridConfig.model == 'UserStory' ? 'Stories' : lowestPortfolioItemType + 's')] = list;
					gridConfig.totalCount = list.length;
					gridConfig.totalPoints = (100*_.reduce(list, function(sum, item){ 
						item = item.data || item; //having issue with cache
						return sum + item.PlanEstimate; }, 0)>>0)/100;
					return me.addGrid(gridConfig);
				}
			}));
		},
		
		/**************************************** Event Handling **********************************/
		horizontalGroupPickerSelected: function(combo, records) {
			var me = this;
			me.clearTooltip();
			me.ScopedHorizontal = combo.getValue();
			me.ScopedTeamType = '';
			me.TeamPicker.setValue('All');
			me.setLoading(true);
			me.loadNonConfigDataFromCacheOrRally()
				.then(function(){ return me.renderVisuals(); })
				.then(function(){
					me.TeamPicker.bindStore(Ext.create('Ext.data.Store', {fields: ['Type'],
						data: me.getTeamPickerValues()
					}));
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		releasePickerSelected: function(combo, records){
			var me=this;
			me.clearTooltip();
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			me.setLoading(true);
			me.loadNonConfigDataFromCacheOrRally()
				.then(function(){return me.renderVisuals(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		teamPickerSelected: function(combo, records){
			var me = this;
			me.clearTooltip();
			if (combo.getValue() !== 'All') me.ScopedTeamType = combo.getValue();
			else me.ScopedTeamType = '';
			me.setLoading(true);
			me.applyProjectFilters()
				.then(function(){ return me.renderVisuals(); })
				.fail(function(reason){ me.alert("ERROR", reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		
		/**
			Displays a tool tip when a point on the heat map is clicked
		*/
		onHeatmapClick: function(point, scrum, grid){
			var me=this,
				panelWidth=320,
				rect = point.graphic.element.getBoundingClientRect(),
				leftSide = rect.left,
				rightSide = rect.right,
				topSide = rect.top,
				showLeft = leftSide - panelWidth > 0,
				x = point.x,
				y = point.y,
				storyDen = me.getProjectStoriesForRelease(scrum, grid).length,
				storyNum = me.getProjectStoriesForGrid(scrum, grid).length,
				pointDen = (100*me.getProjectPointsForRelease(scrum, grid)>>0)/100,
				pointNum = (100*me.getProjectPointsForGrid(scrum, grid)>>0)/100,
				storyPer = (10000*storyNum/storyDen>>0)/100,
				pointPer = (10000*pointNum/pointDen>>0)/100;
			
			// Clears tool tip and returns if the position hasn't changed
			if(me.tooltip && me.tooltip.x == x && me.tooltip.y == y) return me.clearTooltip();
			me.clearTooltip();
			
			// Builds the tool tip
			me.tooltip = {
				x:x,
				y:y,
				panel: Ext.widget('container', {
					floating:true,
					width: panelWidth,
					autoScroll:false,
					id:'HeatmapTooltipPanel',
					cls: 'intel-tooltip',
					focusOnToFront:false,
					shadow:false,
					renderTo:Ext.getBody(),
					items: [{
						xtype:'container',
						layout:'hbox',
						cls: 'intel-tooltip-inner-container',
						items:[{
							xtype:'container',
							cls: 'intel-tooltip-inner-left-container',
							flex:1,
							items:[{
								xtype:'rallygrid',
								title: scrum.data.Name,
								columnCfgs:[{
									dataIndex:'Label',
									width:60,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								},{
									text:'Outstanding',
									dataIndex:'Outstanding',
									width:85,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								},{
									text:'Total',
									dataIndex:'Total',
									width:60,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								},{
									text:'% Problem',
									dataIndex:'Percent',
									width:70,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								}],
								store: Ext.create('Rally.data.custom.Store', {
									data:[{
										Label:'Stories',
										Outstanding:storyNum,
										Total:storyDen,
										Percent:storyPer + '%'
									},{
										Label:'Points',
										Outstanding:pointNum,
										Total:pointDen,
										Percent:pointPer + '%'
									}]
								}),
								showPagingToolbar: false,
								showRowActionsColumn: false
							},{
								xtype:'button',
								id:'heatmap-tooltip-goto-button',
								text:'GO TO THIS GRID',
								handler: function(){
									me.clearTooltip();
									Ext.get(grid.originalConfig.id).scrollIntoView(me.el);
								}
							}]
						},{
							xtype:'button',
							cls:'intel-tooltip-close',
							text:'X',
							width:20,
							handler: function(){ me.clearTooltip(); }
						}]
					}],
					listeners:{
						afterrender: function(panel){
							// Move tooltip to left or right depending on space
							panel.setPosition(showLeft ? leftSide-panelWidth : rightSide, topSide);
						}
					}
				})	
			};
			me.tooltip.triangle = Ext.widget('container', {
				floating:true,
				width:0, height:0,
				focusOnToFront:false,
				shadow:false,
				renderTo:Ext.getBody(),
				listeners:{
					afterrender: function(panel){
						setTimeout(function(){
							panel.addCls('intel-tooltip-triangle');
							// Move tooltip to left or right depending on space
							panel.setPosition(showLeft ? leftSide - 10 : rightSide - 10, topSide);
						}, 10);
					}
				}
			});	
		},
		
		/**************************************** Tooltip Functions *******************************/
		clearTooltip: function(){
			var me = this;
			if(me.tooltip){
				me.tooltip.panel.hide();
				me.tooltip.triangle.hide();
				me.tooltip.panel.destroy();
				me.tooltip.triangle.destroy();
				me.tooltip = null;
			}
		},
		initRemoveTooltipOnScroll: function(){
			var me=this;
			setTimeout(function addScrollListener(){
				if(me.getEl()) me.getEl().dom.addEventListener('scroll', function(){ me.clearTooltip(); });
				else setTimeout(addScrollListener, 10);
			}, 0);
		},
		
		/**************************************** Utility Functions *******************************/
		/**
			Searches current URL for override arguments
		*/
		processURLOverrides: function() {
			var me = this;
			// Create overrides object
			me.Overrides = {decodedUrl: decodeURI(window.parent.location.href)};
			// Determine if URL parameters should be used
			me.isStandalone = me.Overrides.decodedUrl.match('isStandalone=true') ? true : false;
			if (me.isStandalone) {
				// Process URL for possible parameters
				me.Overrides.TeamName = me.Overrides.decodedUrl.match('team=.*');
				me.Overrides.TeamName = (me.Overrides.TeamName ? me.Overrides.TeamName[0].slice(5).split('&')[0] : undefined);
				me.Overrides.ScopedHorizontal = me.Overrides.decodedUrl.match('group=.*');
				me.Overrides.ScopedHorizontal = (me.Overrides.ScopedHorizontal ? me.Overrides.ScopedHorizontal[0].slice(6).split('&')[0] : undefined);
				me.Overrides.ReleaseName = me.Overrides.decodedUrl.match('release=.*');
				me.Overrides.ReleaseName = (me.Overrides.ReleaseName ? me.Overrides.ReleaseName[0].slice(8).split('&')[0] : undefined);
			}
		},
		
		createDummyProjectRecord: function(dataObject) {
			return { data: dataObject };
		},
		
		/**
			Fixes the stories so that the sync request pulls the correct data.
			When Rally syncs edited data, the returned object uses the top level
			keys from the raw section of the model.
		*/
		fixRawUserStoryAttributes: function() {
			var me = this,
				stories = me.UserStoryStore.getRange();
			for (var i in stories) {
				for (var j in me.UserStoryFetchFields) {
					if (!stories[i].raw[me.UserStoryFetchFields[j]]) stories[i].raw[me.UserStoryFetchFields[j]] = 0;
				}
			}
		},
		
		/**
			Fixes the schedule state editor for grid editing so that bulk editing does
			not error out. This DOES still set Blocked and Ready appropriately.
			There is a line of code in the original implementation that depends on the ownerCt
			of the combobox to have a reference to the editingPlugin...which we can't give it.
		 
			IMPORTANT! Bulk editing schedule state will not work without this
		*/
		fixScheduleStateEditor: function() {
			var me = this;
			me.UserStory.getField('ScheduleState').editor = {
				xtype: 'rallyfieldvaluecombobox',
				autoExpand: true,
				field: me.UserStory.getField('ScheduleState'),
				selectOnFocus: false,
				editable: false,
				listeners: {
					beforeselect: function() {
						// Set all of the records Blocked and Ready to false
					}
				},
				storeConfig: {
					autoLoad: false
				}
			};
		}
	});
})();
