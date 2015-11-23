/** 
	this app will probably get buggy if you have multiple projects with the same name or portfolioItems with the same name
	Because i never tested for that.
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		STDN_CI_TOKEN = 'STDNCI',
		COLUMN_DEFAULTS = {
			text:'',
			resizable: false,
			draggable: false,
			sortable: false,
			editor: false,
			menuDisabled: true,
			renderer: function(val){ return val || '-'; },
			layout: 'hbox'
		};
	
	Ext.define('Intel.STDNAndCI', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.HorizontalTeamTypes'
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			itemId:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				itemId:'navboxLeft',
				layout: 'hbox',
				items:[{
					xtype:'container',
					flex:1,
					itemId:'navboxLeftVert',
					layout: 'vbox'
				}]
			},{
				xtype:'container',
				flex:2,
				itemId:'navboxRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		minWidth:910,
		
		userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/	

		getUserStoryQuery: function(train){
			var me=this,
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = 
					Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: me.ReleaseRecord.data.Name }).or(
					Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value:null })) ,
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children', value: 'null' })
			return releaseFilter.and(leafFilter);
		},
		getStdCIUserStoryQuery: function(train){
			var me=this,
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = 
					Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: me.ReleaseRecord.data.Name }).or(
						Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value:null }) .and(
						Ext.create('Rally.data.wsapi.Filter', {property: 'Feature' + '.Parent.Parent.Name', operator:'Contains', value: 'STDNCI' }))
					) ,
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children', value: 'null' })
				//TODO Project.Childre didnt work, find out why
			return releaseFilter.and(leafFilter)/* .and(projectFilter) */; 
		},		
		_loadStdnCIStories: function(){
			var me = this;
			newMatrixStdnCIUserStoryPlanEsitmate = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group			
			return Q.all(_.map(me.AllScrumGroupRootRecords, function(train){
				var filter = me.getStdCIUserStoryQuery(train),
					trainName= train.data.Name,
					config = {
						model: 'HierarchicalRequirement',
						filters: filter ,
						fetch:['ObjectID', 'Name', 'PlanEstimate','Project'/* ,'Release','DirectChildrenCount','Project','Children','Feature' */],
						context: {
							workspace:me.getContext().getWorkspace()._ref,
							project: '/project/' + train.data.ObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						//userstories for standarization
						if(!newMatrixStdnCIUserStoryPlanEsitmate[trainName]){
							newMatrixStdnCIUserStoryPlanEsitmate[trainName] = {};
						}
						if(!newMatrixStdnCIUserStoryPlanEsitmate[trainName][projectName]){
							newMatrixStdnCIUserStoryPlanEsitmate[trainName][projectName] = {};
							newMatrixStdnCIUserStoryPlanEsitmate[trainName][projectName] = 0 ;								
						}
						newMatrixStdnCIUserStoryPlanEsitmate[trainName][projectName] = newMatrixStdnCIUserStoryPlanEsitmate[trainName][projectName] + storyRecord.data.PlanEstimate;						
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.StdnCIUserStoryPlanEsitmateMap = newMatrixStdnCIUserStoryPlanEsitmate;
			});				
		},
		_loadUserStrories: function(){
			var me = this,
				newMatrixProjectUserStoryPlanEsitmate = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group			
			return Q.all(_.map(me.AllScrumGroupRootRecords, function(train){
				var filter = me.getUserStoryQuery(train),
					trainName= train.data.Name,
					config = {
						model: 'HierarchicalRequirement',
						filters: filter ,
						fetch:['ObjectID', 'Name', 'PlanEstimate','Project'/* ,'Release','DirectChildrenCount','Project','Children' */],
						context: {
							workspace:me.getContext().getWorkspace()._ref,
							project: '/project/' + train.data.ObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						//userstories for standarization
						if(!newMatrixProjectUserStoryPlanEsitmate[trainName]){
							newMatrixProjectUserStoryPlanEsitmate[trainName] = {};
						}
						if(!newMatrixProjectUserStoryPlanEsitmate[trainName][projectName]){
							newMatrixProjectUserStoryPlanEsitmate[trainName][projectName] = {};
							newMatrixProjectUserStoryPlanEsitmate[trainName][projectName] = 0 ;								
						}
						newMatrixProjectUserStoryPlanEsitmate[trainName][projectName] = newMatrixProjectUserStoryPlanEsitmate[trainName][projectName] + storyRecord.data.PlanEstimate;						
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.ProjectUserStoryPlanEsitmateMap = newMatrixProjectUserStoryPlanEsitmate;
			});		
		},
		_loadAllLeafProjectsMap:function(){
			var me = this,
				newTrainProjectMap ={};
			me.projectFields = ["ObjectID", "Releases", "Children", "Parent", "Name"]; 
			return Q.all(_.map(me.AllScrumGroupRootRecords, function(train){
				return me.loadAllLeafProjects(train)
					.then(function(allProjects){
					if(newTrainProjectMap[train.data.Name])
						newTrainProjectMap[train.data.Name] = {};
						newTrainProjectMap[train.data.Name] = allProjects; 
					})
			}))
			.then(function(){
				me.TrainProjectMap = newTrainProjectMap;
			});
		},
		_createGridDataHash: function(){
			var me = this;
/* 			me.GridData = {
				<TrainName>: {
					<HorizontalName: ACD>: {
						<ScrumTeamType:MIO CLK 1>: {
							scrumTeamType:<ScrumTeamType: MIO CLK 1>,
							scrumName:<projectName>
							scrumObjectID:<projectObjectID>,
							totalPoints: <number>,
							stdciPoints: <number>
						}
					}
				}
			} */			
			me.GridData = _.reduce(me.AllScrumGroupRootRecords, function(hash,train,key){
				hash[train.data.Name] = _.reduce(me.getAllHorizontalTeamTypeInfos(me.TrainProjectMap[train.data.Name]), function(hash,item,key){
					var horizontal = (item.horizontal === null) ? "Other" : item.horizontal;
					hash[horizontal] =_.reduce(me.getAllHorizontalTeamTypeInfos(me.TrainProjectMap[train.data.Name]), function(hash,r,key){
						var horizontal2 = (r.horizontal === null) ? "Other" : r.horizontal;
						if (horizontal === horizontal2 ){;
							var scrumTeamType = r.teamType + " " + r.number;
							var project2 = r.projectRecord.data.Name;
							hash[scrumTeamType] ={ scrumTeamType: r.teamType +" " + r.number,
								scrumName: r.projectRecord.data.Name,
								scrumObjectID: r.projectRecord.data.ObjectID,
								totalPoints:me.ProjectUserStoryPlanEsitmateMap[train.data.Name][project2],
							stdciPoints:me.StdnCIUserStoryPlanEsitmateMap[train.data.Name][project2]}
						};
						return hash;
						}, {});	 
					return hash;
			}, {});			
			return hash;
			}, {});			
		},
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		showGrids: function(){
			var me=this;
			if(!me.MatrixGrid) me.renderMatrixGrid();
		},	
		updateGrids: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.MatrixGrid && me.MatrixGrid.store) me.MatrixGrid.store.intelUpdate();
			}
		},
		clearEverything: function(){
			var me=this;
/* 			
			me.clearToolTip(); */
			/* if(me.MatrixGrid) {
				me.MatrixGrid.up().remove(me.MatrixGrid);
				me.MatrixGrid = undefined;
			} */
		},
		reloadStores: function(){
			var me = this;
			/* return me.loadPortfolioItems().then(function(){  return me._loadStdnCIStories();  }); */
			return Q.all([
				me._loadAllLeafProjectsMap(),
				me._loadStdnCIStories(),
				me._loadUserStrories()
			])
		},
		
		reloadEverything: function(){
			var me=this;

			me.setLoading('Loading Data');
			me.enqueue(function(done){
				 return me.reloadStores()
					.then(function(){
							me._createGridDataHash();
						me.clearEverything();
						if(!me.ReleasePicker){
							//me.renderReleasePicker();
					/* 	 	me.renderClickModePicker();
							me.renderViewModePicker();
							me.renderClearFiltersButton();
							me.renderMatrixLegend();  */
						}				
					})
		/* 			.then(function(){ me.updateGrids(); })
					.then(function(){ me.showGrids(); }) */
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ me.setLoading(false); done(); })
					.done();
			}, 'ReloadAndRefreshQueue'); //eliminate race conditions between manual _reloadEverything and interval _refreshDataFunc
		},
		
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.setLoading('Loading configuration');
			me.ClickMode = 'Details';
			me.ViewMode = Ext.Object.fromQueryString(window.parent.location.href.split('?')[1] || '').viewmode === 'percent_done' ? '% Done' : 'Normal';
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
	/* 		me.initGridResize(); */
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this project');
				return;
			}	
			me.configureIntelRallyApp()
				.then(function(){
					me.ScrumGroupConfig = _.filter(me.ScrumGroupConfig, function(item){ return item.IsTrain});
					return me.loadAllScrumGroups()
				}).then(function(scrumGroupRootRecords){
					me.AllScrumGroupRootRecords = scrumGroupRootRecords;
				})
 				.then(function(){
					me.ProjectRecord = me.AllScrumGroupRootRecords[0];
					return Q.all([
						me.loadAppsPreference()
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]); 
				}) 
				.then(function(){ 
					//me.setRefreshInterval(); 
					return me.reloadEverything(); 
				})
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
				.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ me.reloadEverything(); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeftVert').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},	
		
		/************************************************************* RENDER ********************************************************************/
		renderGrid: function(){
			var me = this;
/* 			me.GridData = {
				<TrainName>: {
					<HorizontalName: ACD>: {
						<ScrumTeamType:MIO CLK 1>: {
							scrumTeamType:<ScrumTeamType: MIO CLK 1>,
							scrumName:<projectName>
							scrumObjectID:<projectObjectID>,
							totalPoints: <number>,
							stdciPoints: <number>
						}
					}
				}
			} */
			
		}
	});
}());