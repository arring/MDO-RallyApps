Ext.define('Intel.form.field.PiProjectComboBox', {
	extend:'Intel.form.field.ComboBox',
	alias: ['widget.intelPIprojectcombo'],
	requires:[
		'IntelRallyApp'
	],
	constructor: function(options) {
		var me = this,
			app= Rally.getApp();
		
		options = options || {};	
		options = Ext.merge({
			displayField:'Name',
			enableKeyEvents:true,
			queryMode:'local',
			ignoreNoChange:true,
			allowBlank:false,
			validator: function(value){
				if(me.isHidden()) return true;
				return !!_.find(me.ChildProjects, function(proj){ return proj.data.Name === value; });
			},
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
					combo.expand();
				}
			}
		}, options);
		me.callParent([options]);
		
		app._loadProjectByName('All Releases')
			.then(function(rootProject){
				return app._loadAllChildrenProjects(rootProject);
			})
			.then(function(childProjects){
				var data = [];
				me.ChildProjects = childProjects;
				for(var projOID in childProjects)
					data.push({ Name: childProjects[projOID].data.Name });
				me.bindStore(Ext.create('Ext.data.Store', {
					sorters:[function(o1, o2){ return o1.data.Name < o2.data.Name ? -1 : 1; }],
					fields:['Name'],
					data:data
				}));
				if(typeof me.value === 'number') 
					me.setValue(me.ChildProjects[me.value].data.Name);
			})
			.fail(function(reason){
				app._alert('ERROR', reason || '');
			})
			.done();
	}
});