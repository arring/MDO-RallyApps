(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.rpm.burn.BurnCalculator", {
        extend: "Rally.data.lookback.calculator.TimeSeriesCalculator",

        getDerivedFieldsOnInput: function () {
            var completedStateNames = this.config.completedScheduleStateNames;

            if (this.config.chartAggregationType === 'storycount') {
                return [
                    {
                        "as": "StoryCount",
                        "f": function(snapshot) {
                            return 1;
                        }
                    },
                    {
                        "as": "CompletedStoryCount",
                        "f": function(snapshot) {
                            var ss = snapshot.ScheduleState;
                            if (completedStateNames.indexOf(ss) > -1) {
                                return 1;
                            }
                            else {
                                return 0;
                            }
                        }
                    }
                ];
            }
            else {
                return [
                    {
                        "as": "Planned",
                        "f": function(snapshot) {
                            if(snapshot.PlanEstimate) {
                                return snapshot.PlanEstimate;
                            }

                            return 0;
                        }
                    },
                    {
                        "as": "PlannedCompleted",
                        "f": function(snapshot) {
                            var ss = snapshot.ScheduleState;
                            if(completedStateNames.indexOf(ss) > -1 && snapshot.PlanEstimate) {
                                return snapshot.PlanEstimate;
                            }

                            return 0;
                        }
                    }
                ];
            }
        },

        getMetrics: function() {
            if(this.config.chartAggregationType === 'storycount') {
                return [
                    {
                        "field": "StoryCount",
                        "as": "Planned",
                        "f": "sum",
                        "display": "line"
                    },
                    {
                        "field": "CompletedStoryCount",
                        "as": "Completed",
                        "f": "sum",
                        "display": "column"
                    }
                ];
            }
            else {
                return [
                    {
                        "field": "Planned",
                        "as": "Planned",
                        "display": "line",
                        "f": "sum"
                    },
                    {
                        "field": "PlannedCompleted",
                        "as": "Completed",
                        "f": "sum",
                        "display": "column"
                    }
                ];
            }
        }
    });
}());
