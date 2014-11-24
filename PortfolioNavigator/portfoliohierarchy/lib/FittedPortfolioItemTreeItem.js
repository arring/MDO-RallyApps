Ext.define('Rally.apps.portfoliohierarchy.FittedPortfolioItemTreeItem', {
	extend: 'Rally.ui.tree.PortfolioItemTreeItem',
	alias: 'widget.fittedportfolioitemtreeitem',

	config: {
		displayedFields: ['Name', 'Plan']
	},

	getContentTpl: function(){
		var me = this;

		return Ext.create('Ext.XTemplate',
			'<tpl if="this.canDrag()"><div class="icon drag"></div></tpl>',
			'{[this.getActionsGear()]}',
			'<tpl if="this._renderPlanOnLowestLevelPortfolioItem()">',
				'<div class="textContent ellipses" style="max-width: 65%;">',
					'{[this.getFormattedId()]} - ',
					'<span title="{Name}">{Name}</span>',
					'<div class="textContent ellipses">{[this.getPlanData()]}</div>',
				'</div>',
			'<tpl else>',
				'<div class="textContent ellipses" style="max-width: 65%;">',
					'{[this.getFormattedId()]} - ',
					'<span title="{Name}">{Name}</span>',
				'</div>',
			'</tpl>',
			'<div class="rightSide">',
				'{[this.getPercentDone()]}',
			'</div>',
			{
				canDrag: function(){
					return me.getCanDrag();
				},
				getActionsGear: function(){
					return me._buildActionsGearHtml();
				},
				getPercentDone: function(){
					return Rally.ui.renderer.RendererFactory.renderRecordField(me.getRecord(), 'PercentDoneByStoryCount');
				},
				getFormattedId: function(){
					return Rally.ui.renderer.RendererFactory.renderRecordField(me.getRecord(), 'FormattedID');
				},
				getPlanData: function() {
					var plan = me.getRecord().data.Plan;
					var planName = plan && plan.name ? plan.name : "";
					return planName;
				},
				_renderPlanOnLowestLevelPortfolioItem: function() {
					return me.getRecord().self.isLowestLevelPortfolioItem();
				}
			}
		);
	}
});