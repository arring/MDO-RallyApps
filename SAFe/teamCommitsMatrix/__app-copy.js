Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
		
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE METHODS ********************************************************/

	_loadModels: function(cb){
		var me = this;
		Rally.data.ModelFactory.getModel({ //load project
			type:'Project',
			success: function(model){ 
				me.Project = model; 
				Rally.data.ModelFactory.getModel({ //load project
					type:'HierarchicalRequirement',
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
			fetch: ['ObjectID', 'Children', 'Parent', 'Name', '_ref'],
			filters: [
				{
					property:'State',
					value:'Open'
				}
			],
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
	
	_loadReleaseStore: function(cb){
		var me = this;
		var releaseName = me.releaseRecord.get('Name');
		Ext.create('Rally.data.wsapi.Store', {
			model:'Release',
			autoLoad:true,		
			fetch: ['ObjectID', 'Project', 'Name', '_ref'],
			filters: [
				{
					property: 'Name',
					value: releaseName
				}
			],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			limit:Infinity,
			listeners:{
				load: function(store, records){
					me.Releases = records;
					console.log('Releases loaded: ', me.Releases);
					cb();
				}
			}
		});
	},
	
	_loadUserStories: function(cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model:'HierarchicalRequirement',
			fetch: ['ObjectID', 'Feature', 'Project', 'Name', '_ref'],
			limit:Infinity,
			autoLoad:true,
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters: [
				{
					property:'Release.Name',
					value:me.releaseRecord.get('Name')
				},{
					property:'Feature',
					operator:'!=',
					value:null
				}
			],
			listeners: {
				load: function(storyStore, storyRecords){
					console.log('Stories loaded:', storyRecords);
					me.StoryStore = storyStore;
					cb();
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
			wsapiVersion: "v2.0",
			fetch: ['Name', 'ObjectID', 'FormattedID', 'UserStories', 'c_TeamCommits'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.releaseRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(featureStore, featureRecords){
						console.log('features loaded:', featureRecords);
						me.FeatureStore = featureStore;
						cb();
					},
					single:true
				}
			}
		});
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
	
	_loadScrumRecords: function(cb){
		var me = this;
		var scrums = [];
		var finished = 0;
		var trainName = me.trainRecord.get('Name').split(' ART ')[0];
		me.Releases.forEach(function(releaseRecord){
			me._loadProject(releaseRecord.get('Project'), function(projectRecord){
				if(projectRecord && 
						projectRecord.get('Children').Count === 0 && 
						projectRecord.get('Name').indexOf(trainName) != -1) // make sure its a scrum
					scrums.push(projectRecord);
				if(++finished == me.Releases.length){
					me.ScrumRecords = scrums;
					console.log('scrums loaded:', scrums);
					cb(scrums);
				}
			});
		});
	},
	
	
	/******************************************************* LAUNCH ********************************************************/
    _timeboxScopeValid: function(timeboxScope){ // called when we are in a valid timebox scope
		var me = this;
		me.removeAll();
		me._showError('Loading Data ...');
		me.releaseRecord = timeboxScope.record;
		console.log('Release name: ', me.releaseRecord.get('Name'));
		
		//step 1
		var finished = 0;
		var done = function(){ if(++finished == 2) loadStoresAndRecords();  };
		me._loadReleaseStore(function(){done();	});
		me._loadModels(function(){
			me._loadProject(me.scopeProject, function(scopeProjectRecord){
				me._projectInWhichTrain(scopeProjectRecord, function(trainRecord){
					if(trainRecord){
						me.trainRecord = trainRecord; 
						console.log('train loaded:', trainRecord);
						done(); 
					}
					else {
						me.removeAll();
						me._showError('Project "' + me.scopeProject.Name + '" not a train or sub-project of train');
					}
				});
			});
		});
		//step 2
		function loadStoresAndRecords(){
			var finished = 0;
			var done = function(){ if(++finished == 3) me._loadGrid();  };
			me._loadUserStories(	function(){ done(); });						
			me._loadScrumRecords(	function(){ done(); });
			me._loadFeatures(		function(){ done(); });  
		} 
	},
	
    launch: function(){
		var me = this;
		var scopeProject = me.getContext().getProject();
		if(!scopeProject) {
			me._showError('not a valid project');
			return;
		}
		me.scopeProject = scopeProject;
		var timeboxScope = me.getContext().getTimeboxScope();
		if(timeboxScope && timeboxScope.record && timeboxScope.type == 'release') {
			// setInterval(function(){  
				// if(me.FeatureStore) 
					// me.FeatureStore.reload(); 
			// }, 120000);
			me._timeboxScopeValid(timeboxScope);
		}
		else me._showError('please scope page to a valid release');
	},
	
	onTimeboxScopeChange: function(timeboxScope){
		var me = this;
		if(timeboxScope && timeboxScope.record && timeboxScope.type == 'release') 
			me._timeboxScopeValid(timeboxScope);
		else me._showError('please scope page to a valid release');
	},
	
	/******************************************************* RENDER ********************************************************/
	_loadGrid: function(){
		var me = this;
		if(me.errMessage) {
			me.remove(me.errMessage);
			delete me.errMessage; 
		}
		if(me.FeatureGrid) {
			me.remove(me.FeatureGrid);	
			delete me.FeatureGrid;
		}	
		me.FeatureStore.filterBy(function(record){
			return record.get('UserStories').Count > 0;
		});			
	
		function getTeamCommit(featureRecord, projectRecord){	
			var tcs = featureRecord.get('TeamCommits');
			var projectID = projectRecord.get('ObjectID');
			var this_tc;
			try{ this_tc = (tcs==='' ? null : JSON.parse(tcs)[projectID]); } 
			catch(e){ console.log(e, tc); }
			return this_tc || 'Not Committed';
		}

		var defColumnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				width:50,
				editor:false,
				sortable:true
			},{
				text:'Feature', 
				dataIndex:'Name',
				width:250,
				editor:false,
				sortable:true
			}
		];
		var columnCfgs = [].concat(defColumnCfgs);
		me.ScrumRecords.forEach(function(scrumRecord){
			columnCfgs.push({
				text: scrumRecord.get('Name'),
				dataIndex:'ObjectID',
				width:50,
				editor:false,
				sortable:false,
				renderer: function(oid, metaData, feature, row, col){
					var offset = defColumnCfgs.length;
					var scrum = me.ScrumRecords[col-offset];				
					var count = me.StoryStore.queryBy(function(us){ 
						return us.get('Feature').ObjectID == oid && us.get('Project').ObjectID == scrum.get('ObjectID'); 
					}).getCount();
					if(count === 0){
						metaData.tdCls += ' intel-feature-not-applicable';
						return '-';
					}
					var res = getTeamCommit(feature, scrum);
					if(res=='Committed')	metaData.tdCls += ' intel-feature-committed';
					else					metaData.tdCls += ' intel-feature-not-committed';
					
					return count;
				}
			});
		});
		
		me.FeatureGrid = me.add({
			xtype: 'rallygrid',
			height:800,
			width: _.reduce(columnCfgs, function(item, sum){ return sum + item.width; }, 100),
			scroll:'both',
			resizable:false,
			columnCfgs: columnCfgs,
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: me.getContext(),
			store: me.FeatureStore
		});	
	}
});