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
//console = { log: function(){} };		
preferenceName = 'intel-program-board';

/********************* END PRODUCTION *****************/
Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	layout: 'absolute',
	height:1620,
	width:1085, //1065+20 for scrollbar
		
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE METHODS ********************************************************/

	//___________________________________GENERAL LOADING STUFF___________________________________	
	_loadModels: function(cb){
		var me = this, finished=0, todo=4;
		function done(){ if(++finished===todo) cb(); }
		
		Rally.data.WsapiModelFactory.getModel({ //load project
			type:'Project', scope:me,
			success: function(model){ 
				me.Project = model;  done();
			}
		});
		Rally.data.WsapiModelFactory.getModel({ //load user Story
			type:'HierarchicalRequirement', scope:me,
			success: function(model){ 
				me.UserStory = model; done(); 
			}
		});
		Rally.data.WsapiModelFactory.getModel({ //load feature
			type:'PortfolioItem/Feature', scope:me,
			success: function(model){ 
				me.Feature = model; done(); 
			}
		});
		Rally.data.ModelFactory.getModel({ //load milestone
			type:'PortfolioItem/Milestone',
			success: function(model){ 
				me.Milestone = model; done();
			}
		});
	},
	
	_loadProject: function(project, cb){ 
		var me = this;
		me.Project.load(project.ObjectID, {
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: cb
		});
	},
	
	_loadFeature: function(oid, cb){ 
		if(!oid){ cb(); return; }
		var me = this;
		me.Feature.load(oid, {
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: me.ProjectRecord.get('_ref')
			},
			callback: cb
		});
	},
	
	_loadUserStory: function(oid, cb){ 
		if(!oid){ cb(); return; }
		var me = this;
		me.UserStory.load(oid, {
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
				'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: me.ProjectRecord.get('_ref')
			},
			callback: cb
		});
	},
	
	_loadMilestone: function(milestone, cb){ 
		var me = this;
		me.Milestone.load(milestone.ObjectID, {
			fetch: ['ObjectID', 'Parent', 'Name'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: function(record, operation){
				if(operation.wasSuccessful()) cb(record);
				else me._showError('failed to retreive milestone: ' + milestone.ObjectID);
			}
		});
	},
	
	_loadReleases: function(cb){ 
		var me = this;
		
		// so we have 2 different filters: for a team in a train, a team not in a train (DCD, HVE), 
		var filterString = Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.ObjectID',
			value: me.ProjectRecord.get('ObjectID')
		});
		var filterString2, f2;
		if(me.TrainRecord){
			var teamName = me.ProjectRecord.get('Name');
			var trainName = me.TrainRecord.get('Name').split(' ART ')[0];
			var trainNames = teamName.split(trainName)[1].replace(/ \(.*\)/, '').split('-');//accounts for alpha-bravo-charlie stuff
			if(!trainNames[0]) trainNames[0] = trainName;
			else {
				trainNames.push(trainName); //this should never get called
				console.log('scrum ' + me.ProjectRecord.get('Name') + ' does not follow naming convention');
			}
			trainNames.forEach(function(trainName){
				f2 = Ext.create('Rally.data.wsapi.Filter', { 
					property:'Name',
					operator:'contains',
					value: trainName
				});
				if(filterString2) filterString2 = filterString2.or(f2);
				else filterString2 = f2;
			});
			filterString = filterString.and(filterString2);
		} else {
			filterString2 = Ext.create('Rally.data.wsapi.Filter', { //for non train scrums e.g: Q115
				property:'ReleaseDate',
				operator:'>=',
				value: new Date().toISOString()
			}).and(Ext.create('Rally.data.wsapi.Filter', { 
				property:'Name',
				operator:'!contains',
				value: ' '
			}));
			filterString = filterString.and(filterString2);
		}
		filterString = filterString.toString();
		
		var store = Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{ property:'Dummy', value:'value' }],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						me.ReleaseStore = releaseStore;
						cb();
					},
					single:true
				}
			}
		});
		store._hydrateModelAndLoad = function(options){
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
		store.load();
	},
	
	_loadRootProject: function(projectRecord, cb){
		var me = this, n = projectRecord.get('Name');
		if(n === 'All Scrums' || n === 'All Scrums Sandbox' || !projectRecord.get('Parent')) {
			me.RootProjectRecord = projectRecord;
			cb();
		} else {
			me._loadProject(projectRecord.get('Parent'), function(parentRecord){
				me._loadRootProject(parentRecord, cb);
			});
		}
	},
	
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		var me = this;
		if(!projectRecord) cb();
		var split = projectRecord.get('Name').split(' ART ');
		if(split.length>1) cb(projectRecord);
		else { 
			var parent = projectRecord.get('Parent');
			if(!parent) cb();
			else {
				me._loadProject(parent, function(parentRecord){
					me._projectInWhichTrain(parentRecord, cb);
				});
			}
		}
	},
	
	_loadValidProjects: function(cb){
		var me = this;
		var scrums = [];
		function loadChildren(project, _cb){
			if(project.data.TeamMembers.Count > 0) //valid scrums have people
				scrums.push(project);
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				autoLoad:true,
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name', 'ObjectID', 'Parent', 'TeamMembers'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
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
							if(projectRecords.length === 0) _cb();
							else {
								var finished = 0;
								var done = function(){ if(++finished === projectRecords.length) _cb(); };
								projectRecords.forEach(function(c){ loadChildren(c, function(){ done(); }); });
							}
						},
						single:true
					}
				}
			});
		}

		Ext.create('Rally.data.wsapi.Store',{
			model: 'Project',
			autoLoad:true,
			remoteSort:false,
			pageSize:1,
			limit:1,
			fetch: ['Name', 'ObjectID', 'TeamMembers'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
					property:'Name',
					value: me.RootProjectRecord.get('Name')
				}
			],
			listeners:{
				load:{
					fn: function(ps, recs){
						loadChildren(recs[0], function(){ 
							me.ValidProjects = _.indexBy(scrums, function(scrum) { return scrum.data.ObjectID; });
							me.ProjectNames = _.map(scrums, function(s){ return {Name: s.get('Name')}; });
							console.log('valid scrums loaded:', scrums);
							cb(); 
						});
					},
					single:true
				}
			}
		});
	},
				
	_loadRandomUserStory: function(ProjectRef, cb){ //get the most recent one!!
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:1,
			pageSize:1,
			fetch: ['Name', 'CreationDate', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: ProjectRef
			},
			sorters: [
				{
					property: 'CreationDate', 
					direction:'DESC'
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						cb(userStoryRecords.pop());
					},
					single:true
				}
			}
		});
	},
	
	_loadUserStoryByFID: function(FormattedID, ProjectRef, cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:1,
			pageSize:1,
			fetch: ['Name', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: ProjectRef
			},
			filters: [
				{
					property:'FormattedID',
					value:FormattedID
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						cb(userStoryRecords.pop());
					},
					single:true
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
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_Risks', 'Project', 'PlannedEndDate', 'Parent'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.ReleaseRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(featureStore, featureRecords){
						console.log('features loaded:', featureRecords);
						me.FeatureStore = featureStore;
						me.FeatureProductHash = {};
						var finished = -1;
						var done = function(){ if(++finished == featureRecords.length) { cb(); } };
						done();
						featureRecords.forEach(function(fr){
							var frData = fr.data;
							if(frData.Parent){
								me._loadMilestone(frData.Parent, function(milestoneRecord){
									var p = milestoneRecord.data.Parent;
									me.FeatureProductHash[frData.ObjectID] = ((p && p.Name ) ? p.Name : '');
									done();
								});
							}
							else {
								me.FeatureProductHash[frData.ObjectID] = '';
								done();
							}
						});
					},
					single:true
				}
			}
		});
	},
	
	_loadIterations: function(cb){
		var me = this,
			startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseStartDate')),
			endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseDate'));
		Ext.create("Rally.data.WsapiDataStore", {
			model: "Iteration",
			autoLoad: true,
			limit:Infinity,
      fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project"],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: me.getContext().getProject()._ref
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
			],
			remoteSort: false,
			listeners: {
				load: function(store) {
					console.log('Iterations loaded:', store.getRecords());
					me.IterationStore = store;
          cb();
        },
				single:true
			}
    });
	},
	
	_loadUserStories: function(cb){	
		var me = this,
			startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseStartDate')),
			endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseDate'));
		
		/*************************************** core Filter ********************************************/
		var coreFilter = Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
			property:'Release.Name',
			value: me.ReleaseRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.Name',
			value: me.ProjectRecord.get('Name')
		}));
		
		/*************************************** Dependencies Filter ********************************************/		
		var depFilter = Ext.create('Rally.data.wsapi.Filter', { //to get successors (could be any random user story)
			property:'Project.Name',
			value: me.ProjectRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'c_Dependencies',
			operator:'!=',
			value:''
		}));

		/*************************************** TeamCommits Filter ********************************************/
		//no teamCommits Specific filter
		
		/*************************************** Velocity Filter ********************************************/
		// var velocityFilter = Ext.create('Rally.data.wsapi.Filter', { //overlaps with coreFilter....not needed
			// property: "Iteration.EndDate",
			// operator: ">=",
			// value: startDate
		// }).and(Ext.create('Rally.data.wsapi.Filter', { 
			// property: "Iteration.StartDate",
			// operator: "<=",
			// value: endDate  
		// })).and(coreFilter);
		
		/*************************************** Store Stuff********************************************/
		var filterString = coreFilter.or(depFilter).toString();
		
		var store = Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'Feature',
				'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies', 'Iteration', 'PlanEstimate'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{ property:'Dummy', value:'value' }], //need this or filterString wont get injected
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						console.log('user stories loaded:', userStoryRecords);
						me.UserStoryStore = userStoryStore;
						cb();
					},
					single:true
				}
			}
		});
		store._hydrateModelAndLoad = function(options){
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
		store.load();
	},
	
	/**___________________________________TEAM COMMITS STUFF___________________________________**/
			
	_getTeamCommit: function(featureRecord){	
		var me=this, tcs = featureRecord.get('c_TeamCommits'),
			projectID = me.ProjectRecord.get('ObjectID');
		try{ tcs = JSON.parse(atob(tcs))[projectID] || {}; } 
		catch(e){ tcs = {}; }
		return tcs;
	},
		
	_setTeamCommit: function(featureRecord, tc, cb){
		var me = this,
			tcs = featureRecord.get('c_TeamCommits'),
			projectID = me.ProjectRecord.get('ObjectID');
		try{ tcs = JSON.parse(atob(tcs)) || {}; }
		catch(e){ tcs = {}; }
		if(!tcs[projectID]) tcs[projectID] = {};
		tcs[projectID].Commitment = tc.Commitment;
		tcs[projectID].Objective = tc.Objective;
		var str = btoa(JSON.stringify(tcs, null, '\t'));
		if(str.length >= 32768){
			me._alert('ERROR', 'TeamCommits field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
			if(cb) cb();
		}
		featureRecord.set('c_TeamCommits', str);
		featureRecord.save({ callback:cb});
	},
				
	_TeamCommitsCountHash: {},
	_getStoryCount: function(FID){	
		var me = this;
		if(me._TeamCommitsCountHash[FID]) return me._TeamCommitsCountHash[FID];
		var count = _.reduce(me.UserStoryStore.getRecords(), function(total, us){ 
			return (us.get('Feature') && us.get('Feature').ObjectID == FID)*1 + total;
		}, 0);
		me._TeamCommitsCountHash[FID] = count;
		return count;
	},
		
	_TeamCommitsEstimateHash: {},
	_getStoriesEstimate: function(FID){	
		var me = this;
		if(me._TeamCommitsEstimateHash[FID]) 
			return me._TeamCommitsEstimateHash[FID];
		var estimate = _.reduce(me.UserStoryStore.getRecords(), function(total, us){ 
			return (us.get('Feature') && us.get('Feature').ObjectID == FID ? us.get('PlanEstimate') : 0)*1 + total;
		}, 0);
		me._TeamCommitsEstimateHash[FID] = estimate;
		return estimate;
	},
		
	/**___________________________________VELOCITY STUFF___________________________________ **/
	
	/**___________________________________ RISKS STUFF___________________________________**/
	
	_getRisks: function(featureRecord){
		var risks = featureRecord.get('c_Risks');
		try{ risks = JSON.parse(atob(risks)) || {}; } //b64 decode yosef. we approve of xss.
		catch(e) { risks = {}; }
		return risks;
	},
	
	_parseRisksFromFeature: function(featureRecord){
		var me = this, array = [],
			projectID = me.ProjectRecord.get('ObjectID'), 
			risks = me._getRisks(featureRecord),
			ObjectID = featureRecord.get('ObjectID'),
			FormattedID = featureRecord.get('FormattedID'),
			FeatureName = featureRecord.get('Name');
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
		var me = this, array = [];
		_.each(me.FeatureStore.getRecords(), function(featureRecord){ 
			array = array.concat(me._parseRisksFromFeature(featureRecord));
		});	
		me.RisksParsedData = array;
	},
		
	_removeRiskFromList: function(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
		for(var i = 0; i<riskList.length; ++i){
			if(riskList[i].RiskID == riskID) {
				return riskList.splice(i, 1)[0];
			}
		}
	},
	
	_removeRisk: function(featureRecord, riskData, cb){ 
		var me = this, risks = me._getRisks(featureRecord),
			projectID = me.ProjectRecord.get('ObjectID');
			
		if(risks[projectID]){
			delete risks[projectID][riskData.RiskID];
			me.RisksParsedData = _.reject(me.RisksParsedData, function(rpd){ //remove it from cached risks
				return rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID;
			});
			var str = btoa(JSON.stringify(risks, null, '\t')); //b64 encode yosef
			if(str.length >= 32768){
				me._alert('ERROR', 'Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			featureRecord.set('c_Risks', str);
			featureRecord.save({
				callback:function(){
					console.log('removed risk from feature:', featureRecord, riskData, risks);
					cb();
				}
			});
		}
		else cb();
	},
	
	_addRisk: function(featureRecord, riskData, cb){
		var me = this, risks = me._getRisks(featureRecord),
			projectID = me.ProjectRecord.get('ObjectID');
		
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
		for(var i=0;i<me.RisksParsedData.length; ++i){
			var rpd = me.RisksParsedData[i];
			if(rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID){
				me.RisksParsedData[i] = riskData;
				parseDataAdded = true; break;
			}
		}
		if(!parseDataAdded) me.RisksParsedData.push(riskData);
		var str = btoa(JSON.stringify(risks, null, '\t')); //b64 encode yosef
		if(str.length >= 32768){
			me._alert('ERROR', 'Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
			if(cb) cb();
		}
		featureRecord.set('c_Risks', str);
		featureRecord.save({
			callback:function(){
				console.log('added risk to feature:', featureRecord, riskData, risks);
				cb();
			}
		});
	},
		
	/**_____________________________________ DEPENDENCIES STUFF ___________________________________	**/
	
	_isInRelease: function(usr){
		var me = this;
		return usr.get('Release') && usr.get('Release').Name === me.ReleaseRecord.get('Name');
	},
	
	_getDependencies: function(userStoryRecord){
		var me = this;
		var dependencies, dependencyString = userStoryRecord.get('c_Dependencies');
		if(dependencyString === '') dependencies = { Preds:{}, Succs:[] };
		else {
			try{ dependencies = JSON.parse(atob(dependencyString)); }
			catch(e) { dependencies = { Preds:{}, Succs:[] }; }
		}		
		return dependencies;
	},
	
	_parseDependenciesFromUserStory: function(userStoryRecord){
		var me = this, deps = me._getDependencies(userStoryRecord), 
			preds = deps.Preds, succs = deps.Succs,
			predDepsList = [], succDepsList = [],
			startDate =	new Date(me.ReleaseRecord.get('ReleaseStartDate')),
			endDate =	new Date(me.ReleaseRecord.get('ReleaseDate')),
			ObjectID = userStoryRecord.get('ObjectID');
			
		if(me._isInRelease(userStoryRecord)){
			for(var predDepID in preds){
				var predDep = preds[predDepID];
				predDepsList.push({
					DependencyID: predDepID,
					ObjectID: ObjectID,
					FormattedID: userStoryRecord.get('FormattedID'),
					UserStoryName: userStoryRecord.get('Name'),
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
			if(new Date(succDep.REL) >= startDate && new Date(succDep.REL_S) <= endDate){
				var FormattedID, UserStoryName;
				if(succDep.A){ //if this was just placed on a random user story, or is assigned to this user story!
					FormattedID = userStoryRecord.get('FormattedID');
					UserStoryName = userStoryRecord.get('Name');
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
	
	_buildDependenciesData: function(){	
		var me = this;
		me.DependenciesReleaseUserStories = _.filter(me.UserStoryStore.getRecords(), function(usr){
			return me._isInRelease(usr);
		});	
		var predDepsList = [], succDepsList = [];
		_.each(me.UserStoryStore.getRecords(), function(userStoryRecord){ //load risks into custom Data Store
			var usrData = me._parseDependenciesFromUserStory(userStoryRecord);
			predDepsList = predDepsList.concat(usrData.Predecessors);
			succDepsList = succDepsList.concat(usrData.Successors);
		});
		me.DependenciesParsedData = {Predecessors:predDepsList, Successors:succDepsList};
	},
		
	_newTeamDep: function(){
		return {
			TID: (new Date() * 1) + '' + (Math.random() * 10000000),
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
	
	// THESE NEXT 5 METHODS ARE THE ONLY PLACE YOU HAVE TO WORRY ABOUT SUCESSORS AND 
	//PREDECESSOR FIELDS ON USER STORIES!!!!!!!!!!!!!!!
	_syncCollection: function(userStoryRecord, usAddList, usRemoveList, type, callback){ //type == Predecessors || Successors
		var me=this, collectionStore, collectionRecords, finished=-1, syncCollectionProxy = false;

		userStoryRecord.getCollection(type).load({ // update the collection before saving user story
			fetch:['FormattedID'],
			callback: function(){
				collectionStore = this, collectionRecords = collectionStore.getRange();
				function collectionFuncDone(){ //when all dep userstories are added, call callback
					if(++finished == usAddList.length){
						if(syncCollectionProxy) collectionStore.sync({ callback:callback });
						else callback();
					}
				}
				usAddList.forEach(function(dep){ //have to load each user story to get its _ref :(
					if(!_.find(collectionRecords, function(cr){ return cr.get('FormattedID') === dep.USID; })) { //add it
						project = me.ValidProjects[dep.PID];
						me._loadUserStoryByFID(dep.USID, project.get('_ref'), function(us){
							if(us) { syncCollectionProxy = true; collectionStore.add(us); }
							collectionFuncDone();
						});
					} else collectionFuncDone(); //else were done!
				});
				usRemoveList.forEach(function(dep){
					var realDep = _.find(collectionRecords, function(cr) { return cr.data.FormattedID===dep.USID; });
					if(realDep) { collectionStore.remove(realDep); syncCollectionProxy = true;}
				});
				collectionFuncDone(); //<---- make sure we remove the deps too, thats why this is here 
			}
		});	
	},
	
	_removePredDep: function(userStoryRecord, predDepData, cb){
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cachePreds = me.DependenciesParsedData.Predecessors,
			addUSlist = [], removeUSlist = [], depID = predDepData.DependencyID, i;

		removeUSlist = dependencies.Preds[depID].Preds || [];
		
		delete dependencies.Preds[depID]; //delete from user story preds	
		
		//update or append to the cache, this predDepData
		if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
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
		
		me._syncCollection(userStoryRecord, addUSlist, removeUSlist, 'Predecessors', function(){ 
			var str = btoa(JSON.stringify(dependencies, null, '\t'));
			if(str.length >= 32768){
				me._alert('ERROR', 'Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback:function(){
					console.log('removed pred from userStory:', userStoryRecord, predDepData, dependencies);
					if(cb) cb();
				}
			});
		});
		
	},
	
	_removeSuccDep: function(userStoryRecord, succDepData, cb){
		var me=this, dependencies = me._getDependencies(userStoryRecord),
			cacheSuccs = me.DependenciesParsedData.Successors, dpds,
			addUSlist = [], removeUSlist = [], succDep, i;
			
		for(i=0; i<dependencies.Succs.length; ++i) //find the correct succDep. and remove it from the dependencies object
			if(dependencies.Succs[i].ID === succDepData.DependencyID){					
				succDep = dependencies.Succs.splice(i, 1)[0]; break; }	
		removeUSlist = succDep ? [{USID:succDep.SUSID, PID:succDep.SPID}] : [];
		
		//update or append to the cache, this predDepData
		if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
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
		
		me._syncCollection(userStoryRecord, addUSlist, removeUSlist, 'Successors', function(){ 
			var str = btoa(JSON.stringify(dependencies, null, '\t'));
			if(str.length >= 32768){
				me._alert('ERROR', 'Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback: function(){
					console.log('removed succ from userStory:', userStoryRecord, succDepData, dependencies);
					if(cb) cb();
				}
			});
		});
	},

	_addPredDep: function(userStoryRecord, predDepData, cb){ 
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
		if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
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
		
		me._syncCollection(userStoryRecord, predUSlist, [], 'Predecessors', function(){
			var str = btoa(JSON.stringify(dependencies, null, '\t'));
			if(str.length >= 32768){
				me._alert('ERROR', 'Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback:function(){
					console.log('added predecessor to userStory:', userStoryRecord, predDepData, dependencies);
					if(cb) cb();
				}
			});
		});
	},
	
	_addSuccDep: function(userStoryRecord, succDepData, cb){ 
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
		if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
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
		
		me._syncCollection(userStoryRecord, succUSlist, [], 'Successors', function(){
			var str = btoa(JSON.stringify(dependencies, null, '\t'));
			if(str.length >= 32768){
				me._alert('ERROR', 'Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback:function(){
					console.log('added succ to userStory:', userStoryRecord, succDepData, dependencies);
					if(cb) cb();
				}
			});
		});
	},
	
	/*************************************************** DEFINE MODELS ******************************************************/
	_defineModels: function(){
			
		Ext.define('IntelVelocity', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'Name', type: 'string'},
				{name: 'PlannedVelocity', type: 'string'},
				{name: 'RealVelocity', type:'string'}
			]
		});
		
		Ext.define('IntelTeamCommits', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'Name', type: 'string'},
				{name: 'ObjectID', type: 'string'},
				{name: 'FormattedID', type:'string'},
				{name: 'Commitment', type: 'string'},
				{name: 'Objective', type:'string'},
				{name: 'Product', type:'string'},
				{name: 'PlannedEnd', type:'string'}
			]
		});
		
		Ext.define('IntelRisk', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'RiskID', type:'string'},
				{name: 'ObjectID', type:'number'},
				{name: 'FormattedID',  type: 'string'},
				{name: 'FeatureName', type:'string'},
				{name: 'Description', type: 'string'},
				{name: 'Impact', type: 'string'},			
				{name: 'Status', type: 'string'},
				{name: 'Contact', type: 'string'},
				{name: 'Checkpoint', type: 'string'},
				{name: 'Edited', type: 'boolean'}
			]
		});
		
		Ext.define('IntelDepTeam', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'TID',  type: 'string'},  //teamDep ID
				{name: 'PID',  type: 'string'},  //pred team id
				{name: 'Sup', type: 'string'}, 
				{name: 'USID', type: 'string'}, //pred formatted id
				{name: 'USName', type: 'string'},
				{name: 'A', type: 'boolean'} //yes/no
			]
		});
		
		Ext.define('IntelPredDep', { //predecessor dependencies
			extend: 'Ext.data.Model',
			fields: [
				{name: 'ObjectID', type: 'number'},
				{name: 'DependencyID', type:'string'},
				{name: 'FormattedID',  type: 'string'}, 
				{name: 'UserStoryName',  type: 'string'},
				{name: 'Description', type: 'string'},
				{name: 'Checkpoint', type: 'string'},
				{name: 'Status', type:'string'}, //only set by chief engineers. not viewable in this app
				{name: 'Predecessors', type: 'auto'}, //TID: Pred: ProjectID, supported, UserStoryID, Assigned
				{name: 'Edited', type: 'boolean'}
			]
		});		
			
		Ext.define('IntelSuccDep', { //predecessor dependency
			extend: 'Ext.data.Model',
			fields: [
				{name: 'ObjectID', type: 'number'},
				{name: 'DependencyID', type:'string'}, //same id as the pred id that references it
				{name: 'SuccUserStoryName', type: 'string' },
				{name: 'SuccFormattedID',  type: 'string'}, 
				{name: 'SuccProjectID', type: 'string'}, //of predecessor team
				{name: 'UserStoryName', type: 'string'}, //can be null!!!!!!!!!!!!
				{name: 'FormattedID',  type: 'string'},  //CAN BE NULL!!!!!!!!!!!!
				{name: 'ReleaseStartDate',  type: 'string'}, 
				{name: 'ReleaseDate',  type: 'string'}, 
				{name: 'Description', type: 'string'}, 
				{name: 'Checkpoint', type: 'string'},
				{name: 'Supported', type: 'string'}, //Yes, No
				{name: 'Assigned', type: 'boolean'}, //yes/no
				{name: 'Edited', type: 'boolean'}
			]
		});	
	},
	
	/************************************************** MSGBOX config ****************************************************/
	
	_alert: function(title, str){
		var me = this;
		Ext.MessageBox.alert(title, str).setY(me._msgBoxY);
		setTimeout(function(){ 
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 10);
	},
	
	_confirm: function(title, str, fn){
		var me = this;
		Ext.MessageBox.confirm(title, str, fn).setY(me._msgBoxY);
		setTimeout(function(){
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 10);
	},
	
	_applyMessageBoxConfig: function(){
		function getOffsetTop(el){ return (el.parentNode ? el.offsetTop + getOffsetTop(el.parentNode) : 0); }
		
		var me = this, w = window, p = w.parent, pd = w.parent.document, l = w.location,
			iframe = pd.querySelector('iframe[src="' + l.pathname + l.search + '"]');
		
		function setMsgBoxY(){
			var ph = p.getWindowHeight(), 
				ps = p.getScrollY(), 
				ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe
				iyOffset = Math.floor(ph/2 - ofy + ps - 50);
			me._msgBoxY = iyOffset<0 ? 0 : iyOffset;
		}
		setMsgBoxY();
		p.onresize = setMsgBoxY;
		p.onscroll = setMsgBoxY;
	},
	
	/************************************************** DATE FUNCTIONS ***************************************************/
		
	_getWorkweek: function(date){ //calculates intel workweek, returns integer
		var me = this, oneDay = 1000 * 60 * 60 * 24,
			yearStart = new Date(date.getFullYear(), 0, 1),
			dayIndex = yearStart.getDay(),
			ww01Start = yearStart - dayIndex*oneDay,
			timeDiff = date - ww01Start,
			dayDiff = timeDiff / oneDay,
			ww = Math.floor(dayDiff/7) + 1,
			leap = (date.getFullYear() % 4 === 0),
			weekCount = ((leap && dayIndex >= 5) || (!leap && dayIndex === 6 )) ? 53 : 52; //weeks in this year
		return weekCount < ww ? 1 : ww;
	},
	
	_getWeekCount: function(date){ //returns the number of intel workweeks in the year the date is in
		var leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay();
		return ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52;
	},
	
	_getWorkweeks: function(){ //gets list of workweeks in the release
		var me = this, i,
			start = me.ReleaseRecord.get('ReleaseStartDate'),
			end = me.ReleaseRecord.get('ReleaseDate'),
			sd_week = me._getWorkweek(start),
			ed_week = me._getWorkweek(end),
			week_count = me._getWeekCount(start);

		var weeks = [];
		if(ed_week < sd_week){
			for(i=sd_week; i<=week_count; ++i) weeks.push({'Week': 'ww' + i});
			for(i = 1; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
		}
		else for(i = sd_week; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
		return weeks;
	},
	
	/************************************************** Preferences FUNCTIONS ***************************************************/
	
	_loadPreferences: function(cb){ //parse all settings too
		var me = this,uid = me.getContext().getUser().ObjectID;
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
      filterByName:preferenceName+ uid,
			success: function(prefs) {
				var appPrefs = prefs[preferenceName + uid];
				try{ appPrefs = JSON.parse(appPrefs); }
				catch(e){ appPrefs = { projs:{}, refresh:10};}
				me.AppPrefs = appPrefs;
				console.log('loaded prefs', appPrefs);
        cb();
			}
		});
	},

	_savePreferences: function(prefs, cb){ // stringify and save only the updated settings
		var me = this, s = {}, uid = me.getContext().getUser().ObjectID;
    s[preferenceName + uid] = JSON.stringify(prefs); //release: objectID, refresh: (off, 10, 15, 30, 60, 120)
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: me.getAppId(),
			settings: s,
			success: cb,
			scope:me
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
	
	_getDirtyType: function(localRecord, realData){
		var localData = localRecord.data;
		if(!realData)	return localData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
		else return localData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
	},
		
	_getScopedRelease: function(){
		var me = this, d = new Date(), r,
			rs = me.ReleaseStore.getRecords(),
			prefOID = me.AppPrefs.projs[me.ProjectRecord.get('ObjectID')];
		return (prefOID && _.find(rs, function(r){ return r.get('ObjectID') == prefOID; })) ||
			_.find(rs, function(r){
				return (new Date(r.get('ReleaseDate')) >= d) && (new Date(r.get('ReleaseStartDate')) <= d);
			}) ||
			_.reduce(rs, function(best, r){
				if(best===null) return r;
				else {
					var d1 = new Date(best.get('ReleaseStartDate')), d2 = new Date(r.get('ReleaseStartDate')), now = new Date();
					return (Math.abs(d1-now) < Math.abs(d2-now)) ? best : r;
				}
			}, null);
	},
	
  /************************************************ LOADING AND RELOADING ***********************************/

	_isEditingTeamCommits: false, 
	_isEditingVelocity: false,
	
	_isEditing: function(store){
		if(!store) return false;
		if(_.find(store.getRange(), function(r){ return r.get('Edited'); })) return true;
		return false;
	},
	
	_reloadStores: function(cb){
		var me = this, scroll,
			finished = 0, 
			todo=3,
			isEditingRisks = me._isEditing(me.CustomRisksStore),
			isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore),
			reloadStore = function(store, grid){
				if(store){
					if(grid) scroll = grid.view.getEl().getScrollTop();
					store.update();
					if(grid) grid.view.getEl().setScrollTop(scroll);

				}
			},
			done = function(){ 
				if(++finished==todo) {	
					if(!me._isEditingVelocity && me.IterationStore && me.UserStoryStore)
						reloadStore(me.CustomVelocityStore, null);
					if(!me._isEditingTeamCommits && me.FeatureStore && me.UserStoryStore)
						reloadStore(me.CustomTeamCommitsStore, null);
					if(!isEditingRisks && me.FeatureStore){
						me._parseRisksData();
						reloadStore(me.CustomRisksStore, me.RisksGrid);
					}
					if(!isEditingDeps && me.UserStoryStore && me.FeatureStore){
						me._buildDependenciesData(); //reparse the data
						reloadStore(me.CustomPredDepStore, me.PredDepGrid);
						reloadStore(me.CustomSuccDepStore, me.SuccDepGrid);
					}
					if(cb) cb();
				}
			};	
		if(!me._isEditingVelocity){
			if(me.IterationStore) me.IterationStore.load({ callback: done});
			else me._loadIterations(done);
		} else done();
		if(!me._isEditingTeamCommits && !isEditingRisks){
			if(me.FeatureStore) me.FeatureStore.load({ callback: done });
			else me._loadFeatures(done);
		} else done();
		if(!me._isEditingVelocity && !me._isEditingTeamCommits && !isEditingDeps){
			if(me.UserStoryStore) me.UserStoryStore.load({ callback: done });
			else me._loadUserStories(done);
		} else done();
	},
	
	_reloadEverything:function(){
		var me = this;
		me.removeAll();
		
		me._isEditingTeamCommits = false;
		me._isEditingVelocity = false;
		
		delete me.UserStoryStore;
		delete me.FeatureStore;
		delete me.IterationStore;
		
		delete me.PredDepGrid;
		delete me.SuccDepGrid;
		delete me.RisksGrid;
		delete me.VelocityGrid;
		delete me.TeamCommitsGrid;
		
		delete me.CustomPredDepStore;
		delete me.CustomSuccDepStore;
		delete me.CustomTeamCommitsStore;
		delete me.CustomVelocityStore;
		
		me._loadReleasePicker();
		me._loadRefreshToggleButton();
		me._loadManualRefreshButton();
		
		me._reloadStores(function(){						
			me._loadTeamCommitsGrid();
			me._loadVelocityGrid(); 
			me._loadRisksGrid();
			me._loadDependenciesGrids();
		});
	},
	
	/******************************************************* LAUNCH ********************************************************/
	
	launch: function(){
		var me = this;
		me._showError('Loading Data...');
		me._defineModels();
		me._applyMessageBoxConfig();
		if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
			me.removeAll();
			me._showError('You do not have permissions to edit this project');
			return;
		}
		//Ext.tip.QuickTipManager.init();
		//Ext.apply(Ext.tip.QuickTipManager.getQuickTip(), {showDelay: 1200 });
		me._loadModels(function(){
			var scopeProject = me.getContext().getProject();
			me._loadProject(scopeProject, function(scopeProjectRecord){
				me._loadRootProject(scopeProjectRecord, function(){
					me._loadValidProjects(function(){
						me.ProjectRecord = me.ValidProjects[scopeProjectRecord.get('ObjectID')];
						if(me.ProjectRecord){
							me._projectInWhichTrain(me.ProjectRecord, function(trainRecord){
								me.TrainRecord = trainRecord; 
								console.log('train loaded:', trainRecord);
								me._loadPreferences(function(){
									if(me.AppPrefs.refresh!=='Off')
										me.RefreshInterval = setInterval(function(){ me._reloadStores(); }, me.AppPrefs.refresh * 1000);
									me._loadReleases(function(){
										var currentRelease = me._getScopedRelease();
										if(currentRelease){
											me.ReleaseRecord = currentRelease;
											console.log('release loaded', currentRelease);
											me._reloadEverything();
										} else {
											me.removeAll();
											me._showError('This team has no releases');
										}
									});
								});
							});
							
						} else{
							me.removeAll();
							me._showError('Please scope to a valid team for release planning');
						}
					});
				});
			});
		});
	},

	/******************************************************* RENDER ********************************************************/	
	//1065px wide

	_loadReleasePicker: function(){
		var me = this;
		me.ReleasePicker = me.add({
			xtype:'combobox',
			x:0, y:0,
			store: Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: _.map(me.ReleaseStore.getRecords(), function(r){ return {Name: r.get('Name') }; })
			}),
			displayField: 'Name',
			fieldLabel: 'Release:',
			editable:false,
			value:me.ReleaseRecord.get('Name'),
			listeners: {
				select: function(combo, records){
					if(me.ReleaseRecord.get('Name') === records[0].get('Name')) return;
					me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].get('Name'));			
					me.AppPrefs.projs[me.ProjectRecord.get('ObjectID')] = me.ReleaseRecord.get('ObjectID');
					me._savePreferences(me.AppPrefs, function(){me._reloadEverything(); }, 0);
				}	
			}
		});
	},
	
	_loadRefreshToggleButton: function(){
		var me = this;
		me.ToggleRefreshButton = me.add({
			xtype:'combobox',
			x:705, y:0,
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
			fieldLabel: 'Refresh Rate (seconds):',
			editable:false,
			value:me.AppPrefs.refresh,
			listeners: {
				select: function(combo, records){
					var rate = records[0].get('Rate');
					if(me.AppPrefs.refresh === rate) return;
					me.AppPrefs.refresh = rate;
					if(me.RefreshInterval){ clearInterval(me.RefreshInterval);}
					if(rate === 'Off') delete me.RefreshInterval;
					else setInterval(function(){ me._reloadStores(); }, me.AppPrefs.refresh * 1000);
					me._savePreferences(me.AppPrefs);
				}	
			}
		});
	},
	
	_loadManualRefreshButton: function(){
		var me = this;
		me.AddManualRefreshButton = me.add({
			xtype:'button',
			text:'Refresh Data',
			style:'margin-top: 5px',
			x:965, y:0,
			width:100,
			listeners:{
				click: function(){ me._reloadStores(); }
			}
		});
	},
	
	_loadTeamCommitsGrid: function(){
		var me = this;	
		
		me._TeamCommitsCountHash = {};
		me._TeamCommitsEstimateHash = {};
		
		var customTeamCommitsRecords = _.map(me.FeatureStore.getRecords(), function(featureRecord){
			var tc = me._getTeamCommit(featureRecord), ed = featureRecord.get('PlannedEndDate');
			return {
				Commitment: tc.Commitment || 'Undecided',
				Objective: tc.Objective || '',
				Name: featureRecord.get('Name'),
				FormattedID: featureRecord.get('FormattedID'),
				ObjectID: featureRecord.get('ObjectID'),
				Product: me.FeatureProductHash[featureRecord.get('ObjectID')],
				PlannedEnd: (ed ? 'WW' + me._getWorkweek(new Date(ed)) : '-') //planned end in workweeks
			};
		});		
		
		me.CustomTeamCommitsStore = Ext.create('Ext.data.Store', {
			data: customTeamCommitsRecords,
			model:'IntelTeamCommits',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'TeamCommitsProxy' + Math.random()
			},
			update: function(){
				var tcStore = me.CustomTeamCommitsStore, 
					tcRecords = tcStore.getRange();
				console.log('syncing teamCommits with features', tcRecords, me.FeatureStore.getRecords());
				tcRecords.forEach(function(tcRecord){
					var featureRecord = me.FeatureStore.findRecord('ObjectID', tcRecord.get('ObjectID'));
					if(featureRecord) {
						var newVal = me._getTeamCommit(featureRecord);
						if(tcRecord.get('Commitment') != newVal.Commitment)
							tcRecord.set('Commitment', newVal.Commitment || 'Undecided');
						if(tcRecord.get('Objective') != (newVal.Objective || ''))
							tcRecord.set('Objective', newVal.Objective || '');
					}
				});
			}
		});
		me.CustomTeamCommitsStore.update();
		
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
					if(feature.get('Project')) {
						return '<a href="https://rally1.rallydev.com/#/' + feature.get('Project').ObjectID + 'd/detail/portfolioitem/feature/' + 
								feature.get('ObjectID') + '" target="_blank">' + FID + '</a>';
					}
					else return FID;
				}
			},{
				text:'Feature', 
				dataIndex:'Name',
				width:160,
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
							var diff = me._getStoryCount(f1.get('ObjectID')) - me._getStoryCount(f2.get('ObjectID'));
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:50,
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
							var diff = me._getStoriesEstimate(f1.get('ObjectID')) - me._getStoriesEstimate(f2.get('ObjectID'));
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:60,
				renderer:function(oid){
					return me._getStoriesEstimate(oid);
				}
			},{
				text:'Planned End',
				dataIndex:'PlannedEnd',
				sortable:true, 
				editor:false,
				resizable:false,
				width:60
			},{
				dataIndex:'Commitment',
				text:'Status',	
				width:100,
				tdCls: 'intel-editor-cell',	
				sortable:true, 
				resizable:false,
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{'Status':'Undecided'},
							{'Status':'N/A'},
							{'Status':'Committed'},
							{'Status':'Not Committed'}
						]
					}),
					editable: false,
					displayField: 'Status',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				}
			},{
				text:'Objective', 
				dataIndex:'Objective',
				width:120,
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				resizable:false,
				sortable:true,
				renderer: function(val){ return val || '-'; }
			}
		];
		
		me.TeamCommitsGrid = me.add({
			xtype: 'rallygrid',
      title: "Team Commits",
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20), //770
			height:300,
			x:0, y:40,
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(tcRecord, index, rowParams, store){
					var val = tcRecord.get('Commitment') || 'Undecided';					
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
					
					me._isEditingTeamCommits = false;
					
					if(value === originalValue) return; 
					if(field==='Objective'){
						value = me._htmlEscape(value);			
						tcRecord.set(field, value);
					}
					
					var tc = {Commitment: tcRecord.get('Commitment'), Objective: tcRecord.get('Objective') };
					
					me._isEditingTeamCommits = true;
					me.TeamCommitsGrid.setLoading(true);
					me._loadFeature(tcRecord.get('ObjectID'), function(realFeature){
						if(!realFeature) {
							console.log('ERROR: realFeature not found, ObjectID: ' + oid);
							me._isEditingTeamCommits = false;
							me.TeamCommitsGrid.setLoading(false);
						} else me._setTeamCommit(realFeature, tc, function(){					
							me._isEditingTeamCommits = false;
							me.TeamCommitsGrid.setLoading(false);
						});
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
			return us.get('Iteration') ? us.get("Iteration").Name : '__DELETE__' ; });
		delete iterationGroups.__DELETE__; //ignore those not in an iteration
        
    var iterationGroupTotals = _.sortBy(_.map(me.IterationStore.getRecords(), function(iteration) {
			var iName = iteration.get('Name');
			return {    
				Name:iName, 
				PlannedVelocity: iteration.get('PlannedVelocity') || 0,
				RealVelocity:_.reduce((iterationGroups[iName] || []), function(sum, us) {
						return sum + us.get("PlanEstimate");
				}, 0)
			};
		}), 'Name');

		me.CustomVelocityStore = Ext.create('Ext.data.Store', {
			data: iterationGroupTotals,
			model:'IntelVelocity',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'VelocityProxy' + Math.random()
			},
			update: function(){
				var velStore = me.CustomVelocityStore, 
					velRecords = velStore.getRange();	
				console.log('syncing velocity with current iterations', velRecords, me.IterationStore.getRecords());
				velRecords.forEach(function(velRecord){
					var iterationName = velRecord.get('Name');
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
					var newVal = iteration.get('PlannedVelocity') || 0;
					if(newVal != velRecord.get('PlannedVelocity')){
						velRecord.set('PlannedVelocity', iteration.get('PlannedVelocity') || 0);
						console.log('velocity record update', velRecord);
					}
				});
			}
		});
		me.CustomVelocityStore.update();		
		
		var columnCfgs = [
			{	
				text: 'Iteration',
				dataIndex: 'Name', 
				width:160,
				editor:false,
				resizable:false,
				sortable:true,
				renderer:function(name, meta, velocityRecord){
					var iteration = me.IterationStore.findExactRecord('Name', name);
					if(iteration.get('Project')) {
						var pid = iteration.get('Project')._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/iteration/' + 
								iteration.get('ObjectID') + '" target="_blank">' + name + '</a>';
					}
					else return name;
				}
			},{
				text: 'Target Capacity (Planned Velocity)',
				dataIndex: 'PlannedVelocity',
				width:85,
				tdCls: 'intel-editor-cell',
				xtype:'numbercolumn',
				editor:'textfield',
				resizable:false,
				sortable:true,
				renderer:function(n, m){
					m.tdCls += (n*1===0 ? ' red-cell' : '');
					return n;
				}
			},{
				text: 'Actual Load (Plan Estimate)',
				dataIndex: 'RealVelocity',
				xtype:'numbercolumn',
				width:80,
				editor:false,
				resizable:false,
				sortable:true,
				renderer:function(realVel, m, r){
					m.tdCls += ((realVel*1 < r.data.PlannedVelocity*0.9) ? ' yellow-cell' : '');
					m.tdCls += ((realVel*1 === 0 || realVel*1 > r.data.PlannedVelocity*1) ? ' red-cell' : '');
					return realVel;
				}
			}
		];
		me.VelocityGrid = me.add({
			xtype: 'rallygrid',
			title: "Velocity",
			scroll:'vertical',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			x:720, y:40,
			showPagingToolbar: false,
			showRowActionsColumn:false,
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
					
					if(!value || (value === originalValue)) { me._isEditingVelocity = false; return; }
					value = value*1 || 0; //value*1 || null to remove the 0's from teams
					var iterationName = velocityRecord.get('Name');
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
					iteration.set('PlannedVelocity', value);
					me.VelocityGrid.setLoading(true);
					iteration.save({ 
						callback: function(){ 
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
		var me = this, 
			workweeks = me._getWorkweeks(),
			riskSorter = function(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; }; //new come first
		
		me.CustomRisksStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.RisksParsedData),
			autoSync:true,
			model:'IntelRisk',
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'RiskProxy' + Math.random()
			},
			sorters: [riskSorter],
			update: function(){
				var riskStore = me.CustomRisksStore, 
					riskRecords = riskStore.getRange(),
					realRisksDatas = me.RisksParsedData.slice(0), //'real' risks list
					remoteChanged = false, //if someone else updated this while it was idle on our screen	
					key;
				console.log('syncing risks with current features', riskRecords, realRisksDatas);
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
							for(key in realRiskData)
								riskRecord.set(key, realRiskData[key]);
						}
					}
				}
				realRisksDatas.forEach(function(realRiskData){ //add all the new risks that other people have added since first load
					console.log('adding real risk', realRiskData);
					riskStore.add(Ext.create('IntelRisk', Ext.clone(realRiskData)));
				});
			}
		});
		me.CustomRisksStore.update();
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',	
				width:80,
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['FormattedID'],
						data: _.map(me.FeatureStore.getRecords(), function(fr){
							return {'FormattedID': fr.get('FormattedID')};
						})
					}),
					enableKeyEvents:true,
					queryMode:'local',
					value:'',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) === 0;
							});
						},
						focus: function(combo) {
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) === 0;
							});
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},			
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				tdCls: 'intel-editor-cell',	
				width:185,
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.FeatureStore.getRecords(), function(fr){
							return {'Name': fr.get('Name') };
						})
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) === 0;
							});
						},
						focus: function(combo) {
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) === 0;
							});
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				resizable:false,
				sortable:true	,
				renderer:function(val){ return val || '-'; }			
			},{
				text:'Risk Description', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				width:170,
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Impact', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				width:170,
				resizable:false,
				sortable:true,
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
				width:170,
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				sortable:true,
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
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'Edited') return;
					meta.tdAttr = 'data-qtip="' + 'Undo' + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
									var scroll = me.RisksGrid.view.getEl().getScrollTop();
									for(var key in realRiskData)
										riskRecord.set(key, realRiskData[key]);	
									riskRecord.set('Edited', false);
									me.RisksGrid.view.getEl().setScrollTop(scroll);	
								}
							}
						}
					};
				}
			},{
				text:'',
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				width:30,
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = me._getDirtyType(riskRecord, realRiskData);
					if(dirtyType === 'New') dirtyType = 'Save'; //setEditing only if save or resave is true
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return;
					meta.tdAttr = 'data-qtip="' + dirtyType + ' Risk"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){//DONT NEED ObjectID. that only is to reference previous parent!
									if(!riskRecord.get('FormattedID') || !riskRecord.get('FeatureName')){
										me._alert('ERROR', 'You must set the Feature affected by this risk');
										return;
									} else if(!riskRecord.get('Checkpoint')){
										me._alert('ERROR', 'You must set the Checkpoint date for this risk');
										return;
									} else if(!riskRecord.get('Description')){
										me._alert('ERROR', 'You must set the Description date for this risk');
										return;
									} else if(!riskRecord.get('Impact')){
										me._alert('ERROR', 'You must set the Impact date for this risk');
										return;
									} else if(!riskRecord.get('Status')){
										me._alert('ERROR', 'You must set the Status date for this risk');
										return;
									} else if(!riskRecord.get('Contact')){
										me._alert('ERROR', 'You must set the Contact date for this risk');
										return;
									}	
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
												var scroll = me.RisksGrid.view.getEl().getScrollTop();
												riskRecord.set('Edited', false);
												riskRecord.set('ObjectID', newFeatureRecord.get('ObjectID'));
												me.RisksGrid.view.getEl().setScrollTop(scroll);
												me.RisksGrid.setLoading(false);
											},
											nextAction = function(){
												me._addRisk(newFeatureRecord, riskRecordData, lastAction);
											};	
											if(!oldFeatureRecord){ nextAction(); return; } //for newly added 
											else {
												var oldRealRisksData = me._parseRisksFromFeature(oldFeatureRecord),
													oldRealRiskData = me._removeRiskFromList(riskRecordData.RiskID, oldRealRisksData);						
												if(oldFeatureRecord.get('ObjectID') !== newFeatureRecord.get('ObjectID') && oldRealRiskData) 
													me._removeRisk(oldFeatureRecord, oldRealRiskData, nextAction);
												else nextAction();					
											}
										});
									}
								}
							}
						}
					};
				}
			},{
				text:'',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					meta.tdAttr = 'data-qtip="' + 'Delete' + ' Risk"';
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
										me._loadFeature(riskRecord.get('ObjectID'), function(featureRecord){
											var lastAction = function(){
												var scroll = me.RisksGrid.view.getEl().getScrollTop();
												me.CustomRisksStore.remove(riskRecord);
												me.RisksGrid.view.getEl().setScrollTop(scroll);
												me.RisksGrid.setLoading(false);
											};	
											if(!featureRecord){ lastAction(); return; } 
											else {
												var realRisksData = me._parseRisksFromFeature(featureRecord),
													realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), realRisksData);
												if(realRiskData) me._removeRisk(featureRecord, realRiskData, lastAction);
												else lastAction();	
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

		me.AddRiskButton = me.add({
			xtype:'button',
			text:'+ Add Risk',
			x:0,
			y:370,
			width:80,
			style:'margin-bottom:10px',
			listeners:{
				click: function(){
					if(!me.FeatureStore.first()) me._alert('ERROR', 'No Features for this Release!');
					else if(me.CustomRisksStore) {
						var model = Ext.create('IntelRisk', {
							RiskID: (new Date() * 1) + '' + (Math.random() * 10000000),
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
						me.RisksGrid.getSelectionModel().select(model);
					}
				}
			}
		});
		
		me.RisksGrid = me.add({
			xtype: 'rallygrid',
      title: 'Risks',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:260,
			x:0,
			y:400,
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px';}
			},
			listeners: {
				beforeedit: function(editor, e){
					me._riskScroll = me.RisksGrid.view.getEl().getScrollTop();
				},
				edit: function(editor, e){					
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
					me.RisksGrid.view.getEl().setScrollTop(me._riskScroll);
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
			workweeks = me._getWorkweeks();
		
		/****************************** PREDECESSORS STUFF           ***********************************************/				
		me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
		me.PredDepContainers = {};
		
		function depSorter(o1, o2){ return o1.data.DependencyID > o2.data.DependencyID ? -1 : 1; } //new come first
		function depTeamSorter(o1, o2){ return o1.data.TID > o2.data.TID ? -1 : 1; } //new come first
		
		me.CustomPredDepStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.DependenciesParsedData.Predecessors),
			autoSync:true,
			model:'IntelPredDep',
			proxy: {
				type:'sessionstorage',
				id:'PredDepProxy' + Math.random()
			},
			sorters:[depSorter],
			limit:Infinity,
			update: function(){ 
				var predDepStore = me.CustomPredDepStore, 
					predDepRecs = predDepStore.getRange(),
					realPredDepsData = me.DependenciesParsedData.Predecessors.slice(), //shallow copy of it	
					remoteChanged = false, //if someone else updated this while it was idle on our screen	
					key;
				console.log('syncing predDeps with current userStories', predDepRecs, realPredDepsData);
				for(var i = 0;i<predDepRecs.length;++i){
					var depRec =  predDepRecs[i], //predecessor dependency record to be updated
						depID = depRec.get('DependencyID'),
						realDep = me._removeDepFromList(depID, realPredDepsData),	
						dirtyType = me._getDirtyType(depRec, realDep);
					if(dirtyType === 'New' || dirtyType === 'Edited'){ 
						//we don't want to remove any pending changes			
					} else if(dirtyType == 'Deleted'){ 
						// the depRec was deleted by someone else, and we arent editing it
						predDepStore.remove(depRec);
						if(me.PredDepTeamStores) delete me.PredDepTeamStores[depID];
						if(me.PredDepContainers) delete me.PredDepContainers[depID];
					} else {
						for(key in realDep){
							if(!_.isEqual(depRec.get(key), realDep[key])){ remoteChanged = true; break; }
						}
						if(remoteChanged){
							for(key in realDep){
								if(key === 'Predecessors') depRec.set(key, Ext.clone(realDep[key]) || [me._newTeamDep()]); 
								else depRec.set(key, realDep[key]);
							}
						}
					}				
					var preds = depRec.get('Predecessors');
					//DO NOT SET EDITED==true, because it is already true! only new or edited will ever have preds.length==0
					if(!preds.length) depRec.set('Predecessors', [me._newTeamDep()]); 
					
					if(remoteChanged && me.PredDepTeamStores && me.PredDepTeamStores[depID])
						me.PredDepTeamStores[depID].update();
				}
				realPredDepsData.forEach(function(realDep){ 
					//add all the new risks that other people have added since the last load
					console.log('adding predDep', realDep);
					predDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));					
					var depID = realDep.DependencyID;
					if(me.PredDepTeamStores && me.PredDepTeamStores[depID])
						me.PredDepTeamStores[depID].update();
				});
			}
		});
		me.CustomPredDepStore.update();
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:80,
				resizable:false,
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['FormattedID'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'FormattedID': usr.get('FormattedID')};
						}),
						sorters: {
							property: 'FormattedID'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) === 0;
							});
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},
				sortable:true,
				renderer: function(val){ return val || '-'; }		
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				width:155,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'Name': usr.get('Name') };
						}),
						sorters: {
							property: 'Name'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) === 0;
							});
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				sortable:true	,
				renderer: function(val){ return val || '-'; }			
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				width:160,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				sortable:true,
				renderer: function(val){ return val || '-'; }				
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				text:'Needed By',					
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
				renderer: function(val){ return val || '-'; }
			},{
				text:'Teams Depended On',
				html:	'<div class="pred-dep-header" style="width:30px !important;"></div>' +
						'<div class="pred-dep-header" style="width:140px !important;">Team Name</div>' +
						'<div class="pred-dep-header" style="width:65px  !important;">Supported</div>' +
						'<div class="pred-dep-header" style="width:70px  !important;">US#</div>' +
						'<div class="pred-dep-header" style="width:130px !important;">User Story</div>',
				dataIndex:'DependencyID',
				width:480,
				resizable:false,
				sortable:false,
				xtype:'componentcolumn',
				renderer: function (depID){
					var predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
					var predecessors = predDepRecord.get('Predecessors');
					if(!me.PredDepTeamStores[depID]){
						me.PredDepTeamStores[depID] = Ext.create('Ext.data.Store', { 
							model:'IntelDepTeam',
							data: predecessors,
							autoSync:true,
							limit:Infinity,
							proxy: {
								type:'sessionstorage',
								id:'TeamDep-' + depID + '-proxy' + Math.random()
							},
							sorters:[depTeamSorter],
							update: function(){
								var depTeamStore = me.PredDepTeamStores[depID],
									depTeamRecords = depTeamStore.getRange(),
									predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID),
									predecessors = predDepRecord.get('Predecessors').slice(0);	
								Outer:
								for(var i = 0;i<depTeamRecords.length;++i){
									var depTeamRecord = depTeamRecords[i];
									var realTeamDep;
									for(var j=0; j<predecessors.length;++j){
										if(predecessors[j].TID === depTeamRecord.get('TID')){
											realTeamDep = predecessors.splice(j, 1)[0];
											for(var key in realTeamDep)
												depTeamRecord.set(key, realTeamDep[key]);
											continue Outer;
										}
									}
									depTeamStore.remove(depTeamRecord);
								}
								predecessors.forEach(function(realTeamDep){ 
									depTeamStore.add(Ext.create('IntelDepTeam', realTeamDep));
								});	
								if(depTeamStore.getRange().length===0) depTeamStore.add(me._newTeamDep());
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
							},
							editor: {
								xtype:'combobox', 
								store: Ext.create('Ext.data.Store', {
									fields: ['Name'],
									data: me.ProjectNames,
									sorters: { property: 'Name' }
								}),
								enableKeyEvents:true,
								ignoreNoChange:true,
								queryMode:'local',
								listeners: {
									keyup: function(a,b){
										if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
										var me = this;
										me.store.filters.getRange().forEach(function(filter){
											me.store.removeFilter(filter);
										});
										me.store.filterBy(function(item){
											return item.get('Name').indexOf(me.getRawValue()) > -1;
										});
									},
									focus: function(combo) {
										var me = this;
										me.store.filters.getRange().forEach(function(filter){
											me.store.removeFilter(filter);
										});
										me.store.filterBy(function(item){
											return item.get('Name').indexOf(me.getRawValue()) === 0;
										});
										combo.expand();
									}
								},
								displayField: 'Name'
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
						},{
							resizable:false,
							width:30,
							xtype:'componentcolumn',
							tdCls: 'iconCell',
							renderer: function(val, meta, depTeamRecord){
								//meta.tdAttr = 'data-qtip="' + 'Delete Team' + '"';
								return {
									xtype:'container',
									width:20,
									cls: 'minus-button intel-editor-cell',
									listeners:{
										click: {
											element: 'el',
											fn: function(){
												predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
												var predecessors = predDepRecord.get('Predecessors'),
													scroll = me.PredDepGrid.view.getEl().getScrollTop();
												for(var i=0; i<predecessors.length; ++i)
													if(predecessors[i].TID === depTeamRecord.get('TID')){
														predecessors.splice(i, 1); break; }
												me.PredDepTeamStores[depID].remove(depTeamRecord);
												
												if(!predecessors.length){
													var newItem = me._newTeamDep();
													me.PredDepTeamStores[depID].add(Ext.create('IntelDepTeam', newItem));
													predecessors.push(newItem);
												}
												predDepRecord.set('Edited', true);
												me.PredDepGrid.view.refreshNode(me.CustomPredDepStore.indexOf(predDepRecord));
												me.PredDepGrid.view.getEl().setScrollTop(scroll);	
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
								listeners:{
									click: {
										element: 'el',
										fn: function(){
											if(me.PredDepTeamStores[depID]) {
												var scroll = me.PredDepGrid.view.getEl().getScrollTop();
												var predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
												var newItem = me._newTeamDep();
												me.PredDepTeamStores[depID].insert(0, [Ext.create('IntelDepTeam', newItem)]);
												predDepRecord.data.Predecessors.push(newItem);
												predDepRecord.set('Edited', true);	
												me.PredDepGrid.view.getEl().setScrollTop(scroll);	
											}
										}
									}
								}
							},{
								xtype: 'rallygrid',	
								width:_.reduce(teamColumnCfgs, function(sum, i){ return sum + i.width; }, 0),
								rowLines:false,
								flex:1,
								columnCfgs: teamColumnCfgs,
								plugins: [
									Ext.create('Ext.grid.plugin.CellEditing', {
										triggerEvent:'cellclick'
									})
								],
								viewConfig: {
									stripeRows:false,
									getRowClass: function(teamDepRecord, index, rowParams, store){
										if(!teamDepRecord.get('PID')) return 'intel-row-35px intel-team-dep-row';
										else return 'intel-row-35px';
									}
								},
								listeners: {
									beforeedit: function(editor, e){
										if(!!e.value) return false; //don't edit if has value
										me._predDepScroll = me.PredDepGrid.view.getEl().getScrollTop();
									},
									edit: function(editor, e){	
										var depTeamRecord = e.record,
											field = e.field,
											value = e.value,
											originalValue = e.originalValue,
											i, predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);										
										if(value === originalValue) return;
										
										var previousEdit = predDepRecord.get('Edited');
										predDepRecord.set('Edited', true);
										var predecessors = predDepRecord.get('Predecessors');
										
										if(field === 'PID'){
											var projectRecord = _.find(me.ValidProjects, function(vp){ return vp.data.Name === value; });
											if(!projectRecord) {
												depTeamRecord.set('PID', originalValue);
												predDepRecord.set('Edited', previousEdit);
												me.PredDepGrid.view.getEl().setScrollTop(me._predDepScroll); //reset grid scroll
												return;
											} else {
												for(i = 0;i<predecessors.length;++i){
													if(predecessors[i].PID === ''+projectRecord.get('ObjectID')){
														me._alert('ERROR', value + ' already included in this dependency');
														depTeamRecord.set('PID', originalValue);
														predDepRecord.set('Edited', previousEdit);
														me.PredDepGrid.view.getEl().setScrollTop(me._predDepScroll); //reset grid scroll
														return;
													}
												}
												if(projectRecord.get('ObjectID') === me.ProjectRecord.get('ObjectID')){
													me._alert('ERROR', 'You cannot depend on yourself');
													depTeamRecord.set('PID', originalValue);
													predDepRecord.set('Edited', previousEdit);
													me.PredDepGrid.view.getEl().setScrollTop(me._predDepScroll); //reset grid scroll
													return;
												}
												depTeamRecord.set('PID', projectRecord.get('ObjectID'));
											}
										}
												
										for(i=0; i<predecessors.length; ++i){
											if(predecessors[i].TID === depTeamRecord.get('TID')){
												predecessors[i].PID = depTeamRecord.get('PID'); //update the predDepRecord
												break; 
											}
										}
										me.PredDepGrid.view.getEl().setScrollTop(me._predDepScroll);
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
							render: function(){ me.PredDepContainers[depID] = this; }
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, predDepRecord){	
					var realDepData = me._removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = me._getDirtyType(predDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					meta.tdAttr = 'data-qtip="' + 'Undo' + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var depID = predDepRecord.get('DependencyID');
									var realDep = me._removeDepFromList(depID, me.DependenciesParsedData.Predecessors.slice(0));	
									var scroll = me.PredDepGrid.view.getEl().getScrollTop();
									for(var key in realDep){
										if(key === 'Predecessors') predDepRecord.set(key, Ext.clone(realDep[key]) || [me._newTeamDep()]);
										else predDepRecord.set(key, realDep[key]);
									}
									me.PredDepGrid.view.getEl().setScrollTop(scroll);	
									me.PredDepTeamStores[depID].update();
								}
							}
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, predDepRecord){				
					var realDepData = me._removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = me._getDirtyType(predDepRecord, realDepData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return ''; //don't render it!
					meta.tdAttr = 'data-qtip="' + dirtyType + ' Dependency"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									//validate fields first
									if(predDepRecord.get('FormattedID') === '' || predDepRecord.get('UserStoryName') === ''){
										me._alert('ERROR', 'A UserStory is not selected'); return; }
									if(predDepRecord.get('Description') === ''){
										me._alert('ERROR', 'The description is empty'); return; }
									if(predDepRecord.get('Checkpoint') === ''){
										me._alert('ERROR', 'Select When the dependency is needed by'); return; }
									var predecessors = predDepRecord.get('Predecessors');
									if(predecessors.length === 0){
										me._alert('ERROR', 'You must specify a team you depend on'); return; }
									if(_.find(predecessors, function(p){ return p.PID === ''; })){
										me._alert('ERROR', 'All Team Names must be valid'); return; }
									
									me.PredDepGrid.setLoading(true);
									var predDepData = predDepRecord.data,
										tmpNewUSRecord = me.UserStoryStore.findExactRecord('FormattedID', predDepData.FormattedID),
										newUSRecord;
								
									if(tmpNewUSRecord.get('ObjectID') != predDepRecord.get('ObjectID')){ //load new one
										me._loadUserStory(tmpNewUSRecord.get('ObjectID'), function(usRecord){
											newUSRecord = usRecord; 
											loadOriginalParent();
										});
									} else loadOriginalParent();
									
									function loadOriginalParent(){
										me._loadUserStory(predDepRecord.get('ObjectID'), function(oldUSRecord){
											var addedTeamDeps = [], 
												removedTeamDeps = [], 
												updatedTeamDeps = [], 
												localPredTeams = predDepData.Predecessors;
											if(!oldUSRecord) addedTeamDeps = predDepData.Predecessors;
											else {
												var oldRealDepsData = me._parseDependenciesFromUserStory(oldUSRecord).Predecessors,
													oldRealDepData = me._removeDepFromList(predDepData.DependencyID, oldRealDepsData),
													oldRealPredTeams  = oldRealDepData ? (oldRealDepData.Predecessors || []) : [];											
												
												newUSRecord = newUSRecord || oldUSRecord; //if new is same as old			
												Outer:
												for(var i=0;i<localPredTeams.length;++i){
													for(var j=0;j<oldRealPredTeams.length;++j){
														if(localPredTeams[i].TID === oldRealPredTeams[j].TID){
															updatedTeamDeps.push(oldRealPredTeams.splice(j,1)[0]);
															continue Outer;
														}
													}
													addedTeamDeps.push(localPredTeams[i]); //teams we just added
												}
												removedTeamDeps = oldRealPredTeams; //teams that we just removed	
											}
											
											/** we have to do it this way, cuz added deps need to be assigned user stories first **/
											var addedTeamDepsFinished = -1; 
											var addedTeamDepsCallbacks = [];
											var addedTeamDepsDone = function(){
												if(++addedTeamDepsFinished === addedTeamDeps.length){
													
													var updatedTeamDepsFinished = -1; 
													var updatedTeamDepsCallbacks = [];
													var updatedTeamDepsDone = function(){
														if(++updatedTeamDepsFinished === updatedTeamDeps.length){	
														
															/** 3) remove removed teams */
															removedTeamDeps.forEach(function(teamDepData){ //execute the removed teams now
																var project = me.ValidProjects[teamDepData.PID];
																me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
																	if(!us) return; // looks as if the userStory doesn't exist. so we ignore it
																	var succDepData = { //we only need these fields to delete it!
																		FormattedID: teamDepData.USID,
																		DependencyID: predDepData.DependencyID
																	};
																	me._removeSuccDep(us, succDepData); 
																});
															});
															addedTeamDepsCallbacks.forEach(function(cb){ cb(); }); //execute the added teams now 
															updatedTeamDepsCallbacks.forEach(function(cb){ cb(); }); //execute the updated teams now 

															predDepData.ObjectID = newUSRecord.get('ObjectID');
															predDepData.Predecessors = localPredTeams; //update these after 1) and 2) changed them
															
															var lastAction = function(){
																var scroll = me.PredDepGrid.view.getEl().getScrollTop();
																predDepRecord.set('Edited', false);
																me.PredDepGrid.view.getEl().setScrollTop(scroll);
																me.PredDepGrid.setLoading(false);
															},
															nextAction = function(){
																me._addPredDep(newUSRecord, predDepData, lastAction);
															};										
															if(oldRealDepData && oldUSRecord.get('ObjectID') !== newUSRecord.get('ObjectID')) 
																me._removePredDep(oldUSRecord, oldRealDepData, nextAction);
															else nextAction();		
														}
													};
													
													updatedTeamDepsDone();
													
													/** 2) update updated teams **/
													updatedTeamDeps.forEach(function(teamDepData){ //have to update these here!
														var project = me.ValidProjects[teamDepData.PID];
														me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
															if(!us){
																me._loadRandomUserStory(project.get('_ref'), function(us){
																	if(!us){
																		me.PredDepGrid.setLoading(false);
																		me._alert('ERROR', 'Project ' + project.get('Name') + ' has no user stories, cannot continue');
																		return;
																	}
																	updatedTeamDepsCallbacks.push(function(){ // got deleted from user story
																		for(var i=0;i<localPredTeams.length;++i){
																			if(localPredTeams[i].TID === teamDepData.TID){ 
																				localPredTeams[i].USID = us.get('FormattedID');
																				localPredTeams[i].USName = us.get('Name');
																				localPredTeams[i].A = false;
																				//leave Sup and PID fields the same
																				break;
																			}
																		}
																		var succDep = {
																			DependencyID: predDepData.DependencyID,
																			SuccUserStoryName: predDepData.UserStoryName,
																			SuccFormattedID: predDepData.FormattedID,
																			SuccProjectID: me.ProjectRecord.get('ObjectID'),
																			Description: predDepData.Description,
																			Checkpoint: predDepData.Checkpoint,
																			UserStoryName: '',
																			FormattedID: '',
																			Supported: teamDepData.Sup,
																			Assigned: false,
																			ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
																			ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
																			Edited: false
																		};
																		me._addSuccDep(us, succDep);
																	});
																	updatedTeamDepsDone();
																});
															}
															else{
																updatedTeamDepsCallbacks.push(function(){
																	var succDep = {
																		DependencyID: predDepData.DependencyID,
																		SuccUserStoryName: predDepData.UserStoryName,
																		SuccFormattedID: predDepData.FormattedID,
																		SuccProjectID: me.ProjectRecord.get('ObjectID'),
																		Description: predDepData.Description,
																		Checkpoint: predDepData.Checkpoint,
																		UserStoryName: teamDepData.USName,
																		FormattedID: teamDepData.USID,
																		Supported: teamDepData.Sup,
																		Assigned: teamDepData.A,
																		ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
																		ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
																		Edited: false
																	};
																	me._addSuccDep(us, succDep);
																});
																updatedTeamDepsDone();
															}
														});
													});
														
												}
											};
											addedTeamDepsDone();
											
											/** 1) add new teams. do this first, cuz if the team has no user stories we gotta stop **/
											addedTeamDeps.forEach(function(teamDepData){ //have to update these here!
												var project = me.ValidProjects[teamDepData.PID];
												me._loadRandomUserStory(project.get('_ref'), function(us){
													if(!us){
														me.PredDepGrid.setLoading(false);
														me._alert('ERROR', 'Project ' + project.get('Name') + ' has no user stories, cannot continue');
														return;
													}
													addedTeamDepsCallbacks.push(function(){
														teamDepData.USID = us.get('FormattedID');
														teamDepData.USName = us.get('Name');
														var succDep = {
															DependencyID: predDepData.DependencyID,
															SuccUserStoryName: predDepData.UserStoryName,
															SuccFormattedID: predDepData.FormattedID,
															SuccProjectID: me.ProjectRecord.get('ObjectID'),
															UserStoryName: '', //not assigned yet 
															FormattedID: '',  //not assigned yet
															Description: predDepData.Description,
															Checkpoint: predDepData.Checkpoint,
															Supported: 'No',
															Assigned: false,
															ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
															ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
															Edited: false
														};
														me._addSuccDep(us, succDep);
													});
													addedTeamDepsDone();
												});
											});
										});
									}
								}
							}
						}
					};
				}
			},{
				text:'',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, predDepRecord){		
					meta.tdAttr = 'data-qtip="' + 'Delete' + ' Dependency"';
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
										var scroll = me.PredDepGrid.view.getEl().getScrollTop();
										me.PredDepGrid.setLoading(true);
										me._loadUserStory(predDepRecord.get('ObjectID'), function(usRecord){							
											var lastAction = function(){	//last thing to do!	
												var scroll = me.PredDepGrid.view.getEl().getScrollTop();
												me.CustomPredDepStore.remove(predDepRecord);
												me.PredDepGrid.view.getEl().setScrollTop(scroll);	
												me.PredDepGrid.setLoading(false);
											};	
											if(!usRecord) lastAction();
											else {
												var predDepData = predDepRecord.data,
													realDepsData = me._parseDependenciesFromUserStory(usRecord).Predecessors,
													realDepData = me._removeDepFromList(predDepData.DependencyID, realDepsData),
													realTeamDeps  = realDepData ? (realDepData.Predecessors || []) : [];	
													
												realTeamDeps.forEach(function(teamDepData){
													if(teamDepData.PID === '') return;
													var project = me.ValidProjects[teamDepData.PID];
													me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
														if(!us) return; //us must have been deleted. ignore it
														var succDepData = {
															FormattedID: teamDepData.USID,
															DependencyID: predDepData.DependencyID
														};
														me._removeSuccDep(us, succDepData); //using teamDepData cuz we only need DependencyID
													});
												});
												if(realDepData) me._removePredDep(usRecord, realDepData, lastAction);
												else lastAction();
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

		me.AddPredDepButton = me.add({
			xtype:'button',
			text:'+ Add Dependency',
			style:'margin-bottom:10px',
			x:0,
			y:720,
			listeners:{
				click: function(){
					if(!me.DependenciesReleaseUserStories.length) me._alert('ERROR', 'No User Stories for this Release!');
					else if(me.CustomPredDepStore) {
						var model = Ext.create('IntelPredDep', {
							DependencyID: (new Date() * 1) + '' + (Math.random() * 10000000),
							ObjectID:'',
							FormattedID: '',
							UserStoryName: '',
							Description: '',
							Checkpoint: '',
							Predecessors:[me._newTeamDep()],
							Edited:true
						});
						me.CustomPredDepStore.insert(0, [model]);	
						me.PredDepGrid.getSelectionModel().select(model);
					}
				}
			}
		});
		
		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
      title: "Dependencies We Have on Other Teams",
			width: _.reduce(predDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			x:0, y:750,
			scroll:'vertical',
			columnCfgs: predDepColumnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(predDepRecord){ 
					var cls = 'intel-row-' + (10 + (35*predDepRecord.get('Predecessors').length || 35)) + 'px';
					return cls;
				}
			},
			listeners: {
				beforeedit: function(editor, e){
					me._predDepScroll = me.PredDepGrid.view.getEl().getScrollTop();
				},
				edit: function(editor, e){					
					var grid = e.grid,
						predDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;							
					
					if(value === originalValue) return; 
					if(field === 'Description') {
						value = me._htmlEscape(value);			
						predDepRecord.data[field] = value;
					}

					var previousEdit = predDepRecord.get('Edited'); 
					predDepRecord.data.Edited = true;
					
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							predDepRecord.data.UserStoryName = originalValue;
							predDepRecord.data.Edited = previousEdit; 
						} else predDepRecord.data.FormattedID = userStoryRecord.get('FormattedID');	
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							predDepRecord.data.FormattedID = originalValue;
							predDepRecord.data.Edited = previousEdit; 
						} else predDepRecord.data.UserStoryName = userStoryRecord.get('Name');	
					}
					predDepRecord.commit();
					me.PredDepGrid.view.getEl().setScrollTop(me._predDepScroll);
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			store: me.CustomPredDepStore
		});	
	
		/****************************** SUCCESSORS    STUFF           ***********************************************/	
		me.CustomSuccDepStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.DependenciesParsedData.Successors.slice(0)),
			autoSync:true,
			model:'IntelSuccDep',
			proxy: {
				type: 'sessionstorage',
				id:'SuccDepProxy' + Math.random()
			},
			limit:Infinity,
			sorters:[depSorter],
			update: function(){
				var succDepStore = me.CustomSuccDepStore,
					customSuccDepRecs = succDepStore.getRange(), 
					realSuccDepsData = me.DependenciesParsedData.Successors.slice(0), //shallow copy of it
					remoteChanged = false, //if someone else updated this while it was idle on our screen	
					key;
				console.log('syncing succDeps with current userStories', customSuccDepRecs, realSuccDepsData);
				for(var i = 0;i<customSuccDepRecs.length;++i){
					var depRec =  customSuccDepRecs[i]; //predecessor dependency record to be updated
					
					var depID = depRec.get('DependencyID');
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
							for(key in realDep)
								depRec.set(key, realDep[key]);
						}
					}
				}
				realSuccDepsData.forEach(function(realDep){ 
					console.log('adding succDep', realDep);
					succDepStore.add(Ext.create('IntelSuccDep', Ext.clone(realDep)));
				});
			}
		});
		me.CustomSuccDepStore.update();
		
		var succDepColumnCfgs = [
			{
				text:'Requested By', //'Predecesor Project',
				dataIndex:'SuccProjectID',
				width:160,
				resizable:false,
				sortable:true,
				renderer: function(pid){
					var project = me.ValidProjects[pid];
					return project ? project.get('Name') : pid;
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
				width:160,
				resizable:false,
				sortable:true		
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				width:160,
				resizable:false,
				editor: false,
				sortable:true					
			},{
				text:'Needed By',
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				editor: false,
				sortable:true					
			},{
				text:'Supported',					
				dataIndex:'Supported',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Sup'],
						data: [
							{Sup:'Yes'},
							{Sup:'No'}
						]
					}),
					editable: false,
					displayField: 'Sup',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
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
					xtype:'combobox',
					width:120,
					store: Ext.create('Ext.data.Store', {
						fields: ['FormattedID'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'FormattedID': usr.get('FormattedID')};
						}),
						sorters: {
							property: 'FormattedID'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) === 0;
							});
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},
				sortable:true,
				renderer: function(val){
					if(!val) return '-';
					else return val;
				}
			},{
				text:'Sup UserStory', 
				dataIndex:'UserStoryName',
				width:150,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'Name': usr.get('Name') };
						}),
						sorters: {
							property: 'Name'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) === 0;
							});
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				sortable: true,
				renderer: function(val){
					if(!val) return '-';
					else return val;
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){			
					if(!succDepRecord.get('FormattedID')) return '';
					meta.tdAttr = 'data-qtip="' + 'Remove User Story' + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'minus-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var scroll = me.SuccDepGrid.view.getEl().getScrollTop();
									succDepRecord.set('Edited', true);
									succDepRecord.set('Assigned', false);
									succDepRecord.set('FormattedID', '');
									succDepRecord.set('UserStoryName', '');
									me.SuccDepGrid.view.getEl().setScrollTop(scroll);	
								}
							}
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){		
					var realDepData = me._removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = me._getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					meta.tdAttr = 'data-qtip="' + 'Undo' + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'undo-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									var depID = succDepRecord.get('DependencyID');
									var realDep = me._removeDepFromList(depID, me.DependenciesParsedData.Successors.slice(0));	
									var scroll = me.SuccDepGrid.view.getEl().getScrollTop();
									for(var key in realDep)
										succDepRecord.set(key, realDep[key]);
									me.SuccDepGrid.view.getEl().setScrollTop(scroll);	
								}
							}
						}
					};
				}
			},{
				text:'',
				width:30,
				xtype:'componentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){	
					var realDepData = me._removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = me._getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					meta.tdAttr = 'data-qtip="' + 'Resave' + '"';
					return {
						xtype:'container',
						width:20,
						cls: 'save-button intel-editor-cell',
						listeners:{
							click: {
								element: 'el',
								fn: function(){
									//no field validation needed
									me.SuccDepGrid.setLoading(true);	
									var succDepData = succDepRecord.data,
										tmpNewUSRecord = me.UserStoryStore.findExactRecord('FormattedID', succDepRecord.FormattedID),
										newUSRecord;
								
									if(tmpNewUSRecord && tmpNewUSRecord.get('ObjectID') != succDepRecord.get('ObjectID')){ //load new one
										me._loadUserStory(tmpNewUSRecord.get('ObjectID'), function(usRecord){
											newUSRecord = usRecord; 
											loadOriginalParent();
										});
									} else loadOriginalParent();

									function loadOriginalParent(){
										me._loadUserStory(succDepRecord.get('ObjectID'), function(oldUSRecord){
											var oldRealDepData, oldRealDepsData;
											if(oldUSRecord){
												oldRealDepsData = me._parseDependenciesFromUserStory(oldUSRecord).Successors;
												oldRealDepData = me._removeDepFromList(succDepData.DependencyID, oldRealDepsData);										
												newUSRecord = newUSRecord || oldUSRecord; //if new is same as old			
											}
											succDepData.ObjectID = newUSRecord.get('ObjectID');
											
											var lastAction = function(){ //This is the last thing to do!
												var scroll = me.SuccDepGrid.view.getEl().getScrollTop();
												succDepRecord.set('Edited', false);
												me.SuccDepGrid.view.getEl().setScrollTop(scroll);	
												me.SuccDepGrid.setLoading(false);
											};
											
											var nextAction = function(){ //2nd to last thing to do
												me._addSuccDep(newUSRecord, succDepData, lastAction);
											};
											
											var alertAndDelete = function(msg){
												me._alert('ERROR', msg);
												me._removeSuccDep(newUSRecord, succDepData, function(){
													me.SuccDepGrid.setLoading(false);
													var scroll = me.SuccDepGrid.view.getEl().getScrollTop();
													me.CustomSuccDepStore.remove(succDepRecord);
													me.SuccDepGrid.view.getEl().setScrollTop(scroll);	
												});
											};
											var project = me.ValidProjects[succDepData.SuccProjectID];
											me._loadUserStoryByFID(succDepData.SuccFormattedID, project.get('_ref'), function(us){	
												if(!us) alertAndDelete('Successor UserStory has been deleted. Deleting Dependency Now');
												else {
													var deps = me._getDependencies(us);
													var rppData = deps.Preds[succDepData.DependencyID];
													if(rppData){
														var predDepData = {
															DependencyID: succDepData.DependencyID,
															FormattedID: us.get('FormattedID'),
															UserStoryName: us.get('Name'),
															Description: rppData.Desc,
															Checkpoint: rppData.CP,
															Status: rppData.Sta,
															Predecessors: rppData.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
															Edited: false //not in pending edit mode
														};
														var predecessors = predDepData.Predecessors;
														for(var i = 0;i<predecessors.length;++i){
															//have to make sure this dep is actually in the JSON teamDep object
															if(predecessors[i].PID == me.ProjectRecord.get('ObjectID')){ 
																predecessors[i].Sup = succDepData.Supported;
																predecessors[i].USID = newUSRecord.get('FormattedID');
																predecessors[i].USName = newUSRecord.get('Name');
																predecessors[i].A = succDepData.Assigned;
																me._addPredDep(us, predDepData);
														
																/***************************** UPDATE THE SUCC USER STORIES *********************/
			
																//move succ dep to new user story if needed, don't change it if set to ''
																if(oldRealDepData && oldUSRecord.get('ObjectID') !== newUSRecord.get('ObjectID'))
																	me._removeSuccDep(oldUSRecord, oldRealDepData, nextAction);
																else nextAction();
																return;
															}
														}
														alertAndDelete('Successor removed your dependency. Deleting this dependency now');
													}
													else alertAndDelete('Successor removed this dependency. Deleting your dependency now');
												} 
											});
										});
									}
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
			width: _.reduce(succDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			x:0, y:1100,
			scroll:'vertical',
			columnCfgs: succDepColumnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px'; }
			},
			listeners: {
				beforeedit: function(editor, e){
					var succDepRecord = e.record;
					if(succDepRecord.get('Supported') == 'No' && e.field != 'Supported') 
						return false; //don't user story stuff if not supported
					me._succDepScroll = me.SuccDepGrid.view.getEl().getScrollTop();
				},
				edit: function(editor, e){					
					var grid = e.grid,
						succDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
					
					var previousEdit = succDepRecord.get('Edited');
					succDepRecord.set('Edited', true);
					
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							succDepRecord.set('UserStoryName', originalValue);
							succDepRecord.set('Edited', previousEdit); 
						} else {
							succDepRecord.set('FormattedID', userStoryRecord.get('FormattedID'));	
							succDepRecord.set('Assigned', true);
						}
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							succDepRecord.set('FormattedID', originalValue);
							succDepRecord.set('Edited', previousEdit); 
						} else {
							succDepRecord.set('UserStoryName', userStoryRecord.get('Name'));	
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
					me.SuccDepGrid.view.getEl().setScrollTop(me._succDepScroll);
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
