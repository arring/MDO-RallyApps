/*
 *	Displays a CFD chart for a product and its features.
 *	You must be scoped to a train for the commit matrix to work
 */
(function() {
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('ProductCFDCharts', {
		extend: 'Intel.lib.IntelRallyApp',
		componentCls: 'app',
		requires:[
			'Intel.lib.chart.FastCumulativeFlowCalculator',
			'Intel.lib.component.IntelPopup'
		],
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.CumulativeFlowChartMixin',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference'
		],
		items: [
			{
				xtype:'container',
				id:'nav'
			},
			{
				xtype:'container',
				width:'100%',
				layout:{
					type:'hbox',
					pack:'center'
				},
				items:[
					{
						xtype:'container',
						width:'66%',
						id:'product-chart'
					}
				]
			},
			{
				xtype:'container',
				id:'feature-charts',
				layout:'column',
				width:'100%'
			}
		],
		/**************************************** Launch ******************************************/
		launch: function() {
			var me = this;
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.setLoading('Loading Configuration');
			me.configureIntelRallyApp()
			.then(me._getProductAndProject.bind(me))
			.then(me._getReleases.bind(me))
			.then(me._buildControls.bind(me))
			.then(me._reload.bind(me))
			.fail(function(reason) {
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();
		},
		/**************************************** Product Loading *********************************/
		/*
		 *	Gets the product and associated project
		 */
		_getProductAndProject: function() {
			var me = this,
				productParam = window.parent.location.href.match(/product=\d+/),
				productOID = 0,
				trainName = me.getContext().getProject().Name.split(' ')[0],
				portfolioOID;

			// Find the portfolio project OID
			for (var i in me.ScrumGroupConfig) {
				if (me.ScrumGroupConfig[i].ScrumGroupName.indexOf(trainName) > -1) {
					portfolioOID = me.ScrumGroupConfig[i].PortfolioProjectOID;
					break;
				}
			}
			
			// Load the portfolio project and the associated products
			return me.loadProject(portfolioOID).then(function(project) {return me.loadPortfolioItemsOfType(project, 'Product');}).then(function(products) {
				me.Products = products.getRange();
				// If the product OID was given in the URL
				if (productParam) {
					productOID = parseInt(productParam[0].split('=')[1], 10);
					me.ProductRecord = _.find(me.Products, function(product) {return product.data.ObjectID === productOID;});
					if (!me.ProductRecord) throw 'Could not find product for ObjectID: ' + productOID;
				}
				else {
					me.ProductRecord = me.Products[0];
				}
				me.ProjectRecord = {data: me.ProductRecord.data.Project};
			});
		},
		
		/**************************************** Release Loading *********************************/
		/*
		 *	Gets releases from twelve weeks ago onward
		 */
		_getReleases: function() {
			var me = this,
				twelveWeeks = 12*7*24*60*60*1000;
				
			// Load releases after twelve weeks ago
			return me.loadReleasesAfterGivenDate(me.ProjectRecord, new Date().getTime() - twelveWeeks).then(function(releases) {
				me.Releases = releases;
				var releaseParam = window.parent.location.href.match(/release=[A-Za-z\d%]+/);
				// If a release parameter is supplied
				if (releaseParam) {
					var releaseName = decodeURIComponent(releaseParam[0].split('=')[1]);
					me.ReleaseRecord = _.find(me.Releases, function(release) {return release.data.Name === releaseName;});
					if (!me.ReleaseRecord) throw 'No release record found for: ' + releaseName;
				}
				else me.ReleaseRecord = me.getScopedRelease(me.Releases);
				return me.ReleaseRecord;
			});
		},
		
		/**************************************** Reload *******************************************/
		/*
		 *	Reloads the data and UI
		 */
		_reload: function() {
			var me = this;
			return me._getFeatures().then(me._getStorySnapshots.bind(me)).then(function() {
				return Q.all([
					me._getStories(),
					me._buildCharts()
				]);
			});
		},
		
		/**************************************** Feature Loading *********************************/
		/*
		 *	Creates a filter for features in the current release
		 */
		_createFeatureFilter: function(releaseName) {
			// Filter down to only features in the scoped release
			var releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release.Name',
					operator: '=',
					value: releaseName
				});
			return releaseFilter;
		},
		
		/*
		 *	Loads all features for the selected release under this project
		 */
		_getFeatures: function() {
			var me = this,
				config = {
					autoLoad: false,
					model: me['PortfolioItem/Feature'],
					filters: [me._createFeatureFilter(me.ReleaseRecord.data.Name)],
					fetch: ['FormattedID', 'Name', 'ObjectID', 'UserStories', 'ActualEndDate', 'PercentDoneByStoryPlanEstimate', 'PlannedEndDate', 'PlannedStartDate', 'ActualStartDate', 'Parent'],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: me.ProjectRecord.data._ref,
						projectScopeUp: false,
						projectScopeDown: false
					}
				},
				store = Ext.create('Rally.data.wsapi.Store', config);
			return me.reloadStore(store).then(function(featureStore) {
				me.Features = featureStore.getRange();
				return me.Features;
			});
		},
		
		/**************************************** Story Loading ***********************************/
		/*
		 *	Creates a filter for the stories under a feature
		 */
		_createStoryFilter: function(feature) {
			var me = this,
				// Belongs to the feature
				featureFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Feature.ObjectID',
					value: feature.data.ObjectID
				}),
				// In the scoped release
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release.Name',
					operator: 'contains',
					value: me.ReleaseRecord.data.Name
				}),
				// Does not have a release
				noReleaseFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release',
					operator: '=',
					value: null
				}),
				// Is a leaf story
				childrenFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'DirectChildrenCount',
					value: 0
				});
			return featureFilter.and((childrenFilter).and(releaseFilter.or(noReleaseFilter)));
		},
		
		/*
		 *	Loads user stories according to their related feature
		 */
		_getStories: function() {
			var me = this;
			me.StoriesByFeature = {};
			// Load stories under each feature
			return Q.all(_.map(me.Features, function(feature) {
				var config = {
					autoLoad: false,
					model: me.UserStory,
					fetch: ['FormattedID', 'ObjectID', 'Name', 'ScheduleState', 'PlanEstimate', 'Iteration'],
					filters: [me._createStoryFilter(feature)],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					}
				};
				return me.parallelLoadWsapiStore(config).then(function(storyStore) {
					// Map the feature ObjectID to the feature's stories
					me.StoriesByFeature[feature.data.ObjectID] = storyStore.getRange();
				});
			}));
		},
		
		/**************************************** Snapshot Loading ********************************/
		/*
		 *	Loads the snapshots for all stories under the features in the current release
		 */
		_getStorySnapshots: function() {
			var me = this;
			me.SnapshotsByFeature = {};
			me.AllSnapshots = [];
			
			// Load snapshots under each feature
			return Q.all(_.map(me.Features, function(feature) {
				var config = {
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					compress: true,
					// Snapshots are for leaf stories that belong to the feature
					findConfig: {
						_TypeHierarchy: 'HierarchicalRequirement',
						Children: null,
						_ItemHierarchy: feature.data.ObjectID
					},
					// Snapshots are valid during the scoped release
					filters: [
						{
							property: '_ValidFrom',
							operator: '<=',
							value: me.ReleaseRecord.data.ReleaseDate
						},
						{
							property: '_ValidTo',
							operator: '>=',
							value: me.ReleaseRecord.data.ReleaseStartDate
						}
					],
					fetch: ['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID', 'Release'],
					hydrate: ['ScheduleState', 'Release']
				};
				return me.parallelLoadLookbackStore(config).then(function(store) {
					// TODO: load only most recent snapshots of projects whose states are set to closed
					// get their ObjectIDs and make a hashmap of them. Check snapshots against that hashmap to filter them out of existence
					if (store.data.items.length > 0) {
						var records = _.filter(store.getRange(), function(storySnapshot) {
								// Filters to stories who are in the current release or do not have a release, but the feature is in the release
								// TODO: Verify
								// TODO: filter out closed projects
								return (!storySnapshot.data.Release || storySnapshot.data.Release.Name.indexOf(me.ReleaseRecord.data.Name) > -1);
							}),
							featureOID = feature.data.ObjectID;
						if (!me.SnapshotsByFeature[featureOID]) me.SnapshotsByFeature[featureOID] = [];
						// Map feature OIDs to snapshots
						me.SnapshotsByFeature[featureOID] = me.SnapshotsByFeature[featureOID].concat(records);
						me.AllSnapshots = me.AllSnapshots.concat(records);
					}
				});
			}));
		},
		
		/**************************************** UI Component Building ***************************/
		/*
		 *	Builds all controls for the page
		 */
		_buildControls: function() {
			var me = this;
			me._buildReleasePicker();
			me._buildProductPicker();
		},
		/*
		 *	Creates the release picker
		 */
		_buildReleasePicker: function() {
			var me = this;
			me.ReleasePicker = me.down('#nav').add({
				xtype: 'intelreleasepicker',
				labelWidth: 80,
				width: 240,
				releases: me.Releases,
				currentRelease: me.ReleaseRecord,
				listeners: {
					select: me._releasePickerSelected,
					scope: me
				}
			});
		},
		
		/*
		 *	Creates the product picker
		 */
		_buildProductPicker: function() {
			var me = this;
			me.ProductPicker = me.down('#nav').add({
				xtype: 'combobox',
				fieldLabel: 'Product',
				labelWidth: 80,
				width: 240,
				store: Ext.create('Rally.data.custom.Store', {
					model: me['PortfolioItem/Product'],
					data: me.Products
				}),
				valueField: 'ObjectID',
				displayField: 'Name',
				value: me.ProductRecord,
				listeners: {
					select: me._productPickerSelected,
					scope: me
				}
			});
		},
		
		/*
		 *	Creates the CFD charts
		 */
		_buildCharts: function() {
			var me = this,
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				// Create the cumulative flow calculator
				calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
					startDate: releaseStart,
					endDate: releaseEnd,
					scheduleStates: me.ScheduleStates
				});
				
			// Remove everything
			$('#product-chart-innerCt').empty();
			$('#feature-charts-innerCt').empty();
			
			// Load charts
			me.setLoading('Loading Charts');
			me._buildProductCFDChart(calc);
			me._buildFeatureCFDCharts(calc);
			me._hideHighchartsLinks();
			me.setLoading(false);
			me.doLayout();
		},
		
		/*
		 *	Creates the overall product CFD chart
		 */
		_buildProductCFDChart: function(calc) {
			var me = this,
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				options = {trendType: 'Last2Sprints'},
				productChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.AllSnapshots), options),
				productChartContainer = $('#product-chart-innerCt').highcharts(
					Ext.Object.merge({}, me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
						chart: {
							height: 400,
							events: {
								click: me._productChartClicked.bind(me)
							}
						},
						legend: {
							enabled: true,
							borderWidth: 0,
							width: 500,
							itemWidth: 100
						},
						title: {
							text: me.ProductRecord.data.Name
						},
						subtitle: {
							text: me.ReleaseRecord.data.Name.split(' ')[0]
						},
						xAxis: {
							categories: productChartData.categories,
							tickInterval: me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.66)
						},
						series: productChartData.series
					})
				)[0];
			me.setCumulativeFlowChartDatemap(productChartContainer.childNodes[0].id, productChartData.datemap);
		},
		
		/*
		 *	Creates a CFD chart for each feature
		 */
		_buildFeatureCFDCharts: function(calc) {
			var me = this,
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseEnd = me.ReleaseRecord.data.ReleaseDate,
				sortedFeatures = _.sortBy(me.Features, function(feature) {
					return feature.data.FormattedID;
				}),
				featureChartTicks = me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth()*0.32),
				featureCharts = $('#feature-charts-innerCt'),
				options = {trendType: 'Last2Sprints'};
			_.each(sortedFeatures, function(feature) {
				if (me.SnapshotsByFeature[feature.data.ObjectID]) {
					var featureChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.SnapshotsByFeature[feature.data.ObjectID]), options),
						featureChartID = 'feature-chart-no-' + (featureCharts.children().length + 1);
					featureCharts.append('<div class="feature-chart" id="' + featureChartID + '"></div>');
					var featureChartContainer = $('#' + featureChartID).highcharts(
						Ext.Object.merge({}, me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
							chart: {
								height: 350,
								events: {
									// Needs to be bound to me because this is, by default, referring to the chart
									click: me._featureChartClicked.bind(me)
								}
							},
							legend: {
								enabled: false
							},
							title: {
								text: null
							},
							subtitle: {
								useHTML: true,
								text: '<a href="https://rally1.rallydev.com/#/' + me.ProjectRecord.data.ObjectID + 'd/detail/portfolioitem/feature/' + feature.data.ObjectID + '" target="_blank">' + feature.data.FormattedID + ': ' + feature.data.Name + '</a>' +
										'<br>' + (feature.data.PercentDoneByStoryPlanEstimate*100).toFixed(2) + '% Done' + 
										'<br><span style="color:red;">Planned End: ' + feature.data.PlannedEndDate.toString().match(/[A-Za-z]+\s\d{2}\s\d{4}/) + '</span>' + 
										'<br><span style="color:blue;">Actual End: ' + (feature.data.ActualEndDate ? feature.data.ActualEndDate.toString().match(/[A-Za-z]+\s\d{2}\s\d{4}/) : 'N/A') + '</span>'
							},
							xAxis: {
								categories: featureChartData.categories,
								tickInterval: featureChartTicks,
								// Adds a line for the end of the feature or the end of the release
								plotLines: [
									{
										color: '#FF0000',
										width: 2,
										dashStyle: 'ShortDash',
										value: ((feature.data.PlannedEndDate - releaseStart)/(24*60*60*1000)) >> 0
									},
									{
										color: '#0000FF',
										width: 2,
										dashStyle: 'ShortDash',
										value: ((feature.data.ActualEndDate - releaseStart)/(24*60*60*1000)) >> 0
									}
								]
							},
							series: featureChartData.series,
							featureOID: feature.data.ObjectID // This magically makes the feature immediately available to us in the event handler
						})
					)[0];
					me.setCumulativeFlowChartDatemap(featureChartContainer.childNodes[0].id, featureChartData.datemap);
				}
			});
		},
		
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		
		/**************************************** Event Handling **********************************/
		/*
		 *	Fires when a release is selected from the release picker
		 */
		_releasePickerSelected: function(combo, records) {
			var me = this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.Releases, function(release) {return release.data.Name === records[0].data.Name;});
			me._reload();
		},
		
		/*
		 *	Fires when a product is selected from the product picker
		 */
		_productPickerSelected: function(combo, records) {
			var me = this;
			if (me.ProductRecord.data.ObjectID === records[0].data.ObjectID) return;
			me.setLoading(true);
			me.ProductRecord = _.find(me.Products, function(product) {return product.data.ObjectID === records[0].data.ObjectID;});
			me.ProjectRecord = {data: me.ProductRecord.data.Project};
			me._reload();
		},
		
		/*
		 *	Fires when the product chart is clicked
		 */
		_productChartClicked: function(e) {
			var me = this,
				featureStore = Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me['PortfolioItem/Feature'],
					data: me.Features
				}),
				releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
				releaseDate = me.ReleaseRecord.data.ReleaseDate;
			
			function greenFunction() {
				var m = 5/(4*(releaseDate - releaseStart)),
					dX = new Date() - (releaseStart.getTime() + 0.2*(releaseDate - releaseStart));
				return m*dX;
			}
			function yellowFunction() {
				var m = 5/(3*(releaseDate - releaseStart)),
					dX = new Date() - (releaseStart.getTime() + 0.4*(releaseDate - releaseStart));
				return m*dX;
			}
			function getProgressBarColor(percentDone, feature) {
				var percentReleaseDone = (new Date() - releaseStart)/(releaseDate - releaseStart);
				if (percentDone === 1) {
					return feature.data.ActualEndDate <= feature.data.PlannedEndDate ? '#C2E0A3' : '#EDB5B1';
				}
				if (percentReleaseDone <= 0.2) {
					return '#C2E0A3';
				}
				if (percentDone >= greenFunction()) return '#C2E0A3';
				else if (percentDone >= yellowFunction()) return '#F7DD98';
				else return '#EDB5B1';
			}

			if (!me.Popup) me.Popup = me.add({xtype: 'intelpopup', width: 0.75*me.getWidth(), height: 0.75*me.getHeight()});
			
			me.Popup.setContent({
				xtype: 'tabpanel',
				activeTab: 0,
				minTabWidth: 150,
				items: [
					{
						xtype: 'container',
						title: 'Feature Summary',
						items: [
							{
								xtype: 'rallygrid',
								model: me['PortfolioItem/Feature'],
								title: me.ProductRecord.data.Name + ' Features in ' + me.ReleaseRecord.data.Name.split(' ')[0],
								columnCfgs: [
									'FormattedID',
									'Name',
									'Parent',
									'PlannedEndDate',
									{
										text: 'Estimated Completion Date',
										// I needed something that was a string (sorry)
										dataIndex: 'Name',
										renderer: function(value, meta, feature) {
											var percentDone = feature.data.PercentDoneByStoryPlanEstimate,
												startDate = feature.data.ActualStartDate || feature.data.PlannedStartDate;
											return (percentDone - 1 > -0.001 ? (feature.data.ActualEndDate || feature.data.PlannedEndDate).toISOString().slice(0,10) : (percentDone > 0.001 ? ((new Date(startDate.getTime() + (new Date() - startDate)/percentDone)).toISOString().slice(0,10)) : ''));
										}
									},
									// 'PercentDoneByStoryPlanEstimate'
									{
										text: '% Done by Story Plan Estimate',
										dataIndex: 'PercentDoneByStoryPlanEstimate',
										renderer: function(percentDone, meta, feature) {
											var percentageAsString = ((percentDone*100) >> 0) + '%';
											return '<div class="progress-bar-container field-PercentDoneByStoryPlanEstimate clickable ' + feature.data.FormattedID + '-PercentDoneByStoryPlanEstimate" style="width: 100%"; ' + 
											'height: 15px; line-height: 15px"><div class="progress-bar" style="background-color: ' + getProgressBarColor(percentDone, feature) + '; width: ' + percentageAsString + '; height: 15px"></div><div class="progress-bar-label">' + percentageAsString + '</div></div>';
										}
									}
								],
								store: featureStore
							}
						]
					},
					{
						xtype: 'container',
						title: 'Commit Matrix',
						// Centered text is pretty
						style: {
							verticalAlign: 'center',
							textAlign: 'center'
						},
						listeners: {
							afterrender: function(ct) {
								var me = this,
									trainName = me.ProductRecord.data.Project.Parent._refObjectName.split(' ')[0],
									trainProjectOID;
								// Find scrum group OID
								for (var i in me.ScrumGroupConfig) {
									if (me.ScrumGroupConfig[i].ScrumGroupName.indexOf(trainName) > -1) {
										trainProjectOID = me.ScrumGroupConfig[i].ScrumGroupRootProjectOID;
										break;
									}
								}
								
								// Create hyper-link
								var link = 'https://rally1.rallydev.com/#/' + trainProjectOID + 'd/custom/21179734092?viewmode=percent_done';
								ct.update('<h2><a href="' + link + '" target="_blank">View commit matrix</a></h2>');
							},
							scope: me
						}
					},
					{
						xtype: 'container',
						title: 'Feature Timeboxes',
						items: [
							{
								xtype: 'rallygrid',
								model: me['PortfolioItem/Feature'],
								store: featureStore,
								columnCfgs: [
									'FormattedID',
									'Name',
									'PlannedStartDate',
									'PlannedEndDate',
									{
										text: 'Timebox',
										dataIndex: 'ActualStartDate',
										width: '50%',
										renderer: function(start, meta, feature) {
											var plannedStart = feature.data.PlannedStartDate,
												plannedEnd = feature.data.PlannedEndDate,
												actualStart = feature.data.ActualStartDate,
												actualEnd = feature.data.ActualEndDate,
												releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
												releaseDate = me.ReleaseRecord.data.ReleaseDate,
												minDate = actualEnd ? _.sortBy([plannedStart, actualStart, releaseStart])[0] : _.sortBy([plannedStart, releaseStart])[0],
												maxDate = actualEnd ? _.sortBy([plannedEnd, releaseDate, actualEnd])[2] : _.sortBy([plannedEnd, releaseDate])[1],
												totalTime = maxDate - minDate,
												planned,
												actual,
												release;
												
											// Create planned dates divs
											var beforePlanned = '<div style="float:left;height:15px;width:' + ((((plannedStart - minDate)/totalTime)*100) >> 0) + '%"></div>',
												duringPlanned = '<div style="background-color:pink;border-radius:5px;border-width:1px;float:left;height:15px;width:' + ((((plannedEnd - plannedStart)/totalTime)*100) >> 0) + '%"></div>',
												afterPlanned = '<div style="float:left;height:15px;width:' + ((((maxDate - plannedEnd)/totalTime)*100) >> 0) + '%"></div>';
											planned = '<div style="width:100%;height:15px;line-height:15px;">' + beforePlanned + duringPlanned + afterPlanned + '</div>';
												
											// Create actual dates divs if there is an actual end date
											if (actualEnd) {
												var beforeActual = '<div style="float:left;height:15px;width:' + ((((actualStart - minDate)/totalTime)*100) >> 0) + '%"></div>',
													duringActual = '<div style="background-color:purple;border-radius:5px;border-width:1px;float:left;height:15px;width:' + ((((actualEnd - actualStart)/totalTime)*100) >> 0) + '%"></div>',
													afterActual = '<div style="float:left;height:15px;width:' + ((((maxDate - actualEnd)/totalTime)*100) >> 0) + '%"></div>';
												actual = '<div style="width:100%;height:15px;line-height:15px;">' + beforeActual + duringActual + afterActual + '</div>';
											}
											else {
												actual = '<div style="width:100%;height:15px;line-height:15px;text-align:center">N/A</div>';
											}
											
											// Create release date divs
											var beforeRelease = '<div style="float:left;height:15px;width:' + ((((releaseStart - minDate)/totalTime)*100) >> 0) + '%"></div>',
												duringRelease = '<div style="background-color:blue;border-radius:5px;border-width:1px;float:left;height:15px;width:' + ((((releaseDate - releaseStart)/totalTime)*100) >> 0) + '%"></div>',
												afterRelease = '<div style="float:left;height:15px;width:' + ((((maxDate - releaseDate)/totalTime)*100) >> 0) + '%"></div>';
											release = '<div style="width:100%;height:15px;line-height:15px;">' + beforeRelease + duringRelease + afterRelease + '</div>';
											
											return '<div style="width:100%;height:15px;line-height:15px;">' + planned + actual + release + '</div>';
										}
									}
								]
							}
						]
					}
				]
			});
			me.Popup.show();
			$('.x-tab-inner').css('width', '130px');
		},
		
		/*
		 *	Fires when a feature chart is clicked
		 */
		_featureChartClicked: function(e) {
			var me = this,
				feature = _.find(me.Features, function(feature) {return feature.data.ObjectID === e.currentTarget.options.featureOID;}),
				storyStore = Ext.create('Rally.data.custom.Store', {
					autoLoad: false,
					model: me.UserStory,
					data: me.StoriesByFeature[feature.data.ObjectID]
				});
				
			if (!me.Popup) me.Popup = me.add({xtype: 'intelpopup', width: 0.75*me.getWidth(), height: 0.75*me.getHeight()});
			
			me.Popup.setContent({
				xtype: 'tabpanel',
				items: [
					{
						xtype: 'container',
						title: 'Stories',
						items: [
							{
								xtype: 'rallygrid',
								model: me.UserStory,
								title: feature.data.FormattedID + ': ' + feature.data.Name + 
											' (' + me.StoriesByFeature[feature.data.ObjectID].length + ' stories in release, ' + 
											_.reduce(me.StoriesByFeature[feature.data.ObjectID], function(pointTotal, story) {return pointTotal + story.data.PlanEstimate;}, 0) + ' points)',
								columnCfgs: [
									'FormattedID',
									'Name',
									'Project',
									'Iteration',
									'PlanEstimate',
									'ScheduleState'
								],
								store: storyStore
							}
						]
					}
				]
			});
			me.Popup.show();
		}
	});
})();
