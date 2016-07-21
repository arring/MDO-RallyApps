Ext.define('EstimationBoardApp', {
    extend: 'Rally.app.App',
    alias: 'widget.boardapp',

    requires: [
        'Rally.ui.cardboard.plugin.FixedHeader',
        'Rally.ui.gridboard.GridBoard',
        'Rally.ui.gridboard.plugin.GridBoardAddNew',
        'Rally.ui.gridboard.plugin.GridBoardCustomFilterControl',
        'Rally.ui.gridboard.plugin.GridBoardFieldPicker',
        'Rally.data.util.Sorter',
        'Settings',
        'Rally.clientmetrics.ClientMetricsRecordable'
    ],
    mixins: [
        'Rally.clientmetrics.ClientMetricsRecordable'
    ],
    layout: {
        type: 'vbox',
        align: 'stretch',
        pack: 'start'
    },
    items: [{
        xtype: 'container',
        cls: 'velocity-container',
        height: 50,
        items: [{
            xtype: 'container',
            id: 'total-velocity-container',
            margin: '10 0 0 0'
        }]
    }],
    totalVelocity: 0,
    cls: 'customboard',
    autoScroll: false,
    config: {
        defaultSettings: {
            types: [
                'HierarchicalRequirement',
                'Defect'
            ],
            showRows: false,
            sizes: [
                {text: 'No Estimate', value: null},
                {text: 'XS', value: 1},
                {text: 'S', value: 2},
                {text: 'M', value: 4},
                {text: 'L', value: 8},
                {text: 'XL', value: 16},
                {text: 'Rock Crush!', value: 100}
            ]
        }
    },
    launch: function() {
        Rally.data.ModelFactory.getModels({
            types: this.getSetting('types'),
            context: this.getContext().getDataContext()
        }).then({
            success: function (models) {
                this.models = models;
                this.add(this._getGridBoardConfig());
            },
            scope: this
        });
    },

    _getGridBoardConfig: function() {
        var context = this.getContext();
        var modelNames = this.getSetting('types');
        var config = {
            xtype: 'rallygridboard',
            stateful: false,
            toggleState: 'board',
            cardBoardConfig: this._getBoardConfig(),
            plugins: [{
                ptype:'rallygridboardaddnew',
                addNewControlConfig: {
                    stateful: true,
                    stateId: context.getScopedStateId('board-add-new')
                }
            }, {
                ptype: 'rallygridboardcustomfiltercontrol',
                filterChildren: false,
                filterControlConfig: {
                    margin: '3 9 3 30',
                    modelNames: modelNames,
                    stateful: true,
                    stateId: context.getScopedStateId('board-custom-filter-button')
                },
                showOwnerFilter: true,
                ownerFilterControlConfig: {
                    stateful: true,
                    stateId: context.getScopedStateId('board-owner-filter')
                }
            }, {
                ptype: 'rallygridboardfieldpicker',
                headerPosition: 'left',
                boardFieldBlackList: ['Successors', 'Predecessors', 'DisplayColor'],
                modelNames: modelNames,
                boardFieldDefaults: ['PlanEstimate']
            }],
            context: context,
            modelNames: modelNames,
            storeConfig: {
                filters: this._getFilters()
            },
            listeners: {
                load: this._onLoad,
                scope: this
            }
        };
        if(this.getEl()) {
            config.height = this.getHeight();
        }
        return config;
    },

    _onLoad: function(grid) {
        this.recordComponentReady({
            miscData: {
                type: this.getSetting('type'),
                columns: this.getSetting('groupByField'),
                rows: (this.getSetting('showRows') && this.getSetting('rowsField')) || ''
            }
        });
    },

    _getBoardConfig: function() {
        var me = this;
        var boardConfig = {
            scope: this,
            margin: '10px 0 0 0',
            attribute: 'PlanEstimate',
            context: this.getContext(),
            cardConfig: {
                editable: true,
                showIconMenus: true
            },
            loadMask: true,
            plugins: [{ptype:'rallyfixedheadercardboard'}],
            storeConfig: {
                sorters: Rally.data.util.Sorter.sorters(this.getSetting('order')),
                pageSize: 25,
                scope: this
            },
            columnConfig: {
                columnHeaderConfig: {
                    headerTpl: '{size}'
                }
            },
            listeners: {
                load: function(grid) {
                    // Here we have access to the card board
                    var cols = _.drop(grid.getColumns());
                    me.totalVelocity = 0;
                    var sizes = _.drop(me.getSetting('sizes'));
                    
                    _.each(cols, function(col, i) {
                        me.totalVelocity = me.totalVelocity + (col.store.totalCount * sizes[i].value);
                    });
                    Ext.getCmp('total-velocity-container').removeAll();
                    Ext.getCmp('total-velocity-container').add({
                        xtype: 'label',
                        width: '100%',
                        html: 'Total Velocity: <span class="total-velocity">' + me.totalVelocity + '</span>',
                        style: 'display:inline-block; text-align:center; font-size: 20px;'
                    });
                },
                beforecarddroppedsave: function(scope, card, type, sourceColumn, eOpts) {
                    me.totalVelocity = me.totalVelocity - sourceColumn.value;
                }, 
                aftercarddroppedsave: function(scope, card, type, sourceColumn, eOpts) {
                    me.totalVelocity = me.totalVelocity + scope.value;
                    Ext.getCmp('total-velocity-container').removeAll();
                    Ext.getCmp('total-velocity-container').add({
                        xtype: 'label',
                        width: '100%',
                        html: 'Total Velocity: <span class="total-velocity">' + me.totalVelocity + '</span>',
                        style: 'display:inline-block; text-align:center; font-size: 20px;'
                    });
                }
            },
            columns: _.map(this.getSetting('sizes'), function(size) {
                return {
                    value: size.value,
                    columnHeaderConfig: {
                        headerData: {size: size.text}
                    }
                };
            })
        };
        if (this.getSetting('showRows')) {
            Ext.merge(boardConfig, {
                rowConfig: {
                    field: this.getSetting('rowsField'),
                    sortDirection: 'ASC'
                }
            });
        }
        if (this._shouldDisableRanking()) {
            boardConfig.enableRanking = false;
            boardConfig.enableCrossColumnRanking = false;
            boardConfig.cardConfig.showRankMenuItems = false;
        }
        return boardConfig;
    },

    getSettingsFields: function() {
        return Settings.getFields(this.getContext());
    },

    _shouldDisableRanking: function() {
        return (!this.getSetting('showRows') || this.getSetting('showRows') &&
            this.getSetting('rowsField').toLowerCase() !== 'workproduct');
    },

    _addBoard: function() {
        var gridBoard = this.down('rallygridboard');
        if(gridBoard) {
            gridBoard.destroy();
        }
        this.add(this._getGridBoardConfig());
    },

    onTimeboxScopeChange: function(timeboxScope) {
        this.callParent(arguments);
        this._addBoard();
    },

    _getFilters: function() {
        var queries = [],
            timeboxScope = this.getContext().getTimeboxScope();
        if (this.getSetting('query')) {
            queries.push(Rally.data.QueryFilter.fromQueryString(this.getSetting('query')));
        }
        if (timeboxScope && _.all(this.models, function(model) {
                return model.hasField(Ext.String.capitalize(timeboxScope.getType()));
            })) {
            queries.push(timeboxScope.getQueryFilter());
        }
        return queries;
    }
});
