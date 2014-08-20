(function () {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.PortfolioDatePicker", {
        extend: "Ext.form.FieldContainer",
        alias: "widget.chartportfoliodatepicker",

        requires: [
            "Rally.ui.DateField"
        ],

        mixins: [
            'Ext.form.field.Field',
            'Rally.apps.charts.DateMixin',
            'Rally.apps.charts.settings.SettingsChangeMixin'
        ],

        layout: {
            type: "hbox"
        },

        items: [
            {
                xtype: "container",
                minWidth: 250,
                items: [
                    {
                        xtype: "label",
                        text: "Start Date",
                        cls: "settingsLabel"
                    },
                    {
                        xtype: "radiogroup",
                        name: "startdate",
                        itemId: "startdategroup",
                        columns: 1,
                        vertical: true,
                        items: [
                            {
                                name: "startdate",
                                itemId: "actualstartdate",
                                boxLabel: "Actual Start Date",
                                baseLabel: "Actual Start Date",
                                inputValue: "actualstartdate"
                            },
                            {
                                name: "startdate",
                                itemId: "plannedstartdate",
                                boxLabel: "Planned Start Date",
                                baseLabel: "Planned Start Date",
                                inputValue: "plannedstartdate"
                            },
                            {
                                xtype: "container",
                                layout: {
                                    type: "hbox"
                                },
                                items: [
                                    {
                                        xtype: "radiofield",
                                        name: "startdate",
                                        itemId: "startdatemanual",
                                        boxLabel: " ",
                                        inputValue: "selecteddate"
                                    },
                                    {
                                        xtype: "rallydatefield",
                                        name: "startdate",
                                        itemId: "startdatefield",
                                        inputValue: "selecteddate"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                xtype: "container",
                minWidth: 250,
                items: [
                    {
                        xtype: "label",
                        text: "End Date",
                        cls: "settingsLabel"
                    },
                    {
                        xtype: "radiogroup",
                        name: "enddate",
                        itemId: "enddategroup",
                        columns: 1,
                        vertical: true,
                        items: [
                            {
                                name: "enddate",
                                itemId: 'today',
                                boxLabel: "Today",
                                inputValue: "today"
                            },
                            {
                                name: "enddate",
                                itemId: "actualenddate",
                                boxLabel: "Actual End Date",
                                baseLabel: "Actual End Date",
                                inputValue: "actualenddate"
                            },
                            {
                                name: "enddate",
                                itemId: "plannedenddate",
                                boxLabel: "Planned End Date",
                                baseLabel: "Planned End Date",
                                inputValue: "plannedenddate"
                            },
                            {
                                xtype: "container",
                                layout: {
                                    type: "hbox"
                                },
                                items: [
                                    {
                                        xtype: "radiofield",
                                        name: "enddate",
                                        itemId: "enddatemanual",
                                        boxLabel: " ",
                                        inputValue: "selecteddate"
                                    },
                                    {
                                        xtype: "rallydatefield",
                                        name: "enddate",
                                        itemId: "enddatefield",
                                        inputValue: "selecteddate"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ],

        settingsParent: undefined,

        /**
         * @Override from SettingsChangeMixin
         * Updates child components when a new portfolio item is chosen.
         */
        receiveSettingsChange: function (artifact) {
            if (artifact) {
                this._enableRadioGroups();
                this._updateRadioLabel(this.actualStartDate, artifact.ActualStartDate);
                this._updateRadioLabel(this.plannedStartDate, artifact.PlannedStartDate);
                this._updateRadioLabel(this.actualEndDate, artifact.ActualEndDate);
                this._updateRadioLabel(this.plannedEndDate, artifact.PlannedEndDate);
                this._setDefaultValues();
            }
        },

        initComponent: function () {
            this.callParent(arguments);
            this._saveComponentReferences();
            this._setupChangeHandlers();
        },

        beforeRender: function () {
            this._disableRadioGroups();
            this._loadSavedSettingsIntoComponent(this.startDateGroup);
            this._loadSavedSettingsIntoComponent(this.endDateGroup);
        },

        selectCustomDateRadioOption: function (cmp) {
            var value = {};
            value[cmp.name] = "selecteddate";
            this._getDateGroup(cmp.name).setValue(value);
        },

        _setupChangeHandlers: function () {
            this.startDatePicker.on('change', this.selectCustomDateRadioOption, this);
            this.endDatePicker.on('change', this.selectCustomDateRadioOption, this);
        },

        _saveComponentReferences: function () {
            this.actualStartDate = this.down("#actualstartdate");
            this.actualEndDate = this.down("#actualenddate");
            this.plannedStartDate = this.down("#plannedstartdate");
            this.plannedEndDate = this.down("#plannedenddate");
            this.startDateGroup = this.down("#startdategroup");
            this.endDateGroup = this.down("#enddategroup");
            this.startDatePicker = this.down("#startdatefield");
            this.endDatePicker = this.down("#enddatefield");
        },

        _disableRadioGroups: function() {
            this.startDateGroup.disable();
            this.endDateGroup.disable();
        },

        _enableRadioGroups: function () {
            this.startDateGroup.enable();
            this.endDateGroup.enable();
        },

        _loadSavedSettingsIntoComponent: function (component) {
            var settingValue = this._getSettingValue(component.name),
                settingParts = settingValue.split(","),
                selection = settingParts[0],
                date = settingParts[1];

            if (date) {
                this._setSavedDate(component, date);
            }

            this._selectRadio(component, selection);
        },

        _setDefaultValues: function () {
            if (this._dateGroupHasNoSelection(this.startDateGroup) && !this.actualStartDate.disabled) {
                this._selectRadio(this.startDateGroup, "actualstartdate");
            }

            if (this._dateGroupHasNoSelection(this.endDateGroup)) {
                if (!this.actualEndDate.disabled) {
                    this._selectRadio(this.endDateGroup, "actualenddate");
                }
                else {
                    this._selectRadio(this.endDateGroup, "today");
                }
            }
        },

        _dateGroupHasNoSelection: function (dateGroupCmp) {
            return Ext.Object.getSize(dateGroupCmp.getValue()) === 0;
        },

        _selectRadio: function (component, selection) {
            if (selection.length > 0) {
                var componentValue = {};
                componentValue[component.name] = selection;
                component.setValue(componentValue);
            }
        },

        _getSettingValue: function (setting) {
            return this.settingsParent.app.getSetting(setting) || "";
        },

        _getCustomDateForGroup: function (groupName) {
            return ({
                startdate: this.startDatePicker,
                enddate: this.endDatePicker
            })[groupName];
        },

        _getDateGroup: function (groupName) {
            return ({
                startdate: this.startDateGroup,
                enddate: this.endDateGroup
            })[groupName];
        },

        _setSavedDate: function (component, dateString) {
            if (component && dateString && dateString.length > 0) {
                var datePicker = this._getCustomDateForGroup(component.name),
                    date = this.dateStringToObject(dateString);

                datePicker.setValue(date);
            }
        },

        _updateRadioLabel: function (radioComponent, date) {
            var newLabelValue = radioComponent.baseLabel,
                formattedDate = this.dateToStringDisplay(date);

            if (formattedDate) {
                radioComponent.enable();
                newLabelValue += " (" + formattedDate + ")";
            }
            else {
                radioComponent.disable();
                if (this._isActualDateRadioField(radioComponent)) {
                    newLabelValue += ": Not Available";
                }
                else {
                    newLabelValue += ": Not Set";
                }
            }

            radioComponent.boxLabelEl.setHTML(newLabelValue);
        },

        _isActualDateRadioField: function (radioComponent) {
            return radioComponent.getId().indexOf("actual") > -1;
        }
    });
}());
