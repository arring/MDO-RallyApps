(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/** resizes the iframe to be a little bigger than the inner contents, so theres no ugly double vertical scroll bar **/

	Ext.define('IframeResize', {
		requires: ['WindowListener'],
		
		/***************** ************* ********* DONT USE THIS STUFF ********************* ************* *********************/
		
		/** resizes the iframe to be the height of all the items in it */
		_applyIframeResizeToContents: function(){ 
			var w = window, p = w.parent, pd = w.parent.document, l = w.location,
				iframe = window.frameElement ? Ext.get(window.frameElement) : me.el,
				ip1 = iframe.parentNode,
				ip2 = iframe.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode, //this is apparently the one that matters
				height = 0, next = this.down();
			while(next){
				height += next.getHeight() + next.getEl().getMargin('tb')*1 + next.getEl().getPadding('tb')*1;
				next = next.next();
			}
			height += 150;
			ip1.style.height = height + 'px';
			ip2.style.height = height + 'px';
			iframe.style.height = height + 'px';
		},
		
		/** 
			This attaches a listener to the parent window resize event. When the parent window resizes, this resets the iframe height
			to that of the contents! Call this if you want the scrollbar to be on the outsize of the app (the window scrollbar)
		*/
		_initIframeResizeToContents: function(){
			var me=this;
			if(me._addWindowEventListener){
				me._addWindowEventListener('resize', function(){ me._applyIframeResizeToContents(); });
			}
		},
			
		/** 
			resizes the iframe to be the height of the window. its like rally autoheight app but better 
		*/
		_applyIframeResizeToWindow: function(){ 
			var iframe = window.frameElement ? Ext.get(window.frameElement) : me.el,
				i = iframe.dom,
				portlet = iframe.up('.x-portlet'),
				portalColumn = portlet.up('.x-portal-column'),
				dashboard = portlet.up('#mydash_portlet');
			height = window.parent.innerHeight - 70;
			height -= 200; //~120 on top and 60 on bottom and
			iframe.style.height = height + 'px';
			ip1.style.height = height + 'px';
			height += 30;
			ip2.style.height = height + 'px';
		},
		
			/** 
			This attaches a listener to the parent window resize event. When the parent window resizes, this resets the iframe height
			to that of the window! Call this if you want the scrollbar to be on the inside of the app (NOT the window scrollbar)
		*/
		_initIframeResizeToWindow: function(){
			var me=this;
			if(me._addWindowEventListener){
				me._addWindowEventListener('resize', function(){ me._applyIframeResizeToWindow(); });
			}
			me._applyIframeResizeToWindow();
		},
		
		/***************** ************* ********* GOOD STUFF BELOW ********************* ************* *********************/		
		_fixRallyDashboard: function(){ //makes app as large as screen, without the stupid padding/margin
			var me=this,
				bottomEl = window.frameElement ? Ext.get(window.frameElement) : me.el,
				portlet = bottomEl.up('.x-portlet'), 
				portalColumn = portlet.up('.x-portal-column'), //has huge right margin (we don't explicitly need it here)
				dashboard = portlet.up('#mydash_portlet'), //has huge padding values
				titleBar = dashboard.down('.titlebar'), //redundant with app header bar
				domNodeW = bottomEl.dom, domNodeH = bottomEl.dom,
				innerHeight = window.parent.innerHeight,
				innerWidth = window.parent.innerWidth;
				
			titleBar.dom.style.display = 'none';
			
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
				domNodeH.style.height = (innerHeight - 105) + 'px';
				if(domNodeH.classList.contains('x-portlet')) break;
				domNodeH = domNodeH.parentNode;
			}
			dashboard.dom.style.height = (innerHeight - 65) + 'px';
			portlet.dom.style.height = (innerHeight - 75) + 'px';
			
			//final touches LOL
			dashboard.dom.style.padding = "0 2px 0 2px";
		},		
		_initFixRallyDashboard: function(){ 
			var me=this;
			if(me._addWindowEventListener){
				me._addWindowEventListener('resize', function(){ me._fixRallyDashboard(); });
			}
			me._fixRallyDashboard();
		},

		_disableResizeHandle: function(){ //hides the draggable resize handle from under the app
			var me=this, handle;
			if(window.frameElement) handle = Ext.get(window.frameElement).up('.x-portlet').down('.x-resizable-handle');
			else handle = me.el.up('.x-portlet').down('.x-resizable-handle');
			if(handle){
				handle.hide();
				handle.dom.onshow = function(){ if(handle) handle.hide(); };
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