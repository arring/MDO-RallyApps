(function(){
	var Ext = window.Ext4 || window.Ext;
	
	RALLY_MAX_STRING_SIZE = 32768;

	Ext.define('ProgramBoard', {
		extend: 'IntelRallyApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'AsyncQueue',
			'ParallelLoader',
			'UserAppsPreference',
			'SanityDashboardObjectIDPreference',
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
		},{
			xtype:'container',
			id:'tcVelBox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items: [{
				xtype:'container',
				flex:2,
				id: 'tcVelBoxLeft'
			},{
				xtype:'container',
				flex:1,
				id: 'tcVelBoxRight'
			}]
		}],
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */
		
		_userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/
		_loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: OPIOT');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
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
					_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItem){
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
		_loadIterations: function(){
			var me=this,
				startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseStartDate),
				endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseDate);
				iterationStore = Ext.create("Rally.data.WsapiDataStore", {
					model: "Iteration",
					remoteSort: false,
					limit:Infinity,
					fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project", "ObjectID"],
					context:{
						project: me.getContext().getProject()._ref,
						projectScopeUp:false,
						projectScopeDown:false
					},
					filters: [{
						property: "EndDate",
						operator: ">=",
						value: startDate
					},{
						property: "StartDate",
						operator: "<=",
						value: endDate  
					}]
				});
			return me._reloadStore(iterationStore)
				.then(function(iterationStore){ 
					me.IterationStore = iterationStore; 
				});
		},
		_getUserStoryFilter: function(){
			var me=this,
				twoWeeks = 1000*60*60*24*7*2,
				releaseStartPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + twoWeeks).toISOString(),
				releaseEndPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseDate)*1 - twoWeeks).toISOString();
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
						property: 'PortfolioItem.Release.ReleaseStartDate',
						operator: '<',
						value: releaseStartPadding
					}).and(Ext.create('Rally.data.wsapi.Filter', { 
						property: 'PortfolioItem.Release.ReleaseDate',
						operator: '>',
						value: releaseEndPadding
					}))
				)
			);
		},
		_loadUserStories: function(){	
			var me=this, 
				config = {
					model: me.UserStory,
					url: 'https://rally1.rallydev.com/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query: me._getUserStoryFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
							'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', 'PortfolioItem', 'c_Dependencies'].join(','),
						project:me.ProjectRecord.data._ref,
						projectScopeDown:false,
						projectScopeUp:false
					}
				};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		_getExtraSanityUserStoriesFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })),
				userStoryProjectFilter = Ext.create('Rally.data.wsapi.Filter', { 
					property: 'Project.ObjectID', 
					value: me.ProjectRecord.data.ObjectID
				});
			return userStoryProjectFilter.and(inIterationButNotReleaseFilter);
		},				
		_loadExtraSanityUserStories: function(){
			var me=this,
				config = {
					model: me.UserStory,
					url: 'https://rally1.rallydev.com/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query:me._getExtraSanityUserStoriesFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
							'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', 'PortfolioItem'].join(','),
						workspace:me.getContext().getWorkspace()._ref,
						includePermissions:true
					}
				};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.ExtraSanityUserStoriesStore = store;
				return store;
			});
		},
		
		/**___________________________________ TEAM COMMITS STUFF ___________________________________**/		
		_getTeamCommit: function(portfolioItemRecord){	
			var teamCommits = portfolioItemRecord.data.c_TeamCommits,
				projectOID = this.ProjectRecord.data.ObjectID;
			try{ teamCommits = JSON.parse(atob(teamCommits))[projectOID] || {}; } 
			catch(e){ teamCommits = {}; }
			return teamCommits;
		},		
		_setTeamCommit: function(portfolioItemRecord, newTeamCommit){
			var teamCommits = portfolioItemRecord.data.c_TeamCommits,
				projectOID = this.ProjectRecord.data.ObjectID,
				deferred = Q.defer();
			try{ teamCommits = JSON.parse(atob(teamCommits)) || {}; }
			catch(e){ teamCommits = {}; }
			if(!teamCommits[projectOID]) teamCommits[projectOID] = {};
			teamCommits[projectOID].Commitment = newTeamCommit.Commitment;
			teamCommits[projectOID].Objective = newTeamCommit.Objective;
			var str = btoa(JSON.stringify(teamCommits, null, '\t'));
			if(str.length >= RALLY_MAX_STRING_SIZE)
				deferred.reject('TeamCommits field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				portfolioItemRecord.set('c_TeamCommits', str);
				portfolioItemRecord.save({ 
					callback:function(record, operation, success){
						if(!success) deferred.reject('Failed to modify PortfolioItem: ' + portfolioItemRecord.data.FormattedID);
						else deferred.resolve();
					}
				});
			}
			return deferred.promise;
		},
					
		_getStoryCount: function(portfolioItemObjectID){	
			var me=this;
			me._TeamCommitsCountHash = me._TeamCommitsCountHash || {};
			if(typeof me._TeamCommitsCountHash[portfolioItemObjectID] === 'undefined'){
				me._TeamCommitsCountHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore.getRange(), function(sum, userStory){
					return sum + (userStory.data.PortfolioItem && userStory.data.PortfolioItem.ObjectID == portfolioItemObjectID)*1;
				}, 0);
			}
			return me._TeamCommitsCountHash[portfolioItemObjectID];
		},
		_getStoriesEstimate: function(portfolioItemObjectID){	
			var me=this;
			me._TeamCommitsEstimateHash = me._TeamCommitsEstimateHash || {};
			if(typeof me._TeamCommitsEstimateHash[portfolioItemObjectID] === 'undefined'){
				me._TeamCommitsEstimateHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore.getRange(), function(sum, userStory){
					var isStoryInPortfolioItem = userStory.data.PortfolioItem && userStory.data.PortfolioItem.ObjectID == portfolioItemObjectID;
					return sum + (isStoryInPortfolioItem ? userStory.data.PlanEstimate : 0)*1;
				}, 0);
			}
			return me._TeamCommitsEstimateHash[portfolioItemObjectID];
		},

		/** __________________________________ SANITY STUFF ___________________________________**/
		_getSanityStoreData: function(){ 
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				totalUserStories = me.UserStoryStore.getRange().concat(me.ExtraSanityUserStoriesStore.getRange());
			return [{
				title: 'Unsized Stories',
				userStories: _.filter(totalUserStories, function(item){ 
					if(!item.data.Release || item.data.Release.Name != releaseName) return false;
					return item.data.PlanEstimate === null; 
				})
			},{
				title: 'Improperly Sized Stories',
				userStories: _.filter(totalUserStories,function(item){
					if(!item.data.Release || item.data.Release.Name != releaseName) return false;
					if(item.data.Children.Count === 0) return false;
					var pe = item.data.PlanEstimate;
					return pe!==0 && pe!==1 && pe!==2 && pe!==4 && pe!==8 && pe!==16;
				})
			},{
				title: 'Stories in Release without Iteration',
				userStories: _.filter(totalUserStories,function(item){ 
					if(!item.data.Release || item.data.Release.Name != releaseName) return false;
					return !item.data.Iteration; 
				})
			},{
				title: 'Stories in Iteration not attached to Release',
				userStories: _.filter(totalUserStories,function(item){ 
					if(!item.data.Iteration || item.data.Release) return false;
					return new Date(item.data.Iteration.StartDate) < new Date(releaseDate) && 
						new Date(item.data.Iteration.EndDate) > new Date(releaseStartDate);
				})
			},{
				title: 'Stories with End Date past ' + me.PortfolioItemTypes[0] + ' End Date',
				userStories: _.filter(totalUserStories, function(item){
					if(!item.data.Release || item.data.Release.Name != releaseName) return false;
					if(!item.data.Iteration || !item.data.PortfolioItem || 
						(!item.data.PortfolioItem.PlannedEndDate && !item.data.PortfolioItem.ActualEndDate) || 
						!item.data.Iteration.EndDate) return false;
					return new Date(item.data.PortfolioItem.PlannedEndDate || item.data.PortfolioItem.ActualEndDate) < 
									new Date(item.data.Iteration.EndDate);
				})
			}];
		},

		/**___________________________________ RISKS STUFF ___________________________________**/	
		_parseRisksFromPortfolioItem: function(portfolioItemRecord){
			var array = [],
				projectOID = this.ProjectRecord.data.ObjectID, 
				risks = this._getRisks(portfolioItemRecord),
				ObjectID = portfolioItemRecord.data.ObjectID,
				FormattedID = portfolioItemRecord.data.FormattedID,
				PortfolioItemName = portfolioItemRecord.data.Name;
			if(risks[projectOID]){
				for(var riskID in risks[projectOID]){
					var risk = risks[projectOID][riskID];
					array.push({
						RiskID: riskID,
						PortfolioItemObjectID: ObjectID,
						PortfolioItemFormattedID: FormattedID,
						PortfolioItemName: PortfolioItemName,
						Description: risk.Description,
						Impact: risk.Impact,
						MitigationPlan: risk.MitigationPlan,
						Urgency: risk.Urgency,
						Status: risk.Status,
						Contact: risk.Contact,
						Checkpoint: risk.Checkpoint,
						Edited: false
					});
				}
			}
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
		_spliceRiskFromList: function(riskID, riskList){ 
			/** removes and returns risk with riskID from the riskList (NOT list of records) */
			for(var i = 0; i<riskList.length; ++i){
				if(riskList[i].RiskID == riskID) {
					return riskList.splice(i, 1)[0];
				}
			}
		},	
		_getRealRiskData: function(oldPortfolioItemRecord, riskID){ 
			var me = this, realRiskData;
			if(oldPortfolioItemRecord) realRiskData = me._parseRisksFromPortfolioItem(oldPortfolioItemRecord);
			else realRiskData = [];
			return me._spliceRiskFromList(riskID, realRiskData) || null;		
		},
		
		/**___________________________________ DEPENDENCIES STUFF ___________________________________**/					
		_isUserStoryInReleaseTimeframe: function(userStoryRecord, releaseRecord){ 
			/** some user stories are not themselves in releases **/
			return (userStoryRecord.data.Release && userStoryRecord.data.Release.Name === releaseRecord.data.Name) || 
				(!userStoryRecord.data.Release && userStoryRecord.data.PortfolioItem && 
					userStoryRecord.data.PortfolioItem.Release && userStoryRecord.data.PortfolioItem.Release.Name === releaseRecord.data.Name);
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
				dependencies = me._getDependencies(userStoryRecord), 
				inputPredecessors = dependencies.Predecessors, 
				inputSuccessors = dependencies.Successors,
				outputPredecessors = [], 
				outputSuccessors = [],
				UserStoryObjectID = userStoryRecord.data.ObjectID,
				UserStoryFormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name;
				
			if(me._isUserStoryInReleaseTimeframe(userStoryRecord, me.ReleaseRecord)){
				_.each(inputPredecessors, function(predecessorDependency, dependencyID){
					outputPredecessors.push({
						DependencyID: dependencyID,
						UserStoryObjectID: UserStoryObjectID,
						UserStoryFormattedID: UserStoryFormattedID,
						UserStoryName: UserStoryName,
						Description: predecessorDependency.Description,
						NeededBy: predecessorDependency.NeededBy,
						Status: predecessorDependency.Status,
						PredecessorItems: predecessorDependency.PredecessorItems || [], 
						Edited: false //not in pending edit mode
					});
				});
			}
			_.each(inputSuccessors, function(successorDependency, dependencyID){
				if(successorDependency.Assigned){ //if this was just placed on a random user story, or is assigned to this user story
					UserStoryFormattedID = userStoryRecord.data.FormattedID;
					UserStoryName = userStoryRecord.data.Name;
				} 
				else UserStoryFormattedID = UserStoryName = '';
						
				outputSuccessors.push({
					DependencyID: dependencyID,
					SuccessorUserStoryObjectID: successorDependency.SuccessorUserStoryObjectID,
					SuccessorProjectObjectID: successorDependency.SuccessorProjectObjectID,
					UserStoryObjectID: UserStoryObjectID,
					UserStoryFormattedID: UserStoryFormattedID,
					UserStoryName: UserStoryName,
					Description: successorDependency.Description,
					NeededBy: successorDependency.NeededBy,
					Supported: successorDependency.Supported,
					Assigned: successorDependency.Assigned,
					Edited: false //not in pending edit mode
				});
			});
			return {Predecessors:outputPredecessors, Successors:outputSuccessors};
		},
		_parseDependenciesData: function(userStoriesInRelease){	
			var me=this, 
				predecessors = [], 
				successors = [];			

			_.each(userStoriesInRelease, function(userStoryRecord){
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
			_.each(dependenciesParsedData.Successors, function(successor){
				storyOIDsToHydrate.push(successor.SuccessorUserStoryObjectID);
			});
			
			return Q.all(_.map(storyOIDsToHydrate, function(storyOID){
				return me._loadUserStory(storyOID).then(function(userStory){
					if(userStory) dependenciesHydratedUserStories[storyOID] = userStory;
				});
			}))
			.then(function(){ return dependenciesHydratedUserStories; });
		},
		_newPredecessorItem: function(){
			return {
				PredecessorItemID: 'PI' + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
				PredecessorUserStoryObjectID: 0,
				PredecessorProjectObjectID: 0,
				Supported:'Undefined',
				Assigned:false
			};
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
		_isEditingTeamCommits: false, 
		_isEditingVelocity: false,
		
		_isEditing: function(store){
			if(!store) return false;
			return _.some(store.getRange(), function(record){ return record.data.Edited; });
		},		
		_showGrids: function(){
			var me=this;
			if(!me.TeamCommitsGrid){
				me._loadTeamCommitsGrid();
				me._loadVelocityGrid();
				me._loadSanityGrid();
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
					function(list, dependencyID){ return list.length > 1; }),
				duplicateSuccessors = _.filter(_.groupBy(me.DependenciesParsedData.Successors,
					function(dependency){ return dependency.DependencyID; }),
					function(list, dependencyID){ return list.length > 1; });
			if(duplicateRisks.length || duplicatePredecessors.length || duplicateSuccessors.length){
				me._clearRefreshInterval();
				me._loadResolveDuplicatesModal(duplicateRisks, duplicatePredecessors, duplicateSuccessors)
					.then(function(){ 
						me._setRefreshInterval(); 
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
				promises = [];
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore) || me._isEditing(me.CustomSuccessorStore);
			if(!me._isEditingVelocity && me.IterationStore && me.UserStoryStore)
				if(me.CustomVelocityStore) me.CustomVelocityStore.intelUpdate();
			if(!me._isEditingTeamCommits && me.PortfolioItemStore && me.UserStoryStore)
				if(me.CustomTeamCommitsStore) me.CustomTeamCommitsStore.intelUpdate();
			if(!isEditingRisks && me.PortfolioItemStore){
				me.RisksParsedData = me._parseRisksData(); 
				me._updatePortfolioItemColumnStores();
				if(me.CustomRisksStore) me.CustomRisksStore.intelUpdate();
			}
			if(!isEditingDeps && me.UserStoryStore && me.PortfolioItemStore){		
				me.UserStoriesInRelease = _.filter(me.UserStoryStore.getRange(), function(userStoryRecord){ 
					return me._isUserStoryInReleaseTimeframe(userStoryRecord, me.ReleaseRecord); 
				});
				me.DependenciesParsedData = me._parseDependenciesData(me.UserStoriesInRelease);
				promises.push(me._hydrateDependencyUserStories(me.DependenciesParsedData).then(function(dependenciesHydratedUserStories){
					me.DependenciesHydratedUserStories = dependenciesHydratedUserStories;
					me._updateUserStoryColumnStores();
					if(me.CustomPredecessorStore) me.CustomPredecessorStore.intelUpdate();
					if(me.CustomSuccessorStore) me.CustomSuccessorStore.intelUpdate();
				}));
			}
			return Q.all(promises);
		},	
		_reloadStores: function(){
			var me=this,
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore) || me._isEditing(me.CustomSuccessorStore),
				promises = [];
			promises.push(me._loadExtraSanityUserStories());
			if(!me._isEditingVelocity) 
				promises.push(me._loadIterations());
			if(!me._isEditingTeamCommits && !isEditingRisks) 
				promises.push(me._loadPortfolioItems());
			if(!me._isEditingVelocity && !me._isEditingTeamCommits && !isEditingDeps) 
				promises.push(me._loadUserStories());
			return Q.all(promises);
		},
		_clearEverything: function(){
			var me=this;
			
			me._isEditingTeamCommits = false;
			me._isEditingVelocity = false;
			
			me.PortfolioItemMap = {};
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			me.IterationStore = undefined;
			me.SanityStores = undefined;
			
			me.PredecessorGrid = undefined;
			me.SuccessorGrid = undefined;
			me.RisksGrid = undefined;
			me.VelocityGrid = undefined;
			me.TeamCommitsGrid = undefined;
			
			me.CustomPredecessorStore = undefined;
			me.CustomSuccessorStore = undefined;
			me.CustomRisksStore = undefined;
			me.CustomTeamCommitsStore = undefined;
			me.CustomVelocityStore = undefined;
			
			var toRemove = me.down('#tcVelBox').next(), tmp;
			while(toRemove){ //delete risks and dependencies 
				tmp = toRemove.next();
				toRemove.up().remove(toRemove);
				toRemove = tmp;
			}
			me.down('#tcVelBoxLeft').removeAll();
			me.down('#tcVelBoxRight').removeAll();
		},
		_reloadEverything:function(){
			var me = this;
			
			me._clearEverything();
			me.setLoading('Loading Data');
			if(!me.ReleasePicker){ //draw these once, never remove them
				me._loadReleasePicker();
				me._loadTrainPicker();
				me._loadRefreshIntervalCombo();
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
				isEditingDeps = me._isEditing(me.CustomPredecessorStore) || me._isEditing(me.CustomSuccessorStore);			
			if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(message);
			if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(message);
			if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(message);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(message);
			if(me.SuccessorGrid && !isEditingDeps) me.SuccessorGrid.setLoading(message);
		},	
		_removeLoadingMasks: function(){
			var me=this,
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredecessorStore) || me._isEditing(me.CustomSuccessorStore);		
			if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(false);
			if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(false);
			if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(false);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(false);
			if(me.SuccessorGrid && !isEditingDeps) me.SuccessorGrid.setLoading(false);
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
		_clearRefreshInterval: function(){
			var me=this;
			if(me.RefreshInterval){ 
				clearInterval(me.RefreshInterval); 
				me.RefreshInterval = undefined; 
			}	
		},
		_setRefreshInterval: function(){
			var me=this;
			me._clearRefreshInterval();
			if(me.AppsPref.refresh!=='Off')
				me.RefreshInterval = setInterval(function(){ me._refreshDataFunc(); }, me.AppsPref.refresh*1000);
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
					return Q.all([ // 4 streams
						me._loadProjectsWithTeamMembers() /********* 1 ************/
							.then(function(projectsWithTeamMembers){
								me.ProjectsWithTeamMembers = projectsWithTeamMembers;
								me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
								if(!me.ProjectsWithTeamMembers[me.ProjectRecord.data.ObjectID])
									return Q.reject('Please scope to a project that has team members!');
							}),
						me._projectInWhichTrain(me.ProjectRecord) /********* 2 ************/
							.then(function(trainRecord){
								if(trainRecord){
									me.TrainRecord = trainRecord;
									return me._loadTrainPortfolioProject(me.TrainRecord)
										.then(function(trainPortfolioProject){
											me.TrainPortfolioProject = trainPortfolioProject;
										});
								} else {
									me.ProjectNotInTrain = true;
									return me._loadAllTrains()
										.then(function(trainRecords){
											me.AllTrainRecords = trainRecords;
											me.TrainNames = _.map(trainRecords, function(tr){ return {Name: me._getTrainName(tr)}; });
										});
								}
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
							}),
						me._loadSanityDashboardObjectID() /********* 4 ************/
							.then(function(objectID){
								me.SanityDashboardObjectID = objectID;
							})
					]);
				})
				.then(function(){
					if(me.ProjectNotInTrain){
						var projectOID = me.ProjectRecord.data.ObjectID;
						if(me.AppsPref.projs[projectOID] && me.AppsPref.projs[projectOID].Train){
							me.TrainRecord = _.find(me.AllTrainRecords, function(p){ return p.data.ObjectID = me.AppsPref.projs[projectOID].Train; });
							if(!me.TrainRecord) me.TrainRecord = me.AllTrainRecords[0];
						} 
						else me.TrainRecord = me.AllTrainRecords[0];
						return me._loadTrainPortfolioProject(me.TrainRecord)
							.then(function(trainPortfolioProject){
								me.TrainPortfolioProject = trainPortfolioProject;
							});
					}
				})
				.then(function(){ 
					me._setRefreshInterval(); 
					return me._reloadEverything();
				})
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
		_trainPickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me._getTrainName(me.TrainRecord) == records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.TrainRecord = _.find(me.AllTrainRecords, function(tr){ return me._getTrainName(tr) == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Train = me.TrainRecord.data.ObjectID;
			Q.all([
				me._saveAppsPreference(me.AppsPref),
				me._loadTrainPortfolioProject(me.TrainRecord)
					.then(function(trainPortfolioProject){
						me.TrainPortfolioProject = trainPortfolioProject;
					})
			])
				.then(function(){ me._reloadEverything(); })
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},	
		_loadTrainPicker: function(){
			var me=this;
			if(me.ProjectNotInTrain){
				me.down('#navboxLeft').add({
					xtype:'intelfixedcombo',
					width:240,
					labelWidth:40,
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],				
						data: _.sortBy(me.TrainNames, function(t){ return t.data.Name; })
					}),
					displayField: 'Name',
					fieldLabel: 'Train:',
					value: me._getTrainName(me.TrainRecord),
					listeners: {
						change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
						select: me._trainPickerSelected.bind(me)
					}
				});
			}
		},	
		_refreshComboSelected: function(combo, records){
			var me=this, rate = records[0].data.Rate;
			if(me.AppsPref.refresh === rate) return;
			me.AppsPref.refresh = rate;
			me._setRefreshInterval();
			me.setLoading("Saving Preference");
			me._saveAppsPreference(me.AppsPref)
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},			
		_loadRefreshIntervalCombo: function(){
			var me=this;
			me.down('#navboxRight').add({
				xtype:'intelfixedcombo',
				store: Ext.create('Ext.data.Store', {
					fields: ['Rate'],
					data: [
						{Rate: 'Off'},
						{Rate: '10'},
						{Rate: '15'},
						{Rate: '30'},
						{Rate: '60'},
						{Rate: '120'}
					]
				}),
				displayField: 'Rate',
				fieldLabel: 'Auto-Refresh Rate (seconds):',
				value:me.AppsPref.refresh,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._refreshComboSelected.bind(me)
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
		_loadResolveDuplicatesModal: function(duplicateRisks, duplicatePredecessors, duplicateSuccessors){
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
								cls: 'program-board-grid duplicate-risks-grid rally-grid',
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
								cls: 'program-board-grid duplicate-predecessors-grid rally-grid',
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
											cls:'program-board-grid duplicate-predecessor-items-grid rally-grid',
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
					) : []).concat(duplicateSuccessors.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Successors</h2>'
						}].concat(_.map(duplicateSuccessors, function(successorsOfOneID){
							return {
								xtype:'rallygrid',
								cls: 'program-board-grid duplicate-successors-grid rally-grid',
								columnCfgs: [{	
									text:'Requested By',
									dataIndex:'SuccessorProjectObjectID',
									width:160,
									resizable:false,
									draggable:false,
									editor: false,
									sortable:true,
									renderer: function(projectOID){ return me.ProjectsWithTeamMembers[projectOID].data.Name; }
								},{
									text:'Req #',
									dataIndex:'SuccessorUserStoryObjectID',
									width:90,
									resizable:false,
									draggable:false,
									editor: false,
									sortable:true,
									renderer: function(userStoryObjectID){
										var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
										if(userStory) return userStory.data.FormattedID;
										else return '?';
									}
								},{
									text:'Req UserStory',
									dataIndex:'SuccessorUserStoryObjectID',
									flex:1,
									resizable:false,
									draggable:false,
									editor: false,
									sortable:true,
									renderer: function(userStoryObjectID){
										var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
										if(userStory) return userStory.data.Name;
										else return '?';
									}
								},{
									text:'Dependency Description', 
									dataIndex:'Description',
									flex:1,
									resizable:false,
									draggable:false,
									editor: false,
									sortable:false					
								},{
									text:'Needed By',
									dataIndex:'NeededBy',
									width:80,
									resizable:false,
									draggable:false,
									editor: false,
									sortable:true,
									renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');}	
								},{
									text:'Supported',					
									dataIndex:'Supported',
									width:90,
									resizable:false,
									draggable:false,
									editor: false,
									renderer: function(val, meta){
										if(val == 'No') meta.tdCls = 'successor-not-supported-cell';
										else if(val == 'Yes') meta.tdCls = 'successor-supported-cell';
										return val;
									}
								},{
									text:'Sup #', 
									dataIndex:'UserStoryFormattedID',
									width:90,
									resizable:false,
									draggable:false,
									editor: false,
									sortable:true,
									renderer:function(val, meta, record){ return val || '-';  }
								},{
									text:'Sup UserStory', 
									dataIndex:'UserStoryName',
									flex:1,
									resizable:false,
									draggable:false,
									editor:{
										xtype:'intelcombobox',
										store: me.UserStoryNameStore,
										displayField: 'Name'
									},
									sortable: true,
									renderer:function(val, meta, record){ return val || '-';  }
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
								store:Ext.create('Rally.data.custom.Store', { data: successorsOfOneID })
							};
						})
					) : []).concat([{
						xtype:'button',
						cls:'done-button',
						text:'Done',
						handler:function(){
							var grids = Ext.ComponentQuery.query('rallygrid', modal),
								riskGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-risks-grid'); }),
								predecessorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-predecessors-grid'); }),
								successorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-successors-grid'); });

							modal.setLoading('Removing Duplicates');
							Q.all([
								Q.all(_.map(riskGrids, function(grid){ 
									var riskToKeep = grid.getSelectionModel().getSelection()[0],
										risksToDelete = _.filter(grid.store.getRange(), function(item){ return item.id != riskToKeep.id; });
									return Q.all(_.map(risksToDelete, function(riskRecord){
										var deferred = Q.defer();
										/** create a mutex for each portfolio item across all grids, so we don't overwrite ourselves on accident */
										me._enqueue(function(unlockFunc){
											me._loadPortfolioItemByOrdinal(riskRecord.data.PortfolioItemObjectID, 0)
											.then(function(oldPortfolioItemRecord){	
												var realRiskData = me._getRealRiskData(oldPortfolioItemRecord, riskRecord.data.RiskID);							
												if(!realRiskData) return;
												return me._removeRisk(oldPortfolioItemRecord, realRiskData, me.ProjectRecord, me.RisksParsedData);
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
										var deferred = Q.defer();
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me._enqueue(function(unlockFunc){
											me._getOldAndNewUserStoryRecords(predecessorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me._getRealDependencyData(
														oldUserStoryRecord, predecessorRecord.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me._getRemovedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems,  
														realPredecessorData,
														me.ProjectRecord,
														me.ProjectsWithTeamMembers,
														me.ProjectRecord,
														me.DependenciesParsedData).then(function(removedCallbacks){
													var promise = Q();
													_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });													
													return promise.then(function(){
														return me._removePredecessor(
															oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
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
										var deferred = Q.defer();
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
														me.ProjectRecord,
														me.ProjectsWithTeamMembers,
														me.ProjectRecord,
														me.DependenciesParsedData).then(function(addedCallbacks){
													var promise = Q();
													_.each(addedCallbacks, function(callback){ promise = promise.then(callback); });			
													return promise.then(function(){
														return me._addPredecessor(
															oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
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
								})),
								Q.all(_.map(successorGrids, function(grid){ //dont edit it's successor userStory 
									var successorToKeep = grid.getSelectionModel().getSelection()[0],
										successorsToDelete = _.filter(grid.store.getRange(), function(item){ return item.id != successorToKeep.id; });		
									return Q.all(_.map(successorsToDelete, function(successorRecord){
										var deferred = Q.defer();
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me._enqueue(function(unlockFunc){
											me._getOldAndNewUserStoryRecords(successorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realSuccessorData = me._getRealDependencyData(
														oldUserStoryRecord, successorRecord.data.DependencyID, 'Successors');		
												if(!realSuccessorData) return;
												return me._removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData);
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-Dependencies'); 
										return deferred.promise;
									}));
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
		_loadTeamCommitsGrid: function(){
			var me = this;	
			
			me._TeamCommitsCountHash = {};
			me._TeamCommitsEstimateHash = {};
			
			var customTeamCommitsRecords = _.map(_.sortBy(me.PortfolioItemStore.getRecords(), 
				function(portfolioItemRecord){ return portfolioItemRecord.data.DragAndDropRank; }),
				function(portfolioItemRecord, index){
					var teamCommit = me._getTeamCommit(portfolioItemRecord);
					return {
						PortfolioItemObjectID: portfolioItemRecord.data.ObjectID,
						PortfolioItemRank: index + 1,
						PortfolioItemName: portfolioItemRecord.data.Name,
						PortfolioItemFormattedID: portfolioItemRecord.data.FormattedID,
						PortfolioItemPlannedEnd: new Date(portfolioItemRecord.data.PlannedEndDate)*1,
						TopPortfolioItemName: me.PortfolioItemMap[portfolioItemRecord.data.ObjectID],
						Commitment: teamCommit.Commitment || 'Undecided',
						Objective: teamCommit.Objective || '',
						Expected: teamCommit.Expected || false
					};
				});
				
			me.CustomTeamCommitsStore = Ext.create('Intel.data.FastStore', {
				data: customTeamCommitsRecords,
				model:'IntelTeamCommits',
				autoSync:true,
				limit:Infinity,
				proxy: {
					type:'fastsessionproxy',
					id:'TeamCommitsProxy' + Math.random()
				},
				intelUpdate: function(){
					var teamCommitsStore = me.CustomTeamCommitsStore;
					teamCommitsStore.suspendEvents(true);
					_.each(teamCommitsStore.getRange(), function(teamCommitsRecord){
						var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(portfolioItem){
							return portfolioItem.data.ObjectID == teamCommitsRecord.data.PortfolioItemObjectID;
						});
						if(portfolioItemRecord) {
							var newVal = me._getTeamCommit(portfolioItemRecord);
							if(teamCommitsRecord.data.Commitment != newVal.Commitment)
								teamCommitsRecord.set('Commitment', newVal.Commitment || 'Undecided');
							if(teamCommitsRecord.data.Objective != (newVal.Objective || ''))
								teamCommitsRecord.set('Objective', newVal.Objective || '');
							if(teamCommitsRecord.data.Expected != newVal.Expected)
								teamCommitsRecord.set('Expected', newVal.Expected);
						}
					});
					teamCommitsStore.resumeEvents();
				}
			});
					
			var filterTopPortfolioItem = null, filterCommitment = null, filterEndDate = null;
			function teamCommitsFilter(teamCommitsRecord){
				if(filterTopPortfolioItem &&  teamCommitsRecord.data.TopPortfolioItemName != filterTopPortfolioItem) return false;
				if(filterCommitment && teamCommitsRecord.data.Commitment != filterCommitment) return false;
				if(filterEndDate && me._roundDateDownToWeekStart(teamCommitsRecord.data.PortfolioItemPlannedEnd)*1 != filterEndDate) return false;
				return true;
			}		
			function filterTeamCommitsRowsByFn(fn){
				/** NOTE: using the CSS program-board-hidden-grid-row for display requires us to make fixed grid heights */
				_.each(me.CustomTeamCommitsStore.getRange(), function(item, index){
					if(fn(item)) me.TeamCommitsGrid.view.removeRowCls(index, 'program-board-hidden-grid-row '); 
					else me.TeamCommitsGrid.view.addRowCls(index, 'program-board-hidden-grid-row ');
				});
			}
						
			var columnCfgs = [{
				text:'#',
				dataIndex:'PortfolioItemRank',
				width:30,
				editor:false,
				sortable:true,
				draggable:false,
				resizable:false,
				tooltip: me.PortfolioItemTypes[0] + ' Rank',
				tooltipType:'title'
			},{
				text:'ID', 
				dataIndex:'PortfolioItemFormattedID',
				width:60,
				editor:false,
				sortable:true,
				draggable:false,
				resizable:false,
				renderer:function(portfolioItemFormattedID, meta, teamCommitsRecord){
					var portfolioItem = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID);
					if(teamCommitsRecord.data.Expected) meta.tdCls += ' manager-expected-cell';
					if(portfolioItem.data.Project){
						return '<a href="https://rally1.rallydev.com/#/' + portfolioItem.data.Project.ObjectID + 
							'd/detail/portfolioitem/' + me.PortfolioItemTypes[0] + '/' + 
								portfolioItem.data.ObjectID + '" target="_blank">' + portfolioItemFormattedID + '</a>';
					}
					else return portfolioItemFormattedID;
				}
			},{
				text: me.PortfolioItemTypes[0],
				dataIndex:'PortfolioItemName',
				flex:1,
				editor:false,
				draggable:false,
				resizable:false
			},{
				text: me.PortfolioItemTypes[me.PortfolioItemTypes.length - 1], 
				dataIndex:'TopPortfolioItemName',
				width:90,
				editor:false,
				draggable:false,
				resizable:false,
				layout:'hbox',
				items:[{
					id:'team-commits-top-portfolio-item-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['TopPortfolioItemName'],
						data: [{TopPortfolioItemName:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.PortfolioItemMap)), 
							function(topPortfolioItemName){ return topPortfolioItemName; }), 
							function(topPortfolioItemName){ return {TopPortfolioItemName: topPortfolioItemName}; }))
					}),
					displayField: 'TopPortfolioItemName',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.TopPortfolioItemName == 'All') filterTopPortfolioItem = null; 
							else filterTopPortfolioItem = selected[0].data.TopPortfolioItemName;
							filterTeamCommitsRowsByFn(teamCommitsFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Stories', 
				dataIndex:'PortfolioItemObjectID',
				sortable:true, 
				editor:false,
				draggable:false,
				resizable:false,
				doSort: function(direction){
					this.up('grid').getStore().sort({
						sorterFn: function(item1, item2){  //sort by stories for this team in each feature
							var diff = me._getStoryCount(item1.data.PortfolioItemObjectID) - me._getStoryCount(item2.data.PortfolioItemObjectID);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:70,
				renderer:function(oid){ return me._getStoryCount(oid); }
			},{
				text:'Plan Estimate', 
				dataIndex:'PortfolioItemObjectID',
				sortable:true, 
				editor:false,
				draggable:false,
				resizable:false,
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					var field = this.getSortParam();
					ds.sort({
						sorterFn: function(item1, item2){ //sort by stories for this team in each portfolioItem
							var diff = me._getStoriesEstimate(item1.data.PortfolioItemObjectID) - me._getStoriesEstimate(item2.data.PortfolioItemObjectID);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:70,
				renderer:function(oid){ return me._getStoriesEstimate(oid); }
			},{
				text:'Planned End',
				dataIndex:'PortfolioItemPlannedEnd',
				sortable:true, 
				editor:false,
				draggable:false,
				resizable:false,
				width:100,
				renderer: function(ed){ return (ed ? 'ww' + me._getWorkweek(new Date(ed)) : '-'); },
				layout:'hbox',
				items: [{	
					id:'team-commits-end-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.PortfolioItemStore.getRange(),
							function(portfolioItem){ return me._roundDateDownToWeekStart(portfolioItem.data.PlannedEndDate)*1; })),
							function(date){ return date; }),
							function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }))
					}),
					displayField: 'Workweek',
					valueField: 'DateVal',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.DateVal === 0) filterEndDate = null; 
							else filterEndDate = selected[0].data.DateVal;
							filterTeamCommitsRowsByFn(teamCommitsFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				dataIndex:'Commitment',
				text:'Commitment',	
				width:100,
				tdCls: 'intel-editor-cell',	
				sortable:true, 
				draggable:false,
				resizable:false,
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Commitment'],
						data:[
							{Commitment:'Undecided'},
							{Commitment:'N/A'},
							{Commitment:'Committed'},
							{Commitment:'Not Committed'}
						]
					}),
					displayField: 'Commitment'
				},	
				layout:'hbox',
				items: [{	
					id:'team-commits-commitment-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Commitment'],
						data: [
							{Commitment: 'All'},
							{Commitment:'Undecided'},
							{Commitment:'N/A'},
							{Commitment:'Committed'},
							{Commitment:'Not Committed'}
						]
					}),
					displayField: 'Commitment',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Commitment == 'All') filterCommitment = null; 
							else filterCommitment = selected[0].data.Commitment;
							filterTeamCommitsRowsByFn(teamCommitsFilter);
						}
					}
				}, {xtype:'container', width:5}]	
			},{
				text:'Objective', 
				dataIndex:'Objective',
				flex:1,
				tdCls: 'intel-editor-cell',	
				editor: 'inteltextarea',
				draggable:false,
				resizable:false,
				sortable:false,
				renderer: function(val){ return val || '-'; }
			}];

			me.TeamCommitsGrid = me.down('#tcVelBoxLeft').add({
				xtype: 'rallygrid',
				cls: 'program-board-grid team-commits-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'program-board-grid-header-text',
						width:200,
						text:"TEAM COMMITS"
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
							listeners:{
								click: function(){
									filterTopPortfolioItem = null;
									filterCommitment = null;
									filterEndDate = null; 
									filterTeamCommitsRowsByFn(function(){ return true; });
									Ext.getCmp('team-commits-top-portfolio-item-filter').setValue('All');
									Ext.getCmp('team-commits-commitment-filter').setValue('All');
									Ext.getCmp('team-commits-end-filter').setValue('All');
								}
							}
						}]
					}]
				},
				height:410,
				scroll:'vertical',
				columnCfgs: columnCfgs,
				disableSelection: true,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(teamCommitsRecord, index, rowParams, store){
						var val = teamCommitsRecord.data.Commitment || 'Undecided',
							outputClasses = teamCommitsFilter(teamCommitsRecord) ? '' : ' program-board-hidden-grid-row ';
						if(val == 'N/A') return outputClasses + ' team-commits-grey-row ';
						else if(val == 'Committed') return outputClasses + ' team-commits-green-row ';
						else if(val == 'Not Committed') return outputClasses + ' team-commits-red-row ';
						else return outputClasses;
					}
				},
				listeners: {
					sortchange: function(){ filterTeamCommitsRowsByFn(teamCommitsFilter); },
					beforeedit: function(){ me._isEditingTeamCommits = true; },
					canceledit: function(){ me._isEditingTeamCommits = false; },
					edit: function(editor, e){
						var grid = e.grid, teamCommitsRecord = e.record,
							field = e.field, value = e.value, originalValue = e.originalValue;						
						if(value === originalValue) {
							me._isEditingTeamCommits = false;
							return; 
						}
						else if(field != 'Objective' && !value){ 
							teamCommitsRecord.set(field, originalValue); 
							me._isEditingTeamCommits = false;
							return; 
						}
						else if(field==='Objective'){
							value = me._htmlEscape(value);			
							teamCommitsRecord.set(field, value);
						}
						var tc = {
							Commitment: teamCommitsRecord.data.Commitment, 
							Objective: teamCommitsRecord.data.Objective 
						};	
						me.TeamCommitsGrid.setLoading("Saving");
						me._enqueue(function(unlockFunc){
							me._loadPortfolioItemByOrdinal(teamCommitsRecord.data.PortfolioItemObjectID, 0).then(function(realPortfolioItem){
								if(realPortfolioItem) return me._setTeamCommit(realPortfolioItem, tc);
							})
							.fail(function(reason){ me._alert('ERROR', reason || ''); })
							.then(function(){ 
								unlockFunc();
								me.TeamCommitsGrid.setLoading(false);
								me._isEditingTeamCommits = false;
							})
							.done();
						}, 'Queue-Main');
					}
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomTeamCommitsStore
			});	
		},		
		_loadVelocityGrid: function() {
			var me = this,
				iterationGroups = _.groupBy(me.UserStoryStore.getRecords(), function(us) { 
					return us.data.Iteration ? us.data.Iteration.Name : '__DELETE__' ; 
				});
			delete iterationGroups.__DELETE__; //ignore those not in an iteration
			
			var iterationGroupTotals = _.sortBy(_.map(me.IterationStore.getRecords(), function(iteration) {
				var iName = iteration.data.Name;
				return {    
					Name:iName, 
					PlannedVelocity: iteration.data.PlannedVelocity || 0,
					RealVelocity:_.reduce((iterationGroups[iName] || []), function(sum, us) { return sum + us.data.PlanEstimate; }, 0)
				};
			}), 'Name');
			
			me.CustomVelocityStore = Ext.create('Intel.data.FastStore', {
				data: iterationGroupTotals,
				model:'IntelVelocity',
				autoSync:true,
				limit:Infinity,
				proxy: {
					type:'fastsessionproxy',
					id:'VelocityProxy' + Math.random()
				},
				intelUpdate: function(){
					var velocityStore = me.CustomVelocityStore;
					velocityStore.suspendEvents(true);
					_.each(velocityStore.getRange(), function(velocityRecord){
						var iterationName = velocityRecord.data.Name,
							iteration = me.IterationStore.findExactRecord('Name', iterationName),
							newVal = iteration.data.PlannedVelocity || 0;
						if(newVal != velocityRecord.data.PlannedVelocity){
							velocityRecord.set('PlannedVelocity', iteration.data.PlannedVelocity || 0);
						}
					});
					velocityStore.resumeEvents();
				}
			});
			
			var columnCfgs = [{	
				text: 'Iteration',
				dataIndex: 'Name', 
				flex: 1,
				editor:false,
				draggable:false,
				resizable:false,
				sortable:true,
				renderer:function(iterationName, meta, velocityRecord){
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
					if(iteration.data.Project) {
						return '<a href="https://rally1.rallydev.com/#/' + iteration.data.Project.ObjectID + 'd/detail/iteration/' + 
								iteration.data.ObjectID + '" target="_blank">' + iterationName + '</a>';
					}
					else return iterationName;
				}
			},{
				text: 'Target Capacity',
				dataIndex: 'PlannedVelocity',
				width:80,
				tdCls: 'intel-editor-cell',
				editor:'textfield',
				draggable:false,
				resizable:false,
				sortable:true,
				tooltip:'(Planned Velocity)',
				tooltipType:'title',
				renderer:function(val, meta, record){
					meta.tdCls += (val*1===0 ? ' velocity-grid-error-cell ' : '');
					return val;
				}
			},{
				text: 'Actual Load',
				dataIndex: 'RealVelocity',
				width:80,
				editor:false,
				draggable:false,
				resizable:false,
				sortable:true,
				tooltip:'(Plan Estimate)',
				tooltipType:'title',
				renderer:function(realVel, meta, record){
					meta.tdCls += ((realVel*1 < record.data.PlannedVelocity*0.9) ? ' velocity-grid-warning-cell ' : '');
					meta.tdCls += ((realVel*1 === 0 || realVel*1 > record.data.PlannedVelocity*1) ? ' velocity-grid-error-cell ' : '');
					return realVel;
				}
			}];		
			var totalsColumnCfgs = [{	
				flex: 1,
				editor:false,
				draggable:false,
				resizable:false,
				renderer:function(name, meta, velocityRecord){ return '<b>TOTAL</b>'; }
			},{
				width:80,
				editor:false,
				draggable:false,
				resizable:false,
				renderer:function(){
					return _.reduce(me.IterationStore.getRecords(), function(sum, i){ return sum + (i.data.PlannedVelocity || 0); }, 0);
				}
			},{
				width:80,
				editor:false,
				draggable:false,
				resizable:false,
				renderer:function(value, meta){
					var planned = _.reduce(me.IterationStore.getRecords(), function(sum, i){ return sum + (i.data.PlannedVelocity || 0); }, 0),
						real = _.reduce(me.IterationStore.getRecords(), function(bigSum, iteration){
							return bigSum + _.reduce((iterationGroups[iteration.data.Name] || []), function(sum, us) {
								return sum + us.data.PlanEstimate;
							}, 0);
						}, 0);
					meta.tdCls += ((real < planned*0.9) ? ' velocity-grid-warning-cell ' : '');
					meta.tdCls += ((real*1 === 0 || real*1 > planned) ? ' velocity-grid-error-cell ' : '');
					return real;
				}
			}];
			
			me.VelocityGrid = me.down('#tcVelBoxRight').add({
				xtype: 'rallygrid',
				cls: 'program-board-grid velociy-grid rally-grid',
				title: "Velocity",
				viewConfig: {
					stripeRows: true,
					preserveScrollOnRefresh:true
				},
				plugins: ['fastcellediting'],
				listeners: {
					beforeedit: function(editor, e){
						me._isEditingVelocity = true;
						return true;
					},
					canceledit: function(){ me._isEditingVelocity = false; },
					edit: function(editor, e){
						var grid = e.grid,
							velocityRecord = e.record,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value.length===0 || isNaN(value) || (value*1<0) || (value*1 === originalValue*1)) { 
							velocityRecord.set('PlannedVelocity', originalValue);
							me._isEditingVelocity = false; 
							return; 
						}
						value = value*1 || 0; //value*1 || null to remove the 0's from teams
						var iterationName = velocityRecord.data.Name,
							iteration = me.IterationStore.findExactRecord('Name', iterationName); //we don't need the most recent iteration here
						iteration.set('PlannedVelocity', value);
						me.VelocityGrid.setLoading("Saving");
						me._enqueue(function(unlockFunc){
							iteration.save({ 
								callback: function(record, operation, success){
									if(!success){
										me._alert('ERROR', 'Could not modify Iteration');
										velocityRecord.set('PlannedVelocity', originalValue);
									} 
									else velocityRecord.set('PlannedVelocity', value);
									me._isEditingVelocity = false;
									me.VelocityGrid.setLoading(false);
									me.VelocityTotalsGrid.view.refreshNode(0);
									unlockFunc();
								} 
							});
						}, 'Queue-Main');
					}
				},
				enableEditing:false,
				showPagingToolbar: false,
				showRowActionsColumn:false,
				disableSelection: true,
				columnCfgs: columnCfgs,
				store: me.CustomVelocityStore
			});
			me.VelocityTotalsGrid = me.down('#tcVelBoxRight').add({
				xtype: 'rallygrid',
				cls: 'program-board-grid velociy-grid rally-grid',
				showPagingToolbar: false,
				showRowActionsColumn:false,
				hideHeaders:true,
				disableSelection: true,
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				enableEditing:false,
				columnCfgs:totalsColumnCfgs,
				store: Ext.create('Ext.data.Store', {
					model:'IntelVelocity',
					data: [{Name:'', PlannedVelocity:0, RealVelocity:0}]
				})
			});
		},
		_loadSanityGrid: function(){
			var me=this,
				columnCfgs = [{
					dataIndex:'title',
					flex:1,
					renderer:function(val, meta){ 
						meta.tdCls += ' mini-sanity-name-cell';
						if(val == 'Unsized Stories') meta.tdCls += ' green-bg-cell';
						if(val == 'Improperly Sized Stories') meta.tdCls += ' aqua-bg-cell';
						if(val == 'Stories in Release without Iteration') meta.tdCls += ' silver-bg-cell';
						if(val == 'Stories in Iteration not attached to Release') meta.tdCls += ' orange-bg-cell';
						if(val == 'Stories with End Date past ' + me.PortfolioItemTypes[0] + ' End Date') meta.tdCls += ' lime-bg-cell';
						return val; 
					}
				},{
					dataIndex:'userStories',
					width:30,
					renderer:function(val, meta){ 
						meta.tdCls += 'mini-sanity-num-cell';
						if(val.length === 0) meta.tdCls += ' mini-sanity-green-cell';
						else meta.tdCls += ' mini-sanity-red-cell';
						return val.length; 
					}
				}];
			
			me.SanityGrid = me.down('#tcVelBoxRight').add({
				xtype: 'rallygrid',
				cls: 'program-board-grid mini-sanity-grid rally-grid',
				header: {
					items: [{
						xtype:'container',
						html: me.SanityDashboardObjectID ? 
							('<a class="mini-sanity-header" href="https://rally1.rallydev.com/#/' + me.ProjectRecord.data.ObjectID + 
								'ud/custom/' + me.SanityDashboardObjectID + '" target="_blank">DATA INTEGRITY</a>') :
							'<span class="mini-sanity-header">DATA INTEGRITY</a>'
					}]
				},
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				columnCfgs:columnCfgs,
				store: Ext.create('Ext.data.Store', {
					fields:[
						{name: 'title', type: 'string'},
						{name: 'userStories', type: 'auto'}
					],
					data: me._getSanityStoreData()
				}),
				enableEditing:false,
				showPagingToolbar: false,
				showRowActionsColumn:false,
				hideHeaders:true,
				disableSelection: true
			});
		},
		_loadRisksGrid: function(){
			var me = this;
			
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
			function riskSorter(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; } //newer come first
			
			me.CustomRisksStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.RisksParsedData),
				autoSync:true,
				model:'IntelRisk',
				limit:Infinity,
				proxy: {
					type:'fastsessionproxy',
					id:'RiskProxy' + Math.random()
				},
				sorters: [riskSorter],
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
						riskStore.add(Ext.create('IntelRisk', Ext.clone(realRiskData)));
					});
					riskStore.resumeEvents();
				}
			});
			
			var defaultRenderer = function(val){ return val || '-'; };		
			
			var filterFID = null, 
				filterName = null, 
				filterStatus = null, 
				filterCheckpoint = null;
			function riskGridFilter(riskRecord){
				if(filterFID && riskRecord.data.PortfolioItemFormattedID != filterFID) return false;
				if(filterName && riskRecord.data.PortfolioItemName != filterName) return false;
				if(filterStatus && riskRecord.data.Status != filterStatus) return false;
				if(filterCheckpoint && me._roundDateDownToWeekStart(riskRecord.data.Checkpoint)*1 != filterCheckpoint) return false;
				return true;
			}		
			function filterRisksRowsByFn(fn){
				_.each(me.CustomRisksStore.getRange(), function(item, index){
					if(fn(item)) me.RisksGrid.view.removeRowCls(index, 'program-board-hidden-grid-row');
					else me.RisksGrid.view.addRowCls(index, 'program-board-hidden-grid-row');
				});
			}
			function removeFilters(){
				filterFID = null;
				filterName = null;
				filterStatus = null;
				filterCheckpoint = null; 
				filterRisksRowsByFn(function(){ return true; });
				Ext.getCmp('risk-fid-filter').setValue('All');
				Ext.getCmp('risk-name-filter').setValue('All');
				Ext.getCmp('risk-status-filter').setValue('All');
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
			function getCheckpointFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(),
					function(risk){ return me._roundDateDownToWeekStart(risk.data.Checkpoint)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function updateFilterOptions(){
				var fidStore = Ext.getCmp('risk-fid-filter').getStore(),
					nameStore = Ext.getCmp('risk-name-filter').getStore(),
					checkpointStore = Ext.getCmp('risk-checkpoint-filter').getStore();
				fidStore.removeAll();
				fidStore.add(getFIDfilterOptions());
				nameStore.removeAll();
				nameStore.add(getNameFilterOptions());
				checkpointStore.removeAll();
				checkpointStore.add(getCheckpointFilterOptions());
			}
			
			var columnCfgs = [{
				text:'#',
				dataIndex:'PortfolioItemFormattedID',
				tdCls: 'intel-editor-cell',	
				width:80,
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: me.PortfolioItemFIDStore,
					displayField: 'FormattedID'
				},			
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
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor:{
					xtype:'intelcombobox',
					store: me.PortfolioItemNameStore,
					displayField: 'Name'
				},
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
								newPortfolioItemRecord = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID);
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
								newPortfolioItemRecord = newPortfolioItemRecord || oldPortfolioItemRecord; //if new is same as old
								return Q(oldPortfolioItemRecord && 
									(function(){										
										var oldRealRisksData = me._parseRisksFromPortfolioItem(oldPortfolioItemRecord),
											oldRealRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, oldRealRisksData);							
										if(oldRealRiskData && (oldPortfolioItemRecord.data.ObjectID !== newPortfolioItemRecord.data.ObjectID))
											return me._removeRisk(oldPortfolioItemRecord, oldRealRiskData, me.ProjectRecord, me.RisksParsedData);
									}())
								);
							})
							.then(function(){ return me._addRisk(newPortfolioItemRecord, riskRecord.data, me.ProjectRecord, me.RisksParsedData); })
							.then(function(){
								riskRecord.beginEdit();
								riskRecord.set('Edited', false);
								riskRecord.set('PortfolioItemObjectID', newPortfolioItemRecord.data.ObjectID);
								riskRecord.endEdit();
							})
							.fail(function(reason){ me._alert('ERROR:', reason || ''); })
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
			},{
				text:'',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord, row, col){
					var clickFnName = 'Click' + riskRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					meta.tdAttr = 'title="Delete Risk"';
					window[clickFnName] = function(){
						me._confirm('Confirm', 'Delete Risk?', function(msg){
							if(msg.toLowerCase() !== 'yes') return;
							me.RisksGrid.setLoading("Deleting Risk");
							me._enqueue(function(unlockFunc){
								Q(riskRecord.data.PortfolioItemObjectID ? 
									me._loadPortfolioItemByOrdinal(riskRecord.data.PortfolioItemObjectID, 0) : 
									null)
								.then(function(oldPortfolioItemRecord){					
									return Q(oldPortfolioItemRecord && 
										(function(){										
											var riskRecordData = riskRecord.data,
												oldRealRisksData = me._parseRisksFromPortfolioItem(oldPortfolioItemRecord),
												oldRealRiskData = me._spliceRiskFromList(riskRecordData.RiskID, oldRealRisksData);							
											if(oldRealRiskData) 
												return me._removeRisk(oldPortfolioItemRecord, oldRealRiskData, me.ProjectRecord, me.RisksParsedData);
										}())
									);
								})
								.fail(function(reason){ me._alert('ERROR:', reason || ''); })
								.then(function(){
									unlockFunc();
									me.CustomRisksStore.remove(riskRecord);
									me.RisksGrid.setLoading(false);
									updateFilterOptions();
								})
								.done();
							}, 'Queue-Main');
						});
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-trash"></i></div>';
				}
			}];

			me.RisksGrid = me.add({
				xtype: 'rallygrid',
				cls: 'program-board-grid risks-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'program-board-grid-header-text',
						width:200,
						text:"RISKS"
					},{
						xtype:'container',
						flex:1000,
						layout:{
							type:'hbox',
							pack:'end'
						},
						items:[{
							xtype:'button',
							text:'+ Add Risk',
							id: 'addRiskButton',
							width:80,
							listeners:{
								click: function(){
									if(!me.PortfolioItemStore.first()) me._alert('ERROR', 'No ' + me.PortfolioItemTypes[0] + 's for this Release!');
									else if(me.CustomRisksStore) {
										removeFilters();
										var model = Ext.create('IntelRisk', {
											RiskID: "RI" + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
											PortfolioItemObjectID: '',
											PortfolioItemFormattedID: '',
											PortfolioItemName: '',
											Description: '',
											Impact: '',
											MitigationPlan: '',
											Urgency: '',
											Status: '',
											Contact: '',
											Checkpoint: '',
											Edited:true
										});
										me.CustomRisksStore.insert(0, [model]);
										me.RisksGrid.view.getEl().setScrollTop(0);
										me.RisksGrid.getSelectionModel().select(model);
									}
								}
							}
						},{
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
					getRowClass: function(item){ return riskGridFilter(item) ? '' : 'program-board-hidden-grid-row'; 
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
				
			/****************************** PREDECESSORS STUFF           ***********************************************/				
			me.PrececessorItemStores = {};
			me.PredecessorItemGrids = {};
			
			me.CustomPredecessorStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.DependenciesParsedData.Predecessors),
				autoSync:true,
				model:'IntelPredecessorDependency',
				limit:Infinity,
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
								predecessorStore.add(Ext.create('IntelPredecessorDependency', Ext.clone(realPredecessorData)));
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
						predecessorStore.add(Ext.create('IntelPredecessorDependency', Ext.clone(realPredecessorData)));					
						var dependencyID = realPredecessorData.DependencyID,
							predecessorItemStore = me.PrececessorItemStores[dependencyID];
						if(predecessorItemStore) predecessorItemStore.intelUpdate(); 
					});
					predecessorStore.resumeEvents();
				}
			});
			
			var defaultRenderer = function(val){ return val || '-'; };

			var filterPredUserStoryFormattedID = null, 
				filterPredUserStoryName = null, 
				filterPredNeededBy = null;
			function predecessorGridFilter(predecessorRecord){
				if(filterPredUserStoryFormattedID && predecessorRecord.data.UserStoryFormattedID != filterPredUserStoryFormattedID) return false;
				if(filterPredUserStoryName && predecessorRecord.data.UserStoryName != filterPredUserStoryName) return false;
				if(filterPredNeededBy && me._roundDateDownToWeekStart(predecessorRecord.data.NeededBy)*1 != filterPredNeededBy) return false;
				return true;
			}
			function filterPredecessorRowsByFn(fn){
				_.each(me.CustomPredecessorStore.getRange(), function(item, index){
					if(fn(item)) me.PredecessorGrid.view.removeRowCls(index, 'program-board-hidden-grid-row');
					else me.PredecessorGrid.view.addRowCls(index, 'program-board-hidden-grid-row');
				});
			}
			function removePredecessorFilters(){
				filterPredUserStoryFormattedID = null;
				filterPredUserStoryName = null;
				filterPredNeededBy = null; 
				filterPredecessorRowsByFn(function(){ return true; });
				Ext.getCmp('predecessor-us-formattedid-filter').setValue('All');
				Ext.getCmp('predecessor-us-name-filter').setValue('All');
				Ext.getCmp('predecessor-needed-by-filter').setValue('All');
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
			function getPredecessorNeededByFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredecessorStore.getRange(),
					function(r){ return me._roundDateDownToWeekStart(r.data.NeededBy)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function updatePredecessorFilterOptions(){
				var fidStore = Ext.getCmp('predecessor-us-formattedid-filter').getStore(),
					nameStore = Ext.getCmp('predecessor-us-name-filter').getStore(),
					cpStore = Ext.getCmp('predecessor-needed-by-filter').getStore();
				fidStore.removeAll();
				fidStore.add(getPredecessorFormattedIDFilterOptions());
				nameStore.removeAll();
				nameStore.add(getPredecessorNameFilterOptions());
				cpStore.removeAll();
				cpStore.add(getPredecessorNeededByFilterOptions());
			}
			
			var predecessorColumnCfgs = [{
				text:'#', 
				dataIndex:'UserStoryFormattedID',
				width:90,
				resizable:false,
				draggable:false,
				sortable:true,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: me.UserStoryFIDStore,
					displayField: 'FormattedID'
				},
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
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
					displayField: 'Name'
				},
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
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				resizable:false,	
				draggable:false,		
				sortable:false,
				tdCls: 'intel-editor-cell',
				editor: 'inteltextarea',
				renderer: defaultRenderer			
			},{
				text:'Needed By',			
				dataIndex:'NeededBy',
				width:90,
				resizable:false,
				draggable:false,
				sortable:true,
				tdCls: 'intel-editor-cell',		
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
				text:'',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, predecessorRecord, row, col){
					var dependencyID = predecessorRecord.data.DependencyID,
						clickFnName = 'Click' + predecessorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					meta.tdAttr = 'title="Add Team"';
					window[clickFnName] = function(){
						if(me.PrececessorItemStores[dependencyID]) {
							var predecessorStore = me.CustomPredecessorStore,
								predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
								newItem = me._newPredecessorItem();
							me.PrececessorItemStores[dependencyID].insert(0, [Ext.create('IntelPredecessorItem', newItem)]);
							predecessorRecord.set('PredecessorItems', predecessorRecord.data.PredecessorItems.concat([newItem]));
							predecessorRecord.set('Edited', true);	
						}
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-plus"></i></div>';
				}
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
						renderer: function(val, meta){
							var projectRecord = me.ProjectsWithTeamMembers[val];
							if(val && projectRecord) return projectRecord.data.Name;
							else {
								meta.tdCls += 'intel-editor-cell';
								return '-';
							}
						},
						editor: {
							xtype:'intelcombobox', 
							store: Ext.create('Ext.data.Store', {
								fields: ['Name'],
								data: me.ProjectNames,
								sorters: { property: 'Name' }
							}),
							displayField: 'Name'
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
					},{
						resizable:false,
						width:24,
						renderer: function(value, meta, predecessorItemRecord, row, col){
							var clickFnName = 'Click' + predecessorItemRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
							meta.tdAttr = 'title="Delete Team"';
							window[clickFnName] = function(){
								var predecessorStore = me.CustomPredecessorStore,
									predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
									realPredecessorItems = predecessorRecord.data.PredecessorItems.slice(),
									predecessorItemStore = me.PrececessorItemStores[dependencyID];	
									
								predecessorItemStore.suspendEvents(true);
								realPredecessorItems = _.filter(realPredecessorItems, function(realPredecessorItem){
									return realPredecessorItem.PredecessorItemID !== predecessorItemRecord.data.PredecessorItemID;
								});
								predecessorItemStore.remove(predecessorItemRecord);							
								if(!realPredecessorItems.length){
									var newItem = me._newPredecessorItem();
									predecessorItemStore.add(Ext.create('IntelPredecessorItem', newItem));
									realPredecessorItems.push(newItem);
								}
								predecessorRecord.set('Edited', true);
								predecessorRecord.set('PredecessorItems', realPredecessorItems);
								predecessorItemStore.resumeEvents();
							};
							return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-minus"></i></div>';
						}
					}];
					
					return {
						xtype: 'rallygrid',
						cls:'program-board-grid predecessor-items-grid rally-grid',
						plugins: [ 'fastcellediting' ],
						viewConfig: { stripeRows:false },
						width:450,
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
							beforeedit: function(editor, e){ if(!!e.value) return false; },
							edit: function(editor, e){			
								var predecessorItemRecord = e.record,
									field = e.field,
									value = e.value,
									originalValue = e.originalValue,
									predecessorStore = me.CustomPredecessorStore,
									predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
									realPredecessorItems = predecessorRecord.data.PredecessorItems;
								if(value === originalValue) return;										
								if(field === 'PredecessorProjectObjectID'){
									var projectRecord = _.find(me.ProjectsWithTeamMembers, function(vp){ return vp.data.Name === value; });
									if(!projectRecord){
										predecessorItemRecord.set('PredecessorProjectObjectID', originalValue);
										return;
									} else {
										var realPredecessorItem = _.find(realPredecessorItems, function(realPredecessorItem){
											return realPredecessorItem.PredecessorProjectObjectID == projectRecord.data.ObjectID;
										});
										if(realPredecessorItem){
											me._alert('ERROR', value + ' already included in this dependency');
											predecessorItemRecord.set('PredecessorProjectObjectID', originalValue);
											return;
										}
										if(projectRecord.data.ObjectID === me.ProjectRecord.data.ObjectID){
											me._alert('ERROR', 'You cannot depend on yourself');
											predecessorItemRecord.set('PredecessorProjectObjectID', originalValue);
											return;
										}
										predecessorItemRecord.set('PredecessorProjectObjectID', projectRecord.data.ObjectID);
									}
								}
								
								_.each(realPredecessorItems, function(realPredecessorItem){
									if(realPredecessorItem.PredecessorItemID === predecessorItemRecord.data.PredecessorItemID){
										realPredecessorItem.PredecessorProjectObjectID = predecessorItemRecord.data.PredecessorProjectObjectID; 
									}
								});
								predecessorRecord.set('Edited', true);
							},
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
				text:'',
				dataIndex:'Edited',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, predecessorRecord, row, col){
					var dependencyID = predecessorRecord.data.DependencyID,
						realPredecessorData = me._spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Predecessors.slice()),
						dirtyType = me._getDirtyType(predecessorRecord, realPredecessorData),
						clickFnName = 'Click' + predecessorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(dirtyType !== 'Edited') return ''; 
					meta.tdAttr = 'title="Undo"';
					window[clickFnName] = function(){
						var realPredecessorData = me._spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Predecessors.slice());
						predecessorRecord.beginEdit();
						_.each(realPredecessorData, function(value, field){
							if(field === 'PredecessorItems') predecessorRecord.set(field, value || [me._newPredecessorItem()]);
							else predecessorRecord.set(field, value);
						});
						predecessorRecord.endEdit();
						me.PrececessorItemStores[dependencyID].intelUpdate();
						updatePredecessorFilterOptions();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, predecessorRecord, row, col){
					var dependencyID = predecessorRecord.data.DependencyID,
						realPredecessorData = me._spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Predecessors.slice()),
						dirtyType = me._getDirtyType(predecessorRecord, realPredecessorData),
						clickFnName = 'Click' + predecessorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Save';
					else return ''; //don't render it!
					meta.tdAttr = 'title="' + dirtyType + ' Dependency"';
					window[clickFnName] = function(){
						//validate fields first
						if(!predecessorRecord.data.UserStoryFormattedID || !predecessorRecord.data.UserStoryName){
							me._alert('ERROR', 'A UserStory is not selected'); return; }
						if(!predecessorRecord.data.Description){
							me._alert('ERROR', 'The description is empty'); return; }
						if(!predecessorRecord.data.NeededBy){
							me._alert('ERROR', 'Select When the dependency is needed by'); return; }
						var predecessorItems = predecessorRecord.data.PredecessorItems;
						if(!predecessorItems.length){
							me._alert('ERROR', 'You must specify a team you depend on'); return; }
						if(_.find(predecessorItems, function(p){ return !p.PredecessorProjectObjectID; })){
							me._alert('ERROR', 'All Team Names must be valid'); return; }
						
						me.PredecessorGrid.setLoading("Saving Dependency");						
						me._enqueue(function(unlockFunc){
							var localPredecessorData = Ext.clone(predecessorRecord.data);
							/** NOTE ON ERROR HANDLING: we do NOT proceed at all if permissions are insufficient to edit a project, 
									or a project has no user stories to attach to. We first edit all the successors fields and collections 
									for the teams we depend upon, and then we edit the predecessor field on THIS user story.
									If a collection sync fails, it retries 4 times, and then it gives up. */
							me._getOldAndNewUserStoryRecords(localPredecessorData, me.UserStoriesInRelease).then(function(records){
								var oldUserStoryRecord = records[0], 
									newUserStoryRecord = records[1],
									realPredecessorData = me._getRealDependencyData(oldUserStoryRecord, localPredecessorData.DependencyID, 'Predecessors'),
									predecessorItemsArrays = me._getPredecessorItemArrays(localPredecessorData, realPredecessorData);
									
								/** checking and setting this here because the successors NEED the objectID of this userStory */
								if(!newUserStoryRecord){
									return Q.reject('User Story ' + localPredecessorData.UserStoryFormattedID + ' does not exist');
								}
								localPredecessorData.UserStoryObjectID = newUserStoryRecord.data.ObjectID;
								
								return me._getAddedPredecessorItemCallbacks(
									predecessorItemsArrays.added, 
									localPredecessorData,
									me.ProjectRecord,
									me.ProjectsWithTeamMembers,
									me.ProjectRecord,
									me.DependenciesParsedData)
								.then(function(addedCallbacks){	
									return me._getUpdatedPredecessorItemCallbacks(
											predecessorItemsArrays.updated, 
											localPredecessorData,
											me.ProjectRecord,
											me.ProjectsWithTeamMembers,
											me.ProjectRecord,
											me.DependenciesParsedData).then(function(updatedCallbacks){
										return me._getRemovedPredecessorItemCallbacks(
												predecessorItemsArrays.removed, 
												localPredecessorData,
												me.ProjectRecord,
												me.ProjectsWithTeamMembers,
												me.ProjectRecord,
												me.DependenciesParsedData).then(function(removedCallbacks){
											var promise = Q();
											_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });
											_.each(addedCallbacks, function(callback){ promise = promise.then(callback); });
											_.each(updatedCallbacks, function(callback){ promise = promise.then(callback); });
											
											promise = promise.then(function(){
												var newPredecessorItems = predecessorItemsArrays.added.concat(predecessorItemsArrays.updated);
												predecessorRecord.beginEdit();
												predecessorRecord.set('UserStoryObjectID', newUserStoryRecord.data.ObjectID);
												/** NOTE: added and updated predecessorItemsArrays DO GET MUTATED before here! */
												predecessorRecord.set('PredecessorItems', newPredecessorItems);
											});
											
											if(realPredecessorData && (oldUserStoryRecord.data.ObjectID !== newUserStoryRecord.data.ObjectID)){
												promise = promise.then(function(){
													return me._removePredecessor(oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
												});
											}
											return promise
												.then(function(){ 
													return me._addPredecessor(newUserStoryRecord, localPredecessorData, me.ProjectRecord, me.DependenciesParsedData); 
												})
												.then(function(){ predecessorRecord.set('Edited', false); })
												.fail(function(reason){ me._alert('ERROR:', reason || ''); })
												.then(function(){	predecessorRecord.endEdit(); });
										});
									});
								});
							})
							.fail(function(reason){ me._alert('ERROR:', reason || ''); })
							.then(function(){
								unlockFunc();
								updatePredecessorFilterOptions();
								me.PredecessorGrid.setLoading(false);
							})
							.done();
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			},{
				text:'',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, predecessorRecord, row, col){
					var clickFnName = 'Click' + predecessorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;	
					meta.tdAttr = 'title="Delete Dependency"';
					window[clickFnName] = function(){
						me._confirm('Confirm', 'Delete Dependency?', function(msg){
							if(msg.toLowerCase() !== 'yes') return;		
							me.PredecessorGrid.setLoading("Deleting Dependency");							
							me._enqueue(function(unlockFunc){
								var localPredecessorData = predecessorRecord.data;
								me._getOldAndNewUserStoryRecords(localPredecessorData, me.UserStoriesInRelease).then(function(records){
									var oldUserStoryRecord = records[0],
										realPredecessorData = me._getRealDependencyData(oldUserStoryRecord, localPredecessorData.DependencyID, 'Predecessors'),
										predecessorItemsArrays = me._getPredecessorItemArrays(localPredecessorData, realPredecessorData), 
										itemsToRemove = predecessorItemsArrays.removed.concat(predecessorItemsArrays.updated);
									return me._getRemovedPredecessorItemCallbacks(
											itemsToRemove, 
											localPredecessorData,
											me.ProjectRecord,
											me.ProjectsWithTeamMembers,
											me.ProjectRecord,
											me.DependenciesParsedData).then(function(removedCallbacks){
										var promise = Q();
										_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });													
										if(realPredecessorData){
											promise = promise.then(function(){
												return me._removePredecessor(oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
											});
										}
									});
								})
								.then(function(){ me.CustomPredecessorStore.remove(predecessorRecord); })
								.fail(function(reason){ me._alert('ERROR', reason || ''); })
								.then(function(){
									unlockFunc();
									updatePredecessorFilterOptions();
									me.PredecessorGrid.setLoading(false);
								})
								.done();
							}, 'Queue-Main');
						});
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-trash"></i></div>';
				}
			}];

			me.PredecessorGrid = me.add({
				xtype: 'rallygrid',
				cls: 'program-board-grid predecessors-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'program-board-grid-header-text',
						width:400,
						text:"DEPENDENCIES WE HAVE ON OTHER TEAMS"
					},{
						xtype:'container',
						flex:1000,
						layout:{
							type:'hbox',
							pack:'end'
						},
						items:[{
							xtype:'button',
							text:'+ Add Dependency',
							id: 'addDependencyButton',
							listeners:{
								click: function(){
									if(!me.UserStoriesInRelease.length) me._alert('ERROR', 'No User Stories for this Release!');
									else if(me.CustomPredecessorStore) {
										removePredecessorFilters();
										var model = Ext.create('IntelPredecessorDependency', {
											DependencyID: 'DP' + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
											UserStoryObjectID:'',
											UserStoryFormattedID: '',
											UserStoryName: '',
											Description: '',
											NeededBy: '',
											Status: '',
											PredecessorItems:[me._newPredecessorItem()],
											Edited:true
										});
										me.CustomPredecessorStore.insert(0, [model]);	
										me.PredecessorGrid.view.getEl().setScrollTop(0);
									}
								}
							}
						},{
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
						if(!predecessorGridFilter(predecessorRecord)) return 'program-board-hidden-grid-row'; 
					}
				},
				listeners: {
					sortchange: function(){ filterPredecessorRowsByFn(predecessorGridFilter); },
					edit: function(editor, e){		
						/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
							to improve performance.**/			
						var predecessorRecord = e.record,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value === originalValue) return; 
						else if(!value) { predecessorRecord.set(field, originalValue); return; }
						if(field === 'Description') {
							value = me._htmlEscape(value);			
							predecessorRecord.set(field, value);
						}

						var previousEdit = predecessorRecord.data.Edited; 
						predecessorRecord.set('Edited', true);
						
						var userStoryRecord;
						if(field === 'UserStoryName'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.Name === value; });
							if(!userStoryRecord){
								predecessorRecord.set('UserStoryName', originalValue);
								predecessorRecord.set('Edited', previousEdit);
							} else predecessorRecord.set('UserStoryFormattedID', userStoryRecord.data.FormattedID);
						} else if(field === 'UserStoryFormattedID'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.FormattedID === value; });
							if(!userStoryRecord) {
								predecessorRecord.set('UserStoryFormattedID', originalValue);
								predecessorRecord.set('Edited', previousEdit);
							} else predecessorRecord.set('UserStoryName', userStoryRecord.data.Name);
						}
						updatePredecessorFilterOptions();
					}
				},
				disableSelection: true,
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomPredecessorStore
			});	
		
		/**************************************************** SUCCESSORS STUFF *******************************************************************/	
			me.CustomSuccessorStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.DependenciesParsedData.Successors),
				autoSync:true,
				model:'IntelSuccessorDependency',
				proxy: {
					type: 'fastsessionproxy',
					id:'IntelSuccessorProxy' + Math.random()
				},
				limit:Infinity,
				sorters:[dependencySorter],
				intelUpdate: function(){
					var successorStore = me.CustomSuccessorStore,
						realSuccessorsData = me.DependenciesParsedData.Successors.slice(),
						remoteChanged = false; //if someone else updated this while it was idle on our screen
					successorStore.suspendEvents(true);
					_.each(successorStore.getRange(), function(successorRecord){
						var realSuccessorData = me._spliceDependencyFromList(successorRecord.data.DependencyID, realSuccessorsData),
							dirtyType = me._getDirtyType(successorRecord, realSuccessorData);
						if(dirtyType === 'Edited'){} //we don't want to remove any pending changes								
						else if(dirtyType === 'Deleted' || dirtyType === 'New') successorStore.remove(successorRecord);
						else {
							_.each(realSuccessorData, function(value, field){
								if(!_.isEqual(successorRecord.data[field], value)) remoteChanged = true;
							});
							if(remoteChanged){
								successorRecord.beginEdit();
								_.each(realSuccessorData, function(value, field){ successorRecord.set(field, value); });
								successorRecord.endEdit();
							}
						}
					});
					_.each(realSuccessorsData, function(realSuccessorData){
						successorStore.add(Ext.create('IntelSuccessorDependency', Ext.clone(realSuccessorData)));
					});
					successorStore.resumeEvents();
				}
			});
			
			var filterSuccReqTeamName = null, 
				filterSuccReqUserStoryFormattedID = null, 
				filterSuccReqUserStoryName = null, 
				filterSuccNeededBy = null,
				filterSuccSupported = null, 
				filterSuccUserStoryFormattedID = null, 
				filterSuccUserStoryName = null;
			function successorGridFilter(r){
				var successorUserStory = me.DependenciesHydratedUserStories[r.data.SuccessorUserStoryObjectID] || {data:{}};
				if(filterSuccReqTeamName && me.ProjectsWithTeamMembers[r.data.SuccessorProjectObjectID].data.Name != filterSuccReqTeamName) return false;
				if(filterSuccReqUserStoryFormattedID && successorUserStory.data.FormattedID != filterSuccReqUserStoryFormattedID) return false;
				if(filterSuccReqUserStoryName && successorUserStory.data.Name != filterSuccReqUserStoryName) return false;
				if(filterSuccNeededBy && me._roundDateDownToWeekStart(r.data.NeededBy)*1 != filterSuccNeededBy) return false;
				if(filterSuccSupported && r.data.Supported != filterSuccSupported) return false;
				if(filterSuccUserStoryFormattedID && (!r.data.Supported || r.data.UserStoryFormattedID != filterSuccUserStoryFormattedID)) return false;
				if(filterSuccUserStoryName && (!r.data.Supported || r.data.UserStoryName != filterSuccUserStoryName)) return false;
				return true;
			}
			function filterSuccessorRowsByFn(fn){
				_.each(me.CustomSuccessorStore.getRange(), function(item, index){
					if(fn(item)) me.SuccessorGrid.view.removeRowCls(index, 'program-board-hidden-grid-row');
					else me.SuccessorGrid.view.addRowCls(index, 'program-board-hidden-grid-row');
				});
			}
			function removeSuccessorFilter(){
				filterSuccReqTeamName = null;
				filterSuccReqUserStoryFormattedID = null;
				filterSuccReqUserStoryName = null;
				filterSuccNeededBy = null; 
				filterSuccSupported = null;
				filterSuccUserStoryFormattedID = null;
				filterSuccUserStoryName = null;
				filterSuccessorRowsByFn(function(){ return true; });
				Ext.getCmp('successor-requestor-team-name-filter').setValue('All');
				Ext.getCmp('successor-requestor-userstory-formattedid-filter').setValue('All');
				Ext.getCmp('successor-requestor-userstory-name-filter').setValue('All');
				Ext.getCmp('successor-needed-by-filter').setValue('All');
				Ext.getCmp('successor-supported-filter').setValue('All');
				Ext.getCmp('successor-us-formattedid-filter').setValue('All');
				Ext.getCmp('successor-us-name-filter').setValue('All');
			}
			
			function getSuccessorRequestorTeamNameOptions(){
				return [{TeamName: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomSuccessorStore.getRange(), 
					function(r){ return me.ProjectsWithTeamMembers[r.data.SuccessorProjectObjectID].data.Name; })),
					function(teamName){ return teamName; }), 
					function(teamName){ return {TeamName:teamName}; }));
			}		
			function getSuccessorRequestorUserStoryFormattedIDFilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(_.filter(me.CustomSuccessorStore.getRange(), 
					function(r){ return me.DependenciesHydratedUserStories[r.data.SuccessorUserStoryObjectID]; }),
					function(r){ return me.DependenciesHydratedUserStories[r.data.SuccessorUserStoryObjectID].data.FormattedID; })),
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getSuccessorRequestorUserStoryNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(_.filter(me.CustomSuccessorStore.getRange(), 
					function(r){ return me.DependenciesHydratedUserStories[r.data.SuccessorUserStoryObjectID]; }),
					function(r){ return me.DependenciesHydratedUserStories[r.data.SuccessorUserStoryObjectID].data.Name; })),
					function(n){ return n; }), 
					function(n){ return {Name:n}; }));
			}
			function getSuccessorNeededByFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomSuccessorStore.getRange(),
					function(r){ return me._roundDateDownToWeekStart(r.data.NeededBy)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function getSuccessorFormattedIDFilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.filter(_.union(_.map(me.CustomSuccessorStore.getRange(), 
					function(r){ return r.data.Supported == 'Yes' ? r.data.UserStoryFormattedID : ''; })), 
					function(f){ return f !== ''; }),
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getSuccessorNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.filter(_.union(_.map(me.CustomSuccessorStore.getRange(), 
					function(r){ return r.data.Supported == 'Yes' ? r.data.UserStoryName : ''; })), 
					function(f){ return f !== ''; }),
					function(f){ return f; }), 
					function(n){ return {Name:n}; }));
			}
			function updateSuccessorFilterOptions(){
				var teamStore = Ext.getCmp('successor-requestor-team-name-filter').getStore(),
					reqFidStore = Ext.getCmp('successor-requestor-userstory-formattedid-filter').getStore(),
					reqNameStore = Ext.getCmp('successor-requestor-userstory-name-filter').getStore(),
					neededByStore = Ext.getCmp('successor-needed-by-filter').getStore(),
					fidStore = Ext.getCmp('successor-us-formattedid-filter').getStore(),
					nameStore = Ext.getCmp('successor-us-name-filter').getStore();
				teamStore.removeAll();
				teamStore.add(getSuccessorRequestorTeamNameOptions());
				reqFidStore.removeAll();
				reqFidStore.add(getSuccessorRequestorUserStoryFormattedIDFilterOptions());
				reqNameStore.removeAll();
				reqNameStore.add(getSuccessorRequestorUserStoryNameFilterOptions());
				neededByStore.removeAll();
				neededByStore.add(getSuccessorNeededByFilterOptions());
				fidStore.removeAll();
				fidStore.add(getSuccessorFormattedIDFilterOptions());
				nameStore.removeAll();
				nameStore.add(getSuccessorNameFilterOptions());
			}
			
			var successorColumnCfgs = [{
				text:'Requested By',
				dataIndex:'SuccessorProjectObjectID',
				width:160,
				resizable:false,
				draggable:false,
				sortable:true,
				renderer: function(projectOID){ return me.ProjectsWithTeamMembers[projectOID].data.Name; },
				layout:'hbox',
				items:[{
					id:'successor-requestor-team-name-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['TeamName'],
						data: getSuccessorRequestorTeamNameOptions()
					}),
					displayField: 'TeamName',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.TeamName == 'All') filterSuccReqTeamName = null; 
							else filterSuccReqTeamName = selected[0].data.TeamName;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Req #',
				dataIndex:'SuccessorUserStoryObjectID',
				width:90,
				resizable:false,
				draggable:false,
				sortable:true,
				renderer: function(userStoryObjectID){
					var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
					if(userStory) return userStory.data.FormattedID;
					else return '?';
				},
				layout:'hbox',
				items:[{
					id:'successor-requestor-userstory-formattedid-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['FormattedID'],
						data: getSuccessorRequestorUserStoryFormattedIDFilterOptions()
					}),
					displayField: 'FormattedID',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.FormattedID == 'All') filterSuccReqUserStoryFormattedID = null; 
							else filterSuccReqUserStoryFormattedID = selected[0].data.FormattedID;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Req UserStory',
				dataIndex:'SuccessorUserStoryObjectID',
				flex:1,
				resizable:false,
				draggable:false,
				sortable:true,
				renderer: function(userStoryObjectID){
					var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
					if(userStory) return userStory.data.Name;
					else return '?';
				},
				layout:'hbox',
				items:[{
					id:'successor-requestor-userstory-name-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Name'],
						data: getSuccessorRequestorUserStoryNameFilterOptions()
					}),
					displayField: 'Name',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Name == 'All') filterSuccReqUserStoryName = null; 
							else filterSuccReqUserStoryName = selected[0].data.Name;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]	
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				resizable:false,
				draggable:false,
				editor: false,
				sortable:false					
			},{
				text:'Needed By',
				dataIndex:'NeededBy',
				width:80,
				resizable:false,
				draggable:false,
				editor: false,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');},
				layout:'hbox',
				items:[{
					id:'successor-needed-by-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: getSuccessorNeededByFilterOptions()
					}),
					displayField: 'Workweek',
					valueField: 'DateVal',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.DateVal === 0) filterSuccNeededBy = null; 
							else filterSuccNeededBy = selected[0].data.DateVal;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]			
			},{
				text:'Supported',					
				dataIndex:'Supported',
				width:90,
				resizable:false,
				draggable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelfixedcombo',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Sup'],
						data: [
							{Sup:'Undefined'},
							{Sup:'Yes'},
							{Sup:'No'}
						]
					}),
					displayField: 'Sup'
				},
				renderer: function(val, meta){
					if(val == 'No') meta.tdCls = 'successor-not-supported-cell';
					else if(val == 'Yes') meta.tdCls = 'successor-supported-cell';
					return val;
				},
				sortable:true,
				layout:'hbox',
				items:[{
					id:'successor-supported-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Sup'],
						data: [
							{Sup: 'All'},
							{Sup: 'Yes'}, 
							{Sup: 'No'}, 
							{Sup: 'Undefined'}
						]
					}),
					displayField: 'Sup',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Sup === 'All') filterSuccSupported = null; 
							else filterSuccSupported = selected[0].data.Sup;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Sup #', 
				dataIndex:'UserStoryFormattedID',
				width:90,
				resizable:false,
				draggable:false,
				editor:{
					xtype:'intelcombobox',
					width:120,
					store: me.UserStoryFIDStore,
					displayField: 'FormattedID'
				},
				sortable:true,
				renderer:function(val, meta, record){ 
					if(record.data.Supported == 'Yes') meta.tdCls += ' intel-editor-cell';
					return val || '-'; 
				},	
				layout:'hbox',
				items:[{
					id:'successor-us-formattedid-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['FormattedID'],
						data: getSuccessorFormattedIDFilterOptions()
					}),
					displayField: 'FormattedID',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.FormattedID == 'All') filterSuccUserStoryFormattedID = null; 
							else filterSuccUserStoryFormattedID = selected[0].data.FormattedID;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Sup UserStory', 
				dataIndex:'UserStoryName',
				flex:1,
				resizable:false,
				draggable:false,
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
					displayField: 'Name'
				},
				sortable: true,
				renderer:function(val, meta, record){ 
					if(record.data.Supported == 'Yes') meta.tdCls += ' intel-editor-cell';
					return val || '-'; 
				},	
				layout:'hbox',
				items:[{
					id:'successor-us-name-filter',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Name'],
						data: getSuccessorNameFilterOptions()
					}),
					displayField: 'Name',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Name == 'All') filterSuccUserStoryName = null; 
							else filterSuccUserStoryName = selected[0].data.Name;
							filterSuccessorRowsByFn(successorGridFilter);
						}
					}
				}, {xtype:'container', width:5}]	
			},{
				text:'',
				dataIndex:'Edited',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, successorRecord, row, col){		
					var clickFnName = 'Click' + successorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;	
					if(!successorRecord.data.UserStoryFormattedID) return '';
					meta.tdAttr = 'title="' + 'Remove User Story' + '"';
					window[clickFnName] = function(){
						successorRecord.set('Edited', true);
						successorRecord.set('Assigned', false);
						successorRecord.set('UserStoryFormattedID', '');
						successorRecord.set('UserStoryName', '');
						updateSuccessorFilterOptions();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-minus"></i></div>';
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, successorRecord, row, col){	
					var dependencyID = successorRecord.data.DependencyID,
						realSuccessorData = me._spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Successors.slice()),
						dirtyType = me._getDirtyType(successorRecord, realSuccessorData),
						clickFnName = 'Click' + successorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(dirtyType !== 'Edited') return '';
					meta.tdAttr = 'title="Undo"';
					window[clickFnName] = function(){
						var realSuccessorData = me._spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Successors.slice());	
						successorRecord.beginEdit(true);
						_.each(realSuccessorData, function(value, field){ successorRecord.set(field, value); });
						successorRecord.endEdit();
						updateSuccessorFilterOptions();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				text:'',
				width:24,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, successorRecord, row, col){
					var dependencyID = successorRecord.data.DependencyID,
						realSuccessorData = me._spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Successors.slice()),
						dirtyType = me._getDirtyType(successorRecord, realSuccessorData),
						clickFnName = 'Click' + successorRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(dirtyType !== 'Edited') return '';
					meta.tdAttr = 'title="Save Dependency"';
					window[clickFnName] = function(){
						if(!successorRecord.data.Supported){
							me._alert('ERROR', 'You must set the Supported field.'); return; }
						me.SuccessorGrid.setLoading("Saving Dependency");						
						me._enqueue(function(unlockFunc){
							var successorData = successorRecord.data, 
								oldUserStoryRecord, 
								newUserStoryRecord,
								realSuccessorData;
							me._getOldAndNewUserStoryRecords(successorData, me.UserStoriesInRelease).then(function(records){
								oldUserStoryRecord = records[0];
								newUserStoryRecord = records[1];
								
								realSuccessorData = me._getRealDependencyData(oldUserStoryRecord, successorData.DependencyID, 'Successors');
								if(!realSuccessorData) return Q.reject({SuccessorDeletedDependency:true, message:'Successor removed this dependency'});
								
								successorData.SuccessorUserStoryObjectID = realSuccessorData.SuccessorUserStoryObjectID;
								
								var successorProjectRecord = me.ProjectsWithTeamMembers[successorData.SuccessorProjectObjectID];
								return me._updateSuccessor(
										newUserStoryRecord, 
										successorData, 
										me.ProjectRecord,
										me.ProjectsWithTeamMembers, 
										me.ProjectRecord, 
										me.DependenciesParsedData).then(function(){									
									if(oldUserStoryRecord.data.ObjectID !== newUserStoryRecord.data.ObjectID)
										return me._removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData);
								})
								.then(function(){ return me._addSuccessor(newUserStoryRecord, successorData); })
								.then(function(){ successorRecord.set('Edited', false); });
							})
							.fail(function(reason){
								if(reason.SuccessorDeletedDependency){
									me._alert('ERROR', reason.message + '. Deleting this dependency now');
									if(realSuccessorData){
										me._removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData)
											.then(function(){ me.CustomSuccessorStore.remove(successorRecord); })
											.fail(function(reason){ me._alert('ERROR', reason || ''); })
											.done();
									}
									else me.CustomSuccessorStore.remove(successorRecord);
								}
								else me._alert('ERROR', reason || '');
							})
							.then(function(){
								unlockFunc();
								updateSuccessorFilterOptions();
								me.SuccessorGrid.setLoading(false);
							})
							.done();
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			}];
			
			me.SuccessorGrid = me.add({
				xtype: 'rallygrid',
				cls: 'program-board-grid successors-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'program-board-grid-header-text',
						width:400,
						text:"DEPENDENCIES OTHER TEAMS HAVE ON US"
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
							listeners:{ click: removeSuccessorFilter }
						}]
					}]
				},
				height:400,
				scroll:'vertical',
				columnCfgs: successorColumnCfgs,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(successorRecord){ 
						if(!successorGridFilter(successorRecord)) return 'program-board-hidden-grid-row'; 
					}
				},
				listeners: {
					sortchange: function(){ filterSuccessorRowsByFn(successorGridFilter); },
					beforeedit: function(editor, e){
						var successorRecord = e.record;
						if(successorRecord.data.Supported != 'Yes' && e.field != 'Supported') 
							return false; //don't edit user story stuff if not supported
					},
					edit: function(editor, e){					
						var grid = e.grid,
							successorRecord = e.record,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;	
							
						if(value == originalValue) return;
						else if(!value) { successorRecord.set(field, originalValue); return; }
						var previousEdit = successorRecord.data.Edited;
						successorRecord.set('Edited', true);
						
						if((field === 'UserStoryName' || field == 'UserStoryFormattedID') && successorRecord.data.Supported != 'Yes'){
							successorRecord.set(field, originalValue); 
							return; 
						}
						
						var userStoryRecord;
						if(field === 'UserStoryName'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.Name === value; });
							if(!userStoryRecord){
								successorRecord.set('UserStoryName', originalValue);
								successorRecord.set('Edited', previousEdit); 
							} else {
								successorRecord.set('UserStoryFormattedID', userStoryRecord.data.FormattedID);	
								successorRecord.set('Assigned', true);
							}
						} else if(field === 'UserStoryFormattedID'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.FormattedID === value; });
							if(!userStoryRecord) {
								successorRecord.set('UserStoryFormattedID', originalValue);
								successorRecord.set('Edited', previousEdit); 
							} else {
								successorRecord.set('UserStoryName', userStoryRecord.data.Name);	
								successorRecord.set('Assigned', true);
							}
						}
						else if(field === 'Supported'){ //cant be non-supported with a user story!
							if(value != 'Yes'){
								successorRecord.set('Assigned', false);
								successorRecord.set('UserStoryFormattedID', '');
								successorRecord.set('UserStoryName', '');
							}
						}
						updateSuccessorFilterOptions();
					}
				},
				disableSelection: true,
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomSuccessorStore
			});	
		}	
	});
}());