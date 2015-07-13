/** 
	SUMMARY:
		This component is an easy user search picker based off ComboBox. It searches all users in Rally as you type.
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.UserPicker', {
		extend:'Ext.form.field.ComboBox',
		alias: ['widget.inteluserpicker'],

		constructor: function(options) {
			options = options || {};
			options = Ext.merge({
				queryMode: 'local',
				tpl: '<tpl for="."><div class="x-boundlist-item">{LastName}, {FirstName}</div></tpl>',
				displayTpl: '<tpl for="."><tpl if="LastName">{LastName}, {FirstName}</tpl></tpl>',
				allowBlank:true,
				store: Ext.create('Ext.data.Store', {
					fields: ['FirstName', 'LastName', 'UserName', 'ObjectID'],
					proxy: {
						type:'sessionstorage',
						id:'inteluserpickerproxy' + (10000*Math.random()>>0)
					},
					data: []
				}),
				listeners: {
					change: function(combo, newValue){
						if(typeof newValue !== 'string') return;
						combo.setLoading('Loading');
						var searchTerms = (newValue || '').split(',').map(function(x){ return x.trim(); });
						Ext.create('Rally.data.wsapi.Store', {
							model: 'user',
							fetch: ['FirstName', 'LastName', 'UserName', 'ObjectID'],
							pageSize: 20,
							limit:20,
							autoLoad:true,
							filters: ((!newValue.length) ? [] : [_.reduce(searchTerms, function(filter, term){
								var newFilter = 
									Ext.create('Rally.data.wsapi.Filter', {property:'FirstName', operator:'contains', value:term}).or(
									Ext.create('Rally.data.wsapi.Filter', {property:'LastName', operator:'contains', value:term}));
								if(filter) return newFilter.and(filter);
								else return newFilter;
							}, null)])
							.concat(Ext.create('Rally.data.wsapi.Filter', {property:'WorkspacePermission', operator:'!=', value:'No Access'})),
							listeners: {
								load: function(store){
									combo.setLoading(false);
									combo.store.removeAll();
									var users = _.sortBy(_.filter(_.map(store.getRange(),
										function(x){ return x.data; }),
										function(x){ return x.FirstName && x.LastName; }),
										function(x){ return x.LastName + ', ' + x.FirstName; });
									combo.store.add(users);
									combo.expand();
								}
							}
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
