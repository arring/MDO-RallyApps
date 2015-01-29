Ext.define('CustomApp', {
    extend: 'IntelRallyApp',
    mixins: [
      'ReleaseQuery'
    ],
    componentCls: 'app',
    
    _releasePickerSelected: function(){
      console.log('I work!');
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

          var storyBacklog = {
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

          var featureBacklog = {
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
            storeConfig: {
              model: 'userstory',
              groupField: 'Feature',
              groupDir: 'ASC',
              fetch: ['Feature'],
              getGroupString: function(record) {
                var feature = record.get('Feature');
                return (feature && feature._refObjectName) || 'No feature';
              }
            }
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
                storyBacklog
              ]
            },
            {
              xtype: 'container',
              title: 'Inner Panel Two',
              flex: 2,
              items: [
                featureBacklog
              ]
            },{
              xtype: 'container',
              title: 'Inner Panel Three',
              flex: 1
            }]
          });

          me.releaseRecord = me.ReleaseStore.data.items[0];

          var releasepicker = {
            xtype:'intelreleasepicker',
            labelWidth: 80,
            width: 200,
            releases: me.ReleaseStore.data.items,
            currentRelease: me.releaseRecord || me.ReleaseStore.data.items[0],
            listeners: {
              change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
              select: me._releasePickerSelected.bind(me)
            }
          };

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
