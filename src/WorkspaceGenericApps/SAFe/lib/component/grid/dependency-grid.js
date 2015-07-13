// /** 
	// SUMMARY:
		// Configurable Dependency Grid that extends rallygrid

	// DEPENDENCIES: 
		// Intel.lib.resource.KeyValueDb
		// Intel.lib.component.GridColumnFilter
		// Intel.lib.mixin.IntelWorkweek
		// Intel.lib.mixin.PrettyAlert
		// Intel.lib.component.UserPicker
		// Intel.lib.component.TextArea
		// Intel.lib.component.ComboBox
		// Intel.lib.component.FixedComboBox
		// Intel.SAFe.lib.resource.RiskDb
		// Intel.SAFe.lib.model.Risk
		
		
		// Font-Awesome
		// Q
		// lodash
		// jquery
// */

// (function(){
	// var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		// RiskModel = Intel.SAFe.lib.model.Risk;
		
	// Ext.define('Intel.SAFe.lib.component.RisksGrid', {
		// extend:'Rally.ui.grid.Grid',
		// alias: ['widget.intelrisksgrid'], 
		// mixins: [
			// 'Intel.lib.mixin.IntelWorkweek',
			// 'Intel.lib.mixin.PrettyAlert'
		// ],
		
		// cls: 'risks-grid',
		// scroll:'vertical',
		// plugins: [ 'cellediting' ],
		// viewConfig:{ preserveScrollOnRefresh:true },
		
		// disableSelection: true,
		// showRowActionsColumn:false,
		// showPagingToolbar:false,
		// enableEditing:false,
		
		// userCache: {},
		// risksMap: {},
		// projectRecordMap: {},
		// portfolioItemRecordMap: {},
		
		// /**______________________________ CONFIGURATION ____________________________________________*/
		// releaseRecord: null,
		// scrumGroupRootRecord: null,
		// projectRecords: [],
		// portfolioItemRecords: [],
		// risks: [],
		// visibleColumns: [],
		
		// /**______________________________ INITIALIZE/PRIVATE METHODS ____________________________________________*/
		// initComponent: function(){
			// _.each(this.risks, function(riskJSON){ return risksMap[riskJSON.RiskID] = riskJSON; });
			// _.each(this.projectRecords, function(project){ return projectRecordMap[project.data.ObjectID] = project; });
			// _.each(this.portfolioItemRecords, function(pi){ return portfolioItemRecordMap[pi.data.ObjectID] = pi; });
			// this.columns = this._getColumns();
			// this.store = this._getStore();
			// this.header = this._getHeader();
			// this.listeners = this._getListeners();
			// this.callParent();
		// },
		
		// _getColumns: function(){
			// var grid = this;
			// return {
				// defaults: {
					// text:'',
					// resizable: false,
					// draggable: false,
					// sortable: false,
					// editor: false,
					// renderer: function(val){ return val || '-'; },
				// },
				// items: grid.visibleColumns.map(function(colType){ return grid._getColumnCfg(colType); })
			// };
		// },
		// _getStore: function(){
			// return Ext.create('Ext.data.Store', { 
				// data: _.cloneDeep(this.risks),
				// autoSync:true,
				// model: RiskModel,
				// proxy: {
					// type:'sessionproxy',
					// id:'RiskProxy-' + (Math.random()*100000>>0)
				// },
				// sorters: [function(r1, r2){ return r1.data.RiskID > r2.data.RiskID ? -1 : 1; }]
			// });
		// },
		// _getHeader: function(){
			// var grid = this;
			// return header: {
				// layout: 'hbox',
				// items: [{
					// xtype:'text',
					// cls:'risks-grid-header-text',
					// width:200,
					// text:"RISKS"
				// },{
					// xtype:'container',
					// flex:1000,
					// layout:{
						// type:'hbox',
						// pack:'end'
					// },
					// items:[{
						// xtype:'button',
						// text:'+ Add Risk',
						// cls: 'add-new-button',
						// width:80,
						// listeners:{
							// click: function(){
								// if(!grid.portfolioItemRecords.length) grid.alert('ERROR', 'No ' + grid._getPortfolioItemType() + 's found.');
								// else {
									// var model = Ext.create(RiskModel, {
										// RiskID: grid._generateRiskID(),
										// ReleaseName: grid.releaseRecord.data.Name,
										// PortfolioItemObjectID: 0,
										// ProjectObjectID: grid.projectRecords.length === 1 ? grid.projectRecords[0].data.ObjectID : 0,
										// Description: '',
										// Impact: '',
										// MitigationPlan: '',
										// RiskLevel: '',
										// Status: '',
										// OwnerObjectID: 0,
										// SubmitterObjectID: Rally.environment.getContext().getUser().ObjectID,
										// Checkpoint: 0
									// });
									
									// _.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', grid), 'clearValues');
									// grid.store.insert(0, [model]);
									// grid.view.getEl().setScrollTop(0);
									// grid.getSelectionModel().select(model);
								// }
							// }
						// }
					// },{
						// xtype:'button',
						// text:'Clear Filters',
						// width:100,
						// listeners:{ 
							// click: function(){ _.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', grid), 'clearValues'); }
						// }
					// }]
				// }]
			// };
		// },
		// _getListeners: function(){
			// var grid = this;
			// return {
				// edit: function(editor, e){			
					// var grid = e.grid,
						// record = e.record,
						// field = e.field,
						// value = e.value,
						// originalValue = e.originalValue;
						
					// if(value === originalValue) return; 
					// else if(!value) { record.set(field, originalValue); return; }
					// else if(['Description', 'Impact', 'MitigationPlan'].indexOf(field)>-1) {
						// value = grid._htmlEscape(value);			
						// record.set(field, value);
					// }
				// }
			// };
		// },
		
		// _getColumnCfg: function(colType){
			// var grid = this,
				// workweekData = grid._getWorkweekData()
				// portfolioItemFIDStore = grid._getCachedPortfolioItemFIDStore(),
				// portfolioItemNameStore = grid._getCachedPortfolioItemNameStore();
				
			// switch(colType){
				// case 'PortfolioItemFormattedID': 
					// return {
						// text:'#',
						// dataIndex:'PortfolioItemObjectID',
						// tdCls: 'intel-editor-cell',	
						// width:80,
						// editor:{
							// xtype:'intelcombobox',
							// width:80,
							// store: portfolioItemFIDStore,
							// displayField: 'FormattedID',
							// valueField: 'ObjectID'
						// },			
						// sortable:true,
						// renderer: function(oid){ return grid.portfolioItemRecordMap[oid].data.FormattedID; },
						// items:[{ xtype:'intelgridcolumnfilter', displayField: 'FormattedID'}],
					// };
				// case 'PortfolioItemName':
					// return {
						// text: grid._getPortfolioItemType(),
						// dataIndex:'PortfolioItemName',
						// tdCls: 'intel-editor-cell',	
						// flex:1,
						// editor:{
							// xtype:'intelcombobox',
							// flex:1,
							// store: portfolioItemNameStore,
							// displayField: 'Name',
							// valueField: 'ObjectID'
						// },			
						// sortable:true,
						// renderer: function(oid){ return grid.portfolioItemRecordMap[oid].data.Name; },
						// items:[{ xtype:'intelgridcolumnfilter', displayField: 'Name'}],
					// };
				// case 'Description':
					// return {
						// text:'Risk Description (If This...)', 
						// dataIndex:'Description',
						// tdCls: 'intel-editor-cell',	
						// flex:1,
						// editor: 'inteltextarea'
					// };
				// case 'Impact':
					// return {
						// text:'Impact (Then this...)', 
						// dataIndex:'Impact',
						// tdCls: 'intel-editor-cell',	
						// flex:1,
						// editor: 'inteltextarea',
					// };
				// case 'MitigationPlan':
					// return {
						// text:'Mitigation Plan', 
						// dataIndex:'MitigationPlan',
						// tdCls: 'intel-editor-cell',	
						// flex:1,
						// editor: 'inteltextarea'
					// };
				// case 'Status':
					// return {
						// text:'Status',
						// dataIndex:'Status',
						// tdCls: 'intel-editor-cell',	
						// width:100,			
						// editor:{
							// xtype:'intelfixedcombo',
							// store: Ext.create('Ext.data.Store', {
								// fields: ['Status'],
								// data: _.map(RiskModel.getStatusOptions(), function(option){ return {Status: option}; })
							// }),
							// displayField:'Status'
						// },
						// sortable:true,
						// items:[{ xtype:'intelgridcolumnfilter'}],
					// };
				// case 'RiskLevel':
					// return {
						// text:'Risk Level',
						// dataIndex:'RiskLevel',
						// tdCls: 'intel-editor-cell',	
						// width:100,			
						// editor:{
							// xtype:'intelfixedcombo',
							// store: Ext.create('Ext.data.Store', {
								// fields: ['RiskLevel'],
								// data: _.map(RiskModel.getRiskLevelOptions(), function(option){ return {RiskLevel: option}; })
							// }),
							// displayField:'RiskLevel'
						// },
						// sortable:true,
						// items:[{ xtype:'intelgridcolumnfilter'}],
					// };
				// case 'Checkpoint':
					// return {
						// text:'Checkpoint',	
						// dataIndex:'Checkpoint',
						// tdCls: 'intel-editor-cell',	
						// width:90,
						// editor:{
							// xtype:'intelfixedcombo',
							// width:80,
							// store: Ext.create('Ext.data.Store', {
								// fields: ['DateVal', 'Workweek'],
								// data: workweekData
							// }),
							// displayField: 'Workweek',
							// valueField: 'DateVal'
						// },
						// sortable:true,
						// renderer:function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : '-'; },	
						// items:[{ 
							// xtype:'intelgridcolumnfilter', 
							// convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : undefined; }
						// }]
					// };
				// case 'Owner':
					// return {
						// text:'Owner', 
						// dataIndex:'OwnerObjectID',
						// tdCls: 'intel-editor-cell',	
						// flex:1,
						// editor: {
							// xtype: 'inteluserpicker',
							// emptyText: 'Select Owner',
							// valueField: 'ObjectID'
						// }, 
						// renderer: function(oid){
							// var id = Ext.id();
							// grid._getUserByObjectID(oid)
								// .then(function(user){ if(user) Ext.get(id).setHTML(grid._formatUserName(user)); })
								// .fail(function(reason){ me.alert('ERROR', reason); })
								// .done();
							// return '<div id="' + id + '">?</div>';
						// },
						// sortable:true,
						// items:[{ 
							// xtype:'intelgridcolumnfilter',
							// convertDisplayFn: function(oid){ return grid._getUserByObjectID(oid).then(function(user){ return grid._formatUserName(user); }) }
						// }],
					// };
				// case 'Submitter':
					// return {
						// text:'Submitter', 
						// dataIndex:'SubmitterObjectID',
						// tdCls: 'intel-editor-cell',	
						// flex:1,
						// renderer: function(oid){
							// var id = Ext.id();
							// grid._getUserByObjectID(oid)
								// .then(function(user){ if(user) Ext.get(id).setHTML(grid._formatUserName(user)); })
								// .fail(function(reason){ me.alert('ERROR', reason); })
								// .done();
							// return '<div id="' + id + '">?</div>';
						// },
						// sortable:true,
						// items:[{ 
							// xtype:'intelgridcolumnfilter',
							// convertDisplayFn: function(oid){ return grid._getUserByObjectID(oid).then(function(user){ return grid._formatUserName(user); }) }
						// }],
					// };
				// case '_undoButton':
					// return {
						// width:24,
						// renderer: function(value, meta, record){
							// var id = Ext.id();
							// if(!grid._isRiskEdited(record)) return;
							// meta.tdAttr = 'title="Undo"';
							// setTimeout(function(){
								// Ext.get(id).on('click', function(){ record.cancelEdit(); });
							// }, 20);
							// return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-undo"></i></div>';
						// }
					// };
				// case '_saveButton':
					// return {
						// width:24,
						// renderer: function(value, meta, record){
							// var id = Ext.id(), riskID = record.data.RiskID;
							// if(!grid._isRiskEdited(record) && !grid._isRiskNew(record)) return;
							// meta.tdAttr = 'title="Save Risk"';
							// setTimeout(function(){
								// Ext.get(id).on('click', function(){
									// grid.setLoading("Saving Risk");
									// RiskDb.get(riskID)
										// .then(function(realRiskJSON){
											// if(realRiskJSON) return RiskDb.update(riskID, _.merge(realRiskJSON, record.getChanges()));
											// else return RiskDb.create(riskID, record.data);
										// })
										// .then(function(newRiskJSON){ 
												// record.commit(); 
												// grid.risks = _.filter(grid.risks, function(r){ return r.RiskID !== riskID; }).concat([newRiskJSON]);
												// grid.risksMap[riskID] = newRiskJSON;
											// })
										// .fail(function(reason){ me.alert('ERROR', reason); })
										// .then(function(){ grid.setLoading(false); })
										// .done();
								// });
							// }, 20);
							// return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-floppy-o"></i></div>';
						// }
					// };
				// case '_copyButton':
					// return {
						// width:24,
						// renderer: function(value, meta, record){
							// var id = Ext.id(), riskID = record.data.RiskID;
							// meta.tdAttr = 'title="Copy Risk"';
							// setTimeout(function(){
								// Ext.get(id).on('click', function(){
								// grid.setLoading("Copying Risk");
								// RiskDb.create(me._generateRiskID(), record.data)
									// .then(function(newRiskJSON){ 
										// grid.risks.push(newRiskJSON);
										// grid.risksMap[newRiskJSON.RiskID] = newRiskJSON;
										
										// var model = Ext.create(RiskModel, newRiskJSON);
										// _.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', grid), 'clearValues');
										// grid.store.insert(0, [model]);
										// grid.view.getEl().setScrollTop(0);
										// grid.getSelectionModel().select(model);
									// })
									// .fail(function(reason){ me.alert('ERROR', reason); })
									// .then(function(){ grid.setLoading(false); })
									// .done(updateFilterOptions);
								// });
							// }, 20);
							// return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-copy"></i></div>';
						// }
					// };
				// case '_deleteButton':
					// return {
						// width:24,
						// renderer: function(value, meta, record){
							// var id = Ext.id(), riskID = record.data.RiskID;
							// meta.tdAttr = 'title="Delete Risk"';
							// setTimeout(function(){
								// Ext.get(id).on('click', function(){
									// me.confirm('Delete Risk', 'Are you sure?', function(msg){
										// if(msg !== 'yes') return;
										// grid.setLoading("Deleting Risk");
										// RiskDb['delete'](riskID)
											// .then(function(){ 
												// record.remove(); 
												// grid.risks = _.filter(grid.risks, function(r){ return r.RiskID !== riskID; })
												// delete grid.risksMap[riskID];
											// })
											// .fail(function(reason){ me.alert('ERROR', reason); })
											// .then(function(){ grid.setLoading(false); })
											// .done(updateFilterOptions);
									// });
								// });
							// }, 20);
							// return '<div id="' + id + '" class="intel-editor-cell"><i class="fa fa-md fa-trash"></i></div>';
						// }
					// };
				// default: return {xtype:'displayField', value:'Invalid: ' + colType};
			// };
		// },
		// _getPortfolioItemType: function(){
			// return this.portfolioItemType || (portfolioItemRecords.length ? portfolioItemRecords[0].data._type.split('/')[1] : 'PortfolioItem');
		// },
		// _getWorkweekData: function(){
			// return this.getWorkweeksForDropdown(this.releaseRecord.data.ReleaseStartDate, this.releaseRecord.data.ReleaseDate);
		// },
		// _getCachedPortfolioItemFIDStore: function(){
			// var grid = this;
			// if(!grid.portfolioItemFIDStore){
				// grid.portfolioItemFIDStore = Ext.create('Ext.data.Store', {
					// fields: ['FormattedID', 'ObjectID'],
					// data: _.sortBy(_.map(grid.portfolioItemRecords,
						// function(record){ return {FormattedID: record.data.FormattedID, ObjectID: record.data.ObjectID}; }),
						// function(item){ return item.data.FormattedID; })
				// });
			// }
			// return grid.portfolioItemFIDStore;
		// },
		// _getCachedPortfolioItemNameStore: function(){
			// var grid = this;
			// if(!grid.portfolioItemNameStore){
				// grid.portfolioItemNameStore = Ext.create('Ext.data.Store', {
					// fields: ['Name', 'ObjectID'],
					// data: _.sortBy(_.map(grid.portfolioItemRecords,
						// function(record){ return {Name: record.data.Name, ObjectID: record.data.ObjectID}; }),
						// function(item){ return item.data.Name; })
				// });
			// }
			// return grid.portfolioItemNameStore;
		// },
		// _htmlEscape: function(str) {
			// return String(str)
				// //.replace(/&/g, '&amp;')
				// .replace(/"/g, '&quot;')
				// .replace(/'/g, '&#39;')
				// .replace(/</g, '&lt;')
				// .replace(/>/g, '&gt;');
		// },	
		// _getUserByObjectID: function(oid){
			// var grid = this;
			// if(grid.userCache[oid]) return Q(grid.userCache[oid]);
			// else {
				// var deferred = Q.defer(),
					// store = Ext.create('Rally.data.wsapi.Store',{
						// model: 'User',
						// autoLoad: true,
						// fetch: ['ObjectID', 'FirstName', 'LastName', 'UserName'],
						// context: Rally.environment.getContext().getDataContext(),
						// filters: [{ property:'ObjectID', value:oid }],
						// listeners: { 
							// load: function(store){ 
								// grid.userCache[oid] = store.first();
								// return deferred.resolve(grid.userCache[oid]); 
							// } 
						// }
					// });
				// return deferred.promise;
			// }
		// },
		// _formatUserName: function(userRecord){
			// return userRecord ? ((userRecord.data.LastName + ', ' + userRecord.data.FirstName) || userRecord.data.UserName) : '?';
		// },
		// _generateRiskID: function(){
			// return 'risk-' + this.releaseRecord.data.Name + '-' + 
				// this.scrumGroupRootRecord.data.ObjectID + '-' + 
				// (new Date()*1 + '' + (Math.random()*10000 >> 0));
		// },
		// _isRiskEdited: function(riskRecord){
			// return this.risksMap[riskRecord.data.RiskID] && riskRecord.dirty;
		// },
		// _isRiskNew: function(riskRecord){
			// return !this.risksMap[riskRecord.data.RiskID] && riskRecord.dirty;
		// },
		// _isRiskDeleted: function(riskRecord){
			// return !this.risksMap[riskRecord.data.RiskID] && !riskRecord.dirty;
		// },
		
		// /**______________________________ PUBLIC METHODS ____________________________________________*/
		// syncRisks: function(realRisks){
			// /** NOTE: this function will NOT remove any pending edits or new risks in the grid */
			// var grid = this, 
				// store = grid.getStore(),
				// riskRecords = store.getRange()
				// realRisksMap = _.reduce(realRisks, function(map, risk){ map[risk.RiskID] = risk; return map; }, {});

			// grid.risks = realRisks;
			// grid.risksMap = _.cloneDeep(realRisksMap);
			
			// store.suspendEvents(true);
			// _.each(riskRecords, function(riskRecord){
				// var realRisk = realRisksMap[riskRecord.data.RiskID];
				// delete realRisksMap[riskRecord.data.RiskID];
				
				// if(grid._isRiskDeleted(riskRecord)) store.remove(riskRecord);
				// else if(!grid._isRiskDeleted(riskRecord) && !grid._isRiskDeleted(riskRecord)){
					// if(_.any(realRisk, function(value, field){ return !_.isEqual(riskRecord.data[field], value); })){
						// riskRecord.beginEdit();
						// _.each(realRisk, function(value, field){ riskRecord.set(field, value); });
						// riskRecord.endEdit();
					// }
				// }
			// });
			// _.each(realRisksMap, function(realRisk){ store.add(Ext.create(RiskModel, realRisk)); });
			// store.resumeEvents();
		// }
	// });
// }());