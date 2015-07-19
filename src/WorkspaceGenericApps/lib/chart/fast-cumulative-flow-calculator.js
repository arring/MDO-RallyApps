/** 
	SUMMARY:
		Fast CFD Calculator is a lot faster than the rally build in calculators because this is not a generic 
		calculator. it specifically is used to aggregate items with PlanEstimate and ScheduleState fields in an area chart
		between two dates. Example app using this is Train CFD Charts.
		
	NOTE: you MUST give this calculator startDate, endDate, and ScheduleState in the config. ONLY.
	
	NOTE: if new Date() is between the start and end date, it will substitute new Date() for what would've been 
		'todays' date in the dateArray. Example: startDate:2000/10/8, endDate:2000/12/8, now:2000/12/12 (3:13 pm),
		so in teh dateArray, what wouldve been 2000/12/12 will now become 2000/12/12 (3:13 pm). This makes the CFD data
		more up to date (granularity is not on average 12 hours, now it is whatever the ELTDate is).
		
	NOTE: _ValidFrom is inclusive, _ValidTo is exclusive!
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.chart.FastCumulativeFlowCalculator', {		
		constructor:function(options){
			this.scheduleStates = options.scheduleStates;
			this.startDate = options.startDate;
			this.endDate = options.endDate;
		},
		
		_getDates:function(){
			var dates = [], curDay = this.startDate, day=1000*60*60*24, n;
			while(curDay<this.endDate){
				n = curDay.getDay(); 
				//if(n!==0 && n!==6){ //dont get weekends. NOTE: now we get weekends
					if(this._dateToStringDisplay(curDay) === this._dateToStringDisplay(new Date())) dates.push(new Date());
					else dates.push(curDay);
				//	}
				curDay = new Date(curDay*1 + day);
			}
			return dates;
		},
		
		_dateToStringDisplay: function (date) {
			return Ext.Date.format(date, 'm/d/Y');
		},
		
		/** binsearches for the closest date to 'date' */
		_getIndexHelper:function(date, dateArray){ 
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
		
		/** returns index in dateArray of the date before the input date */
		_getIndexBefore: function(date, dateArray){ 
			if(dateArray.length===0) return -1;
			var pos = this._getIndexHelper(date, dateArray);
			if(dateArray[pos] < date) return pos; 
			else return pos-1;
		},
		
		/** returns index in dateArra of date after or on the input date */
		_getIndexOnOrAfter: function(date, dateArray){ 
			if(dateArray.length===0) return -1;
			var pos = this._getIndexHelper(date, dateArray);
			if(pos===dateArray.length-1) { if(dateArray[pos] >= date) return pos; else return -1; } //either start of list or everything is after 'date'
			else if(dateArray[pos] >= date) return pos;
			else return pos+1;
		},
		
		/** items is an array of snapshot records*/
		runCalculation:function(items){
			if(!this.scheduleStates || !this.startDate || !this.endDate) throw 'invalid constructor config';
			var dates = this._getDates(), day=1000*60*60*24,
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
				if(!pe || !state) continue; //no need to continue with this one
				var startIndex = this._getIndexOnOrAfter(iStart, dates), 
					endIndex = this._getIndexBefore(iEnd, dates);
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