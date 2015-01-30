Ext.define('CustomApp', {
    extend: 'IntelRallyApp',
    mixins: [
      'ReleaseQuery'
    ],
    componentCls: 'app',

    _clearDragConstraints: function(grid){
      var gridView = grid.getView();

      var dragPlugin = _.find(gridView.plugins, function(plugin){
        return plugin.ptype == "rallytreeviewdragdrop";
      });

      dragPlugin.dragZone.clearConstraints();
    },

    _onStoreBuilt: function(store) {
      var me = this; 
      return me.add({
        id: 'backlogGrid',
        xtype: 'rallytreegrid',
        store: store,
        context: me.getContext(),
        enableEditing: true,
        shouldShowRowActionsColumn: true,
        enableBulkEdit: false,
        enableRanking: true,
        columnCfgs: [
          'Name'
        ],
        listeners: {
          viewready: function(grid){
            me._clearDragConstraints(grid);
          }
        }
      });
    },
    
    _releasePickerSelected: function(combo, records){
      var me = this;

      if(me.releaseRecord.data.Name === records[0].data.Name) return;
      me.releaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name); 
      
      var backlogGrid = Ext.getCmp('backlogGrid');
      var treeStore = backlogGrid.getStore();

      treeStore.load({
        filters: [{
          property: "Release.Name",
          value: me.releaseRecord.data.Name
        }]
      });
      console.log(treeStore);
    },

    launch: function() {
      var me = this;

      me._loadModels()
        .then(function(){
          var scopeProject = me.getContext().getProject();
          return me._loadProject(scopeProject.ObjectID);
        })
        .then(function(scopeProjectRecord){
          me.ProjectRecord = scopeProjectRecord;
          var threeWeeksAgo = new Date()*1 - 3*7*24*60*60*1000;
          return me._loadReleasesAfterGivenDate(me.ProjectRecord, threeWeeksAgo);
        })
        .then(function(releaseStore){
          me.ReleaseStore = releaseStore;
          me.releaseRecord = me.ReleaseStore.data.items[0];
          // console.log(me.releaseRecord);
          // console.log(me.releaseRecord.data.Name);

          var storyBacklogGrid = {
            xtype: 'rallygrid',
            columnCfgs: [
              'FormattedID',
              'Name'
            ],
            context: me.getContext(),
            enableRanking: true,
            defaultSortToRank: true,
            storeConfig: {
              model: 'userstory',
              filter: {
                property: "PortfolioItem",
                value: null
              }
            }
          };

          var treestore = Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: ['PortfolioItem/Feature'],
            autoLoad: true,
            enableHierarchy: true,
            filters: [{
              property: "Release.Name",
              value: me.releaseRecord.data.Name
            }]
          }).then({
            success: function(store){
              var treeGrid = me._onStoreBuilt(store);
              var container = Ext.create('Ext.Panel', {
                title: "HBoxLayout Panel",
                layout: {
                  type: 'hbox',
                  align: 'stretch'
                },
                renderTo: document.body,
                items: [
                {
                  xtype: 'container',
                  title: 'Inner Panel Three',
                  flex: 1,
                  items: [
                    storyBacklogGrid
                  ]
                },
                {
                  xtype: 'container',
                  title: 'Inner Panel Two',
                  flex: 2,
                  items: [
                    treeGrid
                  ]
                },{
                  xtype: 'container',
                  title: 'Inner Panel Three',
                  flex: 1
                }]
              });

              var releasepicker = {
                xtype:'intelreleasepicker',
                labelWidth: 80,
                width: 200,
                releases: me.ReleaseStore.data.items,
                currentRelease: me.releaseRecord,
                listeners: {
                  change:function(combo, newval, oldval){
                    console.log('change function firing'); 
                    if(newval.length===0){
                      combo.setValue(oldval);
                    }  
                  },
                  select: me._releasePickerSelected.bind(me)
                }
              };
              
              me.add(releasepicker);
              me.add(container); 
            },
            scope: me,
            failure: function(e){
              console.log(e);
            }
          });
        })
        .fail(
          function(){
            debugger;
          }
        )
        .done();   
    }
});
