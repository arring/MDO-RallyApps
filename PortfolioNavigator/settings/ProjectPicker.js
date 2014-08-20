(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.ProjectPicker", {
        extend: "Ext.form.FieldContainer",
        alias: "widget.chartprojectpicker",

        items: [
            {
                xtype: "label",
                text: "Project picker!"
            }
        ]
    });
}());