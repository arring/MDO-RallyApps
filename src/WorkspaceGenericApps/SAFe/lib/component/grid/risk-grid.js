/** 
	SUMMARY:
		Configurable Risk Grid that extends rallygrid

	DEPENDENCIES: 
		Intel.lib.resource.KeyValueDb
		Intel.lib.mixin.IntelWorkweek
		Intel.lib.mixin.PrettyAlert
		Intel.lib.component.GridColumnFilter
		Intel.lib.component.UserPicker
		Intel.lib.component.TextArea
		Intel.lib.component.ComboBox
		Intel.lib.component.FixedComboBox
		Intel.lib.component.TableView
		Intel.lib.component.SessionStorage
		Intel.lib.component.CellEditing
		Intel.SAFe.lib.resource.RiskDb
		Intel.SAFe.lib.model.Risk
		risk-grid.css
				
		Font-Awesome
		Q
		lodash
		jquery
		
*/

(function(){
	var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		RiskModel = Intel.SAFe.lib.model.Risk;
		
	Ext.define('Intel.SAFe.lib.component.RiskGrid', {
		extend:'Ext.grid.Panel',
		alias: ['widget.intelriskgrid'], 
		mixins: [
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.PrettyAlert'
		],
		
		/**________________________________________ DEFAULT CONFIG ________________________________________*/
		cls: 'risk-grid rally-grid',
		scroll:'vertical',
		plugins: ['intelcellediting'],
		viewConfig:{ 
			xtype:'inteltableview',
			preserveScrollOnRefresh:true
		},
		disableSelection: true,
		enableEditing:false,
		
		userCache: {pending:{}},
		risksMap: {},
		projectRecordMap: {},
		portfolioItemRecordMap: {},
		
		/**________________________________________ YOU MUST SUPPLY THESE ________________________________________*/
		releaseRecord: null,
		scrumGroupRootRecord: null,
		topPortfolioItemMap: {},
		projectRecords: [],
		portfolioItemRecords: [],
		portfolioItemType: null,
		topPortfolioItemType: null,
		risks: [],
		visibleColumns: [],
		
		/**________________________________________ INITIALIZE/PRIVATE METHODS ________________________________________*/
		initComponent: function(){
			var grid = this;
			_.each(grid.risks, function(riskJSON){ return grid.risksMap[riskJSON.RiskID] = riskJSON; });
			_.each(grid.projectRecords, function(project){ return grid.projectRecordMap[project.data.ObjectID] = project; });
			_.each(grid.portfolioItemRecords, function(pi){ return grid.portfolioItemRecordMap[pi.data.ObjectID] = pi; });
			grid.columns = grid._getColumns();
			grid.store = grid._getStore();
			grid.header = grid._getHeader();
			grid.listeners = grid._getListeners();
			grid.callParent();
		},
		
		_getColumns: function(){
			var grid = this;
			return {
				defaults: {
					text:'',
					resizable: false,
					draggable: false,
					sortable: false,
					editor: false,
					menuDisabled: true,
					renderer: function(val){ return val || '-'; },
					layout:'hbox'
				},
				items: grid.visibleColumns.map(function(colType){ 
					if(grid['_get' + colType + 'Column']) return grid['_get' + colType + 'Column'](colType); 
					else return {xtype:'displayfield', value:'Invalid: ' + colType};
				})
			};
		},
		_getStore: function(){
			var store = Ext.create('Ext.data.Store', { 
				data: _.map(_.cloneDeep(this.risks), function(risk){ return Ext.create(RiskModel, risk); }),
				model: RiskModel,
				proxy: {
					type:'intelsessionstorage',
					id:'RiskProxy-' + (Math.random()*100000>>0)
				},
				sorters: [function(r1, r2){ return r1.data.RiskID > r2.data.RiskID ? -1 : 1; }]
			});
			store.sync();
			return store;
		},
		_getHeader: function(){
			var grid = this;
			return {
				layout: 'hbox',
				items: [{
					xtype:'text',
					cls:'risk-grid-header-text',
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
						text:'+ Add New',
						cls: 'add-new-button',
						listeners:{
							click: function(){
								if(!grid.portfolioItemRecords.length) grid.alert('ERROR', 'No ' + grid._getPortfolioItemType() + 's found.');
								else {
									var model = grid._getNewRow();
									_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', grid), 'clearFilters');
									grid.store.add(model);
									model.setDirty();
									
									grid.store.fireEvent('refresh', grid.store);
									grid.view.getEl().setScrollTop(0);
									grid._highlightRow(0);
								}
							}
						}
					},{
						xtype:'button',
						text:'Clear Filters',
						cls: 'clear-filters-button',
						listeners:{ 
							click: function(){ 
								_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', grid), 'clearFilters'); 
								grid.store.fireEvent('refresh', grid.store);
							}
						}
					}]
				}]
			};
		},
		_getListeners: function(){
			var grid = this;
			return {
				edit: function(editor, e){			
					var grid = e.grid,
						record = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;
						
					if(value === originalValue) return; 
					else if(!value) { record.set(field, originalValue); return; }
					else if(['Description', 'Impact', 'MitigationPlan'].indexOf(field)>-1) {
						value = grid._htmlEscape(value);			
						record.set(field, value);
					}
					else if(['OwnerObjectID', 'SubmitterObjectID'].indexOf(field) > -1){
						if(typeof value === 'string') { record.set(field, originalValue); return; } 
					}
				}
			};
		},
		
		_getPortfolioItemFormattedIDColumn: function(){
			var grid = this,
				oidToFID = function(oid){ 
					return grid.portfolioItemRecordMap[oid] ? grid.portfolioItemRecordMap[oid].data.FormattedID : '-'; 
				};
			return {
				text:'#',
				dataIndex:'PortfolioItemObjectID',
				tdCls: 'intel-editor-cell',	
				width:80,
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: grid._getPortfolioItemFIDStore(),
					displayField: 'FormattedID',
					valueField: 'ObjectID'
				},			
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ return oidToFID(record.data.PortfolioItemObjectID); }),
				renderer: function(oid){ return oidToFID(oid); },
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					sortFn: function(oid, fid){ return fid; },
					convertDisplayFn: function(oid){ return oidToFID(oid); }
				}]
			};
		},
		_getPortfolioItemNameColumn: function(){
			var grid = this,
				oidToName = function(oid){ 
					return grid.portfolioItemRecordMap[oid] ? grid.portfolioItemRecordMap[oid].data.Name : '-'; 
				};
			return {
				text: grid._getPortfolioItemType(),
				dataIndex:'PortfolioItemObjectID',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor:{
					xtype:'intelcombobox',
					flex:1,
					store: grid._getPortfolioItemNameStore(),
					displayField: 'Name',
					valueField: 'ObjectID'
				},			
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ return oidToName(record.data.PortfolioItemObjectID); }),
				renderer: function(oid){ return oidToName(oid); },
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					sortFn: function(oid, name){ return name; },
					convertDisplayFn: function(oid){ return oidToName(oid); }
				}]
			};
		},
		_getTopPortfolioItemNameColumn: function(){
			var grid = this,
				oidToTopPIName = function(oid){ return grid.topPortfolioItemMap[oid] || '-'; };
			return {
				text: grid._getTopPortfolioItemType(),
				dataIndex:'PortfolioItemObjectID',
				width: 100,		
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ return oidToTopPIName(record.data.PortfolioItemObjectID); }),
				renderer: function(oid){ return oidToTopPIName(oid); },
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					sortFn: function(topPI){ return topPI; },
					convertDisplayFn: function(oid){ return oidToTopPIName(oid); },
					convertValueFn: function(oid){ return oidToTopPIName(oid); },
					filterFn: function(topPI, oid){ return topPI === oidToTopPIName(oid); }
				}]
			};
		},
		_getOwningProjectColumn: function(){
			var grid = this,
				oidToProjectName = function(oid){ return grid.projectRecordMap[oid] ? grid.projectRecordMap[oid].data.Name : '-'; };
			return {
				text: 'Team',
				dataIndex:'ProjectObjectID',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor:{
					xtype:'intelcombobox',
					flex:1,
					store: grid._getProjectNameStore(),
					displayField: 'Name',
					valueField: 'ObjectID'
				},			
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ return oidToProjectName(record.data.ProjectObjectID); }),
				renderer: function(oid){ return oidToProjectName(oid); },
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					sortFn: function(oid, name){ return name; },
					convertDisplayFn: function(oid){ return oidToProjectName(oid); }
				}]
			};
		},
		_getDescriptionColumn: function(){
			return {
				text:'Risk Description (If This...)', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'inteltextarea'
			};
		},
		_getImpactColumn: function(){
			return {
				text:'Impact (Then this...)', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'inteltextarea'
			};
		},
		_getMitigationPlanColumn: function(){
			return {
				text:'Mitigation/ Prevention Plan', 
				dataIndex:'MitigationPlan',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'inteltextarea'
			};
		},
		_getStatusColumn: function(){
			var grid = this,
				statusOptions = RiskModel.getStatusOptions();
			return {
				text:'Status',
				dataIndex:'Status',
				tdCls: 'intel-editor-cell',	
				width:100,			
				editor:{
					xtype:'intelfixedcombo',
					store: statusOptions
				},
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ return statusOptions.indexOf(record.data.Status); }),
				items:[{ 
					xtype:'intelgridcolumnfilter',
					sortFn: function(status){ return statusOptions.indexOf(status); }
				}]
			};
		},
		_getRiskLevelColumn: function(){
			var grid = this,
				riskLevelOptions = RiskModel.getRiskLevelOptions(),
				displayMap = {
					High: 'High-Staff Help',
					Medium: 'Medium-CE Help',
					Low: 'Low-Team Managed'
				},
				storeOptions = _.map(riskLevelOptions, function(item){ return [item, displayMap[item]]; });
			return {
				text:'Risk Level',
				dataIndex:'RiskLevel',
				tdCls: 'intel-editor-cell',	
				width:100,			
				editor:{
					xtype:'intelfixedcombo',
					store: storeOptions
				},
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ return riskLevelOptions.indexOf(record.data.RiskLevel); }),
				renderer: function(item){ return displayMap[item]; },
				items:[{ 
					xtype:'intelgridcolumnfilter',
					convertDisplayFn: function(item){ return displayMap[item]; },
					sortFn: function(riskLevel){ return riskLevelOptions.indexOf(riskLevel); }
				}]
			};
		},
		_getCheckpointColumn: function(){
			var grid = this;
			return {
				text:'Checkpoint',	
				dataIndex:'Checkpoint',
				tdCls: 'intel-editor-cell',	
				width:90,
				editor:{
					xtype:'intelfixedcombo',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['DateVal', 'Workweek'],
						data: grid._getWorkweekData()
					}),
					displayField: 'Workweek',
					valueField: 'DateVal'
				},
				sortable:true,
				renderer:function(dateVal){ return dateVal ? 'ww' + grid.getWorkweek(dateVal) : '-'; },	
				items:[{ 
					xtype:'intelgridcolumnfilter',
					convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + grid.getWorkweek(dateVal) : undefined; }
				}]
			};
		},
		_getOwnerColumn: function(){
			var grid = this;
			return {
				text:'Owner', 
				dataIndex:'OwnerObjectID',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: {
					xtype: 'inteluserpicker',
					emptyText: 'Select Owner',
					valueField: 'ObjectID'
				}, 
				renderer: function(oid){
					if(grid.userCache[oid]) return grid._formatUserName(grid.userCache[oid]);
					else {
						var id = Ext.id();
						grid._getUserByObjectID(oid)
							.then(function(user){
								var el = Ext.get(id);
								if(user && el) el.setHTML(grid._formatUserName(user)); 
							})
							.fail(function(reason){ grid.alert('ERROR', reason); })
							.done();
						return '<div id="' + id + '">?</div>';
					}
				},
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ 
					var oid = record.data.OwnerObjectID;
					if(grid.userCache[oid]) return grid._formatUserName(grid.userCache[oid]);
					else return oid;
				}),
				items:[{ 
					xtype:'intelgridcolumnfilter',
					sortFn: function(oid, name){ return name; },
					convertDisplayFn: function(oid){ 
						if(grid.userCache[oid]) return grid._formatUserName(grid.userCache[oid]);
						else return grid._getUserByObjectID(oid).then(function(user){ return grid._formatUserName(user); }); 
					}
				}]
			};
		},
		_getSubmitterColumn: function(){
			var grid = this;
			return {
				text:'Submitter', 
				dataIndex:'SubmitterObjectID',
				flex:1,
				renderer: function(oid){
					if(grid.userCache[oid]) return grid._formatUserName(grid.userCache[oid]);
					else {
						var id = Ext.id();
						grid._getUserByObjectID(oid)
							.then(function(user){ 
								var el = Ext.get(id);
								if(user && el) el.setHTML(grid._formatUserName(user)); 
							})
							.fail(function(reason){ grid.alert('ERROR', reason); })
							.done();
						return '<div id="' + id + '">?</div>';
					}
				},
				sortable:true,
				doSort: grid._makeDoSortFn(function(record){ 
					var oid = record.data.SubmitterObjectID;
					if(grid.userCache[oid]) return grid._formatUserName(grid.userCache[oid]);
					else return oid;
				}),
				items:[{ 
					xtype:'intelgridcolumnfilter',
					sortFn: function(oid, name){ return name; },
					convertDisplayFn: function(oid){
						if(grid.userCache[oid]) return grid._formatUserName(grid.userCache[oid]);
						else return grid._getUserByObjectID(oid).then(function(user){ return grid._formatUserName(user); }); 
					}
				}]
			};
		},
		_getUndoButtonColumn: function(){
			var grid = this;
			return {
				width:24,
				renderer: function(value, meta, record){
					var id = Ext.id();
					if(!grid._isRiskEdited(record)) return;
					meta.tdAttr = 'title="Undo"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el){
							el.on('click', function(){ 
								record.reject(); 
								grid.store.fireEvent('refresh', grid.store);
							});
						}
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-undo"></i></div>';
				}
			};
		},
		_getSaveButtonColumn: function(){
			var grid = this;
			return {
				width:24,
				renderer: function(value, meta, record){
					var id = Ext.id(), riskID = record.data.RiskID;
					if(!grid._isRiskEdited(record) && !grid._isRiskNew(record)) return;
					meta.tdAttr = 'title="Save Risk"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							grid.setLoading("Saving Risk");
							grid.isEditing = true;
							RiskDb.get(riskID)
								.then(function(realRiskJSON){
									if(realRiskJSON) return RiskDb.update(riskID, _.merge(realRiskJSON, record.getChanges()));
									else return RiskDb.create(riskID, record.data);
								})
								.then(function(newRiskJSON){ 
									record.commit(); 
									grid._highlightRow(grid.store.indexOf(record));
									grid.risks = _.filter(grid.risks, function(r){ return r.RiskID !== riskID; }).concat([newRiskJSON]);
									grid.risksMap[riskID] = newRiskJSON;
								})
								.fail(function(reason){ grid.alert('ERROR', reason); })
								.then(function(){ 
									grid.setLoading(false); 
									grid.isEditing = false;
								})
								.done();
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			};
		},
		_getCopyButtonColumn: function(){
			var grid = this;
			return {
				width:24,
				renderer: function(value, meta, record){
					var id = Ext.id(), riskID = record.data.RiskID;
					meta.tdAttr = 'title="Copy Risk"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							grid.setLoading("Copying Risk");
							grid.isEditing = true;
							var currentUserOID = Rally.environment.getContext().getUser().ObjectID;
							RiskDb.create(grid._generateRiskID(), _.merge({}, record.data, {SubmitterObjectID: currentUserOID}))
								.then(function(newRiskJSON){ 
									grid.risks = _.filter(grid.risks, function(r){ return r.RiskID !== newRiskJSON.RiskID; }).concat([newRiskJSON]);
									grid.risksMap[newRiskJSON.RiskID] = newRiskJSON;
									
									var model = Ext.create(RiskModel, newRiskJSON);
									grid.store.add(model);
									model.commit();
										
									grid.store.fireEvent('refresh', grid.store);
									grid.view.getEl().setScrollTop(0);
									grid._highlightRow(0);
								})
								.fail(function(reason){ grid.alert('ERROR', reason); })
								.then(function(){ 
									grid.setLoading(false); 
									grid.isEditing = false;
								})
								.done();
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-copy"></i></div>';
				}
			};
		},
		_getDeleteButtonColumn: function(){
			var grid = this;
			return {
				width:24,
				renderer: function(value, meta, record){
					var id = Ext.id(), riskID = record.data.RiskID;
					meta.tdAttr = 'title="Delete Risk"';
					setTimeout(function whenRendered(){
						var el = Ext.get(id);
						if(el) el.on('click', function(){
							grid.isEditing = true;
							grid.confirm('Delete Risk', 'Are you sure?', function(msg){
								if(msg !== 'yes'){
									grid.isEditing = false;
									return;
								}
								grid.setLoading("Deleting Risk");
								RiskDb['delete'](riskID)
									.then(function(){ 
										grid.store.remove(record);
										grid.store.fireEvent('refresh', grid.store);
										grid.risks = _.filter(grid.risks, function(r){ return r.RiskID !== riskID; });
										delete grid.risksMap[riskID];
									})
									.fail(function(reason){ grid.alert('ERROR', reason); })
									.then(function(){ 
										grid.setLoading(false); 
										grid.isEditing = false;
									})
									.done();
							});
						});
						else setTimeout(whenRendered, 10);
					}, 20);
					return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-trash"></i></div>';
				}
			};
		},
		
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
				RiskLevel: '',
				Status: '',
				OwnerObjectID: 0,
				SubmitterObjectID: Rally.environment.getContext().getUser().ObjectID,
				Checkpoint: 0
			});
		},
		_makeDoSortFn: function(fn){
			var grid = this;
			return function(direction){
				grid.store.sort({
					sorterFn: function(r1, r2){
						var val1 = fn(r1), val2 = fn(r2);
						return (direction=='ASC' ? 1 : -1) * ((val1 < val2) ? -1 : (val1 === val2 ? 0 : 1));
					}
				});
			};
		},
		_getPortfolioItemType: function(){
			return this.portfolioItemType || 
				(this.portfolioItemRecords.length ? this.portfolioItemRecords[0].data._type.split('/')[1] : 'PortfolioItem');
		},
		_getTopPortfolioItemType: function(){
			return this.topPortfolioItemType || 'PortfolioItem';
		},
		_getWorkweekData: function(){
			return this.getWorkweeksForDropdown(this.releaseRecord.data.ReleaseStartDate, this.releaseRecord.data.ReleaseDate);
		},
		_getPortfolioItemFIDStore: function(){
			var grid = this;
			return  Ext.create('Ext.data.Store', {
				fields: ['FormattedID', 'ObjectID'],
				data: _.sortBy(_.map(grid.portfolioItemRecords,
					function(record){ return {FormattedID: record.data.FormattedID, ObjectID: record.data.ObjectID}; }),
					function(item){ return item.FormattedID; })
			});
		},
		_getPortfolioItemNameStore: function(){
			var grid = this;
			return Ext.create('Ext.data.Store', {
				fields: ['Name', 'ObjectID'],
				data: _.sortBy(_.map(grid.portfolioItemRecords,
					function(record){ return {Name: record.data.Name, ObjectID: record.data.ObjectID}; }),
					function(item){ return item.Name; })
			});
		},
		_getProjectNameStore: function(){
			var grid = this;
			return Ext.create('Ext.data.Store', {
				fields: ['Name', 'ObjectID'],
				data: _.sortBy(_.map(grid.projectRecords,
					function(record){ return {Name: record.data.Name, ObjectID: record.data.ObjectID}; }),
					function(item){ return item.Name; })
			});
		},
		_htmlEscape: function(str) {
			return String(str)
				//.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		},	
		_getUserByObjectID: function(oid){
			var grid = this;
			if(grid.userCache[oid]) return Q(grid.userCache[oid]);
			else if(grid.userCache.pending[oid]) return grid.userCache.pending[oid];
			else {
				var deferred = Q.defer(),
					store = Ext.create('Rally.data.wsapi.Store',{
						model: 'User',
						autoLoad: true,
						fetch: ['ObjectID', 'FirstName', 'LastName', 'UserName'],
						context: Rally.environment.getContext().getDataContext(),
						filters: [{ property:'ObjectID', value:oid }],
						listeners: { 
							load: function(store){ 
								grid.userCache[oid] = store.first();
								delete grid.userCache.pending[oid];
								return deferred.resolve(grid.userCache[oid]); 
							} 
						}
					});
				grid.userCache.pending[oid] = deferred.promise;
				return deferred.promise;
			}
		},
		_formatUserName: function(userRecord){
			return userRecord ? ((userRecord.data.LastName + ', ' + userRecord.data.FirstName) || userRecord.data.UserName) : '?';
		},
		_generateRiskID: function(){
			return 'risk-' + this.releaseRecord.data.Name + '-' + 
				this.scrumGroupRootRecord.data.ObjectID + '-' + 
				(new Date()*1 + '' + (Math.random()*10000 >> 0));
		},
		_isRiskEdited: function(riskRecord){
			return this.risksMap[riskRecord.data.RiskID] && riskRecord.dirty;
		},
		_isRiskNew: function(riskRecord){
			return !this.risksMap[riskRecord.data.RiskID] && riskRecord.dirty;
		},
		_highlightRow: function(index){
			var grid = this;
			Ext.fly(this.getView().getNode(index)).highlight("8dc63f", { attr: 'backgroundColor', duration: 1500 });
		},
		
		/**________________________________________ PUBLIC METHODS ________________________________________*/
		syncRisks: function(realRisks){
			/** NOTE: this function will NOT remove any pending edits or new risks in the grid */
			var grid = this, 
				store = grid.getStore(),
				riskRecords = store.getRange(),
				realRisksMap = _.reduce(realRisks, function(map, risk){ map[risk.RiskID] = risk; return map; }, {}),
				newOrEditedRecords = [];

			if(grid.hasPendingEdits()) return;
			else {
				grid.setLoading('Updating Risks');
				grid.risks = _.cloneDeep(realRisks);
				grid.risksMap = _.cloneDeep(realRisksMap);
				
				_.each(riskRecords, function(riskRecord){
					var realRisk = realRisksMap[riskRecord.data.RiskID];
					delete realRisksMap[riskRecord.data.RiskID];
					
					if(!realRisk) store.remove(riskRecord);
					else if(_.any(realRisk, function(value, field){ return !_.isEqual(riskRecord.data[field], value); })){
						_.each(realRisk, function(value, field){ riskRecord.set(field, value); });
						newOrEditedRecords.push(riskRecord);
					}
				});
				_.each(realRisksMap, function(realRisk){ 
					var model = Ext.create(RiskModel, realRisk); 
					store.add(model);
					newOrEditedRecords.push(model);
				});
				store.sync();
				store.fireEvent('refresh', grid.store);
				
				grid.setLoading(false);
				setTimeout(function(){ 
					_.each(newOrEditedRecords, function(record){ grid._highlightRow(store.indexOf(record)); });
				}, 20);
			}
		},
		hasPendingEdits: function(){
			var grid = this;
			if(grid.isEditing || grid.editingPlugin.activeEditor) return true;
			return _.some(grid.store.getRange(), function(record){ return grid._isRiskNew(record) || grid._isRiskEdited(record); });
		}
	});
}());