/** this is an app that makes portfolio hierarchies more customizable and stateful for each person **/
(function(){
	var Ext = window.Ext4 || window.Ext;

	var context = Rally.environment.getContext(),
		SETTINGS_TOKEN = context.getProject().ObjectID;

	Ext.define('Intel.PortfolioNavigator.PortfolioHierarchy', {
		extend: 'Intel.lib.IntelRallyApp',
		cls: 'portfolio-hierarchy-app',
		mixins: [
			'Rally.Messageable',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.UserAppsPreference'
		],
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			id:'headerRelease',
			layout:'hbox'
		},{
			xtype:'container',
			id:'headerProject',
			layout:'hbox'
		},{
			xtype:'container',
			id:'headerComplete',
			layout:'hbox'
		},{
			xtype:'container',
			id:'bodyContainer'
		}],
		minWidth:1,
		
		userAppsPref: 'intel-portfolio-nav',

		config: {
			defaultSettings: (function(){
				var s = {};
				s['Type' + SETTINGS_TOKEN] = ''; 
				s['QueryFilter' + SETTINGS_TOKEN] = '';
				s['InferPortfolioLocation' + SETTINGS_TOKEN] = true;
				s['PortfolioLocation' + SETTINGS_TOKEN] = 0;
				return s;
			}())
		},				
		getSettingsFields: function() {
			return [{
				name: 'Type' + SETTINGS_TOKEN,
				xtype:'rallycombobox',
				editable:false,
				queryFilter:true, //<--- this is a hack, but it works
				displayField:'Name',
				valueField:'Name',
				storeConfig:{
					xtype:'rallywsapidatastore',
					model: 'TypeDefinition',
					limit:Infinity,
					fetch:['Ordinal', 'Name'],
					filters: [{
						property: 'Parent.Name',
						value: 'Portfolio Item'
					},{
						property: 'Creatable',
						value: true
					}],
					sorters: [{
						property: 'Ordinal',
						direction: 'DESC'
					}],
					context:{
						workspace:Rally.environment.getContext().getWorkspace()._ref,
						project:null
					}
				},
				listeners:{
					added: function(field, form){
						if(form.down('rallycombobox').value) field.hide();
						else field.show();
					}
				},
				label: 'Type',
				labelWidth: 120, width:'100%'
			},{
				name: 'QueryFilter' + SETTINGS_TOKEN,
				xtype: 'textfield',
				label: 'Query Filter',
				labelWidth: 120, width:'100%'
			},{
				name: 'InferPortfolioLocation' + SETTINGS_TOKEN,
				xtype:'rallycheckboxfield',
				label: 'Infer Portfolio Location',
				labelWidth: 120, width:'100%',
				bubbleEvents: ['change'] 
			},{
				name: 'PortfolioLocation' + SETTINGS_TOKEN,
				xtype:'rallycombobox',
				editable:false,
				queryFilter:true, //<--- this is a hack, but it works
				displayField:'Name',
				valueField:'ObjectID',
				storeConfig: {
					xtype:'rallywsapidatastore',
					model: 'Project',
					limit:Infinity,
					fetch:['ObjectID', 'Name'],
					sorters: [{
						property: 'Name',
						direction: 'ASC'
					}],
					context:{
						workspace:Rally.environment.getContext().getWorkspace()._ref,
						project:null
					}
				},
				label: 'Portfolio Location',
				labelWidth: 120, width:'100%',
				listeners:{
					added: function(field, form){
						if(form.down('rallycheckboxfield').value) field.hide();
						else{
							field.show();
							setTimeout(function(){
								var fieldVal = Rally.getApp().getSetting(field.name);
								if(fieldVal) field.setValue(fieldVal);
							}, 50);
						}
					}
				},
				handlesEvents: {
					change: function(checkbox, isChecked) {
						var field=this;
						if(isChecked) field.hide();
						else{
							field.show();
							setTimeout(function(){
								var fieldVal = Rally.getApp().getSetting(field.name);
								if(fieldVal) field.setValue(fieldVal);
							}, 50);
						}
					}
				}
			}];
		},
		
		/********************************************** Refreshing Data ***************************************************/
		refreshTree: function() {
			var me=this;
			me.down('#bodyContainer').removeAll();
			me.renderPortfolioTree();
		},	
		reloadEverything: function(){
			var me=this;
			me.setLoading(false);
			me.renderFilterOnRelease();
			me.renderReleasePicker();
			me.renderFilterOnProject();
			me.renderFilterOnComplete();
			me.renderPortfolioTree();
		},
		
		/************************************************** Launch ***************************************************/	
		launch: function() {
			var me=this;
			me.setLoading('Loading Configuration');
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getGlobalContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([
						me.projectInWhichScrumGroup(me.ProjectRecord) /********* 1 ************/
							.then(function(scrumGroupRootRecord){
								if(scrumGroupRootRecord){
									me.ScrumGroupRootRecord = scrumGroupRootRecord;
									return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
										.then(function(scrumGroupPortfolioProject){
											me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
										});
								} 
							}),
						me.loadAppsPreference() /********* 2 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){		
								me.ReleaseRecords = releaseRecords;
								me.ReleaseNames = [];
								for(var i=0,len=releaseRecords.length; i<len; ++i){
									me.ReleaseNames.push({ Name: releaseRecords[i].data.Name });
								}
							}),
						me.loadAllProjects() /********* 3 ************/
							.then(function(projects){
								me.AllProjects = projects;
							}),
						me.loadRandomUserStory(me.ProjectRecord) /********* 4 ************/
							.then(function(userStory){
								me.HasUserStories = !!userStory;
							})
					]);
				})
				.then(function(){
					var pid = me.ProjectRecord.data.ObjectID, 
						prefs = me.AppsPref.projs[pid] || {};
					me.PIType = me.getSetting('Type' + SETTINGS_TOKEN);
					if(!me.PIType){
						me.PIType = me.PortfolioItemTypes[0];
						var newSettings = {};
						newSettings['Type' + SETTINGS_TOKEN] = me.PIType;
						me.updateSettingsValues({settings:newSettings});
					}
					me.QueryFilter = me.getSetting('QueryFilter' + SETTINGS_TOKEN);
					me.InferPortfolioLocation = me.getSetting('InferPortfolioLocation' + SETTINGS_TOKEN);
					me.PortfolioLocation = me.getSetting('PortfolioLocation' + SETTINGS_TOKEN);
					me.FilterOnRelease = prefs.FilterOnRelease || false;
					me.FilterReleaseName = prefs.FilterReleaseName || (me.ReleaseNames.length ? me.ReleaseNames[0].Name : null);
					me.FilterOnProject = prefs.FilterOnProject || false;
					me.FilterOnComplete = prefs.FilterOnComplete || false;
					if(me.InferPortfolioLocation){
						if(me.ScrumGroupPortfolioProject) me.PortfolioLocation = me.ScrumGroupPortfolioProject;
						else me.PortfolioLocation = me.ProjectRecord;
					}
					else {
						if(me.PortfolioLocation){ //if ObjectID is set manually
							me.PortfolioLocation = _.find(me.AllProjects, function(p){ 
								return p.data.ObjectID === me.PortfolioLocation; 
							});
						}
						if(!me.PortfolioLocation){
							return Q.reject('Error inferring Portfolio Location. You must set the project that the portfolio resides in!');
						}
					}
					return me.reloadEverything();
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},

		/*************************************************** HEADER ITEMS *********************************************/	
		onPreferenceChanged: function(field, newValue){
			var me=this,
				pid = me.ProjectRecord.data.ObjectID;
			if(me[field] === newValue) return Q();
			else me[field] = newValue;
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid][field] = newValue;
			return me.saveAppsPreference(me.AppsPref);
		},
		onReleaseSelected: function(combo, records){
			var me=this;
			me.onPreferenceChanged('FilterReleaseName', records[0].data.Name)
				.then(function(){ if(me.FilterOnRelease) me.refreshTree(); })
				.fail(function(reason){ me.alert('ERROR:', reason); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			Ext.getCmp('headerRelease').add({
				xtype:'intelfixedcombo',
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],
					sorters: [function(o1, o2){ return o1.data.Name > o2.data.Name ? -1 : 1; }],
					data: me.ReleaseNames
				}),
				hidden: !me.FilterOnRelease,
				displayField: 'Name',
				value: me.FilterReleaseName,
				listeners: { select: me.onReleaseSelected.bind(me) }
			});
		},		
		onFilterOnReleaseChanged: function(checkBox){
			var me=this,
				value = checkBox.getValue(),
				box = Ext.getCmp('headerRelease').down('intelfixedcombo');
			if(value) box.show(); else box.hide();
			me.onPreferenceChanged('FilterOnRelease', value)
				.then(function(){ me.refreshTree(); })
				.fail(function(reason){ me.alert('ERROR:', reason); })
				.done();
		},
		renderFilterOnRelease: function(){
			var me=this;
			Ext.getCmp('headerRelease').add({
				xtype: 'rallycheckboxfield',
				boxLabel: 'Filter ' + me.PortfolioItemTypes[0] + 's in Release',
				id: 'filterOnReleaseCheckbox',
				value: me.FilterOnRelease,
				listeners: { change: me.onFilterOnReleaseChanged.bind(me) }
			});
		},		
		onFilterOnProjectChanged: function(checkBox){
			var me=this;
			me.onPreferenceChanged('FilterOnProject', checkBox.getValue())
				.then(function(){ me.refreshTree(); })
				.fail(function(reason){ me.alert('ERROR:', reason); })
				.done();
		},
		renderFilterOnProject: function(){
			var me=this;
			Ext.getCmp('headerProject').add({
				xtype: 'rallycheckboxfield',
				boxLabel: 'Filter User Stories in Current Project',
				id: 'filterOnProjectCheckbox',
				hidden: !me.HasUserStories,
				value: me.FilterOnProject,
				listeners: { change: me.onFilterOnProjectChanged.bind(me) }
			});
		},			
		onFilterOnCompleteChanged: function(checkBox){
			var me=this;
			me.onPreferenceChanged('FilterOnComplete', checkBox.getValue())
				.then(function(){ me.refreshTree(); })
				.fail(function(reason){ me.alert('ERROR:', reason); })
				.done();
		},
		renderFilterOnComplete: function(){
			var me=this;
			Ext.getCmp('headerComplete').add({
				xtype: 'rallycheckboxfield',
				boxLabel: 'Hide Completed Items',
				labelWidth: 170,
				value: me.FilterOnComplete,
				listeners: { change: me.onFilterOnCompleteChanged.bind(me) }
			});
		},

		/******************************************************* GRID ITEMS *********************************************/
		onTreeItemSelected: function(treeItem){
			if(treeItem.xtype === 'fittedportfolioitemtreeitem'){
				this.publish('portfoliotreeitemselected', treeItem);
			}
		},	
		getDummyWsapiFilter: function(){
			return Ext.create('Rally.data.wsapi.Filter', {
				property: 'ObjectID',
				operator: '!=',
				value: 0
			});
		},
		getFilterOnCompleteFilter: function(ordinal){
			//the best we can do is filter if state 'Done' or 'Complete(d)' exists
			var me=this,
				completeState = me.getPortfolioItemTypeStateByOrdinal(ordinal, 'Done') || 
					me.getPortfolioItemTypeStateByOrdinal(ordinal, 'Complete') || 
					me.getPortfolioItemTypeStateByOrdinal(ordinal, 'Completed');
			if(completeState){
				return Ext.create('Rally.data.wsapi.Filter', {
					property:'State.OrderIndex',
					operator:'<',
					value: completeState.data.Ordinal
				}).or(Ext.create('Rally.data.wsapi.Filter', {
					property:'State',
					value: null
				}));
			}
			else return me.getDummyWsapiFilter();
		},
		getFilterOnReleaseFilter: function(){
			var me=this;
			return Ext.create('Rally.data.wsapi.Filter', {
				property: 'Release.Name',
				value: me.FilterReleaseName 
			});
		},
		getFilterOnQueryFilter: function(){
			try { return Rally.data.QueryFilter.fromQueryString(this.QueryFilter); }
			catch(e){ return this.getDummyWsapiFilter(); }
		},	
		getParentRecordFilter: function(parentRecord, ordinal){
			return Ext.create('Rally.data.wsapi.Filter', {
				property: (ordinal === 0 ? 'PortfolioItem' : 'Parent') + '.ObjectID', //only uses right under lowest PI have issue
				value: parentRecord.data.ObjectID
			});
		},	
		getTopLevelStoreConfig: function(ordinal){ //ordinal of this level
			var me=this, 
				filters = [];
			if(me.FilterOnComplete) filters.push(me.getFilterOnCompleteFilter(ordinal));
			if(me.FilterOnRelease && ordinal === 0) filters.push(me.getFilterOnReleaseFilter());
			if(me.QueryFilter) filters.push(me.getFilterOnQueryFilter());
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
		getChildLevelStoreConfig: function(tree, parentRecord, isPI, ordinal){ //ordinal and isPI of PARENT item
			var me=this,
				context= {
					project: me.PortfolioLocation.data._ref,
					projectScopeDown: true,
					projectScopeUp: false
				},
				filters = [ me.getParentRecordFilter(parentRecord, ordinal)];
			if(me.FilterOnComplete && isPI && ordinal > 0) filters.push(me.getFilterOnCompleteFilter(ordinal));
			if(!isPI || ordinal === 0) {
				if(me.FilterOnProject){ //we want only this project's stories
					context.project = me.ProjectRecord.data._ref;
					context.projectScopeDown = false;
				}
				else { //we want ALL user stories
					context.project = null;
					context.projectScopeDown = false;
				}
			} 
			if(me.FilterOnRelease && isPI && ordinal === 1) filters.push(me.getFilterOnReleaseFilter());
			if(me.QueryFilter) filters.push(me.getFilterOnQueryFilter());
			return {
				limit:Infinity,
				fetch: tree._getDefaultTopLevelFetchFields().concat(['Parent', 'Project', 'State']),
				context: context,
				filters:filters
			};
		},	
		renderPortfolioTree: function(){
			var me = this,
				modelName ='PortfolioItem/' + me.PIType,
				ordinal = me.portfolioItemTypeToOrdinal(me.PIType);

			me.down('#bodyContainer').add({
				xtype: 'rallyportfoliotree',
				stateful: true,
				stateId: me.getAppId() + 'rallyportfoliotree',
				topLevelModel: modelName,
				topLevelStoreConfig: me.getTopLevelStoreConfig(ordinal),
				listeners: {
					itemselected: me.onTreeItemSelected.bind(me)
				},
				childItemsStoreConfigForParentRecordFn: function(parentRecord) {
					var tree = this,
						isPI = tree._isPortfolioItem(parentRecord),
						ordinal = parentRecord.self.ordinal;
					return me.getChildLevelStoreConfig(tree, parentRecord, isPI, ordinal);
				},
				treeItemConfigForRecordFn: function(record){
					var tree = this,
						config = Rally.ui.tree.PortfolioTree.prototype.treeItemConfigForRecordFn.call(tree, record);
					if(tree._isPortfolioItem(record)) config.xtype = 'fittedportfolioitemtreeitem'; 
					else config.xtype = 'fitteduserstorytreeitem'; 
					return config;
				}
			});
		}
	});
}());