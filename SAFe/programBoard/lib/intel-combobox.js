Ext.define('Intel.form.field.ComboBox', {
	extend:'Ext.form.field.ComboBox',
	alias: ['widget.intelcombo', 'widget.intelcombobox'],
	
	constructor: function() {
		this.callParent(arguments);
	},	
	enableKeyEvents:true,
	queryMode:'local',
	ignoreNoChange:true,
	listeners: {
		keyup: function(a,b){
			if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
			var combo = this;
			combo.store.filters.getRange().forEach(function(filter){
				combo.store.removeFilter(filter);
			});
			combo.store.filterBy(function(item){
				return item.get(combo.displayField).indexOf(combo.getRawValue()) === 0;
			});
		},
		focus: function(combo) {
			combo.store.filters.getRange().forEach(function(filter){
				combo.store.removeFilter(filter);
			});
			combo.setValue('');
			combo.expand();
		}
	}
});