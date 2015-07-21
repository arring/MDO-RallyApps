/*
 *	This is the hyper-optimized version of the Data Integrity Dashboard. It is capable of viewing
 *	integrity both horizontally and vertically. Use of lodash is minimized for the sake of reducing
 *	function overhead and increasing performance.
 */
(function(){
	var Ext = window.Ext4 || window.Ext;

	/************************** Data Integrity Dashboard *****************************/
	Ext.define('DataIntegrityDashboard', {
		extend: 'Intel.lib.IntelRallyApp',
		// Important! Allows the same code to be used for both the horizontal and the vertical versions of the app
		settingsScope: 'workspace',
		cls:'app',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.DataIntegrityDashboardObjectIDPreference',
			'Intel.lib.mixin.Teams',
			'Intel.lib.mixin.HorizontalGroups'
		],
		minWidth:1100,
		/*
		 *	This layout consists of:
		 *		Top horizontal bar for controls
		 *		Horizontal bar for a pie chart and heat map (the 'ribbon')
		 *		Two columns (referred to as Left and Right) for grids
		 */
		items:[{
			xtype: 'container',
			id: 'controlsContainer',
			layout:'hbox'
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
		_colors: [
			'#AAAAAA', //GRAY
			'#2ECC40', //GREEN
			'#7FDBFF', //AQUA
			'#DDDDDD', //SILVER
			'#39CCCC', //TEAL
			'#01FF70', //LIME
			'#FFDC00', //YELLOW
			'#0074D9' //BLUE
		],
		
		_userAppsPref: 'intel-SAFe-apps-preference',
		/**************************************** Settings ***************************************/
		
		/*
		 *	Creates a single check box to control whether the app is in vertical or horizontal mode
		 */
		getSettingsFields: function() {
			return [{name: 'Horizontal', xtype: 'rallycheckboxfield'}];
		},
		
		/**************************************** Launch *****************************************/
		launch: function() {
			var me = this;
			// App configuration function calls
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me._addScrollEventListener();
			me.setDataIntegrityDashboardObjectID();
			me.setLoading('Loading Configuration');
			me.configureIntelRallyApp()
			.then(function() {
				// Get settings
				me.isHorizontalView = me.getSetting('Horizontal');
				
				// Set up overrides
				me._processOverrides();
				
				// Create dummy project record (eliminates network loading and lag time)
				// This is a fun little hack since almost all functions in IntelRallyApp require a project record
				me.ProjectRecord = me._createDummyProjectRecord(me.getContext().getProject());
				
				// Set up some configuration variables
				me.HorizontalGroups = me.getHorizontalGroups();
				me.isScopedToScrum = (me.ProjectRecord.data.Children.Count === 0);
				
				// Initialize filter variables
				if (me.isHorizontalView && !me.isScopedToScrum) {
					me.HorizontalGroup = me.Overrides.HorizontalGroup || 'ACD';
				}
				if (me.isScopedToScrum) {
					me.TeamType = me.getTeamInfo(me.ProjectRecord).Type;
				}
				else {
					me.TeamType = me.Overrides.TeamName || '';
				}
				
				// Get project groups
				return me._loadGroups();
			})
			.then(function() {
				// Get all data
				return me._getReleases().then(function() {return me._loadData();});
			})
			.then(function() {
				// Add remaining properties to the heatmap expansion button
				me._initializeExpandHeatmapButton();
				// Load remaining UI components
				return me._loadUI();
			})
			// Catch-all fail function
			.fail(function(msg) {
				me.setLoading(false);
				me.alert('Error', msg || 'Unknown error');
			})
			.done();
		},
		
		/**************************************** Overrides ***************************************/
		/*
		 *	Searches current URL for override arguments
		 */
		_processOverrides: function() {
			var me = this;
			// Create overrides object
			me.Overrides = {decodedUrl: decodeURI(window.parent.location.href)};
			// Determine if URL parameters should be used
			me.isStandalone = me.Overrides.decodedUrl.match('isStandalone=true') ? true : false;
			if (me.isStandalone) {
				// Process URL for possible parameters
				me.Overrides.isHorizontalView = me.isHorizontalView = me.Overrides.decodedUrl.match('isHorizontal=true');
				me.Overrides.TeamName = me.Overrides.decodedUrl.match('team=.*');
				me.Overrides.TeamName = (me.Overrides.TeamName ? me.Overrides.TeamName[0].slice(5).split('&')[0] : undefined);
				me.Overrides.HorizontalGroup = me.Overrides.decodedUrl.match('group=.*');
				me.Overrides.HorizontalGroup = (me.Overrides.HorizontalGroup ? me.Overrides.HorizontalGroup[0].slice(6).split('&')[0] : undefined);
				me.Overrides.ReleaseName = me.Overrides.decodedUrl.match('release=.*');
				me.Overrides.ReleaseName = (me.Overrides.CurrentReleaseName ? me.Overrides.CurrentReleaseName[0].slice(8).split('&')[0] : undefined);
			}
		},
		
		/**************************************** Group Loading ***********************************/
		/*
		 *	Creates dummy projects for all train scrum groups
		 */
		_createDummyTrainProjects: function() {
			var me = this;
			for (var i = 0; i < me.ScrumGroupConfig.length; i++) {
				if (me.ScrumGroupConfig[i].IsTrain) {
					me.ProjectGroups.push(
						me._createDummyProjectRecord({
							ObjectID: me.ScrumGroupConfig[i].ScrumGroupRootProjectOID
						})
					);
					// Important! This will be used to load portfolio items
					me.PortfolioProjectObjectIDs.push(me.ScrumGroupConfig[i].PortfolioProjectOID);
				}
			}
		},
		
		/*
		 *	Loads/creates dummy projects for necessary scrum groups based on scope and settings
		 */
		_loadGroups: function() {
			var me = this;
			me.ProjectGroups = [];
			me.PortfolioProjectObjectIDs = [];
			
			if (me.isHorizontalView) {
				me._createDummyTrainProjects();
				return me.ProjectGroups;
			}
			else {
				// Project needs to be fully loaded to use the parent field
				return me.loadProject(me.ProjectRecord.data.ObjectID).then(function(project) {
					return me.projectInWhichScrumGroup(project);
				}).then(function(scrumGroup) {
					if (scrumGroup) {
						if (scrumGroup.data.ObjectID === me.ProjectRecord.data.ObjectID) {
							me.ProjectGroups.push(scrumGroup);
						}
						else {
							me.ProjectGroups.push(me.ProjectRecord);
						}
						// Important! Used to get portfolio projects
						me.PortfolioProjectObjectIDs.push(_.find(me.ScrumGroupConfig, function(group) {return group.ScrumGroupRootProjectOID === scrumGroup.data.ObjectID;}).PortfolioProjectOID);
					}
					else {
						me.ProjectGroups.push(me.ProjectRecord);
						for (var i = 0; i < me.ScrumGroupConfig.length; i++) {
							// If the group is a train, create a dummy project and add to the array
							if (me.ScrumGroupConfig[i].IsTrain) me.PortfolioProjectObjectIDs.push(me.ScrumGroupConfig[i].PortfolioProjectOID);
						}
					}
					return me.ProjectGroups;
				});
			}
		},
		
		/**************************************** Data Loading ************************************/
		/*
		 *	Sorts leaf projects by their scrum group
		 */
		_sortLeafProjectsByGroup: function() {
			var me = this;
			for (var projectIndex = 0; projectIndex < me.AllProjectsByGroup.length; projectIndex++) {
				me.LeafProjectsByGroup.push({});
				for (var oid in me.LeafProjects) {
					if (me.AllProjectsByGroup[projectIndex][oid]) {
						me.LeafProjectsByGroup[projectIndex][oid] = me.LeafProjects[oid];
					}
				}
			}
			me.LeafProjectsByGroup = _.filter(me.LeafProjectsByGroup, function(group) {return Object.keys(group).length !== 0;});
		},
		
		/*
		 *	Loads the leaf projects under the scrum groups
		 */
		_getProjects: function() {
			var me = this;
			me.LeafProjectsByGroup = [];
				
			// External definition to avoid definition within loop
			function concatLeaves(leafProjectsUnderGroup) {
				_.assign(allProjects, leafProjectsUnderGroup);
				return leafProjectsUnderGroup;
			}
			
			// If cache does not exist
			if (!me.TeamInfoMap) {
				var projectPromises = [],
					allProjects = {};
					
				// Fill array with promises for all leaf projects of each scrum group
				for (var i = 0; i < me.ProjectGroups.length; i++) {
					projectPromises.push(me.loadAllLeafProjects(me.ProjectGroups[i]).then(concatLeaves));
				}
				
				// Do promises and filter projects down by group then team
				return Q.all(projectPromises).then(function(groupArray) {
					me.AllProjectsByGroup = groupArray;
					// Cache team info
					me.TeamInfoMap = me.createTeamInfoMap(allProjects);
					// Apply all necessary filters
					me.LeafProjects = me.filterProjectsByTeamType(me.filterProjectsByHorizontalGroup(allProjects, me.HorizontalGroup), me.TeamType);
					me._sortLeafProjectsByGroup();
				});
			}
			else {
				// Apply all necessary filters
				me.LeafProjects = me.filterProjectsByTeamType(me.filterMapByHorizontalGroup(me.TeamInfoMap, me.HorizontalGroup), me.TeamType);
				me._sortLeafProjectsByGroup();
			}
		},
		
		/*
		 *	Loads releases associated with the scrum groups
		 */
		_getReleases: function() {
			var me = this,
				releasePromises = [],
				twelveWeeks = 12*7*24*60*60*1000,
				unfilteredReleases = [];
			
			// External definition to avoid definition within loop
			function concatReleases(releasesUnderGroup) {
				unfilteredReleases = unfilteredReleases.concat(releasesUnderGroup);
				return releasesUnderGroup;
			}
			
			// Fill array with promises for all releases under each group after 12 weeks ago
			for (var i = 0; i < me.ProjectGroups.length; i++) {
				releasePromises.push(me.loadReleasesAfterGivenDate(me.ProjectGroups[i], (new Date()).getTime() - twelveWeeks).then(concatReleases));
			}
			
			return Q.all(releasePromises).then(function() {
				me.Releases = _.uniq(unfilteredReleases, false, function(release) {
					return release.data.Name;
				});
				// Set the current release to the release we're in or the closest release to the date
				// Important! This sets the current release to an overridden value if necessary (that's why it's ridiculously long)
				me.CurrentRelease = (me.isStandalone ? _.find(me.Releases, function(release) {return release.data.Name === me.Overrides.ReleaseName;}) : false) || me.getScopedRelease(me.Releases, null, null);
			});
		},
		
		/*
		 *	Creates a filter for the portfolio items
		 */
		_createPortfolioItemFilter: function() {
			var me = this,
				releaseName = me.CurrentRelease.data.Name,
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release.Name',
					operator: '=',
					value: releaseName
				}),
				oids = [];
			return releaseFilter;
		},
		
		/*
		 *	Gets portfolio items in the current release associated with the scrum groups
		 */
		_getPortfolioItems: function() {
			var me = this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				piStore = Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me['PortfolioItem/' + lowestPortfolioItem],
					pageSize: 200
				}),
				piPromises = [];
			
			// Returns a promise for a store of all stories matching a filter under the project
			function loadStore(project) {
				store = Ext.create('Rally.data.wsapi.Store', {
					model: me['PortfolioItem/' + lowestPortfolioItem],
					filters: [me._createPortfolioItemFilter()],
					autoLoad: false,
					pageSize: 200,
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'Release', 
							'Description', 'FormattedID', 'UserStories', 'Parent'],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: project.data._ref,
						projectScopeUp: false,
						projectScopeDown: true
					}
				});
				
				return me.reloadStore(store);
			}
			
			// External definition to avoid declaring within loop
			function addRecordsToStore(store) {
				piStore.add(store.getRange());
				return store;
			}
			
			// Create a promise for the portfolio project of each scrum group
			for (var i in me.PortfolioProjectObjectIDs) {
				piPromises.push(
					me.loadProject(me.PortfolioProjectObjectIDs[i]).then(loadStore).then(addRecordsToStore)
				);
			}
			
			return Q.all(piPromises).then(function(stores) {
				me.PortfolioItemStore = piStore;
				return piStore;
			});
		},
	
		/*
		 *	Creates a filter for stories that:
		 *		Belong to one of the projects
		 *					AND
		 *		Are in an during the release but not the release OR in the release
		 */
		_createStoryFilter: function(projects){			
			var me = this,
				releaseName = me.CurrentRelease.data.Name,
				releaseDate = me.CurrentRelease.data.ReleaseDate.toISOString(),
				releaseStartDate = me.CurrentRelease.data.ReleaseStartDate.toISOString(),
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),// this will ONLY get leaf-stories (good)
				// Filter for user stories that in iteration not a release
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', operator: '!=', value: releaseName })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }))),
				projectFilter;
				
			// There must be leaf projects in order to create a valid filter
			if(me.LeafProjects && Object.keys(me.LeafProjects).length > 0) {
				// Create a filter for all user stories within the leaf projects
				var keys = Object.keys(projects),
					newFilter;
				for (var i = 0; i < keys.length; i++) {
					newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.ObjectID', value: parseInt(keys[i], 10)});
					if (projectFilter) {
						projectFilter = projectFilter.or(newFilter);
					}
					else {
						projectFilter = newFilter;
					}
				}
			}
			else return undefined;

			return Rally.data.wsapi.Filter.and([
				projectFilter, 
				Rally.data.wsapi.Filter.or([inIterationButNotReleaseFilter, releaseNameFilter])
			]);
		},
		
		/*
		 *	Gets the filtered user stories under the filtered projects
		 */
		_getStories: function() {
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				filter,
				fetchFields = ['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
					'Release', 'ReleaseStartDate', 'ReleaseDate', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
					'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem],
				promises = [];
			
			// Create promises for parallel loading stories under leaf projects under each group
			for (var groupIndex in me.LeafProjectsByGroup) {
				filter = me._createStoryFilter(me.LeafProjectsByGroup[groupIndex]);
				var config = {
					model: me.UserStory,
					enablePostGet: true,
					autoLoad: false,
					filters: [filter],
					fetch: fetchFields,
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: me.ProjectGroups[groupIndex].data._ref,
						projectScopeUp: false,
						projectScopeDown: true
					},
					pageSize: 200
				};
				promises.push(me.parallelLoadWsapiStore(config));
			}
			
			// Do promises then compile stories into one store
			return Q.all(promises).then(function(stores) {
				me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					model: me.UserStory,
					pageSize: 200,
					data: []
				});
				for (var i = 0; i < stores.length; i++) {
					me.UserStoryStore.add(stores[i].getRange());
				}
			});
		},
		
		/*
		 *	Counts the number of stories associated with each portfolio item
		 */
		_countPortfolioItemStories: function() {
			var me = this;
			if(me.PortfolioItemStore){
				var lowestPortfolioItemType = me.PortfolioItemTypes[0];
				me.PortfolioUserStoryCount = {};
				_.each(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
					me.PortfolioUserStoryCount[portfolioItemRecord.data.ObjectID] = portfolioItemRecord.data.UserStories.Count;
				});
			}
		},
		
		/*
		 *	Control function for loading projects, portfolio items, and stories
		 */
		_loadData: function() {
			var me = this;
			me.setLoading('Loading Data');
			return Q.all([
				me._getProjects(),
				me._getPortfolioItems()
			]).then(function() {
				return me._getStories();
			}).then(function() {
				me.setLoading(false);
				return me._countPortfolioItemStories();
			});
		},
		/**************************************** UI Functions ************************************/
		/*
		 *	Removes the chart, heat map, and all grids
		 */
		_removeAllItems: function(){
			var me = this;
			Ext.getCmp('pie').removeAll();
			Ext.getCmp('heatmap').removeAll();
			Ext.getCmp('gridsLeft').removeAll();
			Ext.getCmp('gridsRight').removeAll();
			var indicator = Ext.getCmp('integrityIndicator');
			if(indicator) indicator.destroy();
		},
		
		/**************************************** UI Component Loading ****************************/
		/*
		 *	Adds the click listener to the expand heatmap button
		 */
		_initializeExpandHeatmapButton: function() {
			var me = this;
			me.isPieHidden = false;
			
			// Add click listener to button
			me.down('#expand-heatmap-button').on('click', function() {
				var me = this,
					heatmap = $('#heatmap'),
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
				heatmap.highcharts(me._getHeatMapConfig());
				
				me.isPieHidden = !me.isPieHidden;
				me._hideHighchartsLinks();
			}, me);
		},
		
		/*
		 *	Loads the release picker
		 */
		_loadReleasePicker: function(){
			var me = this;
			me.ReleasePicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelreleasepicker',
				labelWidth: 50,
				width: 240,
				releases: me.Releases,
				currentRelease: me.CurrentRelease,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},
		
		/*
		 *	Loads the horizontal group picker
		 */
		_loadHorizontalGroupPicker: function () {
			var me = this;
			me.HorizontalGroupPicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelcombobox',
				width: 200,
				padding:'0 0 0 40px',
				fieldLabel: 'Group:',
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Group', 'Teams'],
					data: [{Group:'All', Teams: []}].concat(_.map(Object.keys(me.HorizontalGroups), function(key) {return {Group: key, Teams: me.HorizontalGroups[key]};}))
				}),
				displayField:'Group',
				value:me.HorizontalGroup,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._horizontalGroupPickerSelected.bind(me)
				}
			});
		},
		
		/*
		 *	Gets the values for the team picker combo box
		 */
		_getTeamPickerValues: function() {
			var me = this;
			if (me.isHorizontalView) {
				return [{Type:'All'}].concat(
					// In English: get all unique function keywords from the active scrums and sort them alphabetically
					_.sortBy(
						_.uniq(
							_.map(
								_.reduce(me.LeafProjects, function(a, project) {return a.concat(me.getTeamInfo(project).KeyWords);}, []),
								function(type) {return {Type: type};}
							),
							function(key) {return key.Type;}
						),
						function(key) {return key.Type;}
					)
				);
			}
			else {
				return [{Type: 'All'}].concat(_.sortBy(_.map(me.LeafProjects, function(project) {
						return {Type: project.data.Name};
					}),
					function(key) {return key.Type;}
				));
			}
		},
		
		/*
		 *	Loads the team picker
		 */
		_loadTeamPicker: function(){
			var me=this;
			me.TeamPicker = Ext.getCmp('controlsContainer').add({
				id: 'teampicker',
				xtype:'intelcombobox',
				width: 200,
				padding:'0 0 0 40px',
				fieldLabel: 'Team:',
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Type'],
					data: me._getTeamPickerValues()
				}),
				displayField:'Type',
				value:'All',
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._teamPickerSelected.bind(me)
				}
			});
		},
		
		/*
		 *	Generates the url the current view
		 */
		_generateMailto: function() {
			var me = this;
			var base = 'mailto:',
				subject = '&subject=Data%20Integrity%20Dashboard%20View',
				urlSegments = me.Overrides.decodedUrl.split('?'),
				options = [];
				
			// Push options that will always be present
			options.push('isStandalone=true');
			options.push('isHorizontal=' + me.isHorizontalView);
			options.push('release=' + me.CurrentRelease.data.Name);
			
			// Push variable options
			if (me.isHorizontalView) {
				if (me.TeamType !== '') {
					options.push('team=' + me.TeamType);
				}
				if (me.HorizontalGroup) {
					options.push('group=' + me.HorizontalGroup);
				}
			}
			else if (!me.isScopedToScrum) {
				if (me.TeamType !== '') {
					options.push('team=' + me.TeamType);
				}
			}
			
			// Create the correctly encoded app url
			var appUrl = urlSegments[0] + '%3F' + options.join('%26');
			appUrl = appUrl.replace(/\s/g, '%2520');
			
			// Create the full mailto url
			var body = '&body=' + appUrl,
				url = base + subject + body;
			return url;
		},
		
		/*
		 *	Updates the email link
		 */
		_setNewEmailLink: function() {
			var me = this;
			if (me.EmailLink) {
				me.EmailLink.setText('<a href="' + me._generateMailto() + '">Email this view</a>', false);
			}
		},
		
		/*
		 *	Create link to email current view
		 */
		_loadEmailLink: function() {
			var me = this;
			me.EmailLink = Ext.getCmp('controlsContainer').add({
				xtype: 'label',
				width: 200,
				padding: '0 0 0 40px',
				html: '<a href="' + me._generateMailto() + '">Email this view</a>'
			});
		},
		
		/*
		 *	Loads all controls
		 */
		_loadControls: function() {
			var me = this;
			
			// Conditionally loads controls
			if (!me.ReleasePicker) me._loadReleasePicker();
			if (!me.HorizontalGroupPicker && !me.isScopedToScrum && me.isHorizontalView) me._loadHorizontalGroupPicker();
			if (!me.TeamPicker && !me.isScopedToScrum) me._loadTeamPicker();
			if (me.isStandalone) {
				me.ReleasePicker.hide();
				if (me.HorizontalGroupPicker) me.HorizontalGroupPicker.hide();
				if (me.TeamPicker) me.TeamPicker.hide();
			}
			if (!me.EmailLink) me._loadEmailLink();
		},
		
		/*
		 *	Creates and adds the overall indicator of integrity to the app
		 */
		_buildIntegrityIndicator: function(){
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
				_.each(grid.originalConfig.data, function(item){ storyNum[item.data.ObjectID] = item.data.PlanEstimate; });
			});
			pointNum = (100*(pointDen - _.reduce(storyNum, function(sum, planEstimate){ return sum + planEstimate; }, 0))>>0)/100;
			storyNum = storyDen - Object.keys(storyNum).length;
			storyPer = (storyNum/storyDen*10000>>0)/100;
			pointPer = (pointNum/pointDen*10000>>0)/100;
			
			// Creates the integrity scope label
			// Collective (Release) || Group[/Team] (Release) || Team (Release) || ProjectName (Release)
			var scopeLabel = '';
			if (me.isHorizontalView) {
				if (me.HorizontalGroup) {
					if (me.HorizontalGroup !== 'All') {
						scopeLabel = me.HorizontalGroup;
						if (me.TeamType !== '') {
							scopeLabel = scopeLabel.concat('/' + me.TeamType);
						}
					}
					else {
						if (me.TeamType !== '') {
							scopeLabel = me.TeamType;
						}
						else {
							scopeLabel = 'Collective';
						}
					}
				}
				else {
					if (me.TeamType !== '') {
						scopeLabel = me.TeamType;
					}
					else {
						scopeLabel = 'Collective';
					}
				}
			}
			else {
				if (me.isScopedToScrum) {
					scopeLabel = me.ProjectRecord.data.Name;
				}
				else {
					scopeLabel = me.ProjectRecord.data.Name;
					if (me.TeamType !== '') {
						scopeLabel = scopeLabel.concat('/' + me.TeamType);
					}
				}
			}
			scopeLabel = scopeLabel.concat(' (' + me.CurrentRelease.data.Name + ')');
			
			// Creates and adds the integrity indicator
			me.IntegrityIndicator = Ext.getCmp('controlsContainer').add({
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
		
		/*
		 *	Loads all data visuals
		 */
		_loadVisuals: function() {
			var me = this;
			me.setLoading('Loading Visuals');
			me._setNewEmailLink();
			me._removeAllItems();
			return me._buildGrids().then(function(){ 
				// Grids must exists in order for calculations to be made
				return Q.all([
					me._buildRibbon(),
					me._buildIntegrityIndicator()
				]).then(function() {
					me.setLoading(false);
				});
			});
		},
		
		/*
		 *	Loads all controls and visuals
		 */
		_loadUI: function() {
			var me = this;
			me._loadControls();
			return me._loadVisuals();
		},
		
		/**************************************** Grids and Charts ********************************/
		_getProjectStoriesForGrid: function(project, grid){
			return _.filter(grid.originalConfig.data, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},
		_getProjectStoriesForRelease: function(project, grid){
			return _.filter(grid.originalConfig.totalStories, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},
		_getProjectPointsForGrid: function(project, grid){
			return _.reduce(this._getProjectStoriesForGrid(project, grid), function(sum, story){
				return sum + story.data.PlanEstimate;
			}, 0);
		},		
		_getProjectPointsForRelease: function(project, grid){
			return _.reduce(this._getProjectStoriesForRelease(project, grid), function(sum, story){
				return sum + story.data.PlanEstimate;
			}, 0);
		},
		
		/*
		 *	Gets the stories for the grid, filtering by team name or displaying all
		 */
		_getFilteredStories: function(){
			var me = this;
			if (!me.isScopedToScrum) {
				if (me.TeamType !== '' && me.TeamType !== 'All') {
					var re = new RegExp(me.TeamType);
					return _.filter(me.UserStoryStore.getRange(), function(story){ 
						return re.test(story.data.Project.Name);
					});
				}
				else {
					return me.UserStoryStore.getRange();
				}
			}
			else {
				return me.UserStoryStore.getRange();
			}
		},
		
		/*
		 *	Gets the collection of items of the lowest portfolio item type
		 */
		_getFilteredLowestPortfolioItems: function(){ 
			var me = this,
				activeGroups = {},
				activeProjects = me.filterProjectsByTeamType(me.LeafProjects, me.TeamType),
				portfolioItems = me.PortfolioItemStore.getRange(),
				filteredPortfolioItems = [];
				
			// Determine the active scrum groups (those that have projects remaining after filtering by group and team type)
			for (var i in activeProjects) {
				for (var j in me.ScrumGroupConfig) {
					if (!activeGroups[me.ScrumGroupConfig[j].PortfolioProjectOID] && me.ScrumGroupConfig[j].ScrumGroupName.indexOf(me.TeamInfoMap[activeProjects[i].data.ObjectID].info.Train) > -1) {
						activeGroups[me.ScrumGroupConfig[j].PortfolioProjectOID] = me.ScrumGroupConfig[j];
					}
				}
			}
			
			// If the portfolio item's project or that project's parent is an active scrum group, use it
			for (var k in portfolioItems) {
				if (activeGroups[portfolioItems[k].data.Project.Parent.ObjectID] || activeGroups[portfolioItems[k].data.Project.ObjectID]) {
					filteredPortfolioItems.push(portfolioItems[k]);
				}
			}
			return filteredPortfolioItems;
		},
		
		/*
		 *	Gets the configuration of the pie chart
		 */
		_getPieChartConfig: function() { 
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
				colors: me._colors,
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
		
		/*
		 *	Gets the configuration of the heat map
		 */
		_getHeatMapConfig: function() { 
			var me=this,
				highestNum = 0,
				userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
					return grid.originalConfig.model == 'UserStory'; 
				}).reverse(),
				chartData = [],
				selectIdFunctionName = '_selectId' + (Math.random()*10000>>0);
				
			// Get the data for each scrum from each grid
			_.each(userStoryGrids, function(grid, gindex) {
				_.each(_.sortBy(me.filterProjectsByTeamType(me.filterProjectsByHorizontalGroup(me.LeafProjects, me.HorizontalGroup), me.TeamType), function(p){ return p.data.Name; }), function(project, pindex){
					var gridCount = me._getProjectStoriesForGrid(project, grid).length;
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
					categories: _.sortBy(_.map(me.filterProjectsByTeamType(me.filterProjectsByHorizontalGroup(me.LeafProjects, me.HorizontalGroup), me.TeamType), 
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
								styleAttr='style="background-color:' + me._colors[userStoryGrids.length - index - 1] + '"';
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
										scrum = _.sortBy(me.LeafProjects, function(p){ return p.data.Name; })[point.x],
										grid = userStoryGrids[point.y];
									me._onHeatmapClick(point, scrum, grid);
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
		
		/*
		 *	Creates and adds all charts
		 */
		_buildRibbon: function() {
			var me = this;
			$('#pie').highcharts(me._getPieChartConfig());
			$('#heatmap').highcharts(me._getHeatMapConfig());
			me._hideHighchartsLinks();
		},
		
		/*
		 *	Creates a Rally grid based on the given configuration
		 */
		_addGrid: function(gridConfig){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				randFunctionName = '_scrollToTop' + (Math.random()*10000>>0);
				
			window[randFunctionName] = function(){ Ext.get('controlsContainer').scrollIntoView(me.el); };
			
			var getGridTitleLink = function(data, model){
					var hasData = !!data,
						countNum = data && data.length,
						countDen = gridConfig.totalCount,
						pointNum = data && (100*_.reduce(data, function(sum, item){ return sum + item.data.PlanEstimate; }, 0)>>0)/100,
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
						columnCfgs: gridConfig.columns,
						enableBulkEdit: true,
						emptyText: ' ',
						originalConfig:gridConfig,
						gridContainer: Ext.getCmp('grids' + gridConfig.side),
						pagingToolbarCfg: {
							pageSizes: [10, 15, 25, 100],
							autoRender: true,
							resizable: false
						},
						store: Ext.create('Rally.data.custom.Store', {
							model: storeModel,
							pageSize:10,
							data: gridConfig.data,
							autoLoad: false
						})
					}) : 
					Ext.create('Rally.ui.grid.Grid', {
						xtype:'rallygrid',
						title: getGridTitleLink(),
						id: gridConfig.id,
						cls:' data-integrity-grid grid-healthy',
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
		
		/*
		 *	Creates grids with filtered results for the user stories and adds them to the screen
		 */
		_buildGrids: function() { 
			var me = this,
				filteredStories = me._getFilteredStories(),
				filteredLowestPortfolioItems = me._getFilteredLowestPortfolioItems(),
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				releaseName = me.CurrentRelease.data.Name,
				releaseDate = new Date(me.CurrentRelease.data.ReleaseDate),
				releaseStartDate = new Date(me.CurrentRelease.data.ReleaseStartDate),
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
					}] : []),
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
					title: 'Blocked Stories',
					id: 'grid-blocked-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Blocked',
						dataIndex:'Blocked'
					},{
						text:'BlockedReason',
						dataIndex:'BlockedReason',
						tdCls:'editor-cell'
					},{
						text:'Days Blocked',
						tdCls:'editor-cell',
						editor:false,
						renderer:function(val, meta, record){
							var day = 1000*60*60*24;
							return (now - new Date(record.data.Blocker.CreationDate))/day>>0;
						}
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return item.data.Blocked; 
					}
				},{
					showIfLeafProject:true,
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
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return item.data.PlanEstimate === null; 
					}
				},{
					showIfLeafProject:true,
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
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(item.data.Children.Count === 0) return false;
						var pe = item.data.PlanEstimate;
						return pe && pe !== 0 && pe !== 1 && pe !== 2 && pe !== 4 && pe !== 8 && pe !== 16;
					}
				},{
					showIfLeafProject:true,
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
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return !item.data.Iteration; 
					}
				},{
					showIfLeafProject:true,
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
						/* if(!item.data.Iteration || item.data.Release) return false;
						return item.data.Iteration.StartDate < releaseDate && 
							item.data.Iteration.EndDate > releaseStartDate; */
						if (!item.data.Iteration) return false;
						return (new Date(item.data.Iteration.StartDate) < releaseDate && new Date(item.data.Iteration.EndDate) > releaseStartDate) &&
							(!item.data.Release || item.data.Release.Name.indexOf(releaseName) < 0);
					}
				},{
					showIfLeafProject:true,
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
					}]),
					side: 'Right',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration) return false;
						return new Date(item.data.Iteration.EndDate) < now && item.data.ScheduleState != 'Accepted';
					}
				},{
					showIfLeafProject:true,
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
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration || !item.data[lowestPortfolioItemType] || 
							!item.data[lowestPortfolioItemType].PlannedEndDate || !item.data.Iteration.StartDate) return false;
						if(item.data.ScheduleState == 'Accepted') return false;
						return item.data[lowestPortfolioItemType].PlannedEndDate < item.data.Iteration.StartDate;
					}
				},{
					showIfLeafProject:false,
					title: 'Features with No Stories',
					id: 'grid-features-with-no-stories',
					model: 'PortfolioItem/' + lowestPortfolioItemType,
					columns: defaultLowestPortfolioItemColumns,
					side: 'Right',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return !me.PortfolioUserStoryCount[item.data.ObjectID];
					}
				}];

			return Q.all(_.map(gridConfigs, function(gridConfig){
				if(!gridConfig.showIfLeafProject && me.isScopedToScrum) return Q();
				else {
					var list = gridConfig.model == 'UserStory' ? filteredStories : filteredLowestPortfolioItems;
					gridConfig.data = _.filter(list, gridConfig.filterFn);
					gridConfig['total' + (gridConfig.model == 'UserStory' ? 'Stories' : lowestPortfolioItemType + 's')] = list;
					gridConfig.totalCount = list.length;
					gridConfig.totalPoints = (100*_.reduce(list, function(sum, item){ return sum + item.data.PlanEstimate; }, 0)>>0)/100;
					return me._addGrid(gridConfig);
				}
			}))
			.fail(function(reason){ me.alert('ERROR:', reason); });
		},
		
		/**************************************** Event Handling **********************************/
		/*
		 *	Reloads the page with new data and saves the selection in the app preferences
		 */
		_releasePickerSelected: function(combo, records){
			var me=this;
			me._clearToolTip();
			me.setLoading();
			me.CurrentRelease = _.find(me.Releases, function(rr){ return rr.data.Name == records[0].data.Name; });
			return me._loadData().then(function() {return me._loadVisuals();});
		},
		
		/*
		 *	Changes the group to filter by and reloads data
		 */
		_horizontalGroupPickerSelected: function(combo, records) {
			var me = this;
			me._clearToolTip();
			me.setLoading(true);
			me.HorizontalGroup = combo.getValue();
			me.TeamType = '';
			me.TeamPicker.setValue('All');
			return me._loadData().then(function() {
				return me._loadVisuals();
			}).then(function() {
				me.TeamPicker.bindStore(Ext.create('Ext.data.Store', {
					fields: ['Type'],
					data: me._getTeamPickerValues()
				}));
				me.setLoading(false);
			});
		},
		
		/*
		 *	Changes the team name to filter by and reloads all graphical elements
		 */
		_teamPickerSelected: function(combo, records){
			var me = this;
			me._clearToolTip();
			me.setLoading(true);
			if (combo.getValue() !== 'All') me.TeamType = combo.getValue();
			else me.TeamType = '';
			return me._loadVisuals();
		},
		
		/*
		 *	Displays a tool tip when a point on the heat map is clicked
		 */
		_onHeatmapClick: function(point, scrum, grid){
			var me=this,
				panelWidth=320,
				rect = point.graphic.element.getBoundingClientRect(),
				leftSide = rect.left,
				rightSide = rect.right,
				topSide = rect.top,
				showLeft = leftSide - panelWidth > 0,
				x = point.x,
				y = point.y,
				storyDen = me._getProjectStoriesForRelease(scrum, grid).length,
				storyNum = me._getProjectStoriesForGrid(scrum, grid).length,
				pointDen = (100*me._getProjectPointsForRelease(scrum, grid)>>0)/100,
				pointNum = (100*me._getProjectPointsForGrid(scrum, grid)>>0)/100,
				storyPer = (10000*storyNum/storyDen>>0)/100,
				pointPer = (10000*pointNum/pointDen>>0)/100;
			
			// Clears tool tip and returns if the position hasn't changed
			if(me.tooltip && me.tooltip.x == x && me.tooltip.y == y) return me._clearToolTip();
			me._clearToolTip();
			
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
									me._clearToolTip();
									Ext.get(grid.originalConfig.id).scrollIntoView(me.el);
								}
							}]
						},{
							xtype:'button',
							cls:'intel-tooltip-close',
							text:'X',
							width:20,
							handler: function(){ me._clearToolTip(); }
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
		/*
		 *	Removes the tool tip from the screen
		 */
		_clearToolTip: function(){
			var me = this;
			if(me.tooltip){
				me.tooltip.panel.hide();
				me.tooltip.triangle.hide();
				me.tooltip.panel.destroy();
				me.tooltip.triangle.destroy();
				me.tooltip = null;
			}
		},
		/*
		 *	Clears the tool tip at the start of scrolling
		 */
		_addScrollEventListener: function(){
			var me=this;
			setTimeout(function addScrollListener(){
				if(me.getEl()) me.getEl().dom.addEventListener('scroll', function(){ me._clearToolTip(); });
				else setTimeout(addScrollListener, 10);
			}, 0);
		},
		
		/**************************************** Utility Functions *******************************/
		/*
		 *	Creates a dummy project record with only necessary data fields populated
		 */
		_createDummyProjectRecord: function(dataObject) {
			return {
				data: dataObject
			};
		},
		
		/*
		 *	Hides the Highcharts link
		 */
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		}
	});
})();
