Ext.define('CustomApp', {
    extend: 'IntelRallyApp',
    mixins: [
      'ReleaseQuery'
    ],
    componentCls: 'app',

    _returnBacklogStore: function(){
      var me = this;

      return Ext.create('Rally.data.wsapi.Store', {
        model: 'userstory',
        groupField: 'Feature',
        groupDir: 'ASC',
        fetch: ['Feature'],
        getGroupString: function(record) {
          var feature = record.get('Feature');
          return (feature && feature._refObjectName) || 'No feature';
        },
        filters: [{
          property: "Release.Name",
          value: me.releaseRecord.data.Name
        }]
      });
    },
    
    _releasePickerSelected: function(combo, records){
      var me = this;

      if(me.releaseRecord.data.Name === records[0].data.Name) return;
      me.releaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name); 
      
      var backlogGrid = Ext.getCmp('backlogGrid');

      console.log(me.releaseRecord);
      backlogGrid.store.clearFilter(true);
      backlogGrid.store.filter({
        property: "Release.Name",
        value: me.releaseRecord.data.Name
      });
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
          me.releaseRecord = me.ReleaseStore.data.items[1];
          console.log(me.releaseRecord);
          console.log(me.releaseRecord.data.Name);

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
              model: 'userstory'
            }
          };

          var featureBacklogGrid = {
            id: 'backlogGrid',
            xtype: 'rallygrid',
            columnCfgs: [
              'FormattedID',
              'Name',
              'Iteration'
            ],
            context: me.getContext(),
            features: [{
              ftype: 'groupingsummary',
              groupHeaderTpl: '{name} ({rows.length})'
            }],
            store: me._returnBacklogStore()
          };

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
                featureBacklogGrid
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
          console.log('Release Picker', releasepicker);
          me.add(releasepicker);
          me.add(container);   
        })
        .fail(
          function(){
            debugger;
          }
        )
        .done();   
    }
});
