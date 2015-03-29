(function() {

    var Ext = window.Ext4 || window.Ext;

    /**
     * @private
     * Plugin for grid drag and drop
     */
    Ext.define('Rally.ui.grid.plugin.TreeViewDragDrop', {
        extend : 'Ext.tree.plugin.TreeViewDragDrop',
        alias : 'plugin.rallytreeviewdragdrop',

        requires: [
            'Rally.data.Ranker',
            'Rally.ui.grid.dragdrop.TreeDragZone',
            'Rally.ui.grid.dragdrop.TreeDropZone'
        ],

        config: {
            /**
             * @cfg {String} rankEnabledCls (required)
             * The css class to put on the view to signify rows are draggable.
             */
            rankEnabledCls: 'rank-enabled'
        },

        clientMetrics: [
            {
                beginMethod: '_onInitDrag',
                endEvent: 'drop',
                description: 'treegrid drag and drop'
            }
        ],

        init: function(view) {
            this.view = view;
            this.view.mon(this.view, 'storeload', this._onStoreLoad, this);
            this.view.mon(this.view, 'drop', this._onDrop, this);
            this.callParent(arguments);
        },

        destroy: function() {
            if (this.view && this.view.getEl()) {
                Ext.dd.ScrollManager.unregister(this.view.getEl());
            }
            this.callParent(arguments);
        },

        enable: function() {
            this._showRankColumn();
            this.callParent(arguments);
        },

        disable: function() {
            this._hideRankColumn();
            this.callParent(arguments);
        },

        onViewRender: function() {
            this._setupViewScroll();
            this._enableDragDrop();
        },

        _setupViewScroll: function() {
            var el = this.view.getEl();

            el.ddScrollConfig = {
                vthresh: 30,
                hthresh: -1,
                frequency: 350,
                increment: 50
            };
            Ext.dd.ScrollManager.register(el);
        },

        _enableDragDrop: function() {
            var me = this,
                scrollEl;

            if (me.enableDrag) {
                if (me.containerScroll) {
                    scrollEl = this.view.getEl();
                }
                me.dragZone = new Ext.tree.ViewDragZone({
                    view: this.view,
                    ddGroup: me.dragGroup || me.ddGroup,
                    dragText: me.dragText,
                    displayField: me.displayField,
                    repairHighlightColor: me.nodeHighlightColor,
                    repairHighlight: me.nodeHighlightOnRepair,
                    scrollEl: scrollEl
                });
            }

            if (me.enableDrop) {
                me.dropZone = new Ext.tree.ViewDropZone({
                    view: this.view,
                    ddGroup: me.dropGroup || me.ddGroup,
                    allowContainerDrops: me.allowContainerDrops,
                    appendOnly: me.appendOnly,
                    allowParentInserts: me.allowParentInserts,
                    expandDelay: me.expandDelay,
                    dropHighlightColor: me.nodeHighlightColor,
                    dropHighlight: me.nodeHighlightOnDrop,
                    sortOnDrop: me.sortOnDrop,
                    containerScroll: me.containerScroll
                });
            }
        },

        _getRankColumn: function() {
            var rankCol = this.view.headerCt.items.getAt(0);
            if (rankCol instanceof Rally.ui.grid.TreeRankDragHandleColumn) {
                return rankCol;
            }
            return null;
        },

        _showRankColumn: function() {
            if (!this.view.hasCls(this.rankEnabledCls)) {
                this.view.addCls(this.rankEnabledCls);
            }
        },

        _hideRankColumn: function() {
            this.view.removeCls(this.rankEnabledCls);
        },

        _onInitDrag: function() {
            if (this.dropZone) {
                this.dropZone.clearRowNodePositions();
            }
        },

        _onStoreLoad: function() {
            if (Rally.data.Ranker.isDnDRankable(this.view.getTreeStore())) {
                this.enable();
            } else {
                this.disable();
            }
        },

        _onDrop: function(rowEl, dropData, overModel, dropPosition, opts) {
            var droppedRecord = dropData.records[0];
            droppedRecord._dragAndDropped = true;

            this.view.ownerCt.setLoading(true);

            Rally.data.Ranker.rankRelative({
                recordToRank: droppedRecord,
                relativeRecord: overModel,
                position: dropPosition,
                saveOptions: {
                    callback: this._onRank,
                    scope: this
                }
            });
        },

        _onRank: function(record, operation) {
            delete record._dragAndDropped;
            this.view.ownerCt.setLoading(false);
        }
    });
})();