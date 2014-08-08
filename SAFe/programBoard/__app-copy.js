Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
		
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE METHODS ********************************************************/

	_loadModels: function(cb){
		Rally.data.ModelFactory.getModel({ //load project
			type:'Project',
			scope:this,
			success: function(model){ 
				this.Project = model; 
				cb(); 
			}
		});
	},
	
	_loadProject: function(project, cb){ 
		var me = this;
		me.Project.load(project.ObjectID, {
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name', '_ref'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: function(record, operation){
				if(operation.wasSuccessful()) cb(record);
				else me._showError('failed to retreive project: ' + project.ObjectID);
			}
		});
	},

	_loadUserStories: function(cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model:'HierarchicalRequirement',
			fetch: ['ObjectID', 'Feature', 'Project', 'Children', 'Parent', 'Release', 'Name', '_ref'],
			limit:Infinity,
			autoLoad:true,
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters: [
				{
					property:'Release.Name',
					value:me.releaseRecord.get('Name')
				},{
					property:'Project.Name',
					value:me.projectRecord.get('Name')
				}
			],
			listeners: {
				load: function(storyStore, storyRecords){
					console.log('Stories loaded:', storyRecords);
					me.StoryStore = storyStore;
					cb();
				}
			}
		});
	},
	
	_loadFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			remoteSort:false,
			wsapiVersion: "v2.0",
			fetch: ['Name', 'ObjectID', 'Project', 'Release', 'UserStories','c_TeamCommits','_ref'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.releaseRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(featureStore, featureRecords){
						console.log('features loaded:', featureRecords);
						me.FeatureStore = featureStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	/******************************************************* LAUNCH ********************************************************/
    _timeboxScopeValid: function(timeboxScope){ // called when we are in a valid timebox scope
		var me = this;
		me._loadModels(function(){
			var scopeProject = me.getContext().getProject();
			me._loadProject(scopeProject, function(scopeProjectRecord){
				if(!scopeProjectRecord.get('Children').Count){
					me.projectRecord = scopeProjectRecord;
					me.releaseRecord = timeboxScope.record;
					console.log('Release name: ', me.releaseRecord.get('Name'));
					me._loadUserStories(function(){
						me._loadFeatures(function(){ 
							me._loadGrid(); 
						});
					});
				} else  me._showError('Please scope to a scrum');
			});
		});
	},
	
    launch: function(){
		var me = this;
		var timeboxScope = me.getContext().getTimeboxScope();
		if(timeboxScope && timeboxScope.record && timeboxScope.type == 'release') 
			me._timeboxScopeValid(timeboxScope);
		else me._showError('please scope page to a valid release');
	},
	
	onTimeboxScopeChange: function(timeboxScope){
		var me = this;
		if(timeboxScope && timeboxScope.record && timeboxScope.type == 'release') 
			me._timeboxScopeValid(timeboxScope);
		else me._showError('please scope page to a valid release');
	},
	
	/******************************************************* RENDER ********************************************************/
	_loadGrid: function(){
		var me = this;
		if(me.FeatureGrid) {
			me.remove(me.FeatureGrid);	
			delete me.FeatureGrid;
		}
				
		var rs = me.StoryStore.getRecords();
		me.FeatureStore.filterBy(function(record){
			var oid = record.get('ObjectID');
			for(var i = 0;i<rs.length;++i){
				var r = rs[i];
				if(r.get('Feature') && r.get('Feature').ObjectID == oid) 
					return true;
			}
			return false;
		});	
		var customFeatureRecords = _.map(me.FeatureStore.getRecords(), function(record){
			return Ext.apply({
				L_TeamCommits: record.get('TeamCommits')
			}, record.getData());
		});
		
		function __featuresReloaded(featureStore, featureRecords){
			console.log('features reloaded:', featureRecords); //same store!
			customFeatureRecords = _.map(featureStore.getRecords(), function(record){
				return Ext.apply({
					L_TeamCommits: record.get('TeamCommits')
				}, record.getData());
			});
			if(me.FeatureGrid){ //only set the config if featureGrid is already loaded
				me.FeatureGrid.setStoreConfig({
					xtype:'rallycustom',
					data: customFeatureRecords
				});
			}
		}
		me.FeatureStore.on('load', __featuresReloaded);
		setInterval(function(){  me.FeatureStore.reload(); }, 120000); //reload featureStore every minute		
		
		me.FeatureGrid = me.add({
			xtype: 'rallygrid',
			width: 700,
			height:300,
			scroll:'vertical',
			columnCfgs: [
				{
					text:'Feature', 
					dataIndex:'Name',
					width:400
				},{
					text:'Stories', 
					dataIndex:'ObjectID',
					sortable:true, 
					doSort: function(direction){
						var ds = this.up('grid').getStore();
						var field = this.getSortParam();
						ds.sort({
							sorterFn: function(f1, f2){ //sort by stories for this team in each feature
								var count1 = 0, oid1 = f1.get('ObjectID');
								rs.forEach(function(r){ if(r.get('Feature') && r.get('Feature').ObjectID == oid1) ++count1; });
								var count2 = 0, oid2 = f2.get('ObjectID');
								rs.forEach(function(r){ if(r.get('Feature') && r.get('Feature').ObjectID == oid2) ++count2; });
								return (direction=='ASC'? 1 : -1) * (count1-count2);
							}
						});
					},
					width:100,
					renderer:function(oid){
						var count = 0;
						rs.forEach(function(r){ if(r.get('Feature') && r.get('Feature').ObjectID == oid) ++count; });
						return count;
					}
				},{
					dataIndex:'L_TeamCommits',
					width:180,
					text:'Status',					
					editor:{
						xtype:'rallycombobox',
						store: Ext.create('Ext.data.Store', {
							fields: ['Status'],
							data:[
								{'Status':'Committed'},
								{'Status':'Not Committed'}
							]
						}),
						editable: false,
						displayField: 'Status'
					},
					renderer: function(tcs, meta, record){
						var ObjectID = record.get('ObjectID');
						var this_tc;
						try{ this_tc = (tcs==='' ? null : JSON.parse(tcs)[ObjectID]); } 
						catch(e){ console.log(e, tc); }
						return this_tc || 'Not Committed';
					}
				}
			],
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					clicksToEdit:1
				})
			],
			viewConfig:{
				stripeRows:true
			},
			listeners: {
				beforeedit: function(editor, e){
					console.log(e.colIdx);
					return e.colIdx === 3; //only edit last col
				},
				edit: function(editor, e){
					var grid = e.grid,
						record = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue,
						row = e.row,
						column = e.column,
						rowIdx = e.rowIdx,
						colIdx = e.colIdx;					
					
					function __getCurrentData(featureStore){
						var realFeature = featureStore.findRecord('ObjectID', record.get('ObjectID'));
						console.log('edit:', record, realFeature, field, value, originalValue);
						if(!realFeature) console.log('ERROR: realFeature not found, ObjectID: ' + record.get('ObjectID'));
						else {
							var ObjectID = realFeature.get('ObjectID');
							var tcs = realFeature.get('TeamCommits');
							try{ 
								console.log('Before: ' + tcs);
								tcs = (tcs==='' ? {} : JSON.parse(tcs));
								tcs[ObjectID] = value;
								tcs = JSON.stringify(tcs, null, '\t');
								console.log('After: ', tcs);
								//realFeature.set('TeamCommits', tcs);
								//realFeature.save();
							}
							catch(e){ console.log(e, value, tcs, ObjectID); }
						}		
					}
					me.FeatureStore.on('load', __getCurrentData, me, {single:true});
					me.FeatureStore.reload(); //get most current data before making edit
				}
			},
			showPagingToolbar:false,
			enableEditing:false, // WTF! why do i need to do this
			context: this.getContext(),
			store: Ext.create('Rally.data.custom.Store', {
				data: customFeatureRecords
			})
		});	
	}
});