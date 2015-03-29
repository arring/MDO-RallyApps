/** This is a mixin that updates highchart data after it is run through the lookback calculator
	it specifically: (optionally) adds trendlines, zeros out the future numbers, and
	adds a datemap from workweeks to actual dates
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('ChartUpdater', {
		requires:['IntelWorkweek'],

		_updateChartData: function(data, hideTrends){
			var me = this,
				now = new Date(),
				datemap = [];

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
				a[i] = 'ww' + me._getWorkweek(d);
				datemap[i] = c;
				if(d>now){
					_.each(data.series, function(s, j){
						s.data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
					});
				}
			});

			if(!hideTrends){
				//get projected trendline
				var s = _.find(data.series, function(s){ return s.name === 'Accepted'; }), i, len,
					projectedTrend = {type:'spline', dashStyle:'Solid', name:'Projected', data:s.data.slice()},
					begin=0,
					end=projectedTrend.data.length-1;
				for(i=1;i<projectedTrend.data.length;++i)
					if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
						begin = i-1; break; }
				for(i=end;i>=begin;--i) //start at the END, not at begin+1 (remember ISSG_binsplit bug)
					if(projectedTrend.data[i]!==0){
						end = i; break; }
				ratio = (end===begin) ? 0 : (projectedTrend.data[end] - 0)/(end-begin);
				projectedTrend.data = _.map(projectedTrend.data, function(p, j){
					if(j>=begin) return Math.round(100*(0 + (j-begin)*ratio))/100;
					else return p;
				});

				//apply label to correct point if needed IGNORE FIRST POINT!
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
				data.series.push(projectedTrend);
				data.series.push(idealTrend);
			}
			data.datemap = datemap;

			return data;
		}
	});
}());
