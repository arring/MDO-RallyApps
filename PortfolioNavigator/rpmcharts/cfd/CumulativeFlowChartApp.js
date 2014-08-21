(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.rpm.cfd.CumulativeFlowChartApp", {
        extend: "Rally.apps.charts.rpm.PortfolioChartAppBase",
        cls: "portfolio-cfd-app",
        
        requires: [
            'Rally.ui.chart.Chart'
        ],

        help: {
            cls: 'portfolio-cfd-help-container',
            id: 274
        },

        chartComponentConfig: {
            xtype: "rallychart",
			chartColors:['#ABABAB', '#E57E3A', '#E5D038', '#0080FF', '#3A874F'],

            queryErrorMessage: "No data to display.<br /><br />Most likely, stories are either not yet available or started for this portfolio item.",
            aggregationErrorMessage: "No data to display.<br /><br />Check the data type setting for displaying data based on count versus plan estimate.",

            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: {
                find: {
                    "Children": null
                },
                fetch: ["ScheduleState", "PlanEstimate"],
                hydrate: ["ScheduleState", "PlanEstimate"],
                sort: {
                    "_ValidFrom": 1
                }
            },

            calculatorType: "Rally.apps.charts.rpm.cfd.CumulativeFlowCalculator",

            chartConfig: {
                chart: {
                    defaultSeriesType: "area",
                    zoomType: "xy"
                },
                xAxis: {
                    tickmarkPlacement: "on",
                    tickInterval: 5,
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
						text: "Count"
					},
					labels: {
						x: -5,
						y: 4
                    }
                },
                tooltip: {
                    formatter: function () {
                        return "<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ")<br />" + this.series.name + ": " + this.y;
                    }
                },
				legend:{
					itemWidth:100,
					width:100*5
					
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
			listeners:{
				readyToRender: function(chart){
					window.Datemap = [];
					var ww = Ext.create('Rally.apps.charts.DateMixin')._getWorkweek, now = new Date();
					var data = chart.getChartData();
					
					//zero future points, convert to workweeks, and set window.Datemap
					_.each(data.categories, function(c, i, a){
						var d = new Date(c);
						a[i] = 'WW' + ww(d);
						window.Datemap[i] = c;
						if(d>now){
							_.each(data.series, function(s, j){
								data.series[j].data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
							});
						}
					});
					
					//add projected trendline
					var s = _.find(data.series, function(s){ return s.name === 'Accepted'; }), i,
						projectedTrend = {type:'line', dashStyle:'Solid', name:'Projected', color:'black', data:s.data.slice()},
						begin=0, end=projectedTrend.data.length-1, ratio;
					for(i=1;i<projectedTrend.data.length;++i)
						if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
							begin = i-1; break; }
					for(i=begin+1;i<projectedTrend.data.length;++i)
						if(projectedTrend.data[i]===0){
							end = i-1; break; }
					ratio = (projectedTrend.data[end] - 0)/(end-begin);
					projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
						if(j>=begin) return Math.round(100*(0 + (j-begin)*ratio))/100;
						else return p; 
					});
					
					//add ideal trendline
					var app = this.up('rallyapp'),
						grid = app.down('rallygrid'),
						field = (app.currentPiRecord.self.ordinal===0) ? 'PlanEstimate' : 'LeafStoryPlanEstimateTotal',
						total = (grid ? _.reduce(grid.getSelectionModel().getSelection(), function(sum, r){
							return sum + (r.data[field] || 0);
						}, 0) : app.currentPiRecord.data.LeafStoryPlanEstimateTotal),
						idealTrend = {type:'line', dashStyle:'Solid', name:'Ideal', color:'#26FF00', data:new Array(s.data.length)};
					ratio = total/(s.data.length);
					idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
					
					data.series.push(projectedTrend);
					data.series.push(idealTrend);
					chart.setChartData(data);
				}
			}
        }
    });
}());
