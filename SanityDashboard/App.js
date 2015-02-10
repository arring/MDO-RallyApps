(function(){
	var Ext = window.Ext4 || window.Ext;

	/************************** Sanity Dashboard *****************************/
	Ext.define('SanityDashboard', {
		extend: 'IntelRallyApp',
		cls:'app',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'ParallelLoader',
			'UserAppsPreference'
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
		
		_userAppsPref: 'intel-SAFe-apps-preference',
		
		/***************************************************** Store Loading ************************************************/		
		_getUserStoryFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })),
				userStoryProjectFilter;
			if(!me.TrainRecord) //scoped outside train
				userStoryProjectFilter = Ext.create('Rally.data.wsapi.Filter', { 
					property: 'Project.ObjectID', 
					value: me.CurrentScrum.data.ObjectID 
				});
			else if(me.LeafProjects && Object.keys(me.LeafProjects).length) //load all US within train
				userStoryProjectFilter = _.reduce(me.LeafProjects, function(filter, projectData, projectOID){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: projectOID});
					if(filter) return filter.or(newFilter);
					else return newFilter;
				}, null);
			else throw "Train has no Scrums!";

			return userStoryProjectFilter.and(inIterationButNotReleaseFilter.or(releaseNameFilter));
		},				
		_getStories: function(){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				config = {
					model: me.UserStory,
					url: 'https://rally1.rallydev.com/slm/webservice/v2.0/HierarchicalRequirement',
					params: {
						pagesize:200,
						query:me._getUserStoryFilter().toString(),
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
							'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItemType].join(','),
						workspace:me.getContext().getWorkspace()._ref,
						includePermissions:true
					}
				};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		_getLowestPortfolioItemFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName });
			return releaseNameFilter;
		},	
		_getLowestPortfolioItems: function(){
			var me=this;
			if(!me.TrainRecord) return Q();
			var config = {
				model: me[me.PortfolioItemTypes[0]],
				url: 'https://rally1.rallydev.com/slm/webservice/v2.0/PortfolioItem/' + me.PortfolioItemTypes[0],
				params: {
					project:me.TrainPortfolioProject.data._ref,
					projectScopeUp:false,
					projectScopeDown:true,
					pagesize:200,
					query:me._getLowestPortfolioItemFilter().toString(),
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'Release', 
						'Description', 'FormattedID', 'UserStories'].join(','),
					includePermissions:true
				}
			};
			return me._parallelLoadWsapiStore(config).then(function(store){
				me.LowestPortfolioItemStore = store;
				return store;
			});
		},
		
		/******************************************************* Reloading ************************************************/	
		_removeAllItems: function(){
			var me = this;
			Ext.getCmp('pie').removeAll();
			Ext.getCmp('heatmap').removeAll();
			Ext.getCmp('gridsLeft').removeAll();
			Ext.getCmp('gridsRight').removeAll();
			var indicator = Ext.getCmp('integrityIndicator');
			if(indicator) indicator.destroy();
		},
		_redrawEverything: function(){
			var me=this;
			
			me._removeAllItems();
			me.setLoading('Loading Grids and Charts');
			return me._buildGrids()
				.then(function(){ 
					return Q.all([ //these 2 need grids to exist to make their calculations
						me._buildRibbon(),
						me._buildIntegrityIndicator()
					]);
				})
				.fail(function(reason){ return Q.reject(reason); })
				.then(function(){ me.setLoading(false); });
		},
		_reloadEverything:function(){
			var me=this;
			
			if(!me.ReleasePicker) me._loadReleasePicker();
			if(!me.ScrumPicker) me._loadScrumPicker();

			me.setLoading('Loading Stores');
			return Q.all([
					me._getStories(),
					me._getLowestPortfolioItems()
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
		
		/******************************************************* LAUNCH *****************************************************/
		launch: function() {
			var me=this; 
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me._addScrollEventListener();
			me._setSanityDashboardObjectID();
			me.setLoading('Loading Configuration');
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //two streams
						me._projectInWhichTrain(me.ProjectRecord) /********* 1 ************/
							.then(function(trainRecord){
								if(trainRecord){
									if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
									else me._isScopedToTrain = true;
									me.TrainRecord = trainRecord;
									return Q.all([
										me._loadAllLeafProjects(me.TrainRecord)
											.then(function(leftProjects){
												me.LeafProjects = leftProjects;
												if(me._isScopedToTrain) me.CurrentScrum = null;
												else me.CurrentScrum = me.ProjectRecord;
											}),
										me._loadTrainPortfolioProject(me.TrainRecord)
											.then(function(trainPortfolioProject){
												me.TrainPortfolioProject = trainPortfolioProject;
												var topPortfolioItemType = me.PortfolioItemTypes[me.PortfolioItemTypes.length-1];
												return me._loadPortfolioItemsOfType(trainPortfolioProject, topPortfolioItemType);
											})
											.then(function(topPortfolioItemStore){ 
												me.TopPortfolioItems = topPortfolioItemStore.getRange(); 
											})
									]);
								} else {
									me.CurrentScrum = me.ProjectRecord;
									me._isScopedToTrain = false;
								}
							}),
						me._loadAppsPreference() /********* 2 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
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

		/******************************************************* NAV CONTROLS ************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
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
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected.bind(me)
				}
			});
		},	
		_scrumPickerSelected: function(combo, records){
			var me=this, recordName = records[0].data.Name;
			if((!me.CurrentScrum && recordName == 'All') || (me.CurrentScrum && me.CurrentScrum.data.Name == recordName)) return;
			if(recordName == 'All') me.CurrentScrum = null;
			else me.CurrentScrum = _.find(me.LeafProjects, function(p){ return p.data.Name == recordName; });
			return me._redrawEverything();
			
		},
		_loadScrumPicker: function(){
			var me=this;
			if(!me.TrainRecord) return; //don't show for non-train scrums
			me.ScrumPicker = Ext.getCmp('controlsContainer').add({
				xtype:'intelcombobox',
				width: 200,
				padding:'0 0 0 40px',
				fieldLabel: 'Scrum:',
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],
					data: [{Name:'All'}].concat(_.map(_.sortBy(me.LeafProjects, 
						function(s){ return s.data.Name; }),
						function(p){ return {Name: p.data.Name}; }))
				}),
				displayField:'Name',
				value:me.CurrentScrum ? me.CurrentScrum.data.Name : 'All',
				listeners: {
					select: me._scrumPickerSelected.bind(me)
				}
			});
		},
	
		/*********************************************** Story/Point util for projects ************************************/	
		_getProjectStoriesForGrid: function(project, grid){
			return _.filter(grid.originalConfig.data, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},
		_getProjectStoriesForRelease: function(project, grid){
			return _.filter(grid.originalConfig.totalStories, function(story){
				return story.data.Project.ObjectID == project.data.ObjectID;
			});
		},
		_getProjectPointsForGrid: function(project, grid){
			return _.reduce(this._getProjectStoriesForGrid(project, grid), function(sum, story){
				return sum + story.data.PlanEstimate;
			}, 0);
		},		
		_getProjectPointsForRelease: function(project, grid){
			return _.reduce(this._getProjectStoriesForRelease(project, grid), function(sum, story){
				return sum + story.data.PlanEstimate;
			}, 0);
		},
		
		/************************************************* Render integrity indicator *****************************************/
		_buildIntegrityIndicator: function(){
			var me=this,
				userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
					return grid.originalConfig.model == 'UserStory'; 
				}).reverse(),
				storyNum = {},
				storyDen = userStoryGrids[0].originalConfig.totalCount,
				pointNum,
				pointDen = userStoryGrids[0].originalConfig.totalPoints,
				storyPer,
				pointPer;
			_.each(userStoryGrids, function(grid){
				_.each(grid.originalConfig.data, function(item){ storyNum[item.data.ObjectID] = item.data.PlanEstimate; });
			});
			pointNum = (100*(pointDen - _.reduce(storyNum, function(sum, planEstimate){ return sum + planEstimate; }, 0))>>0)/100;
			storyNum = storyDen - Object.keys(storyNum).length;
			storyPer = (storyNum/storyDen*10000>>0)/100;
			pointPer = (pointNum/pointDen*10000>>0)/100;
			
			me.IntegrityIndicator = Ext.getCmp('controlsContainer').add({
				xtype:'container',
				id:'integrityIndicator',
				padding:'5px 20px 0 0',
				flex:1,
				layout:{
					type:'hbox',
					pack:'end'
				},
				items:[{
					xtype:'container',
					html:'<span class="integrity-inticator-title">' + 
						(me.CurrentScrum ? me.CurrentScrum.data.Name : me.TrainRecord.data.Name) + ' Integrity <em>(% Correct)</em></span><br/>' + 
						'<span class="integrity-indicator-value"><b>Stories: </b>' + storyNum + '/' + storyDen + ' <em>(' + storyPer + '%)</em></span><br/>' +
						'<span class="integrity-indicator-value"><b>Points: </b>' + pointNum + '/' + pointDen + ' <em>(' + pointPer + '%)<em/></span>'
				}]
			});
		},
		
		/******************************************************* Render Ribbon ************************************************/	
		_onHeatmapClick: function(point, scrum, grid){
			var me=this,
				panelWidth=320,
				rect = point.graphic.element.getBoundingClientRect(),
				leftSide = rect.left,
				topSide = rect.top,
				x = point.x,
				y = point.y,
				storyDen = me._getProjectStoriesForRelease(scrum, grid).length,
				storyNum = me._getProjectStoriesForGrid(scrum, grid).length,
				pointDen = (100*me._getProjectPointsForRelease(scrum, grid)>>0)/100,
				pointNum = (100*me._getProjectPointsForGrid(scrum, grid)>>0)/100,
				storyPer = (10000*storyNum/storyDen>>0)/100,
				pointPer = (10000*pointNum/pointDen>>0)/100;
				
			if(me.tooltip && me.tooltip.x == x && me.tooltip.y == y) return me._clearToolTip();
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
							cls: 'heatmap-tooltip-inner-left-container',
							flex:1,
							items:[{
								xtype:'rallygrid',
								columnCfgs:[{
									dataIndex:'Label',
									width:60,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								},{
									text:'Outstanding',
									dataIndex:'Outstanding',
									width:85,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								},{
									text:'Total',
									dataIndex:'Total',
									width:60,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								},{
									text:'% Problem',
									dataIndex:'Percent',
									width:70,
									draggable:false,
									sortable:false,
									resizable:false,
									editable:false
								}],
								store: Ext.create('Rally.data.custom.Store', {
									data:[{
										Label:'Stories',
										Outstanding:storyNum,
										Total:storyDen,
										Percent:storyPer + '%'
									},{
										Label:'Points',
										Outstanding:pointNum,
										Total:pointDen,
										Percent:pointPer + '%'
									}]
								}),
								showPagingToolbar: false,
								showRowActionsColumn: false
							},{
								xtype:'button',
								cls:'heatmap-tooltip-button',
								text:'GO TO THIS GRID',
								handler: function(){
									me._clearToolTip();
									if(!me.CurrentScrum || me.CurrentScrum.data.ObjectID != scrum.data.ObjectID){
										me.CurrentScrum = scrum;
										me.ScrumPicker.setValue(scrum.data.Name);
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
				selectScrumFunctionName = '_selectScrum' + (Math.random()*10000>>0),
				selectIdFunctionName = '_selectId' + (Math.random()*10000>>0);
			_.each(userStoryGrids, function(grid, gindex) {
				_.each(_.sortBy(me.LeafProjects, function(p){ return p.data.Name; }), function(project, pindex){
					var gridCount = me._getProjectStoriesForGrid(project, grid).length;
					highestNum = Math.max(gridCount, highestNum);
					chartData.push([pindex, gindex, gridCount]);
				});
			});
			window[selectScrumFunctionName] = function(value){
				var scrum = _.find(me.LeafProjects, function(p){ return p.data.Name.split('-')[0].trim() === value; });
				if(me.CurrentScrum && scrum.data.ObjectID == me.CurrentScrum.data.ObjectID){
					me.CurrentScrum = null;
					me.ScrumPicker.setValue('All');
				} else {
					me.CurrentScrum = scrum;
					me.ScrumPicker.setValue(scrum.data.Name);
				}
				me._clearToolTip();
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
				colors: ['#AAAAAA'],
				title: { text: null },
				xAxis: {
					categories: _.sortBy(_.map(me.LeafProjects, 
						function(project){ return project.data.Name.split('-')[0].trim(); }),
						function(p){ return p; }),
					labels: {
						style: { width:100 },
						formatter: function(){
							var text = this.value;
							if(me.CurrentScrum && me.CurrentScrum.data.Name.indexOf(this.value) === 0) 
								text = '<span class="curscrum">' + this.value + '</span>';
							return '<a class="heatmap-xlabel" onclick="' + selectScrumFunctionName + '(\'' + this.value +  '\');">' + text + '</a>';
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
										scrum = _.sortBy(me.LeafProjects, function(p){ return p.data.Name; })[point.x],
										grid = userStoryGrids[point.y];
									me._onHeatmapClick(point, scrum, grid);
								}
							}
						}
					}
				},
				legend: { enabled:false },
				tooltip: { enabled:false },
				series: [{
					name: 'Errors per Violation per Scrum',
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
				colors: me._colors,
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
		_hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},
		_buildRibbon: function() {
			var me=this;
			$('#pie').highcharts(me._getPieChartConfig());
			if(!me.TrainRecord) me._hideHighchartsLinks(); //DONT show the heatmap for non-train scrums
			else {
				$('#heatmap').highcharts(me._getHeatMapConfig());
				me._hideHighchartsLinks();
			}
		},
		
		/******************************************************* Render GRIDS ********************************************************/
		_getFilteredStories: function(){
			/** gets the stories in this release for the scoped scrum or the train **/
			var me=this; 
			if(me.TrainRecord){
				if(me.CurrentScrum) return _.filter(me.UserStoryStore.getRange(), function(item){ 
					return item.data.Project.ObjectID == me.CurrentScrum.data.ObjectID;
				});
				else return me.UserStoryStore.getRange();
			}
			else return me.UserStoryStore.getRange();
		},
		_getFilteredLowestPortfolioItems: function(){ 
			return this.LowestPortfolioItemStore ? this.LowestPortfolioItemStore.getRange(): [];
		},
		_addGrid: function(gridConfig){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				randFunctionName = '_scrollToTop' + (Math.random()*10000>>0);
				
			window[randFunctionName] = function(){ Ext.get('controlsContainer').scrollIntoView(me.el); };
			
			var getGridTitleLink = function(data, model){
					var storyNum = data && data.length,
						storyDen = gridConfig.totalCount,
						pointNum = data && (100*_.reduce(data, function(sum, item){ return sum + item.data.PlanEstimate; }, 0)>>0)/100,
						pointDen = gridConfig.totalPoints,
						type = (model==='UserStory' ? 'Stories' : lowestPortfolioItemType + 's');
					return '<span class="sanity-grid-header-left">' + 
						gridConfig.title + (data ? '<br>' : '') + 
							'<span class="sanity-grid-header-stats">' + 
								(data ? ('<b>' + type + ':</b> ' + storyNum+ '/' + storyDen + ' (' + ((storyNum/storyDen*10000>>0)/100) + '%)') : '') + 
								((data && model=='UserStory') ? 
									('<br><b>Points:</b> ' + pointNum+ '/' + pointDen + '  (' + ((pointNum/pointDen*10000>>0)/100) + '%)') : ''
								) + 
							'</span>' + 
						'</span>' + 
						'<span class="sanity-grid-header-top-link"><a onclick="' + randFunctionName + '()">Top</a></span>';
				},
				storeModel = (gridConfig.model == 'UserStory') ? me.UserStoryStore.model : me.LowestPortfolioItemStore.model,
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
				filteredLowestPortfolioItems = me._getFilteredLowestPortfolioItems(),
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
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
					}].concat(!me.CurrentScrum ? [{
						text: 'Scrum', 
						dataIndex: 'Project',
						editor:false
					}] : []),
				defaultLowestPortfolioItemColumns = [{
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
					},{
						text:'Days Blocked',
						tdCls:'editor-cell',
						editor:false,
						renderer:function(val, meta, record){
							var day = 1000*60*60*24;
							return (new Date()*1 - new Date(record.data.Blocker.CreationDate)*1)/day>>0;
						}
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
					id: 'grid-stories-no-description-current-sprint',
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
					title: 'Stories with End Date past ' + lowestPortfolioItemType + ' End Date',
					id: 'grid-stories-with-end-past-' + lowestPortfolioItemType + '-end',
					model: 'UserStory',
					columns: defaultUserStoryColumns.concat([{
						text:'Iteration',
						dataIndex:'Iteration',
						editor:false
					},{
						text: lowestPortfolioItemType,
						dataIndex: lowestPortfolioItemType,
						editor:false
					}]),
					side: 'Right',
					filterFn:function(item){
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						if(!item.data.Iteration || !item.data[lowestPortfolioItemType]) return false;
						return new Date(item.data[lowestPortfolioItemType].PlannedEndDate) < new Date(item.data.Iteration.EndDate);
					}
				},{
					showIfLeafProject:true,
					title: 'Stories in Current Sprint With No Task',
					id: 'grid-stories-no-task-current-sprint',
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
					model: 'PortfolioItem/' + lowestPortfolioItemType,
					columns: defaultLowestPortfolioItemColumns,
					side: 'Right',
					filterFn:function(item){ 
						if(!item.data.Release || item.data.Release.Name != releaseName) return false;
						return item.data.UserStories.Count === 0; 
					}
				}];

			return Q.all(_.map(gridConfigs, function(gridConfig){
				if(me.CurrentScrum && !gridConfig.showIfLeafProject) return Q();
				else {
					var list = gridConfig.model == 'UserStory' ? filteredStories : filteredLowestPortfolioItems;
					gridConfig.data = _.filter(list, gridConfig.filterFn);
					gridConfig['total' + (gridConfig.model == 'UserStory' ? 'Stories' : lowestPortfolioItemType + 's')] = list;
					gridConfig.totalCount = list.length;
					gridConfig.totalPoints = (100*_.reduce(list, function(sum, item){ return sum + item.data.PlanEstimate; }, 0)>>0)/100;
					return me._addGrid(gridConfig);
				}
			}))
			.fail(function(reason){ me._alert('ERROR:', reason); });
		}
	});
}());