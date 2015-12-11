/*
I can see the table that has kbrief name and the number of days, the IE stage for all the standardization K-briefs
I can only see those k-briefs that has exceeded the time limit for that particular integrating event ( IE stage)
I can see means to configure the time limits for each IE stage
I have means to export to excel

https://palantir.intel.com/sites/PalantirHome/Knowledge%20Briefs/KB-005098.docx

The “age” of a standard has to do with the time it has been in the current column. The columns map to the IE states, so if a standard card is in the “IE3 Pending column” that means it has achieved IE2. The age then is the number of days since the cards column value (in this case c_STDSKANBAN) was last changed.
*/

(function(){
	var Ext = window.Ext4 || window.Ext;
	Ext.define('Intel.AgingStandard', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference'
		],
		userAppsPref: 'intel-SAFe-apps-preference',
		items:[{
			xtype: 'container',
      id: 'exportBtn'
		},{
			xtype:'container',
			id:'gridKbriefs',
			itemId:'gridContainer',
			cls: 'grid-container'
		}
		,{
			xtype:'container',
			id:'gridToExport-container'
		}],
		minWidth:910,	
		/**___________________________________ APP SETTINGS ___________________________________*/	
		getSettingsFields: function() {
			return [
					{
						name: 'IE0',
						xtype: 'rallytextfield'
					},{
						name: 'IE1',
						xtype: 'rallytextfield'
					},{
						name: 'IE2',
						xtype: 'rallytextfield'						
					},{
						name: 'IE3',
						xtype: 'rallytextfield'								
					},{
						name: 'IE4',
						xtype: 'rallytextfield'								
					}
			];
		},
    config: {
			defaultSettings: {
					IE0: '',
					IE1: '28',
					IE2: '28',
					IE3: '84',
					IE4: '84'
			}
    },		
		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		/**
			get all the standardization K-briefs
			*/
		getStandardizationKBriefQuery: function(){
			var me=this;
			return Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban', operator:'!=' , value: null });
		},		
		_loadStandardizationKBrief: function(){
			var me = this,
				config = {
					model: 'HierarchicalRequirement',
					compact:false,
					filters: me.getStandardizationKBriefQuery() ,
					fetch:['ObjectID', 'Name', 'c_StdsKanban','c_KBrief','c_StdsKanbanOrg'],
					context: {
						workspace:null,
						project: '/project/' + me.ProjectRecord.data.ObjectID ,
						projectScopeDown: true,
						projectScopeUp: false
					}
				};
				return me.parallelLoadWsapiStore(config).then(function(store){
					me.griStoreItems = store.getRange();
					store.destroyStore();
				});
		},
		_loadStandardizationKBriefSnapshot: function(){
			var me = this,
			deferred = Q.defer();
			Ext.create("Rally.data.lookback.SnapshotStore",
			{
				fetch   : [ "_UnformattedID", "_TypeHierarchy", "Name", "PlanEstimate", "c_StdsKanban", "c_KanbanStatus", "ScheduleState" ],
				hydrate : [ "c_KanbanStatus", "ScheduleState","c_StdsKanban" ],
				filters :
				[
					{
						property : "_ProjectHierarchy",
						value    : me.ProjectRecord.data.ObjectID
					},
					{
						property: "_TypeHierarchy",
						value: { $nin: [ -51009, -51012, -51031, -51078 ] }
					},
					{
						property: "_ValidFrom",
						value: { $gt: me.twoYearsBackDate }
					}
				],
				sorters :
				[
					{
						property  : "_ValidTo",
						direction : "ASC"
					}
				]
			}).load(
			{
				params:
				{
					compress: false,
					removeUnauthorizedSnapshots: true
				},
				callback : function(records, operation, success)
				{
					if(!success) deferred.reject('could not load data from server');
					else {
						me.UserStoryKbriefSnapShot = _.groupBy(records, function(d){return d.data.ObjectID});
						deferred.resolve(records);
					}
				}
			});	
		return deferred.promise;					
		},			
		/**___________________________________ EXPORTING GRID ___________________________________*/	
		/**
			creating a new grid of ignore all the filters or formats
		*/    
		_addExportButton: function () {
			var me = this;
			Ext.getCmp('exportBtn').add({
					xtype: 'rallybutton',
					cls: 'button-export',
					text: 'Export to Excel',
					handler: me._onClickExport,
					visible: true,
					scope:me
			});
		 },	
		_createGridToExport: function(){
       var me = this;
       Ext.getCmp('gridToExport-container').removeAll();       
			//create the store that will hold the rows in the table
			var gridStore = Ext.create('Rally.data.custom.Store', {
					pageSize: 10000, 
					data: me._customRecords
				});
			var gridColumns = [
						{
							text: 'Name of Kbrief',
							dataIndex: 'c_KBrief'
						},
						{
							text: 'Description', 
							dataIndex: 'Description',
							flex:2,		
							sortable:true,
						},
						{
							text: 'IE Stage', 
							dataIndex: 'c_StdsKanban',
							flex:1									
						},
						{
							text: 'No of days in IE Stage', 
							dataIndex:'Age',
							flex: 1 
						},
						{
							text: 'Exceeded Time Limit', 
							dataIndex: 'TimeLimitFlag',
							flex:1
						},						
						{
							text: 'Org', 
							dataIndex: 'c_StdsKanbanOrg',
							flex:1
						}
					]
			var g = Ext.create('Rally.ui.grid.Grid', {
					itemId: 'mygrid',
					height:1,
					id: 'gridToExport',
					showPagingToolbar:false,
					store: gridStore,
					columnCfgs:gridColumns 
			});
			Ext.getCmp('gridToExport-container').add(g);	 	
		},
   _onClickExport: function (gridId) {
			var me = this;
			me._createGridToExport();
			var gridIdToExport = 'gridToExport'
			if (/*@cc_on!@*/0) { //Exporting to Excel not supported in IE
					Ext.Msg.alert('Error', 'Exporting to CSV is not supported in Internet Explorer. Please switch to a different browser and try again.');
			} else if (document.getElementById(gridIdToExport)) {

					me.setLoading('Exporting ...');

					setTimeout(function () {
							var template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-' +
									'microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head>' +
									'<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>' +
									'{worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>' +
									'</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>{table}' +
									'</table></body></html>';

							var base64 = function (s) {
									return window.btoa(unescape(encodeURIComponent(s)));
							};
							var format = function (s, c) {
									return s.replace(/{(\w+)}/g, function (m, p) {
											return c[p];
									})
							};
							var table = document.getElementById(gridIdToExport);
							var excel_data = '<tr>';
							_.each(table.innerHTML.match(/<span .*?x-column-header-text.*?>.*?<\/span>/gm), function (column_header_span) {
									excel_data += (column_header_span.replace(/span/g, 'td'));
							});
							excel_data += '</tr>';
							_.each(table.innerHTML.match(/<tr id="rallygridview.*?<\/tr>/gm), function (line) {/*The RegExp differs according to the way way the grid is created*/
									excel_data += line.replace(/[^\011\012\015\040-\177]/g, '>>');
							});							
							var ctx = {worksheet: name || 'Worksheet', table: excel_data};
							window.location.href = 'data:application/vnd.ms-excel;base64,' + base64(format(template, ctx));
							me.setLoading(false);
					}, 500);
			}
    },	 /**___________________________________ DATA STORE METHODS ___________________________________*/	
/**___________________________________ CREATING AND RENDERING GRID ___________________________________*/	
    _createGridStore: function() {
			var me = this;
        me._customRecords = [];
				/* data = store.getRange(); */
        _.each(me.griStoreItems, function(item, index) {
					var kbriefDescription =  item.get('c_StdsKanban').replace("<br />"," ");
					var ageDays = me._getStageAgeDays(item.get('c_StdsKanban'),item.get('ObjectID'));
					var defaultAgeDays = me._getAppSetting(item.get('c_StdsKanban'));
					var age = "";
					var timeLimitFlag = "No";
					if(ageDays > defaultAgeDays){
					/* 	age =  "<span class ='red'>" + ageDays + "</span>";
						timeLimitFlag = "<span class ='red'> Yes </span>"; */
						age = ageDays;
						timeLimitFlag = "Yes";
					}else{
						/* age =  "<span class ='normal'>" + ageDays + "</span>";
						timeLimitFlag = "<span class ='red'> No </span>"; */
						age = ageDays;
						timeLimitFlag = "No";
					}	
					//some of the stages are not defined
					if (typeof defaultAgeDays === "undefined" || defaultAgeDays === "" )
						timeLimitFlag = "Not defined";
						
					var name = item.get('c_KBrief');
					if(_.isEmpty(name)){ 
						kbriefName =  "KBrief Not linked";
					}
					else{ 
						kbriefName = name.DisplayString ==="" || name.DisplayString === null  ? name.LinkID + ": KBrief Not linked" : name.DisplayString
					} ;					
          me._customRecords.push({
                _ref: item.get('_ref'),
                c_KBrief: kbriefName,
                Description: item.get('Name').replace(","," "),
                c_StdsKanban: kbriefDescription,
								ObjectID: item.get('ObjectID'),
								TimeLimitFlag: timeLimitFlag ,
								c_StdsKanbanOrg: item.get('c_StdsKanbanOrg'),
								Age: age								
            });
        }, me);
    },
		_getAppSetting: function(c_StdsKanban){
			var me = this;
			/* console.log(c_StdsKanban,c_StdsKanban.substr(0,3),me.getSetting(c_StdsKanban.substr(0,3))); */
			return me.getSetting(c_StdsKanban.substr(0,3));
		},
		_getStageAgeDays : function(c_StdsKanban,ObjectID) {
			var me = this;
			var filtered = _.filter(me.UserStoryKbriefSnapShot[ObjectID],function(d){ return d.data.c_StdsKanban === c_StdsKanban});
			var validTo = new Date(filtered[filtered.length-1].data._ValidTo) > new Date() ? new Date() : new Date(filtered[filtered.length-1].data._ValidTo)
			//var test = _.groupBy(records, function(d){console.log(d.data.ObjectID);return d.data.ObjectID});
			return  Rally.util.DateTime.getDifference(validTo, new Date(filtered[0].data._ValidFrom), 'day');
		},			
		_getColumnAgeDays : function(c_StdsKanban,ObjectID) {
			var me = this;
			var filtered = _.filter(me.UserStoryKbriefSnapShot[ObjectID],function(d){ return d.data.c_StdsKanban === c_StdsKanban});
			var validTo = new Date(filtered[filtered.length-1].data._ValidTo) > new Date() ? new Date() : new Date(filtered[filtered.length-1].data._ValidTo)
			//var test = _.groupBy(records, function(d){console.log(d.data.ObjectID);return d.data.ObjectID});
			var dt = Rally.util.DateTime.getDifference(validTo, new Date(filtered[0].data._ValidFrom), 'day');
			var settingday = me._getAppSetting(c_StdsKanban);
			if(dt > settingday){
				return "<span class ='red'>" + dt + "</span>"
			}else{
				return "<span class ='normal'>" + dt + "</span>";
			}
    },		
    _createGrid: function(){
       var me = this;
			//create the store that will hold the rows in the table
			var gridStore = Ext.create('Rally.data.custom.Store', {
					data: me._customRecords
				});
			var gridColumns = [
						{
							text: 'Name of Kbrief',
							dataIndex: 'c_KBrief',
							flex: 1
						},
						{
							text: 'Description', 
							dataIndex: 'Description',
							flex:2,		
							sortable:true,
						},
						{
							text: 'IE Stage', 
							dataIndex: 'c_StdsKanban',
							flex:1,
							items:[
									{ 
										xtype:'intelgridcolumnfilter'
									}
							]										
						},
						{
							text: 'No of days in IE Stage', 
							dataIndex:'Age',
							flex: 1 
						},
						{
							text: 'Exceeded Time Limit', 
							dataIndex: 'TimeLimitFlag',
							flex:1,
							items:[
								{ 
									xtype:'intelgridcolumnfilter'
								}
							]
						},						
						{
							text: 'Org', 
							dataIndex: 'c_StdsKanbanOrg',
							flex:1,
							items:[
								{ 
									xtype:'intelgridcolumnfilter'
								}
							],
						}
					]
			var g = Ext.create('Rally.ui.grid.Grid', {
					itemId: 'mygrid',
					enableEditing:false,
					disableSelection: true,
					store: gridStore,
					columnCfgs:gridColumns 
			});
			Ext.getCmp('gridKbriefs').add(g);
			/* this.add(g); */ 
   },		
		_loadEverything: function(){
			var me = this;
			return Q.all([
				me._loadStandardizationKBriefSnapshot(),
				me._loadStandardizationKBrief()
			])
			.then(function(){
				me._createGridStore();
				me._addExportButton();
			})
			.then(function(){
				me._createGrid();
			})
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.then(function(){ me.setLoading(false); });
		},
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.setLoading('Loading configuration');
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this project');
				return;
			}	
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					var _twoYears = 1000 * 60 *60 *24* 365 * 2;
					var twoYearsBack = new Date(new Date()*1  - _twoYears);
					me.twoYearsBackDate = twoYearsBack.getFullYear() + "-" + (twoYearsBack.getMonth() + 1) + "-" + twoYearsBack.getDay();
				})					
				.then(function(){
					me._loadEverything();
				}) 
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
				.then(function(){ me.setLoading(false); })
				.done();
		}
	});
}());