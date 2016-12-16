/** this app listens for published portfolioitems to display on a chart and grid */
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define("Intel.PortfolioNavigator.ChartAndGrid", {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.CumulativeFlowChartMixin'
		],
		requires:[
			'Intel.lib.chart.FastCumulativeFlowCalculator'
		],
		cls: "portfolio-cfd-app",
		items: [{
			xtype: 'container',
			cls: 'navbar',
			id: 'navbar',
			layout:'hbox'
		},{
			xtype: 'container',
			id: 'portfolioItemChart',
			cls: 'portfolio-item-chart',
			minHeight:100
		},{
			xtype: 'container',
			id: 'gridContainer',
			cls:'portfolio-item-grid'
		}],
			
		/******************************** stores/data ***********************************************/
		loadGridStore: function() {
			var me=this,
				piLevel = me.CurrentPortfolioItem.self.ordinal,
				filters = [], sorters = [];
			if(piLevel === 0){
				sorters.push({
					property: 'ScheduleState',
					direction: 'ASC'
				});
				if(me.OnlyStoriesInCurrentProject){
					filters.push({
						property: 'Project.ObjectID',
						value: me.getContext().getProject().ObjectID
					});
				}
			}
			var store = Ext.create('Rally.data.wsapi.Store', {
				model:(piLevel === 0 ? 'HierarchicalRequirement' : 'PortfolioItem'),
				limit:Infinity, 
				autoLoad:false,
				remoteSort:false,
				fetch:(piLevel === 0 ? [
					'ObjectID', 'FormattedID', 'Name', 'PlanEstimate', 'Iteration', 'ScheduleState', 'Project', 'DirectChildrenCount'] : [
					'ObjectID', 'FormattedID', 'Name', 'Project']),
				context:{
					workspace:me.getContext().getWorkspace()._ref,
					project:null
				},
				sorters:sorters,
				filters: filters.concat([{
					property:(piLevel === 0 ? 'PortfolioItem.ObjectID' : 'Parent.ObjectID'),
					value:me.CurrentPortfolioItem.data.ObjectID
				}])
			});
			return me.reloadStore(store);
		},
		loadChartStore: function(){	
			var me = this,
				grid = Ext.getCmp('grid'),
				piRecord = me.CurrentPortfolioItem;
			if(grid){
				return Q.all(_.map(grid.getSelectionModel().getSelection(), function(record){ //faster to make many requests insteadof using $in
					var parallelLoaderConfig = {
						context: {
							workspace: me.getContext().getWorkspace()._ref,
							project:null
						},
						compress:true,
						findConfig: {
							Project: (piRecord.self.ordinal === 0 && me.OnlyStoriesInCurrentProject) ? 
								me.getContext().getProject().ObjectID : 
								undefined,
							_ItemHierarchy: record.data.ObjectID,
							_TypeHierarchy:'HierarchicalRequirement', 
							Children:null
						},
						fetch: ['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID'],
						hydrate: ['ScheduleState']
					};
					return me.parallelLoadLookbackStore(parallelLoaderConfig);
				}))
				.then(function(stores){
					var items = _.reduce(stores, function(d, store){ return d.concat(store.getRange()); }, []);
					return Ext.create('Rally.data.lookback.SnapshotStore', {
						totalCount: items.length,
						data: items,
						disableMetaChangeEvent: true,
						model: Ext.define('Rally.data.lookback.SnapshotModel-' + Ext.id(), {
							extend: 'Rally.data.lookback.SnapshotModel',
							fetch: ['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID']
						}),
						load: function(){}
					});
				});
			} else {
				var parallelLoaderConfig = {
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					compress:true,
					findConfig: {
						Project: (piRecord.self.ordinal === 0 && me.OnlyStoriesInCurrentProject) ? me.getContext().getProject().ObjectID : undefined,
						_ItemHierarchy: piRecord.data.ObjectID,
						_TypeHierarchy:'HierarchicalRequirement', 
						Children:null
					},
					fetch: ['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID'],
					hydrate: ['ScheduleState']
				};
				return me.parallelLoadLookbackStore(parallelLoaderConfig);
			}
		},
		
		/********************************* Chart utility funcs *************************************************/
		getChartStartDate: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data;
			return new Date(piData.PlannedStartDate || piData.ActualStartDate || new Date().toString());
		},
		getChartEndDate: function(){
            var me=this;
            var piData = me.CurrentPortfolioItem.data;
            //The original end date
            var date = new Date(piData.PlannedEndDate || piData.ActualEndDate || new Date().toString());
            if(me.CurrentPortfolioItem.data.chartTitle && me.CurrentPortfolioItem.data.chartTitle === "Portfolio Item Chart") {
                //Add 5 weeks to the original end date
                date.setDate(date.getDate() + 35);
            }
            return date;
		},
		getChartTitle: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data,
				widthPerCharacter = 10,
				totalCharacters = (me.getWidth()-20)/widthPerCharacter>>0,
				title = "Portfolio Item Chart",
				align = "center";
            me.CurrentPortfolioItem.data.chartTitle = title;
			if(piData) title = piData.FormattedID + ": " + piData.Name;
			if(totalCharacters < title.length){
				title = title.substring(0, totalCharacters) + "...";
				align = "left";
			}
			return {
				text: title,
				align: align,
				margin: 30
			};
		},
		getChartSubtitle: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data,
				widthPerCharacter = 6,
				totalCharacters = (me.getWidth()-20)/widthPerCharacter>>0,
				startDateString = ' (' + me.dateToStringDisplay(me.getChartStartDate()) + ')', startDateType = '',
				endDateString = ' (' + me.dateToStringDisplay(me.getChartEndDate()) + ')', endDateType = '',
				template = Ext.create("Ext.XTemplate",
					'<tpl>' +
						'<span>{startDateString}</span>' +
						'<tpl if="tooBig">' +
						    '	<br/>' +
						'<tpl else>' +
						    '	&nbsp;&nbsp;&nbsp;' +
						'</tpl>' +
						'<span>{endDateString}</span>' +
                        '<tpl if="portfolioNav">' +
                            '	&nbsp;&nbsp;&nbsp;' +
                            '<span>' + " Projected End: " + me.projectedEndDate + '</span>' +
                        '</tpl>' +
					'</tpl>'
				);
			if(piData){
				if(piData.PlannedStartDate) startDateType = 'PlannedStartDate';
				else if(piData.ActualStartDate) startDateType = 'ActualStartDate';
				startDateString = (!startDateType ? 'No start day set.' : 
					(startDateType==='PlannedStartDate' ? 'Planned' : 'Actual') + ' Start: WW' + 
					me.getWorkweek(new Date(piData[startDateType])) + startDateString);
					
				if(piData.PlannedEndDate) endDateType = 'PlannedEndDate';
				else if(piData.ActualEndDate) endDateType = 'ActualEndDate';
				endDateString = (!endDateType ? 'No end day set.' : 
					(endDateType==='PlannedEndDate' ? 'Planned' : 'Actual') + ' End: WW' + 
					me.getWorkweek(new Date(piData[endDateType])) + endDateString);
			}
			var formattedTitle = template.apply({
				startDateString: startDateString,
				endDateString: endDateString,
				tooBig: totalCharacters < startDateString.length + endDateString.length + 60,
                portfolioNav: (me.CurrentPortfolioItem.data.chartTitle && me.CurrentPortfolioItem.data.chartTitle === "Portfolio Item Chart") ? true : false
			});
			return {
				text: formattedTitle,
				useHTML: true,
				align: "center"
			};
		},
		dateToStringDisplay: function(date){ 
			return Ext.Date.format(date, 'm/d/Y'); 
		},
	
		/********************************* refreshing/reloading **************************************/
		hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		reloadEverything: function() {
			var me = this;
			me.enqueue(function(unlockFunc){	
				me.renderHeader();
				me.renderGrid()
					.then(function(){ return me.renderChart(); })
					.then(function(){ 
						me.doLayout();
						me.hideHighchartsLinks(); 
					})
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ unlockFunc(); })
					.done();
			});
		},	
		
		/******************************************** launch and config/setup ************************************************/
		subscribeToBus: function(){
			var me=this;
			me.subscribe(me, 'portfoliotreeitemselected', function(treeItem){		
				me.CurrentPortfolioItem = treeItem.getRecord();
				me.reloadEverything();
			});
		},
		launch: function () {
			var me = this;
			me.ShowGrid = false;
			me.OnlyStoriesInCurrentProject = false;
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getGlobalContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return me.loadRandomUserStory(me.ProjectRecord);
				})
				.then(function(userStory){
					me.HasUserStories = !!userStory;
					me.subscribeToBus();
					me.reloadEverything();
				})
				.fail(function(reason){ me.alert('ERROR', reason); })
				.done();
		},

		/************************************* header components and event functions **************************************/	
		renderShowGridCheckbox: function() {
			var me=this;
			if(me.ShowGridCheckbox) me.ShowGridCheckbox.destroy();
			me.ShowGridCheckbox = Ext.getCmp('navbar').add({
				xtype:'rallycheckboxfield',
				boxLabel: 'Show Grid',
				value: me.ShowGrid,
				listeners: {
					change: {
						fn: function(checkbox){
							me.ShowGrid = checkbox.getValue();
							setTimeout(function(){ me.reloadEverything(); }, 0);
						}
					}
				},
				componentCls: 'show-grid-checkbox',
				id: 'show-grid-checkbox'
			});
		},
		renderCurrentProjectOnlyCheckbox: function(){
			var me=this;
			if(me.CurrentProjectOnlyCheckbox) me.CurrentProjectOnlyCheckbox.destroy();
			me.CurrentProjectOnlyCheckbox = Ext.getCmp('navbar').add({
				xtype:'rallycheckboxfield',
				boxLabel: 'Filter User Stories in Current Project',
				value: me.OnlyStoriesInCurrentProject,
				hidden: !me.CurrentPortfolioItem || me.CurrentPortfolioItem.self.ordinal > 0 || !me.HasUserStories,
				listeners: {
					change: {
						fn: function(checkbox){
							me.OnlyStoriesInCurrentProject = checkbox.getValue();
							setTimeout(function(){ me.reloadEverything(); }, 0);
						}
					}
				},
				componentCls: 'current-project-only-checkbox',
				id: 'current-project-only-checkbox'
			});
		},
		renderHeader: function(){
			var me=this;
			me.renderShowGridCheckbox();
			me.renderCurrentProjectOnlyCheckbox();
		},
		
		/************************************************* render functions ***********************************************/			
		renderGrid: function(){
			var me=this,
				gridContainer = Ext.getCmp('gridContainer'),
				grid = Ext.getCmp('grid');
				
			if(grid) grid.destroy();
			if(!me.ShowGrid || !me.CurrentPortfolioItem) return Q();
			
			gridContainer.setLoading('Loading Data');
			return me.loadGridStore().then(function(store){
				var grid = gridContainer.add({
					xtype: 'rallygrid',
					id:'grid',
					store: store,
					columnCfgs: (me.CurrentPortfolioItem.self.ordinal===0) ? [{
						dataIndex:'FormattedID',
						editor:false,
						renderer: function(v, m ,r){
							return '<a href="' + me.BaseUrl + '/#/' + r.data.Project.ObjectID + 
								'd/detail/userstory/' + r.data.ObjectID + '" target="_blank">' + v + '</a>';
						}
					}, 'Name', 'PlanEstimate', {
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
							if(v) return '<a href="' + me.BaseUrl + '/#/' + r.data.Iteration.Project.ObjectID + 
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
							return '<a href="' + me.BaseUrl + '/#/' + r.data.Project.ObjectID + 
								'd/detail/userstory/' + r.data.ObjectID + '/children" target="_blank">' + v + '</a>';
						}
					}] : ['FormattedID','Name','Project'],
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
						selectionchange: function(){ 
							me.enqueue(function(unlockFunc){	
								me.renderChart().then(function(){ 
									me.doLayout();
									me.hideHighchartsLinks(); 
								})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){ unlockFunc(); })
								.done();
							});
						}
					}
				});
				gridContainer.setLoading(false);
				grid.getSelectionModel().selectAll(true);
			});
		},
		renderChart: function() {
			var me = this;
			if(!me.CurrentPortfolioItem) return Q();
			Ext.getCmp('portfolioItemChart').setLoading('Loading Data');
			return me.loadChartStore().then(function(store){
				var calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
						startDate: me.getChartStartDate(),
						endDate: me.getChartEndDate(),
						scheduleStates: me.ScheduleStates
					}),
					updateOptions = {trendType:'LastSprint'},		
					chartData = me.updateCumulativeFlowChartData(calc.runCalculation(store.getRange()), updateOptions),
					portfolioItemChart = $('#portfolioItemChart-innerCt').highcharts(
						Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
							chart: { height:400 },
							legend:{
								enabled:true,
								borderWidth:0,
								width:500,
								itemWidth:100
							},
							title: me.getChartTitle(),
							subtitle: me.getChartSubtitle(),
							xAxis:{
								categories: chartData.categories,
								tickInterval: me.getCumulativeFlowChartTicks(me.getChartStartDate(), me.getChartEndDate(), me.getWidth()-20)
							},
							series: chartData.series
						})
					)[0];
				me.setCumulativeFlowChartDatemap(portfolioItemChart.childNodes[0].id, chartData.datemap);
				me.doLayout();
				Ext.getCmp('portfolioItemChart').setLoading(false);
			});
		}
	});
}());