(function(){
	var Ext = window.Ext4 || window.Ext;
	
	var RALLY_MAX_STRING_SIZE = 32768;

	Ext.define('RisksDepsTracking', {
		extend: 'IntelRallyApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'AsyncQueue',
			'ParallelLoader',
			'UserAppsPreference',
			'RisksLib',
			'DependenciesLib'
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
		
		_userAppsPref: 'intel-SAFe-apps-preference',
			
		/**___________________________________ DATA STORE METHODS ___________________________________*/
		_loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: OPIOT');
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
			return me._reloadStore(store);
		},	
		_loadPortfolioItems: function(){ 
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me._loadPortfolioItemsOfType(me.TrainPortfolioProject, type) : 
						me._loadPortfolioItemsOfTypeInRelease(me.TrainPortfolioProject, type)
					)
					.then(function(portfolioStore){
						return {
							ordinal: ordinal,
							store: portfolioStore
						};
					});
				}))
				.then(function(items){
					var orderedPortfolioItemStores = _.sortBy(items, function(item){ return item.ordinal; });
					me.PortfolioItemStore = orderedPortfolioItemStores[0].store;
					me.PortfolioItemMap = {};
					_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItem){ //create the portfolioItem mapping
						var ordinal = 0, 
							parentPortfolioItem = lowPortfolioItem,
							getParentRecord = function(child, parentList){
								return _.find(parentList, function(parent){ return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; });
							};
						while(ordinal < (orderedPortfolioItemStores.length-1) && parentPortfolioItem){
							parentPortfolioItem = getParentRecord(parentPortfolioItem, orderedPortfolioItemStores[ordinal+1].store.getRange());
							++ordinal;
						}
						if(ordinal === (orderedPortfolioItemStores.length-1) && parentPortfolioItem)
							me.PortfolioItemMap[lowPortfolioItem.data.ObjectID] = parentPortfolioItem.data.Name;
					});
				});
		},
		_getUserStoryFilter: function(){
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
		_loadUserStories: function(){	
			/** what this function should REALLY do is return the user stories that contribute to this train's portfolio, regardless of project */
			var me=this, 
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				config = {
					model: me.UserStory,
					url: me.BaseUrl + '/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query: me._getUserStoryFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'Release', 'FormattedID', lowestPortfolioItem, 'c_Dependencies'].join(','),
						project:me.TrainRecord.data._ref,
						projectScopeDown:true,
						projectScopeUp:false
					}
				};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
	
		/**___________________________________ RISKS STUFF___________________________________**/
		_parseRisksFromPortfolioItem: function(portfolioItemRecord){
			var me=this,
				array = [], 
				risks = me._getRisks(portfolioItemRecord),
				PortfolioItemObjectID = portfolioItemRecord.data.ObjectID,
				PortfolioItemFormattedID = portfolioItemRecord.data.FormattedID,
				PortfolioItemName = portfolioItemRecord.data.Name,
				TopPortfolioItemName = me.PortfolioItemMap[portfolioItemRecord.data.ObjectID] || '';
				
			_.each(risks, function(risksData, projectID){
				_.each(risksData, function(riskData, riskID){
					array.push({
						RiskID: riskID,
						PortfolioItemObjectID: PortfolioItemObjectID,
						PortfolioItemFormattedID: PortfolioItemFormattedID,
						PortfolioItemName: PortfolioItemName,		
						TopPortfolioItemName: TopPortfolioItemName,
						ProjectObjectID: projectID,
						Description: riskData.Description,
						Impact: riskData.Impact,
						MitigationPlan: riskData.MitigationPlan,
						Urgency: riskData.Urgency,
						Status: riskData.Status,
						Contact: riskData.Contact,
						Checkpoint: riskData.Checkpoint,
						Edited: false
					});
				});
			});
			return array;
		},	
		_parseRisksData: function(){ 
			var me=this, 
				array = [];
			_.each(me.PortfolioItemStore.getRecords(), function(portfolioItemRecord){
				array = array.concat(me._parseRisksFromPortfolioItem(portfolioItemRecord));
			});
			return array;
		},		
		_spliceRiskFromList: function(riskID, risksData){ 
			for(var i = 0; i<risksData.length; ++i){
				if(risksData[i].RiskID == riskID) {
					return risksData.splice(i, 1)[0];
				}
			}
		},	
		_getRealRiskData: function(oldPortfolioItemRecord, riskID){ 
			var me = this, realRisksData;
			if(oldPortfolioItemRecord) realRisksData = me._parseRisksFromPortfolioItem(oldPortfolioItemRecord);
			else realRisksData = [];
			return me._spliceRiskFromList(riskID, realRisksData) || null;		
		},
		
		/**___________________________________ DEPENDENCIES STUFF ___________________________________	**/
		_isUserStoryInRelease: function(userStoryRecord, releaseRecord){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			return ((userStoryRecord.data.Release || {}).Name === releaseRecord.data.Name) || 
				(!userStoryRecord.data.Release && ((userStoryRecord.data[lowestPortfolioItem] || {}).Release || {}).Name === releaseRecord.data.Name);
		},	
		_spliceDependencyFromList: function(dependencyID, dependencyList){ 
			for(var i = 0; i<dependencyList.length; ++i){
				if(dependencyList[i].DependencyID == dependencyID) {
					return dependencyList.splice(i, 1)[0];
				}
			}
		},
		_parseDependenciesFromUserStory: function(userStoryRecord){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				dependencies = me._getDependencies(userStoryRecord), 
				inputPredecessors = dependencies.Predecessors, 
				outputPredecessors = [], 
				UserStoryObjectID = userStoryRecord.data.ObjectID,
				UserStoryFormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name,
				TopPortfolioItemName = me.PortfolioItemMap[(userStoryRecord.data[lowestPortfolioItem] || {}).ObjectID] || '',
				ProjectObjectID = (userStoryRecord.data.Project || {}).ObjectID || 0;
				
			if(me._isUserStoryInRelease(userStoryRecord, me.ReleaseRecord)){
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
						Status: predecessorDependency.Status,
						PredecessorItems: predecessorDependency.PredecessorItems || [], 
						Edited: false 
					});
				});
			}
			return {Predecessors:outputPredecessors, Successors:[]};
		},
		_parseDependenciesData: function(userStories){	
			var me=this, 
				predecessors = [], 
				successors = [];			

			_.each(userStories, function(userStoryRecord){
				var dependenciesData = me._parseDependenciesFromUserStory(userStoryRecord);
				predecessors = predecessors.concat(dependenciesData.Predecessors);
				successors = successors.concat(dependenciesData.Successors);
			});
			return {Predecessors:predecessors, Successors:successors};
		},		
		_getRealDependencyData: function(oldUserStoryRecord, dependencyID, type){ 
			/** type is 'Predecessors' or 'Successors' */
			var me = this, realDependencyData;
			if(oldUserStoryRecord) realDependencyData = me._parseDependenciesFromUserStory(oldUserStoryRecord)[type];
			else realDependencyData = [];
			return me._spliceDependencyFromList(dependencyID, realDependencyData) || null;		
		},
		_hydrateDependencyUserStories: function(dependenciesParsedData){
			var me=this, 
				storyOIDsToHydrate = [],
				dependenciesHydratedUserStories = {};
			
			_.each(dependenciesParsedData.Predecessors, function(predecessor){
				_.each(predecessor.PredecessorItems, function(predecessorItem){
					storyOIDsToHydrate.push(predecessorItem.PredecessorUserStoryObjectID);
				});
			});
			
			return Q.all(_.map(storyOIDsToHydrate, function(storyOID){
				return me._loadUserStory(storyOID).then(function(userStory){
					if(userStory) dependenciesHydratedUserStories[storyOID] = userStory;
				});
			}))
			.then(function(){ return dependenciesHydratedUserStories; });
		},
		
		/**___________________________________ MISC HELPERS ___________________________________*/		
		_htmlEscape: function(str) {
			return String(str)
				//.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		},	
		_getDirtyType: function(localRecord, realDataFromServer){ 
			/** if risk or dep record is new/edited/deleted/unchanged */
			if(!realDataFromServer)	return localRecord.data.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else return localRecord.data.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		},
		_updateUserStoryColumnStores: function(){ 
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
		_updatePortfolioItemColumnStores: function(){ 
			/** updates the dropdown stores with the most recent portfolioItems in the release */
			var me = this, 
				portfolioItems = me.PortfolioItemStore.getRange();
			if(me.PortfolioItemFIDStore){
				me.PortfolioItemFIDStore.removeAll();
				_.each(portfolioItems, function(portfolioItem){
					me.PortfolioItemFIDStore.add({'FormattedID': portfolioItem.data.FormattedID});
				});
			}
			if(me.PortfolioItemNameStore) {
				me.PortfolioItemNameStore.removeAll();
				_.each(portfolioItems, function(portfolioItem){
					me.PortfolioItemNameStore.add({'Name': portfolioItem.data.Name});
				});
			}
		},
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		_isEditing: function(store){
			if(!store) return false;
			return _.some(store.getRange(), function(record){ return record.data.Edited; });
		},		
		_showGrids: function(){
			var me=this;
			if(!me.RisksGrid){
				me._loadRisksGrid();
				me._loadDependenciesGrids();
			}
		},	
		_checkForDuplicates: function(){ 
			/** duplicates are in a list of groups of duplicates for each type */
			var me=this,
				deferred = Q.defer(),
				duplicateRisks = _.filter(_.groupBy(me.RisksParsedData,
					function(risk){ return risk.RiskID; }),
					function(list, riskID){ return list.length > 1; }),
				duplicatePredecessors = _.filter(_.groupBy(me.DependenciesParsedData.Predecessors,
					function(dependency){ return dependency.DependencyID; }),
					function(list, dependencyID){ return list.length > 1; });
			if(duplicateRisks.length || duplicatePredecessors.length){
				me._loadResolveDuplicatesModal(duplicateRisks, duplicatePredecessors)
					.then(function(){ 
						me._clearEverything();
						me.setLoading('Loading Data');
						return me._reloadStores(); 
					})
					.then(function(){ return me._updateGrids(); })
					.then(function(){ me.setLoading(false); })
					.then(function(){ deferred.resolve(); })
					.fail(function(reason){ deferred.reject(reason); })
					.done();
			} else deferred.resolve();
			
			return deferred.promise;
		},
		_updateGrids: function(){
			var me=this,
				promises = [],
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore);
			if(!isEditingRisks && me.PortfolioItemStore){
				me.RisksParsedData = me._parseRisksData();
				me._updatePortfolioItemColumnStores();
				if(me.CustomRisksStore) me.CustomRisksStore.intelUpdate();
			}
			if(!isEditingDeps && me.UserStoryStore && me.PortfolioItemStore){		
				me.UserStoriesInRelease = _.filter(me.UserStoryStore.getRange(), function(userStoryRecord){ 
					return me._isUserStoryInRelease(userStoryRecord, me.ReleaseRecord); 
				});
				me.DependenciesParsedData = me._parseDependenciesData(me.UserStoryStore.getRange());
				promises.push(me._hydrateDependencyUserStories(me.DependenciesParsedData).then(function(dependenciesHydratedUserStories){
					me.DependenciesHydratedUserStories = dependenciesHydratedUserStories;
					me._updateUserStoryColumnStores();
					if(me.CustomPredecessorStore) me.CustomPredecessorStore.intelUpdate();
				}));
			}
			return Q.all(promises);
		},	
		_reloadStores: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore),
				promises = [];
			if(!isEditingRisks) promises.push(me._loadPortfolioItems());
			if(!isEditingDeps) promises.push(me._loadUserStories());
			return Q.all(promises);
		},
		_clearEverything: function(){
			var me=this;
			
			me.PortfolioItemMap = {};
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			
			me.PredecessorGrid = undefined;
			me.RisksGrid = undefined;
			
			me.CustomPredecessorStore = undefined;
			me.CustomRisksStore = undefined;
			
			var toRemove = me.down('#navbox').next(), tmp;
			while(toRemove){ //delete risks and dependencies 
				tmp = toRemove.next();
				toRemove.up().remove(toRemove);
				toRemove = tmp;
			}
		},
		_reloadEverything:function(){
			var me = this;
			
			me._clearEverything();
			me.setLoading('Loading Data');
			if(!me.ReleasePicker){ //draw these once, never remove them
				me._loadReleasePicker();
				me._loadManualRefreshButton();
			}		
			me._enqueue(function(unlockFunc){	
				me._reloadStores()
					.then(function(){ return me._updateGrids(); })
					.then(function(){ return me._checkForDuplicates(); })
					.then(function(){ return me._showGrids(); })
					.fail(function(reason){	me._alert('ERROR', reason || ''); })
					.then(function(){
						unlockFunc();
						me.setLoading(false); 
					})
					.done();
			}, 'Queue-Main');
		},
		
		/**___________________________________ REFRESHING DATA ___________________________________*/	
		_setLoadingMasks: function(){
			var me=this, message = 'Refreshing Data',
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore);			
			if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(message);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(message);
		},	
		_removeLoadingMasks: function(){
			var me=this,
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore);		
			if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(false);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(false);
		},	
		_refreshDataFunc: function(){
			var me=this;
			me._setLoadingMasks();
			me._enqueue(function(unlockFunc){
				me._reloadStores()
					.then(function(){ return me._updateGrids(); })
					.then(function(){ return me._checkForDuplicates(); })
					.then(function(){ return me._showGrids(); })
					.fail(function(reason){ me._alert('ERROR', reason || ''); })
					.then(function(){ 
						unlockFunc();
						me._removeLoadingMasks();
					})
					.done();
			}, 'Queue-Main');
		},	

		/**___________________________________ LAUNCH ___________________________________*/
		launch: function(){
			var me=this;
			me.setLoading('Loading Configuration');
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
				me.setLoading(false);
				me._alert('ERROR', 'You do not have permissions to edit this project');
				return;
			} 
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ // 3 streams
						me._loadProjectsWithTeamMembers() /********* 1 ************/
							.then(function(projectsWithTeamMembers){
								me.ProjectsWithTeamMembers = projectsWithTeamMembers;
								me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
							}),
						me._projectInWhichTrain(me.ProjectRecord) /********* 2 ************/
							.then(function(trainRecord){
								if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID){
									me.TrainRecord = trainRecord;
									return me._loadTrainPortfolioProject(me.TrainRecord)
										.then(function(trainPortfolioProject){
											me.TrainPortfolioProject = trainPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a train');
							}),
						me._loadAppsPreference() /********* 3 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									me.WorkweekData = me._getWorkWeeksForDropdown(currentRelease.data.ReleaseStartDate, currentRelease.data.ReleaseDate);
								}
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		_releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			me.WorkweekData = me._getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ me._reloadEverything(); })
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeft').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},	
		_loadManualRefreshButton: function(){
			var me=this;
			me.down('#navboxRight').add({
				xtype:'button',
				id: 'manualRefreshButton',
				text:'Refresh Data',
				width:100,
				listeners:{
					click: me._refreshDataFunc.bind(me)
				}
			});
		},
		
		/**___________________________________ RENDER RESOLVE DUPLICATES ___________________________________*/	
		_loadResolveDuplicatesModal: function(duplicateRisks, duplicatePredecessors){
			var me=this,
				deferred = Q.defer(),
				defaultRenderer = function(val){ return val || '-'; },	
				modal = Ext.create('Ext.window.Window', {
					modal:true,
					closable:false,
					title:'ERROR: Duplicate Risks and/or Dependencies!',
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
					}].concat(duplicateRisks.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Risks</h2>',
							manageHeight:false
						}].concat(_.map(duplicateRisks, function(risksOfOneID){
							return {
								xtype:'rallygrid',
								cls: 'risksdeps-grid duplicate-risks-grid rally-grid',
								columnCfgs: [{
									text:'#',
									dataIndex:'PortfolioItemFormattedID',
									width:80,
									editor: false,
									resizable:false,
									draggable:false,
									sortable:true,
									renderer:defaultRenderer
								},{
									text: me.PortfolioItemTypes[0], 
									dataIndex:'PortfolioItemName',
									flex:1,
									editor: false,
									resizable:false,
									draggable:false,
									sortable:true,
									renderer:defaultRenderer
								},{
									text:'Team', 
									dataIndex:'ProjectObjectID',
									flex:1,
									minWidth:100,
									editor:false,	
									resizable:false,
									draggable:false,
									sortable:true,
									renderer:function(projectObjectID){
										return ((me.ProjectsWithTeamMembers[projectObjectID] || {}).data || {}).Name || '?';
									}
								},{
									text:'Risk Description (If This...)', 
									dataIndex:'Description',
									flex:1,
									editor: false,
									resizable:false,
									draggable:false,
									sortable:false,
									renderer:defaultRenderer	
								},{
									text:'Impact (Then this...)', 
									dataIndex:'Impact',
									flex:1,
									resizable:false,
									draggable:false,
									sortable:false,
									editor: false,
									renderer:defaultRenderer
								},{
									text:'Mitigation Plan', 
									dataIndex:'MitigationPlan',
									flex:1,
									resizable:false,
									draggable:false,
									sortable:false,
									editor: false,
									renderer:defaultRenderer
								},{
									text:'Status',
									dataIndex:'Status',
									width:100,		
									tooltip:'(ROAM)',
									tooltipType:'title',		
									editor:false,
									resizable:false,
									draggable:false,
									sortable:true,
									renderer:function(val, meta){
										meta.tdCls += (val==='Undefined' ? ' risks-grid-error-cell' : '');
										return val || '-';
									}	
								},{
									text:'Contact', 
									dataIndex:'Contact',	
									flex:1,
									editor: false,
									sortable:false,
									resizable:false,
									draggable:false,
									renderer:defaultRenderer		
								},{
									text:'Checkpoint',	
									dataIndex:'Checkpoint',
									width:90,
									resizable:false,	
									draggable:false,			
									editor:false,
									sortable:true,
									renderer:function(date){ return date ? 'ww' + me._getWorkweek(date) : '-'; }
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
								store:Ext.create('Rally.data.custom.Store', { data: risksOfOneID })
							};
						})
					) : []).concat(duplicatePredecessors.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Predecessors</h2>',
							manageHeight:false
						}].concat(_.map(duplicatePredecessors, function(predecessorsOfOneID){
							return {
								xtype:'rallygrid',
								cls: 'risksdeps-grid duplicate-predecessors-grid rally-grid',
								columnCfgs: [{
									text:'#', 
									dataIndex:'UserStoryFormattedID',
									width:90,
									resizable:false,
									draggable:false,
									sortable:true,
									editor:false,
									renderer: defaultRenderer
								},{
									text:'UserStory', 
									dataIndex:'UserStoryName',
									flex:1,
									resizable:false,
									draggable:false,			
									sortable:true,
									editor:false,
									renderer: defaultRenderer
								},{
									text:'Team', 
									dataIndex:'ProjectObjectID',
									flex:1,
									minWidth:100,
									editor:false,	
									resizable:false,
									draggable:false,
									sortable:true,
									renderer:function(projectObjectID){
										return ((me.ProjectsWithTeamMembers[projectObjectID] || {}).data || {}).Name || '?';
									}
								},{
									text:'Dependency Description', 
									dataIndex:'Description',
									flex:1,
									resizable:false,	
									draggable:false,		
									sortable:false,
									editor:false,
									renderer: defaultRenderer			
								},{
									text:'Needed By',			
									dataIndex:'NeededBy',
									width:90,
									resizable:false,
									draggable:false,
									sortable:true,
									editor:false,
									renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');}
								},{
									text:'Teams Depended On',
									dataIndex:'DependencyID',
									xtype:'fastgridcolumn',
									html:	'<div class="predecessor-items-grid-header" style="width:10px !important;"></div>' +
											'<div class="predecessor-items-grid-header" style="width:110px !important;">Team Name</div>' +
											'<div class="predecessor-items-grid-header" style="width:95px  !important;">Supported</div>' +
											'<div class="predecessor-items-grid-header" style="width:70px  !important;">#</div>' +
											'<div class="predecessor-items-grid-header" style="width:130px !important;">User Story</div>',
									width:420,
									resizable:false,
									draggable:false,
									sortable:false,
									renderer: function(dependencyID, meta, record, rowIndex){
										var swallowEventHandler = {
											element: 'el',
											fn: function(a){ a.stopPropagation(); }
										};
										var predecessorItemColumnCfgs = [{
											dataIndex:'PredecessorProjectObjectID',
											width:115,
											resizable:false,
											renderer: function(val, meta){
												var projectRecord = me.ProjectsWithTeamMembers[val];
												if(val && projectRecord) return projectRecord.data.Name;
												else return '-';
											},
											editor: false
										},{
											dataIndex:'Supported',
											width:80,
											resizable:false,
											editor: false,
											renderer: function(val, meta){
												if(val == 'No') meta.tdCls = 'predecessor-item-not-supported-cell';
												else if(val == 'Yes') meta.tdCls = 'predecessor-item-supported-cell';
												return val;
											}
										},{
											dataIndex:'PredecessorUserStoryObjectID',
											width:75,
											resizable:false,
											editor: false,
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
											resizable:false,
											editor: false,
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
											xtype: 'rallygrid',
											cls:'risksdeps-grid duplicate-predecessor-items-grid rally-grid',
											viewConfig: { stripeRows:false },
											width:420,
											manageHeight:false,
											columnCfgs: predecessorItemColumnCfgs,
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
											showRowActionsColumn:false,
											showPagingToolbar:false,
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
							var grids = Ext.ComponentQuery.query('rallygrid', modal),
								riskGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-risks-grid'); }),
								predecessorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-predecessors-grid'); });

							modal.setLoading('Removing Duplicates');
							Q.all([
								Q.all(_.map(riskGrids, function(grid){ 
									var riskToKeep = grid.getSelectionModel().getSelection()[0],
										risksToDelete = _.filter(grid.store.getRange(), function(item){ return item.id != riskToKeep.id; });
									return Q.all(_.map(risksToDelete, function(riskRecord){
										var deferred = Q.defer(),
											projectRecord = me.ProjectsWithTeamMembers[riskRecord.data.ProjectObjectID];
										me._enqueue(function(unlockFunc){
											me._loadPortfolioItemByOrdinal(riskRecord.data.PortfolioItemObjectID, 0)
											.then(function(oldPortfolioItemRecord){	
												var realRiskData = me._getRealRiskData(oldPortfolioItemRecord, riskRecord.data.RiskID);							
												if(!realRiskData) return;
												return me._removeRisk(oldPortfolioItemRecord, realRiskData, projectRecord, me.RisksParsedData);
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-' + riskRecord.data.PortfolioItemObjectID); 
										return deferred.promise;
									}));
								})),
								Q.all(_.map(predecessorGrids, function(grid){ 
									var predecessorToKeep = grid.getSelectionModel().getSelection()[0],
										predecessorsToRemove = _.filter(grid.store.getRange(), function(item){ return item.id != predecessorToKeep.id; });
									return Q.all(_.map(predecessorsToRemove, function(predecessorRecord){			
										var deferred = Q.defer(),
											projectRecord = me.ProjectsWithTeamMembers[predecessorRecord.data.ProjectObjectID];
										me._enqueue(function(unlockFunc){
											me._getOldAndNewUserStoryRecords(predecessorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me._getRealDependencyData(
														oldUserStoryRecord, predecessorRecord.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me._getRemovedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems,  
														realPredecessorData,
														projectRecord,
														me.ProjectsWithTeamMembers,
														null,
														me.DependenciesParsedData).then(function(removedCallbacks){
													var promise = Q();
													_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });													
													return promise.then(function(){
														return me._removePredecessor(
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
										me._enqueue(function(unlockFunc){
											me._getOldAndNewUserStoryRecords(predecessorToKeep.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me._getRealDependencyData(
														oldUserStoryRecord, predecessorToKeep.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me._getAddedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems, 
														realPredecessorData,
														projectRecord,
														me.ProjectsWithTeamMembers,
														null,
														me.DependenciesParsedData).then(function(addedCallbacks){
													var promise = Q();
													_.each(addedCallbacks, function(callback){ promise = promise.then(callback); });			
													return promise.then(function(){
														return me._addPredecessor(
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
		_loadRisksGrid: function(){
			var me = this,
				defaultRenderer = function(val){ return val || '-'; };		

			/****************************** STORES FOR THE DROPDOWNS  ***********************************************/	
			me.PortfolioItemFIDStore = Ext.create('Ext.data.Store', {
				fields: ['FormattedID'],
				data: _.map(me.PortfolioItemStore.getRange(), function(item){ return {'FormattedID': item.data.FormattedID}; }),
				sorters: { property: 'FormattedID' }
			});	
			me.PortfolioItemNameStore = Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: _.map(me.PortfolioItemStore.getRange(), function(item){ return {'Name': item.data.Name }; }),
				sorters: { property: 'Name' }
			});
			
			/****************************** RISKS STUFF  ***********************************************/		
			me.CustomRisksStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.RisksParsedData),
				autoSync:true,
				model:'IntelRiskForTracking',
				limit:Infinity,
				disableMetaChangeEvent: true,
				proxy: {
					type:'fastsessionproxy',
					id:'RiskProxy' + Math.random()
				},
				sorters: [function riskSorter(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; }],
				intelUpdate: function(){
					var riskStore = me.CustomRisksStore, 
						riskRecords = riskStore.getRange(),
						realRisksData = me.RisksParsedData.slice(), //'real' risks list
						remoteChanged = false; //if someone else updated this while it was idle on our screen	
					riskStore.suspendEvents(true); //batch
					_.each(riskRecords, function(riskRecord){
						var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, realRisksData),
							dirtyType = me._getDirtyType(riskRecord, realRiskData);
						if(dirtyType === 'New' || dirtyType === 'Edited'){} //we don't want to remove any pending changes on a record							
						else if(dirtyType == 'Deleted') // the riskRecord was deleted by someone else, and we arent editing it
							riskStore.remove(riskRecord);
						else { //we are not editing it and it still exists and it was edited somewhere else, so update current copy
							_.each(realRiskData, function(value, field){
								if(!_.isEqual(riskRecord.data[field], value)) remoteChanged = true;
							});
							if(remoteChanged){
								riskRecord.beginEdit();
								_.each(realRiskData, function(value, field){ riskRecord.set(field, realRiskData[field]); });
								riskRecord.endEdit();
							}
						}
					});
					_.each(realRisksData, function(realRiskData){ //add all the new risks that other people have added since first load
						riskStore.add(Ext.create('IntelRiskForTracking', Ext.clone(realRiskData)));
					});
					riskStore.resumeEvents();
				}
			});
			
			var filterFID = null, 
				filterName = null, 
				filterTopPortfolioItem = null, 
				filterTeam = null,
				filterStatus = null, 
				filterUrgency = null,
				filterCheckpoint = null;
			function riskGridFilter(riskRecord){
				if(filterFID && riskRecord.data.PortfolioItemFormattedID != filterFID) return false;
				if(filterName && riskRecord.data.PortfolioItemName != filterName) return false;
				if(filterTopPortfolioItem &&  riskRecord.data.TopPortfolioItemName != filterTopPortfolioItem) return false;
				if(filterTeam && ((me.ProjectsWithTeamMembers[riskRecord.data.ProjectObjectID] || {}).data || {}).Name != filterTeam) return false;
				if(filterStatus && riskRecord.data.Status != filterStatus) return false;
				if(filterUrgency){
					if(filterUrgency == 'Undefined' && riskRecord.data.Urgency && riskRecord.data.Urgency != filterUrgency) return false;
					if(filterUrgency != 'Undefined' && riskRecord.data.Urgency != filterUrgency) return false;
				}
				if(filterCheckpoint && me._roundDateDownToWeekStart(riskRecord.data.Checkpoint)*1 != filterCheckpoint) return false;
				return true;
			}		
			function filterRisksRowsByFn(fn){
				_.each(me.CustomRisksStore.getRange(), function(item, index){
					if(fn(item)) me.RisksGrid.view.removeRowCls(index, 'risksdeps-hidden-grid-row');
					else me.RisksGrid.view.addRowCls(index, 'risksdeps-hidden-grid-row');
				});
			}
			function removeFilters(){
				filterFID = null;
				filterName = null;
				filterTopPortfolioItem = null;
				filterTeam = null;
				filterStatus = null;
				filterUrgency = null;
				filterCheckpoint = null; 
				filterRisksRowsByFn(function(){ return true; });
				Ext.getCmp('risk-fid-filter').setValue('All');
				Ext.getCmp('risk-name-filter').setValue('All');
				Ext.getCmp('risk-top-portfolioitem-filter').setValue('All');
				Ext.getCmp('risk-team-filter').setValue('All');
				Ext.getCmp('risk-status-filter').setValue('All');
				Ext.getCmp('risk-urgency-filter').setValue('All');
				Ext.getCmp('risk-checkpoint-filter').setValue('All');
			}
			
			function getFIDfilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
					function(r){ return r.data.PortfolioItemFormattedID; })), 
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
					function(r){ return r.data.PortfolioItemName; })), 
					function(f){ return f; }), 
					function(n){ return {Name:n}; }));
			}
			function getTopPortfolioItemFilterOptions(){
				return [{PortfolioItemName:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.PortfolioItemMap)), 
					function(p){ return p; }), 
					function(p){ return {PortfolioItemName:p}; }));
			}
			function getTeamFilterOptions(){
				return [{Team: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
					function(r){ return ((me.ProjectsWithTeamMembers[r.data.ProjectObjectID] || {}).data || {}).Name;  })), 
					function(t){ return t; }), 
					function(t){ return {Team: t}; }));
			}
			function getCheckpointFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(),
					function(risk){ return me._roundDateDownToWeekStart(risk.data.Checkpoint)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function updateFilterOptions(){
				var checkpointStore = Ext.getCmp('risk-checkpoint-filter').getStore();
				checkpointStore.removeAll();
				checkpointStore.add(getCheckpointFilterOptions());
			}
			
			var columnCfgs = [{
				text:'#',
				dataIndex:'PortfolioItemFormattedID',
				width:80,
				editor:false,			
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:defaultRenderer,
				layout:'hbox',
				items:[{	
					id:'risk-fid-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['FormattedID'],
						data: getFIDfilterOptions()
					}),
					displayField: 'FormattedID',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.FormattedID == 'All') filterFID = null; 
							else filterFID = selected[0].data.FormattedID;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text: me.PortfolioItemTypes[0], 
				dataIndex:'PortfolioItemName',
				flex:1,
				editor:false,	
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:defaultRenderer,
				layout:'hbox',
				items:[{	
					id:'risk-name-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Name'],
						data: getNameFilterOptions()
					}),
					displayField: 'Name',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Name == 'All') filterName = null; 
							else filterName = selected[0].data.Name;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]		
			},{
				text: me.PortfolioItemTypes.slice(-1).pop(),
				dataIndex:'TopPortfolioItemName',
				width:100,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'risk-top-portfolioitem-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['PortfolioItemName'],
						data: getTopPortfolioItemFilterOptions()
					}),
					displayField: 'PortfolioItemName',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.PortfolioItemName == 'All') filterTopPortfolioItem = null; 
							else filterTopPortfolioItem = selected[0].data.PortfolioItemName;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Team', 
				dataIndex:'ProjectObjectID',
				flex:1,
				minWidth:100,
				editor:false,	
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(projectObjectID){
					return ((me.ProjectsWithTeamMembers[projectObjectID] || {}).data || {}).Name || '?';
				},
				layout:'hbox',
				items:[{	
					id:'risk-team-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Team'],
						data: getTeamFilterOptions()
					}),
					displayField: 'Team',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Team == 'All') filterTeam = null; 
							else filterTeam = selected[0].data.Team;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Risk Description (If This...)', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'inteltextarea',
				resizable:false,
				draggable:false,
				sortable:false,
				renderer:defaultRenderer	
			},{
				text:'Impact (Then this...)', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				resizable:false,
				draggable:false,
				sortable:false,
				editor: 'inteltextarea',
				renderer:defaultRenderer
			},{
				text:'Mitigation Plan', 
				dataIndex:'MitigationPlan',
				tdCls: 'intel-editor-cell',	
				flex:1,
				resizable:false,
				draggable:false,
				sortable:false,
				editor: 'inteltextarea',
				renderer:defaultRenderer
			},{
				text:'Urgency',
				dataIndex:'Urgency',
				tdCls: 'intel-editor-cell',
				width:90,			
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Urgency'],
						data:[
							{Urgency:'Undefined'},
							{Urgency:'1-Hot'},
							{Urgency:'2-Watch'},
							{Urgency:'3-Simmer'}
						]
					}),
					displayField:'Urgency'
				},
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(val, meta){
					meta.tdCls += (val==='1-Hot' ? ' predecessor-hot-urgency-cell' : '');
					return val || 'Undefined';
				},	
				layout:'hbox',
				items: [{	
					id:'risk-urgency-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Urgency'],
						data: [
							{Urgency: 'All'},
							{Urgency:'Undefined'},
							{Urgency:'1-Hot'},
							{Urgency:'2-Watch'},
							{Urgency:'3-Simmer'}
						]
					}),
					displayField: 'Urgency',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Urgency == 'All') filterUrgency = null; 
							else filterUrgency = selected[0].data.Urgency;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Status',
				dataIndex:'Status',
				tdCls: 'intel-editor-cell',	
				width:100,		
				tooltip:'(ROAM)',
				tooltipType:'title',		
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{Status:'Undefined'},
							{Status:'Resolved'},
							{Status:'Owned'},
							{Status:'Accepted'},
							{Status:'Mitigated'}
						]
					}),
					displayField:'Status'
				},
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(val, meta){
					meta.tdCls += (val==='Undefined' ? ' risks-grid-error-cell' : '');
					return val || '-';
				},	
				layout:'hbox',
				items: [{	
					id:'risk-status-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Status'],
						data: [
							{Status: 'All'},
							{Status:'Undefined'},
							{Status:'Resolved'},
							{Status:'Owned'},
							{Status:'Accepted'},
							{Status:'Mitigated'}
						]
					}),
					displayField: 'Status',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Status == 'All') filterStatus = null; 
							else filterStatus = selected[0].data.Status;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]		
			},{
				text:'Contact', 
				dataIndex:'Contact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'inteltextarea',
				sortable:false,
				resizable:false,
				draggable:false,
				renderer:defaultRenderer		
			},{
				text:'Checkpoint',	
				dataIndex:'Checkpoint',
				tdCls: 'intel-editor-cell',	
				width:90,
				resizable:false,	
				draggable:false,			
				editor:{
					xtype:'intelfixedcombo',
					width:80,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: me.WorkweekData
					}),
					displayField: 'Workweek',
					valueField: 'DateVal'
				},
				sortable:true,
				renderer:function(date){ return date ? 'ww' + me._getWorkweek(date) : '-'; },	
				layout:'hbox',
				items: [{	
					id:'risk-checkpoint-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: getCheckpointFilterOptions()
					}),
					displayField: 'Workweek',
					valueField: 'DateVal',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.DateVal === 0) filterCheckpoint = null; 
							else filterCheckpoint = selected[0].data.DateVal;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]		
			},{
				text:'',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord, row, col){
					var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice()),
						dirtyType = me._getDirtyType(riskRecord, realRiskData),
						clickFnName = 'Click' + riskRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(dirtyType !== 'Edited') return;
					meta.tdAttr = 'title="Undo"';
					window[clickFnName] = function(){
						var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice());
						riskRecord.beginEdit();
						_.each(realRiskData, function(value, field){ riskRecord.set(field, value); });
						riskRecord.endEdit();
						updateFilterOptions();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				text:'',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord, row, col){
					var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice()),
						dirtyType = me._getDirtyType(riskRecord, realRiskData),
						clickFnName = 'Click' + riskRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(dirtyType !== 'New' && dirtyType !== 'Edited') return;
					meta.tdAttr = 'title="Save Risk"';
					window[clickFnName] = function(){
						if(!riskRecord.data.PortfolioItemFormattedID || !riskRecord.data.PortfolioItemName){
							me._alert('ERROR', 'You must set the ' + me.PortfolioItemTypes[0] + ' affected by this Risk'); return; } 
						else if(!riskRecord.data.Checkpoint){
							me._alert('ERROR', 'You must set the Checkpoint for this Risk'); return; }
						else if(!riskRecord.data.Description){
							me._alert('ERROR', 'You must set the Description for this Risk'); return; }
						else if(!riskRecord.data.Impact){
							me._alert('ERROR', 'You must set the Impact for this Risk'); return; }
						else if(!riskRecord.data.Status){
							me._alert('ERROR', 'You must set the Status for this Risk'); return; }
						else if(!riskRecord.data.Contact){
							me._alert('ERROR', 'You must set the Contact for this Risk'); return; }
						
						me.RisksGrid.setLoading("Saving Risk");
						me._enqueue(function(unlockFunc){
							var portfolioItemFormattedID = riskRecord.data.PortfolioItemFormattedID,
								newPortfolioItemRecord = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID),
								projectRecord = me.ProjectsWithTeamMembers[riskRecord.data.ProjectObjectID];
							if(!projectRecord) return Q.reject('Invalid project ObjectID: ' + riskRecord.data.ProjectObjectID);
							Q((newPortfolioItemRecord.data.ObjectID != riskRecord.data.PortfolioItemObjectID) ?
								me._loadPortfolioItemByOrdinal(newPortfolioItemRecord.data.ObjectID, 0).then(function(portfolioItemRecord){ 
									newPortfolioItemRecord = portfolioItemRecord; 
								}) :
								null
							)
							.then(function(){ 
								return riskRecord.data.PortfolioItemObjectID ? 
									me._loadPortfolioItemByOrdinal(riskRecord.data.PortfolioItemObjectID, 0) : null;
							})
							.then(function(oldPortfolioItemRecord){							
								newPortfolioItemRecord = newPortfolioItemRecord || oldPortfolioItemRecord;
								var oldRealRiskData = me._getRealRiskData(oldPortfolioItemRecord, riskRecord.data.RiskID);
								if(oldRealRiskData && (oldPortfolioItemRecord.data.ObjectID !== newPortfolioItemRecord.data.ObjectID))
									return me._removeRisk(oldPortfolioItemRecord, oldRealRiskData, projectRecord, me.RisksParsedData);
							})
							.then(function(){ return me._addRisk(newPortfolioItemRecord, riskRecord.data, projectRecord, me.RisksParsedData); })
							.then(function(){
								riskRecord.beginEdit();
								riskRecord.set('Edited', false);
								riskRecord.set('PortfolioItemObjectID', newPortfolioItemRecord.data.ObjectID);
								riskRecord.endEdit();
							})
							.fail(function(reason){ me._alert('ERROR:', reason  || ''); })
							.then(function(){ 
								unlockFunc();
								me.RisksGrid.setLoading(false);
								updateFilterOptions();
							})
							.done();
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			}];

			me.RisksGrid = me.add({
				xtype: 'rallygrid',
				cls: 'risksdeps-grid risks-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'risksdeps-grid-header-text',
						width:200,
						text: me._getTrainName(me.TrainRecord) + " RISKS"
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
							width:110,
							listeners:{ click: removeFilters }
						}]
					}]
				},
				height:360,
				scroll:'vertical',
				columnCfgs: columnCfgs,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(item){ return riskGridFilter(item) ? '' : 'risksdeps-hidden-grid-row'; 
					}
				},
				listeners: {
					sortchange: function(){ filterRisksRowsByFn(riskGridFilter); },
					edit: function(editor, e){			
						var grid = e.grid,
							risksRecord = e.record,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;
							
						if(value === originalValue) return; 
						else if(!value && field != 'MitigationPlan') { risksRecord.set(field, originalValue); return; }
						else if(['Description', 'Impact', 'Contact', 'MitigationPlan'].indexOf(field)>-1) {
							value = me._htmlEscape(value);			
							risksRecord.set(field, value);
						}

						var previousEdit = risksRecord.data.Edited;
						risksRecord.set('Edited', true);
						
						var portfolioItemRecord;
						if(field === 'PortfolioItemName'){
							portfolioItemRecord = me.PortfolioItemStore.findExactRecord('Name', value);
							if(!portfolioItemRecord){
								risksRecord.set('PortfolioItemName', originalValue);
								risksRecord.set('Edited', previousEdit);
							} else risksRecord.set('PortfolioItemFormattedID', portfolioItemRecord.data.FormattedID);
						} else if(field === 'PortfolioItemFormattedID'){
							portfolioItemRecord = me.PortfolioItemStore.findExactRecord('FormattedID', value);
							if(!portfolioItemRecord) {
								risksRecord.set('PortfolioItemFormattedID', originalValue);
								risksRecord.set('Edited', previousEdit); 
							} else risksRecord.set('PortfolioItemName', portfolioItemRecord.data.Name);
						} 
						updateFilterOptions();
					}
				},
				disableSelection: true,
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomRisksStore
			});	
		},	
		_loadDependenciesGrids: function(){
			var me = this,
				defaultRenderer = function(val){ return val || '-'; };
			
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
			
			me.CustomPredecessorStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.DependenciesParsedData.Predecessors),
				autoSync:true,
				model:'IntelPredecessorDependencyForTracking',
				limit:Infinity,
				disableMetaChangeEvent: true,
				proxy: {
					type:'fastsessionproxy',
					id:'IntelPredecessorDependencyProxy' + Math.random()
				},
				sorters:[dependencySorter],
				intelUpdate: function(){ 
					var predecessorStore = me.CustomPredecessorStore, 
						realPredecessorsData = me.DependenciesParsedData.Predecessors.slice(); 
					predecessorStore.suspendEvents(true);
					_.each(predecessorStore.getRange(), function(predecessorRecord){
						var dependencyID = predecessorRecord.data.DependencyID,
							realPredecessorData = me._spliceDependencyFromList(dependencyID, realPredecessorsData),	
							dirtyType = me._getDirtyType(predecessorRecord, realPredecessorData),
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
							predecessorRecord.set('PredecessorItems', [me._newPredecessorItem()]); 
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

			var filterPredUserStoryFormattedID = null, 
				filterPredUserStoryName = null, 
				filterTopPortfolioItem = null, 
				filterOwningTeam = null,
				filterPredNeededBy = null,
				filterDisposition=null;
			function predecessorGridFilter(predecessorRecord){
				if(filterPredUserStoryFormattedID && predecessorRecord.data.UserStoryFormattedID != filterPredUserStoryFormattedID) return false;
				if(filterPredUserStoryName && predecessorRecord.data.UserStoryName != filterPredUserStoryName) return false;
				if(filterOwningTeam && 
					((me.ProjectsWithTeamMembers[predecessorRecord.data.ProjectObjectID] || {}).data || {}).Name != filterOwningTeam) return false;
				if(filterTopPortfolioItem && predecessorRecord.data.TopPortfolioItemName != filterTopPortfolioItem) return false;
				if(filterPredNeededBy && me._roundDateDownToWeekStart(predecessorRecord.data.NeededBy)*1 != filterPredNeededBy) return false;
				if(filterDisposition){
					if(filterDisposition == 'Done' && predecessorRecord.data.Status != filterDisposition) return false;
					if(filterDisposition == 'Not Done' && 
						predecessorRecord.data.Status && 
						predecessorRecord.data.Status != filterDisposition) return false;
				}
				return true;
			}
			function filterPredecessorRowsByFn(fn){
				_.each(me.CustomPredecessorStore.getRange(), function(item, index){
					if(fn(item)) me.PredecessorGrid.view.removeRowCls(index, 'risksdeps-hidden-grid-row');
					else me.PredecessorGrid.view.addRowCls(index, 'risksdeps-hidden-grid-row');
				});
			}
			function removePredecessorFilters(){
				filterPredUserStoryFormattedID = null;
				filterPredUserStoryName = null;
				filterOwningTeam = null; 
				filterTopPortfolioItem = null; 
				filterPredNeededBy = null; 
				filterDisposition = null;
				filterPredecessorRowsByFn(function(){ return true; });
				Ext.getCmp('predecessor-us-formattedid-filter').setValue('All');
				Ext.getCmp('predecessor-us-name-filter').setValue('All');
				Ext.getCmp('predecessor-owning-team-filter').setValue('All');
				Ext.getCmp('predecessor-top-portfolioitem-filter').setValue('All');
				Ext.getCmp('predecessor-needed-by-filter').setValue('All');
				Ext.getCmp('predecessor-status-filter').setValue('All'); 
			}
			
			function getPredecessorFormattedIDFilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredecessorStore.getRange(), 
					function(r){ return r.data.UserStoryFormattedID; })), 
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getPredecessorNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredecessorStore.getRange(), 
					function(r){ return r.data.UserStoryName; })), 
					function(f){ return f; }), 
					function(n){ return {Name:n}; }));
			}
			function getTopPortfolioItemFilterOptions(){
				return [{PortfolioItemName:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.PortfolioItemMap)), 
					function(p){ return p; }), 
					function(p){ return {PortfolioItemName:p}; }));
			}
			function getTeamFilterOptions(){
				return [{Team: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredecessorStore.getRange(), 
					function(p){ return ((me.ProjectsWithTeamMembers[p.data.ProjectObjectID] || {}).data || {}).Name; })), 
					function(f){ return f; }), 
					function(t){ return {Team:t}; }));
			}
			function getPredecessorNeededByFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredecessorStore.getRange(),
					function(r){ return me._roundDateDownToWeekStart(r.data.NeededBy)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function updatePredecessorFilterOptions(){
				//nothing is editable that has variable options in the header combobox (e.g. neededBy or US#)
			}
			
			var predecessorColumnCfgs = [{
				text:'#', 
				dataIndex:'UserStoryFormattedID',
				width:90,
				resizable:false,
				draggable:false,
				sortable:true,
				editor:false,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'predecessor-us-formattedid-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['FormattedID'],
						data: getPredecessorFormattedIDFilterOptions()
					}),
					displayField: 'FormattedID',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.FormattedID == 'All') filterPredUserStoryFormattedID = null; 
							else filterPredUserStoryFormattedID = selected[0].data.FormattedID;
							filterPredecessorRowsByFn(predecessorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:1,
				resizable:false,
				draggable:false,			
				sortable:true,
				editor:false,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'predecessor-us-name-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Name'],
						data: getPredecessorNameFilterOptions()
					}),
					displayField: 'Name',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Name == 'All') filterPredUserStoryName = null; 
							else filterPredUserStoryName = selected[0].data.Name;
							filterPredecessorRowsByFn(predecessorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]	
			},{
				text:me.PortfolioItemTypes.slice(-1).pop(), 
				dataIndex:'TopPortfolioItemName',
				width:90,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'predecessor-top-portfolioitem-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['PortfolioItemName'],
						data: getTopPortfolioItemFilterOptions()
					}),
					displayField: 'PortfolioItemName',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.PortfolioItemName == 'All') filterTopPortfolioItem = null; 
							else filterTopPortfolioItem = selected[0].data.PortfolioItemName;
							filterPredecessorRowsByFn(predecessorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Owning Team', 
				dataIndex:'ProjectObjectID',
				flex:2,
				minWidth:100,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer:function(projectObjectID){
					return ((me.ProjectsWithTeamMembers[projectObjectID] || {}).data || {}).Name || '?';
				},
				layout:'hbox',
				items:[{
					id:'predecessor-owning-team-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Team'],
						data: getTeamFilterOptions()
					}),
					displayField: 'Team',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Team == 'All') filterOwningTeam = null; 
							else filterOwningTeam = selected[0].data.Team;
							filterPredecessorRowsByFn(predecessorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				resizable:false,	
				draggable:false,		
				sortable:false,
				editor:false,
				renderer: defaultRenderer			
			},{
				text:'Needed By',			
				dataIndex:'NeededBy',
				width:90,
				resizable:false,
				draggable:false,
				sortable:true,	
				editor:false,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');},
				layout:'hbox',
				items:[{
					id:'predecessor-needed-by-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: getPredecessorNeededByFilterOptions()
					}),
					displayField: 'Workweek',
					valueField: 'DateVal',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.DateVal === 0) filterPredNeededBy = null; 
							else filterPredNeededBy = selected[0].data.DateVal;
							filterPredecessorRowsByFn(predecessorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Teams Depended On',
				dataIndex:'DependencyID',
				xtype:'fastgridcolumn',
				html:	'<div class="predecessor-items-grid-header" style="width:10px !important;"></div>' +
						'<div class="predecessor-items-grid-header" style="width:110px !important;">Team Name</div>' +
						'<div class="predecessor-items-grid-header" style="width:95px  !important;">Supported</div>' +
						'<div class="predecessor-items-grid-header" style="width:70px  !important;">#</div>' +
						'<div class="predecessor-items-grid-header" style="width:130px !important;">User Story</div>',
				width:450,
				resizable:false,
				draggable:false,
				sortable:false,
				renderer: function(dependencyID){
					var predecessorStore = me.CustomPredecessorStore,
						predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
						predecessorItems = predecessorRecord.data.PredecessorItems;
					if(!me.PrececessorItemStores[dependencyID]){
						me.PrececessorItemStores[dependencyID] = Ext.create('Intel.data.FastStore', { 
							model:'IntelPredecessorItem',
							data: predecessorItems,
							autoSync:true,
							limit:Infinity,
							disableMetaChangeEvent: true,
							proxy: {
								type:'fastsessionproxy',
								id:'PredecessorItem-' + dependencyID + '-proxy' + Math.random()
							},
							sorters:[predecessorItemSorter],
							intelUpdate: function(){
								var predecessorStore = me.CustomPredecessorStore,
									predecessorItemStore = me.PrececessorItemStores[dependencyID],
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
									var newItem = me._newPredecessorItem();
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
					
					var predecessorItemColumnCfgs = [{
						dataIndex:'PredecessorProjectObjectID',
						width:115,
						resizable:false,
						editor: false,
						renderer: function(val, meta){
							var projectRecord = me.ProjectsWithTeamMembers[val];
							if(val && projectRecord) return projectRecord.data.Name;
							else return '-';
						}
					},{
						dataIndex:'Supported',
						width:80,
						resizable:false,
						editor: false,
						renderer: function(val, meta){
							if(val == 'No') meta.tdCls = 'predecessor-item-not-supported-cell';
							else if(val == 'Yes') meta.tdCls = 'predecessor-item-supported-cell';
							return val;
						}
					},{
						dataIndex:'PredecessorUserStoryObjectID',
						width:75,
						resizable:false,
						editor: false,
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
						resizable:false,
						editor: false,
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
						xtype: 'rallygrid',
						cls:'risksdeps-grid predecessor-items-grid rally-grid',
						plugins: [ 'fastcellediting' ],
						viewConfig: { stripeRows:false },
						width:420,
						manageHeight:false,
						columnCfgs: predecessorItemColumnCfgs,
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
						showRowActionsColumn:false,
						showPagingToolbar:false,
						enableEditing:false,
						store: me.PrececessorItemStores[dependencyID]
					};
				}
			},{
				dataIndex:'Status',
				width:90,
				resizable:false,
				draggable:false,
				sortable:false,
				tdCls: 'intel-editor-cell',
				text:'Disposition',					
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data: [
							{Status:'Done'},
							{Status:'Not Done'}
						]
					}),
					displayField: 'Status'
				},
				renderer: function(val, meta){
					if(val === 'Done') meta.tdCls += ' predecessor-supported-cell';
					else meta.tdCls += ' predecessor-not-supported-cell';
					return val || 'Not Done';
				},
				layout:'hbox',
				items:[{
					id:'predecessor-status-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Status'],
						data: [
							{Status:'All'},
							{Status:'Done'},
							{Status:'Not Done'}
						]
					}),
					displayField: 'Status',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Status === 'All') filterDisposition = null; 
							else filterDisposition = selected[0].data.Status;
							filterPredecessorRowsByFn(predecessorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			}];

			me.PredecessorGrid = me.add({
				xtype: 'rallygrid',
				cls: 'risksdeps-grid predecessors-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'risksdeps-grid-header-text',
						width:400,
						text: me._getTrainName(me.TrainRecord) + " DEPENDENCIES"
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
							width:110,
							listeners:{ click: removePredecessorFilters }
						}]
					}]
				},
				height:400,
				scroll:'vertical',
				columnCfgs: predecessorColumnCfgs,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(predecessorRecord){ 
						if(!predecessorGridFilter(predecessorRecord)) return 'risksdeps-hidden-grid-row'; 
					}
				},
				listeners: {
					sortchange: function(){ filterPredecessorRowsByFn(predecessorGridFilter); },
					edit: function(editor, e){				
						var predecessorRecord = e.record,
							predecessorData = predecessorRecord.data,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value === originalValue) return; 
						else if(!value) { predecessorRecord.set(field, originalValue); return; }

						var previousEdit = predecessorRecord.data.Edited; 
						predecessorRecord.set('Edited', true);
						
						me.PredecessorGrid.setLoading('Saving');
						me._enqueue(function(unlockFunc){
							me._getOldAndNewUserStoryRecords(predecessorData, me.UserStoryStore.getRange()).then(function(records){
								var userStoryRecord = records[1];
								return me._addPredecessor(userStoryRecord, predecessorData, null, me.DependenciesParsedData);
							})
							.then(function(){ predecessorRecord.set('Edited', false); })
							.fail(function(reason){ me._alert('ERROR:', reason); })
							.then(function(){
								me.PredecessorGrid.setLoading(false);
								updatePredecessorFilterOptions();
								unlockFunc();
							})
							.done();
						});
					}
				},
				disableSelection: true,
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomPredecessorStore
			});	
		}	
	});
}());