/** updates the chart data. the following boolean options exist:
	noDatemap: to NOT set window.Datemap to allow for a tooltip mapping of points to non-workweek dates
	noTrends: to NOT show ideal tredn
	*/
Ext.define('ChartUpdater', {
	requires:['IntelWorkweek'],
	
	__tooltipfunc: function () {
		return "<b>100% Complete</b><br />" + 
			"<b>" + this.x + '</b> (' + window.Datemap[this.point.x] + ")";
	},
	
	_updateChartData: function(data, opts){
		var me = this, now = new Date();
		if(!opts || !opts.noDatemap) window.Datemap = []; //for the tooltip to have extra info to display on the chart

		//get ideal trendline
		var total = (new Date(data.categories[0]) > now ? 0 : 
				_.reduce(data.series, function(sum, s){return sum + (s.data[s.data.length-1] || 0); }, 0) || 0),
			idealTrend, ratio;
			
		if(!opts || !opts.noTrends){
			idealTrend = {type:'spline', dashStyle:'Solid', name:'Ideal', data:new Array(data.categories.length)};
			ratio = (total/(data.categories.length-1)) || 0; //for NaN
			idealTrend.data = _.map(idealTrend.data, function(e, i){ return Math.round(100*(0 + i*ratio))/100; });
		}
		
		//zero future points, convert to workweeks, and set window.Datemap
		_.each(data.categories, function(c, i, a){
			var d = new Date(c);
			a[i] = 'WW' + me._getWorkweek(d);
			if(!opts || !opts.noDatemap) window.Datemap[i] = c;
			if(d>now){
				_.each(data.series, function(s, j){
					s.data = s.data.slice(0, i).concat(_.map(new Array(a.length - i), function(){ return 0; }));
				});
			}
		});

		if(!opts || !opts.noTrends){
			//get projected trendline
			var s = _.find(data.series, function(s){ return s.name === 'Accepted'; }), i, len,
				projectedTrend = {type:'spline', dashStyle:'Solid', name:'Projected', data:s.data.slice()},
				begin=0, end=projectedTrend.data.length-1;
			for(i=1;i<projectedTrend.data.length;++i)
				if(projectedTrend.data[i]!==null && projectedTrend.data[i] !==0){
					begin = i-1; break; }
			for(i=end;i>=begin;--i) //start at the END, not at begin+1 (remember ISSG_binsplit bug)
				if(projectedTrend.data[i]!==0){
					end = i; break; }
			ratio = end===begin ? 0 : (projectedTrend.data[end] - 0)/(end-begin);
			projectedTrend.data = _.map(projectedTrend.data, function(p, j){ 
				if(j>=begin) return Math.round(100*(0 + (j-begin)*ratio))/100;
				else return p; 
			});

			//apply label to correct point if needed IGNORE FIRST POINT!
			for(i=1,len=projectedTrend.data.length; i<len;++i){
				if(projectedTrend.data[i] >= total){
					projectedTrend.data[i] = {
						// dataLabels: {
							// enabled: true,
							// backgroundColor:'white',
							// borderColor:'black',
							// borderRadius:3,
							// borderWidth:1,
							// formatter: me.__tooltipfunc,
							// align:((len-i)/len > 0.75) 'center', y:-25
						// },
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
		
		return data;
	}
});