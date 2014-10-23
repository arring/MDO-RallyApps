/********************* PRODUCTION *****************/
console = { log: function(){} };
preferenceName = 'intel-commit-matrix';

/********************* END PRODUCTION *****************/

Ext.define('CommitMatrix', {
  extend: 'IntelRallyApp',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'ReleaseQuery',
		'IntelWorkweek',
		'AsyncQueue'
	],
	
	layout: {
		type:'vbox',
		align:'stretch',
		pack:'start'
	},
	items:[{
		xtype:'container',
		itemId:'navbox',
		padding:'0 10px 10px 10px',
		layout: {
			type:'hbox',
			pack:'start'
		},
		items:[{
			xtype:'container',
			flex:3,
			itemId:'navbox_left',
			layout: 'hbox',
			items:[{
				xtype:'container',
				flex:1,
				itemId:'navbox_left_vert',
				layout: 'vbox'
			}]
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
	minWidth:910,
	
	_loadFeatureUserStoriesInRelease: function(fRecord){
		var me = this,
			FName = fRecord.data.Name,
			storyStore = Ext.create('Rally.data.wsapi.Store',{
				model:'HierarchicalRequirement',
				fetch: ['ObjectID', 'Project', 'Name', 'Feature', 'FormattedID', 'PlanEstimate'],
				limit:Infinity,
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters: [
					{
						property:'Release.Name',
						value:me.ReleaseRecord.data.Name
					},{
						property:'Feature.ObjectID',
						value:fRecord.data.ObjectID
					}
				]
			});	
		return me._reloadStore(storyStore)
			.then(function(storyStore){ 
				var storyRecords = storyStore.data.items;
				for(var i=0, len=storyRecords.length; i<len; ++i){
					var sr = storyRecords[i],
						PName = sr.data.Project.Name;		
					if(!me.MatrixUserStoryBreakdown[PName]) 
						me.MatrixUserStoryBreakdown[PName] = {};
					if(!me.MatrixUserStoryBreakdown[PName][FName]) 
						me.MatrixUserStoryBreakdown[PName][FName] = [];
					me.MatrixUserStoryBreakdown[PName][FName].push(sr);						
					me.MatrixProjectMap[PName] = sr.data.Project.ObjectID;
				}
			});
	},	
		
	_loadFeatures: function(){
		var me=this, 
			filterString = me._getFeatureFilterString(me.TrainRecord, me.ReleaseRecord),
			featureStore = Ext.create('Rally.data.wsapi.Store',{
				model: 'PortfolioItem/Feature',
				limit:Infinity,
				remoteSort:false,
				fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'Project', 'PlannedEndDate', 'Parent', 'DragAndDropRank'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{ property:'Dummy', value:'value' }]
			});
		
		featureStore._hydrateModelAndLoad = function(options){
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
		return me._reloadStore(featureStore)
			.then(function(featureStore){ 
				var promises = [], 
					featureRecords = featureStore.data.items;
				me.FeatureStore = featureStore;
				console.log('features loaded:', featureRecords);
				featureRecords.forEach(function(fr){
					var frData = fr.data;
					if(frData.Parent){
						promises.push(me._loadMilestone(frData.Parent.ObjectID).then(function(milestoneRecord){
							var p = milestoneRecord.data.Parent;
							if(p && p.Name) me.FeatureProductHash[frData.ObjectID] = p.Name;
							else me.FeatureProductHash[frData.ObjectID] = '';
						}));
						promises.push(me._loadFeatureUserStoriesInRelease(fr));
					}
					else me.FeatureProductHash[frData.ObjectID] = '';
				});
				return Q.all(promises).fail(function(reason){
					me._alert('ERROR', reason || 'Failed to load Features');
				});
			});
	},	
	
	/****************************************************** PROJECTS ************************************/
		
	_getProjectsInScope:function(){
		var projects = "__PROJECT_OIDS_IN_SCOPE__";
		projects = projects.match(/^\d+/) ? projects.split(',') : [this.context.getProject().ObjectID];
		projectsInScope = {};
		_.each(projects,function(projectID){
			projectsInScope[projectID] = true;
		});
		return projectsInScope;
	},

	_addDefaultProjectsToStructures: function(msub, mpm, feats, projects){
		var me=this;
		_.each(projects, function(p){ 
			if(!msub[p.data.Name]){
				msub[p.data.Name] = {}; 
				_.each(feats, function(f){ 
					msub[p.data.Name][f.data.Name] = [];
					mpm[p.data.Name] = p.data.ObjectID;
				});
			}
		});
	},
			
	_loadDefaultProjects:function(){
		var me=this,
			inScope = me._getProjectsInScope(),
			msub = me.MatrixUserStoryBreakdown,
			feats = me.FeatureStore.data.items,
			mpm = me.MatrixProjectMap,
			projectStore = Ext.create('Rally.data.wsapi.Store', {
				model: "Project",
				fetch: ['Name', 'Parent', 'ObjectID', 'TeamMembers'],
				limit:Infinity,
				context: {
					workspace: this.getContext().getWorkspace()._ref,
					project:null
				}
			});
		return me._reloadStore(projectStore)
			.then(function(projectStore){
				var projects = projectStore.data.items;
				projects = _.filter(projects, function(project){ 
					return inScope[project.data.ObjectID] && project.data.TeamMembers.Count > 0; 
				});
				me._addDefaultProjectsToStructures(msub, mpm, feats, projects); //add some default projects
				console.log('default projects', projects);
			});
	},
		
	/************************************************* TEAM COMMITS *************************************/
	_getTeamCommitFromFeature: function(featureRecord){
		var me=this,
			tcString = featureRecord.data.c_TeamCommits;
		try{ return JSON.parse(atob(tcString)) || {}; }
		catch(e){ return {}; }
	},
	
	_getTeamCommit: function(featureRecord, ProjectName){	
		var me=this,
			projectID = me.MatrixProjectMap[ProjectName],
			featureTC = me._getTeamCommitFromFeature(featureRecord);
		return featureTC[projectID] || {};
	},
	
	_setExpected: function(featureRecord, ProjectName, value){
		var me=this,
			projectID = me.MatrixProjectMap[ProjectName],
			featureTC = me._getTeamCommitFromFeature(featureRecord),
			deferred = Q.defer();	
		if(!featureTC[projectID]) featureTC[projectID] = {};
		featureTC[projectID].Expected = value;		
		var str = btoa(JSON.stringify(featureTC, null, '\t'));
		if(str.length >= 32768) deferred.reject('TeamCommits field for ' + featureRecord.data.FormattedID + ' ran out of space! Cannot save');
		else {
			featureRecord.set('c_TeamCommits', str);
			featureRecord.save({ 
				callback:function(record, operation, success){
					if(!success) deferred.reject('Failed to modify Feature ' + featureRecord.data.FormattedID);
					else deferred.resolve(featureRecord);
				}
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
      filterByName:preferenceName+ uid,
			success: function(prefs) {
				var appPrefs = prefs[preferenceName + uid];
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
    s[preferenceName + uid] = JSON.stringify(prefs); //release: objectID, refresh: (off, 10, 15, 30, 60, 120)
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: this.getAppId(),
			settings: s,
			success: deferred.resolve,
			failure: deferred.reject
		});
		return deferred.promise;
	},
	/************************************************** Event Handler  *********************************************************/

	_getGridHeight: function(){
		var me = this, 
			loc = window.location,
			iframe = Ext.get(window.parent.document.querySelector('iframe[src="' + loc.pathname + loc.search + '"]'));
		return iframe.getHeight() - me.down('#navbox').getHeight();
	},

	_getGridWidth: function(columnCfgs){
		var me = this; 
		if(!me.MatrixGrid) return;
		else return Math.min(
			_.reduce(columnCfgs, function(item, sum){ return sum + item.width; }, 20), 
			window.parent.innerWidth - 20
		);
	},
	
	_changeGridSize: function(){
		var me=this;
		if(!me.MatrixGrid) return;
		else me.MatrixGrid.setSize(me._getGridWidth(me.MatrixGrid.config.columnCfgs), me._getGridHeight());
	},
	
	_initGridResize: function(){
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', me._changeGridSize.bind(me));
		}
	},	

	/******************************************************* Utility FUnctions ******************************************************/

	_clearToolTip: function(){
		var me = this;
		if(me.tooltip){
			me.tooltip.panel.hide();
			me.tooltip.triangle.hide();
			me.tooltip.panel.destroy();
			me.tooltip.triangle.destroy();
			me.tooltip = null;
		}
	},
	
	_setCellColor:function(td, commitment, expected, usCount){
		var currentColors = td.className.match(/intel-team-commits-(.*)$/)[1].split('-'),
			colors = ['WHITE', 'GREY', 'GREEN', 'RED'],
			newColors = [];
		switch(commitment){
			case 'Undecided': newColors[0] = 'WHITE'; break;
			case 'N/A': newColors[0] = 'GREY'; break;
			case 'Committed': newColors[0] = 'GREEN'; break;
			case 'Not Committed': newColors[0] = 'RED'; break;
			default: newColors[0] = 'WHITE'; break;
		}
		if(expected) newColors[1] = 'YELLOW';
		if(newColors[0] != currentColors[0] || newColors[1] != currentColors[1] || td.innerText*1 !== usCount*1){
			td.classList.remove('intel-team-commits-' + currentColors.join('-'));
			td.classList.add('intel-team-commits-' + newColors.join('-'));
			td.childNodes[0].innerText = usCount;
		}
	},
		
	_getDistanceFromBottomOfScreen: function(innerY){
		var me = this, 
			loc = window.location,
			iframe = window.parent.document.querySelector('iframe[src="' + loc.pathname + loc.search + '"]'),
			ph = window.parent.getWindowHeight(), 
			ps = window.parent.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe
			actualY = ofy + innerY;
		return ph - actualY;
	},
	
	/************************************************************ UPDATE *************************************************************/
	
	_showGrids: function(){
		var me=this;
		me._loadMatrixGrid();
	},
	
	_updateGrids: function(){
		var me=this;
		if(me.FeatureStore){
			if(me.CustomMatrixStore) me.CustomMatrixStore.intelUpdate();
		}
	},

	_reloadStores: function(){
		var me = this, promises = [];
		if(me.FeatureStore) promises.push(me._reloadStore(me.FeatureStore));
		else {			
			//have to reset these
			me.MatrixUserStoryBreakdown = {}; // {projectNames: {featureNames: [userStories] }}
			me.MatrixProjectMap = {}; // teamName -> teamOID 
			me.FeatureProductHash = {}; // featureOID -> productName
			promises.push(me._loadFeatures().then(function(){
				return me._loadDefaultProjects();
			}));
		}
		return Q.all(promises);
	},

	_reloadEverything: function(){
		var me=this;

		me._clearToolTip();
		if(me.MatrixGrid) {
			me.MatrixGrid.up().remove(me.MatrixGrid);
			me.MatrixGrid = undefined;
		}
		if(me.ProductPicker) {
			me.ProductPicker.up().remove(me.ProductPicker);
			me.ProductPicker = undefined;
		}
		
		me.UserStoryStore = undefined;
		me.FeatureStore = undefined;
		
		me.CustomMatrixStore = undefined;
		
		me.setLoading(true);
		
		if(!me.ReleasePicker){
			me._loadReleasePicker();
			me._loadModePicker();
			me._loadProductPicker();
			me._loadMatrixLegend();
		}		
		else me._loadProductPicker();
		
		me.setLoading(true);
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
	
	/******************************************************* AUTOREFRESHING ********************************************************/
	
	_refreshDataFunc: function(){ //also performes a window resize after data is loaded
		var me=this;
		me._enqueue(function(unlockFunc){
			me._reloadStores()
				.then(function(){
					me._updateGrids();
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
		me.RefreshInterval = setInterval(function(){ me._refreshDataFunc(); }, 10000);
	},
		
	/******************************************************* LAUNCH ********************************************************/
	
	launch: function(){
		var me = this;
		me.Mode = 'Details';
		me._initDisableResizeHandle();
		me._initFixRallyDashboard();
		me._initGridResize();
		me.setLoading(true);
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
						return me._loadProducts(trainRecord);
					} 
					else return Q.reject('You are not scoped to a train.');
				})
				.then(function(productStore){
					me.ProductNames = _.map(productStore.data.items, function(product){ return {ProductName: product.data.Name}; });
					me.ProductNames = [{ProductName: 'All Products'}].concat(me.ProductNames);
					return me._loadReleasesInTheFuture(me.TrainRecord);
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
	
	/******************************************************* RENDER NAVBAR ********************************************************/
		
	_releasePickerSelected: function(combo, records){
		var me=this;
		if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
		me.setLoading(true);
		me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);		
		me._workweekData = me._getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);	
		var pid = me.ProjectRecord.data.ObjectID;		
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
		me.ReleasePicker = me.down('#navbox_left_vert').add({
			xtype:'intelreleasepicker',
			labelWidth: 80,
			width: 200,
			releases: me.ReleaseStore.data.items,
			currentRelease: me.ReleaseRecord,
			listeners: {
				select: me._releasePickerSelected.bind(me)
			}
		});
	},

	_modePickerSelected: function(combo, records){
		var me=this, value = records[0].data.Mode;
		if(value === me.Mode) return;
		else me.Mode = value;
		me._clearToolTip();
	},
				
	_loadModePicker: function(){
		var me=this;
		me.ModePicker = me.down('#navbox_left_vert').add({
			xtype:'intelfixedcombo',
			fieldLabel:'Click Mode',
			labelWidth: 80,
			width: 200,
			store: Ext.create('Ext.data.Store', {
				fields:['Mode'],
				data: [
					{'Mode':'Flag'},
					{'Mode':'Details'}
				]
			}),
			displayField: 'Mode',
			value:me.Mode,
			listeners: {
				select: me._modePickerSelected.bind(me)
			}
		});
	},
	
	_productPickerSelected: function(combo, records){
		var me=this,
			value = records[0].data.ProductName;
		me.CustomMatrixStore.clearFilter();
		if(value !== 'All Products'){
			me.CustomMatrixStore.addFilter(new Ext.util.Filter({
				filterFn: function(matrixRecord){
					return matrixRecord.data.ProductName === value;
				}
			}));
		}
		me._clearToolTip();
	},
				
	_loadProductPicker: function(){
		var me=this;
		me.ProductPicker = me.down('#navbox_left_vert').add({
			xtype:'intelfixedcombo',
			fieldLabel:'Product Filter',
			labelWidth: 80,
			width: 200,
			store: Ext.create('Ext.data.Store', {
				fields:['ProductName'],
				data: me.ProductNames
			}),
			displayField: 'ProductName',
			value:'All Products',
			listeners: {
				select: me._productPickerSelected.bind(me)
			}
		});
	},
		
	_loadMatrixLegend: function(){
		var me=this;
		me.MatrixLegend = me.down('#navbox_right').add({
			xtype:'container',
			width:120,	
			layout: {
				type:'vbox',
				align:'stretch',
				pack:'start'
			},
			border:true,
			frame:false,
			items: _.map(['Committed', 'Not Committed', 'N/A', 'Undefined', 'Expected'], function(name){
				var color;
				if(name === 'Undecided') color='white';
				if(name === 'N/A') color='rgba(224, 224, 224, 0.50)'; //grey
				if(name === 'Committed') color='rgba(0, 255, 0, 0.50)';//grenn
				if(name === 'Not Committed') color='rgba(255, 0, 0, 0.50)';//red
				if(name === 'Expected') color='rgba(251, 255, 0, 0.50)'; //yellow
				return {
					xtype: 'container',
					width:120,
					border:false,
					frame:false,
					html:'<div class="intel-legend-item">' + name + 
						': <div style="background-color:' + color + '" class="intel-legend-dot"></div></div>'
				};
			})
		});
	},

	/************************************************************* RENDER ********************************************************************/

	_loadMatrixGrid: function(){
		var me = this,
			sortedFeatures = _.sortBy(me.FeatureStore.data.items, function(f){ return f.data.DragAndDropRank; }),
			customMatrixRecords = _.map(sortedFeatures, function(featureRecord, index){
				return {
					Rank: index+1,
					FormattedID: featureRecord.data.FormattedID,
					ObjectID: featureRecord.data.ObjectID,
					FeatureName: featureRecord.data.Name,
					ProductName: me.FeatureProductHash[featureRecord.data.ObjectID],
					PlannedEndDate: featureRecord.data.PlannedEndDate*1
				};
			});		
		me.CustomMatrixStore = Ext.create('Intel.data.FastStore', {
			data: customMatrixRecords,
			model: 'CommitsMatrixFeature',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'fastsessionproxy',
				id: 'Session-proxy-' + Math.random()
			},
			intelUpdate: function(){			
				var store = me.CustomMatrixStore,
					records = store.data.items,
					projectNames = Object.keys(me.MatrixUserStoryBreakdown).sort(),
					pnamesLength = projectNames.length;
				for(var i=0, len=records.length; i<len; ++i){
					var matrixRecord = records[i],
						featureRecord = me.FeatureStore.findExactRecord('ObjectID', matrixRecord.data.ObjectID),
						tr = me.MatrixGrid.view.getNode(i); //view is the scrollView, not lockedView
					for(var j=0;j<pnamesLength; ++j){
						var projectName = projectNames[j],
							usCount = (me.MatrixUserStoryBreakdown[projectName][featureRecord.data.Name] || []).length,
							td = tr.childNodes[j], //ignore fixed columns on left
							tcae = me._getTeamCommit(featureRecord, projectName),
							expected = tcae.Expected || false,
							commitment = tcae.Commitment || 'Undecided'; 
						me._setCellColor(td, commitment, expected, usCount);
					}
				}
			}
		});

		var defColumnCfgs = [
			{
				text:'Rank', 
				dataIndex:'Rank',
				width:50,
				maxHeight:80,
				editor:false,
				sortable:true,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true
			},{
				text:'F#', 
				dataIndex:'FormattedID',
				width:50,
				maxHeight:80,
				editor:false,
				sortable:true,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				renderer:function(FID){
					var feature = me.FeatureStore.findExactRecord('FormattedID', FID);
					if(feature.data.Project) {
						var pid = feature.data.Project._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/portfolioitem/feature/' + 
								feature.data.ObjectID + '" target="_blank">' + FID + '</a>';
					}
					else return name;
				}
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				width:200,
				maxHeight:80,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true,
				renderer: function(value, metaData) {
					metaData.tdAttr = 'title="' + value + '"';
					return value;
				}
			},{
				text:'Product', 
				dataIndex:'ProductName',
				width:60,
				maxHeight:80,
				editor:false,
				sortable:true,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true
			},{
				text:'Planned End',
				dataIndex:'PlannedEndDate',
				width:60,
				maxHeight:80,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-'); }
			}
		];
	
		var columnCfgs = defColumnCfgs.slice();
		Object.keys(me.MatrixUserStoryBreakdown).sort().forEach(function(ProjectName){
			columnCfgs.push({
				text: ProjectName,
				dataIndex:'ObjectID',
				width:50,
				maxHeight:80,
				editor:'textfield',
				draggable:false,
				menuDisabled:true,
				align:'center',
				tdCls: 'intel-editor-cell',
				sortable:false,
				resizable:false,
				tooltip:ProjectName,
				tooltipType:'title',
				renderer: function(oid, metaData, matrixRecord, row, col){
					var featureRecord = me.FeatureStore.findExactRecord('ObjectID', matrixRecord.data.ObjectID);
					if(!featureRecord) return;
					var array = me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || [],
						count = array.length,
						tcae = me._getTeamCommit(featureRecord, ProjectName),
						expected = tcae.Expected || false,
						commitment = tcae.Commitment || 'Undecided'; 
					if(commitment === 'Undecided') metaData.tdCls += ' intel-team-commits-WHITE';
					else if(commitment === 'N/A') metaData.tdCls += ' intel-team-commits-GREY';
					else if(commitment === 'Committed') metaData.tdCls += ' intel-team-commits-GREEN';
					else if(commitment === 'Not Committed') metaData.tdCls += ' intel-team-commits-RED';
					if(expected) metaData.tdCls += '-YELLOW';
					return count;
				}
			});
		});
		
		me.MatrixGrid = me.add({
			xtype: 'grid',
			width: me._getGridWidth(columnCfgs),
			height: me._getGridHeight(),
			scroll:'both',
			resizable:false,
			columns: columnCfgs,
			disableSelection: true,
			plugins: [ 'fastcellediting' ],
			viewConfig: {
				xtype:'scrolltableview',
				preserveScrollOnRefresh:true
			},
			listeners: {
				sortchange: function(){ 
					me._clearToolTip(); 
				},
				beforeedit: function(editor, e){
					var projectName = e.column.text,
						matrixRecord = e.record;
						
					if(me.Mode === 'Flag'){
						me.MatrixGrid.setLoading(true);
						me._enqueue(function(unlockFunc){
							me._loadFeature(matrixRecord.data.ObjectID)
								.then(function(featureRecord){
									var tcae = me._getTeamCommit(featureRecord, projectName);
									return me._setExpected(featureRecord, projectName, !tcae.Expected);
								})
								.then(function(featureRecord){
									me.MatrixGrid.setLoading(false);
									var storeRecord = me.FeatureStore.findExactRecord('ObjectID', matrixRecord.data.ObjectID);
									storeRecord.data.c_TeamCommits = featureRecord.data.c_TeamCommits;
									me.MatrixGrid.view.refreshNode(me.CustomMatrixStore.indexOf(matrixRecord));
									unlockFunc();
								})
								.fail(function(reason){
									me.MatrixGrid.setLoading(false);
									me._alert('ERROR', reason || '');
									unlockFunc();
								})
								.done();
						});
					}
					return false;
				}, 
				afterrender: function (grid) {
					var view = grid.view.normalView;	//lockedView and normalView		
					
					view.getEl().on('scroll', function(){ me._clearToolTip(); });
					
					grid.mon(view, {
						uievent: function (type, view, cell, row, col, e) {
							if(me.Mode === 'Details' && type === 'mousedown') {
								var matrixRecord = me.CustomMatrixStore.getAt(row),
									ProjectName = view.getGridColumns()[col].text,
									featureRecord = me.FeatureStore.findRecord('ObjectID', matrixRecord.data.ObjectID),
									tcae = me._getTeamCommit(featureRecord, ProjectName),
									pos = cell.getBoundingClientRect(),
									t = me.tooltip;
								if(t){
									me._clearToolTip();
									if(t.row == row && t.col == col) return;
								}
								
								var panelWidth = 400;
								var theHTML = 
									'<p><b>' + (tcae.Commitment == 'Committed' ? 'Objective: ' : 'Comment: ') + '</b>' + (tcae.Objective || '') +
									'<p><b>PlanEstimate: </b>' + 
									_.reduce(me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || [], function(sum, sr){
										return sum + (sr.data.PlanEstimate || 0); }, 0) +
									'<p><b>UserStories: </b><div style="max-height:200px;overflow-y:auto;"><ol>';
								(me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || []).forEach(function(sr){
									theHTML += '<li><a href="https://rally1.rallydev.com/#/' + sr.data.Project.ObjectID + 
										'd/detail/userstory/' + sr.data.ObjectID + '" target="_blank">' + sr.data.FormattedID + '</a>:' +
										'<span title="' + sr.data.Name + '">' + 
										sr.data.Name.substring(0, 40) + (sr.data.Name.length > 40 ? '...' : '') + '</span></li>';
								});
								theHTML += '</ol></div>';
								
								var dbs = me._getDistanceFromBottomOfScreen(pos.top);
								
								me.tooltip = {
									row:row,
									col:col,
									panel: Ext.widget('container', {
										floating:true,
										width: panelWidth,
										autoScroll:false,
										id:'MatrixTooltipPanel',
										cls: 'intel-tooltip',
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										html:theHTML,
										listeners:{
											afterrender: function(panel){
												var upsideDown = (dbs < panel.getHeight() + 80);
												panel.setPosition(pos.left-panelWidth, (upsideDown ? pos.bottom - panel.getHeight() : pos.top));
											}
										}
									}),
									triangle: Ext.widget('container', {
										floating:true,
										width:0, height:0,
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										listeners:{
											afterrender: function(panel){
												setTimeout(function(){
													var upsideDown = (dbs < Ext.get('MatrixTooltipPanel').getHeight() + 80);
													if(upsideDown) {
														panel.removeCls('intel-tooltip-triangle');
														panel.addCls('intel-tooltip-triangle-up');
														panel.setPosition(pos.left -10, pos.bottom -10);
													} else {
														panel.removeCls('intel-tooltip-triangle-up');
														panel.addCls('intel-tooltip-triangle');
														panel.setPosition(pos.left -10, pos.top);
													}
												}, 10);
											}
										}
									})	
								};
							}
						}
					});
				}
			},
			enableEditing:false,
			store: me.CustomMatrixStore
		});	
	}
});