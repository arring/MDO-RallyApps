Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    width: 800,
    layout:{
      type: 'vbox',
    },
    items:[
      {
        xtype: 'container',
        itemId: 'ribbon',
        width: 1500,
        height: 250,
        hidden: true,
        border: 1,
        layout: {
          type: 'hbox',
          align: 'stretch',
          pack: 'center'
        },
        style: {
          borderColor: '#AAA',
          borderStyle: 'solid'
        }      },
      {
        xtype: 'container',
        itemId: 'gridsContainer',
        //padding: 25,
        layout: {
          type: 'hbox',
          align: 'top'
        },
        items: [
          {
            xtype: 'container',
            itemId: 'gridsLeft',
            width: 750,
            border: 1,
            //padding: 25,
            style: {
              borderColor: '#AAA',
              borderStyle: 'solid',
              //margin: '10px'
            }
          },
          {
            xtype: 'container',
            itemId: 'gridsRight',
            width: 750,
            border: 1,
            //padding: 25,
            style: {
              borderColor: '#AAA',
              borderStyle: 'solid',
              //margin: '10px'
            }
          }
        ]
      }
    ],

    globalGridCount: [],   // count entry for each grid

    // App entry point
    launch: function() {
      this._buildGrids();
    },

    // Create all charts in the header ribbon
    _buildCharts: function() {
      console.log('now building charts');
      this._buildBarChart();
      this._buildBubbleChart();
      this._buildPieChart();
      this._buildColumnChart();
    },

    
    _buildBarChart: function() {
        console.log('starting to build bar chart');
        var chartCfg = {
            chart: {
                type: 'bar',
                width: 300,
                height: 250
            },
            title: {
                text: 'Story Counts by Grid'
            },
            xAxis: {
                categories: ['Africa', 'America', 'Asia', 'Europe', 'Oceania'],
                title: {
                    text: null
                }
            },
            yAxis: {
                min: 0,
                title: {
                text: '# Artifacts',
                    align: 'high'
                },
                labels: {
                    overflow: 'justify'
                }
            },
            tooltip: {
                valueSuffix: ' Stories'
            },
            plotOptions: {
                bar: {
                    dataLabels: {
                        enabled: true
                    }   
                }
            },
            legend: {
                layout: 'vertical',
                align: 'right',
                verticalAlign: 'top',
                x: -40,
                y: 100,
                floating: true,
                borderWidth: 1,
                backgroundColor: '#FFFFFF',
                shadow: true
            },
            credits: {
            enabled: false
            }
        };
        var chartDt = {
            series: [{
                name: 'Grid Counts',
                //data: [100, 40, 20, 80]
                data: this.globalGridCount
            }]
        };

        this.down('#ribbon').add({
            xtype: 'rallychart',
            chartConfig: chartCfg,
            chartData: chartDt,
            flex: 1
        });
        console.log('finished bar');

    },

    _buildPieChart: function() {

       
      this.down('#ribbon').add({
        xtype: 'rallychart',
        flex: 1,
        chartConfig: { // {{{
          chart: {
              plotBackgroundColor: null,
              plotBorderWidth: 1,//null,
              plotShadow: false,
              width: 300,
              height: 250,
          },
          title: {
              text: ''
          },
          tooltip: {
              pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
          },
          plotOptions: {
            pie: {
              allowPointSelect: true,
              cursor: 'pointer',
              dataLabels: {
                enabled: true,
                format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                style: {
                    color: 'black'
                }
              }
            }
          }
        }, // }}}
        chartData: { // {{{
          series: [{
              type: 'pie',
              name: 'Team Block',
              data: [
                  ['Alpha',   45.0],
                  ['Beta',       26.8],
                  {
                      name: 'Gamma',
                      y: 12.8,
                      sliced: true,
                      selected: true
                  }
              ]
          }]
        } // }}}
      });

    },

    _buildBubbleChart: function() {

      this.down('#ribbon').add({
        xtype: 'rallychart',
        flex: 1,
        chartConfig: {
          chart: {
              width: 300,
              height: 250,
              type: 'bubble',
              zoomType: 'xy'
          },

          title: {
              text: 'Team Analysis'
          },
        },
        chartData: {
          series: [{
              name: 'Team Alpha',
              data: [[97, 36, 79], [94, 74, 60], [68, 76, 58], [64, 87, 56], [68, 27, 73], [74, 99, 42], [7, 93, 87], [51, 69, 40], [38, 23, 33], [57, 86, 31]]
          }, {
              name: 'Team Beta',
              data: [[25, 10, 87], [2, 75, 59], [11, 54, 8], [86, 55, 93], [5, 3, 58], [90, 63, 44], [91, 33, 17], [97, 3, 56], [15, 67, 48], [54, 25, 81]]
          }, {
              name: 'Team Gamma',
              data: [[47, 47, 21], [20, 12, 4], [6, 76, 91], [38, 30, 60], [57, 98, 64], [61, 17, 80], [83, 60, 13], [67, 78, 75], [64, 12, 10], [30, 77, 82]]
          }]
        }
      });

    },

    _buildColumnChart: function() {

      this.down('#ribbon').add({
        xtype: 'rallychart',
        flex: 1,
        chartConfig: {
          chart: {
              type: 'column',
              width: 300,
              height: 250
          },
          title: {
              text: 'Story Counts By Team'
          },
          subtitle: {
              text: ''
          },
          xAxis: {
              categories: [
                  'Jan',
                  'Feb',
                  'Mar',
                  'Apr',
                  'May',
                  'Jun',
                  'Jul',
                  'Aug',
                  'Sep',
                  'Oct',
                  'Nov',
                  'Dec'
              ]
          },
          yAxis: {
              min: 0,
              title: {
                  text: 'Story Count'
              }
          },
          tooltip: {
              headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
              pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
                  '<td style="padding:0"><b>{point.y:.1f} mm</b></td></tr>',
              footerFormat: '</table>',
              shared: true,
              useHTML: true
          },
          plotOptions: {
              column: {
                  pointPadding: 0.2,
                  borderWidth: 0
              }
          },
        },
        chartData: {
          series: [{
              name: 'Alpha',
              data: [49.9, 71.5, 106.4, 129.2, 144.0, 176.0, 135.6, 148.5, 216.4, 194.1, 95.6, 54.4]

          }, {
              name: 'Beta',
              data: [83.6, 78.8, 98.5, 93.4, 106.0, 84.5, 105.0, 104.3, 91.2, 83.5, 106.6, 92.3]

          }, {
              name: 'Gamma',
              data: [13.6, 72.8, 48.5, 83.4, 106.0, 84.5, 305.0, 74.3, 91.2, 53.5, 106.6, 12.3]

          }
          ]
        }
      });

    },

    // Create all grids in the left/right columns
    _buildGrids: function() {

      var grids = [
        {
          title: 'Blocked Stories',
          model: 'User Story',
          columns: ['FormattedID', 'Name', 'Owner', 'Blocked'],
          side: 'Left',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            return Ext.create('Rally.data.wsapi.Filter', {
                property: 'blocked', operator: '=', value: 'true'
            });
          }
        },
        {
          title: 'Unsized Stories with Features',
          model: 'User Story',
          columns: ['FormattedID', 'Name', 'Owner', 'Feature'],
          side: 'Right',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            var featureFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Feature', operator: '!=', value: 'null'
            });
            var noPlanEstimateFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'PlanEstimate', operator: '=', value: 'null'
            });

            return featureFilter.and(noPlanEstimateFilter);
          }
        },
        {
          title: 'Unsized Stories with Release',
          model: 'User Story',
          columns: ['FormattedID', 'Name', 'Owner', 'Release'],
          side: 'Left',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            var releaseFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Release', operator: '!=', value: 'null'
            });
            var noPlanEstimateFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'PlanEstimate', operator: '=', value: 'null'
            });

            return releaseFilter.and(noPlanEstimateFilter);
          }
        },
        {
          title: 'Features with no stories',
          model: 'PortfolioItem/Feature',
          columns: ['FormattedID', 'Name', 'PlannedEndDate'],
          side: 'Right',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            var userstoryFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'UserStories.ObjectID', operator: '=', value: 'null'
            });
            var noPlanEstimateFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'PlannedEndDate', operator: '<', value: 'NextWeek'
            });

            return userstoryFilter.and(noPlanEstimateFilter);
          }
        },
        {
          title: 'Features with no Iteration stories',
          model: 'UserStory',
          columns: ['FormattedID', 'Name', 'Feature'],
          side: 'Left',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            var featureFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Feature', operator: '!=', value: 'null'
            });
            var noPlanEstimateFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Iteration', operator: '=', value: 'null'
            });

            return featureFilter.and(noPlanEstimateFilter);
          }
        },
        {
          title: 'Features with unaccepted stories in past sprints',
          model: 'UserStory',
          columns: ['FormattedID', 'Name', 'Feature', 'ScheduleState'],
          side: 'Right',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            var featureFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Feature', operator: '!=', value: 'null'
            });
            var enddateFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'Iteration.EndDate', operator: '<', value: 'Today'
            });
            var unacceptedFilter = Ext.create('Rally.data.wsapi.Filter', {
                property: 'ScheduleState', operator: '<', value: 'Accepted'
            });

            return featureFilter.and(unacceptedFilter).and(enddateFilter);
          }
        },

      ];

      var allPromises = [];
      _.each(grids, function(grid) {
        promise = this._addGrid(grid.title, grid.model, grid.columns, grid.filters, grid.side, grid.pageSize);

        promise.then({
          success: function(count, data) {
            this.globalGridCount.push(count);
          },
          error: function(error) {
            console.log('single: error', error);
          },
          scope: this
        }).always(function() {
          console.log('single - always');
        });

        allPromises.push(promise);
      }, this);

      Deft.promise.Promise.all(allPromises).then({
        success: function() {
          console.log('all counts finished!', this.globalGridCount);
          this.down('#ribbon').show();
          this._buildCharts();
        },
        failure: function(error) {
          console.log('all error!', error);
        },
        scope: this
      });

    },

    // Utility function to generically build a grid and add to a container with given specs
    _addGrid: function(myTitle, myModel, myColumns, myFilters, gridSide, pageSize) {

      var deferred = Ext.create('Deft.Deferred');

      // lookup left or right side
      var gridContainer = this.down('#grids' + gridSide);
      // new grid with store data
      var grid = Ext.create('Rally.ui.grid.Grid', {
        xtype: 'rallygrid',
        title: myTitle,
        columnCfgs: myColumns,
        pagingToolbarCfg: {
          pageSizes: [3,5,10,15]
        },
        storeConfig: {
          model: myModel,
          context: this.context.getDataContext(),
          autoLoad: {start: 0, limit: pageSize},
          filters: myFilters(),
          listeners: {
            load: function(store) {
              console.log("loaded store!", 'store count', store.getCount(), 'total count', store.getTotalCount());
              deferred.resolve(store.getTotalCount());  // TODO more meta data?
            }
          }
        },
        padding: 10,
        style: {
          borderColor: '#AAA',
          borderStyle: 'dotted',
          borderWidth: '2px'
        },
        syncRowHeight: false
      });
      // show me the grid!
      gridContainer.add(grid);

      return deferred.promise;

      /* EXAMPLE for loading a store and viewing a Grid  (pre-template version)
      var blockedStoriesStore = Ext.create('Rally.data.wsapi.Store', {
        model: 'UserStory',
        context: this.context.getDataContext(),
        autoLoad: {start: 0, limit: 5},
        filters: [
          {
            property: 'blocked',
            operator: '=',
            value: 'true'
          }
        ],
        listeners: {
          load: function(myStore, data) {
            console.log('got', data);
            var blockedStoriesGrid = Ext.create('Rally.ui.grid.Grid', {
              title: 'Blocked Stories',
              columnCfgs: ['FormattedID', 'Name', 'Owner'],
              store: myStore
            });
            var ls = this.down('#leftGrids');
            ls.add(blockedStoriesGrid);

          },
          scope: this
        }
      });
      */
    }

});


