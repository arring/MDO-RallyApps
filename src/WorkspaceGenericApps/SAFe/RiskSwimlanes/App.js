/** 
	DESCRIPTION:
		RiskIDs are in the form of risk-<releaseName>-<scrumGroupRootProjectObjectID>-<random string> 
		
		App only works with ScrumGroups that have been configured in WorkspaceConfig app. 
		You must have Database Project set in WorkspaceConfig app as well.
		
	DEPENDENCIES:
		font-awesome library
*/

(function(){
	var VALID_GROUPING_SYNTAX = /^(?:[\-\w\s\&]+\:[\-\w\s\&]+(?:,[\-\w\s\&]+)*;)*$/,
		RiskDb = Intel.SAFe.lib.resource.RiskDb,
		RiskModel = Intel.SAFe.lib.model.Risk;

	Ext.define('Intel.SAFe.RiskSwimlanes', {
		extend: 'Intel.lib.IntelRallyApp',
		cls:'RiskSwimlanesApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.UserAppsPreference'
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			id:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			}
		},{
			xtype:'container',
			id:'toolsbar',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				id:'toolsbarLeft',
				layout: 'hbox'
			},{
				xtype:'container',
				flex:2,
				id:'toolsbarRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		
		userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ CONFIG/SETTINGS ___________________________________*/
		config: {
			defaultSettings: {
				'Enable-Groups': false,
				Groups: ''
			}
		},				
		getSettingsFields: function() {
			if(!Rally.getApp().getContext().getPermissions().isWorkspaceOrSubscriptionAdmin()) return [];
			else return [{
				name: 'Enable-Groups',
				xtype:'rallycheckboxfield',
				id: 'EnableGroupsCheckbox',
				label: 'Enable Horizontal Groupings',
				labelWidth: 120,
				bubbleEvents: ['change'] 
			},{
				xtype:'container',
				id: 'GroupingInstructions',
				html:[
					'<hr/>',
					'<div>',
						'<b>Set The Horizontal Groupings</b>',
						'<p>Group Columns By keywords. Syntax is:</p>',
						'<div style="padding-left:5px;">',
							'<p>GroupName1:keyword1,keyword2,keyword3;</p>',
							'<p>GroupName2:keyword1,keyword2;</p>',
							'<p>...</p>',
						'</div>',
					'</div>'
				].join('\n'),
				listeners:{
					added: function(field, form){
						if(!form.down('#EnableGroupsCheckbox').value) field.hide();
						else field.show();
					}
				},
				handlesEvents: {
					change: function(item, itemValue) {
						if(item.id == 'EnableGroupsCheckbox'){
							if(!itemValue) this.hide();
							else this.show();
						}
					}
				}
			},{
				name: 'Groups',
				xtype:'textarea',
				id: 'GroupingTextarea',
				label: 'Column Groups',
				labelWidth: 120, width:500, height:150,
				resizable:true,
				resizeHandles:'se s e',
				bubbleEvents: ['change'],
				listeners:{
					added: function(field, form){
						if(!form.down('#EnableGroupsCheckbox').value) field.hide();
						else field.show();
					}
				},
				handlesEvents: {
					change: function(item, itemValue) {
						if(item.id == 'EnableGroupsCheckbox'){
							if(!itemValue) this.hide();
							else this.show();
						}
					}
				}
			},{
				xtype:'container',
				id: 'SyntaxNotifier',
				listeners:{
					added: function(field, form){
						if(!form.down('#EnableGroupsCheckbox').value) field.hide();
						else {
							field.show();
							setTimeout(function setInitialColor(){
								var el = field.getEl(),
									goodHTML = '<div style="color:green"><i class="fa fa-check"></i> Syntax Valid</div>',
									badHTML = '<div style="color:red"><i class="fa fa-times"></i> Syntax Invalid</div>',
									textElContainer = form.down('#GroupingTextarea');
								if(el && textElContainer && textElContainer.getEl().down('textarea')){
									if(textElContainer.getEl().down('textarea').getValue().match(VALID_GROUPING_SYNTAX)) el.setHTML(goodHTML);
									else el.setHTML(badHTML);
								}
								else setTimeout(setInitialColor, 10);
							}, 0);
						}
					}
				},
				handlesEvents: {
					change: function(item, itemValue) {
						if(item.id == 'EnableGroupsCheckbox'){
							if(!itemValue){
								this.hide();
								return;
							}
							else this.show();
						}
						var el = this.getEl(),
							textEl = this.up('form').down('#GroupingTextarea').getEl().down('textarea'),
							goodHTML = '<div style="color:green"><i class="fa fa-check"></i> Syntax Valid</div>',
							badHTML = '<div style="color:red"><i class="fa fa-times"></i> Syntax Invalid</div>';
						if(textEl.getValue().match(VALID_GROUPING_SYNTAX)) el.setHTML(goodHTML);
						else el.setHTML(badHTML);
					}
				}
			}];
		},
		
		/**___________________________________ UTIL FUNCS ___________________________________*/	
		formatUserName: function(user){
			return user ? ((user.data.LastName + ', ' + user.data.FirstName) || user.data.UserName) : '?';
		},
		getCardFilter: function(){
			var me = this,
				defaultFilter = new Ext.util.Filter({filterFn: function(){ return true; } }),
				ownerFilterValue = Ext.ComponentQuery.query('#filterByOwnerDropdown')[0].getValue(),
				topPortfolioItemFilterValue = Ext.ComponentQuery.query('#filterByTopPortfolioItemDropdown')[0].getValue(),
				horizontalFilterValue = Ext.ComponentQuery.query('#filterByHorizontalDropdown')[0].getValue(),
				ownerFilter = ownerFilterValue ? 
					new Ext.util.Filter({filterFn:function(card){ return card.getData().OwnerObjectID === ownerFilterValue; } }) :
					defaultFilter,
				topPortfolioItemFilter = topPortfolioItemFilterValue ? 
					new Ext.util.Filter({filterFn:function(card){ 
						var portfolioItemObjectID = card.getData().PortfolioItemObjectID;
						return _.some(me.PortfolioItemMap, function(scrumGroupData){
							return scrumGroupData.PortfolioItemMap[portfolioItemObjectID] === topPortfolioItemFilterValue;
						}); 
					} }) :
					defaultFilter,
				horizontalFilter = horizontalFilterValue ? 
					new Ext.util.Filter({filterFn:function(card){ 
						var project = me.ProjectsWithTeamMembers[card.getData().ProjectObjectID],
							projectName = project && project.data.Name;
						return projectName && _.some(me.HorizontalGroups[horizontalFilterValue], function(nameContains){
							return new RegExp(nameContains).test(projectName);
						}); 
					} }) :
					defaultFilter;
			return new Ext.util.Filter({ 
				filterFn: Ext.util.Filter.createFilterFn([ownerFilter, topPortfolioItemFilter, horizontalFilter])
			});
		},
		addOwnerAndSubmitterAndTrain: function(riskJSON){
			var me = this,
				owner = _.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === riskJSON.OwnerObjectID; }),
				submitter = _.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === riskJSON.SubmitterObjectID; }),
				train = _.find(me.AllScrumGroupRootRecords, function(sgr){ return riskJSON.RiskID.indexOf(sgr.data.ObjectID) > -1; });
				cardData = _.merge(riskJSON, {
					Owner: me.formatUserName(owner), 
					Submitter: me.formatUserName(submitter),
					Train: train && me.getScrumGroupName(train)
				});
			return cardData;
		},
		generateRiskID: function(riskJSON){
			var me = this,
				scrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(sgr){ return riskJSON.Train === me.getScrumGroupName(sgr); });
			return 'risk-' + (riskJSON ? riskJSON.ReleaseName : me.ReleaseRecord.data.Name) + '-' + 
				scrumGroupRootRecord.data.ObjectID + '-' + 
				(new Date()*1 + '' + (Math.random()*10000 >> 0));
		},
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		_loadPortfolioItemsOfTypeInRelease: function(releaseName, portfolioProjectOID, type){
			if(!portfolioProjectOID || !type) return Q.reject('Invalid arguments: loadPortfolioItemsOfTypeInRelease');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'PortfolioItem/' + type,
					limit: Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: me.portfolioItemFields,
					filters:[{ property:'Release.Name', value:releaseName}],
					context:{
						project: '/project/' + portfolioProjectOID,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me.reloadStore(store);
		},	
		loadPortfolioItemsByRelease: function(releaseName, scrumGroupRootRecords){
			/** 
				scrumGroupPortfolioMap = {
					<scrumGroupOID>: {
						PortfolioItems: [records],
						PortfolioItemMap: {
							<lowPortfolioItemOID>: <highPOrtfolioItemName>
						}
					}
				}
			**/
			var me=this;
			var scrumGroupPortfolioMap = {};
			return Q.all(_.map(scrumGroupRootRecords, function(scrumGroupRootRecord){
				var portfolioProjectOID = me.getPortfolioOIDForScrumGroupRootProjectRecord(scrumGroupRootRecord);
				return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
					return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
							me.loadPortfolioItemsOfType({data: {_ref: '/project/' + portfolioProjectOID}}, type) : 
							me._loadPortfolioItemsOfTypeInRelease(releaseName, portfolioProjectOID, type)
						);
					}))
					.then(function(portfolioItemStores){
						var portfolioItemStore = portfolioItemStores[0];
						var portfolioItemMap = {};
						_.each(portfolioItemStore.getRange(), function(lowPortfolioItem){
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
								portfolioItemMap[lowPortfolioItem.data.ObjectID] = parentPortfolioItem.data.Name;
						});
						scrumGroupPortfolioMap[scrumGroupRootRecord.data.ObjectID] = {
							PortfolioItems: portfolioItemStore.getRange(),
							PortfolioItemMap: portfolioItemMap
						};
					});
			}))
			.then(function(){ return scrumGroupPortfolioMap; });
		},	
		loadRisks: function(){
			var me=this, 
				scrumGroupRootRecords = me.ScrumGroupRootRecord ? [me.ScrumGroupRootRecord] : me.AllScrumGroupRootRecords;
			return Q.all(_.map(scrumGroupRootRecords, function(scrumGroupRootRecord){
				return RiskDb.query('risk-' + me.ReleaseRecord.data.Name + '-' + scrumGroupRootRecord.data.ObjectID + '-');
			}))
			.then(function(riskLists){ me.InitialRisks = Array.prototype.concat.apply([], riskLists); });
		},
		loadUsers: function(risks){
			var me = this,
				userObjectIDs = _.reduce(risks, function(oids, risk){
					if(oids.indexOf(risk.OwnerObjectID) === -1) oids.push(risk.OwnerObjectID);
					if(oids.indexOf(risk.SubmitterObjectID) === -1) oids.push(risk.SubmitterObjectID);
					return oids;
				}, [me.getContext().getUser().ObjectID]);
			return Q.all(_.map(_.chunk(userObjectIDs, 200), function(userObjectIDs){
				var userOIDFilter = _.reduce(userObjectIDs, function(filter, oid){
						var newFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'ObjectID', value: oid });
						if(!filter) return newFilter; 
						else return filter.or(newFilter);
					}, null),
					store = Ext.create('Rally.data.wsapi.Store', {
						model: 'User',
						fetch: ['ObjectID', 'UserName', 'FirstName', 'LastName'],
						filters: [userOIDFilter],
						context: { workspace: me.getContext().getWorkspace()._ref }
					});
				return me.reloadStore(store).then(function(store){ return store.getRange(); });
			}))
			.then(function(userLists){ me.UsersOnRisks = Array.prototype.concat.apply([], userLists); });
		},

		/**___________________________________ UPDATING, LOADING AND RELOADING ___________________________________*/
		updateRiskUsers: function(risks){
			var me = this;
			return me.loadUsers(risks).then(function(){
				var previousOwnerObjectID = me.FilterByOwnerDropdown.getValue(),
					previousPortfolioItem = me.FilterByTopPortfolioItemDropdown.getValue(),
					previousHorizontal = me.FilterByHorizontalDropdown.getValue();
				me.down('#toolsbarLeft').removeAll();
				me.renderAddRiskButton();
				me.renderFilterByOwnerDropdown(previousOwnerObjectID);
				me.renderFilterByTopPortfolioItemDropdown(previousPortfolioItem);
				me.renderFilterByHorizontalDropdown(previousHorizontal);
			});
		},
		
		renderSwimlanes: function(){
			this.renderRiskSwimlanes();
		},	
		clearEverything: function(){
			var me = this;
			if(me.RiskSwimlanes) me.RiskSwimlanes.destroy();
			me.RiskSwimlanes = null;
			
			me.down('#navbox').removeAll();
			me.down('#toolsbarLeft').removeAll();
			me.down('#toolsbarRight').removeAll();
		},
		reloadData: function(){
			var me = this,
				scrumGroupRootRecords = me.ScrumGroupRootRecord ? [me.ScrumGroupRootRecord] : me.AllScrumGroupRootRecords;
			return Q.all([me.loadRisks(), me.loadPortfolioItemsByRelease(me.ReleaseRecord.data.Name, scrumGroupRootRecords)])
				.then(function(results){ 
					me.PortfolioItemMap = results[1]; 
					me.PortfolioItemsInRelease = [].concat.apply([], _.pluck(me.PortfolioItemMap, 'PortfolioItems'));
				})
				.then(function(){ return me.loadUsers(me.InitialRisks); });
		},	
		reloadEverything: function(){
			var me=this;
			me.setLoading('Loading Data');
			return me.reloadData()
				.then(function(){
					me.clearEverything();
					
					me.renderReleasePicker();
					me.renderScrumGroupPicker();
					me.renderAddRiskButton();
					me.renderFilterByOwnerDropdown();
					me.renderFilterByTopPortfolioItemDropdown();
					me.renderFilterByHorizontalDropdown();
					me.renderShowAggrementsCheckbox();
				})
				.then(function(){ me.renderSwimlanes(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); });
		},
		
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.setLoading('Loading configuration');
			me.ShowAgreements = false;
			Q.onerror = function(reason){ me.alert('ERROR', reason); };
			var enableHorizontalGroups = me.getSetting('Enable-Groups');
			var horizontalGroups = enableHorizontalGroups && me.getSetting('Groups').match(VALID_GROUPING_SYNTAX) && me.getSetting('Groups');
			if(horizontalGroups){
				me.HorizontalGroups = _.reduce(horizontalGroups.trim().split(';'), function(map, line){
					if(!line.length) return map;
					var split = line.trim().split(':');
					map[split[0]] = split[1].split(',');
					return map;
				}, {});
			}
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
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
						me.projectInWhichScrumGroup(me.ProjectRecord).then(function(scrumGroupRootRecord){
							me.ScrumGroupRootRecord = scrumGroupRootRecord;
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
						me.loadProjectsWithTeamMembers().then(function(projectsWithTeamMembers){
							me.ProjectsWithTeamMembers = projectsWithTeamMembers;
						}),
						me.loadAllScrumGroups().then(function(scrumGroupRootRecords){
							me.AllScrumGroupRootRecords = scrumGroupRootRecords;
						}),
						RiskDb.initialize()
					]);
				})
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
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
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navbox').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},	
		scrumGroupPickerSelected: function(combo, records){
			var me=this, isAllScrumGroups = (records[0].data.ObjectID === 0);
			if(isAllScrumGroups && !me.ScrumGroupRootRecord) return;
			else if(!isAllScrumGroups && me.ScrumGroupRootRecord && me.ScrumGroupRootRecord.data.ObjectID == records[0].data.ObjectID) return;
			
			if(isAllScrumGroups) me.ScrumGroupRootRecord = null;
			else me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(sgr){ return sgr.data.ObjectID == records[0].data.ObjectID; });

			me.setLoading('Loading Data');
			me.reloadEverything()
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},	
		renderScrumGroupPicker: function(){
			var me=this,
				store = Ext.create('Ext.data.Store', {
					fields: ['Name', 'ObjectID'],				
					data: [{Name: 'All Trains'}, {ObjectID: 0}].concat(_.sortBy(_.map(me.AllScrumGroupRootRecords, 
						function(sgr){ return {Name: me.getScrumGroupName(sgr), ObjectID: sgr.data.ObjectID}; }),
						function(sgn){ return sgn.Name; })
					)
				});
			me.ScrumGroupPicker = me.down('#navbox').add({
				xtype:'intelfixedcombo',
				id:'scrumGroupPicker',
				width:200,
				labelWidth:40,
				store: store,
				displayField: 'Name',
				fieldLabel: 'Train:',
				value: !me.ScrumGroupRootRecord ? store.getRange()[0] : 
					_.find(store.getRange(), function(item){ return item.data.ObjectID === me.ScrumGroupRootRecord.data.ObjectID; }),
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.scrumGroupPickerSelected.bind(me)
				}
			});
		},
		
		renderAddRiskButton: function(){
			var me=this,
				userOID = me.getContext().getUser().ObjectID,
				submitter = _.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === userOID; });
			me.AddRiskButton = me.down('#toolsbarLeft').add({
				xtype:'button',
				text: '+ Add New',
				id: 'addNewButton',
				handler: function(){
					me.showRiskEditingModal(undefined, {}, submitter)
						.then(function(riskJSON){ 
							me.setLoading('Creating Risk');
							var card = me.RiskSwimlanes.createCard(riskJSON, riskJSON.Status, riskJSON.RiskLevel); 
							return me.updateRiskUsers(_.invoke(me.RiskSwimlanes.getCards(), 'getData')).then(function(){
								card.setData(me.addOwnerAndSubmitterAndTrain(riskJSON));
							});
						})
						.fail(function(reason){ me.alert('ERROR', reason); })
						.then(function(){ me.setLoading(false); })
						.done();
				}
			});
		},
		renderFilterByOwnerDropdown: function(ownerObjectID){
			var me=this,
				store = Ext.create('Ext.data.Store', {
					fields: ['Name', 'ObjectID'],
					data: [{Name:'Clear Filter', ObjectID: 0}].concat(
						_.sortBy(_.map(me.UsersOnRisks, 
							function(user){ return {Name: me.formatUserName(user), ObjectID: user.data.ObjectID}; }),
							function(item){ return item.Name; })
					)
				});
			me.FilterByOwnerDropdown = me.down('#toolsbarLeft').add({
				xtype: 'intelfixedcombobox',
				id: 'filterByOwnerDropdown',
				emptyText: 'Filter By Owner',
				store: store,
				value: _.find(store.getRange(), function(user){ return user.data.ObjectID == ownerObjectID; }),
				displayField:'Name',
				valueField: 'ObjectID',
				listeners: {
					select: function(combo, newValues){
						if(!newValues[0].data.ObjectID) combo.setValue('');
						me.RiskSwimlanes.clearFilters();
						me.RiskSwimlanes.addFilter(me.getCardFilter());
					}
				}
			});
		},
		renderFilterByTopPortfolioItemDropdown: function(value){
			var me=this,
				options = ['Clear Filter'].concat(_.sortBy(_.keys(_.reduce(me.PortfolioItemMap, 
					function(map, item){
						_.each(item.PortfolioItemMap, function(topPortfolioItem){ map[topPortfolioItem] = 1; });
						return map;
					},{})),
					function(name){ return name; }));
			me.FilterByTopPortfolioItemDropdown = me.down('#toolsbarLeft').add({
				xtype: 'intelfixedcombobox',
				id: 'filterByTopPortfolioItemDropdown',
				emptyText: 'Filter By ' + me.PortfolioItemTypes.slice(-1)[0],
				store: options,
				value: value,
				listeners: {
					select: function(combo, newValues){
						if(combo.getValue() === 'Clear Filter') combo.setValue('');
						me.RiskSwimlanes.clearFilters();
						me.RiskSwimlanes.addFilter(me.getCardFilter());
					}
				}
			});
		},
		renderFilterByHorizontalDropdown: function(value){
			var me=this,
				options = ['Clear Filter'].concat(_.sortBy(_.keys(me.HorizontalGroups), function(name){ return name; }));
			if(me.HorizontalGroups){
				me.FilterByHorizontalDropdown = me.down('#toolsbarLeft').add({
					xtype: 'intelfixedcombobox',
					id: 'filterByHorizontalDropdown',
					emptyText: 'Filter By Horizontal',
					store: options,
					value: value,
					listeners: {
						select: function(combo, newValues){
							if(combo.getValue() === 'Clear Filter') combo.setValue('');
							me.RiskSwimlanes.clearFilters();
							me.RiskSwimlanes.addFilter(me.getCardFilter());
						}
					}
				});
			}
		},
		renderShowAggrementsCheckbox: function(){
			var me = this;
			me.ShowAgreementsCheckbox = me.down('#toolsbarRight').add({
				xtype: 'checkbox',
				fieldLabel: 'Show Agreements',
				value: me.ShowAgreements,
				listeners: {
					change: function(combox, newVal){
						me.ShowAgreements = newVal;
						if(me.ShowAgreements) me.RiskSwimlanes.showAgreements();
						else me.RiskSwimlanes.hideAgreements();
					}
				}
			});
		},
		
		/**___________________________________ RENDERING ___________________________________*/
		renderRiskSwimlanes: function(){
			var me = this, showScrumGroupName = !me.ScrumGroupRootRecord;
			
			me.RiskSwimlanes = me.add({
				xtype:'intelswimlanes',
				flex:1,
				rowNames: RiskModel.getRiskLevelOptions(),
				colNames: RiskModel.getStatusOptions(),
				displayFields: showScrumGroupName ? ['Train', 'Owner', 'Description'] : ['Owner', 'Description'], //we call it Train here for now
				onCardEdit: me.onCardEdit.bind(me),
				onCardCopy: me.onCardCopy.bind(me),
				onCardMove: me.onCardMove.bind(me),
				onCardDelete: me.onCardDelete.bind(me),
				sortFn: me.riskCardSortFn
			});
			me.RiskSwimlanes.expandRow('High');
			me.RiskSwimlanes.expandRow('Medium');
			me.RiskSwimlanes.collapseRow('Low');
			if(me.ShowAgreements) me.RiskSwimlanes.showAgreements();
			else me.RiskSwimlanes.hideAgreements();
			
			_.each(me.InitialRisks, function(riskJSON){
				me.RiskSwimlanes.createCard(me.addOwnerAndSubmitterAndTrain(riskJSON), riskJSON.Status, riskJSON.RiskLevel); 
			});
			
		},
		
		onCardEdit: function(card){
			var me = this,
				riskJSON = card.getData(),
				submitter = _.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === riskJSON.SubmitterObjectID; });
			me.showRiskEditingModal(riskJSON.RiskID, riskJSON, submitter)
				.then(function(newRiskJSON){
					me.setLoading('Updating Risk');
					card.setColName(newRiskJSON.Status);
					card.setRowName(newRiskJSON.RiskLevel);
					card.setData(newRiskJSON);
					return me.updateRiskUsers(_.invoke(me.RiskSwimlanes.getCards(), 'getData')).then(function(){
						if(newRiskJSON.ReleaseName !== me.ReleaseRecord.data.Name) card.destroy();
						else card.setData(me.addOwnerAndSubmitterAndTrain(newRiskJSON));
						card.doHighlight();
					});
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		onCardCopy: function(card){
			var me = this,
				newRiskJSON = _.merge({}, card.getData(), {RiskID: me.generateRiskID(card.getData())});
			me.setLoading('Copying Risk');
			RiskDb.create(newRiskJSON.RiskID, newRiskJSON)
				.then(function(newRiskJSON){
					var card = me.RiskSwimlanes.createCard(
						me.addOwnerAndSubmitterAndTrain(newRiskJSON), newRiskJSON.Status, newRiskJSON.RiskLevel); 
					card.doHighlight();
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		onCardMove: function(card, newColName, newRowName){
			var me = this, 
				riskJSON = _.merge(card.getData(), {Status: newColName, RiskLevel: newRowName});
			me.setLoading('Updating Risk');
			RiskDb.update(riskJSON.RiskID, riskJSON)
				.then(function(newRiskJSON){
					card.setColName(newRiskJSON.Status);
					card.setRowName(newRiskJSON.RiskLevel);
					card.setData(me.addOwnerAndSubmitterAndTrain(newRiskJSON));
					card.doHighlight();
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		onCardDelete: function(card){
			var me = this;
			me.confirm('Delete Risk', 'Are you sure?', function(confirm){
				if(confirm !== 'yes') return;
				else {
					me.setLoading('Deleting Risk');
					RiskDb['delete'](card.getData().RiskID)
						.then(function(){ card.destroy(); })
						.then(function(){ return me.updateRiskUsers(_.invoke(me.RiskSwimlanes.getCards(), 'getData')); })
						.fail(function(reason){ me.alert('ERROR', reason); })
						.then(function(){ me.setLoading(false); })
						.done();
				}
			});
		},
		riskCardSortFn: function(card1, card2){
			return card1.getData().RiskID < card2.getData().RiskID ? -1 : 1;
		},
		
		showRiskEditingModal: function(oldRiskID, oldRiskJSON, submitter){
			var me = this,
				isExistingRisk = !!oldRiskID,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				currentReleaseRecord = me.ReleaseRecord,
				shouldShowScrumGroupPicker = !me.ScrumGroupRootRecord,
				currentScrumGroup = shouldShowScrumGroupPicker ? me.AllScrumGroupRootRecords[0] : me.ScrumGroupRootRecord,
				currentPortfolioItemRecords = me.PortfolioItemsInRelease, //placeholder until data gets loaded below
				deferred = Q.defer(),
				getReleaseNameComponent = function(){
					var releaseNameStore = Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate'],
						data: _.sortBy(_.map(me.ReleaseRecords,
							function(release){ return release.data; }),
							function(item){ return item.Name; })
					});
					return isExistingRisk ? {
						xtype: 'intelcombobox',
						id: 'editRiskModal-ReleaseName',
						emptyText: 'Select Release',
						fieldLabel: 'Release',
						value: _.find(releaseNameStore.getRange(), function(item){ return item.data.Name === currentReleaseRecord.data.Name; }),
						store: releaseNameStore,
						displayField: 'Name',
						valueField: 'Name',
						listeners: { 
							select: function(combo, records){
								var releaseName = records[0].data.Name;
								if(releaseName === currentReleaseRecord.data.Name) return;
								currentReleaseRecord = records[0];
								me.setLoading('Loading Data');
								me.loadPortfolioItemsByRelease(releaseName, [currentScrumGroup]).then(function(portfolioItemMap){
									//if(shouldShowScrumGroupPicker)
										currentPortfolioItemRecords = portfolioItemMap[currentScrumGroup.data.ObjectID].PortfolioItems;
									//else currentPortfolioItemRecords = [].concat.apply([], _.pluck(portfolioItemMap, 'PortfolioItems');
									updateComponents();
								})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){ me.setLoading(false); })
								.done();
							}
						}
					} : {
						xtype: 'displayfield',
						id: 'editRiskModal-ReleaseName',
						fieldLabel: 'Release',
						value: me.ReleaseRecord.data.Name
					};
				},
				getScrumGroupComponent = function(){
					var scrumGroupStore = Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: _.sortBy(_.map(me.AllScrumGroupRootRecords,
							function(sgr){ return {Name: me.getScrumGroupName(sgr), ObjectID: sgr.data.ObjectID }; }),
							function(item){ return item.Name; })
					});
					return shouldShowScrumGroupPicker ? {
						xtype: 'intelfixedcombobox',
						id: 'editRiskModal-ScrumGroup',
						emptyText: 'Select Train',
						fieldLabel: 'Train',
						value: _.find(scrumGroupStore.getRange(), function(item){ return item.data.ObjectID === currentScrumGroup.data.ObjectID; }),
						store: scrumGroupStore,
						displayField: 'Name',
						listeners: { 
							select: function(combo, records){
								var scrumGroupObjectID = records[0].data.ObjectID;
								if(scrumGroupObjectID === currentScrumGroup.data.ObjectID) return;
								currentScrumGroup = records[0];
								currentPortfolioItemRecords = me.PortfolioItemMap[currentScrumGroup.data.ObjectID].PortfolioItems;
								updateComponents();
							}
						}
					} : {
						xtype: 'container',
						id: 'editRiskModal-ScrumGroup'
					};
				},
				getPortfolioItemFIDDropdown = function(){
					var portfolioItemFIDStore = Ext.create('Ext.data.Store', {
						fields: ['FormattedID', 'ObjectID'],
						data: _.sortBy(_.map(currentPortfolioItemRecords, 
							function(portfolioItem){ return {FormattedID: portfolioItem.data.FormattedID, ObjectID: portfolioItem.data.ObjectID}; }),
							function(item){ return item.FormattedID; })
					});
					return {
						xtype: 'intelcombobox',
						id: 'editRiskModal-PortfolioItemObjectID-FID',
						emptyText: 'Select ' + lowestPortfolioItemType + ' by #',
						fieldLabel: lowestPortfolioItemType + ' #',
						value: _.find(portfolioItemFIDStore.getRange(), function(item){ return item.data.ObjectID === oldRiskJSON.PortfolioItemObjectID; }) || undefined,
						store: portfolioItemFIDStore,
						displayField: 'FormattedID',
						valueField: 'ObjectID',
						listeners: {
							select: function(combo, records){
								var nameCmp = Ext.getCmp('editRiskModal-PortfolioItemObjectID-Name');
								if(nameCmp.getValue() === records[0].data.ObjectID) return;
								else{
									nameCmp.store.removeFilter(nameCmp.store.filter);
									nameCmp.setValue(_.find(nameCmp.store.getRange(), function(r){ return r.data.ObjectID === records[0].data.ObjectID; }));
								}
							}
						}
					};
				},
				getPortfolioItemNameDropdown = function(){
					var portfolioItemNameStore = Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: _.sortBy(_.map(currentPortfolioItemRecords, 
							function(portfolioItem){ return {Name: portfolioItem.data.Name, ObjectID: portfolioItem.data.ObjectID}; }),
							function(item){ return item.Name; })
					});
					return {
						xtype: 'intelcombobox',
						id: 'editRiskModal-PortfolioItemObjectID-Name',
						emptyText: 'Select ' + lowestPortfolioItemType + ' by Name',
						fieldLabel: lowestPortfolioItemType + ' Name',
						value: _.find(portfolioItemNameStore.getRange(), function(item){ return item.data.ObjectID === oldRiskJSON.PortfolioItemObjectID; }) || undefined,
						store: portfolioItemNameStore,
						displayField: 'Name',
						valueField: 'ObjectID',
						listeners: {
							select: function(combo, records){
								var fidCmp = Ext.getCmp('editRiskModal-PortfolioItemObjectID-FID');
								if(fidCmp.getValue() === records[0].data.ObjectID) return;
								else{
									fidCmp.store.removeFilter(fidCmp.store.filter);
									fidCmp.setValue(_.find(fidCmp.store.getRange(), function(r){ return r.data.ObjectID === records[0].data.ObjectID; }));
								}
							}
						}
					};
				},
				getProjectDropdown = function(){
					var projectStore = Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: [{Name:'None', ObjectID: undefined}].concat(_.sortBy(_.map(me.ProjectsWithTeamMembers, 
							function(project){ return {Name: project.data.Name, ObjectID: project.data.ObjectID}; }),
							function(item){ return item.Name; }))
					});
					return {
						xtype: 'intelcombobox',
						id: 'editRiskModal-ProjectObjectID',
						emptyText: 'Select Project',
						fieldLabel: 'Project (optional)',
						value: _.find(projectStore.getRange(), function(item){ return item.data.ObjectID === oldRiskJSON.ProjectObjectID; }) || '',
						store: projectStore,
						displayField: 'Name',
						valueField: 'ObjectID'
					};
				},
				getCheckpointDropdown = function(){
					var workweekStore = Ext.create('Ext.data.Store', {
						fields: ['DateVal', 'Workweek'],
						data: me.getWorkweeksForDropdown(currentReleaseRecord.data.ReleaseStartDate, currentReleaseRecord.data.ReleaseDate)
					});
					return {
						xtype: 'intelfixedcombobox',
						id: 'editRiskModal-Checkpoint',
						emptyText: 'Select Checkpoint',
						fieldLabel: 'Checkpoint',
						value: _.find(workweekStore.getRange(), function(item){ return item.data.DateVal === oldRiskJSON.Checkpoint; }) || undefined,
						store: workweekStore,
						displayField: 'Workweek',
						valueField: 'DateVal'
					};
				},
				updateComponents = function(){
					Ext.getCmp('editRiskModal').add(_.map(Ext.getCmp('editRiskModal').removeAll(false), function(cmp){
						switch(cmp.id){
							case 'editRiskModal-ReleaseName': return getReleaseNameComponent();
							case 'editRiskModal-ScrumGroup': return getScrumGroupComponent();
							case 'editRiskModal-PortfolioItemObjectID-FID': return getPortfolioItemFIDDropdown();
							case 'editRiskModal-PortfolioItemObjectID-Name': return getPortfolioItemNameDropdown();
							case 'editRiskModal-ProjectObjectID': return getProjectDropdown();
							case 'editRiskModal-Checkpoint': return getCheckpointDropdown();
							default: return cmp;
						}
					}));
				},
				modal = Ext.create('Rally.ui.dialog.Dialog', {
					modal: true,
					closable: true,
					resizable: true,
					draggable: true,
					id: 'editRiskModal',
					title: (isExistingRisk ? 'Edit Risk' : 'New Risk'),
					width: 400,
					padding:'2px 5px 2px 5px',
					height: Math.min(450, (window.innerHeight - 20)),
					y: 15,
					overflowY: 'auto',
					items: [
						getReleaseNameComponent(),
						getScrumGroupComponent(),
						{
							xtype: 'displayfield',
							fieldLabel: 'Submitted By',
							value: me.formatUserName(submitter)
						},{
							xtype: 'inteluserpicker',
							id: 'editRiskModal-OwnerObjectID',
							emptyText: 'Select Owner',
							fieldLabel: 'Owner',
							value: _.find(me.UsersOnRisks, function(item){ return item.data.ObjectID === oldRiskJSON.OwnerObjectID; }) || undefined,
							valueField: 'ObjectID'
						}, 
						getPortfolioItemFIDDropdown(),
						getPortfolioItemNameDropdown(),
						getProjectDropdown(),
						getCheckpointDropdown(),
						{
							xtype: 'inteltextarea',
							id: 'editRiskModal-Description',
							emptyText: 'Enter Description',
							value: oldRiskJSON.Description,
							fieldLabel: 'Description'
						},{
							xtype: 'inteltextarea',
							id: 'editRiskModal-Impact',
							emptyText: 'Enter Impact',
							value: oldRiskJSON.Impact,
							fieldLabel: 'Impact'
						},{
							xtype: 'inteltextarea',
							id: 'editRiskModal-MitigationPlan',
							emptyText: 'Enter MitigationPlan',
							value: oldRiskJSON.MitigationPlan,
							fieldLabel: 'MitigationPlan'
						},{
							xtype: 'intelfixedcombobox',
							id: 'editRiskModal-RiskLevel',
							emptyText: 'Select RiskLevel',
							fieldLabel: 'RiskLevel',
							value: oldRiskJSON.RiskLevel,
							store: Ext.create('Ext.data.Store', {
								fields: ['Name'],
								data: _.map(RiskModel.getRiskLevelOptions(), function(option){ return {Name: option}; })
							}),
							displayField: 'Name'
						},{
							xtype: 'intelfixedcombobox',
							id: 'editRiskModal-Status',
							emptyText: 'Select Status',
							fieldLabel: 'Status',
							value: oldRiskJSON.Status,
							store: Ext.create('Ext.data.Store', {
								fields: ['Name'],
								data: _.map(RiskModel.getStatusOptions(), function(option){ return {Name: option}; })
							}),
							displayField: 'Name'
						},{
							xtype:'container',
							layout:'hbox',
							style: {
								borderTop: '1px solid gray'
							},
							items:[{
								xtype:'button',
								text:'Cancel',
								handler: function(){ modal.destroy(); }
							},{
								xtype:'button',
								text: (isExistingRisk ? 'Save Risk' : 'Create Risk'),
								handler: function(){
									var newRiskJSON = {
											ReleaseName:           Ext.getCmp('editRiskModal-ReleaseName').getValue(),
											PortfolioItemObjectID: Ext.getCmp('editRiskModal-PortfolioItemObjectID-Name').getValue(),
											ProjectObjectID:       Ext.getCmp('editRiskModal-ProjectObjectID').getValue() || undefined,
											Description:           Ext.getCmp('editRiskModal-Description').getValue(),
											Impact:                Ext.getCmp('editRiskModal-Impact').getValue(),
											MitigationPlan:        Ext.getCmp('editRiskModal-MitigationPlan').getValue(),
											RiskLevel:             Ext.getCmp('editRiskModal-RiskLevel').getValue(),
											Status:                Ext.getCmp('editRiskModal-Status').getValue(),
											Checkpoint:            Ext.getCmp('editRiskModal-Checkpoint').getValue(),
											OwnerObjectID:         Ext.getCmp('editRiskModal-OwnerObjectID').getValue(),
											SubmitterObjectID:     submitter.data.ObjectID,
											Train:                 me.getScrumGroupName(currentScrumGroup)
										},
										deleteOldRisk = (isExistingRisk && (
												(newRiskJSON.ReleaseName !== oldRiskJSON.ReleaseName) || (newRiskJSON.Train !== oldRiskJSON.Train))),
										action = ((!deleteOldRisk && isExistingRisk) ? 'update' : 'create'),
										newRiskID = (deleteOldRisk || !oldRiskID) ? me.generateRiskID(newRiskJSON) : oldRiskID;
									
									me.setLoading('Saving Risk');
									RiskDb[action](newRiskID, newRiskJSON)
										.then(function(newRiskJSON){
											if(deleteOldRisk) return RiskDb['delete'](oldRiskID).then(function(){ return newRiskJSON; });
											else return newRiskJSON;
										})
										.then(function(newRiskJSON){ deferred.resolve(newRiskJSON); })
										.then(function(){ modal.destroy(); })
										.fail(function(reason){ me.alert('ERROR', reason); })
										.then(function(){ me.setLoading(false); })
										.done();
								}
							}]
						}
					]
				});
			
			setTimeout(function(){ 
				modal.show();
				modal.setLoading('Loading Data');
				if(isExistingRisk){
					currentReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name === oldRiskJSON.ReleaseName; });
					//if(shouldShowScrumGroupPicker){
					currentScrumGroup = _.find(me.AllScrumGroupRootRecords, function(sgr){
						return me.getScrumGroupName(sgr) === oldRiskJSON.Train; 
					});
					//}
				}
				me.loadPortfolioItemsByRelease(currentReleaseRecord.data.Name, [currentScrumGroup])
					.then(function(portfolioItemMap){
						//if(shouldShowScrumGroupPicker)
							currentPortfolioItemRecords = portfolioItemMap[currentScrumGroup.data.ObjectID].PortfolioItems;
						//else currentPortfolioItemRecords = [].concat.apply([], _.pluck(portfolioItemMap, 'PortfolioItems');
						updateComponents();
					})
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ modal.setLoading(false); })
					.done();
			}, 10);		
			return deferred.promise;
		}
	});
}());