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
				SUSID, //successor UserStory Formatted ID
				SUSName, //successor UserStory Name
				SPID, //successor project ID
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
console = { log: function(){} }; // DEBUG!!!!		

/********************* END PRODUCTION *****************/
Ext.define('ProgramBoard', {
	extend: 'IntelRallyApp',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'IntelWorkweek',
		'ReleaseQuery',
		'AsyncQueue'
	],
	_prefName: 'intel-program-board',
	
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
	},{
		xtype:'container',
		padding:'0 10px 0 10px',
		layout: {
			type:'hbox',
			align:'stretch',
			pack:'start'
		},
		height:350,
		itemId:'tc_vel_box'
	}],
	minWidth:910, //thats when rally adds a horizontal scrollbar for a pagewide app
	
	/****************************************************** DATA STORE METHODS ********************************************************/
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
					var frData = fr.data;
					if(frData.Parent){
						promises.push(me._loadMilestone(frData.Parent.ObjectID).then(function(milestoneRecord){
							var p = milestoneRecord.data.Parent;
							me.FeatureProductHash[frData.ObjectID] = ((p && p.Name ) ? p.Name : '');
						}));
					}
					else me.FeatureProductHash[frData.ObjectID] = '';
				});
				return Q.all(promises);
			});
	},
	
	_loadIterations: function(){
		var me=this,
			startDate =	Rally.util.DateTime.toIsoString(this.ReleaseRecord.data.ReleaseStartDate),
			endDate =	Rally.util.DateTime.toIsoString(this.ReleaseRecord.data.ReleaseDate);
			iterationStore = Ext.create("Rally.data.WsapiDataStore", {
				model: "Iteration",
				remoteSort: false,
				limit:Infinity,
				fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project"],
				context:{
					project: this.getContext().getProject()._ref
				},
				filters: [
					{
						property: "EndDate",
						operator: ">=",
						value: startDate
					},{
						property: "StartDate",
						operator: "<=",
						value: endDate  
					}
				]
			});
		return me._reloadStore(iterationStore)
			.then(function(iterationStore){ 
				console.log('iterations loaded:', iterationStore.data.items);
				me.IterationStore = iterationStore; 
			});
	},
	
	_loadUserStoryFilter: function(){
		var me=this,
			coreFilter = Ext.create('Rally.data.wsapi.Filter', {
				property:'Project',
				value: me.ProjectRecord.data._ref
			}).and(
				Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
					property:'Release.Name',
					value: me.ReleaseRecord.data.Name
				}).or(Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
					property:'Feature.Release.Name',
					value: me.ReleaseRecord.data.Name
				}))),
			depFilter = Ext.create('Rally.data.wsapi.Filter', { //to get successors (could be any random user story)
				property:'Project',
				value: me.ProjectRecord.data._ref
			}).and(Ext.create('Rally.data.wsapi.Filter', {
				property:'c_Dependencies',
				operator:'!=',
				value:''
			}));
		return coreFilter.or(depFilter);
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
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[me._loadUserStoryFilter()]
			});
		return me._reloadStore(userStoryStore)
			.then(function(userStoryStore){ 
				console.log('userStories loaded:', userStoryStore.data.items);
				me.UserStoryStore = userStoryStore; 
			});
	},
	
	/**___________________________________TEAM COMMITS STUFF___________________________________**/
			
	_getTeamCommit: function(featureRecord){	
		var tcs = featureRecord.data.c_TeamCommits,
			projectID = this.ProjectRecord.data.ObjectID;
		try{ tcs = JSON.parse(atob(tcs))[projectID] || {}; } 
		catch(e){ tcs = {}; }
		return tcs;
	},
		
	_setTeamCommit: function(featureRecord, tc){
		var tcs = featureRecord.data.c_TeamCommits,
			projectID = this.ProjectRecord.data.ObjectID,
			deferred = Q.defer();
		try{ tcs = JSON.parse(atob(tcs)) || {}; }
		catch(e){ tcs = {}; }
		if(!tcs[projectID]) tcs[projectID] = {};
		tcs[projectID].Commitment = tc.Commitment;
		tcs[projectID].Objective = tc.Objective;
		var str = btoa(JSON.stringify(tcs, null, '\t'));
		if(str.length >= 32768)
			deferred.reject('TeamCommits field for ' + featureRecord.data.FormattedID + ' ran out of space! Cannot save');
		else {
			featureRecord.set('c_TeamCommits', str);
			featureRecord.save({ 
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.data.FormattedID);
					else {
						console.log('added teamCommits to feature:', featureRecord, tcs);
						deferred.resolve();
					}
				}
			});
		}
		return deferred.promise;
	},
				
	_TeamCommitsCountHash: {},
	_getStoryCount: function(FID){	
		if(this._TeamCommitsCountHash[FID]) return this._TeamCommitsCountHash[FID];
		var count = 0, recs = this.UserStoryStore.data.items;
		for(var i=0, len=recs.length; i<len; ++i){
			var us = recs[i];
			count += (us.data.Feature && us.data.Feature.ObjectID == FID)*1;
		}
		this._TeamCommitsCountHash[FID] = count;
		return count;
	},
		
	_TeamCommitsEstimateHash: {},
	_getStoriesEstimate: function(FID){	
		if(this._TeamCommitsEstimateHash[FID]) 
			return this._TeamCommitsEstimateHash[FID];
		var estimate = 0, recs = this.UserStoryStore.data.items;
		for(var i=0, len=recs.length; i<len; ++i){
			var us = recs[i];
			estimate += (us.data.Feature && us.data.Feature.ObjectID == FID ? us.data.PlanEstimate : 0)*1;
		}
		this._TeamCommitsEstimateHash[FID] = estimate;
		return estimate;
	},

	/**___________________________________ RISKS STUFF___________________________________**/
	_updateFColumnStores: function(){ //updates the dropdown stores with the most recent features in the release (in case some were added
		var me = this, 
			features = me.FeatureStore.data.items, 
			i, len;
		if(me.FeatureFIDStore){
			me.FeatureFIDStore.removeAll();
			for(i=0, len=features.length; i<len; ++i){
				me.FeatureFIDStore.add({'FormattedID': features[i].data.FormattedID});
			}
		}
		if(me.FeatureNameStore) {
			me.FeatureNameStore.removeAll();
			for(i=0, len=features.length; i<len; ++i){
				me.FeatureNameStore.add({'Name': features[i].data.Name});
			}
		}
	},
	
	_getRisks: function(featureRecord){
		var risks = featureRecord.data.c_Risks;
		try{ risks = JSON.parse(atob(risks)) || {}; } //b64 decode yosef. we approve of xss.
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
	
	_removeRisk: function(featureRecord, riskData){ 
		var risks = this._getRisks(featureRecord),
			projectID = this.ProjectRecord.data.ObjectID,
			deferred = Q.defer();
			
		if(risks[projectID]){
			risks[projectID][riskData.RiskID] = undefined;
			this.RisksParsedData = _.reject(this.RisksParsedData, function(rpd){ //remove it from cached risks
				return rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID;
			});
			var str = btoa(JSON.stringify(risks, null, '\t')); //b64 encode yosef
			if(str.length >= 32768) 
				deferred.reject('Risks field for ' + featureRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				featureRecord.set('c_Risks', str);
				featureRecord.save({
					callback:function(record, operation, success){
						if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.data.FormattedID);
						else {
							console.log('removed risk from feature:', featureRecord, riskData, risks);
							deferred.resolve();
						}
					}
				});
			}
		} else deferred.resolve();
		
		return deferred.promise;
	},
	
	_addRisk: function(featureRecord, riskData){
		var risks = this._getRisks(featureRecord),
			projectID = this.ProjectRecord.data.ObjectID,
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
	
	_updateUSColumnStores: function(){ //updates the dropdown stores with the most recent user stories in the release (in case some were added
		var me = this,
			uses = me.DependenciesReleaseUserStories, 
			i, len;
		if(me.UserStoryFIDStore){
			me.UserStoryFIDStore.removeAll();
			for(i=0, len=uses.length; i<len; ++i){
				me.UserStoryFIDStore.add({'FormattedID': uses[i].data.FormattedID});
			}
		}
		if(me.UserStoryNameStore) {
			me.UserStoryNameStore.removeAll();
			for(i=0, len=uses.length; i<len; ++i){
				me.UserStoryNameStore.add({'Name': uses[i].data.Name});
			}
		}
	},
	
	_isInRelease: function(usr){ //some user stories are not themselves in releases
		return usr.data.Release && usr.data.Release.Name === this.ReleaseRecord.data.Name ||
			usr.data.Feature && usr.data.Feature.Release && usr.data.Feature.Release.Name === this.ReleaseRecord.data.Name;
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
		for(var i=0; i<succs.length;++i){
			var succDep = succs[i];
			//NOTE: perhaps we will change this to not filter by date overlap, but filter by releases sharing the same name?
			//		that will ONLy be if the release name is the same for all trains
			if(new Date(succDep.REL) >= startDate && new Date(succDep.REL_S) <= endDate){ //if userStory's release overlaps with current release
				if(succDep.A){ //if this was just placed on a random user story, or is assigned to this user story!
					FormattedID = userStoryRecord.data.FormattedID;
					UserStoryName = userStoryRecord.data.Name;
				} 
				else FormattedID = UserStoryName = '';
					
				succDepsList.push({
					DependencyID: succDep.ID,
					SuccUserStoryName: succDep.SUSName,
					SuccFormattedID: succDep.SUSID,
					SuccProjectID: succDep.SPID,
					ReleaseDate: succDep.REL,
					ReleaseStartDate: succDep.REL_S,
					Description: succDep.Desc,
					Checkpoint: succDep.CP,
					Supported: succDep.Sup,
					Assigned: succDep.A,
					FormattedID: FormattedID,
					UserStoryName: UserStoryName,
					ObjectID: ObjectID,
					Edited: false //not in pending edit mode
				});
			}
		}
		return {Predecessors:predDepsList, Successors:succDepsList};
	},
	
	_parseDependenciesData: function(){	
		var me=this, 
			predDepsList = [], succDepsList = [], 
			records = me.UserStoryStore.getRecords(),
			relUSs = [], 
			i, len;
		for(i=0,len = records.length; i<len;++i)
			if(me._isInRelease(records[i])) relUSs.push(records[i]);
		me.DependenciesReleaseUserStories = relUSs;
		
		for(i=0;i<len;++i){
			var usrData = me._parseDependenciesFromUserStory(records[i]);
			predDepsList = predDepsList.concat(usrData.Predecessors);
			succDepsList = succDepsList.concat(usrData.Successors);
		}
		me.DependenciesParsedData = {Predecessors:predDepsList, Successors:succDepsList};
	},
		
	_newTeamDep: function(){
		return {
			TID: (new Date() * 1) + '' + (Math.random() * 100 >> 0),
			PID: '',
			Sup:'No',
			USID:'',
			USName:'',
			A:false
		};
	},

	_removeDepFromList: function(dependencyID, dependencyList){ 
		for(var i = 0; i<dependencyList.length; ++i){
			if(dependencyList[i].DependencyID == dependencyID) {
				return dependencyList.splice(i, 1)[0];
			}
		}
	},
	
	// THESE NEXT 1 METHODS ARE THE ONLY PLACE YOU HAVE TO WORRY ABOUT SUCESSORS AND PREDECESSOR FIELDS ON USER STORIES!!!!!!!!!!!!!!!
	_syncCollection: function(userStoryRecord, usAddList, usRemoveList, type){ //type == Predecessors || Successors
		var me=this, 
			collectionStore, collectionRecords, syncCollectionProxy = false,
			funcDeferred = Q.defer();
			
		userStoryRecord.getCollection(type).load({ // update the collection before saving user story
			fetch:['FormattedID'],
			callback: function(){
				var promises = [],
					collectionStore = this,
					collectionRecords = collectionStore.getRange();
				usAddList.forEach(function(dep){
					if(!_.find(collectionRecords, function(cr){ return cr.data.FormattedID === dep.USID; })) { //add it
						var project = me.ValidProjects[dep.PID]; //we already checked if we can edit this project, no need to check here
						promises.push(me._loadUserStoryByFID(dep.USID, project.data._ref).then(function(us){
							if(us) { 
								syncCollectionProxy = true; 
								collectionStore.add(us); 
							}
						}));
					}
				});
				usRemoveList.forEach(function(dep){
					var realDep = _.find(collectionRecords, function(cr) { return cr.data.FormattedID===dep.USID; });
					if(realDep) { 
						collectionStore.remove(realDep); 
						syncCollectionProxy = true;
					}
				});
				
				//attempt to sync collection until it passes, 5 == max attempts
				var attempts = 0;
				Q.all(promises)
					.then(function retrySync(){
						if(++attempts > 5){
							console.log('Quit trying to modify ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
							funcDeferred.resolve();		
						}
						else if(syncCollectionProxy) {
							collectionStore.sync({ 
								failure:function(){
									console.log('Failed attempt to modify ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
									retrySync(); //we will succeed, after 5 attempts we quit
								},
								success:function(){ 
									console.log('Successfully modified ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
									funcDeferred.resolve(); 
								} //ignore failures, sigh
							});
						}
						else funcDeferred.resolve();
					})
					.fail(function(reason){ 
						funcDeferred.reject(reason); 
					})
					.done();
			}
		});	
		return funcDeferred.promise;
	},
	
	_collectionSynced: function(userStoryRecord, msg, depData, dependencies){
		var me=this, 
			str = btoa(JSON.stringify(dependencies, null, '\t')),
			deferred = Q.defer();
		if(str.length >= 32768) 
			deferred.reject('Dependencies field for ' + userStoryRecord.data.FormattedID + ' ran out of space! Cannot save');
		else {
			userStoryRecord.set('c_Dependencies', str);
			//attempt to save until it passes, 5 == max attempts
			var attempts = 0;
			(function retrySync(){
				if(++attempts > 5){
					deferred.reject('Failed to modify User Story ' + userStoryRecord.data.FormattedID);
					return;
				}
				else {
					userStoryRecord.save({
						callback:function(record, operation, success){
							if(!success){
								console.log('Failed attempt to modify ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
								retrySync();
							}
							else {
								console.log(msg, userStoryRecord, depData, dependencies);
								deferred.resolve();
							}
						}
					});
				}
			}());
		}
		return deferred.promise;
	},
	
	_removePredDep: function(userStoryRecord, predDepData){
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cachePreds = me.DependenciesParsedData.Predecessors,
			addUSlist = [], removeUSlist = [], depID = predDepData.DependencyID, i;

		removeUSlist = dependencies.Preds[depID].Preds || [];
		
		delete dependencies.Preds[depID]; //delete from user story preds	
		
		//update or append to the cache, this predDepData
		if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
			for(i=0;i<cachePreds.length; ++i){
				if(cachePreds[i].DependencyID===depID){ 
					cachePreds.splice(i, 1); 
					break; 
				}
			}
		}
		_.each(dependencies.Preds, function(predDep){ //other deps have it as a pred, so keep it, and remove it from removed!
			_.each(predDep.Preds, function(pred){
				if(pred.A){//dont worry if its not assigned, it wont show up in 'rally preds/succs'
					for(i=0;i<removeUSlist.length; ++i)
						if(removeUSlist[i].USID === pred.USID) removeUSlist.splice(i, 1); 
					for(i=0;i<addUSlist.length; ++i)
						if(addUSlist[i].USID === pred.USID) return;
					addUSlist.push(pred);
				}
			});
		});
		
		return me._syncCollection(userStoryRecord, addUSlist, removeUSlist, 'Predecessors').then(function(){ 
			return me._collectionSynced(userStoryRecord, 'removed predDep', predDepData, dependencies); 
		});
	},
	
	_removeSuccDep: function(userStoryRecord, succDepData){
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cacheSuccs = me.DependenciesParsedData.Successors, dpds,
			addUSlist = [], removeUSlist = [], succDep, i;
			
		for(i=0; i<dependencies.Succs.length; ++i){ //find the correct succDep(s). and remove it from the dependencies object //multiple succ Deps maybe??
			if(dependencies.Succs[i].ID === succDepData.DependencyID){					
				succDep = dependencies.Succs.splice(i, 1)[0]; 
				removeUSlist.push({USID:succDep.SUSID, PID:succDep.SPID});
			}	
		}
			
		//update or append to the cache, this predDepData
		if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
			for(i=0;i<cacheSuccs.length; ++i){ //remove suddDep from cache
				dpds = cacheSuccs[i];
				//need formattedID because can be multiple same succ DepIDs
				if(dpds.DependencyID === succDepData.DependencyID && dpds.FormattedID === succDepData.FormattedID){
					cacheSuccs.splice(i, 1); break; }
			}
		}
		
		_.each(dependencies.Succs, function(succ){
			if(succ.A){
				for(i=0;i<removeUSlist.length; ++i)
					if(removeUSlist[i].USID === succ.SUSID) removeUSlist.splice(i, 1);
				for(i=0;i<addUSlist.length; ++i)
					if(addUSlist[i].USID === succ.SUSID) return;
				addUSlist.push({USID: succ.SUSID, PID: succ.SPID});
			}
		});
		return me._syncCollection(userStoryRecord, addUSlist, removeUSlist, 'Successors').then(function(){
			return me._collectionSynced(userStoryRecord, 'removed succdep', succDepData, dependencies);
		});
	},

	_addPredDep: function(userStoryRecord, predDepData){ 
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cachePreds = me.DependenciesParsedData.Predecessors, dpdp,
			predUSlist = [], parseDataAdded = false, depID, i;
		
		predDepData = Ext.clone(predDepData);
		predDepData.Edited = false;
				
		dependencies.Preds[predDepData.DependencyID] = {
			Desc: predDepData.Description,
			CP: predDepData.Checkpoint,
			Sta: predDepData.Status,
			Preds: predDepData.Predecessors
		};

		//update or append to the cache, this predDepData
		if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
			for(i=0;i<cachePreds.length; ++i){
				dpdp = cachePreds[i];
				if(dpdp.DependencyID === predDepData.DependencyID){
					cachePreds[i] = predDepData;
					parseDataAdded = true; break;
				}
			}
			if(!parseDataAdded) cachePreds.push(predDepData);	
		}
		
		function appendPred(pred){  //only add each assigned userstory once
			if(pred.A){
				for(i=0;i<predUSlist.length; ++i)
					if(predUSlist[i].USID === pred.USID) return;
				predUSlist.push(pred);
			}
		}			
		for(depID in dependencies.Preds){ _.each(dependencies.Preds[depID].Preds, appendPred); }
			
		return me._syncCollection(userStoryRecord, predUSlist, [], 'Predecessors').then(function(){
			return me._collectionSynced(userStoryRecord, 'added predDep', predDepData, dependencies);
		});
	},
	
	_addSuccDep: function(userStoryRecord, succDepData){ 
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cacheSuccs = me.DependenciesParsedData.Successors, dpds,
			replaced = false, succUSlist=[], 
			parseDataAdded = false, i, newSucc;
		
		succDepData = Ext.clone(succDepData);
		succDepData.Edited = false;
			
		newSucc = {
			ID: succDepData.DependencyID,
			SUSID: succDepData.SuccFormattedID,
			SUSName: succDepData.SuccUserStoryName,
			SPID: succDepData.SuccProjectID,
			Desc: succDepData.Description,
			CP: succDepData.Checkpoint,
			Sup: succDepData.Supported,
			A: succDepData.Assigned,
			REL: succDepData.ReleaseDate,
			REL_S: succDepData.ReleaseStartDate
		};
		for(i = 0; i<dependencies.Succs.length; ++i){
			if(dependencies.Succs[i].ID === newSucc.ID){
				dependencies.Succs[i] = newSucc;
				replaced=true; 
				break; 
			}
		}
		if(!replaced) dependencies.Succs.push(newSucc);

		//update or append to the cache, this succDepData
		if(userStoryRecord.data.Project.ObjectID === me.ProjectRecord.data.ObjectID){
			for(i=0;i<cacheSuccs.length; ++i){ //update or append to the cache, this succDepData
				dpds = cacheSuccs[i];
				//could be multiple succs with same DepID
				if(dpds.DependencyID === succDepData.DependencyID && dpds.FormattedID === succDepData.FormattedID){
					cacheSuccs[i] = succDepData;
					parseDataAdded = true; break;
				}
			}
			if(!parseDataAdded) cacheSuccs.push(succDepData);
		}
		
		_.each(dependencies.Succs, function(succ){
			if(succ.A){
				for(i=0;i<succUSlist.length; ++i)
					if(succUSlist[i].USID === succ.SUSID) return;
				succUSlist.push({USID: succ.SUSID, PID: succ.SPID});
			}
		});
		
		return me._syncCollection(userStoryRecord, succUSlist, [], 'Successors').then(function(){
			return me._collectionSynced(userStoryRecord, 'added succdep', succDepData, dependencies);
		});
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
	
	_getRealDepData: function(oldUSRecord, depData, type){ //type is 'Predecessors' or 'Successors'
		var me = this, realDepsData;
		if(oldUSRecord) realDepsData = me._parseDependenciesFromUserStory(oldUSRecord)[type];
		else realDepsData = [];
		return me._removeDepFromList(depData.DependencyID, realDepsData);		
	},
	
	_getTeamDepArrays: function(predDepData, realDepData){ //returns arrays of the team deps from the dependency grouped on their status
		var me=this, 
			addedTeams = [], 
			removedTeams = [], 
			updatedTeams = [], 
			localTeams = predDepData.Predecessors, //predTeams on our local machine
			realTeams  = realDepData ? (realDepData.Predecessors || []) : [];	
		if(!realDepData) addedTeams = predDepData.Predecessors;
		else {											
			Outer:
			for(var i=localTeams.length-1;i>=0;--i){
				for(var j=0;j<realTeams.length;++j){
					if(localTeams[i].TID === realTeams[j].TID){
						updatedTeams.push(realTeams.splice(j,1)[0]);
						continue Outer;
					}
				}
				addedTeams.push(localTeams[i]); //teams we just added
			}
			removedTeams = realTeams; //teams that we just removed	
		}
		return {
			added: addedTeams,
			updated: updatedTeams,
			removed: removedTeams
		};
	},
	
	//These are for adding and removing team dependency callbacks to be executed in the future. return true if all callbacks are created
	_getAddedTeamDepCallbacks: function(teamDeps, predDepData){ //teamDeps might mutate
		var me=this, 
			permissions = me.getContext().getPermissions(),
			promises = [];
		teamDeps.forEach(function(teamDepData){
			var project = me.ValidProjects[teamDepData.PID];
			if(!permissions.isProjectEditor(project)) 
				promises.push(Q.reject('You lack permissions to modify project: ' + project.data.Name));
			else {
				promises.push(me._loadRandomUserStory(project.data._ref).then(function(us){
					if(!us) return Q.reject('Project ' + project.data.Name + ' has no user stories, cannot continue');
					else {
						return Q(function(){ 
							teamDepData.USID = us.data.FormattedID;
							teamDepData.USName = us.data.Name;
							var succDep = {
								DependencyID: predDepData.DependencyID,
								SuccUserStoryName: predDepData.UserStoryName,
								SuccFormattedID: predDepData.FormattedID,
								SuccProjectID: me.ProjectRecord.data.ObjectID,
								UserStoryName: '', //not assigned yet 
								FormattedID: '',  //not assigned yet
								Description: predDepData.Description,
								Checkpoint: predDepData.Checkpoint,
								Supported: 'No',
								Assigned: false,
								ReleaseStartDate: new Date(me.ReleaseRecord.data.ReleaseStartDate)*1,
								ReleaseDate: new Date(me.ReleaseRecord.data.ReleaseDate)*1,
								Edited: false
							};
							return me._addSuccDep(us, succDep); //return promise
						});
					}
				}));
			}
		});
		return Q.all(promises);
	},
	
	_getUpdatedTeamDepCallbacks: function(teamDeps, predDepData){ //teamDeps might mutate
		var me=this, 
			permissions = me.getContext().getPermissions(),
			promises = [];
		teamDeps.forEach(function(teamDepData){
			var project = me.ValidProjects[teamDepData.PID];
			if(!permissions.isProjectEditor(project)) 
				promises.push(Q.reject('You lack permissions to modify project: ' + project.data.Name));
			else {
				promises.push(me._loadUserStoryByFID(teamDepData.USID, project.data._ref).then(function(us){
					var succDep = {
						DependencyID: predDepData.DependencyID,
						SuccUserStoryName: predDepData.UserStoryName,
						SuccFormattedID: predDepData.FormattedID,
						SuccProjectID: me.ProjectRecord.data.ObjectID,
						Description: predDepData.Description,
						Checkpoint: predDepData.Checkpoint,
						ReleaseStartDate: new Date(me.ReleaseRecord.data.ReleaseStartDate)*1,
						ReleaseDate: new Date(me.ReleaseRecord.data.ReleaseDate)*1,
						Supported: teamDepData.Sup,
						Edited: false
					};
					if(!us){
						return me._loadRandomUserStory(project.data._ref).then(function(us){
							if(!us) return Q.reject('Project ' + project.data.Name + ' has no user stories, cannot continue');
							else {
								return Q(function(){ // got deleted from user story
									teamDepData.USID = us.data.FormattedID;
									teamDepData.USName = us.data.Name;
									teamDepData.A = false;
									
									succDep.UserStoryName = '';
									succDep.FormattedID = '';
									succDep.Assigned = false;						
									return me._addSuccDep(us, succDep); //return promise
								});
							}
						});
					}
					else{
						return Q(function(){
							succDep.UserStoryName = teamDepData.USName;
							succDep.FormattedID = teamDepData.USID;
							succDep.Assigned = teamDepData.A;
							return me._addSuccDep(us, succDep); //return promise
						});
					}
				}));
			}
		});
		return Q.all(promises);
	},
	
	_getRemovedTeamDepCallbacks: function(teamDeps, predDepData){
		var me=this, 
			permissions = me.getContext().getPermissions(),
			promises = [];
		teamDeps.forEach(function(teamDepData){
			var project = me.ValidProjects[teamDepData.PID];
			if(!permissions.isProjectEditor(project)) 
				promises.push(Q.reject('You lack permissions to modify project: ' + project.data.Name));
			else {
				promises.push(me._loadUserStoryByFID(teamDepData.USID, project.data._ref).then(function(us){
					if(!us) return Q(function(){}); // looks as if the userStory doesn't exist. so we ignore it
					else {
						return Q(function(){
							var succDepData = { //we only need these fields to delete it!
								FormattedID: teamDepData.USID,
								DependencyID: predDepData.DependencyID
							};
							return me._removeSuccDep(us, succDepData);
						});
					}
				}));
			}
		});
		return Q.all(promises);
	},

	/** returns some errors in an array to signal to delete the dependency 
			because the fail was causes by the dependency being out of sync
	*/
	_updateSuccessor: function(succDepData, newUSRecord){
		var me=this, 
			permissions = me.getContext().getPermissions(),
			project = me.ValidProjects[succDepData.SuccProjectID];
		if(!permissions.isProjectEditor(project)) 
			return Q.reject('You lack permissions to modify project: ' + project.data.Name);
		else {
			return me._loadUserStoryByFID(succDepData.SuccFormattedID, project.data._ref).then(function(us){	
				if(!us) return Q.reject(['Successor UserStory has been deleted.']);
				else {
					var deps = me._getDependencies(us);
					var rppData = deps.Preds[succDepData.DependencyID];
					if(rppData){
						var predDepData = {
							DependencyID: succDepData.DependencyID,
							FormattedID: us.data.FormattedID,
							UserStoryName: us.data.Name,
							Description: rppData.Desc,
							Checkpoint: rppData.CP,
							Status: rppData.Sta,
							Predecessors: rppData.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
							Edited: false //not in pending edit mode
						};
						var predecessors = predDepData.Predecessors;
						for(var i = 0;i<predecessors.length;++i){
							//have to make sure this dep is actually in the JSON teamDep object
							if(predecessors[i].PID == me.ProjectRecord.data.ObjectID){ 
								predecessors[i].Sup = succDepData.Supported;
								predecessors[i].USID = newUSRecord.data.FormattedID;
								predecessors[i].USName = newUSRecord.data.Name;
								predecessors[i].A = succDepData.Assigned;
								return me._addPredDep(us, predDepData);
							}
						}
						return Q.reject(['Successor removed this dependency.']);
					}
					else return Q.reject(['Successor removed this dependency.']);
				} 
			});
		}
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
				catch(e){ appPrefs = { projs:{}, refresh:30};}
				console.log('loaded prefs', appPrefs);
				deferred.resolve(appPrefs);
			},
			failure: deferred.reject
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
	_isEditingTeamCommits: false, 
	_isEditingVelocity: false,
	
	_isEditing: function(store){
		if(!store) return false;
		for(var records = store.getRange(), i=0, len=records.length; i<len; ++i)
			if(records[i].data.Edited) return true;
		return false;
	},
		
	_showGrids: function(){
		var me=this;
		me._loadTeamCommitsGrid();
		me._loadVelocityGrid(); 
		me._loadRisksGrid();
		me._loadDependenciesGrids();
	},
	
	_updateGrids: function(){ //synchronous function
		var me=this,
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);
		if(!me._isEditingVelocity && me.IterationStore && me.UserStoryStore)
			if(me.CustomVelocityStore) me.CustomVelocityStore.intelUpdate();
		if(!me._isEditingTeamCommits && me.FeatureStore && me.UserStoryStore)
			if(me.CustomTeamCommitsStore) me.CustomTeamCommitsStore.intelUpdate();
		if(!isEditingRisks && me.FeatureStore){
			me._parseRisksData();
			me._updateFColumnStores();
			if(me.CustomRisksStore) me.CustomRisksStore.intelUpdate();
		}
		if(!isEditingDeps && me.UserStoryStore && me.FeatureStore){
			me._parseDependenciesData(); //reparse the data
			me._updateUSColumnStores();
			if(me.CustomPredDepStore) me.CustomPredDepStore.intelUpdate();
			if(me.CustomSuccDepStore) me.CustomSuccDepStore.intelUpdate();
		}
	},
	
	_reloadStores: function(){ //this function calls updateAllGrids
		var me=this,
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore),
			promises = [];
		if(!me._isEditingVelocity){
			if(me.IterationStore) promises.push(me._reloadStore(me.IterationStore));
			else promises.push(me._loadIterations());
		}
		if(!me._isEditingTeamCommits && !isEditingRisks){
			if(me.FeatureStore) promises.push(me._reloadStore(me.FeatureStore));
			else promises.push(me._loadFeatures());
		}
		if(!me._isEditingVelocity && !me._isEditingTeamCommits && !isEditingDeps){
			if(me.UserStoryStore) promises.push(me._reloadStore(me.UserStoryStore));
			else promises.push(me._loadUserStories());
		}
		return Q.all(promises);
	},

	_reloadEverything:function(){
		var me = this;
		me._isEditingTeamCommits = false;
		me._isEditingVelocity = false;
		
		me.UserStoryStore = undefined;
		me.FeatureStore = undefined;
		me.IterationStore = undefined;
		
		me.PredDepGrid = undefined;
		me.SuccDepGrid = undefined;
		me.RisksGrid = undefined;
		me.VelocityGrid = undefined;
		me.TeamCommitsGrid = undefined;
		
		me.CustomPredDepStore = undefined;
		me.CustomSuccDepStore = undefined;
		me.CustomRisksStore = undefined;
		me.CustomTeamCommitsStore = undefined;
		me.CustomVelocityStore = undefined;
		
		me.setLoading(true);
		
		var toRemove = me.down('#tc_vel_box').next(), tmp;
		while(toRemove){ //delete risks and deps
			tmp = toRemove.next();
			toRemove.up().remove(toRemove);
			toRemove = tmp;
		}
		me.down('#tc_vel_box').removeAll(); //delete vel & team commits

		if(!me.ReleasePicker){ //draw these once, never removve them
			me._loadReleasePicker();
			me._loadTrainPicker();
			me._loadRefreshIntervalCombo();
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
	
	/******************************************************* REFRESHING WSAPI DATA ***********************************************/
	
	_setLoadingMasks: function(){
		var me=this, t = 'Refreshing Data',
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);			
		if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(t);
		if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(t);
		if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(t);
		if(me.PredDepGrid && !isEditingDeps) me.PredDepGrid.setLoading(t);
		if(me.SuccDepGrid && !isEditingDeps) me.SuccDepGrid.setLoading(t);
	},
	
	_removeLoadingMasks: function(){
		var me=this,
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);		
		if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(false);
		if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(false);
		if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(false);
		if(me.PredDepGrid && !isEditingDeps) me.PredDepGrid.setLoading(false);
		if(me.SuccDepGrid && !isEditingDeps) me.SuccDepGrid.setLoading(false);
	},
	
	_refreshDataFunc: function(){ //also performes a window resize after data is loaded
		var me=this;
		me._enqueue(function(unlockFunc){
			me._setLoadingMasks();
			me._reloadStores()
				.then(function(){
					me._updateGrids();
				})
				.then(function(){
					me._removeLoadingMasks();
					unlockFunc();
				})
				.fail(function(reason){
					me._alert('ERROR', reason);
					me._removeLoadingMasks();
					unlockFunc();
				})
				.done();
		});
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
					me.ProjectNames = [];
					for(var projOID in validProjects){
						me.ProjectNames.push({Name: validProjects[projOID].data.Name });
					}
					if(me.ValidProjects[me.ProjectRecord.data.ObjectID]) return me._loadPreferences();
					else return Q.reject('Please scope to a team that has members');
				})
				.then(function(appPrefs){
					me.AppPrefs = appPrefs;
					return me._loadAllTrains(me.RootProject);
				})
				.then(function(allTrainStore){
					var trainRecs = allTrainStore.data.items;
					me.AllTrainRecordsStore = allTrainStore;
					me.TrainNames = [];
					for(var i=0, len=trainRecs.length; i<len; ++i){
						me.TrainNames[i] = {Name: trainRecs[i].data.Name.split(' ART')[0]};
					}
					return me._projectInWhichTrain(me.ProjectRecord);
				})
				.fail(function(error){
					if(error !== 'Project not in a train') return Q.reject(error); //its ok if its not in a train			
				})
				.then(function(trainRecord){
					if(trainRecord)	me.TrainRecord = trainRecord;
					else {
						me.ProjectNotInTrain = true;
						var pid = me.ProjectRecord.data.ObjectID;
						if(me.AppPrefs.projs[pid] && me.AppPrefs.projs[pid].Train) {
							me.TrainRecord = me.AllTrainRecordsStore.findExactRecord('ObjectID', me.AppPrefs.projs[pid].Train);
							if(!me.TrainRecord) me.TrainRecord = me.AllTrainRecordsStore.first();
						}
						else me.TrainRecord = me.AllTrainRecordsStore.first();
					}
					console.log('train loaded:', trainRecord);
					return me._loadReleasesInTheFuture(me.ProjectRecord);
				})
				.then(function(releaseStore){		
					me.ReleaseStore = releaseStore;
					var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppPrefs);
					if(currentRelease){
						me.ReleaseRecord = currentRelease;
						me._workweekData = me._getWorkWeeksForDropdown(currentRelease.data.ReleaseStartDate, currentRelease.data.ReleaseDate);
						console.log('release loaded', currentRelease);
						me._setRefreshInterval(); 
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
	
	/************************************************ NAVIGATION AND STATE ****************************************************/
	
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
	
	_trainPickerSelected: function(combo, records){
		var me=this, pid = me.ProjectRecord.data.ObjectID;
		if(me.TrainRecord.data.Name.indexOf(records[0].data.Name) === 0) return;
		me.setLoading(true);
		me.TrainRecord = me.AllTrainRecordsStore.findRecord('Name', records[0].data.Name + ' ART');	//NOT FINDEXACTRECORD!	
		if(typeof me.AppPrefs.projs[pid] !== 'object') me.AppPrefs.projs[pid] = {};
		me.AppPrefs.projs[pid].Train = me.TrainRecord.data.ObjectID;
		me._savePreferences(me.AppPrefs)
			.then(function(){ me._reloadEverything(); })
			.fail(function(reason){
				me._alert('ERROR', reason || '');
				me.setLoading(false);
			})
			.done();
	},
	
	_loadTrainPicker: function(){
		var me=this;
		if(me.ProjectNotInTrain){
			me.down('#navbox_left').add({
				xtype:'intelfixedcombo',
				width:240,
				labelWidth:40,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],				
					sorters: [function(o1, o2){ return o1.data.Name < o2.data.Name ? -1 : 1; }],
					data: me.TrainNames
				}),
				displayField: 'Name',
				fieldLabel: 'Train:',
				value:me.TrainRecord.data.Name.split(' ART')[0],
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._trainPickerSelected.bind(me)
				}
			});
		}
	},
	
	_refreshComboSelected: function(combo, records){
		var me=this, 
			rate = records[0].data.Rate;
		if(me.AppPrefs.refresh === rate) return;
		me.AppPrefs.refresh = rate;
		me._setRefreshInterval();
		me._savePreferences(me.AppPrefs);
	},
				
	_loadRefreshIntervalCombo: function(){
		var me=this;
		me.down('#navbox_right').add({
			xtype:'intelfixedcombo',
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
			value:me.AppPrefs.refresh,
			listeners: {
				change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
				select: me._refreshComboSelected.bind(me)
			}
		});
	},
	
	_loadManualRefreshButton: function(){
		var me=this;
		me.down('#navbox_right').add({
			xtype:'button',
			text:'Refresh Data',
			style:'margin: 5px 0 0 5px',
			width:100,
			listeners:{
				click: me._refreshDataFunc.bind(me)
			}
		});
	},
	
	/******************************************************* RENDER GRIDS ********************************************************/	

	_loadTeamCommitsGrid: function(){
		var me = this;	
		
		me._TeamCommitsCountHash = {};
		me._TeamCommitsEstimateHash = {};
		
		var customTeamCommitsRecords = _.map(me.FeatureStore.getRecords(), function(featureRecord){
			var tc = me._getTeamCommit(featureRecord);
			return {
				Commitment: tc.Commitment || 'Undecided',
				Objective: tc.Objective || '',
				Name: featureRecord.data.Name,
				FormattedID: featureRecord.data.FormattedID,
				ObjectID: featureRecord.data.ObjectID,
				Product: me.FeatureProductHash[featureRecord.data.ObjectID],
				PlannedEnd: new Date(featureRecord.data.PlannedEndDate)*1
			};
		});		
		
		me.CustomTeamCommitsStore = Ext.create('Intel.data.FastStore', {
			data: customTeamCommitsRecords,
			model:'IntelTeamCommits',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id:'TeamCommitsProxy' + Math.random()
			},
			intelUpdate: function(){
				var tcStore = me.CustomTeamCommitsStore, 
					tcRecords = tcStore.getRange();
				tcStore.suspendEvents(true);
				console.log('syncing teamCommits with features', tcRecords, me.FeatureStore.getRecords());
				tcRecords.forEach(function(tcRecord){
					var featureRecord = me.FeatureStore.findExactRecord('ObjectID', tcRecord.data.ObjectID);
					if(featureRecord) {
						var newVal = me._getTeamCommit(featureRecord);
						if(tcRecord.data.Commitment != newVal.Commitment)
							tcRecord.set('Commitment', newVal.Commitment || 'Undecided');
						if(tcRecord.data.Objective != (newVal.Objective || ''))
							tcRecord.set('Objective', newVal.Objective || '');
					}
				});
				tcStore.resumeEvents();
			}
		});
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				width:60,
				editor:false,
				sortable:true,
				resizable:false,
				renderer:function(FID){
					var feature = me.FeatureStore.findExactRecord('FormattedID', FID);
					if(feature.data.Project) {
						return '<a href="https://rally1.rallydev.com/#/' + feature.data.Project.ObjectID + 'd/detail/portfolioitem/feature/' + 
								feature.data.ObjectID + '" target="_blank">' + FID + '</a>';
					}
					else return FID;
				}
			},{
				text:'Feature', 
				dataIndex:'Name',
				flex:1,
				editor:false,
				resizable:false
			},{
				text:'Product', 
				dataIndex:'Product',
				width:70,
				editor:false,
				resizable:false
			},{
				text:'Stories', 
				dataIndex:'ObjectID',
				sortable:true, 
				editor:false,
				resizable:false,
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					var field = this.getSortParam();
					ds.sort({
						sorterFn: function(f1, f2){ //sort by stories for this team in each feature
							var diff = me._getStoryCount(f1.data.ObjectID) - me._getStoryCount(f2.data.ObjectID);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:70,
				renderer:function(oid){
					return me._getStoryCount(oid);
				}
			},{
				text:'Plan Estimate', 
				dataIndex:'ObjectID',
				sortable:true, 
				editor:false,
				resizable:false,
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					var field = this.getSortParam();
					ds.sort({
						sorterFn: function(f1, f2){ //sort by stories for this team in each feature
							var diff = me._getStoriesEstimate(f1.data.ObjectID) - me._getStoriesEstimate(f2.data.ObjectID);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:70,
				renderer:function(oid){
					return me._getStoriesEstimate(oid);
				}
			},{
				text:'Planned End',
				dataIndex:'PlannedEnd',
				sortable:true, 
				editor:false,
				resizable:false,
				width:70,
				renderer: function(ed){
					return (ed ? 'ww' + me._getWorkweek(new Date(ed)) : '-');
				}
			},{
				dataIndex:'Commitment',
				text:'Status',	
				width:100,
				tdCls: 'intel-editor-cell',	
				sortable:true, 
				resizable:false,
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{Status:'Undecided'},
							{Status:'N/A'},
							{Status:'Committed'},
							{Status:'Not Committed'}
						]
					}),
					displayField: 'Status'
				}
			},{
				text:'Objective', 
				dataIndex:'Objective',
				flex:1,
				tdCls: 'intel-editor-cell',	
				editor: 'inteltextarea',
				resizable:false,
				sortable:false,
				renderer: function(val){ return val || '-'; }
			}
		];
		
		me.TeamCommitsGrid = me.down('#tc_vel_box').add({
			xtype: 'rallygrid',
      title: "Team Commits",
			height:300,
			flex:2,
			padding:'0 20px 0 0',
			scroll:'vertical',
			columnCfgs: columnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(tcRecord, index, rowParams, store){
					var val = tcRecord.data.Commitment || 'Undecided';					
					if(val == 'N/A') return 'grey-row';
					if(val == 'Committed') return 'green-row';
					if(val == 'Not Committed') return 'red-row';
				}
			},
			listeners: {
				beforeedit: function(){
					me._isEditingTeamCommits = true;				
				},
				canceledit: function(){
					me._isEditingTeamCommits = false;
				},
				edit: function(editor, e){
					var grid = e.grid, tcRecord = e.record,
						field = e.field, value = e.value, originalValue = e.originalValue;						
					if(value === originalValue) {
						me._isEditingTeamCommits = false;
						return; 
					}
					else if(!value) { 
						tcRecord.set(field, originalValue); 
						me._isEditingTeamCommits = false;
						return; 
					}
					else if(field==='Objective'){
						value = me._htmlEscape(value);			
						tcRecord.set(field, value);
					}
					var tc = {
						Commitment: tcRecord.data.Commitment, 
						Objective: tcRecord.data.Objective 
					};	
					me.TeamCommitsGrid.setLoading(true);
					me._enqueue(function(unlockFunc){
						me._loadFeature(tcRecord.data.ObjectID).then(function(realFeature){
							if(!realFeature) console.log('ERROR: realFeature not found, ObjectID: ' + oid);
							else return me._setTeamCommit(realFeature, tc);
						})
						.then(function(){ 
							me.TeamCommitsGrid.setLoading(false);
							me._isEditingTeamCommits = false;
							unlockFunc();
						})
						.fail(function(reason){ 
							me._alert('ERROR', reason);
							me.TeamCommitsGrid.setLoading(false); 
							me._isEditingTeamCommits = false;
							unlockFunc();
						})
						.done();
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomTeamCommitsStore
		});	
	},
		
	_loadVelocityGrid: function() {
		var me = this;	
		var iterationGroups = _.groupBy(me.UserStoryStore.getRecords(), function(us) { 
			return us.data.Iteration ? us.data.Iteration.Name : '__DELETE__' ; });
		delete iterationGroups.__DELETE__; //ignore those not in an iteration
        
    var iterationGroupTotals = _.sortBy(_.map(me.IterationStore.getRecords(), function(iteration) {
			var iName = iteration.data.Name;
			return {    
				Name:iName, 
				PlannedVelocity: iteration.data.PlannedVelocity || 0,
				RealVelocity:_.reduce((iterationGroups[iName] || []), function(sum, us) {
						return sum + us.data.PlanEstimate;
				}, 0)
			};
		}), 'Name');

		me.CustomVelocityStore = Ext.create('Intel.data.FastStore', {
			data: iterationGroupTotals,
			model:'IntelVelocity',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id:'VelocityProxy' + Math.random()
			},
			intelUpdate: function(){
				var velStore = me.CustomVelocityStore, 
					velRecords = velStore.getRange();
				velStore.suspendEvents(true);
				console.log('syncing velocity with current iterations', velRecords, me.IterationStore.getRecords());
				velRecords.forEach(function(velRecord){
					var iterationName = velRecord.data.Name;
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
					var newVal = iteration.data.PlannedVelocity || 0;
					if(newVal != velRecord.data.PlannedVelocity){
						velRecord.set('PlannedVelocity', iteration.data.PlannedVelocity || 0);
						console.log('velocity record update', velRecord);
					}
				});
				velStore.resumeEvents();
			}
		});
		
		var columnCfgs = [
			{	
				text: 'Iteration',
				dataIndex: 'Name', 
				flex: 2,
				editor:false,
				resizable:false,
				sortable:true,
				renderer:function(name, meta, velocityRecord){
					var iteration = me.IterationStore.findExactRecord('Name', name);
					if(iteration.data.Project) {
						var pid = iteration.data.Project._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/iteration/' + 
								iteration.data.ObjectID + '" target="_blank">' + name + '</a>';
					}
					else return name;
				}
			},{
				text: 'Target Capacity',
				dataIndex: 'PlannedVelocity',
				flex:1,
				tdCls: 'intel-editor-cell',
				editor:'textfield',
				resizable:false,
				sortable:true,
				tooltip:'(Planned Velocity)',
				tooltipType:'title',
				renderer:function(n, m){
					m.tdCls += (n*1===0 ? ' red-cell' : '');
					return n;
				}
			},{
				text: 'Actual Load',
				dataIndex: 'RealVelocity',
				flex:1,
				editor:false,
				resizable:false,
				sortable:false,
				tooltip:'(Plan Estimate)',
				tooltipType:'title',
				renderer:function(realVel, m, r){
					m.tdCls += ((realVel*1 < r.data.PlannedVelocity*0.9) ? ' yellow-cell' : '');
					m.tdCls += ((realVel*1 === 0 || realVel*1 > r.data.PlannedVelocity*1) ? ' red-cell' : '');
					return realVel;
				}
			}
		];
		me.VelocityGrid = me.down('#tc_vel_box').add({
			xtype: 'rallygrid',
			title: "Velocity",
			scroll:'vertical',
			height:300,
			flex:1,
			showPagingToolbar: false,
			showRowActionsColumn:false,
			disableSelection: true,
			viewConfig: {
				stripeRows: true,
				preserveScrollOnRefresh:true
			},
			listeners: {
				beforeedit: function(editor, e){
					me._isEditingVelocity = true;
					return true;
				},
				canceledit: function(){
					me._isEditingVelocity = false;
				},
				edit: function(editor, e){
					var grid = e.grid,
						velocityRecord = e.record,
						value = e.value,
						originalValue = e.originalValue;
					
					if(value.length===0 || isNaN(value) || (value*1<0) || (value*1 === originalValue*1)) { 
						velocityRecord.set('PlannedVelocity', originalValue);
						me._isEditingVelocity = false; 
						return; 
					}
					value = value*1 || 0; //value*1 || null to remove the 0's from teams
					var iterationName = velocityRecord.data.Name,
						iteration = me.IterationStore.findExactRecord('Name', iterationName); //we don't need the most recent iteration here
					iteration.set('PlannedVelocity', value);
					me.VelocityGrid.setLoading(true);
					iteration.save({ 
						callback: function(record, operation, success){
							if(!success){
								me._alert('ERROR', 'Could not modify Iteration');
								velocityRecord.set('PlannedVelocity', originalValue);
							} else {
								velocityRecord.set('PlannedVelocity', value);
							}
							me._isEditingVelocity = false;
							me.VelocityGrid.setLoading(false);
						} 
					});
				}
			},
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			enableEditing:false,
			columnCfgs: columnCfgs,
			store: me.CustomVelocityStore
		});
	},

	_loadRisksGrid: function(){
		var me = this;
		
		/****************************** STORES FOR THE DROPDOWNS  ***********************************************/	
		me.FeatureFIDStore = Ext.create('Ext.data.Store', {
			fields: ['FormattedID'],
			data: _.map(me.FeatureStore.getRange(), function(f){
				return {'FormattedID': f.data.FormattedID};
			}),
			sorters: { property: 'FormattedID' }
		});
		
		me.FeatureNameStore = Ext.create('Ext.data.Store', {
			fields: ['Name'],
			data: _.map(me.FeatureStore.getRange(), function(f){
				return {'Name': f.data.Name };
			}),
			sorters: { property: 'Name' }
		});
		
		/****************************** RISKS STUFF  ***********************************************/	
		
		function riskSorter(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; } //new come first
		
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
					var realRiskData = me._removeRiskFromList(riskRecord.data.RiskID, realRisksDatas);
					
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
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',	
				width:80,
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: me.FeatureFIDStore,
					displayField: 'FormattedID'
				},			
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor:{
					xtype:'intelcombobox',
					store: me.FeatureNameStore,
					displayField: 'Name'
				},
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
				renderer:function(date){ return date ? 'ww' + me._getWorkweek(date) : '-'; }		
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
									if(!riskRecord.data.FormattedID || !riskRecord.data.FeatureName){
										me._alert('ERROR', 'You must set the Feature affected by this risk'); return; } 
									else if(!riskRecord.data.Checkpoint){
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
			},{
				text:'',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					meta.tdAttr = 'title="Delete Risk"';
					return {
						xtype:'container',
						width:20,
						cls: 'delete-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									me._confirm('Confirm', 'Delete Risk?', function(msg){
										if(msg.toLowerCase() !== 'yes') return;
										me.RisksGrid.setLoading(true);
										me._enqueue(function(unlockFunc){
											me._loadFeature(riskRecord.data.ObjectID).then(function(oldFeatureRecord){					
												return Q(oldFeatureRecord && 
													(function(){										
														var riskRecordData = riskRecord.data,
															oldRealRisksData = me._parseRisksFromFeature(oldFeatureRecord),
															oldRealRiskData = me._removeRiskFromList(riskRecordData.RiskID, oldRealRisksData);							
														if(oldRealRiskData) 
															return me._removeRisk(oldFeatureRecord, oldRealRiskData);
													}())
												);
											})
											.then(function(){
												me.CustomRisksStore.remove(riskRecord);
												me.RisksGrid.setLoading(false);
												unlockFunc();
											})
											.fail(function(reason){
												me._alert('ERROR:', reason);
												me.CustomRisksStore.remove(riskRecord);
												me.RisksGrid.setLoading(false);
												unlockFunc();
											})
											.done();
										});
									});
								}
							}
						}
					};
				}
			}
		];

		me.AddRiskButton = me.add({
			xtype:'container',
			padding:'20px 0 0 0',
			items:[{
				xtype:'button',
				text:'+ Add Risk',
				width:80,
				listeners:{
					click: function(){
						if(!me.FeatureStore.first()) me._alert('ERROR', 'No Features for this Release!');
						else if(me.CustomRisksStore) {
							var model = Ext.create('IntelRisk', {
								RiskID: (new Date() * 1) + '' + (Math.random() * 100 >> 0),
								ObjectID: '',
								FormattedID: '',
								FeatureName: '',
								Description: '',
								Impact: '',
								Status: '',
								Contact: '',
								Checkpoint: '',
								Edited:true
							});
							me.CustomRisksStore.insert(0, [model]);
							me.RisksGrid.view.getEl().setScrollTop(0);
							me.RisksGrid.getSelectionModel().select(model);
						}
					}
				}
			}]
		});
		
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
					
					var featureRecord;
					if(field === 'FeatureName'){
						featureRecord = me.FeatureStore.findExactRecord('Name', value);
						if(!featureRecord){
							risksRecord.set('FeatureName', originalValue);
							risksRecord.set('Edited', previousEdit);
						} else risksRecord.set('FormattedID', featureRecord.data.FormattedID);
					} else if(field === 'FormattedID'){
						featureRecord = me.FeatureStore.findExactRecord('FormattedID', value);
						if(!featureRecord) {
							risksRecord.set('FormattedID', originalValue);
							risksRecord.set('Edited', previousEdit); 
						} else risksRecord.set('FeatureName', featureRecord.data.Name);
					} 
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
		
		/****************************** STORES FOR THE DROPDOWNS  ***********************************************/	
		me.UserStoryFIDStore = Ext.create('Ext.data.Store', {
			fields: ['FormattedID'],
			data: _.map(me.DependenciesReleaseUserStories, function(usr){
				return {'FormattedID': usr.data.FormattedID};
			}),
			sorters: { property: 'FormattedID' }
		});
		
		me.UserStoryNameStore = Ext.create('Ext.data.Store', {
			fields: ['Name'],
			data: _.map(me.DependenciesReleaseUserStories, function(usr){
				return {'Name': usr.data.Name };
			}),
			sorters: { property: 'Name' }
		});
		
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
					key;
				console.log('syncing predDeps with current userStories', predDepRecs, realPredDepsData);
				predDepStore.suspendEvents(true);
				for(var i = 0;i<predDepRecs.length;++i){
					var depRec =  predDepRecs[i], //predecessor dependency record to be updated
						depID = depRec.data.DependencyID,
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
						if(!_.isEqual(depRec.data.Predecessors, realDep.Predecessors)){ //faster to delete and readd if preds are different
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
					var preds = depRec.data.Predecessors;
					//DO NOT SET EDITED==true, because it is already true! only new or edited will ever have preds.length==0
					if(!preds.length) {
						depRec.set('Predecessors', [me._newTeamDep()]); 
						if(teamStore) teamStore.intelUpdate();
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
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				width:80,
				resizable:false,				
				sortable:true,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: me.UserStoryFIDStore,
					displayField: 'FormattedID'
				},
				renderer: function(val){ return val || '-'; }		
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:1,
				resizable:false,			
				sortable:true,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
					displayField: 'Name'
				},
				renderer: function(val){ return val || '-'; }			
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				resizable:false,			
				sortable:false,
				tdCls: 'intel-editor-cell',
				editor: 'inteltextarea',
				renderer: function(val){ return val || '-'; }				
			},{
				text:'Needed By',			
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				sortable:true,
				tdCls: 'intel-editor-cell',		
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
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');}
			},{
				text:'Teams Depended On',
				dataIndex:'DependencyID',
				xtype:'fastgridcolumn',
				html:	'<div class="pred-dep-header" style="width:30px !important;"></div>' +
						'<div class="pred-dep-header" style="width:140px !important;">Team Name</div>' +
						'<div class="pred-dep-header" style="width:65px  !important;">Supported</div>' +
						'<div class="pred-dep-header" style="width:70px  !important;">US#</div>' +
						'<div class="pred-dep-header" style="width:130px !important;">User Story</div>',
				width:480,
				resizable:false,
				sortable:false,
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
							sorters:[depTeamSorter],
							intelUpdate: function(){
								var predDepStore = me.CustomPredDepStore,
									depTeamStore = me.PredDepTeamStores[depID],
									depTeamRecords = depTeamStore.getRange(),
									predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
									predecessors = predDepRecord.data.Predecessors.slice();
								depTeamStore.suspendEvents(true);
								Outer:
								for(var i = 0;i<depTeamRecords.length;++i){
									var depTeamRecord = depTeamRecords[i],
										realTeamDep, key;
									for(var j=0; j<predecessors.length;++j){
										if(predecessors[j].TID === depTeamRecord.data.TID){
											realTeamDep = predecessors.splice(j, 1)[0];
											for(key in realTeamDep){
												if(!_.isEqual(depTeamRecord.get(key), realTeamDep[key])){ 
													depTeamStore.remove(depTeamRecord);
													depTeamStore.add(Ext.create('IntelDepTeam', Ext.clone(realTeamDep)));
													continue Outer;
												}
											}
										}
									}
									depTeamStore.remove(depTeamRecord);
								}
								
								predecessors.forEach(function(realTeamDep){ 
									depTeamStore.add(Ext.create('IntelDepTeam', realTeamDep));
								});	
								
								if(depTeamStore.getRange().length===0) {
									var newItem = me._newTeamDep();
									depTeamStore.add(Ext.create('IntelDepTeam', newItem));
									predDepRecord.data.Predecessors.push(newItem);
								}
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
							renderer: function(val, meta){
								var projectRecord = me.ValidProjects[val];
								if(val && projectRecord) return projectRecord.data.Name;
								else {
									meta.tdCls += 'intel-editor-cell';
									return '-';
								}
							},
							editor: {
								xtype:'intelcombobox', 
								store: Ext.create('Ext.data.Store', {
									fields: ['Name'],
									data: me.ProjectNames,
									sorters: { property: 'Name' }
								}),
								displayField: 'Name'
							}
						},{
							dataIndex:'Sup',
							width:50,
							resizable:false,
							editor: false,
							renderer: function(val, meta){
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
						},{
							resizable:false,
							width:30,
							xtype:'fastgridcolumn',
							tdCls: 'iconCell',
							renderer: function(val, meta, depTeamRecord){
								meta.tdAttr = 'title="Delete Team"';
								return {
									xtype:'container',
									width:20,
									cls: 'minus-button intel-editor-cell',
									listeners:{
										click: {
											element: 'el',
											fn: function(){
												var predDepStore = me.CustomPredDepStore,
													predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
													predecessors = Ext.clone(predDepRecord.data.Predecessors),
													teamStore = me.PredDepTeamStores[depID];										
												teamStore.suspendEvents(true);
												for(var i=0; i<predecessors.length; ++i)
													if(predecessors[i].TID === depTeamRecord.data.TID){
														predecessors.splice(i, 1); break; }
												teamStore.remove(depTeamRecord);
												
												if(!predecessors.length){
													var newItem = me._newTeamDep();
													teamStore.add(Ext.create('IntelDepTeam', newItem));
													predecessors.push(newItem);
												}
												predDepRecord.set('Edited', true);
												predDepRecord.set('Predecessors', predecessors); //if we don't use 'set', it won't refresh cell, or grid height
												teamStore.resumeEvents();
												//me.PredDepGrid.view.refreshNode(me.CustomPredDepStore.indexOf(predDepRecord));//fix row not resizing
											}
										}
									}
								};
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
						items: [
							{
								xtype:'container',
								width:20,
								cls: 'plus-button intel-editor-cell',
								autoEl:{ 
									title:'Add Team'
								},
								listeners:{
									click: {
										element: 'el',
										fn: function(){
											if(me.PredDepTeamStores[depID]) {
												//scrolling is taken care of by the scrollsteadytableview
												var predDepStore = me.CustomPredDepStore,
													predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
													newItem = me._newTeamDep();
												me.PredDepTeamStores[depID].insert(0, [Ext.create('IntelDepTeam', newItem)]);
												predDepRecord.set('Predecessors', predDepRecord.data.Predecessors.concat([newItem])); //use set() to update rowheight
												predDepRecord.set('Edited', true);	
											}
										}
									}
								}
							},{
								xtype: 'rallygrid',	
								width:450,
								rowLines:false,
								columnCfgs: teamColumnCfgs,
								disableSelection: true,
								plugins: [ 'fastcellediting' ],
								viewConfig: {
									stripeRows:false,
									getRowClass: function(teamDepRecord, index, rowParams, store){
										if(!teamDepRecord.data.PID) return 'intel-team-dep-row';
										//if(!teamDepRecord.data.PID) return 'intel-row-35px intel-team-dep-row';
										//else return 'intel-row-35px';
									}
								},
								listeners: {
									beforeedit: function(editor, e){
										if(!!e.value) return false; //don't edit if has value
									},
									edit: function(editor, e){									
										/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
											to improve performance.**/		
										var depTeamRecord = e.record,
											field = e.field,
											value = e.value,
											originalValue = e.originalValue,
											predDepStore = me.CustomPredDepStore,
											predDepRecord = predDepStore.getAt(predDepStore.findExact('DependencyID', depID)),
											predecessors = predDepRecord.data.Predecessors,
											i;			
										if(value === originalValue) return;										
										if(field === 'PID'){
											var projectRecord = _.find(me.ValidProjects, function(vp){ return vp.data.Name === value; });
											if(!projectRecord) {
												depTeamRecord.set('PID', originalValue);
												return;
											} else {
												for(i = 0;i<predecessors.length;++i){
													if(predecessors[i].PID == projectRecord.data.ObjectID){
														me._alert('ERROR', value + ' already included in this dependency');
														depTeamRecord.set('PID', originalValue);
														return;
													}
												}
												if(projectRecord.data.ObjectID === me.ProjectRecord.data.ObjectID){
													me._alert('ERROR', 'You cannot depend on yourself');
													depTeamRecord.set('PID', originalValue);
													return;
												}
												depTeamRecord.set('PID', projectRecord.data.ObjectID);
											}
										}
												
										for(i=0; i<predecessors.length; ++i){
											if(predecessors[i].TID === depTeamRecord.data.TID){
												predecessors[i].PID = depTeamRecord.data.PID; //update the predDepRecord, but dont need to propagate using set()
												break; 
											}
										}
										predDepRecord.set('Edited', true);
									},
									selectionchange: function(){ this.getSelectionModel().deselectAll(); }
								},
								hideHeaders:true,
								showRowActionsColumn:false,
								scroll:false,
								showPagingToolbar:false,
								enableEditing:false,
								context: me.getContext(),
								store: me.PredDepTeamStores[depID]
							}
						],
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
							resize: function(d, w, h, oldw, oldh){ 
								var viewHeight = me.PredDepGrid.view.el.clientHeight,
									viewScrollHeight = me.PredDepGrid.view.el.dom.scrollHeight,
									maxHeight = me.PredDepGrid.maxHeight - 
										(me.PredDepGrid.view.headerCt.el.dom.clientHeight + me.PredDepGrid.header.el.dom.clientHeight) + 2;
									changeHeight = h - oldh;
								if(viewScrollHeight < maxHeight || 
									((viewScrollHeight - changeHeight <=  maxHeight) != (viewScrollHeight <= maxHeight))){
									me.PredDepGrid.view.updateLayout(); 
								}
							}
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				xtype:'fastgridcolumn',
				width:30,
				resizable:false,
				tdCls: 'iconCell',
				renderer: function(value, meta, predDepRecord){	
					var realDepData = me._removeDepFromList(predDepRecord.data.DependencyID, me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = me._getDirtyType(predDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					meta.tdAttr = 'title="Undo"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var depID = predDepRecord.data.DependencyID;
									var realDep = me._removeDepFromList(depID, me.DependenciesParsedData.Predecessors.slice(0));
									predDepRecord.beginEdit();
									for(var key in realDep){
										if(key === 'Predecessors') predDepRecord.set(key, Ext.clone(realDep[key]) || [me._newTeamDep()]);
										else predDepRecord.set(key, realDep[key]);
									}	
									predDepRecord.endEdit();
									me.PredDepTeamStores[depID].intelUpdate();
								}
							}
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				xtype:'fastgridcolumn',
				width:30,
				resizable:false,
				tdCls: 'iconCell',
				renderer: function(value, meta, predDepRecord){				
					var realDepData = me._removeDepFromList(predDepRecord.data.DependencyID, me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = me._getDirtyType(predDepRecord, realDepData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Save';
					else return ''; //don't render it!
					meta.tdAttr = 'title="' + dirtyType + ' Dependency"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									//validate fields first
									if(!predDepRecord.data.FormattedID || !predDepRecord.data.UserStoryName){
										me._alert('ERROR', 'A UserStory is not selected'); return; }
									if(!predDepRecord.data.Description){
										me._alert('ERROR', 'The description is empty'); return; }
									if(!predDepRecord.data.Checkpoint){
										me._alert('ERROR', 'Select When the dependency is needed by'); return; }
									var predecessors = predDepRecord.data.Predecessors;
									if(!predecessors.length){
										me._alert('ERROR', 'You must specify a team you depend on'); return; }
									if(_.find(predecessors, function(p){ return p.PID === ''; })){
										me._alert('ERROR', 'All Team Names must be valid'); return; }
									
									me.PredDepGrid.setLoading(true);
									me._enqueue(function(unlockFunc){
										var predDepData = predDepRecord.data;
										/** NOTE ON ERROR HANDLING: we do NOT proceed at all if permissions are insufficient to edit a project, or a project has no user stories to attach to
												we first edit all the successors fields and collections for the teams we depend upon, and then we edit the predecessor field on THIS user story.
												If a collection sync fails, it retries 4 times, and then it gives up. It is not imperative that the predecessor/successor fields are exactly perfect
												if a user story save fails, JUST THAT USER STORY FAILS, everything else will continue on normally. */
										me._getOldAndNewUSRecords(predDepData).then(function(records){
											var oldUSRecord = records[0], newUSRecord = records[1],
												realDepData = me._getRealDepData(oldUSRecord, predDepData, 'Predecessors'),
												teamDeps = me._getTeamDepArrays(predDepData, realDepData),
												i, len;
											return me._getAddedTeamDepCallbacks(teamDeps.added, predDepData).then(function(addedCallbacks){	
												return me._getUpdatedTeamDepCallbacks(teamDeps.updated, predDepData).then(function(updatedCallbacks){
													return me._getRemovedTeamDepCallbacks(teamDeps.removed, predDepData).then(function(removedCallbacks){
														var promise = Q();
														for(i=0, len=removedCallbacks.length; i<len; ++i){ promise = promise.then(removedCallbacks[i]); }//execute the removed teams now
														for(i=0, len=addedCallbacks.length; i<len; ++i){ promise = promise.then(addedCallbacks[i]); }//execute the added teams now
														for(i=0, len=updatedCallbacks.length; i<len; ++i){ promise = promise.then(updatedCallbacks[i]); }//execute the updated teams now
														
														promise = promise.then(function(){
															var newTeamDeps = teamDeps.added.concat(teamDeps.updated);
															predDepRecord.beginEdit();
															predDepRecord.set('ObjectID', newUSRecord.data.ObjectID);
															predDepRecord.set('Predecessors', newTeamDeps); //NOTE: added and updated teamDeps DO GET MUTATED before here!
														});
														
														if(realDepData && (oldUSRecord.data.ObjectID !== newUSRecord.data.ObjectID)){
															promise = promise.then(function(){
																return me._removePredDep(oldUSRecord, realDepData);
															});
														}
														return promise
															.then(function(){
																return me._addPredDep(newUSRecord, predDepData);
															})
															.then(function(){							
																predDepRecord.set('Edited', false);
																predDepRecord.endEdit();
															});
													});
												});
											});
										}).then(function(){
											me.PredDepGrid.setLoading(false);
											unlockFunc();
										})
										.fail(function(reason){
											me._alert('ERROR:', reason);
											me.PredDepGrid.setLoading(false);
											unlockFunc();
										}).done();
									});
								}
							}
						}
					};
				}
			},{
				text:'',
				xtype:'fastgridcolumn',
				width:30,
				resizable:false,
				tdCls: 'iconCell',
				renderer: function(value, meta, predDepRecord){		
					meta.tdAttr = 'title="Delete Dependency"';
					return {
						xtype:'container',
						width:20,
						cls: 'delete-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									me._confirm('Confirm', 'Delete Dependency?', function(msg){
										if(msg.toLowerCase() !== 'yes') return;										
										me.PredDepGrid.setLoading(true);
										me._enqueue(function(unlockFunc){
											var predDepData = predDepRecord.data;
											me._getOldAndNewUSRecords(predDepData).then(function(records){
												var oldUSRecord = records[0],
													realDepData = me._getRealDepData(oldUSRecord, predDepData, 'Predecessors'),
													teamDeps = me._getTeamDepArrays(predDepData, realDepData), 
													depsToDelete = teamDeps.removed.concat(teamDeps.updated), //dont care about added 
													i, len;											
												return me._getRemovedTeamDepCallbacks(depsToDelete, predDepData).then(function(removedCallbacks){
													var promise = Q();
													for(i=0, len=removedCallbacks.length; i<len; ++i){ promise = promise.then(removedCallbacks[i]); }//execute the removed teams now
													if(realDepData){
														promise = promise.then(function(){
															return me._removePredDep(oldUSRecord, realDepData);
														});
													}
													return promise
														.then(function(){	
															me.CustomPredDepStore.remove(predDepRecord);
														});
												});
											})
											.then(function(){
												me.PredDepGrid.setLoading(false);
												unlockFunc();
											})
											.fail(function(reason){
												me._alert('ERROR', reason);
												me.PredDepGrid.setLoading(false);
												unlockFunc();
											})
											.done();
										});
									});
								}
							}
						}
					};
				}
			}
		];

		me.AddPredDepButton = me.add({
			xtype:'container',
			padding:'20px 0 0 0',
			items:[{
				xtype:'button',
				text:'+ Add Dependency',
				listeners:{
					click: function(){
						if(!me.DependenciesReleaseUserStories.length) me._alert('ERROR', 'No User Stories for this Release!');
						else if(me.CustomPredDepStore) {
							var model = Ext.create('IntelPredDep', {
								DependencyID: (new Date() * 1) + '' + (Math.random() * 100 >> 0),
								ObjectID:'',
								FormattedID: '',
								UserStoryName: '',
								Description: '',
								Checkpoint: '',
								Predecessors:[me._newTeamDep()],
								Edited:true
							});
							me.CustomPredDepStore.insert(0, [model]);	
							me.PredDepGrid.view.getEl().setScrollTop(0);
							//me.PredDepGrid.getSelectionModel().select(model);
						}
					}
				}
			}]
		});
		
		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
      title: "Dependencies We Have on Other Teams",
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
						originalValue = e.originalValue;
					
					if(value === originalValue) return; 
					else if(!value) { predDepRecord.set(field, originalValue); return; }
					if(field === 'Description') {
						value = me._htmlEscape(value);			
						predDepRecord.set(field, value);
					}

					var previousEdit = predDepRecord.data.Edited; 
					predDepRecord.set('Edited', true);
					
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.data.Name === value; });
						if(!userStoryRecord){
							predDepRecord.set('UserStoryName', originalValue);
							predDepRecord.set('Edited', previousEdit);
						} else predDepRecord.set('FormattedID', userStoryRecord.data.FormattedID);
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.data.FormattedID === value; });
						if(!userStoryRecord) {
							predDepRecord.set('FormattedID', originalValue);
							predDepRecord.set('Edited', previousEdit);
						} else predDepRecord.set('UserStoryName', userStoryRecord.data.Name);
					}
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			store: me.CustomPredDepStore
		});	
	
		/****************************** SUCCESSORS    STUFF           ***********************************************/	
		me.CustomSuccDepStore = Ext.create('Intel.data.FastStore', { 
			data: Ext.clone(me.DependenciesParsedData.Successors.slice(0)),
			autoSync:true,
			model:'IntelSuccDep',
			proxy: {
				type: 'fastsessionproxy',
				id:'SuccDepProxy' + Math.random()
			},
			limit:Infinity,
			sorters:[depSorter],
			intelUpdate: function(){
				var succDepStore = me.CustomSuccDepStore,
					customSuccDepRecs = succDepStore.getRange(), 
					realSuccDepsData = me.DependenciesParsedData.Successors.slice(0), //shallow copy of it
					remoteChanged = false, //if someone else updated this while it was idle on our screen	
					key;
				console.log('syncing succDeps with current userStories', customSuccDepRecs, realSuccDepsData);
				succDepStore.suspendEvents(true);
				for(var i = 0;i<customSuccDepRecs.length;++i){
					var depRec =  customSuccDepRecs[i]; //predecessor dependency record to be updated
					
					var depID = depRec.data.DependencyID;
					var realDep = me._removeDepFromList(depID, realSuccDepsData);	
						
					var dirtyType = me._getDirtyType(depRec, realDep);
					if(dirtyType === 'Edited') //we don't want to remove any pending changes
						continue;						
					else if(dirtyType === 'Deleted' || dirtyType === 'New'){ // the depRec was deleted by someone else, and we arent editing it
						succDepStore.remove(depRec);
					} else {
						for(key in realDep){
							if(!_.isEqual(depRec.get(key), realDep[key])){ remoteChanged = true; break; }
						}
						if(remoteChanged){
							depRec.beginEdit();
							for(key in realDep)
								depRec.set(key, realDep[key]);
							depRec.endEdit();
						}
					}
				}
				realSuccDepsData.forEach(function(realDep){ 
					console.log('adding succDep', realDep);
					succDepStore.add(Ext.create('IntelSuccDep', Ext.clone(realDep)));
				});
				succDepStore.resumeEvents();
			}
		});
		
		var succDepColumnCfgs = [
			{
				text:'Requested By', //'Predecesor Project',
				dataIndex:'SuccProjectID',
				width:160,
				resizable:false,
				sortable:true,
				renderer: function(pid){
					var project = me.ValidProjects[pid];
					return project ? project.data.Name : pid;
				}
			},{
				text:'Req Team US#',
				dataIndex:'SuccFormattedID',
				width:85,
				resizable:false,
				sortable:true
			},{
				text:'Req Team UserStory',
				dataIndex:'SuccUserStoryName',
				flex:1,
				resizable:false,
				sortable:true		
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				resizable:false,
				editor: false,
				sortable:false					
			},{
				text:'Needed By',
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				editor: false,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-');}				
			},{
				text:'Supported',					
				dataIndex:'Supported',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelfixedcombo',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Sup'],
						data: [
							{Sup:'Yes'},
							{Sup:'No'}
						]
					}),
					displayField: 'Sup'
				},
				renderer: function(val, meta){
					if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
					else meta.tdCls = 'intel-supported-cell';
					return val;
				},
				sortable:true
			},{
				text:'Sup US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:80,
				resizable:false,
				editor:{
					xtype:'intelcombobox',
					width:120,
					store: me.UserStoryFIDStore,
					displayField: 'FormattedID'
				},
				sortable:true,
				renderer:function(val){ return val || '-'; }	
			},{
				text:'Sup UserStory', 
				dataIndex:'UserStoryName',
				flex:1,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
					displayField: 'Name'
				},
				sortable: true,
				renderer:function(val){ return val || '-'; }	
			},{
				text:'',
				dataIndex:'Edited',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){			
					if(!succDepRecord.data.FormattedID) return '';
					meta.tdAttr = 'title="' + 'Remove User Story' + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'minus-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									succDepRecord.set('Edited', true);
									succDepRecord.set('Assigned', false);
									succDepRecord.set('FormattedID', '');
									succDepRecord.set('UserStoryName', '');
								}
							}
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){		
					var realDepData = me._removeDepFromList(succDepRecord.data.DependencyID, me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = me._getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					meta.tdAttr = 'title="Undo"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var depID = succDepRecord.data.DependencyID;
									var realDep = me._removeDepFromList(depID, me.DependenciesParsedData.Successors.slice(0));	
									succDepRecord.beginEdit(true);
									for(var key in realDep)
										succDepRecord.set(key, realDep[key]);
									succDepRecord.endEdit();
								}
							}
						}
					};
				}
			},{
				text:'',
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){	
					var realDepData = me._removeDepFromList(succDepRecord.data.DependencyID, me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = me._getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					meta.tdAttr = 'title="Save Dependency"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									//no field validation needed
									if(!succDepRecord.data.Supported){
										me._alert('ERROR', 'You must set the Supported field.'); return; }
									me.SuccDepGrid.setLoading(true);
									me._enqueue(function(unlockFunc){
										var succDepData = succDepRecord.data, oldUSRecord, newUSRecord;
										me._getOldAndNewUSRecords(succDepData).then(function(records){
											oldUSRecord = records[0];
											newUSRecord = records[1];
											
											var realDepData = me._getRealDepData(oldUSRecord, succDepData, 'Successors'); //might be undefined if pred team deleted then readded this team on the dep!
											if(!realDepData) return Q.reject(['Successor removed this dependency.']);
											
											succDepData.ObjectID = newUSRecord.data.ObjectID;
											succDepData.SuccFormattedID = realDepData.SuccFormattedID;
											succDepData.SuccUserStoryName = realDepData.SuccUserStoryName;
											
											return me._updateSuccessor(succDepData, newUSRecord)
												.then(function(){									
													if(oldUSRecord.data.ObjectID !== newUSRecord.data.ObjectID)
														return me._removeSuccDep(oldUSRecord, realDepData);
												})
												.then(function(){
													return me._addSuccDep(newUSRecord, succDepData);
												})
												.then(function(){
													succDepRecord.set('Edited', false);
												});
										})
										.then(function(){
											me.SuccDepGrid.setLoading(false);
											unlockFunc();
										})
										.fail(function(reason){ //hacky way to tell if we should delete this successor dependency
											if(reason instanceof Array){
												me._alert('ERROR', reason[0] + ' Deleting this dependency now');
												if(realDepData){
													me._removeSuccDep(oldUSRecord, realDepData).then(function(){
														me.CustomSuccDepStore.remove(succDepRecord);
														me.SuccDepGrid.setLoading(false);
														unlockFunc();
													})
													.fail(function(reason){
														me._alert('ERROR', reason);
														me.SuccDepGrid.setLoading(false);
														unlockFunc();
													})
													.done();
												}
												else {
													me.CustomSuccDepStore.remove(succDepRecord);
													me.SuccDepGrid.setLoading(false);
													unlockFunc();
												}
											}
											else {
												me._alert('ERROR', reason);
												me.SuccDepGrid.setLoading(false);
												unlockFunc();
											}
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
		
		me.SuccDepGrid = me.add({
			xtype: 'rallygrid',
      title: "Dependencies Other Teams Have on Us",
			minHeight:150,
			maxHeight:450,
			style:'margin:40px 10px 0 10px',
			scroll:'vertical',
			columnCfgs: succDepColumnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px'; }
			},
			listeners: {
				beforeedit: function(editor, e){
					var succDepRecord = e.record;
					if(succDepRecord.data.Supported == 'No' && e.field != 'Supported') 
						return false; //don't user story stuff if not supported
				},
				edit: function(editor, e){					
					var grid = e.grid,
						succDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;	
						
					if(value == originalValue) return;
					else if(!value) { succDepRecord.set(field, originalValue); return; }
					var previousEdit = succDepRecord.data.Edited;
					succDepRecord.set('Edited', true);
					
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.data.Name === value; });
						if(!userStoryRecord){
							succDepRecord.set('UserStoryName', originalValue);
							succDepRecord.set('Edited', previousEdit); 
						} else {
							succDepRecord.set('FormattedID', userStoryRecord.data.FormattedID);	
							succDepRecord.set('Assigned', true);
						}
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.data.FormattedID === value; });
						if(!userStoryRecord) {
							succDepRecord.set('FormattedID', originalValue);
							succDepRecord.set('Edited', previousEdit); 
						} else {
							succDepRecord.set('UserStoryName', userStoryRecord.data.Name);	
							succDepRecord.set('Assigned', true);
						}
					}
					else if(field === 'Supported'){ //cant be non-supported with a user story!
						if(value == 'No'){
							succDepRecord.set('Assigned', false);
							succDepRecord.set('FormattedID', '');
							succDepRecord.set('UserStoryName', '');
						}
					}
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomSuccDepStore
		});	
	}	
});