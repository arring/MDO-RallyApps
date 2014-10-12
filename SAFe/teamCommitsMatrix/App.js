/********************* PRODUCTION *****************/
//console = { log: function(){} };
	
/********************* END PRODUCTION *****************/

Ext.define('CommitMatrix', {
  extend: 'Rally.app.App',
	mixins:[
		'ReleaseQuery',
		'IntelWorkweek'
	],
	layout:'absolute',
	autoScroll:false,
		
	/****************************************************** SHOW ERROR/TEXT MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE/MODEL METHODS ********************************************************/

	_loadModels: function(cb){
		var me = this;
		Rally.data.ModelFactory.getModel({ //load project
			type:'Project',
			success: function(model){ 
				me.Project = model; 
				Rally.data.ModelFactory.getModel({ //load project
					type:'PortfolioItem/Milestone',
					success: function(model){ 
						me.Milestone = model; 
						cb(); 
					}
				});
			}
		});
	},
	
	_loadProject: function(project, cb){ 
		var me = this;
		me.Project.load(project.ObjectID, {
			fetch: ['ObjectID', 'Children', 'Parent', 'Name'],
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
	
	_loadMatrixFeatures: function(cb){ 
		var me = this;
		me.MatrixProductHash = {};
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			fetch: ['Name', 'ObjectID', 'Project', 'Parent', 'FormattedID', 
				'UserStories', 'c_TeamCommits', 'DragAndDropRank', 'PlannedEndDate'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.ReleaseRecord.data.Name
				}
			],
			listeners: {
				load: {
					fn: function(featureStore, featureRecords){
						console.log('features loaded:', featureRecords);
						me.MatrixFeatureStore = featureStore;
						var finished = -1;
						var done = function(){ if(++finished == featureRecords.length) { cb(); } };
						done();
						featureRecords.forEach(function(fr){
							var frData = fr.data;
							if(frData.Parent){
								me._loadMilestone(frData.Parent, function(milestoneRecord){
									var p = milestoneRecord.data.Parent;
									me.MatrixProductHash[frData.ObjectID] = ((p && p.Name ) ? p.Name : '');
									done();
								});
							}
							else {
								me.MatrixProductHash[frData.ObjectID] = '';
								done();
							}
							
						});
					},
					single:true
				}
			}
		});
	},
	
	_loadMatrixUserStoryBreakdown: function(cb){
		var me = this;
		me.MatrixUserStoryBreakdown = {};
		me.MatrixProjectMap = {};
		var fRecords = me.MatrixFeatureStore.getRecords();
		var finished = -1;
		var done = function(){ 
			if(++finished == fRecords.length){ 
				console.log('Stories loaded:', me.MatrixUserStoryBreakdown);
				cb(); 
			}
		};
		done();
		fRecords.forEach(function(fRecord){
			Ext.create('Rally.data.wsapi.Store',{
				model:'HierarchicalRequirement',
				fetch: ['ObjectID', 'Project', 'Name', 'Feature', 'FormattedID', 'PlanEstimate'],
				limit:Infinity,
				autoLoad:true,
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
				],
				listeners: {
					load: {
						fn: function(storyStore, storyRecords){
							storyRecords.forEach(function(sr){
								var PName = sr.data.Project.Name;
								var FName = fRecord.data.Name;
								if(!me.MatrixUserStoryBreakdown[PName]) 
									me.MatrixUserStoryBreakdown[PName] = {};
								if(!me.MatrixUserStoryBreakdown[PName][FName]) 
									me.MatrixUserStoryBreakdown[PName][FName] = [];
								me.MatrixUserStoryBreakdown[PName][FName].push(sr);	
								me.MatrixProjectMap[PName] = sr.data.Project.ObjectID;					
							});
							done();
						},
						single:true
					}
				}
			});
		});
	},	
	
	/****************************************************** PROJECTS ************************************/
		
	_getProjectsInScope:function(){
		var projects = "__PROJECT_OIDS_IN_SCOPE__";
		projects = projects.match(/^\d+/)? projects.split(','): [this.context.getProject().ObjectID];
		projectsInScope = {};
		_.each(projects,function(projectID){
			projectsInScope[projectID] = true;
		});
		return projectsInScope;
	},
	
	_addDefaultProjects:function(cb){
		var processedProjects = {}, me=this,
			cached = me._cachedDefaults,
			inScope = me._getProjectsInScope(),
			msub = me.MatrixUserStoryBreakdown,
			feats = me.MatrixFeatureStore.getRange(),
			mpm = me.MatrixProjectMap,
			curProjRef = '/project/' + me.getContext().getProject().ObjectID;

		function addDefaults(projects){
			_.each(projects, function(p){ 
				if(!msub[p.data.Name]){
					msub[p.data.Name] = {}; 
					_.each(feats, function(f){ 
						msub[p.data.Name][f.data.Name] = [];
						mpm[p.data.Name] = p.data.ObjectID;
					});
				}
			});
		}
		if(cached) { addDefaults(cached); if(cb) cb(); }
		
		Ext.create('Rally.data.wsapi.Store', {
			model: "Project",
			fetch: ['Name', 'Parent', 'ObjectID', 'TeamMembers'],
			limit:Infinity,
			context: {
				workspace: '/workspace/' + this.getContext().getWorkspace().ObjectID,
				project:null
			}
		})
		.load({
			callback: function(projects){
				//filter here
				projects = _.filter(projects, function(project){ 
					return inScope[project.data.ObjectID] && project.data.TeamMembers.Count > 0; 
				});
				addDefaults(projects); //add some default projects
				me._cachedDefaults = projects;
				console.log('default projects', projects);
				if(cb) cb();
			}
		});
	},
		
	/*************************************************** DEFINE MODELS ******************************************************/
	_defineModels: function(){								
		Ext.define('IntelFeature', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'Rank', type:'string'},
				{name: 'FormattedID', type:'string'},
				{name: 'ObjectID', type:'string'},
				{name: 'FeatureName',  type: 'string'},
				{name: 'ProductName', type:'string'},
				{name: 'PlannedEndDate', type:'string'}
			]
		});
	},
	
	/*************************************************** Reload Stores ******************************************************/
	_isReloadRefresh: false,
	
	_reloadMatrixStores: function(){
		var me = this;
		me._loadMatrixFeatures(function(){
			me.featureTCAECache = {};
			if(me.CustomMatrixStore){
				var scroll = me.MatrixGrid.view.getEl().getScrollTop();
				me._isReloadRefresh = true;
				me.CustomMatrixStore.load({ //we use load here because the logic is handled in the renderers
					callback: function(){
						me.MatrixGrid.view.getEl().setScrollTop(scroll);
						setTimeout(function(){ me._isReloadRefresh = false; }, 10);
					}
				});
			}
		});
	},
	
	/*************************************************** RANDOM HELPERS ******************************************************/	
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		var me = this;
		if(!projectRecord) cb();
		var split = projectRecord.data.Name.split(' ART');
		if(split.length>1) cb(projectRecord);
		else { 
			var parent = projectRecord.data.Parent;
			if(!parent) cb();
			else {
				me._loadProject(parent, function(parentRecord){
					me._projectInWhichTrain(parentRecord, cb);
				});
			}
		}
	},

	
	/************************************************** Event Handler/ window size/scroll config *********************************************/
	
	_alert: function(title, str){
		var me = this;
		Ext.MessageBox.alert(title, str).setY(me._msgBoxY);
		setTimeout(function(){ 
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 10);
	},
	
	_getIframe: function(){
		var w = window, p = w.parent, pd = w.parent.document, l = w.location;
		return pd.querySelector('iframe[src="' + l.pathname + l.search + '"]');
	},
	
	_applyMessageBoxConfig: function(){
		var me = this, w = window, p = w.parent, iframe = me._getIframe(),
			ph = p.getWindowHeight(), 
			ps = p.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe
			iyOffset = Math.floor(ph/2 - ofy + ps - 50);		
		me._msgBoxY = iyOffset<0 ? 0 : iyOffset;
	},
	
	_changeGridHeight: function(){
		var me = this, w = window, p = w.parent, iframe = me._getIframe(),
			ph = p.getWindowHeight(), 
			ps = p.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe
			height = Math.max(ph - ofy - 150, 200); //height of the app yo		
		me._gridHeight = height;
		if(me.MatrixGrid) me.MatrixGrid.setHeight(height);
	},
	
	_getDistanceFromBottomOfScreen: function(innerY){
		var me = this, w = window, p = w.parent, iframe = me._getIframe(),
			ph = p.getWindowHeight(), 
			ps = p.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe
			actualY = ofy + innerY;
		return ph - actualY;
	},
	
	_changeGridWidth: function(){
		var me = this, mg = me.MatrixGrid;
		if(mg) mg.setWidth(Math.min(
			_.reduce(mg.config.columnCfgs, function(item, sum){ return sum + item.width; }, 20), 
			me.getWidth()-40
		));
	},
	
	_applyEventListeners: function(){
		var me=this, p = window.parent;
		
		function screenChanged(){
			me._applyMessageBoxConfig();
			me._changeGridHeight();
			me._changeGridWidth();
		}
		screenChanged();
		p.onresize = screenChanged;
		p.onscroll = screenChanged;
	},
	
	/******************************************************* LAUNCH/UPDATE APP********************************************************/
	_loadAllData: function(cb){
		var me = this;
		me._loadMatrixFeatures(function(){	
			me._loadMatrixUserStoryBreakdown(function(){
				me._addDefaultProjects(function(){ if(cb) cb(); });
			});
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
		Ext.tip.QuickTipManager.init();
		Ext.apply(Ext.tip.QuickTipManager.getQuickTip(), {showDelay: 1000 });
		me._defineModels();
		me._applyEventListeners();
		setInterval(function(){ me._reloadMatrixStores();}, 10000); 
		me._loadModels(function(){
			var scopeProject = me.getContext().getProject();
			me._loadProject(scopeProject, function(scopeProjectRecord){
				me._projectInWhichTrain(scopeProjectRecord, function(trainRecord){
					if(trainRecord){
						me.TrainRecord = trainRecord; 
						console.log('train loaded:', trainRecord);
						me._loadReleasesInTheFuture(me.TrainRecord).then(function(releaseStore){
							me.ReleaseStore = releaseStore;
							var currentRelease = me._getScopedRelease(me.ReleaseStore.getRange(), me.TrainRecord.data.ObjectID, me.AppPrefs);
							if(currentRelease){
								me.ReleaseRecord = currentRelease;
								console.log('release loaded', currentRelease);
								me._loadAllData(function(){
									me.removeAll();
									me._loadMatrixGrid();
								});
							} else {
								me.removeAll();
								me._showError('This ART has no releases');
							}
						});
					} else{
						me.removeAll();
						me._showError('Please scope to an ART');
					}
				});
			});
		});
	},
	
	/******************************************************* RENDER ********************************************************/
	_clearToolTip: function(){
		var me = this;
		if(me.tooltip){
			me.tooltip.panel.hide();
			me.tooltip.triangle.hide();
			me.tooltip.panel.destroy();
			me.tooltip.triangle.destroy();
			delete me.tooltip;
		}
	},
	
	_loadMatrixGrid: function(){
		var me = this, mode='Details'; //Flag and Details
		
		me.featureTCAECache = {};
		
		function getTeamCommit(featureRecord, ProjectName){	
			var tcs = featureRecord.data.c_TeamCommits;
			var featureID = featureRecord.data.ObjectID;
			var projectID = me.MatrixProjectMap[ProjectName];
			var this_tc;
			try{ 
				var parsed_tcs;
				if(me.featureTCAECache[featureID]) 
					parsed_tcs = me.featureTCAECache[featureID];
				else {
					parsed_tcs = JSON.parse(atob(tcs)) || {};
					me.featureTCAECache[featureID] = parsed_tcs;
				}
				this_tc = parsed_tcs[projectID] || {}; 
			} 
			catch(e){ me.featureTCAECache[featureID] = this_tc = {}; }
			return this_tc;
		}
		
		function setExpected(featureRecord, ProjectName, value){
			var tcs = featureRecord.get('c_TeamCommits');
			var featureID = featureRecord.data.ObjectID;
			var projectID = me.MatrixProjectMap[ProjectName];
			try{ 
				if(me.featureTCAECache[featureID]) 
					tcs = me.featureTCAECache[featureID];
				else {
					tcs = JSON.parse(atob(tcs)) || {};
					me.featureTCAECache[featureID] = tcs;
				}
			} 
			catch(e){ me.featureTCAECache[featureID] = tcs = {}; }
			if(!tcs[projectID]) 
				tcs[projectID] = {};
			tcs[projectID].Expected = value;		
			var str = btoa(JSON.stringify(tcs, null, '\t'));
			if(str.length >= 32768){
				me._alert('ERROR', 'TeamCommits field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			featureRecord.set('c_TeamCommits', str);
			featureRecord.save();
		}

		var customMatrixRecords = _.map(me.MatrixFeatureStore.getRecords(), function(featureRecord){
			var ed = featureRecord.get('PlannedEndDate');
			return {
				Rank: featureRecord.get('DragAndDropRank'),
				FormattedID: featureRecord.get('FormattedID'),
				ObjectID: featureRecord.get('ObjectID'),
				FeatureName: featureRecord.get('Name'),
				ProductName: me.MatrixProductHash[featureRecord.get('ObjectID')],
				PlannedEndDate: (ed ? 'WW' + me._getWorkweek(new Date(ed)) : '-')
			};
		});		

		me.CustomMatrixStore = Ext.create('Ext.data.Store', {
			data: customMatrixRecords,
			model: 'IntelFeature',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id: 'Session-proxy-' + Math.random()
			}
		});

		var defColumnCfgs = [
			{
				text:'Rank', 
				dataIndex:'Rank',
				width:50,
				editor:false,
				sortable:true,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				renderer: function(oid, meta, f1){
					var rank = 1;
					var f1OID = f1.data.ObjectID;
					f1 = me.MatrixFeatureStore.findRecord('ObjectID', f1OID);
					var f1DADR = f1.data.DragAndDropRank;
					me.MatrixFeatureStore.getRecords().forEach(function(f2){
						if((f2.get('ObjectID') != f1OID) && (f1DADR > f2.get('DragAndDropRank')))
							++rank;
					});
					return rank;
				}
			},{
				text:'F#', 
				dataIndex:'FormattedID',
				width:50,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				sortable:true,
				locked:true,
				renderer:function(FID){
					var feature = me.MatrixFeatureStore.findRecord('FormattedID', FID);
					if(feature.get('Project')) {
						var pid = feature.get('Project')._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/portfolioitem/feature/' + 
								feature.get('ObjectID') + '" target="_blank">' + FID + '</a>';
					}
					else return name;
				}
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				width:250,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true,
				renderer: function(value, metaData) {
					metaData.tdAttr = 'data-qtip="' + value + '"';
					return value;
				}
			},{
				text:'Product', 
				dataIndex:'ProductName',
				width:60,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true
			},{
				text:'Planned End',
				dataIndex:'PlannedEndDate',
				width:60,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true
			}
		];
		var columnCfgs = [].concat(defColumnCfgs);
		Object.keys(me.MatrixUserStoryBreakdown).sort().forEach(function(ProjectName){
			columnCfgs.push({
				text: ProjectName,
				dataIndex:'ObjectID',
				width:50,
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
					var featureRecord = me.MatrixFeatureStore.findRecord('ObjectID', matrixRecord.get('ObjectID'));
					var array = me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || [];
					var count = array.length;
					var tcae = getTeamCommit(featureRecord, ProjectName);
					var Expected = tcae.Expected || false;
					var Commitment = tcae.Commitment || 'Undecided'; 
					if(Commitment === 'Undecided') metaData.tdCls += ' intel-team-commits-WHITE';
					if(Commitment === 'N/A') metaData.tdCls += ' intel-team-commits-GREY';
					if(Commitment === 'Committed') metaData.tdCls += ' intel-team-commits-GREEN';
					if(Commitment === 'Not Committed') metaData.tdCls += ' intel-team-commits-RED';
					if(Expected) metaData.tdCls += '-YELLOW';
					return count;
				}
			});
		});
		
		me.MatrixReleasePicker = me.add({
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
					me._clearToolTip();
					me.setLoading(true);					
					setTimeout(function(){
						me._loadAllData(function(){
							me.removeAll();
							me._loadMatrixGrid();
							me.setLoading(false);		
						});
					}, 0);
				}
			}
		});
		
		me.MatrixProductPicker = me.add({
			xtype:'combobox',
			x:0, y:30,
			fieldLabel:'Product Filter',
			store: Ext.create('Ext.data.Store', {
				fields:['ProductName'],
				data: _.map(_.reduce(Object.keys(me.MatrixProductHash), function(items, ObjectID){
					var projectName = me.MatrixProductHash[ObjectID];
					if(items.indexOf(projectName) == -1) items.push(projectName);
					return items;
				}, ['All Products']), function(name){ return {ProductName: name}; })
			}),
			displayField: 'ProductName',
			editable:false,
			value:'All Products',
			listeners: {
				select: function(combo, records){
					var value = records[0].get('ProductName');
					me.CustomMatrixStore.filters.getRange().forEach(function(filter){
						me.CustomMatrixStore.removeFilter(filter);
					});
					if(value !== 'All Products'){
						me.CustomMatrixStore.addFilter(new Ext.util.Filter({
							filterFn: function(matrixRecord){
								return matrixRecord.get('ProductName') === value;
							}
						}));
					}
					me._clearToolTip();
				}
			}
		});
		
		me.ModePicker = me.add({
			xtype:'combobox',
			x:0, y:60,
			fieldLabel:'Click Mode',
			store: Ext.create('Ext.data.Store', {
				fields:['Mode'],
				data: [
					{'Mode':'Flag'},
					{'Mode':'Details'}
				]
			}),
			displayField: 'Mode',
			editable:false,
			value:mode,
			listeners: {
				select: function(combo, records){
					var value = records[0].get('Mode');
					if(value === mode) return;
					else mode = value;
					me._clearToolTip();
				}
			}
		});
		
		me.MatrixLegend = me.add({
			xtype:'container',
			layout:'table',
			columns:5,
			width:600, x:300, y:0,
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
		
		me.MatrixGrid = me.add({
			xtype: 'grid',
			x:0, y:100,
			width: Math.min(_.reduce(columnCfgs, function(item, sum){ return sum + item.width; }, 20), me.getWidth()-40),
			height:me._gridHeight,
			scroll:'both',
			resizable:false,
			columns: columnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig: {
				preserveScrollOnRefresh: true
			},
			listeners: {
				sortchange: function(){
					me._clearToolTip();
				},
				beforeedit: function(editor, e){
					var ProjectName = e.column.text,
						matrixRecord = e.record;
					if(mode === 'Flag'){
						var featureRecord = me.MatrixFeatureStore.findRecord('ObjectID', matrixRecord.get('ObjectID'));
						var tcae = getTeamCommit(featureRecord, ProjectName);
						setExpected(featureRecord, ProjectName, !tcae.Expected);
						matrixRecord.commit(); //just so it rerenders this record 
					}
					return false;
				}, 
				afterrender: function (grid) {
					var view = grid.view.normalView;	//lockedView and normalView		
					
					view.getEl().on('scroll', function(){ if(!me._isReloadRefresh) me._clearToolTip(); });
					
					// record the current cellIndex for tooltip stuff
					grid.mon(view, {
						uievent: function (type, view, cell, row, col, e) {
							if(mode === 'Details' && type === 'mousedown') {
								var matrixRecord = me.CustomMatrixStore.getAt(row);
								var ProjectName = view.getGridColumns()[col].text;
								var featureRecord = me.MatrixFeatureStore.findRecord('ObjectID', matrixRecord.get('ObjectID'));
								var tcae = getTeamCommit(featureRecord, ProjectName);
								var pos = cell.getBoundingClientRect();
								if(me.tooltip){
									me.tooltip.panel.hide();
									me.tooltip.triangle.hide();
									me.tooltip.panel.destroy();
									me.tooltip.triangle.destroy();
									if(me.tooltip.row == row && me.tooltip.col == col) {
										delete me.tooltip;
										return;
									}
								}
								
								//if(col <= 3) return; //this applied to non-locked grid
								var panelWidth = 400;
								var theHTML = 
											//'<p><b>Team: </b>' + ProjectName + 
											//'<p><b>Feature: </b>' + featureRecord.get('FormattedID') + 
											'<p><b>' + (tcae.Commitment == 'Committed' ? 'Objective: ' : 'Comment: ') + '</b>' + (tcae.Objective || '') +
											'<p><b>PlanEstimate: </b>' + 
											_.reduce(me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || [], function(sum, sr){
												return sum + (sr.get('PlanEstimate') || 0); }, 0) +
											'<p><b>UserStories: </b><div style="max-height:200px;overflow-y:auto;"><ol>';
								(me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || []).forEach(function(sr){
									theHTML += '<li><a href="https://rally1.rallydev.com/#/' + sr.data.Project.ObjectID + 
										'd/detail/userstory/' + sr.get('ObjectID') + '" target="_blank">' + sr.get('FormattedID') + '</a>: ' + 
										sr.get('Name').substring(0, 40) + (sr.get('Name').length>40 ? '...' : '') + '</li>';
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
												var upsideDown = (dbs < panel.getHeight() + 40);
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
													var upsideDown = (dbs < Ext.get('MatrixTooltipPanel').getHeight() + 40);
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