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
    _addExportButton: function () {
			var me = this;
			Ext.getCmp('exportBtn').add({
					xtype: 'rallybutton',
					text: 'Export to Excel',
					handler: me._onClickExport,
					visible: true,
					scope:me
			});
		 },	
		_createGridToExport: function(){
       var me = this;
        var totalDelta = 0;        
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
		 	Ext.getCmp('gridToExport-container').removeAll();
			Ext.getCmp('gridToExport-container').add(g);	 	
		},
   _onClickExport: function (gridId) {
			var me = this;
			me._createGridToExport();
			if (/*@cc_on!@*/0) { //Exporting to Excel not supported in IE
					Ext.Msg.alert('Error', 'Exporting to CSV is not supported in Internet Explorer. Please switch to a different browser and try again.');
			} else if (document.getElementById('gridToExport')) {

					Ext.getBody().mask('Exporting ...');

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
							var table = document.getElementById('gridToExport');
						//	Ext.getCmp('gridToExport-container').removeAll();
							var excel_data = '<tr>';
							Ext.Array.each(table.innerHTML.match(/<span .*?x-column-header-text.*?>.*?<\/span>/gm), function (column_header_span) {
									excel_data += (column_header_span.replace(/span/g, 'td'));
							});
							excel_data += '</tr>';
							Ext.Array.each(table.innerHTML.match(/<tr id="rallygridview.*?<\/tr>/gm), function (line) {
									excel_data += line.replace(/[^\011\012\015\040-\177]/g, '>>');
							});							
							var ctx = {worksheet: name || 'Worksheet', table: excel_data};
							window.location.href = 'data:application/vnd.ms-excel;base64,' + base64(format(template, ctx));
							Ext.getBody().unmask();
					}, 500);
			}
    },	 /**___________________________________ DATA STORE METHODS ___________________________________*/	
		getStandardizationKBriefQuery: function(){
			var me=this,

				filter1 = 
					Ext.create('Rally.data.wsapi.Filter', {property: 'TypeDefOid', value:'13907894958'}).and(
					Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban ', value:'IE0 <br />(Proposal)'}).or(
					Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban ', value:'IE1 Pending<br />(Decision)'})).or(
					Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban ', value:'IE2 Pending<br />(Plan)'})).or(
					Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban ', value:'IE4 Pending<br />(Deploy All)'}))).and(
					Ext.create('Rally.data.wsapi.Filter', {property: 'DirectChildrenCount  ', value:0})),
				filter2 = 	Ext.create('Rally.data.wsapi.Filter', {property: 'TypeDefOid', value:'13907895013'}).and(
					Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban ', value:'IE0 <br />(Proposal)'}));
				
				filter3 = Ext.create('Rally.data.wsapi.Filter', {property: 'c_StdsKanban', operator:'!=' , value: null });
				
			return filter3;/* filter1.or(filter2) */;
		},		
		
		/**
			get all the standardization K-briefs
			*/
		_loadStandardizationKBrief: function(){
			var me = this;
 			var me = this,
				config = {
						model: 'HierarchicalRequirement',
						compact:false,
						filters: me.getStandardizationKBriefQuery() ,
/* 						 fetch:['ObjectID', 'Name', 'c_StdsKanban','c_KBrief','Feature','c_StdsKanbanOrg','InProgressDate','c_NextIEWW','LastUpdateDate','LatestDiscussionAgeInMinutes','RevisionHistory','Revision','Description','CreationDate'],  */
						fetch:['ObjectID', 'Name', 'c_StdsKanban','c_KBrief','c_StdsKanbanOrg'],
						context: {
							workspace:null,
							project: '/project/' + me.ProjectRecord.data.ObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					me._createGridStore(store);
					/* me._createGrid(store); */
					/* me._loadStandardizationKBriefSnapshot(); */
					/* store.destroyStore(); */
				})
			.then(function(){
				//me._createGrid(me._customRecords);
				me._addExportButton();
			});					
		},
		_loadStandardizationKBriefSnapshot: function(){
		     /*    var artifacts = Ext.create('Rally.data.wsapi.artifact.Store', {
            models: ['UserStory','Defect'],
            fetch: ['c_StdsKanban','ObjectID','Workspace','VersionId','RevisionHistory','Revisions','CreationDate','Description','Owner','FormattedID','Blocked','BlockedReason','Ready','Name','Tags','DisplayColor','Project','Discussion:summary','LatestDiscussionAgeInMinutes','Tasks:summary[State;ToDo;Owner;Blocked]','TaskStatus','Defects:summary[State;Owner]','DefectStatus','C_StdsKanbanOrg','DragAndDropRank'],
            autoLoad: true,
           	filters: me.getStandardizationKBriefQuery(),
					context: {
						workspace: null,
						project: '/project/24042562075',
						projectScopeDown: true,
						projectScopeUp: false
					},						
          listeners: {
						load: this._onDataLoaded,
						scope: this
          }
        });		 */	

/* 		var me = this;
 				var parallelLoaderConfig = {
 					context:{ 
						workspace: me.getContext().getGlobalContext().getWorkspace()._ref,
						project: me.ProjectRecord.data._ref,
					}, 
					compress:true,
					findConfig: { 
						_TypeHierarchy: 'HierarchicalRequirement',
						Project: me.ProjectRecord.data.ObjectID,
						_ValidFrom: { $lte: new Date("2013-09-13") }/* ,
						_ValidTo: { $gt: releaseStart }/  ,
						Children: null */
					/* },
					fetch   :[ "_UnformattedID", "_TypeHierarchy", "Name", "PlanEstimate", "c_KanbanStatus", "ScheduleState" ],
          hydrate :[ "c_KanbanStatus", "ScheduleState" ],
				};   
				return me.parallelLoadLookbackStore(parallelLoaderConfig).then(function(snapshotStore){ 
				debugger;
					//only keep snapshots where (release.name == releaseName || (!release && portfolioItem.Release.Name == releaseName))
					var records = _.filter(snapshotStore.getRange(), function(snapshot){

					});
				});	 */	 	
					//me._loadStandardizationKBrief();
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
											value: { $gt: "2013-09-13" }
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
    _createGridStore: function(store) {
			var me = this;
        me._customRecords = [];
				data = store.getRange();
        _.each(data, function(item, index) {
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
      // me._createGrid(store,data);
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
			
/*
			2015-01-14T00:40:31.613Z

			2015-11-16T03:13:34.233Z			
         var daysOld = 0;
        function getLastStateChange() {
            var revisions = item.RevisionHistory.Revisions;
            var lastStateChangeDate = "";

            rally.forEach(revisions, function(revision) {
                if (lastStateChangeDate.length === 0) {
                    var attr = options.attribute.toUpperCase();

                    if (revision.Description.indexOf(attr + " changed from") !== -1) {
                        lastStateChangeDate = revision.CreationDate;
                    }
                    if (revision.Description.indexOf(attr + " added") !== -1) {
                        lastStateChangeDate = revision.CreationDate;
                    }
                }
            });
            return lastStateChangeDate || item.CreationDate;
        }
        var lastStateDate = getLastStateChange();

        var lastUpdateDate = rally.sdk.util.DateTime.fromIsoString(lastStateDate);
        return rally.sdk.util.DateTime.getDifference(new Date(), lastUpdateDate, "day"); */
    },		
    _createGrid: function(store){
       var me = this;
			//create the store that will hold the rows in the table
			var gridStore = Ext.create('Rally.data.custom.Store', {
					data: me._customRecords
				});
			var gridColumns = [
						{
							text: 'Name of Kbrief',
							dataIndex: 'c_KBrief',
							flex: 1/* ,
							renderer: function(value){
								if(_.isEmpty(value)){ return "KBrief Not linked";}
								else{ return value.DisplayString = value.DisplayString ==="" || value.DisplayString === null  ? value.LinkID + ": KBrief Not linked" : value.DisplayString} ;
							} */
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
				})					
				.then(function(){
					return me._loadStandardizationKBriefSnapshot();
				}) 
				.then(function(value){ 
					me._loadStandardizationKBrief();
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