Ext.define('CustomApp', {
    extend: 'Rally.app.App',
	layout:'absolute',
		
	/****************************************************** SHOW ERROR/TEXT MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE/MODEL METHODS ********************************************************/
	
	_loadAllProjects: function(cb){
		var me = this;
		var TSMap = {}; // {trainName: {train:<trainRecord>, scrums:[<scrumRecords>]}}
		function loadChildren(project, _cb){
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				autoLoad:true,
				remoteSort:false,
				limit:Infinity,
				fetch: ['ObjectID', 'Parent', 'Name', 'TeamMembers'],
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
								var trainName = project.get('Name').split(' - ')[1].split('-')[0];
								if(!TSMap[trainName]) TSMap[trainName] = {train:null, scrums:[]};
								TSMap[trainName].scrums.push(project);
								_cb();
							} else {
								var split = project.get('Name').split(' ART ');
								if(split.length > 2){
									var trainName = split[0];
									if(!TSMap[trainName]) TSMap[trainName] = {train:null, scrums:[]};
									TSMap[trainName].train = project;
								}
								var finished = 0;
								var done = function(){ if(++finished === projectRecords.length) _cb(); };
								projectRecords.forEach(function(c){ loadChildren(c, done); });
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
							me.TSMap = TSMap;
							console.log('TSMap loaded', TSMap);
							cb(); 
						});
					},
					single:true
				}
			}
		});
	},
	
	/* 
		(string), <object/record/item>, [array]
		TSMap = {
			(trainName): {
				train: <trainRecord>
				scrums: {
					(type): {
						self: [<scrumRecords in train>]
						dep: {
							(otherTrianName): [<scrumRecords dependencies in other train>]
						}
					}
				}
			}
		}
	*/			
	_applyTeamNameFilters: function(){
		var me = this, oldTSMap = me.TSMap, newTSMap = {}, map = me._isMap,
			contains = function(str, sub){ return str.indexOf(sub) > -1; };
		for(var tn in oldTSMap){
			newTSMap[tn] = {train:oldTSMap.train, scrums:{}};
			for(var type in map){ newTSMap[tn].scrums[type] = {self:[], dep:{/*other tn, same type*/}}; } }
		for(var tn in oldTSMap){
			oldTSMap[tn].scrums.forEach(function(scrum){
				var name = scrum.get('Name'), trains = name.split(' - ')[1].split('-').slice(1);
				for(var type in map){
					if(_.find(map[type].is, function(t){ return contains(name, t); })){
						if(!_.find(map[type].isnot, function(t){ return contains(name, t); })){
							newTSMap[tn].scrums[type].self.push(scrum);
							trains.forEach(function(tn){ 
								var dep = newTSMap[tn].scrums[type].dep; 
								if(!dep[tn]) dep[tn] = []; 
								dep[tn].push(scrum);
							});
							return;
						}
					}
				}
			});
		}
		me.TSMap = newTSMap;
	},

	_isMap: {
		TMM : { is : ['TMM' 'EVG' 'Evergreen'], isnot : [] },
		TVPV : { is : ['TVPV' 'Trace'], isnot : [] },
		Fuse : { is : ['Fuse' 'FOG'], isnot : [] },
		Func : { is : ['Func' 'GFX' 'Writing' 'FTW' 'SBFT' 'Core' 'UnCore' 'IPU'], isnot : ['Boot'] },
		Scan : { is : ['Scan' 'ATPG' 'Struct' 'DFX'], isnot : ['Infra'] },
		Cache : { is : ['Cache' 'Array'], isnot : [] },
		Reset : { is : ['Reset' 'HTD' 'Simode'], isnot : [] },
		'P/T' : { is : ['Power' 'PTA'], isnot : ['Performance'] },
		PLL : { is : ['PLL'], isnot : [] },
		SIO : { is : ['IO' 'Serial' 'Analog '], isnot : ['MIO' 'Memory' 'Func'] },
		MIO : { is : ['MIO' 'DDR' 'Memory'], isnot : [] },
		'S/C TPI' : { is : ['TP DevOps' 'Program' 'Sort'], isnot : ['BinC' 'TPV'] },
		'MPV/PPV' : { is : ['PPV' 'TPV' 'MPV'], isnot : [] },
		'Yield/BS' : { is : ['Yield' 'Binsplit' 'PHI' 'Binning' 'BinC' 'Performance' 'ISSG'], isnot : [] }
	},
	
	_orgMap: {
		SCI	: ['TMM', 'TVPV', 'Fuse'],
		DCD	: ['Reset', 'Scan', 'Func', 'Cache'],
		ACD	: ['P/T', 'PLL', 'SIO','MIO'],
		TPI	: ['S/C TPI'],
		MPV	: ['MPV/PPV'],
		PHI	: ['Yield/BS']
	},
	
	_defaultGroupings: [['Alpha', 'Charlie'], ['Bravo', 'Delta'], ['Romeo', 'Golf'], ['Hotel', 'Foxtrot'], ['Juliet', 'Kilo']];
	
	_getGroupings: function(cb){
		var me = this;
		me.TrainGroupings = me._defaultGroupings.slice();
		_.each(Object.keys(me.TSMap), function(tn){
			if(!_.find(me._defaultGroupings, function(group){ return group.contains(tn); }))
				me.TrianGroupings.push([tn]);
		});
		cb();
	},
	
	/******************************************************* LAUNCH/UPDATE APP********************************************************/
	launch: function(){
		var me = this;
		me._showError('Loading Data...');
		me._loadAllProjects(function(){	
			me._applyTeamNameFilters(function(){
				me._getGroupings(function(){
					me.removeAll();
					me._loadGrid();
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
	
	_loadGrid: function(){
		var me = this

		var 
		var customRecords = _.map(Object.keys(me._isMap), function(type){
			return _.reduce(me.TrianGroupings, function(rowData, group){
				return {
					items:_.map(group, function(tn){
						return {
							xtype:'text',
							text:tn
						_.map(group, function(tn){
				
				});
			},{
				Org: _.find(Object.keys(me._orgMap), function(org){ return me._orgMap[org].contains(type); }),
				Type: type,
			});
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
				sortable:true,
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
				sortable:true
			},{
				text:'Product', 
				dataIndex:'ProductName',
				width:100,
				editor:false,
				resizable:false,
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
				align:'center',
				tdCls: 'intel-editor-cell',
				sortable:false,
				resizable:false,
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
				data: _.map(me.MatrixReleaseStore.getRecords(), function(r){ return {Name: r.get('Name') }; })
			}),
			displayField: 'Name',
			fieldLabel: 'Release:',
			editable:false,
			value:me.ReleaseRecord.get('Name'),
			listeners: {
				select: function(combo, records){
					if(me.ReleaseRecord.get('Name') === records[0].get('Name')) return;
					me.ReleaseRecord = me.MatrixReleaseStore.findRecord('Name', records[0].get('Name'));						
					me._loadMatrixFeatures(function(){	
						me._loadMatrixUserStoryBreakdown(function(){
							me.removeAll();
							me._loadMatrixGrid();
							me.setLoading(true);
							setTimeout(function(){me.setLoading(false); }, 2000);
						});
					});
					me._clearToolTip();
				}
			}
		});
		
		me.MatrixGrid = me.add({
			xtype: 'rallygrid',
			x:0, y:100,
			height:1800,
			width: _.reduce(columnCfgs, function(item, sum){ return sum + item.width; }, 20),
			scroll:'both',
			resizable:false,
			columnCfgs: columnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			listeners: {
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
				viewready: function (grid) {
					var view = grid.view;			
					// record the current cellIndex for tooltip stuff
					grid.mon(view, {
						uievent: function (type, view, cell, row, col, e) {
							if(mode === 'Details' && type === 'mousedown') {
								var matrixRecord = me.CustomMatrixStore.getAt(row);
								var ProjectName = me.MatrixGrid.getColumnManager().columns[col].text;
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
								
								if(col <= 3) return;
								var panelWidth = 400;
								var theHTML = '<p><b>Team: </b>' + ProjectName + 
											'<p><b>Feature: </b>' + featureRecord.get('FormattedID') + 
											'<p><b>' + (tcae.Commitment == 'Committed' ? 'Objective: ' : 'Comment: ') + '</b>' + (tcae.Objective || '') +
											'<p><b>PlanEstimate: </b>' + 
											_.reduce(me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || [], function(sum, sr){
												return sum + (sr.get('PlanEstimate') || 0); }, 0) +
											'<p><b>UserStories: </b><ol>';
								(me.MatrixUserStoryBreakdown[ProjectName][featureRecord.data.Name] || []).forEach(function(sr){
									theHTML += '<li><a href="https://rally1.rallydev.com/#/' + sr.data.Project.ObjectID + 
										'd/detail/userstory/' + sr.get('ObjectID') + '" target="_blank">' + sr.get('FormattedID') + '</a>: ' + 
										sr.get('Name').substring(0, 40) + (sr.get('Name').length>40 ? '...' : '') + '</li>';
								});
								theHTML += '</ol>';
								
								me.tooltip = {
									row:row,
									col:col,
									panel: Ext.widget('container', {
										floating:true,
										width: panelWidth,
										cls: 'intel-tooltip',
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										html:theHTML,
										listeners:{
											afterrender: function(panel){
												panel.setPosition(pos.left-panelWidth, pos.top);
											}
										}
									}),
									triangle: Ext.widget('container', {
										floating:true,
										width:0, height:0,
										cls: 'intel-tooltip-triangle',
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										listeners:{
											afterrender: function(panel){
												panel.setPosition(pos.left -10, pos.top);
											}
										}
									})	
								};
							}
						}
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: me.getContext(),
			store: me.CustomMatrixStore
		});	
	},
	
	listeners: { //app listeners yo
		afterrender: function() {
			var me = this;
			me.getEl().on('scroll', function(){
				me._clearToolTip();
			});
		}
    }
});