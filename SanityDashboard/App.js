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
    /*{
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
},*/
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
            pack: 'center',
            margin: '20px'
       },
style: {
borderColor: '#AAA',
             borderStyle: 'solid'
       }
},
{
xtype: 'container',
       itemId: 'gridsContainer',
       padding: 5,
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
       },
items: [{ 
xtype: 'component',
       html: "<b>Story Health</b>"
       }]
       },
       {
xtype: 'container',
       itemId: 'gridsRight',
       width: 750,
       border: 1,
       style: {
borderColor: '#AAA',
             borderStyle: 'solid'
       },
items: [{ 
xtype: 'component',
       html: "<b>Feature Health</b>"
       }]
       }
       ]
} 
); //}}}
this.callParent(arguments);
},

onScopeChange: function(scope) {
                   this.down('#ribbon').removeAll();
                   this.globalGridCount=[];   // count entry for each grid
                   this.globalGridMap={'C1':'', 'C2':'', 'C3':'','C4':'','C5':'','C6':'', 'C7': ''};
                   this.globalStoryCount=[];
                   this.globalTeamCount={};
                   //this.down('#ribbon').hide();
                   this._gridsLoaded = false;
                   this.down('#gridsLeft').removeAll();
                   this.down('#gridsLeft').add({
                        xtype: 'container',
                        html: '<b><font size=4>Story Health</font></b>',
                        //layout: { type: 'hbox', pack: 'center' }
                    });
                    this.down('#gridsRight').removeAll();
                    this.down('#gridsRight').add({
                        xtype: 'container',
                        html: '<b><font size=4>Feature Health</font></b>',
                        //layout: { type: 'hbox', pack: 'center' }
                    });
                    this._loadReleaseDetails(scope);
                    this._buildGrids(scope);
                    this.readyFired = false;
                    this._chartsReady=false;
                    window.newscope=true;
},

_refreshGrids: function() {
                   var filter = [this.getContext().getTimeboxScope().getQueryFilter()];
                   var gridContainerLeft = this.down('#gridsLeft');
                   var gridContainerRight = this.down('#gridsRight');
                   gridContainerLeft.down('#C1').filter(filter, true, true);
                   gridContainerLeft.down('#C3').filter(filter, true, true);
                   gridContainerLeft.down('#C5').filter(filter, true, true);
                   gridContainerLeft.down('#C7').filter(filter, true, true);
                   gridContainerLeft.down('#C2').filter(filter, true, true);
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
                  if(_.every(this.globalGridCount, function(elem) { return elem===0;})) {
                      this.down('#ribbon').add({
xtype: 'component',
html: '<b><font color="green" size=18>Congrats! The Train is healthy for this release</font></b>'
});
} else {
    console.log('now building charts');
    this.down('#ribbon').add({
        xtype: 'component',
        layout: {align: 'stretch', pack: 'center', margin: '40px'},
        html: '&emsp;&emsp;&emsp;&emsp;'
    });
    //this._buildBarChart();
    this._buildRibbon();
    this.down('#ribbon').add({
        xtype: 'component',
        layout: {align: 'stretch', pack: 'center', margin: '40px'},
        html: '&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;'
    });
    //this._buildDonutChart();
    //this._buildBubbleChart();
    this._buildPieChart();
    //this._buildColumnChart();
    this._chartsReady = true;
}
},

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

_buildRibbon: function() { //{{{

                  var linkid = '<b><app class="jump {state}">{title}:&emsp;<a href="#C{name}">{count}</a><p></b></app>';
                  function compare(a,b) {
                      if(a.x < b.x)
                          return -1;
                      if (a.x > b.x)
                          return 1;
                      return 0;
                  };
                  var tempobj = this.globalStoryCount.sort(compare);
                  var newhtml = "<br>";
                  var line;
                  console.log("building ribbon with" , tempobj);
                  for(var i=0; i < 7; i++) {
                      //var dummymodel = new Rally.data.Model(tempobj[i]);
                      console.log("got data ", tempobj[i]);
                      line = linkid.replace("{name}",tempobj[i].x).replace("{title}",tempobj[i].name).replace("{count}",tempobj[i].y);
                      if (tempobj[i].y == 0)
                          line = line.replace("{state}", "healthy");
                      else
                          line = line.replace("{state}", "unhealthy");

                      console.log(line);
                      newhtml =  newhtml.concat(line);
                      //console.log(linkid.replace("{name}",tempobj[i].x).replace("{title}",tempobj[i].name).replace("{count}",tempobj[i].y));
                      //newhtml = newhtml.concat(linkid.replace("{name}",tempobj[i].x).replace("{title}",tempobj[i].name).replace("{count}",tempobj[i].y));

                  }
                  this.down('#ribbon').add({
xtype: 'component',
layout: {align: 'stretch', pack: 'center', margin: '40px'},
itemId: 'ribbondata',
html: newhtml
/*html : [
  linkid.replace("{name}",tempobj[i].x).replace("{title}",tempobj[i].name).replace("{count}",tempobj[i].y)
  ],
  data: {
  Grid: tempobj[i].name,
  Count: linkid.replace("{name}",tempobj[i].x).replace("{title}",tempobj[i].y)
  }*/
});        

}, //}}}

