Ext.define('Settings', {
    singleton: true,
    requires: [
        'Rally.ui.combobox.FieldComboBox',
        'Rally.ui.combobox.ComboBox',
        'Rally.ui.TextField',
        'Rally.ui.NumberField',
        'RowSettingsField',
        'Rally.data.wsapi.Filter',
        'SizesField'
    ],

    getFields: function (context) {
        return [
            {
                name: 'sizes',
                xtype: 'sizesfield',
                fieldLabel: 'Columns'
            },
            {
                name: 'groupHorizontallyByField',
                xtype: 'rowsettingsfield',
                fieldLabel: 'Swimlanes',
                mapsToMultiplePreferenceKeys: ['showRows', 'rowsField'],
                readyEvent: 'ready',
                isAllowedFieldFn: function(field) {
                    var attr = field.attributeDefinition;
                    return (attr.Custom && (attr.Constrained || attr.AttributeType.toLowerCase() !== 'string') ||
                        attr.Constrained || _.contains(['quantity', 'boolean'], attr.AttributeType.toLowerCase()) ||
                        (!attr.Constrained && attr.AttributeType.toLowerCase() === 'object')) &&
                        !_.contains(['web_link', 'text', 'date'], attr.AttributeType.toLowerCase()) &&
                        !_.contains(['PortfolioItemType', 'LastResult'], attr.ElementName);
                },
                handlesEvents: {
                    typeselected: function(type, context) {
                        this.refreshWithNewModelType(type, context);
                    }
                }
            },
            {
                type: 'query'
            }
        ];
    }
});
