/** 
	all dependencies are injected (pun intended), it assumes nothing about the app its mixed into other than it has to derive from IntelRallyApp 
	
	TODO: GETRID OF THIS FILE AND MOVE DEPENDENCIES TO DependencyDb which follows suit of RiskDb. A centralized location for dependencies. and a testable
	interface to them.
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	var RALLY_MAX_STRING_SIZE = 32768;
	
	Ext.define('Intel.SAFe.lib.mixin.DependenciesLib', {
		requires: ['Intel.lib.IntelRallyApp'],
		
		getDependencies: function(userStoryRecord){
			var dependencies, dependencyString = userStoryRecord.data.c_Dependencies;
			if(dependencyString === '') dependencies = { Predecessors:{}, Successors:{} };
			else {
				try {dependencies = JSON.parse(atob(dependencyString));}
				catch(e) { dependencies = { Predecessors:{}, Successors:{} }; }
			}		
			if(!dependencies.Predecessors || dependencies.Predecessors.constructor.name != 'Object') dependencies.Predecessors = {};
			if(!dependencies.Successors || dependencies.Successors.constructor.name != 'Object') dependencies.Successors = {};
			return dependencies;
		},	
		
		_syncCollection: function(userStoryRecord, depsToAdd, depsToRemove, collectionType){
			/** this function modifies the Predecessor and Successor built in fields on UserStories in Rally to reflect the
				dependencies made in the programBoard. These fields are edited before the c_Dependencies field is saved on the UserStory */
			var me=this, syncDeferred = Q.defer();
			
			depsToAdd = _.filter(depsToAdd, function(objectID){ return !!objectID; });
			depsToRemove = _.filter(depsToRemove, function(objectID){ return !!objectID; });
				
			userStoryRecord.getCollection(collectionType).load({
				fetch:['ObjectID'],
				callback: function(){
					var promises = [],
						syncCollectionProxy = false,
						collectionStore = this,
						collectionRecords = collectionStore.getRange();
					_.each(depsToAdd, function(userStoryObjectID){
						if(!_.find(collectionRecords, function(cr){ return cr.data.ObjectID === userStoryObjectID; })){
							promises.push(me.loadUserStory(userStoryObjectID).then(function(us){
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
		removePredecessor: function(userStoryRecord, predecessorData, currentProjectRecord, dependenciesParsedData){
			dependenciesParsedData = dependenciesParsedData || {};
			dependenciesParsedData.Predecessors = dependenciesParsedData.Predecessors || [];
			
			var me=this, 
				dependencies = me.getDependencies(userStoryRecord),
				cachedPredecessors = dependenciesParsedData.Predecessors,
				depsToAdd = [], 
				depsToRemove = [], 
				dependencyID = predecessorData.DependencyID;

			depsToRemove = _.map(dependencies.Predecessors[dependencyID].PredecessorItems || [], function(item){ 
				return item.PredecessorUserStoryObjectID;
			});
			
			delete dependencies.Predecessors[dependencyID];
			
			if(!currentProjectRecord || (userStoryRecord.data.Project.ObjectID === currentProjectRecord.data.ObjectID)){
				cachedPredecessors = _.filter(cachedPredecessors, function(cachedPredecessor){ 
					return cachedPredecessor.DependencyID !== dependencyID; 
				});
				dependenciesParsedData.Predecessors = cachedPredecessors;
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
		removeSuccessor: function(userStoryRecord, successorData, currentProjectRecord, dependenciesParsedData){
			dependenciesParsedData = dependenciesParsedData || {};
			dependenciesParsedData.Successors = dependenciesParsedData.Successors || [];
			
			var me=this, 
				dependencies = me.getDependencies(userStoryRecord),
				cachedSuccessors = dependenciesParsedData.Successors,
				depsToAdd = [],
				depsToRemove = [successorData.SuccessorUserStoryObjectID], 
				dependencyID = successorData.DependencyID;
				
			delete dependencies.Successors[dependencyID]; 
			
			if(!currentProjectRecord || (userStoryRecord.data.Project.ObjectID === currentProjectRecord.data.ObjectID)){
				cachedSuccessors = _.filter(cachedSuccessors, function(cachedSuccessor){ 
					return cachedSuccessor.DependencyID !== dependencyID; 
				});
				dependenciesParsedData.Successors = cachedSuccessors;
			}

			_.each(dependencies.Successors, function(successor){
				if(successor.Assigned){
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
		addPredecessor: function(userStoryRecord, predecessorData, currentProjectRecord, dependenciesParsedData){ 
			dependenciesParsedData = dependenciesParsedData || {};
			dependenciesParsedData.Predecessors = dependenciesParsedData.Predecessors || [];
			
			var me=this, 
				dependencies = me.getDependencies(userStoryRecord),
				cachedPredecessors = dependenciesParsedData.Predecessors,
				depsToAdd = [], 
				dependencyID = predecessorData.DependencyID;
			
			predecessorData = Ext.clone(predecessorData);
			predecessorData.Edited = false;
					
			dependencies.Predecessors[dependencyID] = {
				Description: predecessorData.Description,
				NeededBy: predecessorData.NeededBy,
				Plan: predecessorData.Plan,
				Status: predecessorData.Status,
				PredecessorItems: predecessorData.PredecessorItems
			};

			if(!currentProjectRecord || (userStoryRecord.data.Project.ObjectID === currentProjectRecord.data.ObjectID)){
				cachedPredecessors = _.filter(cachedPredecessors, function(cachedPredecessor){ 
					return cachedPredecessor.DependencyID !== dependencyID; 
				});
				cachedPredecessors.push(predecessorData);
				dependenciesParsedData.Predecessors = cachedPredecessors;
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
		addSuccessor: function(userStoryRecord, successorData, currentProjectRecord, dependenciesParsedData){ 
			dependenciesParsedData = dependenciesParsedData || {};
			dependenciesParsedData.Successors = dependenciesParsedData.Successors || [];
			
			var me=this, 
				dependencies = me.getDependencies(userStoryRecord),
				cachedSuccessors = dependenciesParsedData.Successors,
				depsToAdd = [],
				dependencyID = successorData.DependencyID;
			
			successorData = Ext.clone(successorData);
			successorData.Edited = false;
				
			dependencies.Successors[dependencyID] = {
				SuccessorUserStoryObjectID: successorData.SuccessorUserStoryObjectID,
				SuccessorProjectObjectID: successorData.SuccessorProjectObjectID,
				Description: successorData.Description,
				NeededBy: successorData.NeededBy,
				Supported: successorData.Supported,
				Assigned: successorData.Assigned
			};

			if(!currentProjectRecord || (userStoryRecord.data.Project.ObjectID === currentProjectRecord.data.ObjectID)){
				cachedSuccessors = _.filter(cachedSuccessors, function(cachedSuccessor){ 
					return cachedSuccessor.DependencyID !== dependencyID; 
				});
				cachedSuccessors.push(successorData);
				dependenciesParsedData.Successors = cachedSuccessors;
			}

			_.each(dependencies.Successors, function(successor){ 
				depsToAdd = _.union(depsToAdd, [successor.SuccessorUserStoryObjectID]);
			});
			
			return me._syncCollection(userStoryRecord, depsToAdd, [], 'Successors').then(function(){
				return me._collectionSynced(userStoryRecord, dependencies);
			});
		},	
	
		getOldAndNewUserStoryRecords: function(dependencyData, userStoryList){
			var me = this,
				newUserStoryRecord = _.find(userStoryList, function(userStory){
					return userStory.data.FormattedID == dependencyData.UserStoryFormattedID;
				});
				
			function loadOriginalParent(){
				return Q(dependencyData.UserStoryObjectID ? me.loadUserStory(dependencyData.UserStoryObjectID) : null)
				.then(function(oldUserStoryRecord){
					newUserStoryRecord = newUserStoryRecord || oldUserStoryRecord;
					return [oldUserStoryRecord, newUserStoryRecord];
				});
			}
			
			if(newUserStoryRecord){
				return me.loadUserStory(newUserStoryRecord.data.ObjectID).then(function(userStoryRecord){
					newUserStoryRecord = userStoryRecord; 
					return loadOriginalParent();
				});
			} else {
				newUserStoryRecord = null;
				return loadOriginalParent();
			}
		},	
		getPredecessorItemArrays: function(localPredecessorData, realPredecessorData){ 
			/** returns arrays of the team dependencies from the dependency grouped on their status */
			var me=this, 
				addedItemsData = [], 
				updatedItemsData = [], 
				removedItemsData = [], 
				localPredecessorItemsData = localPredecessorData.PredecessorItems || [], 
				realPredecessorItemsData  = realPredecessorData ? (realPredecessorData.PredecessorItems || []) : [];
			if(!realPredecessorItemsData.length) addedItemsData = localPredecessorItemsData;
			else {		
				Outer:
				for(var i=0;i<localPredecessorItemsData.length;++i){
					for(var j=realPredecessorItemsData.length-1;j>=0;--j){
						if(localPredecessorItemsData[i].PredecessorItemID === realPredecessorItemsData[j].PredecessorItemID){
							updatedItemsData.push(realPredecessorItemsData.splice(j,1)[0]);
							continue Outer;
						}
					}
					addedItemsData.push(localPredecessorItemsData[i]); //teams we just added
				}
				removedItemsData = realPredecessorItemsData; //teams that we just removed	(we didn't splice them out of realPredecessorItemsData)
			}
			return {
				added: addedItemsData,
				updated: updatedItemsData,
				removed: removedItemsData
			};
		},	
		/* returns functions that add successor objects to each of the predecessorItems in the dependency */
		getAddedPredecessorItemCallbacks: function(
				predecessorItemsData, 
				predecessorData, 
				successorProjectRecord, 
				projectOIDmap, 
				currentProjectRecord, 
				dependenciesParsedData){ 
			var me=this, 
				permissions = me.getContext().getPermissions();
			return Q.all(_.map(predecessorItemsData, function(predecessorItemData){
				return function(){
					var predecessorProjectRecord = projectOIDmap[predecessorItemData.PredecessorProjectObjectID];
					if(!permissions.isProjectEditor(predecessorProjectRecord)) 
						return Q.reject('You lack permissions to modify project: ' + predecessorProjectRecord.data.Name);
					else {
						return me.loadRandomUserStoryFromReleaseTimeframe(predecessorProjectRecord, me.ReleaseRecord).then(function(newUserStory){
							if(!newUserStory){
								return Q.reject('Project ' + predecessorProjectRecord.data.Name + ' has no user stories in this Release, cannot continue');
							} else {
								var newSuccessorDependency = {
									DependencyID: predecessorData.DependencyID,
									SuccessorUserStoryObjectID: predecessorData.UserStoryObjectID,
									SuccessorProjectObjectID: successorProjectRecord.data.ObjectID,
									UserStoryObjectID: newUserStory.data.ObjectID,
									UserStoryFormattedID: '',
									UserStoryName: '',
									Description: predecessorData.Description,
									NeededBy: predecessorData.NeededBy,
									Supported: predecessorItemData.Supported,
									Assigned: false,
									Edited: false
								};
								predecessorItemData.PredecessorUserStoryObjectID = newUserStory.data.ObjectID;
								return me.addSuccessor(newUserStory, newSuccessorDependency, currentProjectRecord, dependenciesParsedData);
							}
						});
					}
				};
			}));
		},	
		/* returns functions that update successor objects to each of the predecessorItems in the dependency */
		getUpdatedPredecessorItemCallbacks: function(
				predecessorItemsData, 
				predecessorData, 
				successorProjectRecord, 
				projectOIDmap,
				currentProjectRecord, 
				dependenciesParsedData){
			/** NOTE: we dont have to worry about an updated predecessorItem being added to a different predecessor userstory because
				users cannot change the project or userstory of a predecessorItem from the 'dependencies we have on other teams' grid.
				This means we don't have to worry about cloning successor items inside this function
			*/
			var me=this, 
				permissions = me.getContext().getPermissions();
			return Q.all(_.map(predecessorItemsData, function(predecessorItemData){
				return function(){
					var predecessorProjectRecord = projectOIDmap[predecessorItemData.PredecessorProjectObjectID];
					if(!permissions.isProjectEditor(predecessorProjectRecord)) 
						return Q.reject('You lack permissions to modify project: ' + predecessorProjectRecord.data.Name);
					else {
						var updatedSuccessorDependency = {
							DependencyID: predecessorData.DependencyID,
							SuccessorUserStoryObjectID: predecessorData.UserStoryObjectID,
							SuccessorProjectObjectID: successorProjectRecord.data.ObjectID,
							UserStoryObjectID: 0, //need to set this after _loadUserStory
							UserStoryFormattedID: '', //need to set this after _loadUserStory
							UserStoryName: '', //need to set this after _loadUserStory
							Description: predecessorData.Description,
							NeededBy: predecessorData.NeededBy,
							Supported: predecessorItemData.Supported,
							Assigned: false, //need to set this after _loadUserStory
							Edited: false
						};
						return me.loadUserStory(predecessorItemData.PredecessorUserStoryObjectID).then(function(userStory){
							if(!userStory){
								return me.loadRandomUserStoryFromReleaseTimeframe(predecessorProjectRecord, me.ReleaseRecord)
								.then(function(newUserStory){
									if(!newUserStory){
										return Q.reject('Project ' + predecessorProjectRecord.data.Name + ' has no user stories in this Release, cannot continue');
									} else {
										predecessorItemData.PredecessorUserStoryObjectID = newUserStory.data.ObjectID;
										predecessorItemData.Assigned = false;
										
										updatedSuccessorDependency.UserStoryObjectID = newUserStory.data.ObjectID;
										updatedSuccessorDependency.UserStoryFormattedID = '';
										updatedSuccessorDependency.UserStoryName = '';
										updatedSuccessorDependency.Assigned = false;						
										return me.addSuccessor(newUserStory, updatedSuccessorDependency, currentProjectRecord, dependenciesParsedData); 
									}
								});
							} else {
								updatedSuccessorDependency.UserStoryObjectID = userStory.data.ObjectID;
								updatedSuccessorDependency.UserStoryFormattedID = userStory.data.FormattedID;
								updatedSuccessorDependency.UserStoryName = userStory.data.Name;
								updatedSuccessorDependency.Assigned = predecessorItemData.Assigned;
								return me.addSuccessor(userStory, updatedSuccessorDependency, currentProjectRecord, dependenciesParsedData);
							}
						});
					}
				};
			}));
		},	
		/* returns functions that remove successor objects for each of the predecessorItems in the dependency */
		getRemovedPredecessorItemCallbacks: function(
				predecessorItemsData, 
				predecessorData, 
				successorProjectRecord, 
				projectOIDmap,
				currentProjectRecord, 
				dependenciesParsedData){
			var me=this, 
				permissions = me.getContext().getPermissions();
			return Q.all(_.map(predecessorItemsData, function(predecessorItemData){
				return function(){
					var predecessorProjectRecord = projectOIDmap[predecessorItemData.PredecessorProjectObjectID];
					if(!permissions.isProjectEditor(predecessorProjectRecord)) 
						return Q.reject('You lack permissions to modify project: ' + predecessorProjectRecord.data.Name);
					else {
						return me.loadUserStory(predecessorItemData.PredecessorUserStoryObjectID).then(function(userStory){
							if(userStory){
								var successorDependency = {
									DependencyID: predecessorData.DependencyID,
									SuccessorUserStoryObjectID: predecessorData.UserStoryObjectID,
									SuccessorProjectObjectID: successorProjectRecord.data.ObjectID,
									UserStoryObjectID: userStory.data.ObjectID,
									UserStoryFormattedID: '',
									UserStoryName: '',
									Description: '',
									NeededBy: 0,
									Supported: '',
									Assigned: predecessorItemData.Assigned,
									Edited: false
								};
								return me.removeSuccessor(userStory, successorDependency, currentProjectRecord, dependenciesParsedData);
							}
						});
					}
				};
			}));
		},
		/* Updates a single PredecessorItem on the successor for a dependency */
		updateSuccessor: function(
				predecessorUserStory, 
				successorData, 
				predecessorProjectRecord, 
				projectOIDmap,
				currentProjectRecord, 
				dependenciesParsedData){
			var me=this, 
				permissions = me.getContext().getPermissions(),
				successorProjectRecord = projectOIDmap[successorData.SuccessorProjectObjectID];
			if(!permissions.isProjectEditor(successorProjectRecord)){
				return Q.reject('You lack permissions to modify project: ' + successorProjectRecord.data.Name);
			} else {
				return me.loadUserStory(successorData.SuccessorUserStoryObjectID).then(function(userStory){
					if(!userStory) return Q.reject({SuccessorDeletedDependency:true, message:'Successor UserStory has been deleted.'});
					else {
						var successorsDependencies = me.getDependencies(userStory),
							successorsDependency = successorsDependencies.Predecessors[successorData.DependencyID];
						if(successorsDependency){
							var predecessorData = {
								DependencyID: successorData.DependencyID,
								UserStoryObjectID: userStory.data.ObjectID,
								UserStoryFormattedID: userStory.data.FormattedID,
								UserStoryName: userStory.data.Name,
								Description: successorsDependency.Description,
								NeededBy: successorsDependency.NeededBy,
								Plan: successorsDependency.Plan,
								Status: successorsDependency.Status,
								PredecessorItems: successorsDependency.PredecessorItems || [], 
								Edited: false
							};
							var predecessorItem = _.find(predecessorData.PredecessorItems, function(predecessorItem){
								return predecessorItem.PredecessorProjectObjectID == predecessorProjectRecord.data.ObjectID;
							});
							if(predecessorItem){
								predecessorItem.PredecessorUserStoryObjectID = predecessorUserStory.data.ObjectID;
								predecessorItem.Supported = successorData.Supported;
								predecessorItem.Assigned = successorData.Assigned;
								return me.addPredecessor(userStory, predecessorData, currentProjectRecord, dependenciesParsedData);
							}
							else return Q.reject({SuccessorDeletedDependency:true, message:'Successor removed this dependency.'});
						}
						else return Q.reject({SuccessorDeletedDependency:true, message:'Successor removed this dependency.'});
					} 
				});
			}
		}
	});
}());