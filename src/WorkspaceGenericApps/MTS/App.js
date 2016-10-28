(function(){
	var Ext = window.Ext4 || window.Ext;

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

		/*
			- Get all user stories and classify by train and scrum team
			- from the user stories, get the distinct features
			- From all features (in release)  get the Train to which they belong to
			- Given a train and scrum team, show the number of features (from user stories) that belong to that train
		*/

		loadReportData: function(){
			var me=this;
			return Q.all([
				me._loadFeatures(),
				me._loadUserStories()
			]);
		},
		setScrumDataValue: function(container, scrumGroupName, projectName){
			// get stories for train/scrum
			// if feature of story belongs to this train then add 1
			var me=this;
			container.featureCount = 0;
			container.features = [];
			var featuresInProject = me.projectFeatureMap[scrumGroupName][projectName];
			_.each(featuresInProject, function(featureID){
				var f = me.trainFeatureMap[featureID];
				if(f && f.train==scrumGroupName) {
					container.features.push(f.featureID + ": " + f.feature);
					container.featureCount++;
				}
			});
		},
		getScrumTotalDataValue: function(scrumData) {		
			return scrumData==null ? {total: 0} : {total: scrumData.featureCount};
		},
		addScrumTotalDataValue: function(current, scrumData) {
			current.total += scrumData.featureCount;
		},
		getScrumDataValueFromScrumTotal: function(trainTotal){
			return {
				featureCount: trainTotal.total
			};
		},
		scrumDataCellRenderer: function(scrumData){
			var exists = (scrumData !== null && scrumData.featureCount > 0);
			var tooltip_text = exists ? scrumData.features.join("\n") : "";

			return {
				xtype: 'container',
				items:{
					xtype:'component',
					autoEl: {
						tag: 'a',
						html: exists ? '<span title="' + tooltip_text + '">' +  scrumData.featureCount +'</span>' : '-'
					}
				}
			};
		},
		horizontalTotalCellRenderer: function(horizontalData, meta){
			var hasData = horizontalData.total > 0;
			return hasData ? '<span>' + horizontalData.total + '</span>' : '-';
		},


		_loadFeatures: function(){
			var me = this,
				map = {},
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
					property: 'Release.Name', 
					value: me.ReleaseRecord.data.Name
				});

			return Q.all(_.map(me.ScrumGroupConfig, function(train){
				var trainName = train.ScrumGroupName,
					trainObjectID = train.ScrumGroupRootProjectOID,
					config = {
						model: 'PortfolioItem/Feature',
						compact:false,
						filters: releaseFilter,
						fetch:['ObjectID', 'Name','Project'],
						context: {
							workspace:null,
							project: '/project/' + trainObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(featureRecord){
						map[featureRecord.data.ObjectID] = {
							feature: featureRecord.data.Name,
							featureID: featureRecord.data.ObjectID,
							train: trainName
						};
					});
					store.destroyStore();
				});
			}))
			.then(function() {
				me.trainFeatureMap = map;
			});
		},

		_loadUserStories: function(){
			var me = this,
				map = {};

			return Q.all(_.map(me.ScrumGroupConfig, function(train){
				var trainName = train.ScrumGroupName,
					trainObjectID = train.ScrumGroupRootProjectOID,
					config = {
						model: 'HierarchicalRequirement',
						compact:false,
						filters: me._getUserStoriesFilter() ,
						fetch:['ObjectID', 'Name', 'Feature','Project'],
						context: {
							workspace:null,
							project: '/project/' + trainObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};

				map[trainName] = {};
				return me.parallelLoadWsapiStore(config)
					.then(function(store){
						_.each(store.getRange(), function(storyRecord){
							var projectName = storyRecord.data.Project.Name,
								projectOID = storyRecord.data.Project.ObjectID;		
							if(!map[trainName][projectName]){
								map[trainName][projectName] = [];
							}
							if(storyRecord.data.Feature) {
								// only track unique occurrences of the feature per train per project
								if(_.indexOf(map[trainName][projectName], storyRecord.data.Feature.ObjectID) === -1) {
									map[trainName][projectName].push(storyRecord.data.Feature.ObjectID);
								}
							}
						});
						store.destroyStore();
					});
			}))
			.then(function() {
				me.projectFeatureMap = map;
			});
		},

		_getUserStoriesFilter: function(){
			// get all leaf stories in this release for the leaf projects under the train
			var me=this,
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: me.ReleaseRecord.data.Name }),
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children.Name', value: null });
			return releaseFilter.and(leafFilter).and(projectFilter);
		}

	});
}());