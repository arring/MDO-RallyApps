(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.RadioGroupSetting", {
        extend: "Ext.form.FieldContainer",

        config: {
            settingName: undefined
        },

        constructor: function(config) {
            this.mergeConfig(config);
            this.callParent(arguments);
        },

        getSetting: function() {
            return this.settingsParent.app.getSetting(this.settingName);
        },

        setRadioValue: function (cmp) {
            this.setRadioToCustomValue(cmp, this.getSetting());
        },

        setRadioToCustomValue: function (cmp, customValue) {
            var value = {};
            value[cmp.name] = customValue;
            cmp.setValue(value);
        }
    });
}());
