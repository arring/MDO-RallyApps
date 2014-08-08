/** this app requires the following custom fields for your workspace:
	c_TeamCommits on PortfolioItem/Feature,
	c_Risks on PortfolioItem/Feature,
	c_Dependencies on HierarchicalRequirement
	
	
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
				Preds, (string form of: 
					[
						{
							TID, //id of this team dep
							PID, //projectID
							USID, //UserStory Formatted ID
							USName, //UserStory Name
							Sup, //supported
							A	//assigned
						}
					]
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
*/

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	layout: 'absolute',
	height:1660,
	width:1320,
		
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE METHODS ********************************************************/

	//___________________________________GENERAL LOADING STUFF___________________________________	
	_loadModels: function(cb){
		var me = this;
		Rally.data.ModelFactory.getModel({ //load project
			type:'Project',
			scope:me,
			success: function(model){ 
				me.Project = model; 
				Rally.data.ModelFactory.getModel({ //load user Story
					type:'HierarchicalRequirement',
					scope:me,
					success: function(model){ 
						me.UserStory = model; 
						cb(); 
					}
				});
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
	
	_loadReleases: function(cb){ 
		var me = this;
		
		// so we have 2 different filters: for a team in a train, a team not in a train (DCD, HVE)
		var filterString = Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.ObjectID',
			value: me.ProjectRecord.get('ObjectID')
		});
		var filterString2, f2;
		if(me.TrainRecord){
			var teamName = me.ProjectRecord.get('Name');
			var trainName = me.TrainRecord.get('Name').split(' ART ')[0];
			var trainNames = teamName.split(trainName)[1].split('-');
			if(!trainNames[0]) trainNames[0] = trainName;
			else trainNames.push(trainName); //accounts for alpha-bravo-charlie stuff
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
			filterString2 = Ext.create('Rally.data.wsapi.Filter', { 
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
			filters:[
				{
					property:'Dummy',
					value:'value'
				}
			],
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
	
	_getCurrentOrFirstRelease: function(){
		var me = this;
		var d = new Date();
		var rs = me.ReleaseStore.getRecords();
		if(!rs.length) return;
		for(var i=0; i<rs.length; ++i){
			if(new Date(rs[i].get('ReleaseDate')) >= d && new Date(rs[i].get('ReleaseStartDate')) <= d) 
				return rs[i];
		}
		return rs[0]; //pick a random one then 
	},
	
	_loadValidProjects: function(cb){
		var me = this;
		var scrums = [];
		function loadChildren(project, _cb){
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				autoLoad:true,
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name', 'ObjectID', 'Parent'],
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
							if(projectRecords.length === 0) {
								scrums.push(project);
								_cb();
							} else {
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
			fetch: ['Name', 'ObjectID'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
					property:'Name',
					value: 'All Scrums'
				}
			],
			listeners:{
				load:{
					fn: function(ps, recs){
						loadChildren(recs[0], function(){ 
							me.ValidProjects = scrums;
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
	
	//___________________________________TEAM COMMITS STUFF___________________________________
	_loadTeamCommitsUserStories: function(cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model:'HierarchicalRequirement',
			fetch: ['ObjectID', 'Feature', 'Name', '_ref'],
			limit:Infinity,
			autoLoad:true,
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters: [
				{
					property:'Release.Name',
					value:me.ReleaseRecord.get('Name')
				},{
					property:'Feature',
					operator:'!=',
					value:null
				},{
					property:'Project.Name',
					value:me.ProjectRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(storyStore, storyRecords){
						console.log('Stories loaded:', storyRecords);
						me.TeamCommitsStoryStore = storyStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	_loadTeamCommitsFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits'],
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
						me.TeamCommitsFeatureStore = featureStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	//___________________________________VELOCITY STUFF___________________________________
		
	_loadVelocityIterations: function(cb){
		var me = this;
		var startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseStartDate'));
		var endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseDate'));
        Ext.create("Rally.data.WsapiDataStore", {
            model: "Iteration",
            autoLoad: true,
			limit:Infinity,
            fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity"],
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
                },{
				
				}
			],
            remoteSort: false,
            listeners: {
                load: function(store) {
					console.log('VelocityIterations loaded:', store.getRecords());
					me.VelocityIterationStore = store;
                    cb();
                },
				single:true
            }
        });
	},
	
	_loadVelocityUserStories: function(cb){
		var me = this;
		var startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseStartDate'));
		var endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseDate'));
        Ext.create("Rally.data.WsapiDataStore", {
            model: "HierarchicalRequirement",
            autoLoad: true,
			limit:Infinity,
            fetch: ["Name", "Iteration", "PlanEstimate"],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: me.getContext().getProject()._ref
			},
            filters: [
				{
					property: "Iteration.EndDate",
					operator: ">=",
					value: startDate
                },{
                    property: "Iteration.StartDate",
                    operator: "<=",
                    value: endDate  
                },{
					property: "PlanEstimate",
					operator: "!=",
					value:null
				}
			],
            remoteSort: false,
            listeners: {
                load: function(store) {
					console.log('VelocityUserStoryStore loaded:', store.getRecords());
					me.VelocityUserStoryStore = store;
                    cb();
                },
				single:true
            }
        });
    },
	
	//___________________________________ RISKS STUFF___________________________________
		
	_loadRisksFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_Risks'],
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
						console.log('risks features loaded:', featureRecords);
						me.RisksFeatureStore = featureStore;
						me._parseRisksData();
						cb();
					},
					single:true
				}
			}
		});
	},
			
	_parseRisksData: function(){ 
		var me = this;		
		me.RisksCache = {};
		var projectID = me.ProjectRecord.get('ObjectID');
		
		function getRisks(featureRecord){
			var FID = featureRecord.get('ObjectID');
			var risks = featureRecord.get('c_Risks');
			if(me.RisksCache[FID]) 
				return me.RisksCache[FID];
			else {
				try{ risks = JSON.parse(risks) || {}; }
				catch(e) { risks = {}; }
			}
			me.RisksCache[FID] = risks;
			return risks;
		}
		
		var array = [];
		_.each(me.RisksFeatureStore.getRecords(), function(featureRecord){ //load risks into custom Data Store
			var risks = getRisks(featureRecord);
			if(risks[projectID]){
				for(var riskID in risks[projectID]){
					var risk = risks[projectID][riskID];
					array.push({
						RiskID: riskID,
						FormattedID: featureRecord.get('FormattedID'),
						FeatureName: featureRecord.get('Name'),
						Description: risk.Desc,
						Impact: risk.Imp,
						Status: risk.Sta,
						Contact: risk.Cont,
						Checkpoint: risk.CP,
						Edited: false //not in pending edit mode
					});
				}
			}
		});	
		me.RisksParsedData = array;
	},
	
	//_____________________________________ DEPENDENCIES STUFF ___________________________________	
	
	_loadRandomUserStory: function(ProjectRef, cb){ 
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
	
	_loadDependenciesUserStories: function(cb){	
		var me = this;
		var f1 = Ext.create('Rally.data.wsapi.Filter', { //to get successors (could be any random user story)
			property:'Project.Name',
			value: me.ProjectRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'c_Dependencies',
			operator:'!=',
			value:''
		}));
		
		var f2 = Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
			property:'Release.Name',
			value: me.ReleaseRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.Name',
			value: me.ProjectRecord.get('Name')
		}));
		
		var filterString = f1.or(f2).toString();
		
		var store = Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Dummy',
					value:'value'
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						console.log('dependencies release user stories loaded:', userStoryRecords);
						me.DependenciesUserStoryStore = userStoryStore;
						me._buildDependenciesData();
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
	
	_getDependencies: function(userStoryRecord){
		var me = this;
		var USID = userStoryRecord.get('ObjectID');
		if(me.DependenciesCache[USID])
			return me.DependenciesCache[USID];
		var dependencies, dependencyString = userStoryRecord.get('c_Dependencies');
		if(dependencyString === '') dependencies = { Preds:{}, Succs:[] };
		else {
			try{ dependencies = JSON.parse(dependencyString); }
			catch(e) { dependencies = { Preds:{}, Succs:[] }; }
		}		
		me.DependenciesCache[USID] = dependencies;
		return dependencies;
	},
	
	_buildDependenciesData: function(){	
		var me = this;
		
		var startDate =	new Date(me.ReleaseRecord.get('ReleaseStartDate'));
		var endDate =	new Date(me.ReleaseRecord.get('ReleaseDate'));
		
		me.DependenciesCache = {};
		me.DependenciesReleaseUserStories = _.filter(me.DependenciesUserStoryStore.getRecords(), function(usr){
			return usr.get('Release') && usr.get('Release').Name === me.ReleaseRecord.get('Name');
		});
				
		var predDepsList = [], succDepsList = [];
		_.each(me.DependenciesUserStoryStore.getRecords(), function(userStoryRecord){ //load risks into custom Data Store
			var deps = me._getDependencies(userStoryRecord);
			var preds = deps.Preds;
			var succs = deps.Succs;
			if(_.find(me.DependenciesReleaseUserStories, function(goodUS){ return goodUS.get('ObjectID')===userStoryRecord.get('ObjectID');})){
				for(var predDepID in preds){
					var predDep = preds[predDepID];
					predDepsList.push({
						DependencyID: predDepID,
						FormattedID: userStoryRecord.get('FormattedID'),
						UserStoryName: userStoryRecord.get('Name'),
						Description: predDep.Desc,
						Checkpoint: predDep.CP,
						Status: predDep.Sta,
						Predecessors: predDep.Preds, //string array of (ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID)
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
						PredUserStoryName: succDep.PUSName,
						PredFormattedID: succDep.PUSID,
						PredProjectName: succDep.PPID,
						ReleaseDate: succDep.REL,
						ReleaseStartDate: succDep.REL_S,
						Description: succDep.Desc,
						Checkpoint: succDep.CP,
						Supported: succDep.Sup,
						Assigned: succDep.A,
						FormattedID: FormattedID,
						UserStoryName: UserStoryName,
						_realFormattedID: userStoryRecord.get('FormattedID'),
						_realUserStoryName: userStoryRecord.get('Name'),
						Edited: false //not in pending edit mode
					});
				}
			}
		});	
		me.DependenciesParsedData = {Predecessors:predDepsList, Successors:succDepsList};
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
				{name: 'TeamCommits', type: 'string'},
				{name: 'ObjectID', type: 'string'},
				{name: 'FormattedID', type:'string'}
			]
		});
		
		Ext.define('IntelRisk', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'RiskID', type:'string'},
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
		
		Ext.define('IntelPredDep', { //predecessor dependencies
			extend: 'Ext.data.Model',
			fields: [
				{name: 'DependencyID', type:'string'},
				{name: 'FormattedID',  type: 'string'}, 
				{name: 'UserStoryName',  type: 'string'},
				{name: 'Description', type: 'string'},
				{name: 'Checkpoint', type: 'string'},
				{name: 'Status', type:'string'}, //only set by chief engineers. not viewable in this app
				{name: 'Predecessors', type: 'string'}, //stringified array of Preds (Pred: ProjectID, supported, UserStoryID, Assigned)
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
			
		Ext.define('IntelSuccDep', { //predecessor dependency
			extend: 'Ext.data.Model',
			fields: [
				{name: 'DependencyID', type:'string'}, //same id as the pred id that references it
				{name: 'PredUserStoryName', type: 'string' },
				{name: 'PredFormattedID',  type: 'string'}, 
				{name: 'PredProjectName', type: 'string'}, //of predecessor team
				{name: 'UserStoryName', type: 'string'}, //can be null!!!!!!!!!!!!
				{name: 'FormattedID',  type: 'string'},  //CAN BE NULL!!!!!!!!!!!!
				{name: 'ReleaseStartDate',  type: 'string'}, 
				{name: 'ReleaseDate',  type: 'string'}, 
				{name: '_realUserStoryName', type: 'string'}, 
				{name: '_realFormattedID',  type: 'string'},  
				{name: 'Description', type: 'string'}, 
				{name: 'Checkpoint', type: 'string'},
				{name: 'Supported', type: 'string'}, //Yes, No
				{name: 'Assigned', type: 'boolean'}, //yes/no
				{name: 'Edited', type: 'boolean'}
			]
		});	
	
		Ext.define('IntelCustomProxy', {
			extend: 'Ext.data.proxy.Memory',
			alias: 'proxy.intelcustomproxy',
			keyField: 'ID', //OVERRIDE THIS!!!!
			create: function(operation) { 
				var me = this;
				try{
					operation.getRecords().forEach(function(record){ 
						me.data.push(record.data); 
					});
				} catch(e){ console.log(e); }
				this.updateOperation.apply(this, arguments);
			},
			update: function(operation) {
				var me = this;
				try{
					operation.getRecords().forEach(function(record){
						for(var i = 0;i<me.data.length;++i){
							if(me.data[i][me.keyField] === record.data[me.keyField]){
								me.data[i] = record.data;
								return;
							}
						}
					});
				} catch(e){ console.log(e); }
				this.updateOperation.apply(this, arguments);
			},
			destroy: function(operation) {
				var me = this;
				try{
					operation.getRecords().forEach(function(record){
						for(var i = 0;i<me.data.length;++i){
							if(me.data[i][me.keyField] === record.data[me.keyField]){
								me.data.splice(i, 1);
								return;
							}
						}
					});
				} catch(e){ console.log(e); }
				this.updateOperation.apply(this, arguments);
			}
		});
	},
	
	/******************************************************* STATE VARIABLES / Reloading ***********************************/

	_loadRisksStores: true,
	_loadTeamCommitsStores: true,
	_loadDependenciesStores: true,
	_loadVelocityStores: true,
	_isEditing: false,
	
	_reloadVelocityStores: function(){
		var me = this;
		if(me.VelocityIterationStore && me._loadVelocityStores) {
			me.VelocityIterationStore.load({ 
				callback: function(records, operation){
					if(me.VelocityUserStoryStore && me._loadVelocityStores) {
						me.VelocityUserStoryStore.load({ 
							callback: function(records, operation){
								if(!me._isEditing){
									if(me.CustomVelocityStore && me._loadVelocityStores)
										me.CustomVelocityStore.load();
								}
							}
						});
					}
				}
			});
		}
	},
	
	_reloadTeamCommitsStores: function(){
		var me = this;
		if(me.TeamCommitsFeatureStore && me._loadTeamCommitsStores) {
			me.TeamCommitsFeatureStore.load({ 
				callback: function(records, operation){
					if(!me._isEditing){
						if(me.CustomTeamCommitsStore && me._loadTeamCommitsStores)
							me.CustomTeamCommitsStore.load();
					}
				}
			});
		}
	},
	
	_reloadRisksStores: function(){
		var me = this;						
		if(me.RisksFeatureStore && me._loadRisksStores) {
			me.RisksFeatureStore.load({ 
				callback: function(records, operation){
					me._parseRisksData();
					if(!me._isEditing){
						if(me.CustomRisksStore && me._loadRisksStores)					
							me.CustomRisksStore.load();
					}
				}
			});
		}
	},
	
	_reloadDependenciesStores: function(){
		var me = this;
		if(me.DependenciesUserStoryStore && me._loadDependenciesStores) {
			me.DependenciesUserStoryStore.load({ 
				callback: function(records, operation){
					me._buildDependenciesData(); //reparse the data
					if(!me._isEditing){
						if(me.CustomPredDepStore && me._loadDependenciesStores)
							me.CustomPredDepStore.load();
						if(me.CustomSuccDepStore && me._loadDependenciesStores)
							me.CustomSuccDepStore.load();
					}
				}
			});
		}
	},
	
	/******************************************************* LAUNCH ********************************************************/
    _reloadEverything:function(){
		var me = this;
		me.removeAll();
		
		me._loadRisksStores = true;
		me._loadTeamCommitsStores = true;
		me._loadDependenciesStores = true;
		me._loadVelocityStores = true;
		me._isEditing = false;
		
		//load the release picker
		me._loadReleasePicker();
		
		//load Team Commits Grid
		me._loadTeamCommitsUserStories(function(){ 
			me._loadTeamCommitsFeatures(function(){							
				me._loadTeamCommitsGrid();
			});
		});
							
		//load velocity grid
		me._loadVelocityUserStories(function(){ 
			me._loadVelocityIterations(function(){
				me._loadVelocityGrid(); 
			});
		});
		
		//load risks grid
		me._loadRisksFeatures(function(){ 
			me._loadRisksGrid();
		});
		
		//load dependencies stuff
		me._loadDependenciesUserStories(function(){ 
			me._loadDependenciesGrids();
		});
	},
	
	launch: function(){
		var me = this;
		me._showError('Loading Data...');
		me._defineModels();
		setInterval(function(){ me._reloadVelocityStores();}, 10000); 
		setInterval(function(){ me._reloadTeamCommitsStores();}, 10000); 
		setInterval(function(){ me._reloadRisksStores();}, 10000); 
		setInterval(function(){ me._reloadDependenciesStores();}, 15000); 
		me._loadModels(function(){
			me._loadValidProjects(function(){
				var scopeProject = me.getContext().getProject();
				me._loadProject(scopeProject, function(scopeProjectRecord){
					me.ProjectRecord = _.find(me.ValidProjects, function(validProject){
						return validProject.data.ObjectID === scopeProjectRecord.data.ObjectID;
					});
					if(me.ProjectRecord){
						me._projectInWhichTrain(me.ProjectRecord, function(trainRecord){
							me.TrainRecord = trainRecord; 
							console.log('train loaded:', trainRecord);
							me._loadReleases(function(){
								var currentRelease = me._getCurrentOrFirstRelease();
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									console.log('release loaded', currentRelease);
									me._reloadEverything();
								} else {
									me.removeAll();
									console.log('This team has no releases');
								}
							});
						});
						
					} else{
						me.removeAll();
						me._showError('Please scope to a valid team for release planning');
					}
				});
			});
		});
	},
	
	/******************************************************* RENDER ********************************************************/
	
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
					me.ReleaseRecord = me.ReleaseStore.findRecord('Name', records[0].get('Name'));						
					setTimeout(function(){me._reloadEverything();}, 0);
				}	
			}
		});
	},
	
	_loadTeamCommitsGrid: function(){
		var me = this;
		
		function getTeamCommit(featureRecord){	
			var tcs = featureRecord.get('c_TeamCommits');
			var projectID = me.ProjectRecord.get('ObjectID');
			var this_tc;
			try{ this_tc = JSON.parse(tcs)[projectID] || {}; } 
			catch(e){ this_tc = {}; }
			return this_tc.status || 'Undecided';
		}
		
		function setTeamCommit(featureRecord, value){
			var tcs = featureRecord.get('c_TeamCommits');
			var projectID = me.ProjectRecord.get('ObjectID');
			try{ tcs = JSON.parse(tcs) || {}; }
			catch(e){ tcs = {}; }
			if(!tcs[projectID]) tcs[projectID] = {};
			tcs[projectID].status = value;
			featureRecord.set('c_TeamCommits', JSON.stringify(tcs, null, '\t'));
			featureRecord.save();
		}
		
		me.TeamCommitsHash = {};	
		function getStoryCount(FID){	
			if(me.TeamCommitsHash[FID]) 
				return me.TeamCommitsHash[FID];
			var count = 0;
			var uss = me.TeamCommitsStoryStore.getRecords();
			uss.forEach(function(us){ if(us.get('Feature') && us.get('Feature').ObjectID == FID) ++count; });
			me.TeamCommitsHash[FID] = count;
			return count;
		}
		
		var customTeamCommitsRecords = _.map(me.TeamCommitsFeatureStore.getRecords(), function(featureRecord){
			return {
				TeamCommits: getTeamCommit(featureRecord),
				Name: featureRecord.get('Name'),
				FormattedID: featureRecord.get('FormattedID'),
				ObjectID: featureRecord.get('ObjectID')
			};
		});		

		me.CustomTeamCommitsStore = Ext.create('Ext.data.Store', {
			data: customTeamCommitsRecords,
			model:'IntelTeamCommits',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'intelcustomproxy',
				keyField:'ObjectID'
			},
			listeners:{
				load: function(customTeamCommitsStore, currentTeamCommitsRecords){
					console.log('syncing teamCommits with features', currentTeamCommitsRecords, me.TeamCommitsFeatureStore.getRecords());
					currentTeamCommitsRecords.forEach(function(teamCommitsRecord){
						var featureRecord = me.TeamCommitsFeatureStore.findRecord('ObjectID', teamCommitsRecord.get('ObjectID'));
						if(featureRecord) {
							var newVal = getTeamCommit(featureRecord);
							if(newVal != teamCommitsRecord.get('TeamCommits')){
								teamCommitsRecord.set('TeamCommits', newVal);
								teamCommitsRecord.commit();
							}
						}
					});
				}
			}
		});
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				width:80,
				editor:false,
				sortable:true,
				resizable:false
			},{
				text:'Feature', 
				dataIndex:'Name',
				width:340,
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
							var diff = getStoryCount(f1.get('ObjectID')) - getStoryCount(f2.get('ObjectID'));
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:80,
				renderer:function(oid){
					return getStoryCount(oid);
				}
			},{
				dataIndex:'TeamCommits',
				text:'Status',	
				width:160,
				tdCls: 'intel-editor-cell',	
				sortable:true, 
				resizable:false,
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					ds.sort({
						sorterFn: function(f1, f2){ 
							var oid1 = f1.get('ObjectID'), oid2 = f2.get('ObjectID');
							var realF1 = me.TeamCommitsFeatureStore.findRecord('ObjectID', oid1, 0, false, true, true),
								realF2 = me.TeamCommitsFeatureStore.findRecord('ObjectID', oid2, 0, false, true, true);
							var r1 = getTeamCommit(realF1), r2 = getTeamCommit(realF2);
							if(r1 == r2) return 0;
							return (direction=='ASC'? 1 : -1) * (r1 < r2 ? -1 : 1);
						}
					});
				},
				editor:{
					xtype:'combobox',
					width:160,
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
			}
		];
		
		me.TeamCommitsGrid = me.add({
			xtype: 'rallygrid',
            title: "Team Commits",
			width: 680,
			height:300,
			x:0, y:50,
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
				getRowClass: function(customTeamCommitsRecords, index, rowParams, store){
					var val = customTeamCommitsRecords.get('TeamCommits');					
					if(val == 'N/A') return 'grey-row';
					if(val == 'Committed') return 'green-row';
					if(val == 'Not Committed') return 'red-row';
				}
			},
			listeners: {
				beforeedit: function(){
					me._isEditing = true;				
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){
					var grid = e.grid,
						teamCommitsRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;	
					me._isEditing = false;
					if(value == originalValue) return;
					if(!me._loadTeamCommitsStores) return;
						
					me._isEditing = true;
					me._loadTeamCommitsStores = false;
					me.TeamCommitsGrid.setLoading(true);
					me.TeamCommitsFeatureStore.load({
						callback:function(records, operation){
							var oid = teamCommitsRecord.get('ObjectID');
							var realFeature = me.TeamCommitsFeatureStore.findRecord('ObjectID', oid, 0, false, true, true);
							if(!realFeature) console.log('ERROR: realFeature not found, ObjectID: ' + oid);
							else setTeamCommit(realFeature, value);	
					
							me.TeamCommitsFeatureStore.load({
								callback: function(records, operation){
									me._isEditing = false;
									me._loadTeamCommitsStores = true;
									me.TeamCommitsGrid.setLoading(false);
								}
							});
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
		var iterationGroups = _.groupBy(me.VelocityUserStoryStore.getRecords(), function(us) {
            return us.get("Iteration").Name;
        });
        
        var iterationGroupTotals = _.sortBy(_.map(me.VelocityIterationStore.getRecords(), function(iteration) {
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
				type:'intelcustomproxy',
				keyField:'Name'
			},
			listeners:{
				load: function(customVelocityStore, velocityRecords){
					console.log('syncing velocity with current iterations', velocityRecords, me.VelocityIterationStore.getRecords());
					velocityRecords.forEach(function(velocityRecord){
						var iterationName = velocityRecord.get('Name');
						var iteration = me.VelocityIterationStore.findRecord('Name', iterationName, 0, false, true, true);
						velocityRecord.set('PlannedVelocity', iteration.get('PlannedVelocity') || 0);
						velocityRecord.commit();
					});
				}
			}
		});
				
        var columnCfgs = [
			{	
				text: 'Iteration',
				dataIndex: 'Name', //the editable one
				width:310,
				editor:'textfield',
				resizable:false,
				sortable:true
			},{
				text: 'Estimated',
				dataIndex: 'PlannedVelocity', //the editable one
				width:100,
				tdCls: 'intel-editor-cell',
				xtype:'numbercolumn',
				editor:'textfield',
				resizable:false,
				sortable:true
			},{
				text: 'Planned',
				dataIndex: 'RealVelocity',
				xtype:'numbercolumn',
				width:100,
				editor:false,
				resizable:false,
				sortable:true
			}
		];
        me.VelocityGrid = me.add({
            xtype: 'rallygrid',
            title: "Velocity",
			scroll:'vertical',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			x:780, y:50,
            showPagingToolbar: false,
			showRowActionsColumn:false,
            viewConfig: {
                stripeRows: true,
				preserveScrollOnRefresh:true
            },
			listeners: {
				beforeedit: function(editor, e){
					me._isEditing = true;
					return true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){
					var grid = e.grid,
						velocityRecord = e.record,
						value = e.value,
						originalValue = e.originalValue;
						
					me._isEditing = false;
					if(!value || (value === originalValue)) return;
					value = value*1 || 0; //value*1 || null to remove the 0's from teams
					var iterationName = velocityRecord.get('Name');
					var iteration = me.VelocityIterationStore.findRecord('Name', iterationName, 0, false, true, true);
					iteration.set('PlannedVelocity', value);
					iteration.save();
				}
			},
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			enableEditing:false,
			context: this.getContext(),
            columnCfgs: columnCfgs,
            store: me.CustomVelocityStore
        });
    },

	_loadRisksGrid: function(){
		var me = this;
		
		var projectID = me.ProjectRecord.get('ObjectID');
		
		function getWorkweeks(){
			var i;
			var oneDay = 1000 * 60 * 60 * 24;
			var startDate = me.ReleaseRecord.get('ReleaseStartDate');
			var endDate = me.ReleaseRecord.get('ReleaseDate');
			
			var sd_year = new Date(startDate.getFullYear(), 0, 0);
			var sd_diff = startDate - sd_year;
			var sd_day = sd_diff / oneDay;
			var sd_week = Math.ceil(sd_day / 7);
			
			var ed_year = new Date(endDate.getFullYear(), 0, 0);
			var ed_diff =  endDate - ed_year;
			var ed_day = ed_diff / oneDay;
			var ed_week = Math.ceil(ed_day / 7);
			
			var weeks = [];
			if(ed_week < sd_week){
				for(i = sd_week; i<=52;++i) weeks.push({'Week': 'ww' + i});
				for(i = 0; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
			}
			else for(i = sd_week; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
			return weeks;
		}
		var workweeks = getWorkweeks();

		/******************************** RISK PARSING/MANIPULATION FUNCTIONS ***************************/
		
		function removeRiskFromList(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
			for(var i = 0; i<riskList.length; ++i){
				if(riskList[i].RiskID == riskID) {
					return riskList.splice(i, 1)[0];
				}
			}
		}
		
		function getRisks(featureRecord){
			var FID = featureRecord.get('ObjectID');
			var risks = featureRecord.get('c_Risks');
			if(me.RisksCache[FID]) 
				return me.RisksCache[FID];
			else {
				try{ risks = JSON.parse(risks) || {}; }
				catch(e) { risks = {}; }
			}
			me.RisksCache[FID] = risks;
			return risks;
		}
		
		function removeRisk(featureRecord, riskData){ 
			var FID = featureRecord.get('ObjectID');
			var risks = getRisks(featureRecord);
			if(risks[projectID]){
				delete risks[projectID][riskData.RiskID];
				me.RisksCache[FID] = risks;
				featureRecord.set('c_Risks', JSON.stringify(risks, null, '\t'));
				featureRecord.save();
				console.log('removed risk from feature:', featureRecord, riskData, risks);
			}
		}
		
		function addRisk(featureRecord, riskData){
			var FID = featureRecord.get('ObjectID');
			var risks = getRisks(featureRecord);
			if(!risks[projectID])
				risks[projectID] = {};
			var copy = {
				CP: riskData.Checkpoint,
				Cont: riskData.Contact,
				Desc: riskData.Description,
				Imp: riskData.Impact,
				Sta: riskData.Status
			};
			risks[projectID][riskData.RiskID] = copy;
			me.RisksCache[FID] = risks;
			featureRecord.set('c_Risks', JSON.stringify(risks, null, '\t'));
			featureRecord.save();
			console.log('added risk to feature:', featureRecord, riskData, risks);
		}
	
		function getDirtyType(localRiskRecord, realRiskData){
			var riskData = localRiskRecord.data;
			if(!realRiskData)	return riskData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else				return riskData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		}
		
		/*************************************************************************************************************/
			
		me.CustomRisksStore = Ext.create('Ext.data.Store', { 
			data: me.RisksParsedData,
			autoSync:true,
			model:'IntelRisk',
			limit:Infinity,
			proxy: {
				type:'intelcustomproxy',
				keyField:'RiskID'
			},
			listeners:{
				load: function(customRisksStore, currentRisksRecords){
					var realRisksDatas = me.RisksParsedData.slice(0); //'real' risks list
					console.log('syncing risks with current features', currentRisksRecords, realRisksDatas);
					for(var i = 0;i<currentRisksRecords.length;++i){
						var currentRisksRecord =  currentRisksRecords[i];
						var realRiskData = removeRiskFromList(currentRisksRecord.get('RiskID'), realRisksDatas);
						
						var dirtyType = getDirtyType(currentRisksRecord, realRiskData);
						if(dirtyType === 'New' || dirtyType === 'Edited') continue; //we don't want to remove any pending changes on a record							
						else if(dirtyType == 'Deleted') // the currentRisksRecord was deleted by someone else, and we arent editing it
							customRisksStore.remove(currentRisksRecord);
						else { //we are not editing it and it still exists, so update current copy
							for(var key in realRiskData)
								currentRisksRecord.set(key, realRiskData[key]);
							currentRisksRecord.commit();
						}
					}
					realRisksDatas.forEach(function(realRiskData){ //add all the new risks that other people have added since first load
						console.log('adding real risk', realRiskData);
						customRisksStore.add(Ext.create('IntelRisk', realRiskData));
					});	
				}
			}
		});
		
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
						data: _.map(me.RisksFeatureStore.getRecords(), function(fr){
							return {'FormattedID': fr.get('FormattedID')};
						})
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) === 0;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},			
				resizable:false,
				sortable:true
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				tdCls: 'intel-editor-cell',	
				width:240,
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.RisksFeatureStore.getRecords(), function(fr){
							return {'Name': fr.get('Name') };
						})
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) === 0;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				resizable:false,
				sortable:true		
			},{
				text:'Risk Description', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				width:195,
				editor: 'textfield',
				resizable:false,
				sortable:true,
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'Impact', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				width:200,
				resizable:false,
				sortable:true,
				editor: 'textfield',
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'Status',	
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
					return val || '-';
				}		
			},{
				text:'Contact', 
				dataIndex:'Contact',
				tdCls: 'intel-editor-cell',	
				width:160,
				editor: 'textfield',
				sortable:true,
				resizable:false,
				renderer:function(val, meta){
					return val || '-';
				}			
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
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, riskRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, riskRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Undo</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					if(!me._loadRisksStores) return;
					var risksStore = grid.getStore();
					var riskRecord = risksStore.getAt(row);
					riskRecord.set('Edited', false);
					riskRecord.commit();
					me._loadRisksStores = false;
					grid.setLoading(true);
					risksStore.load({
						callback: function(){
							me._loadRisksStores = true;
							grid.setLoading(false);
						}
					});
				}
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, riskRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = getDirtyType(riskRecord, realRiskData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return ''; //don't render it!
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, riskRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">{3}</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || '')),
							dirtyType
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var riskRecord = store.getAt(row);
					if(!me._loadRisksStores) return;
					if(!riskRecord.get('Checkpoint')){
						alert('You must set the Checkpoint date for this risk');
						return;
					} else if(!riskRecord.get('Description')){
						alert('You must set the Description date for this risk');
						return;
					} else if(!riskRecord.get('Impact')){
						alert('You must set the Impact date for this risk');
						return;
					} else if(!riskRecord.get('Status')){
						alert('You must set the Status date for this risk');
						return;
					} else if(!riskRecord.get('Contact')){
						alert('You must set the Contact date for this risk');
						return;
					}	
					me._loadRisksStores = false;
					me.RisksGrid.setLoading(true);
					me.RisksFeatureStore.load({
						callback: function(records, operation){
							me._parseRisksData();
							var riskRecordData = riskRecord.data;
							var realRiskData = removeRiskFromList(riskRecordData.RiskID, me.RisksParsedData.slice(0));
							if(realRiskData && (realRiskData.FormattedID != riskRecordData.FormattedID)){
								console.log('moving risk to new feature', realRiskData.FormattedID, riskRecordData.FormattedID);
								//we must remove risk from old feature and add it to new feature
								var oldFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', realRiskData.FormattedID, 0, false, true, true);
								if(oldFeatureRecord) 
									removeRisk(oldFeatureRecord, realRiskData);
							}
							var newFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', riskRecordData.FormattedID, 0, false, true, true);
							if(newFeatureRecord) 
								addRisk(newFeatureRecord, riskRecordData);
							
							riskRecord.set('Edited', false);
							riskRecord.commit();
							
							me.RisksFeatureStore.load({
								callback: function(records, operation){
									me._parseRisksData();
									me.CustomRisksStore.load({
										callback: function(){
											me._loadRisksStores = true;
											me.RisksGrid.setLoading(false);
										}
									});
								}
							});	
						}
					});
				}
			},{
				text:'',
				width:80,	
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, riskRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, riskRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Delete</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var riskRecord = store.getAt(row);
					if(!me._loadRisksStores) return;
					if(confirm('Confirm Risk Deletion')){
						me._loadRisksStores = false;
						me.RisksGrid.setLoading(true);
						me.RisksFeatureStore.load({
							callback: function(records, operation){
								me._parseRisksData();
								var riskRecordData = riskRecord.data;
								var realRiskData = removeRiskFromList(riskRecordData.RiskID, me.RisksParsedData.slice(0));
								if(realRiskData && (realRiskData.FormattedID != riskRecordData.FormattedID)){
									//we must remove risk from old feature and also remove it from new feature
									var oldFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', realRiskData.FormattedID, 0, false, true, true);
									if(oldFeatureRecord) 
										removeRisk(oldFeatureRecord, realRiskData);
								}
								var newFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', riskRecordData.FormattedID, 0, false, true, true);
								if(newFeatureRecord) 
									removeRisk(newFeatureRecord, riskRecordData);
								
								me.CustomRisksStore.remove(riskRecord);
								
								me.RisksFeatureStore.load({
									callback: function(records, operation){
										me._parseRisksData();
										me.CustomRisksStore.load({
											callback: function(){
												me._loadRisksStores = true;
												me.RisksGrid.setLoading(false);
											}
										});
									}
								});
							}
						});
					}
				}
			}
		];

		me.AddRiskButton = me.add({
			xtype:'button',
			text:'+ Add Risk',
			x:0,
			y:380,
			width:80,
			style:'margin-bottom:10px',
			listeners:{
				click: function(){
					var randomFeature = me.RisksFeatureStore.first();
					if(!randomFeature) alert('No Features for this Release!');
					else if(me.CustomRisksStore) {
						me.CustomRisksStore.suspendEvents();
						var model = Ext.create('IntelRisk', {
							RiskID: (new Date() * 1) + '' + (Math.random() * 10000000),
							FormattedID: randomFeature.get('FormattedID'),
							FeatureName: randomFeature.get('Name'),
							Description: '',
							Impact: '',
							Status: '',
							Contact: '',
							Checkpoint: '',
							Edited:true
						});
						me.CustomRisksStore.add(model);
						me.CustomRisksStore.resumeEvents();
						me.RisksGrid.reconfigure(me.CustomRisksStore);
					}
				}
			}
		});
		
		me.RisksGrid = me.add({
			xtype: 'rallygrid',
            title: 'Risks',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			x:0,
			y:420,
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
				beforeedit: function(){
					me._isEditing = true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){					
					var grid = e.grid,
						risksRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
					me._isEditing = false;
					
					if(value === originalValue) return;
					var rData = risksRecord.data;
					var previousEdit = rData.Edited;
					rData.Edited = true;
					
					var featureRecord;
					if(field === 'FeatureName'){
						featureRecord = me.RisksFeatureStore.findRecord('Name', value, 0, false, true, true);
						if(!featureRecord){
							rData.FeatureName = originalValue;
							rData.Edited = previousEdit; //not edited
						} else rData.FormattedID = featureRecord.get('FormattedID');
					} else if(field === 'FormattedID'){
						featureRecord = me.RisksFeatureStore.findRecord('FormattedID', value, 0, false, true, true);
						if(!featureRecord) {
							rData.FormattedID = originalValue;
							rData.Edited = previousEdit; //not edited
						} else rData.FeatureName = featureRecord.get('Name');
					}
					risksRecord.commit();
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
		var me = this;

		function getWorkweeks(){
			var i;
			var oneDay = 1000 * 60 * 60 * 24;
			var startDate = me.ReleaseRecord.get('ReleaseStartDate');
			var endDate = me.ReleaseRecord.get('ReleaseDate');
			
			var sd_year = new Date(startDate.getFullYear(), 0, 0);
			var sd_diff = startDate - sd_year;
			var sd_day = sd_diff / oneDay;
			var sd_week = Math.ceil(sd_day / 7);
			
			var ed_year = new Date(endDate.getFullYear(), 0, 0);
			var ed_diff =  endDate - ed_year;
			var ed_day = ed_diff / oneDay;
			var ed_week = Math.ceil(ed_day / 7);
			
			var weeks = [];
			if(ed_week < sd_week){
				for(i = sd_week; i<=52;++i) weeks.push({'Week': 'ww' + i});
				for(i = 0; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
			}
			else for(i = sd_week; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
			return weeks;
		}
		var workweeks = getWorkweeks();
		
		/******************************** RISK PARSING/MANIPULATION FUNCTIONS ***************************/

		function removeDepFromList(dependencyID, dependencyList){ 
			for(var i = 0; i<dependencyList.length; ++i){
				if(dependencyList[i].DependencyID == dependencyID) {
					return dependencyList.splice(i, 1)[0];
				}
			}
		}
	
		function removePredDep(userStoryRecord, predDepData){
			var USID = userStoryRecord.get('ObjectID');
			var dependencies = me._getDependencies(userStoryRecord);
			delete dependencies.Preds[predDepData.DependencyID];
			me.DependenciesCache[USID] = dependencies;
			userStoryRecord.set('c_Dependencies', JSON.stringify(dependencies, null, '\t'));
			userStoryRecord.save();
			console.log('removed pred from userStory:', userStoryRecord, predDepData, dependencies);
		}
		
		function removeSuccDep(userStoryRecord, succDepData){
			var USID = userStoryRecord.get('ObjectID');
			var dependencies = me._getDependencies(userStoryRecord);
			var succs = dependencies.Succs;
			for(var i=0; i<succs.length; ++i){
				if(succs[i].ID === succDepData.DependencyID){					
					succs.splice(i, 1);
					me.DependenciesCache[USID] = dependencies;
					userStoryRecord.set('c_Dependencies', JSON.stringify(dependencies, null, '\t'));
					userStoryRecord.save();
					console.log('removed succ from userStory:', userStoryRecord, succDepData, dependencies);
					return;
				}
			}
		}

		function addPredDep(userStoryRecord, predDepData){ 
			var USID = userStoryRecord.get('ObjectID');
			var dependencies = me._getDependencies(userStoryRecord);
			var copy = {
				Desc: predDepData.Description,
				CP: predDepData.Checkpoint,
				Sta: predDepData.Status,
				Preds: predDepData.Predecessors
			};
			dependencies.Preds[predDepData.DependencyID] = copy;
			me.DependenciesCache[USID] = dependencies;
			userStoryRecord.set('c_Dependencies', JSON.stringify(dependencies, null, '\t'));
			userStoryRecord.save();
			console.log('added predecessor to userStory:', userStoryRecord, predDepData, dependencies);
		}
		
		function addSuccDep(userStoryRecord, succDepData){ //overwrites if needed, else appends to list
			var USID = userStoryRecord.get('ObjectID');
			var dependencies = me._getDependencies(userStoryRecord);
			var succs = dependencies.Succs;
			var copy = {
				ID: succDepData.DependencyID,
				PUSID: succDepData.PredFormattedID,
				PUSName: succDepData.PredUserStoryName,
				PPID: succDepData.PredProjectName,
				Desc: succDepData.Description,
				CP: succDepData.Checkpoint,
				Sup: succDepData.Supported,
				A: succDepData.Assigned,
				REL: succDepData.ReleaseDate,
				REL_S: succDepData.ReleaseStartDate
			};
			var replaced = false;
			for(var i = 0; i<succs.length; ++i){
				if(succs[i].ID === copy.ID){
					succs[i] = copy;
					replaced=true; 
					break; 
				}
			}
			if(!replaced) succs.push(copy);
			me.DependenciesCache[USID] = dependencies;
			userStoryRecord.set('c_Dependencies', JSON.stringify(dependencies, null, '\t'));
			userStoryRecord.save();
			console.log('added succ to userStory:', userStoryRecord, succDepData, dependencies);
		}
		
		function getPredecessorsObject(predDepRecord){ //predDepRecord - or data Object
			var predecessors;
			try{ 
				if(predDepRecord.get) predecessors = JSON.parse(predDepRecord.get('Predecessors')) || []; 
				else  predecessors = JSON.parse(predDepRecord.Predecessors) || []; 
			}
			catch(e){ predecessors = []; }			
			return predecessors;
		}
	
		function getDirtyType(localDepRecord, realDepData){
			var localDepData = localDepRecord.data;
			if(!realDepData)	return localDepData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else				return localDepData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		}
		
		/****************************** PREDECESSORS STUFF           ***********************************************/				
		me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
		
		me.CustomPredDepStore = Ext.create('Ext.data.Store', { 
			data: me.DependenciesParsedData.Predecessors.slice(0),
			autoSync:true,
			model:'IntelPredDep',
			proxy: {
				type: 'intelcustomproxy',
				keyField: 'DependencyID'
			},
			limit:Infinity,
			listeners: {
				load: function(customPredDepStore, customPredDepRecs){ 
					var realPredDepsData = me.DependenciesParsedData.Predecessors.slice(0); //shallow copy of it
					console.log('syncing predDeps with current userStories', customPredDepRecs, realPredDepsData);
					for(var i = 0;i<customPredDepRecs.length;++i){
						var depRec =  customPredDepRecs[i]; //predecessor dependency record to be updated
						
						var depID = depRec.get('DependencyID');
						var realDep = removeDepFromList(depID, realPredDepsData);	
							
						var dirtyType = getDirtyType(depRec, realDep);
						if(dirtyType === 'New' || dirtyType === 'Edited') //we don't want to remove any pending changes
							continue;						
						else if(dirtyType == 'Deleted') // the depRec was deleted by someone else, and we arent editing it
							customPredDepStore.remove(depRec);
						else {
							for(var key in realDep)
								depRec.set(key, realDep[key]);
							depRec.commit();
						}
					}
					realPredDepsData.forEach(function(realDep){ //add all the new risks that other people have added since the last load
						console.log('adding predDep', realDep);
						customPredDepStore.add(Ext.create('IntelPredDep', realDep));
					});	
				}
			}
		});
		
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
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},
				sortable:true
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
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				sortable:true		
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				width:160,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor: 'textfield',
				sortable:true,
				renderer: function(val){
					return val || '-';
				}				
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				text:'Checkpoint',					
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
				renderer: function(val){
					return val || '-';
				},
				sortable:true
			},{
				text: 'Teams Depended On',
				items: [
					{
						xtype:'text',
						width:90,
						text:''
					},{
						xtype:'text',
						width:160,
						text:'Team Name'
					},{
						xtype:'text',
						width:60,
						text:'Supported'
					},{
						xtype:'text',
						width:60,
						text:'US#'
					},{
						xtype:'text',
						width:130,
						text:'UserStory'
					}
				],
				dataIndex:'Predecessors',
				width:580,
				resizable:false,
				sortable:false,
				renderer: function (val, meta, predDepRecord){
					var id = Ext.id();
					Ext.defer(function () {
						var predecessors = getPredecessorsObject(predDepRecord);				
						var el = Ext.get(id);
						if(el && el.isVisible()){
							var depID = predDepRecord.get('DependencyID');
							//set up the store and add a record if needed
							delete me.PredDepTeamStores[depID]; //delete store every time or else memory leak with event handlers
							if(!predecessors.length) {
								predecessors.push({
									TID: (new Date() * 1) + '' + (Math.random() * 10000000),
									PID: '',
									Sup:'No',
									USID:'',
									USName:'',
									A:false
								});
								predDepRecord.data.Predecessors = JSON.stringify(predecessors, null, '\t');
							}
							me.PredDepTeamStores[depID] = Ext.create('Ext.data.Store', { 
								data: predecessors,
								autoSync:true,
								limit:Infinity,
								model:'IntelDepTeam',
								proxy: {
									type: 'intelcustomproxy',
									keyField: 'TID'
								},
								listeners:{
									load: function(depTeamStore, depTeamRecords){
										var predecessors = getPredecessorsObject(predDepRecord);
										console.log('syncing depTeamRecords with current dependencies', depTeamRecords, predecessors);					
										Outer:
										for(var i = 0;i<depTeamRecords.length;++i){
											var depTeamRecord = depTeamRecords[i];
											var realTeamDep;
											for(var j=0; j<predecessors.length;++j){
												if(predecessors[j].TID === depTeamRecord.get('TID')){
													realTeamDep = predecessors.splice(j, 1)[0];
													depTeamRecord.data = realTeamDep;
													depTeamRecord.commit();
													continue Outer;
												}
											}
											//if we get here, that means that the depTeamRecord is PENDING, has not been saved yet
										}
										predecessors.forEach(function(realTeamDep){ 
											console.log('adding IntelDepTeam', realTeamDep);
											depTeamStore.add(Ext.create('IntelDepTeam', realTeamDep));
										});	
									}
								}
							});	
							var defaultHandler = { //dont let mouse events bubble up to parent rallygrid. bad things happen
								element: 'el',
								fn: function(a){ a.stopPropagation(); }
							};
							var teamColumnCfgs = [
								{
									dataIndex:'PID',
									width:160,
									resizable:false,
									renderer: function(val, meta, predDepRecord){
										var projectRecord = _.find(me.ValidProjects, function(projectRecord){
											return projectRecord.get('ObjectID') == val;
										});
										if(val && projectRecord) return projectRecord.get('Name');
										else {
											meta.tdCls += 'intel-editor-cell';
											return 'Select Team';
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
									renderer: function(val, meta, teamDepRecord){
										if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
										else meta.tdCls = 'intel-supported-cell';
										return val;
									}
								},{
									dataIndex:'USID',
									width:60,
									resizable:false,
									editor: false,
									renderer: function(val, meta, depTeamRecord){
										if(depTeamRecord.get('A')) return val;
										else return '-';
									}
								},{
									dataIndex:'USName',
									width:130,
									resizable:false,
									editor: false,
									renderer: function(val, meta, depTeamRecord){
										if(depTeamRecord.get('A')) return val;
										else return '-';
									}				
								},{
									width:80,
									resizable:false,
									xtype:'actioncolumn',
									defaultRenderer: function(v, meta, depTeamRecord, rowIdx, colIdx, store, view){
										//most of this copied from the Extjs source...
										var _me_col = this,
											prefix = Ext.baseCSSPrefix,
											scope = _me_col.origScope || _me_col,
											items = _me_col.items,
											len = items.length,
											i = 0,
											item, ret, disabled, tooltip;
										ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
										meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
										for (; i < len; i++) {
											item = items[i];
											disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, depTeamRecord) : false);
											tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
											if (!item.hasActionConfiguration) {
												item.stopSelection = _me_col.stopSelection;
												item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
												item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
												item.hasActionConfiguration = true;
											}
											ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Delete</div>', 
												prefix,
												i,
												(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
											);
										}
										return ret;
									},
									handler: function(grid, row, col){
										var store = grid.getStore();
										var depTeamRecord = store.getAt(row);											
										var predecessors = getPredecessorsObject(predDepRecord);
										for(var i=0; i<predecessors.length; ++i)
											if(predecessors[i].TID === depTeamRecord.get('TID')){
												predecessors.splice(i, 1); break; }
										predDepRecord.set('Predecessors', JSON.stringify(predecessors, null, '\t'));
										me.PredDepTeamStores[depID].remove(depTeamRecord);	
										predDepRecord.set('Edited', true);
										predDepRecord.commit();
									}
								}
							];
							Ext.widget('container', {
								renderTo: id,
								layout:'hbox',
								pack:'start',
								align:'stretch',
								border:false,
								bodyStyle:'background:rgba(0,0,0,0);padding:0;margin:0',
								items: [
									{
										xtype: 'button',
										text: '+ Add Team',
										padding:3,
										margin:'0 5 0 0 ',
										width:80,
										handler: function(){
											if(me.PredDepTeamStores[depID]) {
												var model = Ext.create('IntelDepTeam', {
													TID: (new Date() * 1) + '' + (Math.random() * 10000000),
													PID: '',
													Sup:'No',
													USID:'',
													USName:'',
													A:false
												});
												me.PredDepTeamStores[depID].add(model);
												var predecessors = getPredecessorsObject(predDepRecord);
												predecessors.push(model.data);
												predDepRecord.set('Predecessors', JSON.stringify(predecessors, null, '\t'));
												predDepRecord.set('Edited', true);
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
												if(!teamDepRecord.get('PID')) return 'intel-row-35px intel-no-team-dep-selected';
												else return 'intel-row-35px';
											}
										},
										listeners: {
											beforeedit: function(editor, e){
												if(!!e.value) return false; //don't edit if has value
												me._isEditing = true;
											},
											canceledit: function(){
												me._isEditing = false;
											},
											edit: function(editor, e){	
												var depTeamRecord = e.record,
													field = e.field,
													value = e.value,
													originalValue = e.originalValue,
													i;
												me._isEditing = false;
												console.log('teamDepEdit', field, value, originalValue);
												var previousEdit = predDepRecord.get('Edited');
												predDepRecord.set('Edited', true);
												var predecessors = getPredecessorsObject(predDepRecord);
												if(field === 'PID'){
													var projectRecord = _.find(me.ValidProjects, function(projectRecord){
														return projectRecord.get('Name') == value;
													});
													if(!projectRecord) {
														depTeamRecord.set('PID', originalValue);
														predDepRecord.set('Edited', previousEdit);
														return;
													} else {
														for(i = 0;i<predecessors.length;++i){
															if(predecessors[i].PID === ''+projectRecord.get('ObjectID')){
																alert(value + ' already included in this dependency');
																depTeamRecord.set('PID', originalValue);
																predDepRecord.set('Edited', previousEdit);
																return;
															}
														}
														if(projectRecord.get('ObjectID') === me.ProjectRecord.get('ObjectID')){
															alert('You cannot depend on yourself');
															depTeamRecord.set('PID', originalValue);
															predDepRecord.set('Edited', previousEdit);
															return;
														}
														depTeamRecord.set('PID', projectRecord.get('ObjectID'));
													}
												}
														
												for(i=0; i<predecessors.length; ++i){
													if(predecessors[i].TID === depTeamRecord.get('TID')){
														predecessors[i] = depTeamRecord.data; //update the predDepRecord
														predDepRecord.set('Predecessors', JSON.stringify(predecessors, null, '\t'));
														break; 
													}
												}
											}
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
									dblclick: defaultHandler
								}
							});
						}
					}, 5);
					return Ext.String.format('<div id="{0}"></div>', id);
				}
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, predDepRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					var realDepData = removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = getDirtyType(predDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, predDepRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Undo</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var predDepRecord = store.getAt(row);
					predDepRecord.set('Edited', false);
					predDepRecord.commit();
					me._loadDependenciesStores = false;
					grid.setLoading(true);
					store.load({
						callback: function(){
							me._loadDependenciesStores = true;
							grid.setLoading(false);
						}
					});
				}
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, predDepRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					var realDepData = removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = getDirtyType(predDepRecord, realDepData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return ''; //don't render it!
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, predDepRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">{3}</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || '')),
							dirtyType
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var predDepRecord = store.getAt(row);
					if(!me._loadDependenciesStores) return;
					//validate fields first
					if(predDepRecord.get('Description') === ''){
						alert('Cannot Save: Description is empty'); return; }
					if(predDepRecord.get('Checkpoint') === ''){
						alert('Cannot Save: Checkpoint is empty'); return; }
					var predecessors = getPredecessorsObject(predDepRecord);
					if(predecessors.length === 0){
						alert('Cannot Save: Must specify a team you depend on'); return; }
					for(var i = 0;i<predecessors.length;++i)
						if(predecessors[i].PID === ''){
							alert('Cannot Save: All Team Names must be valid'); return; }
					
					me._loadDependenciesStores = false; 
					me.PredDepGrid.setLoading(true);
					me.DependenciesUserStoryStore.load({
						callback: function(userStoryRecords, operation){
							me._buildDependenciesData();
							var predDepData = predDepRecord.data;
							var realPredDeps = me.DependenciesParsedData.Predecessors.slice(0);
							var realDepData = removeDepFromList(predDepData.DependencyID, realPredDeps);
							
							/***************************** UPDATE THE PRED USER STORIES *********************/
							var addedTeamDeps = [], removedTeamDeps = [], updatedTeamDeps = [];
							var localPredTeams = getPredecessorsObject(predDepData),
								realPredTeams  = getPredecessorsObject(realDepData);
							Outer:
							for(var i=0;i<localPredTeams.length;++i){
								for(var j=0;j<realPredTeams.length;++j){
									if(localPredTeams[i].TID === realPredTeams[j].TID){
										updatedTeamDeps.push(realPredTeams.splice(j,1)[0]);
										continue Outer;
									}
								}
								addedTeamDeps.push(localPredTeams[i]); //teams we just added
							}
							removedTeamDeps = realPredTeams; //teams that we just removed			
							
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
												var project = _.find(me.ValidProjects, function(projectRecord){
													return projectRecord.get('ObjectID') == teamDepData.PID;
												});
												me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
													if(!us) return; // looks as if the userStory doesn't exist. so we ignore it
													removeSuccDep(us, predDepData); //using predDepData cuz we only need DependencyID
												});
											});
											addedTeamDepsCallbacks.forEach(function(cb){ cb(); }); //execute the added teams now 
											updatedTeamDepsCallbacks.forEach(function(cb){ cb(); }); //execute the updated teams now 
									
											predDepData.Predecessors = JSON.stringify(localPredTeams, null, '\t');
											//also, move to new user story if needed
											if(realDepData && (realDepData.FormattedID != predDepData.FormattedID)){
												console.log('moving predDep to new user story', realDepData.FormattedID, predDepData.FormattedID);
												//we must remove risk from old userStory and add it to new userStory
												var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData.FormattedID, 0, false, true, true);
												if(oldUserStoryRecord) 
													removePredDep(oldUserStoryRecord, realDepData);
											}
											var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', predDepData.FormattedID, 0, false, true, true);
											if(newUserStoryRecord) 
												addPredDep(newUserStoryRecord, predDepData);
											
											predDepRecord.set('Edited', false);
											
											me.DependenciesUserStoryStore.load({
												callback: function(userStoryRecords, operation){
													me._buildDependenciesData();
													me._loadDependenciesStores = true; 
													me.PredDepGrid.setLoading(false);
												}
											});
										}
									};
									
									updatedTeamDepsDone();
									
									/** 2) update updated teams **/
									updatedTeamDeps.forEach(function(teamDepData){ //have to update these here!
										var project = _.find(me.ValidProjects, function(projectRecord){
											return projectRecord.get('ObjectID') == teamDepData.PID;
										});
										me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
											if(!us){
												me._loadRandomUserStory(project.get('_ref'), function(us){
													if(!us){
														me._loadDependenciesStores = true; 
														me.PredDepGrid.setLoading(false);
														alert('Project ' + project.get('Name') + ' has no user stories, cannot continue');
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
															PredUserStoryName: predDepData.UserStoryName,
															PredFormattedID: predDepData.FormattedID,
															PredProjectName: me.ProjectRecord.get('Name'),
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
														addSuccDep(us, succDep);
													});
													updatedTeamDepsDone();
												});
											}
											else{
												updatedTeamDepsCallbacks.push(function(){
													var deps = me._getDependencies(us);
													var succs = deps.Succs;
													for(var i = 0;i<succs.length;++i){
														if(succs[i].ID == predDepData.DependencyID){
															succs[i].PUSName = predDepData.UserStoryName;
															succs[i].PUSID = predDepData.FormattedID;
															succs[i].CP = predDepData.Checkpoint;
															succs[i].Desc = predDepData.Description;
															us.set('c_Dependencies', JSON.stringify(deps, null, '\t'));
															us.save();
															return;
														}
													} //got deleted somehow, so re-add it, DONT CHANGE THE TeamDepData FIELDS--US didn't change!
													var succDep = {
														DependencyID: predDepData.DependencyID,
														PredUserStoryName: predDepData.UserStoryName,
														PredFormattedID: predDepData.FormattedID,
														PredProjectName: me.ProjectRecord.get('Name'),
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
													addSuccDep(us, succDep);
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
								var project = _.find(me.ValidProjects, function(projectRecord){
									return projectRecord.get('ObjectID') == teamDepData.PID;
								});
								me._loadRandomUserStory(project.get('_ref'), function(us){
									if(!us){
										me._loadDependenciesStores = true; 
										me.PredDepGrid.setLoading(false);
										alert('Project ' + project.get('Name') + ' has no user stories, cannot continue');
										return;
									}
									addedTeamDepsCallbacks.push(function(){
										teamDepData.USID = us.get('FormattedID');
										teamDepData.USName = us.get('Name');
										var succDep = {
											DependencyID: predDepData.DependencyID,
											PredUserStoryName: predDepData.UserStoryName,
											PredFormattedID: predDepData.FormattedID,
											PredProjectName: me.ProjectRecord.get('Name'),
											UserStoryName: '',
											FormattedID: '',
											Description: predDepData.Description,
											Checkpoint: predDepData.Checkpoint,
											Supported: 'No',
											Assigned: false,
											ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
											ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
											Edited: false
										};
										addSuccDep(us, succDep);
									});
									addedTeamDepsDone();
								});
							});
							
						}
					});
				}
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, predDepRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, predDepRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Delete</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var predDepRecord = store.getAt(row);
					if(!me._loadDependenciesStores) return; //already clicked save or delete
					if(confirm('Confirm Dependency Deletion')){
						me.PredDepGrid.setLoading(true);
						me._loadDependenciesStores = false; // so interval reload doesn't do anything 
						me.DependenciesUserStoryStore.load({
							callback: function(userStoryRecords, operation){
								me._buildDependenciesData();
								var predDeps = me.DependenciesParsedData.Predecessors.slice(0);
								var predDepData = predDepRecord.data;
								var realDepData = removeDepFromList(predDepData.DependencyID, predDeps);
								
								/***************************** REMOVE SELF FROM PREDECESSORS *********************/
								var realTeamDeps = getPredecessorsObject(realDepData);
								realTeamDeps.forEach(function(teamDepData){
									if(teamDepData.PID === '') return;
									var project = _.find(me.ValidProjects, function(projectRecord){
										return projectRecord.get('ObjectID') == teamDepData.PID;
									});
									me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
										if(!us) return; //us must have been deleted. ignore it
										removeSuccDep(us, predDepData); //using teamDepData cuz we only need DependencyID
									});
								});
								
								/** remove from userStory, and previous user story if it was moved **/
								if(realDepData && (realDepData.FormattedID != predDepData.FormattedID)){
									console.log('moving predDep to new user story', realDepData.FormattedID, predDepData.FormattedID);
									//we must remove risk from old feature and add it to new feature
									var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData.FormattedID, 0, false, true, true);
									if(oldUserStoryRecord) 
										removePredDep(oldUserStoryRecord, realDepData);
								}
								var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', predDepData.FormattedID, 0, false, true, true);
								if(newUserStoryRecord) 
									removePredDep(newUserStoryRecord, predDepData);
								
								me.CustomPredDepStore.remove(predDepRecord);
								me.DependenciesUserStoryStore.load({
									callback: function(userStoryRecords, operation){
										me._buildDependenciesData();
										me.CustomPredDepStore.load({
											callback: function(){
												me._loadDependenciesStores = true; 
												me.PredDepGrid.setLoading(false);
											}
										});
									}
								});
							}
						});
					}
				}
			}
		];

		me.AddPredDepButton = me.add({
			xtype:'button',
			text:'+ Add Dependency',
			style:'margin-bottom:10px',
			x:0,
			y:760,
			listeners:{
				click: function(){
					var randomUserStory = me.DependenciesReleaseUserStories[0];
					if(!randomUserStory) alert('No User Stories for this Release!');
					else if(me.CustomPredDepStore) {
						var model = Ext.create('IntelPredDep', {
							DependencyID: (new Date() * 1) + '' + (Math.random() * 10000000),
							FormattedID: randomUserStory.get('FormattedID'),
							UserStoryName: randomUserStory.get('Name'),
							Description: '',
							Checkpoint: '',
							Predecessors:'',
							Edited:true
						});
						me.CustomPredDepStore.add(model);
					}
				}
			}
		});
		
		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
            title: "Predecessor Dependencies",
			width: _.reduce(predDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:400,
			x:0, y:800,
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
					var cls = 'intel-row-' + (10 + (35*getPredecessorsObject(predDepRecord).length || 35)) + 'px';
					return cls;
				}
			},
			listeners: {
				beforeedit: function(){
					me._isEditing = true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){					
					var grid = e.grid,
						predDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
					me._isEditing = false;
					console.log('predDep edit:', predDepRecord, field, value, originalValue);
					if(value === originalValue) return;
					var previousEdit = predDepRecord.get('Edited');
					predDepRecord.set('Edited', true);
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							predDepRecord.set('UserStoryName', originalValue);
							predDepRecord.set('Edited', previousEdit); //not edited
						} else predDepRecord.set('FormattedID', userStoryRecord.get('FormattedID'));	
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							predDepRecord.set('FormattedID', originalValue);
							predDepRecord.set('Edited', previousEdit); //not edited
						} else predDepRecord.set('UserStoryName', userStoryRecord.get('Name'));	
					}
					predDepRecord.commit();
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomPredDepStore
		});	
	
		/****************************** SUCCESSORS    STUFF           ***********************************************/	
		me.CustomSuccDepStore = Ext.create('Ext.data.Store', { 
			data: me.DependenciesParsedData.Successors.slice(0),
			autoSync:true,
			model:'IntelSuccDep',
			proxy: {
				type: 'intelcustomproxy',
				keyField: 'DependencyID'
			},
			limit:Infinity,
			listeners: {
				load: function(customSuccDepStore, customSuccDepRecs){ 
					var realSuccDepsData = me.DependenciesParsedData.Successors.slice(0); //shallow copy of it
					console.log('syncing succDeps with current userStories', customSuccDepRecs, realSuccDepsData);
					for(var i = 0;i<customSuccDepRecs.length;++i){
						var depRec =  customSuccDepRecs[i]; //predecessor dependency record to be updated
						
						var depID = depRec.get('DependencyID');
						var realDep = removeDepFromList(depID, realSuccDepsData);	
							
						var dirtyType = getDirtyType(depRec, realDep);
						if(dirtyType === 'New' || dirtyType === 'Edited') //we don't want to remove any pending changes
							continue;						
						else if(dirtyType === 'Deleted') // the depRec was deleted by someone else, and we arent editing it
							customSuccDepStore.remove(depRec);
						else {
							for(var key in realDep)
								depRec.set(key, realDep[key]);
							depRec.commit();
						}
					}
					realSuccDepsData.forEach(function(realDep){ 
						console.log('adding succDep', realDep);
						customSuccDepStore.add(Ext.create('IntelSuccDep', realDep));
					});	
				}
			}
		});
		
		var succDepColumnCfgs = [
			{
				text:'Predecesor Project', 
				dataIndex:'PredProjectName',
				width:160,
				resizable:false,
				sortable:true
			},{
				text:'Pred US#', 
				dataIndex:'PredFormattedID',
				width:85,
				resizable:false,
				sortable:true
			},{
				text:'Pred UserStory', 
				dataIndex:'PredUserStoryName',
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
				text:'Checkpoint', 
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
				text:'Supporting US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:120,
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
				text:'UserStory', 
				dataIndex:'UserStoryName',
				width:160,
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
				width:130,
				resizable:false,
				xtype:'actioncolumn',
				defaultRenderer: function(v, meta, succDepRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					if(!succDepRecord.get('FormattedID')) return '';
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, succDepRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Remove UserStory</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var succDepRecord = store.getAt(row);
					succDepRecord.set('Edited', true);
					succDepRecord.set('Assigned', false);
					succDepRecord.set('FormattedID', '');
					succDepRecord.set('UserStoryName', '');
					succDepRecord.commit();
				}
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, succDepRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					var realDepData = removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, succDepRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Undo</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var succDepRecord = store.getAt(row);
					succDepRecord.set('Edited', false);
					succDepRecord.commit();
					me._loadDependenciesStores = false;
					grid.setLoading(true);
					store.load({
						callback: function(){
							me._loadDependenciesStores = true;
							grid.setLoading(false);
						}
					});
				}
			},{
				text:'',
				width:80,
				xtype:'actioncolumn',
				resizable:false,
				defaultRenderer: function(v, meta, succDepRecord, rowIdx, colIdx, store, view){
					//most of this copied from the Extjs source...
					var _me_col = this,
						prefix = Ext.baseCSSPrefix,
						scope = _me_col.origScope || _me_col,
						items = _me_col.items,
						len = items.length,
						i = 0,
						item, ret, disabled, tooltip;
					ret = Ext.isFunction(me.origRenderer) ? me.origRenderer.apply(scope, arguments) || '' : '';
					meta.tdCls += ' ' + Ext.baseCSSPrefix + 'action-col-cell';
					var realDepData = removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					for (; i < len; i++) {
						item = items[i];
						disabled = item.disabled || (item.isDisabled ? item.isDisabled.call(item.scope || scope, view, rowIdx, colIdx, item, succDepRecord) : false);
						tooltip = disabled ? null : (item.tooltip || (item.getTip ? item.getTip.apply(item.scope || scope, arguments) : null));
						if (!item.hasActionConfiguration) {
							item.stopSelection = _me_col.stopSelection;
							item.disable = Ext.Function.bind(_me_col.disableAction, _me_col, [i], 0);
							item.enable = Ext.Function.bind(_me_col.enableAction, _me_col, [i], 0);
							item.hasActionConfiguration = true;
						}
						ret +=  Ext.String.format('<div class="{0}action-col-{1} {2} intel-button-cell">Save</div>', 
							prefix,
							i,
							(Ext.isFunction(item.getClass) ? item.getClass.apply(item.scope || scope, arguments) : (item.iconCls || _me_col.iconCls || ''))
						);
					}
					return ret;
				},
				handler: function(grid, row, col){
					var store = grid.getStore();
					var succDepRecord = store.getAt(row);
					if(!me._loadDependenciesStores) return;
					//no field validation needed
					me._loadDependenciesStores = false; 
					me.SuccDepGrid.setLoading(true);
					me.DependenciesUserStoryStore.load({
						callback: function(userStoryRecords, operation){
							me._buildDependenciesData();
							var succDepData = succDepRecord.data;
							var realSuccDeps = me.DependenciesParsedData.Successors.slice(0);
							var realDepData = removeDepFromList(succDepData.DependencyID, realSuccDeps);
							
							/***************************** UPDATE THE Pred USER STORy *********************/
							var project = _.find(me.ValidProjects, function(projectRecord){
								return projectRecord.get('Name') == succDepData.PredProjectName;
							});
							if(!project){
								me._loadDependenciesStores = true; 
								me.SuccDepGrid.setLoading(false);
								alert('could not find project ' + succDepData.PredProjectName);
								return;
							}													
							if(succDepData.FormattedID) {
								succDepData._realFormattedID = succDepData.FormattedID;
								succDepData._realUserStoryName = succDepData.UserStoryName;
							}
							
							var reloadDeps = function(){
								me.DependenciesUserStoryStore.load({
									callback: function(userStoryRecords, operation){
										me._buildDependenciesData();
										me._loadDependenciesStores = true; 
										me.SuccDepGrid.setLoading(false);
									}
								});
							};
							var alertAndDelete = function(msg){
								alert(msg);
								console.log('removing succDep from user story', realDepData._realFormattedID, succDepData._realFormattedID);
								var userStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData._realFormattedID, 0, false, true, true);
								if(userStoryRecord) 
									removeSuccDep(userStoryRecord, realDepData);
								me.DependenciesUserStoryStore.load({
									callback: function(userStoryRecords, operation){
										me._buildDependenciesData();
										me._loadDependenciesStores = true; 
										me.SuccDepGrid.setLoading(false);
										me.CustomSuccDepStore.remove(succDepRecord);
									}
								});
							};
							me._loadUserStoryByFID(succDepData.PredFormattedID, project.get('_ref'), function(us){
								if(!us) alertAndDelete('Successor UserStory has been deleted. Deleting Dependency Now');
								else {
									var deps = me._getDependencies(us);
									var preds = deps.Preds;
									var predDep = preds[succDepData.DependencyID];
									if(predDep){
										var predecessors;
										try { predecessors = JSON.parse(predDep.Preds); }
										catch(e) { predecessors = []; }
										for(var i = 0;i<predecessors.length;++i){
											//have to make sure this dep is actually in the JSON teamDep object
											if(predecessors[i].PID == me.ProjectRecord.get('ObjectID')){ 
												predecessors[i].Sup = succDepData.Supported;
												predecessors[i].USID = succDepData._realFormattedID;
												predecessors[i].USName = succDepData._realUserStoryName;
												predecessors[i].A = succDepData.Assigned;
												
												predDep.Preds = JSON.stringify(predecessors, null, '\t');
												us.set('c_Dependencies', JSON.stringify(deps, null, '\t'));
												us.save();
										
												/***************************** UPDATE THE SUCC USER STORIES *********************/				
												//move succ dep to new user story if needed, don't change it if set to ''
												if(realDepData && (realDepData._realFormattedID != succDepData._realFormattedID)){
													console.log('moving succDep to new user story', realDepData._realFormattedID, succDepData._realFormattedID);
													//we must remove risk from old userStory and add it to new userStory
													var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData._realFormattedID, 0, false, true, true);
													if(oldUserStoryRecord) 
														removeSuccDep(oldUserStoryRecord, realDepData);
												}
												var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', succDepData._realFormattedID, 0, false, true, true);
												if(newUserStoryRecord) 
													addSuccDep(newUserStoryRecord, succDepData);
												
												succDepRecord.set('Edited', false);
												succDepRecord.commit();
												reloadDeps();
												return;
											}
										}
										alertAndDelete('Successor removed this dependency. Deleting your dependency now');
									}
									else alertAndDelete('Successor removed this dependency. Deleting your dependency now');
								} 
							});
						}
					});
				}
			}
		];
		
		me.SuccDepGrid = me.add({
			xtype: 'rallygrid',
            title: "Successor Dependencies",
			width: _.reduce(succDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:400,
			x:0, y:1240,
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
				getRowClass: function(predDepRecord){ return 'intel-row-35px'; }
			},
			listeners: {
				beforeedit: function(editor, e){
					if(e.record.get('Supported') == 'No' && e.field != 'Supported') return false; //don't user story stuff if not supported
					me._isEditing = true;
					return true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){					
					var grid = e.grid,
						succDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
					me._isEditing = false;
					console.log('succDep edit:', succDepRecord, field, value, originalValue);
					if(value === originalValue) return;
					var previousEdit = succDepRecord.get('Edited');
					succDepRecord.set('Edited', true);
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							succDepRecord.set('UserStoryName', originalValue);
							succDepRecord.set('Edited', previousEdit); //not edited
						} else {
							succDepRecord.set('FormattedID', userStoryRecord.get('FormattedID'));	
							succDepRecord.set('Assigned', true);
						}
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							succDepRecord.set('FormattedID', originalValue);
							succDepRecord.set('Edited', previousEdit); //not edited
						} else {
							succDepRecord.set('UserStoryName', userStoryRecord.get('Name'));	
							succDepRecord.set('Assigned', true);
						}
					}
					else if(field === 'Supported'){ //cant be non-supported with a user story!
						if(value == 'No'){
							succDepRecord.set('Edited', true);
							succDepRecord.set('Assigned', false);
							succDepRecord.set('FormattedID', '');
							succDepRecord.set('UserStoryName', '');
						}
					}
					succDepRecord.commit();
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