/**  
	THIS IS ONLY USEFUL AS A RALLYAPP MIXIN 
	gives a window-centered alert or confirm dialog box that isn't ugly. 
*/
Ext.define('PrettyAlert', {

	__getMessageBoxY: function(){ 
		var w = window, p = w.parent, pd = w.parent.document, l = w.location,
			iframe = pd.querySelector('iframe[src="' + l.pathname + l.search + '"]');
		
		var ph = p.getWindowHeight(), 
			ps = p.getScrollY(), 
			ofy = ps + iframe.getBoundingClientRect().top, //offset of top of the iframe ==== constant!!!
			iyOffset = Math.floor(ph/2 - ofy + ps - 50);
		return iyOffset<0 ? 0 : iyOffset;
	},
	
	_alert: function(title, str){		
		if(arguments.length<1) return;
		if(arguments.length===1){
			str = title;
			title = '';
		}
		Ext.MessageBox.alert(title, str).setY(this.__getMessageBoxY());
		setTimeout(function(){ //give some time to give the 'ok' or 'yes' button focus
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 20);
	},
	
	_confirm: function(title, str, fn){
		if(arguments.length<2) return;
		if(arguments.length===2){
			fn = str;
			str = title;
			title = '';
		}
		if(typeof fn !== 'function') fn = function(){};
		Ext.MessageBox.confirm(title, str, fn).setY(this.__getMessageBoxY());
		setTimeout(function(){
			var x = Ext.MessageBox.down('button');
			while(x.isHidden()) x = x.nextSibling();
			x.focus();
		}, 20);
	}
});