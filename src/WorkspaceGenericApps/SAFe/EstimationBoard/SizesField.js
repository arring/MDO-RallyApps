Ext.define('SizesField', {
    extend: 'Ext.form.field.Base',
    alias: 'widget.sizesfield',
    requires: [
        'Rally.ui.Button'
    ],

    fieldSubTpl: '<div id="{id}"></div>',

    cls: 'sizes',

    config: {
        /**
         * @cfg {Object}
         *
         * The size settings value for this field
         */
        value: undefined
    },

    onDestroy: function() {
        if (this._sizesContainer) {
            this._sizesContainer.destroy();
            delete this._sizesContainer;
        }
        this.callParent(arguments);
    },

    onRender: function() {
        this.callParent(arguments);

        this._sizesContainer = Ext.create('Ext.Container', {
            renderTo: this.inputEl,
            cls: 'sizes-container',
            items: this._buildRows()
        });
    },

    /**
     * When a form asks for the data this field represents,
     * give it the name of this field and the ref of the selected project (or an empty string).
     * Used when persisting the value of this field.
     * @return {Object}
     */
    getSubmitData: function() {
        var data = {};
        data[this.name] = Ext.JSON.encode(_.map(Ext.ComponentQuery.query('container', this._sizesContainer), function(row) {
            var labelTextBox = Ext.ComponentQuery.query('rallytextfield', row)[0],
                valueTextBox = Ext.ComponentQuery.query('rallynumberfield', row)[0];

            return {
                text: labelTextBox.getValue(),
                value: valueTextBox.getValue()
            };
        }));

        return data;
    },

    _buildRows: function() {
        return [{
          xtype: 'component',
          margin: '0 0 5px 0',
          html: '<span class="label-header">Name</span><span class="plan-est-header">Plan Est</span>'
        }].concat(_.map(Ext.JSON.decode(this._value), function(value) {
            return this._buildRow(value);
        }, this));
    },

    _buildRow: function(value) {
        return {
            xtype: 'container',
            layout: 'hbox',
            items: [
                {
                    xtype: 'rallybutton',
                    border: false,
                    frame: false,
                    cls: 'row-btn plus',
                    disabled: false,
                    itemId: 'plusButton',
                    iconCls: 'icon-plus',
                    listeners: {
                        click: this._addRow,
                        scope: this
                    }
                },
                {
                    xtype: 'rallybutton',
                    border: false,
                    cls: 'row-btn minus',
                    frame: false,
                    iconCls: 'icon-minus',
                    itemId: 'minusButton',
                    listeners: {
                        click: this._removeRow,
                        scope: this
                    }
                },
                {
                    xtype: 'rallytextfield',
                    width: 100,
                    value: value && value.text
                },
                {
                    xtype: 'rallynumberfield',
                    width: 50,
                    margin: '0 0 0 10px',
                    value: value && value.value
                }
            ]
        };
    },

    _addRow: function(button) {
        var container = button.up();
        var sizesContainer = container.up();
        var index = sizesContainer.items.indexOf(container);
        sizesContainer.insert(index + 1, this._buildRow());
        this._adjustSize();
    },

    _removeRow: function(button) {
        button.up().destroy();
        this._adjustSize();
    },

    _adjustSize: function() {
      //little hack- force app settings resize
      var appSettings = this.up('rallyappsettings');
      appSettings.fireEvent('appsettingsready', appSettings);
    },

    setValue: function(value) {
        this.callParent(arguments);
        this._value = value;
    }
});
