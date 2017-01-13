/**
 This is the hyper-optimized version of the Data Integrity Dashboard. It is capable of viewing
 integrity both horizontally and vertically. Use of lodash is minimized for the sake of reducing
 function overhead and increasing performance (SS: i dont think lodash usage is as big a deal as network
 overhead and DOM manipulation)(SS: but little things add up over time)(SS: i dont need you for
 this conversation)
 */
(function () {
    var Ext = window.Ext4 || window.Ext;

    /*------------------------------------IMPORTANT--------------------------------------
     "isLocalDev" variable:
     - IMPORTANT: Change to true if you are running locally (http-server, localhost)
     - IMPORTANT: Make sure to set it to false before checking the code or publishing to rally
     ----------------------------------------------------------------------------------*/
    var isLocalDev = false;

    /*----------------------------------------------------------------------------------
     Rule categories are defined here, and used throughout this file.
     To add or remove a rule, you need to edit it here, and in the gridConfigs array.
     This also defines a color for each rule.
     ----------------------------------------------------------------------------------*/
    var ruleCategories = [
        "Epics with No Parent",
        "Epics with No Start or End date",
        "Unaccepted Epics Past End Date",
        "Unaccepted Features Past End Date",
        "Features with No Parent",
        "Features with No Start or End Date",
        "Features with No Stories"
    ];

        //["Epics with No Parent",'#AAAAAA'], //GRAY
        //["Epics with No Start or End date", '#2ECC40'], //GREEN
        //["Unaccepted Epics Past End Date", '#7FDBFF'], //AQUA
        //["Unaccepted Features Past End Date",'#DDDDDD'], //SILVER
        //["Features with No Parent", '#39CCCC'], //TEAL
        //["Features with No Start or End Date", '#01FF70'], //LIME
        //["Features with No Stories", '#FFDC00'] //YELLOW

    /*----------------------------------------------------------------------------------
     Changes each rule category to lower case and replaces spaces with dashes.
     ----------------------------------------------------------------------------------*/
    var ruleCategorySelectors = [];
    _.each(ruleCategories, function (ruleString) {
        ruleCategorySelectors.push(ruleString.replace(/\s+/g, '-').toLowerCase());
    });

    /************************** Data Integrity Dashboard *****************************/
    Ext.define('Intel.PortfolioDataIntegrityDashboard', {
        extend: 'Intel.lib.IntelRallyApp',
        cls: 'app',
        mixins: [
            'Intel.lib.mixin.WindowListener',
            'Intel.lib.mixin.PrettyAlert',
            'Intel.lib.mixin.IframeResize',
            'Intel.lib.mixin.IntelWorkweek',
            'Intel.lib.mixin.ParallelLoader',
            'Intel.lib.mixin.CustomAppObjectIDRegister',
            'Intel.lib.mixin.HorizontalTeamTypes',
            'Intel.lib.mixin.Caching'
        ],
        /**************************************** Settings ***************************************/
        settingsScope: 'workspace',
        getSettingsFields: function () {
            return [
                {
                    name: 'Horizontal',
                    xtype: 'rallycheckboxfield'
                }, {
                    name: 'cacheUrl',
                    xtype: 'rallytextfield'
                },
                {
                    name: ruleCategories[0],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory0'
                }, {
                    name: ruleCategories[1],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory1'
                }, {
                    name: ruleCategories[2],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory2'
                }, {
                    name: ruleCategories[3],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory3'
                }, {
                    name: ruleCategories[4],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory4'
                }, {
                    name: ruleCategories[5],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory5'
                }, {
                    name: ruleCategories[6],
                    xtype: 'rallycheckboxfield',
                    id: 'ruleCategory6'
                }
            ];
        },
        config: {
            defaultSettings: {
                //ruleCategory0: true,
                //ruleCategory1: true,
                //ruleCategory2: true,
                //ruleCategory3: true,
                //ruleCategory4: true,
                //ruleCategory5: false,
                //ruleCategory6: true,
                cacheUrl: 'https://localhost:45557/api/v1.0/custom/rally-app-cache/'
            }
        },
        minWidth: 1100,
        /**
         This layout consists of:
         Top horizontal bar for controls
         Horizontal bar for a pie chart and heat map (the 'ribbon')
         Two columns (referred to as Left and Right) for grids
         */
        items: [{
            xtype: 'container',
            id: 'cacheButtonsContainer'
        }, {
            xtype: 'container',
            id: 'navContainer',
            layout: 'hbox',
            items: [{
                xtype: 'container',
                id: 'controlsContainer',
                layout: 'vbox',
                width: 260
            }, {
                xtype: 'container',
                id: 'emailLinkContainer',
                width: 150
            }, {
                xtype: 'container',
                id: 'cacheMessageContainer'
            }, {
                xtype: 'container',
                id: 'integrityIndicatorContainer',
                flex: 1
            }]
        }, {
            xtype: 'container',
            id: 'ribbon',
            cls: 'ribbon',
            layout: 'column',
            items: [{
                xtype: 'container',
                width: 480,
                id: 'pie'
            }, {
                xtype: 'container',
                columnWidth: 0.999,
                id: 'heatmap'
            }]
        }, {
            xtype: 'button',
            id: 'expand-heatmap-button',
            text: 'Expand Heatmap'
        }, {
            xtype: 'container',
            id: 'gridsContainer',
            cls: 'grids-container',
            layout: 'column',
            items: [{
                xtype: 'container',
                columnWidth: 0.495,
                id: 'gridsLeft',
                cls: 'grids-left'
            }, {
                xtype: 'container',
                columnWidth: 0.495,
                id: 'gridsRight',
                cls: 'grids-right'
            }]
        }],
        chartColors: [
            '#AAAAAA', //GRAY
            '#2ECC40', //GREEN
            '#7FDBFF', //AQUA
            '#DDDDDD', //SILVER
            '#39CCCC', //TEAL
            '#01FF70', //LIME
            '#FFDC00', //YELLOW
            '#0074D9' //BLUE
        ],
        /******************************************************* Caching Mixin operations ********************************************************/
        /**
         NOTE: this requires that me.PortfolioItemTypes is already populated. This is done in
         the _getCacheIntelRallyAppSettings() function of caching.js
         */
        _loadModelsForCachedView: function () {
            var me = this,
                promises = [],
                models = {UserStory: 'HierarchicalRequirement'};
            models['PortfolioItem/' + me.PortfolioItemTypes[0]] = 'PortfolioItem/' + me.PortfolioItemTypes[0];
            _.each(models, function (modelType, modelName) {
                var deferred = Q.defer();
                Rally.data.WsapiModelFactory.getModel({
                    type: modelType,
                    success: function (loadedModel) {
                        me[modelName] = loadedModel;
                        deferred.resolve();
                    }
                });
                promises.push(deferred.promise);
            });
            return Q.all(promises);
        },
        getCacheUrlSetting: function () {
            var me = this;
            return me.getSetting('cacheUrl');
        },
        getCachePayloadFn: function (payload) {
            var me = this;

            me.ProjectRecord = payload.ProjectRecord;
            //me.isScopedToScrum = payload.isScopedToScrum ;
            me.ScrumGroupRootRecords = payload.ScrumGroupRootRecords;
            me.ScrumGroupPortfolioOIDs = payload.ScrumGroupPortfolioOIDs;
            me.LeafProjects = payload.LeafProjects;
            me.LeafProjectsByScrumGroup = payload.LeafProjectsByScrumGroup;
            me.LeafProjectsByHorizontal = payload.LeafProjectsByHorizontal;
            me.LeafProjectsByTeamTypeComponent = payload.LeafProjectsByTeamTypeComponent;
            me.ScrumGroupRootRecords = payload.ScrumGroupRootRecords;
            me.FilteredLeafProjects = payload.FilteredLeafProjects;
            me.PortfolioProjectToPortfolioItemMap = payload.PortfolioProjectToPortfolioItemMap;
            me.PortfolioUserStoryCount = payload.PortfolioUserStoryCount;

            return me._loadModelsForCachedView().then(function () {
                me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
                    autoLoad: false,
                    model: me.UserStory,
                    pageSize: 200,
                    data: payload.UserStories
                });
                me.fixRawUserStoryAttributes();
                me.fixScheduleStateEditor();
                me.PortfolioItemStore = Ext.create('Rally.data.custom.Store', {
                    autoLoad: false,
                    model: me['PortfolioItem/' + me.PortfolioItemTypes[0]],
                    pageSize: 200,
                    data: []
                });
            });
        },
        setCachePayLoadFn: function (payload) {
            var me = this,
                lowestPortfolioItem = me.PortfolioItemTypes[0],
                userStoryFields = ['Name', 'ObjectID', 'Project', 'Iteration',
                    'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState', 'Owner',
                    'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem, '_p', '_ref',
                    '_refObjectUUID', '_type', '_objectVersion', '_CreatedAt'],
                portfolioItemFields = ['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate',
                    'Release', 'Description', 'FormattedID', 'UserStories', 'Parent', '_p', '_ref',
                    '_refObjectUUID', '_type', '_objectVersion', '_CreatedAt', 'InvestmentCategory',
                    'DirectChildrenCount'],
                projectFields = ['Children', 'Name', 'ObjectID', 'Parent'];

            function filterProjectData(projectData) {
                var data = _.pick(projectData, projectFields);
                data.Parent = _.pick(data.Parent, projectFields);
                data.Children = _.pick(data.Children, ['Count']);
                return {data: data};
            }

            function filterUserStoryForCache(userStoryRecord) {
                var data = _.pick(userStoryRecord.data, userStoryFields);
                data.Iteration = data.Iteration ? _.pick(data.Iteration, ['EndDate', 'Name', 'ObjectID', 'StartDate', '_refObjectName']) : null;
                data.Project = _.pick(data.Project, ['Name', 'ObjectID', '_refObjectName']);
                data.Owner = _.pick(data.Owner, ['_refObjectName']);
                data.Release = data.Release ? _.pick(data.Release, ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate']) : null;
                return data;
            }

            payload.ProjectRecord = filterProjectData(me.ProjectRecord.data);
            //	payload.isScopedToScrum = me.isScopedToScrum ;
            payload.ScrumGroupRootRecords = _.map(me.ScrumGroupRootRecords, function (ss) {
                return filterProjectData(ss.data);
            });
            payload.ScrumGroupPortfolioOIDs = me.ScrumGroupPortfolioOIDs;
            payload.LeafProjects = _.map(me.LeafProjects, function (ss) {
                return filterProjectData(ss.data);
            });
            payload.LeafProjectsByScrumGroup = _.reduce(me.LeafProjectsByScrumGroup, function (map, sss, key) {
                map[key] = _.map(sss, function (ss) {
                    return filterProjectData(ss.data);
                });
                return map;
            }, {});
            payload.LeafProjectsByHorizontal = _.reduce(me.LeafProjectsByHorizontal, function (map, sss, key) {
                map[key] = _.map(sss, function (ss) {
                    return filterProjectData(ss.data);
                });
                return map;
            }, {});
            payload.LeafProjectsByTeamTypeComponent = _.reduce(me.LeafProjectsByTeamTypeComponent, function (map, sss, key) {
                map[key] = _.map(sss, function (ss) {
                    return filterProjectData(ss.data);
                });
                return map;
            }, {});
            payload.FilteredLeafProjects = _.map(me.FilteredLeafProjects, function (ss) {
                return filterProjectData(ss.data);
            });
            payload.PortfolioProjectToPortfolioItemMap = _.reduce(me.PortfolioProjectToPortfolioItemMap, function (map, sss, key) {
                map[key] = _.map(sss, function (ss) {
                    return _.pick(ss.data, portfolioItemFields);
                });
                return map;
            }, {});
            payload.PortfolioUserStoryCount = me.PortfolioUserStoryCount;

            payload.UserStories = _.map(me.UserStoryStore.getRange(), filterUserStoryForCache);
        },
        cacheKeyGenerator: function () {
            var me = this;
            var projectOID = me.getContext().getProject().ObjectID;
            var horizontalName = "";
            if (me.isHorizontalView) {
                var horizontalInUrl = !me.isScopedToScrum && me.isHorizontalView && !me.ScopedTeamType;
                horizontalName = horizontalInUrl ? me.Overrides.ScopedHorizontal : me.HorizontalTeamTypeInfo.horizontal;
                horizontalName = horizontalName ? horizontalName : (!me.ScopedHorizontalPicker ? _.keys(me.HorizontalGroupingConfig.groups).sort()[0] : me.ScopedHorizontalPicker.value);
            }
            var releaseOID = me.ReleaseRecord.data.ObjectID;
            var releaseName = me.ReleaseRecord.data.Name;
            return 'DI-' + (me.isHorizontalView ? horizontalName : projectOID) + '-' + (me.isHorizontalView ? releaseName : releaseOID);
        },
        getCacheTimeoutDate: function () {
            return new Date(new Date() * 1 + 1000 * 60 * 60);
        },

        loadNonConfigDataFromCacheOrRally: function () {
            var me = this;
            return me.loadData().then(function () {
            });
        },
        loadDataFromCacheOrRally: function () {
            var me = this;
            if (me.isHorizontalView) me.applyProjectFilters();
            else me.applyScopingOverrides();
            return me.loadRemainingConfiguration()
                .then(function () {
                    return me.loadData();
                });
        },
        loadCacheIndependentConfig: function () {
            var me = this;
            return Q.all([
                me.isHorizontalView ? me._loadHorizontalGroupingConfig() : Q(),
                me.loadReleases()
            ])
                .then(function () {
                    if (me.isHorizontalView && !me.isStandalone) {
                        me.ProjectRecord = me.createDummyProjectRecord(me.getContext().getProject());
                        me.HorizontalTeamTypeInfo = me.getHorizontalTeamTypeInfoFromProjectName(me.ProjectRecord.data.Name);
                        me.applyScopingOverrides();
                    }
                });
        },
        /******************************************************* LAUNCH ********************************************************/
        launch: function () {
            var me = this;
            me.rules = [];
            //For production/rally official
            if (!isLocalDev) {
                me.isHorizontalView = me.getSetting('Horizontal');
                console.log("Rally: ruleCategories: ", ruleCategories);
                _.each(ruleCategories, function (item, index) {
                    //for each of the rule categories, get the checkbox value
                    me.rules[index] = me.getSetting(ruleCategories[index]);
                    console.log("Rally: me.rules[" + index + "]: " + me.rules[index]);
                });
            } else {
                //For local development/http-server localhost
                me.isHorizontalView = false;
                //for each of the rule categories, set the checkbox value to true
                _.each(ruleCategories, function (item, index) {
                    me.rules[index] = true;
                });
                //Optional: if you want to change one of the rules to false,
                // for local dev, do it here.
            }

            // me.initDisableResizeHandle();
            // me.initFixRallyDashboard();
            me.initRemoveTooltipOnScroll();
            me.processURLOverrides();

            me.setLoading('Loading Configuration');
            me.loadCacheIndependentConfig()
                .then(function () {
                    return me.loadDataFromCacheOrRally();
                })
                .then(function () {
                    return me.loadUI();
                })
                .then(function () {
                    return me.registerCustomAppId();
                })
                .fail(function (reason) {
                    me.setLoading(false);
                    me.alert('ERROR', reason);
                })
                .done();
        },

        /**************************************** registerCustomAppId ***************************************/
        registerCustomAppId: function () {
            return this.setCustomAppObjectID(this.getSetting('Horizontal') ?
                    'Intel.PortfolioDataIntegrityDashboard.Horizontal' :
                    'Intel.PortfolioDataIntegrityDashboard.Vertical'
            );
        },

        /**************************************** Loading Config Items ***********************************/
        /**
         load releases for current scoped project and set the me.ReleaseRecord appropriately.
         */
        loadReleases: function () {
            var me = this,
                twelveWeeksAgo = new Date(new Date() * 1 - 12 * 7 * 24 * 60 * 60 * 1000),
                projectRecord = me.createDummyProjectRecord(me.getContext().getProject());

            return me.loadReleasesAfterGivenDate(projectRecord, twelveWeeksAgo).then(function (releaseRecords) {
                me.ReleaseRecords = releaseRecords;

                // Set the current release to the release we're in or the closest release to the date
                // Important! This sets the current release to an overridden value if necessary
                me.ReleaseRecord = (me.isStandalone ?
                    _.find(me.ReleaseRecords, function (release) {
                        return release.data.Name === me.Overrides.ReleaseName;
                    }) :
                    false) ||
                me.getScopedRelease(me.ReleaseRecords, null, null);
            });
        },

        loadRemainingConfiguration: function () {
            var me = this;
            me.ProjectRecord = me.createDummyProjectRecord(me.getContext().getProject());
            //for horizontal view you want to make sure that projects from all the trains are loaded not just that project
            if (!isLocalDev && me.ProjectRecord.data.Children) {
                me.isScopedToScrum = me.isHorizontalView ? false : ( me.ProjectRecord.data.Children.count === 0);
            } else {
                //for Local development/http-server localhost
                me.isScopedToScrum = false;//set this to true for team scoping in local dev, and false for train scoping.
            }

            return me.configureIntelRallyApp()
                .then(function () {
                    //things that need to be done immediately after configuraing app
                    me.fixScheduleStateEditor();
                    if (me.isHorizontalView && (!me.HorizontalGroupingConfig || !me.HorizontalGroupingConfig.enabled))
                        throw "workspace is not configured for horizontals";
                })
                .then(function () {
                    return me.loadScrumGroups();
                })
                .then(function () {
                    return me.loadProjects();
                })
                .then(function () {
                    return me.loadEpicProjects();
                })
                .then(function () {
                    me.applyScopingOverrides();
                });
        },

        /**
         Load all scrumGroups in horizontal mode, regardless of project scoping. Load scrum group in
         vertical mode ONLY if we are scoped to a scrumGroupRootRecord
         */
        loadScrumGroups: function () {
            var me = this;
            me.ScrumGroupRootRecords = [];
            me.ScrumGroupPortfolioOIDs = [];

            if (me.isHorizontalView) {
                for (var i = 0; i < me.ScrumGroupConfig.length; i++) {
                    if (me.ScrumGroupConfig[i].IsTrain) { //only load train scrumGroups in horizontal view
                        var dummyScrumGroupRootRecord = me.createDummyProjectRecord({ObjectID: me.ScrumGroupConfig[i].ScrumGroupRootProjectOID});
                        me.ScrumGroupRootRecords.push(dummyScrumGroupRootRecord);
                        me.ScrumGroupPortfolioOIDs.push(me.getPortfolioOIDForScrumGroupRootProjectRecord(dummyScrumGroupRootRecord));
                    }
                }
            }
            else {
                return me.loadProject(me.ProjectRecord.data.ObjectID)
                    .then(function (projectRecord) {
                        return me.projectInWhichScrumGroup(projectRecord);
                    })
                    .then(function (scrumGroupRootRecord) {
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
        loadProjects: function () {
            var me = this;
            me.LeafProjects = [];
            me.LeafProjectsByScrumGroup = {};
            me.LeafProjectsByHorizontal = {};
            me.LeafProjectsByTeamTypeComponent = {};

            return Q.all(_.map(me.ScrumGroupRootRecords, function (scrumGroupRootRecord) {
                return me.loadAllLeafProjectsForPortfolioDI(scrumGroupRootRecord).then(function (leafProjects) {
                    me.LeafProjects = me.LeafProjects.concat(_.values(leafProjects));
                    me.LeafProjectsByScrumGroup[scrumGroupRootRecord.data.ObjectID] = _.values(leafProjects);

                    var teamTypes = me.getAllHorizontalTeamTypeInfos(leafProjects);
                    for (var i in teamTypes) {
                        me.LeafProjectsByHorizontal[teamTypes[i].horizontal] = me.LeafProjectsByHorizontal[teamTypes[i].horizontal] || [];
                        me.LeafProjectsByHorizontal[teamTypes[i].horizontal].push(teamTypes[i].projectRecord);
                        for (var j in teamTypes[i].teamTypeComponents) {
                            var cmp = teamTypes[i].teamTypeComponents[j];
                            me.LeafProjectsByTeamTypeComponent[cmp] = me.LeafProjectsByTeamTypeComponent[cmp] || [];
                            me.LeafProjectsByTeamTypeComponent[cmp].push(teamTypes[i].projectRecord);
                        }
                    }

                });
            }));
        },


        loadEpicProjects: function () {
            var me = this;
            me.AllProjects = {};
            me.LeafProjectsByEpicComponent = {};

            return me.loadAllProjects().then(function (projects) {
                me.AllProjects = projects;

            });
        },

        applyScopingOverrides: function () {
            var me = this;

            //the following code validates URL overrides and sets defaults for viewing projects/horizontals/scrumGroups
            if (!me.isScopedToScrum) {
                me.ScopedTeamType = me.Overrides.TeamName || (me.isHorizontalView && !me.isStandalone ? me.HorizontalTeamTypeInfo.teamType : '' ); //could be a teamTypeComponent (for horizontal mode) or scrumName (for vertical mode)
                if (me.isHorizontalView) {
                    if (me.ScopedTeamType) {
                        if (!_.contains(me.getAllHorizontalTeamTypeComponents(), me.ScopedTeamType)) throw me.ScopedTeamType + ' is not configured as horizontal teamType';
                        me.ScopedHorizontal = me.teamTypeComponentInWhichHorizontal(me.ScopedTeamType);
                    }
                    else me.ScopedHorizontal = me.Overrides.ScopedHorizontal || _.keys(me.HorizontalGroupingConfig.groups).sort()[0];

                    if (typeof me.HorizontalGroupingConfig.groups[me.ScopedHorizontal] === 'undefined')
                        throw me.ScopedHorizontal + ' is not a valid horizontal';
                }
                else {
                    if (me.ScopedTeamType) {
                        if (!me.ScrumGroupRootRecords.length) throw "cannot specify team when not in ScrumGroup";
                        var matchingTeam = _.find(me.LeafProjectsByScrumGroup[me.ScrumGroupRootRecords[0].data.ObjectID], function (p) {
                            return p.data.Name === me.ScopedTeamType;
                        });
                        if (!matchingTeam) throw me.ScopedTeamType + " is not a valid team";
                    }
                }
            }
        },

        /**************************************** Data Loading ************************************/
        /**
         Filters only apply if we are in horizontal-mode OR we are scoped to a train in vertical mode
         */
        applyProjectFilters: function () {
            var me = this, filteredProjects;

            if (me.isScopedToScrum) filteredProjects = [me.ProjectRecord];
            else if (me.isHorizontalView) {
                if (me.ScopedTeamType && me.ScopedTeamType !== 'All') filteredProjects = me.LeafProjectsByTeamTypeComponent[me.ScopedTeamType] || [];
                else {
                    if (!me.ScopedHorizontal || me.ScopedHorizontal === 'All') filteredProjects = [].concat.apply([], _.values(me.LeafProjectsByHorizontal));
                    else filteredProjects = me.LeafProjectsByHorizontal[me.ScopedHorizontal] || [];
                }
            }
            else {
                if (!me.ScrumGroupRootRecords.length) filteredProjects = [me.ProjectRecord];
                else {
                    if (me.ScopedTeamType && me.ScopedTeamType !== 'All')
                        filteredProjects = [_.find(me.LeafProjects, function (leafProject) {
                            return leafProject.data.Name === me.ScopedTeamType;
                        })];
                    else filteredProjects = me.LeafProjectsByScrumGroup[me.ScrumGroupRootRecords[0].data.ObjectID] || [];
                }
            }
            filteredProjects.push(me.ProjectRecord);
            me.FilteredLeafProjects = filteredProjects;
            return Q();
        },

        /**
         Creates a filter for the portfolio items
         */
        createPortfolioItemFilter: function () {
            var me = this,
                releaseName = me.ReleaseRecord.data.Name,
                releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release.Name',
                    operator: '=',
                    value: releaseName
                }),
                oids = [];
            return releaseFilter;
        },

        /**************************************** Data Loading ************************************/
        /**
         Filters only apply if we are in horizontal-mode OR we are scoped to a train in vertical mode
         */
        applyEpicProjectFilters: function () {
            var me = this, tempProjects;
            var projects = [];
            if (me.PortfolioEpicStore.data.items) {

                for (var i = 0; i < me.PortfolioEpicStore.data.items.length; i++) {
                    projects[i] = [_.find(me.AllProjects, function (leafProject) {
                        return leafProject.data.Name === me.PortfolioEpicStore.data.items[i].data.Project.Name;
                    })];
                }
            }
            tempProjects = (_.uniq(projects, function (p) {
                return p[0].data.Name;
            }));
            me.LeafProjectsByEpicComponent = tempProjects;
            return Q();
        },

        /**
         Filters only apply if we are in horizontal-mode OR we are scoped to a train in vertical mode
         */
        applyAllProjectFilters: function () {
            var me = this, tempProjects;
            var allProjectsForDI = [];
            //Add all the Feature Projects
            for (var i = 0; i < me.FilteredLeafProjects.length; i++) {
                allProjectsForDI.push(me.FilteredLeafProjects[i]);
            }
            //Add all the Epic Projects
            for (var j = 0; j < me.LeafProjectsByEpicComponent.length; j++) {
                allProjectsForDI.push(me.LeafProjectsByEpicComponent[j][0]);
            }
            allProjectsForDI.push(me.ProjectRecord);
            tempProjects = (_.uniq(allProjectsForDI, function (p) {
                return p.data.Name;
            }));
            me.FilteredAllProjectsAndEpicProjects = tempProjects;
            return Q();
        },

        /**
         Gets portfolio items in the current release associated with the scrum groups (if there are any)
         Also: creates a map of portfolioOID to the portfolioItems loaded under it
         */
        loadPortfolioItems: function () {
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0];
            var pageSize = 0;

            me.PortfolioProjectToPortfolioItemMap = {};
            return Q.all(_.map(me.ScrumGroupPortfolioOIDs, function (portfolioOID) {
                var store = Ext.create('Rally.data.wsapi.Store', {
                    model: me['PortfolioItem/' + lowestPortfolioItemType],
                    autoLoad: false,
                    pageSize: 600,
                    fetch: ['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate',
                        'Release', 'Description', 'FormattedID', 'UserStories', 'Parent'],
                    context: {
                        project: '/project/' + portfolioOID,
                        projectScopeUp: false,
                        projectScopeDown: true
                    }
                });
                return me.reloadStore(store).tap(function (store) {
                    me.PortfolioProjectToPortfolioItemMap[portfolioOID] = store.getRange();
                });
                pageSize = store.totalCount;
            }))
                .then(function (stores) {
                    me.PortfolioItemStore = Ext.create('Rally.data.custom.Store', {
                        autoLoad: false,
                        model: me['PortfolioItem/' + lowestPortfolioItemType],
                        pageSize: pageSize,
                        data: [].concat.apply([], _.invoke(stores, 'getRange'))
                    });
                });
        },

        loadPortfolioEpics: function () {
            var me = this,
                epicPortfolioItemType = me.PortfolioItemTypes[1];
            me.PortfolioProjectToPortfolioEpicMap = {};
            return Q.all(_.map(me.ScrumGroupPortfolioOIDs, function (portfolioOID) {
                var store = Ext.create('Rally.data.wsapi.Store', {
                    model: me['PortfolioItem/' + epicPortfolioItemType],
                    //filters: [me.createPortfolioItemFilter()],
                    autoLoad: false,
                    pageSize: 200,
                    fetch: ['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate',
                        'Release', 'Description', 'FormattedID', 'Parent'],
                    context: {
                        project: '/project/' + portfolioOID,
                        projectScopeUp: false,
                        projectScopeDown: true
                    }
                });
                return me.reloadStore(store).tap(function (store) {
                    me.PortfolioProjectToPortfolioEpicMap[portfolioOID] = store.getRange();
                });
            }))
                .then(function (stores) {
                    //console.log("stores = ", stores); // This has data
                    me.PortfolioEpicStore = Ext.create('Rally.data.custom.Store', {
                        autoLoad: false,
                        model: me['PortfolioItem/' + epicPortfolioItemType],
                        pageSize: 200,
                        data: [].concat.apply([], _.invoke(stores, 'getRange'))
                    });
                    //console.log("me.PortfolioEpicStore.data = ", me.PortfolioEpicStore.data);
                });
        },

        /**
         Creates a filter for stories that:
         Belong to one of the projects
         AND
         Are in an during the release but not the release OR in the release
         */
        createStoryFilter: function (leafProjects) {			//NOTE: we are filtering for leaf stories here
            var me = this,
                releaseName = me.ReleaseRecord.data.Name,
                releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
                releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
                releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release.Name',
                    value: releaseName
                }),
                leafStoriesInIterationButNotReleaseFilter =
                    Ext.create('Rally.data.wsapi.Filter', {
                        property: 'Iteration.StartDate',
                        operator: '<',
                        value: releaseDate
                    }).and(
                        Ext.create('Rally.data.wsapi.Filter', {
                            property: 'Iteration.EndDate',
                            operator: '>',
                            value: releaseStartDate
                        })).and(
                        Ext.create('Rally.data.wsapi.Filter', {
                            property: 'Release.Name',
                            operator: '=',
                            value: null
                        })).and(
                        Ext.create('Rally.data.wsapi.Filter', {
                            property: 'Iteration.Name',
                            operator: 'contains',
                            value: releaseName
                        }).and(
                            Ext.create('Rally.data.wsapi.Filter', {property: 'DirectChildrenCount', value: 0}))),
                projectFilter = _.reduce(leafProjects, function (filter, leafProject) {
                    var newFilter = Ext.create('Rally.data.wsapi.Filter', {
                        property: 'Project.ObjectID',
                        value: leafProject.data.ObjectID
                    });
                    return filter ? filter.or(newFilter) : newFilter;
                }, null);

            return projectFilter.and(leafStoriesInIterationButNotReleaseFilter.or(releaseNameFilter));
        },

        /**
         Loads userstories under leafProjects in chunks of projects at a time. we batch projects to reduce requests sent
         */
        loadUserStories: function () {
            var me = this,
                lowestPortfolioItem = me.PortfolioItemTypes[0];

            me.UserStoryFetchFields = ['Name', 'ObjectID', 'Project', 'Owner', 'PlannedEndDate', 'ActualEndDate',
                'StartDate', 'EndDate', 'Iteration[StartDate;EndDate]', 'DirectChildrenCount',
                'Release', 'ReleaseStartDate', 'ReleaseDate', 'PlanEstimate', 'FormattedID', 'ScheduleState',
                'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', 'Description', lowestPortfolioItem];

            if (!me.FilteredLeafProjects) throw "No leaf projects for userstory filter";

            return Q.all(_.map(_.chunk(me.FilteredLeafProjects, 20), function (leafProjects) {
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
            }))
                .then(function (stores) {
                    me.UserStoryStore = Ext.create('Rally.data.wsapi.Store', {
                        autoLoad: false,
                        model: me.UserStory,
                        pageSize: 200,
                        data: [].concat.apply([], _.invoke(stores, 'getRange'))
                    });

                    /* US436545: Remove this to get back improperly sized user stories */
                    _.each(me.UserStoryStore.getRange(), function (item, key) {
                        if (key < me.UserStoryStore.count() && me.UserStoryStore.getAt(key).data) {
                            var pe = me.UserStoryStore.getAt(key).data.LeafStoryPlanEstimateTotal;
                            if (pe && pe !== 0 && pe !== 1 && pe !== 2 && pe !== 4 && pe !== 8 && pe !== 16) {
                                me.UserStoryStore.removeAt(key);
                            }
                        }
                    });

                    me.fixRawUserStoryAttributes();
                });
        },

        /**
         Counts the number of stories associated with each portfolio item.
         This is only used for 1 of the portfolioItem integrity grids
         */
        countPortfolioItemStories: function () {
            var me = this;
            if (me.PortfolioItemStore) {
                var lowestPortfolioItemType = me.PortfolioItemTypes[0];
                me.PortfolioUserStoryCount = {};
                _.each(me.PortfolioItemStore.getRange(), function (portfolioItemRecord) {
                    me.PortfolioUserStoryCount[portfolioItemRecord.data.ObjectID] = portfolioItemRecord.data.UserStories.Count;
                });
            }
        },

        /**
         Control function for loading projects, portfolio items, and stories
         */
        loadData: function () {
            var me = this;
            me.setLoading('Loading Data');
            return me.applyProjectFilters()
                .then(function () {
                    return me.loadPortfolioItems();
                })
                .then(function () {
                    return me.loadPortfolioEpics();
                })
                .then(function () {
                    return me.loadUserStories();
                })
                .then(function () {
                    return me.applyEpicProjectFilters();
                })
                .then(function () {
                    return me.applyAllProjectFilters();
                })
                .then(function () {
                    me.setLoading(false);
                    return me.countPortfolioItemStories();
                });
        },

        /**************************************** UI Component Loading/Removing ****************************/
        /**
         Removes the chart, heat map, and all grids
         */
        removeAllItems: function () {
            var me = this;
            Ext.getCmp('pie').removeAll();
            Ext.getCmp('heatmap').removeAll();
            Ext.getCmp('gridsLeft').removeAll();
            Ext.getCmp('gridsRight').removeAll();
            var indicator = Ext.getCmp('integrityIndicator');
            if (indicator) indicator.destroy();
        },

        /**
         the team picker acts as a horizontal TeamType picker in horizontal view mode, and a leaf project picker
         in vertical view mode while scoped to a scrumGroupRootRecord
         */
        getTeamPickerValues: function () {
            var me = this;
            if (me.isHorizontalView) {
                return [{Type: 'All'}].concat(
                    _.sortBy(_.map(me.HorizontalGroupingConfig.groups[me.ScopedHorizontal] || [],
                            function (type) {
                                return {Type: type};
                            }),
                        function (type) {
                            return type.Type;
                        })
                );
            }
            else {
                return [{Type: 'All'}].concat(_.sortBy(_.map(me.FilteredLeafProjects,
                            function (project) {
                                return {Type: project.data.Name};
                            }),
                        function (type) {
                            return type.Type;
                        })
                );
            }
        },

        /**
         Adds comboboxes in the nav section to filter data on the page
         */
        renderGetLiveDataButton: function () {
            var me = this;
            me.UpdateCacheButton = Ext.getCmp('cacheButtonsContainer').add({
                xtype: 'button',
                text: 'Get Live Data',
                listeners: {
                    click: function () {
                        me.setLoading('Pulling Live Data, please wait');
                        Ext.getCmp('cacheMessageContainer').removeAll();
                        return Q.all([
                            me.isHorizontalView ? Q() : me.loadRemainingConfiguration()
                        ])
                            .then(function () {
                                return me.loadData();
                            })
                            .then(function () {
                                return me.renderVisuals();
                            })
                            .then(function () {
                                //NOTE: not returning promise here, performs in the background!
                                //dont want to cache in the horizontal view if only a team is selected
                                //we want to only cache for All in a horizontal view, me.isStandalone checks if its the caching script
                                Ext.getCmp('cacheButtonsContainer').removeAll();
                                var doCaching = me.isHorizontalView ? (me.ScopedTeamType === 'All' || ( me.TeamPicker ? me.TeamPicker.value === 'All' : "") || me.isStandalone ) : !me.isScopedToScrum;
                                if (doCaching) {
                                    me.updateCache().fail(function (e) {
                                        alert(e);
                                        console.log(e);
                                    });
                                }
                            })
                            .then(function () {
                                me.setLoading(false);
                            });
                    }
                }
            });
        },
        renderReleasePicker: function () {
            var me = this;
            me.ReleasePicker = Ext.getCmp('controlsContainer').add({
                xtype: 'intelreleasepicker',
                labelWidth: 60,
                width: 240,
                releases: me.ReleaseRecords,
                currentRelease: me.ReleaseRecord,
                listeners: {
                    change: function (combo, newval, oldval) {
                        if (newval.length === 0) combo.setValue(oldval);
                    },
                    select: me.releasePickerSelected.bind(me)
                }
            });
        },
        renderHorizontalGroupPicker: function () {
            var me = this;
            me.ScopedHorizontalPicker = Ext.getCmp('controlsContainer').add({
                xtype: 'intelcombobox',
                labelWidth: 60,
                width: 240,
                fieldLabel: 'Horizontal:',
                store: Ext.create('Ext.data.Store', {
                    fields: ['Horizontal', 'TeamTypes'],
                    data: [{Horizontal: 'All', TeamTypes: []}].concat(_.sortBy(_.map(me.HorizontalGroupingConfig.groups,
                                function (teamTypes, horizontal) {
                                    return {Horizontal: horizontal, TeamTypes: teamTypes};
                                }),
                            function (item) {
                                return item.Horizontal;
                            })
                    )
                }),
                displayField: 'Horizontal',
                value: me.ScopedHorizontal,
                listeners: {
                    change: function (combo, newval, oldval) {
                        if (newval.length === 0) combo.setValue(oldval);
                    },
                    select: me.horizontalGroupPickerSelected.bind(me)
                }
            });
        },
        renderTeamPicker: function () {
            var me = this;
            me.TeamPicker = Ext.getCmp('controlsContainer').add({
                xtype: 'intelcombobox',
                id: 'teampicker',
                labelWidth: 60,
                width: 240,
                fieldLabel: 'Team:',
                store: Ext.create('Ext.data.Store', {
                    fields: ['Type'],
                    data: me.getTeamPickerValues()
                }),
                displayField: 'Type',
                value: me.isHorizontalView ? me.ScopedTeamType : 'All',
                listeners: {
                    change: function (combo, newval, oldval) {
                        if (newval.length === 0) combo.setValue(oldval);
                    },
                    select: me.teamPickerSelected.bind(me)
                }
            });
        },

        /**
         MailTo link generating and rendering functions.
         */
        generateMailtoLink: function () {
            var me = this;
            var base = 'mailto:',
                subject = '&subject=Data%20Integrity%20Dashboard%20View',
                urlSegments = me.Overrides.decodedUrl.split('?'),
                options = [];

            // Push options that will always be present
            options.push('isStandalone=true');
            options.push('release=' + me.ReleaseRecord.data.Name);

            // Push variable options
            if (me.isHorizontalView) {
                if (me.ScopedTeamType !== '') options.push('team=' + me.ScopedTeamType);
                if (me.ScopedHorizontal) options.push('group=' + me.ScopedHorizontal);
            }
            else if (!me.isScopedToScrum) {
                if (me.ScopedTeamType !== '') options.push('team=' + me.ScopedTeamType);
            }

            // Create the correctly encoded app url
            var appUrl = urlSegments[0] + '%3F' + options.join('%26');
            appUrl = appUrl.replace(/\s/g, '%2520');

            // Create the full mailto url
            var body = '&body=' + appUrl,
                url = base + subject + body;
            return url;
        },
        setNewEmailLink: function () {
            var me = this;
            if (me.EmailLink) {
                me.EmailLink.setText('<a href="' + me.generateMailtoLink() + '">Email this view</a>', false);
            }
        },
        renderEmailLink: function () {
            var me = this;
            me.EmailLink = Ext.getCmp('emailLinkContainer').add({
                xtype: 'label',
                width: '100%',
                html: '<a href="' + me.generateMailtoLink() + '">Email this view</a>'
            });
        },
        renderCacheMessage: function () {
            var me = this;
            Ext.getCmp('cacheMessageContainer').add({
                xtype: 'label',
                width: '100%',
                html: 'You are looking at the cached version of the data, update last on: ' + '<span class = "modified-date">' + me.lastCacheModified + '</span>'
            });
        },
        /**
         Loads all nav controls
         */
        renderControlsAndEmailLink: function () {
            var me = this;

            // Conditionally loads controls
            //if(!me.DeleteCacheButton && !me.isScopedToScrum) me.renderDeleteCache();
            //if(!me.UpdateCacheButton && !me.isScopedToScrum) me.renderGetLiveDataButton();
            if (!me.ReleasePicker) me.renderReleasePicker();
            if (!me.ScopedHorizontalPicker && !me.isScopedToScrum && me.isHorizontalView) me.renderHorizontalGroupPicker();
            if (!me.TeamPicker && !me.isScopedToScrum) me.renderTeamPicker();
            if (me.isStandalone) {
                me.ReleasePicker.hide();
                if (me.UpdateCacheButton) me.UpdateCacheButton.hide();
                if (me.ScopedHorizontalPicker) me.ScopedHorizontalPicker.hide();
                if (me.TeamPicker) me.TeamPicker.hide();
            }
            if (!me.EmailLink) me.renderEmailLink();
        },

        /**
         Adds the click listener to the expand heatmap button
         */
        initializeExpandHeatmapButton: function () {
            var me = this;
            me.isPieHidden = false;

            // Add click listener to button
            me.down('#expand-heatmap-button').on('click', function () {
                var heatmap = $('#heatmap'),
                    ribbon = me.down('#ribbon');
                // Show pie chart
                if (me.isPieHidden) {
                    me.down('#pie').setWidth(480);
                    button = me.down('#expand-heatmap-button').setText('Expand Heatmap');
                }
                // Hide pie chart
                else {
                    me.down('#pie').setWidth(0);
                    button = me.down('#expand-heatmap-button').setText('Show Pie');
                }

                // Create heat map
                heatmap.empty();
                heatmap.highcharts(me.getHeatMapConfig());

                me.isPieHidden = !me.isPieHidden;
                me.hideHighchartsLinks();
            });
        },

        /**
         Creates and adds the overall indicator of integrity to the app
         */
        buildIntegrityIndicator: function () {
            var me = this,
                userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function (grid) {
                    return grid.originalConfig.model == 'UserStory' || grid.originalConfig.model == 'PortfolioItem/Epic';
                }).reverse(),

                storyNum = {},
                storyDen = userStoryGrids[0].originalConfig.totalCount,
                pointNum,
                pointDen = userStoryGrids[0].originalConfig.totalPoints,
                storyPer,
                pointPer;
            // Sums the point estimates and number of stories
            _.each(userStoryGrids, function (grid) {
                _.each(grid.originalConfig.data, function (item) {
                    storyNum[item.data.ObjectID] = item.data.LeafStoryPlanEstimateTotal || 0;
                });
            });
            pointNum = (100 * (pointDen - _.reduce(storyNum, function (sum, planEstimate) {
                return sum + planEstimate;
            }, 0)) >> 0) / 100;
            storyNum = storyDen - Object.keys(storyNum).length;
            storyPer = (storyNum / storyDen * 10000 >> 0) / 100;
            pointPer = (pointNum / pointDen * 10000 >> 0) / 100;

            // Creates the integrity scope label
            // Collective (Release) || Horizontal[/Team] (Release) || ScrumGroup[/Team] (Release) || Team (Release) || ProjectName (Release)
            var scopeLabel = '';
            if (me.isScopedToScrum) scopeLabel = me.ProjectRecord.data.Name;
            else if (me.isHorizontalView) {
                if (me.ScopedHorizontal && me.ScopedHorizontal !== 'All') {
                    scopeLabel = me.ScopedHorizontal;
                    if (me.ScopedTeamType !== '') scopeLabel = scopeLabel.concat('/' + me.ScopedTeamType);
                }
                else scopeLabel = 'Collective';
            }
            else {
                if (me.ScrumGroupRootRecords.length) {
                    scopeLabel = me.getScrumGroupName(me.ScrumGroupRootRecords[0]);
                    if (me.ScopedTeamType !== '') scopeLabel = scopeLabel.concat('/' + me.ScopedTeamType);
                }
                else scopeLabel = me.ProjectRecord.data.Name; //some random non-leaf, non-scrum-group project
            }
            scopeLabel = scopeLabel.concat(' (' + me.ReleaseRecord.data.Name + ')');

            // Creates and adds the integrity indicator
            Ext.getCmp('integrityIndicatorContainer').removeAll();
            me.IntegrityIndicator = Ext.getCmp('integrityIndicatorContainer').add({
                xtype: 'container',
                id: 'integrityIndicator',
                padding: '5px 20px 0 0',
                flex: 1,
                layout: {
                    type: 'hbox',
                    pack: 'end'
                },
                items: [{
                    xtype: 'container',
                    html: '<span class="integrity-inticator-title">' +
                    scopeLabel +
                    ' Integrity <em>(% Correct)</em></span><br/>' +
                    '<span class="integrity-indicator-value"><b>Epics: </b>' + storyNum + '/' + storyDen + ' <em>(' + storyPer + '%)</em></span><br/>' /*+
                     '<span class="integrity-indicator-value"><b>Points: </b>' + pointNum + '/' + pointDen + ' <em>(' + pointPer + '%)<em/></span>'*/
                }]
            });
        },

        /**
         Loads all data visuals
         */
        renderVisuals: function () {
            var me = this;
            me.setLoading('Loading Visuals');
            me.setNewEmailLink();
            me.removeAllItems();
            return me.buildGrids()
                .then(function () {
                    return Q.all([me.buildRibbon(), me.buildIntegrityIndicator()]);
                })
                .then(function () {
                    me.setLoading(false);
                });
        },

        /**        Loads all controls and visuals        */
        loadUI: function () {
            var me = this;
            me.renderControlsAndEmailLink();
            me.initializeExpandHeatmapButton();
            return me.renderVisuals();
        },

        /**************************************** Grids and Charts ********************************/
        getProjectStoriesForGrid: function (project, grid) {
            return _.filter(grid.originalConfig.data, function (story) {
                return story.data.Project.ObjectID == project.data.ObjectID;
            });
        },
        getProjectStoriesForRelease: function (project, grid) {
            return _.filter(grid.originalConfig.totalStories, function (story) {
                return story.data.Project.ObjectID == project.data.ObjectID;
            });
        },
        getProjectPointsForGrid: function (project, grid) {
            return _.reduce(this.getProjectStoriesForGrid(project, grid), function (sum, story) {
                return sum + story.data.LeafStoryPlanEstimateTotal;
            }, 0);
        },
        getProjectPointsForRelease: function (project, grid) {
            return _.reduce(this.getProjectStoriesForRelease(project, grid), function (sum, story) {
                return sum + story.data.LeafStoryPlanEstimateTotal;
            }, 0);
        },

        /**
         This is only necessary when we are scoped to a scrumGroupRootRecord or in horizontalMode, and we have
         the me.ScopedTeamType set to a value, in which case we need to filter the user stories we have loaded into memory
         */
        getEpicsForReport: function () {
            var me = this;
            return me.PortfolioEpicStore.data.getRange();
        },

        /**
         if in horizontal mode, it only gets the portfolio items attached to scrumGroups
         that have teams visibile in the DI Dashboard. (e.g.: if two 'H' horizontal teams
         are showing on the page, but they are in trains "Foo" and "Bar", then the portfolioItems
         for "Foo" and "Bar" will be returned.

         In Vertical mode, it returns whatever scrumGroup that is scoped to.
         */
        getFilteredLowestPortfolioItems: function () {
            var me = this, activeScrumGroups, activePortfolioOIDs;
            var portfolioItems = me.PortfolioItemStore.getRange();


            if (me.isScopedToScrum) return [];
            else {
                activeScrumGroups = _.filter(me.ScrumGroupConfig, function (sgc) {
                    //todo
                    return _.filter(me.LeafProjectsByScrumGroup[sgc.ScrumGroupRootProjectOID] || [], function (item1) {
                        return _.some(me.FilteredLeafProjects, function (item2) {
                            return item1.data.ObjectID == item2.data.ObjectID;
                        });
                    }).length;

                });
                activePortfolioOIDs = _.map(activeScrumGroups, function (sgc) {
                    return me.getPortfolioOIDForScrumGroupRootProjectRecord(me.createDummyProjectRecord({ObjectID: sgc.ScrumGroupRootProjectOID}));
                });
                return [].concat.apply([], _.map(activePortfolioOIDs, function (oid) {
                    return me.PortfolioProjectToPortfolioItemMap[oid];
                }));
            }
        },

        /************************************ Ribbon rendering ************************************/
        getPieChartConfig: function () {
            var me = this,
            // Create data for the chart using each grid's data
                chartData = _.map(Ext.getCmp('gridsContainer').query('rallygrid'), function (grid) {
                    return {
                        name: grid.originalConfig.title,
                        y: grid.originalConfig.data.length,
                        totalCount: grid.originalConfig.totalCount,
                        gridID: grid.originalConfig.id,
                        model: grid.originalConfig.model
                    };
                });

            // Change data if no problem stories are found
            if (_.every(chartData, function (item) {
                    return item.y === 0;
                })) {
                chartData = [{
                    name: 'Everything is correct!',
                    y: 1,
                    totalCount: 1,
                    color: '#2ECC40', //GREEN
                    model: ''
                }];
            }

            // Create the chart config
            return {
                chart: {
                    height: 370,
                    marginLeft: -15,
                    plotBackgroundColor: null,
                    plotBorderWidth: 0,
                    plotShadow: false
                },
                colors: me.chartColors,
                title: {text: null},
                tooltip: {enabled: false},
                plotOptions: {
                    pie: {
                        dataLabels: {
                            enabled: true,
                            distance: 25,
                            crop: false,
                            overflow: 'none',
                            formatter: function () {
                                var str = '<b>' + this.point.name + '</b>: ' + this.point.y;
                                return str + '/' + this.point.totalCount;
                            },
                            style: {
                                cursor: 'pointer',
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
                    size: 260,
                    point: {
                        events: {
                            click: function (e) {
                                if (e.point.gridID) Ext.get(e.point.gridID).scrollIntoView(me.el);
                                e.preventDefault();
                            }
                        }
                    },
                    data: chartData
                }]
            };
        },
        getHeatMapConfig: function () {
            var me = this, finalProjects;
            highestNum = 0,
                userStoryGrids = _.filter(Ext.getCmp('gridsContainer').query('rallygrid'), function (grid) {
                    if (grid.originalConfig.model == 'UserStory' || grid.originalConfig.model == 'PortfolioItem/Epic' || grid.originalConfig.model == 'PortfolioItem/Feature')
                        return grid.originalConfig.model;
                });
            userStoryGrids.reverse();
            chartData = [],
                tempProjects = [];
            selectIdFunctionName = '_selectId' + (Math.random() * 10000 >> 0);
            //Filter the projects to make a list of the project with feature or Epic count. Remove the projects with zero count
            _.each(userStoryGrids, function (grid, gindex) {
                _.each(_.sortBy(me.FilteredAllProjectsAndEpicProjects, function (p) {
                    return p.data.Name;
                }), function (project, pindex) {
                    var gridCount = me.getProjectStoriesForGrid(project, grid).length;
                    highestNum = Math.max(gridCount, highestNum);
                    if (gridCount !== 0) {
                        tempProjects.push(project);
                    }
                });
            });
            me.finalProjects = (_.uniq(tempProjects, function (p) {
                return p.data.Name;
            }));

            // Get the data for each scrum from each grid
            _.each(userStoryGrids, function (grid, gindex) {
                _.each(_.sortBy(me.finalProjects, function (p) {
                    return p.data.Name;
                }), function (project, pindex) {
                    var gridCount = me.getProjectStoriesForGrid(project, grid).length;
                    highestNum = Math.max(gridCount, highestNum);
                    //only push the rows (rule categories) which are selected in the "Edit App Settings"

                    //if (me.rules[gindex]) {
                        chartData.push([pindex, gindex, gridCount]);
                    //} else {
                    //    console.log("skipping row index ", gindex);
                    //}
                });
            });


            // Function for scrolling to grid
            window[selectIdFunctionName] = function (gridId) {
                Ext.get(gridId).scrollIntoView(me.el);
            };

            //check the number of rules selected (which will be the rows) in order to set the height.
            var rowCount = 0;
            for (var k = 0; k < me.rules.length; k++) {
                if (me.rules[k]) {
                    rowCount++;
                }
            }
            console.log("rowCount: ", rowCount);
            //set height based on number of rows (rule categories)
            var height = (53 * rowCount) + 60;

            // Create the map config
            console.log("heatmap config is being created");
            console.log("chartData: ", chartData);
            return {
                chart: {
                    type: 'heatmap',
                    height: 370, //height
                    marginTop: 10,
                    marginLeft: 140,
                    marginBottom: 80
                },
                colors: ['#AAAAAA'],
                title: {text: null},
                xAxis: {
                    categories: _.sortBy(_.map(me.finalProjects,
                            //function(project){ return project[0].data.Name; }),
                            function (project) {
                                return project.data.Name;
                            }),
                        function (p) {
                            return p;
                        }),
                    labels: {
                        style: {width: 100},
                        formatter: function () {
                            var text = '<span title="' + this.value + '" class="heatmap-xlabel-text">' + this.value + '</span>';
                            return '<a class="heatmap-xlabel">' + text + '</a>';
                        },
                        useHTML: true,
                        rotation: -45
                    }
                },
                yAxis: {
                    categories: _.map(userStoryGrids, function (grid) {
                        console.log("yAxis categories");
                        return grid.originalConfig.title;
                    }),
                    title: null,
                    labels: {
                        formatter: function () {
                            var text = this.value;
                            var index = _.indexOf(this.axis.categories, text);
                            //console.log("index: ", index, " text: ", text);

                            //console.log("rules[" + index + "]: " + me.rules[index] + " and ruleCategories:", ruleCategories[index]);
                            //if (me.rules[index]) {
                                //The checkbox is checked, so show this rule
                                var gridID = userStoryGrids[index].originalConfig.id;
                                var styleAttr = 'style="background-color:' + me.chartColors[index] + '"';
                                console.log("index: ", index, " ----- gridID: " + gridID + " ---- text: ", text, " color: "+ me.chartColors[index]);
                                return '<div class="heatmap-ylabel"' + styleAttr + ' onclick="' +
                                    selectIdFunctionName + '(\'' + gridID + '\')">' + text + '</div>';
                            //} else {
                                //console.log("The checkbox is not checked, so do not show this rule: ", index);
                                //skip this rule.
                                //chartData.rows[index].remove();
                                //return;
                            //}
                        },
                        useHTML: true
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
                                click: function (e) {
                                    var point = this,
                                        scrum = _.sortBy(me.finalProjects, function (p) {
                                            return p.data.Name;
                                        })[point.x],
                                        grid = userStoryGrids[point.y];
                                    me.onHeatmapClick(point, scrum, grid);
                                }
                            }
                        }
                    }
                },
                legend: {enabled: false},
                tooltip: {enabled: false},
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
        hideHighchartsLinks: function () {
            $('.highcharts-container > svg > text:last-child').hide();
        },
        buildRibbon: function () {
            var me = this;
            $('#pie').highcharts(me.getPieChartConfig());
            $('#heatmap').highcharts(me.getHeatMapConfig());
            me.hideHighchartsLinks();
        },

        /**
         Creates a Rally grid based on the given configuration
         */
        addGrid: function (gridConfig) {
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                randFunctionName = '_scrollToTop' + (Math.random() * 10000 >> 0);

            window[randFunctionName] = function () {
                Ext.get('controlsContainer').scrollIntoView(me.el);
            };

            var getGridTitleLink = function (data, model) {
                    var hasData = !!data,
                        countNum = data && data.length,
                        countDen = gridConfig.totalCount,
                        pointNum = data && (100 * _.reduce(data, function (sum, item) {
                                item = item.data || item;//having issue due to caching so hacking it
                                return sum + (item.LeafStoryPlanEstimateTotal || 0);
                            }, 0) >> 0) / 100,
                        pointDen = gridConfig.totalPoints,
                        type = (model === 'UserStory' ? 'Epics' : lowestPortfolioItemType + 's');
                    return sprintf([
                            '<span class="data-integrity-grid-header-left">',
                            '%s',
                            '<span class="data-integrity-grid-header-stats">%s<br/>%s</span>',
                            '</span>',
                            '<span class="data-integrity-grid-header-top-link"><a onclick="%s()">Top</a></span>'
                        ].join(''),
                        gridConfig.title + (hasData ? '<br>' : ''),
                        hasData ? sprintf('<b>%s:</b> %s/%s (%s%%)', type, countNum, countDen, (countNum / countDen * 10000 >> 0) / 100) : '',
                        (hasData && model == 'Epics') ? sprintf('<b>Points:</b> %s/%s (%s%%)', pointNum, pointDen, (pointNum / pointDen * 10000 >> 0) / 100) : '',
                        randFunctionName);
                },
                storeModel = (gridConfig.model == 'UserStory') ? me.PortfolioEpicStore.model : me.PortfolioItemStore.model,
                grid = Ext.getCmp('grids' + gridConfig.side).add(gridConfig.data.length ?
                        Ext.create('Rally.ui.grid.Grid', {
                            title: getGridTitleLink(gridConfig.data, gridConfig.model),
                            id: gridConfig.id,
                            cls: 'grid-unhealthy data-integrity-grid rally-grid',
                            context: this.getContext(),
                            columnCfgs: gridConfig.columns,
                            enableBulkEdit: true,
                            emptyText: ' ',
                            originalConfig: gridConfig,
                            gridContainer: Ext.getCmp('grids' + gridConfig.side),
                            pagingToolbarCfg: {
                                pageSizes: [10, 15, 25, 100],
                                autoRender: true,
                                resizable: false,
                                changePageSize: function (combobox, newSize) {
                                    newSize = newSize[0].get('value');
                                    if (this._isCurrentPageSize(newSize)) return false;
                                    else {
                                        Ext.getCmp(gridConfig.id).reconfigure(Ext.create('Rally.data.custom.Store', {
                                            model: storeModel,
                                            pageSize: newSize,
                                            data: gridConfig.data,
                                            autoLoad: false
                                        }));
                                        this._reRender();
                                        return true;
                                    }
                                }
                            },
                            store: Ext.create('Rally.data.custom.Store', {
                                model: storeModel,
                                pageSize: 10,
                                data: gridConfig.data,
                                autoLoad: false
                            })
                        }) :
                        Ext.create('Rally.ui.grid.Grid', {
                            title: getGridTitleLink(),
                            id: gridConfig.id,
                            cls: ' data-integrity-grid grid-healthy',
                            context: this.getContext(),
                            showPagingToolbar: false,
                            showRowActionsColumn: false,
                            emptyText: '0 Problems!',
                            originalConfig: gridConfig,
                            gridContainer: Ext.getCmp('grids' + gridConfig.side),
                            store: Ext.create('Rally.data.custom.Store', {data: []})
                        })
                );
            return grid;
        },

        isUserStoryInRelease: function (userStoryRecord, releaseRecord) {
            var me = this,
                lowestPortfolioItem = me.PortfolioItemTypes[0];
            return ((userStoryRecord.data.Release || {}).Name === releaseRecord.data.Name) ||
                (!userStoryRecord.data.Release && ((userStoryRecord.data[lowestPortfolioItem] || {}).Release || {}).Name === releaseRecord.data.Name);
        },

        /**
         Creates grids with filtered results for the user stories/Portfolio items and adds them to the screen
         */
        buildGrids: function () {
            var me = this;
            midPortfolioItemType = me.PortfolioItemTypes[1],
                filteredEpics = me.getEpicsForReport(),
                filteredLowestPortfolioItems = me.getFilteredLowestPortfolioItems(),
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                releaseName = me.ReleaseRecord.data.Name,
                releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate),
                releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate),
                now = new Date(),
                defaultUserStoryColumns = [{
                    text: 'FormattedID',
                    dataIndex: 'FormattedID',
                    editor: false
                }, {
                    text: 'Name',
                    dataIndex: 'Name',
                    editor: false
                }].concat(!me.CurrentScrum ? [{
                        text: 'Portfolio',
                        dataIndex: 'Project',
                        editor: false
                    }] : []).concat([{
                        text: 'Owner',
                        dataIndex: 'Owner',
                        editor: false
                    }]),
                defaultLowestPortfolioItemColumns = [{
                    text: 'FormattedID',
                    dataIndex: 'FormattedID',
                    editor: false
                }, {
                    text: 'Name',
                    dataIndex: 'Name',
                    editor: false
                }, {
                    text: 'PlannedEndDate',
                    dataIndex: 'PlannedEndDate',
                    editor: false
                }, {
                    text: 'PlannedStartDate',
                    dataIndex: 'PlannedStartDate',
                    editor: false
                }].concat([{
                        text: 'Parent',
                        dataIndex: 'Parent',
                        editor: false
                    }]);
            var gridConfigs = [];
            /*
             To set the grid, check if each rule should be added to the gridConfigs object.
             This can't be in a loop, because each row has it's own unique properties
             */
            console.log("me.rules: ", me.rules);

            if (me.rules[0]) {
                //The checkbox is checked, so show this rule
                gridConfigs.push({
                    showIfLeafProject: true,
                    showIfHorizontalMode: true,
                    title: ruleCategories[0],
                    id: ruleCategorySelectors[0],
                    model: 'UserStory', //+ midPortfolioItemType,
                    columns: defaultUserStoryColumns.concat([{
                        text: 'Parent',
                        dataIndex: 'Parent',
                        editor: false
                    }]),
                    side: 'Left',
                    filterFn: function (item) {
                        if (!item.data.Parent)
                            return item.data.Name;
                    }
                });
            }else {
                console.log("Skipping ", ruleCategories[0]);
            }

            if (me.rules[1]) {
                //The checkbox is checked, so show this rule
                gridConfigs.push({
                    showIfLeafProject: true,
                    showIfHorizontalMode: true,
                    title: ruleCategories[1],
                    id: ruleCategorySelectors[1],
                    model: 'UserStory',
                    columns: defaultUserStoryColumns.concat([{
                        text: 'Planned Start Date',
                        dataIndex: 'PlannedStartDate',
                        tdCls: 'editor-cell'
                    }, {
                        text: 'Planned End Date',
                        dataIndex: 'PlannedEndDate',
                        tdCls: 'editor-cell'
                    }]),
                    side: 'Left',
                    filterFn: function (item) {
                        if (item.data.FormattedID == "E3716") {
                            console.log(item.data.FormattedID);
                        }
                        if (item.data.PlannedStartDate && item.data.PlannedEndDate) return false;
                        return item.data.Name;
                    }
                });
            } else {
                console.log("Skipping ", ruleCategories[1]);
            }

            if (me.rules[2]) {
                gridConfigs.push({
                    showIfLeafProject: true,
                    showIfHorizontalMode: true,
                    title: ruleCategories[2],
                    id: ruleCategorySelectors[2],
                    model: 'UserStory',
                    columns: defaultUserStoryColumns.concat([
                        {
                            text: 'ScheduleState',
                            dataIndex: 'ScheduleState',
                            tdCls: 'editor-cell'
                        }]),
                    side: 'Left',
                    filterFn: function (item) {
                        return new Date(item.data.PlannedEndDate) < now && item.data.ScheduleState != 'Accepted';
                    }
                });
            } else {
                console.log("skipping ", ruleCategories[2]);
            }

            if (me.rules[3]) {
                gridConfigs.push({
                    showIfLeafProject: true,
                    showIfHorizontalMode: true,
                    title: ruleCategories[3],
                    id: ruleCategorySelectors[3],
                    model: 'PortfolioItem/' + lowestPortfolioItemType,
                    columns: defaultLowestPortfolioItemColumns.concat([
                        {
                            text: 'ScheduleState',
                            dataIndex: 'ScheduleState',
                            tdCls: 'editor-cell'
                        }]).concat(!me.CurrentScrum ? [{
                        text: 'Portfolio',
                        dataIndex: 'Project',
                        editor: false
                    }] : []),
                    side: 'Right',
                    filterFn: function (item) {
                        return new Date(item.data.PlannedEndDate) < now && item.data.ScheduleState != 'Accepted';
                    }
                });
            } else {
                console.log("skipping ", ruleCategories[3]);
            }

            if (me.rules[4]) {
                gridConfigs.push({
                    showIfLeafProject: false,
                    showIfHorizontalMode: false,
                    title: ruleCategories[4],
                    id: ruleCategorySelectors[4],
                    model: 'PortfolioItem/' + lowestPortfolioItemType,
                    columns: defaultLowestPortfolioItemColumns.concat(!me.CurrentScrum ? [{
                        text: 'Portfolio',
                        dataIndex: 'Project',
                        editor: false
                    }] : []),
                    side: 'Right',
                    filterFn: function (item) {
                        if (!item.data.Parent)
                            return item.data.Name;
                    }
                });
            } else {
                console.log("skipping ", ruleCategories[4]);
            }

            if (me.rules[5]) {
                gridConfigs.push({
                    showIfLeafProject: false,
                    showIfHorizontalMode: false,
                    title: ruleCategories[5],
                    id: ruleCategorySelectors[5],
                    model: 'PortfolioItem/' + lowestPortfolioItemType,
                    columns: defaultLowestPortfolioItemColumns.concat([
                        {
                            text: 'ScheduleState',
                            dataIndex: 'ScheduleState',
                            tdCls: 'editor-cell'
                        }]).concat(!me.CurrentScrum ? [{
                        text: 'Portfolio',
                        dataIndex: 'Project',
                        editor: false
                    }] : []),
                    side: 'Right',
                    filterFn: function (item) {
                        if (item.data.PlannedStartDate && item.data.PlannedEndDate) return false;
                        return item.data.Name;
                    }
                });
            } else {
                console.log("skipping ", ruleCategories[5]);
            }

            if (me.rules[6]) {
                gridConfigs.push({
                    showIfLeafProject: false,
                    showIfHorizontalMode: false,
                    title: ruleCategories[6],
                    id: ruleCategorySelectors[6],
                    model: 'PortfolioItem/' + lowestPortfolioItemType,
                    columns: defaultLowestPortfolioItemColumns.concat([
                        {
                            text: 'ScheduleState',
                            dataIndex: 'ScheduleState',
                            tdCls: 'editor-cell'
                        }]).concat(!me.CurrentScrum ? [{
                        text: 'Portfolio',
                        dataIndex: 'Project',
                        editor: false
                    }] : []),
                    side: 'Right',
                    filterFn: function (item) {
                        item = item.data || item;//having issue due to caching so hacking it
                        if (!item.Release || item.Release.Name != releaseName) return false;
                        return !me.PortfolioUserStoryCount[item.ObjectID];
                    }

                });
            } else {
                console.log("skipping ", ruleCategories[6]);
            }

            return Q.all(_.map(gridConfigs, function (gridConfig) {
                if (!gridConfig.showIfLeafProject && (me.isScopedToScrum || me.ScopedTeamType)) return Q();
                else if (!gridConfig.showIfHorizontalMode && me.isHorizontalView) return Q();
                else {
                    var list = gridConfig.model == 'UserStory' ? filteredEpics : filteredLowestPortfolioItems;
                    gridConfig.data = _.filter(list, gridConfig.filterFn);
                    gridConfig['total' + (gridConfig.model == 'UserStory' ? 'Epics' : lowestPortfolioItemType + 's')] = list;
                    gridConfig.totalCount = list.length;
                    /*gridConfig.totalPoints = (100*_.reduce(list, function(sum, item){
                     item = item.data || item; //having issue with cache
                     return sum + item.LeafStoryPlanEstimateTotal; }, 0)>>0)/100;*/
                    return me.addGrid(gridConfig);
                }
            }));
        },

        /**************************************** Event Handling **********************************/
        horizontalGroupPickerSelected: function (combo, records) {
            var me = this;
            me.clearTooltip();
            me.ScopedHorizontal = combo.getValue();
            me.ScopedTeamType = '';
            me.TeamPicker.setValue('All');
            me.setLoading(true);
            me.loadNonConfigDataFromCacheOrRally()
                .then(function () {
                    return me.renderVisuals();
                })
                .then(function () {
                    me.TeamPicker.bindStore(Ext.create('Ext.data.Store', {
                        fields: ['Type'],
                        data: me.getTeamPickerValues()
                    }));
                })
                .fail(function (reason) {
                    me.alert('ERROR', reason);
                })
                .then(function () {
                    me.setLoading(false);
                })
                .done();
        }

        ,
        releasePickerSelected: function (combo, records) {
            var me = this;
            me.clearTooltip();
            me.ReleaseRecord = _.find(me.ReleaseRecords, function (rr) {
                return rr.data.Name == records[0].data.Name;
            });
            me.setLoading(true);
            me.loadNonConfigDataFromCacheOrRally()
                .then(function () {
                    return me.renderVisuals();
                })
                .fail(function (reason) {
                    me.alert('ERROR', reason);
                })
                .then(function () {
                    me.setLoading(false);
                })
                .done();
        }
        ,
        teamPickerSelected: function (combo, records) {
            var me = this;
            me.clearTooltip();
            if (combo.getValue() !== 'All') me.ScopedTeamType = combo.getValue();
            else me.ScopedTeamType = '';
            me.setLoading(true);
            me.applyProjectFilters()
                .then(function () {
                    return me.renderVisuals();
                })
                .fail(function (reason) {
                    me.alert("ERROR", reason);
                })
                .then(function () {
                    me.setLoading(false);
                })
                .done();
        }
        ,

        /**
         Displays a tool tip when a point on the heat map is clicked
         */
        onHeatmapClick: function (point, scrum, grid) {
            var me = this,
                panelWidth = 320,
                rect = point.graphic.element.getBoundingClientRect(),
                leftSide = rect.left,
                rightSide = rect.right,
                topSide = rect.top,
                showLeft = leftSide - panelWidth > 0,
                x = point.x,
                y = point.y,
                storyDen = me.getProjectStoriesForRelease(scrum, grid).length,
                storyNum = me.getProjectStoriesForGrid(scrum, grid).length,
                pointDen = (100 * me.getProjectPointsForRelease(scrum, grid) >> 0) / 100,
                pointNum = (100 * me.getProjectPointsForGrid(scrum, grid) >> 0) / 100,
                storyPer = (10000 * storyNum / storyDen >> 0) / 100,
                pointPer = (10000 * pointNum / pointDen >> 0) / 100;

            // Clears tool tip and returns if the position hasn't changed
            if (me.tooltip && me.tooltip.x == x && me.tooltip.y == y) return me.clearTooltip();
            me.clearTooltip();

            // Builds the tool tip
            me.tooltip = {
                x: x,
                y: y,
                panel: Ext.widget('container', {
                    floating: true,
                    width: panelWidth,
                    autoScroll: false,
                    id: 'HeatmapTooltipPanel',
                    cls: 'intel-tooltip',
                    focusOnToFront: false,
                    shadow: false,
                    renderTo: Ext.getBody(),
                    items: [{
                        xtype: 'container',
                        layout: 'hbox',
                        cls: 'intel-tooltip-inner-container',
                        items: [{
                            xtype: 'container',
                            cls: 'intel-tooltip-inner-left-container',
                            flex: 1,
                            items: [{
                                xtype: 'rallygrid',
                                title: scrum.data.Name,
                                columnCfgs: [{
                                    dataIndex: 'Label',
                                    width: 60,
                                    draggable: false,
                                    sortable: false,
                                    resizable: false,
                                    editable: false
                                }, {
                                    text: 'Outstanding',
                                    dataIndex: 'Outstanding',
                                    width: 85,
                                    draggable: false,
                                    sortable: false,
                                    resizable: false,
                                    editable: false
                                }, {
                                    text: 'Total',
                                    dataIndex: 'Total',
                                    width: 60,
                                    draggable: false,
                                    sortable: false,
                                    resizable: false,
                                    editable: false
                                }, {
                                    text: '% Problem',
                                    dataIndex: 'Percent',
                                    width: 70,
                                    draggable: false,
                                    sortable: false,
                                    resizable: false,
                                    editable: false
                                }],
                                store: Ext.create('Rally.data.custom.Store', {
                                    data: [{
                                        Label: (grid.config.originalConfig.model == 'UserStory' ? 'Epics' : lowestPortfolioItemType + 's'),
                                        Outstanding: storyNum,
                                        Total: storyDen,
                                        Percent: storyPer + '%'
                                    }/*,{
                                     Label:'Points',
                                     Outstanding:pointNum,
                                     Total:pointDen,
                                     Percent:pointPer + '%'
                                     }*/]
                                }),
                                showPagingToolbar: false,
                                showRowActionsColumn: false
                            }, {
                                xtype: 'button',
                                id: 'heatmap-tooltip-goto-button',
                                text: 'GO TO THIS GRID',
                                handler: function () {
                                    me.clearTooltip();
                                    Ext.get(grid.originalConfig.id).scrollIntoView(me.el);
                                }
                            }]
                        }, {
                            xtype: 'button',
                            cls: 'intel-tooltip-close',
                            text: 'X',
                            width: 20,
                            handler: function () {
                                me.clearTooltip();
                            }
                        }]
                    }],
                    listeners: {
                        afterrender: function (panel) {
                            // Move tooltip to left or right depending on space
                            panel.setPosition(showLeft ? leftSide - panelWidth : rightSide, topSide);
                        }
                    }
                })
            };
            me.tooltip.triangle = Ext.widget('container', {
                floating: true,
                width: 0, height: 0,
                focusOnToFront: false,
                shadow: false,
                renderTo: Ext.getBody(),
                listeners: {
                    afterrender: function (panel) {
                        setTimeout(function () {
                            panel.addCls('intel-tooltip-triangle');
                            // Move tooltip to left or right depending on space
                            panel.setPosition(showLeft ? leftSide - 10 : rightSide - 10, topSide);
                        }, 10);
                    }
                }
            });
        }
        ,

        /**************************************** Tooltip Functions *******************************/
        clearTooltip: function () {
            var me = this;
            if (me.tooltip) {
                me.tooltip.panel.hide();
                me.tooltip.triangle.hide();
                me.tooltip.panel.destroy();
                me.tooltip.triangle.destroy();
                me.tooltip = null;
            }
        }
        ,
        initRemoveTooltipOnScroll: function () {
            var me = this;
            setTimeout(function addScrollListener() {
                if (me.getEl()) me.getEl().dom.addEventListener('scroll', function () {
                    me.clearTooltip();
                });
                else setTimeout(addScrollListener, 10);
            }, 0);
        }
        ,

        /**************************************** Utility Functions *******************************/
        /**
         Searches current URL for override arguments
         */
        processURLOverrides: function () {
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
        }
        ,

        createDummyProjectRecord: function (dataObject) {
            return {data: dataObject};
        }
        ,

        /**
         Fixes the stories so that the sync request pulls the correct data.
         When Rally syncs edited data, the returned object uses the top level
         keys from the raw section of the model.
         */
        fixRawUserStoryAttributes: function () {
            var me = this,
                stories = me.UserStoryStore.getRange();
            for (var i in stories) {
                for (var j in me.UserStoryFetchFields) {
                    if (!stories[i].raw[me.UserStoryFetchFields[j]]) stories[i].raw[me.UserStoryFetchFields[j]] = 0;
                }
            }
        }
        ,

        /**
         Fixes the schedule state editor for grid editing so that bulk editing does
         not error out. This DOES still set Blocked and Ready appropriately.
         There is a line of code in the original implementation that depends on the ownerCt
         of the combobox to have a reference to the editingPlugin...which we can't give it.

         IMPORTANT! Bulk editing schedule state will not work without this
         */
        fixScheduleStateEditor: function () {
            var me = this;
            me.UserStory.getField('ScheduleState').editor = {
                xtype: 'rallyfieldvaluecombobox',
                autoExpand: true,
                field: me.UserStory.getField('ScheduleState'),
                selectOnFocus: false,
                editable: false,
                listeners: {
                    beforeselect: function () {
                        // Set all of the records Blocked and Ready to false
                    }
                },
                storeConfig: {
                    autoLoad: false
                }
            };
        }
    });
})();