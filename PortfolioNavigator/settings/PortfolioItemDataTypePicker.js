(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.PortfolioItemDataTypePicker", {
        extend: "Rally.apps.charts.settings.DataTypePicker",
        alias: "widget.chartportfoliodatatypepicker",

        setRadioValue: function(cmp) {
            this.callParent(arguments);

            if(!this.getValue()) {
                this.setRadioToCustomValue(cmp, "storycount");
            }
        },

        _addRadioGroup: function () {
            return {
                xtype: "container",
                minWidth: 250,
                items: [
                    {
                        xtype: "label",
                        text: "Data Type",
                        cls: "settingsLabel",
                        style: {
                            display: "block",
                            minHeight: "20px"
                        }
                    },
                    {
                        xtype: "radiogroup",
                        name: this.settingName,
                        columns: [100, 150],
                        vertical: false,
                        items: [
                            { boxLabel: "Story Count", name: this.settingName, inputValue: "storycount" },
                            { boxLabel: "Story Plan Estimate", name: this.settingName, inputValue: "storypoints" }
                        ],
                        listeners: {
                            beforerender: this.setRadioValue,
                            scope: this
                        }
                    }
                ]
            };
        }
    });
}());
