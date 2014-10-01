var newscope = true;
Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    componentCls: 'app',
    width: 800,
    layout:{
      type: 'vbox'
    },
    scopeType: 'release',
    launch: function() {
        this.add( //{{{
            {
                xtype: 'button',
                itemId: 'goButton',
                text: 'Go',
                border: 1,
                margin: '10 4 4 10',
                listeners: {
                    click: function() {
                            window.newscope = true;
                        },
                    mouseover: function() {
                            console.log(window.newscope);
                            if(!this.mousedover) {
                                this.mousedover=true;
                                alert('Click Go to load the data');
                            }
                        }
                    },
            },
            {
               xtype: 'container',
               itemId: 'releaseInfo',
               tpl: [
                    '<div class="releaseInfo"><p><b>About this release: </b><br />',
                    '<p class="release-notes">{notes}</p>',
                    'Additional information is available <a href="{detailUrl}" target="_top">here.</a></p></div>'
                ]
            },
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
                }
            },
            {
                xtype: 'container',
                itemId: 'gridsContainer',
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
                    style: {
                      borderColor: '#AAA',
                      borderStyle: 'solid'
                    }
                  },
                  {
                    xtype: 'container',
                    itemId: 'gridsRight',
                    width: 750,
                    border: 1,
                    style: {
                      borderColor: '#AAA',
                      borderStyle: 'solid'
                    }
                  }
                ]
      } 
    ); //}}}
     this.callParent(arguments);
    },
    /*globalGridCount: [],   // count entry for each grid
    globalGridMap: {'C1':'', 'C2':'', 'C3':'','C4':'','C5':'','C6':''},
    globalStoryCount: [],
    globalTeamCount: {},*/
    
    onScopeChange: function(scope) {
      //launch(scope)
      //console.log('Ribbon element: ',this.down('#ribbon'));
      //if(window.newscope) {
         this.down('#ribbon').removeAll();
         this.globalGridCount=[];   // count entry for each grid
         this.globalGridMap={'C1':'', 'C2':'', 'C3':'','C4':'','C5':'','C6':''};
         this.globalStoryCount=[];
         this.globalTeamCount={};
         this.down('#ribbon').hide();
         this._gridsLoaded = false;
         this.down('#gridsLeft').removeAll();
         this.down('#gridsRight').removeAll();
         this._loadReleaseDetails(scope);
         this._buildGrids(scope);
         //this._buildCharts();
         window.newscope=true;
       //} else {
       //  this._refreshGrids(scope);
       //}
    },

        _refreshGrids: function() {
            var filter = [this.getContext().getTimeboxScope().getQueryFilter()];
            var gridContainerLeft = this.down('#gridsLeft');
            var gridContainerRight = this.down('#gridsRight');
            gridContainerLeft.down('#C1').filter(filter, true, true);
            gridContainerLeft.down('#C3').filter(filter, true, true);
            gridContainerLeft.down('#C5').filter(filter, true, true);
            gridContainerRight.down('#C2').filter(filter, true, true);
            gridContainerRight.down('#C4').filter(filter, true, true);
            gridContainerRight.down('#C6').filter(filter, true, true);
        },

        _loadReleaseDetails: function(scope) {
            var release = scope.getRecord();
            if (release) {
                var releaseModel = release.self;

                releaseModel.load(Rally.util.Ref.getOidFromRef(release), {
                    fetch: ['Notes'],
                    success: function(record) {
                        this.down('#releaseInfo').update({
                            detailUrl: Rally.nav.Manager.getDetailUrl(release),
                            notes: record.get('Notes')
                        });
                    },
                    scope: this
                });
            }
        },

    // Create all charts in the header ribbon
    _buildCharts: function() {
      console.log('now building charts');
      this._buildBarChart();
      //this._buildBubbleChart();
      //this._buildPieChart();
      //this._buildColumnChart();
      this._chartsReady = true;
    },

    
    _buildBarChart: function() { //{{{
        console.log('starting to build bar chart');
        console.log(this.globalGridMap);
        console.log(this.globalGridCount);
        if(_.every(this.globalGridCount, function(elem) { return elem==0;})) {
            this.down('#ribbon').add({
                xtype: 'component',
                html: 'Congrats! The Train is healthy for this release'
            });
        } else {
        var chartCfg = {
            chart: {
                type: 'bar',
                width: 300,
                height: 250
            },
            title: {
                text: 'Story Counts by Grid'
            },
            yAxis: {},
            xAxis: {
                categories: function () {
                    temp = _.map(this.globalStoryCount, function(x) {return x.name;});
                    console.log('CATEGORIES');
                    console.log(temp);
                    return temp;
                },
                labels: {
                    enabled: true,
                    step: 1,
                    formatter: function() {
                        return 'Grid '+ this.value;
                    }
                },
                tickInterval: 1 
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
                shadow: true,
                enabled: false
            },
            credits: {
                enabled: false
            }
        };
        var chartDt = {
            series: [{
                name: 'Grid Counts',
                //data: _.map(this.globalGridMap, function(value, key) {return value;})
                //dataLabels: _.map(this.globalGridMap, function(value, key) {return key;})
                //data: this.globalGridMap
                data: this.globalStoryCount
            }]
        };

        this.down('#ribbon').add({
            xtype: 'rallychart',
            chartConfig: chartCfg,
            chartData: chartDt,
            flex: 1,
            scope: this
        });
        }
        console.log('finished bar');

    }, //}}}



    _buildPieChart: function() { //{{{

       
      this.down('#ribbon').add({
        xtype: 'rallychart',
        flex: 1,
        chartConfig: { 
          chart: {
              plotBackgroundColor: null,
              plotBorderWidth: 1,//null,
              plotShadow: false,
              width: 300,
              height: 250
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
        }, 
        chartData: { 
          series: [{
              type: 'pie',
              name: 'Team Block',
              data: this.globalStoryCount
              //data: [
             //     ['Alpha',   45.0],
               //   ['Beta',       26.8],
                 // {
                   //   name: 'Gamma',
                     // y: 12.8,
                     // sliced: true,
                     // selected: true
                  //}
              //]
          }]
        } 
      });

    }, //}}}

    _buildBubbleChart: function() { //{{{

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
          }
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

    }, //}}}

    _buildColumnChart: function() { //{{{

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
          }
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

    }, //}}}

    // Create all grids in the left/right columns
    _buildGrids: function(scope) {
    
      var grids = [ //{{{
        {
          title: 'C1: Blocked Stories',
          model: 'User Story',
          listeners: {
              scope: this
          },
          columns: ['FormattedID', 'Name', 'Project', 'Blocked'],
          side: 'Left',    // TODO: ensure camelcase format to match itemId names
          pageSize: 3,
          filters: function() {
            return Ext.create('Rally.data.wsapi.Filter', {
                property: 'blocked', operator: '=', value: 'true'
            });
          },
          chartnum: 'C1'
        },
        {
          title: 'C2: Unsized Stories with Features',
          model: 'User Story',
          listeners: {
              scope: this
          },
          columns: ['FormattedID', 'Name', 'Project', 'Feature','PlanEstimate'],
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
          },
          chartnum: 'C2'
        },
        {
          title: 'C3: Unsized Stories with Release',
          model: 'User Story',
          listeners: {
              scope: this
          },
          columns: ['FormattedID', 'Name', 'Project', 'PlanEstimate'],
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
          },
          chartnum: 'C3'
        },
        {
          title: 'C4: Features with no stories',
          model: 'PortfolioItem/Feature',
          listeners: {
              scope: this
          },
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
          },
          chartnum: 'C4'
        },
        {
          title: 'C5: Stories attached to Feature in Release without Iteration',
          model: 'UserStory',
          listeners: {
              scope: this
          },
          columns: ['FormattedID', 'Name', 'Feature','Iteration'],
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
          },
          chartnum: 'C5'
        },
        {
          title: 'C6: Features with unaccepted stories in past sprints',
          model: 'UserStory',
          listeners: {
              scope: this
          },
          columns: ['FormattedID', 'Name','Project', 'ScheduleState'],
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
          },
          chartnum: 'C6'
        }

      ]; //}}}


      var allPromises = [];
      //var promise = new Deft.promise.Promise();
      _.each(grids, function(grid) {
        console.log(grid.chartnum);
        promise = this._addGrid(grid.title, grid.model, grid.columns, grid.filters, grid.side, /*grid.pageSize,*/grid.chartnum,scope);
        //console.log('This is the promise: ',promise);
        promise.then({
          success: function(count, key) {
            //console.log('Attempting deffered');
            this.globalGridCount.push(count[0]);
            this.globalGridMap[count[1]]=count[0];
            this.globalStoryCount.push(count[2]);
            console.log('Grid Map', this.globalGridMap);
            console.log(count);
          },
          error: function(error) {
            console.log('single: error', error);
          },
          scope: this
        }).always(function() {
          //console.log('single - always');
        });

        allPromises.push(promise);
      }, this);

      Deft.promise.Promise.all(allPromises).then({
        success: function() {
          console.log('all counts finished!', this.globalGridCount);
          console.log(this.globalGridMap);
          console.log(this.globalStoryCount);
          console.log(Object.keys(this.globalGridMap));
          this._gridsLoaded = true;
          this.down('#ribbon').show();
          this._buildCharts();
          console.log('Got Grid Map:',this.globalGridMap);
          window.newscope=false;
        },
        failure: function(error) {
          console.log('all error!', error);
        },
        scope: this
      });

    },

    // Utility function to generically build a grid and add to a container with given specs
    _addGrid: function(myTitle, myModel, myColumns, myFilters, gridSide,cnum,scope) {

      var deferred = Ext.create('Deft.Deferred');
      // lookup left or right side
      var gridContainer = this.down('#grids' + gridSide);
      
      // new grid with store data
      var grid = Ext.create('Rally.ui.grid.Grid', {
        xtype: 'rallygrid',
        itemId: cnum,
        title: myTitle,
        columnCfgs: myColumns,
        showPagingToolbar: true,
        pagingToolbarCfg: {
          pageSizes: [3,5,10,15],
          //pageSize:5,
          autoRender: true,
          resizable: true,
          //store: storeConfig
        },
        storeConfig: {
          model: myModel,
          //context: this.context.getDataContext(),
          //this.getContext().getTimeboxScope().getQueryFilter(), 
          autoLoad:{start: 0, limit: 3},
          //filters: [this.getContext().getTimeboxScope().getQueryFilter()],
          pageSize: 3,
          pagingToolbarCfg: {
            pageSizes: [3,5,10,15],
            //pageSize:5,
            autoRender: true,
            resizable: true,
            //store: storeConfig
            },
          filters: [this.getContext().getTimeboxScope().getQueryFilter(),myFilters()],
          listeners: {
            load: function(store) {
              var tempcount=store.getTotalCount();
              console.log('Loaded store', store);
              var elem = {
                    name : cnum,
                    x: cnum.charAt(1),
                    y: tempcount
                  };
              //console.log(elem);
              //console.log("this is chart ",cnum);
                    if(window.newscope) {
                        deferred.resolve([store.getTotalCount(),String(cnum),elem]);
                        // TODO more meta data?
                    } else {
                        console.log('Deferred done already');
                    }
            }
          }
        },
        padding: 10,
        style: {
          borderColor: '#AAA',
          borderStyle: 'dotted',
          borderWidth: '2px'
        },
        syncRowHeight: false,
        scope: this
      });
      // show me the grid!
      gridContainer.add(grid);
      if (!this._gridsLoaded) {
        return deferred.promise;
      }
      return true;

    },

    fireReady : function() {
        if(Rally.BrowserTest && this._gridsLoaded && this._chartsReady && !this.readyFired) {
            console.log('Reached fire ready');
            this.readyFired = true;
            Rally.BrowserTest.publishComponentReady(this);

        }
    }

});


