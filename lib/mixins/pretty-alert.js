/**  
	THIS IS ONLY USEFUL AS A RALLYAPP MIXIN 
	gives a window-centered alert or confirm dialog box that isn't ugly. 
*/
Ext.define('PrettyAlert', { 
	requires:['WindowListener'],
	
	_alert: function(title, str){
		Ext.MessageBox.alert(title || '', str || '').setY(this.__msgBoxY);
		setTimeout(function(){ //give some time to give the 'ok' or 'yes' button focus
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 20);
	},
	
	_confirm: function(title, str, fn){
		Ext.MessageBox.confirm(title || '', str || '', fn || function(){}).setY(this.__msgBoxY);
		setTimeout(function(){
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 20);
	},
	

	__applyMessageBoxConfig: function(){ 
		var w = window, p = w.parent, pd = w.parent.document, l = w.location,
			iframe = pd.querySelector('iframe[src="' + l.pathname + l.search + '"]');
		
		var ph = p.getWindowHeight(), 
			ps = p.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe ==== constant!!!
			iyOffset = Math.floor(ph/2 - ofy + ps - 50);
		this.__msgBoxY = iyOffset<0 ? 0 : iyOffset;
	},
	
	/** CALL THIS IN LAUNCH FUNCTION! **/
	_initPrettyAlert: function(){
		var me=this;
		if(me._addWindowEventListener){
			me._addWindowEventListener('resize', function(){ me.__applyMessageBoxConfig(); });
			me._addWindowEventListener('scroll', function(){ me.__applyMessageBoxConfig(); });
		}
	}
});