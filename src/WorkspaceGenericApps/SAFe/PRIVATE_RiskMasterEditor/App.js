(function(){
	var Ext = window.Ext4 || window.Ext,
		RiskDb = Intel.SAFe.lib.resource.RiskDb;

	Ext.define('Intel.SAFe.RiskMasterEditor', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins: [
			'Intel.lib.mixin.PrettyAlert'
		],
	
		minWidth:910, /** thats when rally adds a horizontal scrollbar for a pagewide app */

		/**___________________________________ DATA STORE METHODS ___________________________________*/		
		loadRisks: function(){
			var me=this;
			return RiskDb.query('risk-').then(function(risks){
				me.Risks = risks;
			});
		},

		/**___________________________________ LAUNCH ___________________________________*/
		launch: function(){
			var me = this;
			me.setLoading('Loading Configuration');
			RiskDb.initialize()
				.then(function(){ return me.loadRisks(); })
				.then(function(){ me.loadGrid(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},

		/**___________________________________ RENDER GRID ___________________________________*/	
		loadGrid: function(){
			var me = this;
			var columnCfgs = [{
				dataIndex:'RiskID',
				width:300,
				text: 'RiskID',
				editor:false,
				draggable:false,
				sortable:true,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls'
			},{
				dataIndex:'RiskJSON',
				flex:1,
				text: 'RiskJSON',
				editor:{
					xtype:'textarea',
					grow:true,
					growMin:20,
					growMax:350
				},
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				tdCls:'pre-wrap-cell intel-editor-cell',
				cls:'header-cls'
			},{
				text:'',
				width:24,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, gridRecord, row, col){
					var realRisk = _.find(me.Risks, function(r){ return r.RiskID === gridRecord.data.RiskID; }),
						clickFnName = 'Click' + gridRecord.id.replace(/\-/g, 'z').replace('Ext.data.Store.ImplicitModel', '') + 'Fn' + col;
					meta.tdAttr = 'title="Undo"';
					window[clickFnName] = function(){
						gridRecord.set('RiskJSON', JSON.stringify(realRisk, null, '  '));
						gridRecord.commit();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-undo"></i></div>';
				}
			},{
				text:'',
				width:24,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, gridRecord, row, col){
					var clickFnName = 'Click' + gridRecord.id.replace(/\-/g, 'z').replace('Ext.data.Store.ImplicitModel', '') + 'Fn' + col;
					meta.tdAttr = 'title="Save Risk"';
					window[clickFnName] = function(){
						var newRiskJSON;
						try { newRiskJSON = JSON.parse(gridRecord.data.RiskJSON); }
						catch(e){ me.alert('ERROR', e); return; }
						me.setLoading("Saving item");
						RiskDb.update(gridRecord.data.RiskID, newRiskJSON)
							.then(function(newRiskJSON){
								_.each(me.Risks, function(e, i, a){
									if(e.RiskID === newRiskJSON.RiskID) a[i] = newRiskJSON;
								});
							})
							.fail(function(reason){ me.alert('ERROR', reason); })
							.then(function(){ me.setLoading(false); })
							.done();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-floppy-o"></i></div>';
				}
			},{
				text:'',
				width:24,
				editor:false,
				draggable:false,
				sortable:false,
				resizable:false,
				menuDisabled:true,
				cls:'header-cls',
				renderer: function(value, meta, gridRecord, row, col){
					var clickFnName = 'Click' + gridRecord.id.replace(/\-/g, 'z').replace('Ext.data.Store.ImplicitModel', '') + 'Fn' + col;
					meta.tdAttr = 'title="Delete Risk"';
					window[clickFnName] = function(){
						me.setLoading("Deleting item");
						RiskDb['delete'](gridRecord.data.RiskID)
							.then(function(){
								me.Risks = _.filter(me.Risks, function(e){ return e.RiskID !== gridRecord.data.RiskID; });
								gridRecord.destroy();
							})
							.fail(function(reason){ me.alert('ERROR', reason); })
							.then(function(){ me.setLoading(false); })
							.done();
					};
					return '<div class="intel-editor-cell" onclick="' + clickFnName + '()"><i class="fa fa-md fa-trash"></i></div>';
				}
			}];
			
			me.add({
				xtype: 'grid',
				title:'All Risks',
				height:400,
				cls: 'custom-field-grid',
				scroll:'vertical',
				columns: columnCfgs,
				disableSelection: true,
				enableEditing:true,
				plugins: [Ext.create('Ext.grid.plugin.CellEditing', {clicksToEdit: 1})],
				store: Ext.create('Rally.data.custom.Store', {
					fields: ['RiskID', 'RiskJSON'],
					data: me.Risks.map(function(risk){ return {RiskID: risk.RiskID, RiskJSON: JSON.stringify(risk, null, '  ')}; })
				})
			});	
		}
	});
}());