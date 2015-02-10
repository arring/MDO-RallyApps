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
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			padding:'0 10px 0 10px',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			height:45,
			id:'navbox',
			items:[{
				xtype:'container',
				flex:3,
				id:'navbox_left',
				layout: {
					type:'hbox'
				}
			},{
				xtype:'container',
				flex:2,
				id:'navbox_right',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		},{
			xtype:'container',
			padding:'0 10px 0 10px',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			id:'tc_vel_box',
			items: [{
				xtype:'container',
				flex:2,
				id: 'tc_vel_box_left'
			},{
				xtype:'container',
				flex:1,
				id: 'tc_vel_box_right'
			}]
		}],
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */
		
		_userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/
		_loadPortfolioItems: function(){ 
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return me._loadPortfolioItemsOfType(me.TrainPortfolioProject, type)
					.then(function(portfolioStore){
						return {
							ordinal: ordinal,
							store: portfolioStore
						};
					});
				}))
				.then(function(items){
					var orderedPortfolioItemStores = _.sortBy(items, function(item){ return item.ordinal; });
					me.PortfolioItemStore = orderedPortfolioItemStores[0];
					me.PortfolioItemMap = {};
					_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItem){
						var ordinal = 0, parentPortfolioItem = lowPortfolioItem;
						while(ordinal < orderedPortfolioItemStores.length && parentPortfolioItem){
							var parentStore = orderedPortfolioItemStores[ordinal];
							parentPortfolioItem = parentStore.findExactRecord('ObjectID', parentPortfolioItem.data.Parent.ObjectID);
							++ordinal;
						}
						if(ordinal === orderedPortfolioItemStores.length && parentPortfolioItem)
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
					fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project"],
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
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
							'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', 'PortfolioItem'].join(','),
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
					value: me.CurrentScrum.data.ObjectID 
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
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'StartDate', 'EndDate', 'Iteration', 
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
				me._TeamCommitsCountHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore, function(sum, userStory){
					return sum + (userStory.data.PortfolioItem && userStory.data.PortfolioItem.ObjectID == portfolioItemObjectID)*1;
				}, 0);
			}
			return me._TeamCommitsCountHash[portfolioItemObjectID];
		},
		_getStoriesEstimate: function(portfolioItemObjectID){	
			var me=this;
			me._TeamCommitsEstimateHash = me._TeamCommitsEstimateHash || {};
			if(typeof me._TeamCommitsEstimateHash[portfolioItemObjectID] === 'undefined'){
				me._TeamCommitsEstimateHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore, function(sum, userStory){
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
				totalUserStories = me.UserStoryStore().getRange().concat(me.ExtraSanityUserStoriesStore.getRange());
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
					return new Date(item.data.Iteration.StartDate) < releaseDate && 
						new Date(item.data.Iteration.EndDate) > releaseStartDate;
				})
			},{
				title: 'Stories with End Date past ' + lowestPortfolioItemType + ' End Date',
				userStories: _.filter(totalUserStories,function(item){
					if(!item.data.Release || item.data.Release.Name != releaseName) return false;
					if(!item.data.Iteration || !item.data[lowestPortfolioItemType]) return false;
					return new Date(item.data[lowestPortfolioItemType].PlannedEndDate) < new Date(item.data.Iteration.EndDate);
				})
			}];
		},

		/**___________________________________ RISKS STUFF ___________________________________**/
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
		_getRisks: function(portfolioItemRecord){
			var risks = portfolioItemRecord.data.c_Risks;
			try{ risks = JSON.parse(atob(risks)) || {}; } //b64 decode risks
			catch(e) { risks = {}; }
			return risks;
		},	
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
						Edited: false //not in pending edit mode
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
			me.RisksParsedData = array;
		},		
		_spliceRiskFromList: function(riskID, riskList){ 
			/** removes and returns risk with riskID from the riskList (NOT list of records) */
			for(var i = 0; i<riskList.length; ++i){
				if(riskList[i].RiskID == riskID) {
					return riskList.splice(i, 1)[0];
				}
			}
		},	
		_removeRisk: function(portfolioItemRecord, riskData){ 
			var me=this,
				risks = me._getRisks(portfolioItemRecord),
				projectOID = me.ProjectRecord.data.ObjectID,
				deferred = Q.defer();
				
			if(risks[projectOID]){
				delete risks[projectOID][riskData.RiskID];
				
				me.RisksParsedData = _.reject(me.RisksParsedData, function(cachedRisk){ //remove it from cached risks
					return cachedRisk.RiskID === riskData.RiskID && cachedRisk.PortfolioItemObjectID === riskData.PortfolioItemObjectID;
				});
				
				var risksString = btoa(JSON.stringify(risks, null, '\t')); //b64 encode 
				if(risksString.length >= RALLY_MAX_STRING_SIZE) 
					deferred.reject('Risks field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
				else {
					portfolioItemRecord.set('c_Risks', risksString);
					portfolioItemRecord.save({
						callback:function(record, operation, success){
							if(!success) 
								deferred.reject('Failed to modify ' + me.PortfolioItemTypes[0] + ': ' + portfolioItemRecord.data.FormattedID);
							else deferred.resolve();
						}
					});
				}
			} 
			else deferred.resolve();
			
			return deferred.promise;
		},	
		_addRisk: function(portfolioItemRecord, riskData){
			var me=this,
				risks = me._getRisks(portfolioItemRecord),
				projectOID = me.ProjectRecord.data.ObjectID,
				deferred = Q.defer();

			riskData = Ext.clone(riskData);
			riskData.Edited = false;
			
			if(!risks[projectOID]) risks[projectOID] = {};
			risks[projectOID][riskData.RiskID] = {
				Checkpoint: riskData.Checkpoint,
				Description: riskData.Description,
				Impact: riskData.Impact,
				MitigationPlan: riskData.MitigationPlan,
				Urgency: riskData.Urgency,
				Status: riskData.Status,
				Contact: riskData.Contact
			};
			
			me.RisksParsedData = _.filter(me.RisksParsedData, function(cachedRisk){ /** update cache */
				return !(cachedRisk.RiskID === riskData.RiskID && cachedRisk.PortfolioItemObjectID === riskData.PortfolioItemObjectID); 
			});
			me.RisksParsedData.push(riskData);
			
			var risksString = btoa(JSON.stringify(risks, null, '\t'));
			if(risksString.length >= RALLY_MAX_STRING_SIZE)
				deferred.reject('Risks field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				portfolioItemRecord.set('c_Risks', risksString);
				portfolioItemRecord.save({
					callback:function(record, operation, success){
						if(!success) 
							deferred.reject('Failed to modify ' + me.PortfolioItemTypes[0] + ': ' + portfolioItemRecord.data.FormattedID);
						else deferred.resolve();
					}
				});
			}
			
			return deferred.promise;
		},
		
		/**___________________________________ DEPENDENCIES STUFF ___________________________________**/	
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
		_isInRelease: function(usr){ 
			/** some user stories are not themselves in releases **/
			return (usr.data.Release && usr.data.Release.Name === this.ReleaseRecord.data.Name) || 
				(!usr.data.Release && usr.data.PortfolioItem && 
					usr.data.PortfolioItem.Release && usr.data.PortfolioItem.Release.Name === this.ReleaseRecord.data.Name);
		},	
		_getDependencies: function(userStoryRecord){
			var dependencies, dependencyString = userStoryRecord.data.c_Dependencies;
			if(dependencyString === '') dependencies = { Predecessors:{}, Successors:{} };
			else {
				try{ dependencies = JSON.parse(atob(dependencyString)); }
				catch(e) { dependencies = { Predecessors:{}, Successors:{} }; }
			}		
			return dependencies;
		},	
		_parseDependenciesFromUserStory: function(userStoryRecord){
			var dependencies = this._getDependencies(userStoryRecord), 
				inputPredecessors = dependencies.Predecessors, 
				inputSuccessors = dependencies.Successors,
				outputPredecessors = [], 
				outputSuccessors = [],
				startDate =	new Date(this.ReleaseRecord.data.ReleaseStartDate),
				endDate =	new Date(this.ReleaseRecord.data.ReleaseDate),
				UserStoryObjectID = userStoryRecord.data.ObjectID,
				UserStoryFormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name;
				
			if(this._isInRelease(userStoryRecord)){
				for(var predDepID in inputPredecessors){
					var predDep = inputPredecessors[predDepID];
					outputPredecessors.push({
						DependencyID: predDepID,
						UserStoryObjectID: UserStoryObjectID,
						UserStoryFormattedID: UserStoryFormattedID,
						UserStoryName: UserStoryName,
						Description: predDep.Description,
						NeededBy: predDep.NeededBy,
						Status: predDep.Status,
						PredecessorItems: predDep.PredecessorItems || [], 
						Edited: false //not in pending edit mode
					});
				}
			}
			for(var succDepID in inputSuccessors){
				var succDep = inputSuccessors[succDepID];
				if(succDep.Assigned){ //if this was just placed on a random user story, or is assigned to this user story
					UserStoryFormattedID = userStoryRecord.data.FormattedID;
					UserStoryName = userStoryRecord.data.Name;
				} 
				else UserStoryFormattedID = UserStoryName = '';
						
				outputSuccessors.push({
					DependencyID: succDepID,
					SuccessorUserStoryObjectID: succDep.SuccessorUserStoryObjectID,
					SuccessorProjectObjectID: succDep.SuccessorProjectObjectID,
					UserStoryObjectID: UserStoryObjectID,
					UserStoryFormattedID: UserStoryFormattedID,
					UserStoryName: UserStoryName,
					Description: succDep.Description,
					NeededBy: succDep.NeededBy,
					Supported: succDep.Supported,
					Assigned: succDep.Assigned,
					Edited: false //not in pending edit mode
				});
			}
			return {Predecessors:outputPredecessors, Successors:outputSuccessors};
		},
		_parseDependenciesData: function(){	
			var me=this, 
				predecessors = [], 
				successors = [],
				allUserStories = me.UserStoryStore.getRecords();				
			me.UserStoriesInRelease = _.filter(allUserStories, function(userStoryRecord){ return me._isInRelease(userStoryRecord); });

			_.each(me.UserStoriesInRelease, function(userStoryRecord){
				var dependenciesData = me._parseDependenciesFromUserStory(userStoryRecord);
				predecessors = predecessors.concat(dependenciesData.Predecessors);
				successors = successors.concat(dependenciesData.Successors);
			});
			me.DependenciesParsedData = {Predecessors:predecessors, Successors:successors};
		},		
		_newPredecessorItem: function(){
			return {
				PredecessorItemID: 'PI' + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
				PredecessorUserStoryObjectID:'',
				PredecessorProjectObjectID: '',
				Supported:'Undefined',
				Assigned:false
			};
		},
		_spliceDepFromList: function(dependencyID, dependencyList){ 
			for(var i = 0; i<dependencyList.length; ++i){
				if(dependencyList[i].DependencyID == dependencyID) {
					return dependencyList.splice(i, 1)[0];
				}
			}
		},
		_hydrateDependencyUserStories: function(){
			var me=this, storyOIDsToHydrate = [];
			me.DependenciesHydratedUserStories = {};
			
			_.each(me.DependenciesParsedData.Predecessors, function(predecessor){
				_.each(predecessor.PredecessorItems, function(item){
					storyOIDsToHydrate.push(item.PredecessorUserStoryObjectID);
				});
			});
			_.each(me.DependenciesParsedData.Successors, function(successor){
				storyOIDsToHydrate.push(successor.SuccessorUserStoryObjectID);
			});
			
			return Q.all(_.map(storyOIDsToHydrate, function(storyOID){
				return me._loadUserStory(storyOID).then(function(userStory){
					if(userStory) me.DependenciesHydratedUserStories[storyOID] = userStory;
				});
			}));
		},
		
		_syncCollection: function(userStoryRecord, depsToAdd, depsToRemove, collectionType){
			var me=this,
				syncDeferred = Q.defer();
				
			userStoryRecord.getCollection(collectionType).load({ // update the collection before saving user story
				fetch:['ObjectID'],
				callback: function(){
					var promises = [],
						syncCollectionProxy = false
						collectionStore = this,
						collectionRecords = collectionStore.getRange();
					_.each(depsToAdd, function(userStoryObjectID){
						if(!_.find(collectionRecords, function(cr){ return cr.data.ObjectID === userStoryObjectID; })){
							promises.push(me._loadUserStory(userStoryObjectID).then(function(us){
								if(us){ 
									syncCollectionProxy = true; 
									collectionStore.add(us); 
								}
							}));
						}
					});
					_.each(depsToRemove, function(userStoryObjectID){
						var realDep = _.find(collectionRecords, function(cr) { return cr.data.ObjectID === userStoryObjectID; });
						if(realDep) { 
							collectionStore.remove(realDep); 
							syncCollectionProxy = true;
						}
					});
					
					//attempt to sync collection until it passes, 5 == max attempts
					var attempts = 0;
					Q.all(promises)
						.then(function retrySync(){
							if(++attempts > 5){
								me._alert("INFO:", "Failed to modify " + collectionType + " field on " + userStoryRecord.data.FormattedID);
								syncDeferred.resolve();		
							}
							else if(syncCollectionProxy) {
								collectionStore.sync({ 
									failure:function(){ retrySync(); },
									success:function(){ syncDeferred.resolve(); }
								});
							}
							else syncDeferred.resolve();
						})
						.fail(function(reason){ syncDeferred.reject(reason); })
						.done();
				}
			});	
			return syncDeferred.promise;
		},	
		_collectionSynced: function(userStoryRecord, dependencies){
			var me=this, 
				dependenciesString = btoa(JSON.stringify(dependencies, null, '\t')),
				deferred = Q.defer();
			if(dependenciesString.length >= RALLY_MAX_STRING_SIZE) 
				deferred.reject('Dependencies field for ' + userStoryRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				userStoryRecord.set('c_Dependencies', dependenciesString);
				//attempt to save until it passes, 5 == max attempts
				var attempts = 0;
				(function retrySync(){
					if(++attempts > 5) deferred.reject('Failed to modify User Story ' + userStoryRecord.data.FormattedID);
					else {
						userStoryRecord.save({
							callback:function(record, operation, success){
								if(!success) retrySync();
								else deferred.resolve();
							}
						});
					}
				}());
			}
			return deferred.promise;
		},	
		_removePredecessor: function(userStoryRecord, predecessorData){
			var me=this, dependencies = me._getDependencies(userStoryRecord),
				cachedPredecessors = me.DependenciesParsedData.Predecessors,
				depsToAdd = [], 
				depsToRemove = [], 
				dependencyID = predecessorData.DependencyID;

			depsToRemove = _.map(dependencies.Predecessors[dependencyID].PredecessorItems || [], function(item){ 
				return item.PredecessorUserStoryObjectID;
			});
			
			delete dependencies.Predecessors[dependencyID];
			
			if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
				cachedPredecessors = _.filter(cachedPredecessors, function(predecessor){ return predecessor.DependencyID !== dependencyID; });
				me.DependenciesParsedData.Predecessors = cachedPredecessors;
			}
			
			_.each(dependencies.Predecessors, function(predecessor){
				_.each(predecessor.PredecessorItems, function(predecessorItem){
					if(predecessorItem.Assigned){
						depsToRemove = _.filter(depsToRemove, function(userStoryObjectID){ 
							return userStoryObjectID != predecessorItem.PredecessorUserStoryObjectID; 
						});
						depsToAdd = _.union(depsToAdd, [predecessorItem.PredecessorUserStoryObjectID]);
					}
				});
			});
			
			return me._syncCollection(userStoryRecord, depsToAdd, depsToRemove, 'Predecessors').then(function(){ 
				return me._collectionSynced(userStoryRecord, dependencies); 
			});
		},	
		_removeSuccessor: function(userStoryRecord, successorData){
			var me=this, dependencies = me._getDependencies(userStoryRecord),
				cachedSuccessors = me.DependenciesParsedData.Successors,
				depsToAdd = [],
				depsToRemove = [successorData.SuccessorUserStoryObjectID], 
				dependencyID = successorData.DependencyID;
				
			delete dependencies.Successors[dependencyID]; 
			
			if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
				cachedSuccessors = _.filter(cachedSuccessors, function(successor){ 
					return successor.DependencyID === dependencyID && 
						successor.UserStoryFormattedID === successorData.UserStoryFormattedID; 
				});
				me.DependenciesParsedData.Successors = cachedSuccessors;
			}

			_.each(dependencies.Successors, function(successor){
				if(successor.Assigned){//dont worry if its not assigned, it wont show up in 'rally preds/succs'
					depsToRemove = _.filter(depsToRemove, function(userStoryObjectID){ 
						return userStoryObjectID != successor.SuccessorUserStoryObjectID; 
					});
					depsToAdd = _.union(depsToAdd, [successor.SuccessorUserStoryObjectID]);
				}
			});
			
			return me._syncCollection(userStoryRecord, depsToAdd, depsToRemove, 'Successors').then(function(){
				return me._collectionSynced(userStoryRecord, dependencies);
			});
		},
		_addPredecessor: function(userStoryRecord, predecessorData){ 
			var me=this, dependencies = me._getDependencies(userStoryRecord),
				cachedPredecessors = me.DependenciesParsedData.Predecessors,
				depsToAdd = [], 
				dependencyID = predecessorData.DependencyID;
			
			predecessorData = Ext.clone(predecessorData);
			predecessorData.Edited = false;
					
			dependencies.Predecessors[dependencyID] = {
				Description: predecessorData.Description,
				NeededBy: predecessorData.NeededBy,
				Status: predecessorData.Status,
				PredecessorItems: predecessorData.PredecessorItems
			};

			if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
				cachedPredecessors = _.filter(cachedPredecessors, function(predecessor){ return predecessor.DependencyID !== dependencyID; });
				cachedPredecessors.push(predecessorData);
				me.DependenciesParsedData.Predecessors = cachedPredecessors;
			}

			_.each(dependencies.Predecessors, function(predecessor){ 
				_.each(predecessor.PredecessorItems, function(predecessorItem){
					if(predecessorItem.Assigned) depsToAdd = _.union(depsToAdd, [predecessorItem.PredecessorUserStoryObjectID]);
				});
			});
				
			return me._syncCollection(userStoryRecord, depsToAdd, [], 'Predecessors').then(function(){
				return me._collectionSynced(userStoryRecord, dependencies);
			});
		},
		_addSuccessor: function(userStoryRecord, successorData){ 
			var me=this, dependencies = me._getDependencies(userStoryRecord),
				cachedSuccessors = me.DependenciesParsedData.Successors,
				depsToAdd = [],
				dependencyID = successorData.DependencyID;
			
			successorData = Ext.clone(successorData);
			successorData.Edited = false;
				
			dependencies.Successors[dependencyID] = {
				SuccessorUserStoryObjectID: successorData.SuccessorUserStoryObjectID
				SuccessorProjectObjectID: successorData.SuccessorProjectObjectID
				Description: successorData.Description
				NeededBy: successorData.NeededBy
				Supported: successorData.Supported
				Assigned: successorData.Assigned
			};

			if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
				cachedSuccessors = _.filter(cachedSuccessors, function(successor){ 
					return successor.DependencyID === dependencyID && 
						successor.UserStoryFormattedID === successorData.UserStoryFormattedID; 
				});
				cachedSuccessors.push(successorData);
				me.DependenciesParsedData.Successors = cachedSuccessors;
			}

			_.each(dependencies.Successors, function(successor){ 
				depsToAdd = _.union(depsToAdd, [successor.SuccessorUserStoryObjectID]);
			});
			
			return me._syncCollection(userStoryRecord, depsToAdd, [], 'Successors').then(function(){
				return me._collectionSynced(userStoryRecord, dependencies);
			});
		},	
	
		_getOldAndNewUSRecords: function(dependencyData){
			var me = this,
				newUserStoryRecord = me.UserStoryStore.findExactRecord('FormattedID', dependencyData.UserStoryFormattedID);
				
			function loadOriginalParent(){
				return me._loadUserStory(dependencyData.UserStoryObjectID).then(function(oldUserStoryRecord){
					newUserStoryRecord = newUserStoryRecord || oldUserStoryRecord; //if depRecord is new...has no ObjectID
					return [oldUserStoryRecord, newUserStoryRecord];
				});
			}
			
			if(newUserStoryRecord && (newUserStoryRecord.data.FormattedID != dependencyData.UserStoryFormattedID)){ //load new one
				return me._loadUserStory(newUserStoryRecord.ObjectID).then(function(userStoryRecord){
					newUserStoryRecord = userStoryRecord; 
					return loadOriginalParent();
				});
			} 
			else return loadOriginalParent();
		},	
		_getRealDepData: function(oldUserStoryRecord, dependencyData, type){ 
			/** type is 'Predecessors' or 'Successors' */
			var me = this, realDependencyData;
			if(oldUserStoryRecord) realDependencyData = me._parseDependenciesFromUserStory(oldUserStoryRecord)[type];
			else realDependencyData = [];
			return me._spliceDepFromList(dependencyData.DependencyID, realDependencyData);		
		},
		_getPredecessorItemArrays: function(predecessorData, realPredecessorData){ 
			/** returns arrays of the team dependencies from the dependency grouped on their status */
			var me=this, 
				addedItems = [], 
				updatedItems = [], 
				removedItems = [], 
				localPredecessorItems = predecessorData.Predecessors, //items on our local machine
				realPredecessorItems  = realPredecessorData ? (realPredecessorData.Predecessors || []) : [];	//items from rally server
			if(!realPredecessorData) addedItems = predecessorData.Predecessors;
			else {		
				Outer:
				for(var i=localPredecessorItems.length-1;i>=0;--i){
					for(var j=0;j<realPredecessorItems.length;++j){
						if(localPredecessorItems[i].PredecessorItemID === realPredecessorItems[j].PredecessorItemID){
							updatedTeams.push(realPredecessorItems.splice(j,1)[0]);
							continue Outer;
						}
					}
					addedItems.push(localPredecessorItems[i]); //teams we just added
				}
				removedItems = realPredecessorItems; //teams that we just removed	
			}
			return {
				added: addedItems,
				updated: updatedItems,
				removed: removedItems
			};
		},	
		_getAddedPredecessorItemCallbacks: function(predecessorItems, predecessorData){ 
			var me=this, 
				permissions = me.getContext().getPermissions(),
				promises = [];
			return Q.all(_.map(predecessorItems, function(predecessorItem){
				var otherProjectRecord = me.ProjectsWithTeamMembers[predecessorItem.PredecessorProjectObjectID];
				if(!permissions.isProjectEditor(otherProjectRecord)) 
					return Q.reject('You lack permissions to modify project: ' + otherProjectRecord.data.Name);
				else {
					return me._loadRandomUserStoryFromReleaseTimeframe(otherProjectRecord, me.ReleaseRecord).then(function(newUserStory){
						if(!newUserStory){
							return Q.reject('Project ' + otherProjectRecord.data.Name + ' has no user stories in this Release, cannot continue');
						} else {
							var newSuccessorDependency = {
								DependencyID: predecessorData.DependencyID,
								SuccessorUserStoryObjectID: predecessorData.UserStoryObjectID,
								SuccessorProjectObjectID: me.ProjectRecord.data.ObjectID,
								UserStoryObjectID: newUserStory.data.ObjectID,
								UserStoryFormattedID: '',
								UserStoryName: '',
								Description: predecessorData.Description,
								NeededBy: predecessorData.NeededBy,
								Supported: predecessorItem.Supported,
								Assigned: false,
								Edited: false
							};
							return me._addSuccessor(newUserStory, newSuccessorDependency);
						}
					});
				}
			}));
		},	
		_getUpdatedPredecessorItemCallbacks: function(predecessorItems, predecessorData){
			/** NOTE: we dont have to worry about an updated predecessorItem being added to a different predecessor userstory because
				users cannot change the project or userstory of a predecessorItem from the 'dependencies we have on other teams' grid.
				This means we don't have to worry about cloning successor items inside this function
			*/
			var me=this, 
				permissions = me.getContext().getPermissions(),
				promises = [];
			return Q.all(_.map(predecessorItems, function(predecessorItem){
				var otherProjectRecord = me.ProjectsWithTeamMembers[predecessorItem.PredecessorProjectObjectID];
				if(!permissions.isProjectEditor(otherProjectRecord)) 
					return Q.reject('You lack permissions to modify project: ' + otherProjectRecord.data.Name);
				else {
					var updatedSuccessorDependency = {
						DependencyID: predecessorData.DependencyID,
						SuccessorUserStoryObjectID: predecessorData.UserStoryObjectID,
						SuccessorProjectObjectID: me.ProjectRecord.data.ObjectID,
						UserStoryObjectID: newUserStory.data.ObjectID,
						UserStoryFormattedID: null,
						UserStoryName: null,
						Description: predecessorData.Description,
						NeededBy: predecessorData.NeededBy,
						Supported: predecessorItem.Supported,
						Assigned: false,
						Edited: false
					};
					return me._loadUserStory(predecessorItem.PredecessorUserStoryObjectID).then(function(userStory){
						if(!userStory){
							return me._loadRandomUserStoryFromReleaseTimeframe(otherProjectRecord, me.ReleaseRecord).then(function(newUserStory){
								if(!newUserStory){
									return Q.reject('Project ' + otherProjectRecord.data.Name + ' has no user stories in this Release, cannot continue');
								} else {
									predecessorItem.PredecessorUserStoryObjectID = newUserStory.data.ObjectID;
									predecessorItem.Assigned = false;
									
									updatedSuccessorDependency.UserStoryName = '';
									updatedSuccessorDependency.FormattedID = '';
									updatedSuccessorDependency.Assigned = false;						
									return me._addSuccessor(newUserStory, updatedSuccessorDependency); 
								}
							});
						} else {
							updatedSuccessorDependency.UserStoryFormattedID = userStory.data.FormattedID;
							updatedSuccessorDependency.UserStoryName = userStory.data.Name;
							updatedSuccessorDependency.Assigned = predecessorItem.Assigned;
							return me._addSuccessor(userStory, updatedSuccessorDependency);
						}
					});
				}
			}));
		},	
		_getRemovedPredecessorItemCallbacks: function(predecessorItems, predecessorData){
			var me=this, 
				permissions = me.getContext().getPermissions(),
				promises = [];
			return Q.all(_.map(predecessorItems, function(predecessorItem){
				var otherProjectRecord = me.ProjectsWithTeamMembers[predecessorItem.PredecessorProjectObjectID];
				if(!permissions.isProjectEditor(otherProjectRecord)) 
					return Q.reject('You lack permissions to modify project: ' + otherProjectRecord.data.Name);
				else {
					return me._loadUserStory(predecessorItem.PredecessorUserStoryObjectID).then(function(userStory){
						if(userStory){
							var successorDependency = {
								DependencyID: predecessorData.DependencyID,
								SuccessorUserStoryObjectID: predecessorData.UserStoryObjectID,
								SuccessorProjectObjectID: me.ProjectRecord.data.ObjectID,
								UserStoryObjectID: userStory.data.ObjectID,
								UserStoryFormattedID: null,
								UserStoryName: null,
								Description: null,
								NeededBy: null,
								Supported: null,
								Assigned: false,
								Edited: false
							};
							return me._removeSuccessor(userStory, successorDependency);
						}
					});
				}
			}));
		},
		_updateSuccessor: function(successorData, predecessorUserStory){
			var me=this, 
				permissions = me.getContext().getPermissions(),
				otherProjectRecord = me.ProjectsWithTeamMembers[successorData.SuccessorProjectObjectID];
			if(!permissions.isProjectEditor(otherProjectRecord)){
				return Q.reject('You lack permissions to modify project: ' + otherProjectRecord.data.Name);
			} else {
				return me._loadUserStory(successorData.SuccessorUserStoryObjectID).then(function(userStory){
					if(!userStory) return Q.reject(['Successor UserStory has been deleted.']);
					else {
						var successorsDependencies = me._getDependencies(userStory),
							successorsDependency = successorsDependencies.Predecessors[successorData.DependencyID];
						if(successorsDependency){
							var predecessorData = {
								DependencyID: successorData.DependencyID,
								UserStoryObjectID: userStory.data.ObjectID,
								UserStoryFormattedID: userStory.data.FormattedID,
								UserStoryName: userStory.data.Name,
								Description: successorsDependency.Description,
								NeededBy: successorsDependency.NeededBy,
								Status: successorsDependency.Status,
								PredecessorItems: successorsDependency.PredecessorItems || [], 
								Edited: false
							};
							var predecessorItem = _.find(predecessorData.PredecessorItems, function(predecessorItem){
								return predecessorItem.PredecessorProjectObjectID == me.ProjectRecord.data.ObjectID;
							});
							if(predecessorItem){
								predecessorItem.PredecessorUserStoryObjectID = predecessorUserStory.data.ObjectID;
								predecessorItem.Supported = successorData.Supported;
								predecessorItem.Assigned = successorData.Assigned;
								return me._addPredecessor(userStory, predecessorData);
							}
							else return Q.reject(['Successor removed this dependency.']);
						}
						else return Q.reject(['Successor removed this dependency.']);
					} 
				});
			}
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
			if(!realDataFromServer)	return localData.data.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else return localData.data.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
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
			me._loadTeamCommitsGrid();
			me._loadVelocityGrid();
			me._loadSanityGrid();
			me._loadRisksGrid();
			me._loadDependenciesGrids();
		},	
		_updateGrids: function(){
			var me=this,
				promises = [];
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);
			if(!me._isEditingVelocity && me.IterationStore && me.UserStoryStore)
				if(me.CustomVelocityStore) me.CustomVelocityStore.intelUpdate();
			if(!me._isEditingTeamCommits && me.PortfolioItemStore && me.UserStoryStore)
				if(me.CustomTeamCommitsStore) me.CustomTeamCommitsStore.intelUpdate();
			if(!isEditingRisks && me.PortfolioItemStore){
				me._parseRisksData(); //reparse the data
				me._updatePortfolioItemColumnStores();
				if(me.CustomRisksStore) me.CustomRisksStore.intelUpdate();
			}
			if(!isEditingDeps && me.UserStoryStore && me.PortfolioItemStore){
				me._parseDependenciesData(); //reparse the data
				promises.push(me._hydrateDependencyUserStories().then(function(){
					me._updateUserStoryColumnStores();
					if(me.CustomPredDepStore) me.CustomPredDepStore.intelUpdate();
					if(me.CustomSuccDepStore) me.CustomSuccDepStore.intelUpdate();
				}));
			}
			return Q.all(promises);
		},	
		_reloadStores: function(){
			var me=this,
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore),
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
		_reloadEverything:function(){
			var me = this;
			me._isEditingTeamCommits = false;
			me._isEditingVelocity = false;
			
			me.PortfolioItemMap = {};
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			me.IterationStore = undefined;
			me.SanityStores = undefined;
			
			me.PredDepGrid = undefined;
			me.SuccDepGrid = undefined;
			me.RisksGrid = undefined;
			me.VelocityGrid = undefined;
			me.TeamCommitsGrid = undefined;
			
			me.CustomPredDepStore = undefined;
			me.CustomSuccDepStore = undefined;
			me.CustomRisksStore = undefined;
			me.CustomTeamCommitsStore = undefined;
			me.CustomVelocityStore = undefined;
			
			me.setLoading('Loading Data');
			
			var toRemove = me.down('#tc_vel_box').next(), tmp;
			while(toRemove){ //delete risks and deps
				tmp = toRemove.next();
				toRemove.up().remove(toRemove);
				toRemove = tmp;
			}
			me.down('#tc_vel_box_left').removeAll();
			me.down('#tc_vel_box_right').removeAll();

			if(!me.ReleasePicker){ //draw these once, never removve them
				me._loadReleasePicker();
				me._loadTrainPicker();
				me._loadRefreshIntervalCombo();
				me._loadManualRefreshButton();
			}		
			me._enqueue(function(unlockFunc){
				me._reloadStores()
					.then(function(){ return me._updateGrids(); })
					.then(function(){ return me._showGrids(); })
					.fail(function(reason){	me._alert('ERROR', reason || ''); })
					.then(function(){
						me.setLoading(false);
						unlockFunc();
					})
					.done();
			});
		},
		
		/**___________________________________ REFRESHING DATA ___________________________________*/	
		_setLoadingMasks: function(){
			var me=this, message = 'Refreshing Data',
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);			
			if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(message);
			if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(message);
			if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(message);
			if(me.PredDepGrid && !isEditingDeps) me.PredDepGrid.setLoading(message);
			if(me.SuccDepGrid && !isEditingDeps) me.SuccDepGrid.setLoading(message);
		},	
		_removeLoadingMasks: function(){
			var me=this,
				isEditingRisks = me._isEditing(me.CustomRisksStore),
				isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);		
			if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(false);
			if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(false);
			if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(false);
			if(me.PredDepGrid && !isEditingDeps) me.PredDepGrid.setLoading(false);
			if(me.SuccDepGrid && !isEditingDeps) me.SuccDepGrid.setLoading(false);
		},	
		_refreshDataFunc: function(){
			var me=this;
			me._enqueue(function(unlockFunc){
				me._setLoadingMasks();
				me._reloadStores()
					.then(function(){ return me._updateGrids(); })
					.fail(function(reason){ me._alert('ERROR', reason || ''); })
					.then(function(){ 
						me._removeLoadingMasks();
						unlockFunc(); 
					})
					.done();
			});
		},	
		_setRefreshInterval: function(){
			var me=this;
			if(me.RefreshInterval) { 
				clearInterval(me.RefreshInterval); 
				me.RefreshInterval = undefined; 
			}
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
								me.ProjectWithTeamMembersNames = _.map(projectsWithTeamMembers, function(p){ return {Name: p.data.Name}; });
								if(!me.ProjectWithTeamMembersNames[me.ProjectRecord.data.ObjectID])
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
											me.TrainNames = _.map(trainRecords, function(tr){ return {Name: me._getTrainName(tr)}; })
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
						var pid = me.ProjectRecord.data.ObjectID;
						if(me.AppsPref.projs[pid] && me.AppsPref.projs[pid].Train){
							me.TrainRecord = _.find(me.AllTrainRecords, function(p){ return p.data.ObjectID = me.AppsPref.projs[pid].Train; });
							if(!me.TrainRecord) me.TrainRecord = me.AllTrainRecords[0];
						} else {
							me.TrainRecord = me.AllTrainRecords[0];
							return me._loadTrainPortfolioProject(me.TrainRecord)
								.then(function(trainPortfolioProject){
									me.TrainPortfolioProject = trainPortfolioProject;
								});
						}
					}
				}
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
			me.ReleasePicker = me.down('#navbox_left').add({
				xtype:'intelreleasepicker',
				padding:'0 10px 0 0',
				releases: me.ReleaseStore.data.items,
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
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ me._reloadEverything(); })
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},	
		_loadTrainPicker: function(){
			var me=this;
			if(me.ProjectNotInTrain){
				me.down('#navbox_left').add({
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
				.then(function(){ me._reloadEverything(); })
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},			
		_loadRefreshIntervalCombo: function(){
			var me=this;
			me.down('#navbox_right').add({
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
			me.down('#navbox_right').add({
				xtype:'button',
				text:'Refresh Data',
				style:'margin: 5px 0 0 5px',
				width:100,
				listeners:{
					click: me._refreshDataFunc.bind(me)
				}
			});
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
						var portfolioItemRecord = me.PortfolioItemStore.findExactRecord('ObjectID', teamCommitsRecord.data.ObjectID);
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
				/** NOTE: using the CSS hidden for display requires us to make fixed grid heights */
				_.each(me.CustomTeamCommitsStore.getRange(), function(item, index){
					if(fn(item)) me.TeamCommitsGrid.view.removeRowCls(index, 'hidden'); 
					else me.TeamCommitsGrid.view.addRowCls(index, 'hidden');
				});
			}
						
			var columnCfgs = [{
				text:'#',
				dataIndex:'Rank',
				width:30,
				editor:false,
				sortable:true,
				draggable:false,
				resizable:false,
				tooltip: me.PortfolioItemTypes[0] + ' Rank',
				tooltipType:'title'
			},{
				text:'F#', 
				dataIndex:'FormattedID',
				width:60,
				editor:false,
				sortable:true,
				draggable:false,
				resizable:false,
				renderer:function(portfolioItemFormattedID, meta, teamCommitsRecord){
					var portfolioItem = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID);
					if(teamCommitsRecord.data.Expected) meta.tdCls += ' manager-expected-cell';
					if(portfolioItem.data.Project) {
						return '<a href="https://rally1.rallydev.com/#/' + portfolioItem.data.Project.ObjectID + 
							'd/detail/portfolioitem/' + me.PortfolioItemTypes[0] + '/' + 
								portfolioItem.data.ObjectID + '" target="_blank">' + portfolioItemFormattedID + '</a>';
					}
					else return portfolioItemFormattedID;
				}
			},{
				text: me.PortfolioItemTypes[0],
				dataIndex:'Name',
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
					id:'team-commits-f-top-portfolio-item',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['TopPortfolioItemName'],
						data: [{TopPortfolioItemName:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.PortfolioItemMap)), 
							function(topPortfolioItemName){ return topPortfolioItemName; }), 
							function(topPortfolioItemName){ return {TopPortfolioItemName: topPortfolioItemName}; }))
					}),
					displayField: 'Product',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Product == 'All') filterTopPortfolioItem = null; 
							else filterTopPortfolioItem = selected[0].data.Product;
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
						sorterFn: function(portfolioItem1, portfolioItem2){  //sort by stories for this team in each feature
							var diff = me._getStoryCount(portfolioItem1.data.ObjectID) - me._getStoryCount(portfolioItem2.data.ObjectID);
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
						sorterFn: function(portfolioItem1, portfolioItem2){ //sort by stories for this team in each portfolioItem
							var diff = me._getStoriesEstimate(portfolioItem1.data.ObjectID) - me._getStoriesEstimate(portfolioItem2.data.ObjectID);
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

			me.TeamCommitsGrid = me.down('#tc_vel_box_left').add({
				xtype: 'rallygrid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'grid-header-text',
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
				padding:'0 20px 0 0',
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
							base = teamCommitsFilter(teamCommitsRecord) ? '' : 'hidden ';
						if(val == 'N/A') return base + 'grey-row';
						else if(val == 'Committed') return base + 'green-row';
						else if(val == 'Not Committed') return base + 'red-row';
						else return base;
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
						else if(!value){ 
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
							me._loadPortfolioItemByOrdinal(teamCommitsRecord.data.ObjectID, 0).then(function(realPortfolioItem){
								if(realPortfolioItem) return me._setTeamCommit(realPortfolioItem, tc);
							})
							.fail(function(reason){ me._alert('ERROR', reason || ''); })
							.then(function(){ 
								me.TeamCommitsGrid.setLoading(false);
								me._isEditingTeamCommits = false;
								unlockFunc();
							})
							.done();
						});
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
					meta.tdCls += (val*1===0 ? ' red-cell' : '');
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
					meta.tdCls += ((realVel*1 < record.data.PlannedVelocity*0.9) ? ' yellow-cell' : '');
					meta.tdCls += ((realVel*1 === 0 || realVel*1 > record.data.PlannedVelocity*1) ? ' red-cell' : '');
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
					meta.tdCls += ((real < planned*0.9) ? ' yellow-cell' : '');
					meta.tdCls += ((real*1 === 0 || real*1 > planned) ? ' red-cell' : '');
					return real;
				}
			}];
			
			me.VelocityGrid = me.down('#tc_vel_box_right').add({
				xtype: 'rallygrid',
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
							} 
						});
					}
				},
				enableEditing:false,
				showPagingToolbar: false,
				showRowActionsColumn:false,
				disableSelection: true,
				columnCfgs: columnCfgs,
				store: me.CustomVelocityStore
			});
			me.VelocityTotalsGrid = me.down('#tc_vel_box_right').add({
				xtype: 'rallygrid',
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
						meta.tdCls += ' sanity-name-cell';
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
						meta.tdCls += 'sanity-num-cell';
						if(val.length === 0) meta.tdCls += ' green-cell';
						else meta.tdCls += ' red-cell';
						return val.length; 
					}
				}];
			
			me.SanityGrid = me.down('#tc_vel_box_right').add({
				xtype: 'rallygrid',
				header: {
					items: [{
						xtype:'container',
						html: me.SanityDashboardObjectID ? 
							('<a class="sanity-header" href="https://rally1.rallydev.com/#/' + me.ProjectRecord.data.ObjectID + 
								'ud/custom/' + me.SanityDashboardObjectID + '" target="_blank">DATA INTEGRITY</a>') :
							'<span class="sanity-header">DATA INTEGRITY</a>'
					}]
				},
				margin:'30px 0 0 0',
				showPagingToolbar: false,
				showRowActionsColumn:false,
				hideHeaders:true,
				disableSelection: true,
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				enableEditing:false,
				columnCfgs:columnCfgs,
				store: Ext.create('Ext.data.Store', {
					fields:[
						{name: 'title', type: 'string'},
						{name: 'userStories', type: 'auto'}
					],
					data: me._getSanityStoreData()
				})
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
						realRisksData = me.RisksParsedData.slice(0), //'real' risks list
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
					if(fn(item)) me.RisksGrid.view.removeRowCls(index, 'hidden');
					else me.RisksGrid.view.addRowCls(index, 'hidden');
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
					meta.tdCls += (val==='Undefined' ? ' red-cell' : '');
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
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0)),
						dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'Edited') return;
					meta.tdAttr = 'title="Undo"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0));
									riskRecord.beginEdit();
									for(var key in realRiskData) riskRecord.set(key, realRiskData[key]);	
									riskRecord.endEdit();
									updateFilterOptions();
								}
							}
						}
					};
				}
			},{
				text:'',
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				width:30,
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0)),
						dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'New' && dirtyType !== 'Edited') return;
					meta.tdAttr = 'title="Save Risk"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){//DONT NEED ObjectID. that only is to reference previous parent!
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
										.then(function(){ return me._loadPortfolioItemByOrdinal(riskRecord.data.PortfolioItemObjectID, 0); })
										.then(function(oldPortfolioItemRecord){							
											newPortfolioItemRecord = newPortfolioItemRecord || oldPortfolioItemRecord; //if new is same as old
											return Q(oldPortfolioItemRecord && 
												(function(){										
													var oldRealRisksData = me._parseRisksFromPortfolioItem(oldPortfolioItemRecord),
														oldRealRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, oldRealRisksData);							
													if(oldRealRiskData && (oldPortfolioItemRecord.data.ObjectID !== newPortfolioItemRecord.data.ObjectID))
														return me._removeRisk(oldPortfolioItemRecord, oldRealRiskData);
												}())
											);
										})
										.then(function(){ return me._addRisk(newPortfolioItemRecord, riskRecord.data); })
										.then(function(){
											riskRecord.beginEdit();
											riskRecord.set('Edited', false);
											riskRecord.set('PortfolioItemObjectID', newPortfolioItemRecord.data.ObjectID);
											riskRecord.endEdit();
										})
										.fail(function(reason){ me._alert('ERROR:', reason || ''); })
										.then(function(){ 
											me.RisksGrid.setLoading(false);
											updateFilterOptions();
											unlockFunc();
										})
										.done();
									});
								}
							}
						}
					};
				}
			},{
				text:'',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord){
					meta.tdAttr = 'title="Delete Risk"';
					return {
						xtype:'container',
						width:20,
						cls: 'delete-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									me._confirm('Confirm', 'Delete Risk?', function(msg){
										if(msg.toLowerCase() !== 'yes') return;
										me.RisksGrid.setLoading("Deleting Risk");
										me._enqueue(function(unlockFunc){
											me._loadPortfolioItemByOrdinal(riskRecord.data.PortfolioItemObjectID, 0).then(function(oldPortfolioItemRecord){					
												return Q(oldPortfolioItemRecord && 
													(function(){										
														var riskRecordData = riskRecord.data,
															oldRealRisksData = me._parseRisksFromPortfolioItem(oldPortfolioItemRecord),
															oldRealRiskData = me._spliceRiskFromList(riskRecordData.RiskID, oldRealRisksData);							
														if(oldRealRiskData) 
															return me._removeRisk(oldPortfolioItemRecord, oldRealRiskData);
													}())
												);
											})
											.fail(function(reason){ me._alert('ERROR:', reason); })
											.then(function(){
												me.CustomRisksStore.remove(riskRecord);
												me.RisksGrid.setLoading(false);
												updateFilterOptions();
												unlockFunc();
											})
											.done();
										});
									});
								}
							}
						}
					};
				}
			}];

			me.RisksGrid = me.add({
				xtype: 'rallygrid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'grid-header-text',
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
							width:80,
							margin:'0 10 0 0',
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
				margin:'40 10 0 10',
				scroll:'vertical',
				columnCfgs: columnCfgs,
				disableSelection: true,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(item){ return 'intel-row-35px ' + (riskGridFilter(item) ? '' : 'hidden'); }
				},
				listeners: {
					sortchange: function(){ filterRisksRowsByFn(riskGridFilter); },
					edit: function(editor, e){			
						/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
							to improve performance.**/
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
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomRisksStore
			});	
		},	
		
		everything from here up is done! 
		
		_loadDependenciesGrids: function(){
			var me = this;
			
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
			me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
			me.PredDepContainers = {};
			
			function depSorter(o1, o2){ return o1.data.DependencyID > o2.data.DependencyID ? -1 : 1; } //new come first
			function depTeamSorter(o1, o2){ return o1.data.TID > o2.data.TID ? -1 : 1; } //new come first

			me.CustomPredDepStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.DependenciesParsedData.Predecessors),
				autoSync:true,
				model:'IntelPredDep',
				limit:Infinity,
				proxy: {
					type:'fastsessionproxy',
					id:'PredDepProxy' + Math.random()
				},
				sorters:[depSorter],
				intelUpdate: function(){ 
					var predDepStore = me.CustomPredDepStore, 
						predDepRecs = predDepStore.getRange(),
						realPredDepsData = me.DependenciesParsedData.Predecessors.slice(); //shallow copy of it	
					console.log('syncing predDeps with current userStories', predDepRecs, realPredDepsData);
					predDepStore.suspendEvents(true);
					_.each(predDepRecs, function(depRec){ //predecessor dependency record to be updated
						var depID = depRec.data.DependencyID,
							realDep = me._spliceDepFromList(depID, realPredDepsData),	
							dirtyType = me._getDirtyType(depRec, realDep),
							teamStore = me.PredDepTeamStores[depID],
							teamCont = me.PredDepContainers[depID],
							key;
						if(dirtyType === 'New' || dirtyType === 'Edited'){}//we don't want to remove any pending changes			
						else if(dirtyType == 'Deleted'){ // the depRec was deleted by someone else, and we arent editing it
							predDepStore.remove(depRec);
							if(teamStore) me.PredDepTeamStores[depID] = undefined;
							if(teamCont) me.PredDepContainers[depID] = undefined;
						} else {
							if(!_.isEqual(depRec.data.Predecessors, realDep.Predecessors)){ //faster to delete and readd if preds are different
								if(teamCont) {
									me.PredDepContainers[depID].destroy();
									me.PredDepContainers[depID] = undefined;
								}
								predDepStore.remove(depRec);
								predDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));
								if(teamStore) teamStore.intelUpdate(); 
							}
							else {
								depRec.beginEdit();
								for(key in realDep){
									if(key!=='Predecessors' && realDep[key]!=depRec.get(key))
										depRec.set(key, realDep[key]);
								}
								depRec.endEdit();
							}
						}				
						var preds = depRec.data.Predecessors;
						//DO NOT SET EDITED==true, because it is already true! only new or edited will ever have preds.length==0
						if(!preds.length) {
							depRec.set('Predecessors', [me._newPredecessorItem()]); 
							if(teamStore) teamStore.intelUpdate();
						}
					});
					
					realPredDepsData.forEach(function(realDep){ 
						//add all the new risks that other people have added since the last load
						console.log('adding predDep', realDep);
						predDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));					
						var depID = realDep.DependencyID,
							teamStore = me.PredDepTeamStores[depID];
						if(teamStore) teamStore.intelUpdate(); 
					});
					predDepStore.resumeEvents();
				}
			});
			
			var defaultRenderer = function(val){ return val || '-'; };

			var filterFIDPred = null, 
				filterNamePred = null, 
				filterNeededByPred = null;
			function predDepGridFilter(r){
				if(filterFIDPred && r.data.FormattedID != filterFIDPred) return false;
				if(filterNamePred && r.data.UserStoryName != filterNamePred) return false;
				if(filterNeededByPred && me._roundDateDownToWeekStart(r.data.Checkpoint)*1 != filterNeededByPred) return false;
				return true;
			}
			function filterPredDepRowsByFn(fn){
				_.each(me.CustomPredDepStore.getRange(), function(item, index){
					if(fn(item)) me.PredDepGrid.view.removeRowCls(index, 'hidden');
					else me.PredDepGrid.view.addRowCls(index, 'hidden');
				});
			}
			function removePredFilters(){
				filterFIDPred = null;
				filterNamePred = null;
				filterNeededByPred = null; 
				filterPredDepRowsByFn(function(){ return true; });
				Ext.getCmp('pred-dep-f-fid').setValue('All');
				Ext.getCmp('pred-dep-f-name').setValue('All');
				Ext.getCmp('pred-dep-f-needed-by').setValue('All');
			}
			
			function getPredFIDfilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(), 
					function(r){ return r.data.FormattedID; })), 
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getPredNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(), 
					function(r){ return r.data.UserStoryName; })), 
					function(f){ return f; }), 
					function(n){ return {Name:n}; }));
			}
			function getPredNeededByFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(),
					function(risk){ return me._roundDateDownToWeekStart(risk.data.Checkpoint)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function updatePredFilterOptions(){
				var fidStore = Ext.getCmp('pred-dep-f-fid').getStore(),
					nameStore = Ext.getCmp('pred-dep-f-name').getStore(),
					cpStore = Ext.getCmp('pred-dep-f-needed-by').getStore();
				fidStore.removeAll();
				fidStore.add(getPredFIDfilterOptions());
				nameStore.removeAll();
				nameStore.add(getPredNameFilterOptions());
				cpStore.removeAll();
				cpStore.add(getPredNeededByFilterOptions());
			}
			
			var predDepColumnCfgs = [
				{
					text:'US#', 
					dataIndex:'FormattedID',
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
						id:'pred-dep-f-fid',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['FormattedID'],
							data: getPredFIDfilterOptions()
						}),
						displayField: 'FormattedID',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.FormattedID == 'All') filterFIDPred = null; 
								else filterFIDPred = selected[0].data.FormattedID;
								filterPredDepRowsByFn(predDepGridFilter);
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
						id:'pred-dep-f-name',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['Name'],
							data: getPredNameFilterOptions()
						}),
						displayField: 'Name',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.Name == 'All') filterNamePred = null; 
								else filterNamePred = selected[0].data.Name;
								filterPredDepRowsByFn(predDepGridFilter);
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
					dataIndex:'Checkpoint',
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
						id:'pred-dep-f-needed-by',
						xtype:'intelfixedcombo',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							model:'WorkweekDropdown',
							data: getPredNeededByFilterOptions()
						}),
						displayField: 'Workweek',
						valueField: 'DateVal',
						value:'All',
						listeners:{
							focus: function(combo) { combo.expand(); },
							select: function(combo, selected){
								if(selected[0].data.DateVal === 0) filterNeededByPred = null; 
								else filterNeededByPred = selected[0].data.DateVal;
								filterPredDepRowsByFn(predDepGridFilter);
							}
						}
					}, {xtype:'container', width:5}]
				},{
					text:'Teams Depended On',
					dataIndex:'DependencyID',
					xtype:'fastgridcolumn',
					html:	'<div class="pred-dep-header" style="width:40px !important;"></div>' +
							'<div class="pred-dep-header" style="width:110px !important;">Team Name</div>' +
							'<div class="pred-dep-header" style="width:95px  !important;">Supported</div>' +
							'<div class="pred-dep-header" style="width:70px  !important;">US#</div>' +
							'<div class="pred-dep-header" style="width:130px !important;">User Story</div>',
					width:480,
					resizable:false,
					draggable:false,
					sortable:false,
					renderer: function (depID){
						var predDepStore = me.CustomPredDepStore,
							predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
							predecessors = predDepRecord.data.Predecessors;
						if(!me.PredDepTeamStores[depID]){
							me.PredDepTeamStores[depID] = Ext.create('Intel.data.FastStore', { 
								model:'IntelDepTeam',
								data: predecessors,
								autoSync:true,
								limit:Infinity,
								proxy: {
									type:'fastsessionproxy',
									id:'TeamDep-' + depID + '-proxy' + Math.random()
								},
								sorters:[depTeamSorter],
								intelUpdate: function(){
									var predDepStore = me.CustomPredDepStore,
										depTeamStore = me.PredDepTeamStores[depID],
										depTeamRecords = depTeamStore.getRange(),
										predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
										predecessors = predDepRecord.data.Predecessors.slice();
									depTeamStore.suspendEvents(true);
									Outer:
									for(var i = 0;i<depTeamRecords.length;++i){
										var depTeamRecord = depTeamRecords[i],
											realTeamDep, key;
										for(var j=0; j<predecessors.length;++j){
											if(predecessors[j].TID === depTeamRecord.data.TID){
												realTeamDep = predecessors.splice(j, 1)[0];
												for(key in realTeamDep){
													if(!_.isEqual(depTeamRecord.get(key), realTeamDep[key])){ 
														depTeamStore.remove(depTeamRecord);
														depTeamStore.add(Ext.create('IntelDepTeam', Ext.clone(realTeamDep)));
														continue Outer;
													}
												}
											}
										}
										depTeamStore.remove(depTeamRecord);
									}
									
									predecessors.forEach(function(realTeamDep){ 
										depTeamStore.add(Ext.create('IntelDepTeam', realTeamDep));
									});	
									
									if(depTeamStore.getRange().length===0) {
										var newItem = me._newPredecessorItem();
										depTeamStore.add(Ext.create('IntelDepTeam', newItem));
										predDepRecord.data.Predecessors.push(newItem);
									}
									depTeamStore.resumeEvents();
								}
							});	
						}
						
						if(me.PredDepContainers[depID]) 
							return me.PredDepContainers[depID];
							
						var defaultHandler = { //dont let mouse events bubble up to parent grid. bad things happen
							element: 'el',
							fn: function(a){ a.stopPropagation(); }
						};
						
						var teamColumnCfgs = [
							{
								dataIndex:'PID',
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
								dataIndex:'Sup',
								width:80,
								resizable:false,
								editor: false,
								renderer: function(val, meta){
									if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
									else if(val == 'Yes') meta.tdCls = 'intel-supported-cell';
									return val;
								}
							},{
								dataIndex:'USID',
								width:75,
								resizable:false,
								editor: false,
								renderer: function(val, meta, depTeamRecord){
									if(depTeamRecord.data.A) return val;
									else return '-';
								}
							},{
								dataIndex:'USName',
								width:140,
								resizable:false,
								editor: false,
								renderer: function(val, meta, depTeamRecord){
									if(depTeamRecord.data.A) return val;
									else return '-';
								}				
							},{
								resizable:false,
								width:30,
								xtype:'fastgridcolumn',
								tdCls: 'iconCell',
								renderer: function(val, meta, depTeamRecord){
									meta.tdAttr = 'title="Delete Team"';
									return {
										xtype:'container',
										width:20,
										cls: 'minus-button intel-editor-cell',
										listeners:{
											click: {
												element: 'el',
												fn: function(){
													var predDepStore = me.CustomPredDepStore,
														predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
														predecessors = Ext.clone(predDepRecord.data.Predecessors),
														teamStore = me.PredDepTeamStores[depID];										
													teamStore.suspendEvents(true);
													for(var i=0; i<predecessors.length; ++i)
														if(predecessors[i].TID === depTeamRecord.data.TID){
															predecessors.splice(i, 1); break; }
													teamStore.remove(depTeamRecord);
													
													if(!predecessors.length){
														var newItem = me._newPredecessorItem();
														teamStore.add(Ext.create('IntelDepTeam', newItem));
														predecessors.push(newItem);
													}
													predDepRecord.set('Edited', true);
													predDepRecord.set('Predecessors', predecessors); //if we don't use 'set', it won't refresh cell, or grid height
													teamStore.resumeEvents();
													//me.PredDepGrid.view.refreshNode(me.CustomPredDepStore.indexOf(predDepRecord));//fix row not resizing
												}
											}
										}
									};
								}
							}
						];
						
						return {
							xtype:'container',
							layout:'hbox',
							bodyCls: 'blend-in-grid',
							pack:'start',
							align:'stretch',
							border:false,
							items: [
								{
									xtype:'container',
									width:20,
									cls: 'plus-button intel-editor-cell',
									autoEl:{ 
										title:'Add Team'
									},
									listeners:{
										click: {
											element: 'el',
											fn: function(){
												if(me.PredDepTeamStores[depID]) {
													//scrolling is taken care of by the scrollsteadytableview
													var predDepStore = me.CustomPredDepStore,
														predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
														newItem = me._newPredecessorItem();
													me.PredDepTeamStores[depID].insert(0, [Ext.create('IntelDepTeam', newItem)]);
													predDepRecord.set('Predecessors', predDepRecord.data.Predecessors.concat([newItem])); //use set() to update rowheight
													predDepRecord.set('Edited', true);	
												}
											}
										}
									}
								},{
									xtype: 'rallygrid',	
									width:450,
									rowLines:false,
									columnCfgs: teamColumnCfgs,
									disableSelection: true,
									plugins: [ 'fastcellediting' ],
									viewConfig: {
										stripeRows:false,
										getRowClass: function(teamDepRecord, index, rowParams, store){
											if(!teamDepRecord.data.PID) return 'intel-team-dep-row';
											//if(!teamDepRecord.data.PID) return 'intel-row-35px intel-team-dep-row';
											//else return 'intel-row-35px';
										}
									},
									listeners: {
										beforeedit: function(editor, e){
											if(!!e.value) return false; //don't edit if has value
										},
										edit: function(editor, e){									
											/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
												to improve performance.**/		
											var depTeamRecord = e.record,
												field = e.field,
												value = e.value,
												originalValue = e.originalValue,
												predDepStore = me.CustomPredDepStore,
												predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
												predecessors = predDepRecord.data.Predecessors,
												i;			
											if(value === originalValue) return;										
											if(field === 'PID'){
												var projectRecord = _.find(me.ProjectsWithTeamMembers, function(vp){ return vp.data.Name === value; });
												if(!projectRecord) {
													depTeamRecord.set('PID', originalValue);
													return;
												} else {
													for(i = 0;i<predecessors.length;++i){
														if(predecessors[i].PID == projectRecord.data.ObjectID){
															me._alert('ERROR', value + ' already included in this dependency');
															depTeamRecord.set('PID', originalValue);
															return;
														}
													}
													if(projectRecord.data.ObjectID === me.ProjectRecord.data.ObjectID){
														me._alert('ERROR', 'You cannot depend on yourself');
														depTeamRecord.set('PID', originalValue);
														return;
													}
													depTeamRecord.set('PID', projectRecord.data.ObjectID);
												}
											}
													
											for(i=0; i<predecessors.length; ++i){
												if(predecessors[i].TID === depTeamRecord.data.TID){
													predecessors[i].PID = depTeamRecord.data.PID; //update the predDepRecord, but dont need to propagate using set()
													break; 
												}
											}
											predDepRecord.set('Edited', true);
										},
										selectionchange: function(){ this.getSelectionModel().deselectAll(); }
									},
									hideHeaders:true,
									showRowActionsColumn:false,
									scroll:false,
									showPagingToolbar:false,
									enableEditing:false,
									context: me.getContext(),
									store: me.PredDepTeamStores[depID]
								}
							],
							listeners: {
								mousedown: defaultHandler,
								mousemove: defaultHandler,
								mouseout: defaultHandler,
								mouseover: defaultHandler,
								mouseup: defaultHandler,
								mousewheel: defaultHandler,
								scroll: defaultHandler,
								click: defaultHandler,
								dblclick: defaultHandler,
								contextmenu: defaultHandler,
								render: function(){ me.PredDepContainers[depID] = this; },
								resize: function(d, w, h, oldw, oldh){ 
									/*** disabled the min/maxHeight for the grids and set to fixed height for now. so this listener is obsolete ***/
									// var viewHeight = me.PredDepGrid.view.el.clientHeight,
										// viewScrollHeight = me.PredDepGrid.view.el.dom.scrollHeight,
										// maxHeight = me.PredDepGrid.maxHeight - 
											// (me.PredDepGrid.view.headerCt.el.dom.clientHeight + me.PredDepGrid.header.el.dom.clientHeight) + 2;
										// changeHeight = h - oldh;
									// if(viewScrollHeight < maxHeight || 
										// ((viewScrollHeight - changeHeight <=  maxHeight) != (viewScrollHeight <= maxHeight))){
										// me.PredDepGrid.view.updateLayout(); 
									// }
								}
							}
						};
					}
				},{
					text:'',
					dataIndex:'Edited',
					xtype:'fastgridcolumn',
					width:30,
					resizable:false,
					draggable:false,
					tdCls: 'iconCell',
					renderer: function(value, meta, predDepRecord){	
						var realDepData = me._spliceDepFromList(predDepRecord.data.DependencyID, me.DependenciesParsedData.Predecessors.slice(0)),
							dirtyType = me._getDirtyType(predDepRecord, realDepData);
						if(dirtyType !== 'Edited') return ''; //don't render it!
						meta.tdAttr = 'title="Undo"';
						return {
							xtype:'container',
							width:20,
							cls: 'undo-button intel-editor-cell',
							listeners:{
								click: {
									element: 'el',
									fn: function(){
										var depID = predDepRecord.data.DependencyID,
											realDep = me._spliceDepFromList(depID, me.DependenciesParsedData.Predecessors.slice(0));
										predDepRecord.beginEdit();
										for(var key in realDep){
											if(key === 'Predecessors') predDepRecord.set(key, Ext.clone(realDep[key]) || [me._newPredecessorItem()]);
											else predDepRecord.set(key, realDep[key]);
										}	
										predDepRecord.endEdit();
										me.PredDepTeamStores[depID].intelUpdate();
										updatePredFilterOptions();
									}
								}
							}
						};
					}
				},{
					text:'',
					dataIndex:'Edited',
					xtype:'fastgridcolumn',
					width:30,
					resizable:false,
					draggable:false,
					tdCls: 'iconCell',
					renderer: function(value, meta, predDepRecord){				
						var realDepData = me._spliceDepFromList(predDepRecord.data.DependencyID, me.DependenciesParsedData.Predecessors.slice(0)),
							dirtyType = me._getDirtyType(predDepRecord, realDepData);
						if(dirtyType === 'New') dirtyType = 'Save';
						else if(dirtyType === 'Edited') dirtyType = 'Save';
						else return ''; //don't render it!
						meta.tdAttr = 'title="' + dirtyType + ' Dependency"';
						return {
							xtype:'container',
							width:20,
							cls: 'save-button intel-editor-cell',
							listeners:{
								click: {
									element: 'el',
									fn: function(){
										//validate fields first
										if(!predDepRecord.data.FormattedID || !predDepRecord.data.UserStoryName){
											me._alert('ERROR', 'A UserStory is not selected'); return; }
										if(!predDepRecord.data.Description){
											me._alert('ERROR', 'The description is empty'); return; }
										if(!predDepRecord.data.Checkpoint){
											me._alert('ERROR', 'Select When the dependency is needed by'); return; }
										var predecessors = predDepRecord.data.Predecessors;
										if(!predecessors.length){
											me._alert('ERROR', 'You must specify a team you depend on'); return; }
										if(_.find(predecessors, function(p){ return p.PID === ''; })){
											me._alert('ERROR', 'All Team Names must be valid'); return; }
										
										me.PredDepGrid.setLoading(true);
										me._enqueue(function(unlockFunc){
											var predDepData = predDepRecord.data;
											/** NOTE ON ERROR HANDLING: we do NOT proceed at all if permissions are insufficient to edit a project, or a project has no user stories to attach to
													we first edit all the successors fields and collections for the teams we depend upon, and then we edit the predecessor field on THIS user story.
													If a collection sync fails, it retries 4 times, and then it gives up. It is not imperative that the predecessor/successor fields are exactly perfect
													if a user story save fails, JUST THAT USER STORY FAILS, everything else will continue on normally. */
											me._getOldAndNewUSRecords(predDepData).then(function(records){
												var oldUSRecord = records[0], newUSRecord = records[1],
													realDepData = me._getRealDepData(oldUSRecord, predDepData, 'Predecessors'),
													teamDeps = me._getPredecessorItemArrays(predDepData, realDepData),
													i, len;
												return me._getAddedTeamDepCallbacks(teamDeps.added, predDepData).then(function(addedCallbacks){	
													return me._getUpdatedTeamDepCallbacks(teamDeps.updated, predDepData).then(function(updatedCallbacks){
														return me._getRemovedTeamDepCallbacks(teamDeps.removed, predDepData).then(function(removedCallbacks){
															var promise = Q();
															for(i=0, len=removedCallbacks.length; i<len; ++i){ promise = promise.then(removedCallbacks[i]); }//execute the removed teams now
															for(i=0, len=addedCallbacks.length; i<len; ++i){ promise = promise.then(addedCallbacks[i]); }//execute the added teams now
															for(i=0, len=updatedCallbacks.length; i<len; ++i){ promise = promise.then(updatedCallbacks[i]); }//execute the updated teams now
															
															promise = promise.then(function(){
																var newTeamDeps = teamDeps.added.concat(teamDeps.updated);
																predDepRecord.beginEdit();
																predDepRecord.set('ObjectID', newUSRecord.data.ObjectID);
																predDepRecord.set('Predecessors', newTeamDeps); //NOTE: added and updated teamDeps DO GET MUTATED before here!
															});
															
															if(realDepData && (oldUSRecord.data.ObjectID !== newUSRecord.data.ObjectID)){
																promise = promise.then(function(){
																	return me._removePredecessor(oldUSRecord, realDepData);
																});
															}
															return promise
																.then(function(){
																	return me._addPredecessor(newUSRecord, predDepData);
																})
																.then(function(){							
																	predDepRecord.set('Edited', false);
																	predDepRecord.endEdit();
																})
																.fail(function(reason){
																	predDepRecord.set('Edited', false);
																	predDepRecord.endEdit();
																	return Q.reject(reason);
																});
														});
													});
												});
											})
											.fail(function(reason){
												me._alert('ERROR:', reason);
											})
											.then(function(){
												updatePredFilterOptions();
												me.PredDepGrid.setLoading(false);
												unlockFunc();
											})
											.done();
										});
									}
								}
							}
						};
					}
				},{
					text:'',
					xtype:'fastgridcolumn',
					width:30,
					resizable:false,
					draggable:false,
					tdCls: 'iconCell',
					renderer: function(value, meta, predDepRecord){		
						meta.tdAttr = 'title="Delete Dependency"';
						return {
							xtype:'container',
							width:20,
							cls: 'delete-button intel-editor-cell',
							listeners:{
								click: {
									element: 'el',
									fn: function(){
										me._confirm('Confirm', 'Delete Dependency?', function(msg){
											if(msg.toLowerCase() !== 'yes') return;										
											me.PredDepGrid.setLoading(true);
											me._enqueue(function(unlockFunc){
												var predDepData = predDepRecord.data;
												me._getOldAndNewUSRecords(predDepData).then(function(records){
													var oldUSRecord = records[0],
														realDepData = me._getRealDepData(oldUSRecord, predDepData, 'Predecessors'),
														teamDeps = me._getPredecessorItemArrays(predDepData, realDepData), 
														depsToDelete = teamDeps.removed.concat(teamDeps.updated), //dont care about added 
														i, len;											
													return me._getRemovedTeamDepCallbacks(depsToDelete, predDepData).then(function(removedCallbacks){
														var promise = Q();
														for(i=0, len=removedCallbacks.length; i<len; ++i){ promise = promise.then(removedCallbacks[i]); }//execute the removed teams now
														if(realDepData){
															promise = promise.then(function(){
																return me._removePredecessor(oldUSRecord, realDepData);
															});
														}
														return promise.then(function(){	me.CustomPredDepStore.remove(predDepRecord); });
													});
												})
												.fail(function(reason){ me._alert('ERROR', reason); })
												.then(function(){
													updatePredFilterOptions();
													me.PredDepGrid.setLoading(false);
													unlockFunc();
												})
												.done();
											});
										});
									}
								}
							}
						};
					}
				}
			];

			me.PredDepGrid = me.add({
				xtype: 'rallygrid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'grid-header-text',
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
							margin:'0 10 0 0',
							listeners:{
								click: function(){
									if(!me.UserStoriesInRelease.length) me._alert('ERROR', 'No User Stories for this Release!');
									else if(me.CustomPredDepStore) {
										removePredFilters();
										var model = Ext.create('IntelPredDep', {
											DependencyID: (new Date() * 1) + '' + (Math.random() * 100 >> 0),
											ObjectID:'',
											FormattedID: '',
											UserStoryName: '',
											Description: '',
											Checkpoint: '',
											Predecessors:[me._newPredecessorItem()],
											Edited:true
										});
										me.CustomPredDepStore.insert(0, [model]);	
										me.PredDepGrid.view.getEl().setScrollTop(0);
										//me.PredDepGrid.getSelectionModel().select(model);
									}
								}
							}
						},{
							xtype:'button',
							text:'Remove Filters',
							width:110,
							listeners:{ click: removePredFilters }
						}]
					}]
				},
				height:400,
				margin:'40 10 0 10',
				scroll:'vertical',
				columnCfgs: predDepColumnCfgs,
				disableSelection: true,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(predDepRecord){ if(!predDepGridFilter(predDepRecord)) return 'hidden'; }
				},
				listeners: {
					sortchange: function(){ filterPredDepRowsByFn(predDepGridFilter); },
					edit: function(editor, e){		
						/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
							to improve performance.**/			
						var predDepRecord = e.record,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;
						
						if(value === originalValue) return; 
						else if(!value) { predDepRecord.set(field, originalValue); return; }
						if(field === 'Description') {
							value = me._htmlEscape(value);			
							predDepRecord.set(field, value);
						}

						var previousEdit = predDepRecord.data.Edited; 
						predDepRecord.set('Edited', true);
						
						var userStoryRecord;
						if(field === 'UserStoryName'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.Name === value; });
							if(!userStoryRecord){
								predDepRecord.set('UserStoryName', originalValue);
								predDepRecord.set('Edited', previousEdit);
							} else predDepRecord.set('FormattedID', userStoryRecord.data.FormattedID);
						} else if(field === 'FormattedID'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.FormattedID === value; });
							if(!userStoryRecord) {
								predDepRecord.set('FormattedID', originalValue);
								predDepRecord.set('Edited', previousEdit);
							} else predDepRecord.set('UserStoryName', userStoryRecord.data.Name);
						}
						updatePredFilterOptions();
					}
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomPredDepStore
			});	
		
		/**************************************************** SUCCESSORS STUFF *******************************************************************/	
			me.CustomSuccDepStore = Ext.create('Intel.data.FastStore', { 
				data: Ext.clone(me.DependenciesParsedData.Successors.slice(0)),
				autoSync:true,
				model:'IntelSuccDep',
				proxy: {
					type: 'fastsessionproxy',
					id:'SuccDepProxy' + Math.random()
				},
				limit:Infinity,
				sorters:[depSorter],
				intelUpdate: function(){
					var succDepStore = me.CustomSuccDepStore,
						customSuccDepRecs = succDepStore.getRange(), 
						realSuccDepsData = me.DependenciesParsedData.Successors.slice(0), //shallow copy of it
						remoteChanged = false, //if someone else updated this while it was idle on our screen	
						key;
					console.log('syncing succDeps with current userStories', customSuccDepRecs, realSuccDepsData);
					succDepStore.suspendEvents(true);
					for(var i = 0;i<customSuccDepRecs.length;++i){
						var depRec =  customSuccDepRecs[i], //predecessor dependency record to be updated
							depID = depRec.data.DependencyID,
							realDep = me._spliceDepFromList(depID, realSuccDepsData),
							dirtyType = me._getDirtyType(depRec, realDep);
						if(dirtyType === 'Edited') continue; //we don't want to remove any pending changes								
						else if(dirtyType === 'Deleted' || dirtyType === 'New') succDepStore.remove(depRec); // the depRec was deleted by someone else
						else {
							for(key in realDep)
								if(!_.isEqual(depRec.get(key), realDep[key])){ remoteChanged = true; break; }
							if(remoteChanged){
								depRec.beginEdit();
								for(key in realDep) depRec.set(key, realDep[key]);
								depRec.endEdit();
							}
						}
					}
					realSuccDepsData.forEach(function(realDep){ 
						console.log('adding succDep', realDep);
						succDepStore.add(Ext.create('IntelSuccDep', Ext.clone(realDep)));
					});
					succDepStore.resumeEvents();
				}
			});
			
			var filterReqTeamSucc = null, 
				filterReqFIDSucc = null, 
				filterReqNameSucc = null, 
				filterNeededBySucc = null,
				filterSupSucc = null, 
				filterFIDSucc = null, 
				filterNameSucc = null;
			function succDepGridFilter(r){
				if(filterReqTeamSucc && me.ProjectsWithTeamMembers[r.data.SuccProjectID].data.Name != filterReqTeamSucc) return false;
				if(filterReqFIDSucc && r.data.SuccFormattedID != filterReqFIDSucc) return false;
				if(filterReqNameSucc && r.data.SuccUserStoryName != filterReqNameSucc) return false;
				if(filterNeededBySucc && me._roundDateDownToWeekStart(r.data.Checkpoint)*1 != filterNeededBySucc) return false;
				if(filterSupSucc && r.data.Supported != filterSupSucc) return false;
				if(filterFIDSucc && (!r.data.Supported || r.data.FormattedID != filterFIDSucc)) return false;
				if(filterNameSucc && (!r.data.Supported || r.data.UserStoryName != filterNameSucc)) return false;
				return true;
			}
			function filterSuccDepRowsByFn(fn){
				_.each(me.CustomSuccDepStore.getRange(), function(item, index){
					if(fn(item)) me.SuccDepGrid.view.removeRowCls(index, 'hidden');
					else me.SuccDepGrid.view.addRowCls(index, 'hidden');
				});
			}
			function removeSuccFilters(){
				filterReqTeamSucc = null;
				filterReqFIDSucc = null;
				filterReqNameSucc = null;
				filterNeededBySucc = null; 
				filterSupSucc = null;
				filterFIDSucc = null;
				filterNameSucc = null;
				filterSuccDepRowsByFn(function(){ return true; });
				Ext.getCmp('succ-dep-f-team').setValue('All');
				Ext.getCmp('succ-dep-f-req-fid').setValue('All');
				Ext.getCmp('succ-dep-f-req-name').setValue('All');
				Ext.getCmp('succ-dep-f-needed-by').setValue('All');
				Ext.getCmp('succ-dep-f-sup').setValue('All');
				Ext.getCmp('succ-dep-f-fid').setValue('All');
				Ext.getCmp('succ-dep-f-name').setValue('All');
			}
			
			function getSuccReqTeamOptions(){
				return [{TeamName: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomSuccDepStore.getRange(), 
					function(r){ return me.ProjectsWithTeamMembers[r.data.SuccProjectID].data.Name; })),
					function(teamName){ return teamName; }), 
					function(teamName){ return {TeamName:teamName}; }));
			}		
			function getSuccReqFIDfilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomSuccDepStore.getRange(), 
					function(r){ return r.data.SuccFormattedID; })), 
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getSuccReqNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomSuccDepStore.getRange(), 
					function(r){ return r.data.SuccUserStoryName; })), 
					function(f){ return f; }), 
					function(n){ return {Name:n}; }));
			}
			function getSuccNeededByFilterOptions(){
				return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomSuccDepStore.getRange(),
					function(risk){ return me._roundDateDownToWeekStart(risk.data.Checkpoint)*1; })),
					function(date){ return date; }),
					function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
			}
			function getSuccFIDfilterOptions(){
				return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.filter(_.union(_.map(me.CustomSuccDepStore.getRange(), 
					function(r){ return r.data.Supported == 'Yes' ? r.data.FormattedID : ''; })), 
					function(f){ return f !== ''; }),
					function(f){ return f; }), 
					function(f){ return {FormattedID:f}; }));
			}
			function getSuccNameFilterOptions(){
				return [{Name: 'All'}].concat(_.map(_.sortBy(_.filter(_.union(_.map(me.CustomSuccDepStore.getRange(), 
					function(r){ return r.data.Supported == 'Yes' ? r.data.UserStoryName : ''; })), 
					function(f){ return f !== ''; }),
					function(f){ return f; }), 
					function(n){ return {Name:n}; }));
			}
			function updateSuccFilterOptions(){
				var teamStore = Ext.getCmp('succ-dep-f-team').getStore(),
					reqFidStore = Ext.getCmp('succ-dep-f-req-fid').getStore(),
					reqNameStore = Ext.getCmp('succ-dep-f-req-name').getStore(),
					cpStore = Ext.getCmp('succ-dep-f-needed-by').getStore(),
					fidStore = Ext.getCmp('succ-dep-f-fid').getStore(),
					nameStore = Ext.getCmp('succ-dep-f-name').getStore();
				teamStore.removeAll();
				teamStore.add(getSuccReqTeamOptions());
				reqFidStore.removeAll();
				reqFidStore.add(getSuccReqFIDfilterOptions());
				reqNameStore.removeAll();
				reqNameStore.add(getSuccReqNameFilterOptions());
				cpStore.removeAll();
				cpStore.add(getSuccNeededByFilterOptions());
				fidStore.removeAll();
				fidStore.add(getSuccFIDfilterOptions());
				nameStore.removeAll();
				nameStore.add(getSuccNameFilterOptions());
			}
			
			var succDepColumnCfgs = [
				{
					text:'Requested By', //'Predecesor Project',
					dataIndex:'SuccProjectID',
					width:160,
					resizable:false,
					draggable:false,
					sortable:true,
					renderer: function(pid){ return me.ProjectsWithTeamMembers[pid].data.Name; },
					layout:'hbox',
					items:[{
						id:'succ-dep-f-team',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['TeamName'],
							data: getSuccReqTeamOptions()
						}),
						displayField: 'TeamName',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.TeamName == 'All') filterReqTeamSucc = null; 
								else filterReqTeamSucc = selected[0].data.TeamName;
								filterSuccDepRowsByFn(succDepGridFilter);
							}
						}
					}, {xtype:'container', width:5}]
				},{
					text:'Req Team US#',
					dataIndex:'SuccFormattedID',
					width:90,
					resizable:false,
					draggable:false,
					sortable:true,
					layout:'hbox',
					items:[{
						id:'succ-dep-f-req-fid',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['FormattedID'],
							data: getSuccReqFIDfilterOptions()
						}),
						displayField: 'FormattedID',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.FormattedID == 'All') filterReqFIDSucc = null; 
								else filterReqFIDSucc = selected[0].data.FormattedID;
								filterSuccDepRowsByFn(succDepGridFilter);
							}
						}
					}, {xtype:'container', width:5}]
				},{
					text:'Req Team UserStory',
					dataIndex:'SuccUserStoryName',
					flex:1,
					resizable:false,
					draggable:false,
					sortable:true,
					layout:'hbox',
					items:[{
						id:'succ-dep-f-req-name',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['Name'],
							data: getSuccReqNameFilterOptions()
						}),
						displayField: 'Name',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.Name == 'All') filterReqNameSucc = null; 
								else filterReqNameSucc = selected[0].data.Name;
								filterSuccDepRowsByFn(succDepGridFilter);
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
					dataIndex:'Checkpoint',
					width:80,
					resizable:false,
					draggable:false,
					editor: false,
					sortable:true,
					renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');},
					layout:'hbox',
					items:[{
						id:'succ-dep-f-needed-by',
						xtype:'intelfixedcombo',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							model:'WorkweekDropdown',
							data: getSuccNeededByFilterOptions()
						}),
						displayField: 'Workweek',
						valueField: 'DateVal',
						value:'All',
						listeners:{
							focus: function(combo) { combo.expand(); },
							select: function(combo, selected){
								if(selected[0].data.DateVal === 0) filterNeededBySucc = null; 
								else filterNeededBySucc = selected[0].data.DateVal;
								filterSuccDepRowsByFn(succDepGridFilter);
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
						if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
						else if(val == 'Yes') meta.tdCls = 'intel-supported-cell';
						return val;
					},
					sortable:true,
					layout:'hbox',
					items:[{
						id:'succ-dep-f-sup',
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
								if(selected[0].data.Sup === 'All') filterSupSucc = null; 
								else filterSupSucc = selected[0].data.Sup;
								filterSuccDepRowsByFn(succDepGridFilter);
							}
						}
					}, {xtype:'container', width:5}]
				},{
					text:'Sup US#', 
					dataIndex:'FormattedID',
					tdCls: 'intel-editor-cell',
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
					renderer:function(val){ return val || '-'; },
					layout:'hbox',
					items:[{
						id:'succ-dep-f-fid',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['FormattedID'],
							data: getSuccFIDfilterOptions()
						}),
						displayField: 'FormattedID',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.FormattedID == 'All') filterFIDSucc = null; 
								else filterFIDSucc = selected[0].data.FormattedID;
								filterSuccDepRowsByFn(succDepGridFilter);
							}
						}
					}, {xtype:'container', width:5}]
				},{
					text:'Sup UserStory', 
					dataIndex:'UserStoryName',
					flex:1,
					resizable:false,
					draggable:false,
					tdCls: 'intel-editor-cell',
					editor:{
						xtype:'intelcombobox',
						store: me.UserStoryNameStore,
						displayField: 'Name'
					},
					sortable: true,
					renderer:function(val){ return val || '-'; },	
					layout:'hbox',
					items:[{
						id:'succ-dep-f-name',
						xtype:'intelcombobox',
						flex:1,
						store: Ext.create('Ext.data.Store', {
							fields:['Name'],
							data: getSuccNameFilterOptions()
						}),
						displayField: 'Name',
						value:'All',
						listeners:{
							select: function(combo, selected){
								if(selected[0].data.Name == 'All') filterNameSucc = null; 
								else filterNameSucc = selected[0].data.Name;
								filterSuccDepRowsByFn(succDepGridFilter);
							}
						}
					}, {xtype:'container', width:5}]	
				},{
					text:'',
					dataIndex:'Edited',
					width:30,
					xtype:'fastgridcolumn',
					tdCls: 'iconCell',
					resizable:false,
					draggable:false,
					renderer: function(value, meta, succDepRecord){			
						if(!succDepRecord.data.FormattedID) return '';
						meta.tdAttr = 'title="' + 'Remove User Story' + '"';
						return {
							xtype:'container',
							width:20,
							cls: 'minus-button intel-editor-cell',
							listeners:{
								click: {
									element: 'el',
									fn: function(){
										succDepRecord.set('Edited', true);
										succDepRecord.set('Assigned', false);
										succDepRecord.set('FormattedID', '');
										succDepRecord.set('UserStoryName', '');
										updateSuccFilterOptions();
									}
								}
							}
						};
					}
				},{
					text:'',
					dataIndex:'Edited',
					width:30,
					xtype:'fastgridcolumn',
					tdCls: 'iconCell',
					resizable:false,
					draggable:false,
					renderer: function(value, meta, succDepRecord){		
						var realDepData = me._spliceDepFromList(succDepRecord.data.DependencyID, me.DependenciesParsedData.Successors.slice(0)),
							dirtyType = me._getDirtyType(succDepRecord, realDepData);
						if(dirtyType !== 'Edited') return ''; //don't render it!
						meta.tdAttr = 'title="Undo"';
						return {
							xtype:'container',
							width:20,
							cls: 'undo-button intel-editor-cell',
							listeners:{
								click: {
									element: 'el',
									fn: function(){
										var depID = succDepRecord.data.DependencyID,
											realDep = me._spliceDepFromList(depID, me.DependenciesParsedData.Successors.slice(0));	
										succDepRecord.beginEdit(true);
										for(var key in realDep) succDepRecord.set(key, realDep[key]);
										succDepRecord.endEdit();
										updateSuccFilterOptions();
									}
								}
							}
						};
					}
				},{
					text:'',
					width:30,
					xtype:'fastgridcolumn',
					tdCls: 'iconCell',
					resizable:false,
					draggable:false,
					renderer: function(value, meta, succDepRecord){	
						var realDepData = me._spliceDepFromList(succDepRecord.data.DependencyID, me.DependenciesParsedData.Successors.slice(0)),
							dirtyType = me._getDirtyType(succDepRecord, realDepData);
						if(dirtyType !== 'Edited') return ''; //don't render it!
						meta.tdAttr = 'title="Save Dependency"';
						return {
							xtype:'container',
							width:20,
							cls: 'save-button intel-editor-cell',
							listeners:{
								click: {
									element: 'el',
									fn: function(){
										if(!succDepRecord.data.Supported){
											me._alert('ERROR', 'You must set the Supported field.'); return; }
										me.SuccDepGrid.setLoading(true);
										me._enqueue(function(unlockFunc){
											var succDepData = succDepRecord.data, 
												oldUSRecord, newUSRecord;
											me._getOldAndNewUSRecords(succDepData).then(function(records){
												oldUSRecord = records[0];
												newUSRecord = records[1];
												
												var realDepData = me._getRealDepData(oldUSRecord, succDepData, 'Successors'); //might be undefined if pred team deleted then readded this team on the dep!
												if(!realDepData) return Q.reject(['Successor removed this dependency.']);
												
												succDepData.ObjectID = newUSRecord.data.ObjectID;
												succDepData.SuccFormattedID = realDepData.SuccFormattedID;
												succDepData.SuccUserStoryName = realDepData.SuccUserStoryName;
												
												return me._updateSuccessor(succDepData, newUSRecord)
													.then(function(){									
														if(oldUSRecord.data.ObjectID !== newUSRecord.data.ObjectID)
															return me._removeSuccessor(oldUSRecord, realDepData);
													})
													.then(function(){ return me._addSuccessor(newUSRecord, succDepData); })
													.then(function(){ succDepRecord.set('Edited', false); });
											})
											.fail(function(reason){ //hacky way to tell if we should delete this successor dependency
												if(reason instanceof Array){
													me._alert('ERROR', reason[0] + ' Deleting this dependency now');
													if(realDepData){
														me._removeSuccessor(oldUSRecord, realDepData).then(function(){
															me.CustomSuccDepStore.remove(succDepRecord);
														})
														.fail(function(reason){
															me._alert('ERROR', reason);
														})
														.done();
													}
													else me.CustomSuccDepStore.remove(succDepRecord);
												}
												else me._alert('ERROR', reason);
											})
											.then(function(){
												updateSuccFilterOptions();
												me.SuccDepGrid.setLoading(false);
												unlockFunc();
											})
											.done();
										});
									}
								}
							}
						};
					}
				}
			];
			
			me.SuccDepGrid = me.add({
				xtype: 'rallygrid',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'grid-header-text',
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
							listeners:{ click: removeSuccFilters }
						}]
					}]
				},
				height:400,
				margin:'40 10 0 10',
				scroll:'vertical',
				columnCfgs: succDepColumnCfgs,
				disableSelection: true,
				plugins: [ 'fastcellediting' ],
				viewConfig:{
					xtype:'scrolltableview',
					stripeRows:true,
					preserveScrollOnRefresh:true,
					getRowClass: function(succDepRecord){ if(!succDepGridFilter(succDepRecord)) return 'hidden'; }
				},
				listeners: {
					sortchange: function(){
						filterSuccDepRowsByFn(succDepGridFilter);
					},
					beforeedit: function(editor, e){
						var succDepRecord = e.record;
						if(succDepRecord.data.Supported != 'Yes' && e.field != 'Supported') 
							return false; //don't user story stuff if not supported
					},
					edit: function(editor, e){					
						var grid = e.grid,
							succDepRecord = e.record,
							field = e.field,
							value = e.value,
							originalValue = e.originalValue;	
							
						if(value == originalValue) return;
						else if(!value) { succDepRecord.set(field, originalValue); return; }
						var previousEdit = succDepRecord.data.Edited;
						succDepRecord.set('Edited', true);
						
						var userStoryRecord;
						if(field === 'UserStoryName'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.Name === value; });
							if(!userStoryRecord){
								succDepRecord.set('UserStoryName', originalValue);
								succDepRecord.set('Edited', previousEdit); 
							} else {
								succDepRecord.set('FormattedID', userStoryRecord.data.FormattedID);	
								succDepRecord.set('Assigned', true);
							}
						} else if(field === 'FormattedID'){
							userStoryRecord = _.find(me.UserStoriesInRelease, function(us){ return us.data.FormattedID === value; });
							if(!userStoryRecord) {
								succDepRecord.set('FormattedID', originalValue);
								succDepRecord.set('Edited', previousEdit); 
							} else {
								succDepRecord.set('UserStoryName', userStoryRecord.data.Name);	
								succDepRecord.set('Assigned', true);
							}
						}
						else if(field === 'Supported'){ //cant be non-supported with a user story!
							if(value != 'Yes'){
								succDepRecord.set('Assigned', false);
								succDepRecord.set('FormattedID', '');
								succDepRecord.set('UserStoryName', '');
							}
						}
						updateSuccFilterOptions();
					}
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.CustomSuccDepStore
			});	
		}	
	});
}());