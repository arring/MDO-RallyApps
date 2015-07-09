/** 
	SUMMARY:
		Swimlanes that are generic, and have limited functionality compared to Rally's built in swimlanes.

	EXAMPLE: 
		
		var swimlanes = Ext.create({
			xtype:'intelswimlanes',
			rowNames: ['High', 'Medium', 'Low'],
			colNames: ['Open', 'WIP', 'Closed'],
			displayFields: ['Owner', 'Description'],
			filters: [new Ext.util.Filter({property:'Owner', value:'Jim'})],
			cardOptions: ['edit', 'copy', 'delete']
			onCardEdit: function(card){},																			//template, do override this. return promise(newFields) when done editing
			onCardMove: function(card, newRow, newCol, oldRow, oldCol){},			//template, do override this. return promise() when done moving
			onCardCopy: function(card){},																			//template, do override this. return promise() when done copying
			onCardDelete: function(card){},																		//template, do override this. return promise() when done deleting
			sortFn: function(cardCmp1, cardCmp2){},														//template: you MUST override this. return cards[] sorted.
		});
				
		swimlanes.createCard({ Owner:'Jim', Description: 'A swimlane card'}, colName, rowName);
		swimlanes.addFilter(new Ext.util.Filter({filterFn: function(card){ return card.fields.Owner.match(/Jim/); } }));
		swimlanes.getFilters();
		swimlanes.clearFilters();
		swimlanes.setDisplayFields(['a', 'b', 'c']);
		swimlanes.getDisplayFields();
		swimlanes.expandRow('High');
*/