_buildBarChart: function() { //{{{
                    console.log('starting to build bar chart');
                    console.log(this.globalGridMap);
                    console.log(this.globalGridCount);
                    /*if(_.every(this.globalGridCount, function(elem) { return elem===0;})) {
                      this.down('#ribbon').add({
xtype: 'component',
html: '<b><font color="green" size=18>Congrats! The Train is healthy for this release</font></b>'
});
} else {*/
                    function compare(a,b) {
                        if(a.x < b.x)
                            return -1;
                        if (a.x > b.x)
                            return 1;
                        return 0;
                    };
                    var tempobj = this.globalStoryCount.sort(compare);
                    console.log('Sorted obj', tempobj);
                    var tempcat = _.map(this.globalStoryCount, function(x) {return x.name;});
                    console.log('categories', tempcat);
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
categories: tempcat,
            /*function () {
              temp = _.map(this.globalStoryCount, function(x) {return x.name;});
              console.log('CATEGORIES');
              console.log(temp);
              return temp;
              },*/
            labels: {
enabled: true,
         step: 1,
         formatter: function() {
             return tempobj[this.value-1].name;
         }
            },
tickInterval: 1 
       },
legend: {
layout: 'vertical',
        align: 'center',
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
      data: tempobj
        }]
                    };

                    this.down('#ribbon').add({
xtype: 'rallychart',
chartConfig: chartCfg,
chartData: chartDt,
flex: 1,
layout: {
pack: 'center'
},
scope: this
});
//}
console.log('finished bar');

}, //}}}


_buildDonutChart: function() { //{{{
                      console.log('starting to build bar chart');
                      console.log(this.globalGridMap);
                      console.log(this.globalGridCount);
                      /*if(_.every(this.globalGridCount, function(elem) { return elem===0;})) {
                        this.down('#ribbon').add({
xtype: 'component',
html: '<b><font color="green" size=18>Congrats! The Train is healthy for this release</font></b>'
});
} else {*/
                      function compare(a,b) {
                          if(a.x < b.x)
                              return -1;
                          if (a.x > b.x)
                              return 1;
                          return 0;
                      };
                      var tempobj = this.globalStoryCount.sort(compare);
                      console.log('Sorted obj', tempobj);
                      var tempcat = _.map(this.globalStoryCount, function(x) {return x.name;});
                      console.log('categories', tempcat);
                      var chartCfg = {
chart: {
type: 'pie',
      width: 300,
      height: 250,
      innerSize: '50%'
       },
title: {
text: 'Story Counts by Grid'
       },
yAxis: {},
       xAxis: {
categories: tempcat,
            /*function () {
              temp = _.map(this.globalStoryCount, function(x) {return x.name;});
              console.log('CATEGORIES');
              console.log(temp);
              return temp;
              },*/
            labels: {
enabled: true,
         step: 1,
         formatter: function() {
             return tempobj[this.value-1].name;
         }
            },
tickInterval: 1 
       },
legend: {
layout: 'vertical',
        align: 'center',
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
      data: tempobj
        }]
                      };

                      this.down('#ribbon').add({
xtype: 'rallychart',
chartConfig: chartCfg,
chartData: chartDt,
flex: 1,
layout: {
pack: 'center'
},
scope: this
});
//}
console.log('finished bar');

}, //}}}

_buildPieChart: function() { //{{{
console.log(this.globalGridMap);
var tempobj = _.map(this.globalStoryCount, function(value) { return[value.name, value.y]; });
console.log(tempobj);
this.down('#ribbon').add({
    xtype: 'rallychart',
    flex: 1,
    layout: {
        align: 'stretch',
        pack: 'center'
    },
    scope: this,
    chartConfig: { 
            chart: {
                plotBackgroundColor: null,
                plotBorderWidth: 0,//null,
                plotShadow: false,
                width: 800,
                height: 250
            },
            title: {
                text: 'Grid Count'
            },
            tooltip: {enabled: false},
            plotOptions: {
                pie: {
                    allowPointSelect: true,
                    cursor: 'pointer',
                    dataLabels: {
                        enabled: true,
                        distance: 15,
                        format: '<b>{point.name}</b>: {y}',
                        style: {color: 'black'}
                    },
                    startAngle: -90,
                    endAngle: 90,
                    center: ['50%','75%']
                }
           }
        }, 
        chartData: { 
            series: [{
                type: 'pie',
                name: 'Grid Count',
                data: tempobj//this.globalGridCount
        }]
           } 
});

}, //}}}

    // Create all grids in the left/right columns
