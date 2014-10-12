/** this app requires the following custom fields for your workspace:
	c_TeamCommits on PortfolioItem/Feature, (type: 32 kB)
	c_Risks on PortfolioItem/Feature, (type: 32 kB)
	c_Dependencies on HierarchicalRequirement, (type: 32 kB)
	
	
	TeamCommits looks like:
	{
		projectID: {
			status: ('Undecided'|'N/A'|'Committed'|'Not Committed'),
			expected: boolean (default false)
		}
	}
	Risks looks like: 
	{
		projectID: {
			riskID:{
				CP:    //checkpoint
				Cont: //contact
				Desc: //description
				Imp: //impact
				Sta: //status
			}
		}
	}
	
	How data is stored in c_Dependencies:
	{ 
		Preds: {
			ID: {
				Desc, //description
				CP, //Checkpoint
				Sta, //Status set by chief engineer
				Preds, {
					TID: {
						PID, //ProjectID of predecessor
						USID, //UserStory Formatted ID
						USName, //UserStory Name
						Sup, //supported
						A	//assigned
					}
				)
			}
		},
		Succs: [
			{
				ID, //DependencyID,
				PUSID, //predecessor UserStory Formatted ID
				PUSName, //predecessor UserStory Name
				PPID, //predecessor project ID
				Desc, //description
				REL, //release date
				REL_S, //release start date
				CP, //Checkpoint
				Sup, //supported
				A //assigned
			}
		]	
	}	
	
	ALSO, this app depends on a specific naming convention for your ARTs and Scrums within them, otherwise the releases wont load correctly
*/

/********************* PRODUCTION *****************/
//console = { log: function(){} };
preferenceName = 'intel-risks-deps-board';		

/********************* END PRODUCTION *****************/

