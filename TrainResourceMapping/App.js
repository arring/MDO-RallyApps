Ext.define('CustomApp', {
    extend: 'Rally.app.App',
	
	/****************************************************** SHOW ERROR/TEXT MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	
	/************************************************** DATA LOADING/Parsing METHODS **********************************************/
	
	_loadAllProjects: function(cb){
		var me = this, TSMap = {}, // {trainName: {train:<trainRecord>, scrums:[<scrumRecords>]}}
			peopleMap = {}, trainName, split;
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
								split = project.get('Name').split(' - ');
								if(split.length>1){ 
									trainName = split[1].split('-')[0];
									if(TSMap[trainName]) TSMap[trainName].scrums.push(project); 
									project.getCollection('TeamMembers').load({
										fetch: ['EmailAddress'],
										callback: function(records){
											peopleMap[project.get('Name')] = _.map(records, function(r){ return r.get('EmailAddress'); });
											_cb();
										}
									});
								}
								else _cb();
							} else {
								split = project.get('Name').split(' ART ');
								if(split.length > 1){
									trainName = split[0];
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
							me.PeopleMap = peopleMap;
							console.log('PeopleMap loaded', peopleMap);
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
	_applyTeamNameFilters: function(cb){
		var me = this, oldTSMap = me.TSMap, newTSMap = {}, map = me._isMap,
			contains = function(str, sub){ return str.indexOf(sub) > -1; },
			tn, dep, type, name, trains;
		for(tn in oldTSMap){
			newTSMap[tn] = {train:oldTSMap[tn].train, scrums:{}};
			for(type in map){ newTSMap[tn].scrums[type] = {self:[], dep:{/*other tn, same type*/}}; } }
		for(tn in oldTSMap){
			oldTSMap[tn].scrums.forEach(function(scrum){
				name = scrum.get('Name');
				trains = _.filter(name.split(' - ')[1].split('-').slice(1), function(s){ return !s.match(/[\(\)\s]/); }); //weird names?
				for(var type in map){
					if(_.find(map[type].is, function(t){ return contains(name, t); })){
						if(!_.find(map[type].isnot, function(t){ return contains(name, t); })){
							newTSMap[tn].scrums[type].self.push(scrum);
							trains.forEach(function(tn2){ 
								dep = newTSMap[tn2].scrums[type].dep; 
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
		console.log('new TSMap loaded', newTSMap);
		cb();
	},

	_isMap: {
		TMM : { is : ['TMM', 'EVG', 'Evergreen'], isnot : [] },
		TVPV : { is : ['TVPV', 'Trace'], isnot : [] },
		Fuse : { is : ['Fuse', 'FOG'], isnot : [] },
		Func : { is : ['Func', 'GFX', 'Writing', 'FTW', 'SBFT', 'Core', 'UnCore', 'IPU'], isnot : ['Boot'] },
		Scan : { is : ['Scan', 'ATPG', 'Struct', 'DFX'], isnot : ['Infra'] },
		Cache : { is : ['Cache', 'Array'], isnot : [] },
		Reset : { is : ['Reset', 'HTD', 'Simode'], isnot : [] },
		'P/T' : { is : ['Power', 'PTA'], isnot : ['Performance'] },
		PLL : { is : ['PLL'], isnot : [] },
		SIO : { is : ['IO', 'Serial', 'Analog '], isnot : ['MIO', 'Memory', 'Func'] },
		MIO : { is : ['MIO', 'DDR', 'Memory'], isnot : [] },
		'S/C TPI' : { is : ['TP DevOps', 'Program', 'Sort'], isnot : ['BinC', 'TPV'] },
		'MPV/PPV' : { is : ['PPV', 'TPV', 'MPV'], isnot : [] },
		'Yield/BS' : { is : ['Yield', 'Binsplit', 'PHI', 'Binning', 'BinC', 'Performance', 'ISSG'], isnot : [] }
	},
	
	_orgMap: {
		SCI	: ['TMM', 'TVPV', 'Fuse'],
		DCD	: ['Func', 'Scan', 'Cache', 'Reset'],
		ACD	: ['P/T', 'PLL', 'SIO','MIO'],
		TPI	: ['S/C TPI'],
		MPV	: ['MPV/PPV'],
		PHI	: ['Yield/BS']
	},
	
	/************************************************** SAVING AND LOADING TO THE APP PREFS **********************************************/
	
	_defaultGroupings: [['Alpha', 'Charlie'], ['Bravo', 'Delta'], ['Romeo', 'Golf'], ['Hotel'], ['Foxtrot'], ['Juliet', 'Kilo'], ['Echo']],

	_getSettings: function(cb){ //parse all settings too
		var me = this;
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
			success: function(settings) {
				for(var key in settings){
					try{ settings[key] = JSON.parse(settings[key]); }
					catch(e){ delete settings[key]; }
				}
				console.log(settings);
				cb(settings);
			}
		});
	},
	
	_saveSettings: function(settings, cb){ // stringify and save only the updated settings
		var me = this;
		for(var key in settings) 
			settings[key] = JSON.stringify(settings[key]);	
		Rally.data.PreferenceManager.update({
			appID: me.getAppId(),
			settings: settings,
			success: cb,
			scope:me
		});
	},
		
	_getGroupings: function(){ //gets groupings from settings and adds extra trains to it
		var me = this;
		var groupings = me.Settings.groupings || me._defaultGroupings.slice(0);
		//var groupings = me._defaultGroupings.slice(0); //to reset default
		_.each(Object.keys(me.TSMap), function(tn){ //make sure all trains are accounted for
			if(!_.find(groupings, function(group){ return group.indexOf(tn) > -1; }))
				groupings.push([tn]);
		});
		return groupings;
	},
	
	_setGroupings: function(groupings, cb){ //sets settings groupings
		var me = this, settings = {groupings:groupings};
		me.Settings.groupings = groupings;
		me._saveSettings(settings, cb);
	},
	
	_getExpected: function(tnsInGroup, type){
		var me = this, name = tnsInGroup.sort().join('-');
		return me.Settings[name] ? (me.Settings[name][type] || 0)*1 : 0;
	},
	
	_setExpected: function(tnsInGroup, type, expected, cb){
		var me = this, name = tnsInGroup.sort().join('-'), settings = {};
		if(!me.Settings[name]) me.Settings[name] = {};
		me.Settings[name][type] = expected;
		settings[name] = {}; 
		settings[name][type] = expected;
		me._saveSettings(settings, cb);
	},
	
	/******************************************************* LAUNCH/UPDATE APP********************************************************/
	launch: function(){
		var me = this;
		me._showError('Loading Data...');
		me._loadAllProjects(function(){	
			me._applyTeamNameFilters(function(){
				me._getSettings(function(settings){
					me.Settings = settings;
					me.TrainGroupings = me._getGroupings();
					//me._setGroupings(me.TrainGroupings); //for resetting groups
					me.removeAll();
					me._loadDnD();
					me._loadGrid();
					me._loadExperimentalStuff();
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

	_loadDnD: function(){
		var me = this;
		me.add({
			xtype:'container',
			id:'top'
		});
		var redrawDnD = function() {
			me.DnD = me.down('#top').add({
				xtype:'panel',
				layout:'hbox',
				cls:'inherit-overflow',
				margin:'0 0 10 0',
				bodyPadding:'0 0 10 0',
				border:false, frame:false,
				title:'Train Groups',
				items:_.reduce(me.TrainGroupings, function(cols, tnsInGroup, i){
					cols.push({
						xtype:'container',
						layout:'hbox',
						cls:'dnd-target',
						items: _.map(tnsInGroup, function(tn){
							return {
								xtype:'container', 
								cls:'intel-editor-cell dnd-item',
								html:tn
							};
						})
					});
					cols.push({
						xtype:'container',
						height:'100%',
						cls:'dnd-empty-target'
					});
					return cols;
				}, [{
					xtype:'container',
					height:'100%',
					cls:'dnd-empty-target'
				}]),
				listeners: {
					afterrender: function(){
						var overrides = {
							startDrag: function(x, y) {
								if (!this.el) this.el = Ext.get(this.getEl());
								this.el.addCls('selected');
								this.initXY = this.el.getXY();
								this.offset = {x:x-this.initXY[0], y:y-this.initXY[1]};
							},
							onDrag: function(e) {
								this.el.setXY([e.getPageX()-this.offset.x, e.getPageY()-this.offset.y]);
							},
							onDragEnter: function(e, id) {
								Ext.fly(id).radioCls('valid-zone');
							},
							onDragOut: function(e, id) {
								Ext.fly(id).removeCls('valid-zone');
							},
							onDragDrop: function(e, id) {
								this.el.clearPositioning();
								Ext.removeNode(this);
								Ext.fly(id).appendChild(this.el);
							},
							endDrag: function(e) {
								me.TrainGroupings = _.reduce(me.DnD.getEl().query('.dnd-target, .dnd-empty-target'), function(list, target){
									var items = target.querySelectorAll('.dnd-item');
									if(items.length===0) return list;
									else return list.concat([_.map(items, function(item){ return item.children[0].children[0].innerHTML; })]);
								}, []);
								me._setGroupings(me.TrainGroupings, function(){
									me.DnD.destroy();
									redrawDnD();
									if(me.Grid) {
										me.Grid.destroy();
										delete me.Grid;
										me._loadGrid();
									}
								});
							},
							onInvalidDrop: function() {
								this.el.removeCls('selected');
								this.el.moveTo(this.initXY[0], this.initXY[1]);
							}
						};
						Ext.each(Ext.Element.select('.dnd-item').elements, function(el) {
							var dd = Ext.create('Ext.dd.DD', el, 'dndGroup', {
								isTarget: false
							});
							Ext.apply(dd, overrides);
							
						});
						Ext.each(Ext.Element.select('.dnd-target, .dnd-empty-target').elements, function(el) {
							Ext.create('Ext.dd.DDTarget', el, 'dndGroup', { ignoreSelf: false });
						});
					}
				}
			});
		};
		redrawDnD();
	},
	
	_loadGrid: function(){
		var me = this;
	
		/*********************************************************** Helpers **********************************************/
		function selfCount(self){
			return _.reduce(self, function(sum, scrum){ return sum + scrum.get('TeamMembers').Count; }, 0);
		}
		
		function countString(dep, self){
			return ((self || '') + ((dep.length) ? (self ? ' + ' : '') + dep : '')) || 0;
		}
		
		function getGroupCount(group){
			var tns = _.map(group, function(g){ return g.tn; }), 
				dep = {},
				self = _.reduce(group, function(sum, tr){
					var s = tr.scrums;
					_.each(Object.keys(s.dep), function(tn){ if(tns.indexOf(tn) === -1) dep[tn]=1; });
					return sum + selfCount(tr.scrums.self);
				}, 0);
			return {dep:dep, self:self};
		}	
		
		function getSumOfExpecteds(row){
			return _.reduce(_.filter(Object.keys(row.data), function(key){ return key.match(/Expected/); }), function(sum, key){
				return sum + 1*row.data[key];
			}, 0);
		}
		
		function getSumOfGroupCounts(row){
			return _.reduce(row.data.Groups, function(sum, group){ return sum + getGroupCount(group).self; }, 0);
		}
		
		function columnWrap(val){
			return '<div style="white-space:normal !important;">'+ val +'</div>';
		}

		function updateSummaryRow(view){
			_.each(view.el.down('tr.x-grid-row-summary').select('td').elements, function(el){
				el = Ext.get(el);
				var original = el;
				original.removeCls('intel-editor-cell');
				while(el.down('div'))el = el.down('div');
				var count = parseInt(el.getHTML(), 10);
				if(isNaN(count)) return;
				else if(original.hasCls('intel-actual-cell')) 
					original.addCls(count <=180 && count >=80 ? ' intel-green-cell' : ' intel-red-cell');
				else if(original.hasCls('intel-short-over-cell'))
					original.addCls(count >= 0 ? ' intel-green-cell' : ' intel-red-cell');
			});
		}
		
		/*********************************************************** Store/Data creation **********************************************/
		var rowData = _.map(Object.keys(me._isMap), function(type){
			return _.reduce(me.TrainGroupings, function(rowData, tnsInGroup, i){
				rowData['Expected/' + tnsInGroup.sort().join('-')] = me._getExpected(tnsInGroup, type);
				rowData.Groups[i] = [];
				_.each(tnsInGroup, function(tn){ 
					rowData[tn] = me.TSMap[tn].scrums[type]; 
					rowData.Groups[i].push({tn:tn, train:me.TSMap[tn].train, scrums:me.TSMap[tn].scrums[type]});
				});
				return rowData;
			},{
				Org: _.find(Object.keys(me._orgMap), function(org){ 
					return me._orgMap[org].indexOf(type) === 0; 
				}),
				Type: type,
				Groups: {}
			});
		});	
		console.log('rows created', rowData);
		
		me.CustomStore = Ext.create('Ext.data.Store', {
			data: rowData,
			model: Ext.define('TmpModel'+Math.floor(100000*Math.random()), {
				extend:'Ext.data.Model', 
				fields: Object.keys(rowData[0])
			}),
			autoSync:true,
			limit:Infinity,
			proxy: 'memory'
		});
		
		/*********************************************************** Grid config **********************************************/
		
		//TODO: next, add drag-n-drop to switch groupings, dont make it look ugly, color coding cells
		
		var columnCfgs = _.reduce(me.TrainGroupings, function(cfgs, tnsInGroup, i){ 
			return cfgs.concat([{ //dnd target is the super columns yo
				text:tnsInGroup.join('/ '),
				cls: 'left-bordered4 top-border',
				columns: [{
					text:'Expected',
					dataIndex:'Expected/' + tnsInGroup.sort().join('-'),
					tnsInGroup:tnsInGroup,
					editor:'textfield',
					menuDisabled:true,
					draggable:false,
					resizable:false,
					width:80,
					tdCls: 'intel-editor-cell left-bordered4',
					summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
						return _.reduce(store.getRange(), function(sum, r){ 
							return sum + 1*r.get('Expected/' + tnsInGroup.sort().join('-'));
						}, 0);
					}
				}].concat([{
					text:'Actual',
					menuDisabled:true,
					draggable:false,
					resizable:false,
					width:80,
					dataIndex:'Groups',
					tnsInGroup:tnsInGroup,
					tdCls:'intel-actual-cell',
					hasTooltip:true,
					renderer:function(groups, meta, record){
						var group = groups[i],
							ret = getGroupCount(group), self = ret.self,
							dep = Object.keys(ret.dep).join(', '),
							expected = me._getExpected(tnsInGroup, record.data.Type),
							diff = self-expected;
						meta.tdCls += (diff >= 0 ? ' intel-green-cell' : ' intel-red-cell');
						return columnWrap(countString(dep, self));
					},
					summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
						var groups = _.map(store.getRange(), function(r){ return r.get('Groups')[i]; });
						var self = 0, dep = {};
						_.each(groups, function(group){ 
							ret = getGroupCount(group);
							self += ret.self;
							Ext.apply(dep, ret.dep);
						});
						dep = Object.keys(dep).join(', ');
						return columnWrap(countString(dep, self));
					}
				}])
			}]);
		},[{ 
			dataIndex:'Org', 
			text:'Orgs',
			tdCls:'double-bordered',
			cls:'double-bordered top-border',
			width:80,
			sortable:false,
			draggable:false,
			resizable:false,
			renderer: function(v, m, r){
				if(v) { m.tdAttr += ' rowspan=' + me._orgMap[v].length; m.tdCls += ' valign-child'; }
				else m.tdCls += ' hide-cell';
				return v;
			}
		},{ 
			dataIndex:'Type', 
			text:'Teams',
			cls:'top-border',
			width:80,
			sortable:false,
			draggable:false,
			resizable:false
		}]).concat([{ //last
			text:'Short/Over By Function',
			sortable:false,
			draggable:false,
			resizable:false,
			tdCls:'left-bordered4 intel-short-over-cell',
			cls:'left-bordered4 top-border',
			width:80,
			renderer: function(v, meta, row){
				var expected = getSumOfExpecteds(row),
					self = getSumOfGroupCounts(row), 
					diff = self-expected;
				meta.tdCls += (diff >= 0 ? ' intel-green-cell' : ' intel-red-cell');
				return diff;
			},
			summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
				var rows = store.getRange(), self=0, expected=0;
				_.each(rows, function(row){ 
					expected += getSumOfExpecteds(row);
					self += getSumOfGroupCounts(row);
				});
				return self-expected;
			}
		},{
			text:'Function Target Size Sum',
			sortable:false,
			draggable:false,
			resizable:false,
			tdCls:'double-bordered',
			cls:'double-bordered top-border',
			width:80,
			renderer: function(v, m, row){
				return getSumOfExpecteds(row);
			},
			summaryRenderer: function(value, summaryData, summaryRecord, row, col, store) {
				return _.reduce(store.getRange(), function(sum, row){ return sum + getSumOfExpecteds(row); }, 0);
			}
		}]);
		
		me.Grid = me.add({
			xtype: 'rallygrid',
			height:500,
			padding:'0 0 0 80',
			scroll:'horizontal',
			resizable:false,
			columnCfgs: columnCfgs,
			columnLines:true,
			viewConfig:{
				border:false
			},
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			features: [{
				ftype: 'summary'
			}],
			listeners: {
				edit: function(editor, e){
					var row = e.record,
						tnsInGroup = e.column.tnsInGroup,
						value = e.value,
						originalValue = me._getExpected(tnsInGroup, row.data.Type);
					if(originalValue !== value && !isNaN(value)){
						me.Grid.setLoading(true);
						me._setExpected(tnsInGroup, row.data.Type, value*1, function(){
							me.Grid.setLoading(false);
							row.commit();
							updateSummaryRow(e.view);
						});
					} else {
						row.set(e.field, originalValue);
						row.commit();
						updateSummaryRow(e.view);
					}
				},
				viewready: function (grid) {
					var view = grid.view;
					updateSummaryRow(view);
					grid.mon(view, {
						uievent: function (type, view, cell, rowIdx, colIdx, e) {
							if(type !== 'mousedown') return;
							var row = me.CustomStore.getAt(rowIdx),
								column = me.Grid.getColumnManager().columns[colIdx],
								pos = cell.getBoundingClientRect(),
								html = '', panelWidth=320;
							if(me.tooltip){
								me.tooltip.panel.hide();
								me.tooltip.triangle.hide();
								me.tooltip.panel.destroy();
								me.tooltip.triangle.destroy();
								if(me.tooltip.rowIdx == rowIdx && me.tooltip.colIdx == colIdx) {
									delete me.tooltip;
									return;
								}
							}
							if(column.hasTooltip){
								var listStyle = 'style="list-style:none;margin-left:15px;padding-left:0px;"', tti;
								var getTooltipInfo = function(type, tn, tns){
									var info = me.TSMap[tn].scrums[type], depTns = Object.keys(info.dep),
										teams, dep;
									teams = _.reduce(info.self, function(theHTML, scrum){
										theHTML += '<li>' + scrum.get('Name');
										var people = me.PeopleMap[scrum.get('Name')];
										if(people.length) {
											theHTML += '<ul ' + listStyle + '>';
											_.each(people, function(name){ theHTML += '<li>' + name + '</li>'; });
											theHTML += '</ul>';
										}
										else theHTML += ' (no members)';
										return theHTML + '</li>';
									}, '');
									dep = _.reduce(depTns, function(theHTML, tn2){ 
										if(!tns || tns.indexOf(tn2)===-1){
											_.each(info.dep[tn2], function(scrum){
												theHTML += '<li>' + scrum.get('Name') + '</li>';
											});
										}
										return theHTML;
									}, '');
									return {teams:teams, dep:dep};
								};	
								if(column.dataIndex==='Groups'){
									tti = _.reduce(column.tnsInGroup, function(tti, tn){
										var tti2 = getTooltipInfo(row.data.Type, tn, column.tnsInGroup);
										tti.teams += tti2.teams; tti.dep += tti2.dep;
										return tti;
									}, {teams:'', dep:''});
								}
								else tti = getTooltipInfo(row.data.Type, column.dataIndex);
								
								html = (tti.teams.length ? '<b>Teams:</b><ul ' + listStyle + '>' + tti.teams + '</ul>' : '') +
										(tti.dep.length ? '<b>Dependencies:</b><ul ' + listStyle + '>' + tti.dep + '</ul>' : '');
										
								me.tooltip = {
									rowIdx:rowIdx,
									colIdx:colIdx,
									panel: Ext.widget('container', {
										floating:true,
										width: panelWidth,
										cls: 'intel-tooltip',
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										html: html,
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
				},
				afterrender: function() {
					this.getView().getEl().on('scroll', function(){
						me._clearToolTip();
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			selType:'rowmodel',
			selModel:{
				listeners: {
					beforeselect: function(){ return false; }
				}
			},
			context: me.getContext(),
			store: me.CustomStore
		});	
	},
	
	_loadExperimentalStuff: function(){
		var me = this;
		console.log(me.getContext().getUser());
	},
	
	listeners: { //app listeners 
		afterrender: function() {
			var me = this;
			me.getEl().on('scroll', function(){
				me._clearToolTip();
			});
		}
    }
});