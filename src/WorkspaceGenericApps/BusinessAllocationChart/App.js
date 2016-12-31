/** this app shows the cumulative flow charts for a scrum-group, and the scrums in it
	it is scoped to a specific release (and optionally) top portfolioItem
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.BusinessAllocationCharts', { 
		extend: 'Intel.lib.IntelRallyApp',
		cls:'app',
		requires:[
			'Intel.lib.chart.FastCumulativeFlowCalculator'
		],
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.CumulativeFlowChartMixin',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',          
			'Intel.lib.mixin.Caching',
			'Intel.lib.mixin.CfdProjectPreference'
		],
		minWidth:910,
		items:[{
			xtype:'container',
			layout:'hbox',
			items:[{
				xtype:'container',
				id: 'cacheButtonsContainer'
               
			},{
				xtype:'container',
				id: 'cacheMessageContainer',
				cls:'cachemessagecontainer'		
			}]
			},{
			xtype:'container',
			id:'navBar',
			layout:'hbox',
        //     style: {
        //     padding: '20px'
        // },
			align: 'left',
			width: '900px',
            margin: '10 0 0 0'            //height: '100px'
		},
        {
			xtype:'container',
			id:'acceptContainer',
			layout:'hbox',
			align: 'left',
			width: '1800px',
            height: '100px'
		},
        {
			xtype:'container',
			width:'100%',
			layout:{
				type:'hbox',
				pack:'center'
			},
			items:[{
				xtype:'container',
				width:'66%',
				id:'aggregateChart'
			}]
		},{
			xtype:'container',
			id:'scrumCharts',
			layout:'column',
			width:'100%'
		}],
		/**___________________________________ APP SETTINGS ___________________________________*/	
		getSettingsFields: function() {
			return [{name: 'cacheUrl',xtype: 'rallytextfield'}];
		},	
		config: {
			defaultSettings: {
				cacheUrl:'https://mdoproceffrpt/api/v1.0/custom/rally-app-cache/'
			}
		},
		userAppsPref: 'intel-BusinessAlloc-Chart',
		cfdProjPref: 'intel-workspace-admin-bachart-releasedatechange',
		/****************************************************** DATA STORE METHODS ********************************************************/
        loadPortfolioItems: function() {
            var me = this;

            me.LowestPortfolioItemsHash = {};
            me.PortfolioItemMap = {}; //map of lowestPortfolioItem -> its upper-most portfolioItem
            me.TopPortfolioItemNames = [];
            me.CurrentTopPortfolioItemName = null;
            me.portfolioAllTeamsArry = [];
            me.teamBoArry = [];
            me.teamLevelChartData = [];
            return Q.all(_.map(me.PortfolioItemTypes, function(type) {
                //NOTE: we are loading ALL lowestPortfolioItems b/c sometimes we run into issues where
                //userstories in one release are under portfolioItems in another release (probably a user
                // mistake). And this messes up the numbers in the topPortfolioItem filter box
                return me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type);
            }))
                .then(function(portfolioItemStores) {
                    me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);
                    me.LowestPortfolioItemRecords = portfolioItemStores[0].getRange();
                    me.TopPortfolioItemRecords = portfolioItemStores.slice(-1)[0].getRange();
                    me.TopPortfolioItemNames = _.sortBy(_.map(_.union(_.values(me.PortfolioItemMap)),
                        function(name) { return { Name: name }; }),
                        function(name) { return name.Name; });
                    me.LowestPortfolioItemsHash = _.reduce(portfolioItemStores[0].getRange(), function(hash, r) {
                        hash[r.data.ObjectID] = (r.data.Release || {}).Name || 'No Release';
                        return hash;
                    }, {});
                });

        },
		loadAllChildReleases: function(){ 
			var me = this, releaseName = me.ReleaseRecord.data.Name;			
			return me.loadReleasesByNameUnderProject(releaseName, me.ScrumGroupRootRecord)
				.then(function(releaseRecords){
					me.ReleasesWithNameHash = _.reduce(releaseRecords, function(hash, rr){
						hash[rr.data.ObjectID] = true;
						return hash;
					}, {});
				});
		},
		
		/******************************************************* Reloading ********************************************************/			
		hideHighchartsLinks: function(){ 
			$('.highcharts-container > svg > text:last-child').hide(); 
		},	
        
      
        /**
			Fixes the stories so that the sync request pulls the correct data.
			When Rally syncs edited data, the returned object uses the top level
			keys from the raw section of the model.
		*/
		fixRawUserStoryAttributes: function() {
			var me = this,
				stories = me.UserStoryStore.getRange();
			for (var i in stories) {
				for (var j in me.UserStoryFetchFields) {
					if (!stories[i].raw[me.UserStoryFetchFields[j]]) stories[i].raw[me.UserStoryFetchFields[j]] = 0;
				}
			}
		},
		
        /**
			Creates a filter for stories that:
				Belong to one of the projects
					AND
				Are in an during the release but not the release OR in the release
		*/
        
        createAcceptedStoryFilter: function(leafProjects)
        {
            	var me = this,	
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
                acceptedStartDate =me.acceptedStartDt? new Date(me.acceptedStartDt).toISOString():null,
				acceptedEndDate = me.acceptedEndDt? new Date(me.acceptedEndDt).toISOString():null,
                pid = me.ProjectRecord.data.ObjectID;
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
                acceptedStoriesFilter= 	Ext.create('Rally.data.wsapi.Filter', { property: 'AcceptedDate', operator: '!=', value: null }),
                directChildrenCountFilter= Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
               // acceptedStartDateFilter= 	Ext.create('Rally.data.wsapi.Filter', { property: 'AcceptedDate', operator: '>', value: acceptedStartDate }),
              //  acceptedEndDateFilter= 	Ext.create('Rally.data.wsapi.Filter', { property: 'AcceptedDate', operator: '<', value: acceptedEndDate }),
				leafStoriesInIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', operator: '=', value: null })).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }))),
				projectFilter = _.reduce(leafProjects, function(filter, leafProject){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.ObjectID', value:leafProject.data.ObjectID});
					return filter ? filter.or(newFilter) : newFilter;
				}, null);
                return projectFilter.and(releaseNameFilter).and(directChildrenCountFilter).and(acceptedStoriesFilter);
        },
        createStoryFilter: function(leafProjects) {			//NOTE: we are filtering for leaf stories here
            var me = this,
                releaseName = me.ReleaseRecord.data.Name,
                releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
                releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
                acceptedStartDate = me.acceptedStartDt ? new Date(me.acceptedStartDt).toISOString() : null,
                acceptedEndDate = me.acceptedEndDt ? new Date(me.acceptedEndDt).toISOString() : null,

                releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
                acceptedStoriesFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'AcceptedDate', operator: '!=', value: null }),
                acceptedStartDateFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'AcceptedDate', operator: '>', value: acceptedStartDate }),
                acceptedEndDateFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'AcceptedDate', operator: '<', value: acceptedEndDate }),
                directChildrenCountFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
                leafStoriesInIterationButNotReleaseFilter =
                    Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator: '<', value: releaseDate }).and(
                        Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator: '>', value: releaseStartDate })).and(
                        Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', operator: '=', value: null })).and(
                        Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName }).and(
                            Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }))),
                projectFilter = _.reduce(leafProjects, function(filter, leafProject) {
                    var newFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: leafProject.data.ObjectID });
                    return filter ? filter.or(newFilter) : newFilter;
                }, null);
            return projectFilter.and(releaseNameFilter).and(directChildrenCountFilter);
		},
        /**
			Loads userstories under leafProjects in chunks of projects isScopedToScrumat a time. we batch projects to reduce requests sent
		*/
        loadUserStories: function() {
            var me = this,
                lowestPortfolioItem = me.PortfolioItemTypes[0];

            me.UserStoryFetchFields = ['Name', 'ObjectID', 'Project', 'Owner', 'PlannedEndDate', 'ActualEndDate',
                'AcceptedDate', 'StartDate', 'EndDate', 'Iteration[StartDate;EndDate]', 'DirectChildrenCount', 'Parent',
                'Release', 'ReleaseStartDate', 'ReleaseDate', 'PlanEstimate', 'FormattedID', 'ScheduleState',
                'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', 'Description', lowestPortfolioItem];
            if (!me.ScrumGroupRootRecord.length) filteredProjects = [me.ProjectRecord];
            else {

                filteredProjects = me.LeafProjectsByScrumGroup[me.ScrumGroupRootRecord.data.ObjectID] || [];
            }
            me.FilteredLeafProjects = filteredProjects;
            pid = me.ProjectRecord.data.ObjectID;
            if (typeof me.cfdProjReleasePref.releases[pid] !== 'object') me.cfdProjReleasePref.releases[pid] = {};

            // if( me.AppsPref)
            //  {
            //     me.OnlyAcceptedStories =  me.AppsPref.projs[pid].OnlyAcceptedStories;
            //     startdate=new Date(me.AppsPref.projs[pid].AcceptedStartDate);
            //     enddate=new Date(me.AppsPref.projs[pid].AcceptedEndDate);

            //  }

            if (!me.FilteredLeafProjects) throw "No leaf projects for userstory filter";
            return Q.all(_.map(_.chunk(me.LeafProjects, 20), function(leafProjects) {

                if (me.OnlyAcceptedStories) {
                    return me.parallelLoadWsapiStore({
                        model: me.UserStory,
                        enablePostGet: true,
                        autoLoad: false,
                        filters: [me.createAcceptedStoryFilter(leafProjects)],
                        fetch: me.UserStoryFetchFields,
                        context: {
                            workspace: me.getContext().getWorkspace()._ref,
                            project: null
                        },
                        pageSize: 200
                    });
                }
                else {
                    return me.parallelLoadWsapiStore({
                        model: me.UserStory,
                        enablePostGet: true,
                        autoLoad: false,
                        filters: [me.createStoryFilter(leafProjects)],
                        fetch: me.UserStoryFetchFields,
                        context: {
                            workspace: me.getContext().getWorkspace()._ref,
                            project: null
                        },
                        pageSize: 200
                    });
                }
            }))
                .then(function(stores) {
                    me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
                        autoLoad: false,
                        model: 'HierarchicalRequirement',
                        pageSize: 200,
                        data: [].concat.apply([], _.invoke(stores, 'getRange'))
                    });

                    //WsapiUserStoryMap 
                    me.TeamStores = _.reduce(me.UserStoryStore.getRange(), function(hash, r, key) {
                        var teamName = r.data.Project.Name;
                        hash[r.data.Project.Name] = _.filter(me.UserStoryStore.getRange(), function(f) { return f.data.Project.Name === teamName; });
                        return hash;
                    }, {});

                    me.fixRawUserStoryAttributes();
                });
		},
        PopulateTeamArry: function() {
            var me = this,
                sum = 0,
                noBoSum = 0,
                teamSumofAllB0 = 0,
                teamSumofAllNoBO = 0,
                teamLevelPortFolioItemArry = [],
                teamChartArry = [];
            var lowestPortfolioItem = me.PortfolioItemTypes[0];

            _.each(me.TeamStores, function(records, teamName) {
                teamSumofAllB0 = 0;
                teamSumofAllNoBO = 0;
                _.forOwn(me.TopPortfolioItemNames, function(portFolioItemName) {
                    sum = 0;
                    noBoSum = 0;
                    _.forOwn(records, function(record) {
                        if (me.PortfolioItemMap[record.raw[lowestPortfolioItem].ObjectID] === portFolioItemName.Name) {
                            sum = sum + record.data.PlanEstimate;
                        }
                        //Not attached to any feature
                        if (record.raw[lowestPortfolioItem] === 0) {
                            noBoSum = noBoSum + record.data.PlanEstimate;
                            console.log("TeamName", teamName, "planesstimate ", record.data.PlanEstimate, "nobosum=", noBoSum);
                        }
                    });
                    teamSumofAllB0 = teamSumofAllB0 + sum;
                    teamSumofAllNoBO = teamSumofAllNoBO + noBoSum;
                    //sum of all planestimate and "not attached to plan estimate" per team     
                    if (sum > 0) {
                        teamLevelPortFolioItemArry.push({ Name: portFolioItemName.Name, BoPlanEstimate: sum, NoBOPlanEstimate: noBoSum });
                        teamChartArry.push({ PortFolios: portFolioItemName.Name, y: sum });
                    }
                });
                if (noBoSum > 0) {
                    teamChartArry.push({ PortFolios: "Not attached to BO", y: noBoSum });
                }
                //contains for each team array of business objectives and grand sum of all total of storypoints (planestimate) teamSumofAllB0, TotalNoBOPlanEsitmate: noBoSum });
                me.teamBoArry.push({ Name: teamLevelPortFolioItemArry, Portfolios: teamChartArry, Team: teamName, TotalPlanEstimate: teamSumofAllB0, TotalNoBOPlanEsitmate: noBoSum });
                teamLevelPortFolioItemArry = [];
                teamChartArry = [];
                noBoSum = 0;
            });
        },
       GetColors: function() {
               var me = this,  
               i=1;
              getColor= ['#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9', 
                        '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1'];      

              var getColorArry={};        
             _.forOwn(me.TopPortfolioItemNames,function(portFolioName){
                 var index= i % getColor.length;
                 getColorArry[ portFolioName.Name] = getColor[index];                
                 i++;               
                 
             });
              getColorArry[ "Not attached to BO"] = "#91e8e1";  
              return getColorArry;
       },
        GetChartData: function() {
            var me = this,           
            totalStoryPlanEstimate = 0;
            sum = 0,           
            teamLevelPortFolioItemArry = [],
            getColorArry=me.GetColors();   
               
            if (me.teamBoArry.length === 0) {                
                me.PopulateTeamArry();     
            }
            //For the chart get the percent teamlevel
            teamLevelPortFolioItemArry = [];
            if (me.teamLevelChartData.length === 0) {
                _.forOwn(me.teamBoArry, function(teamArry) {                  
                    teamLevelPortFolioItemArry = [];
                    TotalPlanEstimateTeamLevel = 0;
                    TotalPlanEstimateTeamLevel = teamArry.TotalPlanEstimate + teamArry.TotalNoBOPlanEsitmate;
                    _.forOwn(teamArry.Portfolios, function(portfolio) {
                       
                        //console.log("teamname", teamArry.Team,"Name: ", portfolio.PortFolios,"y", portfolio.y,"totalplaneestimate ", teamArry.TotalPlanEstimate,"TotsBOEStimate",teamArry.TotalNoBOPlanEsitmate,"grandtots",TotalPlanEstimateTeamLevel)
                        percent = (portfolio.y / TotalPlanEstimateTeamLevel) * 100;
                        if (percent > 0) {
                            console.log("TeamName", teamArry.Team,"Portfolio name", portfolio.PortFolios,"y",portfolio.y,"Total", TotalPlanEstimateTeamLevel);
                            teamLevelPortFolioItemArry.push({ name: portfolio.PortFolios, y: Math.round(percent), id:portfolio.y+"/"+TotalPlanEstimateTeamLevel, color: getColorArry[portfolio.PortFolios] });
                        }
                    });
                    me.teamLevelChartData.push({ Name: teamArry.Team, Portfolios: teamLevelPortFolioItemArry });
                });
            }  
            var noBoEstimate = 0,
            BoEstimate = 0;
            me.portfolioAllTeamsArry = [];
            sum = 0;
            //Get Train level
            _.forOwn(me.TopPortfolioItemNames, function(portfolioName) {
                sum = 0;
                me.totalStoryPlanEstimate = 0;
                BoEstimate = 0;
                noBoEstimate = 0;
                total=0;
                _.forOwn(me.teamBoArry, function(teamArry) {               
                    noBoEstimate = noBoEstimate + teamArry.TotalNoBOPlanEsitmate;
                    BoEstimate = BoEstimate + teamArry.TotalPlanEstimate;
                    _.forOwn(teamArry.Portfolios, function(portfolioItem) {
                        if (portfolioItem.PortFolios === portfolioName.Name) {
                            sum = sum + portfolioItem.y;
                        }
                    });
                });
                me.totalStoryPlanEstimate = noBoEstimate + BoEstimate;
                //console.log("Alltrain", "***portfolio name", portfolioName.Name," totalplanstimate= ",sum,"Total", me.totalStoryPlanEstimate);
                console.log("Alltrain", "***portfolio name", portfolioName.Name," totalplanstimate= ",sum,"Total", me.totalStoryPlanEstimate);
                velocityPercent = sum > 0 ? (sum / me.totalStoryPlanEstimate) * 100 : 0; 
                var stringval =  sum +"/"+ me.totalStoryPlanEstimate
                if (velocityPercent > 0) {
                    //me.portfolioAllTeamsArry.push({ name: portfolioName.Name, y: velocityPercent, color: getColorArry[portfolioName.Name]});
                    me.portfolioAllTeamsArry.push({ name: portfolioName.Name, y: velocityPercent, id: stringval, color: getColorArry[portfolioName.Name]});
                }
            });
            noBoEstimatePercent = (noBoEstimate / me.totalStoryPlanEstimate) * 100;
            if (noBoEstimatePercent > 0) {
                stringval= noBoEstimate+"/"+ me.totalStoryPlanEstimate;
                 console.log("Alltrain", "portfolio name", "Not attached to BO"," Noplanstimate= ",noBoEstimate,"Total", me.totalStoryPlanEstimate);
                me.portfolioAllTeamsArry.push({ name: "Not attached to BO", y: noBoEstimatePercent, id: stringval, color: getColorArry["Not attached to BO"] });
            }
        },
        
		redrawEverything: function(){
            var me = this;
            me.setLoading('Loading Charts');
            me.GetChartData();
            $('#scrumCharts-innerCt').empty();
            //if(!me.DeleteCacheButton) me.renderDeleteCache();
            if (!me.UpdateCacheButton) me.renderUpdateCache();
            if (!me.ReleasePicker) me.renderReleasePicker();
            me.renderAcceptedStoriesCheckbox();

            me.renderCharts();
            me.hideHighchartsLinks();
            me.setLoading(false);
		},
        redrawChartAfterReleaseDateChanged: function() {
            var me = this;
            me.setLoading('Loading Charts');
            $('#scrumCharts-innerCt').empty();
            me.renderCharts();
            me.hideHighchartsLinks();
            me.setLoading(false);
        },
        redrawChartAfterAcceptedDateChanged: function() {
            var me = this;
            me.reloadEverything();
          //  me.setLoading('Loading Charts');
         //   $('#scrumCharts-innerCt').empty();
          //  me.renderCharts();
         //   me.hideHighchartsLinks();
         //   me.setLoading(false);
        },
		reloadEverything:function(){ 
			var me=this;
			me.setLoading('Loading Data');	
			return me.loadAllChildReleases()		
                .then(function(){ return me.loadPortfolioItems(); })	
                .then(function(){ return me.loadUserStories();})		
				.then(function(){ return me.redrawEverything(); });
		},
		/**************************************** Loading Config Items ***********************************/		
		/**
			load releases for current scoped project and set the me.ReleaseRecord appropriately.
		*/
		createDummyProjectRecord: function(dataObject) {
			return { data: dataObject };
		},
		loadReleases: function() {
			var me = this,
				twelveWeeksAgo = new Date(new Date()*1 - 12*7*24*60*60*1000),
				projectRecord = me.createDummyProjectRecord(me.getContext().getProject());
			
			return me.loadReleasesAfterGivenDate(projectRecord, twelveWeeksAgo).then(function(releaseRecords){
				me.ReleaseRecords = releaseRecords;
				
				// Set the current release to the release we're in or the closest release to the date
				// Important! This sets the current release to an overridden value if necessary
				me.ReleaseRecord = (me.isStandalone ? 
					_.find(me.ReleaseRecords, function(release){ return release.data.Name === me.Overrides.ReleaseName; }) : 
					false) || 
					me.getScopedRelease(me.ReleaseRecords, null, null);
			});
		},			
        /**
			Load all scrumGroups in horizontal mode, regardless of project scoping. Load scrum group in 
			vertical mode ONLY if we are scoped to a scrumGroupRootRecord
		*/
        loadScrumGroups: function() {
            var me = this;
            me.ScrumGroupRootRecords = [];
            me.ScrumGroupPortfolioOIDs = [];

            if (me.isHorizontalView) {
                for (var i = 0; i < me.ScrumGroupConfig.length; i++) {
                    if (me.ScrumGroupConfig[i].IsTrain) { //only load train scrumGroups in horizontal view
                        var dummyScrumGroupRootRecord = me.createDummyProjectRecord({ ObjectID: me.ScrumGroupConfig[i].ScrumGroupRootProjectOID });
                        me.ScrumGroupRootRecords.push(dummyScrumGroupRootRecord);
                        me.ScrumGroupPortfolioOIDs.push(me.getPortfolioOIDForScrumGroupRootProjectRecord(dummyScrumGroupRootRecord));
                    }
                }
            }
            else {
                return me.loadProject(me.ProjectRecord.data.ObjectID)
                    .then(function(projectRecord) { return me.projectInWhichScrumGroup(projectRecord); })
                    .then(function(scrumGroupRootRecord) {
                        if (scrumGroupRootRecord) {
                            if (scrumGroupRootRecord.data.ObjectID === me.ProjectRecord.data.ObjectID) { //if scoped to a scrumGroupRootRecord
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
				return me.loadAllLeafProjects(scrumGroupRootRecord).then(function(leafProjects){
					me.LeafProjects = me.LeafProjects.concat(_.values(leafProjects));
					me.LeafProjectsByScrumGroup[scrumGroupRootRecord.data.ObjectID] = _.values(leafProjects);	
				});
			}));
		},
        
        
        loadConfiguration: function() {
            var me = this;
            return Q.all([
                me.configureIntelRallyApp().then(function() {
                    var scopeProject = me.getContext().getProject();
                    return me.loadProject(scopeProject.ObjectID);
                })
                    .then(function(scopeProjectRecord) {
                        me.ProjectRecord = scopeProjectRecord;
                    }),
                me.loadAppsPreference().then(function(appsPref) {
                    me.AppsPref = appsPref;
                })
            ])
                .then(function() {
                    return Q.all([ //parallel loads
                        me.projectInWhichScrumGroup(me.ProjectRecord) /******** load stream 1 *****/
                            .then(function(scrumGroupRootRecord) {
                                if (scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID) {
                                    me.ScrumGroupRootRecord = scrumGroupRootRecord;
                                    return me.loadScrumGroupPortfolioProject(scrumGroupRootRecord);
                                }
                                else return Q.reject('You are not scoped to a valid project.');
                            })
                            .then(function(scrumGroupPortfolioProject) {
                                me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
                                return me.loadAllLeafProjects(me.ScrumGroupRootRecord);
                            })
                            .then(function(scrums) {
                                me.LeafProjects = _.filter(scrums, function(s) { return s.data.TeamMembers.Count > 0; });
                            })
                        // .then(function(){ return me.loadScrumGroups(); })
                        // .then(function(){ return me.loadProjects(); })
                    ]);
                });
		},
		
		/******************************************************* Caching Mixin operations ********************************************************/
		getCacheUrlSetting: function(){
			var me = this;
			return me.getSetting('cacheUrl');
		},		
        getCachePayloadFn: function(payload) {
            var me = this;
            me.ProjectRecord = payload.ProjectRecord;
            me.ScrumGroupRootRecord = payload.ProjectRecord;
            me.ScrumGroupPortfolioProject = payload.ScrumGroupPortfolioProject;
            me.LeafProjects = payload.LeafProjects;
            me.ReleaseRecord = payload.ReleaseRecord;
            me.ReleaseRecords = payload.ReleaseRecords;
            me.ReleasesWithNameHash = payload.ReleasesWithNameHash;
            me.OnlyAcceptedStories = payload.OnlyAcceptedStories;
            me.LowestPortfolioItemsHash = payload.LowestPortfolioItemsHash;
            me.PortfolioItemMap = payload.PortfolioItemMap;
            me.TopPortfolioItemNames = payload.TopPortfolioItemNames;
            me.CurrentTopPortfolioItemName = null;
            me.AllSnapshots = payload.AllSnapshots;
            me.TeamStores = payload.TeamStores;

            me.teamLevelChartData = payload.teamLevelChartData;
            me.teamBoArry = payload.teamBoArry;
            me.portfolioAllTeamsArry = payload.portfolioAllTeamsArry;

		},
        setCachePayLoadFn: function(payload) {
            var me = this;

            payload.ProjectRecord = { data: me.ProjectRecord.data };
            payload.ScrumGroupRootRecord = { data: me.ScrumGroupRootRecord.data };
            payload.ScrumGroupPortfolioProject = { data: me.ScrumGroupPortfolioProject.data };
            payload.LeafProjects = _.map(me.LeafProjects, function(lp) { return { data: lp.data }; });
            payload.ReleaseRecords = _.map(me.ReleaseRecords, function(rr) { return { data: rr.data }; });
            payload.ReleaseRecord = { data: me.ReleaseRecord.data };
            payload.ReleasesWithNameHash = me.ReleasesWithNameHash;
            payload.OnlyAcceptedStories = me.OnlyAcceptedStories;

            payload.LowestPortfolioItemsHash = me.LowestPortfolioItemsHash;
            payload.PortfolioItemMap = me.PortfolioItemMap;
            payload.TopPortfolioItemNames = me.TopPortfolioItemNames;
            payload.AllSnapshots = _.map(me.AllSnapshots, function(ss) { return { raw: ss.raw }; });
            payload.TeamStores = _.reduce(me.TeamStores, function(map, sss, key) {
                map[key] = _.map(sss, function(ss) { return { raw: ss.raw }; });
                return map;
            }, {});
            payload.teamLevelChartData = me.teamLevelChartData;
            payload.teamBoArry = me.teamBoArry;
            payload.portfolioAllTeamsArry = me.portfolioAllTeamsArry;
		},
        cacheKeyGenerator: function() {
            var me = this;
            var projectOID = me.getContext().getProject().ObjectID;
            var releaseOID = me.ReleaseRecord.data.ObjectID;
            var hasKey = typeof (releaseOID) === 'number';
            if (hasKey) {
                return 'business-alloc-report-' + projectOID + '-' + releaseOID;
            }
            else return undefined; //no release set
		},
		getCacheTimeoutDate: function(){
			return new Date(new Date()*1 + 1000*60*60);
		},
		renderCacheMessage: function() {
			var me = this;
			Ext.getCmp('cacheMessageContainer').add({
				xtype: 'label',
				width:'100%',                
				html: 'You are looking at the cached data, updated on: ' + '<span class = "modified-date">' + me.lastCacheModified +  '</span>'
			});
		},			
		/******************************************************* LAUNCH ********************************************************/		
        loadDataFromCacheOrRally: function() {
            var me = this;
            return me.getCache().then(function(cacheHit) {
                if (!cacheHit) {
                    return me.loadConfiguration()
                        .then(function() { return me.reloadEverything(); })
                        .then(function() {
                            //NOTE: not returning promise here, performs in the background!
                            Q.all([
                                //me.saveAppsPreference(me.AppsPref),
                                me.updateCache()
                            ])
                                .fail(function(e) {
                                    alert(e);
                                    console.log(e);
                                });
                        });
                } else {
                    me.renderCacheMessage();
                    me.renderAcceptedStoriesCheckbox();
                }
            });
		},
		
		launch: function(){
			var me = this;
			// me.initDisableResizeHandle();
			// me.initFixRallyDashboard();
			me.setLoading('Loading Configuration');
			return Q.all([me.loadReleases()])	
			.then(function(){ 
				return me.loadCfdProjPreference()
					.then(function(cfdprojPref){
						me.cfdProjReleasePref = cfdprojPref;});
			})
            .then(function(){ 
				return me.loadAppsPreference()
					.then(function(appPref){
						me.AppsPref = appPref;});
			})        
                            	
			.then(function(){ return me.loadDataFromCacheOrRally(); })
			.then(function(){ return me.redrawEverything(); })
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();
		},
		
		/*************************************************** RENDERING NavBar **************************************************/
		// renderDeleteCache: function(){
			// var me=this;
			// me.DeleteCacheButton = Ext.getCmp('cacheButtonsContainer').add({
				// xtype:'button',
				// text: 'Clear Cached Data',
				// listeners: { 
					// click: function(){
						// me.setLoading('Clearing cache, please wait');
						// return me.deleteCache()
							// .then(function(){ me.setLoading(false); });
					// }
				// }
			// });
		// },
        renderUpdateCache: function() {
            var me = this;
            Ext.getCmp('cacheButtonsContainer').removeAll();
            me.UpdateCacheButton = Ext.getCmp('cacheButtonsContainer').add({
                xtype: 'button',
                text: 'Get Live Data',
                listeners: {
                    click: function() {
                        me.setLoading('Pulling Live Data, please wait');
                        Ext.getCmp('cacheMessageContainer').removeAll();
                        return me.loadConfiguration()
                            .then(function() { return me.reloadEverything(); })
                            .then(function() { return me.updateCache(); })
                            .then(function() { me.setLoading(false); });
                    }
                }
            });
		},
		releasePickerSelected: function(combo, records){
			var me=this;
			me.setLoading(true);
			Ext.getCmp('cacheMessageContainer').removeAll();
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			/* var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref) */
				//.then(function(){ return me.loadDataFromCacheOrRally(); })//TODO: dont have to load configuration when release picker is selected 
				return me.loadDataFromCacheOrRally()
				.then(function(){ return me.redrawEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = Ext.getCmp('navBar').add({
				xtype:'intelreleasepicker',
				labelWidth: 80,
				width: 240,                
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},
       
       	renderAcceptedStoriesCheckbox: function() {
            var me = this;
            var pid = me.ProjectRecord.data.ObjectID;
            //me.OnlyAcceptedStories = me.AppsPref.projs[pid].OnlyAcceptedStories;
            if (me.AcceptedStoriesCheckbox) me.AcceptedStoriesCheckbox.destroy();
            me.AcceptedStoriesCheckbox = Ext.getCmp('navBar').add({
                xtype: 'rallycheckboxfield',
                labelWidth: 80,
                width: 250, 
                margin:'0 0 0 10',               
                boxLabel: 'Filter by Accepted stories only',
                value: me.OnlyAcceptedStories,
                listeners: {
                    change: {
                        fn: function(checkbox) {
                            me.OnlyAcceptedStories = checkbox.getValue();
                            me.AppsPref.projs[pid].OnlyAcceptedStories = me.OnlyAcceptedStories;
                            me.saveAppsPreference(me.AppsPref);
                            me.renderUpdateCache();
                            me.setLoading('Pulling Live Data, please wait');
                            Ext.getCmp('cacheMessageContainer').removeAll();
                            return me.loadConfiguration()
                                .then(function() { return me.reloadEverything(); })
                                .then(function() { return me.updateCache(); })
                                .then(function() { me.setLoading(false); });
                        }
                    }
                },
                componentCls: 'show-acceptedstories-checkbox',
                id: 'show-acceptedstories-checkbox'
            });
		},
		/*Start: CFD Release Start Date Selection Option Component*/
		_setchangedReleaseStartDate: function(){
			var me = this;
			if(typeof me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name] !== 'object') me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name] = {};
			me.releaseStartDateChanged = _.isEmpty(me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name]) ? false : true;
			if(me.releaseStartDateChanged){
				me.changedReleaseStartDate = me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name].ReleaseStartDate;
			}					
		},		
		_checkToRenderCFDCalendar: function(){
            var me = this;
            me._setchangedReleaseStartDate();
            if (!me.optionSelectReleaseDate && me.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(me.getContext().getWorkspace())) {
                if (Ext.getCmp('releasedatepicker-wrapper')) Ext.getCmp('releasedatepicker-wrapper').destroy();//redrawing everything for new release
                me._renderOptiontoSelectReleaseDate();
            }
		},
        _resetVariableAfterReleasePickerSelected: function() {
            var me = this;
            me.changedReleaseStartDate = undefined;
            me.optionSelectReleaseDate = undefined;
		},	
		_renderOptiontoSelectReleaseDate:function(){
			var me = this;
			me.optionSelectReleaseDate = Ext.getCmp('navBar').add({
				xtype:'intelreleasedatachangepicker',
				labelWidth: 80,
				width: 240,
				ProjectRecord: me.ProjectRecord,
				currentRelease: me.ReleaseRecord,
				cfdProjReleasePref : me.cfdProjReleasePref,
				initialLoad: true,
				listeners: { releaseDateChanged: me._releaseDateChangePickerSelected.bind(me)}
			});	
		},		
		_releaseDateChangePickerSelected: function(date,cfdappPref){
			var me = this;
			me.setLoading(true);
			me.saveCfdProjPreference(cfdappPref)
				.then(function(){ 
					me.changedReleaseStartDate = date;
					me.redrawChartAfterReleaseDateChanged(); 
				})
				.fail(function(reason){ me.alert('ERROR', reason); me.setLoading(false); })
				.then(function(){ me.setLoading(false); })
				.done();
			
		},
        //Accepted start data and date date functionality
        acceptedStartDatePickerSelected: function(combo, records) {
            var me = this;
            me.setLoading(true);
            //Ext.getCmp('cacheMessageContainer').removeAll();
            if (me.ReleaseRecord.data.Name === records[0].data.Name) return;
            me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr) { return rr.data.Name == records[0].data.Name; });
			/* var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref) */
            //.then(function(){ return me.loadDataFromCacheOrRally(); })//TODO: dont have to load configuration when release picker is selected 
            return me.loadDataFromCacheOrRally()
                .then(function() { return me.redrawEverything(); })
                .fail(function(reason) { me.alert('ERROR', reason); })
                .then(function() { me.setLoading(false); })
                .done();
		},
		renderAcceptedStartDatePicker: function(){
			var me=this;
			me.ReleasePicker = Ext.getCmp('navBar').add({
				xtype:'intelacceptedstartdatepicker',
				labelWidth: 80,
				width: 240,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.acceptedStartDatePickerSelected.bind(me) }
			});
		},
        /*Start: CFD Release Start Date Selection Option Component*/
        _setchangedAcceptedStartDate: function() {
            var me = this;
            if (typeof me.cfdProjAcceptedStartPref[me.AcceptedStart.data.Name] !== 'object') me.cfdProjAcceptedStartPref[me.AcceptedStart.data.Name] = {};
            me.acceptedStartDateChanged = _.isEmpty(me.cfdProjAcceptedStartPref[me.AcceptedStart.data.Name]) ? false : true;
            if (me.acceptedStartDateChanged) {
                me.changedAcceptedStartDate = me.cfdProjAcceptedStartPref[me.AcceptedStart.data.Name];
            }
        },
        _checkToRenderCFDCalendarForAcceptedStart: function() {
            var me = this;
            me._setchangedAcceptedStartDate();
            if (!me.optionSelectAcceptedStartDate && me.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(me.getContext().getWorkspace())) {
                if (Ext.getCmp('acceptedstartdatepicker-wrapper')) Ext.getCmp('acceptedstartdatepicker-wrapper').destroy();//redrawing everything for new release
                //me._renderOptiontoSelectAcceptedStartDate();
                me._renderAcceptedStartDateOption();
            }
        },
        _resetVariableAfterAcceptedstartPickerSelected: function() {
            var me = this;
            me.changedAcceptedStartDate = undefined;
            me.optionSelectAcceptedStartDate = undefined;
        },
        /**________________________________________ Render Option to render Calendar and button ________________________________________*/
		_renderAcceptedStartDateOption: function(){
			var me = this;
			Ext.apply(me,{
				xtype:'container',
				id:'releasedatepicker-wrapper',
				width:'390px',
				layout:{
					type:'hbox'
				},
				items:[{
					xtype:'component',
					id:'cntClickForStartDateChange',
					cls:'clickForStartDateChange',
					autoEl: {
						tag: 'a',
						html: 'Please Click here to change the Accepted Start Date'
					},
					listeners   : {
						el : {
							click: {
								element: 'el', //bind to the underlying el property on the panel
								fn: function(){ 
									me._renderCalendarAndButtonForStartDate();
								}
							}
						}
					}
				}]	
			});			
		},
		/**________________________________________ Render Calendar and button ________________________________________*/		
		_renderCalendarAndButtonForStartDate: function(){
			var me = this;
			var datePickerDefaultDate;
            var hide= false;
            hide= me.OnlyAcceptedStories? false:true;
			// var rid = me.currentRelease.data.Name;
			 var pid = me.ProjectRecord.data.ObjectID;			
			// me.fieldLabel = 'Select Release Start Date';
			// me.labelWidth = 140;
            var startdate=new Date();
            var enddate=new Date();
			 if(typeof me.cfdProjReleasePref.releases[pid] !== 'object') me.cfdProjReleasePref.releases[pid] = {};
             
             	if( me.AppsPref.projs[pid])
                 {
                     isAcceptedStories= me.AppsPref.projs[pid].isAcceptedStories;
			        startdate=new Date(me.AppsPref.projs[pid].AcceptedStartDate);
                    enddate=new Date(me.AppsPref.projs[pid].AcceptedEndDate);
                    
                 }
			// me.minValue= new Date(new Date(me.currentRelease.data.ReleaseStartDate)*1 /* + _6days */);
			// me.value = _.isEmpty(me.cfdProjReleasePref.releases[rid]) ? me.minValue: new Date(me.cfdProjReleasePref.releases[rid].ReleaseStartDate) ;
			// me.maxValue = me.currentRelease.data.ReleaseDate > new Date() ? new Date() : me.currentRelease.data.ReleaseDate;
			// me.showToday = false;
			Ext.getCmp('acceptContainer').removeAll();
			Ext.getCmp('acceptContainer').add({
				xtype: 'rallydatefield',
				id:'AcceptedStartDatePicker',
				fieldLabel: 'Select Accepted Start Date',
				labelWidth:140,
                hidden: hide,
				// minValue: me.minValue,
				// maxValue: me.maxValue,
				value: startdate,
				showToday:true
				},{
				xtype: 'rallydatefield',
				id:'AcceptedEndDatePicker',
				fieldLabel: 'Select Accepted End Date',
				labelWidth:140,
                hidden: hide,
				// minValue: me.minValue,
				// maxValue: me.maxValue,
				value: enddate,
				showToday:true
				}, {
				xtype:'button',
				text: 'Update',
				id: "btnUpdateAcceptedStartDate",
                hidden: hide,
				scope: me,
				handler: function() {
					//when the button is click
					//save the date in the app preference
					var dateSelected = Ext.getCmp('AcceptedStartDatePicker').value;
                    var acceptedEndDate = Ext.getCmp('AcceptedEndDatePicker').value;
                    me.acceptedStartDt= dateSelected;
                    me.acceptedEndDt= acceptedEndDate;
                    acceptedStartDate =me.acceptedStartDt? new Date(me.acceptedStartDt).toISOString():null,
				    acceptedEndDate = me.acceptedEndDt? new Date(me.acceptedEndDt).toISOString():null,
                    me.cfdProjAcceptedEndPref= acceptedEndDate;
                    me.cfdProjAcceptedStartPref = dateSelected;
			//		me.cfdProjReleasePref.releases[rid] = me.cfdProjReleasePref.releases[rid] || {};
			//		me.cfdProjReleasePref.releases[rid].ReleaseStartDate = dateSelected; 
                    if(acceptedStartDate)
                    {
					    me.fireEvent('acceptedStartDateChanged',acceptedStartDate,  me.cfdProjAcceptedStartPref);
                       me._acceptedStartDateChangePickerSelected(acceptedStartDate,me.cfdProjAcceptedStartPref);
                    }
                    if(acceptedEndDate)	
                    {
                        me.fireEvent('acceptedEndDateChanged',acceptedEndDate, me.cfdProjAcceptedEndPref);
                        me._acceptedEndDateChangePickerSelected(acceptedEndDate,me.cfdProjAcceptedEndPref);
                    }
                    
				}	
			});			
		},
        //=============
        //accepted start date
        _renderOptiontoSelectAcceptedStartDate:function(){
			var me = this;
			me.optionSelectReleaseDate = Ext.getCmp('navBar').add({
				xtype:'intelacceptedstartdatachangepicker',
				labelWidth: 80,
				width: 240,
				ProjectRecord: me.ProjectRecord,
				currentRelease: me.ReleaseRecord,
				cfdProjAcceptedStartPref : me.cfdProjAcceptedStartPref,
				initialLoad: true,
				listeners: { acceptedStartDateChanged: me._acceptedStartDateChangePickerSelected.bind(me)}
			});	
		},		
        
		_acceptedStartDateChangePickerSelected: function(date,cfdappPref){
			var me = this;
			me.setLoading(true);
             var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].AcceptedStartDate = date;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ 
					me.changedacceptedStartDate = date;
                    me.redrawChartAfterAcceptedDateChanged(); 
				})
				.fail(function(reason){ me.alert('ERROR', reason); me.setLoading(false); })
				.then(function(){ me.setLoading(false); })
				.done();
			
		},
         //Accepted start data and date date functionality
        acceptedEndDatePickerSelected: function(combo, records){
			var me=this;
			me.setLoading(true);
		//	Ext.getCmp('cacheMessageContainer').removeAll();
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			/* var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref) */
				//.then(function(){ return me.loadDataFromCacheOrRally(); })//TODO: dont have to load configuration when release picker is selected 
				return me.loadDataFromCacheOrRally()
				.then(function(){ return me.redrawEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		renderAcceptedEndDatePicker: function(){
            var me = this;
            me.ReleasePicker = Ext.getCmp('navBar').add({
                xtype: 'intelacceptedenddatepicker',
                labelWidth: 80,
                width: 240,
                releases: me.ReleaseRecords,
                currentRelease: me.ReleaseRecord,
                listeners: { select: me.acceptedStartDatePickerSelected.bind(me) }
            });
        },
        /*Start: CFD Release End Date Selection Option Component*/
        _setchangedAcceptedEndDate: function() {
            var me = this;
            if (typeof me.cfdProjAcceptedEndPref[me.AcceptedEnd.data.Name] !== 'object') me.cfdProjAcceptedEndPref[me.AcceptedEnd.data.Name] = {};
            me.acceptedEndDateChanged = _.isEmpty(me.cfdProjAcceptedEndPref[me.AcceptedEnd.data.Name]) ? false : true;
            if (me.acceptedEndDateChanged) {
                me.changedAcceptedEndDate = me.cfdProjAcceptedEndPref[me.AcceptedEnd.data.Name];
            }
        },
        _checkToRenderCFDCalendarForAcceptedEnd: function() {
            var me = this;
            me._setchangedAcceptedEndDate();
            if (!me.optionSelectAcceptedEndDate && me.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(me.getContext().getWorkspace())) {
                if (Ext.getCmp('acceptedenddatepicker-wrapper')) Ext.getCmp('acceptedenddatepicker-wrapper').destroy();//redrawing everything for new release
                me._renderOptiontoSelectAcceptedEndDate();
            }
        },
        _resetVariableAfterAcceptedEndPickerSelected: function() {
            var me = this;
            me.changedAcceptedEndDate = undefined;
            me.optionSelectAcceptedEndDate = undefined;
        },
        _renderOptiontoSelectAcceptedEndDate: function() {
            var me = this;
            me.optionSelectReleaseDate = Ext.getCmp('navBar').add({
                xtype: 'intelacceptedenddatachangepicker',
                labelWidth: 80,
                width: 240,
                ProjectRecord: me.ProjectRecord,
                currentRelease: me.ReleaseRecord,
                cfdProjReleasePref: me.cfdProjReleasePref,
                initialLoad: true,
                listeners: { acceptedEndDateChanged: me._acceptedEndDateChangePickerSelected.bind(me) }
            });
        },
        _acceptedEndDateChangePickerSelected: function(date, cfdappPref) {
            var me = this;
            me.setLoading(true);
            //	me.saveCfdProjPreference(cfdappPref)
            var pid = me.ProjectRecord.data.ObjectID;
            if (typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
            me.AppsPref.projs[pid].AcceptedEndDate = date;
            me.saveAppsPreference(me.AppsPref)
                .then(function() {
                    me.changedAcceptedEndDate = date;
                    me.redrawChartAfterAcceptedDateChanged();
                })
                .fail(function(reason) { me.alert('ERROR', reason); me.setLoading(false); })
                .then(function() { me.setLoading(false); })
                .done();
			
		},
		
		/********************************************** RENDERING CHARTS ***********************************************/
        renderCharts: function() {
            var me = this,
                releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
                releaseEnd = me.ReleaseRecord.data.ReleaseDate,
                calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
                    startDate: releaseStart,
                    endDate: releaseEnd,
                    scheduleStates: me.ScheduleStates
                });
            var _6days = 1000 * 60 * 60 * 24 * 6;
            me.changedReleaseStartDate = (typeof (me.changedReleaseStartDate) === "undefined") ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate) * 1 + _6days) : me.changedReleaseStartDate;
            console.log(me.portfolioAllTeamsArry);

            /************************************** Scrum Group CHART STUFF *********************************************/

            var aggregateChartContainer = $('#aggregateChart-innerCt').highcharts({
                chart: {
                    plotBackgroundColor: null,
                    plotBorderWidth: null,
                    plotShadow: false,
                    type: 'pie',
                    "renderTo": "container"
                },
                legend: {
                    enabled: true
                },
                title: {
                    text: 'Percent allocated in terms of Plan Estimate for each  Business Objectives for ' + me.ScrumGroupRootRecord.data.Name
                },
                tooltip: {
                    //pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'                    
                    pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> represents ({point.id}) storypoints'
                },
                plotOptions: {
                    pie: {
                        allowPointSelect: true,
                        cursor: 'pointer',
                        dataLabels: {
                            enabled: true,
                            format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                            style: {
                                color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
                            }
                        }
                    }
                },
                series: [{
                    name: 'chartData',
                    colorByPoint: true,
                    showInLegend: true,
                    data: me.portfolioAllTeamsArry,
                    point: {
                        events: {
                            click: function(event) {
                                //alert(this.id);
                            }
                        }
                    }
                }]
            })[0];

            for (i = 0; i < me.teamLevelChartData.length; i++) {

                scrumCharts = $('#scrumCharts-innerCt'),
                    scrumChartID = 'scrumChart-no-' + (scrumCharts.children().length + 1);
                scrumCharts.append('<div class="scrum-chart" id="' + scrumChartID + '"></div>');

                var chartContainersContainer = $('#' + scrumChartID).highcharts({
                    chart: {
                        plotBackgroundColor: null,
                        plotBorderWidth: null,
                        plotShadow: false,
                        type: 'pie',
                        "renderTo": "container"
                    },
                    title: {
                        text: 'Percent allocated for each Business Objectives for ' + me.teamLevelChartData[i].Name
                    },
                    tooltip: {                      
                    //pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
                    pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> represents ({point.id}) storypoints'
                    },
                    plotOptions: {
                        pie: {
                            allowPointSelect: true,
                            cursor: 'pointer',
                            dataLabels: {
                                enabled: true,
                                format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                                style: {
                                    color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
                                }
                            }
                        }
                    },
                    series: [{
                        name: 'chartData',
                        colorByPoint: true,
                        data: me.teamLevelChartData[i].Portfolios,
                        point: {
                            events: {
                                click: function(event) {
                                    //alert(this.id);
                                }

                            }
                        }

                    }]

                })[0];

                //    me.doLayout(); //or else they don't render initially
            }
            me.doLayout(); //or else they don't render initially
        }
    });
} ());