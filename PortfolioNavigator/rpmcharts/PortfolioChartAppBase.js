(function () {
	var Ext = window.Ext4 || window.Ext;
	Ext.define("Rally.apps.charts.rpm.PortfolioChartAppBase", {
		extend: "Rally.app.App",
		settingsScope: "workspace",
		
		requires: [
			'Rally.apps.charts.rpm.ChartSettings',
			'Rally.ui.combobox.ComboBox',
			'Rally.util.Test'
		],
		
		mixins: [
			'Rally.apps.charts.DateMixin'
		],

		layout: {
			type:   'vbox',
			align:  'stretch'
		},
		
		items: [
			{
				xtype:  'container',
				itemId: 'top',
				items: [{
					xtype:  'container',
					itemId: 'header',
					cls:	'header'
				}],
				height: 420,
				padding:'0 0 5 0'
			},
			{
				xtype:  'container',
				itemId: 'bottom',
				minHeight: 100
			}
		],
		
		/********************************************************* launch  **********************************************************/
		
		_initModels: function(cb){ //these only needs to be loaded once, unless accepted ScheduleState values change frequently
			Rally.data.ModelFactory.getModel({
				type: 'UserStory',
				success: function (model) {
					this.UserStory = model;
					cb();
				},
				scope: this
			});
		},
		
		_initScheduleStateValues: function (cb) {
			var me = this;
			me.UserStory.getField('ScheduleState').getAllowedValueStore().load({
				callback: function (records, operation, success) {
					me.scheduleStateValues = Ext.Array.map(records, function (record) {
						return record.get('StringValue');
					});
					cb();
				}
			});
		},
		
		launch: function () {
			var me = this;
			console.log('chart app launched');
			me._initModels(function(){
				me._initScheduleStateValues(function(){
					me._setupAppSettings();
					me._subscribeToPortfolioTree();
					me._setDefaultConfigValues();
					me._drawHeader();
				});
			});
		},
		
		/************************************************* config/setup functions **************************************************/
		
		_setupAppSettings: function () {
			this.appSettings = Ext.create("Rally.apps.charts.rpm.ChartSettings", { app: this });
		},
		
		getSettingsFields: function () {
			return this.appSettings.getSettingsConfiguration();
		},
		
		_subscribeToPortfolioTree: function() {
			this.subscribe(this, 'portfoliotreeitemselected', this._onPortfolioTreeItemSelected, this);
		},
		
		_onPortfolioTreeItemSelected: function(treeItem) {
			this.currentPiRecord = treeItem.getRecord();
			this._refreshComponents();
		},

		_setDefaultConfigValues: function () { //these are only set once right away
			var config = this.chartComponentConfig;
			config.storeConfig.find = config.storeConfig.find || {};
			config.calculatorConfig = config.calculatorConfig || {};
			config.calculatorConfig.scheduleStates = this.scheduleStateValues;
			config.chartConfig = config.chartConfig || {};
			config.chartConfig.title = config.chartConfig.title || {};
			config.chartConfig.xAxis = config.chartConfig.xAxis || {};
			config.chartConfig.yAxis = config.chartConfig.yAxis || { title: {} };
		},
		
		/************************************************* header componenets and event functions **************************************************/
		
		_drawHeader: function(){
			var header = this.down('#header');
			header.add(this._buildHelpComponent());
			header.add(this._buildFilterInfo());
			header.add(this._buildCurrentProjectOnlyCheckbox());
			header.add(this._buildShowGridCheckbox());
		},
		
		_buildHelpComponent: function () {
			return Ext.create('Ext.Component', {
				renderTpl: Rally.util.Help.getIcon({
					cls: Rally.util.Test.toBrowserTestCssClass(this.help.cls),
					id: this.help.id
				})
			});
		},
		
		_buildFilterInfo: function(){
			return Ext.create('Rally.ui.tooltip.FilterInfo', {
				projectName: this.getSetting('project') && this.getContext().get('project').Name || 'Following Global Project Setting',
				typePath: this.typePath,
				scopeUp: this.getSetting('projectScopeUp'),
				scopeDown: this.getSetting('projectScopeDown'),
				query: this.getSetting('query')
			});
		},
		
		_buildCurrentProjectOnlyCheckbox: function(){
			return Ext.create('Rally.ui.CheckboxField', {
				boxLabel: 'Only Stories in Current Project',
				value: this.onlyStoriesInCurrentProject,
				listeners: {
					change: {
						fn: function(checkbox){
							this.onlyStoriesInCurrentProject = checkbox.getValue();
							this._refreshComponents();
						},
						scope: this
					}
				},
				componentCls: 'current-project-only-float',
				id: 'only-stories-in-current-project-element'
			});
		},
		
		_buildShowGridCheckbox: function() {
			return Ext.create('Rally.ui.CheckboxField', {
				boxLabel: 'Show Grid',
				value: this.showGrid,
				listeners: {
					change: {
						fn: function(checkbox){
							this.showGrid = checkbox.getValue();
							if(!this.showGrid) this._refreshComponents();
							else this._showGrid();
						},
						scope: this
					}
				},
				componentCls: 'show-grid-checkbox-only-float',
				id: 'show-grid-checkbox-element'
			});
		},
		
		/************************************************* rendering/updating functions **************************************************/
		
		_refreshComponents: function() {
			this._showOrHideCheckboxes();
			this._removeChildren();
			this._showGrid();
			this._showChart();
		},
		
		_showOrHideCheckboxes: function() {
			var piLevel = this.currentPiRecord.self.ordinal,
			currentProjectOnlyCheckbox = this.down('#only-stories-in-current-project-element');
			if (piLevel === 0) currentProjectOnlyCheckbox.show();
			else currentProjectOnlyCheckbox.hide();
		},
		
		_removeChildren: function(){
			if(this.down('rallygrid')) this.down('rallygrid').destroy();
			if(this.down('rallychart')) this.down('rallychart').destroy();
		},
		
		_showGrid: function() {
			if(!this.currentPiRecord || !this.showGrid) return;
			var piRecord = this.currentPiRecord,
				piData = piRecord.data,
				piLevel = piRecord.self.ordinal,
				filters = [], sorters = [];
			if (piLevel === 0) {
				sorters.push({
					property: 'ScheduleState',
					direction: 'ASC'
				});
				if (this.onlyStoriesInCurrentProject) {
					filters.push({
						property: 'Project',
						operator: '=',
						value: this.getContext().getDataContext().project
					});
				}
			}
			this.gridMask = this.gridMask || new Ext.LoadMask(this.down('#bottom'), {
				msg:"Loading grid..."
			});
			this.gridMask.show();
			Ext.create('Rally.data.wsapi.Store', {
				model:(piLevel === 0 ? 'HierarchicalRequirement' : 'PortfolioItem'),
				limit:Infinity, 
				autoLoad:true,
				remoteSort:false,
				context:{
					workspace:this.getContext().getWorkspace()._ref,
					project:null
				},
				filters: filters.concat([{
					property:(piLevel === 0 ? 'PortfolioItem.ObjectID' : 'Parent.ObjectID'),
					value:piRecord.data.ObjectID
				}]),
				listeners:{
					load: {
						fn: function(store){
							this._onChildrenRetrieved(store, piLevel);
						},
						scope:this,
						single:true
					}
				}
			});
		},
		
		_showChart: function() {
			if (!this.currentPiRecord) return;
			var piRecord = this.currentPiRecord,
				piRecordData = piRecord.data;
			
			this._calculateDateRange(piRecordData);
			this._setDynamicConfigValues(piRecordData);
			this._updateQueryConfig(piRecord);
			
			this.down('#top').add(this.chartComponentConfig);
		},
		
		/************************************************* grid handler functions **************************************************/

		_onChildrenRetrieved: function(store, piLevel){
			this.gridMask.hide();
			this.grid = this.down('#bottom').add({
				xtype: 'rallygrid',
				store: store,
				columnCfgs: (piLevel===0) ? [
					'FormattedID',
					'Name',
					'PlanEstimate',
					{
						dataIndex: 'Iteration',
						doSort: function(state) {
							this.up('grid').getStore().sort({
								sorterFn: function(r1, r2){
									var i1 = r1.data.Iteration ? r1.data.Iteration.Name || '_' : '_',
										i2 = r2.data.Iteration ? r2.data.Iteration.Name || '_' : '_';
									return ((state==='ASC') ? 1 : -1) * (i1 < i2 ? -1 : 1);
								}
							});
						}
					},
					'ScheduleState',
					{
						dataIndex: 'Project',
						doSort: function(state) {
							this.up('grid').getStore().sort({
								sorterFn: function(r1, r2){
									var i1 = r1.data.Project ? r1.data.Project.Name || '_' : '_',
										i2 = r2.data.Project ? r2.data.Project.Name || '_' : '_';
									return ((state==='ASC') ? 1 : -1) * (i1 < i2 ? -1 : 1);
								}
							});
						}
					},{
						dataIndex: 'DirectChildrenCount',
						text:'Children'
					}
				] : [
					'FormattedID',
					'Name',
					'Project'
				],
				showRowActionsColumn: false,
				selType: 'checkboxmodel',
				selModel:'SIMPLE',
				enableEditing: false,
				autoScroll: true,
				height: 500,
				showPagingToolbar: false
			});
			this.grid.getSelectionModel().selectAll();
			this.grid.on('selectionchange', this._onSelectionChange, this);
		},
				
		_onSelectionChange: function(grid, selected) {
			this.down('rallychart').destroy();
			this.chartComponentConfig.storeConfig.find._ItemHierarchy = {
				$in: _.map(selected, function(record) {
					return record.getId();
				})
			};
			this.down('#top').add(this.chartComponentConfig);
		},
		
		/************************************************* chart handler functions **************************************************/

		_calculateDateRange: function (portfolioItem) {
			var calcConfig = this.chartComponentConfig.calculatorConfig;
			calcConfig.startDate = this._getChartStartDate(portfolioItem);
			calcConfig.endDate = this._getChartEndDate(portfolioItem);
			calcConfig.timeZone = calcConfig.timeZone || this._getTimeZone();
		},
		
		_getChartStartDate: function (portfolioItem) {
			return this.dateToString(portfolioItem.PlannedStartDate || portfolioItem.ActualStartDate || new Date());
		},
		
		_getChartEndDate: function (portfolioItem) {
			return this.dateToString(portfolioItem.PlannedEndDate || portfolioItem.ActualEndDate || new Date());
		},
		
		_setDynamicConfigValues: function (portfolioItem) {
			var c = this.chartComponentConfig;
			c.calculatorConfig.chartAggregationType = this._getAggregationType();
			c.chartConfig.title = this._buildChartTitle(portfolioItem);
			c.chartConfig.subtitle = this._buildChartSubtitle(portfolioItem);
			c.chartConfig.yAxis.title.text = this._getYAxisTitle();
			c.chartConfig.xAxis.tickInterval = this._configureChartTicks( c.calculatorConfig.startDate,  c.calculatorConfig.endDate);
		},
		
		_getAggregationType: function () {
			return this.getSetting("chartAggregationType");
		},
		
		_buildChartTitle: function (portfolioItem) {
			var widthPerCharacter = 10,
				totalCharacters = Math.floor(this.getWidth/ widthPerCharacter),
				title = "Portfolio Item Chart",
				align = "center";
			if (portfolioItem) {
				title = portfolioItem.FormattedID + ": " + portfolioItem.Name;
			}
			if (totalCharacters < title.length) {
				title = title.substring(0, totalCharacters) + "...";
				align = "left";
			}
			return {
				text: title,
				align: align,
				margin: 30
			};
		},
		
		_buildChartSubtitle: function (portfolioItem) {
			var widthPerCharacter = 6,
				totalCharacters = Math.floor(this.getWidth / widthPerCharacter),
				plannedStartDate = "",
				plannedEndDate = "", ww;
			var template = Ext.create("Ext.XTemplate",
				'<tpl if="plannedStartDate">' +
					'<span>Planned Start: {plannedStartDate}</span>' +
					'	<tpl if="plannedEndDate">' +
					'		<tpl if="tooBig">' +
					'			<br />' +
					'		<tpl else>' +
					'			&nbsp;&nbsp;&nbsp;' +
					'		</tpl>' +
					'	</tpl>' +
					'</tpl>' +
					'<tpl if="plannedEndDate">' +
					'	<span>Planned End: {plannedEndDate}</span>' +
					'</tpl>'
			);
			if (portfolioItem && portfolioItem.PlannedStartDate) {
				ww = 'WW' + this._getWorkweek(new Date(portfolioItem.PlannedStartDate));
				plannedStartDate = ww + ' (' + this._formatDate(portfolioItem.PlannedStartDate) + ')';
			}
			if (portfolioItem && portfolioItem.PlannedEndDate) {
				ww = 'WW' + this._getWorkweek(new Date(portfolioItem.PlannedEndDate));
				plannedEndDate = ww + ' (' + this._formatDate(portfolioItem.PlannedEndDate) + ')';
			}
			var formattedTitle = template.apply({
				plannedStartDate: plannedStartDate,
				plannedEndDate: plannedEndDate,
				tooBig: totalCharacters < plannedStartDate.length + plannedEndDate.length + 60
			});
			return {
				text: formattedTitle,
				useHTML: true,
				align: "center"
			};
		},
		
		_getYAxisTitle: function () {
			return (this._getAggregationType() === "storypoints") ? "Points" : "Count";
		},
		
		_configureChartTicks: function (startDate, endDate) {
			var pixelTickWidth = 80,
				appWidth = this.getWidth(),
				ticks = Math.floor(appWidth / pixelTickWidth);
			var startDateObj = this.dateStringToObject(startDate),
				endDateObj = this.dateStringToObject(endDate);
			var days = Math.floor((endDateObj.getTime() - startDateObj.getTime()) / (86400000*5/7)); //only workdays
			var interval = Math.floor(Math.floor(days / ticks) / 5) * 5;
			if(interval < 5) return 5;
			else return interval;
		},
		
		_updateQueryConfig: function (portfolioItem){
			this.chartComponentConfig.storeConfig.find._ItemHierarchy = portfolioItem.data.ObjectID;
			if(portfolioItem.self.ordinal === 0 && this.onlyStoriesInCurrentProject)
				this.chartComponentConfig.storeConfig.find.Project = this.getContext().getProject().ObjectID;
			else delete this.chartComponentConfig.storeConfig.find.Project;
		},

		/************************************************* date formatting functions **************************************************/
		
		_formatDate: function (date) {
			this.dateFormat = this.dateFormat || this._parseRallyDateFormatToHighchartsDateFormat();
			return window.parent.Highcharts.dateFormat(this.dateFormat, date.getTime());
		},
		
		_parseRallyDateFormatToHighchartsDateFormat: function () {
			var dateFormat = this._getUserConfiguredDateFormat() || this._getWorkspaceConfiguredDateFormat();
			for (var i = 0; i < this.dateFormatters.length; i++) {
				dateFormat = dateFormat.replace(this.dateFormatters[i].key, this.dateFormatters[i].value);
			}
			return dateFormat;
		},
		
		_getUserConfiguredDateFormat: function () {
			return this.getContext().getUser().UserProfile.DateFormat;
		},
		
		_getWorkspaceConfiguredDateFormat: function () {
			return this.getContext().getWorkspace().WorkspaceConfiguration.DateFormat;
		},
		
		_getTimeZone: function () {
			return this.getContext().getUser().UserProfile.TimeZone || this.getContext().getWorkspace().WorkspaceConfiguration.TimeZone;
		},
		
		/*********************************************** Error/ notificaiton functions ******************************************/
		
		_portfolioItemNotValid: function () {
			this._setErrorTextMessage('Cannot find the chosen portfolio item.  Please click the gear and "Edit Settings" to choose another.');
		},
		
		_setErrorTextMessage: function (message) {
			this.down('#header').add({
				xtype: 'displayfield',
				value: message
			});
		}
	});
}());