Ext.define('IntelWorkweek', {
	
	/** calculates intel workweek, returns integer */
	_getWorkweek: function(_date){ 
		var date = new Date(_date),
			oneDay = 1000 * 60 * 60 * 24,
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
	_getWeekCount: function(_date){ 
		var date = new Date(_date),
			leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay();
		return ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52;
	},
	
	_roundDateDownToWeekStart: function(_date){ //returns number
		var date = new Date(_date),
			dayLength = 1000*60*60*24,
			day = date.getDay(),
			monthDate = date.getDate(),
			month = date.getMonth(),
			year = date.getFullYear();
		return new Date(year, month, monthDate)*1 - (day * dayLength);
	},
	
	/**  gets list of date numbers for each week start between start and end date*/
	_getWorkweekDates: function(startDate, endDate){ 
		var oneWeek = 1000 * 60 * 60 * 24 * 7,
			startWeekDate = this._roundDateDownToWeekStart(startDate),
			endWeekDate = this._roundDateDownToWeekStart(endDate),
			totalWeeks = Math.floor((endWeekDate - startWeekDate) / oneWeek),
			weeks = new Array(totalWeeks);
		for(var i=0; i<totalWeeks; ++i) 
			weeks[i] = startWeekDate + oneWeek*i;
		return weeks;
	},
	
	_getWorkWeeksForDropdown: function(releaseStartDate, releaseEndDate){ //assumes DropDown uses WorkweekDropdown model
		var workweeks = this._getWorkweekDates(releaseStartDate, releaseEndDate),
			data = new Array(workweeks.length);
		for(var i=0, len=workweeks.length; i<len; ++i){
			data[i] = { 
				Workweek: 'ww' + this._getWorkweek(workweeks[i]),
				DateVal: workweeks[i]
			};
		}
		return data;
	}
});