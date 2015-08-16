/** 
SUMMARY:
	Swimlane card for intelswimlanes component
*/

(function(){
	var Ext = window.Ext4 || window.Ext,
		DD_GROUP = 'swimlanes-dd-group';	
	
	Ext.define('Intel.lib.component.swimlane.SwimlaneCard', {
		extend:'Ext.Component',
		alias: ['widget.intelswimlanecard'], 
		
		/*************************************** initialize/private methods *****************************************/
		initComponent: function(){
			var card = this;
			card.id = card.id || Ext.id();
			card.html = card._createHTML();
			card.on('afterrender', card._wireEventListeners, card, {single: true});
			card.callParent();
    },
		_createHTML: function(){
			var card = this,
				cardData = card.data, 
				cardID = card.id, 
				cardOptions = card.cardOptions,
				displayFields = card.displayFields,
				customDisplayFieldRenderers = card.customDisplayFieldRenderers,
				colNum = (card.parentSwimlanes.getColNames().indexOf(this.colName) + 1),
				canEdit = cardOptions.indexOf('edit') > -1,
				canCopy = cardOptions.indexOf('copy') > -1,
				canDelete = cardOptions.indexOf('delete') > -1;
				
			return [
				'<div class="swimlane-card column-' + colNum + '">',
					'<div class="color-bar"></div>',
					'<div class="swimlane-card-content">',
						_.map(displayFields, function(displayField){
							return [
								'<div class="card-field-label">' + displayField + ':</div>',
								'<div class="card-field-value">',
									customDisplayFieldRenderers[displayField] ? customDisplayFieldRenderers[displayField](cardData[displayField]) : cardData[displayField],
								'</div>'
							].join('');
						}).join('\n'),
					'</div>',
					'<div class="swimlane-card-tools">',
						'<div class="swimlane-card-tools-box">',
							canEdit ? '<i class="tool swimlane-card-edit-button fa fa-fw fa-pencil" title="Edit"></i>' : '',
							canCopy ? '<i class="tool swimlane-card-copy-button fa fa-fw fa-files-o" title="Copy"></i>' : '',
							canDelete ? '<i class="tool swimlane-card-delete-button fa fa-fw fa-trash" title="Delete"></i>' : '',
						'</div>',
					'</div>',
				'</div>'
			].join('\n');
		},
		_wireEventListeners: function(){
			var card = this, cardEl = card.el;
		
			//wire up event listeners
			Ext.get(cardEl.query('.swimlane-card-edit-button')).on('click', function(){ card.parentSwimlanes.onCardEdit(card); });
			Ext.get(cardEl.query('.swimlane-card-copy-button')).on('click', function(){ card.parentSwimlanes.onCardCopy(card); });
			Ext.get(cardEl.query('.swimlane-card-delete-button')).on('click', function(){ card.parentSwimlanes.onCardDelete(card); });
			
			//wire up drag and drop
			var dd = Ext.create('Ext.dd.DragSource', cardEl, { ddGroup: DD_GROUP });
			Ext.override(dd, {
				scroll: false, //don't scroll the window
				onStartDrag: function(){
					Ext.get(cardEl.query('.swimlane-card')).addCls('dragging');
					Ext.get(this.dragElId).setHeight(this.el.getHeight() + 10);
					Ext.get(this.dragElId).setWidth(this.el.getWidth() + 25);
				},
				beforeDragDrop: function(){
					Ext.get(cardEl.query('.swimlane-card')).removeCls('dragging');
				},
				beforeInvalidDrop: function(){
					Ext.get(cardEl.query('.swimlane-card')).removeCls('dragging');
				}
			});
		},
		
		_reRenderCard: function(){
			this.el.setHTML(this._createHTML());
			this._wireEventListeners();
			this.parentSwimlanes._renderCard(this);
			if(!this.parentSwimlanes._shouldShowCard(this)) this.hide();
		},
		
		/*************************************** public methods *****************************************/
		getData: function(){
			return this.data;
		},
		getColName: function(){
			return this.colName;
		},
		getRowName: function(){
			return this.rowName;
		},
		getDisplayFields: function(){
			return this.displayFields;
		},
		setData: function(data){
			this.data = data;
			this._reRenderCard();
		},
		setColName: function(colName){
			this.colName = colName;
			this._reRenderCard();
		},
		setRowName: function(rowName){
			this.rowName = rowName;
			this._reRenderCard();
		},
		setDisplayFields: function(displayFields){
			this.displayFields = displayFields;
			this._reRenderCard();
		},
		doHighlight: function(){
			this.el.down('.swimlane-card-content').highlight("8dc63f", { attr: 'backgroundColor', duration: 1000 });
		}
	});
}());