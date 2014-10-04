Ext.define('intel.grid.column.Component.', {
	alias: 'widget.fastgridcolumn',
	extend: 'Skirtle.grid.column.Component',

	// Whether or not to automatically resize the components when the column resizes
	autoWidthComponents: false,

	// Whether or not to destroy components when they are removed from the DOM
	componentGC: true,

	// Override the superclass - this must always be true or odd things happen, especially in IE
	hasCustomRenderer: true,

	// The estimated size of the cell frame. This is updated once there is a cell where it can be measured
	lastFrameWidth: 12,

	/* Defer durations for updating the component width when a column resizes. Required when a component has an animated
	 * resize that causes the scrollbar to appear/disappear. Otherwise the animated component can end up the wrong size.
	 *
	 * For ExtJS 4.0 both delays are required. For 4.1 just having the 10ms delay seems to be sufficient.
	 */
	//widthUpdateDelay: [10, 400],

	constructor: function(cfg) {
		var me = this;
		me.callParent(arguments);
	},
	
	onViewChange: function() {
		var me = this, tpl = me.tpl;
		// Batch the resizing of child components until after they've all been injected
		me.suspendResizing();
		if (tpl.isCTemplate) {
				// No need to wait for the polling, the sooner we inject the less painful it is
				tpl.injectComponents();
				// If the template picked up other components in the data we can just ignore them, they're not for us
				tpl.reset();
		}
		// A view change could mean scrollbar problems. Note this won't actually do anything till we call resumeResizing
		//me.redoScrollbars();
		me.resumeResizing();
		me.performGC();
	},
	
	resumeResizing: function() {
		var me = this,
			index = 0,
			resizeQueue = me.resizeQueue,
			len = resizeQueue.length;
		if (!--me.resizingSuspended) {
			for ( ; index < len ; ++index) {
					me.resizeChild(resizeQueue[index]);
			}
			me.resizeQueue = null;
			//if (me.redoScrollbarsRequired) {
			//    me.redoScrollbars();
			//}
		}
	},
	onChildResize: function() {
		//this.redoScrollbars();
  }
});