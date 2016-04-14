/** this app shows Cumulative flows for teams of a specific type, and their aggregate output.
	this is scoped to a release. This app assumes you follow scrum naming conventions across your trains
	example: show all 'Array' teams' across all trains for release Q414
*/
(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Intel.FunctionalCFDCharts', {
        extend: 'Intel.lib.IntelRallyApp',
        cls: 'app',
        requires: [
            'Intel.lib.chart.FastCumulativeFlowCalculator'
        ],
        mixins: [
            'Intel.lib.mixin.WindowListener',
            'Intel.lib.mixin.PrettyAlert',
            'Intel.lib.mixin.IframeResize',
            'Intel.lib.mixin.IntelWorkweek',
            'Intel.lib.mixin.CumulativeFlowChartMixin',
            'Intel.lib.mixin.ParallelLoader',
            'Intel.lib.mixin.UserAppsPreference',
            'Intel.lib.mixin.CfdProjectPreference',
            'Intel.lib.mixin.HorizontalTeamTypes',
            'Intel.lib.mixin.Caching'
        ],
        minWidth: 910,
        items: [{
            xtype: 'container',
            layout: 'hbox',
            items: [{
                xtype: 'container',
                id: 'cacheButtonsContainer'
            }, {
                    xtype: 'container',
                    id: 'cacheMessageContainer',
                    cls: 'cachemessageContainer'
                }]
        }, {
                xtype: 'container',
                id: 'navBar',
                layout: 'hbox',
                align: 'left',
                width: '600px'
            }, {
                xtype: 'container',
                width: '100%',
                layout: {
                    type: 'hbox',
                    pack: 'center'
                },
                items: [{
                    xtype: 'container',
                    width: '66%',
                    id: 'aggregateChart'
                }]
            }, {
                xtype: 'container',
                id: 'scrumCharts',
                layout: 'column',
                width: '100%'
            }],
        /**------------------------------------------------APP SETTINGS---------------------------------------------------- */
        getSettingsField: function() {
            return [{ name: 'cacheUrl', xtype: 'rallyTextField' }];
        },
        config: {
            defaultSettings: {
                cacheUrl: ''
            }
        },
        userAppsPref: 'intel-Func-CFD',
        cfdProjPref: 'intel-workspace-admin-cfd-releasedatechange',

        /****************************************************** DATA STORE METHODS ********************************************************/
        loadSnapshotStores: function() {
            var me = this;
            me.TeamStores = {};
            me.AllSnapshots = [];
            return Q.all(_.map(me.ReleasesWithName, function(releaseRecords) {
                return Q.all(_.map(releaseRecords, function(releaseRecord) {
                    var parallelLoaderConfig = {
                        context: {
                            workspace: me.getContext().getWorkspace()._ref,
                            project: null
                        },
                        compress: true,
                        findConfig: {
                            _TypeHierarchy: 'HierarchicalRequirement',
                            Children: null,
                            Release: releaseRecord.data.ObjectID
                        },
                        fetch: ['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID'],
                        hydrate: ['ScheduleState']
                    };
                    return me.parallelLoadLookbackStore(parallelLoaderConfig)
                        .then(function(snapshotStore) {
                            var records = snapshotStore.getRange();
                            if (records.length > 0) {
                                var teamName = releaseRecords[0].data.Project.Name;
                                if (!me.TeamStores[teamName]) me.TeamStores[teamName] = [];
                                me.TeamStores[teamName] = me.TeamStores[teamName].concat(records);
                                me.AllSnapshots = me.AllSnapshots.concat(records);
                            }
                        });
                }));
            }));
        },
        loadAllProjectReleases: function() {
            var me = this,
                releaseName = me.ReleaseRecord.data.Name.split(' ')[0]; //we must split this so we get Light/Rave on the same page!
            me.ReleasesWithName = []; //NOTE: this is a list of lists
            return Q.all(_.map(me.ProjectsOfFunction, function(projectRecord) {
                return me.loadReleasesByNameContainsForProject(releaseName, projectRecord)
                    .then(function(releases) { if (releases.length) me.ReleasesWithName.push(releases); });
            }));
        },
        loadIterations: function() {
            var me = this,
                startDate = Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseStartDate),
                endDate = Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseDate);
            me.ScrumTargetVelocitySum = {};
            return Q.all(_.map(me.ProjectsOfFunction, function(projectRecord) {
                var config = {
                    model: 'Iteration',
                    filters: [{
                        property: "EndDate",
                        operator: ">=",
                        value: startDate
                    }, {
                            property: "StartDate",
                            operator: "<=",
                            value: endDate
                        }],
                    fetch: ["PlannedVelocity"],
                    context: {
                        project: projectRecord.data._ref,
                        projectScopeUp: false,
                        projectScopeDown: false
                    }
                };
                return me.parallelLoadWsapiStore(config).then(function(store) {
                    var totalTargetVelocity = _.reduce(store.getRange(), function(sum, iteration) {
                        var targetVelocity = iteration.data.PlannedVelocity;
                        return sum + targetVelocity;
                    }, 0);
                    totalTargetVelocity = Number(totalTargetVelocity) === "NaN" ? 0 : totalTargetVelocity;
                    if (!me.ScrumTargetVelocitySum[projectRecord.data.Name]) me.ScrumTargetVelocitySum[projectRecord.data.Name] = [];
                    me.ScrumTargetVelocitySum[projectRecord.data.Name] = Number(me.ScrumTargetVelocitySum[projectRecord.data.Name]) + Number(totalTargetVelocity);
                });
            }));
        },
        /******************************************************* Reloading ********************************************************/
        hideHighchartsLinks: function() {
            $('.highcharts-container > svg > text:last-child').hide();
            //find a way to render only legend to share for all
            //TODO: find a better way
            $('#aggregateChart-innerCt .highcharts-container .highcharts-series-group').hide();
            $('#aggregateChart-innerCt .highcharts-container .highcharts-axis').hide();
            $('#aggregateChart-innerCt .highcharts-container .highcharts-axis-labels').hide();
            $('#aggregateChart-innerCt .highcharts-container .highcharts-grid').hide();

        },
        redrawEverything: function() {
            var me = this;
            me.setLoading('Loading Charts');
            //return me.filterUserStoriesByTopPortfolioItem()				
            $('#scrumCharts-innerCt').empty();
            if (!me.DeleteCacheButton) me.renderDeleteCache();
            if (!me.UpdateCacheButton) me.renderUpdateCache();
            if (!me.ReleasePicker) me.renderReleasePicker();
            me.renderCharts();
            me.hideHighchartsLinks();
            me.setLoading(false);

        },
        reloadEverything: function() {
            var me = this;
            me.setLoading('Loading Data');
            return me.loadAllProjectReleases()
                .then(function() { return me.loadSnapshotStores(); })
                .then(function() {
                    $('#scrumCharts-innerCt').empty();
                    me.setLoading('Loading Charts');
                    if (!me.DeleteCacheButton) me.renderDeleteCache();
                    if (!me.UpdateCacheButton) me.renderUpdateCache();
                    if (!me.ReleasePicker) me.renderReleasePicker();
                    me.renderCharts();
                    me.hideHighchartsLinks();
                    me.setLoading(false);
                });
        },
        redrawChartAfterReleaseDateChanged: function() {
            var me = this;
            me.setLoading('Loading Charts');
            $('#scrumCharts-innerCt').empty();
            me.renderCharts();
            me.hideHighchartsLinks();
            me.setLoading(false);
        },
        /*********************************************************Rally Cache Mixin Operations */
        getCacheUrlSetting: function() {
            var me = this;
            return me.getSetting('cacheUrl');
        },
        getCachePayloadFn: function(payload) {
            var me = this;
            me.ProjectRecord = payload.ProjectRecord;
            me.LeafProjects = payload.LeafProjects;
            me.ReleaseRecord = payload.ReleaseRecord;
            me.ReleaseRecords = payload.ReleaseRecords;
            me.AllSnapshots = payload.AllSnapshots;
            me.TeamStores = payload.TeamStores;
            me.TeamType = payload.TeamType;
            me.ProjectsOfFunction = payload.ProjectsOfFunction;
            
        },
        setCachePayLoadFn: function(payload) {
            var me = this;
            userStoryFields = ['Name', 'ObjectID', 'Project', 'Iteration',
                'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState',
                'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', '_ref',
                '_refObjectUUID', '_type', '_objectVersion', '_CreatedAt'],
                projectFields = ['Children', 'Name', 'ObjectID', 'Parent'];

            function filterUserStoryForCacheView(userStoryRecord) {
                var data = _.pick(userStoryRecord.data, userStoryFields);
                data.Iteration = data.Iteration ? _.pick(data.Iteration, ['EndDate', 'Name', 'ObjectID', 'StartDate']) : null;
                data.Project = _.pick(data.Projects, ['Name', 'ObjectID']);
                data.Release = data.Release ? _.pick(data.Release, ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate']) : null;
                return data;
            }

            function filterProjectData(projectData) {
                var data = _.pick(projectData, projectFields);
                data.Parent = _.pick(data.Parent, projectFields);
                data.Children = _.pick(data.Children, ['Count']);
                return { data: data };
            }

            payload.ProjectRecord = filterProjectData(me.ProjectRecord.data);
            payload.LeafProjects = _.map(me.LeafProjects, function(ss) { return filterProjectData(ss.data); });
            payload.TeamType = me.getAllHorizontalTeamTypeInfos([me.ProjectRecord])[0].teamType;
            payload.ProjectsOffFunction = _.map(me.LeafProjects, function(projectRecord) { return filterProjectData(projectRecord.data); });
            payload.ReleaseRecords = _.map(me.ReleaseRecords, function(rr) { return { data: rr.data }; });
            payload.ReleaseRecord = { data: me.ReleaseRecord.data };
            payload.AllSnapshots = _.map(me.AllSnapshots, function(ss) { return { raw: ss.raw }; });
            payload.TeamStores = _.reduce(me.TeamStores, function(map, sss, key) {
                map[key] = _.map(sss, function(ss) { return { raw: ss.raw }; });
                return map;
            }, {});

        },
        cacheKeyGenerator: function() {
            var me = this;
            var projectOID = me.getContext().getProject().ObjectID;
            var hasKey = typeof ((me.AppsPref.projs || {})[projectOID] || {}).Release === 'number';
            if (hasKey) {
                return 'horiz-func-cfd-' + projectOID + '-' + me.AppsPref.projs[projectOID].Release;
            }
            else return undefined;

        },
        getCacheTimeoutDate: function() {
            return new Date(new Date() * 1 + 1000 * 60 * 60 * 24);
        },
        renderCacheMessage: function() {
            var me = this;
            Ext.getCmp('cacheMessageContainer').add({
                xtype: 'label',
                width: '100%',
                html: 'You are looking at the cached version of the data'
            });

        },
        loadDataFromCacheorRally: function() {
            var me = this;
            return me.getCache().then(function(cacheHit) {
                if (!cacheHit) {
                    return me.loadConfiguration()
                        .then(function() { return me.reloadEverything(); })
                        .then(function() {
                            Q.all([
                                me.saveAppsPreference(me.AppsPref),
                                me.updateCache()
                            ])
                                .fail(function(e) {
                                    alert(e);
                                    console.log(e);
                                });
                        });
                } else {
                    me.renderCacheMessage();
                }
            });
        },
        loadConfiguration: function() {
            var me = this;

            return me.configureIntelRallyApp()
                .then(function() {
                    var scopeProject = me.getContext().getProject();
                    return me.loadProject(scopeProject.ObjectID);
                })
                .then(function(scopeProjectRecord) {
                    me.ProjectRecord = scopeProjectRecord;
                    return Q.all([ //parallel loads
                        me.loadAllLeafProjects() /******** load stream 1 *****/
                            .then(function(leafProjects) {
                                me.LeafProjects = leafProjects;
                                if (!me.LeafProjects[me.ProjectRecord.data.ObjectID])
                                    return Q.reject('You are not Scoped to a valid Project');
                                me.TeamType = me.getAllHorizontalTeamTypeInfos([me.ProjectRecord])[0].teamType;
                                me.ProjectsOfFunction = _.filter(me.LeafProjects, function(projectRecord) {
                                    return me.getAllHorizontalTeamTypeInfos([projectRecord])[0].teamType === me.TeamType;
                                });
                            }),
                        Q().then(function() {
                            var twelveWeeks = 1000 * 60 * 60 * 24 * 7 * 12;
                            return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date() * 1 - twelveWeeks));

                        })
                            .then(function(releaseRecords) {
                                me.ReleaseRecords = releaseRecords;
                                var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
                                if (currentRelease) {
                                    me.ReleaseRecord = currentRelease;
                                    me.AppsPref.projs[me.ProjectRecord.data.ObjectID] = { Release: me.ReleaseRecord.data.ObjectID }; //usually will be no-op
                                }
                                else return Q.reject('This project has no releases.');
                            })
                    ]);
                });
        },
        /******************************************************* LAUNCH ********************************************************/
        launch: function() {
            var me = this;
            me.initDisableResizeHandle();
            me.initFixRallyDashboard();
            me.setLoading('Loading Configuration');

            return Q.all([me.loadCfdAllTrainPreference(),
                me.loadAppsPreference().then(function(appsPref) {
                    me.AppsPref = appsPref; //cant cache. per user basis
                })])
                .then(function() { return me.loadDataFromCacheorRally(); })
                .then(function() { return me.redrawEverything(); })
                .fail(function(reason) { me.alert('ERROR', reason); })
                .then(function() { me.setLoading(false); })
                .done();
        },


        /**************************************************** RENDERING Navbar ******************************************/
        renderDeleteCache: function() {
            var me = this;
            me.DeleteCacheButton = Ext.getCmp('cacheButtonsContainer').add({
                xtype: 'button',
                text: 'clear cache data',
                listeners: {
                    click: function() {
                        me.setLoading('Clearing cache, please wait');
                        return me.deleteCache()
                            .then(function() { me.setLoading(false); });
                    }
                }
            });
        },
        renderUpdateCache: function() {
            var me = this;
            me.UpdateCacheButton = Ext.getCmp('cacheButtonsContainer').add({
                xtype: 'button',
                text: 'Get Live Data',
                listeners: {
                    click: function() {
                        me.setLoading("Getting Live Data, please wait");
                        Ext.getCmp('cacheMessageContainer').removeAll();
                        return me.loadConfiguration()
                            .then(function() { return me.reloadEverything(); })
                            .then(function() { return me.updateCache(); })
                            .then(function() { me.setLoading(false); });
                    }
                }
            });
        },

        releasePickerSelected: function(combo, records) {
            var me = this;
            if (me.ReleaseRecord.data.Name === records[0].data.Name) return;
            me.setLoading(true);
            me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr) { return rr.data.Name == records[0].data.Name; });
            var pid = me.ProjectRecord.data.ObjectID;
            if (typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
            me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
            me.saveAppsPreference(me.AppsPref)
                .then(function() {
                    me._resetVariableAfterReleasePickerSelected();
                    return me.reloadEverything();
                })
                .fail(function(reason) { me.alert('ERROR', reason); })
                .then(function() { me.setLoading(false); })
                .done();
        },
        renderReleasePicker: function() {
            var me = this;
            me.ReleasePicker = Ext.getCmp('navBar').add({
                xtype: 'intelreleasepicker',
                labelWidth: 80,
                width: 240,
                releases: me.ReleaseRecords,
                currentRelease: me.ReleaseRecord,
                listeners: { select: me.releasePickerSelected.bind(me) }
            });
        },
        /*Start: CFD Release Start Date Selection Option Component*/
        _resetVariableAfterReleasePickerSelected: function() {
            var me = this;
            me.changedReleaseStartDate = undefined;
        },
        /*End: CFD Release Start Date Selection Option Component*/
        /**************************************************** RENDERING CHARTS ******************************************/
        renderCharts: function() {
            var me = this,
                releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
                releaseEnd = me.ReleaseRecord.data.ReleaseDate,
                calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
                    startDate: releaseStart,
                    endDate: releaseEnd,
                    scheduleStates: me.ScheduleStates
                });

            if (me.AllSnapshots.length === 0) {
                me.alert('ERROR', me.TeamType + ' has no data for release: ' + me.ReleaseRecord.data.Name);
                return;
            }

            /************************************** Aggregate panel STUFF *********************************************/
            var _6days = 1000 * 60 * 60 * 24 * 6;
            me.changedReleaseStartDate = (typeof (me.changedReleaseStartDate) === "undefined") ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate) * 1 + _6days) : me.changedReleaseStartDate;
            //this is to just render the legend to share among the horizontals
            //var targetVelocity =[];
            var updateOptions = { trendType: 'Last2Sprints', date: me.changedReleaseStartDate },
                aggregateChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.AllSnapshots), updateOptions);
			/*_.each(aggregateChartData.categories,function(f){
					targetVelocity.push(10);
				});
				aggregateChartData.series.push({
					colorIndex: 1,
					symbolIndex: 1,
					dashStyle: "shortdash",
					color: "#862A51",
					data: targetVelocity,
					name: "Available Velocity UCL",
					type: "line"
				});		 */
            var aggregateChartContainer = $('#aggregateChart-innerCt').highcharts(
                Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
                    chart: { height: 110 },
                    legend: {
                        enabled: true,
                        verticalAlign: "top"
                    },
                    title: {
                        text: ""
                    },
                    yAxis: {
                        title: {
                            text: ""
                        },
                        labels: {
                            x: -5,
                            y: 4
                        }
                    },
                    xAxis: {
                        tickmarkPlacement: "on",
                        title: {
                            text: "",
                            margin: 10
                        },
                        labels: {
                            y: 20,
                            enabled: false
                        },
                        categories: aggregateChartData.categories,
                        tickInterval: me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth() * 0.66)
                    },
                    series: aggregateChartData.series
                })
            );

            /************************************** Scrum CHARTS STUFF *********************************************/
            var sortedProjectNames = _.sortBy(Object.keys(me.TeamStores), function(projName) {
                return (projName.split('-')[1] || '').trim() + projName;
            }),
                scrumChartConfiguredChartTicks = me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth() * 0.32);
            _.each(sortedProjectNames, function(projectName, key) {
                //Find project Preference for each Train
                var trainName = projectName.split(" ")[projectName.split(" ").length - 1];
                trainChangedReleaseStartDate = !(me.trainPref[trainName]) || _.isEmpty(me.trainPref[trainName].releases) || !(me.trainPref[trainName].releases[me.ReleaseRecord.data.Name]) ? me.changedReleaseStartDate : me.trainPref[trainName].releases[me.ReleaseRecord.data.Name].ReleaseStartDate;

                var updateOptions = { trendType: 'Last2Sprints', date: trainChangedReleaseStartDate },
                    scrumChartData = me.updateCumulativeFlowChartData(calc.runCalculation(me.TeamStores[projectName]), updateOptions),
                    scrumCharts = $('#scrumCharts-innerCt'),
                    scrumChartID = 'scrumChart-no-' + (scrumCharts.children().length + 1);
                scrumCharts.append('<div class="scrum-chart" id="' + scrumChartID + '"></div>');
				/*var scrumTargetVelocity =[];
				_.each(scrumChartData.categories,function(f){
					scrumTargetVelocity.push(me.ScrumTargetVelocitySum[projectName]);
				});
				scrumChartData.series.push({
					colorIndex: 1,
					symbolIndex: 1,
					dashStyle: "shortdash",
					color: "#862A51",
					data: scrumTargetVelocity,
					name: "Available Velocity UCL",
					type: "line"
				});		 */
                var enabledLengend = key === 0 ? true : false;
                var chartContainersContainer = $('#' + scrumChartID).highcharts(
                    Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
                        chart: { height: 300 },
                        legend: { enabled: false },
                        title: { text: null },
                        subtitle: { text: projectName },
                        xAxis: {
                            categories: scrumChartData.categories,
                            tickInterval: scrumChartConfiguredChartTicks
                        },
                        series: scrumChartData.series
                    }, me.getInitialAndfinalCommitPlotLines(scrumChartData, trainChangedReleaseStartDate))
                )[0];
                me.setCumulativeFlowChartDatemap(chartContainersContainer.childNodes[0].id, scrumChartData.datemap);
            });
            me.doLayout();
        }
    });
} ());