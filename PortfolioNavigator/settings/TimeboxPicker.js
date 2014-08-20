(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.TimeboxPicker", {
        extend: "Rally.apps.charts.settings.RadioGroupSetting",
        alias: "widget.charttimeboxpicker",

        mixins: [
            "Ext.form.field.Field"
        ],

        config: {
            settingName: "chartTimebox"
        },

        settingsParent: undefined,

        initComponent: function () {
            this.callParent(arguments);
            this._addRadioGroup();
        },

        _addRadioGroup: function () {
            this.add({
                xtype: "radiogroup",
                name: this.settingName,
                itemId: this.settingName,
                label: "Level",
                columns: [160, 100, 100],
                vertical: false,
                items: [
                    { boxLabel: "Release", name: this.settingName, inputValue: "release", checked: true },
                    { boxLabel: "Iteration", name: this.settingName, inputValue: "iteration" }
                ],
                listeners: {
                    beforerender: this.setRadioValue,
                    scope: this
                },
                config: {
                    cls: "levelchooser"
                }
            });
        }
    });
}());
