Ext.define('CustomFieldEditor', {
  extend: 'IntelRallyApp',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'ReleaseQuery',
		'IntelWorkweek',
		'AsyncQueue'
	],
	componentCls: 'app',
	height:2000,

	/****************************************************** DATA STORE METHODS ********************************************************/
	
	_getFeatureFilterString: function(){
		return Ext.create('Rally.data.wsapi.Filter', { 
			property:'c_TeamCommits',
			operator:'!=',
			value: ''
		}).or(Ext.create('Rally.data.wsapi.Filter', {
			property:'c_Risks',
			operator:'!=',
			value: ''
		})).toString();
	},
	
	_loadFeatures: function(){ 
		var me=this,
			filterString = me._getFeatureFilterString(),
			featureStore = Ext.create('Rally.data.wsapi.Store',{
				model: 'PortfolioItem/Feature',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'FormattedID', 'c_Risks', 'c_TeamCommits', 'Release'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{ property:'Dummy', value:'value' }]
			});
		
		featureStore._hydrateModelAndLoad = function(options){
			var deferred = new Deft.Deferred();
			this.hydrateModel().then({
					success: function(model) {
						this.proxy.encodeFilters = function(){ //inject custom filter here. woot
							return filterString;
						};
						this.load(options).then({
								success: Ext.bind(deferred.resolve, deferred),
								failure: Ext.bind(deferred.reject, deferred)
						});
					},
					scope: this
			});
		};
		return me._reloadStore(featureStore).then(function(featureStore){
			me.FeatureStore = featureStore;
		});
	},
	
	_getUserStoryFilterString: function(){
		return Ext.create('Rally.data.wsapi.Filter', { 
			property:'c_Dependencies',
			operator:'!=',
			value: ''
		}).toString();
	},
	
	_loadUserStories: function(){ 
		var me=this,
			filterString = me._getUserStoryFilterString(),
			storyStore = Ext.create('Rally.data.wsapi.Store',{
				model: 'Hierarchicalrequirement',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'FormattedID', 'c_Dependencies', 'Release'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{ property:'Dummy', value:'value' }]
			});
		
		storyStore._hydrateModelAndLoad = function(options){
			var deferred = new Deft.Deferred();
			this.hydrateModel().then({
					success: function(model) {
						this.proxy.encodeFilters = function(){ //inject custom filter here. woot
							return filterString;
						};
						this.load(options).then({
								success: Ext.bind(deferred.resolve, deferred),
								failure: Ext.bind(deferred.reject, deferred)
						});
					},
					scope: this
			});
		};
		return me._reloadStore(storyStore).then(function(storyStore){
			me.UserStoryStore = storyStore;
		});
	},
	
	/********************************************************* MISC FUNCS ***********************************************/
	
	_isJsonValid: function(str){
		try{
			JSON.parse(str);
			return true;
		}
		catch(e){ return false; }
	},
	
	_atob: function(a){
		try { return atob(a); }
		catch(e){ return 'INVALID ATOB:\n' + a; }
	},
	
	/******************************************************* LAUNCH ********************************************************/
	
	_showGrids: function(){
		var me=this;
		me._loadGrid(me.FeatureStore, 'TeamCommits');
		me._loadGrid(me.FeatureStore, 'Risks');
		me._loadGrid(me.UserStoryStore, 'Dependencies');		
	},
	
	_updateGrids: function(){ //synchronous function
		var me=this;
		if(me.FeatureStore){
			if(me.TeamCommitsStore) me.TeamCommitsStore.intelUpdate();
			if(me.RisksStore) me.RisksStore.intelUpdate();
		}
		if(me.UserStoryStore){
			if(me.DependenciesStore) me.DependenciesStore.intelUpdate();
		}
	},
	
	_reloadStores: function(){ //this function calls updateAllGrids
		var me=this,
			promises = [];
		promises.push(me._loadFeatures());
		promises.push(me._loadUserStories());
		return Q.all(promises);
	},

	_reloadEverything:function(){
		var me = this;
		
		me.UserStoryStore = undefined;
		me.FeatureStore = undefined;
		
		me.RisksGrid = undefined;
		me.TeamCommitsGrid = undefined;
		me.DependenciesGrid = undefined;
		
		me.DependenciesStore = undefined;
		me.RisksStore = undefined;
		me.TeamCommitsStore = undefined;
		
		me.setLoading(true);

		me.removeAll(); //delete vel & team commits

		me._loadManualRefreshButton();
		
		me._enqueue(function(unlockFunc){
			me._reloadStores()
				.then(function(){
					me._updateGrids();
				})
				.then(function(){
					me.setLoading(false);
					me._showGrids();
					unlockFunc();
				})
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason);
					unlockFunc();
				})
				.done();
		});
	},
	
	launch: function(){
		var me = this;
		me._initDisableResizeHandle();
		me._initFixRallyDashboard();
		me._reloadEverything();
	},

	/******************************************************* RENDER ********************************************************/
	
	_loadManualRefreshButton: function(){
		var me=this;
		me.add({
			xtype:'button',
			text:'Refresh Page',
			width:100,
			listeners:{
				click: function(){ me._reloadEverything(); }
			}
		});
	},
	
	_loadGrid: function(realStore, customFieldName){ //customFieldName is without the c_ in front
		var me = this,
			c_customFieldName = 'c_' + customFieldName,
			customStoreName = customFieldName + 'Store',
			customGridName = customFieldName + 'Grid', 
			records = _.reduce(realStore.data.items, function(records, record){
				var customField = me._atob(record.data[c_customFieldName]);
				if(customField){
					records.push({
						FormattedID: record.data.FormattedID,
						Name: record.data.Name,
						Release: record.data.Release ? record.data.Release.Name : '',
						CustomFieldValue: customField
					});
				}
				return records;
			}, []);

		function sorterFn(o1, o2){ return o1.data.FormattedID > o2.data.FormattedID ? -1 : 1; }
		
		me[customStoreName] = Ext.create('Intel.data.FastStore', {
			data: records,
			model: 'CFEditorModel',
			proxy: {
				type:'fastsessionproxy',
				id:'teamcommits' + Math.random()
			},
			sorters:[sorterFn],
			intelUpdate: function(){ 
				var customStore = me[customStoreName], 
					customRecords = customStore.data.items,
					unaccountedFor = customRecords.slice(),
					realRecords = realStore.data.items;
				Outer:
				for(var i=0, len=realRecords.length; i<len; ++i){
					var realRecord = realRecords[i],
						realFieldValue = me._atob(realRecord.data[c_customFieldName]),
						customRecord = customStore.findRecord('FormattedID', realRecord.data.FormattedID);
					if(!customRecord && !realFieldValue) continue;
					else if(!customRecord && realFieldValue){
						customStore.add(Ext.create('CFEditorModel',  {
							FormattedID: realRecord.data.FormattedID,
							Name: realRecord.data.Name,
							Release: realRecord.data.Release ? realRecord.data.Release.Name : '',
							TeamCommits: realFieldValue
						}));
					} else if(customRecord && !realFieldValue){
						customStore.remove(customRecord);
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].data.FormattedID === customRecord.data.FormattedID){
								unaccountedFor.splice(i, 1);
								break;
							}
						}
					} else {
						if(customRecord.data.CustomFieldValue !== realFieldValue) {
							customRecord.set('.CustomFieldValue', realFieldValue);
						}
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].data.FormattedID === customRecord.data.FormattedID){
								unaccountedFor.splice(i, 1);
								break;
							}
						}
					}
				}
				unaccountedFor.forEach(function(customRecord){
					customStore.remove(customRecord);
				});
			}
		});
		
		var columnCfgs = [
			{
				text:'ID', 
				dataIndex:'FormattedID',
				width:100,
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				text:'Name', 
				dataIndex:'Name',
				width:150,
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				text:'Release', 
				dataIndex:'Release',
				width:150,
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				dataIndex:'CustomFieldValue',
				width:60,
				text:'b64 length',
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(json){ return btoa(json).length; }
			},{
				dataIndex:'CustomFieldValue',
				flex:1,
				text:'Data',
				editor:{
					xtype:'textarea',
					grow:true,
					growMin:20,
					growMax:300
				},
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				tdCls:'pre-wrap-cell intel-editor-cell',
				cls:'header-cls'
			},{
				text:'',
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				width:30,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, customRecord){
					var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.FormattedID),
						realFieldValue = me._atob(realRecord.data[c_customFieldName]);
					if(realFieldValue === customRecord.data.CustomFieldValue) return;
					meta.tdAttr = 'title="Undo"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									customRecord.set('CustomFieldValue', realFieldValue);
									customRecord.commit();
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
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, customRecord){
					var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.FormattedID),
						realFieldValue = me._atob(realRecord.data[c_customFieldName]),
						newFieldValue = customRecord.data.CustomFieldValue;
					if(realFieldValue === newFieldValue) return;
					meta.tdAttr = 'title="Save ' + c_customFieldName + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									if(!me._isJsonValid(newFieldValue))
										return me._alert('ERROR', 'JSON is not valid');
									me[customGridName].setLoading(true);
									me._enqueue(function(unlockFunc){
										realRecord.set(c_customFieldName, btoa(newFieldValue));
										realRecord.save({	
											callback:function(record, operation, success){
												if(!success) me._alert('ERROR', 'Failed to modify ' + realRecord.data.FormattedID);
												else customRecord.commit();
												me[customGridName].setLoading(false);
												unlockFunc();
											}
										});
									});
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
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, customRecord){
					meta.tdAttr = 'title="Delete ' + c_customFieldName + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'delete-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									me[customGridName].setLoading(true);
									me._enqueue(function(unlockFunc){
										var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.FormattedID);
										realRecord.set(c_customFieldName, '');
										realRecord.save({	
											callback:function(record, operation, success){
												if(!success) me._alert('ERROR', 'Failed to modify ' + realRecord.data.FormattedID);
												else me[customStoreName].remove(customRecord);
												me[customGridName].setLoading(false);
												unlockFunc();
											}
										});
									});
								}
							}
						}
					};
				}
			}
		];
			
		me[customGridName] = me.add({
			xtype: 'grid',
			title:customFieldName,
			height:500,
			style:'margin-bottom:10px',
			scroll:'vertical',
			columns: columnCfgs,
			disableSelection: true,
			enableEditing:false,
			plugins:['fastcellediting'],
			viewConfig:{
				xtype:'scrolltableview',
				preserveScrollOnRefresh: true
			},
			listeners: {
				beforeedit:function(){
					me._editing++;
					return true;
				},
				canceledit:function(){
					me._editing--;
				},
				edit:function(e, d){
					me._editing--;
					d.record.commit();
				}
			},
			store: me[customStoreName]
		});	
	}
});