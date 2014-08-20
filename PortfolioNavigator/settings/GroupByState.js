(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.GroupByState", {
        extend: "Ext.form.FieldContainer",
        alias: "widget.chartgroupbystate",

        items: [
            {
                xtype: "label",
                text: "Group by state!"
            }
        ]
    });
}());