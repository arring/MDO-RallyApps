(function() {
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('ContinuousImprovementReport', {
		extend: 'IntelRallyApp',
		componentCls: 'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'Teams'
		],
		items: [
			{
				xtype: 'container',
				id: 'controls-container',
				layout: 'column',
				border: 1,
				style: {
					borderColor: 'black',
					borderStyle: 'solid'
				},
				items: [
					{
						xtype: 'container',
						id: 'general-controls-container',
						columnWidth: 0.14
					},
					{
						xtype: 'container',
						id: 'backlog-chart-controls-container',
						columnWidth: 0.84,
						layout: 'hbox'
					},
					{
						xtype: 'button',
						id: 'create-story-button',
						text: '+',
						style: {
							float: 'right'
						},
						listeners: {
							click: function() {
								// TODO: Add default values or change to custom form
								Rally.nav.Manager.create('HierarchicalRequirement');
							}
						}
					}
				]
			},
			{
				xtype: 'container',
				id: 'chart-and-grid-container',
				layout: 'column',
				items: [
					{
						xtype: 'container',
						id: 'chart-container',
						columnWidth: 0.5,
						padding: '0 10 0 0',
						items: [
							{
								xtype: 'container',
								id: 'backlog-chart-container'
							},
							{
								xtype: 'container',
								id: 'pie-chart-container',
								layout: 'column',
								items: [
									{
										xtype: 'container',
										id: 'state-chart-container',
										columnWidth: 0.5
									},
									{
										xtype: 'container',
										id: 'percentage-chart-container',
										columnWidth: 0.5
									}
								]
							}
						]
					},
					{
						xtype: 'container',
						id: 'grid-container',
						padding: '0 5 0 0',
						columnWidth: 0.49
					}
				]
			}
		],
		launch: function() {
			var me = this;
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me.setLoading('Loading configuration');
			me._configureIntelRallyApp()
			// Load scoped project
			.then (function() {
				me.isShowingAllReleases = false;
				var scopedProject = me.getContext().getProject();
				return me._loadProject(scopedProject.ObjectID);
			})
			// Get current release, team info, and load portfolio project
			.then(function(projectRecord) {
				me.ProjectRecord = projectRecord;
			
				// Extract team info from current project
				me.Team = me._getTeamInfo(me.ProjectRecord);
				if (!me.Team) {
					throw 'You must be scoped to a scrum';
				}
				
				// Load release records
				return me._loadAllReleases(me.ProjectRecord).then(function(releaseRecords) {
					// TODO: THIS IS BROKEN, DOES NOT ACCOUNT FOR DIFFERENT TIMES BETWEEN RELEASES
					me.ReleaseRecords = _.uniq(_.filter(releaseRecords, function(release) {return (/^Q\d{3}/).test(release.data.Name);}), function(release) {return release.data.Name.slice(0,4);});
					return me._getScopedRelease(me.ReleaseRecords, me.ProjectRecord.data.ObjectID, null);
				});
			})
			// Save current release then load the train portfolio project
			.then(function(release) {
				me.CurrentRelease = release;
				me.FilterRelease = release;
				return me._loadProjectByName(me.Team.Train + ' POWG Portfolios');
			})
			// Get all products under the portfolio project
			.then(function(portfolioProject) {
				me.setLoading('Loading continuous improvement product');
				
				// Load all products
				return me._loadPortfolioItemsOfType(portfolioProject, 'Product');
			})
			// Extract only the continuous improvement product and load milestones under it
			.then(function(productStore) {
				var ciProduct,
					ciProductName = me.Team.Train + 'STDCI';
				
				// Find the continuous improvement product
				ciProduct = _.find(productStore.getRange(), function(p) {return p.data.Name === ciProductName;});
				
				// Load Milestones under the STDCI product
				return me._loadPortfolioChildren(ciProduct, 'Milestone');
			})
			// Load all features then stories under all milestones
			.then(function (milestoneStore) {
				me.Milestones = milestoneStore.getRange();
				return me._loadStories();
			})
			// Load the UI
			.then(me._loadUI.bind(me))
			// Catch-all fail function
			.fail(function(reason) {
				me.setLoading(false);
				me._alert('Error', reason || 'error');
			})
			.done();
		},
		
		/*
		 *	Loads all UI components
		 */
		_loadUI: function() {
			var me = this;
			me.setLoading('Loading Visuals');
			
			// Load controls
			me.down('#backlog-chart-controls-container').removeAll();
			me._loadControls();
			
			// Load other UI components
			return me._loadCharts().then(me._loadGrid.bind(me)).then(function() {
				me.setLoading(false);
			});
		},
		
		/*
		 *	Loads all controls
		 */
		_loadControls: function() {
			var me = this;
		
			// Maintain state of checkbox
			if (!me.ReleaseCheck) me._loadReleaseCheck();
			
			// Load backlog chart controls only if showing backlog chart
			if (me.isShowingAllReleases) me._loadBacklogChartControls();
		},
		
		/*
		 *	Creates and adds all controls related to the backlog chart
		 */
		_loadBacklogChartControls: function() {
			if (this.Iterations.length === 0) return;
			var me = this,
				backlogControls = [],
				iterationStore = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					data: me.Iterations,
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
					change: me._backlogFilterTypeChanged,
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
					change: me._backlogFilterTypeChanged,
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
					change: me._backlogFilterTypeChanged,
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
					select: me._rangeChanged,
					scope: me
				},
				value: me.Iterations[0],
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
					select: me._rangeChanged,
					scope: me
				},
				value: me.Iterations[me.Iterations.length - 1],
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
					select: me._rangeChanged,
					scope: me
				},
				value: new Date(me.Iterations[0].data.StartDate)
			});
			me.EndDatePicker = Ext.create('Rally.ui.DateField', {
				hidden: true,
				fieldLabel: 'End:',
				labelAlign: 'right',
				labelWidth: 50,
				id: 'end-date-picker',
				padding: '0 0 0 15',
				listeners: {
					select: me._rangeChanged,
					scope: me
				},
				value: new Date(me.Iterations[me.Iterations.length - 1].data.EndDate)
			});
			me.ReleasePicker = Ext.create('IntelReleasePicker', {
				hidden: true,
				labelWidth: 50,
				labelAlign: 'right',
				fieldLabel: 'Release',
				releases: me.ReleaseRecords,
				currentRelease: me.FilterRelease,
				listeners: {
					select: me._rangeChanged,
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
					select: me._redrawBacklogChart,
					scope: me
				},
				value: 'size'
			});
			
			// Set initial values used
			me.FilterBy = 'Iteration';
			me.FilterStartDate = me.Iterations[0].data.StartDate;
			me.FilterEndDate = me.Iterations[me.Iterations.length - 1].data.EndDate;
			
			// Push all relevant controls onto array for efficient adding
			backlogControls.push(me.IterationRadio, me.DateRadio, me.ReleaseRadio, me.StartIterationCombo, me.EndIterationCombo, me.StartDatePicker, me.EndDatePicker, me.ReleasePicker, me.DataFieldCombo);
			
			// Add components
			return me.down('#backlog-chart-controls-container').add(backlogControls);
		},
		
		/*
		 *	Fires when the filter type for the backlog chart is changed
		 */
		_backlogFilterTypeChanged: function(radio) {
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
				me.StartIterationCombo.setValue(_.find(me.Iterations, function(iteration) {return iteration.data.EndDate >= me.FilterStartDate;}));
				me.EndIterationCombo.setValue(_.find(me.Iterations, function(iteration) {return iteration.data.StartDate >= me.FilterEndDate;}));
			}
			else if (me.FilterBy === 'Date') {
				me.StartDatePicker.show();
				me.EndDatePicker.show();

				me.StartDatePicker.setValue(me.FilterStartDate);
				me.EndDatePicker.setValue(me.FilterEndDate);
			}
			else {
				me.ReleasePicker.show();
				
				me.FilterRelease = _.find(me.ReleaseRecords, function(release) {return me.FilterStartDate >= release.data.ReleaseStartDate && me.FilterStartDate <= release.data.ReleaseDate;});
				me.ReleasePicker.setValue(me.FilterRelease);

				me._redrawBacklogChart();
			}
		},
		
		/*
		 *	Fires when an iteration combo box is changed
		 */
		_rangeChanged: function() {
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
				me.FilterRelease = release;
				me.FilterStartDate = release.data.ReleaseStartDate;
				me.FilterEndDate = release.data.ReleaseDate;
			}
			
			me._redrawBacklogChart();
		},
		
		/*
		 *	Redraws the backlog chart using the new range and data field
		 */
		_redrawBacklogChart: function() {
			var me = this,
				dataField = me.DataFieldCombo.getValue(),
				data = me._filterBacklogPointsToRange(me._getBacklogChartData(dataField)),
				chartConfig = me._getBacklogChartConfig(data);
				
			// Set new series name
			chartConfig.series[0].name = me.DataFieldCombo.getRawValue() + ' Over Time';
			
			// Remove old chart
			$('#backlog-chart-container').empty();
			
			// Add new chart
			$('#backlog-chart-container').highcharts(chartConfig);
			
			// Hide that pesky link
			me._hideHighchartsLink();
		},
		
		/*
		 *	Loads stories under features under the CI milestone
		 */
		_loadStories: function() {
			var me = this;
			me.setLoading('Loading stories');
			me.ReleaseFilter = me._getReleaseFilter();
			return me._loadFeaturesUnderMilestones(me.Milestones).then(function(featureStores) {
				return me._loadStoriesUnderFeatures(featureStores);
			});
		},
		
		/*
		 *	Loads all features under the given milestones
		 */
		_loadFeaturesUnderMilestones: function(milestones) {
			var me = this,
				featurePromises = [];

			// Create promise array for features
			for (var i in milestones) {
				featurePromises.push(me._loadPortfolioChildren(milestones[i], 'Feature', me.ReleaseFilter));
			}
			
			return Q.all(featurePromises);
		},
		
		/*
		 *	Loads all stories under the given features
		 */
		_loadStoriesUnderFeatures: function(featureStores) {
			var me = this,
				storyPromises = [];
			me.setLoading('Loading stories');
			
			// Create promise array for loading stories
			for (var i in featureStores) {
				var features = featureStores[i].getRange();
				for (var j in features) {
					storyPromises.push(me._loadStoriesByFeature(features[j]));
				}
			}
			
			// Load stories then aggregate the data into one store
			return Q.all(storyPromises).then(function(storyStores) {
				me.StoryStore = Ext.create('Ext.data.Store', {
					autoLoad: false,
					model: me.UserStory,
					data: []
				});
				for (var i = 0; i < storyStores.length; i++) {
					me.StoryStore.add(storyStores[i].getRange());
				}
				me.StoryStore.sort('CreationDate', 'ASC');
				me.setLoading(false);
			});
		},
		
		/*
		 *	Gets a filter object for either all releases or just the current release
		 */
		_getReleaseFilter: function() {
			var me = this;
			if (me.isShowingAllReleases) {
				// TODO: This code just feels wrong, should replace it with something...not terrible
				return Ext.create('Rally.data.wsapi.Filter', {property: 'Name', operator: '!=', value: null});
			}
			else {
				// Filter to only current release
				return Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release.Name',
					operator: '=',
					value: me.CurrentRelease.data.Name
				});
			}
		},
		
		/*
		 *	Loads direct children of a portfolio item of type
		 *	Filters by customFilter (if provided), a Filter object
		 */
		_loadPortfolioChildren: function(portfolioItem, type, customFilter) {
			var me = this,
				// Filters to children of portfolioItem
				parentFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Parent.ObjectID', operator: '=', value: portfolioItem.data.ObjectID}),
				// Combines with customFilter if present
				portfolioFilter = (!customFilter ? parentFilter : parentFilter.and(customFilter)),
				storeConfig = {
					model: me['PortfolioItem/' + type],
					fetch: ['Name', 'ObjectID', 'FormattedID', 'Release'],
					autoLoad: false,
					disableMetaChangeEvent: true,
					limit: Infinity,
					pageSize: 200,
					filters: [portfolioFilter],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					}
				};
			var store = Ext.create('Rally.data.wsapi.Store', storeConfig);
			
			return me._reloadStore(store);
		},
		
		/*
		 *	Loads all stories within a feature
		 */
		_loadStoriesByFeature: function(feature, customFilter) {
			var me = this,
				// Filters to children of feature
				featureFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Feature.ObjectID', operator: '=', value: feature.data.ObjectID}),
				// Filter for if customFilter is not provided
				standardFilter = featureFilter.and(me.ReleaseFilter),
				// Combined filter
				storyFilter = (!customFilter ? standardFilter : standardFilter.and(customFilter)),
				storeConfig = {
					model: me.UserStory,
					fetch: ['Name', 'ObjectID', 'FormattedID', 'Owner', 'Iteration', 'StartDate', 'EndDate', 'ScheduleState', 'Feature', 'PlanEstimate', 'AcceptedDate', 'CreationDate'],
					autoLoad: false,
					limit: Infinity,
					pageSize: 200,
					filters: [storyFilter],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: me.ProjectRecord.data._ref
					}
				};
			var store = Ext.create('Rally.data.wsapi.Store', storeConfig);
			return me._reloadStore(store);
		},
		
		/*
		 *	Creates and adds checkbox for filtering to current release
		 */
		// TODO: Make this checkbox prettier (it's ugly and Spartan right now)
		_loadReleaseCheck: function() {
			var me = this;
			me.ReleaseCheck = Ext.create('Rally.ui.CheckboxField', {
				checked: false,
				fieldLabel: 'All releases',
				listeners: {
					change: me._releaseCheckboxChanged,
					scope: me
				}
			});
			me.down('#general-controls-container').add(me.ReleaseCheck);
		},
		
		/*
		 *	Fired when the checkbox for showing all releases is clicked
		 */
		_releaseCheckboxChanged: function(box, newVal, oldVal, opts) {
			var me = this;
			me.isShowingAllReleases = newVal;
			
			// Reload stories and UI
			me._removeAllComponents();
			if (me.isShowingAllReleases) {
				return me._loadStories().then(function() {
					return me._loadIterations();
				}).then(function() {
					return me._loadUI();
				});
			}
			else {
				return me._loadStories().then(function() {
					return me._loadUI();
				});
			}
		},
		
		/*
		 *	Removes all existing UI components, keeping containers intact
		 */
		_removeAllComponents: function() {
			var me = this;
			
			// Empty chart containers
			$('#state-chart-container').empty();
			$('#percentage-chart-container').empty();
			$('#backlog-chart-container').empty();
			
			// Completely destroy grid
			me.down('#grid-container').removeAll(true);
		},
		
		/*
		 *	Creates the state chart data object
		 */
		_getStateChartData: function() {
			var me = this,
				total = me.StoryStore.data.length,
				stateData = [
					{name: 'Undefined', y: 0, totalCount: total},
					{name: 'Defined', y: 0, totalCount: total},
					{name: 'In-Progress', y: 0, totalCount: total},
					{name: 'Completed', y: 0, totalCount: total},
					{name: 'Accepted', y: 0, totalCount: total}
				];
			
			// Create object for fast counting
			var stateCounts = {};
			_.each(stateData, function(datum, index) {
				stateCounts[datum.name] = stateData[index];
			});
			
			// Count number of user stories in each state category
			_.each(me.StoryStore.getRange(), function(story) {
				stateCounts[story.data.ScheduleState].y++;
			});
			
			// This is to maintain consistency with promises (sorry)
			return Q.fcall(function() {return stateData;});
		},
		
		/*
		 *	Creates the percentage chart data object
		 *	TODO: This should be highly optimizable
		 */
		_getPercentageChartData: function() {
			var me = this,
				percentageData = [
					{name: 'CI', y: me.StoryStore.data.length},
					{name: 'Non-CI', y: 0}
				],
				config = {
					autoLoad: false,
					limit: 1,
					model: me.UserStory,
					// "Get" nothing to make counting total results faster
					fetch: [],
					filters: [me.ReleaseFilter],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: me.ProjectRecord.data._ref,
						projectScopeUp: false,
						projectScopeDown: true
					}
				},
				releaseStoryStore = Ext.create('Rally.data.wsapi.Store', config);
			return me._reloadStore(releaseStoryStore).then(function(store) {
				// Number of non-CI stories is total stories - CI stories
				percentageData[1].y = store.totalCount - percentageData[0].y;
				
				// Used for formatting
				percentageData[1].totalCount = percentageData[0].totalCount = store.totalCount;
				
				return percentageData;
			});
		},
		
		/*
		 *	Gets the filter for all relevant iterations
		 */
		_getIterationFilter: function() {
			var me = this,
				// Set to now, all dates guaranteed to be before
				firstDate = new Date(),
				// Set to minimum date
				lastDate = new Date(null),
				endsAfterFilter,
				startsBeforeFilter;
			
			// Find the extremes of dates
			_.each(me.StoryStore.getRange(), function(story) {
				var creationDate = story.data.CreationDate,
					acceptedDate = story.data.AcceptedDate,
					iterationStartDate = story.data.Iteration ? story.data.Iteration.StartDate : new Date();
					iterationEndDate = story.data.Iteration ? story.data.Iteration.EndDate : new Date(null);
				if (creationDate < firstDate) firstDate = creationDate;
				if (iterationStartDate < firstDate)firstDate = iterationStartDate;
				if (acceptedDate > lastDate) lastDate = acceptedDate;
				if (creationDate > lastDate) lastDate = creationDate;
				if (iterationEndDate > lastDate) lastDate = iterationEndDate;
			});
			
			// Create filters to narrow the time box of the iterations
			endsAfterFilter = Ext.create('Rally.data.wsapi.Filter', {
				property: 'EndDate',
				operator: '>=',
				value: firstDate.toISOString()
			});
			startsBeforeFilter = Ext.create('Rally.data.wsapi.Filter', {
				property: 'StartDate',
				operator: '<=',
				value: lastDate.toISOString()
			});
			
			return [endsAfterFilter, startsBeforeFilter];
		},
		
		/*
		 *	Loads all iterations referenced by the current set of user stories
		 */
		_loadIterations: function() {
			var me = this,
				filter = me._getIterationFilter();
			var store = Ext.create('Rally.data.wsapi.Store', {
				autoLoad: false,
				limit: Infinity,
				model: 'Iteration',
				pageSize: 200,
				fetch: ['ObjectID', 'Name', 'StartDate', 'EndDate'],
				filters: filter,
				// This is sorted to make charting it easy
				sorters: [
					{
						property: 'StartDate',
						direction: 'ASC'
					}
				],
				context: {
					workspace: me.getContext().getWorkspace(),
					project: me.getContext().getProject()._ref,
					projectScopeUp: false,
					projectScopeDown: false
				}
			});
			
			return me._reloadStore(store).then(function(iterationStore) {
				me.Iterations = iterationStore.getRange();
			});
		},
		
		/*
		 *	Gets a filtered subset of data for the backlog chart
		 */
		_filterBacklogPointsToRange: function(points) {
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
				startIndex = _.findIndex(points, function(point) {return point.name.slice(0, 4) === me.FilterRelease.data.Name.slice(0,4);});
				endIndex = _.findLastIndex(points, function(point) {return point.name.slice(0, 4) === me.FilterRelease.data.Name.slice(0,4);});
			}
			
			return points.slice(startIndex, endIndex + 1);
		},
		
		/*
		 *	Creates the backlog chart data object
		 */
		_getBacklogChartData: function(field) {
			var me = this,
				backlogData = [],
				storyTotal = 0,
				dataField = field || 'size',
				iterationNameRegExp = /^Q\d+_s\d+/;
			// Create data objects for all iterations for the deltas and the totals
			_.each(me.Iterations, function(iteration) {
				var iterationStartDate = iteration.data.StartDate,
					iterationEndDate = iteration.data.EndDate;
				backlogData.push({
					name: iteration.data.Name.match(iterationNameRegExp)[0],
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
			_.each(me.StoryStore.getRange(), function(story) {
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
			return backlogData;
		},
		
		/*
		 *	Creates the config object for the state chart
		 */
		_getStateChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height:(me.getHeight() > 700) ? (me.getHeight()*0.32 >> 0) : (me.getHeight()*0.45),
					width: (me.getWidth()/4 >> 0),
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
							distance:25,
							crop:false,
							overflow:'none',
							formatter: function(){
								var str = '<b>' + this.point.name + '</b>: ' + this.point.y;
								return str;
							},
							style: { 
								cursor:'pointer',
								color: 'black'
							}
						}
					}
				},
				series: [{
					type: 'pie',
					name: 'States',
					innerSize: '25%',
					size: 175,
					data: data
				}]
			};
		},
		
		/*
		 *	Creates the config object for the percentage chart
		 */
		_getPercentageChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height: (me.getHeight() > 700) ? (me.getHeight()*0.32 >> 0) : (me.getHeight()*0.45),
					width: (me.getWidth()/4 >> 0),
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
							distance:25,
							crop:false,
							overflow:'none',
							formatter: function(){
								return '<b>' + this.point.name + '</b>: ' + (this.point.y/this.point.totalCount*100).toFixed(1) + '%';
							},
							style: { 
								cursor:'pointer',
								color: 'black'
							}
						}
					}
				},
				series: [{
					type: 'pie',
					name: 'Percentages',
					innerSize: '25%',
					size: 175,
					data: data
				}]
			};
		},
		
		_loadIterationBreakdown: function(e) {
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
		_getBacklogChartConfig: function(data) {
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
							click: me._loadIterationBreakdown.bind(me)
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
		 *	Hides the link for Highcharts
		 */
		_hideHighchartsLink: function() {
			$('.highcharts-container > svg > text:last-child').hide();
		},
		
		/*
		 *	Creates the config object for the user story grid
		 */
		_getGridConfig: function() {
			var me = this;
			return {
				id: 'storygrid',
				title: 'Team Continuous Improvement Stories',
				store: Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me.UserStory,
					data: me.StoryStore.getRange(),
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
		
		/*
		 *	Loads and adds charts
		 */
		_loadCharts: function() {
			var me = this,
				promises = [
					me._getStateChartData(),
					me._getPercentageChartData()
				];
			if (me.isShowingAllReleases) promises.push(me._getBacklogChartData());
			
			return Q.all(promises).then(function(data) {
				// Add charts
				if (me.isShowingAllReleases) $('#backlog-chart-container').highcharts(me._getBacklogChartConfig(data[2]));
				$('#state-chart-container').highcharts(me._getStateChartConfig(data[0]));
				$('#percentage-chart-container').highcharts(me._getPercentageChartConfig(data[1]));
				
				// Hide that pesky link
				me._hideHighchartsLink();
				
				// TODO: Not sure what to return here
				return 0;
			});
		},
		
		/*
		 *	Loads and adds user story grid
		 */
		_loadGrid: function() {
			var me = this,
				gridConfig = me._getGridConfig();
			me.StoryGrid = Ext.create('Rally.ui.grid.Grid', gridConfig);
			return me.down('#grid-container').add(me.StoryGrid);
		}
	});
})();
