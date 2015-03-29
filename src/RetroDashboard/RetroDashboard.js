    Ext.define('RetroDashboard', {
        extend: 'IntelRallyApp',
        componentCls: 'app',
        requires: [
            'FastCfdCalculator'
        ],
        mixins: [
            'PrettyAlert',
            'UserAppsPreference',
            'IntelWorkweek',
            'ReleaseQuery',
            'ChartUpdater',
            'ParallelLoader'
        ],
        items:[{
        xtype: 'container', //outside container has dropdown and the donut container
        id: 'retroWrapper',
        cls: 'chart-wrapper',
        items:[{
              xtype:'container',
              id: 'retroReleasePicker',
              marginTop: 40,
              marginBottom: 240
            },{
             xtype: 'container',//donut container divided later into three donut containers
             id: 'retroDonutWrapper',
             cls: 'donut-wrapper',
             layout: {
                 type: 'hbox',
                 align:'left'
                 },
             renderTo: document.body,
             items:[{
                    xtype:'container',//Scope container Wrapper
                    id : 'retroDonutScopeWrapper',
                    layout: {
                            type: 'hbox'
                            },
                   flex: 1,//it tries to give all the elements equal width but if not enough it overlaps which we want
                   items:[{
                        xtype:'container',
                        id: 'retroDonutScope',
                        //cls: 'chart-with-border3',
                        height: 210
                        },{
                        xtype:'container',
                        id: 'retroDonutScopeArrow'/* ,
                        cls: 'chart-with-border2', */
                        },
                        {
                        xtype:'container',
                        id: 'retroDonutScopeFooter'/* ,
                        cls: 'chart-with-border2' */
                        }]
                },{
                    xtype:'container',// CA original wrapper 
                    id: 'retroDonutCaOriginalWrapper',
                    layout: {
                            type: 'hbox'
                            },
                   flex: 1,//it tries to give all the elements equal width but if not enough it overlaps which we want
                   items:[{
                        xtype:'container',
                        id: 'retroDonutCaOriginal',
                        //cls: 'chart-with-border3',
                        height: 210
                        },{
                        xtype:'container',
                        id: 'retroDonutCaOriginalArrow'
                        //cls: 'chart-with-border2'
                        },{
                        xtype:'container',
                        id: 'retroDonutCaOriginalFooter'
                        //cls: 'chart-with-border2'
                        }]
                },{ xtype:'container',
                    id: 'retroDonutCaFinalWrapper',//CA final container
                    layout: {
                            type: 'hbox'
                            },
                   flex: 1,//it tries to give all the elements equal width but if not enough it overlaps which we want
                   items:[{
                        xtype:'container',
                        id: 'retroDonutCaFinal',//donut container
                        //cls: 'chart-with-border3',
                        height: 210
                        },{
                        xtype:'container',
                        id: 'retroDonutCaFinalArrow'//arrow container
                        //cls: 'chart-with-border2'
                        },{
                        xtype:'container',
                        id: 'retroDonutCaFinalFooter'
                        //cls: 'chart-with-border2'
                        }]
                }]
            },{
                xtype:'container',
                id: 'retroChart',
                marginTop: 40,
                marginBottom: 240
            }]
        }],
            /********************************************** SOME CONFIG CONSTANTS *******************************************/
        _chartColors: [
            '#ABABAB',
            '#E57E3A',
            '#E5D038',
            '#0080FF',
            '#3A874F',
            '#000000',
            '#26FF00'
        ],
        _defaultChartConfig: {
            chart: {
                defaultSeriesType: "area",
                zoomType: "xy"
            },
            xAxis: {
                tickmarkPlacement: "on",
                title: {
                    text: "Days",
                    margin: 10
                },
                labels: {
                    y: 20
                }
            },
            yAxis: {
                title: {
                    text: "Points"
                },
                labels: {
                    x: -5,
                    y: 4
                }
            },
            tooltip: {
                formatter: function () {
                    var sum = 0;
                    for(var i=4; i>= this.series.index; --i)
                        sum += this.series.chart.series[i].data[this.point.x].y;
                    return "<b>" + this.x + '</b> (' + datemap[this.point.x] + ')' +
                        "<br /><b>" + this.series.name + "</b>: " + this.y +
                        (this.series.index <=4 ? "<br /><b>Total</b>: " + sum : '');
                }
            },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    },
                    groupPadding: 0.01
                },
                area: {
                    stacking: 'normal',
                    lineColor: '#666666',
                    lineWidth: 2,
                    marker: {
                        enabled: false
                    }
                }
            }
        },
        _buildReleasePicker: function(){
            var me = this;
            //the intel release component takes the array of release and the current selected release
            me.ReleasePicker = Ext.getCmp('retroReleasePicker').add({
                    xtype: 'intelreleasepicker',//this is a intel component in intel-release-picker.js
                    labelWidth: 80,
                    width: 240,
                    releases: me.ReleaseStore.data.items,//input 1
                    currentRelease: me.ReleaseRecord,//input 2
                    listeners: {
                        change: me._onChangeReleasePicker,
                        select: me._onSelectReleasePicker,
                        scope: me
                    }
            });
        },
        _onChangeReleasePicker: function(combo, newval, oldval){
            var me = this;
            if(newval.length===0) combo.setValue(oldval); 
            //console.log("Release Change",combo,newval,oldval);
        },
        _onSelectReleasePicker: function(combo, records){
            var me = this;
            me.ReleaseRecord = me.ReleaseStore.findExactRecord('Name', records[0].data.Name);
            me._loadChart();
        },
        _loadAllChildReleases: function(){
            //debugger;
            var me = this,
                releaseName = me.ReleaseRecord.data.Name,
                //get the name of the train as the name is shared between all the child scrums
                trainName = me.TrainRecord.data.Name.split(' ART')[0];
                //mixin release-query.js _loadReleasesWithName
                return me._loadReleasesWithName(releaseName, trainName)
                .then(function(releaseStore){
                    return me.ReleaseWithName = releaseStore;
                });
        },
        //load all the child releases for 
        //https://rally1.rallydev.com/analytics/doc/#/manual
        //Rally lookback API provides the history of the data 
        //getting the history of user stories for the release selected
        _loadSnapshotStores: function(){
            //debugger;
            var me = this,
                promises = [];
                me.AllSnapshots = [];
                //releaseOid = [];
            me.ReleaseWithName.each(function(f,key){
                //releaseOid.push(f.data.ObjectID);
                var deferred = Q.defer();
                promises.push(deferred.promise);
            Ext.create('Rally.data.lookback.SnapshotStore', {
                    autoLoad:true,
                    limit: Infinity,
                    context:{
                        workspace: me.getContext().getWorkspace()._ref,
                        project: null
                    },
                    sort:{_ValidFrom:1},
                    compress:true,
                    find: {
                        _TypeHierarchy: "HierarchicalRequirement",
                        Children: null,                         //Release: {$in: releaseOid}
                        Release: f.data.ObjectID 
                    },
                    fetch:['ScheduleState', 'PlanEstimate'],
                    hydrate:['ScheduleState', 'PlanEstimate'],
                    listeners: {
                        load: function(store, records,success){
                            // console.log(key,f.data.ObjectID,success,records.length);
                            if(records.length > 0 && success){
                                me.AllSnapshots = me.AllSnapshots.concat(records);
                            } 
                            //TODO revisit this again
/*                          if(!success){
                                //sometimes the query fails
                                //this will reload again when it fails 
                                var reload = false;
                                do {
                                    console.log(reload,"reload");
                                    reload = me._onloadSnapshotStoresFailure(f.data.ObjectID);
                                }
                                while(reload);
                            } */
                            deferred.resolve();
                        },
                        single:true
                    }
                }); 
        });
        return Q.all(promises).then(function(){
                console.log('all snapshots done');
            });
        },
        _buildCharts: function(){
            var me = this,
            //with the release start and end date the calculator will calculate the work week
            calc = Ext.create('FastCfdCalculator',{
              startDate: me.ReleaseRecord.data.ReleaseStartDate,
              endDate: me.ReleaseRecord.data.ReleaseDate
            });
            if(me.AllSnapshots.length === 0 ){
                me._alert('ERROR', me.TrainRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name);
                return;     
            } 
            //chart config setting 
            //using jquery to use the high charts
            //uses ChartUpdater mixin
            //uses IntelWorkweek mixin
            var aggregateChartData = me._updateChartData(calc.runCalculation(me.AllSnapshots));
            datemap = aggregateChartData.datemap;
            //debugger;
            //retro dashboard calculation for the doughnut
            //taking sample 7 days before and after the release
            //data for calculating scope change
            //commit to accept original and final calculation
                total = {};
                total.initialCommit = 0;
                total.finalCommit = 0;
                total.finalAccepted = 0;
                total.projected = 0;
            _.each(aggregateChartData.series,function(f){
                if(f.name==="Accepted"){
                    total.finalAccepted = total.finalAccepted + f.data[aggregateChartData.categories.length - 6];
                }
                //we want to ignore the ideal and the projected from the aggregateChartData
                if(f.name !="Ideal" && f.name != "Projected"){
                    //taking sample after 7 days and before 7 days 
                    total.initialCommit = total.initialCommit + f.data[6];
                    total.finalCommit = total.finalCommit + f.data[aggregateChartData.categories.length - 6];
                }
                //if the release is still on going we would like to use the projected data for the final commit
                if(f.name === "Projected"){
                    total.projected = total.projected + f.data[aggregateChartData.categories.length - 6];
                }
            });
            if(total.finalCommit === 0){
                total.finalCommit = total.projected;
                total.finalAccepted = total.projected;
            }
            var commitDataPlus =[];
               // commitDataMinus = [];
            //adding a line for the initial Commitment projection
            _.each(aggregateChartData.categories,function(f,key){
                    commitDataPlus.push(total.initialCommit);
                    //commitDataMinus.push(total.initialCommit - 10);
            });
            //console.log(commitDataPlus,commitDataMinus);
            aggregateChartData.series.push({
                colorIndex: 1,
                symbolIndex: 1,
                dashStyle: "Solid",
                color: "red",
                data:commitDataPlus,
                name: "Commitment",
                type: "spline"
            });
/*          aggregateChartData.series.push({
                colorIndex: 1,
                symbolIndex: 1,
                dashStyle: "Solid",
                color: "red",
                data:commitDataMinus,
                name: "Commitment",
                type: "spline"
            }) */
/*                  //get ideal trendline if release has started
            _.reduce(aggregateChartData.series, function(sum, s){
                console.log(sum,s);
                return sum + (s.data[s.data.length-1] || 0);
                }, 0) 
                 */
            console.log("Aggregate data series",aggregateChartData.series,total.initialCommit);
            me.total = total;
            //setting the color of the chart
            Highcharts.setOptions({ colors: me._chartColors });
            var highchartsConfig = {
                chart: {
                    height:400,
                    events:{
                        load: function(){  }
                    }
                },
                legend:{
                    borderWidth:0,
                    width:500,
                    itemWidth:100
                },
                title: {
                    text: me.TrainRecord.data.Name 
                },
                subtitle:{
                    text: me.ReleaseRecord.data.Name.split(' ')[0]
                },
                xAxis:{
                    categories: aggregateChartData.categories,
                    tickInterval: me._getConfiguredChartTicks(
                        me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.66)
                },
                series: aggregateChartData.series
            };   
            //to use this for update
            //me.highchartsConfig  = highchartsConfig;
            $("#retroChart").highcharts(Ext.Object.merge(me._defaultChartConfig,highchartsConfig));
        },  
        _getConfiguredChartTicks: function(startDate, endDate, width){
            var pixelTickWidth = 40,
                ticks = width/pixelTickWidth>>0,
                oneDay = 1000*60*60*24,//this calculation is equivalent to one day 
                days = (endDate*1 - startDate*1)/(oneDay*5/7)>>0, //only workdays
                interval = ((days/ticks>>0)/5>>0)*5;
            return (interval < 5) ? 5 : interval; //make it weekly at the minimum
        },
        _loadChart: function(){
            var me = this;
            me.setLoading('Loading Charts');
            return me._loadAllChildReleases()
            .then(function() { return me._loadSnapshotStores(); })
            .then(function(){ 
                me._buildCharts(); 
                me.setLoading(false);})
            .then (function(){ 
                me.setLoading(false);
                me.setLoading('Loading Pie Charts');
                me._loadDonutChart(); 
                me._hideHighchartsLinks();
                me.setLoading(false);
                me._loadPortfolioItem();
           })
           .fail(function(reason){
                me.setLoading(false);
                me._alert('ERROR', reason || '');
                 })
            .done();            
        },
        _loadDonutChart: function(){
        
             var me = this;
             Ext.getCmp('retroDonutWrapper').show();
             //console.log("highchart config",me.highchartsConfig);
             //arrow inside the donut
             //debugger;
             //destroy the arrow items
             Ext.getCmp('retroDonutScopeArrow').removeAll();
             Ext.getCmp('retroDonutCaOriginalArrow').removeAll();
             Ext.getCmp('retroDonutCaFinalArrow').removeAll();
             
            if (me.total.initialCommit === 0 || me.total.finalCommit === 0 ){
                 $("#retroDonutScope").html(''); 
                 $("#retroDonutCaOriginal").html('');
                 $("#retroDonutCaFinal").html('');
                 me._alert('Note', 'The initial PlanEstimate is zero');
                 Ext.getCmp('retroDonutWrapper').hide();
                return;
            }
            /******************************************************* Donut settings ********************************************************/
            var scope = 0,
                originalCommitRatio = 0,
                finalCommitRatio = 0;
            //calculate difference between two data V1 and V2 
            //Percent difference = ( | ΔV |/ ( ∑V/2) ) * 100 = ( | (V1 - V2) | / ((V1 + V2)/2) ) * 100
            scopeDeltaPerc = ((me.total.finalCommit - me.total.initialCommit)/((me.total.initialCommit + me.total.finalCommit )/2)) * 100 ;
            originalCommitRatio = (me.total.finalAccepted/me.total.initialCommit)* 100 ;
            finalCommitRatio = (me.total.finalAccepted /me.total.finalCommit)* 100 ;
            //scope data 
            var drawComponentScope = Ext.create('Ext.draw.Component', {
                    width: 50,
                    height:50,
                    items: [{
                        type: "path",
                        path: "M150 0 L75 200 L225 200 Z" + "M110 200 h 80 v 80 h -80 Z", //up arrow
                        //path: "M180 20 h 30 v 50 h -30 Z" + "M160 50 h 70 L195 100 Z",//down arrow 
                        fill: "green"
                    }]
                });
            //fixing the numbers to be 20 and 80 so that the donut always looks the same
            //for a static UI
            var dataseries = [];
            dataseries.push(new Array('ScopeDelta',20));
            dataseries.push(new Array('In Scope',80));
            //center of the donut for 1st pie 
            //var center =
            var donutConfig = {
            chart: {
                height:200,
                plotBackgroundColor: '#FFFFFF',
                plotShadow: false
            },
            title: {
                align: 'left',
                verticalAlign: 'left',
                x: 300,
                y: 20
            },
            tooltip: {
                //pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
                formatter: function () {
                        //console.log(this.series.data[this.point.x].x);
                        //console.log(this.series.data[this.point.x].name);
                        return  this.series.data[this.point.x].name;
                        //return this.series.data.dataseries.name;
                    }
            },
            plotOptions: {
                pie: {
                    dataLabels: {
                        enabled: false,//enable true if you want anything in it 
                        distance: - 20,
                        formatter: function(){
                            return Math.round(this.percentage * 100)/100 + '%';//if you want the labels to be in percentage
                        },
                        style: {
                            fontWeight: 'bold',
                            color: 'black',
                            textShadow: '0px 1px 2px white'
                        }
                    },
                    showInLegend: false,//show legend true if you want to show the legend
                    startAngle: 0,
                    endAngle: 360,
                    center: ['40%', '60%']//center of the circle, left top of the screen is the origin 
                }
            },
            series: [{
                type: 'pie',
                name: 'scope',
                innerSize: '80%',
                data: dataseries
            }]
        };
        /******************************************************* Donut 1 ********************************************************/
        //debugger;
        //#808080 Initial Commit
        //#7cb5ec Final Commit 
        //#3A874F Final Accepted        
        //scope config
        donutConfig.title.text = 'Scope <br/>' + scopeDeltaPerc.toFixed(2) + '% <br/>'; //+ me.total.finalCommit.toFixed(2) + ' of ' + me.total.initialCommit.toFixed(2);
        //debugger;
        $("#retroDonutScopeFooter").html(me.total.finalCommit.toFixed(2) + ' of ' + me.total.initialCommit.toFixed(2));
        //Ext.getCmp('retroDonutScopeFooter').add(me.total.finalCommit.toFixed(2) + ' of ' + me.total.initialCommit.toFixed(2));
        if(scopeDeltaPerc >=0 && scopeDeltaPerc <= 10.99){
            Highcharts.setOptions({ colors: ['#3A874F','#7cb5ec'] });
            drawComponentScope.items[0].path = "M150 0 L75 200 L225 200 Z" + "M110 200 h 80 v 80 h -80 Z";
            drawComponentScope.items[0].fill ="green";
        }else{
            Highcharts.setOptions({ colors: ['#E62E00','#7cb5ec'] });
            drawComponentScope.items[0].path = "M180 20 h 30 v 50 h -30 Z" + "M160 50 h 70 L195 100 Z";
            drawComponentScope.items[0].fill ="red";
        }
    
        $("#retroDonutScope").highcharts(donutConfig);
        Ext.getCmp('retroDonutScopeArrow').add(drawComponentScope);
        /******************************************************* Donut 2 ********************************************************/
            //C/A Ratio Original Config
         var drawComponentOri = Ext.create('Ext.draw.Component', {
                    width: 50,
                    height:50,
                    items: [{
                        type: "path",
                        path: "M150 0 L75 200 L225 200 Z" + "M110 200 h 80 v 80 h -80 Z", //up arrow
                        //path: "M180 20 h 30 v 50 h -30 Z" + "M160 50 h 70 L195 100 Z",//down arrow 
                        fill: "green"
                    }]
                });
        
        donutConfig.series.data = dataseries;
        donutConfig.title.text = 'C/A Ratio Original <br/>' + originalCommitRatio.toFixed(2) + '%<br/>'; //+ me.total.finalAccepted.toFixed(2) + ' of ' + me.total.initialCommit.toFixed(2);
        $("#retroDonutCaOriginalFooter").html(me.total.finalAccepted.toFixed(2) + ' of ' + me.total.initialCommit.toFixed(2));
        if(originalCommitRatio >= 90){//100 percentage would be all the work completed so plus minus 10 is acceptable
            Highcharts.setOptions({ colors: ['#3A874F','#7cb5ec'] });
            drawComponentOri.items[0].path = "M150 0 L75 200 L225 200 Z" + "M110 200 h 80 v 80 h -80 Z";
            drawComponentOri.items[0].fill ="green";
        }else{
            Highcharts.setOptions({ colors: ['#E62E00','#7cb5ec'] });
            drawComponentOri.items[0].path = "M180 20 h 30 v 50 h -30 Z" + "M160 50 h 70 L195 100 Z";
            drawComponentOri.items[0].fill ="red";
        }
        $("#retroDonutCaOriginal").highcharts(donutConfig);
        Ext.getCmp('retroDonutCaOriginalArrow').add(drawComponentOri);
    /******************************************************* Donut 3 ********************************************************/
            //C/A Ratio Original Config
         var drawComponentFinal = Ext.create('Ext.draw.Component', {
            width: 50,
            height:50,
        /*  gradients :[{
            id: 'gradientId',
            angle: 45,
            stops: {
                0: {
                    color: '#D90000'
                },
                100: {
                    color: '#FF7373'
                }
              }
            }], */
            items: [{
                type: "path",
                path: "M150 0 L75 200 L225 200 Z" + "M110 200 h 80 v 80 h -80 Z", //up arrow
                //path: "M180 20 h 30 v 50 h -30 Z" + "M160 50 h 70 L195 100 Z",//down arrow 
                fill: "green"
            }]
        });
        donutConfig.series.data = dataseries;
        donutConfig.title.text = 'C/A Ratio Final <br/>' + finalCommitRatio.toFixed(2) + '%<br/>';// + me.total.finalAccepted.toFixed(2) + ' of ' + me.total.finalCommit.toFixed(2);
        $("#retroDonutCaFinalFooter").html(me.total.finalAccepted.toFixed(2) + ' of ' + me.total.finalCommit.toFixed(2));
        if(finalCommitRatio >= 90){//plus minus 10 is acceptable when 90 percentage is done, only 10% is left which is acceptable 
            Highcharts.setOptions({ colors: ['#3A874F','#7cb5ec'] });
            drawComponentFinal.items[0].path = "M150 0 L75 200 L225 200 Z" + "M110 200 h 80 v 80 h -80 Z";
            drawComponentFinal.items[0].fill ="green";
        }else{
            Highcharts.setOptions({ colors: ['#E62E00','#7cb5ec'] });
            drawComponentFinal.items[0].path = "M180 20 h 30 v 50 h -30 Z" + "M160 50 h 70 L195 100 Z";
            drawComponentFinal.items[0].fill ="red";
        }
        $("#retroDonutCaFinal").highcharts(donutConfig);
        Ext.getCmp('retroDonutCaFinalArrow').add(drawComponentFinal);

        },
        _hideHighchartsLinks: function(){
                $('.highcharts-container > svg > text:last-child').hide();
        },
        _getFeatureFilter: function(){          
            var me = this,
                releaseName = me.ReleaseRecord.data.Name,
                releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),
                featureProductFilter = _.reduce(me.Products, function(filter, product){
                    var thisFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Parent.Parent.ObjectID',  value:product.data.ObjectID });
                    return filter ? filter.or(thisFilter) : thisFilter;
                }, null);
            //console.log("feature product filter",releaseName,releaseNameFilter,featureProductFilter);
            return featureProductFilter ? releaseNameFilter.and(featureProductFilter) : {property:'ObjectID', value:0};
            
        },  
        _getFeatures: function(){
            var me=this,
                config = {
                    model: me.Feature,
                    url: 'https://rally1.rallydev.com/slm/webservice/v2.0/PortfolioItem/Feature',
                    params: {
                        pagesize:200,
                        query: me._getFeatureFilter().toString(),
                        fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'Release', 
                            'Description', 'FormattedID', 'UserStories'].join(','),
                        workspace:me.getContext().getWorkspace()._ref,
                        includePermissions:true
                    }
                };
            //parrallel load mixin 
            return me._parallelLoadWsapiStore(config).then(function(store){
                me.FeatureStore = store;
                return store;
            });
        
        },
        _loadPortfolioItem: function(){
            var me = this;
            
            me.setLoading('Loading PortfolioItem/Feature');
            return Q.all([
                    me._getFeatures()
                ])
                .then(function(store){ console.log(store); })
                .fail(function(reason){ 
                console.log("fail",reason);
                me.setLoading(false);
                return Q.reject(reason);  })
                .then(function(){ me.setLoading(false); });
            
/*          console.log("Release Name", me.ReleaseWithName);
            var portfolio = Ext.create('Rally.data.wsapi.Store',{
                model: 'PortfolioItem/feature',
                autoLoad: true,
                context:{
                        workspace: me.getContext().getWorkspace()._ref,
                        project: null
                    },
                params: {
                        pagesize:200,
                        query:me._getFeatureFilter().toString(),
                        fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'Release', 
                            'Description', 'FormattedID', 'UserStories'].join(','),
                        workspace:me.getContext().getWorkspace()._ref,
                        includePermissions:true
                    }
                listeners: {
                    load: function(store,data,success){
                        console.log("here");
                        //console.log("portfolio",data);
                        
                        _.each(data,function(f){
                            /* console.log(f.data);
                            PercentDoneByStoryCount: 0
                            PercentDoneByStoryPlanEstimate: 0
                            PlannedEndDate: nullPlannedStartDate: null
                            Release: ObjectCreationDate: "2014-01-03T08:25:09.241Z"Name: "Q1_2014" 
                        });
                    }
                }
                
            }) */
        },
        _buildGrid: function(){
            
        },
        /************************************************** updating/fixing chart data *********************************************/
    /*  _updateHighchart: function(chart, chartData, dynConf){ //directly manipulate the highchart, avoid the Ext.js highchart extension
            var wrapper = chart.getChartWrapper(), wc = wrapper.chart, newSeries = chartData.series, y, x;
            wc.xAxis[0].update({categories:chartData.categories, tickInterval:dynConf.xAxis.tickInterval});
            wc.setTitle(dynConf.title, dynConf.subtitle);
            for(var i=0;i<newSeries.length;++i){
                var newData = newSeries[i].data, oldData=wc.series[i];
                var oldSerLen = oldData.points.length;
                var newSerLen = newData.length;
                oldData.setData(newData, false, true, false);
            }
            wc.redraw();
        }, */
        launch: function() {
            var me = this;
            me._loadModels()
                    .then(function(){
                        var scopeProject = me.getContext().getProject();
                        return me._loadProject(scopeProject.ObjectID);
                    })
                    .then(function(scopeProjectRecord){
                        me.ProjectRecord = scopeProjectRecord;
                        return Q.all([ //parallel loads
                        me._projectInWhichTrain(me.ProjectRecord) /********* 1 ************/
                            .fail(function(reason){
                                if(reason != 'Project not in a train') return Q(reason); //its ok if its not in the train
                            })
                            .then(function(trainRecord){
                                if(trainRecord){
                                    if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
                                    else me._isScopedToTrain = true;
                                    me.TrainRecord = trainRecord;
                                    return me._loadAllLeafProjects(me.TrainRecord)
                                        .then(function(leftProjects){
                                            me.LeafProjects = leftProjects;
                                            if(me._isScopedToTrain) me.CurrentTeam = null;
                                            else me.CurrentTeam = me.ProjectRecord;
                                            return me._loadProducts(me.TrainRecord);
                                        })
                                        .then(function(productStore){ me.Products = productStore.getRange(); });
                                }
                                else {
                                    me.CurrentTeam = me.ProjectRecord;
                                    me._isScopedToTrain = false;
                                }
                            }),
                            me._loadAppsPreference() /******** load stream 2 *****/
                                .then(function(appsPref){
                                    me.AppsPref = appsPref;
                                    var oneYear = 1000*60*60*24*365;
                                    // to look at results within last 1 year 
                                    return me._loadReleasesBetweenDates(me.ProjectRecord, (new Date()*1 - oneYear), new Date());
                                })
                                .then(function(releaseStore){
                                    me.ReleaseStore = releaseStore;
                                    var currentRelease = me._getScopedRelease(me.ReleaseStore.data.items, me.ProjectRecord.data.ObjectID, me.AppsPref);
                                    if(currentRelease) me.ReleaseRecord = currentRelease;
                                    else return Q.reject('This train has no releases.');
                                })
                        ]);
                    })
                    .then(function() { me._buildReleasePicker(); })
                    .then (function(){ 
                        me._loadChart(); 
                        me._hideHighchartsLinks();
                        })
                    .fail(function(reason){
                        me.setLoading(false);
                        me._alert('ERROR', reason || '');
                    })
                    .done();
         }
    });