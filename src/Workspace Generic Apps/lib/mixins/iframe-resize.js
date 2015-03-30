/** this mixin is used to mess with the environment outside of the iframe that the rally app is put in. */
(function(){
	var Ext = window.Ext4 || window.Ext;

	var TOP_BAR_HEIGHT = 40,
		BOTTOM_BAR_HEIGHT = 24,
		TITLE_BAR_HEIGHT = 33,
		IFRAME_HEADER_HEIGHT = 28;
		
	Ext.define('IframeResize', {
		requires: ['WindowListener'],
		
		_fixRallyDashboard: function(){ 
			/** makes app as large as screen, without the padding/margin */
			if(window.frameElement){
				var me=this,
					bottomEl = Ext.get(window.frameElement),
					portlet = bottomEl.up('.x-portlet'), 
					dashboard = portlet.up('#mydash_portlet'), //has huge padding values
					titleBar = dashboard.down('.titlebar'), //redundant with app header bar
					domNodeW = bottomEl.dom, domNodeH = bottomEl.dom,
					innerHeight = window.parent.innerHeight,
					innerWidth = window.parent.innerWidth;
				
				//adjust widths
				while(true){
					domNodeW.style.width = (innerWidth - 4) + 'px';
					domNodeW.style.padding = '0';
					domNodeW.style.margin = '0';
					if(domNodeW.id === 'mydash_portlet') break;
					domNodeW = domNodeW.parentNode;
				}
				
				//adjust heights
				while(true){
					domNodeH.style.height = (innerHeight - (TOP_BAR_HEIGHT + BOTTOM_BAR_HEIGHT + TITLE_BAR_HEIGHT + IFRAME_HEADER_HEIGHT)) + 'px';
					if(domNodeH.classList.contains('x-portlet')) break;
					domNodeH = domNodeH.parentNode;
				}
				while(true){
					domNodeH.style.height = (innerHeight - (TOP_BAR_HEIGHT + BOTTOM_BAR_HEIGHT + TITLE_BAR_HEIGHT)) + 'px';
					if(domNodeH.id == 'mydash_portlet') break;
					domNodeH = domNodeH.parentNode;
				}
				dashboard.dom.style.height = (innerHeight - (TOP_BAR_HEIGHT + BOTTOM_BAR_HEIGHT)) + 'px';
				
				//final touches LOL
				dashboard.dom.style.padding = "0 2px 0 2px";
				titleBar.dom.style.padding = "2px";
				titleBar.dom.style.margin = "0";
			}
		},		
		_initFixRallyDashboard: function(){ 
			var me=this;
			if(me._addWindowEventListener){
				me._addWindowEventListener('resize', function(){ me._fixRallyDashboard(); });
			}
			me._fixRallyDashboard();
		},

		_disableResizeHandle: function(){ 
			/** hides the draggable resize handle from under the app */
			var me=this, handle;
			if(window.frameElement){
				handle = Ext.get(window.frameElement).up('.x-portlet').down('.x-resizable-handle');
				if(handle) {
					handle.hide();
					handle.dom.onshow = function(){ if(handle) handle.hide(); };
				}
			}
		},	
		_initDisableResizeHandle: function(){
			var me=this;
			if(me._addWindowEventListener){
				me._addWindowEventListener('resize', function(){ me._disableResizeHandle(); });
			}
			me._disableResizeHandle();
		}
	});
}());