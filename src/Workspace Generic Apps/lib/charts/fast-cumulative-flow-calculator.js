/** Fast CFD Calculator is like 1000x faster than the rally build in calculators because this is not a generic 
	calculator. it specifically is used to aggregate items with PlanEstimate and ScheduleState fields in an area chart
	between two dates. Example app using this is Train CFD Charts.
	
	NOTE: you MUST give this calculator startDate, and endDate in the config. ONLY.
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define("FastCumulativeFlowCalculator", {		
		constructor:function(options){
			this.scheduleStates = options.scheduleStates;
			this.endDate = options.endDate;
			this.startDate = options.startDate;
		},
		
		_getDates:function(){
			var dates = [], curDay = this.startDate, day=1000*60*60*24;
			while(curDay<=this.endDate){
				var n = curDay.getDay(); 
				if(n!==0 && n!==6) dates.push(curDay); //dont get weekends
				curDay = new Date(curDay*1 + day);
			}
			return dates;
		},
		
		_dateToStringDisplay: function (date) {
			return Ext.Date.format(date, 'm/d/Y');
		},
		
		_getIndexHelper:function(date, dateArray){ //binsearches for the closest date to 'date'
			var curVal = (dateArray.length/2), curInt = (curVal>>0), div=(curVal/2), lastInt=-1;
			while(curInt !== lastInt){
				if(dateArray[curInt]===date) return curInt;
				else if(dateArray[curInt]>date) curVal-=div;
				else curVal+=div;
				div/=2;
				lastInt = curInt;
				curInt = curVal>>0;
			}
			return curInt;
		},
		
		_getIndexOnOrBefore: function(date, dateArray){
			if(dateArray.length===0) return -1;
			var pos = this._getIndexHelper(date, dateArray);
			if(pos===0) { if(dateArray[pos] <= date) return pos; else return -1; } //either start of list or everything is after 'date'
			else if(dateArray[pos] <= date) return pos;
			else return pos-1;
		},
		
		_getIndexOnOrAfter: function(date, dateArray){
			if(dateArray.length===0) return -1;
			var pos = this._getIndexHelper(date, dateArray);
			if(pos===dateArray.length-1) { if(dateArray[pos] >= date) return pos; else return -1; } //either start of list or everything is after 'date'
			else if(dateArray[pos] >= date) return pos;
			else return pos+1;
		},
		
		runCalculation:function(items){
			if(!this.scheduleStates || !this.startDate || !this.endDate) throw 'invalid constructor config';
			var dates = this._getDates(), day=1000*3600*24,
				dateMapTemplate = _.map(new Array(dates.length), function(){ return 0;}); 
			var totals = _.reduce(this.scheduleStates, function(map, ss){ 
				map[ss] = dateMapTemplate.slice();
				return map; 
			}, {});
			for(var itemIndex=0, len=items.length; itemIndex<len; ++itemIndex){
				var item = items[itemIndex].raw, //dont work with records;
					iStart = new Date(item._ValidFrom),
					iEnd = new Date(item._ValidTo), 
					state = item.ScheduleState, 
					pe = item.PlanEstimate;
				if(!pe || !state || ((iStart/day>>0) === (iEnd/day>>0))) continue; //no need to continue with this one
				var startIndex = this._getIndexOnOrAfter(iStart, dates), 
					endIndex = this._getIndexOnOrBefore(iEnd, dates);
				if(startIndex===-1 || endIndex===-1) continue; //no need to continue here
				for(var i=startIndex;i<=endIndex;++i)
					totals[state][i]+=pe;
			}
			return {
				categories:_.map(dates, function(d){ return this._dateToStringDisplay(d); }, this), 
				series: _.reduce(this.scheduleStates, function(outputArray, ss){
					return outputArray.concat([{name:ss, type:'area', dashStyle:'Solid', data:totals[ss]}]);
				}, [])
			};
		}
	});
}());