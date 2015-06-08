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
				id: 'chart-container'
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
				var scopedProject = me.getContext().getProject();
				return me._loadProject(scopedProject.ObjectID);
			})
			// Get current release, team info, and load portfolio project
			.then(function(projectRecord) {
				// Extract team info from current project
				if (!me._isTeamProject(projectRecord)) {
					throw 'You must be scoped to a scrum';
				}
				me.Team = me._getTeamInfo(projectRecord);
				// Load release records
				return me._loadReleasesAfterGivenDate(projectRecord, (new Date()*1 - 1000*60*60*24*7*12)).then(function(releaseRecords) {
					return me._getScopedRelease(releaseRecords, projectRecord.data.ObjectID, null);
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
				var featurePromises = [],
					releaseFilter = {property: 'Release.Name', operator: '=', value: me.CurrentRelease.data.Name},
					milestones;
				// Create promise array
				milestones = milestoneStore.getRange();
				for (var i in milestones) {
					featurePromises.push(me._loadPortfolioChildren(milestones[i], 'Feature', releaseFilter));
				}
				return Q.all(featurePromises);
			})
			// Load user stories belonging to the currently scoped scrum
			.then(function(featureStores) {
				var storyPromises = [],
					teamFilter = {property: 'Project.Name', operator: '=', value: me.Team.Name};
				me.setLoading('Loading stories');
				for (var i in featureStores) {
					var features = featureStores[i].getRange();
					for (var j in features) {
						storyPromises.push(me._loadStoriesByFeature(features[j], teamFilter));
					}
				}
				
				return Q.all(storyPromises);
			})
			// Place all stories in a single store
			.then(function(storyStores) {
				me.StoryStore = storyStores[0];
				for (var i = 1; i < storyStores.length; i++) {
					me.StoryStore.add(storyStores[i].getRange());
				}
				// Grrr, I don't like that I did this...will figure out a way to prevent.
				// Resultant of the fact that filtering stories by release didn't work server-side
				me.StoryStore.remove(_.filter(me.StoryStore.getRange(), function(story) {return !story.data.Release || story.data.Release.Name !== me.CurrentRelease.data.Name;}));
				
				me.setLoading(false);
				me._loadGrid();
				me._loadCharts();
			})
			// Catch-all fail function, alerts user of error message or generic message if none provided
			.fail(function(reason) {
				me.setLoading(false);
				me._alert('Error', reason || 'error');
			})
			.done();
		},
		
		/*
		 *	Loads direct children of a portfolio item of type
		 *	Filters by customFilter (if provided), a {property, operator, value} object
		 */
		_loadPortfolioChildren: function(portfolioItem, type, customFilter) {
			var me = this,
				parentFilter = {property: 'Parent.ObjectID', operator: '=', value: portfolioItem.data.ObjectID},
				portfolioFilters = (!customFilter ? [parentFilter] : [parentFilter, customFilter]),
				storeConfig = {
					model: 'PortfolioItem/' + type,
					fetch: me._portfolioItemFields,
					autoLoad: false,
					disableMetaChangeEvent: true,
					limit: Infinity,
					pageSize: 200,
					filters: portfolioFilters,
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
				featureFilter = {property: 'Feature.FormattedID', operator: '=', value: feature.data.FormattedID},
				storyFilters = (!customFilter ? [featureFilter] : [featureFilter, customFilter]),
				storeConfig = {
					model: 'UserStory',
					fetch: me._userStoryFields.concat('Feature', 'Owner', 'ScheduleState'),
					autoLoad: false,
					limit: Infinity,
					pageSize: 200,
					filters: storyFilters,
					sorters: [
						{property: 'FormattedID', direction: 'ASC'}
					],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					}
				};
			var store = Ext.create('Rally.data.wsapi.Store', storeConfig);
			return me._reloadStore(store);
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
		 *	Creates the chart data object
		 */
		_getChartData: function() {
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
			
			return stateData;
		},
		
		/*
		 *	Creates the config object for the pie chart
		 *	data must be an array of properly formatted Highcharts data objects
		 */
		_getChartConfig: function(data) {
			return {
				chart: {
					height:400,
					width: 600,
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
					size:260,
					data: data
				}]
			};
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
				data = me._getChartData(),
				stateChartConfig = me._getChartConfig(data);
			
			// Add chart
			$('#chart-container').highcharts(stateChartConfig);
			
			// Hide the link for Highcharts (thanks Sam)
			$('.highcharts-container > svg > text:last-child').hide();
			
			// TODO: Change this to something else, this doesn't quite make sense
			return me;
		},
		
		/*
		 *	Loads and adds user story grid
		 */
		_loadGrid: function() {
			var me = this,
				gridConfig = me._getGridConfig();
			me.StoryGrid = Ext.create('Rally.ui.grid.Grid', gridConfig);
			
			// TODO: Find the component in a more extensible manner
			return me.getComponent(1).add(me.StoryGrid);
		}
	});
})();
