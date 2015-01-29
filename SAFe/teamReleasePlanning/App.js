Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {
      var storyBacklog = {
        xtype: 'rallygrid',
        columnCfgs: [
          'FormattedID',
          'Name'
        ],
        context: this.getContext(),
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
        context: this.getContext(),
        features: [{
          ftype: 'groupingsummary',
          groupHeaderTpl: '{name} ({rows.length})'
        }],
        storeConfig: {
          model: 'task',
          groupField: 'Owner',
          groupDir: 'ASC',
          fetch: ['Owner'],
          getGroupString: function(record) {
            var owner = record.get('Owner');
            return (owner && owner._refObjectName) || 'No Owner';
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

      this.add(container);
    }
});
