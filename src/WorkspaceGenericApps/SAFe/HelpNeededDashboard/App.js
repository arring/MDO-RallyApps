(function(){
	var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		RiskModel = Intel.SAFe.lib.model.Risk,
		RALLY_MAX_STRING_SIZE = 32768,
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

	Ext.define('Intel.SAFe.HelpNeededDashboard', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.CustomAppObjectIDRegister',
            'Intel.lib.mixin.HorizontalTeamTypes',
			'Intel.SAFe.lib.mixin.DependenciesLib'
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			height:45,
			id:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				id:'navboxLeft',
				layout: {
					type:'hbox'
				}
			},{
				xtype:'container',
				flex:2,
				id:'navboxRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		},{
			xtype:'container',
			id:'tcVelBox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items: [{
				xtype:'container',
				flex:9,
				id: 'tcVelBoxLeft'
			},{
				xtype:'container',
				flex:4,
				id: 'tcVelBoxRight'
			}]
		}],
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */
		
		userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/
		 loadPortfolioItemsForAllTrains: function () {
            var me = this, deferred = Q.defer();
            me.PortfolioItemStore=[];
            //iterate through me.AllScrumGroupRootRecords, get me.scrumgroupportfolioproject) and me.PortfolioItemstores[trainName] array
            //to render the grid for all trains
            me.portfolioItemFields = ["Name", "ObjectID", "FormattedID", "Release", "c_TeamCommits", /* "c_MoSCoW", */ "c_Risks", "Project", "PlannedEndDate", "Parent", "Children", "PortfolioItemType", "Ordinal", "PercentDoneByStoryPlanEstimate", "DragAndDropRank", "Owner"];
            me.enqueue(function (done) {
                Q.all(_.map(me.PortfolioItemTypes, function (type, ordinal) {
                    //go to array scrumportfolioproject
                    //
                     //  me.ScrumGroupRootRecord = me.AllScrumGroupRootRecords[0];
                        _each(me.ScrumGroupPortfolioProject, function(scrumPortfolioProject){
                            
                   
                    
                    //
                    return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
                        me.loadPortfolioItemsOfType(scrumPortfolioProject, type) :
                        me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, scrumPortfolioProject, type)
                    );
                    					})
                }))
                    .then(function (portfolioItemStores) {
                        if (me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
                     //   me.PortfolioItemStore = portfolioItemStores[0];
                     // add the train name along with it in the array to render team commit grid
                            me.PortfolioItemStores.push(portfolioItemStores)
                        me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);

                        //destroy the stores, so they get GCed
                        portfolioItemStores.shift();
                        while (portfolioItemStores.length) portfolioItemStores.shift().destroyStore();
                    })
                    .then(function () {
                        done();
                        deferred.resolve();
                    })
                    .fail(function (reason) {
                        done();
                        deferred.reject(reason);
                    })
                    .done();
            }, 'PortfolioItemQueue');
            return deferred.promise;
        },
        loadPortfolioItems: function () {
            var me = this, deferred = Q.defer();
            //iterate through me.AllScrumGroupRootRecords, get me.scrumgroupportfolioproject) and me.PortfolioItemstores[trainName] array
            //to render the grid for all trains
            me.portfolioItemFields = ["Name", "ObjectID", "FormattedID", "Release", "c_TeamCommits", /* "c_MoSCoW", */ "c_Risks", "Project", "PlannedEndDate", "Parent", "Children", "PortfolioItemType", "Ordinal", "PercentDoneByStoryPlanEstimate", "DragAndDropRank", "Owner"];
            me.enqueue(function (done) {
                Q.all(_.map(me.PortfolioItemTypes, function (type, ordinal) {
                    return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
                        me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) :
                        me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, me.ScrumGroupPortfolioProject, type)
                    );
                }))
                    .then(function (portfolioItemStores) {
                        if (me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
                        me.PortfolioItemStore = portfolioItemStores[0];
                        me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);

                        //destroy the stores, so they get GCed
                        portfolioItemStores.shift();
                        while (portfolioItemStores.length) portfolioItemStores.shift().destroyStore();
                    })
                    .then(function () {
                        done();
                        deferred.resolve();
                    })
                    .fail(function (reason) {
                        done();
                        deferred.reject(reason);
                    })
                    .done();
            }, 'PortfolioItemQueue');
            return deferred.promise;
        },
		loadIterations: function(){
			var me=this,
				startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseStartDate),
				endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseDate);
				iterationStore = Ext.create("Rally.data.wsapi.Store", {
					model: "Iteration",
					remoteSort: false,
					limit:Infinity,
					disableMetaChangeEvent: true,
					fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project", "ObjectID"],
					context:{
						project: me.getContext().getProject()._ref,
						projectScopeUp:false,
						projectScopeDown:false
					},
					filters: [{
						property: "EndDate",
						operator: ">=",
						value: startDate
					},{
						property: "StartDate",
						operator: "<=",
						value: endDate  
					}]
				});
			return me.reloadStore(iterationStore)
				.then(function(iterationStore){ 
					me.IterationStore = iterationStore; 
				});
		},
		getUserStoryFilter: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				twoWeeks = 1000*60*60*24*7*2,
				releaseStartPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + twoWeeks).toISOString(),
				releaseEndPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseDate)*1 - twoWeeks).toISOString();
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseStartDate',
				operator: '<',
				value: releaseStartPadding
			}).and(Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseDate',
				operator: '>',
				value: releaseEndPadding
			})).or(
				Ext.create('Rally.data.wsapi.Filter', {
					property:'Release.ObjectID',
					value: null
				}).and(
					Ext.create('Rally.data.wsapi.Filter', {
						property: lowestPortfolioItem + '.Release.ReleaseStartDate',
						operator: '<',
						value: releaseStartPadding
					}).and(Ext.create('Rally.data.wsapi.Filter', { 
						property: lowestPortfolioItem + '.Release.ReleaseDate',
						operator: '>',
						value: releaseEndPadding
					}))
				)
			);
		},
  	getDefectFilter: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				twoWeeks = 1000*60*60*24*7*2,
				releaseStartPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + twoWeeks).toISOString(),
				releaseEndPadding = new Date(new Date(me.ReleaseRecord.data.ReleaseDate)*1 - twoWeeks).toISOString();
			return Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseStartDate',
				operator: '<',
				value: releaseStartPadding
			}).and(Ext.create('Rally.data.wsapi.Filter', {
				property:'Release.ReleaseDate',
				operator: '>',
				value: releaseEndPadding
			})).or(
				Ext.create('Rally.data.wsapi.Filter', {
					property:'Release.ObjectID',
					value: null
				})
			);
		},
  
        
        loadDefects: function(){
            var me = this,            
            startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseStartDate),
			endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseDate),
            lowestPortfolioItem = me.PortfolioItem[0],
            config = {
                model: 'Defect', 
                filters: [me.getDefectFilter()],  
                fetch: ['Iteration', 'PlanEstimate', 'Release'],
           //     query: '((Release.StartDate < endDate) and (Release.ReleaseDate >= startDate))',
                context: {
                    project: me.ProjectRecord.data._ref,
                    projectScopeDown:false,
                    projectScopeUp:false
                }
            };
            return me.parallelLoadWsapiStore(config).then(function(store) {                  
                me.DefectsStore=store;
                return  me.DefectsStore;
                
            });
            
        },
		 getUserStoryQuery: function (portfolioItemRecords) {
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                storyNotAttachedToPorfolio = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Project.Parent.ObjectID',
                    operator: '!= ',
                    value: me.ScrumGroupPortfolioProject.data.ObjectID
                }),
                leafFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'DirectChildrenCount', value: 0}),
                releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release.Name',
                    value: me.ReleaseRecord.data.Name
                }),
                portfolioItemFilter = _.reduce(portfolioItemRecords, function (filter, portfolioItemRecord) {
                    var newFilter = Ext.create('Rally.data.wsapi.Filter', {
                        property: lowestPortfolioItemType + '.ObjectID',
                        value: portfolioItemRecord.data.ObjectID
                    });
                    return filter ? filter.or(newFilter) : newFilter;
                }, null);
            var finalFilter = me.ScrumGroupAndPortfolioConfig ? releaseFilter.and(leafFilter).and(portfolioItemFilter) : releaseFilter.and(leafFilter).and(storyNotAttachedToPorfolio).and(portfolioItemFilter);
            return portfolioItemFilter ? finalFilter : null;
        },
        
         loadUserStories: function () {
            /** note: lets say the lowest portfolioItemType is 'Feature'. If we want to get child user stories under a particular Feature,
             we must query and fetch using the Feature field on the UserStories, NOT PortfolioItem. PortfolioItem field only applies to the
             user Stories directly under the feature
             */
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                newMatrixUserStoryBreakdown = {},
                newMatrixProjectMap = {},
                newProjectOIDNameMap = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group

            return Q.all(_.map(_.chunk(me.PortfolioItemStore.getRange(), 20), function (portfolioItemRecords) {
                var filter = me.getUserStoryQuery(portfolioItemRecords),
                    config = {
                        model: 'HierarchicalRequirement',
                        filters: filter ? [filter] : [],
                        fetch: ['Name', 'ObjectID', 'Project', 'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState', lowestPortfolioItemType],
                        context: {
                            workspace: me.getContext().getWorkspace()._ref,
                            project: null
                        }
                    };
                return me.parallelLoadWsapiStore(config).then(function (store) {
                    _.each(store.getRange(), function (storyRecord) {
                        //Some user stories are attached to Portfolio which we want to ignore
                        var portfolioItemName = storyRecord.data[lowestPortfolioItemType].Name,
                            projectName = storyRecord.data.Project.Name,
                            projectOID = storyRecord.data.Project.ObjectID;
                        if (!newMatrixUserStoryBreakdown[projectName])
                            newMatrixUserStoryBreakdown[projectName] = {};
                        if (!newMatrixUserStoryBreakdown[projectName][portfolioItemName])
                            newMatrixUserStoryBreakdown[projectName][portfolioItemName] = [];
                        newMatrixUserStoryBreakdown[projectName][portfolioItemName].push(storyRecord.data);
                        newMatrixProjectMap[projectName] = storyRecord.data.Project.ObjectID; //this gets called redundantly each loop
                        newProjectOIDNameMap[projectOID] = projectName;
                    });
                    store.destroyStore();
                });
            }))
                .then(function () {
                    me.MatrixUserStoryBreakdown = newMatrixUserStoryBreakdown;
                    me.MatrixProjectMap = newMatrixProjectMap;
                    me.ProjectOIDNameMap = newProjectOIDNameMap;

                    //always show the teams under the scrum-group that have teamMembers > 0, even if they are not contributing this release
                    _.each(me.ProjectsWithTeamMembers, function (projectRecord) {
                        var projectName = projectRecord.data.Name,
                            projectOID = projectRecord.data.ObjectID;
                        if (!me.MatrixProjectMap[projectName]) me.MatrixProjectMap[projectName] = projectRecord.data.ObjectID;
                        if (!me.MatrixUserStoryBreakdown[projectName]) me.MatrixUserStoryBreakdown[projectName] = {};
                        me.ProjectOIDNameMap[projectOID] = projectName;
                    });
                });
        },
        // loadUserStories: function(){	
		// 	var me=this, 
		// 		lowestPortfolioItem = me.PortfolioItemTypes[0],
		// 		config = {
		// 			model: 'HierarchicalRequirement',
		// 			filters: [me.getUserStoryFilter()],
		// 			fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
		// 				'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 'DirectChildrenCount',					
		// 				'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem, 'c_Dependencies'],
		// 			context: {
		// 				project:me.ProjectRecord.data._ref,
		// 				projectScopeDown:false,
		// 				projectScopeUp:false
		// 			}
		// 		};
		// 	return me.parallelLoadWsapiStore(config).then(function(store){
		// 		me.UserStoryStore = store;
		// 		return store;
		// 	});
		// },
		getExtraDataIntegrityUserStoriesFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: null })),
				userStoryProjectFilter = Ext.create('Rally.data.wsapi.Filter', { 
					property: 'Project.ObjectID', 
					value: me.ProjectRecord.data.ObjectID
				});
			return userStoryProjectFilter.and(inIterationButNotReleaseFilter);
		},				
		loadExtraDataIntegrityStories: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				config = {
					model: 'HierarchicalRequirement',
					filters: [me.getExtraDataIntegrityUserStoriesFilter()],
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
						'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
						'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem],
					context: {
						workspace: me.getContext().getWorkspace()._ref,
						project: null
					}
				};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.ExtraDataIntegrityUserStoriesStore = store;
				return store;
			});
		},
		
		/**___________________________________ TEAM COMMITS STUFF ___________________________________**/		
		// getTeamCommit: function(portfolioItemRecord){	
		// 	var teamCommits = portfolioItemRecord.data.c_TeamCommits,
		// 		projectOID = this.ProjectRecord.data.ObjectID;
		// 	try{ teamCommits = JSON.parse(atob(teamCommits))[projectOID] || {}; } 
		// 	catch(e){ teamCommits = {}; }
		// 	return teamCommits;
		// },	
        
          getTeamCommits: function (portfolioItemRecord) {
            var me = this;
            var tcString = portfolioItemRecord.data.c_TeamCommits;
            try {
                return JSON.parse(atob(tcString)) || {};
            }
            catch (e) {
                return {};
            }
        },
        getTeamCommit: function (portfolioItemRecord, projectName) {
            var me = this,
                projectID = me.MatrixProjectMap[portfolioItemRecord.data.Project.Name],
                teamCommits = me.getTeamCommits(portfolioItemRecord);
            return teamCommits[projectID] || {};
        },	
		setTeamCommit: function(portfolioItemRecord, newTeamCommit){
			var teamCommits = portfolioItemRecord.data.c_TeamCommits,
				projectOID = this.ProjectRecord.data.ObjectID,
				deferred = Q.defer();
			try{ teamCommits = JSON.parse(atob(teamCommits)) || {}; }
			catch(e){ teamCommits = {}; }
			if(!teamCommits[projectOID]) teamCommits[projectOID] = {};
			teamCommits[projectOID].Commitment = newTeamCommit.Commitment;
			teamCommits[projectOID].Objective = newTeamCommit.Objective;
			var str = btoa(JSON.stringify(teamCommits, null, '\t'));
			if(str.length >= RALLY_MAX_STRING_SIZE)
				deferred.reject('TeamCommits field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				portfolioItemRecord.set('c_TeamCommits', str);
				portfolioItemRecord.save({ 
					callback:function(record, operation, success){
						if(!success) deferred.reject('Failed to modify PortfolioItem: ' + portfolioItemRecord.data.FormattedID);
						else deferred.resolve();
					}
				});
			}
			return deferred.promise;
		},
					
		getStoryCount: function(portfolioItemObjectID){	
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.teamCommitsCountHash = me.teamCommitsCountHash || {};
			if(typeof me.teamCommitsCountHash[portfolioItemObjectID] === 'undefined'){
				me.teamCommitsCountHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore.getRange(), function(sum, userStory){
					var isStoryInPortfolioItem = ((userStory.data[lowestPortfolioItem] || {}).ObjectID == portfolioItemObjectID),
						isLeafStory = (userStory.data.DirectChildrenCount === 0);
					return sum + (isLeafStory && isStoryInPortfolioItem)*1;
				}, 0);
			}
			return me.teamCommitsCountHash[portfolioItemObjectID];
		},
		getStoriesEstimate: function(portfolioItemObjectID){	
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			me.teamCommitsEstimateHash = me.teamCommitsEstimateHash || {};
			if(typeof me.teamCommitsEstimateHash[portfolioItemObjectID] === 'undefined'){
				me.teamCommitsEstimateHash[portfolioItemObjectID] = _.reduce(me.UserStoryStore.getRange(), function(sum, userStory){
					var isStoryInPortfolioItem = ((userStory.data[lowestPortfolioItem] || {}).ObjectID == portfolioItemObjectID),
						isLeafStory = (userStory.data.DirectChildrenCount === 0);
					return sum + ((isLeafStory && isStoryInPortfolioItem) ? userStory.data.PlanEstimate : 0)*1;
				}, 0);
			}
			return me.teamCommitsEstimateHash[portfolioItemObjectID];
		},

		/**___________________________________ STDNCI STUFF ___________________________________**/
		/**
			get all leaf stories in this release for the leaf projects under the train
			*/
		loadSTDNCIData: function(){
			var me=this,
				releaseName = me.ReleaseRecord.data.Name,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
				
			var totalPointsInRelease = _.reduce(me.UserStoryStore.getRange(), function(sum, us){
				var isLeaf = us.data.DirectChildrenCount === 0;
				var inRelease = (us.data.Release || {}).Name === releaseName;
				return (isLeaf && inRelease) ? sum + (us.data.PlanEstimate || 0) : sum;
			}, 0);
			var stdnciPointsInRelease = _.reduce(me.UserStoryStore.getRange(), function(sum, us){
				var isLeaf = us.data.DirectChildrenCount === 0;
				var inRelease = (us.data.Release || {}).Name === releaseName;
				var isStdci = (me.PortfolioItemMap[(us.data[lowestPortfolioItem] || {}).ObjectID] || '').indexOf('STDNCI') >= 0;
				return (isLeaf && inRelease && isStdci) ? sum + (us.data.PlanEstimate || 0) : sum;
			}, 0);
			
			me.STDNCIData = {
				percent: (stdnciPointsInRelease/totalPointsInRelease)*100>>0,
				stdnciPoints: stdnciPointsInRelease,
				totalPoints: totalPointsInRelease
			};
		},
		
		/** __________________________________ Data Integrity STUFF ___________________________________**/
		getMiniDataIntegrityStoreData: function(){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate),
				totalUserStories = me.UserStoryStore.getRange().concat(me.ExtraDataIntegrityUserStoriesStore.getRange());
			    now = new Date(),
			me.miniDataIntegrityRecord =  [{
				title: 'Unsized Stories',
				userStories: _.filter(totalUserStories, function(item){ 
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					return item.data.PlanEstimate === null; 
				}).length || 0
			}, {
				title: 'Improperly Sized Stories',
				userStories: _.filter(totalUserStories,function(item){
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					var pe = item.data.PlanEstimate;
					return pe!==0 && pe!==1 && pe!==2 && pe!==4 && pe!==8 && pe!==16;
				}).length || 0
			},{
				title: 'Stories in Release without Iteration',
				userStories: _.filter(totalUserStories,function(item){ 
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					return !item.data.Iteration; 
				}).length || 0
			},{
				title: 'Stories with No Description',
				userStories: _.filter(totalUserStories,function(item){
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.Description) return false;
					if(!item.data.Iteration) return false;
					return new Date(item.data.Iteration.StartDate) <= now && new Date(item.data.Iteration.EndDate) >= now && !item.data.Description;
				}).length || 0
			},
			{
				title: 'Stories Scheduled After ' + lowestPortfolioItem + ' End Date',
				userStories: _.filter(totalUserStories, function(item){		
					if((item.data.Release || {}).Name !== releaseName) return false;
					if(item.data.DirectChildrenCount !== 0) return false; //only care about leaf stories here
					if(!item.data.Iteration || !item.data[lowestPortfolioItem] || 
						!item.data[lowestPortfolioItem].PlannedEndDate || !item.data.Iteration.StartDate) return false;
					if(item.data.ScheduleState == 'Accepted') return false;
					return new Date(item.data[lowestPortfolioItem].PlannedEndDate) < new Date(item.data.Iteration.StartDate);
				}).length || 0
			}];
			return me.miniDataIntegrityRecord;
		},

		/**___________________________________ RISKS STUFF ___________________________________**/	
		loadRisks: function(){
			var me = this;
			return RiskDb.query('risk-' + me.ReleaseRecord.data.Name + '-' + me.ScrumGroupRootRecord.data.ObjectID + '-')
				.then(function(risks){ 
					me.Risks = _.filter(risks, function(r){ return r.ProjectObjectID === me.ProjectRecord.data.ObjectID; });
				});
		},
		
		/**___________________________________ DEPENDENCIES STUFF ___________________________________**/					
		isUserStoryInRelease: function(userStoryRecord, releaseRecord){ 
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0];
			return ((userStoryRecord.data.Release || {}).Name === releaseRecord.data.Name) || 
				(!userStoryRecord.data.Release && ((userStoryRecord.data[lowestPortfolioItem] || {}).Release || {}).Name === releaseRecord.data.Name);
		},	
		spliceDependencyFromList: function(dependencyID, dependenciesData){ 
			for(var i = 0; i<dependenciesData.length; ++i){
				if(dependenciesData[i].DependencyID == dependencyID) {
					return dependenciesData.splice(i, 1)[0];
				}
			}
		},
		parseDependenciesFromUserStory: function(userStoryRecord){
			var me=this,
				predecessorsAndSuccessorsData = me.getDependencies(userStoryRecord), 
				inputPredecessors = predecessorsAndSuccessorsData.Predecessors, 
				inputSuccessors = predecessorsAndSuccessorsData.Successors,
				outputPredecessors = [], 
				outputSuccessors = [],
				UserStoryObjectID = userStoryRecord.data.ObjectID,
				UserStoryFormattedID = userStoryRecord.data.FormattedID,
				UserStoryName = userStoryRecord.data.Name;
			
			if(me.isUserStoryInRelease(userStoryRecord, me.ReleaseRecord)){
				_.each(inputPredecessors, function(predecessorDependencyData, dependencyID){
					outputPredecessors.push({
						DependencyID: dependencyID,
						UserStoryObjectID: UserStoryObjectID,
						UserStoryFormattedID: UserStoryFormattedID,
						UserStoryName: UserStoryName,
						Description: predecessorDependencyData.Description,
						NeededBy: predecessorDependencyData.NeededBy,
						Plan: predecessorDependencyData.Plan,
						Status: predecessorDependencyData.Status,
						PredecessorItems: predecessorDependencyData.PredecessorItems || [], 
						Edited: false
					});
				});
			}
			_.each(inputSuccessors, function(successorDependencyData, dependencyID){
				if(successorDependencyData.Assigned){ //if this was just placed on a random user story, or is assigned to this user story
					UserStoryFormattedID = userStoryRecord.data.FormattedID;
					UserStoryName = userStoryRecord.data.Name;
				} 
				else UserStoryFormattedID = UserStoryName = '';
						
				outputSuccessors.push({
					DependencyID: dependencyID,
					SuccessorUserStoryObjectID: successorDependencyData.SuccessorUserStoryObjectID,
					SuccessorProjectObjectID: successorDependencyData.SuccessorProjectObjectID,
					UserStoryObjectID: UserStoryObjectID,
					UserStoryFormattedID: UserStoryFormattedID,
					UserStoryName: UserStoryName,
					Description: successorDependencyData.Description,
					NeededBy: successorDependencyData.NeededBy,
					Supported: successorDependencyData.Supported,
					Assigned: successorDependencyData.Assigned,
					Edited: false
				});
			});
			return {Predecessors:outputPredecessors, Successors:outputSuccessors};
		},
		parseDependenciesData: function(userStoryList){	
			var me=this, 
				predecessors = [], 
				successors = [];			

			_.each(userStoryList, function(userStoryRecord){
				var predecessorsAndSuccessorsData = me.parseDependenciesFromUserStory(userStoryRecord);
				predecessors = predecessors.concat(predecessorsAndSuccessorsData.Predecessors);
				successors = successors.concat(predecessorsAndSuccessorsData.Successors);
			});
			return {Predecessors:predecessors, Successors:successors};
		},		
		getRealDependencyData: function(oldUserStoryRecord, dependencyID, type){ 
			var me = this, realDependenciesData;
			if(oldUserStoryRecord) realDependenciesData = me.parseDependenciesFromUserStory(oldUserStoryRecord)[type];
			else realDependenciesData = [];
			return me.spliceDependencyFromList(dependencyID, realDependenciesData) || null;		
		},
		hydrateDependencyUserStories: function(dependenciesParsedData){
			var me=this, 
				storyOIDsToHydrate = [],
				dependenciesHydratedUserStories = {};
			
			_.each(dependenciesParsedData.Predecessors, function(predecessor){
				_.each(predecessor.PredecessorItems, function(predecessorItem){
					storyOIDsToHydrate.push(predecessorItem.PredecessorUserStoryObjectID);
				});
			});
			_.each(dependenciesParsedData.Successors, function(successor){
				storyOIDsToHydrate.push(successor.SuccessorUserStoryObjectID);
			});
			
			return Q.all(_.map(storyOIDsToHydrate, function(storyOID){
				return me.loadUserStory(storyOID).then(function(userStory){
					if(userStory) dependenciesHydratedUserStories[storyOID] = userStory;
				});
			}))
			.then(function(){ return dependenciesHydratedUserStories; });
		},
		newPredecessorItem: function(){
			return {
				PredecessorItemID: 'PI' + (new Date() * 1) + '' + (Math.random() * 100 >> 0),
				PredecessorUserStoryObjectID: 0,
				PredecessorProjectObjectID: 0,
				Supported:'Undefined',
				Assigned:false
			};
		},
			newCommitmentItem: function(teamname,commitment,featurestatus,objective,cecomment){
			return {
				TeamName: teamname,
				Commitment: commitment,
				FeatureStatus: false,
				Objective:objective,
				CECOmment:''
			};
		},
		
		/**___________________________________ MISC HELPERS ___________________________________*/		
		htmlEscape: function(str) {
			return String(str)
				//.replace(/&/g, '&amp;')
				.replace(/"/g, '&quot;')
				.replace(/'/g, '&#39;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		},	
		getDirtyType: function(localRecord, realDataFromServer){ 
			/** if risk or dep record is new/edited/deleted/unchanged */
			if(!realDataFromServer)	return localRecord.data.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else return localRecord.data.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		},
		updateUserStoryColumnStores: function(){ 
			/** updates the dropdown stores with the most recent user stories in the release (in case some were added */
			var me = this, userStories = me.UserStoriesInRelease;
			if(me.UserStoryFIDStore){
				me.UserStoryFIDStore.removeAll();
				_.each(userStories, function(userStory){
					me.UserStoryFIDStore.add({'FormattedID': userStory.data.FormattedID});
				});
			}
			if(me.UserStoryNameStore){
				me.UserStoryNameStore.removeAll();
				_.each(userStories, function(userStory){
					me.UserStoryNameStore.add({'Name': userStory.data.Name});
				});
			}
		},	

		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		isEditingTeamCommits: false, 
		isEditingVelocity: false,
		
		isEditing: function(grid){
			if(!grid || !grid.store) return false;
			if(grid.editingPlugin && grid.editingPlugin.activeEditor) return true;
			return _.some(grid.store.getRange(), function(record){ return record.data.Edited; });
		},		
		showGrids: function(){
			var me=this;
			if(!me.TeamCommitsGrid){
				me.renderTeamCommitsGrid();
				//me.renderVelocityGrid();
				//me.renderSTDNCIGrid();
				//me.renderMiniDataIntegrityGrid();
				//me.renderRisksGrid();
				me.renderDependenciesGrids();
			}
		},	
		checkForDuplicates: function(){ 
			/** duplicates are in a list of groups of duplicates for each type */
			var me=this,
				deferred = Q.defer(),
				duplicatePredecessors = _.filter(_.groupBy(me.DependenciesParsedData.Predecessors,
					function(dependency){ return dependency.DependencyID; }),
					function(list, dependencyID){ return list.length > 1; }),
				duplicateSuccessors = _.filter(_.groupBy(me.DependenciesParsedData.Successors,
					function(dependency){ return dependency.DependencyID; }),
					function(list, dependencyID){ return list.length > 1; });
			if(duplicatePredecessors.length || duplicateSuccessors.length){
				me.clearRefreshInterval();
				me.renderResolveDuplicatesModal(duplicatePredecessors, duplicateSuccessors)
					.then(function(){ 
					//	me.setRefreshInterval(); 
						me.clearEverything();
						me.setLoading('Loading Data');
						return me.reloadStores(); 
					})
					.then(function(){ return me.updateGrids(); })
					.then(function(){ me.setLoading(false); })
					.then(function(){ deferred.resolve(); })
					.fail(function(reason){ deferred.reject(reason); })
					.done();
			} else deferred.resolve();
			
			return deferred.promise;
		},
		updateGrids: function(){
			var me=this,
				promises = [];
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.syncRisks(me.Risks);
			if(!me.isEditingVelocity && me.IterationStore && me.UserStoryStore){
				if(me.VelocityGrid && me.VelocityGrid.store) me.VelocityGrid.store.intelUpdate();
				if(me.DataIntegrityGrid && me.DataIntegrityGrid.store) {
					me.DataIntegrityGrid.store.intelUpdate();
				}
			}			
			if(!me.isEditingTeamCommits && me.PortfolioItemStore && me.UserStoryStore)
				if(me.TeamCommitsGrid && me.TeamCommitsGrid.store) me.TeamCommitsGrid.store.intelUpdate();
			if(!isEditingDeps && me.UserStoryStore && me.PortfolioItemStore){		
				/** me.UserStoriesInRelease is needed because some of the stories in me.UserStoryStore could be from other overlapping releases */
				me.UserStoriesInRelease = _.filter(me.UserStoryStore.getRange(), function(userStoryRecord){ 
					return me.isUserStoryInRelease(userStoryRecord, me.ReleaseRecord); 
				});
				me.DependenciesParsedData = me.parseDependenciesData(me.UserStoryStore.getRange());
				promises.push(me.hydrateDependencyUserStories(me.DependenciesParsedData).then(function(dependenciesHydratedUserStories){
					me.DependenciesHydratedUserStories = dependenciesHydratedUserStories;
					me.updateUserStoryColumnStores();
					if(me.PredecessorGrid && me.PredecessorGrid.store) me.PredecessorGrid.store.intelUpdate();
					if(me.SuccessorGrid && me.SuccessorGrid.store) me.SuccessorGrid.store.intelUpdate();
				}));
			}
			return Q.all(promises);
		},	
		// 
        //  reloadStores: function () {
        //     var me = this;
        //     return me.loadPortfolioItems().then(function () {
        //         return me.loadUserStories();
        //     });
        // },
           reloadStores: function () {
            var me = this;
            return me.loadRemainingConfiguration().then(function(){
                
            })
            .then(function(){ return me.loadPortfolioItems().then(function () {
                return me.loadUserStories();
            })
            });
        },
        
          loadRemainingConfiguration: function(){
            var me = this;
       //     me.ProjectRecord = me.createDummyProjectRecord(me.getContext().getProject());
            //for horizontal view you want to make sure that projects from all the trains are loaded not just that project
            me.isScopedToScrum = false;//me.isHorizontalView ? false :( me.ProjectRecord.data.Children.Count === 0);
            return me.configureIntelRallyApp()               
                .then(function(){ return me.loadScrumGroups(); })
                .then(function(){ return me.loadProjects(); })
                .then(function(){return me.loadEpicProjects();})
                .then(function(){ me.applyScopingOverrides(); });
        },

        /**
         Load all scrumGroups in horizontal mode, regardless of project scoping. Load scrum group in
         vertical mode ONLY if we are scoped to a scrumGroupRootRecord
         */
        loadScrumGroups: function() {
            var me = this;
            me.ScrumGroupRootRecords = [];
            me.ScrumGroupPortfolioOIDs = [];

            if(me.isHorizontalView){
                for (var i = 0; i < me.ScrumGroupConfig.length; i++) {
                    if (me.ScrumGroupConfig[i].IsTrain){ //only load train scrumGroups in horizontal view
                        var dummyScrumGroupRootRecord = me.createDummyProjectRecord({ObjectID: me.ScrumGroupConfig[i].ScrumGroupRootProjectOID});
                        me.ScrumGroupRootRecords.push(dummyScrumGroupRootRecord);
                        me.ScrumGroupPortfolioOIDs.push(me.getPortfolioOIDForScrumGroupRootProjectRecord(dummyScrumGroupRootRecord));
                    }
                }
            }
            else {
                return me.loadProject(me.ProjectRecord.data.ObjectID)
                    .then(function(projectRecord){ return me.projectInWhichScrumGroup(projectRecord); })
                    .then(function(scrumGroupRootRecord){
                        if(scrumGroupRootRecord){
                            if(scrumGroupRootRecord.data.ObjectID === me.ProjectRecord.data.ObjectID){ //if scoped to a scrumGroupRootRecord
                                me.ScrumGroupRootRecords.push(scrumGroupRootRecord);
                                me.ScrumGroupPortfolioOIDs.push(me.getPortfolioOIDForScrumGroupRootProjectRecord(scrumGroupRootRecord));
                            }
                        }
                    });
            }
        },

        /**
         NOTE: this does NOT set me.FilteredLeafProjects, which is the list of projects that should be used
         in querying userStories. This only loads all relevent projects 1 time, up front, during the app
         configuration.
         */
        loadProjects: function() {
            var me = this;
            me.LeafProjects = [];
            me.LeafProjectsByScrumGroup = {};
            me.LeafProjectsByHorizontal = {};
            me.LeafProjectsByTeamTypeComponent = {};

            return Q.all(_.map(me.ScrumGroupRootRecords, function(scrumGroupRootRecord){
                return me.loadAllLeafProjectsForPortfolioDI(scrumGroupRootRecord).then(function(leafProjects){
                    me.LeafProjects = me.LeafProjects.concat(_.values(leafProjects));
                    me.LeafProjectsByScrumGroup[scrumGroupRootRecord.data.ObjectID] = _.values(leafProjects);

                    var teamTypes = me.getAllHorizontalTeamTypeInfos(leafProjects);
                    for(var i in teamTypes){
                        me.LeafProjectsByHorizontal[teamTypes[i].horizontal] = me.LeafProjectsByHorizontal[teamTypes[i].horizontal] || [];
                        me.LeafProjectsByHorizontal[teamTypes[i].horizontal].push(teamTypes[i].projectRecord);
                        for(var j in teamTypes[i].teamTypeComponents){
                            var cmp =  teamTypes[i].teamTypeComponents[j];
                            me.LeafProjectsByTeamTypeComponent[cmp] = me.LeafProjectsByTeamTypeComponent[cmp] || [];
                            me.LeafProjectsByTeamTypeComponent[cmp].push(teamTypes[i].projectRecord);
                        }
                    }

                });
            }));
        },


        loadEpicProjects: function(){
            var me = this;
            me.AllProjects = {};
            me.LeafProjectsByEpicComponent = {};

            return me.loadAllProjects().then(function(projects){
                me.AllProjects = projects;

            });
        },
        processURLOverrides: function() {
            var me = this;
            // Create overrides object
            me.Overrides = {decodedUrl: decodeURI(window.parent.location.href)};
            // Determine if URL parameters should be used
            me.isStandalone = me.Overrides.decodedUrl.match('isStandalone=true') ? true : false;
            if (me.isStandalone) {
                // Process URL for possible parameters
                me.Overrides.TeamName = me.Overrides.decodedUrl.match('team=.*');
                me.Overrides.TeamName = (me.Overrides.TeamName ? me.Overrides.TeamName[0].slice(5).split('&')[0] : undefined);
                me.Overrides.ScopedHorizontal = me.Overrides.decodedUrl.match('group=.*');
                me.Overrides.ScopedHorizontal = (me.Overrides.ScopedHorizontal ? me.Overrides.ScopedHorizontal[0].slice(6).split('&')[0] : undefined);
                me.Overrides.ReleaseName = me.Overrides.decodedUrl.match('release=.*');
                me.Overrides.ReleaseName = (me.Overrides.ReleaseName ? me.Overrides.ReleaseName[0].slice(8).split('&')[0] : undefined);
            }
        },

        createDummyProjectRecord: function(dataObject) {
            return { data: dataObject };
        },

        applyScopingOverrides: function(){
            var me = this;

            //the following code validates URL overrides and sets defaults for viewing projects/horizontals/scrumGroups
            if(!me.isScopedToScrum){
                me.ScopedTeamType = me.Overrides.TeamName || (me.isHorizontalView && !me.isStandalone ? me.HorizontalTeamTypeInfo.teamType : '' ); //could be a teamTypeComponent (for horizontal mode) or scrumName (for vertical mode)
                if(me.isHorizontalView){
                    if(me.ScopedTeamType){
                        if(!_.contains(me.getAllHorizontalTeamTypeComponents(), me.ScopedTeamType)) throw me.ScopedTeamType + ' is not configured as horizontal teamType';
                        me.ScopedHorizontal = me.teamTypeComponentInWhichHorizontal(me.ScopedTeamType);
                    }
                    else me.ScopedHorizontal = me.Overrides.ScopedHorizontal || _.keys(me.HorizontalGroupingConfig.groups).sort()[0];

                    if(typeof me.HorizontalGroupingConfig.groups[me.ScopedHorizontal] === 'undefined')
                        throw me.ScopedHorizontal + ' is not a valid horizontal';
                }
                else {
                    if(me.ScopedTeamType){
                        if(!me.ScrumGroupRootRecords.length) throw "cannot specify team when not in ScrumGroup";
                        var matchingTeam = _.find(me.LeafProjectsByScrumGroup[me.ScrumGroupRootRecords[0].data.ObjectID], function(p){
                            return p.data.Name === me.ScopedTeamType;
                        });
                        if(!matchingTeam) throw me.ScopedTeamType + " is not a valid team";
                    }
                }
            }
        },
        // 	reloadStores: function(){
		// 	var me=this,
		// 		isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid),
		// 		promises = [];
                
                
        //         return Q.all([
		// 	me.loadExtraDataIntegrityStories(),
		// 	me.loadRisks(),
        //     me.loadIterations()
		// 	])
		// 	.then(function(){
		// 		me.loadPortfolioItems();
				
		// 	})
		// 	.then(function(){
		// 	me.loadUserStories();
        //     me.loadDefects();
		// 	})
        //     .then(function(){
		//     me.loadSTDNCIData();
		// 	})
		// 	.fail(function(reason){
		// 		me.setLoading(false);
		// 		me.alert('ERROR', reason);
		// 	});
		
            
            
		
		// },
		clearEverything: function(){
			var me=this;
			
			me.isEditingTeamCommits = false;
			me.isEditingVelocity = false;
			
			me.PortfolioItemMap = {};
			
			me.UserStoryStore = undefined;
            me.DefectsStore = undefined;
            me.UserDefectStore = undefined;
			me.PortfolioItemStore = undefined;
			me.IterationStore = undefined;
			me.ExtraDataIntegrityUserStoriesStore = undefined;
			
			me.PredecessorGrid = undefined;
			me.SuccessorGrid = undefined;
			me.RisksGrid = undefined;
			me.VelocityGrid = undefined;
			me.TeamCommitsGrid = undefined;
			me.DataIntegrityGrid = undefined;
			
			var toRemove = me.down('#tcVelBox').next(), tmp;
			while(toRemove){ //delete risks and dependencies 
				tmp = toRemove.next();
				toRemove.up().remove(toRemove);
				toRemove = tmp;
			}
			me.down('#tcVelBoxLeft').removeAll();
			me.down('#tcVelBoxRight').removeAll();
		},
		reloadEverything:function(){
			var me = this;
			
			me.clearEverything();
			me.setLoading('Loading Data');
			if(!me.ReleasePicker){ //draw these once, never remove them
				me.renderReleasePicker();
			//	me.renderScrumGroupPicker();
			//	me.renderRefreshIntervalCombo();
			//	me.renderManualRefreshButton();
			}		
			me.enqueue(function(unlockFunc){	
				me.reloadStores()
					.then(function(){ return me.updateGrids(); })
					//.then(function(){ return me.checkForDuplicates(); })
					.then(function(){ return me.showGrids(); })
					.fail(function(reason){	me.alert('ERROR', reason); })
					.then(function(){
						unlockFunc();
						me.setLoading(false); 
					})
					.done();
			}, 'Queue-Main');
		},
		
		/**___________________________________ REFRESHING DATA ___________________________________*/	
		setLoadingMasks: function(){
			var me=this, message = 'Refreshing Data',
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid);			
			if(me.TeamCommitsGrid && !me.isEditingTeamCommits) me.TeamCommitsGrid.setLoading(message);
			if(me.VelocityGrid && !me.isEditingVelocity) me.VelocityGrid.setLoading(message);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.setLoading(message);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(message);
			if(me.SuccessorGrid && !isEditingDeps) me.SuccessorGrid.setLoading(message);
			if(me.DataIntegrityGrid) me.DataIntegrityGrid.setLoading(message);
		},	
		removeLoadingMasks: function(){
			var me=this,
				isEditingDeps = me.isEditing(me.PredecessorGrid) || me.isEditing(me.SuccessorGrid);		
			if(me.TeamCommitsGrid && !me.isEditingTeamCommits) me.TeamCommitsGrid.setLoading(false);
			if(me.VelocityGrid && !me.isEditingVelocity) me.VelocityGrid.setLoading(false);
			if(me.RisksGrid && !me.RisksGrid.hasPendingEdits()) me.RisksGrid.setLoading(false);
			if(me.PredecessorGrid && !isEditingDeps) me.PredecessorGrid.setLoading(false);
			if(me.SuccessorGrid && !isEditingDeps) me.SuccessorGrid.setLoading(false);
			if(me.DataIntegrityGrid) me.DataIntegrityGrid.setLoading(false);
		},	
		refreshDataFunc: function(){
			var me=this;
			me.setLoadingMasks();
			me.enqueue(function(unlockFunc){
				me.reloadStores()
					.then(function(){	me.getMiniDataIntegrityStoreData();	})
					.then(function(){ return me.updateGrids(); })
					.then(function(){ return me.checkForDuplicates(); })
					.then(function(){ return me.showGrids(); })
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ 
						unlockFunc();
						me.removeLoadingMasks();
					})
					.done();
			}, 'Queue-Main');
		},	
		clearRefreshInterval: function(){
			var me=this;
			if(me.RefreshInterval){ 
				clearInterval(me.RefreshInterval); 
				me.RefreshInterval = undefined; 
			}	
		},
		// setRefreshInterval: function(){
		// 	var me=this;
		// 	me.clearRefreshInterval();
		// 	if(me.AppsPref.refresh && me.AppsPref.refresh!=='Off')
		// 		me.RefreshInterval = setInterval(function(){ me.refreshDataFunc(); }, me.AppsPref.refresh*1000);
		// },
		
		/**___________________________________ LAUNCH ___________________________________*/
		launch: function(){
			var me=this;
			me.setLoading('Loading Configuration');
            console.log(me.getContext().getProject());
            me.AllTrains= false;
			me.currentUser = me.getContext().getUser().UserName;
            me.processURLOverrides();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) { //permission check
				me.hideGearButtonAndCustomAppPanel();
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this project');
				return;
			} 
			Q.all([
				me._loadConfigEditPermissionList()
					.then(function(test){
						me.canEdit = !_.isEmpty(me.ConfigEditPermissionList.username) && (me.ConfigEditPermissionList.username.indexOf(me.currentUser) > -1) ? true: false;
						if (me.canEdit === false){
							me.hideGearButtonAndCustomAppPanel();
						}
					}),
				me.configureIntelRallyApp()
			])	
			.then(function(){
				var scopeProject = me.getContext().getProject();
                console.log("scopeProject",scopeProject);
				return me.loadProject(scopeProject.ObjectID);
			})
			.then(function(scopeProjectRecord){
				me.ProjectRecord = scopeProjectRecord;
				return Q.all([
					me.loadProjectsWithTeamMembers().then(function(projectsWithTeamMembers){
						me.ProjectsWithTeamMembers = projectsWithTeamMembers;
						me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
						if(!me.ProjectsWithTeamMembers[me.ProjectRecord.data.ObjectID])
							return Q.reject('Please scope to a project that has team members!');
					}),
					me.projectInWhichScrumGroup(me.ProjectRecord).then(function(scrumGroupRootRecord){
						if(scrumGroupRootRecord){
							me.ScrumGroupRootRecord = scrumGroupRootRecord;            
							return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
								.then(function(scrumGroupPortfolioProject){
									me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
								});
						} 
						//else me.ProjectNotInScrumGroup = true;
                        else{
                            
                            //load all trains -- need to test this
                            me.AllTrains=true;
                             me.scopeProject = me.getContext().getProject();
                            me.savedScrumConfig = me.ScrumGroupConfig;
                            _.reduce(me.ScrumGroupConfig, function (hash, train, key) {
                    var projectNames = _.map(train.Scrums, function (scrum) {
                        console.log("Scrum", scrum);
                      //     var projdata= me.loadProject(item.ScrumGroupPortfolioOIDs);
                        return scrum.data.Name;
                    });
                            });
                                //Show all trains
                                console.log("show all trains");
                                var projId;
                             //   me.loadAllTrainsData();
                                me.ScrumGroupConfig = _.filter(me.ScrumGroupConfig, function (item) {
                                    projId= me.loadScrumGroups(item.ScrumGroupRootProjectOID);
                                    console.log(item);
                                    return item.IsTrain;
                                });
                                
                                me.AllTrains= true;
                              
                        }
                    }),
					me.loadAllScrumGroups().then(function(scrumGroupRootRecords){
						me.AllScrumGroupRootRecords = scrumGroupRootRecords;
						//Do for all trains
                        if(me.AllTrains)
                        {
                                me.ScrumGroupRootRecord = me.AllScrumGroupRootRecords[0];
                        _each(me.AllScrumGroupRootRecords, function(scrumgrouprecord){
                            
                        //add this to an array
                       // me.ScrumGroupRootRecord = scrumgrouprecord;
                       me.ScrumGroupRootRecord.push(scrumgrouprecord);
                        return me.loadScrumGroupPortfolioProject(scrumgrouprecord).then(function(scrumGroupPortfolioProject){
						//me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
                        me.ScrumGroupPortfolioOIDs.push(scrumGroupPortfolioProject);
                       e.ScrumGroupPortfolioProject.push(scrumGroupPortfolioProject);
                        //Add to  new ScrumGroupPortfolioProject array
                        });
					})
                            
                        }
                           
					}),
                    
					me.loadAppsPreference()
						.then(function(appsPref){
							me.AppsPref = appsPref;
							me.AppsPref.refresh = me.AppsPref.refresh || 60;
							var twelveWeeks = 1000*60*60*24*7*12;
							return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
						})
						.then(function(releaseRecords){
							me.ReleaseRecords = releaseRecords;
							var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
							if(currentRelease){
								me.ReleaseRecord = currentRelease;
								me.WorkweekData = me.getWorkweeksForDropdown(currentRelease.data.ReleaseStartDate, currentRelease.data.ReleaseDate);
							}
							else return Q.reject('This project has no releases.');
						}),
					me.getCustomAppObjectID('Intel.DataIntegrityDashboard.Vertical').then(function(objectID){
						me.VerticalDataIntegrityDashboardObjectID = objectID;
					}),
					RiskDb.initialize()
				]);
			})
			.then(function(){
				if(me.ProjectNotInScrumGroup && !me.AllTrains){
					var projectOID = me.ProjectRecord.data.ObjectID;
					if(me.AppsPref.projs[projectOID] && me.AppsPref.projs[projectOID].ScrumGroup){
						me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(p){ 
							return p.data.ObjectID == me.AppsPref.projs[projectOID].ScrumGroup; 
						});
                        console.log(me.AllScrumGroupRootRecords);
						if(!me.ScrumGroupRootRecord) me.ScrumGroupRootRecord = me.AllScrumGroupRootRecords[0];
					} 
					else 
                    {
                        me.ScrumGroupRootRecord = me.AllScrumGroupRootRecords[0];
                        _each(me.AllScrumGroupRootRecords, function(scrumgrouprecord){
                            
                        me.ScrumGroupRootRecord=scrumgrouprecord;
                        return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord).then(function(scrumGroupPortfolioProject){
						me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
                        //Add to  new ScrumGroupPortfolioProject array
                        });
					})
                    }
					return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord).then(function(scrumGroupPortfolioProject){
						me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
					});
				}
			})
			.then(function(){ 
				me.setLoading(false);
			//	me.setRefreshInterval(); 
				return me.reloadEverything();
			})
			.fail(function(reason){ me.alert('ERROR', reason); })
			.done();
		},
		// _loadScrumGroupConfig: function(){
		// 	/** scrum-groups are groups of scrums that share the same portfolio. The group of scrums may or may not be a train */
		// 	/** me.ScrumGroupConfig is an array of these objects: 
		// 		{
		// 			ScrumGroupRootProjectOID: configItem.ScrumGroupRootProjectOID || 0,
		// 			ScrumGroupName: configItem.ScrumGroupName || '',
		// 			ScrumGroupAndPortfolioLocationTheSame: configItem.ScrumGroupAndPortfolioLocationTheSame ? true : false,
		// 			PortfolioProjectOID: configItem.PortfolioProjectOID || 0,
		// 			IsTrain: configItem.IsTrain ? true : false
		// 		}
		// 	*/
		// 	var me=this, deferred = Q.defer();
		// 	Rally.data.PreferenceManager.load({
		// 		workspace: me.getContext().getWorkspace()._ref,
		// 	//	filterByName: ScrumGroupConfigPrefName,
		// 		success: function(prefs) {
		// 			var configString = prefs[ScrumGroupConfigPrefName], scrumGroupConfig;
		// 			try{ scrumGroupConfig = JSON.parse(configString); }
		// 			catch(e){ scrumGroupConfig = []; }
		// 			me.ScrumGroupConfig = scrumGroupConfig;
		// 			deferred.resolve();
		// 		},
		// 		failure: deferred.reject
		// 	});
		// 	return deferred.promise;
		// },
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			me.WorkweekData = me.getWorkweeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeft').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.releasePickerSelected.bind(me)
				}
			});
		},	
		scrumGroupPickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.getScrumGroupName(me.ScrumGroupRootRecord) == records[0].data.Name) return;
			me.setLoading('Loading Data');
			me.ScrumGroupRootRecord = _.find(me.AllScrumGroupRootRecords, function(sgr){ return me.getScrumGroupName(sgr) == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].ScrumGroup = me.ScrumGroupRootRecord.data.ObjectID;
			Q.all([
				(me.ProjectNotInScrumGroup ? me.saveAppsPreference(me.AppsPref) : Q()), //Do not set a preference for scrums in scrum-groups
				me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
					.then(function(scrumGroupPortfolioProject){
						me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
					})
			])
			.then(function(){ me.reloadEverything(); })
			.fail(function(reason){ me.alert('ERROR', reason); })
			.then(function(){ me.setLoading(false); })
			.done();
		},	
		renderScrumGroupPicker: function(){
			var me=this;
			me.down('#navboxLeft').add({
				xtype:'intelfixedcombo',
				id:'scrumGroupPicker',
				width:240,
				labelWidth:50,
				store: Ext.create('Ext.data.Store', {
					fields: ['Name'],				
					data: me.ScrumGroupNames
				}),
				displayField: 'Name',
				fieldLabel: 'Portfolio:',
				value: me.getScrumGroupName(me.ScrumGroupRootRecord),
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.scrumGroupPickerSelected.bind(me)
				}
			});
		},	
		refreshComboSelected: function(combo, records){
			var me=this, rate = records[0].data.Rate;
			if(me.AppsPref.refresh === rate) return;
			me.AppsPref.refresh = rate;
		//	me.setRefreshInterval();
			me.setLoading("Saving Preference");
			me.saveAppsPreference(me.AppsPref)
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},			
		renderRefreshIntervalCombo: function(){
			var me=this;
			me.down('#navboxRight').add({
				xtype:'intelfixedcombo',
				store: Ext.create('Ext.data.Store', {
					fields: ['Rate'],
					data: [
						{Rate: 'Off'},
						{Rate: '10'},
						{Rate: '15'},
						{Rate: '30'},
						{Rate: '60'},
						{Rate: '120'}
					]
				}),
				displayField: 'Rate',
				fieldLabel: 'Auto-Refresh Rate (seconds):',
				value:me.AppsPref.refresh,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.refreshComboSelected.bind(me)
				}
			});
		},
		// renderManualRefreshButton: function(){
		// 	var me=this;
		// 	me.down('#navboxRight').add({
		// 		xtype:'button',
		// 		id: 'manualRefreshButton',
		// 		cls: 'intel-button',
		// 		text:'Refresh Data',
		// 		width:100,
		// 		listeners:{
		// 			click: me.refreshDataFunc.bind(me)
		// 		}
		// 	});
		// },

		/**___________________________________ RENDER RESOLVE DUPLICATES ___________________________________*/	
		renderResolveDuplicatesModal: function(duplicatePredecessors, duplicateSuccessors){
			var me=this,
				deferred = Q.defer(),
				modal = Ext.create('Ext.window.Window', {
					modal:true,
					closable:false,
					title:'ERROR Duplicate Dependencies!',
					cls:'duplicates-modal',
					overflowY: 'scroll',
					resizable: true,
					height: me.getHeight()*0.9>>0,
					width: Math.min(900, me.getWidth()*0.9>>0),
					y:5,
					items: [{
						xtype:'container',
						html:'<p>Use the checkboxes to select which of the duplicates you want to keep. ' + 
							'You have to keep exactly 1 of the duplicates. When you have finished, click Done.</p><br/>',
						manageHeight:false
					}].concat(duplicatePredecessors.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Predecessors</h2>',
							manageHeight:false
						}].concat(_.map(duplicatePredecessors, function(predecessorsOfOneID){
							return {
								xtype:'grid',
								cls: 'team-report-grid duplicate-predecessors-grid rally-grid',
								columns: {
									defaults: COLUMN_DEFAULTS,
									items: [{
										text:'#', 
										dataIndex:'UserStoryFormattedID',
										width:90,
										sortable:true
									},{
										text:'UserStory', 
										dataIndex:'UserStoryName',
										flex:1,	
										sortable:true
									},{
										text:'Dependency Description', 
										dataIndex:'Description',
										flex:1
									},{
										text:'Needed By',			
										dataIndex:'NeededBy',
										width:90,
										sortable:true,
										renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');}
									},{
										text:'Teams Depended On',
										dataIndex:'DependencyID',
										xtype:'intelcomponentcolumn',
										html:	'<div class="predecessor-items-grid-header" style="width:10px !important;"></div>' +
												'<div class="predecessor-items-grid-header" style="width:110px !important;">Team Name</div>' +
												'<div class="predecessor-items-grid-header" style="width:95px  !important;">Supported</div>' +
												'<div class="predecessor-items-grid-header" style="width:70px  !important;">#</div>' +
												'<div class="predecessor-items-grid-header" style="width:130px !important;">User Story</div>',
										width:420,
										renderer: function(dependencyID, meta, record, rowIndex){
											var swallowEventHandler = {
												element: 'el',
												fn: function(a){ a.stopPropagation(); }
											};
											var predecessorItemColumnCfgs = [{
												dataIndex:'PredecessorProjectObjectID',
												width:115,
												renderer: function(val, meta){
													var projectRecord = me.ProjectsWithTeamMembers[val];
													if(val && projectRecord) return projectRecord.data.Name;
													else return '-';
												}
											},{
												dataIndex:'Supported',
												width:80,
												renderer: function(val, meta){
													if(val == 'No') meta.tdCls = 'predecessor-item-not-supported-cell';
													else if(val == 'Yes') meta.tdCls = 'predecessor-item-supported-cell';
													return val;
												}
											},{
												dataIndex:'PredecessorUserStoryObjectID',
												width:75,
												renderer: function(userStoryObjectID, meta, predecessorItemRecord){
													if(predecessorItemRecord.data.Assigned){
														var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
														if(userStory) return userStory.data.FormattedID;
														else return '?';
													}
													else return '-';
												}
											},{
												dataIndex:'PredecessorUserStoryObjectID',
												width:140,
												renderer: function(userStoryObjectID, meta, predecessorItemRecord){
													if(predecessorItemRecord.data.Assigned){
														var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
														if(userStory) return userStory.data.Name;
														else return '?';
													}
													else return '-';
												}				
											}];
											
											return {
												xtype: 'grid',
												cls:'team-report-grid duplicate-predecessor-items-grid rally-grid',
												viewConfig: { stripeRows:false },
												width:420,
												manageHeight:false,
												columns: {
													defaults: COLUMN_DEFAULTS,
													items: predecessorItemColumnCfgs
												},
												listeners: {
													mousedown: swallowEventHandler,
													mousemove: swallowEventHandler,
													mouseout: swallowEventHandler,
													mouseover: swallowEventHandler,
													mouseup: swallowEventHandler,
													mousewheel: swallowEventHandler,
													scroll: swallowEventHandler,
													click: swallowEventHandler,
													dblclick: swallowEventHandler,
													contextmenu: swallowEventHandler,
													selectionchange: function(){ this.getSelectionModel().deselectAll(); }
												},
												rowLines:false,
												disableSelection: true,
												scroll:false,
												hideHeaders:true,
												showRowActionsColumn:false,
												showPagingToolbar:false,
												enableEditing:false,
												store: Ext.create('Rally.data.custom.Store', { data: predecessorsOfOneID[rowIndex].PredecessorItems })
											};
										}
									}]
								},
								selModel: Ext.create('Ext.selection.CheckboxModel', {
									mode:'SINGLE',
									allowDeselect:false
								}),
								listeners:{ viewready: function(){ this.getSelectionModel().select(0); }},
								manageHeight:false,
								sortableColumns:false,
								enableEditing:false,
								store:Ext.create('Rally.data.custom.Store', { data: predecessorsOfOneID })
							};
						})
					) : []).concat(duplicateSuccessors.length ? [{
							xtype:'container',
							html:'<h2 class="grid-group-header">Duplicate Successors</h2>'
						}].concat(_.map(duplicateSuccessors, function(successorsOfOneID){
							return {
								xtype:'grid',
								cls: 'team-report-grid duplicate-successors-grid rally-grid',
								columns: {
									defaults: COLUMN_DEFAULTS,
									items: [{
										text:'Requested By',
										dataIndex:'SuccessorProjectObjectID',
										width:160,
										sortable:true,
										renderer: function(projectOID){ return me.ProjectsWithTeamMembers[projectOID].data.Name; }
									},{
										text:'Req #',
										dataIndex:'SuccessorUserStoryObjectID',
										width:90,
										sortable:true,
										renderer: function(userStoryObjectID){
											var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
											if(userStory) return userStory.data.FormattedID;
											else return '?';
										}
									},{
										text:'Req UserStory',
										dataIndex:'SuccessorUserStoryObjectID',
										flex:1,
										sortable:true,
										renderer: function(userStoryObjectID){
											var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
											if(userStory) return userStory.data.Name;
											else return '?';
										}
									},{
										text:'Dependency Description', 
										dataIndex:'Description',
										flex:1			
									},{
										text:'Needed By',
										dataIndex:'NeededBy',
										width:80,
										sortable:true,
										renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-');}	
									},{
										text:'Supported',					
										dataIndex:'Supported',
										width:90,
										renderer: function(val, meta){
											if(val == 'No') meta.tdCls = 'successor-not-supported-cell';
											else if(val == 'Yes') meta.tdCls = 'successor-supported-cell';
											return val;
										}
									},{
										text:'Sup #', 
										dataIndex:'UserStoryFormattedID',
										width:90,
										sortable:true
									},{
										text:'Sup UserStory', 
										dataIndex:'UserStoryName',
										flex:1,
										sortable: true
									}]
								},
								selModel: Ext.create('Ext.selection.CheckboxModel', {
									mode:'SINGLE',
									allowDeselect:false
								}),
								listeners:{ viewready: function(){ this.getSelectionModel().select(0); }},
								manageHeight:false,
								sortableColumns:false,
								enableEditing:false,
								store:Ext.create('Rally.data.custom.Store', { data: successorsOfOneID })
							};
						})
					) : []).concat([{
						xtype:'button',
						cls:'done-button',
						text:'Done',
						handler:function(){
							var grids = Ext.ComponentQuery.query('grid', modal),
								predecessorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-predecessors-grid'); }),
								successorGrids = _.filter(grids, function(grid){ return grid.hasCls('duplicate-successors-grid'); });

							modal.setLoading('Removing Duplicates');
							Q.all([
								Q.all(_.map(predecessorGrids, function(grid){ 
									var predecessorToKeep = grid.getSelectionModel().getSelection()[0],
										predecessorsToRemove = _.filter(grid.store.getRange(), function(item){ return item.id != predecessorToKeep.id; });
									return Q.all(_.map(predecessorsToRemove, function(predecessorRecord){			
										var deferred = Q.defer();
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(predecessorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me.getRealDependencyData(
														oldUserStoryRecord, predecessorRecord.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me.getRemovedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems,  
														realPredecessorData,
														me.ProjectRecord,
														me.ProjectsWithTeamMembers,
														me.ProjectRecord,
														me.DependenciesParsedData).then(function(removedCallbacks){
													var promise = Q();
													_.each(removedCallbacks, function(callback){ promise = promise.then(callback); });													
													return promise.then(function(){
														return me.removePredecessor(
															oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
													});
												});											
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-Dependencies'); 
										return deferred.promise;
									}))
									.then(function(){
										var deferred = Q.defer();
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(predecessorToKeep.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realPredecessorData = me.getRealDependencyData(
														oldUserStoryRecord, predecessorToKeep.data.DependencyID, 'Predecessors');
												if(!realPredecessorData) return;
												return me.getAddedPredecessorItemCallbacks(
														realPredecessorData.PredecessorItems, 
														realPredecessorData,
														me.ProjectRecord,
														me.ProjectsWithTeamMembers,
														me.ProjectRecord,
														me.DependenciesParsedData).then(function(addedCallbacks){
													var promise = Q();
													_.each(addedCallbacks, function(callback){ promise = promise.then(callback); });			
													return promise.then(function(){
														return me.addPredecessor(
															oldUserStoryRecord, realPredecessorData, me.ProjectRecord, me.DependenciesParsedData);
													});
												});											
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-Dependencies'); 
										return deferred.promise;
									});
								})),
								Q.all(_.map(successorGrids, function(grid){ //dont edit it's successor userStory 
									var successorToKeep = grid.getSelectionModel().getSelection()[0],
										successorsToDelete = _.filter(grid.store.getRange(), function(item){ return item.id != successorToKeep.id; });		
									return Q.all(_.map(successorsToDelete, function(successorRecord){
										var deferred = Q.defer();
										/** this is about as fine grained as I want to get with 1 queue. otherwise we might end up with deadlock */
										me.enqueue(function(unlockFunc){
											me.getOldAndNewUserStoryRecords(successorRecord.data, me.UserStoriesInRelease).then(function(records){
												var oldUserStoryRecord = records[0],
													realSuccessorData = me.getRealDependencyData(
														oldUserStoryRecord, successorRecord.data.DependencyID, 'Successors');		
												if(!realSuccessorData) return;
												return me.removeSuccessor(oldUserStoryRecord, realSuccessorData, me.ProjectRecord, me.DependenciesParsedData);
											})
											.then(function(){ deferred.resolve(); })
											.fail(function(reason){ deferred.reject(reason); })
											.then(function(){ unlockFunc(); })
											.done();
										}, 'Queue-Dependencies'); 
										return deferred.promise;
									}));
								}))
							]).then(function(){
								modal.destroy();
								deferred.resolve();
							})
							.fail(function(reason){ 
								modal.destroy();
								deferred.reject(reason); 
							})
							.done();
						}
					}])
				});
			setTimeout(function(){ modal.show(); }, 10);
			return deferred.promise;
		},
		  loadAllTrainsData: function(){
            var me = this;
            console.log("load all trains data...");
            me.setLoading('Getting all Scrum Teams data for all Trains...');
            //Show all trains: update me.ScrumGroupConfig first
            me.ScrumGroupConfig = _.filter(me.savedScrumConfig, function (item) {
                return item.IsTrain;
            });
            //Now me.ScrumGroupConfig has all the trains, but not the trains scrums inside each train.
            //Now we need to get the leaf scums for each of the trains
            return Q.all(_.map(me.ScrumGroupConfig, function (cfg) {
                console.log("map");
                return me.loadAllLeafProjects({data: {ObjectID: cfg.ScrumGroupRootProjectOID}}).then(function (leafProjects) {
                    console.log("scrums...");
                    cfg.Scrums = leafProjects;
                });
            }));
        },
		/**___________________________________ RENDER GRIDS ___________________________________*/	
      renderTeamCommitsGrid: function(){
          var me = this;
          // var MoSCoWRanks = ['Must Have', 'Should Have', 'Could Have', 'Won\'t Have', 'Undefined', '']; 
          //Create array of me.portfolioItemstores[trainName] and iterate for all trains
          me.teamCommitsCountHash = {};
          me.teamCommitsEstimateHash = {};
          var trainName = me.getScrumGroupName(me.ScrumGroupRootRecord);
          if (!trainName)
              getalltrains();
          var teamCommits;
          //iterate through me.PortfolioItemStores 
          //
            _each(me.PortfolioItemStores, function(portfolioItemStore){
                            
                        me.PortfolioItemStore=portfolioItemStore;
                       
					
          
          //
          var customTeamCommitsRecords = _.map(_.sortBy(me.PortfolioItemStore.getRecords(),
              function(portfolioItemRecord) { return portfolioItemRecord.data.DragAndDropRank; /* return MoSCoWRanks.indexOf(portfolioItemRecord.data.c_MoSCoW); */ }),
              function(portfolioItemRecord, index) {
                  var teamCommit = me.getTeamCommits(portfolioItemRecord);
                  var teamCmtsArry = [];
                  var commitmentItemsArry = [];
                  teamCmtsArry = teamCommit;
                  var teamCommitsItem = {};
                  _.each(_.sortBy(_.keys(teamCommit)), function(projId) {
                      var name = me.ProjectOIDNameMap[projId];
                      var commitment = teamCommit[projId].Commitment;
                      var featurestatus = teamCommit[projId].FeatureStatus;
                      var objective = teamCommit[projId].Objective;
                      var cecommnet = teamCommit[projId].cecomment;
                      commitmentItemsArry.push({ TeamName: name, Commitment: commitment, TeamComment: objective, CEComment: cecommnet });
                      if (commitment == 'Not Committed') {
                          //add to array
                          teamCmtsArry.commitment = teamCommit[projId].Commitment;
                          teamCmtsArry.featurestatus = teamCommit[projId].FeatureStatus;

                      }
                      teamCommitsItem[projId] = me.newCommitmentItem(name, commitment, objective, cecommnet);

                      //only add it if not committed or feature help needed

                  });
                  return {
                      PortfolioItemObjectID: portfolioItemRecord.data.ObjectID,
                      PortfolioItemRank: index + 1,
                      FeatureStatus: portfolioItemRecord.data.c_FeatureStatus || false,
                      //	PortfolioItemMoSCoW: portfolioItemRecord.data.c_MoSCoW || 'Undefined',
                      PortfolioItemName: portfolioItemRecord.data.Name,
                      PortfolioItemFormattedID: portfolioItemRecord.data.FormattedID,
                      PortfolioItemTrainName: trainName,
                      PortfolioItemPlannedEnd: new Date(portfolioItemRecord.data.PlannedEndDate) * 1,
                      TopPortfolioItemName: me.PortfolioItemMap[portfolioItemRecord.data.ObjectID],
                      Commitment: teamCommit,
                      //TeamCommitmentItems: teamCommitsItem
                      TeamCommitmentItems: commitmentItemsArry
                      // Objective: teamCommit.Objective || '',
                      // Expected: teamCommit.Expected || false
                  };
              });

          var teamCommitsStore = Ext.create('Intel.lib.component.Store', {
              data: customTeamCommitsRecords,
              model: 'IntelFeatureHelp',
              autoSync: true,
              limit: Infinity,
              disableMetaChangeEvent: true,
              proxy: {
                  type: 'intelsessionstorage',
                  id: 'TeamCommitsProxy' + Math.random()
              },
              intelUpdate: function() {
                  teamCommitsStore.suspendEvents(true);
                  _.each(teamCommitsStore.getRange(), function(teamCommitsRecord) {
                      var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(portfolioItem) {
                          return portfolioItem.data.ObjectID == teamCommitsRecord.data.PortfolioItemObjectID;
                      });
                      if (portfolioItemRecord) {
                          var newVal = me.getTeamCommit(portfolioItemRecord);
                          teamCommitsRecord.data.Commitment = newVal;
                         
                      }
                  });
                  teamCommitsStore.resumeEvents();
              }
          });
         
          var teamCommitsColumns = [/* {
			
			}, */
              {
                  text: 'Train Name',
                  dataIndex: 'PortfolioItemTrainName',
                  width: 50,
                  sortable: true
              },
              {
                  text: 'Rank',
                  dataIndex: 'PortfolioItemRank',
                  width: 50,
                  sortable: true
              },
              {
                  text: 'Feature Help',
                  dataIndex: 'FeatureStatus',
                  width: 50,
                  sortable: true
              }, {
                  text: 'ID',
                  dataIndex: 'PortfolioItemFormattedID',
                  width: 60,
                  sortable: true,
                  renderer: function(portfolioItemFormattedID, meta, teamCommitsRecord) {
                      var portfolioItem = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID);
                      if (teamCommitsRecord.data.Expected) meta.tdCls += ' manager-expected-cell';
                      if (portfolioItem.data.Project) {
                          return '<a href="' + me.BaseUrl + '/#/' + portfolioItem.data.Project.ObjectID +
                              'd/detail/portfolioitem/' + me.PortfolioItemTypes[0] + '/' +
                              portfolioItem.data.ObjectID + '" target="_blank">' + portfolioItemFormattedID + '</a>';
                      }
                      else return portfolioItemFormattedID;
                  }
              }, {
                  text: me.PortfolioItemTypes[0],
                  dataIndex: 'PortfolioItemName',
                  flex: 1,
                  items: [{
                      xtype: 'intelgridcolumntextareafilter',
                      style: {
                          marginRight: '10px'
                      }
                  }]
              }, {
                  dataIndex: 'TeamCommitmentItems',
                  text: 'Commitment',
                  xtype: 'intelcomponentcolumn',
                  html: '<div class="predecessor-items-grid-header" style="width:10px !important;"></div>' +
                  '<div class="predecessor-items-grid-header" style="width:110px !important;">Team Name</div>' +
                  '<div class="predecessor-items-grid-header" style="width:95px  !important;">Team Comment</div>' +
                  '<div class="predecessor-items-grid-header" style="width:70px  !important;">CE Comment</div>',
                  // '<div class="predecessor-items-grid-header" style="width:130px !important;">User Story</div>',
                  width: 420,
                  renderer: function(portfolioItemFormattedID, meta, teamCommitsRecord) {
                      var portfolioItem = me.PortfolioItemStore.findExactRecord('FormattedID', portfolioItemFormattedID);
                      var commitments;
                      if (teamCommitsRecord.data.Commitment) {
                          commitments = teamCommitsRecord.data.Commitment;
                      }
                      var commit = teamCommitsRecord.data.TeamCommitmentItems;
                      _.each(commit, function(item) {
                          var name = item.TeamName;
                          var commitment = item.Commitment;
                          // var featurestatus = commit[projId].FeatureStatus;
                          var objective = item.Objective;
                          var cecomment = item.cecomment;

                          if (commitment == 'Not Committed') {
                              //add to array
                              teamCmtsArry.commitment = item.Commitment;
                              teamCmtsArry.featurestatus = item.FeatureStatus;

                          }
                          var teamCommitsItem = me.newCommitmentItem(name, commitment, objective, cecommnet);
                          var model = Ext.create('InteTeamCommitsItem', {
                              TeamName: name,
                              Objective: teamComment,
                              CEComment: cecomment,
                              Edited: true
                          });
                          me.TeamCommitsGrid.store.insert(0, [model]);
                          me.TeamCommitsGrid.store.fireEvent('refresh', me.TeamCommitsGrid.store);
                          // 				_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', me.PredecessorGrid), 'clearFilters');
                          // 				me.PredecessorGrid.store.insert(0, [model]);	
                          // 				me.PredecessorGrid.view.getEl().setScrollTop(0);
                          // 				me.PredecessorGrid.store.fireEvent('refresh', me.PredecessorGrid.store);

                          // //
                          // 					var swallowEventHandler = {
                          // 						element: 'el',
                          // 						fn: function(a){ a.stopPropagation(); }
                          // 					};



                          //only add it if not committed or feature help needed


                          var commitItemColumnCfgs = [{
                              dataIndex: 'TeamName',
                              width: 115,
                              renderer: function(val, meta) {
                                  // var projectRecord = me.ProjectsWithTeamMembers[val];
                                  // if(val && projectRecord) return projectRecord.data.Name;
                                  // else return '-';
                                  return name;
                              }
                          }, {
                                  dataIndex: 'TeamComment',
                                  width: 80,
                                  renderer: function(val, meta) {
                                      // 
                                      return objective;
                                  }
                              }, {
                                  dataIndex: 'CEComment',
                                  width: 75,
                                  renderer: function(userStoryObjectID, meta, predecessorItemRecord) {
                                      // if(predecessorItemRecord.data.Assigned){
                                      // 	var userStory = me.DependenciesHydratedUserStories[userStoryObjectID];
                                      // 	if(userStory) return userStory.data.FormattedID;
                                      // 	else return '?';
                                      // }
                                      // else return '-';
                                      return cecomment;
                                  }
                              }];

                          return {
                              xtype: 'grid',
                              cls: 'team-report-grid team commit-items-grid rally-grid',
                              viewConfig: { stripeRows: false },
                              width: 420,
                              manageHeight: false,
                              columns: {
                                  defaults: COLUMN_DEFAULTS,
                                  items: commitItemColumnCfgs
                              },
                              listeners: {
                                  mousedown: swallowEventHandler,
                                  mousemove: swallowEventHandler,
                                  mouseout: swallowEventHandler,
                                  mouseover: swallowEventHandler,
                                  mouseup: swallowEventHandler,
                                  mousewheel: swallowEventHandler,
                                  scroll: swallowEventHandler,
                                  click: swallowEventHandler,
                                  dblclick: swallowEventHandler,
                                  contextmenu: swallowEventHandler,
                                  selectionchange: function() { this.getSelectionModel().deselectAll(); }
                              },
                              rowLines: false,
                              disableSelection: true,
                              scroll: false,
                              hideHeaders: true,
                              showRowActionsColumn: false,
                              showPagingToolbar: false,
                              enableEditing: false,
                              store: Ext.create('Rally.data.custom.Store', { data: teamCommitsItem })
                          };
                      });
                  }
              }];
 });
          me.TeamCommitsGrid = me.down('#tcVelBoxLeft').add({
              xtype: 'grid',
              cls: 'team-report-grid team-commits-grid rally-grid',
              header: {
                  layout: 'hbox',
                  items: [{
                      xtype: 'text',
                      cls: 'team-report-grid-header-text',
                      width: 200,
                      text: "TEAM COMMITS"
                  }, {
                          xtype: 'container',
                          flex: 1000,
                          layout: {
                              type: 'hbox',
                              pack: 'end'
                          },

                      }]
              },
              height: 410,
              scroll: 'vertical',
              columns: {
                  defaults: COLUMN_DEFAULTS,
                  items: teamCommitsColumns
              },
              disableSelection: true,
              plugins: ['intelcellediting'],
              viewConfig: {
                  xtype: 'inteltableview',
                  stripeRows: true,
                  preserveScrollOnRefresh: true,
                  getRowClass: function(teamCommitsRecord) {
                      var val = teamCommitsRecord.data.Commitment || 'Undecided',
                          outputClasses = '';
                      if (val == 'N/A') return outputClasses + ' team-commits-grey-row ';
                      else if (val == 'Committed') return outputClasses + ' team-commits-green-row ';
                      else if (val == 'Not Committed') return outputClasses + ' team-commits-red-row ';
                      else return outputClasses;
                  }
              },
              listeners: {
                  headerclick: function(ct, column, e, t, eOpts) {
                      if (column.text.indexOf("selectall_features") === -1) return;
                      var selectAll = $('#selectall_features').prop('checked') ? true : false;
                      /*regex for filtered data The RegExp differs according to the way way the grid is created*/
                      _.each(me.TeamCommitsGrid.view.body.dom.innerHTML.match(/<tr id="inteltableview.*?<\/tr>/gm), function(line) {
                          if (line.match(/<tr .*?grid-column-filter-hide-.*?>.*?<\/tr>/gm) === null) {
                              _.each(line.match((/<input .*?x-row-checkbox.*?>/gm)), function(checkboxElement) {
                                  var idToBeChecked = "#" + $(checkboxElement).attr('id');
                                  $(idToBeChecked).prop('checked', selectAll);
                              });
                          }
                      });
                  },
                  beforeedit: function() { me.isEditingTeamCommits = true; },
                  canceledit: function() { me.isEditingTeamCommits = false; },
                  edit: function(editor, e) {
                      var grid = e.grid, teamCommitsRecord = e.record,
                          field = e.field, value = e.value, originalValue = e.originalValue;
                      if (value === originalValue) {
                          me.isEditingTeamCommits = false;
                          return;
                      }
                      else if (field != 'Objective' && !value) {
                          teamCommitsRecord.set(field, originalValue);
                          me.isEditingTeamCommits = false;
                          return;
                      }
                      else if (field === 'Objective') {
                          value = me.htmlEscape(value);
                          teamCommitsRecord.set(field, value);
                      }
                      var tc = {
                          Commitment: teamCommitsRecord.data.Commitment,
                          Objective: teamCommitsRecord.data.Objective
                      };
                      me.TeamCommitsGrid.setLoading("Saving");
                      me.enqueue(function(unlockFunc) {
                          me.loadPortfolioItemByOrdinal(teamCommitsRecord.data.PortfolioItemObjectID, 0).then(function(realPortfolioItem) {
                              if (realPortfolioItem) return me.setTeamCommit(realPortfolioItem, tc);
                          })
                              .fail(function(reason) { me.alert('ERROR', reason); })
                              .then(function() {
                                  unlockFunc();
                                  me.TeamCommitsGrid.setLoading(false);
                                  me.isEditingTeamCommits = false;
                              })
                              .done();
                      }, 'Queue-Main');
                  }
              },
              showRowActionsColumn: false,
              showPagingToolbar: false,
              enableEditing: false,
              store: teamCommitsStore
          });	
		},		
        
      
	});
}());
