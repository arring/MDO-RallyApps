(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.rpm.cfd.CumulativeFlowCalculator", {
        extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",

        getMetrics: function() {
			return _.map(this.getStateFieldValues(), function(stateFieldValue) {
				return  {
					as: stateFieldValue,
					allowedValues: [stateFieldValue],
					groupByField: 'ScheduleState',
					f: 'groupBySum',
					field: 'PlanEstimate',
					display: 'area'
				};
			});
		}
    });
}());