Ext.define('CustomApp', {
	extend: 'Rally.app.App',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'IntelWorkweek',
		'ReleaseQuery'
	],
	
	layout: {
		type:'vbox',
		align:'stretch',
		pack:'start'
	},
	items:[{
		xtype:'container',
		layout: {
			type:'hbox',
			align:'stretch',
			pack:'start'
		},
		height:45,
		itemId:'navbox',
		items:[{
			xtype:'container',
			flex:3,
			itemId:'navbox_left',
			layout: {
				type:'hbox'
			}
		},{
			xtype:'container',
			flex:2,
			itemId:'navbox_right',
			layout: {
				type:'hbox',
				pack:'end'
			}
		}]
	}]
	minWidth:910, //thats when rally adds a horizontal scrollbar for a pagewide app
		
	/****************************************************** DATA STORE METHODS ********************************************************/

	/** __________________________________GENERAL LOADING STUFF___________________________________	 **/
	_loadModels: function(cb){
		var me=this, promises = [],
			models = {
				Project: 'Project',
				UserStory: 'HierarchicalRequirement',
				Feature:'PortfolioItem/Feature',
				Milestone:'PortfolioItem/Milestone'
			};
		_.each(models, function(modelType, modelName){
			var deferred = Q.defer();
			Rally.data.WsapiModelFactory.getModel({ //load project
				type:modelType, 
				success: function(loadedModel){ 
					me[modelName] = loadedModel;
					deferred.resolve();
				}
			});
			promises.push(deferred.promise);
		});
		Q.all(promises).then(cb);
	},
	
	_loadProject: function(oid, cb){ 
		var me = this; debugger;
		if(!oid){ cb(); return; }
		if(!me.Project){ me._loadModels(function(){ me._loadProject(oid, cb); }); return; }
		me.Project.load(oid, {
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: cb
		});
	},
	
	_loadFeature: function(oid, cb){ 
		var me = this;
		if(!oid){ cb(); return; }
		if(!me.Feature){ me._loadModels(function(){ me._loadFeature(oid, cb); }); return; }
		if(!oid){ cb(); return; }
		me.Feature.load(oid, {
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: me.ProjectRecord.data._ref
			},
			callback: cb
		});
	},
	
	_loadUserStory: function(oid, cb){ 
		var me = this;
		if(!oid){ cb(); return; }
		if(!me.UserStory){ me._loadModels(function(){ me._loadUserStory(oid, cb); }); return; }
		me.UserStory.load(oid, {
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
				'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: me.ProjectRecord.data._ref
			},
			callback: cb
		});
	},
	
	_loadMilestone: function(oid, cb){ 
		var me = this;
		if(!oid){ cb(); return; }
		if(!me.Milestone){ me._loadModels(function(){ me._loadMilestone(oid, cb); }); return; }
		me.Milestone.load(oid, {
			fetch: ['ObjectID', 'Parent', 'Name'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: cb
		});
	},
	
	_loadRootProject: function(projectRecord, cb){
		var me=this, n = projectRecord.get('Name');
		if(n === 'All Scrums' || n === 'All Scrums Sandbox' || !projectRecord.data.Parent) {
			me.RootProjectRecord = projectRecord;
			cb();
		} else {
			me._loadProject(projectRecord.data.Parent.ObjectID, function(parentRecord){
				me._loadRootProject(parentRecord, cb);
			});
		}
	},
	
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		if(!projectRecord) cb();
		var me=this, split = projectRecord.get('Name').split(' ART');
		if(split.length>1) cb(projectRecord);
		else { 
			var parent = projectRecord.get('Parent');
			if(!parent) cb();
			else {
				me._loadProject(parent.ObjectID, function(parentRecord){
					me._projectInWhichTrain(parentRecord, cb);
				});
			}
		}
	},
	
	_allValidProjectsLoaded: function(scrums, cb){ //we filter projects based on permissions
		var me=this, 
			vp = {}, 
			names = [], 
			len = scrums.length, 
			permissions = me.getContext().getPermissions(), 
			i, scrum;
		for(i=0;i<scrums.length;++i){
			scrum = scrums[i];
			vp[scrum.data.ObjectID] = scrum;
			names.push({Name:scrum.data.Name});
		}
		me.ValidProjects = vp;
		me.ProjectNames = names;
		console.log('valid scrums loaded:', scrums);
		if(cb) cb(); 
	},
	
	_loadValidProjects: function(cb){
		var scrums = [];
		var loadChildren = (function(project, _cb){
			if(project.get('TeamMembers').Count > 0) //valid scrums have people
				scrums.push(project);
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				autoLoad:true,
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name', 'ObjectID', 'Parent', 'TeamMembers'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
						property:'Parent.ObjectID',
						value: project.get('ObjectID')
					}
				],
				listeners: {
					load: {
						fn: function(projectStore, projectRecords){
							var promises = [], 
								len = projectRecords.length,
								i, deferred, project;
							for(i=0;i<len;++i){
								deferred = Q.defer();
								promises.push(deferred.promise);
								project = projectRecords[i];
								loadChildren(project, deferred.resolve);
							}
							Q.all(promises).then(_cb);
						},
						single:true,
						scope:this
					}
				}
			});
		}).bind(this);

		Ext.create('Rally.data.wsapi.Store',{
			model: 'Project',
			autoLoad:true,
			remoteSort:false,
			pageSize:1,
			limit:1,
			fetch: ['Name', 'ObjectID', 'TeamMembers'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
					property:'Name',
					value: this.RootProjectRecord.get('Name')
				}
			],
			listeners:{
				load:{
					fn: function(ps, recs){
						loadChildren(recs[0], this._allValidProjectsLoaded.bind(this, scrums, cb));
					},
					single:true,
					scope:this
				}
			}
		});
	},

	_milestoneLoaded: function(frData, deferred, milestoneRecord){
		var p = milestoneRecord.data.Parent;
		this.FeatureProductHash[frData.ObjectID] = ((p && p.Name ) ? p.Name : '');
		deferred.resolve();
	},
						
	_getFeatureFilterString: function(){
		var coreFilter = Ext.create('Rally.data.wsapi.Filter', {
			property:'Release.Name',
			value: this.ReleaseRecord.get('Name')
		});
		if(!this.TrainRecord) { 
			throw 'You should have a train here'; //even non-train teams
		}
		else {
			if(this.TrainRecord.get('Name') == 'Test ART (P&E)'){
				return '((Project.Name = "Test ART (P&E)") AND (Release.Name = "' + this.ReleaseRecord.get('Name') + '"))';
			}
			var trainName = this.TrainRecord.get('Name').split(' ART')[0];
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Project.Parent.Name',
				value: trainName + ' POWG Portfolios'
			}).and(coreFilter).toString();
		}
	},
	
	_loadFeatures: function(cb){ 
		var filterString = this._getFeatureFilterString();
		this.FeatureStore = Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{ property:'Dummy', value:'value' }]
		});
		this.FeatureStore._hydrateModelAndLoad = function(options){
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
		this.FeatureStore.load({
			scope:this,
			callback: function(featureRecords){
				console.log('features loaded:', featureRecords);
				var promises = [];
				this.FeatureProductHash = {};
				featureRecords.forEach(function(fr){
					var deferred = Q.defer();
					var frData = fr.data;
					if(frData.Parent) this._loadMilestone(frData.Parent.ObjectID, this._milestoneLoaded.bind(this, frData, deferred));
					else {
						this.FeatureProductHash[frData.ObjectID] = '';
						deferred.resolve();
					}
					promises.push(deferred.promise);
				}, this);
				Q.all(promises).then(cb);
			}
		});
	},
	
	_loadUserStoryFilterString: function(){
		var startDate =	Rally.util.DateTime.toIsoString(this.ReleaseRecord.get('ReleaseStartDate')),
			endDate =	Rally.util.DateTime.toIsoString(this.ReleaseRecord.get('ReleaseDate'));
		
		/*************************************** core Filter ********************************************/
		var coreFilter = Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
			property:'Release.Name',
			value: this.ReleaseRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.Name',
			value: this.ProjectRecord.get('Name')
		}));
		
		/*************************************** Dependencies Filter ********************************************/		
		var depFilter = Ext.create('Rally.data.wsapi.Filter', { //to get successors (could be any random user story)
			property:'Project.Name',
			value: this.ProjectRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'c_Dependencies',
			operator:'!=',
			value:''
		}));

		/*************************************** Store Stuff********************************************/
		return coreFilter.or(depFilter).toString();
	},
	
	_loadUserStories: function(cb){	
		var filterString = this._loadUserStoryFilterString();
		
		this.UserStoryStore = Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
				'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{ property:'Dummy', value:'value' }], //need this or filterString wont get injected
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						console.log('user stories loaded:', userStoryRecords);
						cb();
					},
					single:true
				}
			}
		});
		this.UserStoryStore._hydrateModelAndLoad = function(options){
      var deferred = new Deft.Deferred();
      this.hydrateModel().then({
        success: function(model) {
					this.proxy.encodeFilters = function(){//inject custom filter here. woot
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
		this.UserStoryStore.load();
	},
	
	/**___________________________________ RISKS STUFF___________________________________**/
	_getRisks: function(featureRecord){
		var risks = featureRecord.get('c_Risks');
		try{ risks = JSON.parse(atob(risks)) || {}; } 
		catch(e) { risks = {}; }
		return risks;
	},
	
	_parseRisksFromFeature: function(featureRecord){
		var array = [],
			projectID = this.ProjectRecord.data.ObjectID, 
			risks = this._getRisks(featureRecord),
			ObjectID = featureRecord.data.ObjectID,
			FormattedID = featureRecord.data.FormattedID,
			FeatureName = featureRecord.data.Name;
		if(risks[projectID]){
			for(var riskID in risks[projectID]){
				var risk = risks[projectID][riskID];
				array.push({
					ProjectName:
					ProjectID: projectID,
					ObjectID: ObjectID,
					FormattedID: FormattedID,
					FeatureName: FeatureName,
					RiskID: riskID,
					Description: risk.Desc,
					Impact: risk.Imp,
					Status: risk.Sta,
					Contact: risk.Cont,
					Checkpoint: risk.CP,
					Edited: false //not in pending edit mode
				});
			}
		}
		return array;
	},
	
	_parseRisksData: function(){ 
		var me=this, 
			array = [],
			records = me.FeatureStore.getRecords(),
			relUSs = [], 
			i, len;
		for(i=0,len=records.length; i<len;++i)
			array = array.concat(me._parseRisksFromFeature(records[i]));
		me.RisksParsedData = array;
	},
		
	_removeRiskFromList: function(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
		for(var i = 0; i<riskList.length; ++i){
			if(riskList[i].RiskID == riskID) {
				return riskList.splice(i, 1)[0];
			}
		}
	},
	
	_addRisk: function(featureRecord, riskData){
		var risks = this._getRisks(featureRecord),
			projectID = riskData.ObjectID,
			deferred = Q.defer();

		riskData = Ext.clone(riskData);
		riskData.Edited = false;
		
		if(!risks[projectID]) risks[projectID] = {};
		var copy = {
			CP: riskData.Checkpoint,
			Cont: riskData.Contact,
			Desc:riskData.Description,
			Imp: riskData.Impact,
			Sta: riskData.Status
		};
		risks[projectID][riskData.RiskID] = copy;
		var parseDataAdded = false;
		for(var i=0;i<this.RisksParsedData.length; ++i){
			var rpd = this.RisksParsedData[i];
			if(rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID){
				this.RisksParsedData[i] = riskData;
				parseDataAdded = true; break;
			}
		}
		if(!parseDataAdded) this.RisksParsedData.push(riskData);
		var str = btoa(JSON.stringify(risks, null, '\t')); //b64 encode yosef
		if(str.length >= 32768)
			deferred.reject('Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
		else {
			featureRecord.set('c_Risks', str);
			featureRecord.save({
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.get('FormattedID'));
					else {
						console.log('added risk to feature:', featureRecord, riskData, risks);
						deferred.resolve();
					}
				}
			});
		}
		
		return deferred.promise;
	},
		
	/**_____________________________________ DEPENDENCIES STUFF ___________________________________	**/

	_isInRelease: function(usr){
		return usr.data.Release && usr.data.Release.Name === this.ReleaseRecord.data.Name;
	},
	
	_getDependencies: function(userStoryRecord){
		var dependencies, dependencyString = userStoryRecord.data.c_Dependencies;
		if(dependencyString === '') dependencies = { Preds:{}, Succs:[] };
		else {
			try{ dependencies = JSON.parse(atob(dependencyString)); }
			catch(e) { dependencies = { Preds:{}, Succs:[] }; }
		}		
		return dependencies;
	},
	
	_parseDependenciesFromUserStory: function(userStoryRecord){
		var deps = this._getDependencies(userStoryRecord), 
			preds = deps.Preds, succs = deps.Succs,
			predDepsList = [], succDepsList = [],
			startDate =	new Date(this.ReleaseRecord.data.ReleaseStartDate),
			endDate =	new Date(this.ReleaseRecord.data.ReleaseDate),
			ObjectID = userStoryRecord.data.ObjectID,
			FormattedID = userStoryRecord.data.FormattedID,
			UserStoryName = userStoryRecord.data.Name;
			
		if(this._isInRelease(userStoryRecord)){
			for(var predDepID in preds){
				var predDep = preds[predDepID];
				predDepsList.push({
					DependencyID: predDepID,
					ObjectID: ObjectID,
					FormattedID: FormattedID,
					UserStoryName: UserStoryName,
					Description: predDep.Desc,
					Checkpoint: predDep.CP,
					Status: predDep.Sta,
					Predecessors: predDep.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
					Edited: false //not in pending edit mode
				});
			}
		}
		return {Predecessors:predDepsList};
	},
	
	_buildDependenciesData: function(){	
		var me=this, 
			predDepsList = [], 
			records = me.UserStoryStore.getRecords(),
			relUSs = [], 
			i, len;
		for(i=0,len = records.length; i<len;++i)
			if(me._isInRelease(records[i])) relUSs.push(records[i]);
		me.DependenciesReleaseUserStories = relUSs;
		
		for(i=0;i<len;++i){
			var usrData = me._parseDependenciesFromUserStory(records[i]);
			predDepsList = predDepsList.concat(usrData.Predecessors);
		}
		me.DependenciesParsedData = {Predecessors:predDepsList };
	},

	_removeDepFromList: function(dependencyID, dependencyList){ 
		for(var i = 0; i<dependencyList.length; ++i){
			if(dependencyList[i].DependencyID == dependencyID) {
				return dependencyList.splice(i, 1)[0];
			}
		}
	},
	
	/** NOTE: we don't need to sync collection here **/
	_collectionSynced: function(userStoryRecord, msg, depData, dependencies){
		var me=this, 
			str = btoa(JSON.stringify(dependencies, null, '\t')),
			deferred = Q.defer();
		if(str.length >= 32768) 
			deferred.reject('Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
		else {
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify User Story ' + userStoryRecord.get('FormattedID'));
					else {
						console.log(msg, userStoryRecord, depData, dependencies);
						deferred.resolve();
					}
				}
			});
		}
		return deferred.promise;
	},
	
	_addPredDep: function(userStoryRecord, predDepData){ 
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cachePreds = me.DependenciesParsedData.Predecessors, dpdp,
			parseDataAdded = false, depID, i;
		
		predDepData = Ext.clone(predDepData);
		predDepData.Edited = false;
				
		dependencies.Preds[predDepData.DependencyID] = {
			Desc: predDepData.Description,
			CP: predDepData.Checkpoint,
			Sta: predDepData.Status,
			Preds: predDepData.Predecessors
		};

		//update or append to the cache, this predDepData
		for(i=0;i<cachePreds.length; ++i){
			dpdp = cachePreds[i];
			if(dpdp.DependencyID === predDepData.DependencyID){
				cachePreds[i] = predDepData;
				parseDataAdded = true; break;
			}
		}
		if(!parseDataAdded) cachePreds.push(predDepData);	

		return me._collectionSynced(userStoryRecord, 'added predDep', predDepData, dependencies);
	},
	
	_getOldAndNewUSRecords: function(depData){
		var me = this,
			tmpNewUSRecord = me.UserStoryStore.findExactRecord('FormattedID', depData.FormattedID),
			tmpNewUSData = tmpNewUSRecord && tmpNewUSRecord.data,
			newUSRecord,
			deferred = Q.defer();

		if(tmpNewUSData && (tmpNewUSData.ObjectID != depData.ObjectID)){ //load new one
			me._loadUserStory(tmpNewUSData.ObjectID, function(usRecord){
				newUSRecord = usRecord; 
				loadOriginalParent();
			});
		} else loadOriginalParent();

		function loadOriginalParent(){
			me._loadUserStory(depData.ObjectID, function(oldUSRecord){
				newUSRecord = newUSRecord || oldUSRecord; //if depRecord is new...has no ObjectID
				deferred.resolve([oldUSRecord, newUSRecord]);
			});
		}
		return deferred.promise;
	},
	
	/************************************************** Preferences FUNCTIONS ***************************************************/
	
	_loadPreferences: function(cb){ //parse all settings too
		var uid = this.getContext().getUser().ObjectID;
		Rally.data.PreferenceManager.load({
			appID: this.getAppId(),
      filterByName:preferenceName+ uid,
			success: function(prefs) {
				var appPrefs = prefs[preferenceName + uid];
				try{ appPrefs = JSON.parse(appPrefs); }
				catch(e){ appPrefs = { projs:{}, refresh:30};}
				this.AppPrefs = appPrefs;
				console.log('loaded prefs', appPrefs);
        cb();
			},
			scope:this
		});
	},

	_savePreferences: function(prefs, cb){ // stringify and save only the updated settings
		var s = {}, uid = this.getContext().getUser().ObjectID;
		prefs = {projs: prefs.projs, refresh:prefs.refresh};
    s[preferenceName + uid] = JSON.stringify(prefs); //release: objectID, refresh: (off, 10, 15, 30, 60, 120)
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: this.getAppId(),
			settings: s,
			success: cb,
			scope:this
		});
	},
	
	/************************************************** MISC HELPERS ***************************************************/
			
	_htmlEscape: function(str) {
    return String(str)
			//.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	},
	
	_getDirtyType: function(localRecord, realData){ //if risk or dep record is new/edited/deleted/unchanged
		var localData = localRecord.data;
		if(!realData)	return localData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
		else return localData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
	},

  /************************************************ LOADING AND RELOADING ***********************************/

	_isEditing: function(store){
		if(!store) return false;
		for(var records = store.getRange(), i=0, len=records.length; i<len; ++i)
			if(records[i].data.Edited) return true;
		return false;
	},
	
	_updateAllGrids: function(){ //synchronous function
		var me=this,
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore);
		if(!isEditingRisks && me.FeatureStore){
			me._parseRisksData();
			me._updateFColumnStores();
			if(me.CustomRisksStore) me.CustomRisksStore.intelUpdate();
		}
		if(!isEditingDeps && me.UserStoryStore && me.FeatureStore){
			me._buildDependenciesData(); //reparse the data
			me._updateUSColumnStores();
			if(me.CustomPredDepStore) me.CustomPredDepStore.intelUpdate();
		}
	},
	
	_reloadStores: function(){ //this function calls updateAllGrids
		var me=this,
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore),
			promises = [];
		if(!isEditingRisks){
			var def2 = Q.defer();
			if(me.FeatureStore) me.FeatureStore.load({ callback: def2.resolve});
			else me._loadFeatures(def2.resolve);
			promises.push(def2.promise);
		}
		if(!isEditingDeps){
			var def3 = Q.defer();
			if(me.UserStoryStore) me.UserStoryStore.load({ callback: def3.resolve});
			else me._loadUserStories(def3.resolve);
			promises.push(def3.promise);
		}
		return Q.all(promises);
	},
	
	_storesReloaded: function(){
		var me=this;
		me._loadRisksGrid();
		me._loadDependenciesGrids();
	},
	
	_reloadEverything:function(){
		var me = this;
		
		me.UserStoryStore = undefined;
		me.FeatureStore = undefined;
		
		me.PredDepGrid = undefined;
		me.RisksGrid = undefined;
		
		me.CustomPredDepStore = undefined;
		me.CustomRisksStore = undefined;
		
		me.setLoading(true);
		
		var toRemove = me.down('#navbox').next(), tmp;
		while(toRemove){ //delete risks and deps
			tmp = toRemove.next();
			toRemove.up().remove(toRemove);
			toRemove = tmp;
		}

		if(!me.ReleasePicker){ //draw these once, never removve them
			me._loadReleasePicker();
			me._loadRefreshIntervalCombo();
			me._loadManualRefreshButton();
		}		
		me._reloadStores()
			.then(function(){ 
				me._updateAllGrids();
			})
			.then(function(){
				me.setLoading(false);
				me._storesReloaded();
			})
			.done();
	},
	
	/******************************************************* REFRESHING WSAPI DATA ***********************************************/
	
	_setLoadingMasks: function(){
		var me=this, t = 'Refreshing Data',
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore);			
		if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(t);
		if(me.PredDepGrid && !isEditingDeps) me.PredDepGrid.setLoading(t);
	},
	
	_removeLoadingMasks: function(){
		var me=this;
		if(me.RisksGrid) me.RisksGrid.setLoading(false);
		if(me.PredDepGrid) me.PredDepGrid.setLoading(false);
	},
	
	_refreshDataFunc: function(){ //also performes a window resize after data is loaded
		var me=this;
		me._setLoadingMasks();	
		me._reloadStores()
			.then(function(){ 
				me._updateAllGrids();
			})
			.then(function(){
				me._removeLoadingMasks();
				me._fireParentWindowEvent('resize');
			})
			.done();
	},
	
	_setRefreshInterval: function(){
		var me=this;
		if(me.RefreshInterval) { 
			clearInterval(me.RefreshInterval); 
			me.RefreshInterval = undefined; 
		}
		if(me.AppPrefs.refresh!=='Off')
			me.RefreshInterval = setInterval(function(){ me._refreshDataFunc(); }, me.AppPrefs.refresh * 1000);
	},
	
	/******************************************************* LAUNCH ********************************************************/
	_releasesLoaded: function(releaseStore){ //finally we can render!!!
		var me=this;
		me.ReleaseStore = releaseStore;
		var currentRelease = me._getScopedRelease(me.ReleaseStore.getRange(), me.ProjectRecord.data.ObjectID, me.AppPrefs);
		if(currentRelease){
			me.ReleaseRecord = currentRelease;
			console.log('release loaded', currentRelease);
			me._setRefreshInterval(); 
			me._reloadEverything();
		} else {
			me.setLoading(false);
			me._alert('ERROR', 'This train has no releases.');
		}
	},
	
	_trainRecordLoaded: function(trainRecord){ //now we set the TrainRecord based on trainRecord and this.AppPrefs
		var me=this;
		if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID){
			me.TrainRecord = trainRecord;
			me.ProjectRecord = undefined;
			console.log('train loaded:', trainRecord);
			me._loadReleasesInTheFuture(me.TrainRecord).then(me._releasesLoaded.bind(me));
		} else {
			me.setLoading(false);
			me._alert('ERROR', 'You are not scoped to a train.');
		}
	},
	
	_preferencesLoaded: function(){
		this._projectInWhichTrain(this.ProjectRecord, this._trainRecordLoaded.bind(this));
	},

	_rootProjectLoaded: function(){
		this._loadPreferences(this._preferencesLoaded.bind(this));
	},
	
	_currentProjectLoaded: function(scopeProjectRecord){
		this.ProjectRecord = scopeProjectRecord; //temporary
		this._loadRootProject(scopeProjectRecord, this._rootProjectLoaded.bind(this));
	},
	
	_modelsLoaded: function(){
		var scopeProject = this.getContext().getProject();
		this._loadProject(scopeProject.ObjectID, this._currentProjectLoaded.bind(this));
	},
	
	launch: function(){
		var me=this;
		me.setLoading(true);
		me._initPrettyAlert();
		me._initIframeResize();	
		if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
			me.setLoading(false);
			me._alert('ERROR', 'You do not have permissions to edit this project');
		} 
		else me._loadModels(me._modelsLoaded.bind(me));
	},

	/******************************************************* RENDER TOP BAR ITEMS********************************************************/	
	
	_releasePickerSelected: function(combo, records){
		if(this.ReleaseRecord.get('Name') === records[0].get('Name')) return;
		this.setLoading(true);
		this.ReleaseRecord = this.ReleaseStore.findExactRecord('Name', records[0].get('Name'));			
		var pid = this.ProjectRecord.get('ObjectID');		
		if(typeof this.AppPrefs.projs[pid] !== 'object') this.AppPrefs.projs[pid] = {};
		this.AppPrefs.projs[pid].Release = this.ReleaseRecord.get('ObjectID');
		this._savePreferences(this.AppPrefs, this._reloadEverything.bind(this));
	},
				
	_loadReleasePicker: function(){
		this.ReleasePicker = this.down('#navbox_left').add({
			xtype:'combobox',
			width:240,
			padding:'0 10px 0 0',
			labelWidth:50,
			store: Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: _.map(this.ReleaseStore.getRecords(), function(r){ return {Name: r.get('Name') }; })
			}),
			displayField: 'Name',
			fieldLabel: 'Release:',
			editable:false,
			value:this.ReleaseRecord.get('Name'),
			listeners: {
				select: this._releasePickerSelected.bind(this)
			}
		});
	},

	_refreshComboSelected: function(combo, records){
		var rate = records[0].get('Rate');
		if(this.AppPrefs.refresh === rate) return;
		this.AppPrefs.refresh = rate;
		this._setRefreshInterval();
		this._savePreferences(this.AppPrefs);
	},
				
	_loadRefreshIntervalCombo: function(){
		this.down('#navbox_right').add({
			xtype:'combobox',
			store: Ext.create('Ext.data.Store', {
				fields: ['Rate'],
				data: [
					{Rate: 'Off'},
					{Rate: '10'},
					{Rate: '15'},
					{Rate: '30'},
					{Rate: '60'},
					{Rate: '120'}
				]
			}),
			displayField: 'Rate',
			fieldLabel: 'Auto-Refresh Rate (seconds):',
			editable:false,
			value:this.AppPrefs.refresh,
			listeners: {
				select: this._refreshComboSelected.bind(this)
			}
		});
	},
	
	_loadManualRefreshButton: function(){
		this.down('#navbox_right').add({
			xtype:'button',
			text:'Refresh Data',
			style:'margin: 5px 0 0 5px',
			width:100,
			listeners:{
				click: this._refreshDataFunc.bind(this)
			}
		});
	},
	
	/******************************************************* RENDER GRIDS ********************************************************/	

	_loadRisksGrid: function(){
		var me = this, 
			rd = me.ReleaseRecord.data,
			workweeks = _.map(me._getWorkweeks(rd.ReleaseStartDate, rd.ReleaseDate), function(ww){ return {Week: ww}; }),
			riskSorter = function(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; }; //new come first

		/****************************** RISKS STUFF  ***********************************************/	
		me.CustomRisksStore = Ext.create('Intel.data.FastStore', { 
			data: Ext.clone(me.RisksParsedData),
			autoSync:true,
			model:'IntelRisk',
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id:'RiskProxy' + Math.random()
			},
			sorters: [riskSorter],
			intelUpdate: function(){
				var riskStore = me.CustomRisksStore, 
					riskRecords = riskStore.getRange(),
					realRisksDatas = me.RisksParsedData.slice(0), //'real' risks list
					remoteChanged = false, //if someone else updated this while it was idle on our screen	
					key;
				console.log('syncing risks with current features', riskRecords, realRisksDatas);
				riskStore.suspendEvents(true);
				for(var i = 0;i<riskRecords.length;++i){
					var riskRecord =  riskRecords[i];
					var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), realRisksDatas);
					
					var dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType === 'New' || dirtyType === 'Edited') continue; //we don't want to remove any pending changes on a record							
					else if(dirtyType == 'Deleted') // the riskRecord was deleted by someone else, and we arent editing it
						riskStore.remove(riskRecord);
					else { //we are not editing it and it still exists, so update current copy
						for(key in realRiskData){
							if(!_.isEqual(riskRecord.get(key), realRiskData[key])){ remoteChanged = true; break; }
						}
						if(remoteChanged){
							riskRecord.beginEdit();
							for(key in realRiskData)
								riskRecord.set(key, realRiskData[key]);
							riskRecord.endEdit();
						}
					}
				}
				realRisksDatas.forEach(function(realRiskData){ //add all the new risks that other people have added since first load
					console.log('adding real risk', realRiskData);
					riskStore.add(Ext.create('IntelRisk', Ext.clone(realRiskData)));
				});
				riskStore.resumeEvents();
			}
		});
		me.CustomRisksStore.intelUpdate();
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',	
				width:80,
				editor:false,	
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor:false,	
				resizable:false,
				sortable:true	,
				renderer:function(val){ return val || '-'; }			
			},{
				text:'Risk Description', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				resizable:false,
				sortable:false,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Impact', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				resizable:false,
				sortable:false,
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Status(ROAM)',
				dataIndex:'Status',
				tdCls: 'intel-editor-cell',	
				width:100,				
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{'Status':'Undefined'},
							{'Status':'Resolved'},
							{'Status':'Owned'},
							{'Status':'Accepted'},
							{'Status':'Mitigated'}
						]
					}),
					editable: false,
					displayField:'Status',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				resizable:false,
				sortable:true,
				renderer:function(val, meta){
					meta.tdCls += (val==='Undefined' ? ' red-cell' : '');
					return val || '-';
				}		
			},{
				text:'Contact', 
				dataIndex:'Contact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				sortable:false,
				resizable:false,
				renderer:function(val){ return val || '-'; }			
			},{
				text:'Checkpoint',	
				dataIndex:'Checkpoint',
				tdCls: 'intel-editor-cell',	
				width:80,
				resizable:false,				
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Week'],
						data: workweeks
					}),
					editable: false,
					displayField: 'Week',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				sortable:true,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'Edited') return;
					meta.tdAttr = 'title="Undo"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
									riskRecord.beginEdit();
									for(var key in realRiskData)
										riskRecord.set(key, realRiskData[key]);	
									riskRecord.endEdit();
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
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType === 'New') dirtyType = 'Save'; //setEditing only if save or resave is true
					else if(dirtyType === 'Edited') dirtyType = 'Save';
					else return;
					meta.tdAttr = 'title="' + dirtyType + ' Risk"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){//DONT NEED ObjectID. that only is to reference previous parent!
									if(!riskRecord.get('FormattedID') || !riskRecord.get('FeatureName')){
										me._alert('ERROR', 'You must set the Feature affected by this risk'); return; } 
									else if(!riskRecord.get('Checkpoint')){
										me._alert('ERROR', 'You must set the Checkpoint date for this risk'); return; }
									else if(!riskRecord.get('Description')){
										me._alert('ERROR', 'You must set the Description date for this risk'); return; }
									else if(!riskRecord.get('Impact')){
										me._alert('ERROR', 'You must set the Impact date for this risk'); return; }
									else if(!riskRecord.get('Status')){
										me._alert('ERROR', 'You must set the Status date for this risk'); return; }
									else if(!riskRecord.get('Contact')){
										me._alert('ERROR', 'You must set the Contact date for this risk'); return; }
									me.RisksGrid.setLoading(true);
									var riskRecordData = riskRecord.data,
										tmpNewFeatureRecord = me.FeatureStore.findExactRecord('FormattedID', riskRecordData.FormattedID),
										newFeatureRecord;
								
									if(tmpNewFeatureRecord.get('ObjectID') != riskRecord.get('ObjectID')){ //load new one
										me._loadFeature(tmpNewFeatureRecord.get('ObjectID'), function(featureRecord){
											newFeatureRecord = featureRecord; 
											loadOriginalParent();
										});
									} else loadOriginalParent();
									
									function loadOriginalParent(){
										me._loadFeature(riskRecord.get('ObjectID'), function(oldFeatureRecord){							
											newFeatureRecord = newFeatureRecord || oldFeatureRecord; //if new is same as old			
											var lastAction = function(){
												riskRecord.beginEdit();
												riskRecord.set('Edited', false);
												riskRecord.set('ObjectID', newFeatureRecord.get('ObjectID'));
												riskRecord.endEdit();
												me.RisksGrid.setLoading(false);
											},
											nextAction = function(){
												return me._addRisk(newFeatureRecord, riskRecordData).then(lastAction);
											};	
											if(!oldFeatureRecord){ nextAction(); return; } //for newly added 
											else {
												var oldRealRisksData = me._parseRisksFromFeature(oldFeatureRecord),
													oldRealRiskData = me._removeRiskFromList(riskRecordData.RiskID, oldRealRisksData);						
												if(oldFeatureRecord.get('ObjectID') !== newFeatureRecord.get('ObjectID') && oldRealRiskData){
													me._removeRisk(oldFeatureRecord, oldRealRiskData)
														.then(nextAction)
														.fail(function(reason){ me._alert('ERROR', reason); })
														.done();
												}
												else nextAction();					
											}
										});
									}
								}
							}
						}
					};
				}
			}
		];

		me.RisksGrid = me.add({
			xtype: 'rallygrid',
      title: 'Risks',
			minHeight:150,
			maxHeight:800,
			style:'margin-top:10px',
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px';},
				listeners: { resize: function(){ me._fireParentWindowEvent('resize'); }}
			},
			listeners: {
				afterrender: function(){ me._fireParentWindowEvent('resize'); },
				edit: function(editor, e){			
					/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
						to improve performance.**/
					var grid = e.grid,
						risksRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;
					if(value === originalValue) return; 
					if(['Description', 'Impact', 'Contact'].indexOf(field)>-1) {
						value = me._htmlEscape(value);			
						risksRecord.set(field, value);
					}

					var previousEdit = risksRecord.get('Edited');
					risksRecord.set('Edited', true);
					
					var featureRecord;
					if(field === 'FeatureName'){
						featureRecord = me.FeatureStore.findExactRecord('Name', value);
						if(!featureRecord){
							risksRecord.set('FeatureName', originalValue);
							risksRecord.set('Edited', previousEdit);
						} else risksRecord.set('FormattedID', featureRecord.get('FormattedID'));
					} else if(field === 'FormattedID'){
						featureRecord = me.FeatureStore.findExactRecord('FormattedID', value);
						if(!featureRecord) {
							risksRecord.set('FormattedID', originalValue);
							risksRecord.set('Edited', previousEdit); 
						} else risksRecord.set('FeatureName', featureRecord.get('Name'));
					} 
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomRisksStore
		});	
	},
	
	_loadDependenciesGrids: function(){
		var me = this,
			rd = me.ReleaseRecord.data,
			workweeks = _.map(me._getWorkweeks(rd.ReleaseStartDate, rd.ReleaseDate), function(ww){ return {Week: ww}; });
		
		/****************************** PREDECESSORS STUFF           ***********************************************/				
		me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
		me.PredDepContainers = {};
		
		function depSorter(o1, o2){ return o1.data.DependencyID > o2.data.DependencyID ? -1 : 1; } //new come first
		function depTeamSorter(o1, o2){ return o1.data.TID > o2.data.TID ? -1 : 1; } //new come first

		me.CustomPredDepStore = Ext.create('Intel.data.FastStore', { 
			data: Ext.clone(me.DependenciesParsedData.Predecessors),
			autoSync:true,
			model:'IntelPredDep',
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id:'PredDepProxy' + Math.random()
			},
			sorters:[depSorter],
			intelUpdate: function(){ 
				var predDepStore = me.CustomPredDepStore, 
					predDepRecs = predDepStore.getRange(),
					realPredDepsData = me.DependenciesParsedData.Predecessors.slice(), //shallow copy of it	
					remoteChanged = false, //if someone else updated this while it was idle on our screen	
					key;
				console.log('syncing predDeps with current userStories', predDepRecs, realPredDepsData);
				predDepStore.suspendEvents(true);
				for(var i = 0;i<predDepRecs.length;++i){
					var depRec =  predDepRecs[i], //predecessor dependency record to be updated
						depID = depRec.get('DependencyID'),
						realDep = me._removeDepFromList(depID, realPredDepsData),	
						dirtyType = me._getDirtyType(depRec, realDep),
						teamStore = me.PredDepTeamStores[depID],
						teamCont = me.PredDepContainers[depID];				
					if(dirtyType === 'New' || dirtyType === 'Edited'){}//we don't want to remove any pending changes			
					else if(dirtyType == 'Deleted'){ // the depRec was deleted by someone else, and we arent editing it
						predDepStore.remove(depRec);
						if(teamStore) me.PredDepTeamStores[depID] = undefined;
						if(teamCont) me.PredDepContainers[depID] = undefined;
					} else {
						if(!_.isEqual(depRec.get('Predecessors'), realDep.Predecessors)){ //faster to delete and readd if preds are different
							if(teamCont) {
								me.PredDepContainers[depID].destroy();
								me.PredDepContainers[depID] = undefined;
							}
							predDepStore.remove(depRec);
							predDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));
							if(teamStore) teamStore.intelUpdate(); 
						}
						else {
							depRec.beginEdit();
							for(key in realDep){
								if(key!=='Predecessors' && realDep[key]!=depRec.get(key))
									depRec.set(key, realDep[key]);
							}
							depRec.endEdit();
						}
					}				
				}
				realPredDepsData.forEach(function(realDep){ 
					//add all the new risks that other people have added since the last load
					console.log('adding predDep', realDep);
					predDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));					
					var depID = realDep.DependencyID,
						teamStore = me.PredDepTeamStores[depID];
					if(teamStore) teamStore.intelUpdate(); 
				});
				predDepStore.resumeEvents();
			}
		});
		me.CustomPredDepStore.intelUpdate();
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:80,
				resizable:false,
				editor:false,
				sortable:true,
				renderer: function(val){ return val || '-'; }		
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:3,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:false,
				sortable:true,
				renderer: function(val){ return val || '-'; }			
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:3,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:false,
				sortable:false,
				renderer: function(val){ return val || '-'; }				
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				text:'Needed By',
				editor:false,
				sortable:true,
				renderer: function(val){ return val || '-'; }
			},{
				text:'Teams Depended On',
				html:'<div class="pred-dep-header" style="width:140px !important;">Team Name</div>' +
						'<div class="pred-dep-header" style="width:65px  !important;">Supported</div>' +
						'<div class="pred-dep-header" style="width:70px  !important;">US#</div>' +
						'<div class="pred-dep-header" style="width:130px !important;">User Story</div>',
				dataIndex:'DependencyID',
				width:420,
				resizable:false,
				sortable:false,
				editor:false,
				xtype:'fastgridcolumn',
				renderer: function (depID){
					var predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
					var predecessors = predDepRecord.get('Predecessors');
					if(!me.PredDepTeamStores[depID]){
						me.PredDepTeamStores[depID] = Ext.create('Intel.data.FastStore', { 
							model:'IntelDepTeam',
							data: predecessors,
							autoSync:true,
							limit:Infinity,
							proxy: {
								type:'fastsessionproxy',
								id:'TeamDep-' + depID + '-proxy' + Math.random()
							},
							sorters:[depTeamSorter],
							intelUpdate: function(){
								var depTeamStore = me.PredDepTeamStores[depID],
									depTeamRecords = depTeamStore.getRange(),
									predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID),
									predecessors = predDepRecord.get('Predecessors').slice(0);
								depTeamStore.suspendEvents(true);
								Outer:
								for(var i = 0;i<depTeamRecords.length;++i){
									var depTeamRecord = depTeamRecords[i],
										realTeamDep, key,
										remoteChanged = false; //if someone else updated this while it was idle on our screen	
									for(var j=0; j<predecessors.length;++j){
										if(predecessors[j].TID === depTeamRecord.get('TID')){
											realTeamDep = predecessors.splice(j, 1)[0];
											for(key in realTeamDep){
												if(!_.isEqual(depTeamRecord.get(key), realTeamDep[key])){ remoteChanged = true; break; }
											}
											if(remoteChanged){
												depTeamRecord.beginEdit();
												for(key in realTeamDep)
													depTeamRecord.set(key, realTeamDep[key]);
												depTeamRecord.endEdit();
											}
											continue Outer;
										}
									}
									depTeamStore.remove(depTeamRecord);
								}
								
								predecessors.forEach(function(realTeamDep){ 
									depTeamStore.add(Ext.create('IntelDepTeam', realTeamDep));
								});	
								depTeamStore.resumeEvents();
							}
						});	
					}
					
					if(me.PredDepContainers[depID]) 
						return me.PredDepContainers[depID];
						
					var defaultHandler = { //dont let mouse events bubble up to parent grid. bad things happen
						element: 'el',
						fn: function(a){ a.stopPropagation(); }
					};
					
					var teamColumnCfgs = [
						{
							dataIndex:'PID',
							width:145,
							resizable:false,
							renderer: function(val, meta, depTeamRecord){
								var projectRecord = me.ValidProjects[val];
								if(val && projectRecord) return projectRecord.get('Name');
								else {
									meta.tdCls += 'intel-editor-cell';
									return '-';
								}
							}
						},{
							dataIndex:'Sup',
							width:50,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
								else meta.tdCls = 'intel-supported-cell';
								return val;
							}
						},{
							dataIndex:'USID',
							width:75,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.get('A')) return val;
								else return '-';
							}
						},{
							dataIndex:'USName',
							width:140,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.get('A')) return val;
								else return '-';
							}				
						}
					];
					
					return {
						xtype:'container',
						layout:'hbox',
						bodyCls: 'blend-in-grid',
						pack:'start',
						align:'stretch',
						border:false,
						items: [{
							xtype: 'rallygrid',	
							width:_.reduce(teamColumnCfgs, function(sum, i){ return sum + i.width; }, 0),
							rowLines:false,
							flex:1,
							columnCfgs: teamColumnCfgs,
							viewConfig: {
								stripeRows:false,
								getRowClass: function(teamDepRecord, index, rowParams, store){
									if(!teamDepRecord.get('PID')) return 'intel-row-35px intel-team-dep-row';
									else return 'intel-row-35px';
								}
							},
							listeners: {
								selectionchange: function(){ this.getSelectionModel().deselectAll(); }
							},
							hideHeaders:true,
							showRowActionsColumn:false,
							scroll:false,
							showPagingToolbar:false,
							enableEditing:false,
							context: me.getContext(),
							store: me.PredDepTeamStores[depID]
						}],
						listeners: {
							mousedown: defaultHandler,
							mousemove: defaultHandler,
							mouseout: defaultHandler,
							mouseover: defaultHandler,
							mouseup: defaultHandler,
							mousewheel: defaultHandler,
							scroll: defaultHandler,
							click: defaultHandler,
							dblclick: defaultHandler,
							contextmenu: defaultHandler,
							render: function(){ me.PredDepContainers[depID] = this; }
						}
					};
				}
			},{
				dataIndex:'Status',
				flex:1,
				tdCls: 'intel-editor-cell',
				text:'Disposition',					
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data: [
							{Status:'Done'},
							{Status:'Not Done'}
						]
					}),
					editable: false,
					displayField: 'Status',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				renderer: function(val, meta){
					if(val === 'Done') meta.tdCls += ' intel-supported-cell';
					else meta.tdCls += ' intel-not-supported-cell';
					return val || 'Not Done';
				},
				sortable:false
			}
		];
		
		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
      title: "Dependencies We Have on Other Teams",
			//width: _.reduce(predDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			minHeight:150,
			maxHeight:500,
			style:'margin-top:10px',
			scroll:'vertical',
			columnCfgs: predDepColumnCfgs,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(predDepRecord){ 
					var cls = 'intel-row-' + (10 + (35*predDepRecord.data.Predecessors.length || 35)) + 'px';
					return cls;
				},
				listeners: { resize: function(){ me._fireParentWindowEvent('resize'); }}
			},
			listeners: {
				afterrender: function(){ me._fireParentWindowEvent('resize'); },
				edit: function(editor, e){		
					/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
						to improve performance.**/			
					var predDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;
					
					if(value === originalValue) return; 
					me.PredDepGrid.setLoading(true);
					predDepRecord.set('Editing', true);
					var predDepData = predDepRecord.data;
					me._getOldAndNewUSRecords(predDepData).then(function(records){
						var newUSRecord = records[1];
						return 
							me._addPredDep(newUSRecord, predDepData)
							.then(function(){							
								predDepRecord.set('Editing', false);
								me.PredDepGrid.setLoading(false);
							});
					}).fail(function(reason){
						me._alert('ERROR:', reason);
						predDepRecord.set('Editing', false);
						me.PredDepGrid.setLoading(false);
					}).done();
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			store: me.CustomPredDepStore
		});	
	}	
});
