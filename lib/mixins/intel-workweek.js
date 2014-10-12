Ext.define('IntelWorkweek', {
	
	/** calculates intel workweek, returns integer */
	_getWorkweek: function(date){ 
		var oneDay = 1000 * 60 * 60 * 24,
			yearStart = new Date(date.getFullYear(), 0, 1),
			dayIndex = yearStart.getDay(),
			ww01Start = yearStart - dayIndex*oneDay,
			timeDiff = date - ww01Start,
			dayDiff = timeDiff / oneDay,
			ww = Math.floor(dayDiff/7) + 1,
			leap = (date.getFullYear() % 4 === 0),
			weekCount = ((leap && dayIndex >= 5) || (!leap && dayIndex === 6 )) ? 53 : 52; //weeks in this year
		return weekCount < ww ? 1 : ww;
	},
	
	/** returns the number of intel workweeks in the year the date is in */
	_getWeekCount: function(date){ 
		var leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay();
		return ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52;
	},
	
	/**  gets list of workweeks between startDate and endDate (startDate and endDate dont have to be Date objects)  */
	_getWorkweeks: function(startDate, endDate){ 
		var i,
			sd_week = this._getWorkweek(startDate),
			ed_week = this._getWorkweek(endDate),
			week_count = this._getWeekCount(startDate);
			
		var weeks = [];
		if(ed_week < sd_week){
			for(i=sd_week; i<=week_count; ++i) weeks.push('ww' + i);
			for(i = 1; i<=ed_week;++i) weeks.push('ww' + i);
		}
		else for(i = sd_week; i<=ed_week;++i) weeks.push('ww' + i);
		return weeks;
	}
});