Ext.define('Rally.apps.portfoliohierarchy.PortfolioHierarchyApp', {
	extend: 'IntelRallyApp',
	appName: 'Portfolio Hierarchy',
	mixins: [
		'Rally.Messageable',
		'PrettyAlert',
		'ReleaseQuery'
	],
	
	_prefName: 'intel-PortfolioNav',
	_uid: (__PROJECT_OID__ + '-' + __USER_OID__),
	
	layout: {
		type:'vbox',
		align:'stretch',
		pack:'start'
	},
	items:[{
		xtype:'container',
		itemId:'header_release',
		layout:'hbox'
	},{
		xtype:'container',
		itemId:'header_project',
		layout:'hbox'
	},{
		xtype:'container',
		itemId:'header_complete',
		layout:'hbox'
	},{
		xtype:'container',
		itemId:'bodyContainer'
	}],

	config: {
		defaultSettings: (function(){
			var s = {}, str = (__PROJECT_OID__ + '-' + __USER_OID__);
			s['Type' + str] = 'product';
			s['QueryFilter' + str] = '';
			s['InferPortfolioLocation' + str] = true;
			s['PortfolioLocation' + str] = __PROJECT_OID__;
			return s;
		}())
	},
			
	getSettingsFields: function() {
		var str = (__PROJECT_OID__ + '-' + __USER_OID__);
    return [{
			name: 'Type' + str,
			xtype:'combo',
			editable:false,
			label: 'Type',
			store: ['product', 'milestone', 'feature'],
			labelWidth: 120, width:'100%'
		},{
			name: 'QueryFilter' + str,
			xtype: 'textfield',
			label: 'Query Filter',
			labelWidth: 120, width:'100%'
		},{
			name: 'InferPortfolioLocation' + str,
			xtype:'rallycheckboxfield',
			label: 'Infer Portfolio Location',
			labelWidth: 120, width:'100%',
			bubbleEvents: ['change'] 
		},{
			name: 'PortfolioLocation' + str,
			xtype:'intelPIprojectcombo',
			label: 'Portfolio Location',
			labelWidth: 120, width:'100%',
			listeners:{
				added: function(field, form){
					if(form.down('rallycheckboxfield').value) field.hide();
					else field.show();
				}
			},
			handlesEvents: {
				change: function(checkbox, ischecked) {
					if(ischecked) this.hide();
					else this.show();
				}
			}
		}];
	},

	/************************************************** Preferences FUNCTIONS ***************************************************/
	
	_loadPreferences: function(){ //parse all settings too
		var me=this,
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
      filterByName: me._prefName + uid,
			success: function(prefs) {
				var appPrefs = prefs[me._prefName + uid];
				try{ appPrefs = JSON.parse(appPrefs); }
				catch(e){ appPrefs = { projs:{}};}
				console.log('loaded prefs', appPrefs);
				deferred.resolve(appPrefs);
			},
			failure: deferred.reject
		});
		return deferred.promise;
	},

	_savePreferences: function(prefs){ 
		var me=this, s = {}, 
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		prefs = {projs: prefs.projs};
    s[me._prefName + uid] = JSON.stringify(prefs); 
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: this.getAppId(),
			settings: s,
			success: deferred.resolve,
			failure: deferred.reject
		});
		return deferred.promise;
	},
		
	/************************************************** Refreshing Data ***************************************************/
		
	_refreshTree: function() {
		var me=this;
		me.down('#bodyContainer').removeAll();
		me._loadPortfolioTree();
	},
	
	_reloadEverything: function(){
		var me=this;
		me.setLoading(false);
		me._loadFilterOnRelease();
		me._loadReleaseSelector();
		me._loadFilterOnProject();
		me._loadFilterOnComplete();
		me._loadPortfolioTree();
	},
	
	/************************************************** Launch ***************************************************/
	
	launch: function() {
		var me=this;
		me.setLoading(true);
		me._loadModels()
			.then(function(){
				var scopeProject = me.getContext().getGlobalContext().getProject();
				return me._loadProject(scopeProject.ObjectID);
			})
			.then(function(scopeProjectRecord){
				me.ProjectRecord = scopeProjectRecord;
				return me._loadRandomUserStory(scopeProjectRecord.data._ref);
			})
			.then(function(userStory){
				me.HasUserStories = !!userStory;
				return me._loadProjectByName('All Releases');
			})
			.then(function(rootProject){
				return me._loadAllChildrenProjects(rootProject);
			})
			.then(function(childProjects){
				me.ChildProjects = childProjects;
				return me._projectInWhichTrain(me.ProjectRecord);
			})
			.fail(function(error){
				if(error !== 'Project not in a train') return Q.reject(error); //its ok if its not in a train			
			})
			.then(function(trainRecord){
				me.TrainRecord = trainRecord;
				return me._loadPreferences();
			})
			.then(function(appPrefs){		
				var pid = me.ProjectRecord.data.ObjectID, 
					prefs = appPrefs.projs[pid] || {};
				me.AppPrefs = appPrefs;
				me.PIType = me.getSetting('Type' + me._uid);
				me.QueryFilter = me.getSetting('QueryFilter' + me._uid);
				me.InferPortfolioLocation = me.getSetting('InferPortfolioLocation' + me._uid);
				me.PortfolioLocation = me.getSetting('PortfolioLocation' + me._uid);
				me.FilterOnRelease = prefs.FilterOnRelease || false;
				me.FilterReleaseName = prefs.FilterReleaseName;
				me.FilterOnProject = prefs.FilterOnProject || false;
				me.FilterOnComplete = prefs.FilterOnComplete || false;
				var name = me.ProjectRecord.data.Name,
					field = (typeof me.PortfolioLocation === 'number') ? 'ObjectID' : 'Name';
				if(me.InferPortfolioLocation){
					if(me.TrainRecord) {
						var piName = me.TrainRecord.data.Name.split(' ART')[0] + ' POWG Portfolios';
						me.PortfolioLocation = _.find(me.ChildProjects, function(p){
							return p.data.Name === piName;
						});	
					}
					else me.PortfolioLocation = me.ProjectRecord;
				}
				else {
					me.PortfolioLocation = _.find(me.ChildProjects, function(p){ 
						return p.data[field] === me.PortfolioLocation;
					});
				}
				return me._loadAllReleases(me.ProjectRecord);
			})
			.then(function(releaseStore){		
				me.ReleaseStore = releaseStore;
				me.ReleaseNames = [];
				var recs = releaseStore.data.items;
				for(var i=0,len=recs.length; i<len; ++i){
					me.ReleaseNames.push({ Name: recs[i].data.Name });
				}
				me.FilterReleaseName = me.FilterReleaseName || me.ReleaseNames[0].Name;
				me._reloadEverything();
			})
			.fail(function(reason){
				me.setLoading(false);
				me._alert('ERROR', reason || '');
			})
			.done();
	},

	/******************************************************** HEADER ITEMS *********************************************/
	
	_onPreferenceChanged: function(field, newValue){
		var me=this,
			pid = me.ProjectRecord.data.ObjectID;
		if(me[field] === newValue) return;
		else me[field] = newValue;
		if(typeof me.AppPrefs.projs[pid] !== 'object') me.AppPrefs.projs[pid] = {};
		me.AppPrefs.projs[pid][field] = newValue;
		return me._savePreferences(me.AppPrefs);
	},

	_onReleaseSelected: function(combo, records) {
		var me=this;
		me._onPreferenceChanged('FilterReleaseName', records[0].data.Name)
			.then(function(){ if(me.FilterOnRelease) me._refreshTree(); })
			.fail(function(reason){ me._alert('ERROR:', reason); })
			.done();
	},
				
	_loadReleaseSelector: function(){
		var me=this;
		me.down('#header_release').add({
			xtype:'intelfixedcombo',
			store: Ext.create('Ext.data.Store', {
				fields: ['Name'],
				sorters: [function(o1, o2){ return o1.data.Name < o2.data.Name ? -1 : 1; }],
				data: me.ReleaseNames
			}),
			hidden: !me.FilterOnRelease,
			displayField: 'Name',
			value: me.FilterReleaseName,
			listeners: {
				select: me._onReleaseSelected.bind(me)
			}
		});
	},
		
	_onFilterOnReleaseChanged: function(checkBox) {
		var me=this,
			value = checkBox.getValue(),
			box = me.down('#header_release').down('intelfixedcombo');
		if(value) box.show(); else box.hide();
		me._onPreferenceChanged('FilterOnRelease', value)
			.then(function(){ me._refreshTree(); })
			.fail(function(reason){ me._alert('ERROR:', reason); })
			.done();
	},

	_loadFilterOnRelease: function(){
		var me=this;
		me.down('#header_release').add({
			xtype: 'rallycheckboxfield',
			boxLabel: 'Filter Features in Release',
			padding:'0 4px 0 0',
			value: me.FilterOnRelease,
			listeners: {
				change: me._onFilterOnReleaseChanged.bind(me)
			}
		});
	},	
	
	_onFilterOnProjectChanged: function(checkBox) {
		var me=this;
		me._onPreferenceChanged('FilterOnProject', checkBox.getValue())
			.then(function(){ me._refreshTree(); })
			.fail(function(reason){ me._alert('ERROR:', reason); })
			.done();
	},

	_loadFilterOnProject: function(){
		var me=this;
		me.down('#header_project').add({
			xtype: 'rallycheckboxfield',
			boxLabel: 'Filter User Stories in Current Project',
			padding:'0 4px 0 0',
			hidden: !me.HasUserStories,
			value: me.FilterOnProject,
			listeners: {
				change: me._onFilterOnProjectChanged.bind(me)
			}
		});
	},	
		
	_onFilterOnCompleteChanged: function(checkBox) {
		var me=this;
		me._onPreferenceChanged('FilterOnComplete', checkBox.getValue())
			.then(function(){ me._refreshTree(); })
			.fail(function(reason){ me._alert('ERROR:', reason); })
			.done();
	},

	_loadFilterOnComplete: function(){
		var me=this;
		me.down('#header_complete').add({
			xtype: 'rallycheckboxfield',
			boxLabel: 'Hide Completed Items',
			labelWidth: 170,
			value: me.FilterOnComplete,
			listeners: {
				change: me._onFilterOnCompleteChanged.bind(me)
			}
		});
	},

	/******************************************************** GRID ITEMS *********************************************/

	_onTreeItemSelected: function(treeItem) {
		if(treeItem.xtype === 'fittedportfolioitemtreeitem'){
			this.publish('portfoliotreeitemselected', treeItem);
		}
	},
	
	_getFilterOnCompleteFilter: function(ordinal){
		return Ext.create('Rally.data.wsapi.Filter', {
			property:'State.OrderIndex',
			operator:'<',
			value: (ordinal === 0 ? 11 : 4) //finished features are 11-15, milestone/products are 4
		}).or(Ext.create('Rally.data.wsapi.Filter', {
			property:'State',
			value: null
		}));
	},
	
	_getFilterOnReleaseFilter: function(){
		var me=this;
		return Ext.create('Rally.data.wsapi.Filter', {
			property: 'Release.Name',
			value: me.FilterReleaseName 
		});
	},
	
	_getFilterOnQueryFilter: function(){
		var me=this;
		try { return Rally.data.QueryFilter.fromQueryString(me.QueryFilter); }
		catch(e){ 
			return Ext.create('Rally.data.wsapi.Filter', {
				property: 'ObjectID',
				operator: '!=',
				value: 0
			});
		}
	},
	
	_getParentRecordFilter: function(parentRecord, ordinal){
		return Ext.create('Rally.data.wsapi.Filter', {
			property: (ordinal === 0 ? 'Feature' : 'Parent') + '.ObjectID', //only uses right under feature have issue
			value: parentRecord.data.ObjectID
		});
	},
	
	_getTopLevelStoreConfig: function(ordinal){ 
		var me=this, 
			filters = [];
		if(me.FilterOnComplete) filters.push(me._getFilterOnCompleteFilter(ordinal));
		if(me.FilterOnRelease && ordinal === 0) filters.push(me._getFilterOnReleaseFilter());
		if(me.QueryFilter) filters.push(me._getFilterOnQueryFilter());
		return {
			limit:Infinity,
			filters: filters,
			context: {
				project: me.PortfolioLocation.data._ref,
				projectScopeDown: true,
				projectScopeUp: false
			}
		};
	},

	_getChildLevelStoreConfig: function(tree, parentRecord, isPI, ordinal){ //ordinal/isPI of PARENT item
		var me=this,
			context= {
				project: me.PortfolioLocation.data._ref,
				projectScopeDown: true,
				projectScopeUp: false
			},
			filters = [ me._getParentRecordFilter(parentRecord, ordinal)];
		if(me.FilterOnComplete && isPI && ordinal > 0) filters.push(me._getFilterOnCompleteFilter(ordinal));
		if(!isPI || ordinal === 0) {
			if(me.FilterOnProject){
				context.project = me.ProjectRecord.data._ref;
				context.projectScopeDown = false;
			}
			else {
				context.project = undefined;
				context.projectScopeDown = undefined;
			}
		} 
		if(me.FilterOnRelease && isPI && ordinal === 1) filters.push(me._getFilterOnReleaseFilter());
		if(me.QueryFilter) filters.push(me._getFilterOnQueryFilter());
		return {
			limit:Infinity,
			fetch: tree._getDefaultTopLevelFetchFields().concat(['Parent', 'Project', 'State']),
			context: context,
			filters:filters
		};
	},
	
	_loadPortfolioTree: function(){
		var me = this,
			modelName ='portfolioitem/' + me.PIType,
			ordinal = (me.PIType==='product' ? 2 : (me.PIType==='milestone' ? 1 : 0));

		me.down('#bodyContainer').add({
			xtype: 'rallyportfoliotree',
			stateful: true,
			stateId: me.getAppId() + 'rallyportfoliotree',
			topLevelModel: modelName,
			topLevelStoreConfig: me._getTopLevelStoreConfig(ordinal),
			listeners: {
				itemselected: me._onTreeItemSelected.bind(me)
			},
			childItemsStoreConfigForParentRecordFn: function(parentRecord) {
				var tree = this,
					isPI = tree._isPortfolioItem(parentRecord),
					ordinal = parentRecord.self.ordinal;
				return me._getChildLevelStoreConfig(tree, parentRecord, isPI, ordinal);
			},
			treeItemConfigForRecordFn: function (record) {
				var tree = this,
					config = Rally.ui.tree.PortfolioTree.prototype.treeItemConfigForRecordFn.call(tree, record);
				if(tree._isPortfolioItem(record)) config.xtype = 'fittedportfolioitemtreeitem'; 
				else config.xtype = 'fitteduserstorytreeitem'; 
				return config;
			}
		});
	}
});
