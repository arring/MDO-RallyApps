(function(){
	var Ext = window.Ext4 || window.Ext;
	
	var POLL_INTERVAL_MS = 10;
	
	/*!
	 * CTemplate
	 * Version 1.1
	 * Copyright(c) 2011-2013 Skirtle's Den
	 * License: http://skirtlesden.com/ux/ctemplate
	 
		MY NOTE: how this works. XTemplates use apply() to convert the template to the actual HTML. CTemplate converts XTemplate into a bunch
		of <p> tags and stores the ids of them and then immediately starts polling for them in doPolling. do POlling calls injectComponents
		after the poll interval and if injectComponents does not render all the components, it calls doPolling again.
		injectComponents calls renderComponent for each component.
		overwrite and doInsert call the XTemplate parent functions, which call CTemplate's apply, and then they call injectComponents.
		
		NOTE: everytime apply() is called, the me.ids[] is generated, and when injectComponents is finished, me.ids[] is empty!
	 */
	Ext.define('Skirtle.CTemplate',{
		extend: 'Ext.XTemplate',
		statics: { AUTO_ID: 0 },
		
		copyDepth: 10,		
		cTpl: '<p id="ctemplate-{0}-{1}"></p>',
		isCTemplate: true,

		constructor: function(){
			var me = this;
			me.callParent(arguments);
			me.id = ++me.statics().AUTO_ID;
			me.reset();
		},

		copyValues: function(values, depth){
			/* Takes a recursive copy of the values provided, switching out components for placeholder values. The component ids
			 * are recorded and injectComponents() uses the ids to find the placeholder elements in the DOM and switch in the
			 * components.
			 */
			var me = this,
				id,
				copy = {},
				copyDepth = depth || me.copyDepth;

			if(copyDepth === 1) return values;

			if(Ext.isArray(values)){
				return Ext.Array.map(values, function(value) {
					return me.copyValues(value, copyDepth - 1);
				});
			}

			if(!Ext.isObject(values)) return values;

			// This is the key sleight-of-hand that makes the whole thing work
			if(values.isComponent){
				id = values.getId();
				me.ids.push(id);
				return Ext.String.format(me.cTpl, id, me.id);
			}

			Ext.Object.each(values, function(key, value) {
				// $comp is a special value for a renderTpl that references the current component
				copy[key] = key === '$comp' ? value : me.copyValues(value, copyDepth - 1);
			});

			return copy;
		},
		doInsert: function() { // Override
			//(calls this.apply() to convert ids to templates for XTemplate to put in the DOM
			var ret = this.callParent(arguments);	
			this.injectComponents();// There's no guarantee this will succeed so we still need polling as well
			return ret;
		},
		doPolling: function(interval) {
			var me = this;
			me.pollInterval = interval;
			if(me.pollId) clearTimeout(me.pollId);
			me.pollId = Ext.defer(me.injectComponents, interval, me);
		},
		getPlaceholderEl: function(id) {
			return Ext.get('ctemplate-' + id + '-' + this.id);
		},	
		injectComponents: function() {
			/* Attempts to substitute all placeholder elements with the real components. If a component is successfully injected
			 * or it has been destroyed then it won't be attempted again. This method is repeatedly invoked by a polling
			 * mechanism until no components remain, however relying on the polling is not advised. Instead it is preferable to
			 * call this method directly as soon as the generated HTML is inserted into the DOM.
			 */
			var me = this,
				ids = me.ids,
				index = ids.length - 1,
				id,
				cmp,
				placeholderEl;

			// Iterate backwards because we remove some elements in the loop
			for( ; index >= 0 ; --index){
				id = ids[index];
				cmp = Ext.getCmp(id);
				placeholderEl = me.getPlaceholderEl(id);
				if(me.renderComponent(cmp, placeholderEl) || !cmp){
					// Either we've successfully done the switch or the component has been destroyed
					Ext.Array.splice(ids, index, 1);
					if(placeholderEl) placeholderEl.remove();
				}
			}
			// Some components have not been injected. Polling acts both to do deferred injection and as a form of GC
			if(ids.length) me.doPolling(me.pollInterval); //originally was me.pollInterval * 1.5
		},
		overwrite: function(el){ // Override 
			//(calls this.apply() to convert ids to templates for XTemplate to put in the DOM
			var dom,
				firstChild,
				ret;

			/* In IE setting the innerHTML will destroy the nodes for the previous content. If we try to reuse components it
			 * will fail as their DOM nodes will have been torn apart. We can't defend against external updates to the DOM
			 * but we can guard against the case where all updates come through this template.
			 */
			if(Ext.isIE){
				dom = Ext.getDom(el);
				while(dom.firstChild){
					dom.removeChild(dom.firstChild);
				}
			}
			ret = this.callParent(arguments);		
			this.injectComponents(); // There's no guarantee this will succeed so we still need polling as well
			return ret;
		},
		renderComponent: function(cmp, placeholderEl){
			if(cmp && placeholderEl){
				var parent = placeholderEl.parent();
				
				// Move a component that has been rendered previously
				if(cmp.rendered) cmp.getEl().replace(placeholderEl);
				else cmp.render(parent, placeholderEl);

				// Some components (mostly form fields) reserve space but fail to show up without a repaint in IE6
				if(Ext.isIE6)	parent.repaint();
				return true;
			}
			else return false;
		},
		reset: function() {
			var me = this;	
			me.ids = [];// The ids of injected components that haven't yet been rendered
			if(me.pollId){
				clearTimeout(me.pollId);
				me.pollId = null;
			}
		}
	}, function(ctemplate) {
		var apply = function(){
			var me = this,
				args = Ext.Array.slice(arguments);
			args[0] = me.copyValues(args[0]);
			me.doPolling(POLL_INTERVAL_MS); // As we're returning an HTML string/array we can't actually complete the injection here
			return me.callParent(args);
		};
		// The main override is different depending on whether we're using ExtJS 4.0 or 4.1+
		if(ctemplate.prototype.applyOut) ctemplate.override({ applyOut: apply });// 4.1+
		else {	
			ctemplate.override({ applyTemplate: apply }); // 4.0
			ctemplate.createAlias('apply', 'applyTemplate');
		}
	});

	/*!
	 * Component Column
	 * Version 1.1
	 * Copyright(c) 2011-2013 Skirtle's Den
	 * License: http://skirtlesden.com/ux/component-column
	 */
	Ext.define('Skirtle.grid.column.Component', {
		alias: 'widget.componentcolumn',
		extend: 'Ext.grid.column.Column',
		requires: ['Skirtle.CTemplate'],

		autoWidthComponents: true, // Whether or not to automatically resize the components when the column resizes		
		componentGC: true, // Whether or not to destroy components when they are removed from the DOM
		hasCustomRenderer: true, // Override the superclass - this must always be true or odd things happen, especially in IE
		lastFrameWidth: 12, // The estimated size of the cell frame. This is updated once there is a cell where it can be measured

		/* Defer durations for updating the component width when a column resizes. Required when a component has an animated
		 * resize that causes the scrollbar to appear/disappear. Otherwise the animated component can end up the wrong size.
		 *
		 * For ExtJS 4.0 both delays are required. For 4.1 just having the 10ms delay seems to be sufficient.
		 */
		widthUpdateDelay: [10, 400],

		constructor: function(cfg) {
			var me = this;

			me.callParent(arguments);

			// Array of component ids for both component queries and GC
			me.compIds = [];

			// We need a dataIndex, even if it doesn't correspond to a real field
			me.dataIndex = me.dataIndex || Ext.id(null, 'cc-dataIndex-');
			me.tpl = me.createTemplate(me.tpl);
			me.renderer = me.createRenderer(me.renderer);
			me.registerColumnListeners();
		},
		addRefOwner: function(child) {
			var me = this,
				fn = me.refOwnerFn || (me.refOwnerFn = function() { return me; });
			if(me.extVersion < 40200) child.getBubbleTarget = fn; // Component queries for ancestors use getBubbleTarget in 4.1 ...
			else child.getRefOwner = fn; // ... and getRefOwner in 4.2+
		},
		applyTemplate: function(data, value) {
			if(Ext.isDefined(value)) data[this.dataIndex] = value;
			return this.tpl.apply(data);
		},
		beforeViewRefresh: function() {
			/* In IE setting the innerHTML will destroy the nodes for the previous content. If we try to reuse components it
			 * will fail as their DOM nodes will have been torn apart. To defend against this we must remove the components
			 * from the DOM just before the grid view is refreshed.
			 */
			if (Ext.isIE) {
				var ids = this.compIds,
					index = 0,
					len = ids.length,
					item,
					el,
					parentEl;

				for ( ; index < len ; index++) {
					if ((item = Ext.getCmp(ids[index])) && (el = item.getEl()) && (el = el.dom) && (parentEl = el.parentNode)) {
						parentEl.removeChild(el);
					}
				}
			}
		},
		calculateFrameWidth: function(component) {
			var el = component.getEl(),
				parentDiv = el && el.parent(),
				// By default the TD has no padding but it is quite common to add some via a tdCls
				parentTd = parentDiv && parentDiv.parent();

			if(parentTd){
				// Cache the frame width so that it can be used as a 'best guess' in cases where we don't have the elements
				this.lastFrameWidth = parentDiv.getFrameWidth('lr') + parentTd.getFrameWidth('lr');
				return this.lastFrameWidth;
			}
		},
		createRenderer: function(renderer) {
			var me = this;
			return function(value, p, record) {
				var data = Ext.apply({}, record.data, record.getAssociatedData());
				if(renderer) value = renderer.apply(this, arguments); // Scope must be this, not me
				// Process the value even with no renderer defined as the record may contain a component config
				value = me.processValue(value);
				return me.applyTemplate(data, value);
			};
		},
		createTemplate: function(tpl) {
			return tpl && tpl.isTemplate ? tpl : Ext.create('Skirtle.CTemplate', tpl || ['{', this.dataIndex ,'}']);
		},
		destroyChild: function(child) { child.destroy(); },
		getRefItems: function(deep) {
			var items = this.callParent([deep]),
					ids = this.compIds,
					index = 0,
					len = ids.length,
					item;

			for( ; index < len ; index++){
				item = Ext.getCmp(ids[index]);
				if(item){
					items.push(item);
					if(deep && item.getRefItems) items.push.apply(items, item.getRefItems(true));
				}
			}
			return items;
		},
		onChildAfterRender: function(child){ this.resizeChild(child); },
		onChildBoxReady: function(child){
			// Pass false to avoid triggering deferred resize, the afterrender listener will already cover those cases
			this.resizeChild(child, false);
		},
		onChildDestroy: function(child){ Ext.Array.remove(this.compIds, child.getId()); },
		onChildResize: function(){ this.redoScrollbars(); },
		onColumnResize: function(column){ column.resizeAll(); },
		onColumnShow: function(column){ column.resizeAll(); },
		onColumnVisibilityChange: function(column) {
			// This is called in IE 6/7 as the components can still be seen even when a column is hidden
			var items = column.getRefItems(),
				index = 0,
				length = items.length,
				visible = !column.isHidden();

			// In practice this probably won't help but it shouldn't hurt either
			if(Ext.suspendLayouts) Ext.suspendLayouts();

			for( ; index < length ; ++index){
				items[index].setVisible(visible);
			}
			if(Ext.resumeLayouts) Ext.resumeLayouts(true);
		},
		onDestroy: function() {
				Ext.destroy(this.getRefItems());

				this.callParent();
		},
		onRender: function(){ // Override
			this.registerViewListeners();
			this.callParent(arguments);
		},
		onViewChange: function() {
			// View has changed, may be a full refresh or just a single row
			var me = this,
				tpl = me.tpl;

			// Batch the resizing of child components until after they've all been injected
			me.suspendResizing();

			if (tpl.isCTemplate) {
				// No need to wait for the polling, the sooner we inject the less painful it is
				tpl.injectComponents();
				// If the template picked up other components in the data we can just ignore them, they're not for us
				tpl.reset();
			}
			// A view change could mean scrollbar problems. Note this won't actually do anything till we call resumeResizing
			me.redoScrollbars();
			me.resumeResizing();			
			me.performGC();
		},
		performGC: function() {
			// Component GC, try to stop components leaking
			var compIds = this.compIds,
				index = compIds.length - 1,
				comp,
				el;

			for( ; index >= 0 ; --index){
				// Could just assume that the component id is the el id but that seems risky
				comp = Ext.getCmp(compIds[index]);
				el = comp && comp.getEl();

				if (!el || (this.componentGC && (!el.dom || Ext.getDom(Ext.id(el)) !== el.dom))) {
					// The component is no longer in the DOM
					if(comp && !comp.isDestroyed) comp.destroy();
				}
			}
		},
		processValue: function(value) {
			var me = this,
				compIds = me.compIds,
				id, initialWidth, dom, parent;

			if(Ext.isObject(value) && !value.isComponent && value.xtype) {
				// Do not default to a panel, not only would it be an odd default but it makes future enhancements trickier
				value = Ext.widget(value.xtype, value);
			}

			if(value && value.isComponent){
				id = value.getId();
				// When the view is refreshed the renderer could return a component that's already in the list
				if(!Ext.Array.contains(compIds, id)) compIds.push(id);
				me.addRefOwner(value);
				me.registerListeners(value);
				if(value.rendered){
					/* This is only necessary in IE because it is just another manifestation of the innerHTML problems.
					 * The problem occurs when a record value is changed and the components in that same row are being
					 * reused. The view doesn't go through a full refresh, instead it performs a quick update on just the
					 * one row. Unfortunately this nukes the existing components so we need to remove them first.
					 */
					if(Ext.isIE){
						// TODO: Should this be promoted to CTemplate?
						dom = value.el.dom;
						parent = dom.parentNode;

						if(parent){
							if(me.extVersion === 40101){
								// Workaround for the bugs in Element.syncContent - p tag matches CTemplate.cTpl
								Ext.core.DomHelper.insertBefore(dom, {tag: 'p'});
							}
							// TODO: Removing the element like this could fall foul of Element GC
							parent.removeChild(dom);
						}
					}
				}
				else if (me.autoWidthComponents) {
					/* Set the width to a 'best guess' before the component is rendered to ensure that the component's
					 * layout is using a configured width and not natural width. This avoids problems with 4.1.1 where
					 * subsequent calls to setWidth are ignored because it believes the width is already correct but only
					 * the outermost element is actually sized correctly. We could use an arbitrary width but instead we
					 * make a reasonable guess at what the actual width will be to try to avoid extra resizing.
					 */
					initialWidth = me.getWidth() - me.lastFrameWidth;

					// Impose a minimum width of 4, we really don't want negatives values or NaN slipping through
					initialWidth = initialWidth > 4 ? initialWidth : 4;

					value.setWidth(initialWidth);
				}
				// Part of the same IE 6/7 hack as onColumnVisibilityChange
				if((Ext.isIE6 || Ext.isIE7) && me.isHidden()) value.hide();
			}

			return value;
		},
		redoScrollbars: function() {
			var me = this,
				grid = me.up('tablepanel');

			if(grid){
				// The presence of a resizeQueue signifies that we are currently suspended
				if(me.resizeQueue){
					me.redoScrollbarsRequired = true;
					return;
				}

				// After components are injected the need for a grid scrollbar may need redetermining
				if(me.extVersion < 40100){ // 4.0	
					grid.invalidateScroller();
					grid.determineScrollbars();
				}
				else grid.doLayout(); // 4.1+
			}
		},
		registerColumnListeners: function() {
			var me = this;

			if(me.autoWidthComponents){
				// Need to resize children when the column resizes
				me.on('resize', me.onColumnResize);
				// Need to resize children when the column is shown as they can't be resized correctly while it is hidden
				me.on('show', me.onColumnShow);
			}
			if(Ext.isIE6 || Ext.isIE7){
				me.on({
					hide: me.onColumnVisibilityChange,
					show: me.onColumnVisibilityChange
				});
			}
		},
		registerListeners: function(component) {
			var me = this;

			// Remove the component from the child list when it is destroyed
			component.on('destroy', me.onChildDestroy, me);
			if(me.autoWidthComponents){
				// Need to resize children after render as some components (e.g. comboboxes) get it wrong otherwise
				component.on('afterrender', me.onChildAfterRender, me, {single: true});

				// With 4.1 boxready gives more reliable results than afterrender as it occurs after the initial sizing
				if(me.extVersion >= 40100) component.on('boxready', me.onChildBoxReady, me, {single: true});
			}

			// Need to redo scrollbars when a child resizes
			component.on('resize', me.onChildResize, me);
		},
		registerViewListeners: function() {
				var me = this,
					view = me.up('tablepanel').getView();
				me.mon(view, 'beforerefresh', me.beforeViewRefresh, me);
				me.mon(view, 'refresh', me.onViewChange, me);
				me.mon(view, 'itemupdate', me.onViewChange, me);
				me.mon(view, 'itemadd', me.onViewChange, me);
				me.mon(view, 'itemremove', me.onViewChange, me);
		},
		resizeAll: function() {
				var me = this;
				me.suspendResizing();
				me.resizeQueue = me.getRefItems();
				me.resumeResizing();
		},
		resizeChild: function(component, defer) {
			var me = this,
				frameWidth,
				newWidth,
				oldWidth,
				resizeQueue;

			if(me.resizingSuspended){
				resizeQueue = me.resizeQueue;
				if(!Ext.Array.contains(resizeQueue, component)) resizeQueue.push(component);
				return;
			}
			frameWidth = me.calculateFrameWidth(component);

			// TODO: Should we destroy the component here if it doesn't have a parent element? Already picked up anyway?
			if(Ext.isNumber(frameWidth)){
				newWidth = me.getWidth() - frameWidth;
				oldWidth = component.getWidth();

				// Returns true if a resize actually happened
				if(me.setChildWidth(component, newWidth, oldWidth)){
					// Avoid an infinite resizing loop, deferring will only happen once
					if(defer !== false){
						// Do the sizing again after a delay. This is because child panel collapse animations undo our sizing
						Ext.each(me.widthUpdateDelay, function(delay){
							Ext.defer(me.resizeChild, delay, me, [component, false]);
						});
					}
				}
			}
		},
		resumeResizing: function() {
			var me = this,
				index = 0,
				resizeQueue = me.resizeQueue,
				len = resizeQueue.length;

			if(!--me.resizingSuspended) {
				for ( ; index < len ; ++index){
					me.resizeChild(resizeQueue[index]);
				}
				me.resizeQueue = null;
				if (me.redoScrollbarsRequired) me.redoScrollbars();
			}
		},
		setChildWidth: function(component, newWidth, oldWidth) {
			if(oldWidth === newWidth) return false;
			component.setWidth(newWidth);
			return true;
		},
		suspendResizing: function() {
			var me = this;
			me.resizingSuspended = (me.resizingSuspended || 0) + 1;
			if(!me.resizeQueue) me.resizeQueue = [];
		}
	}, 
	function(cls){
		var proto = cls.prototype,
			version = Ext.getVersion();
		proto.extVersion = (version.getMajor() * 100 + version.getMinor()) * 100 + version.getPatch(); // ExtJS version detection
		// 4.1.1 initially reported its version as 4.1.0
		if(Ext.Element.prototype.syncContent && version.toString() === '4.1.0') proto.extVersion = 40101;
	});
}());
