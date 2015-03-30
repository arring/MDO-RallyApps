(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/**  
		THIS IS ONLY USEFUL AS A RALLYAPP MIXIN 
		gives a window-centered alert or confirm dialog box that isn't ugly. 
	*/
	Ext.define('PrettyAlert', {

		__getMessageBoxY: function(){ 
			var me=this,
				bottomEl = window.frameElement ? Ext.get(window.frameElement) : me.el,
				ph = window.frameElement ? window.parent.getWindowHeight() : window.innerHeight,
				ps = window.frameElement ? window.parent.getScrollY() : window.scrollY,
				ofy = ps + bottomEl.dom.getBoundingClientRect().top, //offset of top of the iframe ==== constant!!!
				iyOffset = Math.floor(ph/2 - ofy + ps - 50);
			return iyOffset<0 ? 0 : iyOffset;
		},
		
		_alert: function(title, message){
			var me=this;
			message = (typeof message === 'string') ? message : 
								(message.message ? message.message : 
								JSON.stringify(message, null, '\t'));
			if(arguments.length<1) return;
			if(arguments.length===1){
				message = title;
				title = '';
			}
			Ext.MessageBox.alert(title, message).setY(me.__getMessageBoxY());
			setTimeout(function(){ //give some time to give the 'ok' or 'yes' button focus
				var x = Ext.MessageBox.down('button');
				while(x.isHidden()) x = x.nextSibling();
				x.focus();
			}, 50);
		},
		
		_confirm: function(title, message, fn){
			var me=this;
			message = (typeof message === 'string') ? message : 
								(message.message ? message.message : 
								JSON.stringify(message, null, '\t'));
			if(arguments.length<2) return;
			if(arguments.length===2){
				fn = message;
				message = title;
				title = '';
			}
			if(typeof fn !== 'function') fn = function(){};
			Ext.MessageBox.confirm(title, message, fn).setY(me.__getMessageBoxY());
			setTimeout(function(){
				var x = Ext.MessageBox.down('button');
				while(x.isHidden()) x = x.nextSibling();
				x.focus();
			}, 20);
		}
	});
}());