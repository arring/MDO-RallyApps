(function() {
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('ContinuousImprovementReport', {
		extend: 'IntelRallyApp',
		componentCls: 'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ParallelLoader'
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
				// DEBUG
				Q.longStackSupport = true;
				me.setLoading('Loading current project');
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
				
				console.log('Team: ', me.Team);
				
				// Load release records
				me.setLoading('Loading portfolio project');
				return me._loadReleasesAfterGivenDate(projectRecord, (new Date()*1 - 1000*60*60*24*7*12)).then(function(releaseRecords) {
					return me._getScopedRelease(releaseRecords, projectRecord.data.ObjectID, null);
				});
			})
			// Well isn't this an awkward little function
			// I'm going to throw a TODO in here saying to reorganize this highly offensive code (that I wrote...)
			.then(function(release) {
				me.CurrentRelease = release;
				console.log('Release', release);
				return me._loadProjectByName(me.Team.Train + ' POWG Portfolios');
			})
			// Get all products under the portfolio project
			.then(function(portfolioProject) {
				if (!portfolioProject) {
					throw 'Could not load portfolio project';
				}
				me.setLoading('Loading product');
				
				// Load all products
				return me._loadPortfolioItemsOfType(portfolioProject, 'Product');
			})
			// Extract only the continuous improvement product
			.then(function(productStore) {
				var ciProduct,
					ciProductName = me.Team.Train + 'STDCI';
				if (!productStore) {
					throw 'Could not load products';
				}
				
				// Find the continuous improvement product
				ciProduct = _.find(productStore.getRange(), function(p) {return p.data.Name === ciProductName;});
				console.log('ciProduct: ', ciProduct);
				if (!ciProduct) {
					throw 'Could not load continuous improvement product';
				}
				me.setLoading('Loading milestones');
				
				return me._loadPortfolioChildren(ciProduct, 'Milestone');
			})
			// Load all features under all milestones
			.then(function (milestoneStore) {
				var featurePromises = [],
					releaseFilter = {property: 'Release.Name', operator: '=', value: me.CurrentRelease.data.Name},
					milestones;
				if (!milestoneStore) {
					throw 'Could not load milestones';
				}
				me.setLoading('Loading features');
				
				console.log('Milestones:', milestoneStore);
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
				if (!featureStores) {
					throw 'Could not load features';
				}
				me.setLoading('Loading stories');
				console.log('Features: ', featureStores);
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
				if (!storyStores) {
					throw 'Could not load user stories';
				}
				console.log(storyStores);
				
				me.StoryStore = storyStores[0];
				for (var i = 1; i < storyStores.length; i++) {
					me.StoryStore.add(storyStores[i].getRange());
				}
				// Grrr, I don't like that I did this...will figure out a way to prevent.
				// Resultant of the fact that filtering stories by release didn't work server-side
				me.StoryStore.remove(_.filter(me.StoryStore.getRange(), function(story) {return story.data.Release.Name !== me.CurrentRelease.data.Name;}));
				console.log('StoryStore', me.StoryStore);
				
				me.setLoading(false);
				me._loadGrid();
				me._loadCharts();
			})
			.fail(function(reason) {
				me.setLoading(false);
				me._alert('Error', reason || 'error');
			})
			.done();
		},
		
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
		
		_isTeamProject: function(project) {
			return (/^.+\s-\s.+$/).test(project.data.Name) && project.data.Children.Count === 0;
		},
		
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
		
		_loadCharts: function() {
			var me = this;
			var stateData = [
				{name: 'Undefined', y: 0, totalCount: me.StoryStore.data.length},
				{name: 'Defined', y: 0, totalCount: me.StoryStore.data.length},
				{name: 'In-Progress', y: 0, totalCount: me.StoryStore.data.length},
				{name: 'Completed', y: 0, totalCount: me.StoryStore.data.length},
				{name: 'Accepted', y: 0, totalCount: me.StoryStore.data.length}
			];
			// I made this out of laziness and efficiency
			var stateCounts = {};
			stateCounts.Undefined = stateData[0];
			stateCounts.Defined = stateData[1];
			stateCounts['In-Progress'] = stateData[2];
			stateCounts.Completed = stateData[3];
			stateCounts.Accepted = stateData[4];
			console.log('State counts: ', stateCounts);
			_.each(me.StoryStore.getRange(), function(story) {
				stateCounts[story.data.ScheduleState].y++;
			});
			console.log(stateData);
			var stateChartConfig = {
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
					data: stateData
				}]
			};
			
			$('#chart-container').highcharts(stateChartConfig);
			// Hide the link (thanks Sam)
			$('.highcharts-container > svg > text:last-child').hide();
			return me;
		},
		
		_loadGrid: function() {
			var me = this;
			me.StoryGrid = Ext.create('Rally.ui.grid.Grid', {
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
			});
			return me.getComponent(1).add(me.StoryGrid);
		}
	});
})();