_buildGrids: function(scope) {

                 var grids = [ //{{{
                 {
title: 'Blocked Stories',
       model: 'User Story',
       listeners: {
scope: this
       },
columns: ['FormattedID', 'Name', 'Project', 'Blocked', 'BlockedReason'],
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
title: 'Unsized Stories with Features',
       model: 'User Story',
       listeners: {
scope: this
       },
columns: ['FormattedID', 'Name', 'Project', 'Feature','PlanEstimate'],
         side: 'Left',    // TODO: ensure camelcase format to match itemId names
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
title: 'Unsized Stories with Release',
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
title: 'Features with no stories',
       model: 'PortfolioItem/Feature',
       listeners: {
scope: this
       },
columns: ['FormattedID', 'Name', 'PlannedEndDate'],
         side: 'Right',    // TODO: ensure camelcase format to match itemId names
         pageSize: 3,
         filters: function() {
             var userstoryFilter = Ext.create('Rally.data.wsapi.Filter', {
property: 'UserStories.ObjectID', operator: 'contains', value: 'null'
});
var noPlanEstimateFilter = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlannedEndDate', operator: '<', value: 'NextWeek'
});

return userstoryFilter.and(noPlanEstimateFilter);
},
chartnum: 'C4'
},
{
title: 'Stories attached to Feature without Iteration',
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
title: 'Features with unaccepted stories in past sprints',
       model: 'UserStory',
       listeners: {
scope: this
       },
columns: [    
         {text: 'Feature', dataIndex: 'Feature', flex: 3, renderer: function(value) {
                                                                                        return value.FormattedID.link("https://rally1.rallydev.com/#/"+value.Project.ObjectID+"d/detail/portfolioitem/feature/"+value.ObjectID);}},
         'FormattedID', 'Name','Project', 'ScheduleState',
         ],
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
},
{
title: 'Improperly Sized Stories',
       model: 'User Story',
       listeners: {
scope: this
       },
columns: ['FormattedID', 'Name', 'Project', 'PlanEstimate'],
         side: 'Left',    // TODO: ensure camelcase format to match itemId names
         pageSize: 3,
         filters: function() {
             var noPlanEstimateFilter = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlanEstimate', operator: '!=', value: 'null'
});
var planSizeOne = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlanEstimate', operator: '!=', value: '1'
});
var planSizeTwo = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlanEstimate', operator: '!=', value: '2'
});
var planSizeFour = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlanEstimate', operator: '!=', value: '4'
});
var planSizeEight = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlanEstimate', operator: '!=', value: '8'
});
var planSizeSixteen = Ext.create('Rally.data.wsapi.Filter', {
property: 'PlanEstimate', operator: '!=', value: '16'
});

return noPlanEstimateFilter.and(planSizeOne).and(planSizeTwo).and(planSizeFour).and(planSizeEight).and(planSizeSixteen);
},
chartnum: 'C7'
},

    ]; //}}}


    var allPromises = [];
    _.each(grids, function(grid) {
            //console.log(grid.chartnum);
            promise = this._addGrid(grid.title, grid.model, grid.columns, grid.filters, grid.side, grid.chartnum,scope);
            promise.then({
success: function(count, key) {
this.globalGridCount.push(count[0]);
this.globalGridMap[count[1]]=count[0];
this.globalStoryCount.push(count[2]);
},
error: function(error) {
console.log('single: error', error);
},
scope: this
}).always(function() {
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
              var linkid = '<a id={name}>{title}</a>';
              var deferred = Ext.create('Deft.Deferred');
              // lookup left or right side
              var gridContainer = this.down('#grids' + gridSide);
              //this.shouldiaddgrid = false; 
              // new grid with store data
              var grid = Ext.create('Rally.ui.grid.Grid', {
xtype: 'rallygrid',
itemId: cnum,
title: linkid.replace('{name}',cnum).replace('{title}',myTitle),
columnCfgs: myColumns,
showPagingToolbar: true,
pagingToolbarCfg: {
pageSizes: [15, 25, 100],
autoRender: true,
resizable: true,
},
storeConfig: {
model: myModel,
autoLoad:{start: 0, limit: 15},
pageSize: 15,
pagingToolbarCfg: {
pageSizes: [15,25,100],
autoRender: true,
resizable: true,
},
filters: [this.getContext().getTimeboxScope().getQueryFilter(),myFilters()],
    listeners: {
load: function(store) {
          var tempcount=store.getTotalCount();
          console.log('Loaded store', store);
          //console.log('should i add grid', shouldiaddgrid);
          store.each(function(record) {console.log(record);});
          var elem = {
name : myTitle,
       x: cnum.charAt(1),
       y: tempcount
          };
          if (tempcount!=0) {
              this.shouldiaddgrid=true;
              gridContainer.add(grid);
          }
          console.log(this);
          if(window.newscope) {
              deferred.resolve([store.getTotalCount(),String(cnum),elem]);
              // TODO more meta data?
          } else {
              console.log('Deferred done already');
          }
      }
    },
    //each: function(record) {
    //    console.log(record);
    //    }
scope: this
},
style: {
borderColor: '#AAA',
             borderStyle: 'dotted',
             borderWidth: '2px',
             //header: '#BCED91'
       },
padding: 10,
    syncRowHeight: false,
    scope: this
    });
// show me the grid!
console.log('should i add grid', this.shouldiaddgrid);
grid.setBodyStyle('background', '#BCED91');
//gridContainer.add(grid);
if (!this._gridsLoaded) {
    return deferred.promise;
}
return true;

},


});


