/** 
	SUMMARY:
		This is a mixin for using highcharts with rally data data after it is run through the lookback calculator.
		It just formats the data, and adds trendlines and labels to the charts. 
		
		This mixin assumes you are using UserStories with lookback api and you are mapping ScheduleState vs. Time.
		
	DEPENDENCIES:
		'Intel.lib.IntelRallyApp' parent class of app for me.ScheduleStates, 
		'Intel.lib.mixin.IntelWorkweek' mixed into app for me.getWorkweek,
		Sylvester math library
		lodash
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	var ChartsTooltipDatemap = {}, //closure variable that maps the x values to date strings -- per chart
		RSquaredMap = {},
		defaultCFCConfig = {
			chart: {
				defaultSeriesType: "area",
				zoomType: "xy"
			},
			colors: [
				'#ABABAB', 
				'#E57E3A', 
				'#E5D038', 
				'#0080FF', 
				'#3A874F', 
				'#26FF00',
				'#000000'
			],	
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
					var sum = 0,
						datemap = ChartsTooltipDatemap[this.series.chart.container.id],
						rSquaredMap = RSquaredMap[this.series.chart.container.id];
					for(var i=4; i>= this.series.index; --i) 
						sum += this.series.chart.series[i].data[this.point.x].y;
					return "<b>" + this.x + '</b>' + (datemap ? ' (' + datemap[this.point.x] + ')' : '') + 
						((rSquaredMap && rSquaredMap[this.series.index]) ? '<br/><b>R<sup>2</sup> = ' + rSquaredMap[this.series.index].val : '') + 
						"<br /><b>" + this.series.name + "</b>: " + ((100*this.y>>0)/100) +
						(this.series.index <=4 ? "<br /><b>Total</b>: " + ((100*sum>>0)/100) : '');
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
		};

	Ext.define('Intel.lib.mixin.CumulativeFlowChartMixin', {
		requires:[
			'Intel.lib.IntelRallyApp', 
			'Intel.lib.mixin.IntelWorkweek'
		],
		
		getDefaultCFCConfig: function(){
			return _.merge({}, defaultCFCConfig);
		},
		getCumulativeFlowChartColors: function(){
			var me=this,
				colors = me.getDefaultCFCConfig().colors,
				scheduleStates = me.ScheduleStates;
			if(scheduleStates.length >= 5) return {colors: colors};
			else return {colors: colors.slice(0, scheduleStates.length).concat(colors.slice(scheduleStates.length + 1))};
		},
		getValidTrendTypes: function(){
			return [
				'FromZero', 
				'FromStartAccepted', 
				'FromStartWork', 
				'LastWeek', 
				'LastSprint', 
				'Last2Sprints', 
				'LinearRegression', 
				'LinearRegressionFromStartAccepted',
				'LinearRegressionFromStartWork'
			];
		},
		_getRSquared: function(ySeries, fSeries, lastIndex){
			//using algorithm from http://en.wikipedia.org/wiki/Coefficient_of_determination
			if(lastIndex <= 0) return 1;
			var ys = ySeries.data.slice(0, lastIndex),
				fs = fSeries.data.slice(0, lastIndex),
				meanY= _.reduce(ys, function(sum, yi){ return sum+(yi|| 0); }, 0)/ys.length,
				SStot = _.reduce(ys, function(sum, yi){ return sum + Math.pow((yi|| 0)-meanY, 2); }, 0),
				SSres = _.reduce(fs, function(sum, fi, i){ return sum + Math.pow((ys[i] || 0) - (fi || 0), 2); }, 0);
			return (1000*(1 - SSres/SStot)>>0)/1000;
		},
		_addProjectedTrendline: function(data, options){
			var me=this,
				totalPoints = options.totalPoints,
				trendType = options.trendType,
				validTypes = me.getValidTrendTypes(),
				slope, intercept, X, Y, 
				scheduleStateSeries  = _.filter(data.series, function(s){ return me.ScheduleStates.indexOf(s.name) > -1; }),
				scheduleStatesSumList = _.times(scheduleStateSeries[0].length, function(n){ 
					return _.reduce(scheduleStateSeries, function(sum, s){ return sum + (s.data[n] || 0); }, 0);
				});
			trendType = _.find(validTypes, function(type){ return type == trendType; }) || validTypes[0];
				
			//initialize projected trendline
			var topScheduleState = me.ScheduleStates.slice(-1)[0],
				topScheduleStateSeries = _.find(data.series, function(s){ return s.name === topScheduleState; }), i, len,
				projectedTrend = {type:'spline', dashStyle:'Solid', name:'Projected', data:topScheduleStateSeries.data.slice()},
				begin=0,
				end=projectedTrend.data.length-1;
		
			if(trendType == 'FromZero'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					return (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
				});	
			}
			if(trendType == 'FromStartAccepted'){
				for(i=1;i<projectedTrend.data.length;++i)
					if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});
			}
			if(trendType == 'FromStartWork'){
				for(i=1;i<scheduleStatesSumList.length;++i)
					if(scheduleStatesSumList[i]!==null && scheduleStatesSumList[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});
			}
			if(trendType == 'LastWeek'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0) 
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				begin = (end - 7 < 0 ? 0 : end - 7);
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LastSprint'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				begin = (end - 14 < 0 ? 0 : end - 14);
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'Last2Sprints'){
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				begin = (end - 28 < 0 ? 0 : end - 28);
				slope = (end===begin) ? 0 : (projectedTrend.data[end] - projectedTrend.data[begin])/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(projectedTrend.data[begin] + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LinearRegression'){
				//(Xt*X)^-1*Xt*Y = b 
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				X = $M(_.map(projectedTrend.data.slice(begin, end), function(p, j){ return [1, j]; }));
				Y = $M(_.map(projectedTrend.data.slice(begin, end), function(p){ return p; }));
				b = X.transpose().multiply(X).inverse().multiply(X.transpose().multiply(Y));
				slope = b.elements[1][0];
				intercept = b.elements[0][0];

				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(intercept + j*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LinearRegressionFromStartAccepted'){
				//(Xt*X)^-1*Xt*Y = b 
				for(i=1;i<projectedTrend.data.length;++i)
					if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				X = $M(_.map(projectedTrend.data.slice(begin, end), function(p, j){ return [1, j]; }));
				Y = $M(_.map(projectedTrend.data.slice(begin, end), function(p){ return p; }));
				b = X.transpose().multiply(X).inverse().multiply(X.transpose().multiply(Y));
				slope = b.elements[1][0];
				intercept = b.elements[0][0];

				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(intercept + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			if(trendType == 'LinearRegressionFromStartWork'){
				for(i=1;i<scheduleStatesSumList.length;++i)
					if(scheduleStatesSumList[i]!==null && scheduleStatesSumList[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (can go from 0 to 10 to 0. so start at last 0)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				X = $M(_.map(projectedTrend.data.slice(begin, end), function(p, j){ return [1, j]; }));
				Y = $M(_.map(projectedTrend.data.slice(begin, end), function(p){ return p; }));
				b = X.transpose().multiply(X).inverse().multiply(X.transpose().multiply(Y));
				slope = b.elements[1][0];
				intercept = b.elements[0][0];

				projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
					var pt = (100*(intercept + (j-begin)*slope)>>0)/100;
					return pt < 0 ? 0 : pt;
				});	
			}
			
			//apply label to correct point if needed IGNORE FIRST POINT!
			if(slope >= 0){
				for(i=1,len=projectedTrend.data.length; i<len;++i){
					if(projectedTrend.data[i] >= totalPoints){
						projectedTrend.data[i] = {
							color:'red',
							marker:{
								enabled:true,
								lineWidth:4,
								symbol:'circle',
								fillColor:'red',
								lineColor:'red'
							},
							y: projectedTrend.data[i]
						};
						break;
					}	
				}
			}
			return projectedTrend;
		},
		updateCumulativeFlowChartData: function(data, options){
			_.merge({}, options);
			var me = this, 
				now = new Date(),
				trendType = options.trendType,
				hideTrends = options.hideTrends,
				todayIndex = -1,
				datemap = [],
				rSquaredMap = [];

			//get the index that is today
			if(new Date(data.categories[0]) > now) todayIndex = -1;
			else if(new Date(data.categories[data.categories.length - 1]) < now) todayIndex = data.categories.length;
			else todayIndex = _.reduce(data.categories, function(savedI, c, i){ 
				if(new Date(c) > now && savedI === -1) savedI = (i-1);
				return savedI;
			}, -1);
			
			//get top scheduleState series
			var topScheduleState = me.ScheduleStates.slice(-1)[0],
				topScheduleStateSeries = _.find(data.series, function(s){ return s.name === topScheduleState; });
				
			//get ideal trendline if release has started
			var totalPoints = (new Date(data.categories[0]) > now ? 0 : 
					_.reduce(data.series, function(sum, s){return sum + (s.data[s.data.length-1] || 0); 
				}, 0) || 0),
				idealTrend, ratio;
				
			if(!hideTrends){
				idealTrend = {type:'spline', dashStyle:'Solid', name:'Ideal', data:new Array(data.categories.length)};
				ratio = (totalPoints/(data.categories.length-1)) || 0; //for NaN
				idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
			}
			
			//zero future points, convert to workweeks, and set datemap
			_.each(data.categories, function(c, i, a){
				var d = new Date(c);
				a[i] = 'ww' + me.getWorkweek(d);
				datemap[i] = c;
				if(d>now){
					_.each(data.series, function(s, j){
						s.data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
					});
				}
			});

			if(!hideTrends){
				var projectedTrend = me._addProjectedTrendline(data, {totalPoints: totalPoints, trendType: trendType});
				data.series.push(projectedTrend);
				rSquaredMap[data.series.length-1] = {val: me._getRSquared(projectedTrend, topScheduleStateSeries, todayIndex)};				
				data.series.push(idealTrend);
			}		
			data.datemap = datemap;
			data.rSquaredMap = rSquaredMap;
			
			return data;
		},
		getCumulativeFlowChartTicks: function(startDate, endDate, width){
			var pixelTickWidth = 40,
				ticks = width/pixelTickWidth>>0,
				oneDay = 1000*60*60*24,
				days = (endDate*1 - startDate*1)/(oneDay/* *5/7 */)>>0, //NOT only workdays (now includes weekends)
				interval = ((days/ticks>>0)/7>>0)*7;
			return (interval < 7) ? 7 : interval; //make it weekly at the minimum
		},
		setCumulativeFlowChartDatemap: function(chartContainerId, datemap){
			ChartsTooltipDatemap[chartContainerId] = datemap;
		},
		setCumulativeFlowChartRSquaredMap: function(chartContainerId, rSquaredMap){
			RSquaredMap[chartContainerId] = rSquaredMap;
		}
	});
}());