/*!
 * CTemplate
 * Version 1.1
 * Copyright(c) 2011-2013 Skirtle's Den
 * License: http://skirtlesden.com/ux/ctemplate
 */
Ext.define('Skirtle.CTemplate', {
    extend: 'Ext.XTemplate',

    statics: {
        AUTO_ID: 0
    },

    // May need to be increased if components are included deeper in the data object
    copyDepth: 10,

    // Placeholder element template. Should be changed in tandem with getPlaceholderEl()
    cTpl: '<p id="ctemplate-{0}-{1}"></p>',

    // Flag
    isCTemplate: true,

    constructor: function() {
        var me = this;

        me.callParent(arguments);

        me.id = ++me.statics().AUTO_ID;

        me.reset();
    },

    /* Takes a recursive copy of the values provided, switching out components for placeholder values. The component ids
     * are recorded and injectComponents() uses the ids to find the placeholder elements in the DOM and switch in the
     * components.
     */
    copyValues: function(values, depth) {
        var me = this,
            id,
            copy = {},
            copyDepth = depth || me.copyDepth;

        if (copyDepth === 1) {
            return values;
        }

        if (Ext.isArray(values)) {
            return Ext.Array.map(values, function(value) {
                return me.copyValues(value, copyDepth - 1);
            });
        }

        if (!Ext.isObject(values)) {
            return values;
        }

        // This is the key sleight-of-hand that makes the whole thing work
        if (values.isComponent) {
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

    // Override
    doInsert: function() {
        var ret = this.callParent(arguments);

        // There's no guarantee this will succeed so we still need polling as well
        this.injectComponents();

        return ret;
    },

    /* We have to resort to polling for component injection as we don't have full control over when the generated HTML
     * will be added to the DOM
     */
    doPolling: function(interval) {
        var me = this;

        me.pollInterval = interval;

        if (me.pollId) {
            clearTimeout(me.pollId);
        }

        me.pollId = Ext.defer(me.injectComponents, interval, me);
    },

    getPlaceholderEl: function(id) {
        return Ext.get('ctemplate-' + id + '-' + this.id);
    },

    /* Attempts to substitute all placeholder elements with the real components. If a component is successfully injected
     * or it has been destroyed then it won't be attempted again. This method is repeatedly invoked by a polling
     * mechanism until no components remain, however relying on the polling is not advised. Instead it is preferable to
     * call this method directly as soon as the generated HTML is inserted into the DOM.
     */
    injectComponents: function() {
        var me = this,
            ids = me.ids,
            index = ids.length - 1,
            id,
            cmp,
            placeholderEl;

        // Iterate backwards because we remove some elements in the loop
        for ( ; index >= 0 ; --index) {
            id = ids[index];
            cmp = Ext.getCmp(id);
            placeholderEl = me.getPlaceholderEl(id);

            if (me.renderComponent(cmp, placeholderEl) || !cmp) {
                // Either we've successfully done the switch or the component has been destroyed
                Ext.Array.splice(ids, index, 1);

                if (placeholderEl) {
                    placeholderEl.remove();
                }
            }
        }

        if (ids.length) {
            // Some components have not been injected. Polling acts both to do deferred injection and as a form of GC
            me.doPolling(me.pollInterval * 1.5);
        }
    },

    // Override
    overwrite: function(el) {
        var dom,
            firstChild,
            ret;

        /* In IE setting the innerHTML will destroy the nodes for the previous content. If we try to reuse components it
         * will fail as their DOM nodes will have been torn apart. We can't defend against external updates to the DOM
         * but we can guard against the case where all updates come through this template.
         */
        if (Ext.isIE) {
            dom = Ext.getDom(el);
            while (dom.firstChild) {
                dom.removeChild(dom.firstChild);
            }
        }

        ret = this.callParent(arguments);

        // There's no guarantee this will succeed so we still need polling as well
        this.injectComponents();

        return ret;
    },

    renderComponent: function(cmp, placeholderEl) {
        if (cmp && placeholderEl) {
            var parent = placeholderEl.parent();

            if (cmp.rendered) {
                // Move a component that has been rendered previously
                cmp.getEl().replace(placeholderEl);
            }
            else {
                cmp.render(parent, placeholderEl);
            }

            if (Ext.isIE6) {
                // Some components (mostly form fields) reserve space but fail to show up without a repaint in IE6
                parent.repaint();
            }

            return true;
        }

        return false;
    },

    reset: function() {
        var me = this;

        // The ids of injected components that haven't yet been rendered
        me.ids = [];

        if (me.pollId) {
            clearTimeout(me.pollId);
            me.pollId = null;
        }
    }
}, function(ctemplate) {
    var apply = function() {
        var me = this,
            args = Ext.Array.slice(arguments);

        args[0] = me.copyValues(args[0]);

        // As we're returning an HTML string/array we can't actually complete the injection here
        me.doPolling(10);

        return me.callParent(args);
    };

    // The main override is different depending on whether we're using ExtJS 4.0 or 4.1+
    if (ctemplate.prototype.applyOut) {
        // 4.1+
        ctemplate.override({
            applyOut: apply
        });
    }
    else {
        // 4.0
        ctemplate.override({
            applyTemplate: apply
        });

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

    // Whether or not to automatically resize the components when the column resizes
    autoWidthComponents: true,

    // Whether or not to destroy components when they are removed from the DOM
    componentGC: true,

    // Override the superclass - this must always be true or odd things happen, especially in IE
    hasCustomRenderer: true,

    // The estimated size of the cell frame. This is updated once there is a cell where it can be measured
    lastFrameWidth: 12,

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
            fn = me.refOwnerFn || (me.refOwnerFn = function() {
                return me;
            });

        if (me.extVersion < 40200) {
            // Component queries for ancestors use getBubbleTarget in 4.1 ...
            child.getBubbleTarget = fn;
        }
        else {
            // ... and getRefOwner in 4.2+
            child.getRefOwner = fn;
        }
    },

    applyTemplate: function(data, value) {
        if (Ext.isDefined(value)) {
            data[this.dataIndex] = value;
        }

        return this.tpl.apply(data);
    },

    /* In IE setting the innerHTML will destroy the nodes for the previous content. If we try to reuse components it
     * will fail as their DOM nodes will have been torn apart. To defend against this we must remove the components
     * from the DOM just before the grid view is refreshed.
     */
    beforeViewRefresh: function() {
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

        if (parentTd) {
            // Cache the frame width so that it can be used as a 'best guess' in cases where we don't have the elements
            return this.lastFrameWidth = parentDiv.getFrameWidth('lr') + parentTd.getFrameWidth('lr');
        }
    },

    createRenderer: function(renderer) {
        var me = this;

        return function(value, p, record) {
            var data = Ext.apply({}, record.data, record.getAssociatedData());

            if (renderer) {
                // Scope must be this, not me
                value = renderer.apply(this, arguments);
            }

            // Process the value even with no renderer defined as the record may contain a component config
            value = me.processValue(value);

            return me.applyTemplate(data, value);
        };
    },

    createTemplate: function(tpl) {
        return tpl && tpl.isTemplate ? tpl : Ext.create('Skirtle.CTemplate', tpl || ['{', this.dataIndex ,'}']);
    },

    destroyChild: function(child) {
        child.destroy();
    },

    getRefItems: function(deep) {
        var items = this.callParent([deep]),
            ids = this.compIds,
            index = 0,
            len = ids.length,
            item;

        for ( ; index < len ; index++) {
			item = Ext.getCmp(ids[index]);
            if (item) {
                items.push(item);

                if (deep && item.getRefItems) {
                    items.push.apply(items, item.getRefItems(true));
                }
            }
        }

        return items;
    },

    onChildAfterRender: function(child) {
        this.resizeChild(child);
    },

    onChildBoxReady: function(child) {
        // Pass false to avoid triggering deferred resize, the afterrender listener will already cover those cases
        this.resizeChild(child, false);
    },

    onChildDestroy: function(child) {
        Ext.Array.remove(this.compIds, child.getId());
    },

    onChildResize: function() {
        this.redoScrollbars();
    },

    onColumnResize: function(column) {
        column.resizeAll();
    },

    onColumnShow: function(column) {
        column.resizeAll();
    },

    // This is called in IE 6/7 as the components can still be seen even when a column is hidden
    onColumnVisibilityChange: function(column) {
        var items = column.getRefItems(),
            index = 0,
            length = items.length,
            visible = !column.isHidden();

        // In practice this probably won't help but it shouldn't hurt either
        if(Ext.suspendLayouts) Ext.suspendLayouts();

        for ( ; index < length ; ++index) {
            items[index].setVisible(visible);
        }

       if(Ext.resumeLayouts) Ext.resumeLayouts(true);
    },

    onDestroy: function() {
        Ext.destroy(this.getRefItems());

        this.callParent();
    },

    // Override
    onRender: function() {
        this.registerViewListeners();
        this.callParent(arguments);
    },

    // View has changed, may be a full refresh or just a single row
    onViewChange: function() {
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

    // Component GC, try to stop components leaking
    performGC: function() {
        var compIds = this.compIds,
            index = compIds.length - 1,
            comp,
            el;

        for ( ; index >= 0 ; --index) {
            // Could just assume that the component id is the el id but that seems risky
            comp = Ext.getCmp(compIds[index]);
            el = comp && comp.getEl();

            if (!el || (this.componentGC && (!el.dom || Ext.getDom(Ext.id(el)) !== el.dom))) {
                // The component is no longer in the DOM
                if (comp && !comp.isDestroyed) {
                    comp.destroy();
                }
            }
        }
    },

    processValue: function(value) {
        var me = this,
            compIds = me.compIds,
            id, initialWidth, dom, parent;

        if (Ext.isObject(value) && !value.isComponent && value.xtype) {
            // Do not default to a panel, not only would it be an odd default but it makes future enhancements trickier
            value = Ext.widget(value.xtype, value);
        }

        if (value && value.isComponent) {
            id = value.getId();

            // When the view is refreshed the renderer could return a component that's already in the list
            if (!Ext.Array.contains(compIds, id)) {
                compIds.push(id);
            }

            me.addRefOwner(value);
            me.registerListeners(value);

            if (value.rendered) {
                /* This is only necessary in IE because it is just another manifestation of the innerHTML problems.
                 * The problem occurs when a record value is changed and the components in that same row are being
                 * reused. The view doesn't go through a full refresh, instead it performs a quick update on just the
                 * one row. Unfortunately this nukes the existing components so we need to remove them first.
                 */
                if (Ext.isIE) {
                    // TODO: Should this be promoted to CTemplate?
                    dom = value.el.dom;
                    parent = dom.parentNode;

                    if (parent) {
                        if (me.extVersion === 40101) {
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
            if ((Ext.isIE6 || Ext.isIE7) && me.isHidden()) {
                value.hide();
            }
        }

        return value;
    },

    redoScrollbars: function() {
        var me = this,
            grid = me.up('tablepanel');

        if (grid) {
            // The presence of a resizeQueue signifies that we are currently suspended
            if (me.resizeQueue) {
                me.redoScrollbarsRequired = true;
                return;
            }

            // After components are injected the need for a grid scrollbar may need redetermining
            if (me.extVersion < 40100) {
                // 4.0
                grid.invalidateScroller();
                grid.determineScrollbars();
            }
            else {
                // 4.1+
                grid.doLayout();
            }
        }
    },

    registerColumnListeners: function() {
        var me = this;

        if (me.autoWidthComponents) {
            // Need to resize children when the column resizes
            me.on('resize', me.onColumnResize);

            // Need to resize children when the column is shown as they can't be resized correctly while it is hidden
            me.on('show', me.onColumnShow);
        }

        if (Ext.isIE6 || Ext.isIE7) {
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

        if (me.autoWidthComponents) {
            // Need to resize children after render as some components (e.g. comboboxes) get it wrong otherwise
            component.on('afterrender', me.onChildAfterRender, me, {single: true});

            // With 4.1 boxready gives more reliable results than afterrender as it occurs after the initial sizing
            if (me.extVersion >= 40100) {
                component.on('boxready', me.onChildBoxReady, me, {single: true});
            }
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

        if (me.resizingSuspended) {
            resizeQueue = me.resizeQueue;

            if (!Ext.Array.contains(resizeQueue, component)) {
                resizeQueue.push(component);
            }

            return;
        }

        frameWidth = me.calculateFrameWidth(component);

        // TODO: Should we destroy the component here if it doesn't have a parent element? Already picked up anyway?
        if (Ext.isNumber(frameWidth)) {
            newWidth = me.getWidth() - frameWidth;
            oldWidth = component.getWidth();

            // Returns true if a resize actually happened
            if (me.setChildWidth(component, newWidth, oldWidth)) {
                // Avoid an infinite resizing loop, deferring will only happen once
                if (defer !== false) {
                    // Do the sizing again after a delay. This is because child panel collapse animations undo our sizing
                    Ext.each(me.widthUpdateDelay, function(delay) {
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

        if (!--me.resizingSuspended) {
            for ( ; index < len ; ++index) {
                me.resizeChild(resizeQueue[index]);
            }

            me.resizeQueue = null;

            if (me.redoScrollbarsRequired) {
                me.redoScrollbars();
            }
        }
    },

    setChildWidth: function(component, newWidth, oldWidth) {
        if (oldWidth === newWidth) {
            return false;
        }

        component.setWidth(newWidth);

        return true;
    },

    suspendResizing: function() {
        var me = this;

        me.resizingSuspended = (me.resizingSuspended || 0) + 1;

        if (!me.resizeQueue) {
            me.resizeQueue = [];
        }
    }
}, function(cls) {
    var proto = cls.prototype,
        version = Ext.getVersion();

    // ExtJS version detection
    proto.extVersion = (version.getMajor() * 100 + version.getMinor()) * 100 + version.getPatch();

    // 4.1.1 initially reported its version as 4.1.0
    if (Ext.Element.prototype.syncContent && version.toString() === '4.1.0') {
        proto.extVersion = 40101;
    }
});

/** this app requires the following custom fields for your workspace:
	c_TeamCommits on PortfolioItem/Feature, (type: 32 kB)
	c_Risks on PortfolioItem/Feature, (type: 32 kB)
	c_Dependencies on HierarchicalRequirement, (type: 32 kB)
	
	
	TeamCommits looks like:
	{
		projectID: {
			status: ('Undecided'|'N/A'|'Committed'|'Not Committed'),
			expected: boolean (default false)
		}
	}
	Risks looks like: 
	{
		projectID: {
			riskID:{
				CP:    //checkpoint
				Cont: //contact
				Desc: //description
				Imp: //impact
				Sta: //status
			}
		}
	}
	
	How data is stored in c_Dependencies:
	{ 
		Preds: {
			ID: {
				Desc, //description
				CP, //Checkpoint
				Sta, //Status set by chief engineer
				Preds, {
					TID: {
						PID, //ProjectID of predecessor
						USID, //UserStory Formatted ID
						USName, //UserStory Name
						Sup, //supported
						A	//assigned
					}
				)
			}
		},
		Succs: [
			{
				ID, //DependencyID,
				SUSID, //successor UserStory Formatted ID
				SUSName, //successor UserStory Name
				SPID, //successor project ID
				Desc, //description
				REL, //release date
				REL_S, //release start date
				CP, //Checkpoint
				Sup, //supported
				A //assigned
			}
		]	
	}	
	
	ALSO, this app depends on a specific naming convention for your ARTs and Scrums within them, otherwise the releases wont load correctly
*/

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
	
	layout: 'absolute',
	height:1620,
	width:1320,
		
	/****************************************************** SHOW ERROR MESSAGE ********************************************************/
	_showError: function(text){
		if(this.errMessage) this.remove(this.errMessage);
		this.errMessage = this.add({xtype:'text', text:text});
	},
	/****************************************************** DATA STORE METHODS ********************************************************/

	//___________________________________GENERAL LOADING STUFF___________________________________	
	_loadModels: function(cb){
		var me = this;
		Rally.data.ModelFactory.getModel({ //load project
			type:'Project',
			scope:me,
			success: function(model){ 
				me.Project = model; 
				Rally.data.ModelFactory.getModel({ //load user Story
					type:'HierarchicalRequirement',
					scope:me,
					success: function(model){ 
						me.UserStory = model; 
						cb(); 
					}
				});
			}
		});
	},
	
	_loadProject: function(project, cb){ 
		var me = this;
		me.Project.load(project.ObjectID, {
			fetch: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name', '_ref'],
			context: {
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			callback: function(record, operation){
				if(operation.wasSuccessful()) cb(record);
				else me._showError('failed to retreive project: ' + project.ObjectID);
			}
		});
	},
	
	_loadReleases: function(cb){ 
		var me = this;
		
		// so we have 2 different filters: for a team in a train, a team not in a train (DCD, HVE)
		var filterString = Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.ObjectID',
			value: me.ProjectRecord.get('ObjectID')
		});
		var filterString2, f2;
		if(me.TrainRecord){
			var teamName = me.ProjectRecord.get('Name');
			var trainName = me.TrainRecord.get('Name').split(' ART ')[0];
			var trainNames = teamName.split(trainName)[1].split('-');
			if(!trainNames[0]) trainNames[0] = trainName;
			else trainNames.push(trainName); //accounts for alpha-bravo-charlie stuff
			trainNames.forEach(function(trainName){
				f2 = Ext.create('Rally.data.wsapi.Filter', { 
					property:'Name',
					operator:'contains',
					value: trainName
				});
				if(filterString2) filterString2 = filterString2.or(f2);
				else filterString2 = f2;
			});
			filterString = filterString.and(filterString2);
		} else {
			filterString2 = Ext.create('Rally.data.wsapi.Filter', { 
				property:'ReleaseDate',
				operator:'>=',
				value: new Date().toISOString()
			}).and(Ext.create('Rally.data.wsapi.Filter', { 
				property:'Name',
				operator:'!contains',
				value: ' '
			}));
			filterString = filterString.and(filterString2);
		}
		filterString = filterString.toString();
		
		var store = Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Dummy',
					value:'value'
				}
			],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						me.ReleaseStore = releaseStore;
						cb();
					},
					single:true
				}
			}
		});
		store._hydrateModelAndLoad = function(options){
            var deferred = new Deft.Deferred();

            this.hydrateModel().then({
                success: function(model) {
					this.proxy.encodeFilters = function(){ //inject custom filter here. woot
						return filterString;
					};
                    this.load(options).then({
                        success: Ext.bind(deferred.resolve, deferred),
                        failure: Ext.bind(deferred.reject, deferred)
                    });
                },
                scope: this
            });
		};
		store.load();
	},
	
	_projectInWhichTrain: function(projectRecord, cb){ // returns train the projectRecord is in, otherwise null.
		var me = this;
		if(!projectRecord) cb();
		var split = projectRecord.get('Name').split(' ART ');
		if(split.length>1) cb(projectRecord);
		else { 
			var parent = projectRecord.get('Parent');
			if(!parent) cb();
			else {
				me._loadProject(parent, function(parentRecord){
					me._projectInWhichTrain(parentRecord, cb);
				});
			}
		}
	},
	
	_getCurrentOrFirstRelease: function(){
		var me = this;
		var d = new Date();
		var rs = me.ReleaseStore.getRecords();
		if(!rs.length) return;
		for(var i=0; i<rs.length; ++i){
			if(new Date(rs[i].get('ReleaseDate')) >= d && new Date(rs[i].get('ReleaseStartDate')) <= d) 
				return rs[i];
		}
		return rs[0]; //pick a random one then 
	},
	
	_loadValidProjects: function(cb){
		var me = this;
		var scrums = [];
		function loadChildren(project, _cb){
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Project',
				autoLoad:true,
				remoteSort:false,
				limit:Infinity,
				fetch: ['Name', 'ObjectID', 'Parent'],
				context:{
					workspace: me.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
						property:'Parent.ObjectID',
						value: project.get('ObjectID')
					}
				],
				listeners: {
					load: {
						fn: function(projectStore, projectRecords){
							if(projectRecords.length === 0) {
								scrums.push(project);
								_cb();
							} else {
								var finished = 0;
								var done = function(){ if(++finished === projectRecords.length) _cb(); };
								projectRecords.forEach(function(c){ loadChildren(c, function(){ done(); }); });
							}
						},
						single:true
					}
				}
			});
		}
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Project',
			autoLoad:true,
			remoteSort:false,
			pageSize:1,
			limit:1,
			fetch: ['Name', 'ObjectID'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[{
					property:'Name',
					value: 'All Scrums'
				}
			],
			listeners:{
				load:{
					fn: function(ps, recs){
						loadChildren(recs[0], function(){ 
							me.ValidProjects = scrums;
							me.ProjectNames = _.map(scrums, function(s){ return {Name: s.get('Name')}; });
							console.log('valid scrums loaded:', scrums);
							cb(); 
						});
					},
					single:true
				}
			}
		});
	},
	
	//___________________________________TEAM COMMITS STUFF___________________________________
	_loadTeamCommitsUserStories: function(cb){
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model:'HierarchicalRequirement',
			fetch: ['ObjectID', 'Feature', 'Name', 'PlanEstimate'],
			limit:Infinity,
			autoLoad:true,
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters: [
				{
					property:'Release.Name',
					value:me.ReleaseRecord.get('Name')
				},{
					property:'Feature',
					operator:'!=',
					value:null
				},{
					property:'Project.Name',
					value:me.ProjectRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(storyStore, storyRecords){
						console.log('Stories loaded:', storyRecords);
						me.TeamCommitsStoryStore = storyStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	_loadTeamCommitsFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'Project'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.ReleaseRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(featureStore, featureRecords){
						console.log('features loaded:', featureRecords);
						me.TeamCommitsFeatureStore = featureStore;
						cb();
					},
					single:true
				}
			}
		});
	},
	
	//___________________________________VELOCITY STUFF___________________________________
		
	_loadVelocityIterations: function(cb){
		var me = this;
		var startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseStartDate'));
		var endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseDate'));
        Ext.create("Rally.data.WsapiDataStore", {
            model: "Iteration",
            autoLoad: true,
			limit:Infinity,
            fetch: ["Name", "EndDate", "StartDate", "PlannedVelocity", "Project"],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: me.getContext().getProject()._ref
			},
            filters: [
				{
					property: "EndDate",
					operator: ">=",
					value: startDate
                },{
                    property: "StartDate",
                    operator: "<=",
                    value: endDate  
                },{
				
				}
			],
            remoteSort: false,
            listeners: {
                load: function(store) {
					console.log('VelocityIterations loaded:', store.getRecords());
					me.VelocityIterationStore = store;
                    cb();
                },
				single:true
            }
        });
	},
	
	_loadVelocityUserStories: function(cb){
		var me = this;
		var startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseStartDate'));
		var endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.get('ReleaseDate'));
        Ext.create("Rally.data.WsapiDataStore", {
            model: "HierarchicalRequirement",
            autoLoad: true,
			limit:Infinity,
            fetch: ["Name", "Iteration", "PlanEstimate"],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: me.getContext().getProject()._ref
			},
            filters: [
				{
					property: "Iteration.EndDate",
					operator: ">=",
					value: startDate
                },{
                    property: "Iteration.StartDate",
                    operator: "<=",
                    value: endDate  
                },{
					property: "PlanEstimate",
					operator: "!=",
					value:null
				}
			],
            remoteSort: false,
            listeners: {
                load: function(store) {
					console.log('VelocityUserStoryStore loaded:', store.getRecords());
					me.VelocityUserStoryStore = store;
                    cb();
                },
				single:true
            }
        });
    },
	
	//___________________________________ RISKS STUFF___________________________________
		
	_loadRisksFeatures: function(cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'PortfolioItem/Feature',
			autoLoad:true,
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'FormattedID', 'c_Risks'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Release.Name',
					value: me.ReleaseRecord.get('Name')
				}
			],
			listeners: {
				load: {
					fn: function(featureStore, featureRecords){
						console.log('risks features loaded:', featureRecords);
						me.RisksFeatureStore = featureStore;
						me._parseRisksData();
						cb();
					},
					single:true
				}
			}
		});
	},
			
	_parseRisksData: function(){ 
		var me = this;		
		var projectID = me.ProjectRecord.get('ObjectID');
		
		function getRisks(featureRecord){
			var risks = featureRecord.get('c_Risks');
			try{ risks = JSON.parse(risks) || {}; }
			catch(e) { risks = {}; }
			return risks;
		}
		
		var array = [];
		_.each(me.RisksFeatureStore.getRecords(), function(featureRecord){ //load risks into custom Data Store
			var risks = getRisks(featureRecord);
			if(risks[projectID]){
				for(var riskID in risks[projectID]){
					var risk = risks[projectID][riskID];
					array.push({
						RiskID: riskID,
						FormattedID: featureRecord.get('FormattedID'),
						FeatureName: featureRecord.get('Name'),
						Description: risk.Desc,
						Impact: risk.Imp,
						Status: risk.Sta,
						Contact: risk.Cont,
						Checkpoint: risk.CP,
						Edited: false //not in pending edit mode
					});
				}
			}
		});	
		me.RisksParsedData = array;
	},
	
	//_____________________________________ DEPENDENCIES STUFF ___________________________________	
	
	_loadRandomUserStory: function(ProjectRef, cb){ //get the most recent one!!
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:1,
			pageSize:1,
			fetch: ['Name', 'CreationDate', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: ProjectRef
			},
			sorters: [
				{
					property: 'CreationDate', 
					direction:'DESC'
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						cb(userStoryRecords.pop());
					},
					single:true
				}
			}
		});
	},
	
	_loadUserStoryByFID: function(FormattedID, ProjectRef, cb){ 
		var me = this;
		Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			autoLoad:true,
			limit:1,
			pageSize:1,
			fetch: ['Name', 'Project', 'ObjectID', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: ProjectRef
			},
			filters: [
				{
					property:'FormattedID',
					value:FormattedID
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						cb(userStoryRecords.pop());
					},
					single:true
				}
			}
		});
	},
	
	_loadDependenciesUserStories: function(cb){	
		var me = this;
		var f1 = Ext.create('Rally.data.wsapi.Filter', { //to get successors (could be any random user story)
			property:'Project.Name',
			value: me.ProjectRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'c_Dependencies',
			operator:'!=',
			value:''
		}));
		
		var f2 = Ext.create('Rally.data.wsapi.Filter', { //to get release user stories
			property:'Release.Name',
			value: me.ReleaseRecord.get('Name')
		}).and(Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.Name',
			value: me.ProjectRecord.get('Name')
		}));
		
		var filterString = f1.or(f2).toString();
		
		var store = Ext.create('Rally.data.wsapi.Store',{
			model: 'HierarchicalRequirement',
			limit:Infinity,
			remoteSort:false,
			fetch: ['Name', 'ObjectID', 'Release', 'Project', 'FormattedID', 'Predecessors', 'Successors', 'c_Dependencies'],
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Dummy',
					value:'value'
				}
			],
			listeners: {
				load: {
					fn: function(userStoryStore, userStoryRecords){
						console.log('dependencies release user stories loaded:', userStoryRecords);
						me.DependenciesUserStoryStore = userStoryStore;
						me._buildDependenciesData();
						cb();
					},
					single:true
				}
			}
		});
		store._hydrateModelAndLoad = function(options){
            var deferred = new Deft.Deferred();

            this.hydrateModel().then({
                success: function(model) {
					this.proxy.encodeFilters = function(){ //inject custom filter here. woot
						return filterString;
					};
                    this.load(options).then({
                        success: Ext.bind(deferred.resolve, deferred),
                        failure: Ext.bind(deferred.reject, deferred)
                    });
                },
                scope: this
            });
		};
		store.load();
	},
	
	_getDependencies: function(userStoryRecord){
		var me = this;
		var dependencies, dependencyString = userStoryRecord.get('c_Dependencies');
		if(dependencyString === '') dependencies = { Preds:{}, Succs:[] };
		else {
			try{ dependencies = JSON.parse(dependencyString); }
			catch(e) { dependencies = { Preds:{}, Succs:[] }; }
		}		
		return dependencies;
	},
	
	_buildDependenciesData: function(){	
		var me = this;
		
		var startDate =	new Date(me.ReleaseRecord.get('ReleaseStartDate'));
		var endDate =	new Date(me.ReleaseRecord.get('ReleaseDate'));
		
		me.DependenciesReleaseUserStories = _.filter(me.DependenciesUserStoryStore.getRecords(), function(usr){
			return usr.get('Release') && usr.get('Release').Name === me.ReleaseRecord.get('Name');
		});
				
		var predDepsList = [], succDepsList = [];
		_.each(me.DependenciesUserStoryStore.getRecords(), function(userStoryRecord){ //load risks into custom Data Store
			var deps = me._getDependencies(userStoryRecord);
			var preds = deps.Preds;
			var succs = deps.Succs;
			if(_.find(me.DependenciesReleaseUserStories, function(goodUS){ return goodUS.get('ObjectID')===userStoryRecord.get('ObjectID');})){
				for(var predDepID in preds){
					var predDep = preds[predDepID];
					predDepsList.push({
						DependencyID: predDepID,
						FormattedID: userStoryRecord.get('FormattedID'),
						UserStoryName: userStoryRecord.get('Name'),
						Description: predDep.Desc,
						Checkpoint: predDep.CP,
						Status: predDep.Sta,
						Predecessors: predDep.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
						Edited: false //not in pending edit mode
					});
				}
			}
			for(var i=0; i<succs.length;++i){
				var succDep = succs[i];
				if(new Date(succDep.REL) >= startDate && new Date(succDep.REL_S) <= endDate){
					var FormattedID, UserStoryName;
					if(succDep.A){ //if this was just placed on a random user story, or is assigned to this user story!
						FormattedID = userStoryRecord.get('FormattedID');
						UserStoryName = userStoryRecord.get('Name');
					} 
					else FormattedID = UserStoryName = '';
						
					succDepsList.push({
						DependencyID: succDep.ID,
						SuccUserStoryName: succDep.SUSName,
						SuccFormattedID: succDep.SUSID,
						SuccProjectID: succDep.SPID,
						ReleaseDate: succDep.REL,
						ReleaseStartDate: succDep.REL_S,
						Description: succDep.Desc,
						Checkpoint: succDep.CP,
						Supported: succDep.Sup,
						Assigned: succDep.A,
						FormattedID: FormattedID,
						UserStoryName: UserStoryName,
						_realFormattedID: userStoryRecord.get('FormattedID'),
						_realUserStoryName: userStoryRecord.get('Name'),
						Edited: false //not in pending edit mode
					});
				}
			}
		});	
		me.DependenciesParsedData = {Predecessors:predDepsList, Successors:succDepsList};
	},
	
	/*************************************************** DEFINE MODELS ******************************************************/
	_defineModels: function(){
			
		Ext.define('IntelVelocity', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'Name', type: 'string'},
				{name: 'PlannedVelocity', type: 'string'},
				{name: 'RealVelocity', type:'string'}
			]
		});
		
		Ext.define('IntelTeamCommits', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'Name', type: 'string'},
				{name: 'ObjectID', type: 'string'},
				{name: 'FormattedID', type:'string'},
				{name: 'Commitment', type: 'string'},
				{name: 'Objective', type:'string'}
			]
		});
		
		Ext.define('IntelRisk', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'RiskID', type:'string'},
				{name: 'FormattedID',  type: 'string'},
				{name: 'FeatureName', type:'string'},
				{name: 'Description', type: 'string'},
				{name: 'Impact', type: 'string'},			
				{name: 'Status', type: 'string'},
				{name: 'Contact', type: 'string'},
				{name: 'Checkpoint', type: 'string'},
				{name: 'Edited', type: 'boolean'}
			]
		});
		
		Ext.define('IntelDepTeam', {
			extend: 'Ext.data.Model',
			fields: [
				{name: 'TID',  type: 'string'},  //teamDep ID
				{name: 'PID',  type: 'string'},  //pred team id
				{name: 'Sup', type: 'string'}, 
				{name: 'USID', type: 'string'}, //pred formatted id
				{name: 'USName', type: 'string'},
				{name: 'A', type: 'boolean'} //yes/no
			]
		});
		
		Ext.define('IntelPredDep', { //predecessor dependencies
			extend: 'Ext.data.Model',
			fields: [
				{name: 'DependencyID', type:'string'},
				{name: 'FormattedID',  type: 'string'}, 
				{name: 'UserStoryName',  type: 'string'},
				{name: 'Description', type: 'string'},
				{name: 'Checkpoint', type: 'string'},
				{name: 'Status', type:'string'}, //only set by chief engineers. not viewable in this app
				{name: 'Predecessors', type: 'auto'}, //TID: Pred: ProjectID, supported, UserStoryID, Assigned
				{name: 'Edited', type: 'boolean'}
			]
		});		
			
		Ext.define('IntelSuccDep', { //predecessor dependency
			extend: 'Ext.data.Model',
			fields: [
				{name: 'DependencyID', type:'string'}, //same id as the pred id that references it
				{name: 'SuccUserStoryName', type: 'string' },
				{name: 'SuccFormattedID',  type: 'string'}, 
				{name: 'SuccProjectID', type: 'string'}, //of predecessor team
				{name: 'UserStoryName', type: 'string'}, //can be null!!!!!!!!!!!!
				{name: 'FormattedID',  type: 'string'},  //CAN BE NULL!!!!!!!!!!!!
				{name: 'ReleaseStartDate',  type: 'string'}, 
				{name: 'ReleaseDate',  type: 'string'}, 
				{name: '_realUserStoryName', type: 'string'}, 
				{name: '_realFormattedID',  type: 'string'},  
				{name: 'Description', type: 'string'}, 
				{name: 'Checkpoint', type: 'string'},
				{name: 'Supported', type: 'string'}, //Yes, No
				{name: 'Assigned', type: 'boolean'}, //yes/no
				{name: 'Edited', type: 'boolean'}
			]
		});	
	},
	
	/******************************************************* STATE VARIABLES / Reloading ***********************************/

	_isEditing: false,
	
	_reloadVelocityStores: function(){
		var me = this;
		if(me.VelocityIterationStore && !me._isEditing) {
			me.VelocityIterationStore.load({ 
				callback: function(records, operation){
					if(me.VelocityUserStoryStore && !me._isEditing) {
						me.VelocityUserStoryStore.load({ 
							callback: function(records, operation){
								if(me.CustomVelocityStore && !me._isEditing)
									me.CustomVelocityStore.load();
							}
						});
					}
				}
			});
		}
	},
	
	_reloadTeamCommitsStores: function(){
		var me = this;
		if(me.TeamCommitsFeatureStore && !me._isEditing) {
			me.TeamCommitsFeatureStore.load({ 
				callback: function(records, operation){
					if(me.CustomTeamCommitsStore && !me._isEditing)
						me.CustomTeamCommitsStore.load();
				}
			});
		}
	},
	
	_reloadRisksStores: function(){
		var me = this;						
		if(me.RisksFeatureStore && !me._isEditing) {
			me.RisksFeatureStore.load({ 
				callback: function(records, operation){
					me._parseRisksData();
					if(me.CustomRisksStore && !me._isEditing)					
						me.CustomRisksStore.load();
				}
			});
		}
	},
	
	_reloadDependenciesStores: function(){
		var me = this;
		if(me.DependenciesUserStoryStore && !me._isEditing) {
			me.DependenciesUserStoryStore.load({ 
				callback: function(records, operation){
					me._buildDependenciesData(); //reparse the data
					if(me.CustomPredDepStore && !me._isEditing)
						me.CustomPredDepStore.load();
					if(me.CustomSuccDepStore && !me._isEditing)
						me.CustomSuccDepStore.load();
				}
			});
		}
	},
	
	/******************************************************* LAUNCH ********************************************************/
    _reloadEverything:function(){
		var me = this;
		me.removeAll();
		
		me._loadDependenciesStores = true;
		me._isEditing = false;
		
		//load the release picker
		me._loadReleasePicker();
		
		//load Team Commits Grid
		me._loadTeamCommitsUserStories(function(){ 
			me._loadTeamCommitsFeatures(function(){							
				me._loadTeamCommitsGrid();
			});
		});
							
		//load velocity grid
		me._loadVelocityUserStories(function(){ 
			me._loadVelocityIterations(function(){
				me._loadVelocityGrid(); 
			});
		});
		
		//load risks grid
		me._loadRisksFeatures(function(){ 
			me._loadRisksGrid();
		});
		
		//load dependencies stuff
		me._loadDependenciesUserStories(function(){ 
			me._loadDependenciesGrids();
		});
	},
	
	launch: function(){
		var me = this;
		me._showError('Loading Data...');
		me._defineModels();
		setInterval(function(){ me._reloadVelocityStores();}, 12000); 
		setInterval(function(){ me._reloadTeamCommitsStores();}, 12000); 
		setInterval(function(){ me._reloadRisksStores();}, 12000); 
		setInterval(function(){ me._reloadDependenciesStores();}, 12000); 
		me._loadModels(function(){
			me._loadValidProjects(function(){
				var scopeProject = me.getContext().getProject();
				me._loadProject(scopeProject, function(scopeProjectRecord){
					me.ProjectRecord = _.find(me.ValidProjects, function(validProject){
						return validProject.data.ObjectID === scopeProjectRecord.data.ObjectID;
					});
					if(me.ProjectRecord){
						me._projectInWhichTrain(me.ProjectRecord, function(trainRecord){
							me.TrainRecord = trainRecord; 
							console.log('train loaded:', trainRecord);
							me._loadReleases(function(){
								var currentRelease = me._getCurrentOrFirstRelease();
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									console.log('release loaded', currentRelease);
									me._reloadEverything();
								} else {
									me.removeAll();
									me._showError('This team has no releases');
								}
							});
						});
						
					} else{
						me.removeAll();
						me._showError('Please scope to a valid team for release planning');
					}
				});
			});
		});
	},
	
	/************************************************** DATE FUNCTIONS ***************************************************/
		
	_getWorkweek: function(date){ //calculates intel workweek, returns integer
		var me = this, oneDay = 1000 * 60 * 60 * 24,
			yearStart = new Date(date.getFullYear(), 0, 1),
			dayIndex = yearStart.getDay(),
			ww01Start = yearStart - dayIndex*oneDay,
			timeDiff = date - ww01Start,
			dayDiff = timeDiff / oneDay,
			ww = Math.floor(dayDiff/7) + 1,
			leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay(),
			weekCount = ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52; //weeks in this year
		return weekCount < ww ? 1 : ww;
	},
	
	_getWeekCount: function(date){ //returns the number of intel workweeks in the year the date is in
		var leap = (date.getFullYear() % 4 === 0),
			day = new Date(date.getFullYear(), 0, 1).getDay();
		return ((leap && day >= 5) || (!leap && day === 6 )) ? 53 : 52;
	},
	
	_getWorkweeks: function(){ //gets list of workweeks in the release
		var me = this, i,
			start = me.ReleaseRecord.get('ReleaseStartDate'),
			end = me.ReleaseRecord.get('ReleaseDate'),
			sd_week = me._getWorkweek(start),
			ed_week = me._getWorkweek(end),
			week_count = me._getWeekCount(start);

		var weeks = [];
		if(ed_week < sd_week){
			for(i=sd_week; i<=week_count; ++i) weeks.push({'Week': 'ww' + i});
			for(i = 1; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
		}
		else for(i = sd_week; i<=ed_week;++i) weeks.push({'Week': 'ww' + i});
		return weeks;
	},
	
	/******************************************************* RENDER ********************************************************/
	
	_loadReleasePicker: function(){
		var me = this;
		me.ReleasePicker = me.add({
			xtype:'combobox',
			x:0, y:0,
			store: Ext.create('Ext.data.Store', {
				fields: ['Name'],
				data: _.map(me.ReleaseStore.getRecords(), function(r){ return {Name: r.get('Name') }; })
			}),
			displayField: 'Name',
			fieldLabel: 'Release:',
			editable:false,
			value:me.ReleaseRecord.get('Name'),
			listeners: {
				select: function(combo, records){
					if(me.ReleaseRecord.get('Name') === records[0].get('Name')) return;
					me.ReleaseRecord = me.ReleaseStore.findRecord('Name', records[0].get('Name'));						
					setTimeout(function(){me._reloadEverything();}, 0);
				}	
			}
		});
	},
	
	_loadTeamCommitsGrid: function(){
		var me = this;
		
		function getTeamCommit(featureRecord){	
			var tcs = featureRecord.get('c_TeamCommits');
			var projectID = me.ProjectRecord.get('ObjectID');
			var this_tc;
			try{ this_tc = JSON.parse(tcs)[projectID] || {}; } 
			catch(e){ this_tc = {}; }
			return this_tc;
		}
		
		function setTeamCommit(featureRecord, tc, cb){
			var tcs = featureRecord.get('c_TeamCommits');
			var projectID = me.ProjectRecord.get('ObjectID');
			try{ tcs = JSON.parse(tcs) || {}; }
			catch(e){ tcs = {}; }
			if(!tcs[projectID]) tcs[projectID] = {};
			tcs[projectID].Commitment = tc.Commitment;
			tcs[projectID].Objective = tc.Objective;		
			var str = JSON.stringify(tcs, null, '\t');
			if(str.length >= 32768){
				alert('ERROR: TeamCommits field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			featureRecord.set('c_TeamCommits', str);
			featureRecord.save({ callback:cb});
		}
		
		me.TeamCommitsCountHash = {};
		function getStoryCount(FID){	
			if(me.TeamCommitsCountHash[FID]) 
				return me.TeamCommitsCountHash[FID];
			var count = 0;
			var uss = me.TeamCommitsStoryStore.getRecords();
			uss.forEach(function(us){ if(us.get('Feature') && us.get('Feature').ObjectID == FID) ++count; });
			me.TeamCommitsCountHash[FID] = count;
			return count;
		}
		
		me.TeamCommitsEstimateHash = {};
		function getStoriesEstimate(FID){	
			if(me.TeamCommitsEstimateHash[FID]) 
				return me.TeamCommitsEstimateHash[FID];
			var estimate = 0;
			var uss = me.TeamCommitsStoryStore.getRecords();
			uss.forEach(function(us){ if(us.get('Feature') && us.get('Feature').ObjectID == FID) 
				estimate += (us.get('PlanEstimate') || 0); 
			});
			me.TeamCommitsEstimateHash[FID] = estimate;
			return estimate;
		}
		
		var customTeamCommitsRecords = _.map(me.TeamCommitsFeatureStore.getRecords(), function(featureRecord){
			var tc = getTeamCommit(featureRecord);
			return {
				Commitment: tc.Commitment || 'Undecided',
				Objective: tc.Objective || '',
				Name: featureRecord.get('Name'),
				FormattedID: featureRecord.get('FormattedID'),
				ObjectID: featureRecord.get('ObjectID')
			};
		});		

		me.CustomTeamCommitsStore = Ext.create('Ext.data.Store', {
			data: customTeamCommitsRecords,
			model:'IntelTeamCommits',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'TeamCommitsProxy' + Math.random()
			},
			listeners:{
				load: function(customTeamCommitsStore, currentTeamCommitsRecords){
					console.log('syncing teamCommits with features', currentTeamCommitsRecords, me.TeamCommitsFeatureStore.getRecords());
					currentTeamCommitsRecords.forEach(function(teamCommitsRecord){
						var featureRecord = me.TeamCommitsFeatureStore.findRecord('ObjectID', teamCommitsRecord.get('ObjectID'));
						if(featureRecord) {
							var newVal = getTeamCommit(featureRecord);
							teamCommitsRecord.set('Commitment', newVal.Commitment || 'Undecided');
							teamCommitsRecord.set('Objective', newVal.Objective || '');
						}
					});
				}
			}
		});
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				width:80,
				editor:false,
				sortable:true,
				resizable:false,
				renderer:function(FID, meta, teamCommitsRecord){
					var feature = me.TeamCommitsFeatureStore.findRecord('FormattedID', FID);
					if(feature.get('Project')) {
						return '<a href="https://rally1.rallydev.com/#/' + feature.get('Project').ObjectID + 'd/detail/portfolioitem/feature/' + 
								feature.get('ObjectID') + '">' + FID + '</a>';
					}
					else return FID;
				}
			},{
				text:'Feature', 
				dataIndex:'Name',
				width:220,
				editor:false,
				resizable:false
			},{
				text:'Stories', 
				dataIndex:'ObjectID',
				sortable:true, 
				editor:false,
				resizable:false,
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					var field = this.getSortParam();
					ds.sort({
						sorterFn: function(f1, f2){ //sort by stories for this team in each feature
							var diff = getStoryCount(f1.get('ObjectID')) - getStoryCount(f2.get('ObjectID'));
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:80,
				renderer:function(oid){
					return getStoryCount(oid);
				}
			},{
				text:'Plan Estimate', 
				dataIndex:'ObjectID',
				sortable:true, 
				editor:false,
				resizable:false,
				doSort: function(direction){
					var ds = this.up('grid').getStore();
					var field = this.getSortParam();
					ds.sort({
						sorterFn: function(f1, f2){ //sort by stories for this team in each feature
							var diff = getStoriesEstimate(f1.get('ObjectID')) - getStoriesEstimate(f2.get('ObjectID'));
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				width:80,
				renderer:function(oid){
					return getStoriesEstimate(oid);
				}
			},{
				dataIndex:'Commitment',
				text:'Status',	
				width:130,
				tdCls: 'intel-editor-cell',	
				sortable:true, 
				resizable:false,
				editor:{
					xtype:'combobox',
					width:160,
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{'Status':'Undecided'},
							{'Status':'N/A'},
							{'Status':'Committed'},
							{'Status':'Not Committed'}
						]
					}),
					editable: false,
					displayField: 'Status',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				}
			},{
				text:'Objective', 
				dataIndex:'Objective',
				width:180,
				editor:'textfield',
				resizable:false,
				sortable:true,
				renderer: function(val){
					return val || '-';
				}
			}
		];
		
		me.TeamCommitsGrid = me.add({
			xtype: 'rallygrid',
            title: "Team Commits",
			width: 790,
			height:300,
			x:0, y:50,
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(customTeamCommitsRecords, index, rowParams, store){
					var val = customTeamCommitsRecords.get('Commitment') || 'Undecided';					
					if(val == 'N/A') return 'grey-row';
					if(val == 'Committed') return 'green-row';
					if(val == 'Not Committed') return 'red-row';
				}
			},
			listeners: {
				beforeedit: function(){
					me._isEditing = true;				
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){
					var grid = e.grid,
						tcRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;	
					me._isEditing = false;
					if(value == originalValue) return;
					
					var tc = {Commitment: tcRecord.get('Commitment'), Objective: tcRecord.get('Objective') };
					
					me._isEditing = true;
					me.TeamCommitsGrid.setLoading(true);
					me.TeamCommitsFeatureStore.load({
						callback:function(records, operation){
							var oid = tcRecord.get('ObjectID');
							var realFeature = me.TeamCommitsFeatureStore.findRecord('ObjectID', oid, 0, false, true, true);
							if(!realFeature) console.log('ERROR: realFeature not found, ObjectID: ' + oid);
							else setTeamCommit(realFeature, tc, function(){						
								me.TeamCommitsFeatureStore.load({
									callback: function(records, operation){
										me._isEditing = false;
										me.TeamCommitsGrid.setLoading(false);
									}
								});
							});
						}
					});
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomTeamCommitsStore
		});	
	},
		
	_loadVelocityGrid: function() {
		var me = this;	
		var iterationGroups = _.groupBy(me.VelocityUserStoryStore.getRecords(), function(us) {
            return us.get("Iteration").Name;
        });
        
        var iterationGroupTotals = _.sortBy(_.map(me.VelocityIterationStore.getRecords(), function(iteration) {
			var iName = iteration.get('Name');
            return {    
                Name:iName, 
                PlannedVelocity: iteration.get('PlannedVelocity') || 0,
                RealVelocity:_.reduce((iterationGroups[iName] || []), function(sum, us) {
                    return sum + us.get("PlanEstimate");
                }, 0)
            };
        }), 'Name');

        me.CustomVelocityStore = Ext.create('Ext.data.Store', {
			data: iterationGroupTotals,
			model:'IntelVelocity',
			autoSync:true,
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'VelocityProxy' + Math.random()
			},
			listeners:{
				load: function(customVelocityStore, velocityRecords){
					console.log('syncing velocity with current iterations', velocityRecords, me.VelocityIterationStore.getRecords());
					velocityRecords.forEach(function(velocityRecord){
						var iterationName = velocityRecord.get('Name');
						var iteration = me.VelocityIterationStore.findRecord('Name', iterationName, 0, false, true, true);
						var newVal = iteration.get('PlannedVelocity') || 0;
						if(newVal != velocityRecord.get('PlannedVelocity')){
							velocityRecord.set('PlannedVelocity', iteration.get('PlannedVelocity') || 0);
							console.log('velocity record update', velocityRecord);
						}
					});
				}
			}
		});
				
        var columnCfgs = [
			{	
				text: 'Iteration',
				dataIndex: 'Name', 
				width:240,
				editor:false,
				resizable:false,
				sortable:true,
				renderer:function(name, meta, velocityRecord){
					var iteration = me.VelocityIterationStore.findRecord('Name', name);
					if(iteration.get('Project')) {
						var pid = iteration.get('Project')._ref.split('/project/')[1];
						return '<a href="https://rally1.rallydev.com/#/' + pid + 'd/detail/iteration/' + 
								iteration.get('ObjectID') + '">' + name + '</a>';
					}
					else return name;
				}
			},{
				text: 'Target',
				dataIndex: 'PlannedVelocity',
				width:100,
				tdCls: 'intel-editor-cell',
				xtype:'numbercolumn',
				editor:'textfield',
				resizable:false,
				sortable:true
			},{
				text: 'Actual',
				dataIndex: 'RealVelocity',
				xtype:'numbercolumn',
				width:100,
				editor:false,
				resizable:false,
				sortable:true
			}
		];
        me.VelocityGrid = me.add({
            xtype: 'rallygrid',
            title: "Velocity",
			scroll:'vertical',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:300,
			x:850, y:50,
            showPagingToolbar: false,
			showRowActionsColumn:false,
            viewConfig: {
                stripeRows: true,
				preserveScrollOnRefresh:true
            },
			listeners: {
				beforeedit: function(editor, e){
					me._isEditing = true;
					return true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){
					var grid = e.grid,
						velocityRecord = e.record,
						value = e.value,
						originalValue = e.originalValue;
					
					if(!value || (value === originalValue)) { me._isEditing = false; return; }
					value = value*1 || 0; //value*1 || null to remove the 0's from teams
					var iterationName = velocityRecord.get('Name');
					var iteration = me.VelocityIterationStore.findRecord('Name', iterationName, 0, false, true, true);
					iteration.set('PlannedVelocity', value);
					iteration.save({ callback: function(){ me._isEditing = false; } });
				}
			},
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			enableEditing:false,
			context: this.getContext(),
            columnCfgs: columnCfgs,
            store: me.CustomVelocityStore
        });
    },

	_loadRisksGrid: function(){
		var me = this;	
		var projectID = me.ProjectRecord.get('ObjectID');
		var workweeks = me._getWorkweeks();

		/******************************** RISK PARSING/MANIPULATION FUNCTIONS ***************************/
		
		function removeRiskFromList(riskID, riskList){ // removes and returns risk with riskID from the riskList (NOT list of records)
			for(var i = 0; i<riskList.length; ++i){
				if(riskList[i].RiskID == riskID) {
					return riskList.splice(i, 1)[0];
				}
			}
		}
		
		function getRisks(featureRecord){
			var risks = featureRecord.get('c_Risks');
			try{ risks = JSON.parse(risks) || {}; }
			catch(e) { risks = {}; }
			return risks;
		}
		
		function removeRisk(featureRecord, riskData, cb){ 
			var risks = getRisks(featureRecord);
			if(risks[projectID]){
				delete risks[projectID][riskData.RiskID];
				for(var i=0;i<me.RisksParsedData.length; ++i){
					var rpd = me.RisksParsedData[i];
					if(rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID){
						me.RisksParsedData.splice(i, 1); break; }
				}
				var str = JSON.stringify(risks, null, '\t');
				if(str.length >= 32768){
					alert('ERROR: Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
					if(cb) cb();
				}
				featureRecord.set('c_Risks', str);
				featureRecord.save({
					callback:function(){
						console.log('removed risk from feature:', featureRecord, riskData, risks);
						cb();
					}
				});
			}
			else cb();
		}
		
		function addRisk(featureRecord, riskData, cb){
			var risks = getRisks(featureRecord);
			if(!risks[projectID])
				risks[projectID] = {};
			var copy = {
				CP: riskData.Checkpoint,
				Cont: riskData.Contact,
				Desc: riskData.Description,
				Imp: riskData.Impact,
				Sta: riskData.Status
			};
			risks[projectID][riskData.RiskID] = copy;
			var parseDataAdded = false;
			for(var i=0;i<me.RisksParsedData.length; ++i){
				var rpd = me.RisksParsedData[i];
				if(rpd.RiskID === riskData.RiskID && rpd.FormattedID === riskData.FormattedID){
					me.RisksParsedData[i] = riskData;
					parseDataAdded = true; break;
				}
			}
			if(!parseDataAdded) me.RisksParsedData.push(riskData);
			var str = JSON.stringify(risks, null, '\t');
			if(str.length >= 32768){
				alert('ERROR: Risks field for ' + featureRecord.get('FormattedID') + ' ran out of space! Cannot save');
				if(cb) cb();
			}
			featureRecord.set('c_Risks', str);
			featureRecord.save({
				callback:function(){
					console.log('added risk to feature:', featureRecord, riskData, risks);
					cb();
				}
			});
		}
	
		function getDirtyType(localRiskRecord, realRiskData){
			var riskData = localRiskRecord.data;
			if(!realRiskData)	return riskData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else				return riskData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		}
		
		/*************************************************************************************************************/
			
		me.CustomRisksStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.RisksParsedData),
			autoSync:true,
			model:'IntelRisk',
			limit:Infinity,
			proxy: {
				type:'sessionstorage',
				id:'RiskProxy' + Math.random()
			},
			listeners:{
				load: function(customRisksStore, currentRisksRecords){
					var realRisksDatas = me.RisksParsedData.slice(0); //'real' risks list
					console.log('syncing risks with current features', currentRisksRecords, realRisksDatas);
					for(var i = 0;i<currentRisksRecords.length;++i){
						var currentRisksRecord =  currentRisksRecords[i];
						var realRiskData = removeRiskFromList(currentRisksRecord.get('RiskID'), realRisksDatas);
						
						var dirtyType = getDirtyType(currentRisksRecord, realRiskData);
						if(dirtyType === 'New' || dirtyType === 'Edited') continue; //we don't want to remove any pending changes on a record							
						else if(dirtyType == 'Deleted') // the currentRisksRecord was deleted by someone else, and we arent editing it
							customRisksStore.remove(currentRisksRecord);
						else { //we are not editing it and it still exists, so update current copy
							for(var key in realRiskData)
								currentRisksRecord.set(key, realRiskData[key]);
						}
					}
					realRisksDatas.forEach(function(realRiskData){ //add all the new risks that other people have added since first load
						console.log('adding real risk', realRiskData);
						customRisksStore.add(Ext.create('IntelRisk', Ext.clone(realRiskData)));
					});	
				}
			}
		});
		
		var columnCfgs = [
			{
				text:'F#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',	
				width:80,
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['FormattedID'],
						data: _.map(me.RisksFeatureStore.getRecords(), function(fr){
							return {'FormattedID': fr.get('FormattedID')};
						})
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) === 0;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},			
				resizable:false,
				sortable:true
			},{
				text:'Feature', 
				dataIndex:'FeatureName',
				tdCls: 'intel-editor-cell',	
				width:240,
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.RisksFeatureStore.getRecords(), function(fr){
							return {'Name': fr.get('Name') };
						})
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) === 0;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				resizable:false,
				sortable:true		
			},{
				text:'Risk Description', 
				dataIndex:'Description',
				tdCls: 'intel-editor-cell',	
				width:195,
				editor: 'textfield',
				resizable:false,
				sortable:true,
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'Impact', 
				dataIndex:'Impact',
				tdCls: 'intel-editor-cell',	
				width:200,
				resizable:false,
				sortable:true,
				editor: 'textfield',
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'Status',	
				dataIndex:'Status',
				tdCls: 'intel-editor-cell',	
				width:100,				
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Status'],
						data:[
							{'Status':'Undefined'},
							{'Status':'Resolved'},
							{'Status':'Owned'},
							{'Status':'Accepted'},
							{'Status':'Mitigated'}
						]
					}),
					editable: false,
					displayField:'Status',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				resizable:false,
				sortable:true,
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'Contact', 
				dataIndex:'Contact',
				tdCls: 'intel-editor-cell',	
				width:160,
				editor: 'textfield',
				sortable:true,
				resizable:false,
				renderer:function(val, meta){
					return val || '-';
				}			
			},{
				text:'Checkpoint',	
				dataIndex:'Checkpoint',
				tdCls: 'intel-editor-cell',	
				width:80,
				resizable:false,				
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Week'],
						data: workweeks
					}),
					editable: false,
					displayField: 'Week',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				sortable:true,
				renderer:function(val, meta){
					return val || '-';
				}		
			},{
				text:'',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = getDirtyType(riskRecord, realRiskData);
					if(dirtyType !== 'Edited') return;
					else return {
						xtype:'button',
						text:'Undo',
						width:70,
						handler: function(){
							var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
							for(var key in realRiskData)
								riskRecord.set(key, realRiskData[key]);
						}
					};
				}
			},{
				text:'',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					var realRiskData = removeRiskFromList(riskRecord.get('RiskID'), me.RisksParsedData.slice(0));
					var dirtyType = getDirtyType(riskRecord, realRiskData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return;
					return {
						xtype:'button',
						text:dirtyType,
						width:70,
						handler: function(){
							if(!riskRecord.get('Checkpoint')){
								alert('You must set the Checkpoint date for this risk');
								return;
							} else if(!riskRecord.get('Description')){
								alert('You must set the Description date for this risk');
								return;
							} else if(!riskRecord.get('Impact')){
								alert('You must set the Impact date for this risk');
								return;
							} else if(!riskRecord.get('Status')){
								alert('You must set the Status date for this risk');
								return;
							} else if(!riskRecord.get('Contact')){
								alert('You must set the Contact date for this risk');
								return;
							}	
							me.RisksGrid.setLoading(true);
							me.RisksFeatureStore.load({
								callback: function(records, operation){
									me._parseRisksData();
									var riskRecordData = riskRecord.data;
									var realRiskData = removeRiskFromList(riskRecordData.RiskID, me.RisksParsedData.slice(0));
									
									var lastAction = function(){
										riskRecord.set('Edited', false);	
										me.RisksGrid.setLoading(false);			
									};
										
									var nextAction = function(){
										var newFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', riskRecordData.FormattedID, 0, false, true, true);
										if(newFeatureRecord) addRisk(newFeatureRecord, riskRecordData, lastAction);
										else lastAction();
									};
									
									if(realRiskData && (realRiskData.FormattedID != riskRecordData.FormattedID)){
										console.log('moving risk to new feature', realRiskData.FormattedID, riskRecordData.FormattedID);
										//we must remove risk from old feature and add it to new feature
										var oldFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', realRiskData.FormattedID, 0, false, true, true);
										if(oldFeatureRecord) removeRisk(oldFeatureRecord, realRiskData, nextAction);
										else nextAction();
									}
									else nextAction();
								}
							});
						}
					};
				}
			},{
				text:'',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, riskRecord){
					return {
						xtype:'button',
						text:'Delete',
						width:70,
						handler: function(){
							if(confirm('Confirm Risk Deletion')){
								me.RisksGrid.setLoading(true);
								me.RisksFeatureStore.load({
									callback: function(records, operation){
										me._parseRisksData();
										var riskRecordData = riskRecord.data;
										var realRiskData = removeRiskFromList(riskRecordData.RiskID, me.RisksParsedData.slice(0));
										
										var lastAction = function(){
											me.CustomRisksStore.remove(riskRecord);
											me.RisksGrid.setLoading(false);
										};
										
										var nextAction = function(){
											var newFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', riskRecordData.FormattedID, 0, false, true, true);
											if(newFeatureRecord) removeRisk(newFeatureRecord, riskRecordData, lastAction);
											else lastAction();	
										};
										
										if(realRiskData && (realRiskData.FormattedID != riskRecordData.FormattedID)){
											//we must remove risk from old feature and also remove it from new feature
											var oldFeatureRecord = me.RisksFeatureStore.findRecord('FormattedID', realRiskData.FormattedID, 0, false, true, true);
											if(oldFeatureRecord) removeRisk(oldFeatureRecord, realRiskData, nextAction);
											else nextAction();
										}
										else nextAction();									
									}
								});
							}
						}
					};
				}
			}
		];

		me.AddRiskButton = me.add({
			xtype:'button',
			text:'+ Add Risk',
			x:0,
			y:380,
			width:80,
			style:'margin-bottom:10px',
			listeners:{
				click: function(){
					var randomFeature = me.RisksFeatureStore.first();
					if(!randomFeature) alert('No Features for this Release!');
					else if(me.CustomRisksStore) {
						var model = Ext.create('IntelRisk', {
							RiskID: (new Date() * 1) + '' + (Math.random() * 10000000),
							FormattedID: randomFeature.get('FormattedID'),
							FeatureName: randomFeature.get('Name'),
							Description: '',
							Impact: '',
							Status: '',
							Contact: '',
							Checkpoint: '',
							Edited:true
						});
						me.CustomRisksStore.add(model);
					}
				}
			}
		});
		
		me.RisksGrid = me.add({
			xtype: 'rallygrid',
            title: 'Risks',
			width: _.reduce(columnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:260,
			x:0,
			y:420,
			scroll:'vertical',
			columnCfgs: columnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(){ return 'intel-row-35px';}
			},
			listeners: {
				beforeedit: function(){
					me._isEditing = true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){					
					var grid = e.grid,
						risksRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
								
					if(value === originalValue) { me._isEditing = false; return; }
					var previousEdit = risksRecord.get('Edited');
					risksRecord.set('Edited', true);
					
					var featureRecord;
					if(field === 'FeatureName'){
						featureRecord = me.RisksFeatureStore.findRecord('Name', value, 0, false, true, true);
						if(!featureRecord){
							risksRecord.set('FeatureName', originalValue);
							risksRecord.set('Edited', previousEdit);//not edited
						} else risksRecord.set('FormattedID', featureRecord.get('FormattedID'));
					} else if(field === 'FormattedID'){
						featureRecord = me.RisksFeatureStore.findRecord('FormattedID', value, 0, false, true, true);
						if(!featureRecord) {
							risksRecord.set('FormattedID', originalValue);
							risksRecord.set('Edited', previousEdit); //not edited
						} else risksRecord.set('FeatureName', featureRecord.get('Name'));
					}
					me._isEditing = false;
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomRisksStore
		});	
	},
	
	_loadDependenciesGrids: function(){
		var me = this;
		var workweeks = me._getWorkweeks();
		
		function newTeamDep(){
			return {
				TID: (new Date() * 1) + '' + (Math.random() * 10000000),
				PID: '',
				Sup:'No',
				USID:'',
				USName:'',
				A:false
			};
		}
	
		/******************************** DEP PARSING/MANIPULATION FUNCTIONS ***************************/

		function removeDepFromList(dependencyID, dependencyList){ 
			for(var i = 0; i<dependencyList.length; ++i){
				if(dependencyList[i].DependencyID == dependencyID) {
					return dependencyList.splice(i, 1)[0];
				}
			}
		}
		
		/*************************************** THESE NEXT 5 METHODS ARE THE ONLY PLACE YOU HAVE TO WORRY ABOUT SUCESSORS AND 
																PREDECESSOR FIELDS ON USER STORIES!!!!!!!!!!!!!!! *************************/
		
		function syncCollection(userStoryRecord, usAddList, usRemoveList, type, callback){ //type == Predecessors || Successors
			var collectionStore, collectionRecords, finished=-1, 
				syncCollectionProxy = false;

			userStoryRecord.getCollection(type).load({ // update the collection before saving user story
				fetch:['FormattedID'],
				callback: function(){
					collectionStore = this, collectionRecords = collectionStore.getRange();
					function collectionFuncDone(){ //when all dep userstories are added, call callback
						if(++finished == usAddList.length){
							if(syncCollectionProxy) collectionStore.sync({ callback:callback });
							else callback();
						}
					}
					usAddList.forEach(function(dep){ //have to load each user story to get its _ref :(
						var realPred, project, i;
						for(i=0;i<collectionRecords.length;++i)
							if(collectionRecords[i].get('FormattedID') === dep.USID){
								realPred = collectionRecords[i]; break; }
						if(!realPred) {
							project = _.find(me.ValidProjects, function(projectRecord){
								return projectRecord.get('ObjectID') == dep.PID;
							});
							me._loadUserStoryByFID(dep.USID, project.get('_ref'), function(us){
								if(us) {
									syncCollectionProxy = true;
									collectionStore.add(us);
								}
								collectionFuncDone();
							});
						} else collectionFuncDone();
					});
					usRemoveList.forEach(function(dep){
						for(var i=0;i<collectionRecords.length;++i)
							if(collectionRecords[i].get('FormattedID') === dep.USID){
								collectionStore.remove(collectionRecords[i]);
								syncCollectionProxy = true; 
								return; 
							}
					});
					collectionFuncDone();
				}
			});	
		}
		
		function removePredDep(userStoryRecord, predDepData, cb){
			var dependencies = me._getDependencies(userStoryRecord),
				cachePreds = me.DependenciesParsedData.Predecessors, dpdp,
				addUSlist = [], removeUSlist = [], depID = predDepData.DependencyID, i;

			removeUSlist = dependencies.Preds[depID].Preds || [];
			
			delete dependencies.Preds[depID]; //delete from user story preds		
			//update or append to the cache, this predDepData
			if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
				for(i=0;i<cachePreds.length; ++i){	//delete from cache
					dpdp = cachePreds[i];
					if(dpdp.DependencyID === depID){ 
						cachePreds.splice(i, 1); break; }
				}
			}

			function appendPred(pred){  //only add each assigned userstory once
				if(pred.A){
					for(i=0;i<removeUSlist.length; ++i)
						if(removeUSlist[i].USID === pred.USID) removeUSlist.splice(i, 1);
					for(i=0;i<addUSlist.length; ++i)
						if(addUSlist[i].USID === pred.USID) return;
					addUSlist.push(pred);
				}
			}
			for(depID in dependencies.Preds){ _.each(dependencies.Preds[depID].Preds, appendPred); }
			
			syncCollection(userStoryRecord, addUSlist, removeUSlist, 'Predecessors', function(){ 
				var str = JSON.stringify(dependencies, null, '\t');
				if(str.length >= 32768){
					alert('ERROR: Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
					if(cb) cb();
				}
				userStoryRecord.set('c_Dependencies', str);
				userStoryRecord.save({
					callback:function(){
						console.log('removed pred from userStory:', userStoryRecord, predDepData, dependencies);
						if(cb) cb();
					}
				});
			});
			
		}
		
		function removeSuccDep(userStoryRecord, succDepData, cb){
			var dependencies = me._getDependencies(userStoryRecord),
				cacheSuccs = me.DependenciesParsedData.Successors, dpds,
				addUSlist = [], removeUSlist = [], succDep, i;
				
			for(i=0; i<dependencies.Succs.length; ++i) //find the correct succDep. and remove it from the dependencies object
				if(dependencies.Succs[i].ID === succDepData.DependencyID){					
					succDep = dependencies.Succs.splice(i, 1)[0]; break; }	
			removeUSlist = succDep ? [{USID:succDep.SUSID, PID:succDep.SPID}] : [];
			
			//update or append to the cache, this predDepData
			if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
				for(i=0;i<cacheSuccs.length; ++i){ //remove suddDep from cache
					dpds = cacheSuccs[i];
					//need formattedID because can be multiple same succ DepIDs
					if(dpds.DependencyID === succDepData.DependencyID && dpds.FormattedID === succDepData.FormattedID){
						cacheSuccs.splice(i, 1); break; }
				}
			}
			
			_.each(dependencies.Succs, function(succ){
				if(succ.A){
					for(i=0;i<removeUSlist.length; ++i)
						if(removeUSlist[i].USID === succ.SUSID) removeUSlist.splice(i, 1);
					for(i=0;i<succUSlist.length; ++i)
						if(addUSlist[i].USID === succ.SUSID) return;
					addUSlist.push({USID: succ.SUSID, PID: succ.SPID});
				}
			});
			
			syncCollection(userStoryRecord, addUSlist, removeUSlist, 'Successors', function(){ 
				var str = JSON.stringify(dependencies, null, '\t');
				if(str.length >= 32768){
					alert('ERROR: Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
					if(cb) cb();
				}
				userStoryRecord.set('c_Dependencies', str);
				userStoryRecord.save({
					callback: function(){
						console.log('removed succ from userStory:', userStoryRecord, succDepData, dependencies);
						if(cb) cb();
					}
				});
			});
		}

		function addPredDep(userStoryRecord, predDepData, cb){ 
			var dependencies = me._getDependencies(userStoryRecord),
				cachePreds = me.DependenciesParsedData.Predecessors, dpdp,
				predUSlist = [], parseDataAdded = false, depID, i;
			
			dependencies.Preds[predDepData.DependencyID] = {
				Desc: predDepData.Description,
				CP: predDepData.Checkpoint,
				Sta: predDepData.Status,
				Preds: predDepData.Predecessors
			};
 
			//update or append to the cache, this predDepData
			if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
				for(i=0;i<cachePreds.length; ++i){
					dpdp = cachePreds[i];
					if(dpdp.DependencyID === predDepData.DependencyID){
						cachePreds[i] = predDepData;
						cachePreds[i].Edited = false;
						parseDataAdded = true; break;
					}
				}
				if(!parseDataAdded) cachePreds.push(predDepData);	
			}
			
			function appendPred(pred){  //only add each assigned userstory once
				if(pred.A){
					for(i=0;i<predUSlist.length; ++i)
						if(predUSlist[i].USID === pred.USID) return;
					predUSlist.push(pred);
				}
			}			
			for(depID in dependencies.Preds){ _.each(dependencies.Preds[depID].Preds, appendPred); }
			
			syncCollection(userStoryRecord, predUSlist, [], 'Predecessors', function(){
				var str = JSON.stringify(dependencies, null, '\t');
				if(str.length >= 32768){
					alert('ERROR: Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
					if(cb) cb();
				}
				userStoryRecord.set('c_Dependencies', str);
				userStoryRecord.save({
					callback:function(){
						console.log('added predecessor to userStory:', userStoryRecord, predDepData, dependencies);
						if(cb) cb();
					}
				});
			});
		}
		
		function addSuccDep(userStoryRecord, succDepData, cb){ 
			var dependencies = me._getDependencies(userStoryRecord),
				cacheSuccs = me.DependenciesParsedData.Successors, dpds,
				replaced = false, succUSlist=[], 
				parseDataAdded = false, i, newSucc;
				
			newSucc = {
				ID: succDepData.DependencyID,
				SUSID: succDepData.SuccFormattedID,
				SUSName: succDepData.SuccUserStoryName,
				SPID: succDepData.SuccProjectID,
				Desc: succDepData.Description,
				CP: succDepData.Checkpoint,
				Sup: succDepData.Supported,
				A: succDepData.Assigned,
				REL: succDepData.ReleaseDate,
				REL_S: succDepData.ReleaseStartDate
			};
			for(i = 0; i<dependencies.Succs.length; ++i){
				if(dependencies.Succs[i].ID === newSucc.ID){
					dependencies.Succs[i] = newSucc;
					replaced=true; 
					break; 
				}
			}
			if(!replaced) dependencies.Succs.push(newSucc);

			//update or append to the cache, this predDepData
			if(userStoryRecord.get('Project').ObjectID === me.ProjectRecord.get('ObjectID')){
				for(i=0;i<cacheSuccs.length; ++i){ //update or append to the cache, this succDepData
					dpds = cacheSuccs[i];
					//could be multiple succs with same DepID
					if(dpds.DependencyID === succDepData.DependencyID && dpds.FormattedID === succDepData.FormattedID){
						cacheSuccs[i] = succDepData;
						cacheSuccs[i].Edited = false;
						parseDataAdded = true; break;
					}
				}
				if(!parseDataAdded) cacheSuccs.push(succDepData);
			}
			
			_.each(dependencies.Succs, function(succ){
				if(succ.A){
					for(i=0;i<succUSlist.length; ++i)
						if(succUSlist[i].USID === succ.SUSID) return;
					succUSlist.push({USID: succ.SUSID, PID: succ.SPID});
				}
			});
			
			syncCollection(userStoryRecord, succUSlist, [], 'Successors', function(){
				var str = JSON.stringify(dependencies, null, '\t');
				if(str.length >= 32768){
					alert('ERROR: Dependencies field for ' + userStoryRecord.get('FormattedID') + ' ran out of space! Cannot save');
					if(cb) cb();
				}
				userStoryRecord.set('c_Dependencies', str);
				userStoryRecord.save({
					callback:function(){
						console.log('added succ to userStory:', userStoryRecord, succDepData, dependencies);
						if(cb) cb();
					}
				});
			});
		}

		function getDirtyType(localDepRecord, realDepData){
			var localDepData = localDepRecord.data;
			if(!realDepData)	return localDepData.Edited ? 'New' : 'Deleted'; //we just created the item, or it was deleted by someone else
			else				return localDepData.Edited ? 'Edited' : 'Unchanged'; //we just edited the item, or it is unchanged
		}
		
		/****************************** PREDECESSORS STUFF           ***********************************************/				
		me.PredDepTeamStores = {}; //stores for each of the team arrays in the predecessors
		me.PredDepContainers = {};

		me.CustomPredDepStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.DependenciesParsedData.Predecessors),
			autoSync:true,
			model:'IntelPredDep',
			proxy: {
				type:'sessionstorage',
				id:'PredDepProxy' + Math.random()
			},
			limit:Infinity,
			listeners: {
				load: function(customPredDepStore, customPredDepRecs){ 
					var realPredDepsData = me.DependenciesParsedData.Predecessors.slice(0); //shallow copy of it
					console.log('syncing predDeps with current userStories', customPredDepRecs, realPredDepsData);
					for(var i = 0;i<customPredDepRecs.length;++i){
						var depRec =  customPredDepRecs[i]; //predecessor dependency record to be updated
						
						var depID = depRec.get('DependencyID');
						var realDep = removeDepFromList(depID, realPredDepsData);	
							
						var dirtyType = getDirtyType(depRec, realDep);
						if(dirtyType === 'New' || dirtyType === 'Edited'){ 
							//we don't want to remove any pending changes			
						} else if(dirtyType == 'Deleted'){ 
							// the depRec was deleted by someone else, and we arent editing it
							customPredDepStore.remove(depRec);
							delete me.PredDepTeamStores[depID];
							delete me.PredDepContainers[depID];
						} else {
							for(var key in realDep){
								if(key === 'Predecessors') depRec.set(key, Ext.clone(realDep[key]) || [newTeamDep()]); 
								else depRec.set(key, realDep[key]);
							}
						}				
						var preds = depRec.get('Predecessors');
						if(!preds.length){
							depRec.set('Predecessors', [newTeamDep()]);
							depRec.set('Edited', true);
						}
						
						if(me.PredDepTeamStores[depID])
							me.PredDepTeamStores[depID].load();
					}
					realPredDepsData.forEach(function(realDep){ 
						//add all the new risks that other people have added since the last load
						console.log('adding predDep', realDep);
						customPredDepStore.add(Ext.create('IntelPredDep', Ext.clone(realDep)));					
						var depID = realDep.DependencyID;
						if(me.PredDepTeamStores[depID])
							me.PredDepTeamStores[depID].load();
					});	
				}
			}
		});
		
		var predDepColumnCfgs = [
			{
				text:'US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:80,
				resizable:false,
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['FormattedID'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'FormattedID': usr.get('FormattedID')};
						}),
						sorters: {
							property: 'FormattedID'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},
				sortable:true
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				width:155,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'Name': usr.get('Name') };
						}),
						sorters: {
							property: 'Name'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				sortable:true		
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				width:160,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor: 'textfield',
				sortable:true,
				renderer: function(val){
					return val || '-';
				}				
			},{
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				text:'Checkpoint',					
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Week'],
						data: workweeks
					}),
					editable: false,
					displayField: 'Week',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				renderer: function(val){
					return val || '-';
				},
				sortable:true
			},{
				text:'Teams Depended On',
				html:	'<div class="pred-dep-header" style="width:80px !important;"></div>' +
						'<div class="pred-dep-header" style="width:140px !important;">Team Name</div>' +
						'<div class="pred-dep-header" style="width:65px  !important;">Supported</div>' +
						'<div class="pred-dep-header" style="width:70px  !important;">US#</div>' +
						'<div class="pred-dep-header" style="width:130px !important;">User Story</div>',
				dataIndex:'DependencyID',
				width:580,
				resizable:false,
				sortable:false,
				xtype:'componentcolumn',
				renderer: function (depID){
					var predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
					var predecessors = predDepRecord.get('Predecessors');
					if(!me.PredDepTeamStores[depID]){
						me.PredDepTeamStores[depID] = Ext.create('Ext.data.Store', { 
							model:'IntelDepTeam',
							data: predecessors,
							autoSync:true,
							limit:Infinity,
							proxy: {
								type:'sessionstorage',
								id:'TeamDep-' + depID + '-proxy' + Math.random()
							},
							listeners: {
								load: function(depTeamStore, depTeamRecords){
									predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
									var predecessors = predDepRecord.get('Predecessors').slice(0);				
									Outer:
									for(var i = 0;i<depTeamRecords.length;++i){
										var depTeamRecord = depTeamRecords[i];
										var realTeamDep;
										for(var j=0; j<predecessors.length;++j){
											if(predecessors[j].TID === depTeamRecord.get('TID')){
												realTeamDep = predecessors.splice(j, 1)[0];
												for(var key in realTeamDep)
													depTeamRecord.set(key, realTeamDep[key]);
												continue Outer;
											}
										}
										depTeamStore.remove(depTeamRecord);
									}
									predecessors.forEach(function(realTeamDep){ 
										depTeamStore.add(Ext.create('IntelDepTeam', realTeamDep));
									});	
								}
							}
						});	
					}
					if(me.PredDepContainers[depID]) 
						return me.PredDepContainers[depID];
						
					var defaultHandler = { //dont let mouse events bubble up to parent rallygrid. bad things happen
						element: 'el',
						fn: function(a){ a.stopPropagation(); }
					};
					var teamColumnCfgs = [
						{
							dataIndex:'PID',
							width:145,
							resizable:false,
							renderer: function(val, meta, depTeamRecord){
								var projectRecord = _.find(me.ValidProjects, function(projectRecord){
									return projectRecord.get('ObjectID') == val;
								});
								if(val && projectRecord) return projectRecord.get('Name');
								else {
									meta.tdCls += 'intel-editor-cell';
									return 'Select Team';
								}
							},
							editor: {
								xtype:'combobox', 
								store: Ext.create('Ext.data.Store', {
									fields: ['Name'],
									data: me.ProjectNames,
									sorters: { property: 'Name' }
								}),
								enableKeyEvents:true,
								ignoreNoChange:true,
								queryMode:'local',
								listeners: {
									keyup: function(a,b){
										if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
										var me = this;
										me.store.filters.getRange().forEach(function(filter){
											me.store.removeFilter(filter);
										});
										me.store.filterBy(function(item){
											return item.get('Name').indexOf(me.getRawValue()) > -1;
										});
									},
									focus: function(combo) {
										combo.expand();
									}
								},
								displayField: 'Name'
							}
						},{
							dataIndex:'Sup',
							width:50,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
								else meta.tdCls = 'intel-supported-cell';
								return val;
							}
						},{
							dataIndex:'USID',
							width:75,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.get('A')) return val;
								else return '-';
							}
						},{
							dataIndex:'USName',
							width:138,
							resizable:false,
							editor: false,
							renderer: function(val, meta, depTeamRecord){
								if(depTeamRecord.get('A')) return val;
								else return '-';
							}				
						},{
							width:80,
							resizable:false,
							xtype:'componentcolumn',
							renderer: function(val, meta, depTeamRecord){
								return {
									xtype:'button',
									width:70,
									text:'Delete',
									handler: function(){
										if(!me._loadDependenciesStores) return;
										predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
										var predecessors = predDepRecord.get('Predecessors');
										
										for(var i=0; i<predecessors.length; ++i)
											if(predecessors[i].TID === depTeamRecord.get('TID')){
												predecessors.splice(i, 1); break; }
										me.PredDepTeamStores[depID].remove(depTeamRecord);
										
										if(!predecessors.length){
											var newItem = newTeamDep();
											me.PredDepTeamStores[depID].add(Ext.create('IntelDepTeam', newItem));
											predecessors.push(newItem);
										}
										predDepRecord.set('Edited', true);
									}
								};
							}
						}
					];
					return {
						xtype:'container',
						layout:'hbox',
						bodyCls: 'blend-in-grid',
						pack:'start',
						align:'stretch',
						border:false,
						items: [
							{
								xtype: 'button',
								text: '+ Add Team',
								width:76,
								padding:3,
								margin:'0 4 0 0',
								handler: function(){
									if(me.PredDepTeamStores[depID] && me._loadDependenciesStores) {
										predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
										var newItem = newTeamDep();
										me.PredDepTeamStores[depID].add(Ext.create('IntelDepTeam', newItem));
										predDepRecord.data.Predecessors.push(newItem);
										predDepRecord.set('Edited', true);	
									}
								}
							},{
								xtype: 'rallygrid',	
								width:_.reduce(teamColumnCfgs, function(sum, i){ return sum + i.width; }, 0),
								rowLines:false,
								flex:1,
								columnCfgs: teamColumnCfgs,
								plugins: [
									Ext.create('Ext.grid.plugin.CellEditing', {
										triggerEvent:'cellclick'
									})
								],
								viewConfig: {
									stripeRows:false,
									getRowClass: function(teamDepRecord, index, rowParams, store){
										if(!teamDepRecord.get('PID')) return 'intel-row-35px intel-no-team-dep-selected';
										else return 'intel-row-35px';
									}
								},
								listeners: {
									beforeedit: function(editor, e){
										if(!!e.value) return false; //don't edit if has value
										me._isEditing = true;
									},
									canceledit: function(){
										me._isEditing = false;
									},
									edit: function(editor, e){	
										var depTeamRecord = e.record,
											field = e.field,
											value = e.value,
											originalValue = e.originalValue,
											i;
										me._isEditing = false;
										
										predDepRecord = me.CustomPredDepStore.findRecord('DependencyID', depID);
										
										console.log('teamDepEdit', field, value, originalValue);
										var previousEdit = predDepRecord.get('Edited');
										predDepRecord.set('Edited', true);
										var predecessors = predDepRecord.get('Predecessors');
										if(field === 'PID'){
											var projectRecord = _.find(me.ValidProjects, function(projectRecord){
												return projectRecord.get('Name') == value;
											});
											if(!projectRecord) {
												depTeamRecord.set('PID', originalValue);
												predDepRecord.set('Edited', previousEdit);
												return;
											} else {
												for(i = 0;i<predecessors.length;++i){
													if(predecessors[i].PID === ''+projectRecord.get('ObjectID')){
														alert(value + ' already included in this dependency');
														depTeamRecord.set('PID', originalValue);
														predDepRecord.set('Edited', previousEdit);
														return;
													}
												}
												if(projectRecord.get('ObjectID') === me.ProjectRecord.get('ObjectID')){
													alert('You cannot depend on yourself');
													depTeamRecord.set('PID', originalValue);
													predDepRecord.set('Edited', previousEdit);
													return;
												}
												depTeamRecord.set('PID', projectRecord.get('ObjectID'));
											}
										}
												
										for(i=0; i<predecessors.length; ++i){
											if(predecessors[i].TID === depTeamRecord.get('TID')){
												predecessors[i].PID = depTeamRecord.get('PID'); //update the predDepRecord
												break; 
											}
										}
									}
								},
								hideHeaders:true,
								showRowActionsColumn:false,
								scroll:false,
								showPagingToolbar:false,
								enableEditing:false,
								context: me.getContext(),
								store: me.PredDepTeamStores[depID]
							}
						],
						listeners: {
							mousedown: defaultHandler,
							mousemove: defaultHandler,
							mouseout: defaultHandler,
							mouseover: defaultHandler,
							mouseup: defaultHandler,
							mousewheel: defaultHandler,
							scroll: defaultHandler,
							click: defaultHandler,
							dblclick: defaultHandler,
							render: function(){ me.PredDepContainers[depID] = this; }
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, predDepRecord){	
					var realDepData = removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = getDirtyType(predDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					else return {
						xtype:'button',
						text:'Undo',
						handler: function(){
							if(!me._loadDependenciesStores) return;
							var depID = predDepRecord.get('DependencyID');
							var realDep = removeDepFromList(depID, me.DependenciesParsedData.Predecessors.slice(0));	
							for(var key in realDep){
								if(key === 'Predecessors') predDepRecord.set(key, Ext.clone(realDep[key]));
								else predDepRecord.set(key, realDep[key]);
							}
							me.PredDepTeamStores[depID].load();
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, predDepRecord){			
					var realDepData = removeDepFromList(predDepRecord.get('DependencyID'), me.DependenciesParsedData.Predecessors.slice(0));
					var dirtyType = getDirtyType(predDepRecord, realDepData);
					if(dirtyType === 'New') dirtyType = 'Save';
					else if(dirtyType === 'Edited') dirtyType = 'Resave';
					else return ''; //don't render it!
					return {
						xtype:'button',
						text:dirtyType,
						handler: function(){
							//validate fields first
							if(predDepRecord.get('Description') === ''){
								alert('Cannot Save: Description is empty'); return; }
							if(predDepRecord.get('Checkpoint') === ''){
								alert('Cannot Save: Checkpoint is empty'); return; }
							var predecessors = predDepRecord.get('Predecessors');
							if(predecessors.length === 0){
								alert('Cannot Save: Must specify a team you depend on'); return; }
							for(var i = 0;i<predecessors.length;++i)
								if(predecessors[i].PID === ''){
									alert('Cannot Save: All Team Names must be valid'); return; }
							me._isEditing = true;
							me.PredDepGrid.setLoading(true);
							me.DependenciesUserStoryStore.load({
								callback: function(userStoryRecords, operation){
									me._buildDependenciesData();
									var predDepData = predDepRecord.data;
									var realPredDeps = me.DependenciesParsedData.Predecessors.slice(0);
									var realDepData = removeDepFromList(predDepData.DependencyID, realPredDeps) || {};
									
									/***************************** UPDATE THE PRED USER STORIES *********************/
									var addedTeamDeps = [], removedTeamDeps = [], updatedTeamDeps = [];
									var localPredTeams = predDepData.Predecessors,
										realPredTeams  = realDepData.Predecessors || [];
									Outer:
									for(var i=0;i<localPredTeams.length;++i){
										for(var j=0;j<realPredTeams.length;++j){
											if(localPredTeams[i].TID === realPredTeams[j].TID){
												updatedTeamDeps.push(realPredTeams.splice(j,1)[0]);
												continue Outer;
											}
										}
										addedTeamDeps.push(localPredTeams[i]); //teams we just added
									}
									removedTeamDeps = realPredTeams; //teams that we just removed			
									
									/** we have to do it this way, cuz added deps need to be assigned user stories first **/
									var addedTeamDepsFinished = -1; 
									var addedTeamDepsCallbacks = [];
									var addedTeamDepsDone = function(){
										if(++addedTeamDepsFinished === addedTeamDeps.length){
											
											var updatedTeamDepsFinished = -1; 
											var updatedTeamDepsCallbacks = [];
											var updatedTeamDepsDone = function(){
												if(++updatedTeamDepsFinished === updatedTeamDeps.length){	
												
													/** 3) remove removed teams */
													removedTeamDeps.forEach(function(teamDepData){ //execute the removed teams now
														var project = _.find(me.ValidProjects, function(projectRecord){
															return projectRecord.get('ObjectID') == teamDepData.PID;
														});
														me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
															if(!us) return; // looks as if the userStory doesn't exist. so we ignore it
															var succDepData = {
																FormattedID: teamDepData.USID,
																DependencyID: predDepData.DependencyID
															};
															removeSuccDep(us, succDepData); 
														});
													});
													addedTeamDepsCallbacks.forEach(function(cb){ cb(); }); //execute the added teams now 
													updatedTeamDepsCallbacks.forEach(function(cb){ cb(); }); //execute the updated teams now 
													
													predDepData.Predecessors = localPredTeams; //update these after 1) and 2) changed them
													
													var lastAction = function(){ //last thing to do!											
														predDepRecord.set('Edited', false);	
														me._isEditing = false;
														me.PredDepGrid.setLoading(false);		
													};
													
													var nextAction = function(){
														var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', predDepData.FormattedID, 0, false, true, true);
														if(newUserStoryRecord) addPredDep(newUserStoryRecord, predDepData, lastAction);
														else lastAction();
													};
																										
													//also, move to new user story if needed
													if(realDepData && (realDepData.FormattedID != predDepData.FormattedID)){
														console.log('moving predDep to new user story', realDepData.FormattedID, predDepData.FormattedID);
														//we must remove risk from old userStory and add it to new userStory
														var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData.FormattedID, 0, false, true, true);
														if(oldUserStoryRecord) removePredDep(oldUserStoryRecord, realDepData, nextAction);
														else nextAction();
													}
													else nextAction();	
												}
											};
											
											updatedTeamDepsDone();
											
											/** 2) update updated teams **/
											updatedTeamDeps.forEach(function(teamDepData){ //have to update these here!
												var project = _.find(me.ValidProjects, function(projectRecord){
													return projectRecord.get('ObjectID') == teamDepData.PID;
												});
												me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
													if(!us){
														me._loadRandomUserStory(project.get('_ref'), function(us){
															if(!us){
																me.PredDepGrid.setLoading(false);
																me._isEditing = false;
																alert('Project ' + project.get('Name') + ' has no user stories, cannot continue');
																return;
															}
															updatedTeamDepsCallbacks.push(function(){ // got deleted from user story
																for(var i=0;i<localPredTeams.length;++i){
																	if(localPredTeams[i].TID === teamDepData.TID){
																		localPredTeams[i].USID = us.get('FormattedID');
																		localPredTeams[i].USName = us.get('Name');
																		localPredTeams[i].A = false;
																		//leave Sup and PID fields the same
																		break;
																	}
																}
																var succDep = {
																	DependencyID: predDepData.DependencyID,
																	SuccUserStoryName: predDepData.UserStoryName,
																	SuccFormattedID: predDepData.FormattedID,
																	SuccProjectID: me.ProjectRecord.get('ObjectID'),
																	Description: predDepData.Description,
																	Checkpoint: predDepData.Checkpoint,
																	UserStoryName: '',
																	FormattedID: '',
																	Supported: teamDepData.Sup,
																	Assigned: false,
																	ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
																	ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
																	Edited: false
																};
																addSuccDep(us, succDep);
															});
															updatedTeamDepsDone();
														});
													}
													else{
														updatedTeamDepsCallbacks.push(function(){
															var succDep = {
																DependencyID: predDepData.DependencyID,
																SuccUserStoryName: predDepData.UserStoryName,
																SuccFormattedID: predDepData.FormattedID,
																SuccProjectID: me.ProjectRecord.get('ObjectID'),
																Description: predDepData.Description,
																Checkpoint: predDepData.Checkpoint,
																UserStoryName: teamDepData.USName,
																FormattedID: teamDepData.USID,
																Supported: teamDepData.Sup,
																Assigned: teamDepData.A,
																ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
																ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
																Edited: false
															};
															addSuccDep(us, succDep);
														});
														updatedTeamDepsDone();
													}
												});
											});
												
										}
									};
									addedTeamDepsDone();
									
									/** 1) add new teams. do this first, cuz if the team has no user stories we gotta stop **/
									addedTeamDeps.forEach(function(teamDepData){ //have to update these here!
										var project = _.find(me.ValidProjects, function(projectRecord){
											return projectRecord.get('ObjectID') == teamDepData.PID;
										});
										me._loadRandomUserStory(project.get('_ref'), function(us){
											if(!us){
												me.PredDepGrid.setLoading(false);
												me._isEditing = false;
												alert('Project ' + project.get('Name') + ' has no user stories, cannot continue');
												return;
											}
											addedTeamDepsCallbacks.push(function(){
												teamDepData.USID = us.get('FormattedID');
												teamDepData.USName = us.get('Name');
												var succDep = {
													DependencyID: predDepData.DependencyID,
													SuccUserStoryName: predDepData.UserStoryName,
													SuccFormattedID: predDepData.FormattedID,
													SuccProjectID: me.ProjectRecord.get('ObjectID'),
													UserStoryName: '',
													FormattedID: '',
													_realUserStoryName: us.get('Name'), //not needed
													_realFormattedID: us.get('FormattedID'), //not needed
													Description: predDepData.Description,
													Checkpoint: predDepData.Checkpoint,
													Supported: 'No',
													Assigned: false,
													ReleaseStartDate: me.ReleaseRecord.get('ReleaseStartDate'),
													ReleaseDate: me.ReleaseRecord.get('ReleaseDate'),
													Edited: false
												};
												addSuccDep(us, succDep);
											});
											addedTeamDepsDone();
										});
									});
									
								}
							});
						}
					};
				}
			},{
				text:'',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, predDepRecord){		
					return {
						xtype:'button',
						text:'Delete',
						handler: function(){
							if(confirm('Confirm Dependency Deletion')){
								me.PredDepGrid.setLoading(true);
								me._isEditing = true;
								me.DependenciesUserStoryStore.load({
									callback: function(userStoryRecords, operation){
										me._buildDependenciesData();
										var predDeps = me.DependenciesParsedData.Predecessors.slice(0);
										var predDepData = predDepRecord.data;
										var realDepData = removeDepFromList(predDepData.DependencyID, predDeps) || {};
										
										/***************************** REMOVE SELF FROM PREDECESSORS *********************/
										var realTeamDeps = realDepData.Predecessors || [];
										realTeamDeps.forEach(function(teamDepData){
											if(teamDepData.PID === '') return;
											var project = _.find(me.ValidProjects, function(projectRecord){
												return projectRecord.get('ObjectID') == teamDepData.PID;
											});
											me._loadUserStoryByFID(teamDepData.USID, project.get('_ref'), function(us){
												if(!us) return; //us must have been deleted. ignore it
												var succDepData = {
													FormattedID: teamDepData.USID,
													DependencyID: predDepData.DependencyID
												};
												removeSuccDep(us, succDepData); //using teamDepData cuz we only need DependencyID
											});
										});
													
										var lastAction = function(){	//last thing to do!												
											me.CustomPredDepStore.remove(predDepRecord);
											me.PredDepGrid.setLoading(false);
											me._isEditing = false;
										};
										
										var nextAction = function(){
											var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', predDepData.FormattedID, 0, false, true, true);
											if(newUserStoryRecord) removePredDep(newUserStoryRecord, predDepData, lastAction);
											else lastAction();
										};
																							
										if(realDepData && (realDepData.FormattedID != predDepData.FormattedID)){
											console.log('moving predDep to new user story', realDepData.FormattedID, predDepData.FormattedID);
											//we must remove risk from old userStory and add it to new userStory
											var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData.FormattedID, 0, false, true, true);
											if(oldUserStoryRecord) removePredDep(oldUserStoryRecord, realDepData, nextAction);
											else nextAction();
										}
										else nextAction();	
									}
								});
							}
						}
					};
				}
			}
		];

		me.AddPredDepButton = me.add({
			xtype:'button',
			text:'+ Add Dependency',
			style:'margin-bottom:10px',
			x:0,
			y:720,
			listeners:{
				click: function(){
					var randomUserStory = me.DependenciesReleaseUserStories[0];
					if(!randomUserStory) alert('No User Stories for this Release!');
					else if(me.CustomPredDepStore) {
						var model = Ext.create('IntelPredDep', {
							DependencyID: (new Date() * 1) + '' + (Math.random() * 10000000),
							FormattedID: randomUserStory.get('FormattedID'),
							UserStoryName: randomUserStory.get('Name'),
							Description: '',
							Checkpoint: '',
							Predecessors:[newTeamDep()],
							Edited:true
						});
						me.CustomPredDepStore.add(model);
					}
				}
			}
		});
		
		me.PredDepGrid = me.add({
			xtype: 'rallygrid',
            title: "Predecessor Dependencies",
			width: _.reduce(predDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:400,
			x:0, y:760,
			scroll:'vertical',
			columnCfgs: predDepColumnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(predDepRecord){ 
					var cls = 'intel-row-' + (10 + (35*predDepRecord.get('Predecessors').length || 35)) + 'px';
					return cls;
				}
			},
			listeners: {
				beforeedit: function(){
					me._isEditing = true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){					
					var grid = e.grid,
						predDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;					
					me._isEditing = false;
					console.log('predDep edit:', predDepRecord, field, value, originalValue);
					if(value === originalValue) return;
					var previousEdit = predDepRecord.get('Edited');
					predDepRecord.set('Edited', true);
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							predDepRecord.set('UserStoryName', originalValue);
							predDepRecord.set('Edited', previousEdit); //not edited
						} else predDepRecord.set('FormattedID', userStoryRecord.get('FormattedID'));	
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							predDepRecord.set('FormattedID', originalValue);
							predDepRecord.set('Edited', previousEdit); //not edited
						} else predDepRecord.set('UserStoryName', userStoryRecord.get('Name'));	
					}
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomPredDepStore
		});	
	
		/****************************** SUCCESSORS    STUFF           ***********************************************/	
		me.CustomSuccDepStore = Ext.create('Ext.data.Store', { 
			data: Ext.clone(me.DependenciesParsedData.Successors.slice(0)),
			autoSync:true,
			model:'IntelSuccDep',
			proxy: {
				type: 'sessionstorage',
				id:'SuccDepProxy' + Math.random()
			},
			limit:Infinity,
			listeners: {
				load: function(customSuccDepStore, customSuccDepRecs){ 
					var realSuccDepsData = me.DependenciesParsedData.Successors.slice(0); //shallow copy of it
					console.log('syncing succDeps with current userStories', customSuccDepRecs, realSuccDepsData);
					for(var i = 0;i<customSuccDepRecs.length;++i){
						var depRec =  customSuccDepRecs[i]; //predecessor dependency record to be updated
						
						var depID = depRec.get('DependencyID');
						var realDep = removeDepFromList(depID, realSuccDepsData);	
							
						var dirtyType = getDirtyType(depRec, realDep);
						if(dirtyType === 'Edited') //we don't want to remove any pending changes
							continue;						
						else if(dirtyType === 'Deleted' || dirtyType === 'New'){ // the depRec was deleted by someone else, and we arent editing it
							customSuccDepStore.remove(depRec);
						} else {
							for(var key in realDep)
								depRec.set(key, realDep[key]);
						}
					}
					realSuccDepsData.forEach(function(realDep){ 
						console.log('adding succDep', realDep);
						customSuccDepStore.add(Ext.create('IntelSuccDep', Ext.clone(realDep)));
					});	
				}
			}
		});
		
		var succDepColumnCfgs = [
			{
				text:'Predecesor Project', 
				dataIndex:'SuccProjectID',
				width:160,
				resizable:false,
				sortable:true,
				renderer: function(pid){
					var project = _.find(me.ValidProjects, function(p){ return p.get('ObjectID') == pid; });
					return project ? project.get('Name') : pid;
				}
			},{
				text:'Pred US#', 
				dataIndex:'SuccFormattedID',
				width:85,
				resizable:false,
				sortable:true
			},{
				text:'Pred UserStory', 
				dataIndex:'SuccUserStoryName',
				width:160,
				resizable:false,
				sortable:true		
			},{
				text:'Dependency Description', 
				dataIndex:'Description',
				width:160,
				resizable:false,
				editor: false,
				sortable:true					
			},{
				text:'Checkpoint', 
				dataIndex:'Checkpoint',
				width:80,
				resizable:false,
				editor: false,
				sortable:true					
			},{
				text:'Supported',					
				dataIndex:'Supported',
				width:80,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'combobox',
					width:80,
					store: Ext.create('Ext.data.Store', {
						fields: ['Sup'],
						data: [
							{Sup:'Yes'},
							{Sup:'No'}
						]
					}),
					editable: false,
					displayField: 'Sup',
					listeners:{
						focus: function(combo) {
							combo.expand();
						}
					}
				},
				renderer: function(val, meta){
					if(val == 'No') meta.tdCls = 'intel-not-supported-cell';
					else meta.tdCls = 'intel-supported-cell';
					return val;
				},
				sortable:true
			},{
				text:'Supporting US#', 
				dataIndex:'FormattedID',
				tdCls: 'intel-editor-cell',
				width:120,
				resizable:false,
				editor:{
					xtype:'combobox',
					width:120,
					store: Ext.create('Ext.data.Store', {
						fields: ['FormattedID'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'FormattedID': usr.get('FormattedID')};
						}),
						sorters: {
							property: 'FormattedID'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('FormattedID').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'FormattedID'
				},
				sortable:true,
				renderer: function(val){
					if(!val) return '-';
					else return val;
				}
			},{
				text:'UserStory', 
				dataIndex:'UserStoryName',
				width:160,
				resizable:false,
				tdCls: 'intel-editor-cell',
				editor:{
					xtype:'combobox',
					store: Ext.create('Ext.data.Store', {
						fields: ['Name'],
						data: _.map(me.DependenciesReleaseUserStories, function(usr){
							return {'Name': usr.get('Name') };
						}),
						sorters: {
							property: 'Name'
						}
					}),
					enableKeyEvents:true,
					queryMode:'local',
					listeners: {
						keyup: function(a,b){
							if(b.keyCode>=37 && b.keyCode <=40) return; //arrow keys
							var me = this;
							me.store.filters.getRange().forEach(function(filter){
								me.store.removeFilter(filter);
							});
							me.store.filterBy(function(item){
								return item.get('Name').indexOf(me.getRawValue()) > -1;
							});
						},
						focus: function(combo) {
							combo.expand();
						}
					},
					displayField: 'Name'
				},
				sortable: true,
				renderer: function(val){
					if(!val) return '-';
					else return val;
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:130,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, succDepRecord){			
					if(!succDepRecord.get('FormattedID')) return '';
					else return {
						xtype: 'button',
						text: 'Remove UserStory',
						padding:2,
						handler: function(){
							succDepRecord.set('Edited', true);
							succDepRecord.set('Assigned', false);
							succDepRecord.set('FormattedID', '');
							succDepRecord.set('UserStoryName', '');
						}
					};
				}
			},{
				text:'',
				dataIndex:'Edited',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, succDepRecord){		
					var realDepData = removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					else return {
						xtype: 'button',
						text:'Undo',
						handler:function(){
							var depID = succDepRecord.get('DependencyID');
							var realDep = removeDepFromList(depID, me.DependenciesParsedData.Successors.slice(0));	
							for(var key in realDep)
								succDepRecord.set(key, realDep[key]);
							succDepRecord.set('Edited', false);
						}
					};
				}
			},{
				text:'',
				width:80,
				xtype:'componentcolumn',
				resizable:false,
				renderer: function(value, meta, succDepRecord){	
					var realDepData = removeDepFromList(succDepRecord.get('DependencyID'), me.DependenciesParsedData.Successors.slice(0));
					var dirtyType = getDirtyType(succDepRecord, realDepData);
					if(dirtyType !== 'Edited') return ''; //don't render it!
					else return {
						xtype:'button',
						text:'Save',
						handler:function(){
							//no field validation needed
							me.SuccDepGrid.setLoading(true);
							me._isEditing = true;
							me.DependenciesUserStoryStore.load({
								callback: function(userStoryRecords, operation){
									me._buildDependenciesData();
									var succDepData = succDepRecord.data;
									var realSuccDeps = me.DependenciesParsedData.Successors.slice(0);
									var realDepData = removeDepFromList(succDepData.DependencyID, realSuccDeps);
									
									/***************************** UPDATE THE Pred USER STORy *********************/
									var project = _.find(me.ValidProjects, function(projectRecord){
										return projectRecord.get('ObjectID') == succDepData.SuccProjectID;
									});
									if(!project){
										me.SuccDepGrid.setLoading(false);
										me._isEditing = false;
										alert('could not find project ' + succDepData.SuccProjectID);
										return;
									}													
									if(succDepData.FormattedID) { //move it to the user story it was assigned to in a few steps
										succDepData._realFormattedID = succDepData.FormattedID;
										succDepData._realUserStoryName = succDepData.UserStoryName;
									}
									
									var lastAction = function(){ //This is the last thing to do!
										succDepRecord.set('Edited', false);
										me.SuccDepGrid.setLoading(false);
										me._isEditing = false;
									};
									
									var nextAction = function(){ //2nd to last thing to do
										var newUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', succDepData._realFormattedID, 0, false, true, true);
										if(newUserStoryRecord) addSuccDep(newUserStoryRecord, succDepData, lastAction);
										else lastAction();
									};
									
									var alertAndDelete = function(msg){
										alert(msg);
										console.log('removing succDep from user story', realDepData._realFormattedID, succDepData._realFormattedID);
										var userStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData._realFormattedID, 0, false, true, true);
										if(userStoryRecord) removeSuccDep(userStoryRecord, realDepData, function(){
											me.SuccDepGrid.setLoading(false);
											me._isEditing = false;
											me.CustomSuccDepStore.remove(succDepRecord);
										});
									};
									me._loadUserStoryByFID(succDepData.SuccFormattedID, project.get('_ref'), function(us){	
										if(!us) alertAndDelete('Successor UserStory has been deleted. Deleting Dependency Now');
										else {
											var deps = me._getDependencies(us);
											var rppData = deps.Preds[succDepData.DependencyID];
											if(rppData){
												var predDepData = {
													DependencyID: succDepData.DependencyID,
													FormattedID: us.get('FormattedID'),
													UserStoryName: us.get('Name'),
													Description: rppData.Desc,
													Checkpoint: rppData.CP,
													Status: rppData.Sta,
													Predecessors: rppData.Preds || [], //TID: ProjectID, ProjectName, Supported, Assigned, UserStoryName, US-FormattedID
													Edited: false //not in pending edit mode
												};
												var predecessors = predDepData.Predecessors;
												for(var i = 0;i<predecessors.length;++i){
													//have to make sure this dep is actually in the JSON teamDep object
													if(predecessors[i].PID == me.ProjectRecord.get('ObjectID')){ 
														predecessors[i].Sup = succDepData.Supported;
														predecessors[i].USID = succDepData._realFormattedID;
														predecessors[i].USName = succDepData._realUserStoryName;
														predecessors[i].A = succDepData.Assigned;
														addPredDep(us, predDepData);
												
														/***************************** UPDATE THE SUCC USER STORIES *********************/
	
														//move succ dep to new user story if needed, don't change it if set to ''
														if(realDepData && (realDepData._realFormattedID != succDepData._realFormattedID)){
															console.log('moving succDep to new user story', realDepData._realFormattedID, succDepData._realFormattedID);
															//we must remove risk from old userStory and add it to new userStory
															var oldUserStoryRecord = me.DependenciesUserStoryStore.findRecord('FormattedID', realDepData._realFormattedID, 0, false, true, true);
															if(oldUserStoryRecord) removeSuccDep(oldUserStoryRecord, realDepData, nextAction);
															else nextAction();
														}
														else nextAction();
														return;
													}
												}
												alertAndDelete('Successor removed your dependency. Deleting this dependency now');
											}
											else alertAndDelete('Successor removed this dependency. Deleting your dependency now');
										} 
									});
								}
							});
						}
					};
				}
			}
		];
		
		me.SuccDepGrid = me.add({
			xtype: 'rallygrid',
            title: "Successor Dependencies",
			width: _.reduce(succDepColumnCfgs, function(sum, c){ return sum + c.width; }, 20),
			height:400,
			x:0, y:1200,
			scroll:'vertical',
			columnCfgs: succDepColumnCfgs,
			plugins: [
				Ext.create('Ext.grid.plugin.CellEditing', {
					triggerEvent:'cellclick'
				})
			],
			viewConfig:{
				stripeRows:true,
				preserveScrollOnRefresh:true,
				getRowClass: function(predDepRecord){ return 'intel-row-35px'; }
			},
			listeners: {
				beforeedit: function(editor, e){
					if(e.record.get('Supported') == 'No' && e.field != 'Supported') return false; //don't user story stuff if not supported
					me._isEditing = true;
					return true;
				},
				canceledit: function(){
					me._isEditing = false;
				},
				edit: function(editor, e){					
					var grid = e.grid,
						succDepRecord = e.record,
						field = e.field,
						value = e.value,
						originalValue = e.originalValue;
						
					me._isEditing = false;
					console.log('succDep edit:', succDepRecord, field, value, originalValue);
					if(value === originalValue) return;
					var previousEdit = succDepRecord.get('Edited');
					succDepRecord.set('Edited', true);
					var userStoryRecord;
					if(field === 'UserStoryName'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('Name') === value; });
						if(!userStoryRecord){
							succDepRecord.set('UserStoryName', originalValue);
							succDepRecord.set('Edited', previousEdit); //not edited
						} else {
							succDepRecord.set('FormattedID', userStoryRecord.get('FormattedID'));	
							succDepRecord.set('Assigned', true);
						}
					} else if(field === 'FormattedID'){
						userStoryRecord = _.find(me.DependenciesReleaseUserStories, function(us){ return us.get('FormattedID') === value; });
						if(!userStoryRecord) {
							succDepRecord.set('FormattedID', originalValue);
							succDepRecord.set('Edited', previousEdit); //not edited
						} else {
							succDepRecord.set('UserStoryName', userStoryRecord.get('Name'));	
							succDepRecord.set('Assigned', true);
						}
					}
					else if(field === 'Supported'){ //cant be non-supported with a user story!
						if(value == 'No'){
							succDepRecord.set('Edited', true);
							succDepRecord.set('Assigned', false);
							succDepRecord.set('FormattedID', '');
							succDepRecord.set('UserStoryName', '');
						}
					}
				}
			},
			showRowActionsColumn:false,
			showPagingToolbar:false,
			enableEditing:false,
			context: this.getContext(),
			store: me.CustomSuccDepStore
		});	
	}	
});
