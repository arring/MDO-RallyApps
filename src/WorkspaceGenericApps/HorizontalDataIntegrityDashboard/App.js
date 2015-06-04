(function(){
	var Ext = window.Ext4 || window.Ext;

	/************************** Data Integrity Dashboard *****************************/
	Ext.define('DataIntegrityDashboard', {
		extend: 'IntelRallyApp',
		settingsScope: 'app',
		cls:'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ParallelLoader',
			'UserAppsPreference',
			'DataIntegrityDashboardObjectIDPreference'
		],	
		minWidth:1100,
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
		/***************************************************** Settings *****************************************************/
		getSettingsFields: function() {
			return [{name: 'Horizontal', xtype: 'rallycheckboxfield'}];
		},
		
		/***************************************************** Store Loading ************************************************/
		/*
		 *	Creates a Filter object for user stories that are:
		 *		In a leaf project of the current scope AND
		 *		In an iteration but not a release OR in the currently scoped release
		 */
		_getUserStoryFilter: function(start, end){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),// this will ONLY get leaf-stories (good)
				// Filter for user stories that in iteration not a release
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 })),
				userStoryProjectFilter;
			// If there were projects
			if(me.LeafProjects && Object.keys(me.LeafProjects).length > 0) {
				// Create a filter for all user stories within the leaf projects
				var keys = Object.keys(me.LeafProjects),
					newFilter;
				for (var i = start; i < end && i < keys.length; i++) {
					newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.ObjectID', value: parseInt(keys[i], 10)});
					if (userStoryProjectFilter) {
						userStoryProjectFilter = userStoryProjectFilter.or(newFilter);
					}
					else {
						userStoryProjectFilter = newFilter;
					}
				}
			}
			else return undefined;

			return Rally.data.wsapi.Filter.and([
				userStoryProjectFilter, 
				Rally.data.wsapi.Filter.or([inIterationButNotReleaseFilter, releaseNameFilter])
			]);
		},

		/*
		 * Loads batches of users stories filtered by the return of _getUserStoryFilter()
		 */
		_getStories: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				keyCount = Object.keys(me.LeafProjects).length,
				filter,
				promises = [],
				step = 50;
			for (var leafStart = 0, leafEnd = step; leafStart < keyCount; leafStart += step, leafEnd += step) {
				filter = me._getUserStoryFilter(leafStart, leafEnd);
				var config = {
					model: me.UserStory,
					url: me.BaseUrl + '/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query:filter.toString(),
						// DEBUG reduced number of fetch items to optimize performance
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', /*'Description',*/ /*'Tasks',*/ 'PlanEstimate', 'FormattedID', 'ScheduleState', 
							'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem].join(','),
						workspace:me.getContext().getWorkspace()._ref
					}
				};
				promises.push(me._parallelLoadWsapiStore(config));
			}
			return Q.all(promises).then(function(stores) {
				var store = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					model: me.UserStory,
					pageSize: 200
				});
				for (var i = 0; i < stores.length; i++) {
					store.add(stores[i].getRange());
				}
				if (me.UserStoryStore) {
					me.UserStoryStore.removeAll();
				}
				me.UserStoryStore = store;
				return store;
			});
		},
		/*
		 *	Creates a Filter object for the lowest portfolio items
		 */
		_getLowestPortfolioItemFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName });
			return releaseNameFilter;
		},
		/*
		 *	Gets collection of the lowest portfolio items filtered to the current release
		 */
		_getLowestPortfolioItems: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			if(!me.TrainRecord) return Q();
			var config = {
				model: me[lowestPortfolioItem],
				url: me.BaseUrl + '/slm/webservice/v2.0/PortfolioItem/' + lowestPortfolioItem,
				params: {
					project: (!me.isScopedOutsideTrain) ? me.TrainPortfolioProject.data._ref : me.TrainsParentRecord._ref,
					projectScopeUp:false,
					projectScopeDown:true,
					pagesize:200,
					query:me._getLowestPortfolioItemFilter().toString(),
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'Release', 
						'Description', 'FormattedID', 'UserStories'].join(',')
				}
			};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.LowestPortfolioItemStore = store;
				return store;
			});
		},
		/*
		 *	Gets an array of objects containing {Group: string, Teams: string[]} representing
		 *	the horizontal functional groups
		 */
		_getHorizontalGroups: function() {
			var me = this;
			// DEBUG: Original implementation
			/*me.HorizontalGroups = [
				{Group: 'ACD', Teams: ['CLK 1', 'MIO 1', 'MIO CLK 1', 'PT 1', 'PT 2', 'SIO 1', 'SIO 2', 'SIO MIO CLK 1']},
				{Group: 'DCD', Teams: ['Array 1', 'Array 2', 'Func Module 1', 'Func Module 2', 'GT Module 1', 'HTD 1', 'Scan 1', 'Scan 2']},
				{Group: 'MPV', Teams: ['MPV 1', 'MPV 2', 'MPV 3']},
				{Group: 'PHI', Teams: ['Binsplit 1', 'Binsplit 2', 'Yield PHI 1']},
				{Group: 'QRE', Teams: ['Bl 1', 'Reliability 1']},
				{Group: 'SCI', Teams: ['Fuse 1', 'Fuse 2', 'TVPV 1', 'TVPV 2']},
				{Group: 'TPI', Teams: ['Class TPI 1', 'Sort Class TPI 1', 'Sort Class TPI 2', 'Sort Class TPI 3', 'Sort Class TPI 4', 'Sort Class TPI 5', 'Sort TD 1', 'Sort TPI 1']},
				{Group: 'Other', Teams: ['Analog DV', 'EVG', 'QRE Qual']}
			];*/
			// Faster implementation (I hope)
			me.HorizontalGroups = {
				ACD: ['CLK 1', 'MIO 1', 'MIO CLK 1', 'PT 1', 'PT 2', 'SIO 1', 'SIO 2', 'SIO MIO CLK 1'],
				DCD: ['Array 1', 'Array 2', 'Func Module 1', 'Func Module 2', 'GT Module 1', 'HTD 1', 'Scan 1', 'Scan 2'],
				MPV: ['MPV 1', 'MPV 2', 'MPV 3'],
				PHI: ['Binsplit 1', 'Binsplit 2', 'Yield PHI 1'],
				QRE: ['Bl 1', 'Reliability 1'],
				SCI: ['Fuse 1', 'Fuse 2', 'TVPV 1', 'TVPV 2'],
				TPI: ['Class TPI 1', 'Sort Class TPI 1', 'Sort Class TPI 2', 'Sort Class TPI 3', 'Sort Class TPI 4', 'Sort Class TPI 5', 'Sort TD 1', 'Sort TPI 1'],
				Other: ['Analog DV', 'EVG', 'QRE Qual']
			};
		},
		
		/******************************************************* Reloading ************************************************/
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
			var link = Ext.getCmp('emailLink');
			if (link) link.destroy();
		},
		/*
		 *	Redraws the grids and ribbons
		 */
		_redrawEverything: function(){
			var me=this;
			
			me._setNewEmailLink();
			if (!me.EmailLink) me._loadEmailLink();
			me._removeAllItems();
			me.setLoading('Loading Grids and Charts');
			return me._buildGrids()
				.then(function(){ 
					return Q.all([ //these 2 need grids to exist to make their calculations
						me._buildRibbon(),
						me._buildIntegrityIndicator()
					]);
				})
				.fail(function(reason){ return Q.reject(reason); })
				.then(function(){ me.setLoading(false); });
		},
		/*
		 *	Reloads all graphical elements and associated data
		 */
		_reloadEverything:function(){
			var me=this;
			// Only load release, group, and team pickers, do not reload
			if (!me.ReleasePicker) me._loadReleasePicker();
			if (!me.HorizontalGroupPicker && !me.isScopedToScrum && me.isHorizontalView) me._loadHorizontalGroupPicker();
			if (!me.TeamPicker && !me.isScopedToScrum) me._loadTeamPicker();
			if (me.isStandalone) {
				me.ReleasePicker.hide();
				if (me.HorizontalGroupPicker) me.HorizontalGroupPicker.hide();
				if (me.TeamPicker) me.TeamPicker.hide();
			}

			me.setLoading('Loading Stores');
			return me._loadLeafProjects().then(function() {
					return me._getStories().then(me._getLowestPortfolioItems());
				})
				.then(function(){
					// Count the number of user stories within each item of type lowestPortfolioItemType
					if(me.LowestPortfolioItemStore){
						var lowestPortfolioItemType = me.PortfolioItemTypes[0];
						me.PortfolioUserStoryCount = {};
						// Set all counts to zero
						_.each(me.LowestPortfolioItemStore.getRange(), function(portfolioItemRecord){
							me.PortfolioUserStoryCount[portfolioItemRecord.data.ObjectID] = 0;
						});
						// Count the number of associated user stories
						_.each(me.UserStoryStore.getRange(), function(userStoryRecord){
							var portfolioItemObjectID = (userStoryRecord.data[lowestPortfolioItemType] || {}).ObjectID;
							if(typeof me.PortfolioUserStoryCount[portfolioItemObjectID] == 'number') me.PortfolioUserStoryCount[portfolioItemObjectID]++;
						});
					}
				})
				.then(function(){ me._redrawEverything(); })
				.fail(function(reason){ return Q.reject(reason); })
				.then(function(){ me.setLoading(false); });
		},

		/********************************************************** Tool tip functions *************************************/
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
		
		/******************************************************* LAUNCH *****************************************************/
		launch: function() {
			var me=this;
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me._addScrollEventListener();
			me._setDataIntegrityDashboardObjectID();
			me.setLoading('Loading Configuration');
			me._configureIntelRallyApp()
				// Get the currently scoped project
				.then(function(){
					me._getHorizontalGroups();
					me.isHorizontalView = me.getSetting('Horizontal');
					
					// If app is in standalone mode, load overrides
					me.Overrides = {decodedUrl: decodeURI(window.location.href)};
					me.isStandalone = me.Overrides.decodedUrl.match('isStandalone=true') ? true : false;
					if (me.isStandalone) {
						me.Overrides = {decodedUrl: decodeURI(window.location.href)};
						me.Overrides.isHorizontalView = me.isHorizontalView = me.Overrides.decodedUrl.match('isHorizontal=true[&]*');
						me.Overrides.TeamName = me.Overrides.decodedUrl.match('team=.*');
						me.Overrides.TeamName = (me.Overrides.TeamName ? me.Overrides.TeamName[0].slice(5).split('&')[0] : undefined);
						me.Overrides.HorizontalGroup = me.Overrides.decodedUrl.match('group=.*');
						me.Overrides.HorizontalGroup = (me.Overrides.HorizontalGroup ? me.Overrides.HorizontalGroup[0].slice(6).split('&')[0] : undefined);
						me.Overrides.ReleaseRecordName = me.Overrides.decodedUrl.match('release=.*');
						me.Overrides.ReleaseRecordName = (me.Overrides.ReleaseRecordName ? me.Overrides.ReleaseRecordName[0].slice(8).split('&')[0] : undefined);
					}
					
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					var loadGroupsPromise;
					me.ProjectGroups = [];
					me.ProjectRecord = scopeProjectRecord;
					
					if (me.isHorizontalView) {
						loadGroupsPromise = me._loadAllTrains().then(function(trains) {
							me.ProjectGroups = trains;
							return me._projectInWhichTrain(me.ProjectRecord).then(function(trainRecord) {
								if (trainRecord) {
									me.TrainRecord = trainRecord;
									me.isScopedToTrain = (trainRecord.data.ObjectID == me.ProjectRecord.data.ObjectID);
									me.isScopedToScrum = (me.ProjectRecord.data.Children.Count === 0);
									me.isScopedOutsideTrain = false;
									
									if (!me.isScopedToScrum) {
										me.TeamName = me.Overrides.TeamName || '';
										me.TeamFilter = '^' + ((me.TeamName === '') ? '.*' : me.TeamName);
										me.HorizontalGroup = me.Overrides.HorizontalGroup || 'ACD'; // I really didn't want to load everything at first
									}
									else {
										me.TeamName = me.Overrides.TeamName || me._getTeamType(me.ProjectRecord.data.Name).TeamType;
										me.TeamFilter = '^' + me.TeamName;
									}
									return me._loadProject(me.TrainRecord.data.Parent.ObjectID).then(function(trainsParentRecord) {
										me.TrainsParentRecord = trainsParentRecord;
									});
								}
								else {
									me.isScopedToTrain = false;
									me.isScopedOutsideTrain = true;
									me.isScopedToScrum = false;
									me.HorizontalGroup = me.Overrides.HorizontalGroup || 'ACD'; // I really didn't want to load everything at first
									me.TeamName = me.Overrides.TeamName || '';
									me.TeamFilter = '^' + ((me.TeamName === '') ? '.*' : me.TeamName);
									me.TrainsParentRecord = me.ProjectRecord;
									me.TrainRecord = trains[0];
								}
							});
						});
					}
					else {
						loadGroupsPromise = me._projectInWhichTrain(me.ProjectRecord).then(function(trainRecord) {
							me.TeamFilter = '^.*';
							if (trainRecord) {
								me.ProjectGroups = [me.ProjectRecord];
								me.TrainRecord = trainRecord;
								me.isScopedToTrain = (trainRecord.data.ObjectID == me.ProjectRecord.data.ObjectID);
								me.isScopedToScrum = (me.ProjectRecord.data.Children.Count === 0);
								me.isScopedOutsideTrain = false;
								me.TeamName = me.Overrides.TeamName || '';
								if (me.TeamName !== '') {
									me.TeamFilter = '^' + me.Overrides.TeamName;
								}
								return me._loadProject(me.TrainRecord.data.Parent.ObjectID).then(function(trainsParentRecord) {
									me.TrainsParentRecord = trainsParentRecord;
								});
							}
							else {
								return me._loadAllTrains().then(function(trains) {
									me.TeamName = me.Overrides.TeamName || '';
									if (me.TeamName !== '') {
										me.TeamFilter = '^' + me.Overrides.TeamName;
									}
									me.ProjectGroups = [me.ProjectRecord];
									me.TrainRecord = trains[0];
									me.TrainsParentRecord = me.ProjectRecord;
									me.isScopedToTrain = false;
									me.isScopedOutsideTrain = true;
									me.isScopedToScrum = false;
								});
							}
						});
					}
					return loadGroupsPromise.then(function() {
						return (me._loadLeafProjects()
						.then(function () {
							return me._loadTrainPortfolioProject(me.TrainRecord).then(function(trainPortfolioProject){
								me.TrainPortfolioProject = trainPortfolioProject;
								var topPortfolioItemType = me.PortfolioItemTypes.slice(-1).pop();
								return me._loadPortfolioItemsOfType(trainPortfolioProject, topPortfolioItemType);
							});
						})
						.then(function(topPortfolioItemStore){ 
							me.TopPortfolioItems = topPortfolioItemStore.getRange(); 
						}));
					});
				})
				.then(function() {
					return me._loadAppsPreference()
						// Load releases after 12 weeks ago
						.then(function(appsPref){
							me.AppsPref = appsPref;
							var twelveWeeks = 1000*60*60*24*7*12;
							return me._loadReleasesAfterGivenDate(me.TrainRecord, (new Date()*1 - twelveWeeks));
						})
						// Use the currently scoped release as the initial value
						.then(function(releaseRecords){
							me.ReleaseRecords = releaseRecords;
							var currentRelease;
							if (me.Overrides.ReleaseRecordName) {
								currentRelease = _.find(releaseRecords, function(r) {return r.data.Name == me.Overrides.ReleaseRecordName;});
							}
							else {
								currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
							}
							if(currentRelease) me.ReleaseRecord = currentRelease;
							else return Q.reject('This project has no releases.');
						});
				})
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},
		_loadLeafProjects: function() {
			var me = this,
				loadLeafPromiseSet = [],
				concatLeafSet = function(leftProjects) {
					_.assign(me.AllLeafProjects, leftProjects);
				};
			me.AllLeafProjects = {};
			for (var i in me.ProjectGroups) {
				loadLeafPromiseSet.push(me._loadAllLeafProjects(me.ProjectGroups[i]).then(concatLeafSet));
			}
			
			// THIS MAY BE INEFFICIENT AND UNNECESSARY
			return Q.all(loadLeafPromiseSet).then(function() {
				var leafProjects = me._filterByTeamType(me.HorizontalGroup ? me._filterByHorizontalGroup(me.AllLeafProjects) : me.AllLeafProjects);
				me.LeafProjects = me._reindexProjects(leafProjects);
			});
		},

		/******************************************************* NAV CONTROLS ************************************************/
		/*
		 *	Reloads the page with new data and saves the selection in the app preferences
		 */
		_releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me._clearToolTip();
			me.setLoading(true);
			if (!me.isScopedToScrum) {
				me.TeamName = '';
				me.TeamFilter = '^.*';
			}
			if (me.TeamPicker) me.TeamPicker.setValue('All');
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me._alert('ERROR', reason || '');
					me.setLoading(false);
				})
				.done();
		},
		/*
		 *	Loads the release picker
		 */
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelreleasepicker',
				labelWidth: 50,
				width: 240,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},
		/*
		 *	Changes the group to filter by and reloads data
		 */
		_horizontalGroupPickerSelected: function(combo, records) {
			var me = this;
			me._clearToolTip();
			me.setLoading(true);
			me.HorizontalGroup = combo.getValue();
			me.TeamName = '';
			me.TeamFilter = '^.*';
			me.TeamPicker.setValue('All');
			return me._reloadEverything().then(function() {
				me.TeamPicker.bindStore(Ext.create('Ext.data.Store', {
					fields: ['TeamType'],
					data: [{TeamType:'All'}].concat(_.uniq(_.map(me.LeafProjects, function(p){ return me._getTeamType(p.data.Name); }), false, function(p) {return p.TeamType;}))
				}));
				setLoading(false);
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
		 *	Changes the team name to filter by and reloads all graphical elements
		 */
		_teamPickerSelected: function(combo, records){
			var me = this;
			me._clearToolTip();
			me.setLoading(true);
			if (combo.getValue() !== 'All') {
				me.TeamName = combo.getValue();
				me.TeamFilter = '^' + me.TeamName;
			}
			else {
				me.TeamName = '';
				me.TeamFilter = '^.*';
			}
			return me._redrawEverything().then(function() {setLoading(false);});
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
					fields: ['TeamType'],
					data: [{TeamType:'All'}].concat(_.uniq(_.map(me.LeafProjects, function(p){ return me._getTeamType(p.data.Name); }), false, function(p) {return p.TeamType;}))
				}),
				displayField:'TeamType',
				value:'All',
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._teamPickerSelected.bind(me)
				}
			});
		},
		/*
		 *	Generates the url for mailing the current view
		 */
		_generateMailto: function() {
			var me = this;
			var base = 'mailto:',
				subject = '&subject=Data%20Integrity%20Dashboard%20View',
				urlSegments = me.Overrides.decodedUrl.split('?'),
				options = urlSegments[1].split('&');
			_.remove(options, function(option) {return (option.match('^width') || option.match('cpoid'));});
			options.push('isStandalone=true');
			options.push('isHorizontal=' + me.isHorizontalView);
			options.push('release=' + me.ReleaseRecord.data.Name);
			if (me.isHorizontalView) {
				if (me.TeamFilter !== '^.*') {
					options.push('team=' + me.TeamFilter.slice(1));
				}
				if (me.HorizontalGroup) {
					options.push('group=' + me.HorizontalGroup);
				}
			}
			else if (!me.isScopedToScrum) {
				if (me.TeamFilter !== '^.*') {
					options.push('team=' + me.TeamFilter.slice(1));
				}
			}
			var appUrl = urlSegments[0] + '%3F' + options.join('%26');
			appUrl = appUrl.replace(/\s/g, '%2520');
			var body = '&body=' + appUrl,
				url = base + subject + body;
			return url;
		},
		/*
		 *	Sets the email link to a new value
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
	
		/*********************************************** Story/Point util for projects ************************************/
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
		
		/*********************************************** Filtering Functions **********************************************/
		/*
		 *	Extracts the team type from a scrum name
		 *	This assumes that scrum names are formatted as follows: [team type] [number] - [train]
		 */
		_getTeamType: function(scrumName){
			var name = scrumName.split(/\s-\s/)[0],
				teamType = name.split(/\d/)[0];
				number = (teamType === name ? 1 : name.split(teamType)[1])*1;
			return {TeamType: teamType.trim(), Number: number};
		},
		/*
		 *	Filters a collection of projects by team type
		 */
		_filterByTeamType: function(projects) {
			var me = this;
			return me._reindexProjects(_.filter(projects, function(project) {
				return (project.data.Name.match(me.TeamFilter));
			}));
		},
		/*
		 *	Filters a collection of projects by the horizontal group they belong to
		 */
		_filterByHorizontalGroup: function(projects) {
			// DEBUG Original implementation
			/*var me = this,
				filteredProjects = [],
				teams;
			if (!me.HorizontalGroup || me.HorizontalGroup === 'All') {
				return projects;
			}
			else {
				compareFn = function(n) {return (n == team.TeamType + ' ' + team.Number);};
				for(var k in me.HorizontalGroups) {
					if (me.HorizontalGroups[k].Group === me.HorizontalGroup) {
						teams = me.HorizontalGroups[k].Teams;
						break;
					}
				}
				for(var i in projects) {
					var team = me._getTeamType(projects[i].data.Name);
					if (_.find(teams, compareFn)) {
						filteredProjects.push(projects[i]);
					}
				}
				return me._reindexProjects(filteredProjects);
			}*/
			// Hopefully faster implementation
			var me = this,
				filteredProjects = [],
				team;
			if (!me.HorizontalGroup || me.HorizontalGroup === 'All') {
				return projects;
			}
			else {
				var compareFn = function(name) {return name === team.TeamType + ' ' + team.Number;};
				for (var i in projects) {
					team = me._getTeamType(projects[i].data.Name);
					if (_.find(me.HorizontalGroups[me.HorizontalGroup], compareFn)) {
						filteredProjects.push(projects[i]);
					}
				}
				return me._reindexProjects(filteredProjects);
			}
		},
		/*
		 *	Reindexes an array of projects to an object indexed by ObjectID
		 */
		_reindexProjects: function(projects) {
			var reindexedSet = {};
			for (var i in projects) {
				reindexedSet[projects[i].data.ObjectID] = projects[i];
			}
			return reindexedSet;
		},
		/************************************************* Render integrity indicator *****************************************/
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
			var scopeLabel = '';
			if (me.isHorizontalView) {
				if (me.HorizontalGroup) {
					if (me.HorizontalGroup !== 'All') {
						scopeLabel = me.HorizontalGroup;
						if (me.TeamName !== '') {
							scopeLabel = scopeLabel.concat('/' + me.TeamName);
						}
					}
					else {
						if (me.TeamName !== '') {
							scopeLabel = me.TeamName;
						}
						else {
							scopeLabel = 'Collective';
						}
					}
				}
				else {
					if (me.TeamName !== '') {
						scopeLabel = me.TeamName;
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
					if (me.TeamName !== '') {
						scopeLabel = scopeLabel.concat('/' + me.TeamName);
					}
				}
			}
			scopeLabel = scopeLabel.concat(' (' + me.ReleaseRecord.data.Name + ')');
			
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
		
		/******************************************************* Render Ribbon ************************************************/
		/*
		 *	Displays a tool tip when a point on the heat map is clicked
		 */
		_onHeatmapClick: function(point, scrum, grid){
			var me=this,
				panelWidth=320,
				rect = point.graphic.element.getBoundingClientRect(),
				leftSide = rect.left,
				topSide = rect.top,
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
									if(!me.SelectedScrum || me.SelectedScrum.data.ObjectID != scrum.data.ObjectID){
										me.SelectedScrum = scrum;
										// me.TeamPicker.setValue({TeamType: me._getTeamType(scrum.data.Name)});
										me._redrawEverything()
											.then(function(){ 
												me.setLoading('Loading Grids and Charts');
												setTimeout(function(){
													me.setLoading(false);
													Ext.get(grid.originalConfig.id).scrollIntoView(me.el); }, 
												10);
											})
											.done();
									}
									else Ext.get(grid.originalConfig.id).scrollIntoView(me.el);
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
							panel.setPosition(leftSide-panelWidth, topSide);
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
							panel.setPosition(leftSide - 10, topSide);
						}, 10);
					}
				}
			});	
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
				selectScrumFunctionName = '_selectScrum' + (Math.random()*10000>>0),
				selectIdFunctionName = '_selectId' + (Math.random()*10000>>0);
			_.each(userStoryGrids, function(grid, gindex) {
				_.each(_.sortBy(me._filterByTeamType(me._filterByHorizontalGroup(me.LeafProjects)), function(p){ return p.data.Name; }), function(project, pindex){
					var gridCount = me._getProjectStoriesForGrid(project, grid).length;
					highestNum = Math.max(gridCount, highestNum);
					chartData.push([pindex, gindex, gridCount]);
				});
			});
			window[selectScrumFunctionName] = function(value){
				var scrum = _.find(me.LeafProjects, function(p){ return p.data.Name === value; });
				if(me.SelectedScrum && scrum.data.ObjectID == me.SelectedScrum.data.ObjectID){
					me.SelectedScrum = null;
				} else {
					me.SelectedScrum = scrum;
				}
				me._clearToolTip();
				me._redrawEverything();
			};
			window[selectIdFunctionName] = function(gridId){
				Ext.get(gridId).scrollIntoView(me.el);
			};
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
					categories: _.sortBy(_.map(me._filterByTeamType(me._filterByHorizontalGroup(me.LeafProjects)), 
						function(project){ return project.data.Name; }),
						function(p){ return p; }),
					labels: {
						style: { width:100 },
						formatter: function(){
							var text = this.value;
							if(me.SelectedScrum && me.SelectedScrum.data.Name.indexOf(this.value) === 0) 
								text = '<span title="' + this.value + '" class="heatmap-xlabel-text curscrum">' + this.value + '</span>';
							else text = '<span title="' + this.value + '" class="heatmap-xlabel-text">' + this.value + '</span>';
							return '<a class="heatmap-xlabel" onclick="' + selectScrumFunctionName + '(\'' + this.value +  '\');">' + text + '</a>';
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
		 *	Gets the configuration of the pie chart
		 */
		_getPieChartConfig: function() { 
			var me=this,
				chartData = _.map(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid) { 
					return {
						name: grid.originalConfig.title,
						y: grid.originalConfig.data.length,
						totalCount: grid.originalConfig.totalCount,
						gridID: grid.originalConfig.id,
						model: grid.originalConfig.model
					};
				});
			if(_.every(chartData, function(item){ return item.y === 0; })){
				chartData = [{
					name: 'Everything is correct!',
					y:1,
					totalCount:1,
					color:'#2ECC40', //GREEN
					model:''
				}];
			}
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
							formatter: function(){
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
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		_buildRibbon: function() {
			var me=this;
			$('#pie').highcharts(me._getPieChartConfig());
			$('#heatmap').highcharts(me._getHeatMapConfig());
			me._hideHighchartsLinks();
		},
		
		/******************************************************* Render GRIDS ********************************************************/
		/*
		 *	Gets the stories for the grid, filtering by team name or displaying all
		 */
		_getFilteredStories: function(){
			var me = this;
			if (me.isScopedOutsideTrain) {
				if (me.isHoriztonalView) {
					return _.filter(me.UserStoryStore.getRange(), function(story){ 
						return story.data.Project.Name.match(me.TeamFilter);
					});
				}
				else {
					return _.filter(me.UserStoryStore.getRange(), function(item){ 
						return item.data.Project.Name.match(me.TeamFilter);
					});
				}
			}
			else {
				if (me.isHorizontalView || me.TeamFilter !== '^.*') {
					return _.filter(me.UserStoryStore.getRange(), function(item){ 
						return item.data.Project.Name.match(me.TeamFilter);
					});
				}
				else {
					return me.UserStoryStore.getRange();
				}
			}
		},
		/*
		 *	Gets the collection of items of the lowest portfolio item type
		 */
		_getFilteredLowestPortfolioItems: function(){ 
			return this.LowestPortfolioItemStore ? this.LowestPortfolioItemStore.getRange(): [];
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
				storeModel = (gridConfig.model == 'UserStory') ? me.UserStoryStore.model : me.LowestPortfolioItemStore.model,
				grid = Ext.getCmp('grids' + gridConfig.side).add(gridConfig.data.length ? 
					Ext.create('Rally.ui.grid.Grid', {
						title: getGridTitleLink(gridConfig.data, gridConfig.model),
						id: gridConfig.id,
						cls:'grid-unhealthy data-integrity-grid rally-grid',
						columnCfgs: gridConfig.columns,
						showPagingToolbar: true,
						showRowActionsColumn: true,
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
							data: gridConfig.data
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
							return (new Date()*1 - new Date(record.data.Blocker.CreationDate)*1)/day>>0;
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
						return pe!==null && pe!==0 && pe!==1 && pe!==2 && pe!==4 && pe!==8 && pe!==16;
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
						if(!item.data.Iteration || item.data.Release) return false;
						return new Date(item.data.Iteration.StartDate) < releaseDate && 
							new Date(item.data.Iteration.EndDate) > releaseStartDate;
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
						return new Date(item.data[lowestPortfolioItemType].PlannedEndDate) < new Date(item.data.Iteration.StartDate);
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
						return !me.PortfolioUserStoryCount[item.data.ObjectID] && _.find(me.LeafProjects, item.data.Project);
					}
				}];

			return Q.all(_.map(gridConfigs, function(gridConfig){
				if(me.SelectedScrum && !gridConfig.showIfLeafProject) return Q();
				else {
					var list = gridConfig.model == 'UserStory' ? filteredStories : filteredLowestPortfolioItems;
					gridConfig.data = _.filter(list, gridConfig.filterFn);
					gridConfig['total' + (gridConfig.model == 'UserStory' ? 'Stories' : lowestPortfolioItemType + 's')] = list;
					gridConfig.totalCount = list.length;
					gridConfig.totalPoints = (100*_.reduce(list, function(sum, item){ return sum + item.data.PlanEstimate; }, 0)>>0)/100;
					return me._addGrid(gridConfig);
				}
			}))
			.fail(function(reason){ me._alert('ERROR:', reason); });
		}
	});
}());
