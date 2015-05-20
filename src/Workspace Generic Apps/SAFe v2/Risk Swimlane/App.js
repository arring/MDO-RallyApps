(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('RiskSwimlane', {
		extend: 'IntelRallyApp',
		cls:'RiskSwimlaneApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'AsyncQueue',
			'ParallelLoader',
			'RisksLib',
			'UserAppsPreference'
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
		
		_userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		_loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: _loadPortfolioItemsOfTypeInRelease');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: ['Name', 'ObjectID', 'FormattedID', 'c_Risks', 'Release', 
						'Project', 'PlannedEndDate', 'Parent', 'PortfolioItemType', 'Ordinal'],
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
			var me=this, deferred = Q.defer();
			me._enqueue(function(done){
				Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
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
						if(me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
						me.PortfolioItemStore = orderedPortfolioItemStores[0].store;
						
						//make the mapping of lowest to highest portfolioItems
						me.PortfolioItemMap = {};
						_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItemRecord){ //create the portfolioItem mapping
							var ordinal = 0, 
								parentPortfolioItemRecord = lowPortfolioItemRecord,
								getParentRecord = function(child, parentList){
									return _.find(parentList, function(parent){ 
										return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; 
									});
								};
							while(ordinal < (orderedPortfolioItemStores.length-1) && parentPortfolioItemRecord){
								parentPortfolioItemRecord = getParentRecord(parentPortfolioItemRecord, orderedPortfolioItemStores[ordinal+1].store.getRange());
								++ordinal;
							}
							if(ordinal === (orderedPortfolioItemStores.length-1) && parentPortfolioItemRecord) //has a mapping, so add it
								me.PortfolioItemMap[lowPortfolioItemRecord.data.ObjectID] = parentPortfolioItemRecord.data.Name;
						});
						
						//destroy the stores, so they get GCed
						orderedPortfolioItemStores.shift();
						while(orderedPortfolioItemStores.length) orderedPortfolioItemStores.shift().store.destroyStore();
					})
					.then(function(){ done(); deferred.resolve();})
					.fail(function(reason){ done(); deferred.reject(reason); })
					.done();
				}, 'PortfolioItemQueue');
			return deferred.promise;
		},		

		/**___________________________________ RISKS STUFF___________________________________**/
		_parseRisksFromPortfolioItem: function(portfolioItemRecord){
			var me=this,
				array = [], 
				risks = me._getRisks(portfolioItemRecord),
				PortfolioItemFormattedID = portfolioItemRecord.data.FormattedID,
				PortfolioItemName = portfolioItemRecord.data.Name;
				
			_.each(risks, function(risksData, projectID){
				_.each(risksData, function(riskData, riskID){
					array.push({
						_originalRiskData: Ext.merge({RiskID: riskID}, riskData),
						RiskID: riskID,
						Rank: 1,
						"PortfolioItem #": PortfolioItemFormattedID,
						"PortfolioItem Name": PortfolioItemName,
						"Project": (_.find(me.ProjectsWithTeamMembers, function(project){ return project.data.ObjectID == projectID; }) || {data: {}}).data.Name || '?',
						"Risk Description": riskData.Description,
						Impact: riskData.Impact,
						MitigationPlan: riskData.MitigationPlan || " ",
						Urgency: riskData.Urgency || 'Undefined',
						Status: riskData.Status,
						Contact: riskData.Contact,
						Checkpoint: 'ww' + me._getWorkweek(riskData.Checkpoint),
						updatable: true
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
		_saveRisk: function(riskData){
			var me=this,
				data = Ext.clone(riskData)._originalRiskData,
				portfolioItem = _.find(me.PortfolioItemStore.getRange(), function(pi){ return pi.data.FormattedID == riskData['PortfolioItem #']; }),
				projectRecord = _.find(me.ProjectsWithTeamMembers, function(project){ return project.data.Name == riskData.Project; });
			data.Urgency = riskData.Urgency;
			data.Status = riskData.Status;
			me._addRisk(portfolioItem, data, projectRecord); 
		},
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		_showSwimlanes: function(){
			var me=this;
			if(!me.RisksSwimlanes) me._loadRisksSwimlanes();
		},	
		_updateSwimlanes: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.MatrixStore) me.MatrixStore.intelUpdate();
			}
		},
		_clearEverything: function(){
			var me=this;
			
			if(me.RiskSwimlanes) {
				document.getElementById('risk-swimlanes').remove(); //can't properly destroy this because there is a bug in column.destroy() code
				me.RiskSwimlanes = undefined;
			}	
		},
		_reloadStores: function(){
			var me=this;
			return me._loadPortfolioItems()
				.then(function(){
					me.Risks = me._parseRisksData();
				});
		},
		
		_reloadEverything: function(){
			var me=this;

			me.setLoading('Loading Data');
			me._enqueue(function(done){
				me._reloadStores()
					.then(function(){
						me._clearEverything();
						if(!me.ReleasePicker) me._loadReleasePicker();			
					})
					.then(function(){ me._updateSwimlanes(); })
					.then(function(){ me._showSwimlanes(); })
					.fail(function(reason){ me._alert('ERROR', reason); })
					.then(function(){ me.setLoading(false); done(); })
					.done();
			}, 'ReloadAndRefreshQueue'); //eliminate race conditions between manual _reloadEverything and interval _refreshDataFunc
		},

		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.setLoading('Loading configuration');
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
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
					return Q.all([ //3 streams
						me._projectInWhichTrain(me.ProjectRecord) /********* 1 ********/
							.then(function(trainRecord){
								if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID){
									me.TrainRecord = trainRecord;
									return me._loadTrainPortfolioProject(me.TrainRecord)
										.then(function(trainPortfolioProject){
											if(!trainPortfolioProject) return Q.reject('Invalid portfolio location');
											me.TrainPortfolioProject = trainPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a train');
							}),
						me._loadAppsPreference() /********* 2 ********/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							}),
						me._loadProjectsWithTeamMembers() /********* 3 ************/
							.then(function(projectsWithTeamMembers){
								me.ProjectsWithTeamMembers = projectsWithTeamMembers;
								me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
							})
					]);
				})
				.then(function(){ 
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
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ me._reloadEverything(); })
				.done();
		},				
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeftVert').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me._releasePickerSelected.bind(me) }
			});
		},	

		/************************************************************* RENDER ********************************************************************/
		_loadRisksSwimlanes: function(){
			var me = this, 
				customStore = Ext.create('Ext.data.Store', {	//need to add custom store to go along with the _queryForData override
					data: me.Risks,
					sorters: [{property: Rally.data.Ranker.RANK_FIELDS.MANUAL, direction: 'ASC'}],
					model: 'IntelSwimlaneRiskForTracking',
					proxy: {
						type:'sessionstorage',
						id:'Risk-Swimlane-' + (Math.random()*1000000>>0)
					},
					reloadRecord: function(record){ //because wsapi.Store has this apparently 
						if(typeof record === 'string') return Deft.Promise.when(this.getById(record));
						else return Deft.Promise.when(record); 
					} 
				});
			_.each(customStore.getRange(), function(model){ model.setProxy(model.store.proxy); });	//since we are overriding Ext.data.Model need to reset proxy
			
			me.RiskSwimlanes = me.add({
				xtype:'rallycardboard',
				id:'risk-swimlanes',
				models: [Ext.ClassManager.get('IntelSwimlaneRiskForTracking')],	//need to instantiate this
				plugins: [{
					ptype: 'rallyscrollablecardboard',
					containerEl: this.getEl()
				},{
					ptype: 'rallyfixedheadercardboard'
				}],
				shouldRetrieveModels: function(){ return false; },							//override private function
				addRow: function(item, applySort) {															//override private function
					var value = item.isModel ? item.getData() : item;
					return this._createRow({showHeader: true, value: item.Urgency}, applySort);
        },
				_refreshAssociatedCards: function(record, changedFields) {			//this has to be overriden because it called getAssociatedRefs()
					this.refreshCard(record.getId());
        },
				attribute: 'Status',
				enableRanking:true, //if we set this to false, there is a bug in ColumnDropTarget.notifyOver where it indexes into cards[] wrong
				cardConfig: {
					xtype: 'rallycard',
					fields: ['PortfolioItem #', 'PortfolioItem Name', 'Project', 'Contact', 'Checkpoint', 'Risk Description', 'Impact', 'MitigationPlan'],
					showGearIcon: false
				},
				rowConfig: {
					field: 'Urgency',
					values: ['1-Hot', '2-Watch', '3-Simmer', 'Undefined'],
					enableCrossRowDragging: true
				},
				store: customStore,
				columns: _.map(['Undefined', 'Resolved', 'Owned', 'Accepted', 'Mitigated'], function(status){
					return {
						xtype: 'rallycardboardcolumn',
						value: status,
						columnHeaderConfig: { headerTpl: status},
						_queryForData: function() {		//override private function so board doesn't use storeConfig, but the passed in store object instead
							var me=this;
							this.store = this.ownerCardboard.store;
							this.fireEvent('storeload', this.store, this.store.getRange(), true);
							setTimeout(function(){ me._createAndAddCardsFromStore(me.store); }, 100);	//setting the timeout allows the board to render (avoids errors)
            }
					};
				}),
				listeners: {
					cardupdated: function(card){
						var cardID = card.record.data.RiskID;
						if(window[cardID]) return; //throttle the saving. this gets called 2 consecutive times per d-n-d
						else {
							window[cardID] = true;
							setTimeout(function(){ window[cardID] = false; }, 100);
							me._saveRisk(card.record.data);
						}
					}
				}
			});	
		}
	});
}());