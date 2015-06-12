(function() {
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('ContinuousImprovementReport', {
		extend: 'IntelRallyApp',
		componentCls: 'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize'
		],
		items: [
			{
				xtype: 'container',
				id: 'controls-container'
			},
			{
				xtype: 'container',
				id: 'chart-container',
				items: [
					{
						xtype: 'container',
						id: 'state-chart-container',
						columnWidth: 0.25
					},
					{
						xtype: 'container',
						id: 'percentage-chart-container',
						columnWidth: 0.25
					},
					{
						xtype: 'container',
						id: 'backlog-chart-container',
						columnWidth: 0.5
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
			// Get scoped project
			.then (function() {
				me.isShowingAllReleases = false;
				var scopedProject = me.getContext().getProject();
				return me._loadProject(scopedProject.ObjectID);
			})
			// Get current release, team info, and load portfolio project
			.then(function(projectRecord) {
				me.Project = projectRecord;
			
				// Extract team info from current project
				if (!me._isTeamProject(me.Project)) {
					throw 'You must be scoped to a scrum';
				}
				me.Team = me._getTeamInfo(me.Project);
				// Load release records
				return me._loadAllReleases(me.Project).then(function(releaseRecords) {
					me.ReleaseRecords = releaseRecords;
					return me._getScopedRelease(releaseRecords, me.Project.data.ObjectID, null);
				});
			})
			// Well isn't this an awkward little function
			// I'm going to throw a TODO in here saying to reorganize this highly offensive code (that I wrote...)
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
			// Extract only the continuous improvement product
			.then(function(productStore) {
				var ciProduct,
					ciProductName = me.Team.Train + 'STDCI';
				
				// Find the continuous improvement product
				ciProduct = _.find(productStore.getRange(), function(p) {return p.data.Name === ciProductName;});
				
				return me._loadPortfolioChildren(ciProduct, 'Milestone');
			})
			// Load all features under all milestones
			.then(function (milestoneStore) {
				me.Milestones = milestoneStore.getRange();
				return me._loadStories();
			})
			.then(function() {
				return me._loadUI();
			})
			// Catch-all fail function, alerts user of error message or generic message if none provided
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
			if (!me.ReleaseCheck) me._loadReleaseCheck();
			return me._loadCharts().then(function() {
				return me._loadGrid();
			}).then(function() {
				me.setLoading(false);
			});
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
			// Create promise array
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
			for (var i in featureStores) {
				var features = featureStores[i].getRange();
				for (var j in features) {
					storyPromises.push(me._loadStoriesByFeature(features[j]));
				}
			}
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
				// TODO: Uhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh
				return Ext.create('Rally.data.wsapi.Filter', {property: 'Name', operator: '!=', value: null});
			}
			else {
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
				parentFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Parent.ObjectID', operator: '=', value: portfolioItem.data.ObjectID}),
				portfolioFilter = (!customFilter ? parentFilter : parentFilter.and(customFilter)),
				storeConfig = {
					model: me[type],
					fetch: ['Name', 'ObjectID', 'FormattedID', 'Release'],
					autoLoad: false,
					disableMetaChangeEvent: true,
					limit: Infinity,
					pageSize: 200,
					filters: [portfolioFilter],
					sorters: [
						{property: 'FormattedID', direction: 'ASC'}
					],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: undefined
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
				featureFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Feature.ObjectID', operator: '=', value: feature.data.ObjectID}),
				standardFilter = featureFilter.and(me.ReleaseFilter),
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
		
		_loadReleaseCheck: function() {
			var me = this;
			me.ReleaseCheck = Ext.create('Rally.ui.CheckboxField', {
				checked: false,
				fieldLabel: 'Show for all releases: ',
				listeners: {
					change: me._releaseCheckboxChanged,
					scope: me
				}
			});
			me.down('#controls-container').add(me.ReleaseCheck);
		},
		
		/*
		 *	Fired when the checkbox for showing all releases is clicked
		 */
		_releaseCheckboxChanged: function(box, newVal, oldVal, opts) {
			var me = this;
			me.isShowingAllReleases = newVal;
			me._removeAllComponents();
			return me._loadStories().then(function() {
				return me._loadUI();
			});
		},
		
		/*
		 *	Determines if project is a scrum team project
		 */
		_isTeamProject: function(project) {
			return (/^.+\s-\s.+$/).test(project.data.Name) && project.data.Children.Count === 0;
		},
		
		/*
		 *	Gets info about a scrum team based on its name
		 *	Returns an object of {Name, Type, Number, Train} where:
		 *		-Name is the original name of the project
		 *		-Type is the type of team (e.g. Array, CLK, etc.)
		 *		-Number is the number designator for teams of that type within the train
		 *		-Train is the train to which it belongs
		 */
		_getTeamInfo: function(project) {
			var team = {Name: '', Type: '', Number: 1, Train: ''};
			team.Name = project.data.Name;
			parts = team.Name.split(/\s-\s/);
			team.Type = parts[0].split(/\d/)[0].trim();
			team.Number = parts[0].match(/\s\d\s/);
			team.Train = parts[1].split('(')[0].trim();
			team.Number = !team.Number ? 1 : team.Number;
			return team;
		},
		
		/*
		 *	Removes all existing components
		 */
		_removeAllComponents: function() {
			var me = this;
			$('#state-chart-container').empty();
			$('#percentage-chart-container').empty();
			$('#backlog-chart-container').empty();
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
					fetch: [], // ['ObjectID', 'Release'/*, 'Project'*/],
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
				percentageData[1].y = store.totalCount - percentageData[0].y;
				percentageData[1].totalCount = percentageData[0].totalCount = store.totalCount;
				return percentageData;
			});
		},
		
		/*
		 *	Loads all iterations referenced by the current set of user stories
		 */
		_loadIterations: function() {
			var me = this,
				iterationIDs = {},
				filter;
			console.log(me.StoryStore);
			_.each(me.StoryStore.getRange(), function(story) {
				if (story.data.Iteration && !iterationIDs[story.data.Iteration.ObjectID]) {
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'ObjectID', operator: '=', value: story.data.Iteration.ObjectID});
					if (!filter) filter = newFilter;
					else {
						filter = newFilter.or(filter);
						// Now it 'exists'
						iterationIDs[story.data.Iteration.ObjectID] = 42;
					}
				}
			});
			var store = Ext.create('Rally.data.wsapi.Store', {
				autoLoad: false,
				limit: Infinity,
				model: 'Iteration',
				pageSize: 200,
				fetch: ['ObjectID', 'Name', 'StartDate', 'EndDate'],
				filters: [filter],
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
				return iterationStore.getRange();
			});
		},
		
		/*
		 *	Creates the backlog chart data object
		 */
		_getBacklogChartData: function() {
			var me = this;
			return me._loadIterations().then(function(iterations) {
				var backlogData = [];
				_.each(iterations, function(iteration) {
					backlogData.push({name: iteration.data.Name, startDate: iteration.data.StartDate, endDate: iteration.data.EndDate, y: 0});
				});
				_.each(me.StoryStore.getRange(), function(story) {
					var storyCreationDate = new Date(story.data.CreationDate),
						storyAcceptedDate = new Date(story.data.AcceptedDate);
					_.each(backlogData, function(iteration) {
						var iterationStartDate = new Date(iteration.startDate),
							iterationEndDate = new Date(iteration.endDate);
						if (storyCreationDate >= iterationStartDate && storyCreationDate <= iterationEndDate) {
							iteration.y++;
						}
						if (storyAcceptedDate >= iterationStartDate && storyAcceptedDate <= iterationEndDate) {
							iteration.y--;
						}
					});
				});
				return backlogData;
			});
		},
		
		/*
		 *	Creates the config object for the state chart
		 */
		_getStateChartConfig: function(data) {
			var me = this;
			return {
				chart: {
					height:400,
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
					size: 200,
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
					height:400,
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
					size: 200,
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
					height: 400,
					width: (me.getWidth()/2 >> 0),
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				title: {text: 'CI Story Backlog'},
				tooltip: {enabled: false},
				plotOptions: {
					line: {
						// TODO: hmmmmmmmmmmmm
					}
				},
				series: [
					{
						type: 'line',
						name: 'Backlog Stories',
						data: data
					}
				],
				yAxis: {
					title: {
						text: '# Stories'
					}
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
				store: me.StoryStore,
				sortableColumns: true,
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
				
				// TODO: Lol, still need something to return here
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
