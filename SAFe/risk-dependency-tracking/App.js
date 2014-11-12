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
	minWidth:910, //thats when rally adds a horizontal scrollbar for a pagewide app
		
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
							me._alert('ERROR', reason);
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
	
	_loadUserStoryFilter: function(trainRecord, releaseRecord){
		var trainName = trainRecord.data.Name.split(' ART')[0],
			coreFilter = Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
				property:'Feature.Release.Name',
				value: releaseRecord.data.Name
			}).and(Ext.create('Rally.data.wsapi.Filter', {
				property:'c_Dependencies',
				operator: '!=',
				value: ''
			})),
			featureParentFilter = Ext.create('Rally.data.wsapi.Filter', {
				property:'Feature.Project.Name',
				value: trainName + ' POWG Portfolios'
			}).or(Ext.create('Rally.data.wsapi.Filter', {
				property:'Feature.Project.Parent.Name',
				value: trainName + ' POWG Portfolios'
			}));
		return coreFilter.and(featureParentFilter);
	},
	
	_loadUserStories: function(){	
		var me=this, 
			userStoryStore = Ext.create('Rally.data.wsapi.Store',{
				model: 'HierarchicalRequirement',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
					'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[me._loadUserStoryFilter(me.TrainRecord, me.ReleaseRecord)]
			});
		return me._reloadStore(userStoryStore)
			.then(function(userStoryStore){ 
				console.log('userStories loaded:', userStoryStore.data.items);
				me.UserStoryStore = userStoryStore; 
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
						ProjectName: projectName,
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
		
	_removeRiskFromList: function(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
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
			project = this.ValidProjects[userStoryRecord.data.Project.ObjectID],
			predDepsList = [];
		if(project){
			var projectData = project.data,
				preds = deps.Preds,
				startDate =	new Date(this.ReleaseRecord.data.ReleaseStartDate),
				endDate =	new Date(this.ReleaseRecord.data.ReleaseDate),
				ObjectID = userStoryRecord.data.ObjectID,
				FormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name;
				
			if(this._isInRelease(userStoryRecord)){
				for(var predDepID in preds){
					var predDep = preds[predDepID];
					predDepsList.push({
						ProjectName:projectData.Name,
						ProjectID: projectData.ObjectID,
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
			appID: this.getAppId(),
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
					me._alert('ERROR', reason);
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
			me._alert('ERROR', 'You do not have permissions to edit this project');
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
						return me._loadReleasesInTheFuture(me.TrainRecord);
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
					me._alert('ERROR', reason || '');
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
				me._alert('ERROR', reason || '');
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

		function riskSorter(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; } //new come first
		
		/****************************** RISKS STUFF  ***********************************************/	
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
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				width:80,
				editor:false,	
				resizable:false,
				sortable:true,
				renderer:function(FID){ 
					var feature = me.FeatureStore.findExactRecord('FormattedID', FID);
					if(feature.data.Project) {
						var pid = feature.data.Project._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/portfolioitem/feature/' + 
								feature.data.ObjectID + '" target="_blank">' + FID + '</a>';
					}
					else return FID;
				}
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				flex:1,
				editor:false,	
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }	
			},{
				text:'Team', 
				dataIndex:'ProjectName',
				flex:1,
				editor:false,	
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }	
			},{
				text:'Risk Description', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'inteltextarea',
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
				editor: 'inteltextarea',
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Status',
				dataIndex:'Status',
				tdCls: 'intel-editor-cell',	
				width:100,			
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
				editor: 'inteltextarea',
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
				renderer:function(val){ return val ? 'ww' + me._getWorkweek(val) : '-'; }		
			},{
				text:'',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._removeRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0));
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
									var realRiskData = me._removeRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0));
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
					var realRiskData = me._removeRiskFromList(riskRecord.data.RiskID, me.RisksParsedData.slice(0));
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
									if(!riskRecord.data.Checkpoint){
										me._alert('ERROR', 'You must set the Checkpoint date for this risk'); return; }
									else if(!riskRecord.data.Description){
										me._alert('ERROR', 'You must set the Description date for this risk'); return; }
									else if(!riskRecord.data.Impact){
										me._alert('ERROR', 'You must set the Impact date for this risk'); return; }
									else if(!riskRecord.data.Status){
										me._alert('ERROR', 'You must set the Status date for this risk'); return; }
									else if(!riskRecord.data.Contact){
										me._alert('ERROR', 'You must set the Contact date for this risk'); return; }
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
															oldRealRiskData = me._removeRiskFromList(riskRecordData.RiskID, oldRealRisksData);							
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
										.then(function(){
											me.RisksGrid.setLoading(false);
											unlockFunc();
										})
										.fail(function(reason){
											me._alert('ERROR:', reason);
											me.RisksGrid.setLoading(false);
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
      title: 'Risks',
			minHeight:150,
			maxHeight:400,
			style:'margin:10px 10px 0 10px',
			scroll:'vertical',
			columnCfgs: columnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px';}
			},
			listeners: {
				edit: function(editor, e){			
					/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
						to improve performance.**/
					var grid = e.grid,
						risksRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;
					if(value === originalValue) return; 
					else if(!value) { risksRecord.set(field, originalValue); return; }
					else if(['Description', 'Impact', 'Contact'].indexOf(field)>-1) {
						value = me._htmlEscape(value);			
						risksRecord.set(field, value);
					}

					var previousEdit = risksRecord.data.Edited;
					risksRecord.set('Edited', true);
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
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				width:80,
				resizable:false,
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
				}
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:3,
				resizable:false,
				editor:false,
				sortable:true,
				renderer: function(val){ return val || '-'; }	
			},{
				text:'Owning Team', 
				dataIndex:'ProjectName',
				flex:3,
				resizable:false,
				editor:false,
				sortable:true,
				renderer: function(val){ return val || '-'; }	
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:3,
				resizable:false,
				editor:false,
				sortable:false,
				renderer: function(val){ return val || '-'; }				
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				text:'Needed By',
				editor:false,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');}
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
							width:145,
							resizable:false,
							renderer: function(val, meta, depTeamRecord){
								var projectRecord = me.ValidProjects[val];
								if(val && projectRecord) return projectRecord.data.Name;
								else return '-';
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
				width:100,
				resizable:false,
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
				}
			}
		];
		
		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
      title: "Dependencies",
			minHeight:150,
			maxHeight:450,
			style:'margin:10px 10px 0 10px',
			scroll:'vertical',
			columnCfgs: predDepColumnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(predDepRecord){ 
					//var cls = 'intel-row-' + (10 + (35*predDepRecord.data.Predecessors.length || 35)) + 'px';
					//return cls;
				}
			},
			listeners: {
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
						.then(function(){
							me.PredDepGrid.setLoading(false);
							unlockFunc();
						})
						.fail(function(reason){
							me._alert('ERROR:', reason);
							me.PredDepGrid.setLoading(false);
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
