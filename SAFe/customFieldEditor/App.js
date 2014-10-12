Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	componentCls: 'app',
	height:2000,

	/****************************************************** DATA STORE METHODS ********************************************************/
	_htmlEscape: function(str) {
    return String(str)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	},
	
	
	_loadTeamCommitsFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			fetch: ['Name', 'FormattedID', 'c_TeamCommits'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'c_TeamCommits',
					operator:'!=',
					value:''
				}
			],
			listeners: {
				load: {
					fn: function(featureStore){
						me.TeamCommitsFeatureStore = featureStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	_loadRisksFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			fetch: ['Name', 'FormattedID', 'c_Risks'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'c_Risks',
					operator:'!=',
					value:''
				}
			],
			listeners: {
				load: {
					fn: function(featureStore){
						me.RisksFeatureStore = featureStore;
						cb();
					},
					single:true
				}
			}
		});
	},
			
	_loadDependenciesUserStories: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:Infinity,
			fetch: ['Name', 'FormattedID', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'c_Dependencies',
					operator:'!=',
					value:''
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore){
						me.DependenciesUserStoryStore = userStoryStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	
	/******************************************************* DEFINE MEMORY MODELS ********************************************************/
	_defineModels: function(){
		Ext.define('RisksModel', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'FormattedID', type:'string'},
				{name: 'Name', type:'string'},
				{name: 'Risks',  type: 'string'}
			]
		});
		
		Ext.define('TeamCommitsModel', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'FormattedID', type:'string'},
				{name: 'Name', type:'string'},
				{name: 'TeamCommits',  type: 'string'}
			]
		});
	
		Ext.define('DependenciesModel', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'FormattedID', type:'string'},
				{name: 'Name', type:'string'},
				{name: 'Dependencies',  type: 'string'}
			]
		});
	},
	
	/******************************************************* LAUNCH ********************************************************/

	_shouldUpdate: true,
	
	launch: function(){
		var me = this;
		me._defineModels();
		me._loadRefreshToggleButton();
		me._loadTeamCommitsFeatures(function(){ 
			setInterval(function(){ 
				me.TeamCommitsFeatureStore.load({
					callback: function(records, operation){
						if(me.TeamCommitsStore && me._shouldUpdate) {	
							var scroll = me.TeamCommitsGrid.view.getEl().getScrollTop();
							me.TeamCommitsStore.update();
							me.TeamCommitsGrid.view.getEl().setScrollTop(scroll);
						}
					}
				});
			}, 10000); 
			me._loadTeamCommitsGrid();
		});
		me._loadRisksFeatures(function(){
			setInterval(function(){ 
				me.RisksFeatureStore.load({
					callback: function(records, operation){
						if(me.RisksStore && me._shouldUpdate) {	
							var scroll = me.RisksGrid.view.getEl().getScrollTop();
							me.RisksStore.update();
							me.RisksGrid.view.getEl().setScrollTop(scroll); 
						}
					}
				});
			}, 10000); 
			me._loadRisksGrid();
		});
		me._loadDependenciesUserStories(function(){
			setInterval(function(){ 
				me.DependenciesUserStoryStore.load({
					callback: function(records, operation){		
						if(me.DependenciesStore && me._shouldUpdate) {	
							var scroll = me.DependenciesGrid.view.getEl().getScrollTop();
							me.DependenciesStore.update();
							me.DependenciesGrid.view.getEl().setScrollTop(scroll);
						}
					}
				});
			}, 10000); 
			me._loadDependenciesGrid();
		});
	},

	/******************************************************* RENDER ********************************************************/
	_getButtonText: function(){ return 'turn ' + (this._shouldUpdate ? 'off' : 'on') + ' data refresh'; },
	
	_loadRefreshToggleButton: function(){
		var me = this;
		me.ToggleRefreshButton = me.add({
			xtype:'button',
			text:me._getButtonText(),
			style:'margin-bottom:10px',
			listeners:{
				click: function(){ 
					me._shouldUpdate = !me._shouldUpdate; 
					me.ToggleRefreshButton.setText(me._getButtonText()); 
				}
			}
		});
	},
	
	_loadTeamCommitsGrid: function(){
		var me = this;	

		var teamCommitsRecords = _.map(me.TeamCommitsFeatureStore.getRecords(), function(featureRecord){
			return Ext.create('TeamCommitsModel', {
				FormattedID: featureRecord.get('FormattedID'),
				Name: featureRecord.get('Name'),
				TeamCommits: featureRecord.get('c_TeamCommits')
			});
		});
		
		
		me.TeamCommitsStore = Ext.create('Ext.data.Store', {
			data: teamCommitsRecords,
			model: 'TeamCommitsModel',
			proxy: {
				type:'sessionstorage',
				keyField:'teamcommits' + Math.random()
			},
			sorters:[function sorter(o1, o2){ return o1.data.FormattedID > o2.data.FormattedID ? -1 : 1; }],
			update: function(){ 
				var customStore = me.TeamCommitsStore, 
					customRecords = customStore.getRange(),
					i, unaccountedFor = customRecords.slice(0);
				console.log('syncing custom teamCommits with features');
				me.TeamCommitsFeatureStore.getRecords().forEach(function(featureRecord){
					var c_TeamCommits = featureRecord.get('c_TeamCommits');
					var teamCommitsRecord = customStore.findRecord('FormattedID', featureRecord.get('FormattedID'));
					if(!teamCommitsRecord && c_TeamCommits){
						customStore.add(Ext.create('TeamCommitsModel',  {
							FormattedID: featureRecord.get('FormattedID'),
							Name: featureRecord.get('Name'),
							TeamCommits: c_TeamCommits
						}));
					} else if(teamCommitsRecord && !c_TeamCommits){
						customStore.remove(teamCommitsRecord);
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].get('FormattedID') === teamCommitsRecord.get('FormattedID')){
								unaccountedFor.splice(i, 1);
								return;
							}
						}
					} else if(!teamCommitsRecord && !c_TeamCommits){
						return; //just got deleted
					} else {
						if(teamCommitsRecord.get('TeamCommits') !== c_TeamCommits) {
							teamCommitsRecord.set('TeamCommits', c_TeamCommits);
						}
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].get('FormattedID') === teamCommitsRecord.get('FormattedID')){
								unaccountedFor.splice(i, 1);
								return;
							}
						}
					}
				});
				unaccountedFor.forEach(function(teamCommitsRecord){
					customStore.remove(teamCommitsRecord);
				});
			}
		});
		me.TeamCommitsStore.update();
		
		me.TeamCommitsGrid = me.add({
			xtype: 'grid',
			title:'Team Commits',
			width: 920,
			height:500,
			style:'margin-bottom:10px',
			scroll:'vertical',
			columns: [
				{
					text:'ID', 
					dataIndex:'FormattedID',
					width:50,
					editor:false,
					menuDisabled:true,
					cls:'header-cls'
				},{
					text:'Feature', 
					dataIndex:'Name',
					width:150,
					editor:false,
					menuDisabled:true,
					cls:'header-cls'
				},{
					dataIndex:'TeamCommits',
					width:50,
					text:'b64 length',
					editor:false,
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(json){
						return json.length;
					}
				},{
					dataIndex:'TeamCommits',
					width:570,
					text:'Data',
					editor:false,
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(json){
						try{ return '<pre style="white-space:pre-wrap">' + me._htmlEscape(atob(json))  + '</pre>'; }
						catch(e){ return ''; }
					}
				},{
					text:'',
					dataIndex:'FormattedID',
					width:80,
					xtype:'componentcolumn',
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(fid){
						return {
							xtype:'button',
							width:70,
							text:'Delete',
							handler: function(){
								var scroll = me.TeamCommitsGrid.view.getEl().getScrollTop();
								var featureRecord = me.TeamCommitsFeatureStore.findRecord('FormattedID', fid);
								if(featureRecord){
									console.log('deleting featureRecord teamCommits:', featureRecord);
									featureRecord.set('c_TeamCommits', '');
									featureRecord.save();
								}
								me.TeamCommitsStore.remove(me.TeamCommitsStore.findRecord('FormattedID', fid));
								me.TeamCommitsGrid.view.getEl().setScrollTop(scroll);
							}
						};
					}
				}
			],
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				preserveScrollOnRefresh: true,
				markDirty:false
			},
			enableEditing:false,
			store: me.TeamCommitsStore
		});	
	},
	
	_loadRisksGrid: function(){
		var me = this;	

		var risksRecords = _.map(me.RisksFeatureStore.getRecords(), function(featureRecord){
			return Ext.create('RisksModel', {
				FormattedID: featureRecord.get('FormattedID'),
				Name: featureRecord.get('Name'),
				Risks: featureRecord.get('c_Risks')
			});
		});
		
		me.RisksStore = Ext.create('Ext.data.Store', {
			data: risksRecords,
			model: 'RisksModel',
			proxy: {
				type:'sessionstorage',
				keyField:'risks' + Math.random()
			},			
			sorters:[function sorter(o1, o2){ return o1.data.FormattedID > o2.data.FormattedID ? -1 : 1; }],
			update: function(){ 
				var customStore = me.RisksStore, 
					customRecords = customStore.getRange(),
					i, unaccountedFor = customRecords.slice(0);
				console.log('syncing custom risks with features');
				me.RisksFeatureStore.getRecords().forEach(function(featureRecord){
					var c_Risks = featureRecord.get('c_Risks');
					var risksRecord = customStore.findRecord('FormattedID', featureRecord.get('FormattedID'));
					if(!risksRecord && c_Risks){
						customStore.add(Ext.create('RisksModel',  {
							FormattedID: featureRecord.get('FormattedID'),
							Name: featureRecord.get('Name'),
							Risks: c_Risks
						}));
					} else if(risksRecord && !c_Risks){
						customStore.remove(riskRecord);
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].get('FormattedID') === risksRecord.get('FormattedID')){
								unaccountedFor.splice(i, 1);
								return;
							}
						}
					} else if(!risksRecord && !c_Risks){
						return; //just got deleted
					} else {
						if(risksRecord.get('Risks') !== c_Risks) 
							risksRecord.set('Risks', c_Risks);
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].get('FormattedID') === risksRecord.get('FormattedID')){
								unaccountedFor.splice(i, 1);
								return;
							}
						}
					}
				});
				unaccountedFor.forEach(function(riskRecord){
					customStore.remove(riskRecord);
				});
			}
		});
		me.RisksStore.update();
		
		me.RisksGrid = me.add({
			xtype: 'grid',
			title:'Risks',
			width: 920,
			height:500,
			style:'margin-bottom:10px',
			scroll:'vertical',
			columns: [
				{
					text:'ID', 
					dataIndex:'FormattedID',
					width:50,
					editor:false,
					menuDisabled:true,
					cls:'header-cls'
				},{
					text:'Feature', 
					dataIndex:'Name',
					width:150,
					editor:false,
					menuDisabled:true,
					cls:'header-cls'
				},{
					text:'b64 length', 
					dataIndex:'Risks',
					width:50,
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(json){
						return json.length;
					}
				},{
					dataIndex:'Risks',
					width:570,
					text:'Data',
					editor:false,
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(json){
						try{ return '<pre style="white-space:pre-wrap">' + me._htmlEscape(atob(json))  + '</pre>'; }
						catch(e){ return ''; }
					}
				},{
					text:'',
					dataIndex:'FormattedID',
					width:80,
					menuDisabled:true,
					cls:'header-cls',
					xtype:'componentcolumn',
					renderer: function (fid, meta, risksRecord){
						return {
							xtype:'button',
							width:70,
							text:'Delete',
							handler: function () {
								var scroll = me.RisksGrid.view.getEl().getScrollTop();
								var featureRecord = me.RisksFeatureStore.findRecord('FormattedID', fid);
								if(featureRecord){
									console.log('deleting featureRecord risk:', featureRecord);
									featureRecord.set('c_Risks', '');
									featureRecord.save();
								}
								me.RisksStore.remove(me.RisksStore.findRecord('FormattedID', fid));
								me.RisksGrid.view.getEl().setScrollTop(scroll);
							}
						};
					}
				}
			],
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				preserveScrollOnRefresh: true,
				markDirty:false
			},
			enableEditing:false,
			store: me.RisksStore
		});	
	},
	
	_loadDependenciesGrid: function(){
		var me = this;	

		var dependenciesRecords = _.map(me.DependenciesUserStoryStore.getRecords(), function(userStoryRecord){
			return Ext.create('DependenciesModel', {
				FormattedID: userStoryRecord.get('FormattedID'),
				Name: userStoryRecord.get('Name'),
				Dependencies: userStoryRecord.get('c_Dependencies')
			});
		});
		
		me.DependenciesStore = Ext.create('Ext.data.Store', {
			data: dependenciesRecords,
			model: 'DependenciesModel',
			proxy: {
				type:'sessionstorage',
				keyField:'deps' + Math.random()
			},
			sorters:[function sorter(o1, o2){ return o1.data.FormattedID > o2.data.FormattedID ? -1 : 1; }],
			update: function(){ 
				var customStore = me.DependenciesStore, 
					customRecords = customStore.getRange(),
					i, unaccountedFor = customRecords.slice(0);
				console.log('syncing custom Dependencies with user Stories');
				me.DependenciesUserStoryStore.getRecords().forEach(function(usRecord){
					var c_Deps = usRecord.get('c_Dependencies');
					var dependenciesRecord = customStore.findRecord('FormattedID', usRecord.get('FormattedID'));
					if(!dependenciesRecord && c_Deps){
						customStore.add(Ext.create('DependenciesModel',  {
							FormattedID: usRecord.get('FormattedID'),
							Name: usRecord.get('Name'),
							Dependencies: c_Deps
						}));
					} else if(dependenciesRecord && !c_Deps){
						customStore.remove(dependenciesRecord);
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].get('FormattedID') === dependenciesRecord.get('FormattedID')){
								unaccountedFor.splice(i, 1);
								return;
							}
						}
					} else if(!dependenciesRecord && !c_Deps){
						return; //just got deleted
					} else {
						if(dependenciesRecord.get('Dependencies') !== c_Deps)
							dependenciesRecord.set('Dependencies', c_Deps);
						for(i = 0;i<unaccountedFor.length;++i){
							if(unaccountedFor[i].get('FormattedID') === dependenciesRecord.get('FormattedID')){
								unaccountedFor.splice(i, 1);
								return;
							}
						}
					}
				});
				unaccountedFor.forEach(function(dependenciesRecord){
					customStore.remove(dependenciesRecord);
				});
			}
		});
		me.DependenciesStore.update();
		
		me.DependenciesGrid = me.add({
			xtype: 'grid',
			title:'Dependencies',
			width: 970,
			height:800,
			style:'margin-bottom:10px',
			scroll:'vertical',
			columns: [
				{
					text:'ID', 
					dataIndex:'FormattedID',
					width:100,
					editor:false,
					menuDisabled:true,
					cls:'header-cls'
				},{
					text:'UserStory', 
					dataIndex:'Name',
					width:150,
					editor:false,
					menuDisabled:true,
					cls:'header-cls'
				},{
					text:'b64 length', 
					dataIndex:'Dependencies',
					width:50,
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(json){
						return json.length;
					}
				},{
					dataIndex:'Dependencies',
					width:570,
					text:'Data',
					editor:false,
					menuDisabled:true,
					cls:'header-cls',
					renderer: function(json){
						try{ return '<pre style="white-space:pre-wrap">' + me._htmlEscape(atob(json))  + '</pre>'; }
						catch(e){ return ''; }
					}
				},{
					text:'',
					dataIndex:'FormattedID',
					width:80,
					menuDisabled:true,
					cls:'header-cls',
					xtype:'componentcolumn',
					renderer: function (fid, meta, dependencyRecord){
						return {
							xtype:'button',
							width:70,
							text:'Delete',
							handler: function () {
								var scroll = me.DependenciesGrid.view.getEl().getScrollTop();
								var userStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', fid);
								if(userStoryRecord){
									console.log('deleting userStory dependency:', userStoryRecord);
									userStoryRecord.set('c_Dependencies', '');
									userStoryRecord.save();
								}
								me.DependenciesStore.remove(me.DependenciesStore.findRecord('FormattedID', fid));
								me.DependenciesGrid.view.getEl().setScrollTop(scroll);
							}
						};
					}
				}
			],
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				preserveScrollOnRefresh: true,
				markDirty:false
			},
			enableEditing:false,
			store: me.DependenciesStore
		});	
	}	

});