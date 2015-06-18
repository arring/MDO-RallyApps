/**  
	DESCRIPTION:
		This mixin gives a window-centered alert or confirm dialog box that isn't ugly. 
		
	ISSUES:
		Sometimes alert.setY() fails so we have to fallback to the ugly built-in alert
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.PrettyAlert', {	
		_getMessageBoxY: function(){ 
			var me=this,
				bottomEl = window.frameElement ? Ext.get(window.frameElement) : me.el,
				ph = window.frameElement ? window.parent.getWindowHeight() : window.innerHeight,
				ps = window.frameElement ? window.parent.getScrollY() : window.scrollY,
				ofy = ps + bottomEl.dom.getBoundingClientRect().top, //offset of top of the iframe ==== constant!!!
				iyOffset = Math.floor(ph/2 - ofy + ps - 50);
			return iyOffset<0 ? 0 : iyOffset;
		},
		
		_formatString: function(message){
			message = message || '';
			return (typeof message === 'string') ? 
				message : (message.message ? 
				message.message : JSON.stringify(message, null, '\t'));
		},

		/** non-ugly alert dialog */
		alert: function(title, message){
			if(arguments.length<1) return;
			if(arguments.length===1){
				message = title;
				title = '';
			}
			
			try {
				Ext.MessageBox.alert(this._formatString(title), this._formatString(message)).setY(this._getMessageBoxY());
				setTimeout(function(){
					var x = Ext.MessageBox.down('button');
					while(x.isHidden()) x = x.nextSibling();
					x.focus();
				}, 50);
			}
			catch(e){ alert(this._formatString(message)); }
		},
		
		/** non-ugly confirm dialog */
		confirm: function(title, message, fn){
			if(arguments.length<2) return;
			if(arguments.length===2){
				fn = message;
				message = title;
				title = '';
			}
			if(typeof fn !== 'function') fn = function(){};
			
			try {
				Ext.MessageBox.confirm(this._formatString(title), this._formatString(message), fn).setY(this._getMessageBoxY());
				setTimeout(function(){
					var x = Ext.MessageBox.down('button');
					while(x.isHidden()) x = x.nextSibling();
					x.focus();
				}, 50);
			catch(e){ if(confirm(this._formatString(message))) fn(); }
		}
	});
}());