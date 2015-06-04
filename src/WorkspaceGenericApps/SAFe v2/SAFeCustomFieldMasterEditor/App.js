(function(){
	var Ext = window.Ext4 || window.Ext;
	
	RALLY_MAX_STRING_SIZE = 32768;

	Ext.define('CustomFieldEditor', {
		extend: 'IntelRallyApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'AsyncQueue',
			'ParallelLoader',
			'UserAppsPreference'
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
		
		_userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/		
		_getPortfolioItemFilter: function(){
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
		_loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: OPIOT');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					remoteSort:false,
					fetch: ['Name', 'ObjectID', 'FormattedID', 'c_Risks', 'c_TeamCommits', 'c_MoSCoW', 'Release', 
						'Project', 'PlannedEndDate', 'Parent', 'Children', 'PortfolioItemType', 'Ordinal'],
					filters:[{ property:'Release.Name', value:me.ReleaseRecord.data.Name}],
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me._reloadStore(store);
		},	
		_loadPortfolioItems: function(){ 
			var me=this;
			if(me.TrainPortfolioProject){
				return me._loadPortfolioItemsOfTypeInRelease(me.TrainPortfolioProject, me.PortfolioItemTypes[0])
					.then(function(portfolioItemStore){
						me.PortfolioItemStore = portfolioItemStore;
					});
			} else {
				var portfolioItemStore = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + me.PortfolioItemTypes[0],
					limit:Infinity,
					remoteSort:false,
					fetch: me._portfolioItemFields,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters:[me._getPortfolioItemFilter()]
				});
				return me._reloadStore(portfolioItemStore).then(function(portfolioItemStore){
					me.PortfolioItemStore = portfolioItemStore;
				});
			}
		},
		_getUserStoryFilter: function(){
			var me=this,
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
						property: 'PortfolioItem.Release.ReleaseStartDate',
						operator: '<',
						value: releaseStartPadding
					}).and(Ext.create('Rally.data.wsapi.Filter', { 
						property: 'PortfolioItem.Release.ReleaseDate',
						operator: '>',
						value: releaseEndPadding
					}))
				)
			);
		},
		_loadUserStories: function(){	
			var me=this, 
				config = {
					model: me.UserStory,
					url: me.BaseUrl + '/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query: me._getUserStoryFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState', 'PortfolioItem', 'c_Dependencies'].join(','),
						workspace: me.TrainRecord ? null : me.getContext().getWorkspace()._ref,
						project: me.TrainRecord ? me.TrainRecord.data._ref : null,
						projectScopeUp: false,
						projectScopeDown: true
					}
				};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		
		/**___________________________________ MISC FUNCS ___________________________________*/	
		_isJsonValid: function(str){
			try{ JSON.parse(str); return true; }
			catch(e){ return false; }
		},
		_atob: function(a){
			try { return atob(a); }
			catch(e){ return 'INVALID ATOB:\n' + a; }
		},
		_identity: function(a){ return a; },
		
		/**___________________________________ Load/reloading ___________________________________*/
		_showGrids: function(){
			var me=this;
			me._loadGrid(me.PortfolioItemStore, 'MoSCoW', false);
			me._loadGrid(me.PortfolioItemStore, 'TeamCommits', true);
			me._loadGrid(me.PortfolioItemStore, 'Risks', true);
			me._loadGrid(me.UserStoryStore, 'Dependencies', true);
		},
		_updateGrids: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.TeamCommitsStore) me.TeamCommitsStore.intelUpdate();
				if(me.RisksStore) me.RisksStore.intelUpdate();
			}
			if(me.UserStoryStore){
				if(me.DependenciesStore) me.DependenciesStore.intelUpdate();
			}
		},		
		_reloadStores: function(){
			var me=this;
			return Q.all([
				me._loadPortfolioItems(),
				me._loadUserStories()
			]);
		},		
		_clearEverything: function(){
			var me=this;	
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			
			me.RisksGrid = undefined;
			me.TeamCommitsGrid = undefined;
			me.DependenciesGrid = undefined;
			
			me.TeamCommitsStore = undefined;
			me.RisksStore = undefined;
			me.DependenciesStore = undefined;
			

			Ext.getCmp('gridsContainer').removeAll(); 
		},
		_reloadEverything:function(){
			var me = this;
			me.setLoading("Loading Data");
			me._enqueue(function(unlockFunc){
				me._clearEverything();
				if(!me.ReleasePicker){ //draw these once, never remove them
					me._loadReleasePicker();
					me._loadTrainPicker();
					me._loadManualRefreshButton();
				}		
				me._reloadStores()
					.then(function(){ return me._updateGrids(); })
					.then(function(){ return me._showGrids(); })
					.fail(function(reason){ me._alert('ERROR', reason || ''); })
					.then(function(){
						me.setLoading(false);
						unlockFunc();
					})
					.done();
			}, 'Queue-Main');
		},
		
		/**___________________________________ LAUNCH ___________________________________*/
		launch: function(){
			var me = this;
			me.setLoading('Loading Configuration');
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ 
						me._loadAllProjects() /********* 1 ************/
							.then(function(allProjects){
								me.AllProjects = allProjects;
							}),
						me._loadAllTrains() /************ 2 **********/
							.then(function(trainRecords){
								me.TrainRecord = null;
								me.AllTrainRecords = trainRecords;
								me.TrainNames = _.map(trainRecords, function(tr){ return {Name: me._getTrainName(tr)}; });
							}),
						me._loadAppsPreference() /********* 3 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var _24Weeks = 1000*60*60*24*7*24;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - _24Weeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){
					var projectOID = me.ProjectRecord.data.ObjectID;
					if(me.AppsPref.projs[projectOID] && me.AppsPref.projs[projectOID].Train){
						me.TrainRecord = _.find(me.AllTrainRecords, function(p){ return p.data.ObjectID == me.AppsPref.projs[projectOID].Train; });
						return me._loadTrainPortfolioProject(me.TrainRecord)
							.then(function(trainPortfolioProject){
								me.TrainPortfolioProject = trainPortfolioProject;
							});
					} 
				})
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},

		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		_releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			me.WorkweekData = me._getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ me._reloadEverything(); })
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navbox_left').add({
				xtype:'intelreleasepicker',
				padding:'0 10px 0 0',
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},	
		_trainPickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if((me.TrainRecord && me._getTrainName(me.TrainRecord) == records[0].data.Name) || 
				(!me.TrainRecord && records[0].data.Name == 'All')) return;
			me.setLoading("Saving Preference");
			if(records[0].data.Name === 'All'){
				me.TrainRecord = null;
				me.TrainPortfolioProject = null;
			}
			else me.TrainRecord = _.find(me.AllTrainRecords, function(tr){ return me._getTrainName(tr) == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Train = me.TrainRecord ? me.TrainRecord.data.ObjectID : null;
			Q.all([
				me._saveAppsPreference(me.AppsPref),
				Q(me.TrainRecord && me._loadTrainPortfolioProject(me.TrainRecord)
					.then(function(trainPortfolioProject){
						me.TrainPortfolioProject = trainPortfolioProject;
					})
				)
			])
			.then(function(){ me._reloadEverything(); })
			.fail(function(reason){ me._alert('ERROR', reason || ''); })
			.then(function(){ me.setLoading(false); })
			.done();
		},	
		_loadTrainPicker: function(){
			var me=this;
			me.TrainPicker = me.down('#navbox_left').add({
				xtype:'intelfixedcombo',
				width:240,
				labelWidth:40,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],				
					data: [{Name:'All'}].concat(_.sortBy(me.TrainNames, function(t){ return t.Name; }))
				}),
				displayField: 'Name',
				fieldLabel: 'Train:',
				value: me.TrainRecord ? me._getTrainName(me.TrainRecord) : 'All',
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._trainPickerSelected.bind(me)
				}
			});
		},	
		_loadManualRefreshButton: function(){
			var me=this;
			me.down('#navbox_right').add({
				xtype:'button',
				text:'Refresh Data',
				style:'margin: 5px 0 0 5px',
				width:100,
				listeners:{
					click: me._reloadEverything.bind(me)
				}
			});
		},
		
		/**___________________________________ RENDER GRIDS ___________________________________*/	
		_loadGrid: function(realStore, customFieldName, isB64encoded){
			var me = this,
				c_customFieldName = 'c_' + customFieldName,
				customStoreName = customFieldName + 'Store',
				customGridName = customFieldName + 'Grid', 
				records = _.reduce(realStore.data.items, function(records, record){
					var customFieldValue = me[isB64encoded ? '_atob' : '_identity'](record.data[c_customFieldName]);
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
			
			me[customStoreName] = Ext.create('Intel.data.FastStore', {
				data: records,
				autoSync:true,
				model: 'SAFeCustomFieldsEditorModel',
				proxy: {
					type:'fastsessionproxy',
					id:customFieldName + '-' + Math.random()
				},
				limit:Infinity,
				sorters:[sorterFn],
				intelUpdate: function(){ 
					var customStore = me[customStoreName], 
						unaccountedForRecords = customStore.getRange(),
						realRecords = realStore.getRange();
					_.each(realRecords, function(realRecord){
						var realFieldValue = me[isB64encoded ? '_atob' : '_identity'](realRecord.data[c_customFieldName]),
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
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				text:'Name', 
				dataIndex:'ItemName',
				width:120,
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				text:'Project', 
				dataIndex:'ProjectName',
				width:120,
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(val, meta){ meta.tdAttr = 'title="' + val + '"'; return val; }
			},{
				dataIndex:'CustomFieldValue',
				width:60,
				text: (isB64encoded ? 'b64 length' : 'length'),
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
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
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				tdCls:'pre-wrap-cell intel-editor-cell',
				cls:'header-cls'
			},{
				text:'',
				width:24,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, customRecord, row, col){
					var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.ItemFormattedID),
						realFieldValue = me[isB64encoded ? '_atob' : '_identity'](realRecord.data[c_customFieldName]),
						clickFnName = 'Click' + customRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(realFieldValue === customRecord.data.CustomFieldValue) return;
					meta.tdAttr = 'title="Undo"';
					window[clickFnName] = function(){
						me._enqueue(function(unlockFunc){
							customRecord.set('CustomFieldValue', realFieldValue);
							customRecord.commit();
							unlockFunc();
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				text:'',
				width:24,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, customRecord, row, col){
					var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.ItemFormattedID),
						realFieldValue = me[isB64encoded ? '_atob' : '_identity'](realRecord.data[c_customFieldName]),
						newFieldValue = customRecord.data.CustomFieldValue,
						clickFnName = 'Click' + customRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					if(realFieldValue === newFieldValue) return;
					meta.tdAttr = 'title="Save ' + c_customFieldName + '"';
					window[clickFnName] = function(){
						if(isB64encoded && !me._isJsonValid(newFieldValue))
							return me._alert('ERROR', 'JSON is not valid');
						me[customGridName].setLoading("Saving item");
						me._enqueue(function(unlockFunc){
							realRecord.set(c_customFieldName, (isB64encoded ? btoa(newFieldValue) : newFieldValue));
							realRecord.save({	
								callback:function(record, operation, success){
									if(!success) me._alert('ERROR', 'Failed to modify ' + realRecord.data.FormattedID);
									else customRecord.commit();
									me[customGridName].setLoading(false);
									unlockFunc();
								}
							});
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			},{
				text:'',
				width:24,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, customRecord, row, col){
					var clickFnName = 'Click' + customRecord.id.replace(/\-/g, 'z') + 'Fn' + col;
					meta.tdAttr = 'title="Delete ' + c_customFieldName + '"';
					window[clickFnName] = function(){
						me[customGridName].setLoading("Deleting item");
						me._enqueue(function(unlockFunc){
							var realRecord = realStore.findExactRecord('FormattedID', customRecord.data.ItemFormattedID);
							realRecord.set(c_customFieldName, '');
							realRecord.save({	
								callback:function(record, operation, success){
									if(!success) me._alert('ERROR', 'Failed to modify ' + realRecord.data.FormattedID);
									else me[customStoreName].remove(customRecord);
									me[customGridName].setLoading(false);
									unlockFunc();
								}
							});
						}, 'Queue-Main');
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-trash"></i></div>';
				}
			}];
			
			me[customGridName] = me.down('#gridsContainer').add({
				xtype: 'rallygrid',
				title:customFieldName,
				height:500,
				cls: 'custom-field-grid rally-grid',
				scroll:'vertical',
				columnCfgs: columnCfgs,
				disableSelection: true,
				plugins:['fastcellediting'],
				viewConfig:{
					xtype:'scrolltableview',
					preserveScrollOnRefresh: true
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me[customStoreName]
			});	
		}
	});
}());