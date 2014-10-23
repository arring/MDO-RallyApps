Ext.define('Rally.apps.portfoliohierarchy.FittedUserStoryTreeItem', {
	extend: 'Rally.ui.tree.UserStoryTreeItem',
	alias: 'widget.fitteduserstorytreeitem',

	config: {
		displayedFields: ['Name', 'Project', 'ScheduleState']
	},

	getContentTpl: function(){
		var me = this;
		return Ext.create('Ext.XTemplate',
			'<tpl if="this.canDrag()"><div class="icon drag"></div></tpl>',
			'{[this.getActionsGear()]}',
			'<div class="textContent ellipses" style="max-width:65%;">',
				'{[this.getFormattedId()]} - ',
				'<span title="{Name}\nProject: {[this.getProjectName()]}">{Name}</span>',
			'</div>',
			'<div class="rightSide">',
				'{[this.getScheduleState()]}',
			'</div>',
		{
			canDrag: function(){
				return me.getCanDrag();
			},
			getProjectName: function() {
				return me.getRecord().data.Project.Name;    
			},
			getActionsGear: function(){
				return me._buildActionsGearHtml();
			},
			getScheduleState: function(){
				return Rally.ui.renderer.RendererFactory.renderRecordField(me.getRecord(), 'ScheduleState');
			},
			getFormattedId: function(){
				return Rally.ui.renderer.RendererFactory.renderRecordField(me.getRecord(), 'FormattedID');
			}
		});
	}
});