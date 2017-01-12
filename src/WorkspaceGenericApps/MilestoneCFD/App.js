/** this app shows the milestone cumulative flow charts for the scoped project
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	Ext.define('Intel.MilestoneCumulativeFlow', {
		extend: 'Intel.lib.IntelRallyApp',
		cls:'app',
		requires:[
			'Intel.lib.chart.FastCumulativeFlowCalculator'
		],
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			height:600,
			id:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				id:'milestone_container',
				flex:1,
				layout: {
					type:'hbox'
				}
			},{
				xtype:'container',
				id:'cfd_container',
				flex:2,
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */		
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.CumulativeFlowChartMixin',
			'Intel.lib.mixin.ParallelLoader'
		],
		//Get milestones store for the scoped Project
		loadMilestone: function(){
			var me = this, 
			config = {
				model:'Milestone',
				fetch:['Name', 'ObjectID', 'Projects', 'FormattedID','TargetDate'],
				context: {
					project:me.ScrumGroupRootRecord.data._ref,
					projectScopeDown:true,
					projectScopeUp:false
				}
			};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.MilestoneStore = store;
				return store;
			});			
		},
		//Get snapshots of Userstories for a given milestone
		loadSnapshotStores: function(){
			/** NOTE: _ValiTo is non-inclusive, _ValidFrom is inclusive **/
			var me = this, 
			//this has to change when different milestones are selected
				milestoneStart = new Date("2016-02-07").toISOString(),
				milestoneEnd = new Date("2017-01-01").toISOString(),
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.AllSnapshots = [];
			
			return Q.all(_.map(me.LeafProjects, function(project){
				var parallelLoaderConfig = {
					context:{ 
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					compress:true,
					findConfig: { 
						_TypeHierarchy: 'HierarchicalRequirement',
						Children: null,
						Project: project.data.ObjectID,
						_ValidFrom: { $lte: milestoneEnd },
						_ValidTo: { $gt: milestoneStart }
					},
					fetch: ['ScheduleState', 'Release', 'PlanEstimate', lowestPortfolioItem, '_ValidFrom', '_ValidTo', 'ObjectID'],
					hydrate: ['ScheduleState']
				};
				return me.parallelLoadLookbackStore(parallelLoaderConfig).then(function(snapshotStore){ 
				var records = snapshotStore.getRange();
					if(records.length > 0){
						me.AllSnapshots = me.AllSnapshots.concat(records);
					}
				});
			}));						
		},
		loadConfiguration: function(){
			var me = this;
				return Q.all([			
					me.configureIntelRallyApp().then(function(){
						var scopeProject = me.getContext().getProject();
						return me.loadProject(scopeProject.ObjectID);
					})
					.then(function(scopeProjectRecord){
						me.ProjectRecord = scopeProjectRecord;
					})
				])
			.then(function(){
				return Q.all([ //parallel loads
					me.projectInWhichScrumGroup(me.ProjectRecord) /******** load stream 1 *****/
						.then(function(scrumGroupRootRecord){
							if(scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID){
								me.ScrumGroupRootRecord = scrumGroupRootRecord;
								return me.loadScrumGroupPortfolioProject(scrumGroupRootRecord);
							}
							else return Q.reject('You are not scoped to a valid project.');
						})
						.then(function(scrumGroupPortfolioProject){
							me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
							return me.loadAllLeafProjects(me.ScrumGroupRootRecord);
						})
						.then(function(scrums){
							me.LeafProjects = _.filter(scrums, function(s){ return s.data.TeamMembers.Count > 0; });
						})
				]);
			});
		},
		renderMilestoneGrid: function(){
			var me = this;
			var gridColumns = [{
				text: 'ID',
				dataIndex: 'FormattedID',
				flex:1
			},{
				text: 'Name',
				dataIndex: 'Name',
				flex:2,
				items: [{
					xtype: 'intelgridcolumntextareafilter',
					style: {
						marginRight: '10px'
					}
				}]				
			},{
				text: 'TargetDate',
				dataIndex: 'TargetDate',
				flex:2
			}];
			
			//data for the store
			var gridData = _.map(me.MilestoneStore.getRange(),function(milestoneRecord){
				return {
					FormattedID : milestoneRecord.data.FormattedID,
					Name:  milestoneRecord.data.Name,
					TargetDate:  milestoneRecord.data.TargetDate
				}
			});
			//Custom grid Store
			var gridStore = Ext.create('Rally.data.custom.Store',{
					data:gridData
				});	
		 var leftComponent = Ext.getCmp('milestone_container');
		 var leftComponentWidth = leftComponent.componentLayout.lastComponentSize.width;
			var leftComponentHeight = leftComponent.componentLayout.lastComponentSize.height;
			var grid ={
				xtype: 'grid',
				width: leftComponentWidth,
				height: leftComponentHeight,
				scroll: 'vertical',
				resizable: false,
				columns: gridColumns,
				disableSelection: true,
				plugins: ['intelcellediting'],
				viewConfig: {
					xtype: 'inteltableview',
					preserveScrollOnRefresh: true
				},
				enableEditing: false,
				store: gridStore,
				listeners:{
					cellclick: function( table, td, cellIndex, record, tr, rowIndex, e, eOpts ){
						me.milestoneChartTitle = record.data.FormattedID;
						console.log(record.data);
						$('#cfd_container-innerCt').empty();
						//change me.AllSnapshots to be the new milestone
						me.renderChart();
					}
				}							 
		 };
		 leftComponent.add(grid);
		},	
		//draw the cumulative flow diagram
		renderChart: function(){
			var me = this,
			//this needs to come from the selected milestone
				milestoneStart = new Date("2016-02-07").toISOString(),
				milestoneEnd = new Date("2017-01-01").toISOString(),
			
				calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
					startDate: milestoneStart,
					endDate: milestoneEnd,
					scheduleStates: me.ScheduleStates
				});	
				
			var updateOptions = {trendType:'Last2Sprints'},
				aggregateChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.AllSnapshots), updateOptions);		
				
			var titleText = 	 me.milestoneChartTitle || "";
			$('#cfd_container').highcharts(
				Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
					chart: { height:400 },
					legend:{
						enabled:true,
						borderWidth:0,
						width:600
					},
					title: { text: titleText},
					xAxis: {
						categories: aggregateChartData.categories,
						tickInterval: me.getCumulativeFlowChartTicks(milestoneStart, milestoneEnd, me.getWidth()*0.66)
					},
					series: aggregateChartData.series
				})
			)[0];
		me.hideHighchartsLinks();						
		},
		hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},		
		launch: function() {
			var me = this;
			me.setLoading('Loading Configuration');
			return me.loadConfiguration()
			.then(function(){ return me.loadMilestone()})
			.then(function(){  me.renderMilestoneGrid()})
			.then(function(){return me.loadSnapshotStores()})
			.then(function(){	me.renderChart();}) 
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();
		}
	});
}());