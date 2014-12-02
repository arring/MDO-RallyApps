Ext.define("Rally.apps.charts.rpm.cfd.CumulativeFlowChartApp", {
  extend: 'IntelRallyApp',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'ReleaseQuery',
		'IntelWorkweek',
		'AsyncQueue',
		'ChartUpdater'
	],
	requires:[
		'FastCfdCalculator'
	],
	cls: "portfolio-cfd-app",

	layout: {
		type:   'vbox',
		align:  'left'
	},

	items: [{
		xtype:  'container',
		itemId: 'top',
		items: [{
			xtype:  'container',
			itemId: 'header',
			cls:	'header'
		}],
		height: 420,
		padding:'0 0 5 0'
	},{
		xtype:  'container',
		itemId: 'bottom',
		minHeight: 100
	}],
		
	/********************************************************* chart stuff **********************************************************/

	_chartColors: ['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F', '#000000','#26FF00'],
	
	_defaultChartConfig: {
		chart: {
			defaultSeriesType: "area",
			zoomType: "xy"
		},
		xAxis: {
			tickmarkPlacement: "on",
			title: {
				text: "Days",
				margin: 10
			},
			labels: {
				y: 20
			}
		},
		yAxis: {
			title: {
				text: "Points"
			},
			labels: {
				x: -5,
				y: 4
			}
		},			
		tooltip: {
			formatter: function () {
				var sum = 0;
				for(var i=4; i>= this.series.index; --i) 
					sum += this.series.chart.series[i].data[this.point.x].y;
				return "<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ')' + 
					"<br /><b>" + this.series.name + "</b>: " + this.y +
					(this.series.index <=4 ? "<br /><b>Total</b>: " + sum : '');
			}
		},
		plotOptions: {
			series: {
				marker: {
					enabled: false,
					states: {
						hover: {
							enabled: true
						}
					}
				},
				groupPadding: 0.01
			},
			area: {
				stacking: 'normal',
				lineColor: '#666666',
				lineWidth: 2,
				marker: {
					enabled: false
				}
			}
		}
	},
	
	_getConfiguredChartTicks: function (startDate, endDate, width) {
		var pixelTickWidth = 40,
			ticks = Math.floor(width / pixelTickWidth);
		var days = Math.floor((endDate*1 - startDate*1) / (86400000*5/7)); //only workdays
		var interval = Math.floor(Math.floor(days / ticks) / 5) * 5;
		if(interval < 5) return 5; //make it weekly at the minimum
		else return interval;
	},
	
	/********************************************************* launch and config/setup **********************************************************/

	_subscribeToBus: function(){
		var me=this;
		me.subscribe(me, 'portfoliotreeitemselected', function(treeItem){		
			me._enqueue(function(unlockFunc){
				me.currentPiRecord = treeItem.getRecord();
				me._refreshComponents();
				unlockFunc();
			});
		});
	},
	
	launch: function () {
		var me = this;
		console.log('chart app launched');
		me.down('#top').setWidth(me.getWidth()-20);
		me.down('#bottom').setWidth(me.getWidth()-20);
		if (Rally && Rally.sdk && Rally.sdk.dependencies && Rally.sdk.dependencies.Analytics) {
			Rally.sdk.dependencies.Analytics.load(function(){			
				me._loadModels()
					.then(function(){
						me._subscribeToBus();
						me._drawHeader();
					})
					.fail(function(reason){
						me._alert('ERROR', reason);
					})
					.done();
			});
		}
	},

	/************************************************* header componenets and event functions **************************************************/
	
	_drawHeader: function(){
		var me=this;
		me._buildCurrentProjectOnlyCheckbox();
		me._buildShowGridCheckbox();
	},

	_buildCurrentProjectOnlyCheckbox: function(){
		var me=this;
		me.down('#header').add({
			xtype:'rallycheckboxfield',
			boxLabel: 'Only Stories in Current Project',
			value: me.onlyStoriesInCurrentProject,
			listeners: {
				change: {
					fn: function(checkbox){
						me.onlyStoriesInCurrentProject = checkbox.getValue();
						me._refreshComponents();
					}
				}
			},
			componentCls: 'current-project-only-float',
			id: 'only-stories-in-current-project-element'
		});
	},
	
	_buildShowGridCheckbox: function() {
		var me=this;
		me.down('#header').add({
			xtype:'rallycheckboxfield',
			boxLabel: 'Show Grid',
			value: me.showGrid,
			listeners: {
				change: {
					fn: function(checkbox){
						me.showGrid = checkbox.getValue();
						me._refreshComponents();
					}
				}
			},
			componentCls: 'show-grid-checkbox-only-float',
			id: 'show-grid-checkbox-element'
		});
	},
	
	/************************************************* rendering/updating functions **************************************************/
	
	_refreshComponents: function() {
		var me = this,
			grid = me.down('rallygrid'), 
			chart = me.down('rallychart');		
		
		if(!me.currentPiRecord) return;
		me._showOrHideCheckboxes();
		
		function refreshChart(){
			me.chartMask = me.chartMask || new Ext.LoadMask(me.down('#top'), { msg:"Loading chart..."});
			me.chartMask.show();
			me._loadChartStore(function(store){
				me.chartMask.hide();
				var chartData = me._updateChartData(me._loadChartCalculator().runCalculation(store.getRange())),
					dynConf = me._loadDynamicConfigValues();
				if(!chart) me._showChart(chartData, dynConf);
				else me._updateHighchart(chart, chartData, dynConf);
			});
		}
		
		if(me.showGrid){
			if(grid) grid.destroy();
			me._loadGridStore(refreshChart);
		} else {
			if(grid) grid.destroy();
			refreshChart();
		}
	},
	
	_showOrHideCheckboxes: function() {
		var piLevel = this.currentPiRecord.self.ordinal,
		currentProjectOnlyCheckbox = this.down('#only-stories-in-current-project-element');
		if (piLevel === 0) currentProjectOnlyCheckbox.show();
		else currentProjectOnlyCheckbox.hide();
	},
	
	/************************************************* grid handler functions **************************************************/
	
	_loadGridStore: function(cb) {
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
					property: 'Project.ObjectID',
					value: this.getContext().getProject().ObjectID
				});
			}
		}
		this.gridMask = this.gridMask || new Ext.LoadMask(this.down('#bottom'), { msg:"Loading grid..."});
		this.gridMask.show();
		Ext.create('Rally.data.wsapi.Store', {
			model:(piLevel === 0 ? 'HierarchicalRequirement' : 'PortfolioItem'),
			limit:Infinity, 
			autoLoad:true,
			remoteSort:false,
			fetch:(piLevel === 0 ? [
				'ObjectID', 'FormattedID', 'Name', 'PlanEstimate', 'Iteration', 'ScheduleState', 'Project', 'DirectChildrenCount'] : [
				'ObjectID', 'FormattedID', 'Name', 'Project']),
			context:{
				workspace:this.getContext().getWorkspace()._ref,
				project:null
			},
			sorters:sorters,
			filters: filters.concat([{
				property:(piLevel === 0 ? 'PortfolioItem.ObjectID' : 'Parent.ObjectID'),
				value:piRecord.data.ObjectID
			}]),
			listeners:{
				load: {
					fn: function(store){ this._showGrid(store, piLevel, cb); },
					scope:this,
					single:true
				}
			}
		});
	},
	
	_showGrid: function(store, piLevel, cb){
		this.gridMask.hide();
		var grid = this.down('#bottom').add({
			xtype: 'rallygrid',
			store: store,
			width: this.down('#bottom').getWidth()-5,
			columnCfgs: (piLevel===0) ? [
				{
					dataIndex:'FormattedID',
					editor:false,
					renderer: function(v, m ,r){
						return '<a href="https://rally1.rallydev.com/#/' + r.data.Project.ObjectID + 
							'd/detail/userstory/' + r.data.ObjectID + '" target="_blank">' + v + '</a>';
					}
				},
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
					},
					renderer: function(v, m ,r){
						if(v) return '<a href="https://rally1.rallydev.com/#/' + r.data.Iteration.Project.ObjectID + 
							'd/detail/iteration/' + r.data.Iteration.ObjectID + '" target="_blank">' + v.Name + '</a>';
							
					}
				},{
					dataIndex:'ScheduleState',	
					editor:false
				},{
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
					text:'Children',
					renderer: function(v, m ,r){
						return '<a href="https://rally1.rallydev.com/#/' + r.data.Project.ObjectID + 
							'd/detail/userstory/' + r.data.ObjectID + '/children" target="_blank">' + v + '</a>';
					}
				}
			] : [
				'FormattedID',
				'Name',
				'Project'
			],
			showRowActionsColumn: false,
			selType:'checkboxmodel',
			selModel:{
				ignoreRightMouseSelection:true,
				checkOnly:true
			},
			enableEditing: false,
			autoScroll: true,
			height: 500,
			showPagingToolbar: false,
			listeners:{
				selectionchange:{
					fn:this._onSelectionChange,
					scope:this
				},
				add:{
					fn:function(){ if(cb) cb(); }
				}
			}
		});
		grid.getSelectionModel().selectAll(true);
	},
			
	_onSelectionChange: function(grid, selected) {
		var me = this, chart = me.down('rallychart');
		me.chartMask.show();
		me._loadChartStore(function(store){
			me.chartMask.hide();
			var chartData = me._updateChartData(me._loadChartCalculator().runCalculation(store.getRange()));
				dynConf = me._loadDynamicConfigValues();
			me._updateHighchart(chart, chartData, dynConf);
		});
	},
	
	/************************************************* chart handler functions **************************************************/
	
	_showChart: function(chartData, dynamicConfig) {
		var me = this;
		me.chartMask.hide();
		me.down('#top').add({
			xtype: "rallychart",
			loadMask:false,
			queryErrorMessage: "No data to display.<br /><br />Most likely, stories are either not yet available or started for this portfolio item.",
			aggregationErrorMessage: "No data to display.<br /><br />Check the data type setting for displaying data based on count versus plan estimate.",
			chartData:chartData,
			chartConfig:Ext.apply(me._defaultChartConfig, dynamicConfig),
			_renderChart: function () { //have to do this to place the series in the highchart config. we are going past the Ext.js plugin for updates
				var chartConfig = this.getChartConfig(), chartEl = this.down('#chart');
				if (chartEl) {
					this._setChartColorsOnSeries(this.chartData.series);
					chartConfig.xAxis.categories = this.chartData.categories;
					chartConfig.series = this.chartData.series;
					var highChartConfig = {
						xtype: 'highchart',
						initAnimAfterLoad:false,
						chartConfig: chartConfig
					};

					chartEl.add(highChartConfig);
					this._setChartReady();
				}
			}
		});
	},
	
	_loadChartStore: function(cb){	
		Ext.create('Rally.data.lookback.SnapshotStore', {
			autoLoad:true,
			limit: Infinity,
			context:{ 
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			sort:{_ValidFrom:1},
			compress:false,
			find: this._getStoreFindConfig(),
			fetch:['ScheduleState', 'PlanEstimate'],
			hydrate:['ScheduleState', 'PlanEstimate'],
			listeners: { load: cb }
		});
	},
	
	_getStoreFindConfig: function (){
		var grid = this.down('rallygrid');
		var piRecord = this.currentPiRecord;
		return {
			_ItemHierarchy: grid ? 
				{ $in: _.map(grid.getSelectionModel().getSelection(), function(record) { return record.get('ObjectID'); }) } : piRecord.data.ObjectID,
			Project: (piRecord.self.ordinal === 0 && this.onlyStoriesInCurrentProject) ? this.getContext().getProject().ObjectID : undefined,
			_TypeHierarchy:-51038, 
			Children:null,
			PlanEstimate: {$gte:0}
		};
	},
	
	_loadChartCalculator: function(){
		var me=this;
		return Ext.create('FastCfdCalculator', {
			startDate: me._getChartStartDate(me.currentPiRecord.data),
			endDate: me._getChartEndDate(me.currentPiRecord.data)
		});
	},
	
	_getChartStartDate: function (piData) {
		return new Date(piData.PlannedStartDate || piData.ActualStartDate || new Date().toString());
	},
	
	_getChartEndDate: function (piData) {
		return new Date(piData.PlannedEndDate || piData.ActualEndDate || new Date().toString());
	},

	_loadDynamicConfigValues: function () {
		var piData = this.currentPiRecord.data;
		return {
			title: this._getChartTitle(piData),
			subtitle: this._getChartSubtitle(piData),
			legend:{
				borderWidth:0,
				width:500,
				itemWidth:100
			},
			xAxis: { 
				tickInterval: 
					this._getConfiguredChartTicks(this._getChartStartDate(piData), this._getChartEndDate(piData), this.getWidth()-20) 
			}
		};
	},
	
	_getChartTitle: function (piData) {
		var widthPerCharacter = 10,
			totalCharacters = Math.floor(this.getWidth/ widthPerCharacter),
			title = "Portfolio Item Chart",
			align = "center";
		if (piData) {
			title = piData.FormattedID + ": " + piData.Name;
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
	
	_getChartSubtitle: function (piData) {
		var widthPerCharacter = 6,
			totalCharacters = Math.floor(this.getWidth() / widthPerCharacter),
			startDateString = ' (' + this._dateToStringDisplay(this._getChartStartDate(piData)) + ')', startDateType = '',
			endDateString = ' (' + this._dateToStringDisplay(this._getChartEndDate(piData)) + ')', endDateType = '',
			template = Ext.create("Ext.XTemplate",
				'<tpl>' +
					'<span>{startDateString}</span>' +
					'<tpl if="tooBig">' +
					'	<br/>' +
					'<tpl else>' +
					'	&nbsp;&nbsp;&nbsp;' +
					'</tpl>' +
					'<span>{endDateString}</span>' +
				'</tpl>'
			);
		if(piData){
			if(piData.PlannedStartDate) startDateType = 'PlannedStartDate';
			else if(piData.ActualStartDate) startDateType = 'ActualStartDate';
			startDateString = (!startDateType ? 'No start day set.' : 
				(startDateType==='PlannedStartDate' ? 'Planned' : 'Actual') + ' Start: WW' + 
				this._getWorkweek(new Date(piData[startDateType])) + startDateString);
				
			if(piData.PlannedEndDate) endDateType = 'PlannedEndDate';
			else if(piData.ActualEndDate) endDateType = 'ActualEndDate';
			endDateString = (!endDateType ? 'No end day set.' : 
				(endDateType==='PlannedEndDate' ? 'Planned' : 'Actual') + ' End: WW' + 
				this._getWorkweek(new Date(piData[endDateType])) + endDateString);
		}
		var formattedTitle = template.apply({
			startDateString: startDateString,
			endDateString: endDateString,
			tooBig: totalCharacters < startDateString.length + endDateString.length + 60
		});
		return {
			text: formattedTitle,
			useHTML: true,
			align: "center"
		};
	},

	/************************************************** updating/fixing chart data *********************************************/

	_updateHighchart: function(chart, chartData, dynConf){ //directly manipulate the highchart, avoid the Ext.js highchart extension
		var wrapper = chart.getChartWrapper(), wc = wrapper.chart, newSeries = chartData.series, y, x;
		wc.xAxis[0].update({categories:chartData.categories, tickInterval:dynConf.xAxis.tickInterval});
		wc.setTitle(dynConf.title, dynConf.subtitle);
		for(var i=0;i<newSeries.length;++i){
			var newData = newSeries[i].data, oldData=wc.series[i];
			var oldSerLen = oldData.points.length;
			var newSerLen = newData.length;
			oldData.setData(newData, false, true, false);
		}
		wc.redraw();
	},
	
	/************************************************** misc Date/time functions *********************************************/

	_dateToStringDisplay: function (date) {
		return Ext.Date.format(date, 'm/d/Y');
	},

	_dateToString: function (date) {
		return Ext.Date.format(date, 'Y-m-d\\TH:i:s.u\\Z');
	}
});