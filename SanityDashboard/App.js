/************************** PRODUCTION *****************************/
console = { log: function(){} };	////DEBUG!!!	

/************************** Sanity Dashboard *****************************/
Ext.define('SanityDashboard', {
	extend: 'IntelRallyApp',
	cls:'app',
	mixins:[
		'WindowListener',
		'PrettyAlert',
		'IframeResize',
		'IntelWorkweek',
		'ReleaseQuery'
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
			width:445,
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
	_prefName: 'sanity-dashboard-pref',
	_colors: [
		'#5DA5DA', //(blue)
		'#FAA43A', //(orange)
		'#60BD68', //(green)
		'#F17CB0', //(pink)
		'#B2912F', //(brown)
		'#B276B2', //(purple)
		'#DECF3F', //(yellow)
		'#F15854', //(red)
		'#4D4D4D' //(gray)
	],
	
	/******************************************************* Reloading ********************************************************/	
	_removeAllItems: function(){
		var me = this;
		Ext.getCmp('controlsContainer').removeAll();
		Ext.getCmp('pie').removeAll();
		Ext.getCmp('heatmap').removeAll();
		Ext.getCmp('gridsLeft').removeAll();
		Ext.getCmp('gridsRight').removeAll();
	},
	_reloadEverything:function(){
		var me=this;
		me.setLoading('Loading Grids');
		me._removeAllItems();
		me._loadReleasePicker();
		me._loadTeamPicker();
		return me._buildGrids()
			.then(function(){ 
				me.setLoading('Loading Piechart and Heatmap');
				return me._buildRibbon();
			})
			.then(function(){
				me.setLoading(false); 
			})
			.fail(function(reason){
				me.setLoading(false);
				return Q.reject(reason);
			});
	},
	
	/************************************************** Preferences FUNCTIONS ***************************************************/	
	_loadPreferences: function(){ //parse all settings too
		var me=this,
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		Rally.data.PreferenceManager.load({
			appID: me.getAppId(),
      filterByName:me._prefName+ uid,
			success: function(prefs) {
				var appPrefs = prefs[me._prefName + uid];
				try{ appPrefs = JSON.parse(appPrefs); }
				catch(e){ appPrefs = { projs:{}};}
				console.log('loaded prefs', appPrefs);
				deferred.resolve(appPrefs);
			},
			failure: deferred.reject
		});
		return deferred.promise;
	},
	_savePreferences: function(prefs){ // stringify and save only the updated settings
		var me=this, s = {}, 
			uid = me.getContext().getUser().ObjectID,
			deferred = Q.defer();
		prefs = {projs: prefs.projs};
    s[me._prefName + uid] = JSON.stringify(prefs); 
    console.log('saving prefs', prefs);
		Rally.data.PreferenceManager.update({
			appID: this.getAppId(),
			settings: s,
			success: deferred.resolve,
			failure: deferred.reject
		});
		return deferred.promise;
	},
	
	/******************************************************* LAUNCH ********************************************************/
	launch: function() {
		var me=this; 
		me._initDisableResizeHandle();
		me._initFixRallyDashboard();
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
			.then(function(trainRecord){
				if(!trainRecord) return Q.reject('Not Scoped in a train!');
				if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
				else me._isScopedToTrain = true;
				me.TrainRecord = trainRecord;
				return me._loadAllLeafProjects(me.TrainRecord);
			})
			.then(function(leafProjects){
				me.LeafProjects = leafProjects;
				if(me._isScopedToTrain) me.CurrentTeam = null;
				else me.CurrentTeam = me.ProjectRecord;
				return me._loadProducts(me.TrainRecord);
			})
			.then(function(productStore){
				me.Products = productStore.getRange();
				return me._loadPreferences();
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
		Ext.getCmp('controlsContainer').add({
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
		Ext.getCmp('controlsContainer').add({
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
	_hideHighchartsLinks: function(){
		$('.highcharts-container > svg > text:last-child').hide();
	},
	_getCountForTeamAndGrid: function(project, grid){ //genius!
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
	_getHeatMapConfig: function() { 
		var me=this,
			userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function(grid){ 
				return grid.originalConfig.model == 'UserStory'; 
			}).reverse(),
			chartData = [],
			promises = [];
		_.each(userStoryGrids, function(grid, gindex) {
			_.each(_.sortBy(me.LeafProjects, function(p){ return p.data.Name; }), function(project, pindex){
				promises.push(me._getCountForTeamAndGrid(project, grid).then(function(gridCount){
					return chartData.push([pindex, gindex, gridCount]);
				}));
			});
		});
		window._selectTeam = function(value){
			var team = _.find(me.LeafProjects, function(p){ return p.data.Name.indexOf(value) === 0; });
			if(me.CurrentTeam && team.data.ObjectID == me.CurrentTeam.data.ObjectID) me.CurrentTeam = null;
			else me.CurrentTeam = team;
			me._reloadEverything();
		};
		window._selectId = function(gridId){
			location.href = '#' + gridId;
		};
		return Q.all(promises).then(function(){
			return {       
				chart: {
					type: 'heatmap',
					height:340,
					marginTop: 10,
					marginLeft: 130,
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
					maxColor: '#ec5b5b'
				},
				plotOptions: {
					series: {
						point: {
							events: {
								click: function(e){
									var point = this,
										team = _.sortBy(me.LeafProjects, function(p){ return p.data.Name; })[point.x],
										grid = userStoryGrids[point.y];
									if(!me.CurrentTeam || me.CurrentTeam.data.ObjectID != team.data.ObjectID){
										me.CurrentTeam = team;
										setTimeout(function(){
											me._reloadEverything().then(function(){ location.href = '#' + grid.originalConfig.id; }).done();
										}, 0);
									}
									else location.href = '#' + grid.originalConfig.id;
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
					y: grid.store.totalCount,
					href: '#' + grid.originalConfig.id
				};
			});
		return {
			chart: {
				height:345,
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
						format:'<b>{point.name}</b>: {y}',
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
							location.href = e.point.href;
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
		return me._getHeatMapConfig()
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
		var me=this,
			gridTitleLink = '<a id="' + gridConfig.id + '">' + gridConfig.title + '</a>' +
			'<span style="float:right;font-weight:bold;font-size:0.8rem;"><a href="#controlsContainer">Top</a></span>',
			deferred = Q.defer(),
			grid = Ext.create('Rally.ui.grid.Grid', {
				title: gridTitleLink,
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
					pageSize: 10,
					context: { workspace: me.getContext().getWorkspace()._ref, project:null },
					filters: gridConfig.filters,
					listeners: {
						load: function(store) {
							if(!store.getRange().length){
								var goodGrid = Ext.create('Rally.ui.grid.Grid', {
									xtype:'rallygrid',
									cls:' sanity-grid grid-healthy',
									title: gridTitleLink,
									originalConfig: gridConfig,
									emptyText: '0 Problems!',
									store: Ext.create('Rally.data.custom.Store', { data:[] }),
									showPagingToolbar: false,
									showRowActionsColumn: false
								});
								goodGrid.gridContainer = Ext.getCmp('grids' + gridConfig.side);
								deferred.resolve(goodGrid);
							} else{
								grid.addCls('grid-unhealthy sanity-grid');
								grid.gridContainer = Ext.getCmp('grids' + gridConfig.side);
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
			trainName = me.TrainRecord.data.Name.split(' ART')[0],
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
				//.or(Ext.create('Rally.data.wsapi.Filter', { property: 'Feature.Release.Name', value: releaseName })) //i guess we dont want this :(
			userStoryProjectFilter = me.CurrentTeam ? 
				Ext.create('Rally.data.wsapi.Filter', { property: 'Project', value: me.CurrentTeam.data._ref }) : 
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
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator: '>', value: releaseDate})
					.and(releaseNameFilter).and(userStoryProjectFilter)
				]
			},{
				showIfLeafProject:false,
				title: 'Features with no stories',
				id: 'grid-features-with-no-stories',
				model: 'PortfolioItem/Feature',
				columns: defaultFeatureColumns,
				side: 'Right',
				filters: [
					Ext.create('Rally.data.wsapi.Filter', { property: 'UserStories.ObjectID', value: null  }).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }))
					.and(featureProductFilter)
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