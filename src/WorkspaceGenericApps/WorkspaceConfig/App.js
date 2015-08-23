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
		getScrumGroupPortfolioStoreData: function(){
			var me=this;
			return _.map(me.ScrumGroupConfig, function(scrumGroupConfig){
				return {
					ScrumGroupRootProjectOID: scrumGroupConfig.ScrumGroupRootProjectOID || 0,
					ScrumGroupName: scrumGroupConfig.ScrumGroupName || '',
					ScrumGroupAndPortfolioLocationTheSame: scrumGroupConfig.ScrumGroupAndPortfolioLocationTheSame ? true : false,
					PortfolioProjectOID: scrumGroupConfig.PortfolioProjectOID || 0,
					IsTrain: scrumGroupConfig.IsTrain ? true : false
				};
			});
		},
		horizontalGroupingObjToString: function(obj){
			return _.reduce(obj, function(str, keywords, horizontal){
				var newStr = horizontal + ':' + keywords.join(',') + ';';
				return str.length ? str + '\n' + newStr : newStr;
			}, '');
		},
		horizontalGroupingStringToObj: function(str){
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
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.setLoading('Loading Configuration');
			if(!me.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(me.getContext().getWorkspace())) { //permission check
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this workspace\'s settings!');
				return;
			} 
			me.configureIntelRallyApp()
				.then(function(){ return me.loadAllProjects(); })
				.then(function(allProjects){
					me.AllProjects = allProjects;
					me.ProjectDataForStore = _.sortBy(_.map(me.AllProjects, 
						function(project){ return { Name: project.data.Name, ObjectID: project.data.ObjectID}; }),
						function(item){ return item.Name; });
				})
				.then(function(){
					return KeyValueDb.getDatabaseProjectOID()
						.then(function(projectOID){ me.DatabaseProjectObjectID = projectOID; })
						.fail(function(){ me.DatabaseProjectObjectID = undefined; });
				})
				.then(function(){
					me.setLoading(false);
					me.renderChooseDatabaseProject();
					me.renderScrumGroupPortfolioGrid();
					me.renderScrumHorizontalGroupingKeywords();
				})
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
				.done();
		},

		/************************************************************* RENDER *******************************************/
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
						KeyValueDb.setDatabaseProjectOID(newProjectOID)
							.then(function(){ me.DatabaseProjectObjectID = newProjectOID; })
							.fail(function(reason){ me.alert(reason); })
							.then(function(){ me.setLoading(false); })
							.done();
					}
				}
			});
		},
		renderScrumGroupPortfolioGrid: function(){
			var me = this;
			
			me.ScrumGroupPortfolioConfigStore = Ext.create('Ext.data.Store', { 
				fields: [
					{name:'ScrumGroupRootProjectOID', type:'number'}, 
					{name:'ScrumGroupName', type:'string'}, 
					{name:'ScrumGroupAndPortfolioLocationTheSame', type:'boolean'}, 
					{name:'PortfolioProjectOID', type:'number'}, 
					{name:'IsTrain', type:'boolean'}
				],
				data: me.getScrumGroupPortfolioStoreData()
			});

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
						text:'Remove Scrum Group',
						width:'100%',
						handler: function(){ me.ScrumGroupPortfolioConfigStore.remove(record); }
					};
				}
			}];

			me.ScrumGroupPortfolioConfigGrid = me.add({
				xtype: 'grid',
				emptyText: ' ',
				header: {
					layout: 'hbox',
					items: [{
						xtype:'text',
						cls:'section-header-text',
						width:500,
						text:"Scrum Group Portfolio Config"
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
							width:150,
							margin:'0 10px 0 0',
							listeners:{
								click: function(){
									var model = Ext.create(me.ScrumGroupPortfolioConfigStore.getProxy().getModel(), {
										ScrumGroupRootProjectOID: 0,
										ScrumGroupName: '',
										ScrumGroupAndPortfolioLocationTheSame: true,
										PortfolioProjectOID: 0,
										IsTrain: true
									});
									me.ScrumGroupPortfolioConfigStore.insert(0, [model]);
								}
							}
						},{
							xtype:'button',
							text:'Undo changes',
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
												IsTrain: scrumGroupRecord.data.IsTrain
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
										me.saveScrumGroupConfig(scrumGroupData)
											.fail(function(reason){ me.alert(reason); })
											.then(function(){ me.ScrumGroupPortfolioConfigGrid.setLoading(false); })
											.done();
									}
								}
							}
						}]
					}]
				},
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
		renderScrumHorizontalGroupingKeywords: function(){
			var me=this,
				goodHTMLIndicator = '<div style="color:green"><i class="fa fa-check"></i> Syntax Valid</div>',
				badHTMLIndicator = '<div style="color:red"><i class="fa fa-times"></i> Syntax Invalid</div>';
				
			function setIndicatorHTML(){
				var indicatorEl = Ext.get('horizontalGroupingSyntaxNotifier'),
					textareaParentEl = Ext.get('horizontalGroupingTextarea');
				if(textareaParentEl && indicatorEl){
					if(textareaParentEl.down('textarea').getValue().match(VALID_HORIZONTAL_GROUPING_SYNTAX)) 
						indicatorEl.setHTML(goodHTMLIndicator);
					else indicatorEl.setHTML(badHTMLIndicator);
				}
			}
			
			me.add({
				xtype:'container',
				id:'horizontalGroupingContainer',
				margin:'0 0 50px 0',
				items:[{
					xtype:'text',
					cls:'section-header-text',
					text:"Horizontal Scrum Grouping Config"
				},{
					xtype:'checkbox',
					id: 'enableHorizontalGroupingCheckbox',
					fieldLabel: 'Enable Horizontal Scrum Groupings',
					labelWidth: 200,
					value: me.HorizontalGroupingConfig.enabled,
					listeners: {
						change: function(combo, newValue){
							me.HorizontalGroupingConfig.enabled = newValue;
							me.setLoading('Saving Preference');
							me.saveHorizontalGroupingConfig(me.HorizontalGroupingConfig)
								.then(function(){ Ext.get('toggledHorizontalGroupingItems')[newValue ? 'show' : 'hide'](); })
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
						listeners: { change: setIndicatorHTML }
					},{
						xtype:'container',
						id: 'horizontalGroupingSyntaxNotifier',
						listeners:{ added: function(){ setTimeout(setIndicatorHTML, 100); } }
					},{
						xtype:'button',
						text:'Save Horizontal Grouping Config',
						listeners:{ 
							click: function(){
								var textareaEl = Ext.get('horizontalGroupingTextarea').down('textarea');
								if(!textareaEl.getValue().match(VALID_HORIZONTAL_GROUPING_SYNTAX)){
									me.alert('ERROR', 'Cannot Save. Invalid grouping syntax.');
									return;
								}
								me.HorizontalGroupingConfig.groups = me.horizontalGroupingStringToObj(textareaEl.getValue());
								me.setLoading('Saving Preference');
								me.saveHorizontalGroupingConfig(me.HorizontalGroupingConfig)
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