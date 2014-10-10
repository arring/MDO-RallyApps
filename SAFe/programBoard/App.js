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
//console = { log: function(){} }; // DEBUG!!!!		
preferenceName = 'intel-program-board';

/********************* END PRODUCTION *****************/
Ext.define('ProgramBoard', {
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
	},{
		xtype:'container',
		layout: {
			type:'hbox',
			align:'stretch',
			pack:'start'
		},
		height:320,
		itemId:'tc_vel_box'
	}],
	minWidth:910, //thats when rally adds a horizontal scrollbar for a pagewide app
		
	/****************************************************** DATA STORE METHODS ********************************************************/
	
	//___________________________________GENERAL LOADING STUFF___________________________________	
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
		var me = this;
		if(!oid){ cb(); return; }
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
		var me = this;
		if(!oid){ cb(); return; }
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
			callback: cb
		});
	},
	
	_loadRootProject: function(projectRecord, cb){
		var me=this, n = projectRecord.get('Name');
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
		if(!projectRecord) cb();
		var me=this, split = projectRecord.get('Name').split(' ART ');
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
	
	_loadAllTrains: function(cb){
		var me=this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Project',
			autoLoad:true,
			remoteSort:false,
			limit:Infinity,
			fetch: ['Name', 'ObjectID'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
					property:'Name',
					operator: 'contains',
					value: ' ART '
				},{
					property: 'Name',
					operator: '!contains',
					value: 'Test'
				}
			],
			listeners: {
				load: {
					fn: function(projectStore, projectRecords){
						me.AllTrainRecordsStore = projectStore;
						me.TrainNames = _.map(projectRecords, function(pr){ return {Name: pr.get('Name').split(' ART ')[0]};  });
						console.log('AllTrainRecords loaded', projectRecords);
						cb();
					},
					single:true
				}
			}
		});
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
				
	_loadRandomUserStory: function(ProjectRef, cb){ //get the most recent one!!
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:1,
			pageSize:1,
			fetch: ['Name', 'CreationDate', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
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
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:1,
			pageSize:1,
			fetch: ['Name', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
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
					if(frData.Parent) this._loadMilestone(frData.Parent, this._milestoneLoaded.bind(this, frData, deferred));
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
	
	_loadIterations: function(cb){
		var startDate =	Rally.util.DateTime.toIsoString(this.ReleaseRecord.get('ReleaseStartDate')),
			endDate =	Rally.util.DateTime.toIsoString(this.ReleaseRecord.get('ReleaseDate'));
		this.IterationStore = Ext.create("Rally.data.WsapiDataStore", {
			model: "Iteration",
			autoLoad: true,
			remoteSort: false,
			limit:Infinity,
      fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project"],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
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
			],
			listeners: {
				load: function(store) {
					console.log('Iterations loaded:', store.getRecords());
          cb();
        },
				scope:this,
				single:true
			}
    });
	},
	
	_loadUserStories: function(cb){	
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
	
	/**___________________________________TEAM COMMITS STUFF___________________________________**/
			
	_getTeamCommit: function(featureRecord){	
		var tcs = featureRecord.get('c_TeamCommits'),
			projectID = this.ProjectRecord.get('ObjectID');
		try{ tcs = JSON.parse(atob(tcs))[projectID] || {}; } 
		catch(e){ tcs = {}; }
		return tcs;
	},
		
	_setTeamCommit: function(featureRecord, tc){
		var tcs = featureRecord.get('c_TeamCommits'),
			projectID = this.ProjectRecord.get('ObjectID'),
			deferred = Q.defer();
		try{ tcs = JSON.parse(atob(tcs)) || {}; }
		catch(e){ tcs = {}; }
		if(!tcs[projectID]) tcs[projectID] = {};
		tcs[projectID].Commitment = tc.Commitment;
		tcs[projectID].Objective = tc.Objective;
		var str = btoa(JSON.stringify(tcs, null, '\t'));
		if(str.length >= 32768)
			deferred.reject('TeamCommits field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
		else {
			featureRecord.set('c_TeamCommits', str);
			featureRecord.save({ 
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.get('FormattedID'));
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
		var count = _.reduce(this.UserStoryStore.getRecords(), function(total, us){ 
			return (us.get('Feature') && us.get('Feature').ObjectID == FID)*1 + total;
		}, 0);
		this._TeamCommitsCountHash[FID] = count;
		return count;
	},
		
	_TeamCommitsEstimateHash: {},
	_getStoriesEstimate: function(FID){	
		if(this._TeamCommitsEstimateHash[FID]) 
			return this._TeamCommitsEstimateHash[FID];
		var estimate = _.reduce(this.UserStoryStore.getRecords(), function(total, us){ 
			return (us.get('Feature') && us.get('Feature').ObjectID == FID ? us.get('PlanEstimate') : 0)*1 + total;
		}, 0);
		this._TeamCommitsEstimateHash[FID] = estimate;
		return estimate;
	},
		
	/**___________________________________VELOCITY STUFF___________________________________ **/
	
	/**___________________________________ RISKS STUFF___________________________________**/
	_updateFColumnStores: function(){ //updates the dropdown stores with the most recent features in the release (in case some were added
		var me = this;
		if(me.FeatureFIDStore){
			me.FeatureFIDStore.removeAll();
			_.each(me.FeatureStore.getRange(), function(f){
				me.FeatureFIDStore.add({'FormattedID': f.get('FormattedID')});
			});
		}
		if(me.FeatureNameStore) {
			me.FeatureNameStore.removeAll();
			_.each(me.FeatureStore.getRange(), function(f){
				me.FeatureNameStore.add({'Name': f.get('Name')});
			});
		}
	},
	
	_getRisks: function(featureRecord){
		var risks = featureRecord.get('c_Risks');
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
			projectID = this.ProjectRecord.get('ObjectID'),
			deferred = Q.defer();
			
		if(risks[projectID]){
			risks[projectID][riskData.RiskID] = undefined;
			this.RisksParsedData = _.reject(this.RisksParsedData, function(rpd){ //remove it from cached risks
				return rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID;
			});
			var str = btoa(JSON.stringify(risks, null, '\t')); //b64 encode yosef
			if(str.length >= 32768) 
				deferred.reject('Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
			else {
				featureRecord.set('c_Risks', str);
				featureRecord.save({
					callback:function(record, operation, success){
						if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.get('FormattedID'));
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
			projectID = this.ProjectRecord.get('ObjectID'),
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
	
	_updateUSColumnStores: function(){ //updates the dropdown stores with the most recent user stories in the release (in case some were added
		var me = this;
		if(me.UserStoryFIDStore){
			me.UserStoryFIDStore.removeAll();
			_.each(me.DependenciesReleaseUserStories, function(usr){
				me.UserStoryFIDStore.add({'FormattedID': usr.get('FormattedID')});
			});
		}
		if(me.UserStoryNameStore) {
			me.UserStoryNameStore.removeAll();
			_.each(me.DependenciesReleaseUserStories, function(usr){
				me.UserStoryNameStore.add({'Name': usr.get('Name')});
			});
		}
	},
	
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
	
	_buildDependenciesData: function(){	
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
					var deferred = Q.defer();
					promises.push(deferred.promise);
					if(!_.find(collectionRecords, function(cr){ return cr.get('FormattedID') === dep.USID; })) { //add it
						var project = me.ValidProjects[dep.PID];
						me._loadUserStoryByFID(dep.USID, project.get('_ref'), function(us){
							if(us) { syncCollectionProxy = true; collectionStore.add(us); }
							deferred.resolve();
						});
					} else deferred.resolve();
				});
				usRemoveList.forEach(function(dep){
					var realDep = _.find(collectionRecords, function(cr) { return cr.data.FormattedID===dep.USID; });
					if(realDep) { collectionStore.remove(realDep); syncCollectionProxy = true;}
				});
				
				//attempt to sync collection until it passes, 4 == max attempts
				var attempts = 0;
				Q.all(promises).then(function retrySync(){
					if(++attempts > 4){
						console.log('Quit trying to modify ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
						funcDeferred.resolve();		
					}
					else if(syncCollectionProxy) {
						collectionStore.sync({ 
							failure:function(){
								console.log('Failed attempt to modify ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
								retrySync(); //we will succeed, after 4 attempts we quit
							},
							success:function(){ 
								console.log('Successfully modified ' + type + ' of User Story: ' + userStoryRecord.data.FormattedID);
								funcDeferred.resolve(); 
							} //ignore failures, sigh
						});
					}
					else funcDeferred.resolve();
				}, function(reason){ 
					funcDeferred.reject(reason); 
				});
			}
		});	
		return funcDeferred.promise;
	},
	
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
			var deferred = Q.defer(), project = me.ValidProjects[teamDepData.PID];
			promises.push(deferred.promise);
			if(!permissions.isProjectEditor(project)) deferred.reject('You lack permissions to modify project: ' + project.get('Name'));
			else me._loadRandomUserStory(project.get('_ref'), function(us){
				if(!us) deferred.reject('Project ' + project.get('Name') + ' has no user stories, cannot continue');
				else deferred.resolve(function(){ 
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
					return me._addSuccDep(us, succDep); //return promise
				});
			});
		});
		return Q.all(promises);
	},
	
	_getUpdatedTeamDepCallbacks: function(teamDeps, predDepData){ //teamDeps might mutate
		var me=this, 
			permissions = me.getContext().getPermissions(),
			promises = [];
		teamDeps.forEach(function(teamDepData){
			var deferred = Q.defer(), project = me.ValidProjects[teamDepData.PID];
			promises.push(deferred.promise);
			if(!permissions.isProjectEditor(project)) deferred.reject('You lack permissions to modify project: ' + project.get('Name'));
			else me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
				var succDep = {
					DependencyID: predDepData.DependencyID,
					SuccUserStoryName: predDepData.UserStoryName,
					SuccFormattedID: predDepData.FormattedID,
					SuccProjectID: me.ProjectRecord.get('ObjectID'),
					Description: predDepData.Description,
					Checkpoint: predDepData.Checkpoint,
					ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
					ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
					Supported: teamDepData.Sup,
					Edited: false
				};
				if(!us){
					me._loadRandomUserStory(project.get('_ref'), function(us){
						if(!us) deferred.reject('Project ' + project.get('Name') + ' has no user stories, cannot continue');
						else deferred.resolve(function(){ // got deleted from user story
							teamDepData.USID = us.get('FormattedID');
							teamDepData.USName = us.get('Name');
							teamDepData.A = false;
							
							succDep.UserStoryName = '';
							succDep.FormattedID = '';
							succDep.Assigned = false;						
							return me._addSuccDep(us, succDep); //return promise
						});
					});
				}
				else{
					deferred.resolve(function(){
						succDep.UserStoryName = teamDepData.USName;
						succDep.FormattedID = teamDepData.USID;
						succDep.Assigned = teamDepData.A;
						return me._addSuccDep(us, succDep); //return promise
					});
				}
			});
		});
		return Q.all(promises);
	},
	
	_getRemovedTeamDepCallbacks: function(teamDeps, predDepData){
		var me=this, 
			permissions = me.getContext().getPermissions(),
			promises = [];
		teamDeps.forEach(function(teamDepData){
			var deferred = Q.defer(), project = me.ValidProjects[teamDepData.PID];
			promises.push(deferred.promise);
			if(!permissions.isProjectEditor(project)) deferred.reject('You lack permissions to modify project: ' + project.get('Name'));
			else me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
				if(!us) deferred.resolve(function(){}); // looks as if the userStory doesn't exist. so we ignore it
				else deferred.resolve(function(){
					var succDepData = { //we only need these fields to delete it!
						FormattedID: teamDepData.USID,
						DependencyID: predDepData.DependencyID
					};
					return me._removeSuccDep(us, succDepData);
				});
			});
		});
		return Q.all(promises);
	},

	_updateSuccessor: function(succDepData, newUSRecord){
		var me=this, 
			permissions = me.getContext().getPermissions(),
			deferred = Q.defer();
		
		var project = me.ValidProjects[succDepData.SuccProjectID];
		if(!permissions.isProjectEditor(project)) 
			deferred.reject('You lack permissions to modify project: ' + project.data.Name);
		else me._loadUserStoryByFID(succDepData.SuccFormattedID, project.data._ref, function(us){	
			if(!us) deferred.reject(['Successor UserStory has been deleted.']);
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
							deferred.resolve(me._addPredDep(us, predDepData));
							return;
						}
					}
					deferred.reject(['Successor removed this dependency.']);
				}
				else deferred.reject(['Successor removed this dependency.']);
			} 
		});
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
	_isEditingTeamCommits: false, 
	_isEditingVelocity: false,
	
	_isEditing: function(store){
		if(!store) return false;
		for(var records = store.getRange(), i=0, len=records.length; i<len; ++i)
			if(records[i].data.Edited) return true;
		return false;
	},
	
	_updateAllGrids: function(){ //synchronous function
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
			me._buildDependenciesData(); //reparse the data
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
			var def1 = Q.defer();
			if(me.IterationStore) me.IterationStore.load({ callback: def1.resolve});
			else me._loadIterations(def1.resolve);
			promises.push(def1.promise);
		}
		if(!me._isEditingTeamCommits && !isEditingRisks){
			var def2 = Q.defer();
			if(me.FeatureStore) me.FeatureStore.load({ callback: def2.resolve});
			else me._loadFeatures(def2.resolve);
			promises.push(def2.promise);
		}
		if(!me._isEditingVelocity && !me._isEditingTeamCommits && !isEditingDeps){
			var def3 = Q.defer();
			if(me.UserStoryStore) me.UserStoryStore.load({ callback: def3.resolve});
			else me._loadUserStories(def3.resolve);
			promises.push(def3.promise);
		}
		return Q.all(promises);
	},
	
	_storesReloaded: function(){
		var me=this;
		me._loadTeamCommitsGrid();
		me._loadVelocityGrid(); 
		me._loadRisksGrid();
		me._loadDependenciesGrids();
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
			isEditingDeps = me._isEditing(me.CustomPredDepStore) || me._isEditing(me.CustomSuccDepStore);			
		if(me.TeamCommitsGrid && !me._isEditingTeamCommits) me.TeamCommitsGrid.setLoading(t);
		if(me.VelocityGrid && !me._isEditingVelocity) me.VelocityGrid.setLoading(t);
		if(me.RisksGrid && !isEditingRisks) me.RisksGrid.setLoading(t);
		if(me.PredDepGrid && !isEditingDeps) me.PredDepGrid.setLoading(t);
		if(me.SuccDepGrid && !isEditingDeps) me.SuccDepGrid.setLoading(t);
	},
	
	_removeLoadingMasks: function(){
		var me=this;
		if(me.TeamCommitsGrid) me.TeamCommitsGrid.setLoading(false);
		if(me.VelocityGrid) me.VelocityGrid.setLoading(false);
		if(me.RisksGrid) me.RisksGrid.setLoading(false);
		if(me.PredDepGrid) me.PredDepGrid.setLoading(false);
		if(me.SuccDepGrid) me.SuccDepGrid.setLoading(false);
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
			me._alert('ERROR', 'This team has no releases');
		}
	},
	
	_trainRecordLoaded: function(trainRecord){ //now we set the TrainRecord based on trainRecord and this.AppPrefs
		var me=this;
		if(trainRecord)	me.TrainRecord = trainRecord;
		else {
			me.ProjectNotInTrain = true;
			var pid = me.ProjectRecord.get('ObjectID');
			if(me.AppPrefs.projs[pid] && me.AppPrefs.projs[pid].Train) {
				me.TrainRecord = me.AllTrainRecordsStore.findExactRecord('ObjectID', me.AppPrefs.projs[pid].Train);
				if(!me.TrainRecord) me.TrainRecord = me.AllTrainRecordsStore.first();
			}
			else me.TrainRecord = me.AllTrainRecordsStore.first();
		}
		console.log('train loaded:', trainRecord);
		me._loadReleasesInTheFuture(me.ProjectRecord).then(me._releasesLoaded.bind(me));
	},
	
	_allTrainRecordsLoaded: function(){
		this._projectInWhichTrain(this.ProjectRecord, this._trainRecordLoaded.bind(this));
	},
	
	_preferencesLoaded: function(){
		this._loadAllTrains(this._allTrainRecordsLoaded.bind(this));
	},
	
	_validProjectsLoaded: function(){
		this.ProjectRecord = this.ValidProjects[this.ProjectRecord.get('ObjectID')];
		if(this.ProjectRecord) this._loadPreferences(this._preferencesLoaded.bind(this));
		else{
			this.removeAll();
			this._alert('ERROR', 'Please scope to a valid team for release planning');
		}
	},
	
	_rootProjectLoaded: function(){
		this._loadValidProjects(this._validProjectsLoaded.bind(this));
	},
	
	_currentProjectLoaded: function(scopeProjectRecord){
		this.ProjectRecord = scopeProjectRecord;
		this._loadRootProject(scopeProjectRecord, this._rootProjectLoaded.bind(this));
	},
	
	_modelsLoaded: function(){
		var scopeProject = this.getContext().getProject();
		this._loadProject(scopeProject, this._currentProjectLoaded.bind(this));
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
	
	_trainPickerSelected: function(combo, records){
		if(this.TrainRecord.get('Name').indexOf(records[0].get('Name')) === 0) return;
		this.setLoading(true);
		this.TrainRecord = this.AllTrainRecordsStore.findRecord('Name', records[0].get('Name'));			
		var pid = this.ProjectRecord.get('ObjectID');
		if(typeof this.AppPrefs.projs[pid] !== 'object') this.AppPrefs.projs[pid] = {};
		this.AppPrefs.projs[pid].Train = this.TrainRecord.get('ObjectID');
		this._savePreferences(this.AppPrefs, this._reloadEverything.bind(this));
	},
	
	_loadTrainPicker: function(){
		if(this.ProjectNotInTrain){
			this.down('#navbox_left').add({
				xtype:'combobox',
				width:240,
				labelWidth:40,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],
					data: this.TrainNames
				}),
				displayField: 'Name',
				fieldLabel: 'Train:',
				editable:false,
				value:this.TrainRecord.get('Name').split(' ART ')[0],
				listeners: {
					select: this._trainPickerSelected.bind(this)
				}
			});
		}
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
					var featureRecord = me.FeatureStore.findRecord('ObjectID', tcRecord.get('ObjectID'));
					if(featureRecord) {
						var newVal = me._getTeamCommit(featureRecord);
						if(tcRecord.get('Commitment') != newVal.Commitment)
							tcRecord.set('Commitment', newVal.Commitment || 'Undecided');
						if(tcRecord.get('Objective') != (newVal.Objective || ''))
							tcRecord.set('Objective', newVal.Objective || '');
					}
				});
				tcStore.resumeEvents();
			}
		});
		me.CustomTeamCommitsStore.intelUpdate();
		
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
							var diff = me._getStoryCount(f1.get('ObjectID')) - me._getStoryCount(f2.get('ObjectID'));
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
							var diff = me._getStoriesEstimate(f1.get('ObjectID')) - me._getStoriesEstimate(f2.get('ObjectID'));
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
				width:70
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
				renderer: function(val){ return val || '-'; }
			}
		];
		
		me.TeamCommitsGrid = me.down('#tc_vel_box').add({
			xtype: 'rallygrid',
      title: "Team Commits",
			//width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20), //770
			height:300,
			flex:2,
			padding:'0 20px 0 0',
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
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
						} else {
							me._setTeamCommit(realFeature, tc)
								.then(function(){			
									me._isEditingTeamCommits = false;
									me.TeamCommitsGrid.setLoading(false);
								})
								.fail(function(reason){ me._alert('ERROR', reason); })
								.done();
						}
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
					var iterationName = velRecord.get('Name');
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
					var newVal = iteration.get('PlannedVelocity') || 0;
					if(newVal != velRecord.get('PlannedVelocity')){
						velRecord.set('PlannedVelocity', iteration.get('PlannedVelocity') || 0);
						console.log('velocity record update', velRecord);
					}
				});
				velStore.resumeEvents();
			}
		});
		me.CustomVelocityStore.intelUpdate();		
		
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
				flex:1,
				tdCls: 'intel-editor-cell',
				//xtype:'numbercolumn',
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
				//xtype:'numbercolumn',
				flex:1,
				editor:false,
				resizable:false,
				sortable:false,
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
			//width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			flex:1,
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
					
					if(value.length===0 || isNaN(value) || (value*1<0) || (value*1 === originalValue*1)) { 
						velocityRecord.set('PlannedVelocity', originalValue);
						me._isEditingVelocity = false; 
						return; 
					}
					value = value*1 || 0; //value*1 || null to remove the 0's from teams
					var iterationName = velocityRecord.get('Name');
					var iteration = me.IterationStore.findExactRecord('Name', iterationName);
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
		var me = this, 
			rd = me.ReleaseRecord.data,
			workweeks = me._getWorkweeks(rd.ReleaseStartDate, rd.ReleaseDate),
			riskSorter = function(o1, o2){ return o1.data.RiskID > o2.data.RiskID ? -1 : 1; }; //new come first
		
		/****************************** STORES FOR THE DROPDOWNS  ***********************************************/	
		me.FeatureFIDStore = Ext.create('Ext.data.Store', {
			fields: ['FormattedID'],
			data: _.map(me.FeatureStore.getRange(), function(f){
				return {'FormattedID': f.get('FormattedID')};
			}),
			sorters: { property: 'FormattedID' }
		});
		
		me.FeatureNameStore = Ext.create('Ext.data.Store', {
			fields: ['Name'],
			data: _.map(me.FeatureStore.getRange(), function(f){
				return {'Name': f.get('Name') };
			}),
			sorters: { property: 'Name' }
		});
		
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
										me._loadFeature(riskRecord.get('ObjectID'), function(featureRecord){
											var lastAction = function(){
												me.CustomRisksStore.remove(riskRecord);
												me.RisksGrid.setLoading(false);
											};	
											if(!featureRecord){ lastAction(); return; } 
											else {
												var realRisksData = me._parseRisksFromFeature(featureRecord),
													realRiskData = me._removeRiskFromList(riskRecord.get('RiskID'), realRisksData);
												if(realRiskData){
													me._removeRisk(featureRecord, realRiskData)
														.then(lastAction)
														.fail(function(reason){ me._alert('ERROR', reason); })
														.done();
												}
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
			xtype:'container',
			items:[{
				xtype:'button',
				text:'+ Add Risk',
				width:80,
				style:'margin-top:20px',
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
			maxHeight:450,
			style:'margin-top:10px',
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px';},
				listeners: { resize: function(){ me._windowResize(); }}
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
			workweeks = me._getWorkweeks(rd.ReleaseStartDate, rd.ReleaseDate);
		
		/****************************** STORES FOR THE DROPDOWNS  ***********************************************/	
		me.UserStoryFIDStore = Ext.create('Ext.data.Store', {
			fields: ['FormattedID'],
			data: _.map(me.DependenciesReleaseUserStories, function(usr){
				return {'FormattedID': usr.get('FormattedID')};
			}),
			sorters: { property: 'FormattedID' }
		});
		
		me.UserStoryNameStore = Ext.create('Ext.data.Store', {
			fields: ['Name'],
			data: _.map(me.DependenciesReleaseUserStories, function(usr){
				return {'Name': usr.get('Name') };
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
					var preds = depRec.get('Predecessors');
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
		me.CustomPredDepStore.intelUpdate();
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:80,
				resizable:false,
				editor:{
					xtype:'intelcombobox',
					width:80,
					store: me.UserStoryFIDStore,
					displayField: 'FormattedID'
				},
				sortable:true,
				renderer: function(val){ return val || '-'; }		
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				flex:1,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
					displayField: 'Name'
				},
				sortable:true,
				renderer: function(val){ return val || '-'; }			
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				flex:1,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor: {
					xtype: 'textarea',
					grow:true,
					growMin:20,
					growMax:160,
					enterIsSpecial:true
				},
				sortable:false,
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
							renderer: function(val, meta, depTeamRecord){
								var projectRecord = me.ValidProjects[val];
								if(val && projectRecord) return projectRecord.get('Name');
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
												var predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID),
													predecessors = Ext.clone(predDepRecord.get('Predecessors')),
													teamStore = me.PredDepTeamStores[depID];										
												teamStore.suspendEvents(true);
												for(var i=0; i<predecessors.length; ++i)
													if(predecessors[i].TID === depTeamRecord.get('TID')){
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
												var predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
												var newItem = me._newTeamDep();
												me.PredDepTeamStores[depID].insert(0, [Ext.create('IntelDepTeam', newItem)]);
												predDepRecord.set('Predecessors', predDepRecord.data.Predecessors.concat([newItem])); //use set() to update rowheight
												predDepRecord.set('Edited', true);	
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
								plugins: [ 'fastcellediting' ],
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
									},
									edit: function(editor, e){									
										/** NOTE: none of the record.set() operations will get reflected until the proxy calls 'record.endEdit()',
											to improve performance.**/		
										var depTeamRecord = e.record,
											field = e.field,
											value = e.value,
											originalValue = e.originalValue,
											predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID),
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
													if(predecessors[i].PID == projectRecord.get('ObjectID')){
														me._alert('ERROR', value + ' already included in this dependency');
														depTeamRecord.set('PID', originalValue);
														return;
													}
												}
												if(projectRecord.get('ObjectID') === me.ProjectRecord.get('ObjectID')){
													me._alert('ERROR', 'You cannot depend on yourself');
													depTeamRecord.set('PID', originalValue);
													return;
												}
												depTeamRecord.set('PID', projectRecord.get('ObjectID'));
											}
										}
												
										for(i=0; i<predecessors.length; ++i){
											if(predecessors[i].TID === depTeamRecord.get('TID')){
												predecessors[i].PID = depTeamRecord.get('PID'); //update the predDepRecord, but dont need to propagate using set()
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
							render: function(){ me.PredDepContainers[depID] = this; }
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
				renderer: function(value, meta, predDepRecord){	
					var realDepData = me._removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
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
									var depID = predDepRecord.get('DependencyID');
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
				width:30,
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, predDepRecord){				
					var realDepData = me._removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
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
													for(i=0, len=removedCallbacks.length; i<len; ++i){ removedCallbacks[i](); }//execute the removed teams now
													for(i=0, len=addedCallbacks.length; i<len; ++i){ addedCallbacks[i](); }//execute the added teams now
													for(i=0, len=updatedCallbacks.length; i<len; ++i){ updatedCallbacks[i](); }//execute the updated teams now
													
													var promise = Q.fcall(function(){
														var newTeamDeps = teamDeps.added.concat(teamDeps.updated);
														predDepRecord.beginEdit();
														predDepRecord.set('ObjectID', newUSRecord.get('ObjectID'));
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
															me.PredDepGrid.setLoading(false);
														}); //we now have a long chain of asynchronous events completed serially because we get concurrency errors otherwise
												});
											});
										});
									}).fail(function(reason){
										me._alert('ERROR:', reason);
										me.PredDepGrid.setLoading(false);
									}).done();
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
										var predDepData = predDepRecord.data;
										me._getOldAndNewUSRecords(predDepData).then(function(records){
											var oldUSRecord = records[0],
												realDepData = me._getRealDepData(oldUSRecord, predDepData, 'Predecessors'),
												teamDeps = me._getTeamDepArrays(predDepData, realDepData), 
												depsToDelete = teamDeps.removed.concat(teamDeps.updated), //dont care about added 
												i, len;
											return me._getRemovedTeamDepCallbacks(depsToDelete, predDepData).then(function(removedCallbacks){
												for(i=0, len=removedCallbacks.length; i<len; ++i){ removedCallbacks[i](); }//execute the removed teams now
												var promise = Q.fcall(function(){});
												if(realDepData){
													promise = promise.then(function(){
														return me._removePredDep(oldUSRecord, realDepData);
													});
												}
												return promise
													.then(function(){	
														me.CustomPredDepStore.remove(predDepRecord);
														me.PredDepGrid.setLoading(false);
													});
											});
										}).fail(function(reason){
											me._alert('ERROR:', reason);
											me.PredDepGrid.setLoading(false);
										}).done();
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
			items:[{
				xtype:'button',
				text:'+ Add Dependency',
				style:'margin-top:20px',
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
							me.PredDepGrid.view.getEl().setScrollTop(0);
							me.PredDepGrid.getSelectionModel().select(model);
						}
					}
				}
			}]
		});
		
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
				listeners: { resize: function(){ me._windowResize(); }}
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
					if(field === 'Description') {
						value = me._htmlEscape(value);			
						predDepRecord.set(field, value);
					}

					var previousEdit = predDepRecord.get('Edited'); 
					predDepRecord.set('Edited', true);
					
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							predDepRecord.set('UserStoryName', originalValue);
							predDepRecord.set('Edited', previousEdit);
						} else predDepRecord.set('FormattedID', userStoryRecord.get('FormattedID'));
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							predDepRecord.set('FormattedID', originalValue);
							predDepRecord.set('Edited', previousEdit);
						} else predDepRecord.set('UserStoryName', userStoryRecord.get('Name'));
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
		me.CustomSuccDepStore.intelUpdate();
		
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
					xtype:'intelcombobox',
					width:120,
					store: me.UserStoryFIDStore,
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
				flex:1,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'intelcombobox',
					store: me.UserStoryNameStore,
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
				xtype:'fastgridcolumn',
				tdCls: 'iconCell',
				resizable:false,
				renderer: function(value, meta, succDepRecord){			
					if(!succDepRecord.get('FormattedID')) return '';
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
					var realDepData = me._removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
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
									var depID = succDepRecord.get('DependencyID');
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
					var realDepData = me._removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
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
									me.SuccDepGrid.setLoading(true);
									var succDepData = succDepRecord.data, oldUSRecord, newUSRecord;
									me._getOldAndNewUSRecords(succDepData).then(function(records){
										oldUSRecord = records[0];
										newUSRecord = records[1];
										
										var realDepData = me._getRealDepData(oldUSRecord, succDepData, 'Successors'); //might be undefined if pred team deleted then readded this team on the dep!
										if(!realDepData) return Q.reject(['Successor removed this dependency.']);
										
										succDepData.ObjectID = newUSRecord.data.ObjectID; //we set this in case we are changing the depended upon US
										
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
												me.SuccDepGrid.setLoading(false);
											});
									}).fail(function(reason){
										if(typeof reason === 'string'){
											me._alert('ERROR', reason);
											me.SuccDepGrid.setLoading(false);
										} else {
											me._alert('ERROR', reason[0] + ' Deleting this dependency now');
											if(realDepData){
												me._removeSuccDep(oldUSRecord, realDepData).then(function(){
													me.CustomSuccDepStore.remove(succDepRecord);
													me.SuccDepGrid.setLoading(false);
												});
											}
											else {
												me.CustomSuccDepStore.remove(succDepRecord);
												me.SuccDepGrid.setLoading(false);
											}
										}
									}).done();
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
			//width: _.reduce(succDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			minHeight:150,
			style:'margin-top:40px',
			maxHeight:500,
			scroll:'vertical',
			columnCfgs: succDepColumnCfgs,
			plugins: [ 'fastcellediting' ],
			viewConfig:{
				xtype:'scrolltableview',
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px'; },
				listeners: { resize: function(){ me._windowResize(); }}
			},
			listeners: {
				beforeedit: function(editor, e){
					var succDepRecord = e.record;
					if(succDepRecord.get('Supported') == 'No' && e.field != 'Supported') 
						return false; //don't user story stuff if not supported
				},
				edit: function(editor, e){					
					var grid = e.grid,
						succDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
					if(value == originalValue) return;
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
