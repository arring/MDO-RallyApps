/**
	SUMMARY:
		This override makes the ComponentColumn component much more performant. Edits found using Chrome profiling
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
		
	Ext.define('Intel.lib.component.ComponentColumn', {
		extend: 'Skirtle.grid.column.Component',
		alias: 'widget.intelcomponentcolumn',

		autoWidthComponents: false,
		componentGC: true,
		hasCustomRenderer: true,
		lastFrameWidth: 12,		
		constructor: function(cfg) {
			var me = this;
			me.callParent(arguments);
		},
		registerViewListeners: function() {
			var me = this,
				view = me.up('tablepanel').getView();

			me.mon(view, 'beforerefresh', me.beforeViewRefresh, me);
			me.mon(view, 'refresh', me.onViewChange, me);
			//me.mon(view, 'itemupdate', me.onViewChange, me); //why are these necessary...
			//me.mon(view, 'itemadd', me.onViewChange, me);
			//me.mon(view, 'itemremove', me.onViewChange, me);
		},
		onViewChange: function() {
			var me = this, tpl = me.tpl;
			me.suspendResizing();
			if (tpl.isCTemplate) {
					tpl.injectComponents();
					tpl.reset();
			}
			//me.redoScrollbars();
			me.resumeResizing();
			me.performGC();
		},		
		resumeResizing: function(){
			var me = this,
				index = 0,
				resizeQueue = me.resizeQueue,
				len = resizeQueue.length;
			if (!--me.resizingSuspended) {
				for ( ; index < len ; ++index) me.resizeChild(resizeQueue[index]);
				me.resizeQueue = null;
				/* if (me.redoScrollbarsRequired) {
						me.redoScrollbars();
				} */
			}
		},
		onChildResize: function() {
			//this.redoScrollbars();
		}
	});
}());