(function(){
	var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		RiskModel = Intel.SAFe.lib.model.Risk,
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

	Ext.define('Intel.SAFe.TeamReport', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.CustomAppObjectIDRegister',
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
				flex:9,
				id: 'tcVelBoxLeft'
			},{
				xtype:'container',
				flex:4,
				id: 'tcVelBoxRight'
			}]
		}],
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */
		
		userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/
		loadPortfolioItems: function(){ 
			var me=this;
			me.portfolioItemFields =["Name", "ObjectID", "FormattedID", "Release", "c_TeamCommits", "c_MoSCoW", "c_Risks", "Project", "PlannedEndDate", "Parent", "Children", "PortfolioItemType", "Ordinal", "PercentDoneByStoryPlanEstimate","DragAndDropRank"];
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) : 
						me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, me.ScrumGroupPortfolioProject, type)
					);
				}))
				.then(function(portfolioItemStores){
					me.PortfolioItemStore = portfolioItemStores[0];
					me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);
				});
		},
		loadIterations: function(){
			var me=this,
				startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseStartDate),
				endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseDate);
				iterationStore = Ext.create("Rally.data.wsapi.Store", {
					model: "Iteration",
					remoteSort: false,
					limit:Infinity,
					disableMetaChangeEvent: true,
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
			return me.reloadStore(iterationStore)
				.then(function(iterationStore){ 
					me.IterationStore = iterationStore; 
				});
		},
		getUserStoryFilter: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
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
		loadUserStories: function(){	
			var me=this, 
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				config = {
					model: 'HierarchicalRequirement',
					filters: [me.getUserStoryFilter()],
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
						'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 'DirectChildrenCount',					
						'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem, 'c_Dependencies'],
					context: {
						project:me.ProjectRecord.data._ref,
						projectScopeDown:false,
						projectScopeUp:false
					}
				};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		getExtraDataIntegrityUserStoriesFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })),
				userStoryProjectFilter = Ext.create('Rally.data.wsapi.Filter', { 
					property: 'Project.ObjectID', 
					value: me.ProjectRecord.data.ObjectID
				});
			return userStoryProjectFilter.and(inIterationButNotReleaseFilter);
		},				
		loadExtraDataIntegrityStories: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				config = {
					model: 'HierarchicalRequirement',
					filters: [me.getExtraDataIntegrityUserStoriesFilter()],
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
						'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
						'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					}
				};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.ExtraDataIntegrityUserStoriesStore = store;
				return store;
			});
		},
		
		/**___________________________________ TEAM COMMITS STUFF ___________________________________**/		
		getTeamCommit: function(portfolioItemRecord){	
			var teamCommits = portfolioItemRecord.data.c_TeamCommits,
				projectOID = this.ProjectRecord.data.ObjectID;
			try{ teamCommits = JSON.parse(atob(teamCommits))[projectOID] || {}; } 
			catch(e){ teamCommits = {}; }
			return teamCommits;
		},		
		setTeamCommit: function(portfolioItemRecord, newTeamCommit){
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
					
		getStoryCount: function(portfolioItemObjectID){	
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.teamCommitsCountHash = me.teamCommitsCountHash || {};
			if(typeof me.teamCommitsCountHash[portfolioItemObjectID] === 'undefined'){
				me.teamCommitsCountHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore.getRange(), function(sum, userStory){
					var isStoryInPortfolioItem = ((userStory.data[lowestPortfolioItem] || {}).ObjectID == portfolioItemObjectID),
						isLeafStory = (userStory.data.DirectChildrenCount === 0);
					return sum + (isLeafStory && isStoryInPortfolioItem)*1;
				}, 0);
			}
			return me.teamCommitsCountHash[portfolioItemObjectID];
		},
		getStoriesEstimate: function(portfolioItemObjectID){	
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.teamCommitsEstimateHash = me.teamCommitsEstimateHash || {};
			if(typeof me.teamCommitsEstimateHash[portfolioItemObjectID] === 'undefined'){
				me.teamCommitsEstimateHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore.getRange(), function(sum, userStory){
					var isStoryInPortfolioItem = ((userStory.data[lowestPortfolioItem] || {}).ObjectID == portfolioItemObjectID),
						isLeafStory = (userStory.data.DirectChildrenCount === 0);
					return sum + ((isLeafStory && isStoryInPortfolioItem) ? userStory.data.PlanEstimate : 0)*1;
				}, 0);
			}
			return me.teamCommitsEstimateHash[portfolioItemObjectID];
		},

		/**___________________________________ STDNCI STUFF ___________________________________**/
		/**
			get all leaf stories in this release for the leaf projects under the train
			*/
		loadSTDNCIData: function(){
			var me=this,
				releaseName = me.ReleaseRecord.data.Name,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
				
			var totalPointsInRelease = _.reduce(me.UserStoryStore.getRange(), function(sum, us){
				var isLeaf = us.data.DirectChildrenCount === 0;
				var inRelease = (us.data.Release || {}).Name === releaseName;
				return (isLeaf && inRelease) ? sum + (us.data.PlanEstimate || 0) : sum;
			}, 0);
			var stdnciPointsInRelease = _.reduce(me.UserStoryStore.getRange(), function(sum, us){
				var isLeaf = us.data.DirectChildrenCount === 0;
				var inRelease = (us.data.Release || {}).Name === releaseName;
				var isStdci = (me.PortfolioItemMap[(us.data[lowestPortfolioItem] || {}).ObjectID] || '').indexOf('STDNCI') >= 0;
				return (isLeaf && inRelease && isStdci) ? sum + (us.data.PlanEstimate || 0) : sum;
			}, 0);
			
			me.STDNCIData = {
				percent: (stdnciPointsInRelease/totalPointsInRelease)*100>>0,
				stdnciPoints: stdnciPointsInRelease,
				totalPoints: totalPointsInRelease
			};
		},
		
		/** __________________________________ Data Integrity STUFF ___________________________________**/
		getMiniDataIntegrityStoreData: function(){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate),
				totalUserStories = me.UserStoryStore.getRange().concat(me.ExtraDataIntegrityUserStoriesStore.getRange());
			return [{
				title: 'Unsized Stories',
				userStories: _.filter(totalUserStories, function(item){ 
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					return item.data.PlanEstimate === null; 
				})
			},{
				title: 'Improperly Sized Stories',
				userStories: _.filter(totalUserStories,function(item){
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					var pe = item.data.PlanEstimate;
					return pe!==0 && pe!==1 && pe!==2 && pe!==4 && pe!==8 && pe!==16;
				})
			},{
				title: 'Stories in Release without Iteration',
				userStories: _.filter(totalUserStories,function(item){ 
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					return !item.data.Iteration; 
				})
			},{
				title: 'Stories in Iteration not attached to Release',
				userStories: _.filter(totalUserStories,function(item){ 
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					if(!item.data.Iteration) return false;
					return (new Date(item.data.Iteration.StartDate) < releaseDate && new Date(item.data.Iteration.EndDate) > releaseStartDate) &&
						(!item.data.Release || item.data.Release.Name.indexOf(releaseName) < 0);
				})
			},{
				title: 'Stories Scheduled After ' + lowestPortfolioItem + ' End Date',
				userStories: _.filter(totalUserStories, function(item){		
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					if(!item.data.Iteration || !item.data[lowestPortfolioItem] || 
						!item.data[lowestPortfolioItem].PlannedEndDate || !item.data.Iteration.StartDate) return false;
					if(item.data.ScheduleState == 'Accepted') return false;
					return new Date(item.data[lowestPortfolioItem].PlannedEndDate) < new Date(item.data.Iteration.StartDate);
				})
			}];
		},

		/**___________________________________ RISKS STUFF ___________________________________**/	
		loadRisks: function(){
			var me = this;
			return RiskDb.query('risk-' + me.ReleaseRecord.data.Name + '-' + me.ScrumGroupRootRecord.data.ObjectID + '-')
				.then(function(risks){ 
					me.Risks = _.filter(risks, function(r){ return r.ProjectObjectID === me.ProjectRecord.data.ObjectID; });
				});
		},
		
		/**___________________________________ DEPENDENCIES STUFF ___________________________________**/					
		isUserStoryInRelease: function(userStoryRecord, releaseRecord){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			return ((userStoryRecord.data.Release || {}).Name === releaseRecord.data.Name) || 
				(!userStoryRecord.data.Release && ((userStoryRecord.data[lowestPortfolioItem] || {}).Release || {}).Name === releaseRecord.data.Name);
		},	
		spliceDependencyFromList: function(dependencyID, dependenciesData){ 
			for(var i = 0; i<dependenciesData.length; ++i){
				if(dependenciesData[i].DependencyID == dependencyID) {
					return dependenciesData.splice(i, 1)[0];
				}
			}
		},
		parseDependenciesFromUserStory: function(userStoryRecord){
			var me=this,
				predecessorsAndSuccessorsData = me.getDependencies(userStoryRecord), 
				inputPredecessors = predecessorsAndSuccessorsData.Predecessors, 
				inputSuccessors = predecessorsAndSuccessorsData.Successors,
				outputPredecessors = [], 
				outputSuccessors = [],
				UserStoryObjectID = userStoryRecord.data.ObjectID,
				UserStoryFormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name;
			
			if(me.isUserStoryInRelease(userStoryRecord, me.ReleaseRecord)){
				_.each(inputPredecessors, function(predecessorDependencyData, dependencyID){
					outputPredecessors.push({
						DependencyID: dependencyID,
						UserStoryObjectID: UserStoryObjectID,
						UserStoryFormattedID: UserStoryFormattedID,
						UserStoryName: UserStoryName,
						Description: predecessorDependencyData.Description,
						NeededBy: predecessorDependencyData.NeededBy,
						Plan: predecessorDependencyData.Plan,
						Status: predecessorDependencyData.Status,
						PredecessorItems: predecessorDependencyData.PredecessorItems || [], 
						Edited: false
					});
				});
			}
			_.each(inputSuccessors, function(successorDependencyData, dependencyID){
				if(successorDependencyData.Assigned){ //if this was just placed on a random user story, or is assigned to this user story
					UserStoryFormattedID = userStoryRecord.data.FormattedID;
					UserStoryName = userStoryRecord.data.Name;
				} 
				else UserStoryFormattedID = UserStoryName = '';
						
				outputSuccessors.push({
					DependencyID: dependencyID,
					SuccessorUserStoryObjectID: successorDependencyData.SuccessorUserStoryObjectID,
					SuccessorProjectObjectID: successorDependencyData.SuccessorProjectObjectID,
					UserStoryObjectID: UserStoryObjectID,
					UserStoryFormattedID: UserStoryFormattedID,
					UserStoryName: UserStoryName,
					Description: successorDependencyData.Description,
					NeededBy: successorDependencyData.NeededBy,
					Supported: successorDependencyData.Supported,
					Assigned: successorDependencyData.Assigned,
					Edited: false
				});
			});
			return {Predecessors:outputPredecessors, Successors:outputSuccessors};
		},
		parseDependenciesData: function(userStoryList){	
			var me=this, 
				predecessors = [], 
				successors = [];			

			_.each(userStoryList, function(userStoryRecord){
				var predecessorsAndSuccessorsData = me.parseDependenciesFromUserStory(userStoryRecord);
				predecessors = predecessors.concat(predecessorsAndSuccessorsData.Predecessors);
				successors = successors.concat(predecessorsAndSuccessorsData.Successors);
			});
			return {Predecessors:predecessors, Successors:successors};
		},		
		getRealDependencyData: function(oldUserStoryRecord, dependencyID, type){ 
			var me = this, realDependenciesData;
			if(oldUserStoryRecord) realDependenciesData = me.parseDependenciesFromUserStory(oldUserStoryRecord)[type];
			else realDependenciesData = [];
			return me.spliceDependencyFromList(dependencyID, realDependenciesData) || null;		
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
			_.each(dependenciesParsedData.Successors, function(successor){
				storyOIDsToHydrate.push(successor.SuccessorUserStoryObjectID);
			});
			
			return Q.all(_.map(storyOIDsToHydrate, function(storyOID){
				return me.loadUserStory(storyOID).then(function(userStory){
					if(userStory) dependenciesHydratedUserStories[storyOID] = userStory;
				});
			}))
			.then(function(){ return dependenciesHydratedUserStories; });
		},
		newPredecessorItem: function(){
			return {
				PredecessorItemID: 'PI' + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
				PredecessorUserStoryObjectID: 0,
				PredecessorProjectObjectID: 0,
				Supported:'Undefined',
				Assigned:false
			};
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
		isEditingTeamCommits: false, 
		isEditingVelocity: false,
		
		isEditing: function(grid){
			if(!grid || !grid.store) return false;
			if(grid.editingPlugin && grid.editingPlugin.activeEditor) return true;
			return _.some(grid.store.getRange(), function(record){ return record.data.Edited; });
		},		
		showGrids: function(){
			var me=this;
			if(!me.TeamCommitsGrid){
				me.renderTeamCommitsGrid();
				me.renderVelocityGrid();
				me.renderSTDNCIGrid();
				me.renderMiniDataIntegrityGrid();
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
					function(list, dependencyID){ return list.length > 1; }),
				duplicateSuccessors = _.filter(_.groupBy(me.DependenciesParsedData.Successors,
					function(dependency){ return dependency.DependencyID; }),
					function(list, dependencyID){ return list.length > 1; });
			if(duplicatePredecessors.length || duplicateSuccessors.length){
				me.clearRefreshInterval();
				me.renderResolveDuplicatesModal(duplicatePredecessors, duplicateSuccessors)
					.then(function(){ 
						me.setRefreshInterval(); 
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
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.syncRisks(me.Risks);
			if(!me.isEditingVelocity && me.IterationStore && me.UserStoryStore)
				if(me.VelocityGrid && me.VelocityGrid.store) me.VelocityGrid.store.intelUpdate();
			if(!me.isEditingTeamCommits && me.PortfolioItemStore && me.UserStoryStore)
				if(me.TeamCommitsGrid && me.TeamCommitsGrid.store) me.TeamCommitsGrid.store.intelUpdate();
			if(!isEditingDeps && me.UserStoryStore && me.PortfolioItemStore){		
				/** me.UserStoriesInRelease is needed because some of the stories in me.UserStoryStore could be from other overlapping releases */
				me.UserStoriesInRelease = _.filter(me.UserStoryStore.getRange(), function(userStoryRecord){ 
					return me.isUserStoryInRelease(userStoryRecord, me.ReleaseRecord); 
				});
				me.DependenciesParsedData = me.parseDependenciesData(me.UserStoryStore.getRange());
				promises.push(me.hydrateDependencyUserStories(me.DependenciesParsedData).then(function(dependenciesHydratedUserStories){
					me.DependenciesHydratedUserStories = dependenciesHydratedUserStories;
					me.updateUserStoryColumnStores();
					if(me.PredecessorGrid && me.PredecessorGrid.store) me.PredecessorGrid.store.intelUpdate();
					if(me.SuccessorGrid && me.SuccessorGrid.store) me.SuccessorGrid.store.intelUpdate();
				}));
			}
			return Q.all(promises);
		},	
		reloadStores: function(){
			var me=this,
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid),
				promises = [];
			promises.push(me.loadExtraDataIntegrityStories());
			promises.push(me.loadRisks());
			if(!me.isEditingVelocity)  promises.push(me.loadIterations());
			if(!me.isEditingTeamCommits) promises.push(me.loadPortfolioItems());
			if(!me.isEditingVelocity && !me.isEditingTeamCommits && !isEditingDeps) promises.push(me.loadUserStories());
			return Q.all(promises).then(function(){
				return me.loadSTDNCIData(); //after portfolio items AND user stories are loaded
			});
		},
		clearEverything: function(){
			var me=this;
			
			me.isEditingTeamCommits = false;
			me.isEditingVelocity = false;
			
			me.PortfolioItemMap = {};
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			me.IterationStore = undefined;
			me.ExtraDataIntegrityUserStoriesStore = undefined;
			
			me.PredecessorGrid = undefined;
			me.SuccessorGrid = undefined;
			me.RisksGrid = undefined;
			me.VelocityGrid = undefined;
			me.TeamCommitsGrid = undefined;
			me.DataIntegrityGrid = undefined;
			
			var toRemove = me.down('#tcVelBox').next(), tmp;
			while(toRemove){ //delete risks and dependencies 
				tmp = toRemove.next();
				toRemove.up().remove(toRemove);
				toRemove = tmp;
			}
			me.down('#tcVelBoxLeft').removeAll();
			me.down('#tcVelBoxRight').removeAll();
		},
		reloadEverything:function(){
			var me = this;
			
			me.clearEverything();
			me.setLoading('Loading Data');
			if(!me.ReleasePicker){ //draw these once, never remove them
				me.renderReleasePicker();
				me.renderScrumGroupPicker();
				me.renderRefreshIntervalCombo();
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
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid);			
			if(me.TeamCommitsGrid && !me.isEditingTeamCommits) me.TeamCommitsGrid.setLoading(message);
			if(me.VelocityGrid && !me.isEditingVelocity) me.VelocityGrid.setLoading(message);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.setLoading(message);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(message);
			if(me.SuccessorGrid && !isEditingDeps) me.SuccessorGrid.setLoading(message);
		},	
		removeLoadingMasks: function(){
			var me=this,
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid);		
			if(me.TeamCommitsGrid && !me.isEditingTeamCommits) me.TeamCommitsGrid.setLoading(false);
			if(me.VelocityGrid && !me.isEditingVelocity) me.VelocityGrid.setLoading(false);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.setLoading(false);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(false);
			if(me.SuccessorGrid && !isEditingDeps) me.SuccessorGrid.setLoading(false);
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
		clearRefreshInterval: function(){
			var me=this;
			if(me.RefreshInterval){ 
				clearInterval(me.RefreshInterval); 
				me.RefreshInterval = undefined; 
			}	
		},
		setRefreshInterval: function(){
			var me=this;
			me.clearRefreshInterval();
			if(me.AppsPref.refresh && me.AppsPref.refresh!=='Off')
				me.RefreshInterval = setInterval(function(){ me.refreshDataFunc(); }, me.AppsPref.refresh*1000);
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
					return Q.all([
						me.loadProjectsWithTeamMembers().then(function(projectsWithTeamMembers){
							me.ProjectsWithTeamMembers = projectsWithTeamMembers;
							me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
							if(!me.ProjectsWithTeamMembers[me.ProjectRecord.data.ObjectID])
								return Q.reject('Please scope to a project that has team members!');
						}),
						me.projectInWhichScrumGroup(me.ProjectRecord).then(function(scrumGroupRootRecord){
							if(scrumGroupRootRecord){
								me.ScrumGroupRootRecord = scrumGroupRootRecord;
								return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
									.then(function(scrumGroupPortfolioProject){
										me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
									});
							} 
							else me.ProjectNotInScrumGroup = true;
						}),
						me.loadAllScrumGroups().then(function(scrumGroupRootRecords){
							me.AllScrumGroupRootRecords = scrumGroupRootRecords;
							me.ScrumGroupNames = _.sortBy(_.map(scrumGroupRootRecords, 
								function(sgr){ return {Name: me.getScrumGroupName(sgr)}; }),
								function(sgn){ return sgn.Name; });
						}),
						me.loadAppsPreference()
							.then(function(appsPref){
								me.AppsPref = appsPref;
								me.AppsPref.refresh = me.AppsPref.refresh || 60;
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
						me.getCustomAppObjectID('Intel.DataIntegrityDashboard.Vertical').then(function(objectID){
							me.VerticalDataIntegrityDashboardObjectID = objectID;
						}),
						RiskDb.initialize()
					]);
				})
				.then(function(){
					if(me.ProjectNotInScrumGroup){
						var projectOID = me.ProjectRecord.data.ObjectID;
						if(me.AppsPref.projs[projectOID] && me.AppsPref.projs[projectOID].ScrumGroup){
							me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(p){ 
								return p.data.ObjectID == me.AppsPref.projs[projectOID].ScrumGroup; 
							});
							if(!me.ScrumGroupRootRecord) me.ScrumGroupRootRecord = me.AllScrumGroupRootRecords[0];
						} 
						else me.ScrumGroupRootRecord = me.AllScrumGroupRootRecords[0];
						return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord).then(function(scrumGroupPortfolioProject){
							me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
						});
					}
				})
				.then(function(){ 
					me.setLoading(false);
					me.setRefreshInterval(); 
					return me.reloadEverything();
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
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
		scrumGroupPickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.getScrumGroupName(me.ScrumGroupRootRecord) == records[0].data.Name) return;
			me.setLoading('Loading Data');
			me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(sgr){ return me.getScrumGroupName(sgr) == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].ScrumGroup = me.ScrumGroupRootRecord.data.ObjectID;
			Q.all([
				(me.ProjectNotInScrumGroup ? me.saveAppsPreference(me.AppsPref) : Q()), //Do not set a preference for scrums in scrum-groups
				me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
					.then(function(scrumGroupPortfolioProject){
						me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
					})
			])
			.then(function(){ me.reloadEverything(); })
			.fail(function(reason){ me.alert('ERROR', reason); })
			.then(function(){ me.setLoading(false); })
			.done();
		},	
		renderScrumGroupPicker: function(){
			var me=this;
			me.down('#navboxLeft').add({
				xtype:'intelfixedcombo',
				id:'scrumGroupPicker',
				width:240,
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],				
					data: me.ScrumGroupNames
				}),
				displayField: 'Name',
				fieldLabel: 'Portfolio:',
				value: me.getScrumGroupName(me.ScrumGroupRootRecord),
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.scrumGroupPickerSelected.bind(me)
				}
			});
		},	
		refreshComboSelected: function(combo, records){
			var me=this, rate = records[0].data.Rate;
			if(me.AppsPref.refresh === rate) return;
			me.AppsPref.refresh = rate;
			me.setRefreshInterval();
			me.setLoading("Saving Preference");
			me.saveAppsPreference(me.AppsPref)
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},			
		renderRefreshIntervalCombo: function(){
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
					select: me.refreshComboSelected.bind(me)
				}
			});
		},
		renderManualRefreshButton: function(){
			var me=this;
			me.down('#navboxRight').add({
				xtype:'button',
				id: 'manualRefreshButton',
				cls: 'intel-button',
				text:'Refresh Data',
				width:100,
				listeners:{
					click: me.refreshDataFunc.bind(me)
				}
			});
		},

		/**___________________________________ RENDER RESOLVE DUPLICATES ___________________________________*/	
		renderResolveDuplicatesModal: function(duplicatePredecessors, duplicateSuccessors){
			var me=this,
				deferred = Q.defer(),
				modal = Ext.create('Ext.window.Window', {
					modal:true,
					closable:false,
					title:'ERROR Duplicate Dependencies!',
					cls:'duplicates-modal',
					overflowY: 'scroll',
					resizable: true,
					height: me.getHeight()*0.9>>0,
					width: Math.min(900, me.getWidth()*0.9>>0),
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
								cls: 'team-report-grid duplicate-predecessors-grid rally-grid',
								columns: {
									defaults: COLUMN_DEFAULTS,
									items: [{
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
												cls:'team-report-grid duplicate-predecessor-items-grid rally-grid',
												viewConfig: { stripeRows:false },
												width:420,
												manageHeight:false,
												columns: {
													defaults: COLUMN_DEFAULTS,
													items: predecessorItemColumnCfgs
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
									}]
								},
								selModel: Ext.create('Ext.selection.CheckboxModel', {
									mode:'SINGLE',
									allowDeselect:false
								}),
								listeners:{ viewready: function(){ this.getSelectionModel().select(0); }},
								manageHeight:false,
								sortableColumns:false,
								enableEditing:false,
								store:Ext.create('Rally.data.custom.Store', { data: predecessorsOfOneID })
							};
						})
					) : []).concat(duplicateSuccessors.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Successors</h2>'
						}].concat(_.map(duplicateSuccessors, function(successorsOfOneID){
							return {
								xtype:'grid',
								cls: 'team-report-grid duplicate-successors-grid rally-grid',
								columns: {
									defaults: COLUMN_DEFAULTS,
									items: [{
										text:'Requested By',
										dataIndex:'SuccessorProjectObjectID',
										width:160,
										sortable:true,
										renderer: function(projectOID){ return me.ProjectsWithTeamMembers[projectOID].data.Name; }
									},{
										text:'Req #',
										dataIndex:'SuccessorUserStoryObjectID',
										width:90,
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
										sortable:true,
										renderer: function(userStoryObjectID){
											var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
											if(userStory) return userStory.data.Name;
											else return '?';
										}
									},{
										text:'Dependency Description', 
										dataIndex:'Description',
										flex:1			
									},{
										text:'Needed By',
										dataIndex:'NeededBy',
										width:80,
										sortable:true,
										renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');}	
									},{
										text:'Supported',					
										dataIndex:'Supported',
										width:90,
										renderer: function(val, meta){
											if(val == 'No') meta.tdCls = 'successor-not-supported-cell';
											else if(val == 'Yes') meta.tdCls = 'successor-supported-cell';
											return val;
										}
									},{
										text:'Sup #', 
										dataIndex:'UserStoryFormattedID',
										width:90,
										sortable:true
									},{
										text:'Sup UserStory', 
										dataIndex:'UserStoryName',
										flex:1,
										sortable: true
									}]
								},
								selModel: Ext.create('Ext.selection.CheckboxModel', {
									mode:'SINGLE',
									allowDeselect:false
								}),
								listeners:{ viewready: function(){ this.getSelectionModel().select(0); }},
								manageHeight:false,
								sortableColumns:false,
								enableEditing:false,
								store:Ext.create('Rally.data.custom.Store', { data: successorsOfOneID })
							};
						})
					) : []).concat([{
						xtype:'button',
						cls:'done-button',
						text:'Done',
						handler:function(){
							var grids = Ext.ComponentQuery.query('grid', modal),
								predecessorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-predecessors-grid'); }),
								successorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-successors-grid'); });

							modal.setLoading('Removing Duplicates');
							Q.all([
								Q.all(_.map(predecessorGrids, function(grid){ 
									var predecessorToKeep = grid.getSelectionModel().getSelection()[0],
										predecessorsToRemove = _.filter(grid.store.getRange(), function(item){ return item.id != predecessorToKeep.id; });
									return Q.all(_.map(predecessorsToRemove, function(predecessorRecord){			
										var deferred = Q.defer();
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(predecessorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me.getRealDependencyData(
														oldUserStoryRecord, predecessorRecord.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me.getRemovedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems,  
														realPredecessorData,
														me.ProjectRecord,
														me.ProjectsWithTeamMembers,
														me.ProjectRecord,
														me.DependenciesParsedData).then(function(removedCallbacks){
													var promise = Q();
													_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });													
													return promise.then(function(){
														return me.removePredecessor(
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
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(predecessorToKeep.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me.getRealDependencyData(
														oldUserStoryRecord, predecessorToKeep.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me.getAddedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems, 
														realPredecessorData,
														me.ProjectRecord,
														me.ProjectsWithTeamMembers,
														me.ProjectRecord,
														me.DependenciesParsedData).then(function(addedCallbacks){
													var promise = Q();
													_.each(addedCallbacks, function(callback){ promise = promise.then(callback); });			
													return promise.then(function(){
														return me.addPredecessor(
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
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(successorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realSuccessorData = me.getRealDependencyData(
														oldUserStoryRecord, successorRecord.data.DependencyID, 'Successors');		
												if(!realSuccessorData) return;
												return me.removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData);
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
		renderTeamCommitsGrid: function(){
			var me = this,
				MoSCoWRanks = ['Must Have', 'Should Have', 'Could Have', 'Won\'t Have', 'Undefined', ''];
			
			me.teamCommitsCountHash = {};
			me.teamCommitsEstimateHash = {};
			
			var customTeamCommitsRecords = _.map(_.sortBy(me.PortfolioItemStore.getRecords(), 
				function(portfolioItemRecord){ return portfolioItemRecord.data.DragAndDropRank; /* return MoSCoWRanks.indexOf(portfolioItemRecord.data.c_MoSCoW); */ }),
				function(portfolioItemRecord, index){
					var teamCommit = me.getTeamCommit(portfolioItemRecord);
					return {
						PortfolioItemObjectID: portfolioItemRecord.data.ObjectID,
						PortfolioItemRank: index+1,
						PortfolioItemMoSCoW: portfolioItemRecord.data.c_MoSCoW || 'Undefined',
						PortfolioItemName: portfolioItemRecord.data.Name,
						PortfolioItemFormattedID: portfolioItemRecord.data.FormattedID,
						PortfolioItemPlannedEnd: new Date(portfolioItemRecord.data.PlannedEndDate)*1,
						TopPortfolioItemName: me.PortfolioItemMap[portfolioItemRecord.data.ObjectID],
						Commitment: teamCommit.Commitment || 'Undecided',
						Objective: teamCommit.Objective || '',
						Expected: teamCommit.Expected || false
					};
				});
				
			var teamCommitsStore = Ext.create('Intel.lib.component.Store', {
				data: customTeamCommitsRecords,
				model:'IntelTeamCommits',
				autoSync:true,
				limit:Infinity,
				disableMetaChangeEvent: true,
				proxy: {
					type:'intelsessionstorage',
					id:'TeamCommitsProxy' + Math.random()
				},
				intelUpdate: function(){
					teamCommitsStore.suspendEvents(true);
					_.each(teamCommitsStore.getRange(), function(teamCommitsRecord){
						var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(portfolioItem){
							return portfolioItem.data.ObjectID == teamCommitsRecord.data.PortfolioItemObjectID;
						});
						if(portfolioItemRecord) {
							var newVal = me.getTeamCommit(portfolioItemRecord);
							if(teamCommitsRecord.data.Commitment != newVal.Commitment)
								teamCommitsRecord.set('Commitment', newVal.Commitment || 'Undecided');
							if(teamCommitsRecord.data.Objective != (newVal.Objective || ''))
								teamCommitsRecord.set('Objective', newVal.Objective || '');
							if(teamCommitsRecord.data.Expected != newVal.Expected)
								teamCommitsRecord.set('Expected', newVal.Expected);
							if(teamCommitsRecord.data.PortfolioItemMoSCoW != portfolioItemRecord.data.c_MoSCoW)
								teamCommitsRecord.set('PortfolioItemMoSCoW', portfolioItemRecord.data.c_MoSCoW || 'Undefined');
						}
					});
					teamCommitsStore.resumeEvents();
				}
			});
			var teamCommitsColumns = [{
				text:'MoSCoW',
				dataIndex:'PortfolioItemMoSCoW',
				tdCls: 'moscow-cell',
				width:100,
				sortable:true,
				doSort: function(direction){
					this.up('grid').getStore().sort({
						sorterFn: function(item1, item2){
							var diff = MoSCoWRanks.indexOf(item1.data.PortfolioItemMoSCoW) - MoSCoWRanks.indexOf(item2.data.PortfolioItemMoSCoW);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				renderer:function(val, meta){
					if(val == 'Must Have') meta.tdCls += ' must-have';
					if(val == 'Should Have') meta.tdCls += ' should-have';
					if(val == 'Could Have') meta.tdCls += ' could-have';
					if(val == 'Won\'t Have') meta.tdCls += ' wont-have';
					return val || 'Undefined'; 
				},
				items: [{ 
					xtype: 'intelgridcolumnfilter',
					sortFn: function(moscow){ return MoSCoWRanks.indexOf(moscow); },
					convertDisplayFn: function(val){ if(val === '') return 'Undefined'; else return val; }
				}]
			},{
				text: 'Rank',
				dataIndex: 'PortfolioItemRank',
				width: 50,
				sortable:true
			},{
				text:'ID', 
				dataIndex:'PortfolioItemFormattedID',
				width:60,
				sortable:true,
				renderer:function(portfolioItemFormattedID, meta, teamCommitsRecord){
					var portfolioItem = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID);
					if(teamCommitsRecord.data.Expected) meta.tdCls += ' manager-expected-cell';
					if(portfolioItem.data.Project){
						return '<a href="' + me.BaseUrl + '/#/' + portfolioItem.data.Project.ObjectID + 
							'd/detail/portfolioitem/' + me.PortfolioItemTypes[0] + '/' + 
								portfolioItem.data.ObjectID + '" target="_blank">' + portfolioItemFormattedID + '</a>';
					}
					else return portfolioItemFormattedID;
				}
			},{
				text: me.PortfolioItemTypes[0],
				dataIndex:'PortfolioItemName',
				flex:1
			},{
				text: me.PortfolioItemTypes.slice(-1)[0], 
				dataIndex:'TopPortfolioItemName',
				width:90,
				items: [{ xtype: 'intelgridcolumnfilter' }]
			},{
				text:'Stories', 
				dataIndex:'PortfolioItemObjectID',
				sortable:true, 
				doSort: function(direction){
					this.up('grid').getStore().sort({
						sorterFn: function(item1, item2){
							var diff = me.getStoryCount(item1.data.PortfolioItemObjectID) - me.getStoryCount(item2.data.PortfolioItemObjectID);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:70,
				renderer:function(oid){ return me.getStoryCount(oid); }
			},{
				text:'Plan Estimate', 
				dataIndex:'PortfolioItemObjectID',
				sortable:true, 
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					var field = this.getSortParam();
					ds.sort({
						sorterFn: function(item1, item2){
							var diff = me.getStoriesEstimate(item1.data.PortfolioItemObjectID) - me.getStoriesEstimate(item2.data.PortfolioItemObjectID);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:70,
				renderer:function(oid){ return me.getStoriesEstimate(oid); }
			},{
				text:'Planned End',
				dataIndex:'PortfolioItemPlannedEnd',
				sortable:true, 
				width:100,
				renderer: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(new Date(dateVal)) : '-'; },
				layout:'hbox',
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : undefined; }
				}]
			},{
				dataIndex:'Commitment',
				text:'Commitment',	
				width:100,
				tdCls: 'intel-editor-cell',	
				sortable:true, 
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
				items: [{ xtype: 'intelgridcolumnfilter' }]
			},{
				text:'Objective', 
				dataIndex:'Objective',
				flex:1,
				tdCls: 'intel-editor-cell',	
				editor: 'inteltextarea'
			}];

			me.TeamCommitsGrid = me.down('#tcVelBoxLeft').add({
				xtype: 'grid',
				cls: 'team-report-grid team-commits-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'team-report-grid-header-text',
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
							cls: 'intel-button',
							width:110,
							listeners:{ 
								click: function(){ 
									_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', me.TeamCommitsGrid), 'clearFilters'); 
									me.TeamCommitsGrid.store.fireEvent('refresh', me.TeamCommitsGrid.store);
								} 
							}
						}]
					}]
				},
				height:410,
				scroll:'vertical',
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: teamCommitsColumns
				},
				disableSelection: true,
				plugins: [ 'intelcellediting' ],
				viewConfig:{
					xtype:'inteltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(teamCommitsRecord){
						var val = teamCommitsRecord.data.Commitment || 'Undecided',
							outputClasses = '';
						if(val == 'N/A') return outputClasses + ' team-commits-grey-row ';
						else if(val == 'Committed') return outputClasses + ' team-commits-green-row ';
						else if(val == 'Not Committed') return outputClasses + ' team-commits-red-row ';
						else return outputClasses;
					}
				},
				listeners: {
					beforeedit: function(){ me.isEditingTeamCommits = true; },
					canceledit: function(){ me.isEditingTeamCommits = false; },
					edit: function(editor, e){
						var grid = e.grid, teamCommitsRecord = e.record,
							field = e.field, value = e.value, originalValue = e.originalValue;						
						if(value === originalValue) {
							me.isEditingTeamCommits = false;
							return; 
						}
						else if(field != 'Objective' && !value){ 
							teamCommitsRecord.set(field, originalValue); 
							me.isEditingTeamCommits = false;
							return; 
						}
						else if(field==='Objective'){
							value = me.htmlEscape(value);			
							teamCommitsRecord.set(field, value);
						}
						var tc = {
							Commitment: teamCommitsRecord.data.Commitment, 
							Objective: teamCommitsRecord.data.Objective 
						};	
						me.TeamCommitsGrid.setLoading("Saving");
						me.enqueue(function(unlockFunc){
							me.loadPortfolioItemByOrdinal(teamCommitsRecord.data.PortfolioItemObjectID, 0).then(function(realPortfolioItem){
								if(realPortfolioItem) return me.setTeamCommit(realPortfolioItem, tc);
							})
							.fail(function(reason){ me.alert('ERROR', reason); })
							.then(function(){ 
								unlockFunc();
								me.TeamCommitsGrid.setLoading(false);
								me.isEditingTeamCommits = false;
							})
							.done();
						}, 'Queue-Main');
					}
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: teamCommitsStore
			});	
		},		
		renderVelocityGrid: function() {
			var me = this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				iterationGroups = _.groupBy(me.UserStoryStore.getRecords(), function(us) { 
					return us.data.Iteration ? us.data.Iteration.Name : '__DELETE__' ; 
				});
			delete iterationGroups.__DELETE__; //ignore those not in an iteration
			
			var iterationGroupTotals = _.map(_.sortBy(me.IterationStore.getRecords(), 
				function(iteration){
					return new Date(iteration.data.StartDate);
				}),
				function(iteration) {
					var iName = iteration.data.Name;
					return {    
						Name: iName, 
						PlannedVelocity: iteration.data.PlannedVelocity || 0,
						RealVelocity: _.reduce((iterationGroups[iName] || []), function(sum, us) { 
							return sum + 
								(((us.data.Release || (us.data[lowestPortfolioItem] || {}).Release || {}).Name == me.ReleaseRecord.data.Name) ? 
									us.data.PlanEstimate : 
									0);
						}, 0)
					};
				});
			
			var velocityStore = Ext.create('Intel.lib.component.Store', {
				data: iterationGroupTotals,
				model:'IntelVelocity',
				autoSync:true,
				limit:Infinity,
				disableMetaChangeEvent: true,
				proxy: {
					type:'intelsessionstorage',
					id:'VelocityProxy' + Math.random()
				},
				intelUpdate: function(){
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
			
			var velocityColumns = [{	
				text: 'Iteration',
				dataIndex: 'Name', 
				flex: 1,
				sortable:true,
				renderer:function(iterationName, meta, velocityRecord){
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
					if(iteration.data.Project) {
						return '<a href="' + me.BaseUrl + '/#/' + iteration.data.Project.ObjectID + 'd/detail/iteration/' + 
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
				sortable:true,
				tooltip:'(Plan Estimate)',
				tooltipType:'title',
				renderer:function(realVel, meta, record){
					meta.tdCls += ((realVel*1 < record.data.PlannedVelocity*0.8) ? ' velocity-grid-warning-cell ' : '');
					meta.tdCls += ((realVel*1 === 0 || realVel*1 > record.data.PlannedVelocity*0.9) ? ' velocity-grid-error-cell ' : '');
					return realVel;
				}
			}];		
			var velocityTotalColumns = [{	
				flex: 1,
				renderer:function(name, meta, velocityRecord){ return '<b>TOTAL</b>'; }
			},{
				width:80,
				renderer:function(){
					return _.reduce(me.IterationStore.getRecords(), function(sum, i){ return sum + (i.data.PlannedVelocity || 0); }, 0);
				}
			},{
				width:80,
				renderer:function(value, meta){
					var planned = _.reduce(me.IterationStore.getRecords(), function(sum, i){ return sum + (i.data.PlannedVelocity || 0); }, 0),
						real = _.reduce(me.IterationStore.getRecords(), function(bigSum, iteration){
							return bigSum + _.reduce((iterationGroups[iteration.data.Name] || []), function(sum, us) {
								return sum + 
									(((us.data.Release || (us.data[lowestPortfolioItem] || {}).Release || {}).Name == me.ReleaseRecord.data.Name) ? 
										us.data.PlanEstimate : 
										0);
							}, 0);
						}, 0);
					meta.tdCls += ((real < planned*0.8) ? ' velocity-grid-warning-cell ' : '');
					meta.tdCls += ((real === 0 || real > planned*0.9) ? ' velocity-grid-error-cell ' : '');
					return real;
				}
			}];
			
			me.VelocityGrid = me.down('#tcVelBoxRight').add({
				xtype: 'grid',
				cls: 'team-report-grid velociy-grid rally-grid',
				title: "Velocity",
				viewConfig: {
					stripeRows: true,
					preserveScrollOnRefresh:true
				},
				plugins: ['intelcellediting'],
				listeners: {
					beforeedit: function(editor, e){
						me.isEditingVelocity = true;
						return true;
					},
					canceledit: function(){ me.isEditingVelocity = false; },
					edit: function(editor, e){
						var grid = e.grid,
							velocityRecord = e.record,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value.length===0 || isNaN(value) || (value*1<0) || (value*1 === originalValue*1)) { 
							velocityRecord.set('PlannedVelocity', originalValue);
							me.isEditingVelocity = false; 
							return; 
						}
						value = value*1 || 0; //value*1 || null to remove the 0's from teams
						var iterationName = velocityRecord.data.Name,
							iteration = me.IterationStore.findExactRecord('Name', iterationName); //we don't need the most recent iteration here
						iteration.set('PlannedVelocity', value);
						me.VelocityGrid.setLoading("Saving");
						me.enqueue(function(unlockFunc){
							iteration.save({ 
								callback: function(record, operation, success){
									if(!success){
										me.alert('ERROR', 'Could not modify Iteration');
										velocityRecord.set('PlannedVelocity', originalValue);
									} 
									else velocityRecord.set('PlannedVelocity', value);
									me.isEditingVelocity = false;
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
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: velocityColumns
				},
				store: velocityStore
			});
			me.VelocityTotalsGrid = me.down('#tcVelBoxRight').add({
				xtype: 'grid',
				cls: 'team-report-grid velociy-grid rally-grid',
				showPagingToolbar: false,
				showRowActionsColumn:false,
				hideHeaders:true,
				disableSelection: true,
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				enableEditing:false,
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: velocityTotalColumns
				},
				store: Ext.create('Ext.data.Store', {
					model:'IntelVelocity',
					data: [{Name:'', PlannedVelocity:0, RealVelocity:0}]
				})
			});
		},
		renderSTDNCIGrid: function() {
			var me = this;
			
			var stdnciColumns = [{	
				flex: 1,
				renderer:function(name, meta, velocityRecord){ return 'STDN/CI'; }
			},{
				width:80,
				renderer:function(val, meta){
					var percent = me.STDNCIData.percent;
					var stdnci = me.STDNCIData.stdnciPoints;
					var total = me.STDNCIData.totalPoints;
					if(percent < 5){ meta.tdCls += ' stdnci-grid-error-cell'; }
					else if(percent < 10){ meta.tdCls += ' stdnci-grid-warning-cell'; }
					else { meta.tdCls += ' stdnci-grid-success-cell'; }
					return '<span title="' + stdnci + '/' + total + ' points">' + percent + '%</span>';
				}
			}];
			
			me.STDNCIGrid = me.down('#tcVelBoxRight').add({
				xtype: 'grid',
				cls: 'team-report-grid stdnci-grid rally-grid',
				showPagingToolbar: false,
				showRowActionsColumn:false,
				hideHeaders:true,
				disableSelection: true,
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				enableEditing:false,
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: stdnciColumns
				},
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],
					data: [{Name:''}]
				})
			});
		},
		renderMiniDataIntegrityGrid: function(){
			var me=this,
				columns = [{
					dataIndex:'title',
					flex:1,
					renderer:function(val, meta){ 
						meta.tdCls += ' mini-data-integrity-name-cell';
						if(val == 'Unsized Stories') meta.tdCls += ' green-bg-cell';
						if(val == 'Improperly Sized Stories') meta.tdCls += ' aqua-bg-cell';
						if(val == 'Stories in Release without Iteration') meta.tdCls += ' silver-bg-cell';
						if(val == 'Stories in Iteration not attached to Release') meta.tdCls += ' teal-bg-cell';
						if(val == 'Stories Scheduled After ' + me.PortfolioItemTypes[0] + ' End Date') meta.tdCls += ' yellow-bg-cell';
						return val; 
					}
				},{
					dataIndex:'userStories',
					width:30,
					renderer:function(val, meta){ 
						meta.tdCls += 'mini-data-integrity-num-cell';
						if(val.length === 0) meta.tdCls += ' mini-data-integrity-green-cell';
						else meta.tdCls += ' mini-data-integrity-red-cell';
						return val.length; 
					}
				}];
			
			me.DataIntegrityGrid = me.down('#tcVelBoxRight').add({
				xtype: 'grid',
				cls: 'team-report-grid mini-data-integrity-grid rally-grid',
				header: {
					items: [{
						xtype:'container',
						html: me.VerticalDataIntegrityDashboardObjectID ? 
							('<a class="mini-data-integrity-header" href="' + me.BaseUrl + '/#/' + me.ProjectRecord.data.ObjectID + 
								'ud/custom/' + me.VerticalDataIntegrityDashboardObjectID + '" target="_blank">DATA INTEGRITY</a>') :
							'<span class="mini-data-integrity-header">DATA INTEGRITY</a>'
					}]
				},
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				columns: {
					defaults: {
						text:'',
						resizable: false,
						draggable: false,
						sortable: false,
						editor: false,
						menuDisabled: true,
						renderer: function(val){ return val || '-'; }
					},
					items: columns
				},
				store: Ext.create('Ext.data.Store', {
					fields:[
						{name: 'title', type: 'string'},
						{name: 'userStories', type: 'auto'}
					],
					data: me.getMiniDataIntegrityStoreData()
				}),
				enableEditing:false,
				showPagingToolbar: false,
				showRowActionsColumn:false,
				hideHeaders:true,
				disableSelection: true
			});
		},
		renderRisksGrid: function(){
			this.RisksGrid = this.add({
				xtype: 'intelriskgrid',
				id: 'risk-grid',
				height:360,
				releaseRecord: this.ReleaseRecord,
				scrumGroupRootRecord: this.ScrumGroupRootRecord,
				projectRecords: [this.ProjectRecord],
				portfolioItemRecords: this.PortfolioItemStore.getRange(),
				risks: this.Risks,
				visibleColumns: [
					'PortfolioItemFormattedID',
					'PortfolioItemName',
					'Description',
					'Impact',
					'MitigationPlan',
					'Status',
					'RiskLevel',
					'Checkpoint',
					'Owner',
					'UndoButton',
					'SaveButton',
					'CopyButton',
					'DeleteButton'
				],
				_getNewRow: function(){
					var grid = this;
					return Ext.create(RiskModel, {
						RiskID: grid._generateRiskID(),
						ReleaseName: grid.releaseRecord.data.Name,
						PortfolioItemObjectID: 0,
						ProjectObjectID: grid.projectRecords.length === 1 ? grid.projectRecords[0].data.ObjectID : 0,
						Description: '',
						Impact: '',
						MitigationPlan: '',
						RiskLevel: 'Low', //override
						Status: '',
						OwnerObjectID: 0,
						SubmitterObjectID: Rally.environment.getContext().getUser().ObjectID,
						Checkpoint: 0
					});
				}
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
				model:'IntelPredecessorDependency',
				limit:Infinity,
				disableMetaChangeEvent: true,
				proxy: {
					type:'intelsessionstorage',
					id:'IntelPredecessorDependencyProxy' + Math.random()
				},
				sorters:[dependencySorter],
				intelUpdate: function(){ 
					var predecessorStore = this, 
						realPredecessorsData = me.DependenciesParsedData.Predecessors.slice(); 
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
							predecessorRecord.set('PredecessorItems', [me.newPredecessorItem()]); 
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
			var predecessorColumns = [{
				text:'#', 
				dataIndex:'UserStoryFormattedID',
				width:90,
				sortable:true,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: me.UserStoryFIDStore,
					displayField: 'FormattedID'
				},
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:1,		
				sortable:true,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
					displayField: 'Name'
				},
				items:[{ xtype:'intelgridcolumnfilter' }]	
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				tdCls: 'intel-editor-cell',
				editor: 'inteltextarea'
			},{
				text:'Needed By',			
				dataIndex:'NeededBy',
				width:90,
				tdCls: 'intel-editor-cell',		
				editor:{
					xtype:'intelfixedcombo',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Workweek', 'DateVal'],
						data: me.WorkweekData
					}),
					displayField: 'Workweek',
					valueField: 'DateVal'
				},
				renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');},
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : undefined; }
				}]
			},{
				width:24,
				renderer: function(value, meta, predecessorRecord){
					var id = Ext.id(), dependencyID = predecessorRecord.data.DependencyID;
					meta.tdAttr = 'title="Add Team"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							if(me.PrececessorItemStores[dependencyID]) {
								var predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
									newItem = me.newPredecessorItem();
								me.PrececessorItemStores[dependencyID].insert(0, [Ext.create('IntelPredecessorItem', newItem)]);
								predecessorRecord.set('PredecessorItems', predecessorRecord.data.PredecessorItems.concat([newItem]));
								predecessorRecord.set('Edited', true);	
							}
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-plus"></i></div>';
				}
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
						renderer: function(value, meta, predecessorItemRecord){
							var id = Ext.id();
							meta.tdAttr = 'title="Delete Team"';
							setTimeout(function whenRendered(){
								var el = Ext.get(id);
								if(el) el.on('click', function(){
									var predecessorRecord = predecessorStore.getAt(predecessorStore.findExact('DependencyID', dependencyID)),
										realPredecessorItems = predecessorRecord.data.PredecessorItems.slice(),
										predecessorItemStore = me.PrececessorItemStores[dependencyID];	
										
									predecessorItemStore.suspendEvents(true);
									realPredecessorItems = _.filter(realPredecessorItems, function(realPredecessorItem){
										return realPredecessorItem.PredecessorItemID !== predecessorItemRecord.data.PredecessorItemID;
									});
									predecessorItemStore.remove(predecessorItemRecord);							
									if(!realPredecessorItems.length){
										var newItem = me.newPredecessorItem();
										predecessorItemStore.add(Ext.create('IntelPredecessorItem', newItem));
										realPredecessorItems.push(newItem);
									}
									predecessorRecord.set('Edited', true);
									predecessorRecord.set('PredecessorItems', realPredecessorItems);
									predecessorItemStore.resumeEvents();
								});
								else setTimeout(whenRendered, 10);
							}, 20);
							return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-minus"></i></div>';
						}
					}];
					
					return {
						xtype: 'grid',
						cls:'team-report-grid predecessor-items-grid rally-grid',
						plugins: [ 'intelcellediting' ],
						viewConfig: { 
							xtype: 'inteltableview',
							stripeRows:false
						},
						width:450,
						manageHeight:false,
						columns: {
							defaults: COLUMN_DEFAULTS,
							items: predecessorItemColumnCfgs
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
							beforeedit: function(editor, e){ if(!!e.value) return false; },
							edit: function(editor, e){			
								var predecessorItemRecord = e.record,
									field = e.field,
									value = e.value,
									originalValue = e.originalValue,
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
											me.alert('ERROR', value + ' already included in this dependency');
											predecessorItemRecord.set('PredecessorProjectObjectID', originalValue);
											return;
										}
										if(projectRecord.data.ObjectID === me.ProjectRecord.data.ObjectID){
											me.alert('ERROR', 'You cannot depend on yourself');
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
						enableEditing:false,
						store: me.PrececessorItemStores[dependencyID]
					};
				}
			},{
				dataIndex:'Edited',
				width:24,
				renderer: function(value, meta, predecessorRecord){
					var id = Ext.id(),
						dependencyID = predecessorRecord.data.DependencyID,
						realPredecessorData = me.spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Predecessors.slice()),
						dirtyType = me.getDirtyType(predecessorRecord, realPredecessorData);
					if(dirtyType !== 'Edited') return '';
					meta.tdAttr = 'title="Undo"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){ 
							var realPredecessorData = me.spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Predecessors.slice());
							predecessorRecord.beginEdit();
							_.each(realPredecessorData, function(value, field){
								if(field === 'PredecessorItems') predecessorRecord.set(field, value || [me.newPredecessorItem()]);
								else predecessorRecord.set(field, value);
							});
							predecessorRecord.endEdit();
							me.PrececessorItemStores[dependencyID].intelUpdate();
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				dataIndex:'Edited',
				width:24,
				renderer: function(value, meta, predecessorRecord){
					var id = Ext.id(), 
						dependencyID = predecessorRecord.data.DependencyID,
						realPredecessorData = me.spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Predecessors.slice()),
						dirtyType = me.getDirtyType(predecessorRecord, realPredecessorData);
					if(dirtyType != 'New' && dirtyType != 'Edited') return;
					meta.tdAttr = 'title="Save Dependency"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							//validate fields first
							if(!predecessorRecord.data.UserStoryFormattedID || !predecessorRecord.data.UserStoryName){
								me.alert('ERROR', 'A UserStory is not selected'); return; }
							if(!predecessorRecord.data.Description){
								me.alert('ERROR', 'The description is empty'); return; }
							if(!predecessorRecord.data.NeededBy){
								me.alert('ERROR', 'Select When the dependency is needed by'); return; }
							var predecessorItems = predecessorRecord.data.PredecessorItems;
							if(!predecessorItems.length){
								me.alert('ERROR', 'You must specify a team you depend on'); return; }
							if(_.find(predecessorItems, function(p){ return !p.PredecessorProjectObjectID; })){
								me.alert('ERROR', 'All Team Names must be valid'); return; }
							
							me.PredecessorGrid.setLoading("Saving Dependency");						
							me.enqueue(function(unlockFunc){
								var localPredecessorData = Ext.clone(predecessorRecord.data);
								/** NOTE ON ERROR HANDLING: we do NOT proceed at all if permissions are insufficient to edit a project, 
										or a project has no user stories to attach to. We first edit all the successors fields and collections 
										for the teams we depend upon, and then we edit the predecessor field on THIS user story.
										If a collection sync fails, it retries 4 times, and then it gives up. */
								me.getOldAndNewUserStoryRecords(localPredecessorData, me.UserStoriesInRelease).then(function(records){
									var oldUserStoryRecord = records[0], 
										newUserStoryRecord = records[1],
										realPredecessorData = me.getRealDependencyData(oldUserStoryRecord, localPredecessorData.DependencyID, 'Predecessors'),
										predecessorItemsArrays = me.getPredecessorItemArrays(localPredecessorData, realPredecessorData);
										
									/** checking and setting this here because the successors NEED the objectID of this userStory */
									if(!newUserStoryRecord){
										return Q.reject('User Story ' + localPredecessorData.UserStoryFormattedID + ' does not exist');
									}
									localPredecessorData.UserStoryObjectID = newUserStoryRecord.data.ObjectID;
									
									return me.getAddedPredecessorItemCallbacks(
										predecessorItemsArrays.added, 
										localPredecessorData,
										me.ProjectRecord,
										me.ProjectsWithTeamMembers,
										me.ProjectRecord,
										me.DependenciesParsedData)
									.then(function(addedCallbacks){	
										return me.getUpdatedPredecessorItemCallbacks(
												predecessorItemsArrays.updated, 
												localPredecessorData,
												me.ProjectRecord,
												me.ProjectsWithTeamMembers,
												me.ProjectRecord,
												me.DependenciesParsedData).then(function(updatedCallbacks){
											return me.getRemovedPredecessorItemCallbacks(
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
														return me.removePredecessor(oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
													});
												}
												return promise
													.then(function(){ 
														return me.addPredecessor(newUserStoryRecord, localPredecessorData, me.ProjectRecord, me.DependenciesParsedData); 
													})
													.then(function(){ 
														predecessorRecord.set('Edited', false);
													})
													.fail(function(reason){ me.alert('ERROR', reason); })
													.then(function(){	predecessorRecord.endEdit(); });
											});
										});
									});
								})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){
									unlockFunc();
									me.PredecessorGrid.setLoading(false);
								})
								.done();
							}, 'Queue-Main');
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			},{
				width:24,
				renderer: function(value, meta, predecessorRecord){
					var id = Ext.id();
					meta.tdAttr = 'title="Delete Dependency"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							me.confirm('Confirm', 'Delete Dependency?', function(msg){
								if(msg.toLowerCase() !== 'yes') return;		
								me.PredecessorGrid.setLoading("Deleting Dependency");							
								me.enqueue(function(unlockFunc){
									var localPredecessorData = predecessorRecord.data;
									me.getOldAndNewUserStoryRecords(localPredecessorData, me.UserStoriesInRelease).then(function(records){
										var oldUserStoryRecord = records[0],
											realPredecessorData = me.getRealDependencyData(oldUserStoryRecord, localPredecessorData.DependencyID, 'Predecessors'),
											predecessorItemsArrays = me.getPredecessorItemArrays(localPredecessorData, realPredecessorData), 
											itemsToRemove = predecessorItemsArrays.removed.concat(predecessorItemsArrays.updated);
										return me.getRemovedPredecessorItemCallbacks(
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
													return me.removePredecessor(oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
												});
											}
										});
									})
									.then(function(){ predecessorStore.remove(predecessorRecord); })
									.fail(function(reason){ me.alert('ERROR', reason); })
									.then(function(){
										unlockFunc();
										me.PredecessorGrid.setLoading(false);
									})
									.done();
								}, 'Queue-Main');
							});
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-trash"></i></div>';
				}
			}];
			me.PredecessorGrid = me.add({
				xtype: 'grid',
				cls: 'team-report-grid predecessor-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'team-report-grid-header-text',
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
							cls: 'intel-button add-new-button',
							listeners:{
								click: function(){
									if(!me.UserStoriesInRelease.length) me.alert('ERROR', 'No User Stories for this Release!');
									else if(me.PredecessorGrid.store) {
										var model = Ext.create('IntelPredecessorDependency', {
											DependencyID: 'DP' + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
											UserStoryObjectID:'',
											UserStoryFormattedID: '',
											UserStoryName: '',
											Description: '',
											NeededBy: '',
											Status: '',
											PredecessorItems:[me.newPredecessorItem()],
											Edited:true
										});
										
										_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', me.PredecessorGrid), 'clearFilters');
										me.PredecessorGrid.store.insert(0, [model]);	
										me.PredecessorGrid.view.getEl().setScrollTop(0);
										me.PredecessorGrid.store.fireEvent('refresh', me.PredecessorGrid.store);
									}
								}
							}
						},{
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
						/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
							to improve performance.**/			
						var predecessorRecord = e.record,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value === originalValue) return; 
						else if(!value) { predecessorRecord.set(field, originalValue); return; }
						if(field === 'Description') {
							value = me.htmlEscape(value);			
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
					}
				},
				disableSelection: true,
				enableEditing:false,
				store: predecessorStore
			});	
		
		/**************************************************** SUCCESSORS STUFF *******************************************************************/	
			var successorStore = Ext.create('Intel.lib.component.Store', {
				data: Ext.clone(me.DependenciesParsedData.Successors),
				autoSync:true,
				model:'IntelSuccessorDependency',
				proxy: {
					type: 'intelsessionstorage',
					id:'IntelSuccessorProxy' + Math.random()
				},
				limit:Infinity,
				disableMetaChangeEvent: true,
				sorters:[dependencySorter],
				intelUpdate: function(){
					var realSuccessorsData = me.DependenciesParsedData.Successors.slice(),
						remoteChanged = false; //if someone else updated this while it was idle on our screen
					successorStore.suspendEvents(true);
					_.each(successorStore.getRange(), function(successorRecord){
						var realSuccessorData = me.spliceDependencyFromList(successorRecord.data.DependencyID, realSuccessorsData),
							dirtyType = me.getDirtyType(successorRecord, realSuccessorData);
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
			var successorColumns = [{
				text:'Requested By',
				dataIndex:'SuccessorProjectObjectID',
				width:160,
				sortable:true,
				renderer: function(projectOID){ return me.ProjectsWithTeamMembers[projectOID].data.Name; },
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(oid){return me.ProjectsWithTeamMembers[oid].data.Name; }
				}]
			},{
				text:'Req #',
				dataIndex:'SuccessorUserStoryObjectID',
				width:90,
				sortable:true,
				renderer: function(userStoryObjectID){
					var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
					if(userStory){
						return '<a href="' + me.BaseUrl + '/#/' + userStory.data.Project.ObjectID + 'ud/detail/userstory/' + 
							userStory.data.ObjectID + '" target="_blank">' + userStory.data.FormattedID + '</a>';
					} else return '?';
				},
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(oid){
						var userStory = me.DependenciesHydratedUserStories[oid];
						return userStory ? userStory.data.FormattedID : undefined;
					}
				}]
			},{
				text:'Req UserStory',
				dataIndex:'SuccessorUserStoryObjectID',
				flex:1,
				sortable:true,
				renderer: function(userStoryObjectID){
					var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
					if(userStory) return userStory.data.Name;
					else return '?';
				},
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(oid){
						var userStory = me.DependenciesHydratedUserStories[oid];
						return userStory ? userStory.data.Name : undefined;
					}
				}]
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1
			},{
				text:'Needed By',
				dataIndex:'NeededBy',
				width:80,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');},
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : undefined; }
				}]
			},{
				text:'Supported',					
				dataIndex:'Supported',
				width:90,
				sortable:true,
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
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				text:'Sup #', 
				dataIndex:'UserStoryFormattedID',
				width:90,
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
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				text:'Sup UserStory', 
				dataIndex:'UserStoryName',
				flex:1,
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
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				dataIndex:'Edited',
				width:24,
				renderer: function(value, meta, successorRecord){		
					var id = Ext.id();
					if(!successorRecord.data.UserStoryFormattedID) return '';
					meta.tdAttr = 'title="Remove User Story"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							successorRecord.beginEdit(true);
							successorRecord.set('Edited', true);
							successorRecord.set('Assigned', false);
							successorRecord.set('UserStoryFormattedID', '');
							successorRecord.set('UserStoryName', '');
							successorRecord.endEdit();
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-minus"></i></div>';
				}
			},{
				dataIndex:'Edited',
				width:24,
				renderer: function(value, meta, successorRecord){	
					var id = Ext.id(), 
						dependencyID = successorRecord.data.DependencyID,
						realSuccessorData = me.spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Successors.slice()),
						dirtyType = me.getDirtyType(successorRecord, realSuccessorData);
					if(dirtyType !== 'Edited') return;
					meta.tdAttr = 'title="Undo"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							var realSuccessorData = me.spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Successors.slice());	
							successorRecord.beginEdit(true);
							_.each(realSuccessorData, function(value, field){ successorRecord.set(field, value); });
							successorRecord.endEdit();
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				dataIndex:'Edited',
				width:24,
				renderer: function(value, meta, successorRecord){
					var id = Ext.id(), 
						dependencyID = successorRecord.data.DependencyID,
						realSuccessorData = me.spliceDependencyFromList(dependencyID, me.DependenciesParsedData.Successors.slice()),
						dirtyType = me.getDirtyType(successorRecord, realSuccessorData);
					if(dirtyType != 'Edited') return;
					meta.tdAttr = 'title="Save Dependency"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							if(!successorRecord.data.Supported){
								me.alert('ERROR', 'You must set the Supported field.'); return; }
							me.SuccessorGrid.setLoading("Saving Dependency");						
							me.enqueue(function(unlockFunc){
								var successorData = successorRecord.data, 
									oldUserStoryRecord, 
									newUserStoryRecord,
									realSuccessorData;
								me.getOldAndNewUserStoryRecords(successorData, me.UserStoryStore.getRange()).then(function(records){
									oldUserStoryRecord = records[0];
									newUserStoryRecord = records[1];
									
									realSuccessorData = me.getRealDependencyData(oldUserStoryRecord, successorData.DependencyID, 'Successors');
									if(!realSuccessorData) return Q.reject({SuccessorDeletedDependency:true, message:'Successor removed this dependency'});
									
									successorData.UserStoryObjectID = newUserStoryRecord.data.ObjectID;	
									successorData.SuccessorUserStoryObjectID = realSuccessorData.SuccessorUserStoryObjectID;
									
									return me.updateSuccessor(
											newUserStoryRecord, 
											successorData, 
											me.ProjectRecord,
											me.ProjectsWithTeamMembers, 
											me.ProjectRecord, 
											me.DependenciesParsedData)
									.then(function(){							
										if(oldUserStoryRecord.data.ObjectID !== newUserStoryRecord.data.ObjectID)
											return me.removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData);
									})
									.then(function(){ return me.addSuccessor(newUserStoryRecord, successorData, me.ProjectRecord, me.DependenciesParsedData); })
									.then(function(){ successorRecord.set('Edited', false); });
								})
								.fail(function(reason){
									if(reason.SuccessorDeletedDependency){
										me.alert('ERROR', reason.message + '. Deleting this dependency now');
										if(realSuccessorData){
											me.removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData)
												.then(function(){ successorStore.remove(successorRecord); })
												.fail(function(reason){ me.alert('ERROR', reason); })
												.done();
										}
										else successorStore.remove(successorRecord);
									}
									else me.alert('ERROR', reason);
								})
								.then(function(){
									unlockFunc();
									me.SuccessorGrid.setLoading(false);
								})
								.done();
							}, 'Queue-Main');
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			}];
			me.SuccessorGrid = me.add({
				xtype: 'grid',
				cls: 'team-report-grid successor-grid rally-grid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'team-report-grid-header-text',
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
							cls:'intel-button',
							width:110,
							listeners:{ 
								click: function(){ 
									_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', me.SuccessorGrid), 'clearFilters'); 
									me.SuccessorGrid.store.fireEvent('refresh', me.SuccessorGrid.store);
								}
							}
						}]
					}]
				},
				height:400,
				scroll:'vertical',
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: successorColumns
				},
				plugins: [ 'intelcellediting' ],
				viewConfig:{
					xtype:'inteltableview',
					preserveScrollOnRefresh:true
				},
				listeners: {
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
					}
				},
				disableSelection: true,
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: successorStore
			});	
		}	
	});
}());
