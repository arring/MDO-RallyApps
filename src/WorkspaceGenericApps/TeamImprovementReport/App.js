(function() {
	// TODO: Investigate use of single promise anonymous funcitons e.g.
	// Using then(me.{function name}) instead of then(funciton() {return me.{funciton name}})
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
				items: [
					{
						xtype: 'container',
						id: 'general-controls-container',
						columnWidth: 0.49
					},
					{
						xtype: 'container',
						id: 'backlog-chart-controls-container',
						columnWidth: 0.49,
						layout: 'hbox'
					}
				]
			},
			{
				xtype: 'container',
				id: 'chart-container',
				items: [
					{
						xtype: 'container',
						id: 'state-chart-container',
						columnWidth: 0.24
					},
					{
						xtype: 'container',
						id: 'percentage-chart-container',
						columnWidth: 0.24
					},
					{
						xtype: 'container',
						id: 'backlog-chart-container',
						columnWidth: 0.49
					}
				],
				layout: 'column'
			},
			{
				xtype: 'container',
				id: 'grid-container'
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
				me.Project = projectRecord;
			
				// Extract team info from current project
				me.Team = me._getTeamInfo(me.Project);
				if (!me.Team) {
					throw 'You must be scoped to a scrum';
				}
				console.log(me.Team);
				
				// Load release records
				return me._loadAllReleases(me.Project).then(function(releaseRecords) {
					me.ReleaseRecords = releaseRecords;
					return me._getScopedRelease(releaseRecords, me.Project.data.ObjectID, null);
				});
			})
			// Save current release then load the train portfolio project
			.then(function(release) {
				me.CurrentRelease = release;
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
				console.log(me.Milestones);
				return me._loadStories();
			})
			// Load the UI
			.then(function() {
				return me._loadUI();
			})
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
			me._loadControls();
			
			// Load other UI components
			return me._loadCharts().then(function() {
				return me._loadGrid();
			}).then(function() {
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
			
			// Load backlog chart controls if necessary
			if (me.isShowingAllReleases) me._loadBacklogChartControls();
		},
		
		/*
		 *	Creates and adds all controls related to the backlog chart
		 */
		_loadBacklogChartControls: function() {
			var me = this,
				backlogControls = [],
				iterationStore = Ext.create('Rally.data.wsapi.Store', {
					autoLoad: false,
					data: me.Iterations,
					model: 'Iteration'
				}),
				iterationRadio = Ext.create('Ext.form.field.Radio', {
					id: 'iteration-radio-box',
					name: 'filter-type',
					boxLabel: 'Iteration',
					checked: true,
					listeners: {
						change: me._backlogFilterTypeChanged,
						scope: me
					}
				}),
				dateRadio = Ext.create('Ext.form.field.Radio', {
					id: 'date-radio-box',
					name: 'filter-type',
					boxLabel: 'Date',
					checked: false,
					listeners: {
						change: me._backlogFilterTypeChanged,
						scope: me
					}
				}),
				startIterationCombo = Ext.create('Rally.ui.combobox.ComboBox', {
					displayField: 'Name',
					id: 'start-iteration-combo-box',
					fieldLabel: 'Start:',
					labelAlign: 'right',
					store: iterationStore,
					padding: '0 0 0 15',
					listeners: {
						select: me._rangeChanged,
						scope: me
					},
					// TODO: This never, ever works...want to know why
					value: me.Iterations[0],
					valueField: 'StartDate'
				}),
				endIterationCombo = Ext.create('Rally.ui.combobox.ComboBox', {
					displayField: 'Name',
					id: 'end-iteration-combo-box',
					fieldLabel: 'End:',
					labelAlign: 'right',
					store: iterationStore,
					padding: '0 0 0 15',
					listeners: {
						select: me._rangeChanged,
						scope: me
					},
					// TODO: This never, ever works...want to know why
					value: me.Iterations[me.Iterations.length - 1],
					valueField: 'EndDate'
				}),
				startDatePicker = Ext.create('Rally.ui.DateField', {
					fieldLabel: 'Start:',
					labelAlign: 'right',
					id: 'start-date-picker',
					padding: '0 0 0 15',
					listeners: {
						select: me._rangeChanged,
						scope: me
					},
					value: new Date(me.Iterations[0].data.StartDate)
				}),
				endDatePicker = Ext.create('Rally.ui.DateField', {
					fieldLabel: 'End:',
					labelAlign: 'right',
					id: 'end-date-picker',
					padding: '0 0 0 15',
					listeners: {
						select: me._rangeChanged,
						scope: me
					},
					value: new Date(me.Iterations[me.Iterations.length - 1].data.EndDate)
				}),
				dataTypeStore = Ext.create('Ext.data.Store', {
					fields: ['DisplayName', 'PropertyName'],
					data: [
						{DisplayName: 'Backlog Size', PropertyName: 'y'},
						{DisplayName: 'Added Stories', PropertyName: 'added'},
						{DisplayName: 'Accepted Stories', PropertyName: 'accepted'},
						{DisplayName: 'Backlog Delta', PropertyName: 'delta'}
					]
				}),
				dataTypeCombo = Ext.create('Ext.form.field.ComboBox', {
					store: dataTypeStore,
					fieldLabel: 'Data Type:',
					padding: '0 0 0 15',
					displayField: 'DisplayName',
					valueField: 'PropertyName',
					listeners: {
						select: me._dataTypeSelected,
						scope: me
					}
				});
			
			// Store controls in me for use in listeners
			me.IterationRadio = iterationRadio;
			me.DateRadio = dateRadio;
			me.StartIterationCombo = startIterationCombo;
			me.EndIterationCombo = endIterationCombo;
			me.StartDatePicker = startDatePicker;
			me.EndDatePicker = endDatePicker;
			
			// Set initial values used
			me.StartingIteration = me.Iterations[0];
			me.EndingIteration = me.Iterations[me.Iterations.length - 1];
			me.StartingDate = new Date(me.Iterations[0].data.StartDate);
			me.EndingDate = new Date(me.Iterations[me.Iterations.length - 1].data.EndDate);
			me.isFilteringByIteration = true;
			
			// Push all relevant controls onto array for efficient adding
			backlogControls.push(iterationRadio, dateRadio, startIterationCombo, endIterationCombo);
			
			// Add components
			return me.down('#backlog-chart-controls-container').add(backlogControls);
		},
		
		_dataTypeSelected: function() {
			// TODO: Implement
		},
		
		/*
		 *	Fires when the filter type for the backlog chart is changed
		 *	NOTE: The chart DOES NOT need to be redrawn, as the values for the combo boxes will be set appropriately
		 */
		_backlogFilterTypeChanged: function() {
			var me = this;
			
			// Set the global variable
			me.isFilteringByIteration = me.IterationRadio.getValue();
			
			// Remove pickers and add other set
			if (me.isFilteringByIteration) {
				me.down('#backlog-chart-controls-container').remove(me.StartDatePicker, false);
				me.down('#backlog-chart-controls-container').remove(me.EndDatePicker, false);
				me.down('#backlog-chart-controls-container').add(me.StartIterationCombo);
				me.down('#backlog-chart-controls-container').add(me.EndIterationCombo);
				
				me.StartIterationCombo.setValue(me.StartingIteration);
				me.EndIterationCombo.setValue(me.EndingIteration);
			}
			else {
				me.down('#backlog-chart-controls-container').remove(me.StartIterationCombo, false);
				me.down('#backlog-chart-controls-container').remove(me.EndIterationCombo, false);
				me.down('#backlog-chart-controls-container').add(me.StartDatePicker);
				me.down('#backlog-chart-controls-container').add(me.EndDatePicker);
				
				me.StartDatePicker.setValue(me.StartingDate);
				me.EndDatePicker.setValue(me.EndingDate);
			}
		},
		
		/*
		 *	Fires when an iteration combo box is changed
		 */
		_rangeChanged: function() {
			var me = this;
			
			// Remove old chart
			$('#backlog-chart-container').empty();
			
			if (me.isFilteringByIteration) {
				me.StartingIteration = _.find(me.Iterations, function(iteration) {return iteration.data.StartDate == me.StartIterationCombo.getValue();});
				me.EndingIteration = _.find(me.Iterations, function(iteration) {return iteration.data.EndDate == me.EndIterationCombo.getValue();});
				me.StartingDate = new Date(me.StartingIteration.data.StartDate);
				me.EndingDate = new Date(me.EndingIteration.data.EndDate);
			}
			else {
				// TODO: Ending iteration is horribly wrong, gets one iteration ahead
				me.StartingIteration = _.find(me.Iterations, function(iteration) {return new Date(iteration.data.StartDate) >= me.StartDatePicker.getValue();});
				me.EndingIteration = _.find(me.Iterations, function(iteration) {return new Date(iteration.data.EndDate) > me.EndDatePicker.getValue();});
				me.StartingDate = me.StartDatePicker.getValue();
				me.EndingDate = me.EndDatePicker.getValue();
			}
			
			// TODO: Entirely wrong data
			$('#backlog-chart-container').highcharts(me._getBacklogChartConfig(me._filterBacklogPointsToRange(me._getBacklogChartData())));
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
				console.log('Features', features);
				for (var j in features) {
					storyPromises.push(me._loadStoriesByFeature(features[j]));
				}
			}
			
			// Load stories then aggregate the data into one store
			return Q.all(storyPromises).then(function(storyStores) {
				me.StoryStore = storyStores[0];
				for (var i = 1; i < storyStores.length; i++) {
					me.StoryStore.add(storyStores[i].getRange());
				}
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
					fetch: ['Name', 'ObjectID', 'FormattedID', 'Owner', 'Iteration', 'ScheduleState', 'Feature', 'PlanEstimate', 'AcceptedDate', 'CreationDate'],
					autoLoad: false,
					limit: Infinity,
					pageSize: 200,
					filters: [storyFilter],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: me.Project.data._ref
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
				fieldLabel: 'All releases: ',
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
			_.forEach(stateData, function(datum, index) {
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
					{name: 'CI Stories', y: me.StoryStore.data.length},
					{name: 'Non-CI Stories', y: 0}
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
						project: me.Project.data._ref,
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
				firstCreationDate = new Date(),
				// Set to minimum date
				lastAcceptedDate = new Date(null),
				endsAfterFilter,
				startsBeforeFilter;
			
			// Find the extremes of dates
			_.each(me.StoryStore.getRecords(), function(story) {
				var creationDate = new Date(story.data.CreationDate),
					acceptedDate = new Date(story.data.AcceptedDate); 
				if (creationDate < firstCreationDate) firstCreationDate = creationDate;
				if (acceptedDate > lastAcceptedDate) lastAcceptedDate = acceptedDate;
			});
			
			// Create filters to narrow the time box of the iterations
			endsAfterFilter = Ext.create('Rally.data.wsapi.Filter', {
				property: 'EndDate',
				operator: '>=',
				value: firstCreationDate.toISOString()
			});
			startsBeforeFilter = Ext.create('Rally.data.wsapi.Filter', {
				property: 'StartDate',
				operator: '<=',
				value: lastAcceptedDate.toISOString()
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
				rangeStartDate,
				rangeEndDate,
				startIndex = 0,
				endIndex = points.length - 1;
				
			// Set the appropriate date range
			if (me.isFilteringByIteration) {
				rangeStartDate = new Date(me.StartingIteration.data.StartDate);
				rangeEndDate = new Date(me.EndingIteration.data.EndDate);
			}
			else {
				rangeStartDate = me.StartingDate;
				rangeEndDate = me.EndingDate;
			}
			
			// Find start and stop indexes
			while (startIndex < points.length && points[startIndex].startDate < rangeStartDate) {
				startIndex++;
			}
			while (endIndex >= 0 && points[endIndex].endDate > rangeEndDate) {
				endIndex--;
			}
			
			return points.slice(startIndex, endIndex + 1);
		},
		
		/*
		 *	Creates the backlog chart data object
		 */
		_getBacklogChartData: function() {
			var me = this,
				backlogData = [],
				storyTotal = 0;
			
			// Create data objects for all iterations for the deltas and the totals
			_.each(me.Iterations, function(iteration) {
				var iterationStartDate = new Date(iteration.data.StartDate),
					iterationEndDate = new Date(iteration.data.EndDate);
				backlogData.push({
					name: iteration.data.Name.substring(0, 8),
					delta: 0,
					added: 0,
					accepted: 0,
					startDate: iterationStartDate,
					endDate: iterationEndDate,
					y: 0
				});
			});
			
			// Calculate stories added, accepted, and delta per iteration
			_.each(me.StoryStore.getRange(), function(story) {
				var storyCreationDate = new Date(story.data.CreationDate),
					storyAcceptedDate = new Date(story.data.AcceptedDate);
				for (var i in backlogData) {
					if (storyCreationDate >= backlogData[i].startDate && storyCreationDate <= backlogData[i].endDate) {
						backlogData[i].added++;
						backlogData[i].delta++;
					}
					if (storyAcceptedDate >= backlogData[i].startDate && storyAcceptedDate <= backlogData[i].endDate) {
						backlogData[i].accepted++;
						backlogData[i].delta--;
					}
				}
			});
			
			// Calculate backlog count at each iteration end
			for (var j in backlogData) {
				storyTotal += backlogData[j].delta;
				backlogData[j].y = storyTotal;
			}
			
			me.BacklogData = backlogData;
			
			return backlogData;
		},
		
		/*
		 *	Creates a new data set from the old using a different property
		 */
		_extractData: function(originalData, yPropertyName, otherPropertyNames) {
			var data = [];
			for (var i in originalData) {
				var point = {y: originalData[i][yPropertyName]};
				for (var j in otherPropertyNames) {
					point[otherPropertyNames[j]] = originalData[i][otherPropertyNames[j]];
				}
				data.push(point);
			}
			
			return data;
		},
		
		/*
		 *	Creates the config object for the state chart
		 */
		_getStateChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height:500,
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
								return str + '/' + this.point.totalCount;
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
					height:500,
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
		
		/*
		 *	Creates the config object for the backlog chart
		 */
		_getBacklogChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height: 500,
					width: (me.getWidth()/2 >> 0),
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				title: {text: 'CI Story Backlog'},
				tooltip: {enabled: false},
				plotOptions: {
					line: {
						// TODO: I'm not entirely sure if I want to do anything with this yet
					}
				},
				series: [
					{
						type: 'column',
						name: 'Total Backlog Stories',
						data: data,
						point: {
							events: {
								click: me._showPointInformation
							}
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
		 *	Displays information about a point
		 */
		_showPointInformation: function() {
			// TODO: Oh come on, you know this is just plain wrong
			alert('Data at iteration end:\nBacklog stories: ' + this.y + '\nStories added: ' + this.added + '\nStories accepted: ' + this.accepted);
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
				store: me.StoryStore,
				// DEBUG: Issue with sorting when showing all releases; data gets deleted somehow (?)
				sortableColumns: false,
				columnCfgs: [
					'FormattedID',
					'Name',
					'Owner',
					'Iteration',
					'ScheduleState'
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
				$('#state-chart-container').highcharts(me._getStateChartConfig(data[0]));
				$('#percentage-chart-container').highcharts(me._getPercentageChartConfig(data[1]));
				if (me.isShowingAllReleases) $('#backlog-chart-container').highcharts(me._getBacklogChartConfig(data[2]));
				
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
