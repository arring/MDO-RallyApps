/** 
	RiskIDs are in the form of risk-<releaseName>-<scrumGroupRootProjectObjectID>-<random string> 
	
	App only works with ScrumGroups that have been configured in WorkspaceConfig app. 
	You must have Database Project set in WorkspaceConfig app as well.
*/

(function(){
	var RiskDb = Intel.SAFe.lib.resources.RiskDb;

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
			itemId:'navbox',
			layout: {
				type:'hbox',
				align:'stretch',
				pack:'start'
			},
			items:[{
				xtype:'container',
				flex:3,
				itemId:'navboxLeft',
				layout: 'hbox'
			},{
				xtype:'container',
				flex:2,
				itemId:'navboxRight',
				layout: {
					type:'hbox',
					pack:'end'
				}
			}]
		}],
		minWidth:910,
		
		userAppsPref: 'intel-SAFe-apps-preference',
		
		/**___________________________________ UTIL FUNCS ___________________________________*/	
		_getRandomString: function(){
			return new Date()*1 + '' + (Math.random()*10000 >> 0);
		},
		generateRiskID: function(){
			return 'risk-' + this.ReleaseRecord.data.Name + '-' + this.ScrumGroupRootRecord.data.ObjectID + '-' + this._getRandomString();
		},
		
		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: loadPortfolioItemsOfTypeInRelease');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store', {
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					disableMetaChangeEvent: true,
					remoteSort:false,
					fetch: ['Name', 'ObjectID', 'FormattedID', 'c_Risks', 'Release', 
						'Project', 'PlannedEndDate', 'Parent', 'PortfolioItemType', 'Ordinal'],
					filters:[{ property:'Release.Name', value:me.ReleaseRecord.data.Name}],
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me.reloadStore(store);
		},	
		loadPortfolioItems: function(){ 
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) : 
						me.loadPortfolioItemsOfTypeInRelease(me.ScrumGroupPortfolioProject, type)
					);
				}))
				.then(function(portfolioItemStores){
					if(me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
					me.PortfolioItemStore = portfolioItemStores[0];
					
					//make the mapping of lowest to highest portfolioItems
					me.PortfolioItemMap = {};
					_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItemRecord){ //create the portfolioItem mapping
						var ordinal = 0, 
							parentPortfolioItemRecord = lowPortfolioItemRecord,
							getParentRecord = function(child, parentList){
								return _.find(parentList, function(parent){ 
									return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; 
								});
							};
						while(ordinal < (portfolioItemStores.length-1) && parentPortfolioItemRecord){
							parentPortfolioItemRecord = getParentRecord(parentPortfolioItemRecord, portfolioItemStores[ordinal+1].getRange());
							++ordinal;
						}
						if(ordinal === (portfolioItemStores.length-1) && parentPortfolioItemRecord) //has a mapping, so add it
							me.PortfolioItemMap[lowPortfolioItemRecord.data.ObjectID] = parentPortfolioItemRecord.data.Name;
					});
					
					//destroy the stores, so they get GCed
					portfolioItemStores.shift();
					while(portfolioItemStores.length) portfolioItemStores.shift().destroyStore();
				});
		},		

		loadRisks: function(){
			var me=this;
			return RiskDb.query('risk-' + me.ReleaseRecord.data.Name + '-' + me.ScrumGroupRootRecord.data.ObjectID + '-').then(function(risks){
				me.Risks = risks;
			});
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
			return this.loadRisks();
		},	
		reloadEverything: function(){
			var me=this;
			me.setLoading('Loading Data');
			return me.reloadData()
				.then(function(){
					me.clearEverything();
					if(!me.ReleasePicker) me.renderReleasePicker();
					if(!me.AddRiskButton) me.renderAddRiskButton();
				})
				.then(function(){ me.renderSwimlanes(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); });
		},
		
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
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
						me.projectInWhichScrumGroup(me.ProjectRecord) /********* 1 ************/
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
						me.loadAppsPreference() /********* 2 ************/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me.loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease){
									me.ReleaseRecord = currentRelease;
									me.WorkweekData = me.getWorkWeeksForDropdown(currentRelease.data.ReleaseStartDate, currentRelease.data.ReleaseDate);
								}
								else return Q.reject('This project has no releases.');
							}),
						me.loadProjectsWithTeamMembers() /********* 3 ************/
							.then(function(projectsWithTeamMembers){
								me.ProjectsWithTeamMembers = projectsWithTeamMembers;
								me.ProjectNames = _.map(projectsWithTeamMembers, function(project){ return {Name: project.data.Name}; });
							}),
						RiskDb.initialize() /********* 4 ************/
					]);
				})
				.then(function(){ return me.loadPortfolioItems(); })
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
			me.WorkweekData = me.getWorkWeeksForDropdown(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate);
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
			me.ReleasePicker = me.down('#navboxLeft').add({
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
			var me=this;
			me.AddRiskButton = me.down('#navboxRight').add({
				xtype:'button',
				text: 'Add Risk',
				handler: function(){
					var modal = Ext.create('Ext.window.Window', {
						modal:true,
						closable:true,
						width: 500,
						height: 300,
						y: 5,
						items: [{
							xtype: 'container',
							html:'<b>New Risk</b>'
						},{
							xtype:'fieldcontainer',
							layout:'hbox',
							items: [{
								//necessary fields go here
							}]
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
								text:'Create Risk',
								handler: function(){
									var riskJSON = {
										ReleaseName: me.ReleaseRecord.data.Name,
										PortfolioItemObjectID: undefined,
										ProjectObjectID: undefined,
										Description: '',
										Impact: '',
										MitigationPlan: '',
										Urgency: RiskDb.URGENCY_OPTIONS[0],
										Status: RiskDb.STATUS_OPTIONS[0],
										Contact: '',
										Checkpoint: me.WorkweekData[0].DateVal
									};
									
									me.setLoading('Creating Risk');
									RiskDb.create(me._generateRiskID(), riskJSON)
										.then(function(riskJSON){
											me.RiskSwimlanes.addCard(Ext.create('Intel.SAFe.lib.models.SwimlaneRisk', riskJSON));
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
				}
			});
		},
		
		/************************************************************* RENDER ********************************************************************/
		renderRiskSwimlanes: function(){
			var me = this;

			me.RiskSwimlanes = me.add({
				xtype:'container',
				html: [
					'<div class="swimlanes">',
						'<div class="swimlane-column-header-row">',
							_.map(RiskDb.STATUS_OPTIONS, function(statusOption){
								return [
									'<div class="swimlane-column-header">',
										statusOption,
									'</div>'
								].join('\n');
							}).join('\n'),
						'</div>',
						'<div class="swimlane-body">',
							_.map(RiskDb.URGENCY_OPTIONS, function(urgencyOption){
								return [
									'<div class="swimlane-header-row">',
										urgencyOption,
									'</div>',
									'<div class="swimlane-row">',
										_.map(RiskDb.STATUS_OPTIONS, function(statusOption){
											return [
												'<div id="swimlaneDropArea-' + statusOption + '___' + urgencyOption + '" class="swimlane-drop-area">',
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
			
			_.each(me.Risks, function(risk){
				var urgency = risk.Urgency,
					status = risk.Status,
					dropArea = Ext.get('swimlaneDropArea-' + status + '___' + urgency);
				Ext.DomHelper.append(dropArea, [
					'<div id="swimlaneRisk-' + risk.RiskID + '" class="swimlane-risk">',
						'<div class="' + status + '-' + urgency + '-card-color"></div>',
						'<div class="swimlane-risk-card-content">',
							'Urgency: ' + urgency + '<br/>',
							'Status: ' + status + '<br/>',
							'Description: ' + risk.Description + '<br/>',
						'</div>',
					'</div>'
				].join('\n'));
			});
		}
	});
}());