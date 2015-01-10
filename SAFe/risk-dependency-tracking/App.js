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

RALLY_MAX_STRING_SIZE = 32768;

/********************* PRODUCTION *****************/
console = { log: function(){} };	

/********************* END PRODUCTION *****************/
Ext.define('RisksDepsApp', {
	extend: 'IntelRallyApp',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'IntelWorkweek',
		'ReleaseQuery',
		'AsyncQueue'
	],
	_prefName: 'intel-risks-deps-board',
	
	layout: {
		type:'vbox',
		align:'stretch',
		pack:'start'
	},
	items:[{
		xtype:'container',
		padding:'0 10px 0 10px',
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
	}],
	minWidth:1100, //thats when rally adds a horizontal scrollbar for a pagewide app
		
	/****************************************************** DATA STORE METHODS ********************************************************/

	/** __________________________________ LOADING STUFF___________________________________	 **/		
	_loadFeatures: function(){ 
		var me=this, 
			featureStore = Ext.create('Rally.data.wsapi.Store',{
				model: 'PortfolioItem/Feature',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[me._getFeatureFilter(me.TrainRecord, me.ReleaseRecord)]
			});
		return me._reloadStore(featureStore)
			.then(function(featureStore){ 
				var promises = [],
					featureRecords = featureStore.data.items;
				console.log('features loaded:', featureRecords);
				me.FeatureStore = featureStore; 
				me.FeatureProductHash = {};
				featureRecords.forEach(function(fr){
					var deferred = Q.defer(), frData = fr.data;
					if(frData.Parent){
						me._loadMilestone(frData.Parent.ObjectID).then(function(milestoneRecord){
							var p = milestoneRecord.data.Parent;
							me.FeatureProductHash[frData.ObjectID] = ((p && p.Name ) ? p.Name : '');
						})
						.then(deferred.resolve)
						.fail(function(reason){
							me._alert('Error', reason);
						})
						.done();
					}
					else {
						me.FeatureProductHash[frData.ObjectID] = '';
						deferred.resolve();
					}
					promises.push(deferred.promise);
				});
				return Q.all(promises);
			});
	},	
	_loadUserStoryFilterForUSWithFeature: function(trainRecord, releaseRecord){
		var me=this,
			trainName = trainRecord.data.Name.split(' ART')[0];
		return Ext.create('Rally.data.wsapi.Filter', {
			property:'c_Dependencies',
			operator: '!=',
			value: ''
		}).and(
			Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.Name',
				value: me.ReleaseRecord.data.Name
			}).or(Ext.create('Rally.data.wsapi.Filter', { 
				property:'Feature.Release.Name',
				value: me.ReleaseRecord.data.Name
			}))
		).and(
			Ext.create('Rally.data.wsapi.Filter', {
				property:'Feature.Project.Name',
				value: trainName + ' POWG Portfolios'
			}).or(Ext.create('Rally.data.wsapi.Filter', {
				property:'Feature.Project.Parent.Name',
				value: trainName + ' POWG Portfolios'
			}))
		);
	},
	_loadUserStoryFilterForUSWithoutFeature: function(releaseRecord){
		var me=this;	
		return Ext.create('Rally.data.wsapi.Filter', { 
			property:'c_Dependencies',
			operator: '!=',
			value: ''
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'Release.Name',
			value: me.ReleaseRecord.data.Name
		})).and(Ext.create('Rally.data.wsapi.Filter', { 
			property:'Feature.Name',
			value:null
		}));
	},	
	_loadUserStories: function(){	
	/** need 2 stankin QUERIES to get all 3 classes of UserStories (Sierra and Q115 used for example): 
			1) US in project outside Sierra Train in Q115 and attached to Feature in Sierra Portfolio
			2) US in project in Sierra Train in Q115 and not attached to any Feature
			3) US in project in Sierra Train in Q115 contributing to Feature in Sierra Portfolio  **/
		var me=this, 
			userStoryStoreForUSWithFeature = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
					'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
				context:{ 
					workspace: me.getContext().getWorkspace()._ref, 
					project: null 
				},
				filters:[me._loadUserStoryFilterForUSWithFeature(me.TrainRecord, me.ReleaseRecord)]
			}),
			userStoryStoreForUSWithoutFeature = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
					'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
				context:{ 
					project: me.TrainRecord.data._ref,
					projectScopeDown:true,
					projectScopeUp:false
				},
				filters:[me._loadUserStoryFilterForUSWithoutFeature(me.ReleaseRecord)]
			});
		return Q.all([
				me._reloadStore(userStoryStoreForUSWithFeature),
				me._reloadStore(userStoryStoreForUSWithoutFeature)
			])
			.then(function(userStoryStores){
				me.UserStoryStore = Ext.create('Rally.data.wsapi.Store',{
					model: 'HierarchicalRequirement',
					data: userStoryStores[0].getRange().concat(userStoryStores[1].getRange())
				});
				console.log('userStories loaded:', me.UserStoryStore.data.items);
			});
	},
	
	/**___________________________________ RISKS STUFF___________________________________**/
	_getRisks: function(featureRecord){
		var risks = featureRecord.data.c_Risks;
		try{ risks = JSON.parse(atob(risks)) || {}; } 
		catch(e) { risks = {}; }
		return risks;
	},	
	_parseRisksFromFeature: function(featureRecord){
		var array = [],
			risks = this._getRisks(featureRecord),
			ObjectID = featureRecord.data.ObjectID,
			Product = this.FeatureProductHash[featureRecord.data.ObjectID] || null,
			FormattedID = featureRecord.data.FormattedID,
			FeatureName = featureRecord.data.Name;
		for(var projectID in risks){
			var project = this.ValidProjects[projectID], projectName;
			if(!project) continue;
			else projectName = project.data.Name;
			if(risks[projectID]){
				for(var riskID in risks[projectID]){
					var risk = risks[projectID][riskID];
					array.push({
						RiskID: riskID,
						ProjectName: projectName,
						ProjectID: projectID,
						Product: Product,
						ObjectID: ObjectID,
						FormattedID: FormattedID,
						FeatureName: FeatureName,
						Description: risk.Desc,
						Impact: risk.Imp,
						MitigationPlan: risk.Mit,
						Urgency: risk.Urg || 'Undefined',
						Status: risk.Sta,
						Contact: risk.Cont,
						Checkpoint: risk.CP,
						Edited: false //not in pending edit mode
					});
				}
			}
		}
		return array;
	},	
	_parseRisksData: function(){ 
		var me=this, 
			array = [],
			records = me.FeatureStore.data.items,
			relUSs = [], 
			i, len;
		for(i=0,len=records.length; i<len;++i)
			array = array.concat(me._parseRisksFromFeature(records[i]));
		me.RisksParsedData = array;
	},		
	_spliceRiskFromList: function(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
		for(var i = 0; i<riskList.length; ++i){
			if(riskList[i].RiskID == riskID) {
				return riskList.splice(i, 1)[0];
			}
		}
	},	
	_addRisk: function(featureRecord, riskData){
		var risks = this._getRisks(featureRecord),
			projectID = riskData.ProjectID,
			deferred = Q.defer();

		riskData = Ext.clone(riskData);
		riskData.Edited = false;
		
		if(!risks[projectID]) risks[projectID] = {};
		var copy = {
			CP: riskData.Checkpoint,
			Cont: riskData.Contact,
			Desc:riskData.Description,
			Imp: riskData.Impact,
			Mit: riskData.MitigationPlan,
			Urg: riskData.Urgency,
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
		if(str.length >= RALLY_MAX_STRING_SIZE)
			deferred.reject('Risks field for ' + featureRecord.data.FormattedID + ' ran out of space! Cannot save');
		else {
			featureRecord.set('c_Risks', str);
			featureRecord.save({
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.data.FormattedID);
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
		var me=this;
		return (usr.data.Release && usr.data.Release.Name === me.ReleaseRecord.data.Name) || 
			(usr.data.Feature && usr.data.Feature.Release && usr.data.Feature.Release.Name === me.ReleaseRecord.data.Name);
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
		var me = this,
			deps = me._getDependencies(userStoryRecord),
			project = me.ValidProjects[userStoryRecord.data.Project.ObjectID],
			predDepsList = [];
		if(project){
			var projectData = project.data,
				preds = deps.Preds,
				startDate =	new Date(me.ReleaseRecord.data.ReleaseStartDate),
				endDate =	new Date(me.ReleaseRecord.data.ReleaseDate),
				ObjectID = userStoryRecord.data.ObjectID,
				Product = (userStoryRecord.data.Feature ? me.FeatureProductHash[userStoryRecord.data.Feature.ObjectID] : null),
				FormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name;
				
			if(me._isInRelease(userStoryRecord)){
				for(var predDepID in preds){
					var predDep = preds[predDepID];
					predDepsList.push({
						DependencyID: predDepID,
						ProjectName:projectData.Name,
						ProjectID: projectData.ObjectID,
						Product: Product,
						ObjectID: ObjectID,
						FormattedID: FormattedID,
						UserStoryName: UserStoryName,
						Description: predDep.Desc,
						Checkpoint: predDep.CP,
						Status: predDep.Sta || 'Not Done',
						Predecessors: predDep.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
						Edited: false //not in pending edit mode
					});
				}
			}
		}
		return {Predecessors:predDepsList};
	},	
	_parseDependenciesData: function(){	
		var me=this, 
			predDepsList = [], 
			records = me.UserStoryStore.data.items,
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
	_spliceDepFromList: function(dependencyID, dependencyList){ 
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
		if(str.length >= RALLY_MAX_STRING_SIZE) 
			deferred.reject('Dependencies field for ' + userStoryRecord.data.FormattedID + ' ran out of space! Cannot save');
		else {
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify User Story ' + userStoryRecord.data.FormattedID);
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
			me._loadUserStory(tmpNewUSData.ObjectID).then(function(usRecord){
				newUSRecord = usRecord; 
				loadOriginalParent();
			});
		} else loadOriginalParent();

		function loadOriginalParent(){
			me._loadUserStory(depData.ObjectID).then(function(oldUSRecord){
				newUSRecord = newUSRecord || oldUSRecord; //if depRecord is new...has no ObjectID
				deferred.resolve([oldUSRecord, newUSRecord]);
			});
		}
		return deferred.promise;
	},
	
	/************************************************** Preferences FUNCTIONS ***************************************************/	
	_loadPreferences: function(){ //parse all settings too
		var me=this,
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
      filterByName:me._prefName+ uid,
			success: function(prefs) {
				var appPrefs = prefs[me._prefName + uid];
				try{ appPrefs = JSON.parse(appPrefs); }
				catch(e){ appPrefs = { projs:{}};}
				console.log('loaded prefs', appPrefs);
				deferred.resolve(appPrefs);
			}
		});
		return deferred.promise;
	},
	_savePreferences: function(prefs){ // stringify and save only the updated settings
		var me=this, s = {}, 
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		prefs = {projs: prefs.projs, refresh:prefs.refresh};
    s[me._prefName + uid] = JSON.stringify(prefs); //release: objectID, refresh: (off, 10, 15, 30, 60, 120)
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: me.getAppId(),
			settings: s,
			success: deferred.resolve,
			failure: deferred.reject
		});
		return deferred.promise;
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
	_showGrids: function(){
		var me=this;
		me._loadRisksGrid();
		me._loadDependenciesGrids();
	},	
	_updateGrids: function(){
		var me=this;
		me._parseRisksData();
		me._parseDependenciesData();
	},
	_reloadStores: function(){
		var me = this, promises = [];
		if(me.FeatureStore) promises.push(me._reloadStore(me.FeatureStore));
		else promises.push(me._loadFeatures());
		if(me.UserStoryStore) promises.push(me._reloadStore(me.UserStoryStore));
		else promises.push(me._loadUserStories());
		return Q.all(promises);
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
			me._loadManualRefreshButton();
		}
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
					me._alert('Error', reason);
					unlockFunc();
				})
				.done();
		});
	},

	/******************************************************* LAUNCH ********************************************************/
	launch: function(){
		var me=this;
		me.setLoading(true);
		me._initDisableResizeHandle();
		me._initFixRallyDashboard();
		if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
			me.setLoading(false);
			me._alert('Error', 'You do not have permissions to edit this project');
		} 
		else {
			me._loadModels()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return me._loadRootProject(scopeProjectRecord);
				})
				.then(function(rootProject){
					me.RootProject = rootProject;
					return me._loadValidProjects(rootProject);
				})
				.then(function(validProjects){
					me.ValidProjects = validProjects;
					return me._loadPreferences();
				})
				.then(function(appPrefs){
					me.AppPrefs = appPrefs;
					return me._projectInWhichTrain(me.ProjectRecord);
				})
				.then(function(trainRecord){
					if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID){
						me.TrainRecord = trainRecord;
						me.ProjectRecord = trainRecord;
						console.log('train loaded:', trainRecord);
					var threeWeeksAgo = new Date()*1 - 3*7*24*60*60*1000;
					return me._loadReleasesAfterGivenDate(me.ProjectRecord, threeWeeksAgo);
					} 
					else return Q.reject('You are not scoped to a train.');
				})
				.then(function(releaseStore){
					me.ReleaseStore = releaseStore;
					var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppPrefs);
					if(currentRelease){
						me.ReleaseRecord = currentRelease;				
						me._workweekData = me._getWorkWeeksForDropdown(currentRelease.data.ReleaseStartDate, currentRelease.data.ReleaseDate);
						console.log('release loaded', currentRelease);
						me._reloadEverything();
					}
					else return Q.reject('This train has no releases.');
				})
				.fail(function(reason){
					me.setLoading(false);
					me._alert('Error', reason || '');
				})
				.done();
		}
	},

	/******************************************************* RENDER TOP BAR ITEMS********************************************************/		
	_releasePickerSelected: function(combo, records){
		var me=this, pid = me.ProjectRecord.data.ObjectID;
		if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
		me.setLoading(true);
		me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);	
		me._workweekData = me._getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);		
		if(typeof me.AppPrefs.projs[pid] !== 'object') me.AppPrefs.projs[pid] = {};
		me.AppPrefs.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
		me._savePreferences(me.AppPrefs)
			.then(function(){ me._reloadEverything(); })
			.fail(function(reason){
				me._alert('Error', reason || '');
				me.setLoading(false);
			})
			.done();
	},				
	_loadReleasePicker: function(){
		var me=this;
		me.ReleasePicker = me.down('#navbox_left').add({
			xtype:'intelreleasepicker',
			padding:'0 10px 0 0',
			releases: me.ReleaseStore.data.items,
			currentRelease: me.ReleaseRecord,
			listeners: {
				change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
				select: me._releasePickerSelected.bind(me)
			}
		});
	},		
	_loadManualRefreshButton: function(){
		var me=this;
		me.down('#navbox_right').add({
			xtype:'button',
			text:'Refresh Page',
			width:100,
			listeners:{
				click: function(){ me._reloadEverything(); }
			}
		});
	},
	
	/******************************************************* RENDER GRIDS ********************************************************/	
	_loadRisksGrid: function(){
		var me = this;

		/****************************** RISKS STUFF  ***********************************************/	
		function riskSorter(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; } //new come first
		
		me.CustomRisksStore = Ext.create('Intel.data.FastStore', { 
			data: Ext.clone(me.RisksParsedData),
			autoSync:true,
			model:'IntelRiskWithProject',
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id:'RiskProxy' + Math.random()
			},
			sorters: [riskSorter]
		});
		
		var defaultRenderer = function(val){ return val || '-'; };	

		var filterFID = null, 
			filterName = null,
			filterProduct = null, 
			filterTeam = null,
			filterStatus = null,
			filterUrgency = null,
			filterCP = null;
		function riskGridFilter(r){
			if(filterFID && r.data.FormattedID != filterFID) return false;
			if(filterName && r.data.FeatureName != filterName) return false;
			if(filterProduct &&  r.data.Product != filterProduct) return false;
			if(filterTeam && r.data.ProjectName != filterTeam) return false;
			if(filterStatus && r.data.Status != filterStatus) return false;
			if(filterUrgency){
				if(filterUrgency == 'Undefined' && r.data.Urgency && r.data.Urgency != filterUrgency) return false;
				if(filterUrgency != 'Undefined' && r.data.Urgency != filterUrgency) return false;
			}
			//used bad workweek algorithm at first, must round down.
			if(filterCP && me._roundDateDownToWeekStart(r.data.Checkpoint)*1 != filterCP) return false;
			return true;
		}		
		function filterRisksRowsByFn(fn){
			_.each(me.CustomRisksStore.getRange(), function(item, index){
				if(fn(item)) me.RisksGrid.view.removeRowCls(index, 'hidden');
				else me.RisksGrid.view.addRowCls(index, 'hidden');
			});
		}
		function removeFilters(){
			filterFID = null;
			filterName = null;
			filterProduct = null;
			filterTeam = null;
			filterStatus = null;
			filterUrgency = null;
			filterCP = null; 
			filterRisksRowsByFn(function(){ return true; });
			Ext.getCmp('risk-f-fid').setValue('All');
			Ext.getCmp('risk-f-name').setValue('All');
			Ext.getCmp('risk-f-product').setValue('All');
			Ext.getCmp('risk-f-team').setValue('All');
			Ext.getCmp('risk-f-status').setValue('All');
			Ext.getCmp('risk-f-urgency').setValue('All');
			Ext.getCmp('risk-f-cp').setValue('All');
		}
		
		function getFIDfilterOptions(){
			return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
				function(r){ return r.data.FormattedID; })), 
				function(f){ return f; }), 
				function(f){ return {FormattedID:f}; }));
		}
		function getNameFilterOptions(){
			return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
				function(r){ return r.data.FeatureName; })), 
				function(f){ return f; }), 
				function(n){ return {Name:n}; }));
		}
		function getProductFilterOptions(){
			return [{Product:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.FeatureProductHash)), 
				function(p){ return p; }), 
				function(p){ return {Product:p}; }));
		}
		function getTeamFilterOptions(){
			return [{Team: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
				function(r){ return r.data.ProjectName; })), 
				function(t){ return t; }), 
				function(t){ return {Team: t}; }));
		}
		function getCPFilterOptions(){
			return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(),
				function(risk){ return me._roundDateDownToWeekStart(risk.data.Checkpoint)*1; })),
				function(date){ return date; }),
				function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
		}
		function updateFilterOptions(){
			var cpStore = Ext.getCmp('risk-f-cp').getStore();
			cpStore.removeAll();
			cpStore.add(getCPFilterOptions());
		}
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				width:80,
				editor:false,	
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(FID){ 
					var feature = me.FeatureStore.findExactRecord('FormattedID', FID);
					if(feature.data.Project) {
						var pid = feature.data.Project._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/portfolioitem/feature/' + 
								feature.data.ObjectID + '" target="_blank">' + FID + '</a>';
					}
					else return FID;
				},
				layout:'hbox',
				items:[{	
					id:'risk-f-fid',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['FormattedID'],
						data: getFIDfilterOptions()
					}),
					displayField: 'FormattedID',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.FormattedID == 'All') filterFID = null; 
							else filterFID = selected[0].data.FormattedID;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				flex:1,
				minWidth:100,
				editor:false,	
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:defaultRenderer,
				layout:'hbox',
				items:[{	
					id:'risk-f-name',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Name'],
						data: getNameFilterOptions()
					}),
					displayField: 'Name',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Name == 'All') filterName = null; 
							else filterName = selected[0].data.Name;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Product', 
				dataIndex:'Product',
				width:90,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'risk-f-product',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Product'],
						data: getProductFilterOptions()
					}),
					displayField: 'Product',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Product == 'All') filterProduct = null; 
							else filterProduct = selected[0].data.Product;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Team', 
				dataIndex:'ProjectName',
				flex:1,
				minWidth:100,
				editor:false,	
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:defaultRenderer,
				layout:'hbox',
				items:[{	
					id:'risk-f-team',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Team'],
						data: getTeamFilterOptions()
					}),
					displayField: 'Team',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Team == 'All') filterTeam = null; 
							else filterTeam = selected[0].data.Team;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Risk Description(If This...)', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				flex:1,
				minWidth:80,
				editor: 'inteltextarea',
				resizable:false,
				draggable:false,
				sortable:false,
				renderer:defaultRenderer
			},{
				text:'Impact(Then This...)', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				minWidth:80,
				resizable:false,
				draggable:false,
				sortable:false,
				editor: 'inteltextarea',
				renderer:defaultRenderer
			},{
				text:'Mitigation Plan', 
				dataIndex:'MitigationPlan',
				tdCls: 'intel-editor-cell',	
				flex:1,
				minWidth:80,
				resizable:false,
				draggable:false,
				sortable:false,
				editor: 'inteltextarea',
				renderer:defaultRenderer
			},{
				text:'Urgency',
				dataIndex:'Urgency',
				tdCls: 'intel-editor-cell',
				width:90,			
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Urgency'],
						data:[
							{Urgency:'Undefined'},
							{Urgency:'Hot'},
							{Urgency:'Watch'},
							{Urgency:'Simmer'}
						]
					}),
					displayField:'Urgency'
				},
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(val, meta){
					meta.tdCls += (val==='Hot' ? ' red-cell' : '');
					return val || 'Undefined';
				},	
				layout:'hbox',
				items: [{	
					id:'risk-f-urgency',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Urgency'],
						data: [
							{Urgency: 'All'},
							{Urgency:'Undefined'},
							{Urgency:'Hot'},
							{Urgency:'Watch'},
							{Urgency:'Simmer'}
						]
					}),
					displayField: 'Urgency',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Urgency == 'All') filterUrgency = null; 
							else filterUrgency = selected[0].data.Urgency;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Status',
				dataIndex:'Status',
				tdCls: 'intel-editor-cell',	
				width:90,			
				tooltip:'(ROAM)',
				tooltipType:'title',	
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{Status:'Undefined'},
							{Status:'Resolved'},
							{Status:'Owned'},
							{Status:'Accepted'},
							{Status:'Mitigated'}
						]
					}),
					displayField:'Status'
				},
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(val, meta){
					meta.tdCls += (val==='Undefined' ? ' red-cell' : '');
					return val || '-';
				},	
				layout:'hbox',
				items: [{	
					id:'risk-f-status',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Status'],
						data: [
							{Status: 'All'},
							{Status:'Undefined'},
							{Status:'Resolved'},
							{Status:'Owned'},
							{Status:'Accepted'},
							{Status:'Mitigated'}
						]
					}),
					displayField: 'Status',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Status == 'All') filterStatus = null; 
							else filterStatus = selected[0].data.Status;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]	
			},{
				text:'Contact', 
				dataIndex:'Contact',
				tdCls: 'intel-editor-cell',	
				flex:1,
				minWidth:80,
				editor: 'inteltextarea',
				sortable:false,
				resizable:false,
				draggable:false,
				renderer:defaultRenderer	
			},{
				text:'Checkpoint',	
				dataIndex:'Checkpoint',
				tdCls: 'intel-editor-cell',	
				width:80,
				resizable:false,
				draggable:false,				
				editor:{
					xtype:'intelfixedcombo',
					width:80,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: me._workweekData
					}),
					displayField: 'Workweek',
					valueField: 'DateVal'
				},
				sortable:true,
				renderer:function(val){ return val ? 'ww' + me._getWorkweek(val) : '-'; },	
				layout:'hbox',
				items: [{	
					id:'risk-f-cp',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: getCPFilterOptions()
					}),
					displayField: 'Workweek',
					valueField: 'DateVal',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.DateVal === 0) filterCP = null; 
							else filterCP = selected[0].data.DateVal;
							filterRisksRowsByFn(riskGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				draggable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0)),
						dirtyType = me._getDirtyType(riskRecord, realRiskData);
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
									var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0));
									riskRecord.beginEdit();
									for(var key in realRiskData) riskRecord.set(key, realRiskData[key]);	
									riskRecord.endEdit();
									updateFilterOptions();
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
				draggable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._spliceRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0)),
						dirtyType = me._getDirtyType(riskRecord, realRiskData);
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
									if(!riskRecord.data.Checkpoint){
										me._alert('Error', 'You must set the Checkpoint for this risk'); return; }
									else if(!riskRecord.data.Description){
										me._alert('Error', 'You must set the Description for this risk'); return; }
									else if(!riskRecord.data.Impact){
										me._alert('Error', 'You must set the Impact for this risk'); return; }
									if(!riskRecord.data.Urgency){
										me._alert('Error', 'You must set the Urgency for this risk'); return; }
									else if(!riskRecord.data.Status){
										me._alert('Error', 'You must set the Status for this risk'); return; }
									else if(!riskRecord.data.Contact){
										me._alert('Error', 'You must set the Contact for this risk'); return; }
									me.RisksGrid.setLoading(true);
									me._enqueue(function(unlockFunc){
										var riskRecordData = riskRecord.data,
											tmpNewFeatureRecord = me.FeatureStore.findExactRecord('FormattedID', riskRecordData.FormattedID),
											newFeatureRecord;
										Q((tmpNewFeatureRecord.data.ObjectID != riskRecord.data.ObjectID) ?
											me._loadFeature(tmpNewFeatureRecord.data.ObjectID).then(function(featureRecord){
												newFeatureRecord = featureRecord; 
											}) :
											undefined
										)
										.then(function(){
											return me._loadFeature(riskRecord.data.ObjectID).then(function(oldFeatureRecord){							
												newFeatureRecord = newFeatureRecord || oldFeatureRecord; //if new is same as old
												return Q(oldFeatureRecord && 
													(function(){										
														var oldRealRisksData = me._parseRisksFromFeature(oldFeatureRecord),
															oldRealRiskData = me._spliceRiskFromList(riskRecordData.RiskID, oldRealRisksData);							
														if(oldRealRiskData && (oldFeatureRecord.data.ObjectID !== newFeatureRecord.data.ObjectID))
															return me._removeRisk(oldFeatureRecord, oldRealRiskData);
													}())
												)
												.then(function(){
													return me._addRisk(newFeatureRecord, riskRecordData);
												})
												.then(function(){
													riskRecord.beginEdit();
													riskRecord.set('Edited', false);
													riskRecord.set('ObjectID', newFeatureRecord.data.ObjectID);
													riskRecord.endEdit();
												});
											});
										})
										.fail(function(reason){ me._alert('ERROR:', reason); })
										.then(function(){
											me.RisksGrid.setLoading(false);
											updateFilterOptions();
											unlockFunc();
										})
										.done();
									});
								}
							}
						}
					};
				}
			}
		];

		me.RisksGrid = me.add({
			xtype: 'rallygrid',
			header: {
				layout: 'hbox',
				items: [{
					xtype:'text',
					cls:'grid-header-text',
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
						text:'Remove Filters',
						width:110,
						listeners:{ click: removeFilters }
					}]
				}]
			},
			height:400,
			margin:'0 10 0 10',
			scroll:'vertical',
			columnCfgs: columnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(item){ return 'intel-row-35px' + (riskGridFilter(item) ? '' : ' hidden'); }
			},
			listeners: {
				sortchange: function(){ filterRisksRowsByFn(riskGridFilter); },
				edit: function(editor, e){			
					/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
						to improve performance.**/
					var grid = e.grid,
						risksRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;
					if(value === originalValue) return; 
					else if(!value && field != 'MitigationPlan') { risksRecord.set(field, originalValue); return; }
					else if(['Description', 'Impact', 'Contact', 'MitigationPlan'].indexOf(field)>-1) {
						value = me._htmlEscape(value);			
						risksRecord.set(field, value);
					}

					var previousEdit = risksRecord.data.Edited;
					risksRecord.set('Edited', true);
					
					updateFilterOptions();
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			store: me.CustomRisksStore
		});	
	},	
	_loadDependenciesGrids: function(){
		var me = this;

		/****************************** PREDECESSORS STUFF           ***********************************************/				
		me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
		me.PredDepContainers = {};
		
		function depSorter(o1, o2){ return o1.data.DependencyID > o2.data.DependencyID ? -1 : 1; } //new come first
		function depTeamSorter(o1, o2){ return o1.data.TID > o2.data.TID ? -1 : 1; } //new come first

		me.CustomPredDepStore = Ext.create('Intel.data.FastStore', { 
			data: Ext.clone(me.DependenciesParsedData.Predecessors),
			autoSync:true,
			model:'IntelPredDepWithProject',
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id:'PredDepProxy' + Math.random()
			},
			sorters:[depSorter]
		});
		
		var defaultRenderer = function(val){ return val || '-'; };	

		var filterFID = null, 
			filterName = null, 
			filterProduct = null, 
			filterOwningTeam = null,
			filterNeededBy = null, 
			filterDisposition=null;
		function dependencyGridFilter(r){
			if(filterFID && r.data.FormattedID != filterFID) return false;
			if(filterName && r.data.UserStoryName != filterName) return false;
			if(filterOwningTeam && r.data.ProjectName != filterOwningTeam) return false;
			if(filterProduct &&  r.data.Product != filterProduct) return false;
			if(filterNeededBy && me._roundDateDownToWeekStart(r.data.Checkpoint)*1 != filterNeededBy) return false;
			if(filterDisposition && r.data.Status != filterDisposition) return false;
			return true;
		}
		function filterPredecessorRowsByFn(fn){
			_.each(me.CustomPredDepStore.getRange(), function(item, index){
				if(fn(item)) me.PredDepGrid.view.removeRowCls(index, 'hidden');
				else me.PredDepGrid.view.addRowCls(index, 'hidden');
			});
		}
		function removeFilters(){
			filterFID = null; 
			filterName = null; 
			filterOwningTeam = null; 
			filterProduct = null; 
			filterNeededBy = null; 
			filterDisposition = null;
			filterPredecessorRowsByFn(function(){ return true; });
			Ext.getCmp('dep-f-fid').setValue('All');
			Ext.getCmp('dep-f-name').setValue('All');
			Ext.getCmp('dep-f-own-team').setValue('All');
			Ext.getCmp('dep-f-product').setValue('All');
			Ext.getCmp('dep-f-needed-by').setValue('All');
			Ext.getCmp('dep-f-status').setValue('All'); //disposition
		}
		
		function getFIDfilterOptions(){
			return [{FormattedID: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(), 
				function(r){ return r.data.FormattedID; })), 
				function(f){ return f; }), 
				function(f){ return {FormattedID:f}; }));
		}
		function getNameFilterOptions(){
			return [{Name: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(), 
				function(r){ return r.data.UserStoryName; })), 
				function(f){ return f; }), 
				function(n){ return {Name:n}; }));
		}
		function getProductFilterOptions(){
			return [{Product:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.FeatureProductHash)), 
				function(f){ return f; }), 
				function(productName){ return {Product:productName}; }));
		}
		function getTeamFilterOptions(){
			return [{Team: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(), 
				function(p){ return p.data.ProjectName; })), 
				function(f){ return f; }), 
				function(t){ return {Team:t}; }));
		}
		function getNeededByFilterOptions(){
			return [{DateVal:0, Workweek:'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomPredDepStore.getRange(),
				function(risk){ return me._roundDateDownToWeekStart(risk.data.Checkpoint)*1; })),
				function(date){ return date; }),
				function(date){ return {DateVal:date, Workweek:'ww' + me._getWorkweek(date)}; }));
		}
		function updateFilterOptions(){
			//nothing is editable that has variable options in the header combobox (e.g. neededBy or US#)
		}
		
		var predDepColumnCfgs = [ //1030 min pixels wide
			{
				text:'US#', 
				dataIndex:'FormattedID',
				width:90,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer:function(USID){ 
					var userStory = me.UserStoryStore.findExactRecord('FormattedID', USID);
					if(userStory.data.Project) {
						var pid = userStory.data.Project._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/userstory/' + 
								userStory.data.ObjectID + '" target="_blank">' + USID + '</a>';
					}
					else return USID;
				},
				layout:'hbox',
				items:[{
					id:'dep-f-fid',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['FormattedID'],
						data: getFIDfilterOptions()
					}),
					displayField: 'FormattedID',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.FormattedID == 'All') filterFID = null; 
							else filterFID = selected[0].data.FormattedID;
							filterPredecessorRowsByFn(dependencyGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:3,
				minWidth:100,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'dep-f-name',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Name'],
						data: getNameFilterOptions()
					}),
					displayField: 'Name',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Name == 'All') filterName = null; 
							else filterName = selected[0].data.Name;
							filterPredecessorRowsByFn(dependencyGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Product', 
				dataIndex:'Product',
				width:90,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'dep-f-product',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Product'],
						data: getProductFilterOptions()
					}),
					displayField: 'Product',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Product == 'All') filterProduct = null; 
							else filterProduct = selected[0].data.Product;
							filterPredecessorRowsByFn(dependencyGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Owning Team', 
				dataIndex:'ProjectName',
				flex:2,
				minWidth:100,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:true,
				renderer: defaultRenderer,
				layout:'hbox',
				items:[{
					id:'dep-f-own-team',
					xtype:'intelcombobox',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Team'],
						data: getTeamFilterOptions()
					}),
					displayField: 'Team',
					value:'All',
					listeners:{
						select: function(combo, selected){
							if(selected[0].data.Team == 'All') filterOwningTeam = null; 
							else filterOwningTeam = selected[0].data.Team;
							filterPredecessorRowsByFn(dependencyGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:3,
				minWidth:100,
				resizable:false,
				draggable:false,
				editor:false,
				sortable:false,
				renderer: defaultRenderer			
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				draggable:false,
				text:'Needed By',
				editor:false,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');},
				layout:'hbox',
				items:[{
					id:'dep-f-needed-by',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						model:'WorkweekDropdown',
						data: getNeededByFilterOptions()
					}),
					displayField: 'Workweek',
					valueField: 'DateVal',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.DateVal === 0) filterNeededBy = null; 
							else filterNeededBy = selected[0].data.DateVal;
							filterPredecessorRowsByFn(dependencyGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Teams Depended On',
				html:'<div class="pred-dep-header" style="width:110px !important;">Team Name</div>' +
						'<div class="pred-dep-header" style="width:95px  !important;">Supported</div>' +
						'<div class="pred-dep-header" style="width:70px  !important;">US#</div>' +
						'<div class="pred-dep-header" style="width:130px !important;">User Story</div>',
				dataIndex:'DependencyID',
				width:420,
				resizable:false,
				draggable:false,
				sortable:false,
				editor:false,
				xtype:'fastgridcolumn',
				renderer: function (depID){
					var predDepStore = me.CustomPredDepStore,
						predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
						predecessors = predDepRecord.data.Predecessors;
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
							sorters:[depTeamSorter]
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
							width:115,
							resizable:false,
							renderer: function(val, meta, depTeamRecord){
								var projectRecord = me.ValidProjects[val];
								if(val && projectRecord) return projectRecord.data.Name;
								else return '-';
							}
						},{
							dataIndex:'Sup',
							width:80,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
								if(val == 'Yes') meta.tdCls = 'intel-supported-cell';
								return val;
							}
						},{
							dataIndex:'USID',
							width:75,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.data.A) return val;
								else return '-';
							}
						},{
							dataIndex:'USName',
							width:140,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.data.A) return val;
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
							width:410,
							rowLines:false,
							columnCfgs: teamColumnCfgs,
							viewConfig: {
								stripeRows:false,
								getRowClass: function(teamDepRecord, index, rowParams, store){
									// if(!teamDepRecord.data.PID) return 'intel-row-35px intel-team-dep-row';
									// else return 'intel-row-35px';
								}
							},
							disableSelection: true,
							hideHeaders:true,
							showRowActionsColumn:false,
							scroll:false,
							showPagingToolbar:false,
							enableEditing:false,
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
							render: function(){ me.PredDepContainers[depID] = this; },
							resize: function(){ me.PredDepGrid.view.updateLayout(); }
						}
					};
				}
			},{
				dataIndex:'Status',
				width:90,
				resizable:false,
				draggable:false,
				sortable:false,
				tdCls: 'intel-editor-cell',
				text:'Disposition',					
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data: [
							{Status:'Done'},
							{Status:'Not Done'}
						]
					}),
					displayField: 'Status'
				},
				renderer: function(val, meta){
					if(val === 'Done') meta.tdCls += ' intel-supported-cell';
					else meta.tdCls += ' intel-not-supported-cell';
					return val || 'Not Done';
				},
				layout:'hbox',
				items:[{
					id:'dep-f-status',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['Status'],
						data: [
							{Status:'All'},
							{Status:'Done'},
							{Status:'Not Done'}
						]
					}),
					displayField: 'Status',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.Status === 'All') filterDisposition = null; 
							else filterDisposition = selected[0].data.Status;
							filterPredecessorRowsByFn(dependencyGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			}
		];

		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
      header: {
				layout: 'hbox',
				items: [{
					xtype:'text',
					cls:'grid-header-text',
					width:200,
					text:"DEPENDENCIES"
				},{
					xtype:'container',
					flex:1000,
					layout:{
						type:'hbox',
						pack:'end'
					},
					items:[{
						xtype:'button',
						text:'Remove Filters',
						width:110,
						listeners:{ click: removeFilters }
					}]
				}]
			},
			height:450,
			margin:'10 10 0 10',
			scroll:'vertical',
			columnCfgs: predDepColumnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(depRecord){ if(!dependencyGridFilter(depRecord)) return 'hidden'; }
			},
			listeners: {
				sortchange: function(){ filterPredecessorRowsByFn(predDepGridFilter); },
				edit: function(editor, e){		
					/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
						to improve performance.**/			
					var predDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue,
						predDepData = predDepRecord.data;			
					if(value === originalValue) return; 
					else if(!value) { predDepRecord.set(field, originalValue); return; }
					
					me.PredDepGrid.setLoading(true);
					me._enqueue(function(unlockFunc){
						me._getOldAndNewUSRecords(predDepData).then(function(records){
							var newUSRecord = records[1]; //ignore oldUSRecord because it won't change here
							return me._addPredDep(newUSRecord, predDepData);
						})
						.fail(function(reason){
							me._alert('ERROR:', reason);
						})
						.then(function(){
							me.PredDepGrid.setLoading(false);
							updateFilterOptions();
							unlockFunc();
						})
						.done();
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			store: me.CustomPredDepStore
		});
	}	
});
