(function () {
    var Ext = window.Ext4 || window.Ext;
    var violatingTeams = [];
    var violatingTeamObj = [];
    var filteredTeams = false;

    Ext.define('Intel.MTS', {
        extend: 'Intel.lib.IntelRallyTrainsGridApp',
        mixins: [
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

        loadReportData: function () {
            var me = this;
            return Q.all([
                me._loadFeatures(),
                me._loadUserStories()
            ]);
        },
        setScrumDataValue: function (container, scrumGroupName, projectName) {
            //console.log("setScrumDataBalue for container:", container);
            //console.log("setScrumDataBalue for scrumGroupName:", scrumGroupName);
            //console.log("setScrumDataBalue for projectName:", projectName);

            // get stories for train/scrum
            // if feature of story belongs to this train then add 1
            var me = this;
            container.featureCount = 0;
            container.features = [];
            var featuresInProject = me.projectFeatureMap[scrumGroupName][projectName];
            _.each(featuresInProject, function (featureID) {
                var f = me.trainFeatureMap[featureID];
                if (f && f.train == scrumGroupName) {
                    container.features.push(f.featureID + ": " + f.feature);
                    container.featureCount++;
                }
            });
        },
        findDuplicates: function (arr) {
            var duplicates = [];
            var cache = {};
            _.each(arr, function (item) {
                if (cache[item] === true) {
                    duplicates.push(item);
                } else {
                    cache[item] = true;
                }
            });
            duplicates = _.uniq(duplicates);
            return duplicates;
        },
        _createGridDataHash: function () {
            var me = this;
            me.superclass._createGridDataHash.call(me);

            //Not available in 2.0 SDK and/or lodash 3.10
            //var violatingTeams = _.uniq(
            //    _.flatMapDeep(me.GridData, function(item){
            //        if(item.scrumName){
            //            return item.scrumName;
            //        }
            //    })
            //);

            console.log("Iterating through the GridData object to find the violating teams...");
            console.log("me.GridData = ", me.GridData);
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

            var trainNames = Object.keys(me.GridData);

            //for the length of me.GridData
            _.each(me.GridData, function (train) {
                //go through each of the trains and get its horizontals
                _.each(train, function (horizontal) {
                    //go through each of its horizontals and get its teams
                    _.each(horizontal, function (team) {
                        //go through each of the teams, and push the team name name to a list.
                        if (violatingTeams.indexOf(team.scrumName) == -1) {
                            team.isViolating = false;
                        } else {
                            team.isViolating = true;
                            //this "team" is violating which means this "horizontal" is violating which means this "train" is violating.
                            violatingTeamObj.push(train);
                        }
                    });
                });
            });
            return;
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
        scrumDataCellRenderer: function (scrumData) {

            var exists = (scrumData && scrumData.featureCount > 0);

            //console.log("scrumdata: ", scrumData + " exists: ", exists);

            var tooltip_text = exists ? scrumData.scrumName + "\n " + scrumData.features.join("\n") : "";

            var className = "default-null";
            if (exists && scrumData.isViolating) {
                className = "violating";
            } else if(exists && !scrumData.isViolating){
                className = "not-violating";
            }

            return {
                xtype: 'container',
                width: 100,
                cls: className,
                items: {
                    xtype: 'component',
                    cls: "a-style",
                    autoEl: {
                        tag: 'a',
                        html: exists ? '<span style="width:100%" title="' + tooltip_text + '">' + scrumData.featureCount + '</span>' : '-'
                    },
                    qtip: "This is a tip",
                    listeners: {
                        rendered: function (c) {
                            Ext.QuickTips.register({
                                target: c.getEl(),
                                text: c.qtip
                            });
                        }
                    }
                }
            };
        },
        teamTypeCellRenderer: function (scrumName) {
            var me = this;
            if (violatingTeams) {
                if (violatingTeams.indexOf(scrumName) == -1) {
                    return {
                        xtype: 'container',
                        flex: 1,
                        width: 200,
                        cls: 'team-type-cell-not-violating',
                        html: scrumName
                    };
                } else {
                    //Else, this team is found in the list of violating teams so color it red
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
        finalActions: function(){
            var me = this;
            me.renderFilterButton();
            return;
        },
        toggleTeams: function(){
            var me = this;
            if(filteredTeams){
                //we need to update the grid to show all teams
                console.log("we need to update the grid to show all teams");
                me.superclass.reloadEverything.call(me);
                //Reset toggle variable
                filteredTeams = false;
            } else {
                //we need to update the grid to show only violating teams
                console.log("we need to update the grid to show only violating teams");
                me.GridData = violatingTeamObj;
                console.log("violatingTeamObj = ", violatingTeamObj);
                me.superclass.reloadGrid.call(me);
                //Reset toggle variable
                filteredTeams = true;
            }
        },
        renderFilterButton: function() {
            var me = this;
            me.toggleFilterButton = me.down('#navbox').add({
                xtype: 'button',
                text: 'Toggle Show Violating Only',
                cls: 'show-only-button',
                width: '140',
                listeners: {
                    click: function() {
                        console.log("button clicked!");
                        return me.toggleTeams();
                    }
                }
            });
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
                            if (storyRecord.data.Feature) {
                                // only track unique occurrences of the feature per train per project
                                if (_.indexOf(map[trainName][projectName], storyRecord.data.Feature.ObjectID) === -1) {
                                    map[trainName][projectName].push(storyRecord.data.Feature.ObjectID);
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