(function(){
	var Ext = window.Ext4 || window.Ext,
		SWIMLANE_AGREEMENT_PREF_NAME = 'intel-swimlane-agreements-preference',
		DD_GROUP = 'swimlanes-dd-group';
	
	function getScrollbarWidth() {
    var outer = document.createElement("div");
    outer.style.visibility = "hidden";
    outer.style.width = "100px";
    outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps
		
    document.body.appendChild(outer);

    var widthNoScroll = outer.offsetWidth;
    // force scrollbars
    outer.style.overflow = "scroll";

    // add innerdiv
    var inner = document.createElement("div");
    inner.style.width = "100%";
    outer.appendChild(inner);        

    var widthWithScroll = inner.offsetWidth;

    // remove divs
    outer.parentNode.removeChild(outer);

    return (widthNoScroll - widthWithScroll);
	}

	Ext.define('Intel.lib.component.swimlane.Swimlanes', {
		extend:'Ext.Component',
		alias: ['widget.intelswimlanes'], 
		
		rowNames: [],
		colNames: [],
		displayFields: [],
		filters: [],
		swimlaneAgreements: {},
		cardOptions: ['edit', 'copy', 'delete'],
		
		/*************************************** private/initialize functions *****************************************/
		initComponent: function(){
			var swimlanes = this;
			swimlanes.id = swimlanes.id || Ext.id();
			swimlanes.html = swimlanes._createHTML();
			swimlanes.on('afterrender', swimlanes._wireEventListeners, swimlanes, {single: true});
			swimlanes.callParent();
    },
		
		_saveSwimlaneAgreements: function(swimlaneAgreements){
			var s = {}, deferred = Ext.create('Deft.Deferred');
			s[SWIMLANE_AGREEMENT_PREF_NAME] = btoa(encodeURIComponent(JSON.stringify(swimlaneAgreements))); 
			Rally.data.PreferenceManager.update({
				appID: Rally.getApp().getAppId(),
				filterByName: SWIMLANE_AGREEMENT_PREF_NAME, 
				settings: s,
				success: deferred.resolve.bind(deferred),
				failure: deferred.reject.bind(deferred)
			});
			return deferred.promise;
		},
		_loadSwimlaneAgreements: function(){
			var swimlanes = this, deferred = Ext.create('Deft.Deferred');
			Rally.data.PreferenceManager.load({
				appID: Rally.getApp().getAppId(),
				filterByName: SWIMLANE_AGREEMENT_PREF_NAME, 
				success: function(prefs) {
					var swimlaneAgreementsString = prefs[SWIMLANE_AGREEMENT_PREF_NAME];
					try{ swimlaneAgreements = JSON.parse(decodeURIComponent(atob(swimlaneAgreementsString))); }
					catch(e){ swimlaneAgreements = _.reduce(swimlanes.colNames, function(map, colName){ map[colName] = ''; return map; }, {}); }
					swimlanes.swimlaneAgreements = swimlaneAgreements; 
					deferred.resolve();
				},
				failure: deferred.reject.bind(deferred)
			});
			return deferred.promise;
		},
		
		_createHTML: function(){
			var rowNames = this.rowNames, 
				colNames = this.colNames,
				swimlaneAgreements = this.swimlaneAgreements;
			
			return [
				'<div class="swimlanes">',
					'<div class="swimlane-header">',
						'<div class="swimlane-column-header-row">',
							_.map(colNames, function(colName){
								return [
									'<div class="swimlane-column-header">',
										colName,
									'</div>'
								].join('\n');
							}).join('\n'),
						'</div>',
						'<div class="swimlane-agreements-row">',
							_.map(colNames, function(colName){
								return [
									'<div class="swimlane-agreements-cell swimlanes-agreements-cell-' + colName + '">',
										'<div class="swimlane-agreements-edit-section">Exit Agreement',
											'<a class="swimlane-agreements-edit-link" href="#">(Edit)</a>',
										'</div>',
										'<div class="swimlane-agreements-user-content">',
											swimlaneAgreements[colName],
										'</div>',
									'</div>'
								].join('\n');
							}).join('\n'),
						'</div>',
					'</div>',
					'<div class="swimlane-body">',
						_.map(rowNames, function(rowName){
							return [
								'<div class="swimlane-header-row collapsed">',
									'<div class="swimlane-header-row-left">',
										rowName,
									'</div>',
									'<div class="swimlane-header-row-right">',
										'<i class="fa fa-arrow-up"></i>',
										'<i class="fa fa-arrow-down"></i>',
										'<i class="fa fa-arrow-up"></i>',
									'</div>',
								'</div>',
								'<div class="swimlane-row">',
									_.map(colNames, function(colName){
										return [
											'<div class="swimlane-drop-area swimlane-drop-area-' + colName + '-' + rowName + '">',
											'</div>'
										].join('\n');
									}).join('\n'),
								'</div>'
							].join('\n');
						}).join('\n'),
					'</div>',
				'</div>'
			].join('\n');
		},
		
		_wireEventListeners: function(){
			var swimlanes = this, swimlanesEl = this.getEl();
			
			//set header margin so it aligns with vertical scrollbar
			Ext.get(swimlanesEl.query('.swimlane-header')).setStyle('margin-right', getScrollbarWidth() + 'px');
			
			//add listeners for swimlane agreements
			_.each(swimlanesEl.query('.swimlane-agreements-edit-link'), function(dom){
				var linkEl = Ext.get(dom), 
					swimlaneAgreementCellEl = linkEl.parent('.swimlane-agreements-cell'), 
					colName = swimlanes._getColNameFromAgreementsCell(swimlaneAgreementCellEl);
				linkEl.on('click', function(){ swimlanes._showSwimlaneAgreementEditor(colName); });
			});		
			
			//add listeners for row expand-collapsing
			_.each(swimlanesEl.query('.swimlane-header-row'), function(dom){
				var swimlaneHeaderRowEl = Ext.get(dom);
				swimlaneHeaderRowEl.on('click', function(){ swimlaneHeaderRowEl.toggleCls('collapsed'); });
			});
			
			//wire up drag and drop
			var swimlaneBodyEl = Ext.get(swimlanesEl.query('.swimlane-body')[0]);
			swimlaneBodyEl.ddScrollConfig = {
				ddGroup: DD_GROUP,
				vthresh : 25,
				animate: false,
				frequency: 100,
				increment: 25
			};
			Ext.dd.ScrollManager.register(swimlaneBodyEl);
			setInterval(function(){ Ext.dd.ScrollManager.refreshCache(); }, 100);
			
			_.each(swimlanesEl.query('.swimlane-drop-area'), function(dom){
				var dd = Ext.create('Ext.dd.DropTarget', dom, { ddGroup: DD_GROUP });
				
				Ext.override(dd, {
					scroll: false, //don't scroll the window
					notifyEnter: function(src){
						var dropAreaEl = this.el,
							cardEl = src.el,
							cardCmp = Ext.getCmp(cardEl.id),
							currentChildCardCmps =  _.filter(_.map(dropAreaEl.dom.childNodes, function(dom){ return Ext.getCmp(dom.id); }), function(cmp){ return cmp; }),
							insertIndex = swimlanes._getCardInsertIndex(cardCmp, currentChildCardCmps),
							originalDropArea = cardEl.up('.swimlane-drop-area'),
							placeholderHTML = [
								'<div class="swimlane-card-placeholder" style="height:' + cardEl.getHeight() + 'px;">',
								'</div>'
							].join('\n');
							
						Ext.get(dropAreaEl.up('.swimlanes').query('.swimlane-card-placeholder')).remove();
						if(originalDropArea.dom !== dropAreaEl.dom){
							if(insertIndex === currentChildCardCmps.length) Ext.DomHelper.append(dropAreaEl, placeholderHTML);
							else Ext.DomHelper.insertBefore(currentChildCardCmps[insertIndex].el, placeholderHTML);
						}
					},
					notifyOut: function(src){
						var dropAreaEl = this.el;
						Ext.get(dropAreaEl.query('.swimlane-card-placeholder')).remove();
					},
					notifyDrop: function(src){
						var dropAreaEl = this.el,
							cardEl = src.el, 
							cardCmp = Ext.getCmp(cardEl.id),
							dropAreaValues = swimlanes._getColAndRowFromDropAreaEl(dropAreaEl),
							newColName = dropAreaValues.colName,
							newRowName = dropAreaValues.rowName,
							oldColName = cardCmp.getColName(),
							oldRowName = cardCmp.getRowName();
							
						swimlanes.onCardMove(cardCmp, newColName, newRowName, oldColName, oldRowName);
						Ext.get(dropAreaEl.up('.swimlanes').query('.swimlane-card-placeholder')).remove();
						return true;
					}
				});
			});
		},
		_getColNameFromAgreementsCell: function(swimlaneAgreementCellEl){
			var cls = swimlaneAgreementCellEl.getAttribute('class');
			return _.find(this.colNames, function(colName){ return cls.indexOf('swimlanes-agreements-cell-' + colName) > -1; });
		},
		_showSwimlaneAgreementEditor: function(colName){
			var swimlanes = this, swimlanesEl = swimlanes.el,
				modal = Ext.create('Rally.ui.dialog.Dialog', {
					modal:true,
					closable:true,
					resizable: true,
					draggable: true,
					width: 500,
					y: 10,
					title: 'Edit the Exit Agreement for "' + colName + ' Column"',
					layout:{
						type:'vbox',
						align:'stretch'
					},
					items: [{
						xtype:'container',
						html: 'What needs to be done before an item is ready to leave this column?',
						margin:'2px 0 5px 0'
					},{
						xtype:'htmleditor',
						enableColors: true,
						value: swimlanes.swimlaneAgreements[colName],
						flex:1
					},{
						xtype:'container',
						layout:'hbox',
						items:[{
							xtype:'button',
							text:'Cancel',
							handler: function(){ modal.destroy(); }
						},{
							xtype:'button',
							text:'Save',
							handler: function(){
								var html = modal.down('htmleditor').getValue();
								swimlanes.swimlaneAgreements[colName] = html;
								swimlanes.setLoading('Saving');
								swimlanes._saveSwimlaneAgreements(swimlanes.swimlaneAgreements)
									.then({
										success: function(){
											Ext.get(swimlanesEl.query('.swimlanes-agreements-cell-' + colName)[0])
												.down('.swimlane-agreements-user-content')
												.setHTML(html);
											modal.destroy();
										},
										failure: function(reason){ throw new Error(reason); }
									})
									.always(function(){ swimlanes.setLoading(false); });
							}
						}]
					}]
				});
			setTimeout(function(){ modal.show(); }, 10);
		},
		_getColAndRowFromDropAreaEl: function(dropAreaEl){
			var cls = _.filter(dropAreaEl.getAttribute('class').split(' '), function(cls){ 
				return cls !== 'swimlane-drop-area' && cls.indexOf('swimlane-drop-area') === 0;
			})[0].split('-');
			return {
				rowName: cls.pop(),
				colName: cls.pop()
			};
		},		
		
		_renderCard: function(cardCmp){
			var swimlanes = this,
				dropAreaEl = Ext.get(swimlanes.el.query('.swimlane-drop-area-' + cardCmp.getColName() + '-' + cardCmp.getRowName())[0]),
				currentChildCardCmps =  _.filter(_.map(dropAreaEl.dom.childNodes, function(dom){ return Ext.getCmp(dom.id); }), function(cmp){ return cmp; }),
				insertIndex = swimlanes._getCardInsertIndex(cardCmp, currentChildCardCmps);
			if(!cardCmp.rendered && insertIndex === currentChildCardCmps.length) cardCmp.render(dropAreaEl);
			else if(!cardCmp.rendered) cardCmp.render(dropAreaEl, currentChildCardCmps[insertIndex].el);
			else if(insertIndex === currentChildCardCmps.length) cardCmp.el.appendTo(dropAreaEl);
			else cardCmp.el.insertBefore(currentChildCardCmps[insertIndex].el);
		},
		
		_getCardInsertIndex: function(insertCardCmp, cardCmps){
			var sortFn = this.sortFn;
			return _.filter(cardCmps, function(cardCmp){ return sortFn(insertCardCmp, cardCmp) === -1; }).length;
		},
		_shouldShowCard: function(card){
			return Ext.util.Filter.createFilterFn(this.filters)(card);
		},
		
		/*************************************** templates to override *****************************************/
		onCardEdit: function(){ },
		onCardMove: function(){ },
		onCardCopy: function(){ },
		onCardDelete: function(){ },
		sortFn: function(card1, card2){ return -1; },
		
		/*************************************** public methods *****************************************/
		createCard: function(cardData, colName, rowName){
			var newCard = Ext.create('Intel.lib.component.swimlane.SwimlaneCard', {
				displayFields: this.displayFields,
				cardOptions: this.cardOptions,
				parentSwimlanes: this,
				colName: colName,
				rowName: rowName,
				data: cardData
			});
			this._renderCard(newCard);
			if(!this._shouldShowCard(newCard)) newCard.hide();
			return newCard;
		},
		
		filter: function(){
			var swimlanes = this, 
				cards = swimlanes.getCards(),
				filterFn = Ext.util.Filter.createFilterFn(swimlanes.filters);
				
			_.each(cards, function(card){
				if(filterFn(card)) card.show();
				else card.hide();
			});
		},
		addFilter: function(filter){
			this.filters.push(new Ext.util.Filter(filter));
			this.filter();
		},	
		getFilters: function(){
			return this.filters;
		},
		clearFilters: function(){
			this.filters = [];
			this.filter();
		},
		
		setDisplayFields: function(displayFields){
			var swimlanes = this;
			swimlanes.displayFields = displayFields;
			_.each(swimlanes.getCards(), function(cardCmp){
				cardCmp.setDisplayFields(displayFields);
				swimlanes._renderCard(cardCmp);
			});
		},
		getDisplayFields: function(){
			return this.displayFields;
		},
		
		getColNames: function(){
			return this.colNames;
		},
		getRowNames: function(){
			return this.rowNames;
		},
		
		expandRow: function(rowName){
			_.each(this.el.query('.swimlane-header-row'), function(dom){
				var swimlaneHeaderRowEl = Ext.get(dom);
				if(swimlaneHeaderRowEl.getHTML().indexOf(rowName) > -1) swimlaneHeaderRowEl.removeCls('collapsed');
			});
		},
		collapseRow: function(rowName){
			_.each(this.getEl().query('.swimlane-header-row'), function(dom){
				var swimlaneHeaderRowEl = Ext.get(dom);
				if(swimlaneHeaderRowEl.getHTML().indexOf(rowName) > -1) swimlaneHeaderRowEl.addCls('collapsed');
			});
		},
		
		showAgreements: function(){
			var swimlanes = this, swimlanesEl = swimlanes.el;
			swimlanes.setLoading('Loading Agreements');	
			swimlanes._loadSwimlaneAgreements()
				.then({
					success: function(){
						var agreementsRowEl = Ext.get(swimlanes.el.query('.swimlane-agreements-row')[0]);
						_.each(swimlanes.swimlaneAgreements, function(html, colName){
							var userContentEl = Ext.get(agreementsRowEl.query('.swimlanes-agreements-cell-' + colName + ' .swimlane-agreements-user-content'));
							if(userContentEl) userContentEl.setHTML(html);
						});
						agreementsRowEl.setStyle('display', 'flex');
					},
					failure: function(reason){ throw new Error(reason); }
				})
				.always(function(){ swimlanes.setLoading(false); });
		},
		hideAgreements: function(){
			Ext.get(this.el.query('.swimlane-agreements-row')).setStyle('display', 'none');
		},
		
		getCards: function(){
			return _.map(this.el.query('.swimlane-card'), function(cardDom){ return Ext.getCmp(Ext.get(cardDom).parent().id); });
		}
	});
}());