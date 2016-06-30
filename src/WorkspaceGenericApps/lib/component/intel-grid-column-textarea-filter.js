/** 
	SUMMARY:
		This is used in grid column configs in the items: [] field for the column. It is a fancy grid column filter component written in reference to intel-grid-column-filter.
		
	DEPENDENCIES:
		Intel.lib.component.inteltextarea
		Intel.lib.mixin.PrettyAlert
		
		Q
		lodash
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;	
	
	Ext.define('Intel.lib.component.GridColumnTextAreaFilter', {
		extend:'Ext.container.Container',
		cls: 'intel-grid-column-filter',
		alias: ['widget.intelgridcolumntextareafilter'],
		mixins: [
			'Intel.lib.mixin.PrettyAlert'
		],
		
		layout: 'hbox',
		border:0,
		flex:1,
		
		/**************************************** caller CAN override these **********************************************/
		filterXtype: 'inteltextarea',
		enableKeyEvents: true,
		valueField: null,
		displayField: null,
		convertDisplayFn: function(value, field, record){ return value; },			//can return promise
		convertValueFn: function(value, field, record){ return value; },				//can return promise
		sortFn: function(valueFieldValue, displayFieldValue, record){ return valueFieldValue; },
		filterFn: function(filterValue, recordValue, valueField, record){ 
			return recordValue.toLowerCase().indexOf(filterValue.toLowerCase()) != -1; 
		},
		
		/**************************************** INITIALIZE/PRIVATE METHODS **********************************************/
		initComponent: function(){
			var colFilter = this;
			colFilter.filterValues = [];
			colFilter.hideClass = 'grid-column-filter-hide-' + (Math.random()*1000000>>0);
			Ext.DomHelper.append(Ext.getBody(), '<style>.' + colFilter.hideClass + ' { display: none; }</style>');
			Ext.DomHelper.append(Ext.getBody(), '<style>.intel-grid-column-filter > * { border: none !important; }</style>');
			colFilter.on('added', function(){ colFilter._initColFilter(); });
			colFilter.callParent();
		},
		_initColFilter: function(){
			var colFilter = this, 
				column = colFilter.ownerCt,
				valueField = colFilter.valueField || column.dataIndex,
				displayField = colFilter.displayField || valueField;
			setTimeout(function waitForGrid(){
				var grid = column.up('grid');
				if(grid){ 
					var gridStore = grid.getStore();
				
					grid.view.getRowClass = colFilter._createGetRowClassIntercepter(grid.view.getRowClass);
					colFilter._addItems(gridStore, valueField, displayField);
				 
					gridStore.on('datachanged', function(){colFilter._updateStoreOptions(gridStore, valueField, displayField); });
					gridStore.on('refresh', function(){colFilter._updateStoreOptions(gridStore, valueField, displayField); });
					grid.on('edit', function(){colFilter._updateStoreOptions(gridStore, valueField, displayField); });
					grid.on('sortchange', function(){colFilter.applyFilters(); }); 
				}
				else setTimeout(waitForGrid, 20);
			}, 20);
		},
		_addItems: function(gridStore, valueField, displayField){
			var colFilter = this;

			colFilter._getStoreOptions(gridStore, valueField, displayField).then(function(storeOptions){
				colFilter.add([{
					xtype: colFilter.filterXtype,
					flex:1,
					emptyText: 'Type to Filter',
					store: Ext.create('Ext.data.Store', {
						fields:[
							{name:'Display', type:'auto'}, 
							{name:'Value', type:'auto'}
						],
						data: ""
					}),
					displayField: 'Display',
					valueField: 'Value',
					listeners:{
						change: function(combo, newValue){
							colFilter.setFilterValue(newValue);
						}
					}
				}, {xtype:'container', width:5}]);
				colFilter.doLayout();
			})
			.fail(function(reason){ colFilter.alert('ERROR', reason); })
			.done();
		},	
		_getStoreOptions: function(gridStore, valueField, displayField){
			var grid = this;
			return Q.all(_.map(gridStore.getRange(), function(record){
				return Q.all([
					Q(grid.convertDisplayFn(record.get(displayField), displayField, record)),
					Q(grid.convertValueFn(record.get(valueField), valueField, record)),
					Q(record)
				]);
			}))
			.then(function(options){	
				var array = [{Display:'Clear', Value: null}].concat(_.sortBy(_.unique(_.map(_.filter(options, 
					function(option){ return option[0] !== undefined && option[1] !== undefined; }),
					function(option){ return {Display: option[0], Value: option[1], Record: option[2]}; }),
					function(option){ return option.Value; }),
					function(option){ return grid.sortFn(option.Value, option.Display, option.Record); })); 
					return array[1];
			});
		},
		_updateStoreOptions: function(gridStore, valueField, displayField){
			var colFilter = this,
				textFilter = colFilter.down(colFilter.filterXtype);
				textFilter.setValue("");
		},
		
		_createGetRowClassIntercepter: function(fn){
			var colFilter = this, column = colFilter.ownerCt;
			
			return function(record){
				var originalCls = (fn || function(){}).apply(null, arguments) || '',
					valueField = colFilter.valueField || column.dataIndex,
					isVisible = !colFilter.filterValues.length || _.any(colFilter.filterValues, function(filterValue){ 
						return colFilter.filterFn(filterValue, record.get(valueField), valueField, record);
					}); 
				if(!isVisible) return originalCls + ' ' + colFilter.hideClass;
				else return originalCls;
			};
		},
		
		_applyToGridView: function(grid, fn, args){
			var view = grid.getView(), lockingPartner = view.lockingPartner;
			view[fn].apply(view, args);
			if(lockingPartner) lockingPartner[fn].apply(lockingPartner, args);
		},
		
		/****************************************PUBLIC METHODS **********************************************/
		applyFilters: function(){
			var colFilter = this,
				column = colFilter.ownerCt,
				grid = colFilter.up('grid'),
				valueField = colFilter.valueField || column.dataIndex;
			_.each(grid.store.getRange(), function(record, index){
					var isVisible = !colFilter.filterValues.length || 
						colFilter.filterFn(colFilter.filterValues, record.get(valueField), valueField, record);
				if(isVisible) colFilter._applyToGridView(grid, 'removeRowCls', [index, colFilter.hideClass]); 
				else colFilter._applyToGridView(grid, 'addRowCls', [index, colFilter.hideClass]); 
			});
		},
		getFilterValues: function(){
			return this.filterValues;
		},
		setFilterValue: function(value){
			var colFilter = this,
				textFilter = colFilter.down(colFilter.filterXtype);
			textFilter.setValue(value);
			colFilter.filterValues = value;
			colFilter.applyFilters();
		},
		clearFilters: function(){
			var colFilter = this,
				grid = colFilter.up('grid'),
				textFilter = colFilter.down(colFilter.filterXtype),
				recordCount = grid.store.getCount();
				
			textFilter.setValue();
			colFilter.filterValues = [];
			while(recordCount--) colFilter._applyToGridView(grid, 'removeRowCls', [recordCount, colFilter.hideClass]); 
		}
	});
}());
	