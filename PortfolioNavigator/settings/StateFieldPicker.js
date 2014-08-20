(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define("Rally.apps.charts.settings.StateFieldPicker", {
        extend: 'Ext.form.FieldSet',
        alias: 'widget.rallychartssettingsstatefieldpicker',

        requires: [
            'Rally.ui.combobox.FieldComboBox',
            'Rally.ui.combobox.FieldValueComboBox'
        ],

        // extjs properties
        flex: 1,
        border: false,
        width: 420,
        layout: 'vbox',
        defaultType: 'textfield',
        defaults    : {
            anchor     : '-10',
            labelWidth : 50
        },
        items: [],

        // custom properties
        settings: undefined, // Map of initial settings values

        constructor: function() {
            this._parseConstructorParams.apply(this, arguments);
            this.callParent();
        },

        _parseConstructorParams: function() {
            var args;
            args = arguments[0];
            if (!args.settings) {
                throw 'Missing initial settings in GroupBySettings';
            }
            this.settings = args.settings;
        },

        initComponent: function() {
            this.callParent();
            this._addStateFieldPicker();

            this.on('statefieldnameselected', this._onStateFieldNameSelected);
            this.on('statefieldnameready', this._onStateFieldNameReady);
            this.on('statefieldvaluesready', this._onStateFieldValuesReady);
            this.on('statefieldvalueschanged', this._onStateFieldValuesChanged);
        },

        /**
         * Event handling
         */
        _onStateFieldNameSelected: function(fieldDefinition) {
            // This happens on field change
            this._refreshStateValuesPicker(fieldDefinition.name);
        },

        _onStateFieldNameReady: function() {
            // This happens on initial settings panel load
            this._updateStateFieldComboboxValue();
            this._refreshStateValuesPicker(this.settings.stateFieldName);
        },

        _onStateFieldValuesReady: function(combo) {
            // This happens on field values combo box ready
            if (_.isString(this.settings.stateFieldValues)) {
                var values = [];
                values = this.settings.stateFieldValues.split(',');
                combo.setValue(values);
            }

            this._publishComponentReady();
        },

        _onStateFieldValuesChanged: function(combo, records) {
            this._sortDisplayedStatesByStore(combo, records);
        },


        _sortDisplayedStatesByStore: function(combo, records) {
            var i, j;
            var values=[];
            if(records.length > 0) {
              for (i=0;i<records[0].store.data.items.length;i++) {
                  for(j=0;j<records.length;j++) {
                     if(records[j].data.StringValue === records[0].store.data.items[i].data.StringValue) {
                         values.push(records[j].data.StringValue);
                     }
                  }
              }
            }
            combo.setValue(values);
        },

        _publishComponentReady: function() {
            if (Rally.BrowserTest) {
                Rally.BrowserTest.publishComponentReady(this);
            }
        },

        _updateStateFieldComboboxValue: function() {
            if(this.settings) {
                var combo = this.down('rallyfieldcombobox');
                combo.setValue(this.settings.stateFieldName);
            }
        },

        _refreshStateValuesPicker: function(fieldName) {
            // if values picker already exists, destroy it
            var old = this.down('rallyfieldvaluecombobox');
            if (old) {
                this.remove(old);
            }
            this._addStateValuesPicker(fieldName);
        },

        _addStateFieldPicker: function() {
            this.add({
                name: 'stateFieldName',
                xtype: 'rallyfieldcombobox',
                model: 'UserStory',
                margin: '10px 0 0 0',
                width: 180,
                fieldLabel: 'Field',
                listeners: {
                    select: function(combo) {
                        this.fireEvent('statefieldnameselected', combo.getRecord().get('fieldDefinition'));
                    },
                    ready: function(combo) {
                        combo.store.filterBy(function(record) {
                            var attr = record.get('fieldDefinition').attributeDefinition;
                            return attr && !attr.ReadOnly && attr.Constrained && attr.AttributeType !== 'OBJECT' && attr.AttributeType !== 'COLLECTION';
                        });
                        if (combo.getRecord()) {
                            this.fireEvent('statefieldnameready');
                        }
                    }
                },
                bubbleEvents: ['statefieldnameselected', 'statefieldnameready']
            });
        },

        _addStateValuesPicker: function(fieldName) {
            this.add({
                xtype: 'rallyfieldvaluecombobox',
                model: 'UserStory',
                field: fieldName,
                name: 'stateFieldValues',
                valueField: "StringValue",
                displayField: "StringValue",
                multiSelect: true,
                readyEvent: 'ready',
                fieldLabel: 'Show states',
                margin: '10px 0 0 0',
                width: 400,
                forceSelection: true,
                allowBlank: false,
                listeners: {
                    ready: function(combo) {
                        this.fireEvent('statefieldvaluesready', this);
                    },
                    select: function(combo, records) {
                        this.fireEvent('statefieldvalueschanged', combo, records);
                    }
                },
                listConfig: {
                    itemTpl: Ext.create('Ext.XTemplate',
                        '<div class="x-boundlist-item"><img src="' + Ext.BLANK_IMAGE_URL + '" class="stateFieldValue"/> &nbsp;{StringValue}</div>'),
                    listeners:{
                        afterrender: function(){
                            this.selectedItemCls = Ext.baseCSSPrefix + 'boundlist-selected x-boundlist-selected';
                        }
                    }
                },
                bubbleEvents: ['statefieldvaluesready', 'statefieldvalueschanged']
            });
        }

    });
}());
