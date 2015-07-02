/** 
	DESCRIPTION:
		RiskIDs are in the form of risk-<releaseName>-<scrumGroupRootProjectObjectID>-<random string> 
		
		App only works with ScrumGroups that have been configured in WorkspaceConfig app. 
		You must have Database Project set in WorkspaceConfig app as well.
		
	DEPENDENCIES:
		font-awesome library
*/

(function(){
	var RiskDb = Intel.SAFe.lib.resource.RiskDb,
		RiskModel = Intel.SAFe.lib.model.Risk,
		SWIMLANE_AGREEMENT_PREF_NAME = 'risk-swimlane-agreements',
		DD_GROUP = 'risk-swimlane-dd-group';

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

	Ext.define('Intel.SAFe.RiskSwimlanes', {
		extend: 'Intel.lib.IntelRallyApp',
		cls:'RiskSwimlanesApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.UserAppsPreference'
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			id:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			}
		},{
			xtype:'container',
			id:'toolsbar',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				id:'toolsbarLeft',
				layout: 'hbox'
			},{
				xtype:'container',
				flex:2,
				id:'toolsbarRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		
		userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ UTIL FUNCS ___________________________________*/	
		generateRiskID: function(){
			return 'risk-' + this.ReleaseRecord.data.Name + '-' + 
				this.ScrumGroupRootRecord.data.ObjectID + '-' + 
				(new Date()*1 + '' + (Math.random()*10000 >> 0));
		},
		formatUserName: function(user){
			return user ? ((user.data.LastName + ', ' + user.data.FirstName) || user.data.UserName) : '?';
		},
		insertRiskIfValid: function(risks, risk){
			risks = _.filter(risks, function(_risk){ return _risk.RiskID !== risk.RiskID; });
			if(risk.ReleaseName === this.ReleaseRecord.data.Name) risks.push(risk);
			return _.sortBy(risks, function(risk){ return risk.RiskID; });
		},
		createPortfolioItemDropdownStores: function(portfolioItems){
			return {
				NameStore: Ext.create('Ext.data.Store', {
					fields: ['Name', 'ObjectID'],
					data: _.sortBy(_.map(portfolioItems, 
						function(portfolioItem){ return {Name: portfolioItem.data.Name, ObjectID: portfolioItem.data.ObjectID}; }),
						function(item){ return item.Name; })
				}),
				FIDStore: Ext.create('Ext.data.Store', {
					fields: ['FormattedID', 'ObjectID'],
					data: _.sortBy(_.map(portfolioItems, 
						function(portfolioItem){ return {FormattedID: portfolioItem.data.FormattedID, ObjectID: portfolioItem.data.ObjectID}; }),
						function(item){ return item.FormattedID; })
				})
			};
		},
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		loadPortfolioItemsByRelease: function(releaseName){
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'PortfolioItem/' + me.PortfolioItemTypes[0],
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: ['Name', 'FormattedID', 'ObjectID'],
					filters:[{ property:'Release.Name', value:releaseName}],
					context:{
						project: me.ScrumGroupPortfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me.reloadStore(store).then(function(store){ return store.getRange(); });
		},	
		loadRisks: function(){
			var me=this;
			return RiskDb.query('risk-' + me.ReleaseRecord.data.Name + '-' + me.ScrumGroupRootRecord.data.ObjectID + '-').then(function(risks){
				me.Risks = risks;
			});
		},
		loadUsers: function(){
			var me = this,
				userObjectIDs = _.reduce(me.Risks, function(oids, risk){
					if(oids.indexOf(risk.OwnerObjectID) === -1) oids.push(risk.OwnerObjectID);
					if(oids.indexOf(risk.SubmitterObjectID) === -1) oids.push(risk.SubmitterObjectID);
					return oids;
				}, [me.getContext().getUser().ObjectID]),
				userOIDFilter = _.reduce(userObjectIDs, function(filter, oid){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'ObjectID', value: oid });
					if(!filter) return newFilter; 
					else return filter.or(newFilter);
				}, null),
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'User',
					fetch: ['ObjectID', 'UserName', 'FirstName', 'LastName'],
					filters: [userOIDFilter],
					context: { workspace: me.getContext().getWorkspace()._ref }
				});
			return me.reloadStore(store).then(function(store){ 
				me.UsersOnRisks = store.getRange(); 
			});
		},
					
		/**___________________________________ SWIMLANE AGREEMENTS ___________________________________*/
		/** preference is tied to each individual rally app. It is a stringified map of column to html */
		saveSwimlaneAgreements: function(swimlaneAgreements){
			var me=this, s = {}, 
				deferred = Q.defer();
			s[SWIMLANE_AGREEMENT_PREF_NAME] = btoa(encodeURIComponent(JSON.stringify(swimlaneAgreements))); 
			Rally.data.PreferenceManager.update({
				appID: me.getAppId(),
				filterByName: SWIMLANE_AGREEMENT_PREF_NAME, 
				settings: s,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		},
		loadSwimlaneAgreements: function(){
			var me=this, deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				appID: me.getAppId(),
				filterByName: SWIMLANE_AGREEMENT_PREF_NAME, 
				success: function(prefs) {
					var swimlaneAgreementsString = prefs[SWIMLANE_AGREEMENT_PREF_NAME];
					try{ swimlaneAgreements = JSON.parse(decodeURIComponent(atob(swimlaneAgreementsString))); }
					catch(e){ swimlaneAgreements = _.reduce(RiskModel.getStatusOptions(), function(m, s){ m[s] = ''; return m; }, {}); }
					me.SwimlaneAgreements = swimlaneAgreements; 
					deferred.resolve();
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		renderSwimlanes: function(){
			this.renderRiskSwimlanes();
		},	
		clearEverything: function(){
			if(this.RiskSwimlanes) this.RiskSwimlanes.destroy();
			this.RiskSwimlanes = null;
		},
		reloadData: function(){
			var me = this;
			return Q.all([me.loadRisks(), me.loadPortfolioItemsByRelease(me.ReleaseRecord.data.Name)])
				.then(function(results){ me.PortfolioItemsInRelease = results[1]; })
				.then(function(){ return me.loadUsers(); });
		},	
		reloadEverything: function(){
			var me=this;
			me.setLoading('Loading Data');
			return me.reloadData()
				.then(function(){
					me.clearEverything();
					if(!me.ReleasePicker){
						me.renderReleasePicker();
						me.renderAddRiskButton();
						me.renderFilterByOwnerDropdown();
						me.renderShowAggrementsCheckbox();
					}
				})
				.then(function(){ me.renderSwimlanes(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); });
		},
		
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.ShowAgreements = false;
			me.setLoading('Loading configuration');
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this project');
				return;
			}	
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([
						me.projectInWhichScrumGroup(me.ProjectRecord)
							.then(function(scrumGroupRootRecord){
								if(scrumGroupRootRecord && me.ProjectRecord.data.ObjectID == scrumGroupRootRecord.data.ObjectID){
									me.ScrumGroupRootRecord = scrumGroupRootRecord;
									return me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
										.then(function(scrumGroupPortfolioProject){
											if(!scrumGroupPortfolioProject) return Q.reject('Invalid portfolio location');
											me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a valid project');
							}),
						me.loadAppsPreference()
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							}),
						me.loadProjectsWithTeamMembers().then(function(projectsWithTeamMembers){
							me.ProjectsWithTeamMembers = projectsWithTeamMembers;
						}),
						RiskDb.initialize(),
						me.loadSwimlaneAgreements()
					]);
				})
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			me.WorkweekData = me.getWorkweeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navbox').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},	
		renderAddRiskButton: function(){
			var me=this,
				userOID = me.getContext().getUser().ObjectID,
				submitter = _.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === userOID; });
			me.AddRiskButton = me.down('#toolsbarLeft').add({
				xtype:'button',
				text: '+ Add New',
				id: 'addNewButton',
				handler: function(){
					me.showRiskEditingModal(undefined, {}, submitter);
				}
			});
		},
		renderFilterByOwnerDropdown: function(){
			var me=this;
			me.FilterByOwnerDropdown = me.down('#toolsbarLeft').add({
				xtype: 'intelfixedcombobox',
				id: 'filterByOwnerDropdown',
				emptyText: 'Filter By Owner',
				store: Ext.create('Ext.data.Store', {
					fields: ['Name', 'ObjectID'],
					data: [{Name:'Clear Filter', ObjectID: 0}].concat(
						_.sortBy(_.map(me.UsersOnRisks, 
							function(user){ return {Name: me.formatUserName(user), ObjectID: user.data.ObjectID}; }),
							function(item){ return item.Name; })
					)
				}),
				displayField:'Name',
				valueField: 'ObjectID',
				listeners: {
					select: function(combo, newValues){
						var userOID = newValues[0].data.ObjectID;
						if(!userOID){
							me.setVisibleRisks(me.Risks.slice());
							combo.setValue('');
						}
						else me.setVisibleRisks(_.filter(me.Risks, function(risk){
							return risk.OwnerObjectID === userOID;
						}));
					}
				}
			});
		},
		renderShowAggrementsCheckbox: function(){
			var me = this;
			me.ShowAgreementsCheckbox = me.down('#toolsbarRight').add({
				xtype: 'checkbox',
				fieldLabel: 'Show Agreements',
				value: me.ShowAgreements,
				listeners: {
					change: function(combox, newVal){
						me.ShowAgreements = newVal;
						if(me.ShowAgreements) Ext.get(Ext.query('.swimlane-agreements-row')[0]).setStyle('display', 'flex');
						else Ext.get(Ext.query('.swimlane-agreements-row')[0]).setStyle('display', 'none');
						me.doLayout();
					}
				}
			});
		},
		
		/**___________________________________ RENDERING ___________________________________*/
		renderRisk: function(risk){
			var me = this,
				riskID = risk.RiskID,
				riskLevel = risk.RiskLevel,
				status = risk.Status,
				ownerName = me.formatUserName(_.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === risk.OwnerObjectID; })),
				dropArea = Ext.get('swimlaneDropArea-' + status + '___' + riskLevel),
				childNodes = dropArea.query('.swimlane-risk'),
				index = _.filter(childNodes, function(node){ return node.id.split('swimlaneRisk-')[1] < riskID; }).length,
				riskHTML = [
					'<div id="swimlaneRisk-' + riskID + '" class="swimlane-risk status-' + status + '">',
						'<div class="color-bar"></div>',
						'<div class="swimlane-risk-content">',
							'<div class="risk-field-label">Owner:</div><div class="risk-field-value">' + ownerName + '</div>',
							'<div class="risk-field-label">Description:</div><div class="risk-field-value">' + risk.Description + '</div>',
						'</div>',
						'<div class="swimlane-risk-tools">',
							'<div class="swimlane-risk-tools-box">',
								'<i class="tool swimlane-risk-edit-button fa fa-fw fa-pencil" title="Edit Risk"></i>',
								'<i class="tool swimlane-risk-copy-button fa fa-fw fa-files-o" title="Copy Risk"></i>',
								'<i class="tool swimlane-risk-delete-button fa fa-fw fa-trash" title="Delete Risk"></i>',
							'</div>',
						'</div>',
					'</div>'
				].join('\n');
				
			//add risk HTML to swimlanes
			if(index === childNodes.length) Ext.DomHelper.append(dropArea, riskHTML);
			else Ext.DomHelper.insertBefore(childNodes[index], riskHTML);
			
			//wire up event listeners
			Ext.get(Ext.query('#swimlaneRisk-' + riskID + ' .swimlane-risk-edit-button')).on('click', function(){
				var risk = _.find(me.Risks, function(risk){ return risk.RiskID === riskID; }),
					owner = _.find(me.UsersOnRisks, function(user){ return user.data.ObjectID === risk.OwnerObjectID; });
				me.showRiskEditingModal(riskID, risk, owner);
			});
			Ext.get(Ext.query('#swimlaneRisk-' + riskID + ' .swimlane-risk-copy-button')).on('click', function(){
				var risk = _.find(me.Risks, function(risk){ return risk.RiskID === riskID; }),
					newOwnerObjectID = me.getContext().getUser().ObjectID,
					newRiskID = me.generateRiskID(),
					newRisk = _.merge({}, risk, {RiskID: newRiskID, OwnerObjectID: newOwnerObjectID});
					
				me.setLoading('Copying Risk');
				RiskDb.create(newRiskID, newRisk)
					.then(function(riskJSON){ 
						me.Risks = me.insertRiskIfValid(me.Risks, riskJSON); 
						me.setVisibleRisks(me.Risks.slice());
					})
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ me.setLoading(false); })
					.done();
			});
			Ext.get(Ext.query('#swimlaneRisk-' + riskID + ' .swimlane-risk-delete-button')).on('click', function(){
				me.confirm('Delete Risk', 'Are you sure?', function(msg){
					if(msg.toLowerCase() !== 'yes') return;
					else {
						var risk = _.find(me.Risks, function(risk){ return risk.RiskID === riskID; });
						me.setLoading('Deleting Risk');
						RiskDb['delete'](riskID)
							.then(function(){ 
								me.Risks = _.filter(me.Risks, function(risk){ return risk.RiskID !== riskID; });
								Ext.get('swimlaneRisk-' + riskID).remove(); 
							})
							.fail(function(reason){ me.alert('ERROR', reason); })
							.then(function(){ me.setLoading(false); })
							.done();
					}
				});
			});
			
			//wire up drag and drop
			var dd = Ext.create('Ext.dd.DragSource', Ext.get('swimlaneRisk-' + riskID), {
				ddGroup: DD_GROUP
			});
			Ext.override(dd, {
				scroll: false, //don't scroll the window
				onStartDrag: function(){
					this.el.addCls('dragging');
					Ext.get(this.dragElId).setHeight(this.el.getHeight() + 10);
					Ext.get(this.dragElId).setWidth(this.el.getWidth() + 25);
				},
				beforeDragDrop: function(){
					this.el.removeCls('dragging');
				},
				beforeInvalidDrop: function(){
					this.el.removeCls('dragging');
				}
			});
		},
		setVisibleRisks: function(risks){
			var me = this,
				bodyEl = Ext.query('.swimlane-body')[0],
				scrollTop = bodyEl.scrollTop;
			_.each(Ext.query('.swimlane-risk'), function(riskEl){ riskEl.remove(); });
			_.each(risks, function(risk){ me.renderRisk(risk); });
			bodyEl.scrollTop = scrollTop;
		}, 
		
		renderRiskSwimlanes: function(){
			var me = this;
			me.RiskSwimlanes = me.add({
				xtype:'container',
				flex:1,
				html: [
					'<div class="swimlanes">',
						'<div class="swimlane-header">',
							'<div class="swimlane-column-header-row">',
								_.map(RiskModel.getStatusOptions(), function(statusOption){
									return [
										'<div class="swimlane-column-header">',
											statusOption,
										'</div>'
									].join('\n');
								}).join('\n'),
							'</div>',
							'<div class="swimlane-agreements-row">',
								_.map(RiskModel.getStatusOptions(), function(statusOption){
									return [
										'<div id="' + statusOption + '-agreements-cell" class="swimlane-agreements-cell">',
											'<div class="swimlane-agreements-edit-section">Exit Agreement',
												'<a class="swimlane-agreements-edit-link" href="#">(Edit)</a>',
											'</div>',
											'<div class="swimlane-agreements-user-content">',
												me.SwimlaneAgreements[statusOption],
											'</div>',
										'</div>'
									].join('\n');
								}).join('\n'),
							'</div>',
						'</div>',
						'<div class="swimlane-body">',
							_.map(RiskModel.getRiskLevelOptions(), function(riskLevelOption){
								return [
									'<div class="swimlane-header-row collapsed">',
										'<div class="swimlane-header-row-left">',
											riskLevelOption,
										'</div>',
										'<div class="swimlane-header-row-right">',
											'<i class="fa fa-arrow-up"></i>',
											'<i class="fa fa-arrow-down"></i>',
											'<i class="fa fa-arrow-up"></i>',
										'</div>',
									'</div>',
									'<div class="swimlane-row">',
										_.map(RiskModel.getStatusOptions(), function(statusOption){
											return [
												'<div id="swimlaneDropArea-' + statusOption + '___' + riskLevelOption + '" class="swimlane-drop-area">',
												'</div>'
											].join('\n');
										}).join('\n'),
									'</div>'
								].join('\n');
							}).join('\n'),
						'</div>',
					'</div>'
				].join('\n')
			});
			
			//set header margin so it aligns with vertical scrollbar
			Ext.get(Ext.query('.swimlane-header')).setStyle('margin-right', getScrollbarWidth() + 'px');
			
			//add listeners for swimlane agreements
			_.each(Ext.query('.swimlane-agreements-edit-link'), function(el){
				el = Ext.get(el);
				var parent = el.parent('.swimlane-agreements-cell'),
					statusOption = parent.id.split('-')[0];
				Ext.get(el).on('click', function(){
					me.showSwimlaneAgreementEditor(statusOption);
				});
			});		
			//add listeners for row expand-collapsing
			_.each(Ext.query('.swimlane-header-row'), function(el){
				el = Ext.get(el);
				el.on('click', function(){ el.toggleCls('collapsed'); });
			});
			
			//wire up drag and drop
			var swimlaneBody = Ext.get(Ext.query('.swimlane-body')[0]);
			swimlaneBody.ddScrollConfig = {
				ddGroup: DD_GROUP,
				vthresh : 25,
				animate: false,
				frequency: 100,
				increment: 25
			};
			Ext.dd.ScrollManager.register(swimlaneBody);
			setInterval(function(){ Ext.dd.ScrollManager.refreshCache(); }, 100);
			_.each(Ext.query('.swimlane-drop-area'), function(el){
				var dd = Ext.create('Ext.dd.DropTarget', el, {
					ddGroup: DD_GROUP
				});
				Ext.override(dd, {
					scroll: false, //don't scroll the window
					notifyEnter: function(src){
						Ext.get(Ext.query('.swimlane-risk-placeholder')).remove();
						var riskCard = src.el, 
							riskID = riskCard.id.split('swimlaneRisk-')[1],
							childNodes = this.el.query('.swimlane-risk'),
							index = _.filter(childNodes, function(node){ return node.id.split('swimlaneRisk-')[1] < riskID; }).length,
							originalDropArea = riskCard.up('.swimlane-drop-area'),
							placeholderHTML = [
								'<div class="swimlane-risk-placeholder" style="height:' + riskCard.getHeight() + 'px;">',
								'</div>'
							].join('\n');
							
						if(originalDropArea.dom !== this.el.dom){
							if(index === childNodes.length) Ext.DomHelper.append(this.el, placeholderHTML);
							else Ext.DomHelper.insertBefore(childNodes[index], placeholderHTML);
						}
					},
					notifyOut: function(src){
						Ext.get(this.el.query('.swimlane-risk-placeholder')).remove();
					},
					notifyDrop: function(src){
						var dropEl = this.el,
							riskCard = src.el, 
							riskID = riskCard.id.split('swimlaneRisk-')[1],
							riskJSON = _.find(me.Risks, function(risk){ return risk.RiskID === riskID; }),
							splitID = dropEl.id.split('-').slice(1).join('-').split('___'),
							newStatus = splitID[0],
							newRiskLevel = splitID[1];
							
						me.setLoading('Saving Risk');
						riskJSON.Status = newStatus;
						riskJSON.RiskLevel = newRiskLevel;
						RiskDb.update(riskID, riskJSON)
							.then(function(riskJSON){
								me.Risks = me.insertRiskIfValid(me.Risks, riskJSON);
								riskCard.remove();
								Ext.get(dropEl.el.query('.swimlane-risk-placeholder')).remove();
								me.renderRisk(riskJSON);
							})
							.fail(function(reason){ me.alert('ERROR', reason); })
							.then(function(){ me.setLoading(false); })
							.done();
						return true;
					}
				});
			});
			
			//add risks
			_.each(me.Risks, function(risk){ me.renderRisk(risk); });
			
			//expand the top two rows
			_.each(Ext.query('.swimlane-header-row'), function(el){
				el = Ext.get(el);
				if(el.getHTML().indexOf('High') > -1) el.removeCls('collapsed');
				else if(el.getHTML().indexOf('Medium') > -1) el.removeCls('collapsed');
			});
		},
		showSwimlaneAgreementEditor: function(statusOption){
			var me = this,
				modal = Ext.create('Ext.window.Window', {
					modal:true,
					closable:true,
					resizable: true,
					width: 500,
					y: 5,
					title: 'Edit the Exit Agreement for "' + statusOption + ' Risks"',
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
						value: me.SwimlaneAgreements[statusOption],
						flex:1
					},{
						xtype:'container',
						layout:'hbox',
						items:[{
							xtype:'button',
							text:'Cancel',
							handler: function(){
								modal.destroy();
							}
						},{
							xtype:'button',
							text:'Save',
							handler: function(){
								var html = modal.down('htmleditor').getValue();
								me.SwimlaneAgreements[statusOption] = html;
								me.setLoading('Saving');
								me.saveSwimlaneAgreements(me.SwimlaneAgreements)
									.then(function(){
										Ext.get(Ext.query('#' + statusOption + '-agreements-cell')[0])
											.down('.swimlane-agreements-user-content')
											.setHTML(html);
										modal.destroy();
									})
									.fail(function(reason){ me.alert('ERROR', reason); })
									.then(function(){ me.setLoading(false); })
									.done();
							}
						}]
					}]
				});
			setTimeout(function(){ modal.show(); }, 10);
		},
		showRiskEditingModal: function(riskID, riskJSON, submitter){
			var me = this,
				isExistingRisk = !!riskID,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				currentReleaseRecord = me.ReleaseRecord,
				currentPortfolioItemRecords = me.PortfolioItemsInRelease,
				getReleaseNameComponent = function(){
					var releaseNameStore = Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: _.sortBy(_.map(me.ReleaseRecords, 
							function(release){ return {Name: release.data.Name, ObjectID: release.data.ObjectID}; }),
							function(item){ return item.Name; });
					});
					return isExistingRisk ? {
						xtype: 'intelcombobox',
						id: 'editRiskModal-ReleaseName',
						emptyText: 'Select Release',
						fieldLabel: 'Release',
						value: _.find(releaseNameStore.getRange(), function(item){ return item.data.Name === riskJSON.ReleaseName; }),
						store: releaseNameStore,
						displayField: 'Name',
						valueField: 'ObjectID',
						listeners: { 
							select: function(combo, records){
								var releaseName = records[0].data.Name;
								if(releaseName === currentReleaseRecord.data.Name) return;
								currentReleaseRecord = records[0];
								me.setLoading('Loading Data');
								me.loadPortfolioItemsByRelease(releaseName).then(function(portfolioItems){
									currentPortfolioItemRecords = portfolioItems;
									updateComponents();
								})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){ me.setLoading(false); })
								.done();
							}
						}
					} : {
						xtype: 'displayfield',
						id: 'editRiskModal-ReleaseName',
						fieldLabel: 'Release',
						value: me.ReleaseRecord.data.Name
					};
				},
				getPortfolioItemFIDDropdown = function(){
					var portfolioItemFIDStore = me.createPortfolioItemDropdownStores(currentPortfolioItemRecords).FIDStore;
					return {
						xtype: 'intelcombobox',
						id: 'editRiskModal-PortfolioItemObjectID-FID',
						emptyText: 'Select ' + lowestPortfolioItemType + ' by #',
						fieldLabel: lowestPortfolioItemType + ' #',
						value: _.find(portfolioItemFIDStore.getRange(), function(item){ return item.data.ObjectID === riskJSON.PortfolioItemObjectID; }) || undefined,
						store: portfolioItemFIDStore,
						displayField: 'FormattedID',
						valueField: 'ObjectID',
						listeners: {
							select: function(combo, records){
								var nameCmp = Ext.getCmp('editRiskModal-PortfolioItemObjectID-Name');
								if(nameCmp.getValue() === records[0].data.ObjectID) return;
								else nameCmp.setValue(records[0].data.ObjectID);
							}
						}
					};
				},
				getPortfolioItemNameDropdown = function(){
					var portfolioItemNameStore = me.createPortfolioItemDropdownStores(currentPortfolioItemRecords).NameStore;
					return {
						xtype: 'intelcombobox',
						id: 'editRiskModal-PortfolioItemObjectID-Name',
						emptyText: 'Select ' + lowestPortfolioItemType + ' by Name',
						fieldLabel: lowestPortfolioItemType + ' Name',
						value: _.find(portfolioItemNameStore.getRange(), function(item){ return item.data.ObjectID === riskJSON.PortfolioItemObjectID; }) || undefined,
						store: portfolioItemNameStore,
						displayField: 'Name',
						valueField: 'ObjectID',
						listeners: {
							select: function(combo, records){
								var fidCmp = Ext.getCmp('editRiskModal-PortfolioItemObjectID-FID');
								if(fidCmp.getValue() === records[0].data.ObjectID) return;
								else fidCmp.setValue(records[0].data.ObjectID);
							}
						}
					};
				},
				getProjectDropdown = function(){
					var projectStore = Ext.create('Ext.data.Store', {
						fields: ['Name', 'ObjectID'],
						data: [{Name:'None', ObjectID: undefined}].concat(_.sortBy(_.map(projectsWithTeamMembers, 
							function(project){ return {Name: project.data.Name, ObjectID: project.data.ObjectID}; }),
							function(item){ return item.Name; }))
					});
					return {
						xtype: 'intelcombobox',
						id: 'editRiskModal-ProjectObjectID',
						emptyText: 'Select Project',
						fieldLabel: 'Project (optional)',
						value: _.find(projectStore.getRange(), function(item){ return item.data.ObjectID === riskJSON.ProjectObjectID; }) || undefined,
						store: projectStore,
						displayField: 'Name',
						valueField: 'ObjectID'
					};
				},
				getCheckpointDropdown = function(){
					var workweekStore = Ext.create('Ext.data.Store', {
						fields: ['DateVal', 'Workweek'],
						data: me.getWorkweeksForDropdown(currentReleaseRecord.data.ReleaseStartDate, currentReleaseRecord.data.ReleaseDate)
					});
					return {
						xtype: 'intelfixedcombobox',
						id: 'editRiskModal-Checkpoint',
						emptyText: 'Select Checkpoint',
						fieldLabel: 'Checkpoint',
						value: _.find(workweekStore.getRange(), function(item){ return item.data.DateVal === riskJSON.Checkpoint; }) || undefined,
						store: workweekStore,
						displayField: 'Workweek',
						valueField: 'DateVal'
					};
				},
				updateComponents = function(){ 	
					Ext.getCmp('editRiskModal').add(_.map(Ext.getCmp('editRiskModal').removeAll(), function(cmp){
						switch(cmp.id){
							case 'editRiskModal-ReleaseName': return getReleaseNameComponent();
							case 'editRiskModal-PortfolioItemObjectID-FID': return getPortfolioItemFIDDropdown();
							case 'editRiskModal-PortfolioItemObjectID-Name': return getPortfolioItemNameDropdown();
							case 'editRiskModal-ProjectObjectID': return getProjectDropdown();
							case 'editRiskModal-Checkpoint': return getCheckpointDropdown();
							default: return cmp;
						}
					}));
				},
				modal = Ext.create('Ext.window.Window', {
					modal: true,
					closable: true,
					resizable: true,
					id: 'editRiskModal',
					title: (isExistingRisk ? 'Edit Risk' : 'New Risk'),
					width: 400,
					padding:'2px 5px 2px 5px',
					height: Math.min(400, (window.innerHeight - 20)),
					y: 5,
					overflowY: 'auto',
					items: [
						getReleaseNameComponent(),
						{
							xtype: 'displayfield',
							fieldLabel: 'Submitted By',
							value: me.formatUserName(submitter)
						},{
							xtype: 'inteluserpicker',
							id: 'editRiskModal-OwnerObjectID',
							emptyText: 'Select Owner',
							fieldLabel: 'Owner',
							value: _.find(me.UsersOnRisks, function(item){ return item.data.ObjectID === riskJSON.OwnerObjectID; }) || undefined,
							displayField: 'Name',
							valueField: 'ObjectID'
						}, 
						getPortfolioItemFIDDropdown(),
						getPortfolioItemNameDropdown(),
						getProjectDropdown(),
						getCheckpointDropdown(),
						{
							xtype: 'inteltextarea',
							id: 'editRiskModal-Description',
							emptyText: 'Enter Description',
							value: riskJSON.Description,
							fieldLabel: 'Description'
						},{
							xtype: 'inteltextarea',
							id: 'editRiskModal-Impact',
							emptyText: 'Enter Impact',
							value: riskJSON.Impact,
							fieldLabel: 'Impact'
						},{
							xtype: 'inteltextarea',
							id: 'editRiskModal-MitigationPlan',
							emptyText: 'Enter MitigationPlan',
							value: riskJSON.MitigationPlan,
							fieldLabel: 'MitigationPlan'
						},{
							xtype: 'intelfixedcombobox',
							id: 'editRiskModal-RiskLevel',
							emptyText: 'Select RiskLevel',
							fieldLabel: 'RiskLevel',
							value: riskJSON.RiskLevel,
							store: Ext.create('Ext.data.Store', {
								fields: ['Name'],
								data: _.map(RiskModel.getRiskLevelOptions(), function(option){ return {Name: option}; })
							}),
							displayField: 'Name'
						},{
							xtype: 'intelfixedcombobox',
							id: 'editRiskModal-Status',
							emptyText: 'Select Status',
							fieldLabel: 'Status',
							value: riskJSON.Status,
							store: Ext.create('Ext.data.Store', {
								fields: ['Name'],
								data: _.map(RiskModel.getStatusOptions(), function(option){ return {Name: option}; })
							}),
							displayField: 'Name'
						},{
							xtype:'container',
							layout:'hbox',
							style: {
								borderTop: '1px solid gray'
							},
							items:[{
								xtype:'button',
								text:'Cancel',
								handler: function(){ modal.destroy(); }
							},{
								xtype:'button',
								text: (isExistingRisk ? 'Save Risk' : 'Create Risk'),
								handler: function(){
									var riskJSON = {
											ReleaseName:           Ext.getCmp('editRiskModal-ReleaseName').getValue(),
											PortfolioItemObjectID: Ext.getCmp('editRiskModal-PortfolioItemObjectID-Name').getValue(),
											ProjectObjectID:       Ext.getCmp('editRiskModal-ProjectObjectID').getValue() || undefined,
											Description:           Ext.getCmp('editRiskModal-Description').getValue(),
											Impact:                Ext.getCmp('editRiskModal-Impact').getValue(),
											MitigationPlan:        Ext.getCmp('editRiskModal-MitigationPlan').getValue(),
											RiskLevel:             Ext.getCmp('editRiskModal-RiskLevel').getValue(),
											Status:                Ext.getCmp('editRiskModal-Status').getValue(),
											Checkpoint:            Ext.getCmp('editRiskModal-Checkpoint').getValue(),
											OwnerObjectID:         Ext.getCmp('editRiskModal-OwnerObjectID').getValue(),
											SubmitterObjectID:     submitter.data.ObjectID
										},
										action = (isExistingRisk ? 'update' : 'create'),
										actionRiskID = riskID || me.generateRiskID(); //if we are editing risk, use old RiskID otherwise generate new RiskID
									
									me.setLoading('Saving Risk');
									RiskDb[action](actionRiskID, riskJSON)
										.then(function(riskJSON){
											me.Risks = me.insertRiskIfValid(me.Risks, riskJSON);
											me.setVisibleRisks(me.Risks.slice());
											modal.destroy();
										})
										.fail(function(reason){ me.alert('ERROR', reason); })
										.then(function(){ me.setLoading(false); })
										.done();
								}
							}]
						}
					]
				});
			
			setTimeout(function(){ 
				me.setLoading('Loading Data');
				if(isExistingRisk){
					currentRelease = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name === riskJSON.ReleaseName; });
					me.loadPortfolioItemsByRelease(currentRelease.data.Name)
						.then(function(portfolioItems){ currentPortfolioItemRecords = portfolioItems; })
						.then(function(){ updateComponents(); })
						.fail(function(reason){ me.alert(reason): })
						.then(function(){ me.setLoading(false); })
						.done();
				}
				else me.setLoading(false);
			}, 10);				
		}
	});
}());