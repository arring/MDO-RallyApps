/** this app listens for published portfolioitems to display on a chart and grid */
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define("IntelPortfolioChartAndGrid", {
		extend: 'IntelRallyApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IntelWorkweek',
			'AsyncQueue',
			'ParallelLoader',
			'CumulativeFlowChartMixin'
		],
		requires:[
			'FastCumulativeFlowCalculator'
		],
		cls: "portfolio-cfd-app",
		items: [{
			xtype: 'container',
			cls: 'navbar',
			id: 'navbar'
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
		_loadGridStore: function() {
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
			return me._reloadStore(store);
		},
		_loadChartStore: function(){	
			var me = this,
				grid = Ext.getCmp('grid'),
				piRecord = me.CurrentPortfolioItem,
				parallelLoaderConfig = {
					pagesize:20000,
					url: 'https://' + window.location.host + '/analytics/v2.0/service/rally/workspace/' + 
						me.getContext().getWorkspace().ObjectID + '/artifact/snapshot/query.js',
					params: {
						workspace: me.getContext().getWorkspace()._ref,
						compress:false, //because sometimes this takes forever
						pagesize:20000,
						find:JSON.stringify({
							_ItemHierarchy: grid ? { $in: _.map(grid.getSelectionModel().getSelection(), function(record) { 
									return record.data.ObjectID; }) 
								} : piRecord.data.ObjectID,
							Project: (piRecord.self.ordinal === 0 && me.OnlyStoriesInCurrentProject) ? 
								me.getContext().getProject().ObjectID : 
								undefined,
							_TypeHierarchy:'HierarchicalRequirement', 
							Children:null,
							PlanEstimate: {$gte:0}
						}),
						fields:JSON.stringify(['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID']),
						hydrate:JSON.stringify(['ScheduleState'])
					}
				};
			return me._parallelLoadLookbackStore(parallelLoaderConfig);
		},
		
		/********************************* Chart utility funcs *************************************************/
		_getChartStartDate: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data;
			return new Date(piData.PlannedStartDate || piData.ActualStartDate || new Date().toString());
		},
		_getChartEndDate: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data;
			return new Date(piData.PlannedEndDate || piData.ActualEndDate || new Date().toString());
		},
		_getChartTitle: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data,
				widthPerCharacter = 10,
				totalCharacters = (me.getWidth()-20)/widthPerCharacter>>0,
				title = "Portfolio Item Chart",
				align = "center";
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
		_getChartSubtitle: function(){
			var me=this,
				piData = me.CurrentPortfolioItem.data,
				widthPerCharacter = 6,
				totalCharacters = (me.getWidth()-20)/widthPerCharacter>>0,
				startDateString = ' (' + me._dateToStringDisplay(me._getChartStartDate()) + ')', startDateType = '',
				endDateString = ' (' + me._dateToStringDisplay(me._getChartEndDate()) + ')', endDateType = '',
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
					me._getWorkweek(new Date(piData[startDateType])) + startDateString);
					
				if(piData.PlannedEndDate) endDateType = 'PlannedEndDate';
				else if(piData.ActualEndDate) endDateType = 'ActualEndDate';
				endDateString = (!endDateType ? 'No end day set.' : 
					(endDateType==='PlannedEndDate' ? 'Planned' : 'Actual') + ' End: WW' + 
					me._getWorkweek(new Date(piData[endDateType])) + endDateString);
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
		_dateToStringDisplay: function(date){ 
			return Ext.Date.format(date, 'm/d/Y'); 
		},
		_dateToString: function(date){ 
			return Ext.Date.format(date, 'Y-m-d\\TH:i:s.u\\Z'); 
		},
	
		/********************************* refreshing/reloading **************************************/
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		_reloadEverything: function() {
			var me = this;
			me._enqueue(function(unlockFunc){	
				me._buildHeader();
				me._buildGrid()
					.then(function(){ return me._buildChart(); })
					.then(function(){ return me._hideHighchartsLinks(); })
					.fail(function(reason){ me._alert('ERROR', reason || ''); })
					.then(function(){ unlockFunc(); })
					.done();
			});
		},	
		
		/******************************************** launch and config/setup ************************************************/
		_subscribeToBus: function(){
			var me=this;
			me.subscribe(me, 'portfoliotreeitemselected', function(treeItem){		
				me.CurrentPortfolioItem = treeItem.getRecord();
				me._reloadEverything();
			});
		},
		launch: function () {
			var me = this;
			me.ShowGrid = false;
			me.OnlyStoriesInCurrentProject = false;
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getGlobalContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return me._loadRandomUserStory(me.ProjectRecord.data._ref);
				})
				.then(function(userStory){
					me.HasUserStories = !!userStory;
					me._subscribeToBus();
					me._reloadEverything();
				})
				.fail(function(reason){ me._alert('ERROR', reason); })
				.done();
		},

		/************************************* header components and event functions **************************************/	
		_buildShowGridCheckbox: function() {
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
							setTimeout(function(){ me._reloadEverything(); }, 0);
						}
					}
				},
				componentCls: 'show-grid-checkbox',
				id: 'show-grid-checkbox'
			});
		},
		_buildCurrentProjectOnlyCheckbox: function(){
			var me=this;
			if(me.CurrentProjectOnlyCheckbox) me.CurrentProjectOnlyCheckbox.destroy();
			me.CurrentProjectOnlyCheckbox = Ext.getCmp('navbar').add({
				xtype:'rallycheckboxfield',
				boxLabel: 'Filter User Stories in Current Project',
				value: me.OnlyStoriesInCurrentProject,
				hidden: !me.CurrentPortfolioItem || me.CurrentPortfolioItem.self.ordinal > 0 || !me.HasUserStories || !me.ShowGrid,
				listeners: {
					change: {
						fn: function(checkbox){
							me.OnlyStoriesInCurrentProject = checkbox.getValue();
							setTimeout(function(){ me._reloadEverything(); }, 0);
						}
					}
				},
				componentCls: 'current-project-only-checkbox',
				id: 'current-project-only-checkbox'
			});
		},
		_buildHeader: function(){
			var me=this;
			me._buildShowGridCheckbox();
			me._buildCurrentProjectOnlyCheckbox();
		},
		
		/************************************************* render functions ***********************************************/			
		_buildGrid: function(){
			var me=this,
				gridContainer = Ext.getCmp('gridContainer'),
				grid = Ext.getCmp('grid');
				
			if(grid) grid.destroy();
			if(!me.ShowGrid || !me.CurrentPortfolioItem) return Q();
			
			gridContainer.setLoading('Loading Data');
			return me._loadGridStore().then(function(store){
				var grid = gridContainer.add({
					xtype: 'rallygrid',
					id:'grid',
					store: store,
					columnCfgs: (me.CurrentPortfolioItem.self.ordinal===0) ? [{
						dataIndex:'FormattedID',
						editor:false,
						renderer: function(v, m ,r){
							return '<a href="https://rally1.rallydev.com/#/' + r.data.Project.ObjectID + 
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
						selectionchange: function(){ me._buildChart(); }
					}
				});
				gridContainer.setLoading(false);
				grid.getSelectionModel().selectAll(true);
			});
		},
		_buildChart: function() {
			var me = this;
			if(!me.CurrentPortfolioItem) return Q();
			Ext.getCmp('portfolioItemChart').setLoading('Loading Data');
			return me._loadChartStore().then(function(store){
				var calc = Ext.create('FastCumulativeFlowCalculator', {
						startDate: me._getChartStartDate(),
						endDate: me._getChartEndDate(),
						scheduleStates: me.ScheduleStates
					}),
					chartData = me._updateCumulativeFlowChartData(calc.runCalculation(store.getRange())),
					portfolioItemChart = $('#portfolioItemChart-innerCt').highcharts(
						Ext.Object.merge(me._defaultCumulativeFlowChartConfig, {
							chart: { height:400 },
							legend:{
								enabled:true,
								borderWidth:0,
								width:500,
								itemWidth:100
							},
							title: me._getChartTitle(),
							subtitle: me._getChartSubtitle(),
							xAxis:{
								categories: chartData.categories,
								tickInterval: me._getCumulativeFlowChartTicks(me._getChartStartDate(), me._getChartEndDate(), me.getWidth()-20)
							},
							series: chartData.series
						})
					)[0];
				me._setCumulativeFlowChartDatemap(portfolioItemChart.childNodes[0].id, chartData.datemap);
				me.doLayout();
				Ext.getCmp('portfolioItemChart').setLoading(false);
			});
		}
	});
}());