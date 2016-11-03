/*
 *	Displays a CFD chart for a top portfolioItem and it's lowest portfolioItems
 *	You must be scoped to a train for the app to work
 */
(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Intel.PortfolioItemCFDCharts', {
        extend: 'Intel.lib.IntelRallyApp',
        requires: [
            'Intel.lib.chart.FastCumulativeFlowCalculator',
            'Intel.lib.component.IntelPopup'
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
            'Intel.lib.mixin.RallyReleaseColor',
            'Intel.lib.mixin.CustomAppObjectIDRegister'
        ],
        items: [{
            xtype: 'container',
            id: 'nav',
            layout: 'hbox',
            align: 'left',
            width: '600px'
        }, {
            xtype: 'container',
            id: 'navBarProductFilter',
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
                id: 'top-pi-chart'
            }]
        }, {
            xtype: 'container',
            id: 'lowest-pi-charts',
            layout: 'column',
            width: '100%'
        }],
        userAppsPref: 'intel-PortfolioItem-CFD',
        cfdProjPref: 'intel-workspace-admin-cfd-releasedatechange',
        /**************************************** Launch ******************************************/
        launch: function () {
            var me = this;
            // me.initDisableResizeHandle();
            // me.initFixRallyDashboard();
            me.setLoading('Loading Configuration');
            me.configureIntelRallyApp()
                .then(me.loadCfdProjPreference()/******** load stream 2 *****/
                    .then(function (cfdprojPref) {
                        me.cfdProjReleasePref = cfdprojPref;
                    }))
                .then(me._getCommitMatrixObjectID.bind(me))
                .then(me._loadScrumGroupPortfolioProject.bind(me))
                .then(me._getReleaseRecords.bind(me))
                .then(me._loadPortfolioItems.bind(me))
                .then(me._buildControls.bind(me))
                .then(me._reload.bind(me))
                .fail(function (reason) {
                    me.setLoading(false);
                    me.alert('ERROR', reason);
                })
                .done();
        },

        /**************************************** Get ObjectID of CommitMatrix *********************************/
        _getCommitMatrixObjectID: function () {
            var me = this;
            return me.getCustomAppObjectID('Intel.SAFe.ArtCommitMatrix').then(function (customAppObjectID) {
                me.CommitMatrixCustomAppObjectID = customAppObjectID;
            });
        },

        /**************************************** Scrum Group Loading *********************************/
        _loadScrumGroupPortfolioProject: function () {
            var me = this;
            return me.loadProject(me.getContext().getProject().ObjectID).then(function (projectRecord) {
                me.ProjectRecord = projectRecord;
                return me.projectInWhichScrumGroup(projectRecord).then(function (scrumGroupRootRecord) {
                    //if(scrumGroupRootRecord && projectRecord.data.ObjectID === scrumGroupRootRecord.data.ObjectID){
                    //US580666 [SW] Allow Product Cumulative Flow scoping to team level
                    if (scrumGroupRootRecord && projectRecord.data.ObjectID) {
                        me.ScrumGroupRootRecord = scrumGroupRootRecord;
                        return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
                            .then(function (scrumGroupPortfolioProject) {
                                me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
                            });
                    }
                    else throw "must scope to valid project";
                });
            });
        },

        /**************************************** Release Loading *********************************/
        _getReleaseRecords: function () {
            var me = this,
                twelveWeeks = 12 * 7 * 24 * 60 * 60 * 1000;

            // Load releases after twelve weeks ago
            return me.loadReleasesAfterGivenDate(me.ScrumGroupPortfolioProject, new Date().getTime() - twelveWeeks).then(function (releaseRecords) {
                me.ReleasesWithNameHash = _.reduce(releaseRecords, function (hash, rr) {
                    hash[rr.data.ObjectID] = true;
                    return hash;
                }, {});
                me.ReleaseRecords = releaseRecords;
                var releaseParam = window.parent.location.href.match(/release=[A-Za-z\d%]+/);
                // If a release parameter is supplied
                if (releaseParam) {
                    var releaseName = decodeURIComponent(releaseParam[0].split('=')[1]);
                    me.ReleaseRecord = _.find(me.ReleaseRecords, function (release) {
                        return release.data.Name === releaseName;
                    });
                    if (!me.ReleaseRecord) throw 'No release record found for: ' + releaseName;
                }
                else me.ReleaseRecord = me.getScopedRelease(me.ReleaseRecords);
                return me.ReleaseRecord;
            });
        },
        loadAllChildReleases: function () {
            var me = this, releaseName = me.ReleaseRecord.data.Name;
            return me.loadReleasesByNameUnderProject(releaseName, me.ScrumGroupRootRecord)
                .then(function (releaseRecords) {
                    me.ReleasesWithNameHash = _.reduce(releaseRecords, function (hash, rr) {
                        hash[rr.data.ObjectID] = true;
                        return hash;
                    }, {});
                });
        },
        /**************************************** PortfolioItems Loading *********************************/
        _loadPortfolioItems: function () {
            var me = this,
                highestPortfolioItemType = me.PortfolioItemTypes.slice(-1)[0].toLowerCase(),
                portfolioItemParam = window.parent.location.href.match(new RegExp(highestPortfolioItemType + '=\\d+'));

            return Q.all(_.map(me.PortfolioItemTypes, function (type, ordinal) {
                return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
                        me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) :
                        me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, me.ScrumGroupPortfolioProject, type)
                );
            }))
                .then(function (portfolioItemStores) {
                    me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);
                    me.LowestPortfolioItemRecords = portfolioItemStores[0].getRange();
                    me.TopPortfolioItemRecords = portfolioItemStores.slice(-1)[0].getRange();
                    if (portfolioItemParam) {
                        var topPortfolioItemOID = parseInt(portfolioItemParam[0].split('=')[1], 10);
                        me.TopPortfolioItemRecord = _.find(me.TopPortfolioItemRecords, function (topPortfolioItemRecord) {
                            return topPortfolioItemRecord.data.ObjectID === topPortfolioItemOID;
                        });
                        if (!me.TopPortfolioItemRecord) throw 'Could not find portfolioItem for ObjectID: ' + topPortfolioItemOID;
                    }
                    else me.TopPortfolioItemRecord = me.TopPortfolioItemRecords[0];
                });
        },

        /**************************************** Reload *******************************************/
        _reload: function () {
            var me = this;
            me._setchangedReleaseStartDate();
            return me.loadAllChildReleases()
                .then(function () {
                    return me._setFilteredLowestPortfolioItemRecords();
                })
                .then(me._getStorySnapshots.bind(me))
                .then(function () {
                    return Q.all([
                        me._getStories(),
                        me._buildCharts()
                    ]);
                });
        },

        _setFilteredLowestPortfolioItemRecords: function () {
            var me = this;
            me.FilteredLowestPortfolioItemRecords = _.filter(me.LowestPortfolioItemRecords, function (lowestPortfolioItemRecord) {
                return me.PortfolioItemMap[lowestPortfolioItemRecord.data.ObjectID] === me.TopPortfolioItemRecord.data.Name;
            });
            return Q();
        },

        /**************************************** Story Loading ***********************************/
        /*
         *	Creates a filter for the stories under a lowestPortfolioItem
         */
        _createStoryFilter: function (lowestPortfolioItemRecord) {
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                // Belongs to the lowestPortfolioItemRecord
                lowestPortfolioItemFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: lowestPortfolioItemType + '.ObjectID',
                    value: lowestPortfolioItemRecord.data.ObjectID
                }),
                // In the scoped release
                releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release.Name',
                    operator: 'contains',
                    value: me.ReleaseRecord.data.Name
                }),
                // Does not have a release
                noReleaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'Release',
                    operator: '=',
                    value: null
                }),
                // Is a leaf story
                childrenFilter = Ext.create('Rally.data.wsapi.Filter', {
                    property: 'DirectChildrenCount',
                    value: 0
                });
            return lowestPortfolioItemFilter.and((childrenFilter).and(releaseFilter.or(noReleaseFilter)));
        },

        /*
         *	Loads user stories according to their related lowestPortfolioItem
         */
        _getStories: function () {
            var me = this;
            me.StoriesByLowestPortfolioItem = {};
            // Load stories under each lowestPortfolioItemRecord
            return Q.all(_.map(me.FilteredLowestPortfolioItemRecords, function (lowestPortfolioItemRecord) {
                var config = {
                    autoLoad: false,
                    model: me.UserStory,
                    fetch: ['FormattedID', 'ObjectID', 'Name', 'ScheduleState', 'PlanEstimate', 'Iteration'],
                    filters: [me._createStoryFilter(lowestPortfolioItemRecord)],
                    context: {
                        workspace: me.getContext().getWorkspace()._ref,
                        project: null
                    }
                };
                return me.parallelLoadWsapiStore(config).then(function (storyStore) {
                    // Map the lowestPortfolioItemRecord ObjectID to the lowestPortfolioItemRecord's stories
                    me.StoriesByLowestPortfolioItem[lowestPortfolioItemRecord.data.ObjectID] = storyStore.getRange();
                });
            }));
        },

        /**************************************** Snapshot Loading ********************************/
        /*
         *	Loads the snapshots for all stories under the lowestPortfolioItems in the current release
         */
        _getStorySnapshots: function () {
            var me = this;
            me.SnapshotsByLowestPortfolioItem = {};
            me.AllSnapshots = [];

            // Load snapshots under each lowestPortfolioItemRecord
            return Q.all(_.map(me.FilteredLowestPortfolioItemRecords, function (lowestPortfolioItemRecord) {
                var config = {
                    context: {
                        workspace: me.getContext().getWorkspace()._ref,
                        project: null
                    },
                    compress: true,
                    // Snapshots are for leaf stories that belong to the lowestPortfolioItemRecord
                    findConfig: {
                        _TypeHierarchy: 'HierarchicalRequirement',
                        Children: null,
                        _ItemHierarchy: lowestPortfolioItemRecord.data.ObjectID
                    },
                    // Snapshots are valid during the scoped release
                    filters: [{
                        property: '_ValidFrom',
                        operator: '<=',
                        value: me.ReleaseRecord.data.ReleaseDate
                    }, {
                        property: '_ValidTo',
                        operator: '>=',
                        value: me.ReleaseRecord.data.ReleaseStartDate
                    }],
                    fetch: ['ScheduleState', 'PlanEstimate', '_ValidFrom', '_ValidTo', 'ObjectID', 'Release'],
                    hydrate: ['ScheduleState'/* , 'Release' */]
                };
                return me.parallelLoadLookbackStore(config).then(function (store) {
                    // TODO: load only most recent snapshots of projects whose states are set to closed
                    // get their ObjectIDs and make a hashmap of them. Check snapshots against that hashmap to filter them out of existence
                    if (store.data.items.length > 0) {
                        var records = _.filter(store.getRange(), function (storySnapshot) {
                                // Filters to stories who are in the current release or do not have a release, but the lowestPortfolioItemRecord is in the release
                                // TODO: Verify
                                // TODO: filter out closed projects
                                /* return (!storySnapshot.data.Release && (storySnapshot.data._ValidFrom != storySnapshot.data._ValidTo)|| storySnapshot.data.Release.Name.indexOf(me.ReleaseRecord.data.Name) > -1); */
                                return me.ReleasesWithNameHash[storySnapshot.data.Release] && (storySnapshot.data._ValidFrom != storySnapshot.data._ValidTo);
                            }),
                            lowestPortfolioItemOID = lowestPortfolioItemRecord.data.ObjectID;
                        if (!me.SnapshotsByLowestPortfolioItem[lowestPortfolioItemOID]) me.SnapshotsByLowestPortfolioItem[lowestPortfolioItemOID] = [];
                        // Map lowestPortfolioItemRecord OIDs to snapshots
                        me.SnapshotsByLowestPortfolioItem[lowestPortfolioItemOID] = me.SnapshotsByLowestPortfolioItem[lowestPortfolioItemOID].concat(records);
                        me.AllSnapshots = me.AllSnapshots.concat(records);
                    }
                });
            }));
        },

        /**************************************** UI Component Building ***************************/
        /*
         *	Builds all controls for the page
         */
        _buildControls: function () {
            var me = this;
            me.down('#nav').removeAll();
            me.down('#navBarProductFilter').removeAll();

            me._buildReleasePicker();
            me._buildTopPortfolioItemPicker();
        },

        /*
         *	Creates the release picker
         */
        _buildReleasePicker: function () {
            var me = this;
            me.ReleasePicker = me.down('#nav').add({
                xtype: 'intelreleasepicker',
                labelWidth: 80,
                width: 240,
                releases: me.ReleaseRecords,
                currentRelease: me.ReleaseRecord,
                listeners: {
                    select: me._releasePickerSelected,
                    scope: me
                }
            });
        },
        /*
         *	Creates the topPortfolioItem picker
         */
        _buildTopPortfolioItemPicker: function () {
            var me = this,
                topPortfolioItemType = me.PortfolioItemTypes.slice(-1)[0];
            me.TopPortfolioItemPicker = me.down('#navBarProductFilter').add({
                xtype: 'intelfixedcombo',
                fieldLabel: topPortfolioItemType,
                labelWidth: 80,
                width: 240,
                store: Ext.create('Rally.data.custom.Store', {
                    model: me['PortfolioItem/' + topPortfolioItemType],
                    data: me.TopPortfolioItemRecords
                }),
                valueField: 'ObjectID',
                displayField: 'Name',
                value: me.TopPortfolioItemRecord,
                listeners: {
                    select: me._topPortfolioItemPickerSelected,
                    scope: me
                }
            });
        },

        /*
         *	Creates the CFD charts
         */
        _buildCharts: function () {
            var me = this,
                calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator', {
                    startDate: me.ReleaseRecord.data.ReleaseStartDate,
                    endDate: me.ReleaseRecord.data.ReleaseDate,
                    scheduleStates: me.ScheduleStates
                });

            // Remove everything
            $('#top-pi-chart-innerCt').empty();
            $('#lowest-pi-charts-innerCt').empty();

            // Load charts
            me.setLoading('Loading Charts');
            me._buildTopPortfolioItemChart(calc);
            me._buildLowestPortfolioItemCharts(calc);
            me._hideHighchartsLinks();
            me.setLoading(false);
            me.doLayout();
        },

        /*
         *	Creates the overall topPortfolioItem CFD chart
         */
        _buildTopPortfolioItemChart: function (calc) {
            var me = this,
                releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
                releaseEnd = me.ReleaseRecord.data.ReleaseDate;
            var _6days = 1000 * 60 * 60 * 24 * 6;
            me.changedReleaseStartDate = (typeof(me.changedReleaseStartDate) === "undefined") ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate) * 1 + _6days) : me.changedReleaseStartDate;
            //US580666 [SW] Allow Product Cumulative Flow scoping to team level
            var teamSnapshots = [];
            if (me.ScrumGroupRootRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) {
                for (var i = 0; i < me.AllSnapshots.length; i++) {
                    if (me.AllSnapshots[i].data.Project == me.ProjectRecord.data.ObjectID) {
                        teamSnapshots.push(me.AllSnapshots[i]);
                    }
                }
            }
            else {
                teamSnapshots = me.AllSnapshots;
            }
            var updateOptions = {trendType: 'Last2Sprints', date: me.changedReleaseStartDate},
                topPortfolioItemChartData = me.updateCumulativeFlowChartData(calc.runCalculation(teamSnapshots), updateOptions),
                topPortfolioItemChartContainer = $('#top-pi-chart-innerCt').highcharts(
                    Ext.Object.merge({}, me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
                        chart: {
                            style: {cursor: 'pointer'},
                            height: 400,
                            events: {
                                click: me._topPortfolioItemChartClicked.bind(me)
                            }
                        },
                        legend: {
                            enabled: true,
                            borderWidth: 0,
                            width: 500,
                            itemWidth: 100
                        },
                        title: {
                            text: me.TopPortfolioItemRecord.data.Name
                        },
                        subtitle: {
                            text: me.ReleaseRecord.data.Name.split(' ')[0]
                        },
                        xAxis: {
                            categories: topPortfolioItemChartData.categories,
                            tickInterval: me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth() * 0.66)
                        },
                        series: topPortfolioItemChartData.series
                    }, me.getInitialAndfinalCommitPlotLines(topPortfolioItemChartData, me.changedReleaseStartDate))
                )[0];
            me.setCumulativeFlowChartDatemap(topPortfolioItemChartContainer.childNodes[0].id, topPortfolioItemChartData.datemap);
        },

        /*
         *	Creates a CFD chart for each lowestPortfolioItem
         */
        _buildLowestPortfolioItemCharts: function (calc) {
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
                releaseEnd = me.ReleaseRecord.data.ReleaseDate,
                sortedFilteredLowestPortfolioItemRecords = _.sortBy(me.FilteredLowestPortfolioItemRecords, function (lowestPortfolioItemRecord) {
                    return lowestPortfolioItemRecord.data.FormattedID;
                }),
                lowestPortfolioItemChartTicks = me.getCumulativeFlowChartTicks(releaseStart, releaseEnd, me.getWidth() * 0.32),
                lowestPortfolioItemCharts = $('#lowest-pi-charts-innerCt');

            var _6days = 1000 * 60 * 60 * 24 * 6;
            me.changedReleaseStartDate = (typeof(me.changedReleaseStartDate) === "undefined") ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate) * 1 + _6days) : me.changedReleaseStartDate;

            var updateOptions = {trendType: 'Last2Sprints', date: me.changedReleaseStartDate};

            _.each(sortedFilteredLowestPortfolioItemRecords, function (lowestPortfolioItemRecord) {
                if (me.SnapshotsByLowestPortfolioItem[lowestPortfolioItemRecord.data.ObjectID]) {

                    var snapshots = me.SnapshotsByLowestPortfolioItem[lowestPortfolioItemRecord.data.ObjectID];

                    //US580666 [SW] Allow Product Cumulative Flow scoping to team level
                    var teamSnapshots = [];
                    if (me.ScrumGroupRootRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) {
                        for (var i = 0; i < snapshots.length; i++) {
                            if (snapshots[i].data.Project == me.ProjectRecord.data.ObjectID) {
                                teamSnapshots.push(snapshots[i]);
                            }
                        }
                    }
                    else {
                        teamSnapshots = snapshots;
                    }

                    var lowestPortfolioItemChartData = me.updateCumulativeFlowChartData(calc.runCalculation(teamSnapshots), updateOptions);
                    var lowestPortfolioItemChartID = 'lowest-pi-chart-no-' + (lowestPortfolioItemCharts.children().length + 1);

                    lowestPortfolioItemCharts.append('<div class="lowest-pi-chart" id="' + lowestPortfolioItemChartID + '"></div>');
                    var lowestPortfolioItemChartContainer = $('#' + lowestPortfolioItemChartID).highcharts(
                        Ext.Object.merge({}, me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
                            chart: {
                                style: {cursor: 'pointer'},
                                height: 350,
                                events: {
                                    // Needs to be bound to me because this is, by default, referring to the chart
                                    click: me._lowestPortfolioItemChartClicked.bind(me)
                                }
                            },
                            legend: {
                                enabled: false
                            },
                            title: {
                                text: null
                            },
                            subtitle: {
                                useHTML: true,
                                text: [
                                    '<a href="https://rally1.rallydev.com/#/' + me.ScrumGroupPortfolioProject.data.ObjectID +
                                    'd/detail/portfolioitem/' + lowestPortfolioItemType + '/' + lowestPortfolioItemRecord.data.ObjectID + '" target="_blank">',
                                    lowestPortfolioItemRecord.data.FormattedID + ': ' + lowestPortfolioItemRecord.data.Name,
                                    '</a>',
                                    '<br>' + (lowestPortfolioItemRecord.data.PercentDoneByStoryPlanEstimate * 100).toFixed(2) + '% Done' +
                                    '<br><span style="color:red;">',
                                    'Planned End: ' + ((lowestPortfolioItemRecord.data.PlannedEndDate || '').toString().match(/[A-Za-z]+\s\d{2}\s\d{4}/) || 'N/A'),
                                    '</span>',
                                    '<br><span style="color:blue;">',
                                    'Actual End: ' + ((lowestPortfolioItemRecord.data.ActualEndDate || '').toString().match(/[A-Za-z]+\s\d{2}\s\d{4}/) || 'N/A'),
                                    '</span>'
                                ].join('\n')
                            },
                            xAxis: {
                                categories: lowestPortfolioItemChartData.categories,
                                tickInterval: lowestPortfolioItemChartTicks,
                                // Adds a line for the end of the lowestPortfolioItemRecord or the end of the release
                                plotLines: [{
                                    color: '#FF0000',
                                    width: 2,
                                    dashStyle: 'ShortDash',
                                    value: ((new Date(lowestPortfolioItemRecord.data.PlannedEndDate) * 1 - new Date(releaseStart) * 1) / (24 * 60 * 60 * 1000)) >> 0
                                }, {
                                    color: '#0000FF',
                                    width: 2,
                                    dashStyle: 'ShortDash',
                                    value: ((new Date(lowestPortfolioItemRecord.data.ActualEndDate) * 1 - new Date(releaseStart) * 1) / (24 * 60 * 60 * 1000)) >> 0
                                }]
                            },
                            series: lowestPortfolioItemChartData.series,
                            lowestPortfolioItemOID: lowestPortfolioItemRecord.data.ObjectID
                            // This above line magically makes the lowestPortfolioItem immediately available to us in the event handler
                        }, me.getInitialAndfinalCommitPlotLines(lowestPortfolioItemChartData, me.changedReleaseStartDate))
                    )[0];
                    me.setCumulativeFlowChartDatemap(lowestPortfolioItemChartContainer.childNodes[0].id, lowestPortfolioItemChartData.datemap);
                }
            });
        },

        _hideHighchartsLinks: function () {
            $('.highcharts-container > svg > text:last-child').hide();
        },
        /*Start: CFD Release Start Date Selection Option Component*/
        _setchangedReleaseStartDate: function () {
            var me = this;
            if (typeof me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name] !== 'object') me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name] = {};
            me.releaseStartDateChanged = _.isEmpty(me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name]) ? false : true;
            if (me.releaseStartDateChanged) {
                me.changedReleaseStartDate = me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name].ReleaseStartDate;
            }
        },
        _resetVariableAfterReleasePickerSelected: function () {
            var me = this;
            me.changedReleaseStartDate = undefined;
        },
        /*End: CFD Release Start Date Selection Option Component*/
        /**************************************** Event Handling **********************************/
        _releasePickerSelected: function (combo, records) {
            var me = this;
            if (me.ReleaseRecord.data.Name === records[0].data.Name) return;
            me.setLoading(true);
            me.ReleaseRecord = _.find(me.ReleaseRecords, function (release) {
                return release.data.Name === records[0].data.Name;
            });
            me.setLoading('loading');
            me._loadPortfolioItems()
                .then(me._buildControls.bind(me))
                .then(me._reload.bind(me))
                /* .then(me.saveCfdAppsPreference(me.cfdProjReleasePref)) */
                .then(me._resetVariableAfterReleasePickerSelected())
                .fail(function (reason) {
                    me.alert('ERROR', reason);
                })
                .then(function () {
                    me.setLoading(false);
                })
                .done();
        },

        /*
         *	Fires when a topPortfolioItem is selected from the topPortfolioItem picker
         */
        _topPortfolioItemPickerSelected: function (combo, records) {
            var me = this;
            if (me.TopPortfolioItemRecord.data.ObjectID === records[0].data.ObjectID) return;
            me.setLoading(true);
            me.TopPortfolioItemRecord = _.find(me.TopPortfolioItemRecords, function (topPortfolioItemRecord) {
                return topPortfolioItemRecord.data.ObjectID === records[0].data.ObjectID;
            });
            me._reload();
        },

        /*
         *	Fires when the topPortfolioItem chart is clicked
         */
        _topPortfolioItemChartClicked: function (e) {
            var me = this,
                lowestPortfolioItemType = me.PortfolioItemTypes[0],
                lowestPortfolioItemStore = Ext.create('Rally.data.custom.Store', {
                    autoLoad: false,
                    model: me['PortfolioItem/' + lowestPortfolioItemType],
                    data: me.FilteredLowestPortfolioItemRecords
                });

            function getProgressBarColor(percentDone) {
                return me.getRallyReleaseColor(me.ReleaseRecord, percentDone * 100, 100);
            }

            if (!me.Popup) {
                me.Popup = me.add({
                    xtype: 'intelpopup',
                    width: 0.75 * me.getWidth(),
                    height: 0.75 * me.getHeight()
                });
            }

            me.Popup.setContent({
                xtype: 'tabpanel',
                activeTab: 0,
                minTabWidth: 150,
                items: [{
                    xtype: 'container',
                    title: lowestPortfolioItemType + ' Summary',
                    items: [{
                        xtype: 'rallygrid',
                        model: me['PortfolioItem/' + lowestPortfolioItemType],
                        title: me.TopPortfolioItemRecord.data.Name + ' ' + lowestPortfolioItemType + 's in ' + me.ReleaseRecord.data.Name.split(' ')[0],
                        columnCfgs: [
                            'FormattedID',
                            'Name',
                            'Parent',
                            'PlannedEndDate',
                            {
                                text: 'Estimated Completion Date',
                                // I needed something that was a string (sorry)
                                dataIndex: 'Name',
                                renderer: function (value, meta, lowestPortfolioItemRecord) {
                                    var percentDone = lowestPortfolioItemRecord.data.PercentDoneByStoryPlanEstimate,
                                        startDate = lowestPortfolioItemRecord.data.ActualStartDate || lowestPortfolioItemRecord.data.PlannedStartDate;
                                    return (percentDone - 1 > -0.001 ?
                                        (lowestPortfolioItemRecord.data.ActualEndDate || lowestPortfolioItemRecord.data.PlannedEndDate).toISOString().slice(0, 10) :
                                        (percentDone > 0.001 ? ((new Date(startDate.getTime() + (new Date() - startDate) / percentDone)).toISOString().slice(0, 10)) : ''));
                                }
                            },
                            {
                                text: '% Done by Story Plan Estimate',
                                dataIndex: 'PercentDoneByStoryPlanEstimate',
                                renderer: function (percentDone, meta, lowestPortfolioItemRecord) {
                                    var percentageAsString = ((percentDone * 100) >> 0) + '%';
                                    return [
                                        '<div class="progress-bar-container field-PercentDoneByStoryPlanEstimate clickable ' +
                                        lowestPortfolioItemRecord.data.FormattedID + '-PercentDoneByStoryPlanEstimate" style="width: 100%"; ' +
                                        'height: 15px; line-height: 15px">',
                                        '<div class="progress-bar" style="background-color: ' + getProgressBarColor(percentDone) +
                                        '; width: ' + percentageAsString + '; height: 15px">',
                                        '</div>',
                                        '<div class="progress-bar-label">' + percentageAsString + '</div>',
                                        '</div>'
                                    ].join('\n');
                                }
                            }
                        ],
                        store: lowestPortfolioItemStore
                    }]
                }, {
                    xtype: 'container',
                    title: 'Commit Matrix',
                    style: {
                        verticalAlign: 'center',
                        textAlign: 'center'
                    },
                    listeners: {
                        afterrender: function (ct) {
                            if (me.CommitMatrixCustomAppObjectID) {
                                var link = 'https://rally1.rallydev.com/#/' + me.ScrumGroupRootRecord.data.ObjectID + 'd/custom/' +
                                    me.CommitMatrixCustomAppObjectID + '?viewmode=percent_done';
                                ct.update('<h2><a href="' + link + '" target="_blank">View commit matrix</a></h2>');
                            }
                            else ct.update('<h2>Commit Matrix not available</h2>');
                        },
                        scope: me
                    }
                }, {
                    xtype: 'container',
                    title: lowestPortfolioItemType + ' Timeboxes',
                    items: [{
                        xtype: 'rallygrid',
                        model: me['PortfolioItem/' + lowestPortfolioItemType],
                        store: lowestPortfolioItemStore,
                        columnCfgs: [
                            'FormattedID',
                            'Name',
                            'PlannedStartDate',
                            'PlannedEndDate',
                            {
                                text: 'Timebox',
                                dataIndex: 'ActualStartDate',
                                width: '50%',
                                renderer: function (start, meta, lowestPortfolioItemRecord) {
                                    var plannedStart = lowestPortfolioItemRecord.data.PlannedStartDate,
                                        plannedEnd = lowestPortfolioItemRecord.data.PlannedEndDate,
                                        actualStart = lowestPortfolioItemRecord.data.ActualStartDate,
                                        actualEnd = lowestPortfolioItemRecord.data.ActualEndDate,
                                        releaseStart = me.ReleaseRecord.data.ReleaseStartDate,
                                        releaseDate = me.ReleaseRecord.data.ReleaseDate,
                                        minDate = actualEnd ? _.sortBy([plannedStart, actualStart, releaseStart])[0] : _.sortBy([plannedStart, releaseStart])[0],
                                        maxDate = actualEnd ? _.sortBy([plannedEnd, releaseDate, actualEnd])[2] : _.sortBy([plannedEnd, releaseDate])[1],
                                        totalTime = maxDate - minDate,
                                        planned,
                                        actual,
                                        release;

                                    // Create planned dates divs
                                    var beforePlanned = '<div style="float:left;height:15px;width:' + ((((plannedStart - minDate) / totalTime) * 100) >> 0) + '%"></div>',
                                        duringPlanned = '<div style="background-color:pink;border-radius:5px;border-width:1px;float:left;height:15px;width:' +
                                            ((((plannedEnd - plannedStart) / totalTime) * 100) >> 0) + '%"></div>',
                                        afterPlanned = '<div style="float:left;height:15px;width:' + ((((maxDate - plannedEnd) / totalTime) * 100) >> 0) + '%"></div>';
                                    planned = '<div style="width:100%;height:15px;line-height:15px;">' + beforePlanned + duringPlanned + afterPlanned + '</div>';

                                    // Create actual dates divs if there is an actual end date
                                    if (actualEnd) {
                                        var beforeActual = '<div style="float:left;height:15px;width:' + ((((actualStart - minDate) / totalTime) * 100) >> 0) + '%"></div>',
                                            duringActual = '<div style="background-color:purple;border-radius:5px;border-width:1px;float:left;height:15px;width:' +
                                                ((((actualEnd - actualStart) / totalTime) * 100) >> 0) + '%"></div>',
                                            afterActual = '<div style="float:left;height:15px;width:' + ((((maxDate - actualEnd) / totalTime) * 100) >> 0) + '%"></div>';
                                        actual = '<div style="width:100%;height:15px;line-height:15px;">' + beforeActual + duringActual + afterActual + '</div>';
                                    }
                                    else {
                                        actual = '<div style="width:100%;height:15px;line-height:15px;text-align:center">N/A</div>';
                                    }

                                    // Create release date divs
                                    var beforeRelease = '<div style="float:left;height:15px;width:' + ((((releaseStart - minDate) / totalTime) * 100) >> 0) + '%"></div>',
                                        duringRelease = '<div style="background-color:blue;border-radius:5px;border-width:1px;float:left;height:15px;width:' +
                                            ((((releaseDate - releaseStart) / totalTime) * 100) >> 0) + '%"></div>',
                                        afterRelease = '<div style="float:left;height:15px;width:' + ((((maxDate - releaseDate) / totalTime) * 100) >> 0) + '%"></div>';
                                    release = '<div style="width:100%;height:15px;line-height:15px;">' + beforeRelease + duringRelease + afterRelease + '</div>';

                                    return '<div style="width:100%;height:15px;line-height:15px;">' + planned + actual + release + '</div>';
                                }
                            }
                        ]
                    }]
                }]
            });
            me.Popup.show();
            $('.x-tab-inner').css('width', '130px');
        },

        /*
         *	Fires when a lowestPortfolioItem chart is clicked
         */
        _lowestPortfolioItemChartClicked: function (e) {
            var me = this,
                lowestPortfolioItemRecord = _.find(me.FilteredLowestPortfolioItemRecords, function (lowestPortfolioItemRecord) {
                    return lowestPortfolioItemRecord.data.ObjectID === e.currentTarget.options.lowestPortfolioItemOID;
                }),
                storyStore = Ext.create('Rally.data.custom.Store', {
                    autoLoad: false,
                    model: me.UserStory,
                    data: me.StoriesByLowestPortfolioItem[lowestPortfolioItemRecord.data.ObjectID]
                });

            if (!me.Popup) {
                me.Popup = me.add({
                    xtype: 'intelpopup',
                    width: 0.75 * me.getWidth(),
                    height: 0.75 * me.getHeight()
                });
            }
            me.Popup.setContent({
                xtype: 'tabpanel',
                items: [{
                    xtype: 'container',
                    title: 'Stories',
                    items: [{
                        xtype: 'rallygrid',
                        model: me.UserStory,
                        title: lowestPortfolioItemRecord.data.FormattedID + ': ' + lowestPortfolioItemRecord.data.Name +
                        ' (' + me.StoriesByLowestPortfolioItem[lowestPortfolioItemRecord.data.ObjectID].length + ' stories in release, ' +
                        _.reduce(me.StoriesByLowestPortfolioItem[lowestPortfolioItemRecord.data.ObjectID], function (pointTotal, story) {
                            return pointTotal + story.data.PlanEstimate;
                        }, 0) + ' points)',
                        columnCfgs: ['FormattedID', 'Name', 'Project', 'Iteration', 'PlanEstimate', 'ScheduleState'],
                        store: storyStore
                    }]
                }]
            });
            me.Popup.show();
        }
    });
})();