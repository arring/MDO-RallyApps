/**
	There is still a lot of bugs in this. they all have to be fixed before master merges.
*/

(function() {
	var Ext = window.Ext4 || window.Ext,
		CONTINUOUS_IMPROVEMENT_TOKEN = 'STDCI'; //the token in the top portfolioItem name
	
	Ext.define('Intel.ContinuousImprovementReport', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.ParallelLoader'
		],
		items: [{
			xtype: 'container',
			id: 'controls-container',
			layout: 'column',
			border: 1,
			style: {
				borderColor: 'black',
				borderStyle: 'solid'
			},
			items: [{
				xtype: 'container',
				id: 'general-controls-container',
				columnWidth: 0.14
			},{
				xtype: 'container',
				id: 'backlog-chart-controls-container',
				columnWidth: 0.84,
				layout: 'hbox'
			},{
				xtype: 'button',
				id: 'create-story-button',
				cls: 'intel-button',
				text: '+ Add New Story',
				style: {
					float: 'right'
				},
				listeners: {
					click: function() {
						var me = Rally.getApp();
						Rally.nav.Manager.create('HierarchicalRequirement', {
							Project: me.ProjectRecord.data._ref,
							Release: me.ReleaseRecord.data._ref
						});
					}
				}
			}]
		},{
			xtype: 'container',
			id: 'chart-and-grid-container',
			layout: 'column',
			items: [{
				xtype: 'container',
				id: 'chart-container',
				columnWidth: 0.49,
				padding: '0 10 0 0',
				items: [{
					xtype: 'container',
					id: 'backlog-chart-container'
				},{
					xtype: 'container',
					id: 'pie-chart-container',
					layout: 'column',
					items: [{
						xtype: 'container',
						id: 'state-chart-container',
						columnWidth: 0.49
					},{
						xtype: 'container',
						id: 'percentage-chart-container',
						columnWidth: 0.49
					}]
				}]
			},{
				xtype: 'container',
				id: 'grid-container',
				padding: '0 5 0 0',
				columnWidth: 0.49
			}]
		}],
		userStoryFields: ['Name', 'ObjectID', 'FormattedID', 'CreationDate', 
			'AcceptedDate','Iteration', 'StartDate', 'EndDate', 'ScheduleState'],
		minWidth: 910,
		
		/**************************************** Launch ******************************************/
		launch: function() {
			var me = this;
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.setLoading('Loading configuration');
			me.configureIntelRallyApp()
			.then(function(){ return me.loadPreferences(); })
			.then (function() {
				var scopedProject = me.getContext().getProject();
				return me.loadProject(scopedProject.ObjectID);
			})
			.then(function(projectRecord){
				if(projectRecord.data.Children.Count !== 0) throw 'You must be scoped to a scrum';
				else me.ProjectRecord = projectRecord;
			})
			.then(function(){
				//load all releases from the past till the current release
				var twelveWeeksFromNow = new Date(new Date()*1 + 1000*60*60*24*7*12);
				return me.loadReleasesBeforeGivenDate(me.ProjectRecord, twelveWeeksFromNow).then(function(releaseRecords){
					me.ReleaseRecords = _.sortBy(releaseRecords, function(rr){ return (-1)*new Date(rr.data.ReleaseDate); });
					me.ReleaseRecord = me.getScopedRelease(me.ReleaseRecords);
				});
			})
			.then(function() {
				return me.projectInWhichScrumGroup(me.ProjectRecord).then(function(scrumGroupRootRecord){
					if(!scrumGroupRootRecord) throw "team is not in a scrum group";
					else return me.loadScrumGroupPortfolioProject(scrumGroupRootRecord);
				});
			})
			.then(function(portfolioProject){ 
				me.ScrumGroupPortfolioProject = portfolioProject; 
				me.setLoading('Loading data');
				return me.loadPortfolioItems();
			})
			.then(function(){ return me.loadUserStories(); })
			.then(function(){ if (me.isShowingAllReleases) return me.loadIterations(); })
			.then(function(){ return me.loadUI(); })
			.fail(function(reason){ me.alert('Error', reason); })
			.then(function(){ me.setLoading(false); })
			.done();
		},
		
		/**************************************** Data Loading ************************************/
		loadPortfolioItems: function(){
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type){
				return me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type);			
			}))
			.then(function(portfolioItemStores){
				var portfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);
				me.LowestFilteredPortfolioItems = _.filter(portfolioItemStores[0].getRange(), function(lowestPortfolioItem){
					var topPortfolioItemName = portfolioItemMap[lowestPortfolioItem.data.ObjectID];
					return topPortfolioItemName && _.contains(topPortfolioItemName, CONTINUOUS_IMPROVEMENT_TOKEN);
				});
			});
		},
		
		createStoryFilter: function(portfolioItemRecords){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				validReleases = me.isShowingAllReleases ? me.ReleaseRecords : [me.ReleaseRecord],
				releaseFilter = _.reduce(validReleases, function(filter, releaseRecord){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: releaseRecord.data.Name });
					return filter ? filter.or(newFilter) : newFilter;
				}, null),
				leafStoryFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'DirectChildrenCount', value: 0}),
				portfolioItemFilter = _.reduce(portfolioItemRecords, function(filter, portfolioItemRecord){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {
						property: lowestPortfolioItemType + '.ObjectID', 
						value: portfolioItemRecord.data.ObjectID 
					});
					return filter ? filter.or(newFilter) : newFilter;
				}, null);
		
			return releaseFilter.and(leafStoryFilter).and(portfolioItemFilter);
		},
		loadUserStories: function() {
			var me=this;
			
			return Q.all(_.map(_.chunk(me.LowestFilteredPortfolioItems, 20), function(portfolioItems){
				return me.parallelLoadWsapiStore({
					model: me.UserStory,
					enablePostGet: true,
					autoLoad: false,
					filters: [me.createStoryFilter(portfolioItems)],
					fetch: me.userStoryFields,
					context: { 
						workspace: me.getContext().getWorkspace()._ref,
						project:null
					}
				});
			}))
			.then(function(stores){
				me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					model: me.UserStory,
					pageSize: 200,
					data: [].concat.apply([], _.invoke(stores, 'getRange'))
				});
			});
		},
		
		/**
			Load all iterations referenced by the current set of user stories if isShowingAllReleases
		*/
		getIterationFilters: function() {
			var me = this,
				firstDate = new Date(),
				lastDate = new Date(null);
			
			// Find the extremes of dates
			_.each(me.UserStoryStore.getRange(), function(story) {
				var creationDate = story.data.CreationDate,
					acceptedDate = story.data.AcceptedDate,
					iterationStartDate = story.data.Iteration ? story.data.Iteration.StartDate : new Date();
					iterationEndDate = story.data.Iteration ? story.data.Iteration.EndDate : new Date(null);
				if(creationDate < firstDate) firstDate = creationDate;
				if(iterationStartDate < firstDate) firstDate = iterationStartDate;
				if(acceptedDate > lastDate) lastDate = acceptedDate;
				if(creationDate > lastDate) lastDate = creationDate;
				if(iterationEndDate > lastDate) lastDate = iterationEndDate;
			});
			
			return [
				Ext.create('Rally.data.wsapi.Filter', {property: 'EndDate',operator: '>=', value: firstDate.toISOString() }),
				Ext.create('Rally.data.wsapi.Filter', { property: 'StartDate', operator: '<=', value: lastDate.toISOString() })
			];
		},
		loadIterations: function() {
			var me = this;
			var store = Ext.create('Rally.data.wsapi.Store', {
				autoLoad: false,
				limit: Infinity,
				model: 'Iteration',
				pageSize: 200,
				fetch: ['ObjectID', 'Name', 'StartDate', 'EndDate'],
				filters: me.getIterationFilters(),
				sorters: [{property: 'StartDate',direction: 'ASC'}],
				context: {
					project: me.getContext().getProject()._ref,
					projectScopeUp: false,
					projectScopeDown: false
				}
			});
			return me.reloadStore(store).then(function(iterationStore) {
				me.IterationRecords = iterationStore.getRange();
			});
		},
		
		/**************************************** Data ********************************************/
		/*
		 *	Gets a filtered subset of data for the backlog chart
		 */
		filterBacklogPointsToRange: function(points) {
			var me = this,
				startIndex = 0,
				endIndex = points.length - 1;

			if (me.FilterBy !== 'Release') {
				while (startIndex < points.length && points[startIndex].endDate < me.FilterStartDate) {
					startIndex++;
				}
				while (endIndex >= 0 && points[endIndex].startDate > me.FilterEndDate) {
					endIndex--;
				}
			}
			else {
				startIndex = _.findIndex(points, function(point) {return point.name.slice(0, 4) === me.ReleaseRecord.data.Name.slice(0,4);});
				endIndex = _.findLastIndex(points, function(point) {return point.name.slice(0, 4) === me.ReleaseRecord.data.Name.slice(0,4);});
			}
			
			return points.slice(startIndex, endIndex + 1);
		},
		
		/**
			returns the data objects for each of the charts
		*/
		getStateChartData: function() {
			var me = this,
				total = me.UserStoryStore.data.length,
				stateData = [
					{name: 'Undefined', y: 0, totalCount: total},
					{name: 'Defined', y: 0, totalCount: total},
					{name: 'In-Progress', y: 0, totalCount: total},
					{name: 'Completed', y: 0, totalCount: total},
					{name: 'Accepted', y: 0, totalCount: total}
				],
				stateCounts = {};
			
			_.each(stateData, function(datum, index) {
				stateCounts[datum.name] = stateData[index];
			});
			_.each(me.UserStoryStore.getRange(), function(story) {
				stateCounts[story.data.ScheduleState].y++;
			});
			
			return Q(stateData);
		},
		createPercentageChartUserStoryFilter: function(){
			var me=this,
				validReleases = me.isShowingAllReleases ? me.ReleaseRecords : [me.ReleaseRecord],
				releaseFilter = _.reduce(validReleases, function(filter, releaseRecord){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: releaseRecord.data.Name });
					return filter ? filter.or(newFilter) : newFilter;
				}, null),
				leafStoryFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'DirectChildrenCount', value: 0});
				
			return leafStoryFilter.and(releaseFilter);
		},
		getPercentageChartData: function() {
			var me = this,
				percentageData = [
					{name: 'CI', y: me.UserStoryStore.data.length},
					{name: 'Non-CI', y: 0}
				],
				store = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					limit: 1,
					model: me.UserStory,
					fetch: [],
					filters: [me.createPercentageChartUserStoryFilter()],
					context: {
						project: me.ProjectRecord.data._ref,
						projectScopeUp: false,
						projectScopeDown: true
					}
				});
				
			return me.reloadStore(store).then(function(store) {
				// Number of non-CI stories is total stories - CI stories
				percentageData[1].y = store.totalCount - percentageData[0].y;
				
				// Used for formatting
				percentageData[1].totalCount = percentageData[0].totalCount = store.totalCount;
				
				return percentageData;
			});
		},
		getBacklogChartData: function(field) {
			var me = this,
				backlogData = [],
				storyTotal = 0,
				dataField = field || 'size';
			// Create data objects for all iterations for the deltas and the totals
			_.each(me.IterationRecords, function(iteration) {
				var iterationStartDate = iteration.data.StartDate,
					iterationEndDate = iteration.data.EndDate;
				backlogData.push({
					name: iteration.data.Name,
					delta: 0,
					added: 0,
					accepted: 0,
					size: 0,
					startDate: iterationStartDate,
					endDate: iterationEndDate,
					y: 0,
					createdStories: [],
					acceptedStories: [],
					backloggedStories: []
				});
			});
			
			// Calculate stories added, accepted, and delta per iteration
			_.each(me.UserStoryStore.getRange(), function(story) {
				var storyCreationDate = story.data.CreationDate,
					storyAcceptedDate = story.data.AcceptedDate;
					
				// Accounts for stories written before planned iterations
				if (storyCreationDate < backlogData[0].startDate) storyTotal++;
				if (story.data.AcceptedDate && storyAcceptedDate < backlogData[0].startDate) storyTotal--;
				
				for (var i in backlogData) {
					if (storyCreationDate <= backlogData[i].endDate && (!story.data.AcceptedDate || storyAcceptedDate > backlogData[i].endDate)) {
						backlogData[i].backloggedStories.push(story);
					}
					if (storyCreationDate >= backlogData[i].startDate && storyCreationDate <= backlogData[i].endDate) {
						backlogData[i].added++;
						backlogData[i].delta++;
						backlogData[i].createdStories.push(story);
					}
					if (story.data.AcceptedDate && storyAcceptedDate >= backlogData[i].startDate && storyAcceptedDate <= backlogData[i].endDate) {
						backlogData[i].accepted++;
						backlogData[i].delta--;
						backlogData[i].acceptedStories.push(story);
					}
				}
			});
			
			// Calculate backlog count at each iteration end
			for (var j in backlogData) {
				storyTotal += backlogData[j].delta;
				backlogData[j].size = storyTotal;
				backlogData[j].y = backlogData[j][dataField];
			}
			return Q(backlogData);
		},
		
		/**************************************** UI **********************************************/
		/*
		 *	Removes all existing UI components, keeping containers intact
		 */
		removeAllComponents: function() {
			var me = this;
			
			// Empty chart containers
			$('#state-chart-container').empty();
			$('#percentage-chart-container').empty();
			$('#backlog-chart-container').empty();
			
			// Completely destroy grid
			me.down('#grid-container').removeAll(true);
		},
		
		hideHighchartsLink: function() {
			$('.highcharts-container > svg > text:last-child').hide();
		},
		
		loadUI: function() {
			var me = this;
			me.setLoading('Loading Visuals');
			
			me.down('#backlog-chart-controls-container').removeAll();
			me.loadControls();
			
			return me.loadCharts().then(me.loadGrid.bind(me));
		},
		
		loadControls: function() {
			var me = this;
		
			// Maintain state of checkbox
			if(!me.ReleaseCheckbox) me.loadReleaseCheck();
			
			// Load backlog chart controls only if showing backlog chart
			if(me.isShowingAllReleases) me.loadBacklogChartControls();
		},
		
		/*
		 *	Creates and adds checkbox for filtering to current release
		 */
		loadReleaseCheck: function() {
			var me = this;
			me.ReleaseCheckbox = Ext.create('Rally.ui.CheckboxField', {
				checked: me.isShowingAllReleases,
				fieldLabel: 'All releases',
				padding: '0 0 0 5px',
				listeners: {
					change: me.releaseCheckboxChanged,
					scope: me
				}
			});
			me.down('#general-controls-container').add(me.ReleaseCheckbox);
		},
		
		/*
		 *	Creates and adds all controls related to the backlog chart
		 */
		loadBacklogChartControls: function() {
			if (this.IterationRecords.length === 0) return;
			var me = this,
				backlogControls = [],
				iterationStore = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					data: me.IterationRecords,
					model: 'Iteration'
				}),
				dataFieldsStore = Ext.create('Ext.data.Store', {
					fields: ['DisplayName', 'PropertyName'],
					data: [
						{DisplayName: 'Backlog Size', PropertyName: 'size'},
						{DisplayName: 'Added Stories', PropertyName: 'added'},
						{DisplayName: 'Accepted Stories', PropertyName: 'accepted'},
						{DisplayName: 'Backlog Delta', PropertyName: 'delta'}
					]
				});
			
			// Store controls in me for use in listeners
			me.IterationRadio = Ext.create('Ext.form.field.Radio', {
				id: 'iteration-radio-box',
				name: 'filter-type',
				boxLabel: 'Iteration',
				labelWidth: 50,
				checked: true,
				listeners: {
					change: me.backlogFilterTypeChanged,
					scope: me
				}
			});
			me.DateRadio = dateRadio = Ext.create('Ext.form.field.Radio', {
				id: 'date-radio-box',
				name: 'filter-type',
				boxLabel: 'Date',
				labelWidth: 50,
				checked: false,
				listeners: {
					change: me.backlogFilterTypeChanged,
					scope: me
				}
			});
			me.ReleaseRadio = Ext.create('Ext.form.field.Radio', {
				id: 'release-radio-box',
				name: 'filter-type',
				boxLabel: 'Release',
				labelWidth: 50,
				checked: false,
				listeners: {
					change: me.backlogFilterTypeChanged,
					scope: me
				}
			});
			me.StartIterationCombo = Ext.create('Rally.ui.combobox.ComboBox', {
				displayField: 'Name',
				id: 'start-iteration-combo-box',
				fieldLabel: 'Start:',
				labelWidth: 50,
				labelAlign: 'right',
				store: iterationStore,
				padding: '0 0 0 15',
				listeners: {
					select: me.rangeChanged,
					scope: me
				},
				value: me.IterationRecords[0],
				valueField: 'StartDate'
			});
			me.EndIterationCombo = Ext.create('Rally.ui.combobox.ComboBox', {
				displayField: 'Name',
				id: 'end-iteration-combo-box',
				fieldLabel: 'End:',
				labelWidth: 50,
				labelAlign: 'right',
				store: iterationStore,
				padding: '0 0 0 15',
				listeners: {
					select: me.rangeChanged,
					scope: me
				},
				value: me.IterationRecords[me.IterationRecords.length - 1],
				valueField: 'EndDate'
			});
			me.StartDatePicker = Ext.create('Rally.ui.DateField', {
				hidden: true,
				fieldLabel: 'Start:',
				labelAlign: 'right',
				labelWidth: 50,
				id: 'start-date-picker',
				padding: '0 0 0 15',
				listeners: {
					select: me.rangeChanged,
					scope: me
				},
				value: new Date(me.IterationRecords[0].data.StartDate)
			});
			me.EndDatePicker = Ext.create('Rally.ui.DateField', {
				hidden: true,
				fieldLabel: 'End:',
				labelAlign: 'right',
				labelWidth: 50,
				id: 'end-date-picker',
				padding: '0 0 0 15',
				listeners: {
					select: me.rangeChanged,
					scope: me
				},
				value: new Date(me.IterationRecords[me.IterationRecords.length - 1].data.EndDate)
			});
			me.ReleasePicker = Ext.create('Intel.lib.component.ReleasePicker', {
				hidden: true,
				labelWidth: 50,
				labelAlign: 'right',
				fieldLabel: 'Release',
				releases: _.filter(me.ReleaseRecords, function(release) {
						return me.IterationRecords[0].data.StartDate <= release.data.ReleaseDate && 
							me.IterationRecords[me.IterationRecords.length - 1].data.EndDate >= release.data.ReleaseStartDate;
					}),
				currentRelease: me.ReleaseRecord,
				listeners: {
					select: me.rangeChanged,
					scope: me
				}
			});
			me.DataFieldCombo = Ext.create('Ext.form.field.ComboBox', {
				store: dataFieldsStore,
				fieldLabel: 'Data:',
				labelAlign: 'right',
				labelWidth: 50,
				padding: '0 0 0 15',
				displayField: 'DisplayName',
				valueField: 'PropertyName',
				listeners: {
					select: me.redrawBacklogChart,
					scope: me
				},
				value: 'size'
			});
			
			// Set initial values used
			me.FilterBy = 'Iteration';
			me.FilterStartDate = me.IterationRecords[0].data.StartDate;
			me.FilterEndDate = me.IterationRecords[me.IterationRecords.length - 1].data.EndDate;
			
			// Push all relevant controls onto array for efficient adding
			backlogControls.push(me.IterationRadio, me.DateRadio, me.ReleaseRadio, me.StartIterationCombo, 
				me.EndIterationCombo, me.StartDatePicker, me.EndDatePicker, me.ReleasePicker, me.DataFieldCombo);
			
			// Add components
			return me.down('#backlog-chart-controls-container').add(backlogControls);
		},
		
		/*
		 *	Redraws the backlog chart using the new range and data field
		 */
		redrawBacklogChart: function() {
			var me = this, dataField = me.DataFieldCombo.getValue();
			me.setLoading(true);
			me.getBacklogChartData(dataField).then(function(data){
				var chartConfig = me.getBacklogChartConfig(me.filterBacklogPointsToRange(data));
					
				chartConfig.series[0].name = me.DataFieldCombo.getRawValue() + ' Over Time';
				
				$('#backlog-chart-container').empty();
				$('#backlog-chart-container').highcharts(chartConfig);
				me.hideHighchartsLink();
			})
			.fail(function(reason){ me.alert("ERROR", reason); })
			.then(function(){ me.setLoading(false); })
			.done();
		},
		
		/*
		 *	Creates the config object for the state chart
		 */
		getStateChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height:(me.getWidth()/4.05 >> 0),
					width: (me.getWidth()/4.05 >> 0),
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				title: {text: 'Story States'},
				tooltip: {enabled: false},
				plotOptions: {
					pie: {
						dataLabels: {
							enabled: true,
							distance:5,
							crop:false,
							overflow:'none',
							formatter: function(){ return this.point.name.substring(0, 1) + ': ' + this.point.y; },
							style: { 
								cursor:'pointer',
								color: 'black'
							}
						},
						showInLegend: true
					}
				},
				series: [{
					type: 'pie',
					name: 'States',
					innerSize: '25%',
					size: (me.getWidth()/8.1 >> 0) - 20,
					data: data
				}]
			};
		},
		
		/*
		 *	Creates the config object for the percentage chart
		 */
		getPercentageChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					width: (me.getWidth()/4.05 >> 0),
					height: (me.getWidth()/4.05 >> 0),
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				title: {text: 'CI Story Percentage'},
				tooltip: {enabled: false},
				plotOptions: {
					pie: {
						dataLabels: {
							enabled: true,
							distance:5,
							crop:false,
							overflow:'none',
							formatter: function(){
								return this.point.name.substring(0, 1) + ': ' + (this.point.y/this.point.totalCount*100).toFixed(1) + '%';
							},
							style: { 
								cursor:'pointer',
								color: 'black'
							}
						},
						showInLegend: true
					}
				},
				series: [{
					type: 'pie',
					name: 'Percentages',
					innerSize: '25%',
					size: (me.getWidth()/8.1 >> 0) - 20,
					data: data
				}]
			};
		},
		
		/*
		 *	Creates three grids for an "exploded view" of the backlog during an iteration
		 */
		loadIterationBreakdown: function(e) {
			var point = e.point,
				me = this,
				configs = [
					{title: 'Backlogged Stories', field: 'backloggedStories'},
					{title: 'Created Stories', field: 'createdStories'},
					{title: 'Accepted Stories', field: 'acceptedStories'}
				],
				breakdownContainer = Ext.create('Ext.container.Container', {
					id: 'breakdown-container',
					items: [
						{
							xtype: 'button',
							text: 'Close Breakdown',
							listeners: {
								click: function() {
									me.down('#breakdown-container').destroy();
									me.down('#storygrid').show();
								}
							}
						}
					].concat(_.map(configs, function(config) {
						return {
							xtype: 'rallygrid',
							title: config.title,
							columnCfgs: [
								'FormattedID',
								'Name',
								'Owner'
							],
							pagingToolbarCfg: {
								pageSizes: [5, 10],
								autoRender: true,
								resizable: false
							},
							store: Ext.create('Rally.data.custom.Store', {
								model: me.UserStory,
								autoLoad: false,
								data: point[config.field],
								pageSize: 5
							})
						};
					}))
				});
			
			me.down('#storygrid').hide();
			if (me.down('#breakdown-container')) me.down('#breakdown-container').destroy();
			me.down('#grid-container').add(breakdownContainer);
		},
		/*
		 *	Creates the config object for the backlog chart
		 */
		getBacklogChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height: (me.getHeight() > 700) ? (me.getHeight()*0.64 >> 0) : (me.getHeight()*0.5),
					// width: (me.getWidth()/2 >> 0),
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				title: {text: 'CI Story Backlog'},
				tooltip: {enabled: true},
				series: [
					{
						type: 'column',
						name: 'Backlog Size Over Time',
						data: data,
						tooltip: {
							pointFormatter: function() {
								return '<b><u>Iteration Information:</u></b><br>' + 
									'Backlog Size: ' + this.size + '<br>' +
									'Stories Added: ' + this.added + '<br>' +
									'Stories Accepted: ' + this.accepted + '<br>' +
									'Backlog Delta: ' + this.delta + '<br>';
							}
						},
						events: {
							click: me.loadIterationBreakdown.bind(me)
						}
					}
				],
				yAxis: {
					tickInterval: 2,
					title: {
						text: '# Stories'
					}
				},
				xAxis: {
					title: {
						text: 'Iteration'
					},
					type: 'category'
				}
			};
		},
		
		/*
		 *	Creates the config object for the user story grid
		 */
		getGridConfig: function() {
			var me = this;
			return {
				id: 'storygrid',
				title: 'Team Continuous Improvement Stories',
				store: Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me.UserStory,
					data: me.UserStoryStore.getRange(),
					pageSize: (me.getHeight() > 700 ? 20 : 10)
					
				}),
				sortableColumns: true,
				pagingToolbarCfg: {
					pageSizes: [10, 20, 25, 100],
					autoRender: true,
					resizable: false
				},
				columnCfgs: [
					'FormattedID',
					'Name',
					'Owner',
					'Iteration',
					'ScheduleState',
					'PlanEstimate',
					{
						text: 'Days Unaccepted',
						editor: false,
						renderer:function(val, meta, record){
							var day = 1000*60*60*24;
							return ((record.data.AcceptedDate ? new Date(record.data.AcceptedDate) : new Date()) - new Date(record.data.CreationDate).getTime())/day>>0;
						}
					}
				]
			};
		},
		
		loadCharts: function() {
			var me = this,
				promises = [me.getStateChartData(), me.getPercentageChartData()];
			if (me.isShowingAllReleases) promises.push(me.getBacklogChartData());
			
			return Q.all(promises).then(function(data) {
				if (me.isShowingAllReleases) $('#backlog-chart-container').highcharts(me.getBacklogChartConfig(data[2]));
				$('#state-chart-container').highcharts(me.getStateChartConfig(data[0]));
				$('#percentage-chart-container').highcharts(me.getPercentageChartConfig(data[1]));
				me.hideHighchartsLink();
			});
		},
		
		/*
		 *	Loads and adds user story grid
		 */
		loadGrid: function() {
			var me = this,
				grid = Ext.create('Rally.ui.grid.Grid', me.getGridConfig());
			return me.down('#grid-container').add(grid);
		},
		
		/**************************************** Event Handling **********************************/
		/*
		 *	Fires when the filter type for the backlog chart is changed
		 *	TODO: Switching timeframes is slightly (extremely broken)
		 */
		backlogFilterTypeChanged: function(radio) {
			var me = this,
				controlsContainer = me.down('#backlog-chart-controls-container');
			
			// Set the global variable
			if (me.IterationRadio.getValue()) me.FilterBy = 'Iteration';
			else if (me.DateRadio.getValue()) me.FilterBy = 'Date';
			else me.FilterBy = 'Release';
			
			// Hide all filter controls
			me.StartIterationCombo.hide();
			me.EndIterationCombo.hide();
			me.StartDatePicker.hide();
			me.EndDatePicker.hide();
			me.ReleasePicker.hide();
			
			if (me.FilterBy === 'Iteration') {
				me.StartIterationCombo.show();
				me.EndIterationCombo.show();
				
				// TODO: Possibly change the dates to match iteration after setting combo
				me.StartIterationCombo.setValue(_.find(me.IterationRecords, function(iteration) {return iteration.data.EndDate >= me.FilterStartDate;}));
				me.EndIterationCombo.setValue(_.findLast(me.IterationRecords, function(iteration) {return iteration.data.StartDate <= me.FilterEndDate;}));
			}
			else if (me.FilterBy === 'Date') {
				me.StartDatePicker.show();
				me.EndDatePicker.show();

				me.StartDatePicker.setValue(me.FilterStartDate);
				me.EndDatePicker.setValue(me.FilterEndDate);
			}
			else {
				me.ReleasePicker.show();
				me.ReleasePicker.setValue(me.ReleaseRecord);
			}
			me.redrawBacklogChart();
		},
		
		/*
		 *	Fires when an iteration combo box is changed
		 */
		rangeChanged: function() {
			var me = this;

			if (me.FilterBy === 'Iteration') {
				me.FilterStartDate = me.StartIterationCombo.getValue();
				me.FilterEndDate = me.EndIterationCombo.getValue();
			}
			else if (me.FilterBy === 'Date') {
				me.FilterStartDate = me.StartDatePicker.getValue();
				me.FilterEndDate = me.EndDatePicker.getValue();
			}
			else {
				var release = _.find(me.ReleaseRecords, function(release) {return me.ReleasePicker.getValue() === release.data.Name;});
				me.ReleaseRecord = release;
				me.FilterStartDate = release.data.ReleaseStartDate;
				me.FilterEndDate = release.data.ReleaseDate;
			}
			
			me.redrawBacklogChart();
		},
		
		/*
		 *	Fired when the checkbox for showing all releases is clicked
		 */
		releaseCheckboxChanged: function(box, newVal, oldVal, opts) {
			var me = this;
			me.isShowingAllReleases = newVal;
			
			me.removeAllComponents();
			me.setLoading('Loading data');
			return me.updatePreferences()
				.then(function(){
				if(me.isShowingAllReleases){
					return me.loadUserStories()
					.then(function(){ return me.loadIterations(); })
					.then(function(){ return me.loadUI(); });
				}
				else {
					return me.loadUserStories()
					.then(function(){ return me.loadUI(); });
				}
			})
			.fail(function(reason){ me.alert("ERROR", reason); })
			.then(function(){ me.setLoading(false); })
			.done();
		},

		/**************************************** Preferences *************************************/
		loadPreferences: function() {
			var me = this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				appID: me.getAppId(),
				workspace: me.getContext().getWorkspace()._ref,
				success: function(preferences) {
					if(preferences.showAllReleases) me.isShowingAllReleases = true;
					else me.isShowingAllReleases = false;
					deferred.resolve();
				}
			});
			return deferred.promise;
		},
		updatePreferences: function() {
			var me = this, deferred = Q.defer();
			Rally.data.PreferenceManager.update({
				appID: me.getAppId(),
				workspace: me.getContext().getWorkspace()._ref,
				settings:{ showAllReleases: me.isShowingAllReleases },
				success: function(){ deferred.resolve(); }
			});
			return deferred.promise;
		}
	});
})();
