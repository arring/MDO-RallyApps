/** this app is used to configure the scrum-groups and portfolio locations in the workspace **/
(function(){
	var Ext = window.Ext4 || window.Ext,
		KeyValueDb = Intel.lib.resource.KeyValueDb,
		VALID_HORIZONTAL_GROUPING_SYNTAX = /^(?:[\-\w\s\&]+\:[\-\w\s\&]+(?:,[\-\w\s\&]+)*;)*$/;
		
	Ext.define('Intel.WorkspaceConfiguration', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize'
		],

		/************************************************** UTIL FUNCS **********************************************/
		getConfigEditPermissionListStoreData: function(){
			var me = this;
			return _.map(me.ConfigEditPermissionList.username, function(email){
				return {
					username: email || ''
				};
			});				
		},
		getScrumGroupPortfolioStoreData: function(){
			var me=this;
			return _.map(me.ScrumGroupConfig, function(scrumGroupConfig){
				return {
					ScrumGroupRootProjectOID: scrumGroupConfig.ScrumGroupRootProjectOID || 0,
					ScrumGroupName: scrumGroupConfig.ScrumGroupName || '',
					ScrumGroupAndPortfolioLocationTheSame: scrumGroupConfig.ScrumGroupAndPortfolioLocationTheSame ? true : false,
					PortfolioProjectOID: scrumGroupConfig.PortfolioProjectOID || 0,
					IsTrain: scrumGroupConfig.IsTrain ? true : false,
					TrainType: scrumGroupConfig.TrainType
					
				};
			});
		},
		horizontalGroupingObjToString: function(obj){
			return _.reduce(obj, function(str, keywords, horizontal){
				var newStr = horizontal + ':' + keywords.join(',') + ';';
				return str.length ? str + '\n' + newStr : newStr;
			}, '');
		},
		trainTypeGroupingObjToString: function(obj){
			if (_.isEmpty(obj.traintypes)) return "";
			return _.reduce(obj, function(str, keywords, horizontal){
				var newStr = keywords.join(',') + ';';
				return str.length ? str + '\n' + newStr : newStr;
			}, '');
		},		
		groupingStringToObj: function(str){
			return _.reduce(str.split('\n'), function(obj, str){
				if(!str.length) return obj;
				var split = str.split(':');
				obj[split[0]] = split[1].replace(';','').split(',');
				return obj;
			}, {});
		},
		/******************************************************* LAUNCH ********************************************************/	
		launch: function(){
			var me = this;
			me.setLoading('Loading Configuration');
			me.currentUser = me.getContext().getUser().UserName;
			if(!me.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(me.getContext().getWorkspace())) { //permission check
				me.hideGearButtonAndCustomAppPanel();
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this workspace\'s settings!');
				return;
			} 
			Q.all([
				me._loadConfigEditPermissionList()
					.then(function(test){
						me.canEdit = !_.isEmpty(me.ConfigEditPermissionList.username) && (me.ConfigEditPermissionList.username.indexOf(me.currentUser) > -1) ? true: false;
						if (me.canEdit === false){
							me.hideGearButtonAndCustomAppPanel();
						}
					}),
				me.configureIntelRallyApp()
			])
			.then(function(){ return me.loadAllProjects(); })
			.then(function(allProjects){
				me.AllProjects = allProjects;
				me.ProjectDataForStore = _.sortBy(_.map(me.AllProjects, 
					function(project){ return { Name: project.data.Name, ObjectID: project.data.ObjectID}; }),
					function(item){ return item.Name; });
				me.TrainTypeStore = _.sortBy(_.map(me.TrainTypeGroupingConfig.traintypes, 
					function(traintype){ return { TrainType: traintype}; }),
					function(item){ return item.TrainType; });
			})
			.then(function(){
				return KeyValueDb.getDatabaseProjectOID()
					.then(function(projectOID){ me.DatabaseProjectObjectID = projectOID; })
					.fail(function(){ me.DatabaseProjectObjectID = undefined; });
			})
			.then(function(){
				me.setLoading(false);
				me.renderChooseDatabaseProject();
				me.renderTrainTypeConfig();
				me.getScrumGroupPortfolioGridConfig();
				me.renderScrumGroupPortfolioGrid();
				me.renderScrumHorizontalGroupingKeywords();
				if (me.canEdit) me.renderPermissionListGrid();
				if (me.canEdit) me.getAndRenderModifiedByListGrid();
				
			})
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();
		},

		/************************************************************* RENDER *******************************************/
		getAndRenderModifiedByListGrid: function(){
			var me = this;
			Ext.getCmp('grid_modified_scrum_wrapper').removeAll();
			return me._loadLastModifiedWorkspaceAppByPref()
			.then(function(){
				Ext.getCmp('grid_modified_scrum_wrapper').setLoading("Loading");
				me.renderModifiedByListGrid();
			})
			.then(function(){
				Ext.getCmp('grid_modified_scrum_wrapper').setLoading(false);
			});
		},
		renderChooseDatabaseProject: function(){
			var me = this;
			me.add({
				xtype:'container',
				cls: 'section-header-text',
				html:'Key-Value Database Project Config'
			});
			me.add({
				xtype: 'intelcombobox',
				width: 400,
				fieldLabel: 'Key-Value Database Project',
				disabled:!me.canEdit,
				labelWidth: 200,
				margin:'5px 0 20px 0',
				store: Ext.create('Ext.data.Store', {
					fields: ['Name', 'ObjectID'],
					data: me.ProjectDataForStore
				}),
				value: me.DatabaseProjectObjectID,
				displayField: 'Name',
				valueField: 'ObjectID',
				listeners: {
					select: function(combo, records){
						var newProjectOID = records[0].data.ObjectID;
						if(me.DatabaseProjectObjectID === newProjectOID) return;
						me.setLoading('Saving');
						me.LastModifiedWorkspaceAppBy.KeyValueDatabase.push({username: me.currentUser,date: new Date()});
						KeyValueDb.setDatabaseProjectOID(newProjectOID)
							.then(function(){ me.DatabaseProjectObjectID = newProjectOID; })
							.then(function(){ return me.saveLastModifiedWorkspaceAppBy(me.LastModifiedWorkspaceAppBy); })
							.then(function(){me.getAndRenderModifiedByListGrid();})
							.fail(function(reason){ me.alert(reason); })
							.then(function(){ me.setLoading(false); })
							.done();
					}
				}
			});
		},
		renderTrainTypeConfig: function(){
			var me = this;

			me.add({
				xtype:'container',
				id:'container_right',	
				items:[{
						xtype:'container',
						layout:'hbox',
						items:[{
							xtype:'container',
							cls:'section-header-text',
							html:[
								
								'<div>',
									'<p>Train Types Grouping Config</p>',
									
								'</div>'
							].join('\n')
						},{
						xtype:'container',
						cls:'trainconfig-keyword',
						html:['<div>',
							'<p>(Syntax is: keyword1,keyword2;)</p>',
								'</div>'
							].join('\n')
						}]
						
					},{
						xtype:'container',
						id:'trainconfig_wrapper',
						layout:'hbox',
						items:[{
						xtype:'textarea',
						id: 'TrainTypesGroupingTextarea',
						width:800, 
						value: me.trainTypeGroupingObjToString(me.TrainTypeGroupingConfig),
						listeners: { change: me.setIndicatorHTML }
					},{
						xtype:'container',
						id: 'trainTypeGroupingSyntaxNotifier',
						listeners:{ added: function(){ setTimeout(me.setIndicatorHTML, 100); } }
					},{
						xtype:'button',
						text:'Save Train Type Grouping Config',
						id:'btn_savetraintype',
						disabled: !me.canEdit,
						listeners:{ 
							click: function(){
								var textareaEl = Ext.get('TrainTypesGroupingTextarea').down('textarea');
								//traintypes is an object use to store the train type config
								var trainType = "traintypes: " + textareaEl.getValue();
								if(!trainType.match(VALID_HORIZONTAL_GROUPING_SYNTAX)){
									me.alert('ERROR', 'Cannot Save. Invalid grouping syntax.');
									return;
								}
								me.TrainTypeGroupingConfig = me.groupingStringToObj(trainType);
								//gettting rid of empty space if any;
								_.each(me.TrainTypeGroupingConfig, function(value, key){
									_.each(value, function (v,k){
										me.TrainTypeGroupingConfig[key][k] = v.trim();});
								});
								me.setLoading('Saving Preference');
								me.LastModifiedWorkspaceAppBy.TrainTypeConfig.push({username: me.currentUser,date: new Date()});
								me.saveTrainTypeGroupingConfig(me.TrainTypeGroupingConfig)
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){ return me.saveLastModifiedWorkspaceAppBy(me.LastModifiedWorkspaceAppBy); })
								.then(function(){ 
								//adding it to the team store for the grid 
									me.TrainTypeStore = _.sortBy(_.map(me.TrainTypeGroupingConfig.traintypes, 
										function(traintype){ return { TrainType: traintype}; }),
										function(item){ return item.TrainType; });
									me.setLoading(false); 
									me.renderScrumGroupPortfolioGrid();
									
								})
								.then(function(){ me.getAndRenderModifiedByListGrid();})
								.done();
							}
						}
					}]
				}							
				]							
			});
		},
		getScrumGroupPortfolioGridConfig: function(){
			var me = this;
			me.ScrumGroupPortfolioConfigStore = Ext.create('Ext.data.Store', { 
				fields: [
					{name:'ScrumGroupRootProjectOID', type:'number'}, 
					{name:'ScrumGroupName', type:'string'}, 
					{name:'ScrumGroupAndPortfolioLocationTheSame', type:'boolean'}, 
					{name:'PortfolioProjectOID', type:'number'}, 
					{name:'IsTrain', type:'boolean'},
					{name:'TrainType', type:'string'}
				],
				data: me.getScrumGroupPortfolioStoreData()
			});
			me.portfolioGridHeader = {
					layout: 'hbox',
					items: [{
						xtype:'container',
						cls:'section-header-text',
						width:'50%',
						html:'Scrum Group Portfolio Config'
					},{
						xtype:'container',
						flex:1000,
						layout:{
							type:'hbox',
							pack:'end'
						},
						items:[{
							xtype:'button',
							text:'+ Add Scrum Group',
							disabled: !me.canEdit,
							width:150,
							margin:'0 10px 0 0',
							listeners:{
								click: function(){
									var model = Ext.create(me.ScrumGroupPortfolioConfigStore.getProxy().getModel(), {
										ScrumGroupRootProjectOID: 0,
										ScrumGroupName: '',
										ScrumGroupAndPortfolioLocationTheSame: true,
										PortfolioProjectOID: 0,
										IsTrain: true,
										TrainType: ''
									});
									me.ScrumGroupPortfolioConfigStore.insert(0, [model]);
								}
							}
						},{
							xtype:'button',
							text:'Undo changes',
							disabled: !me.canEdit,
							width:110,
							margin:'0 10px 0 0',
							listeners:{
								click: function(){
									me.ScrumGroupPortfolioConfigStore.removeAll();
									me.ScrumGroupPortfolioConfigStore.add(me.getScrumGroupPortfolioStoreData());
								}
							}
						},{
							xtype:'button',
							text:'Save Config',
							disabled: !me.canEdit,
							width:100,
							listeners:{ 
								click: function(){
									var scrumGroupRecords = me.ScrumGroupPortfolioConfigStore.getRange(),
										scrumGroupData = _.map(scrumGroupRecords, function(scrumGroupRecord){
											return {
												ScrumGroupRootProjectOID: scrumGroupRecord.data.ScrumGroupRootProjectOID,
												ScrumGroupName: scrumGroupRecord.data.ScrumGroupName,
												ScrumGroupAndPortfolioLocationTheSame: scrumGroupRecord.data.ScrumGroupAndPortfolioLocationTheSame,
												PortfolioProjectOID: scrumGroupRecord.data.PortfolioProjectOID,
												IsTrain: scrumGroupRecord.data.IsTrain,
												TrainType:scrumGroupRecord.data.TrainType
											};
										}),
										badScrumGroupRootOID = _.find(scrumGroupData, function(scrumGroupConfig){
											if(!scrumGroupConfig.ScrumGroupRootProjectOID) return true;
										}),
										badPortfolioOID = _.find(scrumGroupData, function(scrumGroupConfig){
											if(!scrumGroupConfig.ScrumGroupAndPortfolioLocationTheSame && !scrumGroupConfig.PortfolioProjectOID) return true;
										}),
										badScrumGroupName = _.find(scrumGroupData, function(scrumGroupConfig){
											if(!scrumGroupConfig.ScrumGroupName) return true;
										}),
										conflictingScrumGroupProject = _.find(scrumGroupData, function(scrumGroup1, idx1){
											return _.some(scrumGroupData, function(scrumGroup2, idx2){
												return idx1 !== idx2 && scrumGroup1.ScrumGroupRootProjectOID && 
													(scrumGroup1.ScrumGroupRootProjectOID == scrumGroup2.ScrumGroupRootProjectOID);
											});
										}),
										conflictingScrumGroupName = _.find(scrumGroupData, function(scrumGroup1, idx1){
											return _.some(scrumGroupData, function(scrumGroup2, idx2){
												return idx1 !== idx2 && scrumGroup1.ScrumGroupName === scrumGroup2.ScrumGroupName;
											});
										});
										
									/***************** run data integrity checks before saving *************************/
									if(badScrumGroupRootOID) 
										me.alert('ERROR', 'You must select a valid Scrum Group Root Project!');
									else if(badPortfolioOID) 
										me.alert('ERROR', 'You must select a valid Portfolio Project!');
									else if(badScrumGroupName) 
										me.alert('ERROR', 'Found an invalid Scrum Group Name!');
									else if(conflictingScrumGroupProject) 
										me.alert('ERROR', 'A project is used for more than 1 Scrum Group!');
									else if(conflictingScrumGroupName) 
										me.alert('ERROR', 'A Name is used by more than 1 Scrum Group!');
									else {
										me.ScrumGroupPortfolioConfigGrid.setLoading('Saving Config');
										me.LastModifiedWorkspaceAppBy.ScrumGroupAndPortfolioConfig.push({username: me.currentUser,date: new Date()});
										me.saveScrumGroupConfig(scrumGroupData)
											.fail(function(reason){ me.alert(reason); })
											.then(function(){ return me.saveLastModifiedWorkspaceAppBy(me.LastModifiedWorkspaceAppBy); })
											.then(function(){ me.ScrumGroupPortfolioConfigGrid.setLoading(false); })
											.then(function(){ me.getAndRenderModifiedByListGrid();})
											.done();
									}
								}
							}
						}]
					}]
				};
			me.add({
				xtype: 'container',
				id:'grid_scrumgroupportfolioconfig_wrapper'
			});
		},
		renderScrumGroupPortfolioGrid: function(){
			var me = this;
			Ext.getCmp('grid_scrumgroupportfolioconfig_wrapper').removeAll();
			var columns = [{
				text:'Scrum Group Root Project',
				dataIndex:'ScrumGroupRootProjectOID',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor:{
					xtype:'intelcombobox',
					width:'100%',
					allowBlank:true,
					store: Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: me.ProjectDataForStore
					}),
					displayField: 'Name',
					valueField: 'ObjectID'
					
				},			
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(pid){ 
					if(!pid) return '-';
					else return me.AllProjects[pid].data.Name;
				}
			},{
				text:'Scrum Group Name', 
				dataIndex:'ScrumGroupName',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'textfield',
				resizable:false,
				draggable:false,
				sortable:true
			},{
				text:'Scrum Group And Portfolio Location The Same?', 
				xtype:'checkcolumn',
				disabled: !me.canEdit,
				dataIndex:'ScrumGroupAndPortfolioLocationTheSame',
				flex:1,
				resizable:false,
				draggable:false,
				sortable:true
			},{
				text:'Portfolio Project',
				dataIndex:'PortfolioProjectOID',
				flex:1,
				editor:{
					xtype:'intelcombobox',
					width:'100%',
					allowBlank:true,
					store: Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: me.ProjectDataForStore
					}),
					displayField: 'Name',
					valueField: 'ObjectID'
				},			
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(pid, meta, record){
					if(!record.data.ScrumGroupAndPortfolioLocationTheSame) meta.tdCls += ' intel-editor-cell';
					if(record.data.ScrumGroupAndPortfolioLocationTheSame || !pid) return '-';
					else return me.AllProjects[pid].data.Name;
				}
			},{
				text:'Is Train?', 
				xtype:'checkcolumn',
				dataIndex:'IsTrain',
				width: 100,
				disabled: !me.canEdit,
				resizable:false,
				draggable:false,
				sortable:true
			},{
				text:'Train Type',
				dataIndex:'TrainType',
				flex:1,
				editor:{
					xtype:'intelcombobox',
					width:'100%',
					allowBlank:true,
					store: Ext.create('Ext.data.Store', {
						fields: ['TrainType'],
						data: me.TrainTypeStore || []
					}),
					displayField: 'TrainType',
					valueField: 'TrainType'
				},			
				resizable:false,
				draggable:false,
				sortable:true,
				renderer:function(tid, meta, record){
					if(!record.data.TrainType) meta.tdCls += ' intel-editor-cell';
					if(_.isEmpty(me.TrainTypeGroupingConfig.traintypes) || me.TrainTypeGroupingConfig.traintypes.indexOf(record.data.TrainType) === -1) return "-";
					else return record.data.TrainType;
					
				}
			},{
				text:'',
				width:160,
				xtype:'intelcomponentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				draggable:false,
				renderer: function(value, meta, record){
					return {
						xtype:'button',
						text:'Remove Scrum Group',
						disabled: !me.canEdit,
						width:'100%',
						handler: function(){ me.ScrumGroupPortfolioConfigStore.remove(record); }
					};
				}
			}];			
			
			me.ScrumGroupPortfolioConfigGrid = Ext.getCmp('grid_scrumgroupportfolioconfig_wrapper').add({
				xtype: 'grid',
				id:'grid_scrumgroupportfolioconfig',
				emptyText: ' ',
				header: me.portfolioGridHeader,
				margin:'0 0 20px 0',
				width:'95%',
				height:400,
				scroll:'vertical',
				columns: columns,
				disableSelection: true,
				plugins: [Ext.create('Ext.grid.plugin.CellEditing', { clicksToEdit: 1 })],
				viewConfig:{
					stripeRows:true,
					preserveScrollOnRefresh:true
				},
				listeners: {
					beforeedit: function(editor, e){
						var record = e.record,
							field = e.field;
						return (field != 'PortfolioProjectOID') || !record.data.ScrumGroupAndPortfolioLocationTheSame;
					},
					edit: function(editor, e){
						var field = e.field,
							value = e.value,
							originalValue = e.originalValue,
							record = e.record;
						if(field == 'ScrumGroupName' && value != originalValue) record.set('ScrumGroupName', value.trim());
					}
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.ScrumGroupPortfolioConfigStore
			});	
		},
		renderPermissionListGrid: function(){
			var me = this;

			me.ConfigEditPermissionListStore = Ext.create('Ext.data.Store', { 
				fields: [
					{name:'username', type:'string'}
				],
				data:me.getConfigEditPermissionListStoreData()
			});
			me.add({
				xtype: 'container',
					layout: {
					type: 'hbox'
				},
				items:[{
					xtype: 'container',
					id:'grid_permissionlist_wrapper',
					width:'50%',
					cls:'hello'
			},{
					xtype: 'container',
					id:'grid_modified_scrum_wrapper',
					cls:'grey',
					layout: {
						type: 'vbox'
					},
					width:'40%',
					height:400,
					overflowY : 'auto'				
				}]
				});	
			var permissionListGridHeader = {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'section-header-text',
						width:400,
						text:"Workspace App Permission List"
					},{
						xtype:'container',
						flex:1000,
						layout:{
							type:'hbox',
							pack:'end'
						},
						items:[{
							xtype:'button',
							text:'+ Add User for editing',
							disabled: !me.canEdit,
							width:200,
							margin:'0 10px 0 0',
							listeners:{
								click: function(){
									var model = Ext.create(me.ConfigEditPermissionListStore.getProxy().getModel(), {
										username:"" 
									});
									me.ConfigEditPermissionListStore.insert(0, [model]);
								}
							}
						},{
							xtype:'button',
							text:'Undo changes',
							disabled: !me.canEdit,
							width:110,
							margin:'0 10px 0 0',
							listeners:{
								click: function(){
									me.ConfigEditPermissionListStore.removeAll();
									me.ConfigEditPermissionListStore.add(me.getConfigEditPermissionListStoreData());
								}
							}
						},{
							xtype:'button',
							text:'Save Changes',
							disabled: !me.canEdit,
							width:100,
							listeners:{ 
								click: function(){
									var errorMessage = [];
									var userListRecordsObj = me.ConfigEditPermissionListStore.getRange(),
										userListRecords = _.filter(userListRecordsObj,function(user){ return user.data.username;}),
										userListData = _.map(userListRecords, function(email){
											return {
												username: email.data.username
											};
										}),
										userListArray = _.map(userListRecords, function(email){
											return email.data.username;
											
										});
									_.each(userListArray, function(value,key){
											if (Ext.form.VTypes.email(value) === false){
												errorMessage.push(value);
												}							
									});
									if(errorMessage.length>0){
										me.alert('Cannot Save', 'Not a valid email: ' + errorMessage);													
									}else{
										me.ConfigEditPermissionList = {"username":userListArray};
										me.ConfigEditPermissionListGrid.setLoading('Saving Config');	
										me.LastModifiedWorkspaceAppBy.WorkspaceAppPermissionConfig.push({username: me.currentUser,date: new Date()});
										me.saveConfigEditPermissionList(me.ConfigEditPermissionList)
										.fail(function(reason){ me.alert(reason); })
										.then(function(){ return me.saveLastModifiedWorkspaceAppBy(me.LastModifiedWorkspaceAppBy); })
										.then(function(){ 
											me.ConfigEditPermissionListStore.removeAll();
											me.ConfigEditPermissionListStore.add(me.getConfigEditPermissionListStoreData());
											me.ConfigEditPermissionListGrid.setLoading(false); 
											me.getAndRenderModifiedByListGrid();
										})
										.done();															
									} 
								}
							}
						}]
					}]
				};
			var columns = [{
				text:'List of Email With Editing Permission',
				dataIndex:'username',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'textfield',
				resizable:false,
				draggable:false,
				sortable:true
			},{
				text:'',
				width:160,
				xtype:'intelcomponentcolumn',
				tdCls: 'iconCell',
				resizable:false,
				draggable:false,
				renderer: function(value, meta, record){
					return {
						xtype:'button',
						text:'Remove User',
						width:'100%',
						disabled: !me.canEdit,
						handler: function(){ me.ConfigEditPermissionListStore.remove(record); }
					};
				}
			}];			

			me.ConfigEditPermissionListGrid = Ext.getCmp('grid_permissionlist_wrapper').add({
				xtype: 'grid',
				id:'grid_userlist',
				emptyText: ' ',
				header: permissionListGridHeader,
				margin:'0 0 20px 0',
				width:'100%',
				height:400,
				scroll:'vertical',
				columns: columns,
				disableSelection: true,
				plugins: [Ext.create('Ext.grid.plugin.CellEditing', { clicksToEdit: 1 })],
				viewConfig:{
					stripeRows:true,
					preserveScrollOnRefresh:true
				},
				listeners: {
					beforeedit: function(editor, e){
						
					},
					edit: function(editor, e){
						
					}
				},
				showRowActionsColumn:false,
				showPagingToolbar:false,
				enableEditing:false,
				store: me.ConfigEditPermissionListStore
			});		
		},
		renderModifiedByListGrid: function(){
			var me = this;
			var keyValueDatabase_modified_store= Ext.create('Ext.data.Store', { 
				fields: ['username','date'],
				data: me.LastModifiedWorkspaceAppBy.KeyValueDatabase
			}),
			trainTypeConfig_modified_store= Ext.create('Ext.data.Store', { 
				fields: ['username','date'],
				data: me.LastModifiedWorkspaceAppBy.TrainTypeConfig
			}),
			scrumGroupAndPortfolioConfig_modified_store= Ext.create('Ext.data.Store', { 
				fields: ['username','date'],
				data: me.LastModifiedWorkspaceAppBy.ScrumGroupAndPortfolioConfig
			}),
			workspaceAppPermissionConfig_modified_store= Ext.create('Ext.data.Store', { 
				fields: ['username','date'],
				data: me.LastModifiedWorkspaceAppBy.WorkspaceAppPermissionConfig
			}),
			enableHorizontal_modified_store= Ext.create('Ext.data.Store', { 
				fields: ['username','date'],
				data: me.LastModifiedWorkspaceAppBy.EnableHorizontal
			}),
			horizontalGroupingConfig_modified_store= Ext.create('Ext.data.Store', { 
				fields: ['username','date'],
				data: me.LastModifiedWorkspaceAppBy.HorizontalGroupingConfig
			});
			var columns = [{
				text:'Modified By',
				dataIndex:'username',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'textfield',
				resizable:false,
				draggable:false,
				sortable:true
			},{
				text:'Modified On',
				dataIndex:'date',
				tdCls: 'intel-editor-cell',	
				flex:1,
				editor: 'textfield',
				resizable:false,
				draggable:false,
				sortable:true
			}];			
			var gridConfigs = [{
				xtype: 'grid',
				id:'grid_modified_scrumGroupAndPortfolioConfig',
				header: {	text:"ScrumGroupAndPortfolioConfig Revision"},				
				store: scrumGroupAndPortfolioConfig_modified_store
				},{
				xtype: 'grid',
				id:'grid_modified_workspaceAppPermissionConfig',
				header: {	text:"WorkspaceAppPermissionConfig Revision"},					
				store: workspaceAppPermissionConfig_modified_store
				},{
				xtype: 'grid',
				id:'grid_modified_horizontalGroupingConfig',
				header: { text:"HorizontalGroupingConfig Revision"},				
				store: horizontalGroupingConfig_modified_store
				},{
				xtype: 'grid',
				id:'grid_modified_keyValueDatabase',
				header: { text:"KeyValueDatabase Revision"},
				store: keyValueDatabase_modified_store
				},{
				xtype: 'grid',
				id:'grid_modified_trainTypeConfig',
				header: {	text:"TrainTypeConfig Revision"	},
				store: trainTypeConfig_modified_store
				},{
				xtype: 'grid',
				id:'grid_modified_enableHorizontal',
				header: { text:"EnableHorizontal Revision"},				
				store: enableHorizontal_modified_store
				}];
			
			return Q.all(_.map(gridConfigs, function(gridConfig){
				gridConfig.emptyText = '';
				gridConfig.height = 185;
				gridConfig.width = '90%';
				gridConfig.header.cls = 'revision-header-text';
				gridConfig.header.xtype = 'text';
				gridConfig.scroll = 'vertical';
				gridConfig.disableSelection =  true;
				gridConfig.showRowActionsColumn = false;
				gridConfig.showPagingToolbar = false;
				gridConfig.enableEditing = false;
				gridConfig.columns = columns;
				return Ext.getCmp('grid_modified_scrum_wrapper').add(gridConfig);		
			}));
			
		},		
		setIndicatorHTML: function(){
			var goodHTMLIndicator = '<div style="color:green"><i class="fa fa-check"></i> Syntax Valid</div>',
				badHTMLIndicator = '<div style="color:red"><i class="fa fa-times"></i> Syntax Invalid</div>';
				var indicatorEl = Ext.get('horizontalGroupingSyntaxNotifier'),
					textareaParentEl = Ext.get('horizontalGroupingTextarea');
				if(textareaParentEl && indicatorEl){
					if(textareaParentEl.down('textarea').getValue().match(VALID_HORIZONTAL_GROUPING_SYNTAX)) 
						indicatorEl.setHTML(goodHTMLIndicator);
					else indicatorEl.setHTML(badHTMLIndicator);
				}			
		},
		renderScrumHorizontalGroupingKeywords: function(){
			var me = this;
			me.add({
				xtype:'container',
				id:'horizontalGroupingContainer',
				margin:'0 0 50px 0',
				items:[{
					xtype:'container',
					cls:'section-header-text',
					html:"Horizontal Scrum Grouping Config"
				},{
					xtype:'checkbox',
					id: 'enableHorizontalGroupingCheckbox',
					fieldLabel: 'Enable Horizontal Scrum Groupings',
					labelWidth: 200,
					disabled: !me.canEdit,
					value: me.HorizontalGroupingConfig.enabled,
					listeners: {
						change: function(combo, newValue){
							me.HorizontalGroupingConfig.enabled = newValue;
							me.setLoading('Saving Preference');
							me.LastModifiedWorkspaceAppBy.EnableHorizontal.push({username: me.currentUser,date: new Date()});
							me.saveHorizontalGroupingConfig(me.HorizontalGroupingConfig)
								.then(function(){ return me.saveLastModifiedWorkspaceAppBy(me.LastModifiedWorkspaceAppBy); })
								.then(function(){ Ext.get('toggledHorizontalGroupingItems')[newValue ? 'show' : 'hide'](); })
								.then(function(){	me.getAndRenderModifiedByListGrid();})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){ me.setLoading(false); })
								.done();
						}
					}
				},{
					xtype:'container',
					id: 'toggledHorizontalGroupingItems',
					hidden: !me.HorizontalGroupingConfig.enabled,
					border:false,
					items: [{
						xtype:'container',
						id: 'horizontalGroupingInstructions',
						border:false,
						html:[
							'<hr/>',
							'<div>',
								'<b>Set The Horizontal Groupings</b>',
								'<p>Group Scrums into Horizontals By keywords. Syntax is:</p>',
								'<div style="padding-left:5px;">',
									'<p>HorizontalName1:keyword1,keyword2,keyword3;</p>',
									'<p>HorizontalName2:keyword1,keyword2;</p>',
									'<p>...</p>',
								'</div>',
							'</div>'
						].join('\n')
					},{
						xtype:'textarea',
						id: 'horizontalGroupingTextarea',
						width:800, 
						height:250,
						value: me.horizontalGroupingObjToString(me.HorizontalGroupingConfig.groups),
						listeners: { change: me.setIndicatorHTML }
					},{
						xtype:'container',
						id: 'horizontalGroupingSyntaxNotifier',
						listeners:{ added: function(){ setTimeout(me.setIndicatorHTML, 100); } }
					},{
						xtype:'button',
						text:'Save Horizontal Grouping Config',
						disabled: !me.canEdit,
						listeners:{ 
							click: function(){
								var textareaEl = Ext.get('horizontalGroupingTextarea').down('textarea');
								if(!textareaEl.getValue().match(VALID_HORIZONTAL_GROUPING_SYNTAX)){
									me.alert('ERROR', 'Cannot Save. Invalid grouping syntax.');
									return;
								}
								me.HorizontalGroupingConfig.groups = me.groupingStringToObj(textareaEl.getValue());
								me.setLoading('Saving Preference');
								me.LastModifiedWorkspaceAppBy.HorizontalGroupingConfig.push({username: me.currentUser,date: new Date()});
								me.saveHorizontalGroupingConfig(me.HorizontalGroupingConfig)
								.then(function(){ return me.saveLastModifiedWorkspaceAppBy(me.LastModifiedWorkspaceAppBy); })
								.then(function(){ me.getAndRenderModifiedByListGrid();})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){ me.setLoading(false); })
								.done();
							}
						}
					}]
				}]
			});
		}
	});
}());