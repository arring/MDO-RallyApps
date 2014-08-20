(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.ScheduleStatePicker", {
        extend: "Ext.form.FieldContainer",
        alias: "widget.chartschedulestatepicker",

        requires: [
            "Ext.data.Store",
            "Ext.form.field.ComboBox",
            "Rally.ui.picker.MultiObjectPicker"
        ],

        settingsParent: undefined,

        config: {
            settingName: "customScheduleStates"
        },

        initComponent: function() {
            this.callParent(arguments);
            this._loadUserStoryModel();
        },

        _loadUserStoryModel: function() {
            Rally.data.ModelFactory.getModel({
                type: "UserStory",
                context: this._getContext(),
                success: this._getScheduleStateValues,
                scope: this
            });
        },

        _getContext: function() {
            return {
                workspace: this.context.getWorkspaceRef(),
                project: null
            };
        },

        _getScheduleStateValues: function (model) {
            if(model) {
                model.getField("ScheduleState").getAllowedValueStore().load({
                    callback: function(records, operation, success) {
                        var scheduleStates = _.collect(records, function(obj) {
                            return obj.raw;
                        });

                        var store = this._wrapRecords(scheduleStates);
                        this._addPicker(store);
                    },
                    scope: this
                });
            }
        },

        _wrapRecords: function(records) {
            return Ext.create("Ext.data.JsonStore", {
                fields: ["_ref", "StringValue"],
                data: records
            });
        },

        _addPicker: function(store) {
            this.add({
                xtype: "combobox",
                name:  this.settingName,
                store: store,
                valueField: "StringValue",
                displayField: "StringValue",
                queryMode: "local",
                multiSelect: true,
                listConfig: {
                    cls: "schedule-state-selector",
                    tpl: Ext.create('Ext.XTemplate',
                        '<tpl for=".">',
                            '<li role="option" class="' + Ext.baseCSSPrefix + 'boundlist-item">',
                                '<input type="button" class="' + Ext.baseCSSPrefix + 'form-checkbox" /> &nbsp;',
                                '{StringValue}',
                            '</li>',
                        '</tpl>'
                    )
                },
                listeners: {
                    beforerender: this._onComboboxBeforeRender,
                    scope: this
                }
            });
        },

        _onComboboxBeforeRender: function(combobox) {
            var stringValue = this.settingsParent.app.getSetting(this.settingName),
                values = [];

            if(_.isString(stringValue)) {
                values = stringValue.split(",");
            }

            combobox.setValue(values);
        }
    });
}());