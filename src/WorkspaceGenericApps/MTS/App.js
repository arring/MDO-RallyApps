(function () {
    var Ext = window.Ext4 || window.Ext;
    var violatingTeams = [];
    var violatingTeamsFull = {};
    var originalGridData = [];
    var filteredTeams = false;
    var rowStripeTracker = 0;

    Ext.define('Intel.MTS', {
        extend: 'Intel.lib.IntelRallyTrainsGridApp',
        mixins: [
            'Intel.lib.mixin.WindowListener',
            'Intel.lib.mixin.PrettyAlert',
            'Intel.lib.mixin.IframeResize',
            'Intel.lib.mixin.ParallelLoader',
            'Intel.lib.mixin.UserAppsPreference',
            'Intel.lib.mixin.HorizontalTeamTypes',
            'Intel.lib.mixin.Caching'
        ],
        settingsScope: 'workspace',
        getSettingsFields: function () {
            return [{
                name: 'cacheUrl',
                xtype: 'rallytextfield'
            }];
        },
        config: {
            defaultSettings: {
                cacheUrl: 'https://localhost:45557/api/v1.0/custom/rally-app-cache/'
                //https://localhost:45557/api/v1.0/custom/rally-app-cache/'
                //https://proceffrpt-test.intel.com/api/v1.0/custom/rally-app-cache/
                //https://proceffrpt.intel.com/api/v1.0/custom/rally-app-cache/
            }
        },
        getCacheUrlSetting: function () {
            var me = this;
            return me.getSetting('cacheUrl');
        },
        getCachePayloadFn: function (payload) {
            var me = this;
            me.trainFeatureMap = payload.trainFeatureMap;
            me.projectFeatureMap = payload.projectFeatureMap;
        },
        setCachePayLoadFn: function (payload) {
            var me = this;
            //payload.ScrumGroupConfig = null;
            payload.trainFeatureMap = me.trainFeatureMap;
            payload.projectFeatureMap = me.projectFeatureMap;
        },
        cacheKeyGenerator: function () {
            var me = this;
            var projectOID = me.getContext().getProject().ObjectID;
            var releaseOID = me.ReleaseRecord.data.ObjectID;
            var releaseName = me.ReleaseRecord.data.Name;
            console.log('MTS-' + projectOID + '-' + releaseOID);
            return 'MTS-' + (projectOID) + '-' + releaseOID;
        },
        getCacheTimeoutDate: function () {
            return new Date(new Date() * 1 + 1000 * 60 * 60);
        },

        /**___________________________________ DATA STORE METHODS ___________________________________*/

        /*
         - Get all user stories and classify by train and scrum team
         - from the user stories, get the distinct features
         - From all features (in release)  get the Train to which they belong to
         - Given a train and scrum team, show the number of features (from user stories) that belong to that train
         */
        loadReportData: function () {
            var me = this;
            //Do we have cache? If not, then load features and use stories
            return me.getCache().then(function (cacheHit) {
                if (!cacheHit) {
                    //console.log("loadReportData: We don't have cache");
                    //We do not have cache data, so get live data
                    me.setLoading('Loading Features and User Stories Data...');
                    return Q.all([
                        me._loadFeatures(),
                        me._loadUserStories()
                    ]);
                }
            });

        },
        setScrumDataValue: function (container, scrumGroupName, projectName) {
            // get stories for train/scrum
            // if feature of story belongs to this train then add 1
            var me = this;
            container.featureCount = 0;
            container.features = [];

            var featuresInProject = me.projectFeatureMap[scrumGroupName][projectName];

            //For each of the features that the scrum team (project) is working on
            _.each(featuresInProject, function (featureID) {
                //Find that feature by ID in the trainFeatureMap.
                var f = me.trainFeatureMap[featureID];
                if (f && f.train == scrumGroupName) {
                    //Train owning the feature is equal to the train which is working on the feature
                    //add it to this train, horizontal, and scrum combo.
                    container.features.push(f.featureID + ": " + f.feature);
                    container.featureCount++;
                }
            });
        },
        findDuplicates: function (arr) {
            var duplicates = [];
            var holder = {};
            _.each(arr, function (item) {
                if (holder[item] === true) {
                    duplicates.push(item);
                } else {
                    holder[item] = true;
                }
            });
            duplicates = _.uniq(duplicates);
            return duplicates;
        },
        _createGridDataHash: function () {
            var me = this;

            /**
             * Process:
             * _createGridDataHash in the MTS/App.js first calls _createGridDataHash from
             * lib/intel-rally-trains-grid-app.js. Next, it runs _updateGridDataHash here,
             * and then _findViolations, which both do data manipulation and formatting.
             * They edit and perfect me.GridData so that when the grid is loaded it will
             * be correct.
             * Lastly, it calls updateCache, from caching.js. This will save the data
             * we just loaded into the cache file, so that next time it loads it will be able
             * to load it from the cached file, enabling a much faster report.
             */
            return me.getCache().then(function (cacheHit) {
                if (!cacheHit) {
                    //console.log("_createGridDataHash in MTS: We do not have cache.");
                    //We do not have cache data, so get live data...
            //        //Q.all([
                        me.superclass._createGridDataHash.call(me);
                        me._updateGridDataHash();
            //        //]).then(function () {
                        me._findViolations();
            //        //}).then(function () {
                        me.updateCache("MTS").fail(function (e) {
                            alert(e);
                            console.error(e);
                        });
            //        //});
                } else {
                    //console.log("_createGridDataHash: We have cache.");
                    me.renderCacheMessage();
                    me.renderGetLiveDataButton();
                }
            }).catch(function (e) {
                console.error(e);
            });
        },
        /**
         * _updateGridDataHash
         * Fills in missing features that are owned by a train which the scrum team
         * is not a member of.
         * If we do not complete this step, the violations will not show.
         * @private
         */
        _updateGridDataHash: function () {
            var me = this;

            //console.log("_updateGridDataHash me.ScrumGroupConfig: ", me.ScrumGroupConfig);

            var temp = _.reduce(me.ScrumGroupConfig, function (hash, train, key) {
                var projectNames = _.map(train.Scrums, function (scrum) {
                    return scrum.data.Name;
                });
                var horizontalMap = me.getAllHorizontalTeamTypeInfosFromProjectNames(projectNames);
                hash[train.ScrumGroupName] = _.reduce(horizontalMap, function (hash, item, key) {
                    var horizontal = (item.horizontal === null) ? "Other" : item.horizontal;
                    hash[horizontal] = _.reduce(horizontalMap, function (hash, r, key) {
                        var horizontal2 = (r.horizontal === null) ? "Other" : r.horizontal;
                        if (horizontal === horizontal2) {
                            var scrumTeamType = r.teamType + " " + r.number;
                            var projectName = r.projectName;
                            if (!hash[projectName]) {
                                hash[projectName] = {
                                    //scrumTeamType: scrumTeamType,
                                    scrumName: projectName,
                                    isViolating: null
                                };
                            }
                            //me.insertMissingFeatures(hash[projectName], train.ScrumGroupName, projectName);

                            var featuresInProject = me.projectFeatureMap[train.ScrumGroupName][projectName];
                            //For each of the features that the scrum team (project) is working on
                            _.each(featuresInProject, function (featureID) {
                                //Find that feature by ID in the trainFeatureMap.
                                var f = me.trainFeatureMap[featureID];
                                if (f && f.train != train.ScrumGroupName) {

                                    //Check for 'null' or 'undefined' on EVERYTHING
                                    if (!me.GridData[f.train]) {
                                        me.GridData[f.train] = {};
                                    }
                                    if (!me.GridData[f.train][horizontal]) {
                                        me.GridData[f.train][horizontal] = {};
                                    }
                                    if (!me.GridData[f.train][horizontal][projectName]) {
                                        me.GridData[f.train][horizontal][projectName] = {
                                            scrumName: projectName,
                                            isViolating: null
                                        };
                                    }
                                    if (!me.GridData[f.train][horizontal][projectName].features) {
                                        me.GridData[f.train][horizontal][projectName].features = [];
                                    }
                                    if (!me.GridData[f.train][horizontal][projectName].featureCount) {
                                        me.GridData[f.train][horizontal][projectName].featureCount = 0;
                                    }
                                    //Make sure we don't add duplicates
                                    if (_.indexOf(me.GridData[f.train][horizontal][projectName].features, f.featureID + ": " + f.feature) == -1) {
                                        //Finally, push into me.GridData.
                                        me.GridData[f.train][horizontal][projectName].features.push(f.featureID + ": " + f.feature);
                                        me.GridData[f.train][horizontal][projectName].featureCount++;
                                    }
                                }
                            });
                        }
                        return hash;
                    }, {});
                    return hash;
                }, {});
                return hash;
            }, {});
        }
        ,
        /**
         * _findViolations
         * Finds the violating teams in me.GridData object. Saves them to a list.
         * A team is violating if it is working on features from more than one train.
         * @private
         */
        _findViolations: function () {
            var me = this;
            //console.log("findViolations me.GridData: ", me.GridData);
            //Save the original
            originalGridData = me.GridData;

            //Search through GridData object to get a list of the teams when they occur
            var teamList = [];
            //for the length of me.GridData
            _.each(me.GridData, function (train) {
                //go through each of the trains and get its horizontals
                _.each(train, function (horizontal) {
                    //go through each of its horizontals and get its teams
                    _.each(horizontal, function (team) {
                        //go through each of the teams, and push the team name name to a list.
                        teamList.push(team.scrumName);
                    });
                });
            });

            //If a team is on the list more than once (DUPLICATE) (mor than one occurrence in me.GridData)
            violatingTeams = me.findDuplicates(teamList);

            //Now that we know which are the violating teams, go through and set the isViolating = true
            // for each occurrence in me.GridData
            var trainKeys = Object.keys(me.GridData);
            var iteration = 0;

            //for the length of me.GridData
            _.each(me.GridData, function (train) {
                var currentTrain = trainKeys[iteration];
                violatingTeamsFull[currentTrain] = {};
                //go through each of the trains and get its horizontals
                _.each(train, function (horizontal, key) {
                    var currentHorizontal = key;
                    violatingTeamsFull[currentTrain][currentHorizontal] = {};
                    //go through each of its horizontals and get its teams
                    _.each(horizontal, function (team) {
                        var currentTeam = team.scrumName;
                        violatingTeamsFull[currentTrain][currentHorizontal][currentTeam] = {};
                        //go through each of the teams, and push the team name name to a list.
                        if (violatingTeams.indexOf(team.scrumName) == -1) {
                            team.isViolating = false;
                            delete violatingTeamsFull[currentTrain][currentHorizontal][currentTeam];
                        } else {
                            team.isViolating = true;
                            //this "team" is violating which means this "horizontal" is violating which means this "train" is violating.
                            violatingTeamsFull[currentTrain][currentHorizontal][currentTeam] = team;
                        }
                    });
                    //clear all the empty ones out
                    if (_.isEmpty(violatingTeamsFull[currentTrain][currentHorizontal])) {
                        delete violatingTeamsFull[currentTrain][currentHorizontal];
                    }
                });
                //clear all the empty ones out
                if (_.isEmpty(violatingTeamsFull[currentTrain])) {
                    delete violatingTeamsFull[currentTrain];
                }
                iteration++;
            });
        },
        getScrumTotalDataValue: function (scrumData) {
            if (scrumData) {
                return {total: scrumData.featureCount};
            } else {
                return {total: 0};
            }
        },
        addScrumTotalDataValue: function (current, scrumData) {
            current.total += scrumData.featureCount;
        },
        getScrumDataValueFromScrumTotal: function (trainTotal) {
            return {
                featureCount: trainTotal.total
            };
        },
        cellCSSClass: "this-class-does-not-exist",
        scrumDataCellRenderer: function (scrumData, flag) {
            var me = this;
            rowStripeTracker++;

            var exists = (scrumData && scrumData.featureCount > 0);
            //console.log("scrumdata: ", scrumData + " exists: ", exists);

            var tooltip_text = exists ? scrumData.scrumName + "\n " + scrumData.features.join("\n") : "";

            //console.log("rowStripeTracker = ", rowStripeTracker, " ----- flag: ", flag);

            //Keep track of what it was last time it ran through this funtion.
            var opposite = "";
            if (me.cellCSSClass === "default-null-odd") {
                opposite = "default-null-odd";
            } else {
                opposite = "default-null-even";
            }

            if (flag && (rowStripeTracker % 2 == 0)) {
                me.cellCSSClass = "default-null-odd";
            }
            else if (flag && ((rowStripeTracker % 2 != 0))) {
                me.cellCSSClass = "default-null-even";
            }
            else if (!flag && (rowStripeTracker % 2 == 0)) {
                me.cellCSSClass = "default-null-even";
            }
            else { //!flag and (rowStripeTracker % 2 != 0)
                me.cellCSSClass = "default-null-odd";
            }


            if (rowStripeTracker % 2 == 0) {
                me.cellCSSClass = "default-null-even";
                if (flag) {
                    //this is a column switch time (we are starting a new column) and this horizontal has an odd number of rows
                    me.cellCSSClass = "default-null-odd";
                }
            } else {
                me.cellCSSClass = "default-null-odd";
                if (flag) {
                    //this is a column switch time (we are starting a new column) and this horizontal has an odd number of rows
                    me.cellCSSClass = "default-null-even";
                } else {

                }
            }
            if (exists && scrumData.isViolating) {
                me.cellCSSClass = "violating";
            } else if (exists && !scrumData.isViolating) {
                me.cellCSSClass = "not-violating";
            }

            return {
                xtype: 'container',
                width: 100,
                cls: me.cellCSSClass,
                items: {
                    xtype: 'component',
                    cls: "a-style",
                    //qtip: tooltip_text,
                    autoEl: {
                        tag: 'a',
                        html: exists ? '<span style="width:100%" title="' + tooltip_text + '">' + scrumData.featureCount + '</span>' : '-'
                    }//,
                    //listeners: {
                    //    rendered: function (c) {
                    //        Ext.QuickTips.register({
                    //            target: c.getEl(),
                    //            text: c.qtip
                    //        });
                    //    }
                    //}
                }
            };
        },
        //scrumDataContainerRenderer: function(scrumDataList){
        //    var me = this;
        //    console.log("scrumDataList.length: ", scrumDataList.length);
        //    var flag = scrumDataList.length;
        //    var itemResult =  _.map(scrumDataList,  me.scrumDataCellRenderer);
        //    return Ext.create('Ext.container.Container', {
        //        layout: {type: 'vbox'},
        //        width: '100%',
        //        padding: 0,
        //        margin: 0,
        //        flex: 1,
        //        items: itemResult
        //    });
        //},
        teamTypeCellRenderer: function (scrumName) {
            var me = this;
            if (violatingTeams) {
                if (violatingTeams.indexOf(scrumName) == -1) {
                    if (scrumName == "-" || scrumName === "") {
                        return {
                            xtype: 'container',
                            flex: 1,
                            width: 200,
                            cls: 'team-type-cell-null',
                            html: scrumName
                        };
                    }
                    return {
                        xtype: 'container',
                        flex: 1,
                        width: 200,
                        cls: 'team-type-cell-not-violating',
                        html: scrumName
                    };
                } else {
                    //Else, this team is found in the list of violating teams so color it red, otherwise green
                    return {
                        xtype: 'container',
                        flex: 1,
                        cls: 'team-type-cell-violating',
                        width: 200,
                        html: scrumName
                    };
                }
            } else {
                return {
                    xtype: 'container',
                    flex: 1,
                    cls: 'team-type-cell-null',
                    width: 200,
                    html: scrumName
                };
            }
        },
        horizontalTotalCellRenderer: function (horizontalData, meta) {
            var hasData = horizontalData.total > 0;
            return hasData ? '<span>' + horizontalData.total + '</span>' : '-';
        },
        finalActions: function () {
            var me = this;
            me.renderFilterButton();
            //Set default to show only violating teams.
            me.toggleTeams();
            return;
        },
        toggleTeams: function () {
            var me = this;
            if (filteredTeams) {
                me.setLoading('Loading Grid...');
                //we need to update the grid to show all teams
                //console.log("Updating the grid to show all teams...");

                //me.superclass.reloadEverything.call(me);

                me.GridData = originalGridData;
                //console.log(">>>> originalGridData = ", originalGridData);
                me.superclass.reloadGrid.call(me);

                //Reset toggle variable
                filteredTeams = false;
                me.setLoading(false);
            } else {
                me.setLoading('Loading Grid...');
                //we need to update the grid to show only violating teams
                //console.log("Updating the grid to show only violating teams...");

                me.GridData = violatingTeamsFull;
                //console.log(">>>>> violatingTeamsFull = ", violatingTeamsFull);
                me.superclass.reloadGrid.call(me);

                //Reset toggle variable
                filteredTeams = true;
                me.setLoading(false);
            }
        },
        /**
         * Creates a message to the user to let them know that they are
         * looking at a cached version of the data
         */
        renderCacheMessage: function () {
            var me = this;
            if(!me.cacheMessage) {
                me.cacheMessage = me.down('#navbox').add({
                    xtype: 'label',
                    width: '100%',
                    html: 'You are looking at the cached version of the data, update last on: ' + '<span class = "modified-date">' + me.lastCacheModified + '</span>'
                });
            }
        },
        /**
         * Creates the "Get Live Data" button which will be used to reload
         * the page data and refresh/udpate the cache
         */
        renderGetLiveDataButton: function () {
            var me = this;
            if(!me.UpdateCacheButton) {
                me.UpdateCacheButton = me.down('#navbox').add({
                    xtype: 'button',
                    text: 'Get Live Data',
                    listeners: {
                        click: function () {
                            me.setLoading('Pulling Live Data, please wait...');

                            me.superclass._createGridDataHash.call(me);
                            me._updateGridDataHash();
                            me._findViolations();

                            //Update the Cached Data
                            me.updateCache("MTS").fail(function (e) {
                                alert(e);
                                console.error(e);
                            });
                        }
                    }
                });
            }
        },
        renderFilterButton: function () {
            var me = this;
            if(!me.toggleFilterButton) {
                me.toggleFilterButton = me.down('#navbox').add({
                    xtype: 'button',
                    text: 'Toggle Show All Teams',
                    cls: 'show-only-button',
                    width: '140',
                    listeners: {
                        click: function () {
                            //console.log("button clicked!");
                            me.setLoading('Updating Grid...');
                            return me.toggleTeams();
                        }
                    }
                });
            }
        },
        _loadFeatures: function () {
            var me = this,
                map = {},
                releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release.Name',
                    value: me.ReleaseRecord.data.Name
                });

            return Q.all(_.map(me.ScrumGroupConfig, function (train) {
                var trainName = train.ScrumGroupName,
                    trainObjectID = train.ScrumGroupRootProjectOID,
                    config = {
                        model: 'PortfolioItem/Feature',
                        compact: false,
                        filters: releaseFilter,
                        fetch: ['ObjectID', 'Name', 'Project'],
                        context: {
                            workspace: null,
                            project: '/project/' + trainObjectID,
                            projectScopeDown: true,
                            projectScopeUp: false
                        }
                    };
                return me.parallelLoadWsapiStore(config).then(function (store) {
                    _.each(store.getRange(), function (featureRecord) {
                        map[featureRecord.data.ObjectID] = {
                            feature: featureRecord.data.Name,
                            featureID: featureRecord.data.ObjectID,
                            train: trainName
                        };
                        //find where feature = "KBL 23e PRQ [49]" or OID 71354886744
                        if (featureRecord.data.ObjectID == 71354886744) {
                            //console.log("trainName: ", trainName);
                            //console.log("featureRecord.data: ", featureRecord.data);
                        }
                    });
                    store.destroyStore();
                });
            }))
                .then(function () {
                    me.trainFeatureMap = map;
                });
        },

        _loadUserStories: function () {
            var me = this,
                map = {};

            return Q.all(_.map(me.ScrumGroupConfig, function (train) {
                var trainName = train.ScrumGroupName,
                    trainObjectID = train.ScrumGroupRootProjectOID,
                    config = {
                        model: 'HierarchicalRequirement',
                        compact: false,
                        filters: me._getUserStoriesFilter(),
                        fetch: ['ObjectID', 'Name', 'Feature', 'Project'],
                        context: {
                            workspace: null,
                            project: '/project/' + trainObjectID,
                            projectScopeDown: true,
                            projectScopeUp: false
                        }
                    };

                map[trainName] = {};
                return me.parallelLoadWsapiStore(config)
                    .then(function (store) {
                        _.each(store.getRange(), function (storyRecord) {
                            var projectName = storyRecord.data.Project.Name,
                                projectOID = storyRecord.data.Project.ObjectID;
                            if (!map[trainName][projectName]) {
                                map[trainName][projectName] = [];
                            }
                            //If this user story has a feature
                            if (storyRecord.data.Feature) {
                                // only track unique occurrences of the feature per train per project

                                if (_.indexOf(map[trainName][projectName], storyRecord.data.Feature.ObjectID) === -1) {
                                    map[trainName][projectName].push(storyRecord.data.Feature.ObjectID);
                                }

                                //find where feature = "KBL 23e PRQ [49]" or OID 71354886744
                                if (storyRecord.data.Feature.ObjectID == 71354886744) {
                                    //console.log("trainName: ", trainName, " and projectName: ", projectName);
                                    //console.log("storyRecord.data: ", storyRecord.data);
                                    //19 Echo user stories tied to 71354886744 feature,
                                    //and 30 Cascade user stories tied to 71354886744 feature
                                }
                            }
                        });
                        store.destroyStore();
                    });
            }))
                .then(function () {
                    me.projectFeatureMap = map;
                });
        },

        _getUserStoriesFilter: function () {
            // get all leaf stories in this release for the leaf projects under the train
            var me = this,
                leafFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'DirectChildrenCount', value: 0}),
                releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release.Name',
                    value: me.ReleaseRecord.data.Name
                }),
                projectFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Project.Children.Name',
                    value: null
                });
            return releaseFilter.and(leafFilter).and(projectFilter);
        }

    });
}
()
)
;