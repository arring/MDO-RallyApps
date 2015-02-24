(function(){
	var Ext = window.Ext4 || window.Ext;
		
		/** this is used if you want to listen to events in the parent window (e.g. useful for rally apps that resize with browser screen
			vertically or things that need to know browser scroll position) 
		You also can artificially fire the events and have the listeners run
	*/
	Ext.define('WindowListener', {

		__initWindowEventListener: function(eventName){
			var me=this;
			if(!me._windowListeners) me._windowListeners = {};
			me._windowListeners[eventName] = [];
			
			window.parent['on' + eventName] = function(event){ 
				var listeners = me._windowListeners[eventName];
				for(var i=0, len=listeners.length; i<len; ++i)
					listeners[i](event);
			};
		},
		
		_addWindowEventListener: function(eventName, fn){
			var me=this;
			if(!me._windowListeners || !me._windowListeners[eventName]) 
				me.__initWindowEventListener(eventName);
			me._windowListeners[eventName].push(fn);
		},
		
		_fireParentWindowEvent: function(eventName){ //eg: resize or scroll
			var me=this;
			if(!me._windowListeners || !me._windowListeners[eventName]) return;
			var listeners = me._windowListeners[eventName];
			for(var i=0, len=listeners.length; i<len; ++i) listeners[i]();
		}
	});
}());