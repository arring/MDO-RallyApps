/*
 *	A popup that can dynamically change its content easily.
 *	If a width is not provided (they should be), default will be used.
 *	TODO: Quite a bit actually
		-
		-
		-
		-
 */
(function() {
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.IntelPopup', {
		extend: 'Ext.container.Container',
		alias: ['widget.intelpopup'],
		
		constructor: function(config) {
			// Things the user can change
			options = Ext.merge({}, config);
			
			// Things that don't make sense for the user to change
			options.xtype = 'container';
			options.autoEl = 'div';
			options.floating = true;
			// TODO: Move this to content (so far has not worked)
			options.overflowY = 'auto';
			
			// Just in case the user is silly
			// TODO: Find a way to remove this
			if (!options.width) options.width = 800;
			
			// Styling
			options.style = config.style || { backgroundColor: 'white' };
			
			// Layout
			options.items = [];
			options.items.push({
				xtype: 'button',
				text: 'X',
				id: 'intel-popup-close-button',
				listeners: { click: this._close.bind(this) },
				style: { float: 'right' }
			});
			if (config.title) {
				options.items.push({
					xtype: 'container',
					id: 'intel-popup-title',
					padding: '5 0 0 5',
					width: 0.75*options.width,
					html: '<h3>' + config.title + '</h3>'
				});
			}
			options.items.push({
				xtype: 'container',
				id: 'intel-popup-content',
				width: options.width,
				// Like a good scroll bar, stay over there
				padding: '0 15 5 0'
			});

			// Set up listeners
			options.listeners = {
				show: this._recenter,
				added: this._init
			};
			
			this.callParent([options]);
		},
		
		_init: function() {
			this.titleBar = this.down('#intel-popup-title');
			this.content = this.down('#intel-popup-content');
		},
		
		_close: function() {
			this.hide();
		},
		
		_recenter: function() {
			var parent = this.up();
			this.setX(((parent.getWidth() - this.getWidth())/2) >> 0);
			this.setY(((parent.getHeight() - this.getHeight())/2) >> 0);
		},
		
		setTitle: function(title) { this.titleBar.update('<h3>' + title + '</h3>'); },
		addContent: function(content) { this.content.add(content); },
		removeAllContent: function() { this.content.removeAll(); },
		setContent: function(content) {this.removeAllContent(); this.addContent(content);},
		getContentContainer: function() { return this.content; }
	});
}());
