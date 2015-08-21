(function(){
	var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		RALLY_MAX_STRING_SIZE = 32768,
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
		
	Ext.define('Intel.SAFe.RisksDepsTracking', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.SAFe.lib.mixin.DependenciesLib'
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			height:45,
			id:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				id:'navboxLeft',
				layout: {
					type:'hbox'
				}
			},{
				xtype:'container',
				flex:2,
				id:'navboxRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		minWidth:1100, 
		
		userAppsPref: 'intel-SAFe-apps-preference',
			
		/**___________________________________ DATA STORE METHODS ___________________________________*/
		loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: loadPortfolioItemsOfTypeInRelease');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: me._portfolioItemFields,
					filters:[{ property:'Release.Name', value:me.ReleaseRecord.data.Name}],
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me.reloadStore(store);
		},	
		loadPortfolioItems: function(){ 
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
					return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) : 
						me.loadPortfolioItemsOfTypeInRelease(me.ScrumGroupPortfolioProject, type)
					);
				}))
				.then(function(portfolioItemStores){
					me.PortfolioItemStore = portfolioItemStores[0];
					me.PortfolioItemMap = {};
					_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItem){ //create the portfolioItem mapping
						var ordinal = 0, 
							parentPortfolioItem = lowPortfolioItem,
							getParentRecord = function(child, parentList){
								return _.find(parentList, function(parent){ return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; });
							};
						while(ordinal < (portfolioItemStores.length-1) && parentPortfolioItem){
							parentPortfolioItem = getParentRecord(parentPortfolioItem, portfolioItemStores[ordinal+1].getRange());
							++ordinal;
						}
						if(ordinal === (portfolioItemStores.length-1) && parentPortfolioItem)
							me.PortfolioItemMap[lowPortfolioItem.data.ObjectID] = parentPortfolioItem.data.Name;
					});
				});
		},
		getUserStoryFilter: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.Name',
				value: me.ReleaseRecord.data.Name
			}).or(
				Ext.create('Rally.data.wsapi.Filter', {
					property:'Release.ObjectID',
					value: null
				}).and(
				Ext.create('Rally.data.wsapi.Filter', {
					property: lowestPortfolioItem + '.Release.Name',
					value: me.ReleaseRecord.data.Name
				}))
			);
		},
		loadUserStories: function(){	
			/** what this function should REALLY do is return the user stories that contribute to this scrum group's portfolio, regardless of project */
			var me=this, 
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				config = {
					model:'HierarchicalRequirement',
					filters: [me.getUserStoryFilter()],
					fetch:['Name', 'ObjectID', 'Project', 'Release', 'FormattedID', lowestPortfolioItem, 'c_Dependencies'],
					context: {
						project:me.ScrumGroupRootRecord.data._ref,
						projectScopeDown:true,
						projectScopeUp:false
					}
				};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
	
		/**___________________________________ RISKS STUFF___________________________________**/
		loadRisks: function(){
			var me = this;
			return RiskDb.query('risk-' + this.ReleaseRecord.data.Name + '-' + this.ScrumGroupRootRecord.data.ObjectID + '-')
				.then(function(risks){ me.Risks = risks; });
		},
		
		/**___________________________________ DEPENDENCIES STUFF ___________________________________	**/
		isUserStoryInRelease: function(userStoryRecord, releaseRecord){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			return ((userStoryRecord.data.Release || {}).Name === releaseRecord.data.Name) || 
				(!userStoryRecord.data.Release && ((userStoryRecord.data[lowestPortfolioItem] || {}).Release || {}).Name === releaseRecord.data.Name);
		},	
		spliceDependencyFromList: function(dependencyID, dependencyList){ 
			for(var i = 0; i<dependencyList.length; ++i){
				if(dependencyList[i].DependencyID == dependencyID) {
					return dependencyList.splice(i, 1)[0];
				}
			}
		},
		parseDependenciesFromUserStory: function(userStoryRecord){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				dependencies = me.getDependencies(userStoryRecord), 
				inputPredecessors = dependencies.Predecessors, 
				outputPredecessors = [], 
				UserStoryObjectID = userStoryRecord.data.ObjectID,
				UserStoryFormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name,
				TopPortfolioItemName = me.PortfolioItemMap[(userStoryRecord.data[lowestPortfolioItem] || {}).ObjectID] || '',
				ProjectObjectID = (userStoryRecord.data.Project || {}).ObjectID || 0;
				
			if(me.isUserStoryInRelease(userStoryRecord, me.ReleaseRecord)){
				_.each(inputPredecessors, function(predecessorDependency, dependencyID){
					outputPredecessors.push({
						DependencyID: dependencyID,
						UserStoryObjectID: UserStoryObjectID,
						UserStoryFormattedID: UserStoryFormattedID,
						UserStoryName: UserStoryName,
						TopPortfolioItemName: TopPortfolioItemName,
						ProjectObjectID: ProjectObjectID,
						Description: predecessorDependency.Description,
						NeededBy: predecessorDependency.NeededBy,
						Plan: predecessorDependency.Plan,
						Status: predecessorDependency.Status,
						PredecessorItems: predecessorDependency.PredecessorItems || [], 
						Edited: false 
					});
				});
			}
			return {Predecessors:outputPredecessors, Successors:[]};
		},
		parseDependenciesData: function(userStories){	
			var me=this, 
				predecessors = [], 
				successors = [];			

			_.each(userStories, function(userStoryRecord){
				var dependenciesData = me.parseDependenciesFromUserStory(userStoryRecord);
				predecessors = predecessors.concat(dependenciesData.Predecessors);
				successors = successors.concat(dependenciesData.Successors);
			});
			return {Predecessors:predecessors, Successors:successors};
		},		
		getRealDependencyData: function(oldUserStoryRecord, dependencyID, type){ 
			/** type is 'Predecessors' or 'Successors' */
			var me = this, realDependencyData;
			if(oldUserStoryRecord) realDependencyData = me.parseDependenciesFromUserStory(oldUserStoryRecord)[type];
			else realDependencyData = [];
			return me.spliceDependencyFromList(dependencyID, realDependencyData) || null;		
		},
		hydrateDependencyUserStories: function(dependenciesParsedData){
			var me=this, 
				storyOIDsToHydrate = [],
				dependenciesHydratedUserStories = {};
			
			_.each(dependenciesParsedData.Predecessors, function(predecessor){
				_.each(predecessor.PredecessorItems, function(predecessorItem){
					storyOIDsToHydrate.push(predecessorItem.PredecessorUserStoryObjectID);
				});
			});
			
			return Q.all(_.map(storyOIDsToHydrate, function(storyOID){
				return me.loadUserStory(storyOID).then(function(userStory){
					if(userStory) dependenciesHydratedUserStories[storyOID] = userStory;
				});
			}))
			.then(function(){ return dependenciesHydratedUserStories; });
		},
		
		/**___________________________________ MISC HELPERS ___________________________________*/		
		htmlEscape: function(str) {
			return String(str)
				//.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		},	
		getDirtyType: function(localRecord, realDataFromServer){ 
			/** if risk or dep record is new/edited/deleted/unchanged */
			if(!realDataFromServer)	return localRecord.data.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else return localRecord.data.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		},
		updateUserStoryColumnStores: function(){ 
			/** updates the dropdown stores with the most recent user stories in the release (in case some were added */
			var me = this, userStories = me.UserStoriesInRelease;
			if(me.UserStoryFIDStore){
				me.UserStoryFIDStore.removeAll();
				_.each(userStories, function(userStory){
					me.UserStoryFIDStore.add({'FormattedID': userStory.data.FormattedID});
				});
			}
			if(me.UserStoryNameStore){
				me.UserStoryNameStore.removeAll();
				_.each(userStories, function(userStory){
					me.UserStoryNameStore.add({'Name': userStory.data.Name});
				});
			}
		},	
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		isEditing: function(grid){
			if(!grid || !grid.store) return false;
			if(grid.editingPlugin && grid.editingPlugin.activeEditor) return true;
			return _.some(grid.store.getRange(), function(record){ return record.data.Edited; });
		},			
		showGrids: function(){
			var me=this;
			if(!me.RisksGrid){
				me.renderRisksGrid();
				me.renderDependenciesGrids();
			}
		},	
		checkForDuplicates: function(){ 
			/** duplicates are in a list of groups of duplicates for each type */
			var me=this,
				deferred = Q.defer(),
				duplicatePredecessors = _.filter(_.groupBy(me.DependenciesParsedData.Predecessors,
					function(dependency){ return dependency.DependencyID; }),
					function(list, dependencyID){ return list.length > 1; });
			if(duplicatePredecessors.length){
				me.renderResolveDuplicatesModal(duplicatePredecessors)
					.then(function(){ 
						me.clearEverything();
						me.setLoading('Loading Data');
						return me.reloadStores(); 
					})
					.then(function(){ return me.updateGrids(); })
					.then(function(){ me.setLoading(false); })
					.then(function(){ deferred.resolve(); })
					.fail(function(reason){ deferred.reject(reason); })
					.done();
			} else deferred.resolve();
			
			return deferred.promise;
		},
		updateGrids: function(){
			var me=this,
				promises = [],
				isEditingDeps = me.isEditing(me.CustomPredecessorStore);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.syncRisks(me.Risks);
			if(!isEditingDeps && me.UserStoryStore && me.PortfolioItemStore){		
				me.UserStoriesInRelease = _.filter(me.UserStoryStore.getRange(), function(userStoryRecord){ 
					return me.isUserStoryInRelease(userStoryRecord, me.ReleaseRecord); 
				});
				me.DependenciesParsedData = me.parseDependenciesData(me.UserStoryStore.getRange());
				promises.push(me.hydrateDependencyUserStories(me.DependenciesParsedData).then(function(dependenciesHydratedUserStories){
					me.DependenciesHydratedUserStories = dependenciesHydratedUserStories;
					me.updateUserStoryColumnStores();
					if(me.PredecessorGrid && me.PredecessorGrid.store) me.PredecessorGrid.store.intelUpdate();
				}));
			}
			return Q.all(promises);
		},	
		reloadStores: function(){
			var me=this,
				isEditingDeps = me.isEditing(me.PredecessorGrid),
				promises = [];
			promises.push(me.loadRisks());
			promises.push(me.loadPortfolioItems());
			if(!isEditingDeps) promises.push(me.loadUserStories());
			return Q.all(promises);
		},
		clearEverything: function(){
			var me=this;
			
			me.PortfolioItemMap = {};
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			
			me.PredecessorGrid = undefined;
			me.RisksGrid = undefined;

			var toRemove = me.down('#navbox').next(), tmp;
			while(toRemove){ //delete risks and dependencies 
				tmp = toRemove.next();
				toRemove.up().remove(toRemove);
				toRemove = tmp;
			}
		},
		reloadEverything:function(){
			var me = this;
			
			me.clearEverything();
			me.setLoading('Loading Data');
			if(!me.ReleasePicker){ //draw these once, never remove them
				me.renderReleasePicker();
				me.renderManualRefreshButton();
			}		
			me.enqueue(function(unlockFunc){	
				me.reloadStores()
					.then(function(){ return me.updateGrids(); })
					.then(function(){ return me.checkForDuplicates(); })
					.then(function(){ return me.showGrids(); })
					.fail(function(reason){	me.alert('ERROR', reason); })
					.then(function(){
						unlockFunc();
						me.setLoading(false); 
					})
					.done();
			}, 'Queue-Main');
		},
		
		/**___________________________________ REFRESHING DATA ___________________________________*/	
		setLoadingMasks: function(){
			var me=this, message = 'Refreshing Data',
				isEditingDeps = me.isEditing(me.PredecessorGrid);			
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.setLoading(message);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(message);
		},	
		removeLoadingMasks: function(){
			var me=this,
				isEditingDeps = me.isEditing(me.PredecessorGrid);		
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.setLoading(false);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(false);
		},	
		refreshDataFunc: function(){
			var me=this;
			me.setLoadingMasks();
			me.enqueue(function(unlockFunc){
				me.reloadStores()
					.then(function(){ return me.updateGrids(); })
					.then(function(){ return me.checkForDuplicates(); })
					.then(function(){ return me.showGrids(); })
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ 
						unlockFunc();
						me.removeLoadingMasks();
					})
					.done();
			}, 'Queue-Main');
		},	

		/**___________________________________ LAUNCH ___________________________________*/
		launch: function(){
			var me=this;
			me.setLoading('Loading Configuration');
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
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
					return Q.all([ // 3 streams
						me.loadProjectsWithTeamMembers() /********* 1 ************/
							.then(function(projectsWithTeamMembers){
								me.ProjectsWithTeamMembers = projectsWithTeamMembers;
								me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
							}),
						me.projectInWhichScrumGroup(me.ProjectRecord) /********* 2 ************/
							.then(function(scrumGroupRootRecord){
								if(scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID){
									me.ScrumGroupRootRecord = scrumGroupRootRecord;
									return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
										.then(function(scrumGroupPortfolioProject){
											me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a valid project!');
							}),
						me.loadAppsPreference() /********* 3 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									me.WorkweekData = me.getWorkweeksForDropdown(currentRelease.data.ReleaseStartDate, currentRelease.data.ReleaseDate);
								}
								else return Q.reject('This project has no releases.');
							}),
						RiskDb.initialize()
					]);
				})
				.then(function(){ return me.reloadEverything(); })
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
			me.WorkweekData = me.getWorkweeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeft').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.releasePickerSelected.bind(me)
				}
			});
		},	
		renderManualRefreshButton: function(){
			var me=this;
			me.down('#navboxRight').add({
				xtype:'button',
				id: 'manualRefreshButton',
				text:'Refresh Data',
				cls:'intel-button',
				listeners:{
					click: me.refreshDataFunc.bind(me)
				}
			});
		},
		
		/**___________________________________ RENDER RESOLVE DUPLICATES ___________________________________*/	
		renderResolveDuplicatesModal: function(duplicatePredecessors){
			var me=this,
				deferred = Q.defer(),	
				modal = Ext.create('Ext.window.Window', {
					modal:true,
					closable:false,
					title:'ERROR: Duplicate Dependencies!',
					cls:'duplicates-modal',
					overflowY: 'scroll',
					resizable: true,
					height:me.getHeight()*0.9>>0,
					width:Math.min(900, me.getWidth()*0.9>>0),
					y:5,
					items: [{
						xtype:'container',
						html:'<p>Use the checkboxes to select which of the duplicates you want to keep. ' + 
							'You have to keep exactly 1 of the duplicates. When you have finished, click Done.</p><br/>',
						manageHeight:false
					}].concat(duplicatePredecessors.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Predecessors</h2>',
							manageHeight:false
						}].concat(_.map(duplicatePredecessors, function(predecessorsOfOneID){
							return {
								xtype:'grid',
								cls: 'risksdeps-grid duplicate-predecessors-grid rally-grid',
								columns: [{
									text:'#', 
									dataIndex:'UserStoryFormattedID',
									width:90,
									sortable:true
								},{
									text:'UserStory', 
									dataIndex:'UserStoryName',
									flex:1,	
									sortable:true
								},{
									text:'Team', 
									dataIndex:'ProjectObjectID',
									flex:1,
									minWidth:100,
									sortable:true,
									renderer:function(projectObjectID){
										return ((me.ProjectsWithTeamMembers[projectObjectID] || {}).data || {}).Name || '?';
									}
								},{
									text:'Dependency Description', 
									dataIndex:'Description',
									flex:1	
								},{
									text:'Needed By',			
									dataIndex:'NeededBy',
									width:90,
									sortable:true,
									renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');}
								},{
									text:'Teams Depended On',
									dataIndex:'DependencyID',
									xtype:'intelcomponentcolumn',
									html:	'<div class="predecessor-items-grid-header" style="width:10px !important;"></div>' +
											'<div class="predecessor-items-grid-header" style="width:110px !important;">Team Name</div>' +
											'<div class="predecessor-items-grid-header" style="width:95px  !important;">Supported</div>' +
											'<div class="predecessor-items-grid-header" style="width:70px  !important;">#</div>' +
											'<div class="predecessor-items-grid-header" style="width:130px !important;">User Story</div>',
									width:420,
									renderer: function(dependencyID, meta, record, rowIndex){
										var swallowEventHandler = {
											element: 'el',
											fn: function(a){ a.stopPropagation(); }
										};
										var predecessorItemColumnCfgs = [{
											dataIndex:'PredecessorProjectObjectID',
											width:115,
											renderer: function(val, meta){
												var projectRecord = me.ProjectsWithTeamMembers[val];
												if(val && projectRecord) return projectRecord.data.Name;
												else return '-';
											}
										},{
											dataIndex:'Supported',
											width:80,
											renderer: function(val, meta){
												if(val == 'No') meta.tdCls = 'predecessor-item-not-supported-cell';
												else if(val == 'Yes') meta.tdCls = 'predecessor-item-supported-cell';
												return val;
											}
										},{
											dataIndex:'PredecessorUserStoryObjectID',
											width:75,
											renderer: function(userStoryObjectID, meta, predecessorItemRecord){
												if(predecessorItemRecord.data.Assigned){
													var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
													if(userStory) return userStory.data.FormattedID;
													else return '?';
												}
												else return '-';
											}
										},{
											dataIndex:'PredecessorUserStoryObjectID',
											width:140,
											renderer: function(userStoryObjectID, meta, predecessorItemRecord){
												if(predecessorItemRecord.data.Assigned){
													var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
													if(userStory) return userStory.data.Name;
													else return '?';
												}
												else return '-';
											}				
										}];
										
										return {
											xtype: 'grid',
											cls:'risksdeps-grid duplicate-predecessor-items-grid rally-grid',
											viewConfig: { stripeRows:false },
											width:420,
											manageHeight:false,
											columns: predecessorItemColumnCfgs,
											listeners: {
												mousedown: swallowEventHandler,
												mousemove: swallowEventHandler,
												mouseout: swallowEventHandler,
												mouseover: swallowEventHandler,
												mouseup: swallowEventHandler,
												mousewheel: swallowEventHandler,
												scroll: swallowEventHandler,
												click: swallowEventHandler,
												dblclick: swallowEventHandler,
												contextmenu: swallowEventHandler,
												selectionchange: function(){ this.getSelectionModel().deselectAll(); }
											},
											rowLines:false,
											disableSelection: true,
											scroll:false,
											hideHeaders:true,
											enableEditing:false,
											store: Ext.create('Rally.data.custom.Store', { data: predecessorsOfOneID[rowIndex].PredecessorItems })
										};
									}
								}],
								selModel: Ext.create('Ext.selection.CheckboxModel', {
									mode:'SINGLE',
									allowDeselect:false
								}),
								listeners:{ viewready: function(){ this.getSelectionModel().select(0); }},
								manageHeight:false,
								sortableColumns:false,
								showRowActionsColumn:false,
								showPagingToolbar:false,
								enableEditing:false,
								store:Ext.create('Rally.data.custom.Store', { data: predecessorsOfOneID })
							};
						})
					) : []).concat([{
						xtype:'button',
						cls:'done-button',
						text:'Done',
						handler:function(){
							var grids = Ext.ComponentQuery.query('grid', modal),
								predecessorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-predecessors-grid'); });

							modal.setLoading('Removing Duplicates');
							Q.all([
								Q.all(_.map(predecessorGrids, function(grid){ 
									var predecessorToKeep = grid.getSelectionModel().getSelection()[0],
										predecessorsToRemove = _.filter(grid.store.getRange(), function(item){ return item.id != predecessorToKeep.id; });
									return Q.all(_.map(predecessorsToRemove, function(predecessorRecord){			
										var deferred = Q.defer(),
											projectRecord = me.ProjectsWithTeamMembers[predecessorRecord.data.ProjectObjectID];
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(predecessorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me.getRealDependencyData(
														oldUserStoryRecord, predecessorRecord.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me.getRemovedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems,  
														realPredecessorData,
														projectRecord,
														me.ProjectsWithTeamMembers,
														null,
														me.DependenciesParsedData).then(function(removedCallbacks){
													var promise = Q();
													_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });													
													return promise.then(function(){
														return me.removePredecessor(
															oldUserStoryRecord, realPredecessorData, null, me.DependenciesParsedData);
													});
												});											
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-Dependencies'); 
										return deferred.promise;
									}))
									.then(function(){
										var deferred = Q.defer(),
											projectRecord = me.ProjectsWithTeamMembers[predecessorToKeep.data.ProjectObjectID];
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(predecessorToKeep.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me.getRealDependencyData(
														oldUserStoryRecord, predecessorToKeep.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me.getAddedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems, 
														realPredecessorData,
														projectRecord,
														me.ProjectsWithTeamMembers,
														null,
														me.DependenciesParsedData).then(function(addedCallbacks){
													var promise = Q();
													_.each(addedCallbacks, function(callback){ promise = promise.then(callback); });			
													return promise.then(function(){
														return me.addPredecessor(
															oldUserStoryRecord, realPredecessorData, null, me.DependenciesParsedData);
													});
												});											
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-Dependencies'); 
										return deferred.promise;
									});
								}))
							]).then(function(){
								modal.destroy();
								deferred.resolve();
							})
							.fail(function(reason){ 
								modal.destroy();
								deferred.reject(reason); 
							})
							.done();
						}
					}])
				});
			setTimeout(function(){ modal.show(); }, 10);
			return deferred.promise;
		},
		
		/**___________________________________ RENDER GRIDS ___________________________________*/	
		renderRisksGrid: function(){
			this.RisksGrid = this.add({
				xtype: 'intelriskgrid',
				id: 'risk-grid',
				height:360,
				releaseRecord: this.ReleaseRecord,
				scrumGroupRootRecord: this.ScrumGroupRootRecord,
				projectRecords: _.map(this.ProjectsWithTeamMembers, function(p){ return p; }),
				portfolioItemRecords: this.PortfolioItemStore.getRange(),
				topPortfolioItemMap: this.PortfolioItemMap,
				topPortfolioItemType: this.PortfolioItemTypes.slice(-1)[0],
				risks: this.Risks,
				visibleColumns: [
					'PortfolioItemFormattedID',
					'PortfolioItemName',
					'TopPortfolioItemName',
					'OwningProject',
					'Description',
					'Impact',
					'MitigationPlan',
					'Status',
					'RiskLevel',
					'Checkpoint',
					'Owner',
					'Submitter',
					'UndoButton',
					'SaveButton',
					'CopyButton',
					'DeleteButton'
				]
			});
		},
		renderDependenciesGrids: function(){
			var me = this;
			
			function dependencySorter(o1, o2){ return o1.data.DependencyID > o2.data.DependencyID ? -1 : 1; } //new come first
			function predecessorItemSorter(o1, o2){ return o1.data.PredecessorItemID > o2.data.PredecessorItemID ? -1 : 1; } //new come first
			
			/****************************** STORES FOR THE DROPDOWNS  ***********************************************/	
			me.UserStoryFIDStore = Ext.create('Ext.data.Store', {
				fields: ['FormattedID'],
				data: _.map(me.UserStoriesInRelease, function(usr){ return {'FormattedID': usr.data.FormattedID}; }),
				sorters: { property: 'FormattedID' }
			});
			me.UserStoryNameStore = Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: _.map(me.UserStoriesInRelease, function(usr){ return {'Name': usr.data.Name }; }),
				sorters: { property: 'Name' }
			});
			
			/****************************** PREDECESSORS STUFF ***********************************************/				
			me.PrececessorItemStores = {};
			me.PredecessorItemGrids = {};
			
			var predecessorStore = Ext.create('Intel.lib.component.Store', { 
				data: Ext.clone(me.DependenciesParsedData.Predecessors),
				autoSync:true,
				model:'IntelPredecessorDependencyForTracking',
				limit:Infinity,
				disableMetaChangeEvent: true,
				proxy: {
					type:'intelsessionstorage',
					id:'IntelPredecessorDependencyProxy' + Math.random()
				},
				sorters:[dependencySorter],
				intelUpdate: function(){ 
					var realPredecessorsData = me.DependenciesParsedData.Predecessors.slice(); 
					predecessorStore.suspendEvents(true);
					_.each(predecessorStore.getRange(), function(predecessorRecord){
						var dependencyID = predecessorRecord.data.DependencyID,
							realPredecessorData = me.spliceDependencyFromList(dependencyID, realPredecessorsData),	
							dirtyType = me.getDirtyType(predecessorRecord, realPredecessorData),
							predecessorItemStore = me.PrececessorItemStores[dependencyID],
							predecessorItemGrid = me.PredecessorItemGrids[dependencyID],
							remoteChanged = false;
						if(dirtyType === 'New' || dirtyType === 'Edited'){} //we don't want to remove any pending changes			
						else if(dirtyType == 'Deleted'){ //predecessor was deleted by someone else, and we aren't editing it
							predecessorStore.remove(predecessorRecord);
							if(predecessorItemStore) me.PrececessorItemStores[dependencyID] = undefined;
							if(predecessorItemGrid) me.PredecessorItemGrids[dependencyID] = undefined;
						} else {
							if(!_.isEqual(predecessorRecord.data.PredecessorItems, realPredecessorData.PredecessorItems)){ 
								/** faster to delete and re-add if predecessorItems are different */
								if(predecessorItemGrid) {
									me.PredecessorItemGrids[dependencyID].destroy();
									delete me.PredecessorItemGrids[dependencyID];
								}
								predecessorStore.remove(predecessorRecord);
								predecessorStore.add(Ext.create('IntelPredecessorDependencyForTracking', Ext.clone(realPredecessorData)));
								if(predecessorItemStore) predecessorItemStore.intelUpdate(); 
							}
							else {	
								_.each(realPredecessorData, function(value, field){
									if(field!=='PredecessorItems' && !_.isEqual(predecessorRecord.data[field], value)) remoteChanged = true;
								});
								if(remoteChanged){
									predecessorRecord.beginEdit();
									_.each(realPredecessorData, function(value, field){ 
										if(field!=='PredecessorItems') predecessorRecord.set(field, value); 
									});
									predecessorRecord.endEdit();
								}
							}
						}				
						if(!predecessorRecord.data.PredecessorItems.length) {
							//DO NOT SET EDITED==true, because it is already true! only new or edited will ever have preds.length==0
							predecessorRecord.set('PredecessorItems', [me.newPredecessorItem()]); 
							if(predecessorItemStore) predecessorItemStore.intelUpdate();
						}
					});
					
					_.each(realPredecessorsData, function(realPredecessorData){
						/** add all the new dependencies that other people have added since the last load */
						predecessorStore.add(Ext.create('IntelPredecessorDependencyForTracking', Ext.clone(realPredecessorData)));					
						var dependencyID = realPredecessorData.DependencyID,
							predecessorItemStore = me.PrececessorItemStores[dependencyID];
						if(predecessorItemStore) predecessorItemStore.intelUpdate(); 
					});
					predecessorStore.resumeEvents();
				}
			});
			var predecessorColumns = [{
				text:'#', 
				dataIndex:'UserStoryFormattedID',
				width:90,
				sortable:true,
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:1,		
				sortable:true,
				items:[{ xtype:'intelgridcolumnfilter' }]	
			},{
				text: me.PortfolioItemTypes.slice(-1).pop(), 
				dataIndex: 'TopPortfolioItemName',
				width:90,
				sortable:true,
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				text:'Owning Team', 
				dataIndex:'ProjectObjectID',
				flex:2,
				sortable:true,
				renderer: function(oid){ return ((me.ProjectsWithTeamMembers[oid] || {}).data || {}).Name || '?'; },
				items:[{ 
					xtype:'intelgridcolumnfilter',
					convertDisplayFn: function(oid){ return ((me.ProjectsWithTeamMembers[oid] || {}).data || {}).Name || '?'; }
				}]
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1
			},{
				text:'Needed By',			
				dataIndex:'NeededBy',
				width:90,
				renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');},
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : undefined; }
				}]
			},{
				text:'Teams Depended On',
				dataIndex:'DependencyID',
				xtype:'intelcomponentcolumn',
				html:	'<div class="predecessor-items-grid-header" style="width:10px !important;"></div>' +
						'<div class="predecessor-items-grid-header" style="width:110px !important;">Team Name</div>' +
						'<div class="predecessor-items-grid-header" style="width:95px  !important;">Supported</div>' +
						'<div class="predecessor-items-grid-header" style="width:70px  !important;">#</div>' +
						'<div class="predecessor-items-grid-header" style="width:130px !important;">User Story</div>',
				width:450,
				renderer: function(dependencyID){
					var predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
						predecessorItems = predecessorRecord.data.PredecessorItems;
					if(!me.PrececessorItemStores[dependencyID]){
						me.PrececessorItemStores[dependencyID] = Ext.create('Intel.lib.component.Store', { 
							model:'IntelPredecessorItem',
							data: predecessorItems,
							autoSync:true,
							limit:Infinity,
							disableMetaChangeEvent: true,
							proxy: {
								type:'intelsessionstorage',
								id:'PredecessorItem-' + dependencyID + '-proxy' + Math.random()
							},
							sorters:[predecessorItemSorter],
							intelUpdate: function(){
								var predecessorItemStore = me.PrececessorItemStores[dependencyID],
									predecessorItems = predecessorItemStore.getRange(),
									predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
									realPredecessorItemsData = predecessorRecord.data.PredecessorItems.slice();
								predecessorItemStore.suspendEvents(true);
								_.each(predecessorItems, function(predecessorItem){
									var realPredecessorItemData = _.find(realPredecessorItemsData, function(realPredecessorItemData){
										return realPredecessorItemData.PredecessorItemID === predecessorItem.data.PredecessorItemID;
									});
									if(realPredecessorItemData){
										realPredecessorItemsData = _.filter(realPredecessorItemsData, function(realPredecessorItemData2){
											return realPredecessorItemData.PredecessorItemID !== realPredecessorItemData2.PredecessorItemID;
										});
										_.each(realPredecessorItemData, function(value, field){
											if(!_.isEqual(predecessorItem.data[field], value)){ 
												predecessorItemStore.remove(predecessorItem);
												predecessorItemStore.add(Ext.create('IntelPredecessorItem', Ext.clone(realPredecessorItemData)));
												return false;
											}
										});
									}
									else predecessorItemStore.remove(predecessorItem);
								});
								_.each(realPredecessorItemsData, function(realPredecessorItemData){
									predecessorItemStore.add(Ext.create('IntelPredecessorItem', realPredecessorItemData));
								});	
								
								if(predecessorItemStore.getRange().length===0) {
									var newItem = me.newPredecessorItem();
									predecessorItemStore.add(Ext.create('IntelPredecessorItem', newItem));
									predecessorRecord.data.PredecessorItems.push(newItem);
								}
								predecessorItemStore.resumeEvents();
							}
						});	
					}
					
					if(me.PredecessorItemGrids[dependencyID]) return me.PredecessorItemGrids[dependencyID];
						
					var swallowEventHandler = {
						element: 'el',
						fn: function(a){ a.stopPropagation(); }
					};
					
					var predecessorItemColumns = [{
						dataIndex:'PredecessorProjectObjectID',
						width:115,
						renderer: function(val, meta){
							var projectRecord = me.ProjectsWithTeamMembers[val];
							if(val && projectRecord) return projectRecord.data.Name;
							else return '-';
						}
					},{
						dataIndex:'Supported',
						width:80,
						renderer: function(val, meta){
							if(val == 'No') meta.tdCls = 'predecessor-item-not-supported-cell';
							else if(val == 'Yes') meta.tdCls = 'predecessor-item-supported-cell';
							return val;
						}
					},{
						dataIndex:'PredecessorUserStoryObjectID',
						width:75,
						renderer: function(userStoryObjectID, meta, predecessorItemRecord){
							if(predecessorItemRecord.data.Assigned){
								var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
								if(userStory) return userStory.data.FormattedID;
								else return '?';
							}
							else return '-';
						}
					},{
						dataIndex:'PredecessorUserStoryObjectID',
						width:140,
						renderer: function(userStoryObjectID, meta, predecessorItemRecord){
							if(predecessorItemRecord.data.Assigned){
								var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
								if(userStory) return userStory.data.Name;
								else return '?';
							}
							else return '-';
						}				
					}];
					
					return {
						xtype: 'grid',
						cls:'risksdeps-grid predecessor-items-grid rally-grid',
						plugins: [ 'intelcellediting' ],
						viewConfig: { stripeRows:false },
						width:420,
						manageHeight:false,
						columns: {
							defaults: COLUMN_DEFAULTS,
							items: predecessorItemColumns
						},
						listeners: {
							mousedown: swallowEventHandler,
							mousemove: swallowEventHandler,
							mouseout: swallowEventHandler,
							mouseover: swallowEventHandler,
							mouseup: swallowEventHandler,
							mousewheel: swallowEventHandler,
							scroll: swallowEventHandler,
							click: swallowEventHandler,
							dblclick: swallowEventHandler,
							contextmenu: swallowEventHandler,
							render: function(){ me.PredecessorItemGrids[dependencyID] = this; },
							selectionchange: function(){ this.getSelectionModel().deselectAll(); }
						},
						rowLines:false,
						disableSelection: true,
						scroll:false,
						hideHeaders:true,
						enableEditing:false,
						store: me.PrececessorItemStores[dependencyID]
					};
				}
			},{
				text:'Plan', 
				dataIndex:'Plan',
				flex:1,
				tdCls: 'intel-editor-cell',
				editor: 'inteltextarea'
			},{
				dataIndex:'Status',
				width:90,
				tdCls: 'intel-editor-cell',
				text:'Disposition',					
				editor:{
					xtype:'intelfixedcombo',
					store: ['Done', 'Not Done']
				},
				renderer: function(val, meta){
					if(val === 'Done') meta.tdCls += ' predecessor-supported-cell';
					else meta.tdCls += ' predecessor-not-supported-cell';
					return val || 'Not Done';
				},
				items:[{ 
					xtype:'intelgridcolumnfilter',
					convertDisplayFn: function(val){ return val || 'Not Done'; }
				}]
				
			}];
			me.PredecessorGrid = me.add({
				xtype: 'grid',
				cls: 'risksdeps-grid predecessors-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'risksdeps-grid-header-text',
						width:400,
						text: me.getScrumGroupName(me.ScrumGroupRootRecord) + " DEPENDENCIES"
					},{
						xtype:'container',
						flex:1000,
						layout:{
							type:'hbox',
							pack:'end'
						},
						items:[{
							xtype:'button',
							text:'Remove Filters',
							cls: 'intel-button',
							listeners:{ 
								click: function(){ 
									_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', me.PredecessorGrid), 'clearFilters');
									me.PredecessorGrid.store.fireEvent('refresh', me.PredecessorGrid.store);
								}
							}
						}]
					}]
				},
				height:400,
				scroll:'vertical',
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: predecessorColumns
				},
				plugins: [ 'intelcellediting' ],
				viewConfig:{
					xtype:'inteltableview',
					preserveScrollOnRefresh:true
				},
				listeners: {
					edit: function(editor, e){				
						var predecessorRecord = e.record,
							predecessorData = predecessorRecord.data,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value === originalValue) return; 
						else if(!value) { predecessorRecord.set(field, originalValue); return; }
						if(field === 'Plan') {
							value = me.htmlEscape(value);			
							predecessorRecord.set(field, value);
						}
						
						var previousEdit = predecessorRecord.data.Edited; 
						predecessorRecord.set('Edited', true);
						
						me.PredecessorGrid.setLoading('Saving');
						me.enqueue(function(unlockFunc){
							me.getOldAndNewUserStoryRecords(predecessorData, me.UserStoryStore.getRange()).then(function(records){
								var userStoryRecord = records[1];
								return me.addPredecessor(userStoryRecord, predecessorData, null, me.DependenciesParsedData);
							})
							.then(function(){ predecessorRecord.set('Edited', false); })
							.fail(function(reason){ me.alert('ERROR:', reason); })
							.then(function(){
								me.PredecessorGrid.setLoading(false);
								unlockFunc();
							})
							.done();
						});
					}
				},
				disableSelection: true,
				enableEditing:false,
				store: predecessorStore
			});	
		}	
	});
}());