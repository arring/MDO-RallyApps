Ext.define('Intel.view.ScrollTable', {  //keeps the scrollbar steady. Cant believe Extjs cant do this
	extend: 'Ext.view.Table',
	alias: 'widget.scrolltableview',
	
	constructor: function(cfg) {
		var me = this;
		me.callParent(arguments);
	},
	
	refresh: function() {
		var me = this,
			targetEl,
			targetParent,
			oldDisplay,
			nextSibling,
			dom,
			records,
			el = me.getEl(),
			scroll = el && el.getScrollTop();
			
		if (!me.rendered || me.isDestroyed) return;

		if (!me.hasListeners.beforerefresh || me.fireEvent('beforerefresh', me) !== false) {
			targetEl = me.getTargetEl();
			records = me.getViewRange();
			dom = targetEl.dom;
			if (!me.preserveScrollOnRefresh) {
				targetParent = dom.parentNode;
				oldDisplay = dom.style.display;
				dom.style.display = 'none';
				nextSibling = dom.nextSibling;
				targetParent.removeChild(dom);
			}
			if (me.refreshCounter) me.clearViewEl();
			else {
				me.fixedNodes = targetEl.dom.childNodes.length;
				me.refreshCounter = 1;
			}
			me.tpl.append(targetEl, me.collectData(records, me.all.startIndex));

			if (records.length < 1) {
				if (!this.store.loading && (!me.deferEmptyText || me.hasFirstRefresh)) {
					Ext.core.DomHelper.insertHtml('beforeEnd', targetEl.dom, me.emptyText);
				}
				me.all.clear();
			} else {
				me.collectNodes(targetEl.dom);
				me.updateIndexes(0);
			}
			if (me.hasFirstRefresh) {
				if (me.refreshSelmodelOnRefresh !== false) {
					me.selModel.refresh();
				} else {
					me.selModel.pruneIf();
				}
			}
			me.hasFirstRefresh = true;

			if (!me.preserveScrollOnRefresh) {
				targetParent.insertBefore(dom, nextSibling);
				dom.style.display = oldDisplay;
			}

			Ext.suspendLayouts();
			this.refreshSize();
			me.fireEvent('refresh', me);
			Ext.resumeLayouts(true);
			
			if (!me.viewReady) {
				me.viewReady = true;
				me.fireEvent('viewready', me);
			}
		}
		
		if(scroll && me.preserveScrollOnRefresh) el.setScrollTop(scroll);
	},
	
	onRemove : function(ds, records, indexes) {
		var me = this,
			fireItemRemove = me.hasListeners.itemremove,
			i,
			record,
			index,
			el = me.getEl(),
			scroll = el && el.getScrollTop();

		if (me.all.getCount()) {
			if (me.dataSource.getCount() === 0) {
				if (fireItemRemove) {
					for (i = indexes.length - 1; i >= 0; --i) {
						me.fireEvent('itemremove', records[i], indexes[i]);
					}
				}
				me.refresh();
			} else {
				for (i = indexes.length - 1; i >= 0; --i) {
					record = records[i];
					index = indexes[i];
					me.doRemove(record, index);
					if (fireItemRemove) {
						me.fireEvent('itemremove', record, index);
					}
				}
				me.updateIndexes(indexes[0]);
			}
			this.refreshSize();
			if(scroll && me.preserveScrollOnRefresh) el.setScrollTop(scroll);
		}
	},
	
	onUpdate : function(ds, record){
		var me = this,
			index,
			node,
			el = me.getEl(),
			scroll = el && el.getScrollTop();

		if (me.viewReady) {
			index = me.dataSource.indexOf(record);
			if (index > -1) {
				node = me.bufferRender([record], index)[0];
				if (me.getNode(record)) {
					me.all.replaceElement(index, node, true);
					me.updateIndexes(index, index);
					me.selModel.onUpdate(record);
					if (me.hasListeners.itemupdate) {
						me.fireEvent('itemupdate', record, index, node);
					}
					return node;
				}
			}
			if(scroll && me.preserveScrollOnRefresh) el.setScrollTop(scroll);
		}
	},
	
	onAdd : function(store, records, index) {
		var me = this,
			nodes,
			el = me.getEl(),
			scroll = el && el.getScrollTop();

		if (me.rendered) {
			if (me.all.getCount() === 0) {
				me.refresh();
				nodes = me.all.slice();
			} else {
				nodes = me.doAdd(records, index);
				if (me.refreshSelmodelOnRefresh !== false) {
					me.selModel.refresh();
				}
				me.updateIndexes(index);
				//me.refreshSize(); //already being refreshed by store.sync()
			}

			if (me.hasListeners.itemadd) {
				me.fireEvent('itemadd', records, index, nodes);
			}
			if(scroll && me.preserveScrollOnRefresh) el.setScrollTop(scroll);
		}
	},

	scrollRowIntoView: function(row) {
		if(row===0){
			this.getEl().setScrollTop(0);
			return;
		}
		row = this.getNode(row, true);
		if (row) {
			Ext.fly(row).scrollIntoView(this.el, false);
		}
	}
});