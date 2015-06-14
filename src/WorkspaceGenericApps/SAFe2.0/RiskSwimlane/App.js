/** 
	RiskIDs are in the form of risk-<releaseName>-<scrumGroupRootProjectObjectID>-<random string> 
	
	App only works with ScrumGroups that have been configured in WorkspaceConfig app. 
	You must have Database Project set in WorkspaceConfig app as well.
*/

(function(){
	var Ext = window.Ext4 || window.Ext,
		RiskDb = Intel.SAFe.lib.resources.RiskDb;

	Ext.define('RiskSwimlane', {
		extend: 'IntelRallyApp',
		cls:'RiskSwimlaneApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
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
		
		/**___________________________________ UTIL FUNCS ___________________________________*/	
		_getRandomString: function(){
			return new Date()*1 + '' + (Math.random()*10000 >> 0);
		},
		_generateRiskID: function(){
			return 'risk-' + this.ReleaseRecord.data.Name + '-' + this.ScrumGroupRootRecord.data.ObjectID + '-' + this._getRandomString();
		},
		
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
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me._loadPortfolioItemsOfType(me.TrainPortfolioProject, type) : 
						me._loadPortfolioItemsOfTypeInRelease(me.TrainPortfolioProject, type)
					);
				}))
				.then(function(portfolioItemStores){
					if(me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
					me.PortfolioItemStore = portfolioItemStores[0];
					
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
						while(ordinal < (portfolioItemStores.length-1) && parentPortfolioItemRecord){
							parentPortfolioItemRecord = getParentRecord(parentPortfolioItemRecord, portfolioItemStores[ordinal+1].getRange());
							++ordinal;
						}
						if(ordinal === (portfolioItemStores.length-1) && parentPortfolioItemRecord) //has a mapping, so add it
							me.PortfolioItemMap[lowPortfolioItemRecord.data.ObjectID] = parentPortfolioItemRecord.data.Name;
					});
					
					//destroy the stores, so they get GCed
					portfolioItemStores.shift();
					while(portfolioItemStores.length) portfolioItemStores.shift().destroyStore();
				})
				.then(function(){ deferred.resolve();})
				.fail(function(reason){ deferred.reject(reason); })
				.done();
		},		

		_loadRisks: function(){
			var me=this;
			RiskDb.query('risk-' + me.ReleaseRecord.data.Name + '-' + me.ScrumGroupRootRecord.data.ObjectID + '-').then(function(risks){
				me.Risks = risks;
			});
		},
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		_renderSwimlanes: function(){
			this._renderRiskSwimlanes();
		},	
		_updateSwimlanes: function(){
			if(this.MatrixStore) this.MatrixStore.intelUpdate();
		},
		_clearEverything: function(){
			if(this.RiskSwimlanes) {
				document.getElementById('risk-swimlanes').remove(); //can't properly destroy this because there is a bug in column.destroy() code
				this.RiskSwimlanes = undefined;
			}	
		},
		_reloadData: function(){
			var me=this;
			return Q.all([
				me._loadPortfolioItems()
				me._loadRisks()
			]);
		},
		
		_reloadEverything: function(){
			var me=this;
			me.setLoading('Loading Data');
			me._reloadData()
				.then(function(){
					me._clearEverything();
					if(!me.ReleasePicker) me._loadReleasePicker();			
				})
				.then(function(){ me._updateSwimlanes(); })
				.then(function(){ me._renderSwimlanes(); })
				.fail(function(reason){ me._alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
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
					return Q.all([ //4 streams
						me._projectInWhichScrumGroup(me.ProjectRecord) /********* 1 ************/
							.then(function(scrumGroupRootRecord){
								if(scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID){
									me.ScrumGroupRootRecord = scrumGroupRootRecord;
									return me._loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
										.then(function(scrumGroupPortfolioProject){
											if(!scrumGroupPortfolioProject) return Q.reject('Invalid portfolio location');
											me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a valid project');
							}),
						me._loadAppsPreference() /********* 2 ************/
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
						RiskDb.initialize() /********* 4 ************/
					]);
				})
				.then(function(){ 
					return me._reloadEverything(); 
				})
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason);
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
		_renderRiskSwimlanes: function(){
			var me = this, 
				customStore = Ext.create('Ext.data.Store', {	//need to add custom store to go along with the _queryForData override
					data: me.Risks,
					sorters: [{property: Rally.data.Ranker.RANK_FIELDS.MANUAL, direction: 'ASC'}],
					model: 'Intel.SAFe.lib.models.SwimlaneRisk',
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
				models: [Ext.ClassManager.get('Intel.SAFe.lib.models.SwimlaneRisk')],	//need to instantiate this
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
					fields: ['PortfolioItem #', 'PortfolioItem Name', 'Project', 'Contact', 'Checkpoint', 'Description', 'Impact', 'MitigationPlan'],
					showGearIcon: false
				},
				rowConfig: {
					field: 'Urgency',
					values: ['High', 'Medium', 'Low'],
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
							me.setLoading('Saving Risk');
							RiskDb.update(card.record.data.RiskID, card.record.data)
								.catch(function(reason){ me._alert(reason); })
								.then(function(){ me.setLoading(false); })
								.done();
						}
					}
				}
			});	
		}
	});
}());