/** 
	SUMMARY:
		This mixin is used if you want to listen to events in the parent window (e.g. useful for rally apps that 
		resize with browser screen vertically or things that need to know browser scroll position) 
		You also can artificially fire the events and have the listeners run using fireParentWindowEvent
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		windowListeners = {};

	Ext.define('Intel.lib.mixin.WindowListener', {

		_initWindowEventListener: function(eventName){
			if(!windowListeners) windowListeners = {};
			windowListeners[eventName] = [];
			
			window.parent['on' + eventName] = function(event){ 
				var listeners = windowListeners[eventName];
				for(var i=0, len=listeners.length; i<len; ++i)
					listeners[i](event);
			};
		},
		
		/** eventName is something like: resize, scroll, etc... */
		addWindowEventListener: function(eventName, fn){
			if(!windowListeners || !windowListeners[eventName]) 
				this._initWindowEventListener(eventName);
			windowListeners[eventName].push(fn);
		},
		
		/** eventName is something like: resize, scroll, etc... */
		fireParentWindowEvent: function(eventName){
			var me=this;
			if(!windowListeners || !windowListeners[eventName]) return;
			var listeners = windowListeners[eventName];
			for(var i=0, len=listeners.length; i<len; ++i) listeners[i]();
		}
	});
}());