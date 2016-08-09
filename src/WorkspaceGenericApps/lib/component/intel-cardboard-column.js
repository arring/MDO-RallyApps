(function() {
    var Ext = window.Ext4 || window.Ext;

    Ext.define('Intel.lib.component.CardboardColumn', {
        extend: 'Rally.ui.cardboard.Column',
        alias: ['widget.intelcardboardcolumn'],

        isMatchingRecord: function(record) {
            var recordValue = record.get(this.attribute),
                field = record.getField(this.attribute),
                typePath = record.self.typePath,
                models = this.store.models || Ext.Array.from(this.store.model),
                supportedTypes = _.pluck(models, 'typePath');
            
            

            if (!field || !_.contains(supportedTypes, typePath)) {
                return false;
            }

            var columnValue = this.getValue();

            // Field values can be converted from null. So we need to convert the column
            // value in case it is null
            if (Ext.isFunction(field.convert)) {
                columnValue = field.convert(columnValue, record);
            }

            // See if value is a power of 2
            var isPowerOfTwo = Math.log2(recordValue) % 1 === 0;

            return ((columnValue === recordValue || !isPowerOfTwo) || 
                (Rally.util.Ref.isRefUri(columnValue) &&
                    Rally.util.Ref.getRelativeUri(recordValue) === Rally.util.Ref.getRelativeUri(columnValue)));
        },
        
        _getModelScopedFilters: function(models) {
            if(!this.requiresModelSpecificFilters) {
                return [this.getStoreFilter()];
            } else {
                var filters = _.map(models, function (model) {
                    // filter by typeDefOid so we only get back the models we asked for
                    var filter = Ext.create('Rally.data.wsapi.Filter', {
                        property: 'TypeDefOid',
                        value: model.typeDefOid,
                        operator: '='
                    });

                    // AND all model specific filters together with typeDefOid filter to scope by model type
                    var modelFilters = this.getStoreFilter(model);

                    if (!Ext.isEmpty(modelFilters)) {
                        filter = _.reduce(Ext.Array.from(modelFilters), function (result, modelFilter) {
                            // If no estimate column, add not filter
                            // This generates a special filter for the null column to also
                            // grab values that do not fit into any other bucket. If the bucket
                            // sizes change you need to change this and the method above to match 
                            // your bucket scheme. 
                            if (modelFilter.value === null) {
                                var notFilter = Ext.create('Rally.data.wsapi.Filter', {
                                    property: modelFilter.property,
                                    operator: '!=',
                                    value: 100
                                });
                                for(var i = 0; i < 5; i++) {
                                    notFilter = notFilter.and({
                                        property: modelFilter.property,
                                        operator: '!=',
                                        value: Math.pow(2, i)
                                    });
                                }
                                return result.and(notFilter.or(modelFilter));
                            } // end not filter
                            return result.and(modelFilter);
                        }, filter);
                    }

                    return filter;
                }, this);

                // OR model filters together so we get back all models we asked for
                return _.reduce(filters, function (result, filter) {
                    return Ext.isEmpty(result) ? filter : result.or(filter);
                }, null, this);
            }
        }
    });
}());
