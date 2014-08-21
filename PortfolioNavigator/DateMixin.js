(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.DateMixin", {

        dateFormatters: [
            {key: "MMM", value: "%b"},
            {key: "MM", value: "%m"},
            {key: "dd", value: "%d"},
            {key: "yyyy", value: "%Y"}
        ],

        dateToStringDisplay: function (date) {
            return Ext.Date.format(date, 'm/d/Y');
        },

        dateToString: function (date) {
            return Ext.Date.format(date, 'Y-m-d\\TH:i:s.u\\Z');
        },

        dateStringToObject: function (dateStr) {
            var finalIndex = dateStr.indexOf('T'),
                dateObj;

            if (finalIndex > -1) {
                dateStr = dateStr.slice(0, dateStr.indexOf('T'));
            }

            dateObj = this._splitDateParts(dateStr);

            return new Date(dateObj.year, dateObj.month, dateObj.day);
        },

        _splitDateParts: function (dateStr) {
            if (this._shouldSplitOnDash(dateStr)) {
                return this._objectFromYearFirstDate(dateStr.split('-'));
            }
            else {
                return this._objectFromMonthFirstDate(dateStr.split('/'));
            }
        },

        _objectFromYearFirstDate: function (dateArray) {
            if (dateArray.length !== 3) {
                return { year: 0, month: 0, day: 0 };
            }

            dateArray[1] = (parseInt(dateArray[1], 10) - 1).toString();

            return {
                year: dateArray[0],
                month: dateArray[1],
                day: dateArray[2]
            };
        },

        _objectFromMonthFirstDate: function (dateArray) {
            if (dateArray.length !== 3) {
                return { year: 0, month: 0, day: 0 };
            }

            dateArray[0] = (parseInt(dateArray[0], 10) - 1).toString();

            return {
                month: dateArray[0],
                day: dateArray[1],
                year: dateArray[2]
            };
        },

        _shouldSplitOnDash: function (dateStr) {
            return dateStr.split('-').length === 3;
        },
		
		_getWorkweek: function(date){ //calculates intel workweek, returns integer
			if(!(date instanceof Date)) return;
			var me = this, oneDay = 1000 * 60 * 60 * 24,
				yearStart = new Date(date.getFullYear(), 0, 1),
				dayIndex = yearStart.getDay(),
				ww01Start = yearStart - dayIndex*oneDay,
				timeDiff = date - ww01Start,
				dayDiff = timeDiff / oneDay,
				ww = Math.floor(dayDiff/7) + 1,
				leap = (date.getFullYear() % 4 === 0),
				day = new Date(date.getFullYear(), 0, 1).getDay(),
				weekCount = ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52; //intel weeks in this year
			return weekCount < ww ? (ww - weekCount) : ww;
		}
    });

}());
