(function(){
    var Ext = window.Ext4 || window.Ext;
    /************************** Data Integrity Dashboard *****************************/
    Ext.define('Intel.PortfolioDataIntegrityDashboard', {
        extend: 'Intel.lib.IntelRallyApp',
        cls:'app',
        mixins:[
            'Intel.lib.mixin.WindowListener',
            'Intel.lib.mixin.PrettyAlert',
            'Intel.lib.mixin.IframeResize',
            'Intel.lib.mixin.IntelWorkweek',
            'Intel.lib.mixin.ParallelLoader',
            'Intel.lib.mixin.CustomAppObjectIDRegister',
            'Intel.lib.mixin.HorizontalTeamTypes',
            'Intel.lib.mixin.Caching'
        ],
        minWidth:1100,

        /**
         This layout consists of:
         Top horizontal bar for controls
         Horizontal bar for a pie chart and heat map (the 'ribbon')
         Two columns (referred to as Left and Right) for grids
         */
        items:[{
            xtype:'container',
            id: 'cacheButtonsContainer'
        },{
            xtype: 'container',
            id: 'navContainer',
            layout:'hbox',
            items:[{
                xtype:'container',
                id: 'controlsContainer',
                layout:'vbox',
                width:260
            },{
                xtype:'container',
                id: 'emailLinkContainer',
                width: 150
            },{
                xtype:'container',
                id: 'cacheMessageContainer'
            },{
                xtype:'container',
                id: 'integrityIndicatorContainer',
                flex:1
            }]
        },{
            xtype: 'container',
            id: 'ribbon',
            cls:'ribbon',
            layout: 'column',
            items: [{
                xtype: 'container',
                width:480,
                id: 'pie'
            },{
                xtype: 'container',
                columnWidth:0.999,
                id: 'heatmap'
            }]
        },{
            xtype: 'button',
            id: 'expand-heatmap-button',
            text: 'Expand Heatmap'
        },{
            xtype:'container',
            id:'gridsContainer',
            cls:'grids-container',
            layout: 'column',
            items: [{
                xtype: 'container',
                columnWidth:0.495,
                id: 'gridsLeft',
                cls:'grids-left'
            },{
                xtype: 'container',
                columnWidth:0.495,
                id: 'gridsRight',
                cls:'grids-right'
            }]
        }],
        chartColors: [
            '#AAAAAA', //GRAY
            '#2ECC40', //GREEN
            '#7FDBFF', //AQUA
            '#DDDDDD', //SILVER
            '#39CCCC', //TEAL
            '#01FF70', //LIME
            '#FFDC00', //YELLOW
            '#0074D9' //BLUE
        ],
    launch: function() {
        //Write app code here

        //API Docs: https://help.rallydev.com/apps/2.1/doc/
    }
    });
})();
