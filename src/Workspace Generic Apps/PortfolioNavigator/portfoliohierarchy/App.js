/** this is an app that makes portfolio hierarchies more customizable and stateful for each person **/
(function(){
	var Ext = window.Ext4 || window.Ext;

	var context = Rally.environment.getContext(),
		SETTINGS_TOKEN = context.getProject().ObjectID;

	Ext.define('IntelPortfolioHierarchy', {
		extend: 'IntelRallyApp',
		mixins: [
			'Rally.Messageable',
			'PrettyAlert',
			'UserAppsPreference'
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
		
		_userAppsPref: 'intel-portfolio-nav',

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
		_refreshTree: function() {
			var me=this;
			me.down('#bodyContainer').removeAll();
			me._buildPortfolioTree();
		},	
		_reloadEverything: function(){
			var me=this;
			me.setLoading(false);
			me._buildFilterOnRelease();
			me._buildReleasePicker();
			me._buildFilterOnProject();
			me._buildFilterOnComplete();
			me._buildPortfolioTree();
		},
		
		/************************************************** Launch ***************************************************/	
		launch: function() {
			var me=this;
			me.setLoading('Loading Configuration');
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getGlobalContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([
						me._projectInWhichTrain(me.ProjectRecord) /********* 1 ************/
							.then(function(trainRecord){
								if(trainRecord){
									me.TrainRecord = trainRecord;
									return me._loadTrainPortfolioProject(me.TrainRecord)
										.then(function(trainPortfolioProject){
											me.TrainPortfolioProject = trainPortfolioProject;
										});
								} 
							}),
						me._loadAppsPreference() /********* 2 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){		
								me.ReleaseRecords = releaseRecords;
								me.ReleaseNames = [];
								for(var i=0,len=releaseRecords.length; i<len; ++i){
									me.ReleaseNames.push({ Name: releaseRecords[i].data.Name });
								}
							}),
						me._loadAllProjects() /********* 3 ************/
							.then(function(projects){
								me.AllProjects = projects;
							}),
						me._loadRandomUserStory(me.ProjectRecord) /********* 4 ************/
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
						if(me.TrainPortfolioProject) me.PortfolioLocation = me.TrainPortfolioProject;
						else me.PortfolioLocation = me.ProjectRecord;
					}
					else {
						if(me.PortfolioLocation){ //if ObjectID is set manually
							me.PortfolioLocation = _.find(me.AllProjects, function(p){ 
								return p.data.ObjectID === me.PortfolioLocation; 
							});
						}
						if(!me.PortfolioLocation){
							return Q.reject('Inferring Portfolio Location. You must set the ' + 
								'project that the portfolio resides in!');
						}
					}
					me._reloadEverything();
				})
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},

		/*************************************************** HEADER ITEMS *********************************************/	
		_onPreferenceChanged: function(field, newValue){
			var me=this,
				pid = me.ProjectRecord.data.ObjectID;
			if(me[field] === newValue) return Q();
			else me[field] = newValue;
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid][field] = newValue;
			return me._saveAppsPreference(me.AppsPref);
		},
		_onReleaseSelected: function(combo, records){
			var me=this;
			me._onPreferenceChanged('FilterReleaseName', records[0].data.Name)
				.then(function(){ if(me.FilterOnRelease) me._refreshTree(); })
				.fail(function(reason){ me._alert('ERROR:', reason); })
				.done();
		},				
		_buildReleasePicker: function(){
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
				listeners: { select: me._onReleaseSelected.bind(me) }
			});
		},		
		_onFilterOnReleaseChanged: function(checkBox){
			var me=this,
				value = checkBox.getValue(),
				box = Ext.getCmp('headerRelease').down('intelfixedcombo');
			if(value) box.show(); else box.hide();
			me._onPreferenceChanged('FilterOnRelease', value)
				.then(function(){ me._refreshTree(); })
				.fail(function(reason){ me._alert('ERROR:', reason); })
				.done();
		},
		_buildFilterOnRelease: function(){
			var me=this;
			Ext.getCmp('headerRelease').add({
				xtype: 'rallycheckboxfield',
				boxLabel: 'Filter ' + me.PortfolioItemTypes[0] + 's in Release',
				id: 'filterOnReleaseCheckbox',
				value: me.FilterOnRelease,
				listeners: { change: me._onFilterOnReleaseChanged.bind(me) }
			});
		},		
		_onFilterOnProjectChanged: function(checkBox){
			var me=this;
			me._onPreferenceChanged('FilterOnProject', checkBox.getValue())
				.then(function(){ me._refreshTree(); })
				.fail(function(reason){ me._alert('ERROR:', reason); })
				.done();
		},
		_buildFilterOnProject: function(){
			var me=this;
			Ext.getCmp('headerProject').add({
				xtype: 'rallycheckboxfield',
				boxLabel: 'Filter User Stories in Current Project',
				id: 'filterOnProjectCheckbox',
				hidden: !me.HasUserStories,
				value: me.FilterOnProject,
				listeners: { change: me._onFilterOnProjectChanged.bind(me) }
			});
		},			
		_onFilterOnCompleteChanged: function(checkBox){
			var me=this;
			me._onPreferenceChanged('FilterOnComplete', checkBox.getValue())
				.then(function(){ me._refreshTree(); })
				.fail(function(reason){ me._alert('ERROR:', reason); })
				.done();
		},
		_buildFilterOnComplete: function(){
			var me=this;
			Ext.getCmp('headerComplete').add({
				xtype: 'rallycheckboxfield',
				boxLabel: 'Hide Completed Items',
				labelWidth: 170,
				value: me.FilterOnComplete,
				listeners: { change: me._onFilterOnCompleteChanged.bind(me) }
			});
		},

		/******************************************************* GRID ITEMS *********************************************/
		_onTreeItemSelected: function(treeItem){
			if(treeItem.xtype === 'fittedportfolioitemtreeitem'){
				this.publish('portfoliotreeitemselected', treeItem);
			}
		},	
		_getDummyWsapiFilter: function(){
			return Ext.create('Rally.data.wsapi.Filter', {
				property: 'ObjectID',
				operator: '!=',
				value: 0
			});
		},
		_getFilterOnCompleteFilter: function(ordinal){
			//the best we can do is filter if state 'Done' or 'Complete(d)' exists
			var me=this,
				completeState = me._getPortfolioItemTypeStateByOrdinal(ordinal, 'Done') || 
					me._getPortfolioItemTypeStateByOrdinal(ordinal, 'Complete') || 
					me._getPortfolioItemTypeStateByOrdinal(ordinal, 'Completed');
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
			else return me._getDummyWsapiFilter();
		},
		_getFilterOnReleaseFilter: function(){
			var me=this;
			return Ext.create('Rally.data.wsapi.Filter', {
				property: 'Release.Name',
				value: me.FilterReleaseName 
			});
		},
		_getFilterOnQueryFilter: function(){
			try { return Rally.data.QueryFilter.fromQueryString(this.QueryFilter); }
			catch(e){ return this._getDummyWsapiFilter(); }
		},	
		_getParentRecordFilter: function(parentRecord, ordinal){
			return Ext.create('Rally.data.wsapi.Filter', {
				property: (ordinal === 0 ? 'PortfolioItem' : 'Parent') + '.ObjectID', //only uses right under lowest PI have issue
				value: parentRecord.data.ObjectID
			});
		},	
		_getTopLevelStoreConfig: function(ordinal){ //ordinal of this level
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
		_getChildLevelStoreConfig: function(tree, parentRecord, isPI, ordinal){ //ordinal and isPI of PARENT item
			var me=this,
				context= {
					project: me.PortfolioLocation.data._ref,
					projectScopeDown: true,
					projectScopeUp: false
				},
				filters = [ me._getParentRecordFilter(parentRecord, ordinal)];
			if(me.FilterOnComplete && isPI && ordinal > 0) filters.push(me._getFilterOnCompleteFilter(ordinal));
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
			if(me.FilterOnRelease && isPI && ordinal === 1) filters.push(me._getFilterOnReleaseFilter());
			if(me.QueryFilter) filters.push(me._getFilterOnQueryFilter());
			return {
				limit:Infinity,
				fetch: tree._getDefaultTopLevelFetchFields().concat(['Parent', 'Project', 'State']),
				context: context,
				filters:filters
			};
		},	
		_buildPortfolioTree: function(){
			var me = this,
				modelName ='PortfolioItem/' + me.PIType,
				ordinal = me._portfolioItemTypeToOrdinal(me.PIType);

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