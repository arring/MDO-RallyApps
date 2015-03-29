Ext.define('StoryMapping', {
	extend: 'Rally.app.App',
	requires: [
		'Rally.data.wsapi.TreeStoreBuilder',
		'Rally.ui.gridboard.plugin.GridBoardAddNew',
		'Rally.ui.gridboard.plugin.GridBoardOwnerFilter',
		'Rally.ui.gridboard.plugin.GridBoardFilterInfo',
		'Rally.ui.gridboard.plugin.GridBoardArtifactTypeChooser',
		'Rally.ui.gridboard.plugin.GridBoardFieldPicker',
		'Rally.ui.cardboard.plugin.ColumnPolicy',
		'Rally.ui.gridboard.plugin.GridBoardFilterInfo',
		'Rally.ui.gridboard.plugin.GridBoardFilterControl',
		'Rally.ui.gridboard.plugin.GridBoardToggleable',
		'Rally.ui.grid.plugin.TreeGridExpandedRowPersistence',
		'Rally.ui.gridboard.plugin.GridBoardExpandAll',
		'Rally.ui.gridboard.plugin.GridBoardCustomView',
		'Rally.clientmetrics.ClientMetricsRecordable'
	],
	componentCls: 'app',
	launch: function() {
		var me = this;
		me._loadModels(function(){
			me._loadValidProjects(function(){
				var scopeProject = me.getContext().getProject();
				me._loadProject(scopeProject, function(scopeProjectRecord){
					me.ProjectRecord = _.find(me.ValidProjects, function(validProject){
						return validProject.data.ObjectID === scopeProjectRecord.data.ObjectID;
					});
					if(me.ProjectRecord){
						me._projectInWhichTrain(me.ProjectRecord, function(trainRecord){
							me.TrainRecord = trainRecord;
							me._loadReleases(function(){
								var currentRelease = me._getCurrentOrFirstRelease();
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									me._loadPortfolioItemStore().then({
										success: function(gridStore) {
											me._loadStoryStore().then({
												success: function(storyStore){
													me.add(me._getReleasePickerConfig());
													me.add({
														xtype: 'container',
														region: 'center',
														layout: {
															type: 'hbox',
															align: 'stretch'
														},
														items: [
															me._getFeatureGridBoardConfig(gridStore),
															{ border: 0, width: 20 },
															me._getStoryGridBoardConfig(storyStore)
														]
													});
												}
											});
										},
										scope: me
									});
								} 
								else me._showError('This team has no releases');
							});
						});
					} 
					else me._showError('Please scope to a valid team for release planning');
				});
			});
		});
	},

    _loadStoryStore: function(){
        return Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: ['userstory'],
            autoLoad: true,
            enableHierarchy: true,
            filters: [{
                property: 'Iteration',
                operator: '=',
                value: null
            }]
        });
    },

    _loadPortfolioItemStore: function(){
        var typeStore = Ext.create('Rally.data.wsapi.Store', {
            autoLoad: false,
            model: 'TypeDefinition',
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }],
            filters: [{
                property: 'Parent.Name',
                operator: '=',
                value: 'Portfolio Item'
            }, {
                property: 'Creatable',
                operator: '=',
                value: true
            }]
        });

        var deferred = Ext.create('Deft.Deferred');
        typeStore.load({
            scope: this,
            callback: function (records) {
                this.sModelNames = _.map(records, function (rec) { return rec.get('TypePath'); });
                this.sModelMap = _.transform(records, function (acc, rec) { acc[rec.get('TypePath')] = rec; }, {});

                console.log("What is Here: ", records);

                this._getGridStore().then({
                    success: function(gridStore) {
                        deferred.resolve(gridStore);
                        var model = gridStore.model;
                    },
                    scope: this
                });
            }
        });

        return deferred.promise;
    },

    //___________________________________GENERAL LOADING STUFF___________________________________
    _loadModels: function(cb){
        var me = this;
        Rally.data.ModelFactory.getModel({ //load project
            type:'Project',
            scope:me,
            success: function(model){
                me.Project = model;
                Rally.data.ModelFactory.getModel({ //load user Story
                    type:'HierarchicalRequirement',
                    scope:me,
                    success: function(model){
                        me.UserStory = model;
                        cb();
                    }
                });
            }
        });
    },

    _loadValidProjects: function(cb){
        var me = this;
        var scrums = [];
        function loadChildren(project, _cb){
            Ext.create('Rally.data.wsapi.Store',{
                model: 'Project',
                autoLoad:true,
                remoteSort:false,
                limit:Infinity,
                fetch: ['Name', 'ObjectID', 'Parent'],
                context:{
                    workspace: me.getContext().getWorkspace()._ref,
                    project: null
                },
                filters:[{
                    property:'Parent.ObjectID',
                    value: project.get('ObjectID')
                }
                ],
                listeners: {
                    load: {
                        fn: function(projectStore, projectRecords){
                            if(projectRecords.length === 0) {
                                scrums.push(project);
                                _cb();
                            } else {
                                var finished = 0;
                                var done = function(){ if(++finished === projectRecords.length) _cb(); };
                                projectRecords.forEach(function(c){ loadChildren(c, function(){ done(); }); });
                            }
                        },
                        single:true
                    }
                }
            });
        }
        Ext.create('Rally.data.wsapi.Store',{
            model: 'Project',
            autoLoad:true,
            remoteSort:false,
            pageSize:1,
            limit:1,
            fetch: ['Name', 'ObjectID'],
            context:{
                workspace: me.getContext().getWorkspace()._ref,
                project: null
            },
            filters:[{
                property:'Name',
                value: 'All Scrums'
            }
            ],
            listeners:{
                load:{
                    fn: function(ps, recs){
                        loadChildren(recs[0], function(){
                            me.ValidProjects = scrums;
                            me.ProjectNames = _.map(scrums, function(s){ return {Name: s.get('Name')}; });
                            console.log('valid scrums loaded:', scrums);
                            cb();
                        });
                    },
                    single:true
                }
            }
        });
    },

    _loadProject: function(project, cb){
        var me = this;
        me.Project.load(project.ObjectID, {
            fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name', '_ref'],
            context: {
                workspace: me.getContext().getWorkspace()._ref,
                project: null
            },
            callback: function(record, operation){
                if(operation.wasSuccessful()) cb(record);
                else me._showError('failed to retreive project: ' + project.ObjectID);
            }
        });
    },

    _loadReleases: function(cb){
        var me = this;

        // so we have 2 different filters: for a team in a train, a team not in a train (DCD, HVE)
        var filterString = Ext.create('Rally.data.wsapi.Filter', {
            property:'Project.ObjectID',
            value: me.ProjectRecord.get('ObjectID')
        });
        var filterString2, f2;
        if(me.TrainRecord){
            var teamName = me.ProjectRecord.get('Name');
            var trainName = me.TrainRecord.get('Name').split(' ART ')[0];
            var trainNames = teamName.split(trainName)[1].split('-');
            if(!trainNames[0]) trainNames[0] = trainName;
            else trainNames.push(trainName); //accounts for alpha-bravo-charlie stuff
            trainNames.forEach(function(trainName){
                f2 = Ext.create('Rally.data.wsapi.Filter', {
                    property:'Name',
                    operator:'contains',
                    value: trainName
                });
                if(filterString2) filterString2 = filterString2.or(f2);
                else filterString2 = f2;
            });
            filterString = filterString.and(filterString2);
        } else {
            filterString2 = Ext.create('Rally.data.wsapi.Filter', {
                property:'ReleaseDate',
                operator:'>=',
                value: new Date().toISOString()
            }).and(Ext.create('Rally.data.wsapi.Filter', {
                property:'Name',
                operator:'!contains',
                value: ' '
            }));
            filterString = filterString.and(filterString2);
        }
        filterString = filterString.toString();

        var store = Ext.create('Rally.data.wsapi.Store',{
            model: 'Release',
            limit:Infinity,
            fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
            context:{
                workspace: me.getContext().getWorkspace()._ref,
                project: null
            },
            filters:[
                {
                    property:'Dummy',
                    value:'value'
                }
            ],
            listeners: {
                load: {
                    fn: function(releaseStore, releaseRecords){
                        console.log('releases loaded:', releaseRecords);
                        me.ReleaseStore = releaseStore;
                        cb();
                    },
                    single:true
                }
            }
        });
        store._hydrateModelAndLoad = function(options){
            var deferred = new Deft.Deferred();

            this.hydrateModel().then({
                success: function(model) {
                    this.proxy.encodeFilters = function(){ //inject custom filter here. woot
                        return filterString;
                    };
                    this.load(options).then({
                        success: Ext.bind(deferred.resolve, deferred),
                        failure: Ext.bind(deferred.reject, deferred)
                    });
                },
                scope: this
            });
        };
        store.load();
    },

    _projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
        var me = this;
        if(!projectRecord) cb();
        var split = projectRecord.get('Name').split(' ART ');
        if(split.length>1) cb(projectRecord);
        else {
            var parent = projectRecord.get('Parent');
            if(!parent) cb();
            else {
                me._loadProject(parent, function(parentRecord){
                    me._projectInWhichTrain(parentRecord, cb);
                });
            }
        }
    },

    _getCurrentOrFirstRelease: function(){
        var me = this;
        var d = new Date();
        var rs = me.ReleaseStore.getRecords();
        if(!rs.length) return;
        for(var i=0; i<rs.length; ++i){
            if(new Date(rs[i].get('ReleaseDate')) >= d && new Date(rs[i].get('ReleaseStartDate')) <= d)
                return rs[i];
        }
        return rs[0]; //pick a random one then
    },

    _getReleasePickerConfig: function(){
        var me = this;
        return {
            xtype:'combobox',
            //width: 30,
            region: 'north',
            maxWidth: 300,
            store: Ext.create('Ext.data.Store', {
                fields: ['Name'],
                data: _.map(me.ReleaseStore.getRecords(), function(r){ return {Name: r.get('Name') }; })
            }),
            displayField: 'Name',
            fieldLabel: 'Release:',
            editable:false,
            value:me.ReleaseRecord.get('Name'),
            listeners: {
                select: function(combo, records){
                    if(me.ReleaseRecord.get('Name') === records[0].get('Name')) return;
                    me.ReleaseRecord = me.ReleaseStore.findRecord('Name', records[0].get('Name'));
                    setTimeout(function(){
                        me.down('#gridBoard').getGridOrBoard().getStore().load({
                            filters: [
                                {
                                    property: 'Release.Name',
                                    value: me.ReleaseRecord.get('Name')
                                }
                            ]
                        });
                    }, 0);
                }
            }
        };
    },

    _getModelNames: function () {
        return _.union(this.sModelNames, this.eModelNames);
    },

    _getGridStore: function() {
        var query = [];

        if (this.getSetting('query')) {
            query.push(Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query')));
        }

        var context = this.getContext(),
            config = {
                models: this._getModelNames(), //'PortfolioItem/Feature'
                autoLoad: true,
                remoteSort: true,
                //'FormattedId', 'Name', 'PercentDoneByStoryPlanEstimate', 'ScheduleState', 'Blocked', 'LeafStoryPlanEstimateTotal','Discussion'
                fetch: ['FormattedId', 'Name', 'Iteration', 'PercentDoneByStoryPlanEstimate', 'ScheduleState', 'Blocked', 'LeafStoryPlanEstimateTotal','Discussion'],
                context:{
                    workspace: this.getContext().getWorkspace()._ref,
                    project: null
                },
                filters: [
                    {
                        property: 'Release.Name',
                        value: this.ReleaseRecord.get('Name')
                    }
                ],
                root: {expanded: true},
                enableHierarchy: true,
                expandingNodesRespectProjectScoping: !this.getSetting('ignoreProjectScoping')
            };
        return Ext.create('Rally.data.wsapi.TreeStoreBuilder').build(config).then({
            success: function (store) {
                //console.log("GridStore: ", store);
                return store;
            }
        });
    },

    _getFeatureGridBoardConfig: function(gridStore) {
        var me = this;
        var context = me.getContext();

        return {
            itemId: 'gridBoard',
            xtype: 'rallygridboard',
            title: 'Features in Release',
            flex: 3,
            stateId: 'portfoliotracking-gridboard',
            context: context,
            plugins: this._getGridBoardPlugins(),
            modelNames: this._getModelNames(),
            gridConfig: this._getFeatureGridConfig(gridStore),
            addNewPluginConfig: {
                style: {
                    'float': 'left',
                    'margin-right': '5px'
                }
            },
            listeners: {
//                load: this._onLoad,
//                toggle: this._onToggle,
//                recordupdate: this._publishContentUpdatedNoDashboardLayout,
//                recordcreate: this._publishContentUpdatedNoDashboardLayout,
                scope: this
            },
            height: Math.max(this.getHeight(), 150)
        };
    },

    _getStoryGridBoardConfig: function(gridStore) {
        var me = this;
        var context = me.getContext();

        return {
            itemId: 'storyGridBoard',
            xtype: 'rallygridboard',
            //region: 'center',
            flex: 2,
            stateId: 'storytracking-gridboard',
            context: context,
            //plugins: this._getGridBoardPlugins(),
            //modelNames: this._getStoryModelNames(),
            gridConfig: this._getStoryGridConfig(gridStore),
            addNewPluginConfig: {
                style: {
                    'float': 'left',
                    'margin-right': '5px'
                }
            },
            listeners: {
//                load: this._onLoad,
//                toggle: this._onToggle,
//                recordupdate: this._publishContentUpdatedNoDashboardLayout,
//                recordcreate: this._publishContentUpdatedNoDashboardLayout,
                scope: this
            },
            height: Math.max(this.getHeight(), 150)
        };
    },

    _addGridBoard: function (gridStore) {
        var context = this.getContext();

        this.remove('gridBoard');

        this.gridboard = this.add(this._getFeatureGridBoardConfig(gridStore));
    },


    _getFeatureGridConfig: function (gridStore) {
        var context = this.getContext(),
            stateString = 'portfolio-tracking-treegrid',
            stateId = context.getScopedStateId(stateString);

        var gridConfig = {
            xtype: 'rallytreegrid',
//            viewConfig: {
//                xtype: 'rallytreeview',
//                plugins: {
//                    ptype: 'rallytreeviewdragdrop'
////                    dragGroup: 'featureGridDDGroup',
////                    dropGroup: 'storyGridDDGroup'
//                }
//            },
            store: gridStore,
            enableRanking: this.getContext().getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled,
            columnCfgs: null, //must set this to null to offset default behaviors in the gridboard
            defaultColumnCfgs: ['Name', 'Iteration', 'PercentDoneByStoryPlanEstimate', 'ScheduleState', 'Blocked', 'LeafStoryPlanEstimateTotal','Discussion'],
            //showSummary: true,
            //summaryColumns: this._getSummaryColumnConfig(),
            //treeColumnRenderer: function (value, metaData, record, rowIdx, colIdx, store, view) {
            //store = store.treeStore || store;
            //return Rally.ui.renderer.RendererFactory.getRenderTemplate(store.model.getField('FormattedID')).apply(record.data);
            //},
            //enableBulkEdit: context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE'),
            plugins: [],
            stateId: stateId,
            stateful: true
            //pageResetMessages: [Rally.app.Message.timeboxScopeChange]
        };

        return gridConfig;
    },

    _getStoryGridConfig: function (gridStore) {
        var context = this.getContext(),
            stateString = 'story-tracking-treegrid',
            stateId = context.getScopedStateId(stateString);

        var gridConfig = {
            xtype: 'rallytreegrid',
            store: gridStore,
            enableRanking: this.getContext().getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled,
            columnCfgs: null, //must set this to null to offset default behaviors in the gridboard
            defaultColumnCfgs: ['Name', 'Iteration', 'PercentDoneByStoryPlanEstimate', 'ScheduleState'],
            //showSummary: true,
            //summaryColumns: this._getSummaryColumnConfig(),
            //treeColumnRenderer: function (value, metaData, record, rowIdx, colIdx, store, view) {
            //store = store.treeStore || store;
            //return Rally.ui.renderer.RendererFactory.getRenderTemplate(store.model.getField('FormattedID')).apply(record.data);
            //},
            //enableBulkEdit: context.isFeatureEnabled('BETA_TRACKING_EXPERIENCE'),
            plugins: [],
            stateId: stateId,
            stateful: true
            //pageResetMessages: [Rally.app.Message.timeboxScopeChange]
        };

        return gridConfig;
    },

    _getGridBoardPlugins: function() {
        var plugins =[],// ['rallygridboardaddnew'],
            context = this.getContext();


        //plugins.push('rallygridboardtoggleable');
        var alwaysSelectedValues = ['FormattedID', 'Name', 'Owner'];
        if (context.getWorkspace().WorkspaceConfiguration.DragDropRankingEnabled) {
            alwaysSelectedValues.push('DragAndDropRank');
        }

        plugins.push({
            ptype: 'rallygridboardfilterinfo',
            isGloballyScoped: Ext.isEmpty(this.getSetting('project')),
            stateId: 'portfolio-tracking-owner-filter-' + this.getAppId()
        });

//        plugins.push({
//            ptype: 'rallygridboardfieldpicker',
//            headerPosition: 'left',
//            gridFieldBlackList: [
//                'ObjectID',
//                'Description',
//                'DisplayColor',
//                'Notes',
//                'Subscription',
//                'Workspace',
//                'Changesets',
//                'RevisionHistory',
//                'Children'
//            ],
//            alwaysSelectedValues: alwaysSelectedValues,
//            modelNames: this._getModelNames(),
//            boardFieldDefaults: (this.getSetting('cardFields') && this.getSetting('cardFields').split(',')) ||
//                ['Parent', 'Tasks', 'Defects', 'Discussion', 'PlanEstimate', 'Iteration']
//        });

        //plugins.push('rallygridboardportfolioitemtypechooser');

        return plugins;
    }







});
