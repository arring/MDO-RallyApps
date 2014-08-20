(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.DataTypePicker", {
        extend: "Rally.apps.charts.settings.RadioGroupSetting",
        alias: "widget.chartdatatypepicker",

        mixins: [
            "Ext.form.field.Field",
            "Rally.apps.charts.settings.SettingsChangeMixin"
        ],

        config: {
            settingName: "chartAggregationType"
        },

        settingsParent: undefined,

        initComponent: function () {
            this.callParent(arguments);
            this.add(this._addRadioGroup());
        },

        _addRadioGroup: function () {
            return {
                xtype: "radiogroup",
                name: this.settingName,
                columns: [160, 100],
                vertical: false,
                items: [
                    { boxLabel: "Story Plan Estimate", name: this.settingName, inputValue: "storypoints", checked: true },
                    { boxLabel: "Story Count", name: this.settingName, inputValue: "storycount" }
                ],
                listeners: {
                    beforerender: this.setRadioValue,
                    scope: this
                }
            };
        }
    });
}());
