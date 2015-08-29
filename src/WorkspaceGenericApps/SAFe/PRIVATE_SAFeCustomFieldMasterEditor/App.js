(function(){
	var Ext = window.Ext4 || window.Ext,
		RALLY_MAX_STRING_SIZE = 32768,
		COLUMN_DEFAULTS = {
			text:'',
			resizable: false,
			draggable: false,
			sortable: false,
			editor: false,
			menuDisabled: true,
			renderer: function(val){ return val || '-'; },
			layout: 'hbox'
		};

	Ext.define('Intel.SAFe.CustomFieldEditor', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference'
		],
		
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
			id:'navbox',
			items:[{
				xtype:'container',
				flex:3,
				id:'navbox_left',
				layout: {
					type:'hbox'
				}
			},{
				xtype:'container',
				flex:2,
				id:'navbox_right',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		},{
			xtype:'container',
			padding:'0 10px 0 10px',
			id:'gridsContainer'
		}],
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */
		
		userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/		
		getPortfolioItemFilter: function(){
			var me=this;
			return Ext.create('Rally.data.wsapi.Filter', { 
				property:'Release.Name',
				value: me.ReleaseRecord.data.Name
			}).and(
				Ext.create('Rally.data.wsapi.Filter', { 
					property:'c_TeamCommits',
					operator:'!=',
					value: ''
				}).or(Ext.create('Rally.data.wsapi.Filter', {
					property:'c_Risks',
					operator:'!=',
					value: ''
				})).or(Ext.create('Rally.data.wsapi.Filter', {
					property:'c_MoSCoW',
					operator:'!=',
					value: ''
				}))
			);
		},			
		loadPortfolioItems: function(){ 
			var me=this;
			if(me.ScrumGroupPortfolioProject){
				return me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, me.ScrumGroupPortfolioProject, me.PortfolioItemTypes[0])
				.then(function(portfolioItemStore){
					me.PortfolioItemStore = portfolioItemStore;
				});
			} 
			else {
				var portfolioItemStore = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + me.PortfolioItemTypes[0],
					limit:Infinity,
					remoteSort:false,
					fetch: me.portfolioItemFields,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters:[me.getPortfolioItemFilter()]
				});
				return me.reloadStore(portfolioItemStore).then(function(portfolioItemStore){
					me.PortfolioItemStore = portfolioItemStore;
				});
			}
		},
		getUserStoryFilter: function(){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				twoWeeks = 1000*60*60*24*7*2,
				releaseStartPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + twoWeeks).toISOString(),
				releaseEndPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseDate)*1 - twoWeeks).toISOString();
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseStartDate',
				operator: '<',
				value: releaseStartPadding
			}).and(Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseDate',
				operator: '>',
				value: releaseEndPadding
			})).or(
				Ext.create('Rally.data.wsapi.Filter', {
					property:'Release.ObjectID',
					value: null
				}).and(
					Ext.create('Rally.data.wsapi.Filter', {
						property: lowestPortfolioItemType + '.Release.ReleaseStartDate',
						operator: '<',
						value: releaseStartPadding
					}).and(Ext.create('Rally.data.wsapi.Filter', { 
						property: lowestPortfolioItemType + '.Release.ReleaseDate',
						operator: '>',
						value: releaseEndPadding
					}))
				)
			);
		},
		loadUserStories: function(){	
			var me=this, 
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				config = {
					model: 'HierarchicalRequirement',
					filters: [me.getUserStoryFilter()],
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
						'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState', lowestPortfolioItemType, 'c_Dependencies'],
					context: {
						workspace: me.ScrumGroupRootRecord ? null : me.getContext().getWorkspace()._ref,
						project: me.ScrumGroupRootRecord ? me.ScrumGroupRootRecord.data._ref : null,
						projectScopeUp: false,
						projectScopeDown: true
					}
				};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		
		/**___________________________________ MISC FUNCS ___________________________________*/	
		isJsonValid: function(str){
			try{ JSON.parse(str); return true; }
			catch(e){ return false; }
		},
		atob: function(a){
			try { return atob(a); }
			catch(e){ return 'INVALID ATOB:\n' + a; }
		},
		identity: function(a){ return a; },
		
		/**___________________________________ Load/reloading ___________________________________*/
		showGrids: function(){
			var me=this;
			me.loadGrid(me.PortfolioItemStore, 'MoSCoW', false);
			me.loadGrid(me.PortfolioItemStore, 'TeamCommits', true);
			me.loadGrid(me.PortfolioItemStore, 'Risks', true);
			me.loadGrid(me.UserStoryStore, 'Dependencies', true);
		},
		updateGrids: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.TeamCommitsGrid && me.TeamCommitsGrid.store) me.TeamCommitsGrid.store.intelUpdate();
				if(me.RisksGrid && me.RisksGrid.store) me.RisksGrid.store.intelUpdate();
			}
			if(me.UserStoryStore){
				if(me.DependenciesGrid && me.DependenciesGrid.store) me.DependenciesGrid.store.intelUpdate();
			}
		},		
		reloadStores: function(){
			var me=this;
			return Q.all([me.loadPortfolioItems(), me.loadUserStories()]);
		},		
		clearEverything: function(){
			var me=this;	
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			
			me.RisksGrid = undefined;
			me.TeamCommitsGrid = undefined;
			me.DependenciesGrid = undefined;
			
			Ext.getCmp('gridsContainer').removeAll(); 
		},
		reloadEverything:function(){
			var me = this;
			me.setLoading("Loading Data");
			me.enqueue(function(done){
				me.clearEverything();
				if(!me.ReleasePicker){ //draw these once, never remove them
					me.loadReleasePicker();
					me.loadScrumGroupPicker();
					me.loadManualRefreshButton();
				}		
				me.reloadStores()
					.then(function(){ return me.updateGrids(); })
					.then(function(){ return me.showGrids(); })
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ me.setLoading(false); done(); })
					.done();
			}, 'Queue-Main');
		},
		
		/**___________________________________ LAUNCH ___________________________________*/
		launch: function(){
			var me = this;
			me.setLoading('Loading Configuration');
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ 
						me.loadAllProjects()
							.then(function(allProjects){
								me.AllProjects = allProjects;
							}),
						me.loadAllScrumGroups().then(function(scrumGroupRootRecords){
							me.ScrumGroupRootRecord = null;
							me.AllScrumGroupRootRecords = scrumGroupRootRecords;
							me.ScrumGroupNames = _.map(scrumGroupRootRecords, function(sgr){ return {Name: me.getScrumGroupName(sgr)}; });
						}),
						me.loadAppsPreference()
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var _24Weeks = 1000*60*60*24*7*24;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - _24Weeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){
					var projectOID = me.ProjectRecord.data.ObjectID;
					if(me.AppsPref.projs[projectOID] && me.AppsPref.projs[projectOID].ScrumGroup){
						me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(p){ 
							return p.data.ObjectID == me.AppsPref.projs[projectOID].ScrumGroup; 
						});
						return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
						.then(function(scrumGroupPortfolioProject){
							me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
						});
					} 
				})
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
				.done();
		},

		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navbox_left').add({
				xtype:'intelreleasepicker',
				padding:'0 10px 0 0',
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.releasePickerSelected.bind(me)
				}
			});
		},	
		scrumGroupPickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if((me.ScrumGroupRootRecord && me.getScrumGroupName(me.ScrumGroupRootRecord) == records[0].data.Name) || 
				(!me.ScrumGroupRootRecord && records[0].data.Name == 'All')) return;
			me.setLoading("Saving Preference");
			if(records[0].data.Name === 'All'){
				me.ScrumGroupRootRecord = null;
				me.ScrumGroupPortfolioProject = null;
			}
			else me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(tr){ return me._getScrumGroupName(tr) == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].ScrumGroup = me.ScrumGroupRootRecord ? me.ScrumGroupRootRecord.data.ObjectID : null;
			Q.all([
				me.saveAppsPreference(me.AppsPref),
				Q(me.ScrumGroupRootRecord && me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
					.then(function(scrumGroupPortfolioProject){
						me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
					})
				)
			])
			.then(function(){ me.reloadEverything(); })
			.fail(function(reason){ me.alert('ERROR', reason); })
			.then(function(){ me.setLoading(false); })
			.done();
		},	
		loadScrumGroupPicker: function(){
			var me=this;
			me.ScrumGroupPicker = me.down('#navbox_left').add({
				xtype:'intelfixedcombo',
				width:240,
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],				
					data: [{Name:'All'}].concat(_.sortBy(me.ScrumGroupNames, function(t){ return t.Name; }))
				}),
				displayField: 'Name',
				fieldLabel: 'Portfolio:',
				value: me.ScrumGroupRootRecord ? me.getScrumGroupName(me.ScrumGroupRootRecord) : 'All',
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.scrumGroupPickerSelected.bind(me)
				}
			});
		},	
		loadManualRefreshButton: function(){
			var me=this;
			me.down('#navbox_right').add({
				xtype:'button',
				cls: 'intel-button',
				text:'Refresh Data',
				style:'margin: 5px 0 0 5px',
				width:100,
				listeners:{
					click: me.reloadEverything.bind(me)
				}
			});
		},
		
		/**___________________________________ RENDER GRIDS ___________________________________*/	
		loadGrid: function(realStore, customFieldName, isB64encoded){
			var me = this,
				c_customFieldName = 'c_' + customFieldName,
				customGridName = customFieldName + 'Grid', 
				records = _.reduce(realStore.data.items, function(records, record){
					var customFieldValue = me[isB64encoded ? 'atob' : 'identity'](record.data[c_customFieldName]);
					if(customFieldValue){
						records.push({
							ItemFormattedID: record.data.FormattedID,
							ItemName: record.data.Name,
							ProjectName: record.data.Project ? record.data.Project.Name : '',
							ReleaseName: record.data.Release ? record.data.Release.Name : '',
							CustomFieldValue: customFieldValue
						});
					}
					return records;
				}, []);

			function sorterFn(o1, o2){ return o1.data.ItemFormattedID > o2.data.ItemFormattedID ? -1 : 1; }
			
			var customStore = Ext.create('Intel.lib.component.Store', {
				data: records,
				autoSync:true,
				model: 'SAFeCustomFieldsEditorModel',
				proxy: {
					type:'intelsessionstorage',
					id:customFieldName + '-' + Math.random()
				},
				limit:Infinity,
				sorters:[sorterFn],
				intelUpdate: function(){ 
					var unaccountedForRecords = customStore.getRange(),
						realRecords = realStore.getRange();
					_.each(realRecords, function(realRecord){
						var realFieldValue = me[isB64encoded ? 'atob' : 'identity'](realRecord.data[c_customFieldName]),
							customRecord = _.find(customStore.getRange(), function(customRecord){ 
								return customRecord.data.ItemFormattedID == realRecord.data.FormattedID;
							});
						if(!customRecord && !realFieldValue) return;
						else if(!customRecord && realFieldValue){
							customStore.add(Ext.create('SAFeCustomFieldsEditorModel',  {
								ItemFormattedID: realRecord.data.FormattedID,
								ItemName: realRecord.data.Name,
								ProjectName: realRecord.data.Project ? realRecord.data.Project.Name : '',
								ReleaseName: realRecord.data.Release ? realRecord.data.Release.Name : '',
								CustomFieldValue: realFieldValue
							}));
						} else if(customRecord && !realFieldValue){
							customStore.remove(customRecord);
							unaccountedForRecords = _.filter(unaccountedForRecords, function(unaccountedForRecord){
								return unaccountedFor.data.ItemFormattedID != customRecord.data.ItemFormattedID; 
							});
						} else {
							if(customRecord.data.CustomFieldValue !== realFieldValue) customRecord.set('CustomFieldValue', realFieldValue);
							unaccountedForRecords = _.filter(unaccountedForRecords, function(unaccountedForRecord){
								return unaccountedFor.data.ItemFormattedID != customRecord.data.ItemFormattedID; 
							});
						}
					});
					_.each(unaccountedForRecords, function(customRecord){ customStore.remove(customRecord); });
				}
			});
			
			var columnCfgs = [{
				text:'ID', 
				dataIndex:'ItemFormattedID',
				width:80,
				sortable:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				text:'Name', 
				dataIndex:'ItemName',
				width:120,
				sortable:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				text:'Project', 
				dataIndex:'ProjectName',
				width:120,
				sortable:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				dataIndex:'CustomFieldValue',
				width:60,
				text: (isB64encoded ? 'b64 length' : 'length'),
				sortable:true,
				cls:'header-cls',
				renderer: function(json){ return isB64encoded ? btoa(json).length : json.length; }
			},{
				dataIndex:'CustomFieldValue',
				flex:1,
				text:'Data',
				editor:{
					xtype:'textarea',
					grow:true,
					growMin:20,
					growMax:350
				},
				tdCls:'pre-wrap-cell intel-editor-cell',
				cls:'header-cls'
			},{
				text:'',
				width:24,
				cls:'header-cls',
				renderer: function(value, meta, customRecord, row, col){
					var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.ItemFormattedID),
						realFieldValue = me[isB64encoded ? 'atob' : 'identity'](realRecord.data[c_customFieldName]),
						clickFnName = 'Click' + customRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(realFieldValue === customRecord.data.CustomFieldValue) return;
					meta.tdAttr = 'title="Undo"';
					window[clickFnName] = function(){
						me.enqueue(function(done){
							customRecord.set('CustomFieldValue', realFieldValue);
							customRecord.commit();
							done();
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				text:'',
				width:24,
				cls:'header-cls',
				renderer: function(value, meta, customRecord, row, col){
					var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.ItemFormattedID),
						realFieldValue = me[isB64encoded ? 'atob' : 'identity'](realRecord.data[c_customFieldName]),
						newFieldValue = customRecord.data.CustomFieldValue,
						clickFnName = 'Click' + customRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(realFieldValue === newFieldValue) return;
					meta.tdAttr = 'title="Save ' + c_customFieldName + '"';
					window[clickFnName] = function(){
						if(isB64encoded && !me.isJsonValid(newFieldValue))
							return me.alert('ERROR', 'JSON is not valid');
						me[customGridName].setLoading("Saving item");
						me.enqueue(function(done){
							realRecord.set(c_customFieldName, (isB64encoded ? btoa(newFieldValue) : newFieldValue));
							realRecord.save({	
								callback:function(record, operation, success){
									if(!success) me.alert('ERROR', 'Failed to modify ' + realRecord.data.FormattedID);
									else customRecord.commit();
									me[customGridName].setLoading(false);
									done();
								}
							});
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			},{
				text:'',
				width:24,
				cls:'header-cls',
				renderer: function(value, meta, customRecord, row, col){
					var clickFnName = 'Click' + customRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					meta.tdAttr = 'title="Delete ' + c_customFieldName + '"';
					window[clickFnName] = function(){
						me[customGridName].setLoading("Deleting item");
						me.enqueue(function(done){
							var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.ItemFormattedID);
							realRecord.set(c_customFieldName, '');
							realRecord.save({	
								callback:function(record, operation, success){
									if(!success) me.alert('ERROR', 'Failed to modify ' + realRecord.data.FormattedID);
									else me[customGridName].store.remove(customRecord);
									me[customGridName].setLoading(false);
									done();
								}
							});
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-trash"></i></div>';
				}
			}];
			
			me[customGridName] = me.down('#gridsContainer').add({
				xtype: 'grid',
				title:customFieldName,
				height:500,
				cls: 'custom-field-grid rally-grid',
				scroll:'vertical',
				columns: {
					defaults: COLUMN_DEFAULTS,
					items: columnCfgs
				},
				disableSelection: true,
				plugins:['intelcellediting'],
				viewConfig:{
					xtype:'inteltableview',
					preserveScrollOnRefresh: true
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: customStore
			});	
		}
	});
}());