(function(){
	var Ext = window.Ext4 || window.Ext;
	
	console = { log: function(){} };

	/************************** Sanity Dashboard *****************************/
	Ext.define('SanityDashboard', {
		extend: 'IntelRallyApp',
		cls:'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ReleaseQuery',
			'UserAppPreferences',
			'ParallelLoader'
		],	
		minWidth:1100,
		items:[{ 
			xtype: 'container',
			id: 'controlsContainer',
			layout:'hbox'
		},{ 
			xtype: 'container',
			id: 'ribbon',
			cls:'ribbon',
			layout: 'column',
			items: [{
				xtype: 'container',
				width:480,
				id: 'pie'
			},{
				xtype: 'container',
				columnWidth:0.999,
				id: 'heatmap'
			}]
		},{
			xtype:'container',
			id:'gridsContainer',
			cls:'grids-container',
			layout: 'column',
			items: [{
				xtype: 'container',
				columnWidth:0.495,
				id: 'gridsLeft',
				cls:'grids-left'
			},{
				xtype: 'container',
				columnWidth:0.495,
				id: 'gridsRight',
				cls:'grids-right'
			}]
		}],
		_prefName: 'intel-SAFe-apps-preference',
		_colors: [
			'#AAAAAA', //GRAY
			'#2ECC40', //GREEN
			'#7FDBFF', //AQUA
			'#DDDDDD', //SILVER
			'#39CCCC', //TEAL
			'#FF851B', //ORANGE
			'#3D9970', //OLIVE
			'#01FF70', //LIME
			'#FFDC00', //YELLOW
			'#0074D9' //BLUE
		],
		
		/***************************************************** Store Loading *******************************************************/		
		_getUserStoryFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
				userStoryProjectFilter,
				inIterationButNotReleaseFilter;
			if(me.CurrentTeam) 
				userStoryProjectFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: me.CurrentTeam.data.ObjectID });
			else if(me.LeafProjects && Object.keys(me.LeafProjects).length)
				userStoryProjectFilter = _.reduce(me.LeafProjects, function(filter, projectData, projectOID){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: projectOID});
					if(filter) return filter.or(newFilter);
					else return newFilter;
				}, null);
			inIterationButNotReleaseFilter =
				Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
				Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
				Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null }))
				.and(userStoryProjectFilter);
				
			return inIterationButNotReleaseFilter.or(releaseNameFilter.and(userStoryProjectFilter));
		},				
		_getStories: function(){
			var me=this,
				config = {
					model: me.UserStory,
					url: 'https://rally1.rallydev.com/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query:me._getUserStoryFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'StartDate', 'EndDate', 'Iteration', 'Release', 'Description', 
							'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 'Blocked', 'BlockedReason', 'Feature'].join(','),
						workspace:me.getContext().getWorkspace()._ref,
						includePermissions:true
					}
				};
			return me._parallelLoadStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		_getFeatureFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
				featureProductFilter = _.reduce(me.Products, function(filter, product){
					var thisFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Parent.Parent.ObjectID',  value:product.data.ObjectID });
					return filter ? filter.or(thisFilter) : thisFilter;
				}, null);
			
			return featureProductFilter ? releaseNameFilter.and(featureProductFilter) : {property:'ObjectID', value:0};
		},	
		_getFeatures: function(){
			var me=this,
				config = {
					model: me.Feature,
					url: 'https://rally1.rallydev.com/slm/webservice/v2.0/PortfolioItem/Feature',
					params: {
						pagesize:200,
						query:me._getFeatureFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'Release', 
							'Description', 'FormattedID', 'UserStories'].join(','),
						workspace:me.getContext().getWorkspace()._ref,
						includePermissions:true
					}
				};
			return me._parallelLoadStore(config).then(function(store){
				me.FeatureStore = store;
				return store;
			});
		},
		
		/******************************************************* Reloading ********************************************************/	
		_removeAllItems: function(){
			var me = this;
			Ext.getCmp('pie').removeAll();
			Ext.getCmp('heatmap').removeAll();
			Ext.getCmp('gridsLeft').removeAll();
			Ext.getCmp('gridsRight').removeAll();
		},
		_redrawEverything: function(){
			var me=this;
			
			me._removeAllItems();
			me.setLoading('Loading Grids and Charts');
			return me._buildGrids()
				.then(function(){ return me._buildRibbon(); })
				.fail(function(reason){ return Q.reject(reason); })
				.then(function(){ me.setLoading(false); });
		},
		_reloadEverything:function(){
			var me=this;
			
			if(!me.ReleasePicker) me._loadReleasePicker();
			if(!me.TeamPicker) me._loadTeamPicker();

			me.setLoading('Loading Stores');
			return Q.all([
					me._getStories(),
					me._getFeatures()
				])
				.then(function(){ me._redrawEverything(); })
				.fail(function(reason){ return Q.reject(reason); })
				.then(function(){ me.setLoading(false); });
		},

		/********************************************************** tooltip functions **************************************/
		_clearToolTip: function(){
			var me = this;
			if(me.tooltip){
				me.tooltip.panel.hide();
				me.tooltip.triangle.hide();
				me.tooltip.panel.destroy();
				me.tooltip.triangle.destroy();
				me.tooltip = null;
			}
		},	
		_addScrollEventListener: function(){
			var me=this;
			me.getEl().dom.addEventListener('scroll', function(){ me._clearToolTip(); });
		},
		
		/******************************************************* LAUNCH ********************************************************/
		launch: function() {
			var me=this; 
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me._addScrollEventListener();
			me.setLoading('Loading Configuration');
			me._loadModels()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //two streams
						me._projectInWhichTrain(me.ProjectRecord) /********* 1 ************/
							.fail(function(reason){
								if(reason != 'Project not in a train') return Q(reason); //its ok if its not in the train
							})
							.then(function(trainRecord){
								if(trainRecord){
									if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
									else me._isScopedToTrain = true;
									me.TrainRecord = trainRecord;
									return me._loadAllLeafProjects(me.TrainRecord)
										.then(function(leftProjects){
											me.LeafProjects = leftProjects;
											if(me._isScopedToTrain) me.CurrentTeam = null;
											else me.CurrentTeam = me.ProjectRecord;
											return me._loadProducts(me.TrainRecord);
										})
										.then(function(productStore){ me.Products = productStore.getRange(); });
								}
								else {
									me.CurrentTeam = me.ProjectRecord;
									me._isScopedToTrain = false;
								}
							}),
						me._loadPreferences() /********* 2 ************/
							.then(function(appPrefs){
								me.AppPrefs = appPrefs;
								var twelveWeeks = 1000*60*60*24*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseStore){
								me.ReleaseStore = releaseStore;
								var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppPrefs);
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									console.log('release loaded', currentRelease);
								}
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},

		/******************************************************* RELEASE PICKER ********************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);
			if(typeof me.AppPrefs.projs[pid] !== 'object') me.AppPrefs.projs[pid] = {};
			me.AppPrefs.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._savePreferences(me.AppPrefs)
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){
					me._alert('ERROR', reason || '');
					me.setLoading(false);
				})
				.done();
		},
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelreleasepicker',
				labelWidth: 80,
				width: 240,
				releases: me.ReleaseStore.data.items,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},	
		_teamPickerSelected: function(combo, records){
			var me=this, recName = records[0].data.Name;
			if((!me.CurrentTeam && recName == 'All') || (me.CurrentTeam && me.CurrentTeam.data.Name == recName)) return;
			if(recName == 'All') me.CurrentTeam = null;
			else me.CurrentTeam = _.find(me.LeafProjects, function(p){ return p.data.Name == recName; });
			return me._redrawEverything();
			
		},
		_loadTeamPicker: function(){
			var me=this;
			if(!me.TrainRecord) return; //don't show for non-train teams
			me.TeamPicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelcombobox',
				width: 200,
				padding:'0 0 0 40px',
				fieldLabel: 'Team:',
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],
					data: [{Name:'All'}].concat(_.map(_.sortBy(me.LeafProjects, 
						function(s){ return s.data.Name; }),
						function(p){ return {Name: p.data.Name}; }))
				}),
				displayField:'Name',
				value:me.CurrentTeam ? me.CurrentTeam.data.Name : 'All',
				listeners: {
					select: me._teamPickerSelected.bind(me)
				}
			});
		},
	
		/******************************************************* Render Ribbon ********************************************************/	
		_getCountForTeamAndGrid: function(project, grid){
			return _.filter(grid.originalConfig.data, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			}).length;
		},
		_getProjectsUserStoriesInRelease: function(project){
			var me=this;
			return _.filter(me.UserStoryStore.getRange(), function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},	
		_onHeatmapClick: function(point, team, grid){
			var me=this,
				panelWidth=300,
				rect = point.graphic.element.getBoundingClientRect(),
				leftSide = rect.left,
				topSide = rect.top,
				x = point.x,
				y = point.y,
				projectsStoriesInRelease = me._getProjectsUserStoriesInRelease(team),
				totalStories = projectsStoriesInRelease.length,
				totalPoints = _.reduce(projectsStoriesInRelease, function(sum, p){ return sum + p.data.PlanEstimate; });
			if(me.tooltip && me.tooltip.x == x && me.tooltip.y == y){
				me._clearToolTip();
				return; 
			}
			me._clearToolTip();
			me.tooltip = {
				x:x,
				y:y,
				panel: Ext.widget('container', {
					floating:true,
					width: panelWidth,
					autoScroll:false,
					id:'HeatmapTooltipPanel',
					cls: 'intel-tooltip',
					focusOnToFront:false,
					shadow:false,
					renderTo:Ext.getBody(),
					items: [{
						xtype:'container',
						layout:'hbox',
						cls: 'heatmap-tooltip-inner-container',
						items:[{
							xtype:'container',
							flex:1,
							items:[{
								xtype:'container',
								html: [
									'<p><b>How big of problem</b>: ',
										'<span class="heatmap-tooltip-big-problem">' + ((point.value/totalStories*10000>>0)/100) + '%</span>',
									'</p>',
									'<p><b>' + grid.originalConfig.title + '</b>: ' + point.value + '</p>',
									'<p><b>Stories in Release</b>: ' + totalStories + '</p>'
								].join('')
							},{
								xtype:'button',
								cls:'heatmap-tooltip-button',
								text:'GO TO THIS GRID',
								handler: function(){
									me._clearToolTip();
									if(!me.CurrentTeam || me.CurrentTeam.data.ObjectID != team.data.ObjectID){
										me.CurrentTeam = team;
										me.TeamPicker.setValue(team.data.Name);
										me._redrawEverything()
											.then(function(){ Ext.get(grid.originalConfig.id).scrollIntoView(me.el); })
											.done();
									}
									else Ext.get(grid.originalConfig.id).scrollIntoView(me.el);
								}
							}]
						},{
							xtype:'button',
							cls:'heatmap-tooltip-close',
							text:'X',
							width:20,
							handler: function(){ me._clearToolTip(); }
						}]
					}],
					listeners:{
						afterrender: function(panel){
							panel.setPosition(leftSide-panelWidth, topSide);
						}
					}
				})	
			};
			me.tooltip.triangle = Ext.widget('container', {
				floating:true,
				width:0, height:0,
				focusOnToFront:false,
				shadow:false,
				renderTo:Ext.getBody(),
				listeners:{
					afterrender: function(panel){
						setTimeout(function(){
							panel.addCls('intel-tooltip-triangle');
							panel.setPosition(leftSide - 10, topSide);
						}, 10);
					}
				}
			});	
		},	
		_getHeatMapConfig: function() { 
			var me=this,
				highestNum = 0,
				userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
					return grid.originalConfig.model == 'UserStory'; 
				}).reverse(),
				chartData = [],
				selectTeamFunctionName = '_selectTeam' + (Math.random()*10000>>0),
				selectIdFunctionName = '_selectId' + (Math.random()*10000>>0);
			_.each(userStoryGrids, function(grid, gindex) {
				_.each(_.sortBy(me.LeafProjects, function(p){ return p.data.Name; }), function(project, pindex){
					var gridCount = me._getCountForTeamAndGrid(project, grid);
					highestNum = Math.max(gridCount, highestNum);
					chartData.push([pindex, gindex, gridCount]);
				});
			});
			window[selectTeamFunctionName] = function(value){
				var team = _.find(me.LeafProjects, function(p){ return p.data.Name.split('-')[0].trim() === value; });
				if(me.CurrentTeam && team.data.ObjectID == me.CurrentTeam.data.ObjectID){
					me.CurrentTeam = null;
					me.TeamPicker.setValue('All');
				} else {
					me.CurrentTeam = team;
					me.TeamPicker.setValue(team.data.Name);
				}
				me._redrawEverything();
			};
			window[selectIdFunctionName] = function(gridId){
				Ext.get(gridId).scrollIntoView(me.el);
			};
			return {       
				chart: {
					type: 'heatmap',
					height:420,
					marginTop: 10,
					marginLeft: 140,
					marginBottom: 80
				},
				title: { text: null },
				xAxis: {
					categories: _.sortBy(_.map(me.LeafProjects, 
						function(project){ return project.data.Name.split('-')[0].trim(); }),
						function(p){ return p; }),
					labels: {
						style: { width:100 },
						formatter: function(){
							var text = this.value;
							if(me.CurrentTeam && me.CurrentTeam.data.Name.indexOf(this.value) === 0) 
								text = '<span class="curteam">' + this.value + '</span>';
							return '<a class="heatmap-xlabel" onclick="' + selectTeamFunctionName + '(\'' + this.value +  '\');">' + text + '</a>';
						},
						useHTML:true,
						rotation: -45
					}
				},
				yAxis: {
					categories: _.map(userStoryGrids, function(grid){ return grid.originalConfig.title; }),
					title: null,
					labels: {
						formatter: function(){
							var text = this.value,
								index = _.indexOf(this.axis.categories, text),
								gridID = userStoryGrids[index].originalConfig.id,
								styleAttr='style="background-color:' + me._colors[userStoryGrids.length - index - 1] + '"';
							return '<div class="heatmap-ylabel"' + styleAttr + ' onclick="' + 
												selectIdFunctionName + '(\'' + gridID +  '\')">' + text + '</div>';
						},
						useHTML:true
					}
				},
				colorAxis: {
					min: 0,
					minColor: '#FFFFFF',
					maxColor: highestNum ? '#ec5b5b' : '#FFFFFF' //if they are all 0 make white
				},
				plotOptions: {
					series: {
						point: {
							events: {
								click: function(e){
									var point = this,
										team = _.sortBy(me.LeafProjects, function(p){ return p.data.Name; })[point.x],
										grid = userStoryGrids[point.y];
									me._onHeatmapClick(point, team, grid);
								}
							}
						}
					}
				},
				legend: { enabled:false },
				tooltip: { enabled:false },
				series: [{
					name: 'Errors per Violation per Team',
					borderWidth: 1,
					data: chartData,
					dataLabels: {
						enabled: true,
						color: 'black',
						style: {
							textShadow: 'none'
						}
					}
				}]  
			};
		},
		_getPieChartConfig: function() { 
			var me=this,
				chartData = _.map(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid) { 
					return {
						name: grid.originalConfig.title,
						y: grid.originalConfig.data.length,
						totalCount: grid.originalConfig.totalCount,
						gridID: grid.originalConfig.id,
						model: grid.originalConfig.model
					};
				});
			if(_.every(chartData, function(item){ return item.y === 0; })){
				chartData = [{
					name: 'Everything is correct!',
					y:1,
					totalCount:1,
					color:'#2ECC40', //GREEN
					model:''
				}];
			}
			return {
				chart: {
					height:420,
					marginLeft: -15,
					plotBackgroundColor: null,
					plotBorderWidth: 0,
					plotShadow: false
				},
				title: { text: null },
				tooltip: { enabled:false },
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
						},
						startAngle: 10,
						endAngle: 170,
						center: ['0%', '50%']
					}
				},
				series: [{
					type: 'pie',
					name: 'Grid Count',
					innerSize: '25%',
					size:260,
					point: {
						events: {
							click: function(e) {
								if(e.point.gridID) Ext.get(e.point.gridID).scrollIntoView(me.el);
								e.preventDefault();
							}
						}
					},
					data: chartData
				}]
			};
		},	
		_hideHighchartsLinks: function(){ $('.highcharts-container > svg > text:last-child').hide(); },
		_buildRibbon: function() {
			var me=this;
			Highcharts.setOptions({ colors: me._colors });
			$('#pie').highcharts(me._getPieChartConfig());
			Highcharts.setOptions({ colors: ['#AAAAAA'] });
			if(!me.TrainRecord) me._hideHighchartsLinks(); //DONT show the heatmap for non-train teams
			else {
				$('#heatmap').highcharts(me._getHeatMapConfig());
				me._hideHighchartsLinks();
			}
		},
		
		/******************************************************* Render GRIDS ********************************************************/
		_getFilteredStories: function(){
			var me=this;
			if(me.TrainRecord){
				if(me.CurrentTeam) return _.filter(me.UserStoryStore.getRange(), function(item){ 
					return item.data.Project.ObjectID == me.CurrentTeam.data.ObjectID;
				});
				else return me.UserStoryStore.getRange();
			}
			else return me.UserStoryStore.getRange();
		},
		_getFilteredFeatures: function(){ return this.FeatureStore.getRange(); },
		_addGrid: function(gridConfig){
			var me=this,
				randFunctionName = '_scrollToTop' + (Math.random()*10000>>0);
				
			window[randFunctionName] = function(){ Ext.get('controlsContainer').scrollIntoView(me.el); };
			
			var getGridTitleLink = function(data, model){
					var num = data && data.length,
						den = gridConfig.totalCount,
						type = (model==='UserStory' ? 'Stories' : 'Features');
					return gridConfig.title +
						'<span class="sanity-grid-header-stats">' + 
							(data ? (' (' + num+ '/' + den + ' ' + type + ' - ' + ((num/den*10000>>0)/100) + '% )') : '') + 
						'</span>' + 
						'<span class="sanity-grid-header-top-link"><a onclick="' + randFunctionName + '()">Top</a></span>';
				},
				storeModel = (gridConfig.model == 'UserStory') ? me.UserStoryStore.model : me.FeatureStore.model,
				grid = Ext.getCmp('grids' + gridConfig.side).add(gridConfig.data.length ? 
					Ext.create('Rally.ui.grid.Grid', {
						title: getGridTitleLink(gridConfig.data, gridConfig.model),
						id: gridConfig.id,
						cls:'grid-unhealthy sanity-grid',
						columnCfgs: gridConfig.columns,
						showPagingToolbar: true,
						showRowActionsColumn: true,
						enableBulkEdit: true,
						emptyText: ' ',
						originalConfig:gridConfig,
						gridContainer: Ext.getCmp('grids' + gridConfig.side),
						pagingToolbarCfg: {
							pageSizes: [10, 15, 25, 100],
							autoRender: true,
							resizable: false
						},
						store: Ext.create('Rally.data.custom.Store', {
							model: storeModel,
							pageSize:10,
							data: gridConfig.data
						})
					}) : 
					Ext.create('Rally.ui.grid.Grid', {
						xtype:'rallygrid',
						title: getGridTitleLink(),
						id: gridConfig.id,
						cls:' sanity-grid grid-healthy',
						showPagingToolbar: false,
						showRowActionsColumn: false,
						emptyText: '0 Problems!',
						originalConfig: gridConfig,
						gridContainer: Ext.getCmp('grids' + gridConfig.side),
						store: Ext.create('Rally.data.custom.Store', { data:[] })
					})
				);
			return grid;
		},	
		_buildGrids: function() { 
			var me = this,
				filteredStories = me._getFilteredStories(),
				filteredFeatures = me._getFilteredFeatures();
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate),
				now = new Date(),
				defaultUserStoryColumns = [{
						text:'FormattedID',
						dataIndex:'FormattedID', 
						editor:false
					},{
						text:'Name',
						dataIndex:'Name', 
						editor:false
					}].concat(!me.CurrentTeam ? [{
						text: 'Team', 
						dataIndex: 'Project',
						editor:false
					}] : []),
				defaultFeatureColumns = [{
						text:'FormattedID',
						dataIndex:'FormattedID', 
						editor:false
					},{
						text:'Name',
						dataIndex:'Name', 
						editor:false
					},{
						text:'PlannedEndDate',
						dataIndex:'PlannedEndDate', 
						editor:false
					}],
				gridConfigs = [{
					showIfLeafProject:true,
					title: 'Blocked Stories',
					id: 'grid-blocked-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Blocked',
						dataIndex:'Blocked'
					},{
						text:'BlockedReason',
						dataIndex:'BlockedReason',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return item.data.Blocked; 
					}
				},{
					showIfLeafProject:true,
					title: 'Unsized Stories',
					id: 'grid-unsized-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'PlanEstimate',
						dataIndex:'PlanEstimate',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return item.data.PlanEstimate === null; 
					}
				},{
					showIfLeafProject:true,
					title: 'Improperly Sized Stories',
					id: 'grid-improperly-sized-stories',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'PlanEstimate',
						dataIndex:'PlanEstimate',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(item.data.Children.Count === 0) return false;
						var pe = item.data.PlanEstimate;
						return pe!==0 && pe!==1 && pe!==2 && pe!==4 && pe!==8 && pe!==16;
					}
				},{
					showIfLeafProject:true,
					title: 'Stories in Release without Iteration',
					id: 'grid-stories-in-release-without-iteration',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return !item.data.Iteration; 
					}
				},{
					showIfLeafProject: true,
					title: 'Stories in Current Sprint With No Description',
					id: 'grid-features-no-description-currentsprint',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text: 'Description',
						dataIndex: 'Description',
						tdCls:'editor-cell'
					}]),
					side: 'Left',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration) return false;
						return new Date(item.data.Iteration.StartDate) <= now && 
							new Date(item.data.Iteration.EndDate) >= now &&
							!item.data.Description;
					}
				},{
					showIfLeafProject:true,
					title: 'Stories in Iteration not attached to Release',
					id: 'grid-stories-in-iteration-not-attached-to-release',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						tdCls:'editor-cell'
					},{
						text:'Release',
						dataIndex:'Release',
						tdCls:'editor-cell'
					}]),
					side: 'Right',
					filterFn:function(item){ 
						if(!item.data.Iteration || item.data.Release) return false;
						return new Date(item.data.Iteration.StartDate) < releaseDate && 
							new Date(item.data.Iteration.EndDate) > releaseStartDate;
					}
				},{
					showIfLeafProject:true,
					title: 'Unaccepted Stories in Past Iterations',
					id: 'grid-unaccepted-stories-in-past-iterations',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						editor:false
					},{
						text:'ScheduleState',
						dataIndex:'ScheduleState',
						tdCls:'editor-cell'
					}]),
					side: 'Right',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration) return false;
						return new Date(item.data.Iteration.EndDate) < now && item.data.ScheduleState != 'Accepted';
					}
				},{
					showIfLeafProject:true,
					title: 'Stories with End Date past Feature End Date',
					id: 'grid-stories-with-end-past-feature-end',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						editor:false
					},{
						text:'Feature',
						dataIndex:'Feature',
						editor:false
					}]),
					side: 'Right',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration || !item.data.Feature) return false;
						return new Date(item.data.Feature.PlannedEndDate) < new Date(item.data.Iteration.EndDate);
					}
				},{
					showIfLeafProject:true,
					title: 'Stories in Current Sprint With No Task',
					id: 'grid-features-notask-current-sprint',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'',
						renderer: function(value, meta, record){
							return '<a target="_blank" href="https://rally1.rallydev.com/#/' + record.data.Project.ObjectID + 
								'ud/detail/task/new?WorkProduct=/hierarchicalrequirement/' + record.data.ObjectID + '">Add Task</a>';
						}
					}]),
					side: 'Right',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration) return false;
						return new Date(item.data.Iteration.StartDate) <= now && 
							new Date(item.data.Iteration.EndDate) >= now &&
							item.data.Tasks.Count === 0;
					}
				},{
					showIfLeafProject:false,
					title: 'Features with No Stories',
					id: 'grid-features-with-no-stories',
					model: 'PortfolioItem/Feature',
					columns: defaultFeatureColumns,
					side: 'Right',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return item.data.UserStories.Count === 0; 
					}
				}];

			return Q.all(_.map(gridConfigs, function(gridConfig){
				if(me.CurrentTeam && !gridConfig.showIfLeafProject) return Q();
				else {
					var list = gridConfig.model == 'UserStory' ? filteredStories : filteredFeatures;
					gridConfig.data = _.filter(list, gridConfig.filterFn);
					gridConfig.totalCount = list.length;
					return me._addGrid(gridConfig);
				}
			}))
			.then(function(grids){ console.log('All grids have loaded'); })
			.fail(function(reason){ me._alert('ERROR:', reason); });
		}
	});
}());