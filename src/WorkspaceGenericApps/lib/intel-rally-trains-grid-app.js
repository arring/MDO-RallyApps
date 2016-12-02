/**
 This is a base class that renders an application based on a
 tabular display of per-scrum values organized by horizontals,
 scrum types and trains.

 Any descendant must override the following functions:
 - loadReportData()
 - setScrumDataValue()
 - getScrumTotalDataValue()
 - addScrumTotalDataValue()
 - getScrumDataValueFromScrumTotal()
 - scrumDataCellRenderer()
 - teamTypeCellRenderer()
 - horizontalTotalCellRenderer()


 Source data is organized using this format:

 me.GridData = {
		<TrainName>: {
			<HorizontalName: ACD>: {
				<ScrumTeamType:MIO CLK 1>: {
					scrumTeamType:<ScrumTeamType: MIO CLK 1>,
					scrumName:<projectName>
					isViolating: <true, false, or null>
					... Your own ScrumDataValue properties ...
				}
			}
		}
	}
 */
(function () {
    var Ext = window.Ext4 || window.Ext,
        COLUMN_DEFAULTS = {
            text: '',
            resizable: false,
            draggable: false,
            sortable: false,
            editor: false,
            menuDisabled: true,
            renderer: function (val) {
                return val || '-';
            }
        };

    Ext.define('Intel.lib.IntelRallyTrainsGridApp', {
        extend: 'Intel.lib.IntelRallyApp',

        layout: {
            type: 'vbox',
            align: 'stretch',
            pack: 'start'
        },
        items: [{
            xtype: 'container',
            itemId: 'navbox',
            cls: "navbox-style"
        }, {
            xtype: 'container',
            itemId: 'gridContainer',
            cls: 'grid-container'
        }],
        minWidth: 910,

        userAppsPref: 'intel-SAFe-apps-preference',


        /**___________________________________ APP METHODS ___________________________________*/


        loadReportData: function () {
            // OVERLOAD ME //
            // load here any data you may need for this app
            return Q.resolve();
        },
        setScrumDataValue: function (container, scrumGroupName, projectName) {
            // OVERLOAD ME //
            // add any property you want to track to 'container'.
            // this will be anything needed to show the value on each cell of the grid
            container.value = 1;
        },
        insertMissingFeatures: function (container, scrumGroupName, projectName) {
            // OVERLOAD ME //
            container.value = 1;
        },
        getScrumTotalDataValue: function (scrumData) {
            // OVERLOAD ME //
            // returns a hash used to aggregate the data
            // scrumData may be null for initialization. ScrumData refers
            // to the container set in setScrumDataValue()
            return scrumData === null ? {total: 0} : {total: scrumData.value};
        },
        addScrumTotalDataValue: function (current, scrumData) {
            // OVERLOAD ME //
            // aggregate values into the container for the total
            current.total += scrumData.value;
        },
        getScrumDataValueFromScrumTotal: function (trainTotal) {
            // OVERLOAD ME //
            // map between the scrumData container and the scrumTotal container
            return {
                value: trainTotal.total
            };
        },
        scrumDataCellRenderer: function (scrumData, flag) {
            // OVERLOAD ME //
            // Ext renderer function for each cell.
            // receives the scrumData container
            var exists = (scrumData !== null);
            return {
                xtype: 'container',
                items: {
                    xtype: 'component',
                    autoEl: {
                        tag: 'a',
                        html: exists ? '<span>' + scrumData.scrumName + '</span>' : '-'
                    }
                }
            };
        },
        teamTypeCellRenderer: function (teamType) {
            // OVERLOAD ME //
            return {
                xtype: 'container',
                flex: 1,
                cls: 'team-type-cell',
                html: teamType
            };
        },
        horizontalTotalCellRenderer: function (horizontalData, meta) {
            // OVERLOAD ME //
            // Ext renderer function for each horizontal total
            var hasData = horizontalData.total > 0;
            return hasData ? '<span id="" title="' + horizontalData.HorizontalName + '">' + horizontalData.total + '</span>' : '-';
        },

        /**___________________________________ LOADING AND RELOADING ___________________________________*/
        reloadEverything: function () {
            var me = this;

            me.setLoading('Loading Data...');
            return me.loadReportData()
                .then(function () {
                    me.setLoading('Creating Grid Data Hash...');
                    me._createGridDataHash();
                    if (!me.ReleasePicker) { //only draw the first time
                        me.renderReleasePicker();
                    }
                    me.down('#gridContainer').removeAll();
                    me.renderGrid();
                })
                .then(function () {
                    me.finalActions();
                    me.setLoading(false);
                });
        },
        reloadGrid: function () {
            console.log("Reload Grid...");
            var me = this;
            me.setLoading('Loading Grid...');
            me.down('#gridContainer').removeAll();
            me.renderGrid();
            me.setLoading(false);
        },
        _createGridDataHash: function () {
            var me = this;
            var rowTrackingNumber = 0;
            me.GridData = _.reduce(me.ScrumGroupConfig, function (hash, train, key) {
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
                            hash[projectName] = {
                                scrumTeamType: scrumTeamType,
                                scrumName: projectName,
                                isViolating: null,
                                rowNumber: rowTrackingNumber++
                            };
                            me.setScrumDataValue(hash[projectName], train.ScrumGroupName, projectName);
                        }
                        return hash;
                    }, {});
                    return hash;
                }, {});
                return hash;
            }, {});
        },
        _loadTrainsAndScrums: function (me) {
            // load all Trains and their scrums
            me.projectFields = ["ObjectID", "Releases", "Children", "Parent", "Name"];
            me.ScrumGroupConfig = _.filter(me.ScrumGroupConfig, function (item) {
                return item.IsTrain;
            });
            return Q.all(
                _.map(me.ScrumGroupConfig, function (cfg) {
                    return me.loadAllLeafProjects({data: {ObjectID: cfg.ScrumGroupRootProjectOID}})
                        .then(function (leafProjects) {
                            cfg.Scrums = leafProjects;
                        });
                })
            );
        },
        _loadCurrentRelease: function (me) {
            //picking random Release as all the ScrumGroup share the same Release Name
            me.ProjectRecord = me.ScrumGroupConfig[0];
            return me.loadAppsPreference()
                .then(function (appsPref) {
                    me.AppsPref = appsPref;
                    var twelveWeeks = 1000 * 60 * 60 * 24 * 7 * 12;
                    return me.loadReleasesAfterGivenDateByProjectObjID(me.ProjectRecord.ScrumGroupRootProjectOID, (new Date() * 1 - twelveWeeks));
                })
                .then(function (releaseRecords) {
                    me.ReleaseRecords = releaseRecords;
                    var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.ScrumGroupRootProjectOID, me.AppsPref);
                    if (currentRelease) me.ReleaseRecord = currentRelease;
                    else return Q.reject('This project has no releases.');
                });
        },


        /**___________________________________ LAUNCH ___________________________________*/
        launch: function () {
            var me = this;

            if (!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())) {
                me.setLoading(false);
                me.alert('ERROR', 'You do not have permissions to edit this project');
                return;
            }

            console.log("Configuring Rally App...");

            me.configureIntelRallyApp()
                .then(function () {
                    me.setLoading('Loading Trains and Scrums...');
                    console.log("Loading Trains and Scrums...");
                    return me._loadTrainsAndScrums(me);
                })
                .then(function () {
                    me.setLoading('Loading Current Release...');
                    console.log("Loading Current Release...");
                    return me._loadCurrentRelease(me);
                })
                .then(function () {
                    console.log("loading data...");
                    return me.reloadEverything();
                })
                .fail(function (reason) {
                    me.alert('ERROR', reason);
                })
                .finally(function () {
                    me.setLoading(false);
                })
                .done();
        },

        /**___________________________________ NAVIGATION AND STATE ___________________________________*/
        releasePickerSelected: function (combo, records) {
            var me = this, pid = me.ProjectRecord.ScrumGroupRootProjectOID;
            if (me.ReleaseRecord.data.Name === records[0].data.Name) return;
            me.setLoading("Saving Preference");
            me.ReleaseRecord = _.find(me.ReleaseRecords, function (rr) {
                return rr.data.Name == records[0].data.Name;
            });
            if (typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
            me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
            me.saveAppsPreference(me.AppsPref)
                .then(function () {
                    return me.reloadEverything();
                })
                .fail(function (reason) {
                    me.setLoading(false);
                    me.alert('ERROR', reason);
                })
                .then(function () {
                    me.setLoading(false);
                })
                .done();
        },
        renderReleasePicker: function () {
            var me = this;
            me.ReleasePicker = me.down('#navbox').add({
                xtype: 'intelreleasepicker',
                id: 'releasePicker',
                labelWidth: 70,
                width: 250,
                releases: me.ReleaseRecords,
                currentRelease: me.ReleaseRecord,
                listeners: {select: me.releasePickerSelected.bind(me)}
            });
        },

        /************************************************************* RENDER ********************************************************************/

        _buildDataGrid: function (gridData) {
            // generate a data structure in the expected format for rendering
            var me = this,
                trainTotals = {},
                horizontalTotals = {},
                horizontalTeamTypes = {},
                scrumTeamNames = {};

            _.each(gridData, function (trainData, trainName) {
                trainTotals[trainName] = _.merge({TrainName: trainName}, me.getScrumTotalDataValue());
                _.each(trainData, function (horizontalData, horizontalName) {
                    horizontalTotals[horizontalName] = horizontalTotals[horizontalName] || _.merge({HorizontalName: horizontalName}, me.getScrumTotalDataValue());
                    horizontalTeamTypes[horizontalName] = horizontalTeamTypes[horizontalName] || [];
                    scrumTeamNames[horizontalName] = scrumTeamNames[horizontalName] || [];
                    _.each(horizontalData, function (scrumData, scrumTeamType) {
                        me.addScrumTotalDataValue(horizontalTotals[horizontalName], scrumData);
                        me.addScrumTotalDataValue(trainTotals[trainName], scrumData);
                        horizontalTeamTypes[horizontalName].push(scrumTeamType);
                        scrumTeamNames[horizontalName].push(scrumData.scrumName); // + " (" + scrumTeamType + ")");
                    });
                });
            }, []);

            //build the rows for the table
            var data = _.map(_.keys(horizontalTotals).sort(), function (horizontalTotalName) {
                return {
                    horizontalData: horizontalTotals[horizontalTotalName],
                    scrumTeamNames: _.uniq(scrumTeamNames[horizontalTotalName]).sort()
                };
            });
            //put 'Other' Row last
            var otherRow = _.find(data, function (row) {
                return row.horizontalData.HorizontalName == 'Other';
            });
            if (otherRow !== null) {
                data = _.filter(data, function (row) {
                    return row.horizontalData.HorizontalName !== 'Other';
                }).concat(otherRow);
            }
            _.each(trainTotals, function (trainTotal, trainName) {
                _.each(data, function (row) {
                    row[trainName] = _.map(row.scrumTeamNames, function (scrumTeamName) {
                        if ((gridData[trainName][row.horizontalData.HorizontalName] || {})[scrumTeamName])
                            return gridData[trainName][row.horizontalData.HorizontalName][scrumTeamName];
                        else
                            return null;
                    });
                });
            });
            //build the last row, with the train data
            data.push(_.merge({
                horizontalData: _.merge({HorizontalName: ''}, me.getScrumTotalDataValue()),
                scrumTeamNames: ['-']
            }, _.reduce(trainTotals, function (map, trainTotal, trainName) {
                map[trainName] = [
                    _.merge(
                        {scrumName: trainName},
                        me.getScrumDataValueFromScrumTotal(trainTotal)
                    )
                ];
                return map;
            }, {})));

            return data;
        },

        _buildGridColumns: function (trains) {
            var me = this;
            var currentTrain = null;
            var trainNumber = 0;
            var oscar = 0;
            return [].concat(
                [{
                    text: ' ', //Horizontal Name Column
                    dataIndex: 'horizontalData',
                    tdCls: 'horizontal-name-cell',
                    width: 80,
                    sortable: false,
                    renderer: function (horizontalData, meta) {
                        return horizontalData.HorizontalName;
                    }
                }, {
                    text: ' ', //Horizontal Team Types Column
                    xtype: 'intelcomponentcolumn',
                    dataIndex: 'scrumTeamNames',
                    width: 200,
                    tdCls: 'stdci-cell-container',
                    sortable: false,
                    renderer: function (scrumTeamNames) {
                        return Ext.create('Ext.container.Container', {
                            layout: {type: 'vbox'},
                            width: '100%',
                            items: _.map(scrumTeamNames, me.teamTypeCellRenderer)
                        });
                    }
                }],
                _.map(trains.sort(), function (trainName) {
                    return {
                        text: trainName, //Train Columns
                        xtype: 'intelcomponentcolumn',
                        dataIndex: trainName,
                        width: 90,
                        cls: 'train-header-cls',
                        tdCls: 'stdci-cell-container',
                        sortable: false,
                        renderer: function (scrumDataList) {
                            oscar++;
                            console.log("oscar = ", oscar);
                            var flag = false;
                            if(currentTrain != trainName){
                                //if train changes
                                trainNumber++;
                            }
                            if((currentTrain != trainName) && (scrumDataList.length  % 2 != 0) && (trainNumber % 2 == 0)){
                                //we are changing to another train, and this an odd number of rows in this horizontal
                                flag = true;
                            }
                            var currentTrain = trainName;
                            console.log("scrumDataList: ", scrumDataList);

                            var itemResult = _.map(scrumDataList, function(scrumDataItem){
                                return me.scrumDataCellRenderer(scrumDataItem, flag);
                            });
                            console.log("itemResult.length = ", itemResult.length);
                            return Ext.create('Ext.container.Container', {
                                layout: {type: 'vbox'},
                                width: '100%',
                                padding: 0,
                                margin: 0,
                                flex: 1,
                                items: itemResult
                            });
                        }
                    };
                }),
                [{
                    text: ' ', //Horizontal % column
                    dataIndex: 'horizontalData',
                    tdCls: '',
                    width: 90,
                    sortable: false,
                    renderer: me.horizontalTotalCellRenderer
                }]
            );
        },
        _getGridWidth: function (columns) {
            var me = this;

            return Math.min(
                _.reduce(columns, function (sum, column) {
                    return sum + column.width;
                }, 2),
                window.innerWidth - 2
            );
        },

        renderGrid: function () {
            var me = this;
            me.setLoading(false);
            console.log("Building Data Grid...");
            me.setLoading('Building Data Grid...');

            //preprocess the data so we can create the rows for the table
            var data = me._buildDataGrid(me.GridData);

            // get the list of trains
            var trains = _.keys(me.GridData);

            //create the store that will hold the rows in the table
            var gridStore = Ext.create('Ext.data.Store', {
                fields: [
                    {name: 'horizontalData', type: 'auto'},
                    {name: 'scrumTeamNames', type: 'auto'}
                ]
                    .concat(_.map(trains, function (train) {
                        return {name: train, type: 'auto'};
                    })),
                data: data
            });

            //create the column definitions and renderers
            me.setLoading('Building Grid Columns...');
            console.log("building grid columns...");
            var columns = me._buildGridColumns(trains);

            //finally build the grid
            console.log("rendering grid...");
            me.setLoading('Rendering Grid...');
            me.down('#gridContainer').add({
                xtype: 'grid',
                scroll: 'both',
                resizable: false,
                viewConfig: {
                    stripeRows: true,
                    preserveScrollOnRefresh: true
                },
                width: me._getGridWidth(columns),

                columns: {
                    defaults: COLUMN_DEFAULTS,
                    items: columns
                },
                store: gridStore,
                enableEditing: false
                //disableSelection: true,
                //trackMouseOver: true
            });
            setTimeout(function () {
                me.doLayout();
                console.log("done");
            }, 500);
        },

        finalActions: function () {
            // OVERLOAD ME //
            //Any actions you would like done at the end
            return;
        }

    });
}());