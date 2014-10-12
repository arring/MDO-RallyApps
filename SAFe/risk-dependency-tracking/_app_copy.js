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
/********************* END PRODUCTION *****************/

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	layout: 'absolute',
	height:1320,
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
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'],
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
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			autoLoad:true,
			limit:Infinity,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Project.ObjectID',
					value: me.TrainRecord.data.ObjectID
				},{
					property:'Name',
					operator:'contains',
					value: me.TrainRecord.data.Name.split(' ART ')[0]
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
	
	_getCurrentOrClosestRelease: function(){
		var me = this, d = new Date(),
			rs = me.ReleaseStore.getRecords();
		return _.find(rs, function(r){
			return (new Date(r.get('ReleaseDate')) >= d) && (new Date(r.get('ReleaseStartDate')) <= d);
		}) || _.reduce(rs, function(best, r){
			if(best===null) return r;
			else {
				var d1 = new Date(best.get('ReleaseStartDate')), d2 = new Date(r.get('ReleaseStartDate')), now = new Date();
				return (Math.abs(d1-now) < Math.abs(d2-now)) ? best : d2;
			}
		}, null);
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
					value: me.RootProjectRecord.get('Name')
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
		function getRisks(featureRecord){
			var risks = featureRecord.get('c_Risks');
			try{ risks = JSON.parse(risks) || {}; }
			catch(e) { risks = {}; }
			return risks;
		}
		
		function getProject(projectID){
			return _.find(me.ValidProjects, function(project){return project.get('ObjectID') == projectID; });
		}
		
		var array = [];
		_.each(me.RisksFeatureStore.getRecords(), function(featureRecord){ //load risks into custom Data Store
			var risks = getRisks(featureRecord);
			for(var projectID in risks){
				var project = getProject(projectID);
				for(var riskID in risks[projectID]){
					var risk = risks[projectID][riskID];
					array.push({
						ProjectName: project.get('Name'), 
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
	
	_loadDependenciesUserStories: function(cb){	
		var me = this;
		var store = Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			limit:Infinity,
			remoteSort:false,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.ReleaseRecord.get('Name')
				},{
					property:'c_Dependencies',
					operator:'!=',
					value:''
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
	},
	
	_getDependencies: function(userStoryRecord){
		var me = this;
		var dependencies, dependencyString = userStoryRecord.get('c_Dependencies');
		if(dependencyString === '') dependencies = { Preds:{}, Succs:[] };
		else {
			try{ dependencies = JSON.parse(dependencyString); }
			catch(e) { dependencies = { Preds:{}, Succs:[] }; }
		}		
		return dependencies;
	},
	
	_buildDependenciesData: function(){	
		var me = this;

		var predDepsList = [];
		_.each(me.DependenciesUserStoryStore.getRecords(), function(userStoryRecord){ //load risks into custom Data Store
			var projectName = userStoryRecord.get('Project').Name;
			var deps = me._getDependencies(userStoryRecord);
			var preds = deps.Preds;
			for(var predDepID in preds){
				var predDep = preds[predDepID];
				predDepsList.push({
					ProjectName: projectName,
					DependencyID: predDepID,
					FormattedID: userStoryRecord.get('FormattedID'),
					UserStoryName: userStoryRecord.get('Name'),
					Description: predDep.Desc,
					Checkpoint: predDep.CP,
					Status: predDep.Sta,
					Predecessors: predDep.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
					Edited: false //not in pending edit mode
				});
			}
		});	
		me.DependenciesParsedData = {Predecessors:predDepsList};
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
	
	/*************************************************** DEFINE MODELS ******************************************************/
	_defineModels: function(){
	
		Ext.define('IntelRisk', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'ProjectName', type:'string'},
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
				{name: 'ProjectName', type:'string'},
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
	},
	
	/******************************************************* STATE VARIABLES / Reloading ***********************************/
	_isEditingRisks: 0,
	_isEditingDeps: 0,

	_reloadRisksStores: function(){
		var me = this;						
		if(me.RisksFeatureStore && !me._isEditingRisks) {
			me.RisksFeatureStore.load({ 
				callback: function(records, operation){
					me._parseRisksData();
					if(me.CustomRisksStore && !me._isEditingRisks)					
						me.CustomRisksStore.load();
				}
			});
		}
	},
	
	_reloadDependenciesStores: function(){
		var me = this;
		if(me.DependenciesUserStoryStore && !me._isEditingDeps) {
			me.DependenciesUserStoryStore.load({ 
				callback: function(records, operation){
					me._buildDependenciesData(); //reparse the data
					if(me.CustomPredDepStore && !me._isEditingDeps)
						me.CustomPredDepStore.load();
					if(me.CustomSuccDepStore && !me._isEditingDeps)
						me.CustomSuccDepStore.load();
				}
			});
		}
	},
	
	/******************************************************* LAUNCH ********************************************************/
  
	_reloadEverything:function(){
		var me = this;
		me.removeAll();

		me._isEditingDeps = 0;
		me._isEditingRisks = 0;
		
		//load the release picker
		me._loadReleasePicker();

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
		if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
			me.removeAll();
			me._showError('You do not have permissions to edit this project');
			return;
		}
		me._defineModels();
		me._applyMessageBoxConfig();
		
		setInterval(function(){ me._reloadRisksStores();}, 10000); 
		setInterval(function(){ me._reloadDependenciesStores();}, 10000); 
		me._loadModels(function(){
			var scopeProject = me.getContext().getProject();
			me._loadProject(scopeProject, function(scopeProjectRecord){
				me._loadRootProject(scopeProjectRecord, function(){
					me._loadValidProjects(function(){
						me._projectInWhichTrain(scopeProjectRecord, function(trainRecord){
							if(trainRecord){
								me.TrainRecord = trainRecord; 
								console.log('train loaded:', trainRecord);
								me._loadReleases(function(){
									var currentRelease = me._getCurrentOrClosestRelease();
									if(currentRelease){
										me.ReleaseRecord = currentRelease;
										console.log('release loaded', currentRelease);
										me._reloadEverything();
									} else {
										me.removeAll();
										me._showError('This team has no releases');
									}
								});
							} else{
								me.removeAll();
								me._showError('Please scope to a valid team for release planning');
							}
						});
					});
				});
			});
		});
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
			day = new Date(date.getFullYear(), 0, 1).getDay(),
			weekCount = ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52; //weeks in this year
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

	_loadRisksGrid: function(){
		var me = this;
		var workweeks = me._getWorkweeks();	
		
		/******************************** RISK PARSING/MANIPULATION FUNCTIONS ***************************/
		
		function removeRiskFromList(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
			for(var i = 0; i<riskList.length; ++i){
				if(riskList[i].RiskID == riskID) {
					return riskList.splice(i, 1)[0];
				}
			}
		}
		
		function getRisks(featureRecord){
			var risks = featureRecord.get('c_Risks');
			try{ risks = JSON.parse(risks) || {}; }
			catch(e) { risks = {}; }
			return risks;
		}
		
		function removeRisk(featureRecord, riskData, cb){ 
			var risks = getRisks(featureRecord);
			var project = _.find(me.ValidProjects, function(project){return project.get('Name') === riskData.ProjectName; });
			var projectID = project.get('ObjectID');
			if(risks[projectID]){
				delete risks[projectID][riskData.RiskID];
				for(var i=0;i<me.RisksParsedData.length; ++i){
					var rpd = me.RisksParsedData[i];
					if(rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID){
						me.RisksParsedData.splice(i, 1); break; }
				}			
				var str = JSON.stringify(risks, null, '\t');
				if(str.length >= 32768){
					alert('ERROR: Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
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
		}
		
		function addRisk(featureRecord, riskData, cb){
			var risks = getRisks(featureRecord);
			var project = _.find(me.ValidProjects, function(project){return project.get('Name') === riskData.ProjectName; });
			var projectID = project.get('ObjectID');
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
			var parseDataAdded = false;
			for(var i=0;i<me.RisksParsedData.length; ++i){
				var rpd = me.RisksParsedData[i];
				if(rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID){
					me.RisksParsedData[i] = riskData;
					parseDataAdded = true; break;
				}
			}
			var str = JSON.stringify(risks, null, '\t');
			if(str.length >= 32768){
				alert('ERROR: Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			featureRecord.set('c_Risks', str);
			featureRecord.save({
				callback:function(){
					console.log('added risk to feature:', featureRecord, riskData, risks);
					cb();
				}
			});
		}
	
		function getDirtyType(localRiskRecord, realRiskData){
			var riskData = localRiskRecord.data;
			if(!realRiskData)	return riskData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else				return riskData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		}
		
		/*************************************************************************************************************/
			
		me.CustomRisksStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.RisksParsedData),
			autoSync:true,
			model:'IntelRisk',
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'RiskProxy' + Math.random()
			},
			listeners:{
				load: function(customRisksStore, currentRisksRecords){
					var realRisksDatas = me.RisksParsedData.slice(0); //'real' risks list
					console.log('syncing risks with current features', currentRisksRecords, realRisksDatas);
					for(var i = 0;i<currentRisksRecords.length;++i){
						var currentRisksRecord =  currentRisksRecords[i];
						var realRiskData = removeRiskFromList(currentRisksRecord.get('RiskID'), realRisksDatas);
						
						var dirtyType = getDirtyType(currentRisksRecord, realRiskData);
						if(dirtyType === 'Edited') continue; //we don't want to remove any pending changes on a record							
						else if(dirtyType == 'Deleted' || dirtyType == 'New') // the currentRisksRecord was deleted by someone else, and we arent editing it
							customRisksStore.remove(currentRisksRecord);
						else { //we are not editing it and it still exists, so update current copy
							for(var key in realRiskData)
								currentRisksRecord.set(key, realRiskData[key]);
						}
					}
					realRisksDatas.forEach(function(realRiskData){ //add all the new risks that other people have added since first load
						console.log('adding real risk', realRiskData);
						customRisksStore.add(Ext.create('IntelRisk', Ext.clone(realRiskData)));
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
				resizable:false,
				sortable:true
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				width:240,
				editor:false,
				resizable:false,
				sortable:true		
			},{
				text:'Team', 
				dataIndex:'ProjectName',
				width:120,
				editor: false,
				resizable:false,
				sortable:true
			},{
				text:'Risk Description', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				editor: 'textfield',
				width:195,
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }		
			},{
				text:'Impact', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				editor: 'textfield',
				width:200,
				resizable:false,
				sortable:true,
				renderer:function(val){ return val || '-'; }
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
				renderer:function(val){ return val || '-'; }
			},{
				text:'Contact', 
				dataIndex:'Contact',
				tdCls: 'intel-editor-cell',	
				width:160,
				editor: 'textfield',
				sortable:true,
				resizable:false,
				renderer:function(val){ return val || '-'; }
			},{
				text:'Needed By',	
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
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'Edited') return;
					else return {
						xtype:'button',
						text:'Undo',
						width:70,
						handler: function(){
							var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
							for(var key in realRiskData)
								riskRecord.set(key, realRiskData[key]);
							me._isEditingRisks--;
						}
					};
				}
			},{
				text:'',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = getDirtyType(riskRecord, realRiskData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return;
					return {
						xtype:'button',
						text:dirtyType,
						width:70,
						handler: function(){
							if(!riskRecord.get('Checkpoint')){
								me._alert('ERROR', 'You must set the Checkpoint for this risk');
								return;
							} else if(!riskRecord.get('Description')){
								me._alert('ERROR', 'You must set the Description for this risk');
								return;
							} else if(!riskRecord.get('Impact')){
								me._alert('ERROR', 'You must set the Impact for this risk');
								return;
							} else if(!riskRecord.get('Status')){
								me._alert('ERROR', 'You must set the Status for this risk');
								return;
							} else if(!riskRecord.get('Contact')){
								me._alert('ERROR', 'You must set the Contact for this risk');
								return;
							}	
							me.RisksGrid.setLoading(true);
							me.RisksFeatureStore.load({
								callback: function(records, operation){
									me._parseRisksData();
									var riskRecordData = riskRecord.data;
									var realRiskData = removeRiskFromList(riskRecordData.RiskID, me.RisksParsedData.slice(0));
									
									var lastAction = function(){ //last thing to do!
										riskRecord.set('Edited', false);
										me._isEditingRisks--;
										me.RisksGrid.setLoading(false);
									};
										
									var nextAction = function(){
										var newFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', riskRecordData.FormattedID, 0, false, true, true);
										if(newFeatureRecord) addRisk(newFeatureRecord, riskRecordData, lastAction);
										else lastAction();
									};
									
									if(realRiskData && (realRiskData.FormattedID != riskRecordData.FormattedID)){
										console.log('moving risk to new feature', realRiskData.FormattedID, riskRecordData.FormattedID);
										//we must remove risk from old feature and add it to new feature
										var oldFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', realRiskData.FormattedID, 0, false, true, true);
										if(oldFeatureRecord) removeRisk(oldFeatureRecord, realRiskData, nextAction);
										else nextAction();
									}
									else nextAction();
								}
							});
						}
					};
				}
			}
		];

		me.RisksGrid = me.add({
			xtype: 'rallygrid',
      title: 'Risks',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:400,
			x:0,
			y:50,
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
					var risksRecord = e.record;
					if(!risksRecord.get('Edited')) me._isEditingRisks++; //if first edit on record
				},
				canceledit: function(editor, e){
					var risksRecord = e.record;
					if(!risksRecord.get('Edited')) me._isEditingRisks--; //if first edit on record failed
				},
				edit: function(editor, e){					
					var grid = e.grid,
						risksRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;				
					
					if(value === originalValue) { 
						if(!risksRecord.get('Edited')) me._isEditingRisks--;//if first edit on record failed
						return; 
					}			
					risksRecord.set('Edited', true);
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
	
		/******************************** DEP PARSING/MANIPULATION FUNCTIONS ***************************/

		function removeDepFromList(dependencyID, dependencyList){ 
			for(var i = 0; i<dependencyList.length; ++i){
				if(dependencyList[i].DependencyID == dependencyID) {
					return dependencyList.splice(i, 1)[0];
				}
			}
		}

		function addPredDep(userStoryRecord, predDepData, cb){ //we are NOT updating successors/predecessor fields here. 
			var dependencies = me._getDependencies(userStoryRecord),	
				cachePreds = me.DependenciesParsedData.Predecessors, dpdp,
				parseDataAdded = false, i;
				
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

			var str = JSON.stringify(dependencies, null, '\t');
			if(str.length >= 32768){
				alert('ERROR: Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			userStoryRecord.set('c_Dependencies', str);
			userStoryRecord.save({
				callback:function(){
					console.log('added predecessor to userStory:', userStoryRecord, predDepData, dependencies);
					if(cb) cb();
				}
			});
		}
	
		function getDirtyType(localDepRecord, realDepData){
			var localDepData = localDepRecord.data;
			if(!realDepData)	return localDepData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else				return localDepData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		}
		
		/****************************** PREDECESSORS STUFF           ***********************************************/				
		me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
		me.PredDepContainers = {};

		me.CustomPredDepStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.DependenciesParsedData.Predecessors),
			autoSync:true,
			model:'IntelPredDep',
			proxy: {
				type:'sessionstorage',
				id:'PredDepProxy' + Math.random()
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
						if(dirtyType === 'New' || dirtyType === 'Edited'){ 
							//we don't want to remove any pending changes			
						} else if(dirtyType == 'Deleted'){ 
							// the depRec was deleted by someone else, and we arent editing it
							customPredDepStore.remove(depRec);
							delete me.PredDepTeamStores[depID];
							delete me.PredDepContainers[depID];
						} else {
							for(var key in realDep){
								if(key === 'Predecessors') depRec.set(key, Ext.clone(realDep[key]) || [newTeamDep()]); 
								else depRec.set(key, realDep[key]);
							}
						}				
						var preds = depRec.get('Predecessors');
						if(!preds.length){
							depRec.set('Predecessors', [newTeamDep()]);
							depRec.set('Edited', true);
						}
						
						if(me.PredDepTeamStores[depID])
							me.PredDepTeamStores[depID].load();
					}
					realPredDepsData.forEach(function(realDep){ 
						//add all the new risks that other people have added since the last load
						console.log('adding predDep', realDep);
						customPredDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));					
						var depID = realDep.DependencyID;
						if(me.PredDepTeamStores[depID])
							me.PredDepTeamStores[depID].load();
					});	
				}
			}
		});
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				width:80,
				resizable:false,
				editor:false,
				sortable:true
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				width:160,
				resizable:false,
				editor:false,
				sortable:true		
			},{
				text:'Owning Team', 
				dataIndex:'ProjectName',
				width:160,
				resizable:false,
				editor:false,
				sortable:true		
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				width:160,
				resizable:false,
				editor: false,
				sortable:true
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				text:'Checkpoint',					
				editor:false,
				sortable:true
			},{
				text:'Teams Depended On',
				html:	'<div class="pred-dep-header" style="width:200px !important;">Team Name</div>' +
						'<div class="pred-dep-header" style="width:80px  !important;">Supported</div>' +
						'<div class="pred-dep-header" style="width:80px  !important;">US#</div>' +
						'<div class="pred-dep-header" style="width:140px !important;">User Story</div>',
				dataIndex:'DependencyID',
				width:520,
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
							listeners: {
								load: function(depTeamStore, depTeamRecords){
									predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
									var predecessors = predDepRecord.get('Predecessors').slice(0);				
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
								}
							}
						});	
					}
					if(me.PredDepContainers[depID]) 
						return me.PredDepContainers[depID];
						
					var defaultHandler = { //dont let mouse events bubble up to parent rallygrid. bad things happen
						element: 'el',
						fn: function(a){ a.stopPropagation(); }
					};
					var teamColumnCfgs = [
						{
							dataIndex:'PID',
							width:200,
							resizable:false,
							renderer: function(val, meta, depTeamRecord){
								var projectRecord = _.find(me.ValidProjects, function(projectRecord){
									return projectRecord.get('ObjectID') == val;
								});
								if(val && projectRecord) return projectRecord.get('Name');
								else return '-';
							},
							editor:false
						},{
							dataIndex:'Sup',
							width:80,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
								else meta.tdCls = 'intel-supported-cell';
								return val;
							}
						},{
							dataIndex:'USID',
							width:80,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.get('A')) return val;
								else return '-';
							}
						},{
							dataIndex:'USName',
							width:160,
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
						pack:'start',
						align:'stretch',
						border:false,
						items: [
							{
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
							render: function(){ me.PredDepContainers[depID] = this; }
						}
					};
				}
			},{
				dataIndex:'Status',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				text:'Disposition',					
				editor:{
					xtype:'combobox',
					width:80,
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
				sortable:true
			}
		];

		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
      title: "Dependencies",
			width: _.reduce(predDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:800,
			x:0, y:500,
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
					var predDepRecord = e.record;
					if(!predDepRecord.get('Edited')) me._isEditingDeps++; //if first edit on record
				},
				canceledit: function(editor, e){
					var predDepRecord = e.record;
					if(!predDepRecord.get('Edited')) me._isEditingDeps--; //if first edit on record failed
				},
				edit: function(editor, e){					
					var grid = e.grid,
						predDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;	
					
					if(value === originalValue) { 
						if(!predDepRecord.get('Edited')) me._isEditingDeps--;//if first edit on record failed
						return; 
					} 
					predDepRecord.set('Edited', true);
					
					me.PredDepGrid.setLoading(true);
					me.DependenciesUserStoryStore.load({
						callback: function(userStoryRecords, operation){
							me._buildDependenciesData();
							var predDepData = predDepRecord.data;
							var realPredDeps = me.DependenciesParsedData.Predecessors.slice(0);
							var realDepData = removeDepFromList(predDepData.DependencyID, realPredDeps) || {};
							
							/***************************** UPDATE THE PRED USER STORIES *********************/
							var lastAction = function(){ //last thing to do!												
								predDepRecord.set('Edited', false);	
								me._isEditingDeps--;
								me.PredDepGrid.setLoading(false);
							};
							
							var nextAction = function(){
								var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', predDepData.FormattedID, 0, false, true, true);
								if(newUserStoryRecord) addPredDep(newUserStoryRecord, predDepData, lastAction);
								else lastAction();
							};
																				
							//move to new user story if needed
							if(realDepData && (realDepData.FormattedID != predDepData.FormattedID)){
								console.log('moving predDep to new user story', realDepData.FormattedID, predDepData.FormattedID);
								//we must remove risk from old userStory and add it to new userStory
								var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData.FormattedID, 0, false, true, true);
								if(oldUserStoryRecord) removePredDep(oldUserStoryRecord, realDepData, nextAction);
								else nextAction();
							}
							else nextAction();	
						}
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomPredDepStore
		});	
	}	
});
