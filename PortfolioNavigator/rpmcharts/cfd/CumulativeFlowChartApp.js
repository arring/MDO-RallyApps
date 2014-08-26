Ext.define("Rally.apps.charts.rpm.cfd.CumulativeFlowChartApp", {
	extend: "Rally.app.App",
	cls: "portfolio-cfd-app",
	
	requires: [
		'Rally.ui.combobox.ComboBox',
		'Rally.util.Test',
		'Rally.ui.chart.Chart'
	],

	layout: {
		type:   'vbox',
		align:  'left'
	},
	
	help: {
		cls: 'portfolio-cfd-help-container',
		id: 274
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
		},{
			xtype:  'container',
			itemId: 'bottom',
			minHeight: 100
		}
	],
	
	_defaultChartConfig: {
		chart: {
			defaultSeriesType: "area",
			zoomType: "xy"
		},
		colors:['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F', '#000000','#26FF00'],
		xAxis: {
			tickmarkPlacement: "on",
			tickInterval: 5,
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
				return "<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ")<br />" + this.series.name + ": " + this.y;
			}
		},
		legend:{
			itemWidth:100,
			width:100*5	
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
	
	/********************************************************* launch and config/setup **********************************************************/
	_defineClasses:function(){
		Ext.define("lameCalculator", {
			constructor: function(config) { //you MUST give this calculator scheduleStates, startDate, and endDate. That is all
				for(var k in config) this[k] = config[k];
				return this;
			},
			
			_getDates:function(){
				var dates = [], curDay = this.startDate, day=1000*60*60*24;
				while(curDay<=this.endDate){
					var n = curDay.getDay(); 
					if(n!==0 && n!==6) dates.push(curDay); //dont get weekends
					curDay = new Date(curDay*1 + day);
				}
				return dates;
			},
			
			_dateToStringDisplay: function (date) {
				return Ext.Date.format(date, 'm/d/Y');
			},
			
			_getIndexHelper:function(d,ds){ //binsearches for the closest date to d
				var curVal = (ds.length/2), curInt = (curVal>>0), div=(curVal/2), lastInt=-1;
				while(curInt !== lastInt){
					if(ds[curInt]===d) return curInt;
					else if(ds[curInt]>d) curVal-=div;
					else curVal+=div;
					div/=2;
					lastInt = curInt;
					curInt = curVal>>0;
				}
				return curInt;
			},
			
			_getIndexOnOrBefore: function(d, ds){
				if(ds.length===0) return -1;
				var pos = this._getIndexHelper(d,ds);
				if(pos===0) { if(ds[pos] <= d) return pos; else return -1; } //either start of list or everything is after d
				else if(ds[pos] <= d) return pos;
				else return pos-1;
			},
			
			_getIndexOnOrAfter: function(d, ds){
				if(ds.length===0) return -1;
				var pos = this._getIndexHelper(d,ds);
				if(pos===ds.length-1) { if(ds[pos] >= d) return pos; else return -1; } //either start of list or everything is after d
				else if(ds[pos] >= d) return pos;
				else return pos+1;
			},
			
			runCalculation:function(items){
				if(!this.scheduleStates || !this.startDate || !this.endDate) {
					console.log('invalid constructor config', this); return; }
				var dates = this._getDates(), day=1000*3600*24;
				var totals = _.reduce(this.scheduleStates, function(map, ss){ 
					map[ss] = _.map(new Array(dates.length), function(){ return 0;}); 
					return map; 
				}, {});
				_.each(items, function(item){
					item = item.raw; //dont work with records;
					var iStart = new Date(item._ValidFrom),
						iEnd = new Date(item._ValidTo), 
						state = item.ScheduleState, 
						pe = item.PlanEstimate;
					if(!pe || ((iStart/day>>0) === (iEnd/day>>0))) return; //no need to continue with this one
					var startIndex = this._getIndexOnOrAfter(iStart, dates), 
						endIndex = this._getIndexOnOrBefore(iEnd, dates);
					if(startIndex===-1 || endIndex===-1) return; //no need to continue here
					for(var i=startIndex;i<=endIndex;++i)
						totals[state][i]+=pe;
				}, this);
				return {
					categories:_.map(dates, function(d){ return this._dateToStringDisplay(d); }, this), 
					series: _.reduce(this.scheduleStates, function(ar, ss){
						return ar.concat([{name:ss, type:'area', dashStyle:'Solid', data:totals[ss]}]);
					}, [])
				};
			}
		});
	},
	
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
				me.ScheduleStateValues = Ext.Array.map(records, function (record) {
					return record.get('StringValue');
				});
				cb();
			}
		});
	},

	_subscribeToBus: function(){
		this.subscribe(this, 'portfoliotreeitemselected', function(treeItem){					
			this.currentPiRecord = treeItem.getRecord();
			this._refreshComponents();
		}, this);
	},
	
	launch: function () {
		var me = this;
		console.log('chart app launched');
		me.down('#top').setWidth(me.getWidth()-20);
		me.down('#bottom').setWidth(me.getWidth()-20);
		me._defineClasses();
		if (Rally && Rally.sdk && Rally.sdk.dependencies && Rally.sdk.dependencies.Analytics) {
			Rally.sdk.dependencies.Analytics.load(function(){			
				me._initModels(function(){
					me._initScheduleStateValues(function(){
						me._subscribeToBus();
						me._drawHeader();
					});
				});
			});
		}
	},

	/************************************************* header componenets and event functions **************************************************/
	
	_drawHeader: function(){
		var header = this.down('#header');
		header.add(this._buildHelpComponent());
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
						this._refreshComponents();
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
		var grid = this.down('rallygrid'), 
			chart = this.down('rallychart'),
			me = this;		
		
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
				'FormattedID', 'Name', 'PlanEstimate', 'Iteration', 'ScheduleState', 'Project', 'DirectChildrenCount'] : [
				'FormattedID', 'Name', 'Project']),
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
							'd/detail/userstory/' + r.data.Iteration.ObjectID + '" target="_blank">' + v.Name + '</a>';
							
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
						return '<a href="https://rally1.rallydev.com/#/' + r.data.Project._ref.split('/')[2] + 
							'd/detail/userstory/' + r.data.ObjectID + '/children" target="_blank">' + v + '</a>';
					}
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
		var piData = this.currentPiRecord.data;
		return Ext.create('lameCalculator', {
			startDate: this._getChartStartDate(piData),
			endDate: this._getChartEndDate(piData),
			scheduleStates: this.ScheduleStateValues
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
			xAxis: { 
				tickInterval: this._getConfiguredChartTicks(this._getChartStartDate(piData), this._getChartEndDate(piData)) 
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
	
	_getConfiguredChartTicks: function (startDate, endDate) {
		var pixelTickWidth = 80,
			appWidth = this.getWidth(),
			ticks = Math.floor(appWidth / pixelTickWidth);
		var days = Math.floor((endDate*1 - startDate*1) / (86400000*5/7)); //only workdays
		var interval = Math.floor(Math.floor(days / ticks) / 5) * 5;
		if(interval < 5) return 5; //make it weekly at the minimum
		else return interval;
	},
			
	/************************************************** updating/fixing chart data *********************************************/
	
	_updateChartData: function(data){
		var me = this, now = new Date();
		window.Datemap = []; //for the tooltip to have extra info to display on the chart
		
		//get ideal trendline
		var total = _.reduce(data.series, function(sum, s){return sum + (s.data[s.data.length-1] || 0); }, 0) || 0,
			idealTrend = {type:'spline', dashStyle:'Solid', name:'Ideal', data:new Array(data.categories.length)},
			ratio = (total/(data.categories.length-1)) || 0; //for NaN
		idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
		
		//zero future points, convert to workweeks, and set window.Datemap
		_.each(data.categories, function(c, i, a){
			var d = new Date(c);
			a[i] = 'WW' + me._getWorkweek(d);
			window.Datemap[i] = c;
			if(d>now){
				_.each(data.series, function(s, j){
					s.data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
				});
			}
		});
		
		//get projected trendline
		var s = _.find(data.series, function(s){ return s.name === 'Accepted'; }), i,
			projectedTrend = {type:'spline', dashStyle:'Solid', name:'Projected', data:s.data.slice()},
			begin=0, end=projectedTrend.data.length-1;
		for(i=1;i<projectedTrend.data.length;++i)
			if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
				begin = i-1; break; }
		for(i=begin+1;i<projectedTrend.data.length;++i)
			if(projectedTrend.data[i]===0){
				end = i-1; break; }
		ratio = end===begin ? 0 : (projectedTrend.data[end] - 0)/(end-begin);
		projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
			if(j>=begin) return Math.round(100*(0 + (j-begin)*ratio))/100;
			else return p; 
		});

		//apply label to correct point if needed
		for(i=0;i<projectedTrend.data.length;++i)
			if(projectedTrend.data[i] >= total){
				projectedTrend.data[i] = {
					dataLabels: {
						enabled: true,
						backgroundColor:'white',
						borderColor:'black',
						borderRadius:3,
						borderWidth:1,
						formatter: function () {
							return "<b>100% Complete</b><br />" + 
								"<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ")";
						},
						align:'center', y:-24
					},
					color:'red',
					marker:{
						enabled:true,
						lineWidth:4,
						symbol:'circle',
						fillColor:'red',
						lineColor:'red'
					},
					y: projectedTrend.data[i]
				};
				break;
			}
		
		data.series.push(projectedTrend);
		data.series.push(idealTrend);
		return data;
	},
	
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
	
	_getWorkweek: function(date){ //calculates intel workweek, returns integer
		if(!(date instanceof Date)) return;
		var me = this, oneDay = 1000 * 60 * 60 * 24,
			yearStart = new Date(date.getFullYear(), 0, 1),
			dayIndex = yearStart.getDay(),
			ww01Start = yearStart - dayIndex*oneDay,
			timeDiff = date - ww01Start,
			dayDiff = timeDiff / oneDay,
			ww = Math.floor(dayDiff/7) + 1,
			leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay(),
			weekCount = ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52; //intel weeks in this year
		return weekCount < ww ? (ww - weekCount) : ww;
	},
	
	_dateToStringDisplay: function (date) {
		return Ext.Date.format(date, 'm/d/Y');
	},

	_dateToString: function (date) {
		return Ext.Date.format(date, 'Y-m-d\\TH:i:s.u\\Z');
	}
});