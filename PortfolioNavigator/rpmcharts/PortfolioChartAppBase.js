(function () {
	var Ext = window.Ext4 || window.Ext;
	Ext.define("Rally.apps.charts.rpm.PortfolioChartAppBase", {
		extend: "Rally.app.App",
		
		requires: [
			'Rally.ui.combobox.ComboBox',
			'Rally.util.Test',
            'Rally.ui.chart.Chart'
		],
		
		mixins: [
			'Rally.apps.charts.DateMixin'
		],

		layout: {
			type:   'vbox',
			align:  'stretch'
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
		
		/********************************************************* launch and config/setup **********************************************************/
		
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
			this.subscribe(this, 'portfoliotreeitemselected', function(){					
				this.currentPiRecord = treeItem.getRecord();
				this._refreshComponents();
			}, this);
		},
		
		launch: function () {
			var me = this;
			console.log('chart app launched');
			me._initModels(function(){
				me._initScheduleStateValues(function(){
					me._subscribeToBus();
					me._drawHeader();
				});
			});
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
			
			me._showOrHideCheckboxes();
			
			//update or create grid
			if(me.showGrid && me.currentPiRecord){
				if(grid) grid.destroy();
				me._loadGridStore(function(store, piLevel){ me._showGrid(store, piLevel);});
			} else if(grid) grid.destroy();

			//update or create chart
			if(this.currentPiRecord) {
				me._loadChartStore(function(store){
					var chartData = me._loadChartCalculator().runCalculation(store.getRange()),
						dynConf = me._loadDynamicConfigValues();
					if(!chart) me._showChart(chartData, dynConf);
					else {
						chart.setChartData(chartData);
						chart.setChartConfig(dynConf);
					}
				});
			} else if(chart) chart.destroy();
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
						property: 'Project',
						operator: '=',
						value: this.getContext().getDataContext().project
					});
				}
			}
			this.down('#bottom').setLoading("Loading grid...");
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
						fn: function(store){ cb() },
						scope:this,
						single:true
					}
				}
			});
		},
		
		_showGrid: function(store, piLevel){
			this.down('#bottom').setLoading(false);
			var grid = this.down('#bottom').add({
				xtype: 'rallygrid',
				store: store,
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
				selType: 'checkboxmodel',
				selModel:'SIMPLE',
				enableEditing: false,
				autoScroll: true,
				height: 500,
				showPagingToolbar: false
			});
			grid.getSelectionModel().selectAll(true);
			grid.on('selectionchange', this._onSelectionChange, this);
		},
				
		_onSelectionChange: function(grid, selected) {
			var me = this;
			me._loadChartStore(function(store){
				chart.setChartConfig(me._getDynamicConfigValues());
				chart.setChartData(me._loadChartCalculator().runCalculation(store.getRange()));
			});
		},
		
		/************************************************* chart handler functions **************************************************/
		
		_showChart: function(chartData, dynamicConfig) {
			var me = this;
			me.down('#top').add(Ext.apply({
				xtype: "rallychart",
				queryErrorMessage: "No data to display.<br /><br />Most likely, stories are either not yet available or started for this portfolio item.",
				aggregationErrorMessage: "No data to display.<br /><br />Check the data type setting for displaying data based on count versus plan estimate.",
				chartColors:['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F'],
				chart: {
					defaultSeriesType: "area",
					zoomType: "xy"
				},
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
			}, (dynamicConfig || {})));
		},
		
		_loadChartStore: function(cb){	
			Ext.create('Rally.data.lookback.SnapshotStore', {
				autoLoad:true,
				limit: Infinity,
				compress:true,
				context:{ 
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				find: this._getStoreFindConfig(this.currentPiRecord),
				fetch:['ScheduleState', 'PlanEstimate'],
				hydrate:['ScheduleState', 'PlanEstimate'],
				listeners: { load: cb }
			});
		},
		
		_getStoreFindConfig: function (){
			var grid = this.down('rallygrid');
			var piRecord = this.currentPiRecord;
			return {
				_ItemHierarchy: ((good && this.onlyStoriesInCurrentProject)
					? { $in: _.map(grid.getSelectionModel().getSelection(), function(record) { return record.getId(); }) }
					: piRecord.data.ObjectID),
				Project: (piRecord.self.ordinal === 0 && this.onlyStoriesInCurrentProject) 
					? this.getContext().getProject()._ref : ''
			};
		},
		
		_loadChartCalculator: function(){
			var piData = this.currentPiRecord.data;
			return Ext.create('Rally.apps.charts.rpm.cfd.CumulativeFlowCalculator', {
				startDate: this._getChartStartDate(piData),
				endDate: this._getChartEndDate(piData),
				timeZone: this._getTimeZone(),
				scheduleStates: this.ScheduleStateValues
			});
		},
		
		_getChartStartDate: function (piData) {
			return this.dateToString(piData.PlannedStartDate || piData.ActualStartDate || new Date());
		},
		
		_getChartEndDate: function (piData) {
			return this.dateToString(piData.PlannedEndDate || piData.ActualEndDate || new Date());
		},
		
		_getTimeZone: function () {
			return this.getContext().getUser().UserProfile.TimeZone || this.getContext().getWorkspace().WorkspaceConfiguration.TimeZone;
		},
		
		_loadDynamicConfigValues: function () {
			var piData = this.currentPiRecord.data;
			return {
				title: this._getChartTitle(piData),
				subtitle: this._getChartSubtitle(piData),
				xAxis: {tickInterval: this._getConfiguredChartTicks(this._getChartStartDate(piData),  this._getChartEndDate(piData)) }
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
				startDateString = ' (' + this._getChartStartDate(piData) + ')', startDateType = '',
				endDateString = ' (' + this._getChartEndDate(piData) + ')', endDateType = '',
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
				else if(pidData.ActualStartDate) startDateType = 'ActualStartDate';
				startDateString = (startDateType ? 'No start day set.' : 
					(startDateType==='PlannedStartDate' ? 'Planned' : 'Actual') + ' Start: WW' + 
					this._getWorkweek(new Date(piData[startDateType])) + startDateString);
					
				if(piData.PlannedEndDate) endDateType = 'PlannedEndDate';
				else if(pidData.ActualEndDate) endDateType = 'ActualEndDate';
				endDateString = (endDateType ? 'No end day set.' : 
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
			var days = Math.floor(new Date(startDate) - new Date(endDate)) / (86400000*5/7)); //only workdays
			var interval = Math.floor(Math.floor(days / ticks) / 5) * 5;
			if(interval < 5) return 5; //make it weekly at the minimum
			else return interval;
		},
				
		/************************************************** updating/fixing chart data *********************************************/
		
		_updateChartData: function(data){
			window.Datemap = []; //for the tooltip to have extra info to display on the chart
			
			//get ideal trendline
			var total = _.reduce(data.series, function(sum, s){return sum + (s.data[s.data.length-1] || 0); }, 0),
				idealTrend = {type:'line', dashStyle:'Solid', name:'Ideal', color:'#26FF00', data:new Array(s.data.length)},
				ratio = total/(s.data.length);
			idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
			
			//zero future points, convert to workweeks, and set window.Datemap
			_.each(data.categories, function(c, i, a){
				var d = new Date(c);
				a[i] = 'WW' + this._getWorkweek(d);
				window.Datemap[i] = c;
				if(d>now){
					_.each(data.series, function(s, j){
						data.series[j].data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
					});
				}
			});
			
			//get projected trendline
			var s = _.find(data.series, function(s){ return s.name === 'Accepted'; }), i,
				projectedTrend = {type:'line', dashStyle:'Solid', name:'Projected', color:'black', data:s.data.slice()},
				begin=0, end=projectedTrend.data.length-1;
			for(i=1;i<projectedTrend.data.length;++i)
				if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
					begin = i-1; break; }
			for(i=begin+1;i<projectedTrend.data.length;++i)
				if(projectedTrend.data[i]===0){
					end = i-1; break; }
			ratio = (projectedTrend.data[end] - 0)/(end-begin);
			projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
				if(j>=begin) return Math.round(100*(0 + (j-begin)*ratio))/100;
				else return p; 
			});

			data.series.push(projectedTrend);
			data.series.push(idealTrend);
			return data;
		}
	});
}());