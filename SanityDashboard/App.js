(function(){
	var Ext = window.Ext4 || window.Ext;
	
	var console = { log: function(){} };

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
			'UserAppPreferences'
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
		_getTotalStories: function(){
			var me=this,
				releaseName = me.ReleaseRecord.data.Name,
				trainName = me.TrainRecord && me.TrainRecord.data.Name.split(' ART')[0],
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'UserStory',
					limit:1,
					pageSize:1,
					remoteSort:false,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }).and(
							me.CurrentTeam ? 
								Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: me.CurrentTeam.data.ObjectID}) : 
								Ext.create('Rally.data.wsapi.Filter', { property: 'Project.Name', operator:'contains', value: trainName})
						)
					]
				});
			return me._reloadStore(store).then(function(store){ return store.totalCount; });
		},
		_getTotalFeatures: function(){
			var me=this,
				releaseName = me.ReleaseRecord.data.Name,
				trainName = me.TrainRecord && me.TrainRecord.data.Name.split(' ART')[0],
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/Feature',
					limit:1,
					pageSize:1,
					remoteSort:false,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }).and(
							_.reduce(me.Products, function(filter, product){
								var thisFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Parent.Parent.Name',  value:product.data.Name });
								return filter ? filter.or(thisFilter) : thisFilter;
							}, null)
						)
					]
				});
			return me.CurrentTeam ? Q(0) : me._reloadStore(store).then(function(store){ return store.totalCount; });
		},
		
		/******************************************************* Reloading ********************************************************/	
		_removeAllItems: function(){
			var me = this;
			Ext.getCmp('pie').removeAll();
			Ext.getCmp('heatmap').removeAll();
			Ext.getCmp('gridsLeft').removeAll();
			Ext.getCmp('gridsRight').removeAll();
		},
		_reloadEverything:function(){
			var me=this;
			me.setLoading('Loading Grids');
			
			me._removeAllItems();
			if(!me.ReleasePicker) me._loadReleasePicker();
			if(!me.TeamPicker) me._loadTeamPicker();
			
			return Q.all([
					me._getTotalStories().then(function(storyCount){ me.TotalStoriesInRelease = storyCount; }),
					me._getTotalFeatures().then(function(featureCount){ me.TotalFeaturesInRelease = featureCount; })
				])
				.then(function(){ return me._buildGrids(); })
				.then(function(){ 
					me.setLoading('Loading Piechart and Heatmap');
					return me._buildRibbon();
				})
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
					return me._projectInWhichTrain(me.ProjectRecord);
				})
				.fail(function(reason){
					if(reason != 'Project not in a train') return Q(reason); //its ok if its not in the train
				})
				.then(function(trainRecord){
					if(trainRecord){
						if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
						else me._isScopedToTrain = true;
						me.TrainRecord = trainRecord;
						return me._loadAllLeafProjects(me.TrainRecord)
							.then(function(leafProjects){
								me.LeafProjects = leafProjects;
								if(me._isScopedToTrain) me.CurrentTeam = null;
								else me.CurrentTeam = me.ProjectRecord;
								return me._loadProducts(me.TrainRecord);
							})
							.then(function(productStore){
								me.Products = productStore.getRange();
								return me._loadPreferences();
							});
					}
					else {
						me.CurrentTeam = me.ProjectRecord;
						me._isScopedToTrain = false;
						return me._loadPreferences();
					}
				})
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
						return me._reloadEverything();
					}
					else return Q.reject('This project has no releases.');
				})
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
			var me=this,
				recName = records[0].data.Name;
			if((!me.CurrentTeam && recName == 'All') || (me.CurrentTeam && me.CurrentTeam.data.Name == recName)) return;
			if(recName == 'All') me.CurrentTeam = null;
			else me.CurrentTeam = _.find(me.LeafProjects, function(p){ return p.data.Name == recName; });
			return me._reloadEverything();
			
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
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'UserStory',
					limit:1,
					pageSize:1,
					remoteSort:false,
					fetch: false,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters: me.CurrentTeam ?	
						grid.originalConfig.filters :
						[grid.originalConfig.filters[0].and(Ext.create('Rally.data.wsapi.Filter', { property: 'Project', value: project.data._ref }))]

				});
			if(!me.CurrentTeam || me.CurrentTeam.data.ObjectID == project.data.ObjectID) 
				return me._reloadStore(store).then(function(store){ return store.totalCount; });
			else return Q(0);
		},
		_getUserStoryCountForRelease: function(project){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'UserStory',
					limit:1,
					pageSize:1,
					remoteSort:false,
					fetch: false,
					context:{
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					},
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Project', value: project.data._ref }).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: me.ReleaseRecord.data.Name }))
					]
				});
			return me._reloadStore(store).then(function(store){ return store.totalCount; });
		},
		_onHeatmapClick: function(point, team, grid){
			var me=this,
				panelWidth=300,
				rect = point.graphic.element.getBoundingClientRect(),
				leftSide = rect.left,
				topSide = rect.top,
				x = point.x,
				y = point.y;
			if(me.tooltip && me.tooltip.x == x && me.tooltip.y == y){
				me._clearToolTip();
				return; 
			}
			me._clearToolTip();
			me._getUserStoryCountForRelease(team).then(function(totalStories){
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
											me._reloadEverything()
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
			})
			.fail(function(reason){ me._alert('ERROR', reason || ''); })
			.done();
		},	
		_hideHighchartsLinks: function(){
			$('.highcharts-container > svg > text:last-child').hide();
		},
		_getHeatMapConfig: function() { 
			var me=this,
				highestNum = 0,
				userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
					return grid.originalConfig.model == 'UserStory'; 
				}).reverse(),
				chartData = [],
				promises = [];
			_.each(userStoryGrids, function(grid, gindex) {
				_.each(_.sortBy(me.LeafProjects, function(p){ return p.data.Name; }), function(project, pindex){
					promises.push(me._getCountForTeamAndGrid(project, grid).then(function(gridCount){
						highestNum = Math.max(gridCount, highestNum);
						return chartData.push([pindex, gindex, gridCount]);
					}));
				});
			});
			window._selectTeam = function(value){
				var team = _.find(me.LeafProjects, function(p){ return p.data.Name.split('-')[0].trim() === value; });
				if(me.CurrentTeam && team.data.ObjectID == me.CurrentTeam.data.ObjectID){
					me.CurrentTeam = null;
					me.TeamPicker.setValue('All');
				} else {
					me.CurrentTeam = team;
					me.TeamPicker.setValue(team.data.Name);
				}
				me._reloadEverything();
			};
			window._selectId = function(gridId){
				Ext.get(gridId).scrollIntoView(me.el);
			};
			return Q.all(promises).then(function(){
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
								return '<a class="heatmap-xlabel" onclick="_selectTeam(\'' + this.value +  '\');">' + text + '</a>';
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
								return '<div class="heatmap-ylabel"' + styleAttr + ' onclick="_selectId(\'' + gridID +  '\')">' + text + '</div>';
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
			});
		},
		_getPieChartConfig: function() { 
			var me=this,
				chartData = _.map(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid) { 
					return {
						name: grid.originalConfig.title,
						y: grid.store.totalCount || 0,
						gridID: grid.originalConfig.id,
						model: grid.originalConfig.model
					};
				});
			if(_.every(chartData, function(item){ return item.y === 0; })){
				chartData = [{
					name: 'Everything is correct!',
					y:1,
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
								var isFeature = (this.point.model == 'PortfolioItem/Feature'),
									isStory = (this.point.model == 'UserStory'),
									str = '<b>' + this.point.name + '</b>: ' + this.point.y;
								if(isFeature) return str + '/' + me.TotalFeaturesInRelease;
								else if(isStory) return str + '/' + me.TotalStoriesInRelease;
								else return str;
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
		_buildRibbon: function() {
			var me=this;
			Highcharts.setOptions({ colors: me._colors });
			$('#pie').highcharts(me._getPieChartConfig());
			Highcharts.setOptions({ colors: ['#AAAAAA'] });
			if(!me.TrainRecord) me._hideHighchartsLinks(); //DONT show the heatmap for non-train teams
			else return me._getHeatMapConfig()
				.then(function(chartConfig){
					$('#heatmap').highcharts(chartConfig);
					me._hideHighchartsLinks();
				})
				.fail(function(reason){
					me._alert('ERROR', reason);
				});
		},
		
		/******************************************************* Render GRIDS ********************************************************/
		_addGrid: function(gridConfig){
			var me=this;
			
			window._scrollToTop = function(){ Ext.get('controlsContainer').scrollIntoView(me.el); };
			
			var getGridTitleLink = function(store, model){
					var num = store && store.totalCount,
						den = (model==='UserStory' ? me.TotalStoriesInRelease : me.TotalFeaturesInRelease),
						type = (model==='UserStory' ? 'Stories' : 'Features');
					return gridConfig.title +
						'<span class="sanity-grid-header-stats">' + 
							(store ? (' (' + num+ '/' + den + ' ' + type + ' - ' + ((num/den*10000>>0)/100) + '% )') : '') + 
						'</span>' + 
						'<span class="sanity-grid-header-top-link"><a onclick="_scrollToTop()">Top</a></span>';
				},
				deferred = Q.defer(),
				grid = Ext.create('Rally.ui.grid.Grid', {
					id: gridConfig.id,
					columnCfgs: gridConfig.columns,
					showPagingToolbar: true,
					originalConfig:gridConfig,
					showRowActionsColumn: true,
					emptyText: ' ',
					enableBulkEdit: true,
					pagingToolbarCfg: {
						pageSizes: [10, 15, 25, 100],
						autoRender: true,
						resizable: false
					},
					storeConfig: {
						model: gridConfig.model,
						autoLoad:{start: 0, limit: 10},
						fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'EndDate', 'Iteration', 'Release', 'Description', 
							'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 'Blocked', 'BlockedReason', 'Feature'],
						pageSize: 10,
						context: { workspace: me.getContext().getWorkspace()._ref, project:null },
						filters: gridConfig.filters,
						listeners: {
							load: function(store) {
								if(gridConfig.filterFnAfterLoad) store.filterBy(gridConfig.filterFnAfterLoad);
								if(!store.getRange().length){
									var goodGrid = Ext.create('Rally.ui.grid.Grid', {
										xtype:'rallygrid',
										title: getGridTitleLink(),
										id: gridConfig.id,
										cls:' sanity-grid grid-healthy',
										originalConfig: gridConfig,
										emptyText: '0 Problems!',
										store: Ext.create('Rally.data.custom.Store', { data:[] }),
										showPagingToolbar: false,
										showRowActionsColumn: false
									});
									goodGrid.gridContainer = Ext.getCmp('grids' + gridConfig.side);
									deferred.resolve(goodGrid);
								} else {
									grid.addCls('grid-unhealthy sanity-grid');
									grid.gridContainer = Ext.getCmp('grids' + gridConfig.side);
									grid.setTitle(getGridTitleLink(store, gridConfig.model));
									deferred.resolve(grid);
								}
							}  
						}
					}
				});
			return deferred.promise;
		},	
		_buildGrids: function() { 
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				todayISO = new Date().toISOString(),
				trainName = me.TrainRecord && me.TrainRecord.data.Name.split(' ART')[0],
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
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
					//.or(Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Release.Name', value: releaseName })) //dont want this
				userStoryProjectFilter = me.CurrentTeam ? 
					Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: me.CurrentTeam.data.ObjectID }) : 
					Ext.create('Rally.data.wsapi.Filter', { property: 'Project.Name', operator:'contains', value: trainName}),
				featureProductFilter = _.reduce(me.Products, function(filter, product){
					var thisFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Parent.Parent.Name',  value:product.data.Name });
					return filter ? filter.or(thisFilter) : thisFilter;
				}, null),
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
					filters:[
						Ext.create('Rally.data.wsapi.Filter', { property: 'blocked', value: 'true' })
						.and(releaseNameFilter).and(userStoryProjectFilter)
					]
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
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '=', value: null })
						.and(releaseNameFilter).and(userStoryProjectFilter)
					]
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
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Children.ObjectID', value: null }).and( //parent stories roll up so ignore
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: null })).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '1' })).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '2' })).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '4' })).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '8' })).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'PlanEstimate', operator: '!=', value: '16' }))
						.and(releaseNameFilter).and(userStoryProjectFilter)
					]
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
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration', value: null })
						.and(releaseNameFilter).and(userStoryProjectFilter)
					]
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
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Release.Name', value: null }))
						.and(userStoryProjectFilter)
					]
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
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator: '<', value: 'Today' }).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'ScheduleState', operator: '<', value: 'Accepted' }))
						.and(releaseNameFilter).and(userStoryProjectFilter)
					]
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
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.PlannedEndDate', operator: '!=', value: null })
						.and(releaseNameFilter).and(userStoryProjectFilter)
					],
					filterFnAfterLoad: function(userStory){
						debugger;
						return new Date(userStory.data.Iteration.EndDate) > new Date(userStory.data.Feature.PlannedEndDate);
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
								'd/detail/task/new?WorkProduct=/hierarchicalrequirement/' + record.data.ObjectID + '">Add Task</a>';
						}
					}]),
					side: 'Right',
					filters: [
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:todayISO}).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:todayISO})).and(
						Ext.create('Rally.data.wsapi.Filter',{ property: 'Tasks.ObjectID', operator: '=', value: null}))
						.and(releaseNameFilter).and(userStoryProjectFilter)
					]
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
					filters:[
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:todayISO}).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:todayISO})).and(
						Ext.create('Rally.data.wsapi.Filter',{ property: 'Description', operator: '=', value: null}))	
						.and(releaseNameFilter).and(userStoryProjectFilter)	
					]
				},{
					showIfLeafProject:false,
					title: 'Features with No Stories',
					id: 'grid-features-with-no-stories',
					model: 'PortfolioItem/Feature',
					columns: defaultFeatureColumns,
					side: 'Right',
					filters: [featureProductFilter ?
						Ext.create('Rally.data.wsapi.Filter', { property: 'UserStories.ObjectID', value: null  }).and(
						Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }))
						.and(featureProductFilter) : null
					]
				}];

			return Q.all(_.map(gridConfigs, function(gridConfig){
				if(me.CurrentTeam && !gridConfig.showIfLeafProject) return Q();
				else return me._addGrid(gridConfig);
			}))
			.then(function(grids){
				_.each(grids, function(grid){ if(grid) grid.gridContainer.add(grid); });
				console.log('All grids have loaded');
			})
			.fail(function(reason){ 
				me._alert('ERROR:', reason);
			});
		}
	});
}());