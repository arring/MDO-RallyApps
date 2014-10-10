/** resizes the iframe to be a little bigger than the inner contents, so theres no ugly double vertical scroll bar **/

Ext.define('IframeResize', {
	requires: ['WindowListener'],
	
	/** resizes the iframe to be the height of all the items in it, with 20 px padding in between + 50 px; */
	__applyIframeResize: function(){ 
		var w = window, p = w.parent, pd = w.parent.document, l = w.location,
			iframe = pd.querySelector('iframe[src="' + l.pathname + l.search + '"]'),
			ip1 = iframe.parentNode,
			ip2 = iframe.parentNode.parentNode.parentNode.parentNode.parentNode.parentNode, //this is apparently the one that matters
			height = 0, next = this.down();
		while(next){
			height += next.getHeight() + next.getEl().getMargin('t')*1 + next.getEl().getMargin('b')*1;
			next = next.next();
		}
		height += 50;
		ip1.style.height = height + 'px';
		ip2.style.height = height + 'px';
		iframe.style.height = height + 'px';
	},
	
	_initIframeResize: function(){
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', function(){ me.__applyIframeResize(); });
		}
	}
});