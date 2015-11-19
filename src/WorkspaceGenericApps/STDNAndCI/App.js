/** 
	this app will probably get buggy if you have multiple projects with the same name or portfolioItems with the same name
	Because i never tested for that.
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		COLUMN_DEFAULTS = {
			text:'',
			resizable: false,
			draggable: false,
			sortable: false,
			editor: false,
			menuDisabled: true,
			renderer: function(val){ return val || '-'; },
			layout: 'hbox'
		};
	
	Ext.define('Intel.STDNAndCI', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.RallyReleaseColor',
			'Intel.lib.mixin.HorizontalTeamTypes',
			'Intel.lib.mixin.CustomAppObjectIDRegister',
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			itemId:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				itemId:'navboxLeft',
				layout: 'hbox',
				items:[{
					xtype:'container',
					flex:1,
					itemId:'navboxLeftVert',
					layout: 'vbox'
				}]
			},{
				xtype:'container',
				flex:2,
				itemId:'navboxRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		minWidth:910,
		
		userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		loadPortfolioItems: function(){ 
			var me=this, deferred = Q.defer();
			me.enqueue(function(done){
				Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
					return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
							me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) : 
							me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, me.ScrumGroupPortfolioProject, type)
						);
					}))
					.then(function(portfolioItemStores){
						if(me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
						me.PortfolioItemStore = portfolioItemStores[0];
						me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);
						
						//destroy the stores, so they get GCed
						portfolioItemStores.shift();
						while(portfolioItemStores.length) portfolioItemStores.shift().destroyStore();
					})
					.then(function(){ done(); deferred.resolve(); })
					.fail(function(reason){ done(); deferred.reject(reason); })
					.done();
				}, 'PortfolioItemQueue');
			return deferred.promise;
		},		
		getUserStoryQuery: function(portfolioItemRecords){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = 
					Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: me.ReleaseRecord.data.Name }).or(
						Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value:null }).and(
						Ext.create('Rally.data.wsapi.Filter', {property: lowestPortfolioItemType+'.Release.Name', value: me.ReleaseRecord.data.Name }))
					),
				portfolioItemFilter = _.reduce(portfolioItemRecords, function(filter, portfolioItemRecord){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {
						property: lowestPortfolioItemType + '.ObjectID',
						value: portfolioItemRecord.data.ObjectID
					});
					return filter ? filter.or(newFilter) : newFilter;
				}, null);
			return portfolioItemFilter ? releaseFilter.and(leafFilter).and(portfolioItemFilter) : null;
		},
		loadUserStories: function(){
			/** note: lets say the lowest portfolioItemType is 'Feature'. If we want to get child user stories under a particular Feature,
					we must query and fetch using the Feature field on the UserStories, NOT PortfolioItem. PortfolioItem field only applies to the 
					user Stories directly under the feature
				*/
			var me = this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				newMatrixUserStoryBreakdown = {},
				newMatrixProjectMap = {},
				newProjectOIDNameMap = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group
				
			return Q.all(_.map(_.chunk(me.PortfolioItemStore.getRange(), 20), function(portfolioItemRecords){
				var filter = me.getUserStoryQuery(portfolioItemRecords),
					config = {
						model: 'HierarchicalRequirement',
						filters: filter ? [filter] : [],
						fetch:['Name', 'ObjectID', 'Project', 'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState', lowestPortfolioItemType],
						context: {
							workspace:me.getContext().getWorkspace()._ref,
							project: null
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var portfolioItemName = storyRecord.data[lowestPortfolioItemType].Name,
							projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						if(!newMatrixUserStoryBreakdown[projectName]) 
							newMatrixUserStoryBreakdown[projectName] = {};
						if(!newMatrixUserStoryBreakdown[projectName][portfolioItemName]) 
							newMatrixUserStoryBreakdown[projectName][portfolioItemName] = [];
						newMatrixUserStoryBreakdown[projectName][portfolioItemName].push(storyRecord.data);						
						newMatrixProjectMap[projectName] = storyRecord.data.Project.ObjectID; //this gets called redundantly each loop
						newProjectOIDNameMap[projectOID] = projectName;
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.MatrixUserStoryBreakdown = newMatrixUserStoryBreakdown;
				me.MatrixProjectMap = newMatrixProjectMap;
				me.ProjectOIDNameMap = newProjectOIDNameMap;
						
					//always show the teams under the scrum-group that have teamMembers > 0, even if they are not contributing this release
				_.each(me.ProjectsWithTeamMembers, function(projectRecord){
					var projectName = projectRecord.data.Name,
						projectOID = projectRecord.data.ObjectID;
					if(!me.MatrixProjectMap[projectName]) me.MatrixProjectMap[projectName] = projectRecord.data.ObjectID;
					if(!me.MatrixUserStoryBreakdown[projectName]) me.MatrixUserStoryBreakdown[projectName] = {};
					me.ProjectOIDNameMap[projectOID] = projectName;
				});
			});
		},		
			
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		showGrids: function(){
			var me=this;
			if(!me.MatrixGrid) me.renderMatrixGrid();
		},	
		updateGrids: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.MatrixGrid && me.MatrixGrid.store) me.MatrixGrid.store.intelUpdate();
			}
		},
		clearEverything: function(){
			var me=this;
			
			me.clearToolTip();
			if(me.MatrixGrid) {
				me.MatrixGrid.up().remove(me.MatrixGrid);
				me.MatrixGrid = undefined;
			}
		},
		reloadStores: function(){
			var me = this;
			return me.loadPortfolioItems().then(function(){ return me.loadUserStories(); });
		},
		
		reloadEverything: function(){
			var me=this;

			me.setLoading('Loading Data');
			me.enqueue(function(done){
				me.reloadStores()
					.then(function(){
						me.clearEverything();
						if(!me.ReleasePicker){
							me.renderReleasePicker();
							me.renderClickModePicker();
							me.renderViewModePicker();
							me.renderClearFiltersButton();
							me.renderMatrixLegend();
						}				
					})
					.then(function(){ me.updateGrids(); })
					.then(function(){ me.showGrids(); })
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ me.setLoading(false); done(); })
					.done();
			}, 'ReloadAndRefreshQueue'); //eliminate race conditions between manual _reloadEverything and interval _refreshDataFunc
		},
		
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.setLoading('Loading configuration');
			me.ClickMode = 'Details';
			me.ViewMode = Ext.Object.fromQueryString(window.parent.location.href.split('?')[1] || '').viewmode === 'percent_done' ? '% Done' : 'Normal';
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.initGridResize();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this project');
				return;
			}	
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([
						me.projectInWhichScrumGroup(me.ProjectRecord)
							.then(function(scrumGroupRootRecord){
								if(scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID){
									me.ScrumGroupRootRecord = scrumGroupRootRecord;
									return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
										.then(function(scrumGroupPortfolioProject){
											if(!scrumGroupPortfolioProject) return Q.reject('Invalid portfolio location');
											me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a valid project');
							}),
						me.loadAppsPreference()
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							}),
						me.loadProjectsWithTeamMembers(me.ProjectRecord)
							.then(function(projectsWithTeamMembers){ 
								me.ProjectsWithTeamMembers = projectsWithTeamMembers; 
							}),
						me.loadAllChildrenProjects()
							.then(function(allProjects){ 
								me.AllProjects = allProjects; 
							}),
						me.setCustomAppObjectID('Intel.SAFe.ArtCommitMatrix')
					]);
				})
				.then(function(){ 
					me.setRefreshInterval(); 
					return me.reloadEverything(); 
				})
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
				.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ me.reloadEverything(); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeftVert').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},	
		
		/************************************************************* RENDER ********************************************************************/
		renderGrid: function(){
			var me = this;
			me.GridData = {
				<TrainName>: {
					<HorizontalName>: {
						<ScrumTeamType>: {
							scrumTeamType:<ScrumTeamType>,
							scrumName:<projectName>
							scrumObjectID:<projectObjectID>,
							totalPoints: <number>,
							stdciPoints: <number>
						}
					}
				}
			}
			
		}
	});
}());