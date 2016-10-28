/**** This is an implementation of the STDNandCI App using the 
	IntelRallyTrainsGridApp. This is here as an example only *****/
(function(){
	var Ext = window.Ext4 || window.Ext,
		STDN_CI_TOKEN = 'STDNCI';

	Ext.define('Intel.MTS', {
		extend: 'Intel.lib.IntelRallyTrainsGridApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.HorizontalTeamTypes'
		],

		/**___________________________________ DATA STORE METHODS ___________________________________*/	


		loadReportData: function(){
			var me = this;
			return Q.all([
				me._loadStdnCIStories(),
				me._loadUserStories()
			]);
		},
		setScrumDataValue: function(container, scrumGroupName, projectName){
			var me = this;
			container.totalPoints = me.ProjectUserStoryPlanEstimateMap[scrumGroupName][projectName] || 0;
			container.stdciPoints = me.StdnCIUserStoryPlanEstimateMap[scrumGroupName][projectName] || 0;
		},
		getScrumTotalDataValue: function(scrumData) {		
			return scrumData==null ? {
				STDCI: 0,
				Total: 0
			} : {
				STDCI: scrumData.stdciPoints,
				Total: scrumData.totalPoints
			}
		},
		addScrumTotalDataValue: function(current, scrumData) {
			current.STDCI += scrumData.stdciPoints;
			current.Total += scrumData.totalPoints;
		},
		getScrumDataValueFromScrumTotal: function(trainTotal){
			return {
				stdciPoints: trainTotal.STDCI, 
				totalPoints: trainTotal.Total
			};
		},
		scrumDataCellRenderer: function(scrumData){
			var exists = (scrumData !== null);
			var percent = exists ? (scrumData.stdciPoints/scrumData.totalPoints*100)>>0 : 0;
			var tooltip = exists ? (scrumData.scrumName + ': ' + scrumData.stdciPoints + '/' + scrumData.totalPoints + ' points') : '';
			return {
				xtype: 'container',
				cls: exists ? (percent < 10 ? ' bad-stdci-cell' : ' good-stdci-cell') : ' stdci-cell',
				items:{
					xtype:'component',
					autoEl: {
						tag: 'a',
						html: exists ? '<span title="' + tooltip + '">' +  percent +'%</span>' : '-'
					}
				}
			};
		},
		horizontalTotalCellRenderer: function(horizontalData, meta){
			var hasData = horizontalData.Total > 0;
			var percent =  hasData ? (horizontalData.STDCI/horizontalData.Total*100)>>0 : 0;
			var tooltip = hasData ? (horizontalData.HorizontalName + ': ' + horizontalData.STDCI + '/' + horizontalData.Total + ' points') : '';
			meta.tdCls += hasData ? (percent < 10 ? ' bad-stdci-cell' : ' good-stdci-cell') : ' stdci-cell';
			return hasData ? '<span id="" title="' + tooltip + '">' + percent + '%</span>' : '-';
		},



		_getUserStoryQuery: function(){
			/**
				get all leaf stories in this release for the leaf projects under the train
			*/
			var me=this,
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: me.ReleaseRecord.data.Name }),
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children.Name', value: null });
				
			return releaseFilter.and(leafFilter).and(projectFilter);
		},
		_getStdCIUserStoryQuery: function(){
			/**
			get all STDNCI leaf stories in this release for the leaf projects under the train
			
			Super hardcoded. This assumes there are 3 levels of portfolio items and the top level has STDN_CI_TOKEN in the name. we will only
			query user stories under this 3rd level portfolioItem
			*/
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: me.ReleaseRecord.data.Name }).and(
												Ext.create('Rally.data.wsapi.Filter', {property: lowestPortfolioItemType + '.Parent.Parent.Name', operator:'contains', value: STDN_CI_TOKEN })),
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children.Name', value: null });
				
			return releaseFilter.and(leafFilter).and(projectFilter);
		},		
		_loadStdnCIStories: function(){
			var me = this;
			newMatrixStdnCIUserStoryPlanEstimate = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group	
			return Q.all(_.map(me.ScrumGroupConfig, function(train){
				var trainName = train.ScrumGroupName,
					trainObjectID = train.ScrumGroupRootProjectOID,
					config = {
						model: 'HierarchicalRequirement',
						filters: me._getStdCIUserStoryQuery(),
						fetch:['ObjectID', 'Name', 'PlanEstimate','Project'],
						compact:false,
						context: {
							workspace: null,
							project: '/project/' + trainObjectID,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				newMatrixStdnCIUserStoryPlanEstimate[trainName] = {};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;
						//userstories for standarization
						if(!newMatrixStdnCIUserStoryPlanEstimate[trainName][projectName]){
							newMatrixStdnCIUserStoryPlanEstimate[trainName][projectName] = 0 ;	
						}
						newMatrixStdnCIUserStoryPlanEstimate[trainName][projectName] += storyRecord.data.PlanEstimate;
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.StdnCIUserStoryPlanEstimateMap = newMatrixStdnCIUserStoryPlanEstimate;
			});				
		},
		_loadUserStories: function(){
			var me = this,
				newMatrixProjectUserStoryPlanEstimate = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group			
				newProjectObjectIDMap = {};				
			return Q.all(_.map(me.ScrumGroupConfig, function(train){
				var trainName = train.ScrumGroupName,
					trainObjectID = train.ScrumGroupRootProjectOID,
					config = {
						model: 'HierarchicalRequirement',
						compact:false,
						filters: me._getUserStoryQuery() ,
						fetch:['ObjectID', 'Name', 'PlanEstimate','Project'],
						context: {
							workspace:null,
							project: '/project/' + trainObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				newMatrixProjectUserStoryPlanEstimate[trainName] = {};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						//userstories for standarization
						if(!newProjectObjectIDMap[projectName]){
							newProjectObjectIDMap[projectName] = {};
							newProjectObjectIDMap[projectName] = projectOID;
						}							
						if(!newMatrixProjectUserStoryPlanEstimate[trainName][projectName]){
							newMatrixProjectUserStoryPlanEstimate[trainName][projectName] = 0 ;								
						}
						newMatrixProjectUserStoryPlanEstimate[trainName][projectName] += storyRecord.data.PlanEstimate;
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.ProjectUserStoryPlanEstimateMap = newMatrixProjectUserStoryPlanEstimate;
				_.each(me.ScrumGroupConfig, function(train){
					if(!newProjectObjectIDMap[train.ScrumGroupName]){
						newProjectObjectIDMap[train.ScrumGroupName] = {};
					}	
					newProjectObjectIDMap[train.ScrumGroupName] = train.ScrumGroupRootProjectOID;
				});	
				me.ProjectObjectIDMap = newProjectObjectIDMap ;					
			});		
		}

	});
}());