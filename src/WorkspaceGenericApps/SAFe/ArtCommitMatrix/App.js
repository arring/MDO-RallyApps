/** 
	this app will probably get buggy if you have multiple projects with the same name or portfolioItems with the same name
	Because i never tested for that.
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		COLUMN_DEFAULTS = {
			text:'',
			resizable: false,
			draggable: false,
			sortable: false,
			editor: false,
			menuDisabled: true,
			renderer: function(val){ return val || '-'; },
			layout: 'hbox'
		};
	
	Ext.define('Intel.SAFe.ArtCommitMatrix', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.AsyncQueue',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.CfdProjectPreference',
			'Intel.lib.mixin.RallyReleaseColor',
			'Intel.lib.mixin.HorizontalTeamTypes',
			'Intel.lib.mixin.CustomAppObjectIDRegister',
			'Intel.lib.mixin.Caching'
		],
		//minWidth:910,
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
				flex:1,
				itemId:'navboxLeft',
				layout: 'hbox',
				items:[{
					xtype:'container',
					flex:1,
					itemId:'navboxLeftVert',
					layout: 'vbox'
				}]
			}, {
				xtype:'container',
				flex:2,
				cls:'cacheContainer',
				items:[{
					xtype:'container',
					id: 'cacheMessageContainer'
				}, {
					xtype: 'container',
					id:'cacheButtonsContainer'
				}]
			}, {
				xtype:'container',
				flex:2,
				items:[{
					xtype: 'container',
					layout: {
						type:'hbox',
						pack:'end'
					},
					itemId:'navboxRight'
				}]
			}]
		}],
		minWidth:910,
		/*--------------------------------------------APP SETTINGS----------------------------------- */
		settingsScope: 'workspace',
		getSettingsFields: function() {
			return [{
				name: 'cacheUrl', 
				xtype: 'rallytextfield' 
			}];
		},
		config: {
			defaultSettings: {
				cacheUrl: 'https://localhost:45557/api/v1.0/custom/rally-app-cache/'
			}
		},
		userAppsPref: 'intel-SAFe-apps-preference',
		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		loadPortfolioItems: function(){ 
			var me=this, deferred = Q.defer();
			me.portfolioItemFields =["Name", "ObjectID", "FormattedID", "Release", "c_TeamCommits", /* "c_MoSCoW", */ "c_Risks", "Project", "PlannedEndDate", "Parent", "Children", "PortfolioItemType", "Ordinal", "PercentDoneByStoryPlanEstimate","DragAndDropRank"];
			me.enqueue(function(done){
				Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
					return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
							me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, type) : 
							me.loadPortfolioItemsOfTypeInRelease(me.ReleaseRecord, me.ScrumGroupPortfolioProject, type)
						);
					}))
					.then(function(portfolioItemStores){
						if(me.PortfolioItemStore) me.PortfolioItemStore.destroyStore(); //destroy old store, so it gets GCed
						me.PortfolioItemStore = portfolioItemStores[0];
						me.PortfolioItemMap = me.createBottomPortfolioItemObjectIDToTopPortfolioItemNameMap(portfolioItemStores);
						
						//destroy the stores, so they get GCed
						portfolioItemStores.shift();
						while(portfolioItemStores.length) portfolioItemStores.shift().destroyStore();
					})
					.then(function(){done(); deferred.resolve(); })
					.fail(function(reason){ done(); deferred.reject(reason); })
					.done();
				}, 'PortfolioItemQueue');
			return deferred.promise;
		},		
		getUserStoryQuery: function(portfolioItemRecords){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				storyNotAttachedToPorfolio =	Ext.create('Rally.data.wsapi.Filter', { property: 'Project.Parent.ObjectID',operator: '!= ', value: me.ScrumGroupPortfolioProject.data.ObjectID }),
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: me.ReleaseRecord.data.Name }),
				portfolioItemFilter = _.reduce(portfolioItemRecords, function(filter, portfolioItemRecord){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', {
						property: lowestPortfolioItemType + '.ObjectID',
						value: portfolioItemRecord.data.ObjectID
					});
					return filter ? filter.or(newFilter) : newFilter;
				}, null);
				var finalFilter = me.ScrumGroupAndPortfolioConfig ? releaseFilter.and(leafFilter).and(portfolioItemFilter) : releaseFilter.and(leafFilter).and(storyNotAttachedToPorfolio).and(portfolioItemFilter);
				return portfolioItemFilter ? finalFilter : null;
		},
		loadUserStories: function(){
			/** note: lets say the lowest portfolioItemType is 'Feature'. If we want to get child user stories under a particular Feature,
					we must query and fetch using the Feature field on the UserStories, NOT PortfolioItem. PortfolioItem field only applies to the 
					user Stories directly under the feature
				*/
			var me = this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				newMatrixUserStoryBreakdown = {},
				newMatrixProjectMap = {},
				newProjectOIDNameMap = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group
				
			return Q.all(_.map(_.chunk(me.PortfolioItemStore.getRange(), 20), function(portfolioItemRecords){
				var filter = me.getUserStoryQuery(portfolioItemRecords),
					config = {
						model: 'HierarchicalRequirement',
						filters: filter ? [filter] : [],
						fetch:['Name', 'ObjectID', 'Project', 'Release', 'PlanEstimate', 'FormattedID', 'ScheduleState', lowestPortfolioItemType],
						context: {
							workspace:me.getContext().getWorkspace()._ref,
							project: null
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						//Some user stories are attached to Portfolio which we want to ignore
						var portfolioItemName = storyRecord.data[lowestPortfolioItemType].Name,
							projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						if(!newMatrixUserStoryBreakdown[projectName]) 
							newMatrixUserStoryBreakdown[projectName] = {};
						if(!newMatrixUserStoryBreakdown[projectName][portfolioItemName]) 
							newMatrixUserStoryBreakdown[projectName][portfolioItemName] = [];
						newMatrixUserStoryBreakdown[projectName][portfolioItemName].push(storyRecord.data);						
						newMatrixProjectMap[projectName] = storyRecord.data.Project.ObjectID; //this gets called redundantly each loop
						newProjectOIDNameMap[projectOID] = projectName;
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.MatrixUserStoryBreakdown = newMatrixUserStoryBreakdown;
				me.MatrixProjectMap = newMatrixProjectMap;
				me.ProjectOIDNameMap = newProjectOIDNameMap;
						
				//always show the teams under the scrum-group that have teamMembers > 0, even if they are not contributing this release
				_.each(me.ProjectsWithTeamMembers, function(projectRecord){
					var projectName = projectRecord.data.Name,
						projectOID = projectRecord.data.ObjectID;
					if(!me.MatrixProjectMap[projectName]) me.MatrixProjectMap[projectName] = projectRecord.data.ObjectID;
					if(!me.MatrixUserStoryBreakdown[projectName]) me.MatrixUserStoryBreakdown[projectName] = {};
					me.ProjectOIDNameMap[projectOID] = projectName;
				});			
			});
		},		
			
		/**___________________________________ TEAM COMMITS STUFF ___________________________________**/	
		getTeamCommits: function(portfolioItemRecord){
			var me=this;
			var	tcString = portfolioItemRecord.data.c_TeamCommits;
			try{ return JSON.parse(atob(tcString)) || {}; }
			catch(e){ return {}; }
		},	
		getTeamCommit: function(portfolioItemRecord, projectName){	
			var me=this,
				projectID = me.MatrixProjectMap[projectName],
				teamCommits = me.getTeamCommits(portfolioItemRecord);
			return teamCommits[projectID] || {};
		},	
		setTeamCommitsField: function(portfolioItemRecord, projectName, field, value){
			var me=this,
				projectID = me.MatrixProjectMap[projectName],
				teamCommits = me.getTeamCommits(portfolioItemRecord),
				deferred = Q.defer();	
			if(!teamCommits[projectID]) teamCommits[projectID] = {};
			teamCommits[projectID][field] = value;		
			var str = btoa(JSON.stringify(teamCommits, null, '\t'));
			if(str.length >= 32768) 
				deferred.reject('TeamCommits field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				portfolioItemRecord.set('c_TeamCommits', str);
				portfolioItemRecord.save({ 
					callback:function(record, operation, success){
						if(!success) deferred.reject('Failed to modify PortfolioItem ' + portfolioItemRecord.data.FormattedID);
						else deferred.resolve(portfolioItemRecord);
					}
				});
			}
			return deferred.promise;
		},
	
		/**___________________________________ EVENT HANDLING ___________________________________*/
		getGridHeight: function() {
			// var me = this,
				// iframe = Ext.get(window.frameElement);
			// return iframe.getHeight() - me.down('#navbox').getHeight() - 20;   
			return 800;
		},
		getGridWidth: function(columnCfgs){
			// var me = this; 
			// if(!me.MatrixGrid) return;
			// else return Math.min(
				// _.reduce(columnCfgs, function(item, sum){ return sum + item.width; }, 20), 
				// window.innerWidth - 20
			// );   
			return 800;
		},	
		changeGridSize: function(){
			var me=this;
			if(!me.MatrixGrid) return;
			else me.MatrixGrid.setSize(me.getGridWidth(me.MatrixGrid.config.columnCfgs), me.getGridHeight());
		},	
		initGridResize: function(){
			var me=this;
			if(me.addWindowEventListener){
				me.addWindowEventListener('resize', me.changeGridSize.bind(me));
			}
		},	

		/**___________________________________ UTILITY FUNCTIONS ___________________________________*/
		fixRawUserStoryAttributes: function() {
			var me = this,
			stories = me.UserStoryStore.getRange();
			for(var i in stories){
				for(var j in me.UserStoryFetchFields){
					if(!stories[i].raw[me.UserStoryFetchFields[j]]) stories[i].raw[me.UserStoryFetchFields[j]]=0;
				}
			}
		},
		
		fixRawPortFolioItemAttributes: function() {
			var me = this,
			portFolioItems = me.PortfolioItemStore.getRange();
			for(var i in portFolios){
				for(var j in me.portfolioItemFields){
					if(!portFolioItems[i].raw[me.portfolioItemFields[j]]) portFolios[i].raw[me.portfolioItemFields[j]]=0;
				}
			}
		},
		clearToolTip: function(){
			var me = this;
			if(me.tooltip){
				me.tooltip.panel.hide();
				me.tooltip.triangle.hide();
				me.tooltip.panel.destroy();
				me.tooltip.triangle.destroy();
				me.tooltip = null;
			}
		},	
		getDistanceFromBottomOfScreen: function(innerY){
			var me = this, 
				iframe = window.frameElement,
				iframeOffsetY = window.parent.pageYOffset + (iframe ? iframe.getBoundingClientRect().top : 0),
				actualY = iframeOffsetY + innerY;
			return window.parent.outerHeight - actualY;   
		},
			
		getIntersectingUserStoriesData: function(portfolioItemRecord, projectName){
			return (this.MatrixUserStoryBreakdown[projectName] || {})[portfolioItemRecord.data.Name] || [];
		},
		getTotalUserStoryPoints: function(userStoriesData){
			return _.reduce(userStoriesData, function(sum, userStoryData){ return sum + (userStoryData.PlanEstimate || 0); }, 0);
		},
		getCompletedUserStoryPoints: function(userStoriesData){
			return _.reduce(userStoriesData, function(sum, userStoryData){ 
				return sum + ((userStoryData.ScheduleState == 'Completed' || userStoryData.ScheduleState == 'Accepted') ? 
					(userStoryData.PlanEstimate || 0) : 0);
			}, 0);
		},
		getCellCls: function(config){
			var me=this,
				colorClassBase = ' intel-team-commits-',
				cls = '';

			if(me.ViewMode == 'Normal'){
				switch(config.commitment){
					case 'Undecided': cls = colorClassBase + 'WHITE'; break;
					case 'N/A': cls = colorClassBase + 'GREY'; break;
					case 'Committed': cls = colorClassBase + 'GREEN'; break;
					case 'Not Committed': cls = colorClassBase + 'RED'; break;
					default: cls = colorClassBase + 'WHITE'; break;
				}
			}
			else if(me.ViewMode == '% Done') cls += '';
			
			if(config.expected && config.ceComment && config.featurestatus) cls += ' manager-expected-feature-comment-cell-small';
			else if (config.expected && config.ceComment) cls += ' manager-expected-comment-cell-small';
			else if (config.ceComment && config.featurestatus) cls += ' manager-comment-feature-cell-small';
			else if(config.expected && config.featurestatus) cls += ' manager-expected-feature-cell-small';
			else if(config.expected) cls += ' manager-expected-cell-small';
			else if(config.featurestatus) cls += ' manager-feature-cell-small';
			else if(config.ceComment) cls += ' manager-comment-cell-small';
			
			return cls;
		},
		getCellBackgroundColor: function(config){
			var me=this;		
			if(me.ViewMode == 'Normal' || config.userStoriesData.length === 0) return '';
			else if(me.ViewMode == '% Done') return me.getRallyReleaseColor(me.ReleaseRecord, config.completedPoints, config.totalPoints);
		},
		getCellInnerHTML: function(config){
			var me=this;			
			if(me.ViewMode == 'Normal') return config.userStoriesData.length;
			else if(me.ViewMode == '% Done'){
				if(config.userStoriesData.length === 0) return '-';
				var percentDone = (100*config.completedPoints/config.totalPoints>>0);
				return '<span title="' + config.completedPoints + '/' + config.totalPoints + ' Points Completed">' + 
					percentDone + '%</span>';
			}	
		},
		areColorsTheSame: function(color1, color2){
			var me=this,
				nums1 = (color1 || '').match(/\d+\.?\d*/g) || [],
				nums2 = (color2 || '').match(/\d+\.?\d*/g) || [];
			if(nums1.length != nums2.length) return false;
			if(_.some(nums1, function(num1, index){ return Math.abs(num1 - nums2[index])*100>>0 > 0; })) return false;
			return true;
		},
		updateCell: function(portfolioItemRecord, projectName, rowIndex, columnIndex){
			var me=this;
			
			var	tableRowDOM = me.MatrixGrid.view.getNode(rowIndex),
				td = tableRowDOM.childNodes[columnIndex],
				teamCommit = me.getTeamCommit(portfolioItemRecord, projectName),
				userStoriesData = me.getIntersectingUserStoriesData(portfolioItemRecord, projectName),
				config = {
					userStoriesData: userStoriesData,
					completedPoints: (100*me.getCompletedUserStoryPoints(userStoriesData)>>0)/100,
					totalPoints: (100*me.getTotalUserStoryPoints(userStoriesData)>>0)/100,
					expected: teamCommit.Expected || false,
					featurestatus: teamCommit.FeatureStatus || false,
					ceComment: !!teamCommit.CEComment || false,
					commitment: teamCommit.Commitment || 'Undecided'
				},
				
				colorClassBase = 'intel-team-commits-',
				expectedClass = 'manager-expected-cell-small',
				featureClass = 'manager-feature-cell-small',
				commentClass = 'manager-comment-cell-small',
				expectedCommentClass = 'manager-expected-comment-cell-small',
				
				newCls = me.getCellCls(config),
				newColorClass = (/intel-team-commits-[A-Z]+/.exec(newCls) || [''])[0],
				newBackgroundColor = me.getCellBackgroundColor(config),
				newInnerHTML = me.getCellInnerHTML(config),
				
				classList = td.classList,
				oldBackgroundColor = td.style.backgroundColor,
				oldInnerHTML = td.childNodes[0].innerHTML,
				oldExpected = classList.contains(expectedClass),
				oldFeatureHelp = classList.contains(featureClass),
				oldComment = classList.contains(commentClass),
				oldExpectedComment = classList.contains(expectedCommentClass),
				oldColorClass = _.find(classList, function(c){ return c.indexOf(colorClassBase) > -1; }) || '';
			
			if(((config.expected && config.featurestatus && !config.ceComment) && !(oldExpected && !oldComment && !oldExpectedComment)) ||
					((!config.expected && config.featurestatus && config.ceComment) && !(!oldExpected && oldComment && !oldExpectedComment)) ||
					((config.expected && config.featurestatus && config.ceComment) && !(!oldExpected && !oldComment && oldExpectedComment)) ||
					(!me.areColorsTheSame(newBackgroundColor, oldBackgroundColor)) ||
					(newColorClass != oldColorClass) || 
					(newInnerHTML != oldInnerHTML)){		
				//styles
				td.style.backgroundColor = newBackgroundColor;
				//classes
				if(oldColorClass) td.classList.remove(oldColorClass);
				_.each(newCls.split(' '), function(cls){ if(cls.length) td.classList.add(cls); });
				//innerHTML
				td.childNodes[0].innerHTML = newInnerHTML;
				return true;
			}
			else return false;
		},
		
		isProjectNotFullyDispositioned: function(projectName){
			var me=this;
			return _.some(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
				var teamCommit = me.getTeamCommit(portfolioItemRecord, projectName);
				return !teamCommit.Commitment || teamCommit.Commitment == 'Undecided';
			});
		},
		getProjectHeaderCls: function(projectName){
			var me=this;
			if(me.ViewMode == 'Normal'){
				return me.isProjectNotFullyDispositioned(projectName) ? ' not-dispositioned-project' : ' dispositioned-project';
			} 
			else return ''; //should these get green/red/grey/white
		},
		columnHeaderItem: function(projectName){ //the % DONE cell in the header cell when in % DONE viewing mode
			var me=this;
			var config = _.reduce(me.MatrixUserStoryBreakdown[projectName], function(sumConfig, userStoriesData){
				return {
					userStoriesData: sumConfig.userStoriesData.concat(userStoriesData),
					completedPoints: sumConfig.completedPoints + (100*me.getCompletedUserStoryPoints(userStoriesData)>>0)/100,
					totalPoints: sumConfig.totalPoints + (100*me.getTotalUserStoryPoints(userStoriesData)>>0)/100
				};
			},{
				userStoriesData: [],
				completedPoints: 0,
				totalPoints: 0
			});
			var style = 'style="background-color:' + me.getCellBackgroundColor(config) + '"',
				innerHTML = me.getCellInnerHTML(config);
			return '<div class="project-percentage-complete" ' + style + '>' + innerHTML + '</div>';
		},
		updateGridHeader: function(projectName) {
			var me = this;
			if (!me.MatrixGrid) return;//renderMatrixGrid();//TODO: verify if this is correct
			var column = _.find(me.MatrixGrid.view.getGridColumns(), function(column) { return column.text == projectName; }),
				possibleClasses = ['not-dispositioned-project', 'dispositioned-project'],
				shouldHaveItems = me.ViewMode === '% Done';
			if(column){
				_.each(possibleClasses, function(cls) { column.el.removeCls(cls); });
				while (column.el.dom.childNodes.length > 1) column.el.last().remove(); //remove % done before re-adding it.
				if (shouldHaveItems) Ext.DomHelper.append(column.el, me.columnHeaderItem(projectName));
				column.el.addCls(me.getProjectHeaderCls(projectName));							
			}
		},
		updateTotalPercentCell: function(matrixRecord, index){
			var me=this,
				portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(piRecord){ 
					return piRecord.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
				});
			if(!portfolioItemRecord) return;
			if(me.ViewMode != '% Done' || !portfolioItemRecord) return;
			var config = _.reduce(_.sortBy(_.keys(me.MatrixUserStoryBreakdown)), function(sumConfig, projectName){
				var teamCommit = me.getTeamCommit(portfolioItemRecord, projectName),
					userStoriesData = me.getIntersectingUserStoriesData(portfolioItemRecord, projectName);
				return {
					userStoriesData: sumConfig.userStoriesData.concat(userStoriesData),
					completedPoints: sumConfig.completedPoints + (100*me.getCompletedUserStoryPoints(userStoriesData)>>0)/100,
					totalPoints: sumConfig.totalPoints + (100*me.getTotalUserStoryPoints(userStoriesData)>>0)/100
				};
			},{
				userStoriesData: [],
				completedPoints: 0,
				totalPoints: 0
			});
			var style = 'style="background-color:' + me.getCellBackgroundColor(config) + '"',
				innerHTML = me.getCellInnerHTML(config),
				td = Ext.get(me.MatrixGrid.getView().lockedView.getNode(index)).last(),
				div = td.last();
			td.dom.setAttribute('style', style);
			div.dom.innerHTML = innerHTML;
		},
		
		isPortfolioItemNotCommittedOrHasNoStories: function(portfolioItemRecord){
			var me=this,
				portfolioItemName = portfolioItemRecord.data.Name,
				teamCommits = me.getTeamCommits(portfolioItemRecord);
			return _.some(teamCommits, function(projData, projectOID){ 
				return projData.Commitment == 'Not Committed' && me.ProjectOIDNameMap[projectOID]; 
			}) || 
				!_.reduce(me.MatrixUserStoryBreakdown, function(sum, portfolioItemMap){
					return sum + (portfolioItemMap[portfolioItemName] || []).length;
				}, 0);
		},		
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		showGrids: function(){
			var me=this;
			if(!me.MatrixGrid) me.renderMatrixGrid();
		},	
		updateGrids: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.MatrixGrid && me.MatrixGrid.store) me.MatrixGrid.store.intelUpdate();
			}
		},
		clearEverything: function(){
			var me=this;
			me.clearToolTip();
			if(me.MatrixGrid) {
				me.MatrixGrid.up().remove(me.MatrixGrid);
				me.MatrixGrid = undefined;
			}
		},
		reloadStores: function(){
			var me = this;
			return me.loadPortfolioItems().then(function(){return me.loadUserStories(); });
		},
		redrawEverything: function() {
			var me = this;
			me.setLoading(' Loading matrix');
			me.clearEverything();  
			if(!me.UpdateCacheButton) me.renderUpdateCache();
			if(!me.ReleasePicker){
				me.renderReleasePicker();
				me.renderClickModePicker();
				me.renderRefreshIntervalCombo();
				me.renderViewModePicker();
				me.renderClearFiltersButton();
				me.renderMatrixLegend();  
			}
			me.showGrids();
			me.setLoading(false);            
		},

		reloadEverything: function(){
			var me=this;
			me.setLoading('Loading  Data');
			me.enqueue(function(done){
			return me.reloadStores()
					.then(function(){
						me.clearEverything();
						if(!me.UpdateCacheButton) me.renderUpdateCache();
						if(!me.ReleasePicker){
							me.renderReleasePicker();
							me.renderClickModePicker();
							me.renderViewModePicker();
							me.renderRefreshIntervalCombo();
							//me.renderManualRefreshButton();
							me.renderClearFiltersButton();
							me.renderMatrixLegend();
						}				
					})
					.then(function(){me.updateGrids(); })
					.then(function(){me.showGrids(); })
					.then(function(){if(me.IsDataRefresh === false) me.updateCache();})
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){me.setLoading(false); done(); })
					.done();
			}, 'ReloadAndRefreshQueue'); //eliminate race conditions between manual _reloadEverything and interval _refreshDataFunc
		},
		/**___________________________________ REFRESHING DATA ___________________________________*/	
		refreshComboSelected: function(combo, records){
			var me=this, rate = records[0].data.Rate;
			if(me.AppRefresh === rate) return;
			me.AppRefresh = rate;
			me.setRefreshInterval();
		},	
		renderRefreshIntervalCombo: function(){
			var me=this;
			me.down('#navboxRight').add({
				xtype:'intelfixedcombo',
				store: Ext.create('Ext.data.Store', {
					fields: ['Rate'],
					data: [
						{Rate: 'Off'},
						{Rate: '1'},
						{Rate: '2'},
						{Rate: '5'}
					]
				}),
				displayField: 'Rate',
				fieldLabel: 'Auto-Refresh Rate (minute):',
				value:me.AppRefresh,
				listeners: {
					change:function(combo, newval, oldval){ if(newval.length===0) combo.setValue(oldval); },
					select: me.refreshComboSelected.bind(me)
				}
			});
		},
		refreshDataFunc: function(){
			var me=this;
			me.enqueue(function(done){
				me.reloadStores()
					.then(function(){ me.updateGrids(); })
					.then(function(){ me.showGrids(); })
					.fail(function(reason){ me.alert('ERROR', reason); })
					.then(function(){ done(); })
					.done();
			}, 'ReloadAndRefreshQueue');
		},	
		clearRefreshInterval: function(){
			var me=this;
			if(me.RefreshInterval){ 
				clearInterval(me.RefreshInterval); 
				me.RefreshInterval = undefined; 
			}	
		},
		setRefreshInterval: function() {
			var me = this;
			me.clearRefreshInterval();
			if(me.AppRefresh && me.AppRefresh!=='Off'){
				me.IsDataRefresh = true;
				Ext.getCmp('cacheMessageContainer').hide();
				Ext.getCmp('cacheButtonsContainer').hide();
				me.RefreshInterval = setInterval(function(){ me.refreshDataFunc(); }, me.AppRefresh*1000*60);
			} else {
				me.IsDataRefresh = false;
				if(Ext.getCmp('cacheButtonsContainer').hidden === true) Ext.getCmp('cacheButtonsContainer').show();
				if(Ext.getCmp('cacheMessageContainer').hidden === true){
					me.setLoading("Loading Data");
					return me.loadDataCacheorRally()
					.then(function(){
						me.setLoading(false);
					});
				} 
			}
		},
     /*********************************************Rally Cache Mixin Operation ******************************** */
        
		_loadModelsForCachedView: function() {
			var me = this,
				promises = [],
				models = { UserStory: 'HierarchicalRequirement' };
			models['PortfolioItem/' + me.PortfolioItemTypes[0]] = 'PortfolioItem/' + me.PortfolioItemTypes[0];
			_.each(models, function(modelType, modelName) {
				var deferred = Q.defer();
				Rally.data.WsapiModelFactory.getModel({
					type: modelType,
					success: function(loadedModel) {
						me[modelName] = loadedModel;
						deferred.resolve();
					}
				});
				promises.push(deferred.promise);
			});
			return Q.all(promises);
		},		
		getCacheUrlSetting: function() {
            var me = this;
            return me.getSetting('cacheUrl');
		},
		getCachePayloadFn: function() {
			var me = this;
			me.ProjectRecord = payload.ProjectRecord;
			me.ReleaseRecord = payload.ReleaseRecord;
			me.ReleaseRecords = payload.ReleaseRecords;
			me.ScrumGroupRootRecords = payload.ScrumGroupRootRecords;
			me.ScrumGroupPortfolioProject = payload.ScrumGroupPortfolioProject;
			me.PortfolioItemMap = payload.PortfolioItemMap;   
			me.MatrixProjectMap = payload.MatrixProjectMap;
			me.ProjectOIDNameMap = payload.ProjectOIDNameMap;				
			me.MatrixUserStoryBreakdown = payload.MatrixUserStoryBreakdown;            
			me.AllProjects = payload.AllProjects;
			return me._loadModelsForCachedView().then(function(){
				me.PortfolioItemStore = Ext.create('Rally.data.wsapi.Store', {                  
						model: me['PortfolioItem/' + me.PortfolioItemTypes[0]],
						pageSize: 200,
						data:payload.PortfolioItemStoreData,
						disableMetaChangeEvent: true,
						load: function(){}
					});     
				});
		},
		setCachePayLoadFn: function(payload) {
			var me = this;
			projectFields = ['Children','Name','ObjectID','Parent'];
			portfolioItemFields =["Name", "ObjectID", "FormattedID", "Release", "c_TeamCommits", "c_MoSCoW", "c_Risks", "Project", "PlannedEndDate", "Parent", "Children", "PortfolioItemType", "Ordinal", "PercentDoneByStoryPlanEstimate","DragAndDropRank","Rank",
			'_p','_ref','_refObjectUUID','_type','_objectVersion','_CreatedAt'];
			function filterProjectData(projectData){
				var data = _.pick(projectData,projectFields);
				data.Parent = _.pick(data.Parent,projectFields);
				data.children = _.pick(data.children,'[Count]');
				return{data:data};
			}
			
			function filterPortfolioItemForCache(portfolioItem){
					var data = _.pick(portfolioItem, portfolioItemFields);
						return data;
			}
			payload.MatrixProjectMap = me.MatrixProjectMap;
			payload.ProjectOIDNameMap = me.ProjectOIDNameMap;
	
			payload.MatrixUserStoryBreakdown =  me.MatrixUserStoryBreakdown;
			//payload.ProjectRecord ={data:me.ProjectRecord.data};
			payload.ProjectRecord= filterProjectData(me.ProjectRecord.data);
			payload.ReleaseRecord = {data: me.ReleaseRecord.data};
			payload.ScrumGroupRootRecords =_.map(me.ScrumGroupRootRecords,function(ss){ return {data: ss.data};});
			payload.ScrumGroupPortfolioProject = {data: me.ScrumGroupPortfolioProject.data};
			//payload.AllProjects = _.map(me.AllProjects,function(ap){ return {data: ap.data};});
			payload.AllProjects = _.map(me.AllProjects,function(ap){ return filterProjectData(ap.data);});
			payload.ReleaseRecords = _.map(me.ReleaseRecords, function(rr){ return {data:rr.data};});
			payload.ReleaseRecord = {data: me.ReleaseRecord.data};
			payload.PortfolioItemTypes = me.PortfolioItemTypes;            
			payload.PortfolioItemStoreData = _.map(me.PortfolioItemStore.getRange(), function (ps) {return filterPortfolioItemForCache(ps.data);});           
			payload.PortfolioItemMap = me.PortfolioItemMap;
		},
		cacheKeyGenerator: function() {
			var me = this;
			var projectOID = me.getContext().getProject().ObjectID;
			var releaseOID = me.ReleaseRecord.data.ObjectID;
		//	var hasKey = typeof ((me.AppsPref.projs || {})[projectOID] || {}).Release === 'number';
			var hasKey = typeof(releaseOID) === 'number';
			if (hasKey && me.IsDataRefresh === false) {
					return 'CmtMatx-' + projectOID + '-' + releaseOID;
			}
			else return undefined;
		},
		getCacheTimeoutDate: function(){
				return new Date(new Date()*1 + 1000*60*60);
		},
		loadDataCacheorRally: function() {
			var me = this;
			return me.getCache().then(function(cacheHit) {
				if (!cacheHit) {
					return me.loadConfiguration()
						.then(function() { return me.reloadEverything(); });
				} else {
					me.renderCacheMessage();
					me.redrawEverything();
				}
			});
		},
		/**************************************** Loading Config Items ***********************************/		
		/**
			load releases for current scoped project and set the me.ReleaseRecord appropriately.
		*/
		createDummyProjectRecord: function(dataObject) {
			return { data: dataObject };
		},
		loadReleases: function() {
			var me = this,
				twelveWeeksAgo = new Date(new Date()*1 - 12*7*24*60*60*1000),
				projectRecord = me.createDummyProjectRecord(me.getContext().getProject());
			
			return me.loadReleasesAfterGivenDate(projectRecord, twelveWeeksAgo).then(function(releaseRecords){
				me.ReleaseRecords = releaseRecords;
				
				// Set the current release to the release we're in or the closest release to the date
				// Important! This sets the current release to an overridden value if necessary
				me.ReleaseRecord = (me.isStandalone ? 
					_.find(me.ReleaseRecords, function(release){ return release.data.Name === me.Overrides.ReleaseName; }) : 
					false) || 
					me.getScopedRelease(me.ReleaseRecords, null, null);
			});
		},		
		loadConfiguration: function() {
			var me = this;
			//var twelveWeeks = 1000*60*60*24*7*12;
			return  me.configureIntelRallyApp()
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
										me.ScrumGroupAndPortfolioConfig =  _.filter(me.ScrumGroupConfig,function(train){return train.ScrumGroupRootProjectOID === me.ProjectRecord.data.ObjectID; })[0];
									});
							} 
							else return Q.reject('You are not scoped to a valid project');
						}),
					me.loadProjectsWithTeamMembers(me.ProjectRecord)
						.then(function(projectsWithTeamMembers){ 
							me.ProjectsWithTeamMembers = projectsWithTeamMembers; 
							//ignore portfolio as project if train and portfolio is in the same location
								_.each(me.ProjectsWithTeamMembers, function(f) {
								var parentObjectID = f.data.Parent ? f.data.Parent.ObjectID : 0; 
								if ((f.data.ObjectID === me.ScrumGroupPortfolioProject.data.ObjectID || parentObjectID === me.ScrumGroupPortfolioProject.data.ObjectID ) && me.ScrumGroupAndPortfolioConfig.ScrumGroupAndPortfolioLocationTheSame === false	|| (f.data.ObjectID === me.ProjectRecord.data.ObjectID))
									delete me.ProjectsWithTeamMembers [f.data.ObjectID || f.data.Parent.ObjectID];
							});
						}),
					me.loadAllChildrenProjects()
						.then(function(allProjects){ 
							me.AllProjects = allProjects; 
						}),
					me.setCustomAppObjectID('Intel.SAFe.ArtCommitMatrix')
				]);
			});
		},
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.IsDataRefresh = false;
			me.AppRefresh = 'Off';
			me.setLoading('Loading configuration');
			me.ClickMode = 'Details';
			me.ViewMode = Ext.Object.fromQueryString(window.parent.location.href.split('?')[1] || '').viewmode === 'percent_done' ? '% Done' : 'Normal';
			me.initDisableResizeHandle();
			me.initFixRallyDashboard();
			me.initGridResize();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
				me.setLoading(false);
				me.alert('ERROR', 'You do not have permissions to edit this project');
				return;
			}	
			return Q.all([me.loadReleases()])			
			.then ( function() {  me.setRefreshInterval(); })
			.then( function() { return me.loadDataCacheorRally(); })       
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
			.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		renderCacheMessage: function(){
			var me = this;
			Ext.getCmp('cacheMessageContainer').removeAll();
			if(Ext.getCmp('cacheMessageContainer').hidden === true) Ext.getCmp('cacheMessageContainer').show();
			if(Ext.getCmp('cacheButtonsContainer').hidden === true) Ext.getCmp('cacheButtonsContainer').show();
			Ext.getCmp('cacheMessageContainer').add({
					xtype: 'label',
					width:'100%',
					html: 'You are looking at the cached version of the data, updated last on: ' + '<span class = "modified-date">' + me.lastCacheModified +  '</span>'
			});
		},
		renderUpdateCache: function() {
			var me = this;
			me.UpdateCacheButton = Ext.getCmp('cacheButtonsContainer').add({
				xtype: 'button',
				text: 'Get Live Data',
				cls: 'intel-button',
				listeners: {
					click: function() {
						me.setLoading(' Getting live data, please wait');
						Ext.getCmp('cacheMessageContainer').removeAll();
						return me.loadConfiguration()
							.then(function() { return me.reloadEverything();})
							.then(function() { return me.updateCache(); });
					}
				}
			});
		},
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			Ext.getCmp('cacheMessageContainer').removeAll();
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Loading data");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			return me.loadDataCacheorRally();
		},				
		renderReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeftVert').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me.releasePickerSelected.bind(me) }
			});
		},	
		clickModePickerSelected: function(combo, records){
			var me=this, value = records[0].data.ClickMode;
			if(value === me.ClickMode) return;
			else me.ClickMode = value;
			me.clearToolTip();
		},				
		renderClickModePicker: function(){
			var me=this;
			me.ClickModePicker = me.down('#navboxLeftVert').add({
				xtype:'intelfixedcombo',
				fieldLabel:'Click Mode',
				id:'modePicker',
				labelWidth: 70,
				width: 250,
				store: Ext.create('Ext.data.Store', {
					fields:['ClickMode'],
					data: [
						{ClickMode:'Flag'},
						{ClickMode:'Comment'},
						{ClickMode:'Details'},
						{ClickMode:'Feature Help Needed'}
					]
				}),
				displayField: 'ClickMode',
				value:me.ClickMode,
				listeners: { select: me.clickModePickerSelected.bind(me) }
			});
		},	
		viewModePickerSelected: function(combo, records){
			var me=this, value = records[0].data.ViewMode;
			if(value === me.ViewMode) return;
			else me.ViewMode = value;
			me.clearToolTip();
			me.setLoading('Please Wait');
			setTimeout(function(){
				if(me.MatrixGrid){
					if(me.ViewMode == '% Done') me.MatrixGrid.columns[5].show();
					else me.MatrixGrid.columns[5].hide();
					if(me.MatrixGrid.store) me.MatrixGrid.store.intelUpdate();
				}
				me.setLoading(false);
			}, 0);
		},				
		renderViewModePicker: function(){
			var me=this;
			me.ViewModePicker = me.down('#navboxLeftVert').add({
				xtype:'intelfixedcombo',
				fieldLabel:'View Mode',
				id:'viewPicker',
				labelWidth: 70,
				width: 250,
				store: Ext.create('Ext.data.Store', {
					fields:['ViewMode'],
					data: [
						{ViewMode:'Normal'},
						{ViewMode:'% Done'}
					]
				}),
				displayField: 'ViewMode',
				value: me.ViewMode,
				listeners: { select: me.viewModePickerSelected.bind(me) }
			});
		},	
		clearFiltersButtonClicked: function(){
			var me=this;
			me.setLoading("removing filters");
			if(me.MatrixGrid){
				me.clearToolTip();
				_.invoke(Ext.ComponentQuery.query('intelgridcolumnfilter', me.MatrixGrid), 'clearFilters');
				_.invoke(Ext.ComponentQuery.query('intelgridcolumntextareafilter', me.MatrixGrid), 'clearFilters');
				me.MatrixGrid.store.fireEvent('refresh', me.MatrixGrid.store);
			}
			me.setLoading(false);
		},
		renderClearFiltersButton: function(){
			var me=this;
			me.ClearFiltersButton = me.down('#navboxLeftVert').add({
				xtype:'button',
				text:'Remove Filters',
				id: 'manualRefreshButton',
				cls: 'intel-button',
				width:110,
				listeners:{ click: me.clearFiltersButtonClicked.bind(me) }
			});
		},
		renderMatrixLegend: function(){
			var me=this;
			me.MatrixLegend = me.down('#navboxRight').add({
				xtype:'container',
				width:150,	
				layout: {
					type:'vbox',
					align:'stretch',
					pack:'start'
				},
				border:true,
				frame:false,
				items: _.map(['Committed', 'Not Committed', 'N/A', 'Undefined', 'Expected', 'CE Comment','Feature Help Needed'], function(name){
					var color;
					if(name === 'Undecided') color='white';
					if(name === 'N/A') color='rgba(224, 224, 224, 0.50)'; //grey
					if(name === 'Committed') color='rgba(0, 255, 0, 0.50)';//green
					if(name === 'Not Committed') color='rgba(255, 0, 0, 0.50)';//red
					if(name === 'Expected') color='rgba(251, 255, 0, 0.50)'; //yellow
					if(name === 'CE Comment') color='rgba(76, 76, 255, 0.50)'; //blue
					if(name === 'Feature Help Needed') color='rgba(170, 92, 183, 0.50)'; //purple
					return {
						xtype: 'container',
						width: 150,
						border:false,
						frame:false,
						html:'<div class="intel-legend-item">' + name + 
							': <div style="background-color:' + color + '" class="intel-legend-dot"></div></div>'
					};
				})
			});
		},

		/************************************************************* RENDER ********************************************************************/
		renderMatrixGrid: function(){
			var me = this,
				/* MoSCoWRanks = ['Must Have', 'Should Have', 'Could Have', 'Won\'t Have', 'Undefined', ''], */
				sortedPortfolioItems = _.sortBy(me.PortfolioItemStore.getRange(), function(p){ return p.data.DragAndDropRank; }),
				matrixRecords = _.map(sortedPortfolioItems, function(portfolioItemRecord, index){
					return {
						PortfolioItemObjectID: portfolioItemRecord.data.ObjectID,
						PortfolioItemRank: index + 1,
						PortfolioItemName: portfolioItemRecord.data.Name,
						PortfolioItemFormattedID: portfolioItemRecord.data.FormattedID,
						PortfolioItemPlannedEnd: portfolioItemRecord.data.PlannedEndDate*1,
						TopPortfolioItemName: me.PortfolioItemMap[portfolioItemRecord.data.ObjectID]/* ,
						MoSCoW: portfolioItemRecord.data.c_MoSCoW || 'Undefined' */
					};
				}),
				makeDoSortFn = function(fn){
					return function(direction){
						me.MatrixGrid.store.sort({
							sorterFn: function(r1, r2){
								var val1 = fn(r1), val2 = fn(r2);
								return (direction=='ASC' ? 1 : -1) * ((val1 < val2) ? -1 : (val1 === val2 ? 0 : 1));
							}
						});
					};
				};		

			var matrixStore = Ext.create('Intel.lib.component.Store', {
				data: matrixRecords,
				model: 'CommitsMatrixPortfolioItem',
				autoSync:true,
				limit:Infinity,
				proxy: {
					type:'intelsessionstorage',
					id: 'Session-proxy-' + Math.random()
				},
				disableMetaChangeEvent: true,
				intelUpdate: function(){			
					var projectNames = _.sortBy(_.keys(me.MatrixUserStoryBreakdown));
					_.each(projectNames, function(projectName){ me.updateGridHeader(projectName); });
					_.each(matrixStore.getRange(), function(matrixRecord, rowIndex){
						me.updateTotalPercentCell(matrixRecord, rowIndex);
						var refreshWholeRow = false,
							portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
								return portfolioItemRecord.data.ObjectID == matrixRecord.data.PortfolioItemObjectID;
							});
							// if(matrixRecord.data.MoSCoW != portfolioItemRecord.data.c_MoSCoW)
							// matrixRecord.set('MoSCoW', portfolioItemRecord.data.c_MoSCoW || 'Undefined'); 
						_.each(projectNames, function(projectName, colIndex){
							var changedContents = me.updateCell(portfolioItemRecord, projectName, rowIndex, colIndex);
							if(changedContents) refreshWholeRow = true;
						});
						if(refreshWholeRow) me.MatrixGrid.view.refreshNode(rowIndex);
					});
					matrixStore.fireEvent('refresh', matrixStore);
				}
			});

			var lockedColumns = [/* {
				text:'MoSCoW', 
				dataIndex:'MoSCoW',
				tdCls: 'moscow-cell intel-editor-cell',	
				width:100,
				tooltip:'Must Have, Should Have, Could Have, Won\'t Have',
				tooltipType:'title',
				editor:{
					xtype:'intelfixedcombo',
					store: ['Must Have', 'Should Have', 'Could Have', 'Won\'t Have', 'Undefined']
				},
				sortable:true,
				locked:true,			
				doSort: makeDoSortFn(function(record){ return MoSCoWRanks.indexOf(record.data.MoSCoW); }),
				renderer:function(val, meta){
					if(val == 'Must Have') meta.tdCls += ' must-have';
					if(val == 'Should Have') meta.tdCls += ' should-have';
					if(val == 'Could Have') meta.tdCls += ' could-have';
					if(val == 'Won\'t Have') meta.tdCls += ' wont-have';
					return val || 'Undefined'; 
				},	
				items:[{ 
					xtype:'intelgridcolumnfilter',
					sortFn: function(MoSCoW){ return MoSCoWRanks.indexOf(MoSCoW); }
				}]	
			}, */{
				text: 'Rank',
				dataIndex: 'PortfolioItemRank',
				width: 50,
				sortable:true,
				locked:true
			},{
				text:'#', 
				dataIndex:'PortfolioItemFormattedID',
				width:50,
				sortable:true,
				locked:true,
				renderer:function(formattedID, meta, matrixRecord){
					var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ return item.data.FormattedID == formattedID; });
					var totalFeatureHelp = _.filter(me.getTeamCommits(portfolioItemRecord), function(val,key){return val.FeatureStatus === true; });
					var featureHelpCount = totalFeatureHelp.length > 0 ? totalFeatureHelp.length : "";
					if(me.ViewMode == 'Normal'){
						if(me.isPortfolioItemNotCommittedOrHasNoStories(portfolioItemRecord)) meta.tdCls += ' not-committed-portfolio-item';
						if(totalFeatureHelp.length > 0 ) meta.tdCls += ' manager-feature-cell';
					}
					if(portfolioItemRecord.data.Project){
						return '<div class="feature-porfolio-items"><div class="feature-help">'+ featureHelpCount + '</div>' + '<div class="porfolio-items"><a href=' + me.BaseUrl + '/#/' + portfolioItemRecord.data.Project.ObjectID + 'd/detail/portfolioitem/' + 
							me.PortfolioItemTypes[0] + '/' + portfolioItemRecord.data.ObjectID + ' target="_blank">' + formattedID + '</a></div></div>';
					}
					else return name;
				}
			},{
				text:me.PortfolioItemTypes[0], 
				dataIndex:'PortfolioItemName',
				width:200,
				locked:true,
				sortable:true,
				items: [{
					xtype: 'intelgridcolumntextareafilter',
					style: {marginRight: '10px'}
				}],					
				renderer: function(value, metaData) {
					metaData.tdAttr = 'title="' + value + '"';
					return value;
				}
			},{
				text: me.PortfolioItemTypes.slice(-1)[0], 
				dataIndex:'TopPortfolioItemName',
				width:90,
				sortable:true,
				locked:true,
				items:[{ xtype:'intelgridcolumnfilter' }]
			},{
				text:'Planned End',
				dataIndex:'PortfolioItemPlannedEnd',
				width:60,
				locked:true,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me.getWorkweek(date) : '-'); },
				items:[{ 
					xtype:'intelgridcolumnfilter', 
					convertDisplayFn: function(dateVal){ return dateVal ? 'ww' + me.getWorkweek(dateVal) : undefined; }
				}]
			},{
				text:'Total % Done',
				dataIndex:'PortfolioItemObjectID',
				width:50,
				locked:true,
				sortable:true,
				hidden: me.ViewMode !== '% Done',
				doSort: makeDoSortFn(function(record){
					var lockedView = me.MatrixGrid.getView().lockedView,
						store = this.up('grid').getStore();
					return parseInt(Ext.get(lockedView.getNode(store.indexOf(item1))).last().dom.innerText, 10) || 0;
				}),
				renderer: function(obejctID, metaData, matrixRecord, row, col){
					if(me.ViewMode != '% Done') return;
					var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ return item.data.ObjectID == obejctID; });
					if(!portfolioItemRecord) return;
					var config = _.reduce(_.sortBy(_.keys(me.MatrixUserStoryBreakdown)), function(sumConfig, projectName){
						var teamCommit = me.getTeamCommit(portfolioItemRecord, projectName),
							userStoriesData = me.getIntersectingUserStoriesData(portfolioItemRecord, projectName);
						return {
							userStoriesData: sumConfig.userStoriesData.concat(userStoriesData),
							completedPoints: sumConfig.completedPoints + (100*me.getCompletedUserStoryPoints(userStoriesData)>>0)/100,
							totalPoints: sumConfig.totalPoints + (100*me.getTotalUserStoryPoints(userStoriesData)>>0)/100
						};
					},{
						userStoriesData: [],
						completedPoints: 0,
						totalPoints: 0
					});
					metaData.tdAttr += 'style="background-color:' + me.getCellBackgroundColor(config) + '"';
					return me.getCellInnerHTML(config);
				}
			}];
		
			var teamColumnCfgs = [];
			_.each(_.sortBy(_.keys(me.MatrixUserStoryBreakdown)), function(projectName){
				teamColumnCfgs.push({
					text: projectName,
					dataIndex:'PortfolioItemObjectID',
					tdCls: 'intel-editor-cell',
					cls: ' matrix-subheader-cell ' + me.getProjectHeaderCls(projectName),
					width:50,
					maxHeight:80,
					tooltip:projectName,
					tooltipType:'title',
					editor:'textfield',
					align:'center',
					draggable:false,
					menuDisabled:true,
					sortable:false,
					resizable:false,
					renderer: function(obejctID, metaData, matrixRecord, row, col){
						var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ return item.data.ObjectID == obejctID; });
						if(!portfolioItemRecord) return;
						var teamCommit = me.getTeamCommit(portfolioItemRecord, projectName),
							userStoriesData = me.getIntersectingUserStoriesData(portfolioItemRecord, projectName),
							config = {
								userStoriesData: userStoriesData,
								completedPoints: (100*me.getCompletedUserStoryPoints(userStoriesData)>>0)/100,
								totalPoints: (100*me.getTotalUserStoryPoints(userStoriesData)>>0)/100,
								expected: teamCommit.Expected || false,
								featurestatus: teamCommit.FeatureStatus || false,
								ceComment: !!teamCommit.CEComment || false,
								commitment: teamCommit.Commitment || 'Undecided'
							};
						metaData.tdCls += me.getCellCls(config);
						metaData.tdAttr += 'style="background-color:' + me.getCellBackgroundColor(config) + '"';
						return me.getCellInnerHTML(config);
					}
				});
			});
			if(me.HorizontalGroupingConfig.enabled){
				var allTeamTypeInfos = me.getAllHorizontalTeamTypeInfos(me.AllProjects);
				teamColumnCfgs = _.map(_.groupBy(_.sortBy(_.map(teamColumnCfgs, 
					function(teamColumnCfg){
						return {
							teamTypeInfo: _.find(allTeamTypeInfos, function(tti){ return tti.projectRecord.data.Name === teamColumnCfg.text; }),
							columnCfg: teamColumnCfg
						};
					}),
					function(item){ 
						var horizontal = item.teamTypeInfo ? item.teamTypeInfo.horizontal : 'null';
						return (horizontal === 'null' ? '~~~' : horizontal) + item.columnCfg.text; 
					}),
					function(item){ return item.teamTypeInfo ? item.teamTypeInfo.horizontal : 'null'; }),
					function(items, horizontal){
						return {
							text: horizontal === 'null' ? 'OTHER' : horizontal,
							draggable:false,
							menuDisabled:true,
							sortable:false,
							resizable:false,
							columns: _.pluck(items, 'columnCfg')
						};
					});
			}
			var columns = _.map(lockedColumns.concat(teamColumnCfgs), function(colDef){ return _.merge({}, COLUMN_DEFAULTS, colDef); });
			
			me.MatrixGrid = me.add({
				xtype: 'grid',
				width: me.getGridWidth(columns),
				height: me.getGridHeight(),
				scroll:'both',
				resizable:false,
				columns: columns,
				disableSelection: true,
				plugins: ['intelcellediting'/* , {
					ptype: 'bufferedrenderer',
					trailingBufferZone: 80,
					leadingBufferZone: 100
				} */],
				viewConfig: {
					xtype:'inteltableview',
					preserveScrollOnRefresh:true
				},
				listeners: {
					sortchange: function(){ me.clearToolTip(); },
					beforeedit: function(editor, e){
						var projectName = e.column.text,
							matrixRecord = e.record;							
						//if(projectName == 'MoSCoW') return;
						if(me.ClickMode == 'Flag'){
							me.MatrixGrid.setLoading('Saving');
							me.enqueue(function(done){
								me.loadPortfolioItemByOrdinal(matrixRecord.data.PortfolioItemObjectID, 0)
									.then(function(portfolioItemRecord){
										var tcae = me.getTeamCommit(portfolioItemRecord, projectName);
										return me.setTeamCommitsField(portfolioItemRecord, projectName, 'Expected', !tcae.Expected);
									})
									.then(function(portfolioItemRecord){
										var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
											return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
										});
										storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
										me.MatrixGrid.view.refreshNode(matrixStore.indexOf(matrixRecord));
									})
									.fail(function(reason){ me.alert('ERROR', reason); })
									.then(function(){
										me.MatrixGrid.setLoading(false);
										done();
									})
									.done();
							}, 'PortfolioItemQueue'); //Race condition avoided between me.PortfolioItemStore and the User's actions
						}
						if(me.ClickMode == 'Feature Help Needed'){
							me.MatrixGrid.setLoading('Saving');
							me.enqueue(function(done){
								me.loadPortfolioItemByOrdinal(matrixRecord.data.PortfolioItemObjectID, 0)
									.then(function(portfolioItemRecord){
										var tcae = me.getTeamCommit(portfolioItemRecord, projectName);
										return me.setTeamCommitsField(portfolioItemRecord, projectName, 'FeatureStatus', !tcae.FeatureStatus);
									})
									.then(function(portfolioItemRecord){
										var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
											return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
										});
										storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
										me.MatrixGrid.view.refreshNode(matrixStore.indexOf(matrixRecord));
									})
									.fail(function(reason){ me.alert('ERROR', reason); })
									.then(function(){
										me.MatrixGrid.setLoading(false);
										done();
									})
									.done();
							}, 'PortfolioItemQueue'); //Race condition avoided between me.PortfolioItemStore and the User's actions
						}						
						return false;
					}, 
					edit: function(editor, e){
						var field = e.field,
							matrixRecord = e.record,
							value = e.value,
							originalValue = e.originalValue;
						
						//if(field != 'MoSCoW') return;
						if(value == originalValue) return;
						if(!value){
							matrixRecord.set(field, originalValue);
							return;
						}
						me.MatrixGrid.setLoading('Saving');
					
						// _.find(me.PortfolioItemStore.getRange(), function(item){ //set this here temporarily in case intelUpdate gets called while in queue
							// return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
						// }).data.c_MoSCoW = value; 
						
						me.enqueue(function(done){
							me.loadPortfolioItemByOrdinal(matrixRecord.data.PortfolioItemObjectID, 0)
								.then(function(portfolioItemRecord){
									var deferred = Q.defer();
									portfolioItemRecord.set('c_MoSCoW', value);
									portfolioItemRecord.save({ 
										callback:function(record, operation, success){
											if(!success) deferred.reject('Failed to modify PortfolioItem: ' + portfolioItemRecord.data.FormattedID);					
											else {
												var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
													return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
												});
												storePortfolioItemRecord.data.c_MoSCoW = portfolioItemRecord.data.c_MoSCoW;
											//	matrixRecord.data.MoSCoW = portfolioItemRecord.data.c_MoSCoW; //need this in case intelUpdate gets called while in queue
												me.MatrixGrid.view.refreshNode(matrixStore.indexOf(matrixRecord));
												deferred.resolve();
											}
										}
									});
									return deferred.promise;
								})
								.fail(function(reason){ me.alert('ERROR', reason); })
								.then(function(){
									me.MatrixGrid.setLoading(false);
									done();
								})
								.done();
							}, 'PortfolioItemQueue'); //Race condition avoided between me.PortfolioItemStore and the User's actions
					},
					afterrender: function (grid) {
						
						var view = grid.view.normalView; //lockedView and normalView		
						
						view.getEl().on('scroll', function(){ me.clearToolTip(); });

						grid.mon(view, {
							uievent: function (type, view, cell, row, col, e){
								var moveAndResizePanel;
								if((me.ClickMode === 'Details' || me.ClickMode === 'Comment') && type === 'mousedown') {
									var matrixRecord = matrixStore.getAt(row),
										projectName = view.getGridColumns()[col].text,
										portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
											return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
										}),
										teamCommit = me.getTeamCommit(portfolioItemRecord, projectName),
										oldTooltip = me.tooltip,
										pos = cell.getBoundingClientRect(),
										dbs = me.getDistanceFromBottomOfScreen(pos.top),
										panelWidth = 400;
									if(oldTooltip) me.clearToolTip();
									if(oldTooltip && (oldTooltip.row == row && oldTooltip.col == col)) return;
									
									/* jshint -W082 */
									moveAndResizePanel = function(panel){
										var upsideDown = (dbs < panel.getHeight() + 80);
										panel.setPosition(pos.left-panelWidth, (upsideDown ? pos.bottom - panel.getHeight() : pos.top));
									};
									
									if(me.ClickMode === 'Details'){
										var panelHTML = [
											'<p><b>CE Comment:</b> ' + (teamCommit.CEComment || '') + '</p>',
											'<p><b>Objective:</b> ' + (teamCommit.Objective || '') + '</p>',
											'<p><b>PlanEstimate: </b>',
												_.reduce(me.MatrixUserStoryBreakdown[projectName][portfolioItemRecord.data.Name] || [], function(sum, storyData){
													return sum + (storyData.PlanEstimate || 0); 
												}, 0),
											'<p><b>UserStories: </b><div style="max-height:100px;overflow-y:auto;"><ol>'].join('');
										(me.MatrixUserStoryBreakdown[projectName][portfolioItemRecord.data.Name] || []).forEach(function(storyData){
											panelHTML += '<li><a href="' + me.BaseUrl + '/#/' + storyData.Project.ObjectID + 
												'd/detail/userstory/' + storyData.ObjectID + '" target="_blank">' + storyData.FormattedID + '</a>:' +
												'<span title="' + storyData.Name + '">' + 
												storyData.Name.substring(0, 40) + (storyData.Name.length > 40 ? '...' : '') + '</span></li>';
										});
										panelHTML += '</ol></div>';
									
										me.tooltip = {
											row:row,
											col:col,
											panel: Ext.widget('container', {
												floating:true,
												width: panelWidth,
												autoScroll:false,
												id:'MatrixTooltipPanel',
												cls: 'intel-tooltip',
												focusOnToFront:false,
												shadow:false,
												renderTo:Ext.getBody(),
												items: [{
													xtype:'container',
													layout:'hbox',
													cls: 'intel-tooltip-inner-container',
													items:[{
														xtype:'container',
														cls: 'intel-tooltip-inner-left-container',
														flex:1,
														items:[{
															xtype:'container',
															html:panelHTML
														}]
													},{
														xtype:'button',
														cls:'intel-tooltip-close',
														text:'X',
														width:20,
														handler: function(){ me.clearToolTip(); }
													}]
												}],
												listeners:{
													afterrender: moveAndResizePanel,
													afterlayout: moveAndResizePanel
												}
											})	
										};
									}
									else {
										me.tooltip = {
											row:row,
											col:col,
											panel: Ext.widget('container', {
												floating:true,
												width: panelWidth,
												autoScroll:false,
												id:'MatrixTooltipPanel',
												cls: 'intel-tooltip',
												focusOnToFront:false,
												shadow:false,
												renderTo:Ext.getBody(),
												items: [{
													xtype:'container',
													layout:'hbox',
													cls: 'intel-tooltip-inner-container',
													items:[{
														xtype:'container',
														cls: 'intel-tooltip-inner-left-container',
														flex:1,
														items:[{
															xtype:'container',
															layout:'hbox',
															items:[{
																xtype:'text',
																flex:1,
																text: 'CE Comment:',
																style:'font-weight:bold;'
															},{
																xtype:'checkbox',
																width:140,
																boxLabel:'CE Expected',
																checked:teamCommit.Expected,
																handler:function(checkbox, checked){
																	me.tooltip.panel.setLoading('Saving');
																	me.enqueue(function(done){
																		me.loadPortfolioItemByOrdinal(portfolioItemRecord.data.ObjectID, 0)
																			.then(function(portfolioItemRecord){
																				var tcae = me.getTeamCommit(portfolioItemRecord, projectName);
																				return me.setTeamCommitsField(portfolioItemRecord, projectName, 'Expected', !tcae.Expected);
																			})
																			.then(function(portfolioItemRecord){
																				var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
																					return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
																				});
																				storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
																				me.MatrixGrid.view.refreshNode(matrixStore.indexOf(matrixRecord));
																			})
																			.fail(function(reason){ me.alert('ERROR', reason); })
																			.then(function(portfolioItemRecord){
																				me.tooltip.panel.setLoading(false);
																				done();
																			})
																			.done();
																	}, 'PortfolioItemQueue');
																}
															},{
																xtype:'checkbox',
																width:140,
																boxLabel:'Feature Help Needed',
																checked:teamCommit.FeatureStatus,
																handler:function(checkbox, checked){
																	me.tooltip.panel.setLoading('Saving');
																	me.enqueue(function(done){
																		me.loadPortfolioItemByOrdinal(portfolioItemRecord.data.ObjectID, 0)
																			.then(function(portfolioItemRecord){
																				var tcae = me.getTeamCommit(portfolioItemRecord, projectName);
																				return me.setTeamCommitsField(portfolioItemRecord, projectName, 'FeatureStatus', !tcae.FeatureStatus);
																			})
																			.then(function(portfolioItemRecord){
																				var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
																					return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
																				});
																				storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
																				me.MatrixGrid.view.refreshNode(matrixStore.indexOf(matrixRecord));
																			})
																			.fail(function(reason){ me.alert('ERROR', reason); })
																			.then(function(portfolioItemRecord){
																				me.tooltip.panel.setLoading(false);
																				done();
																			})
																			.done();
																	}, 'PortfolioItemQueue');
																}																
															}]
														},{
															xtype:'textarea',
															value: teamCommit.CEComment || '',
															width:330,
															id: 'MatrixTooltipPanelTextarea',
															resizable: {
																handles: 's',
																minHeight: 80,
																maxHeight: 300,
																pinned: true
															}
														},{
															xtype:'button',
															text:'Save',
															listeners:{
																click: function(){
																	me.tooltip.panel.setLoading('Saving');
																	me.enqueue(function(done){
																		me.loadPortfolioItemByOrdinal(portfolioItemRecord.data.ObjectID, 0)
																			.then(function(portfolioItemRecord){ 
																				var val = Ext.getCmp('MatrixTooltipPanelTextarea').getValue();
																				return me.setTeamCommitsField(portfolioItemRecord, projectName, 'CEComment', val);
																			})
																			.then(function(portfolioItemRecord){
																				var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
																					return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
																				});
																				storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
																				me.MatrixGrid.view.refreshNode(row);
																			})
																			.fail(function(reason){ me.alert('ERROR', reason); })
																			.then(function(portfolioItemRecord){
																				me.tooltip.panel.setLoading(false);
																				done();
																			})
																			.done();
																	}, 'PortfolioItemQueue');
																}
															}
														}]
													},{
														xtype:'button',
														cls:'intel-tooltip-close',
														text:'X',
														width:20,
														handler: function(){ me.clearToolTip(); }
													}]
												}],
												listeners:{
													afterrender: moveAndResizePanel,
													afterlayout: moveAndResizePanel
												}
											})
										};
									}									
									me.tooltip.triangle = Ext.widget('container', {
										floating:true,
										width:0, height:0,
										focusOnToFront:false,
										shadow:false,
										renderTo:Ext.getBody(),
										listeners:{
											afterrender: function(panel){
												setTimeout(function(){
													var upsideDown = (dbs < Ext.get('MatrixTooltipPanel').getHeight() + 80);
													if(upsideDown) {
														panel.removeCls('intel-tooltip-triangle');
														panel.addCls('intel-tooltip-triangle-up');
														panel.setPosition(pos.left -10, pos.bottom -10);
													} else {
														panel.removeCls('intel-tooltip-triangle-up');
														panel.addCls('intel-tooltip-triangle');
														panel.setPosition(pos.left -10, pos.top);
													}
												}, 10);
											}
										}
									});
								}
							}
						});
					}
				},
				enableEditing:false,
				store: matrixStore
			});	
			setTimeout(function(){ _.each(_.keys(me.MatrixUserStoryBreakdown), function(projectName){ me.updateGridHeader(projectName); }); }, 50);
		}
	});
}());