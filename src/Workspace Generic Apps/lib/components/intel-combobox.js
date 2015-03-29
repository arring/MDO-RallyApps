(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/** this combo has filter-as-you-type and drops down on click. it also lets you navigate with arrow keys
		(although there is some arrow key scrolling bug) 
	*/
	Ext.define('IntelComboBox', {
		extend:'Ext.form.field.ComboBox',
		alias: ['widget.intelcombo', 'widget.intelcombobox'],
		
		constructor: function(options) {
			options = options || {};
			options = Ext.merge({
				enableKeyEvents:true,
				queryMode:'local',
				ignoreNoChange:true,
				allowBlank:true,
				listeners: {
					keyup: function(a,b){
						if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
						var combo = this;
						combo.store.clearFilter();
						combo.store.filterBy(function(item){
							return item.data[combo.displayField].match(new RegExp(combo.getRawValue(), 'i')) !== null;
						});
					},
					focus: function(combo) {
						combo.store.clearFilter();
						combo.setValue('');
						combo.expand();
					}
				}
			}, options);
			this.callParent([options]);
		}
	});
}());