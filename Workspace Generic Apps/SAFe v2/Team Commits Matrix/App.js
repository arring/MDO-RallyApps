/** this app will probably get buggy if you have projects with the name name or portfolioItems with the same name */
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('CommitMatrix', {
		extend: 'IntelRallyApp',
		mixins:[
			'WindowListener',
			'PrettyAlert',
			'IframeResize',
			'IntelWorkweek',
			'AsyncQueue',
			'ParallelLoader',
			'UserAppsPreference'
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
				layout: 'hbox',
				items:[{
					xtype:'container',
					flex:1,
					itemId:'navboxLeftVert',
					layout: 'vbox'
				}]
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
		
		_userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/	
		_loadPortfolioItemsOfTypeInRelease: function(portfolioProject, type){
			if(!portfolioProject || !type) return Q.reject('Invalid arguments: OPIOT');
			var me=this,
				store = Ext.create('Rally.data.wsapi.Store',{
					model: 'PortfolioItem/' + type,
					limit:Infinity,
					remoteSort:false,
					fetch: ['Name', 'ObjectID', 'FormattedID', 'c_TeamCommits', 'c_MoSCoW', 'Release', 
						'Project', 'PlannedEndDate', 'Parent', 'Children', 'PortfolioItemType', 'Ordinal'],
					filters:[{ property:'Release.Name', value:me.ReleaseRecord.data.Name}],
					context:{
						project: portfolioProject.data._ref,
						projectScopeDown: true,
						projectScopeUp:false
					}
				});
			return me._reloadStore(store);
		},	
		_loadPortfolioItems: function(){ 
			var me=this;
			return Q.all(_.map(me.PortfolioItemTypes, function(type, ordinal){
				return (ordinal ? //only load lowest portfolioItems in Release (upper porfolioItems don't need to be in a release)
						me._loadPortfolioItemsOfType(me.TrainPortfolioProject, type) : 
						me._loadPortfolioItemsOfTypeInRelease(me.TrainPortfolioProject, type)
					)
					.then(function(portfolioStore){
						return {
							ordinal: ordinal,
							store: portfolioStore
						};
					});
				}))
				.then(function(items){
					var orderedPortfolioItemStores = _.sortBy(items, function(item){ return item.ordinal; });
					me.PortfolioItemStore = orderedPortfolioItemStores[0].store;
					me.PortfolioItemMap = {};
					_.each(me.PortfolioItemStore.getRange(), function(lowPortfolioItemRecord){ //create the portfolioItem mapping
						var ordinal = 0, 
							parentPortfolioItemRecord = lowPortfolioItemRecord,
							getParentRecord = function(child, parentList){
								return _.find(parentList, function(parent){ return child.data.Parent && parent.data.ObjectID == child.data.Parent.ObjectID; });
							};
						while(ordinal < (orderedPortfolioItemStores.length-1) && parentPortfolioItemRecord){
							parentPortfolioItemRecord = getParentRecord(parentPortfolioItemRecord, orderedPortfolioItemStores[ordinal+1].store.getRange());
							++ordinal;
						}
						if(ordinal === (orderedPortfolioItemStores.length-1) && parentPortfolioItemRecord)
							me.PortfolioItemMap[lowPortfolioItemRecord.data.ObjectID] = parentPortfolioItemRecord.data.Name;
					});
				});
		},		
		_loadUserStories: function(){
			var me = this;
			me.MatrixUserStoryBreakdown = {};
			me.MatrixProjectMap = {};
			return Q.all(_.map(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
				var portfolioItemName = portfolioItemRecord.data.Name, 
					config = {
						model: me.UserStory,
						url: 'https://rally1.rallydev.com/slm/webservice/v2.0/HierarchicalRequirement',
						params: {
							pagesize:200,
							query: '(PortfolioItem.ObjectID = "' + portfolioItemRecord.data.ObjectID + '")',
							fetch:['Name', 'ObjectID', 'Project', 'Release', 'Children',
								'PlanEstimate', 'FormattedID', 'ScheduleState', 'PortfolioItem'].join(','),
							workspace:me.getContext().getWorkspace()._ref
						}
					};
				return me._parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name;		
						if(!me.MatrixUserStoryBreakdown[projectName]) 
							me.MatrixUserStoryBreakdown[projectName] = {};
						if(!me.MatrixUserStoryBreakdown[projectName][portfolioItemName]) 
							me.MatrixUserStoryBreakdown[projectName][portfolioItemName] = [];
						me.MatrixUserStoryBreakdown[projectName][portfolioItemName].push(storyRecord);						
						me.MatrixProjectMap[projectName] = storyRecord.data.Project.ObjectID;
					});
				});
			}));
		},		
			
		/**___________________________________ TEAM COMMITS STUFF ___________________________________**/	
		_getTeamCommits: function(portfolioItemRecord){
			var me=this,
				tcString = portfolioItemRecord.data.c_TeamCommits;
			try{ return JSON.parse(atob(tcString)) || {}; }
			catch(e){ return {}; }
		},	
		_getTeamCommit: function(portfolioItemRecord, projectName){	
			var me=this,
				projectID = me.MatrixProjectMap[projectName],
				teamCommits = me._getTeamCommits(portfolioItemRecord);
			return teamCommits[projectID] || {};
		},	
		_setTeamCommitsField: function(portfolioItemRecord, projectName, field, value){
			var me=this,
				projectID = me.MatrixProjectMap[projectName],
				teamCommits = me._getTeamCommits(portfolioItemRecord),
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
		_getGridHeight: function(){
			var me = this, 
				iframe = Ext.get(window.frameElement);
			return iframe.getHeight() - me.down('#navbox').getHeight() - 20;
		},
		_getGridWidth: function(columnCfgs){
			var me = this; 
			if(!me.MatrixGrid) return;
			else return Math.min(
				_.reduce(columnCfgs, function(item, sum){ return sum + item.width; }, 20), 
				window.innerWidth - 20
			);
		},	
		_changeGridSize: function(){
			var me=this;
			if(!me.MatrixGrid) return;
			else me.MatrixGrid.setSize(me._getGridWidth(me.MatrixGrid.config.columnCfgs), me._getGridHeight());
		},	
		_initGridResize: function(){
			var me=this;
			if(me._addWindowEventListener){
				me._addWindowEventListener('resize', me._changeGridSize.bind(me));
			}
		},	

		/**___________________________________ UTILITY FUNCTIONS ___________________________________*/
		_clearToolTip: function(){
			var me = this;
			if(me.tooltip){
				me.tooltip.panel.hide();
				me.tooltip.triangle.hide();
				me.tooltip.panel.destroy();
				me.tooltip.triangle.destroy();
				me.tooltip = null;
			}
		},	
		_getDistanceFromBottomOfScreen: function(innerY){
			var me = this, 
				iframe = window.frameElement,
				iframeOffsetY = window.parent.getScrollY() + iframe.getBoundingClientRect().top,
				actualY = iframeOffsetY + innerY;
			return window.parent.getWindowHeight() - actualY;
		},
			
		_getIntersectingUserStories: function(portfolioItemRecord, projectName){
			return (this.MatrixUserStoryBreakdown[projectName] || {})[portfolioItemRecord.data.Name] || [];
		},
		_getTotalUserStoryPoints: function(userStoryList){
			return _.reduce(userStoryList, function(sum, userStory){ return sum + (userStory.data.PlanEstimate || 0); }, 0);
		},
		_getCompletedUserStoryPoints: function(userStoryList){
			return _.reduce(userStoryList, function(sum, userStory){ 
				return sum + ((userStory.data.ScheduleState == 'Completed' || userStory.data.ScheduleState == 'Accepted') ? 
					(userStory.data.PlanEstimate || 0) : 0);
			}, 0);
		},
					
		_getCellCls: function(config){
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
			
			if(config.expected && config.ceComment) cls += ' manager-expected-comment-cell-small';
			else if(config.expected) cls += ' manager-expected-cell-small';
			else if(config.ceComment) cls += ' manager-comment-cell-small';
			
			return cls;
		},
		_getCellBackgroundColor: function(config){
			var me=this;		
			if(me.ViewMode == 'Normal' || config.totalPoints === 0) return '';
			else if(me.ViewMode == '% Done'){
				var fractionDone = (100*config.completedPoints/config.totalPoints>>0)/100;
				return 'rgba(' + (255*(1-fractionDone)>>0) + ', ' + (255*fractionDone>>0) + ', 0, 0.5);';
			}
		},
		_getCellInnerHTML: function(config){
			var me=this;			
			if(me.ViewMode == 'Normal') return config.userStories.length;
			else if(me.ViewMode == '% Done'){
				if(config.totalPoints === 0) return '-';
				var fractionDone = (100*config.completedPoints/config.totalPoints>>0)/100;
				return '<span title="' + config.completedPoints + '/' + config.totalPoints + ' Points Completed">' + 
					(100*fractionDone) + '%</span>';
			}	
		},
		_areColorsTheSame: function(color1, color2){
			var me=this,
				nums1 = (color1 || '').match(/\d+\.?\d*/g) || [],
				nums2 = (color2 || '').match(/\d+\.?\d*/g) || [];
			if(nums1.length != nums2.length) return false;
			if(_.some(nums1, function(num1, index){ return Math.abs(num1 - nums2[index])*100>>0 > 0; })) return false;
			return true;
		},
		_updateCell: function(portfolioItemRecord, projectName, rowIndex, columnIndex){
			var me=this,
				tableRowDOM = me.MatrixGrid.view.getNode(rowIndex),
				td = tableRowDOM.childNodes[columnIndex],
				teamCommit = me._getTeamCommit(portfolioItemRecord, projectName),
				userStories = me._getIntersectingUserStories(portfolioItemRecord, projectName),
				config = {
					userStories: userStories,
					completedPoints: (100*me._getCompletedUserStoryPoints(userStories)>>0)/100,
					totalPoints: (100*me._getTotalUserStoryPoints(userStories)>>0)/100,
					expected: teamCommit.Expected || false,
					ceComment: !!teamCommit.CEComment || false,
					commitment: teamCommit.Commitment || 'Undecided'
				},
				
				colorClassBase = 'intel-team-commits-',
				expectedClass = 'manager-expected-cell-small',
				commentClass = 'manager-comment-cell-small',
				expectedCommentClass = 'manager-expected-comment-cell-small',
				
				newCls = me._getCellCls(config),
				newColorClass = (/intel-team-commits-[A-Z]+/.exec(newCls) || [''])[0],
				newBackgroundColor = me._getCellBackgroundColor(config),
				newInnerHTML = me._getCellInnerHTML(config),
				
				classList = td.classList,
				oldBackgroundColor = td.style.backgroundColor,
				oldInnerHTML = td.childNodes[0].innerHTML,
				oldExpected = classList.contains(expectedClass),
				oldComment = classList.contains(commentClass),
				oldExpectedComment = classList.contains(expectedCommentClass),
				oldColorClass = _.find(classList, function(c){ return c.indexOf(colorClassBase) > -1; }) || '';
			
			if(((config.expected && !config.ceComment) && !(oldExpected && !oldComment && !oldExpectedComment)) ||
					((!config.expected && config.ceComment) && !(!oldExpected && oldComment && !oldExpectedComment)) ||
					((config.expected && config.ceComment) && !(!oldExpected && !oldComment && oldExpectedComment)) ||
					(!me._areColorsTheSame(newBackgroundColor, oldBackgroundColor)) ||
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
		
		_isProjectNotFullyDispositioned: function(projectName){
			var me=this;
			return _.some(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
				var teamCommit = me._getTeamCommit(portfolioItemRecord, projectName);
				return !teamCommit.Commitment || teamCommit.Commitment == 'Undefined';
			});
		},
		_getProjectHeaderCls: function(projectName){
			var me=this;
			if(me.ViewMode == 'Normal') return me._isProjectNotFullyDispositioned(projectName) ? ' not-dispositioned-project' : '';
			else return ''; //should these get green/red/grey/white
		},
		_updateGridHeader: function(projectName){
			var me=this,
				column = _.find(me.MatrixGrid.view.getGridColumns(), function(column){ return column.text == projectName; }),
				possibleClasses = ['not-dispositioned-project'];
			_.each(possibleClasses, function(cls){ column.el.removeCls(cls); });
			column.el.addCls(me._getProjectHeaderCls(projectName));
		},
	
		_isPortfolioItemNotCommittedOrHasNoStories: function(portfolioItemRecord){
			var me=this,
				portfolioItemName = portfolioItemRecord.data.Name,
				teamCommits = me._getTeamCommits(portfolioItemRecord);
			return _.some(teamCommits, function(projData, projectOID){ return projData.Commitment == 'Not Committed'; }) || 
				!_.reduce(me.MatrixUserStoryBreakdown, function(sum, portfolioItemMap){
					return sum + (portfolioItemMap[portfolioItemName] || []).length;
				}, 0);
		},		
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		_showGrids: function(){
			var me=this;
			if(!me.MatrixGrid) me._loadMatrixGrid();
		},	
		_updateGrids: function(){
			var me=this;
			if(me.PortfolioItemStore){
				if(me.MatrixStore) me.MatrixStore.intelUpdate();
			}
		},
		_reloadStores: function(){
			var me = this;
			return me._loadPortfolioItems()
				.then(function(){
					me.PortfolioItemNames = _.sortBy(_.map(me.PortfolioItemStore.getRange(), 
						function(p){ return {Name: p.data.Name}; }),
						function(p){ return p.Name; });
					me.PortfolioItemNames = [{Name: 'All ' + me.PortfolioItemTypes.slice(-1).pop()}].concat(me.PortfolioItemNames);
					return me._loadUserStories();
				})
				.then(function(){
					//always show the teams under the train that have teamMembers > 0, even if they are not contributing this release
					_.each(me.ProjectsWithTeamMembers, function(projectRecord){
						var projectName = projectRecord.data.Name;
						if(!me.MatrixProjectMap[projectName]) me.MatrixProjectMap[projectName] = projectRecord.data.ObjectID;
						if(!me.MatrixUserStoryBreakdown[projectName]) me.MatrixUserStoryBreakdown[projectName] = {};
					});
				});
		},
		_clearEverything: function(){
			var me=this;
			
			me._clearToolTip();
			if(me.MatrixGrid) {
				me.MatrixGrid.up().remove(me.MatrixGrid);
				me.MatrixGrid = undefined;
			}
			if(me.PortfolioItemPicker) {
				me.PortfolioItemPicker.up().remove(me.PortfolioItemPicker);
				me.PortfolioItemPicker = undefined;
			}
			
			me.UserStoryStore = undefined;
			me.PortfolioItemStore = undefined;
			
			me.MatrixStore = undefined;		
		},
		_reloadEverything: function(){
			var me=this;

			me.setLoading('Loading Data');
			me._enqueue(function(unlockFunc){
				me._clearEverything();
				if(!me.ReleasePicker){
					me._loadReleasePicker();
					me._loadClickModePicker();
					me._loadViewModePicker();
					me._loadClearFiltersButton();
					me._loadMatrixLegend();
				}				
				me._reloadStores()
					.then(function(){ me._updateGrids(); })
					.then(function(){ me._showGrids(); })
					.fail(function(reason){ me._alert('ERROR', reason); })
					.then(function(){
						me.setLoading(false);
						unlockFunc();
					})
					.done();
			}, 'Queue-Main');
		},
		
		/**___________________________________ REFRESHING DATA ___________________________________*/	
		_refreshDataFunc: function(){
			var me=this;
			me._enqueue(function(unlockFunc){
				me._reloadStores()
					.then(function(){ me._updateGrids(); })
					.then(function(){ me._showGrids(); })
					.fail(function(reason){ me._alert('ERROR', reason || ''); })
					.then(function(){ unlockFunc(); })
					.done();
			}, 'Queue-Main');
		},	
		_clearRefreshInterval: function(){
			var me=this;
			if(me.RefreshInterval){ 
				clearInterval(me.RefreshInterval); 
				me.RefreshInterval = undefined; 
			}	
		},
		_setRefreshInterval: function(){
			var me=this;
			me._clearRefreshInterval();
			me.RefreshInterval = setInterval(function(){ me._refreshDataFunc(); }, 10000);
		},
			
		/**___________________________________ LAUNCH ___________________________________*/	
		launch: function(){
			var me = this;
			me.setLoading('Loading configuration');
			me.ClickMode = 'Details';
			me.ViewMode = 'Normal';
			me._initDisableResizeHandle();
			me._initFixRallyDashboard();
			me._initGridResize();
			if(!me.getContext().getPermissions().isProjectEditor(me.getContext().getProject())){
				me.setLoading(false);
				me._alert('ERROR', 'You do not have permissions to edit this project');
				return;
			}	
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //3 streams
						me._projectInWhichTrain(me.ProjectRecord) /********* 1 ********/
							.then(function(trainRecord){
								if(trainRecord && me.ProjectRecord.data.ObjectID == trainRecord.data.ObjectID){
									me.TrainRecord = trainRecord;
									return me._loadTrainPortfolioProject(me.TrainRecord)
										.then(function(trainPortfolioProject){
											if(!trainPortfolioProject) return Q.reject('Invalid portfolio location');
											me.TrainPortfolioProject = trainPortfolioProject;
										});
								} 
								else return Q.reject('You are not scoped to a train');
							}),
						me._loadAppsPreference() /********* 2 ********/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var twelveWeeks = 1000*60*60*24*7*12;
								return me._loadReleasesAfterGivenDate(me.ProjectRecord, (new Date()*1 - twelveWeeks));
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							}),
						me._loadProjectsWithTeamMembers(me.ProjectRecord) /******* 3 *********/
							.then(function(projectsWithTeamMembers){ 
								me.ProjectsWithTeamMembers = projectsWithTeamMembers; 
							})
					]);
				})
				.then(function(){ 
					me._setRefreshInterval(); 
					return me._reloadEverything(); 
				})
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		_releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me._saveAppsPreference(me.AppsPref)
				.then(function(){ me._reloadEverything(); })
				.fail(function(reason){ me._alert('ERROR', reason || ''); })
				.then(function(){ me.setLoading(false); })
				.done();
		},				
		_loadReleasePicker: function(){
			var me=this;
			me.ReleasePicker = me.down('#navboxLeftVert').add({
				xtype:'intelreleasepicker',
				id: 'releasePicker',
				labelWidth: 70,
				width: 250,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord,
				listeners: { select: me._releasePickerSelected.bind(me) }
			});
		},	
		_clickModePickerSelected: function(combo, records){
			var me=this, value = records[0].data.ClickMode;
			if(value === me.ClickMode) return;
			else me.ClickMode = value;
			me._clearToolTip();
		},				
		_loadClickModePicker: function(){
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
						{ClickMode:'Details'}
					]
				}),
				displayField: 'ClickMode',
				value:me.ClickMode,
				listeners: { select: me._clickModePickerSelected.bind(me) }
			});
		},	
		_viewModePickerSelected: function(combo, records){
			var me=this, value = records[0].data.ViewMode;
			if(value === me.ViewMode) return;
			else me.ViewMode = value;
			me._clearToolTip();
			if(me.MatrixStore) me.MatrixStore.intelUpdate();
		},				
		_loadViewModePicker: function(){
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
				listeners: { select: me._viewModePickerSelected.bind(me) }
			});
		},	
		_clearFiltersButtonClicked: function(){
			var me=this;
			if(me.MatrixGrid){
				me._clearToolTip();
				me.MatrixGrid.clearCustomFilters();
			}
		},
		_loadClearFiltersButton: function(){
			var me=this;
			me.ClearFiltersButton = me.down('#navboxLeftVert').add({
				xtype:'button',
				text:'Remove Filters',
				id: 'manualRefreshButton',
				width:110,
				listeners:{ click: me._clearFiltersButtonClicked.bind(me) }
			});
		},
		_loadMatrixLegend: function(){
			var me=this;
			me.MatrixLegend = me.down('#navboxRight').add({
				xtype:'container',
				width:120,	
				layout: {
					type:'vbox',
					align:'stretch',
					pack:'start'
				},
				border:true,
				frame:false,
				items: _.map(['Committed', 'Not Committed', 'N/A', 'Undefined', 'Expected', 'CE Comment'], function(name){
					var color;
					if(name === 'Undecided') color='white';
					if(name === 'N/A') color='rgba(224, 224, 224, 0.50)'; //grey
					if(name === 'Committed') color='rgba(0, 255, 0, 0.50)';//green
					if(name === 'Not Committed') color='rgba(255, 0, 0, 0.50)';//red
					if(name === 'Expected') color='rgba(251, 255, 0, 0.50)'; //yellow
					if(name === 'CE Comment') color='rgba(76, 76, 255, 0.50)'; //blue
					return {
						xtype: 'container',
						width:120,
						border:false,
						frame:false,
						html:'<div class="intel-legend-item">' + name + 
							': <div style="background-color:' + color + '" class="intel-legend-dot"></div></div>'
					};
				})
			});
		},

		/************************************************************* RENDER ********************************************************************/
		_loadMatrixGrid: function(){
			var me = this,
				MoSCoWRanks = ['Must', 'Should', 'Could', 'Won\'t', 'Undefined', ''],
				sortedPortfolioItems = _.sortBy(me.PortfolioItemStore.getRange(), function(p){ return MoSCoWRanks.indexOf(p.data.c_MoSCoW); }),
				matrixRecords = _.map(sortedPortfolioItems, function(portfolioItemRecord, index){
					return {
						PortfolioItemObjectID: portfolioItemRecord.data.ObjectID,
						PortfolioItemRank: index+1,
						PortfolioItemName: portfolioItemRecord.data.Name,
						PortfolioItemFormattedID: portfolioItemRecord.data.FormattedID,
						PortfolioItemPlannedEnd: portfolioItemRecord.data.PlannedEndDate*1,
						TopPortfolioItemName: me.PortfolioItemMap[portfolioItemRecord.data.ObjectID],
						MoSCoW: portfolioItemRecord.data.c_MoSCoW
					};
				});		
			
			var filterMoSCoW = null, 
				filterTopPortfolioItem = null;
			function matrixGridFilter(matrixRecord){
				if(filterMoSCoW){
					if(filterMoSCoW == 'Undefined'){
							if(matrixRecord.data.MoSCoW && matrixRecord.data.MoSCoW != filterMoSCoW) return false;
					}
					else if(matrixRecord.data.MoSCoW != filterMoSCoW) return false;
				}
				if(filterTopPortfolioItem &&  matrixRecord.data.TopPortfolioItemName != filterTopPortfolioItem) return false;
				return true;
			}		
			function filterMatrixRowsByFn(fn){
				_.each(me.MatrixStore.getRange(), function(item, index){
					if(fn(item)) me.MatrixGrid.view.removeRowCls(index, 'matrix-hidden-grid-row');
					else me.MatrixGrid.view.addRowCls(index, 'matrix-hidden-grid-row');
				});
			}
			function removeFilters(){
				filterMoSCoW = null;
				filterTopPortfolioItem = null;
				filterMatrixRowsByFn(function(){ return true; });
				Ext.getCmp('matrix-moscow-filter').setValue('All');
				Ext.getCmp('matrix-top-portfolioitem-filter').setValue('All');
			}
			
			function getMoSCoWfilterOptions(){
				return [{MoSCoW: 'All'}].concat(_.map(_.sortBy(_.union(_.map(me.CustomRisksStore.getRange(), 
					function(r){ return r.data.MoSCoW; })), 
					function(f){ return f; }), 
					function(f){ return {MoSCoW:f}; }));
			}
			function getTopPortfolioItemFilterOptions(){
				return [{PortfolioItemName:'All'}].concat(_.map(_.sortBy(_.union(_.values(me.PortfolioItemMap)), 
					function(p){ return p; }), 
					function(p){ return {PortfolioItemName:p}; }));
			}
			function updateFilterOptions(){}			
			
			
			me.MatrixStore = Ext.create('Intel.data.FastStore', {
				data: matrixRecords,
				model: 'CommitsMatrixPortfolioItem',
				autoSync:true,
				limit:Infinity,
				proxy: {
					type:'fastsessionproxy',
					id: 'Session-proxy-' + Math.random()
				},
				intelUpdate: function(){			
					var projectNames = Object.keys(me.MatrixUserStoryBreakdown).sort();
					_.each(projectNames, function(projectName){ me._updateGridHeader(projectName); });
					_.each(me.MatrixStore.getRange(), function(matrixRecord, rowIndex){
						var refreshWholeRow = false,
							portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(portfolioItemRecord){
								return portfolioItemRecord.data.ObjectID == matrixRecord.data.PortfolioItemObjectID;
							});
						if(matrixRecord.data.MoSCoW != portfolioItemRecord.data.c_MoSCoW)
							matrixRecord.set('MoSCoW', portfolioItemRecord.data.c_MoSCoW);
						_.each(projectNames, function(projectName, colIndex){
							var changedContents = me._updateCell(portfolioItemRecord, projectName, rowIndex, colIndex);
							if(changedContents) refreshWholeRow = true;
						});
						if(refreshWholeRow) me.MatrixGrid.view.refreshNode(rowIndex);
					});
					filterMatrixRowsByFn(matrixGridFilter);
				}
			});

			var defaultColumnCfgs = [{
				text:'MoSCoW', 
				dataIndex:'MoSCoW',
				tdCls: 'intel-editor-cell',	
				width:100,
				maxHeight:80,
				editor:{
					xtype:'intelfixedcombo',
					store: Ext.create('Ext.data.Store', {
						fields: ['MoSCoW'],
						data:[
							{MoSCoW:'Must'},
							{MoSCoW:'Should'},
							{MoSCoW:'Could'},
							{MoSCoW:'Won\'t'},
							{MoSCoW:'Undefined'}
						]
					}),
					displayField:'MoSCoW'
				},
				resizable:false,
				draggable:false,
				sortable:true,
				menuDisabled:true,
				locked:true,			
				doSort: function(direction){
					this.up('grid').getStore().sort({
						sorterFn: function(item1, item2){
							var diff = MoSCoWRanks.indexOf(item1.data.MoSCoW) - MoSCoWRanks.indexOf(item2.data.MoSCoW);
							if(diff === 0) return 0;
							return (direction=='ASC' ? 1 : -1) * (diff > 0 ? 1 : -1);
						}
					});
				},
				renderer:function(val, meta){ return val || 'Undefined'; },	
				layout:'hbox',
				items: [{	
					id:'matrix-moscow-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['MoSCoW'],
						data: [
							{MoSCoW: 'All'},
							{MoSCoW:'Must'},
							{MoSCoW:'Could'},
							{MoSCoW:'Should'},
							{MoSCoW:'Won\'t'},
							{MoSCoW:'Undefined'}
						]
					}),
					displayField: 'MoSCoW',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.MoSCoW == 'All') filterMoSCoW = null; 
							else filterMoSCoW = selected[0].data.MoSCoW;
							me._clearToolTip();
							filterMatrixRowsByFn(matrixGridFilter);
						}
					}
				}, {xtype:'container', width:5}]		
			},{
				text:'#', 
				dataIndex:'PortfolioItemFormattedID',
				width:50,
				maxHeight:80,
				editor:false,
				sortable:true,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				renderer:function(formattedID, meta, matrixRecord){
					var portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ return item.data.FormattedID == formattedID; });
					if(me.ViewMode == 'Normal'){
						if(me._isPortfolioItemNotCommittedOrHasNoStories(portfolioItemRecord)) meta.tdCls += ' not-committed-portfolio-item';
					}
					if(portfolioItemRecord.data.Project){
						return '<a href="https://rally1.rallydev.com/#/' + portfolioItemRecord.data.Project.ObjectID + 'd/detail/portfolioitem/' + 
							me.PortfolioItemTypes[0] + '/' + portfolioItemRecord.data.ObjectID + '" target="_blank">' + formattedID + '</a>';
					}
					else return name;
				}
			},{
				text:me.PortfolioItemTypes[0], 
				dataIndex:'PortfolioItemName',
				width:200,
				maxHeight:80,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true,
				renderer: function(value, metaData) {
					metaData.tdAttr = 'title="' + value + '"';
					return value;
				}
			},{
				text: me.PortfolioItemTypes.slice(-1)[0], 
				dataIndex:'TopPortfolioItemName',
				width:90,
				maxHeight:80,
				editor:false,
				sortable:true,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				layout:'hbox',
				items:[{
					id:'matrix-top-portfolioitem-filter',
					xtype:'intelfixedcombo',
					flex:1,
					store: Ext.create('Ext.data.Store', {
						fields:['PortfolioItemName'],
						data: getTopPortfolioItemFilterOptions()
					}),
					displayField: 'PortfolioItemName',
					value:'All',
					listeners:{
						focus: function(combo) { combo.expand(); },
						select: function(combo, selected){
							if(selected[0].data.PortfolioItemName == 'All') filterTopPortfolioItem = null; 
							else filterTopPortfolioItem = selected[0].data.PortfolioItemName;
							me._clearToolTip();
							filterMatrixRowsByFn(matrixGridFilter);
						}
					}
				}, {xtype:'container', width:5}]
			},{
				text:'Planned End',
				dataIndex:'PortfolioItemPlannedEnd',
				width:60,
				maxHeight:80,
				editor:false,
				resizable:false,
				draggable:false,
				menuDisabled:true,
				locked:true,
				sortable:true,
				renderer: function(date){ return (date ? 'ww' + me._getWorkweek(date) : '-'); }
			}];
		
			var columnCfgs = defaultColumnCfgs.slice();
			Object.keys(me.MatrixUserStoryBreakdown).sort().forEach(function(projectName){
				columnCfgs.push({
					text: projectName,
					dataIndex:'PortfolioItemObjectID',
					tdCls: 'intel-editor-cell',
					cls: me._getProjectHeaderCls(projectName),
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
						var teamCommit = me._getTeamCommit(portfolioItemRecord, projectName),
							userStories = me._getIntersectingUserStories(portfolioItemRecord, projectName),
							config = {
								userStories: userStories,
								completedPoints: (100*me._getCompletedUserStoryPoints(userStories)>>0)/100,
								totalPoints: (100*me._getTotalUserStoryPoints(userStories)>>0)/100,
								expected: teamCommit.Expected || false,
								ceComment: !!teamCommit.CEComment || false,
								commitment: teamCommit.Commitment || 'Undecided'
							};
						metaData.tdCls += me._getCellCls(config);
						metaData.tdAttr += 'style="background-color:' + me._getCellBackgroundColor(config) + '"';
						return me._getCellInnerHTML(config);
					}
				});
			});
			
			me.MatrixGrid = me.add({
				xtype: 'grid',
				width: me._getGridWidth(columnCfgs),
				height: me._getGridHeight(),
				scroll:'both',
				resizable:false,
				columns: columnCfgs,
				disableSelection: true,
				plugins: [ 'fastcellediting' ],
				viewConfig: {
					xtype:'scrolltableview',
					preserveScrollOnRefresh:true,
					getRowClass: function(matrixRecord){ 
						if(!matrixGridFilter(matrixRecord)) return 'matrix-hidden-grid-row';
					}
				},
				listeners: {
					sortchange: function(){ me._clearToolTip(); },
					beforeedit: function(editor, e){
						var projectName = e.column.text,
							matrixRecord = e.record;
							
						if(projectName == 'MoSCoW') return;
						if(me.ClickMode == 'Flag'){
							me.MatrixGrid.setLoading('Saving');
							me._enqueue(function(unlockFunc){
								me._loadPortfolioItemByOrdinal(matrixRecord.data.PortfolioItemObjectID, 0)
									.then(function(portfolioItemRecord){
										var tcae = me._getTeamCommit(portfolioItemRecord, projectName);
										return me._setTeamCommitsField(portfolioItemRecord, projectName, 'Expected', !tcae.Expected);
									})
									.then(function(portfolioItemRecord){
										var localRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
											return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
										});
										localRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
										me.MatrixGrid.view.refreshNode(me.MatrixStore.indexOf(matrixRecord));
									})
									.fail(function(reason){ me._alert('ERROR', reason || ''); })
									.then(function(portfolioItemRecord){
										me.MatrixGrid.setLoading(false);
										unlockFunc();
									})
									.done();
							}, 'Queue-Main');
						}
						return false;
					}, 
					edit: function(editor, e){
						var field = e.field,
							matrixRecord = e.record,
							value = e.value,
							originalValue = e.originalValue;
						
						if(field != 'MoSCoW') return;
						if(value == originalValue) return;
						if(!value){
							matrixRecord.set(field, originalValue);
							return;
						}
						me.MatrixGrid.setLoading('Saving');
						
						me._enqueue(function(unlockFunc){
							me._loadPortfolioItemByOrdinal(matrixRecord.data.PortfolioItemObjectID, 0)
								.then(function(portfolioItemRecord){
									portfolioItemRecord.set('c_MoSCoW', value);
									portfolioItemRecord.save({ 
										callback:function(record, operation, success){
											if(!success) me._alert('Failed to modify PortfolioItem: ' + portfolioItemRecord.data.FormattedID);
											me.MatrixGrid.setLoading(false);
											unlockFunc();
										}
									});
								});
						}, 'Queue-Main');	
					},
					afterrender: function (grid) {
						var view = grid.view.normalView; //lockedView and normalView		
						
						view.getEl().on('scroll', function(){ me._clearToolTip(); });
						
						grid.mon(view, {
							uievent: function (type, view, cell, row, col, e){
								if((me.ClickMode === 'Details' || me.ClickMode === 'Comment') && type === 'mousedown') {
									me.setLoading('Waiting');
									me._enqueue(function(unlockFunc){ //need _enqueue because MatrixUserStoryBreakdown could be null due to an ongoing refresh
										me.setLoading(false);
										var matrixRecord = me.MatrixStore.getAt(row),
											projectName = view.getGridColumns()[col].text,
											portfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
												return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
											}),
											teamCommit = me._getTeamCommit(portfolioItemRecord, projectName),
											oldTooltip = me.tooltip,
											pos = cell.getBoundingClientRect(),
											dbs = me._getDistanceFromBottomOfScreen(pos.top),
											panelWidth = 400;
										if(oldTooltip) me._clearToolTip();
										if(oldTooltip && (oldTooltip.row == row && oldTooltip.col == col)){
											unlockFunc();
											return;
										}
										function moveAndResizePanel(panel){
											var upsideDown = (dbs < panel.getHeight() + 80);
											panel.setPosition(pos.left-panelWidth, (upsideDown ? pos.bottom - panel.getHeight() : pos.top));
										}
										
										if(me.ClickMode === 'Details'){
											var panelHTML = [
												'<p><b>CE Comment:</b> ' + (teamCommit.CEComment || '') + '</p>',
												'<p><b>Objective:</b> ' + (teamCommit.Objective || '') + '</p>',
												'<p><b>PlanEstimate: </b>',
													_.reduce(me.MatrixUserStoryBreakdown[projectName][portfolioItemRecord.data.Name] || [], function(sum, sr){
														return sum + (sr.data.Children.Count === 0 ? (sr.data.PlanEstimate || 0) : 0); 
													}, 0),
												'<p><b>UserStories: </b><div style="max-height:200px;overflow-y:auto;"><ol>'].join('');
											(me.MatrixUserStoryBreakdown[projectName][portfolioItemRecord.data.Name] || []).forEach(function(sr){
												panelHTML += '<li><a href="https://rally1.rallydev.com/#/' + sr.data.Project.ObjectID + 
													'd/detail/userstory/' + sr.data.ObjectID + '" target="_blank">' + sr.data.FormattedID + '</a>:' +
													'<span title="' + sr.data.Name + '">' + 
													sr.data.Name.substring(0, 40) + (sr.data.Name.length > 40 ? '...' : '') + '</span></li>';
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
														cls: 'tooltip-inner-container',
														items:[{
															xtype:'container',
															cls: 'tooltip-inner-left-container',
															flex:1,
															items:[{
																xtype:'container',
																html:panelHTML
															}]
														},{
															xtype:'button',
															cls:'tooltip-close',
															text:'X',
															width:20,
															handler: function(){ me._clearToolTip(); }
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
														cls: 'tooltip-inner-container',
														items:[{
															xtype:'container',
															cls: 'tooltip-inner-left-container',
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
																		me._enqueue(function(unlockFunc){
																			me._loadPortfolioItemByOrdinal(portfolioItemRecord.data.ObjectID, 0)
																				.then(function(portfolioItemRecord){
																					var tcae = me._getTeamCommit(portfolioItemRecord, projectName);
																					return me._setTeamCommitsField(portfolioItemRecord, projectName, 'Expected', !tcae.Expected);
																				})
																				.then(function(portfolioItemRecord){
																					var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
																						return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
																					});
																					storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
																					me.MatrixGrid.view.refreshNode(me.MatrixStore.indexOf(matrixRecord));
																				})
																				.fail(function(reason){ me._alert('ERROR', reason || ''); })
																				.then(function(portfolioItemRecord){
																					me.tooltip.panel.setLoading(false);
																					unlockFunc();
																				})
																				.done();
																		}, 'Queue-Main');
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
																		me._enqueue(function(unlockFunc){
																			me._loadPortfolioItemByOrdinal(portfolioItemRecord.data.ObjectID, 0)
																				.then(function(portfolioItemRecord){ 
																					var val = Ext.getCmp('MatrixTooltipPanelTextarea').getValue();
																					return me._setTeamCommitsField(portfolioItemRecord, projectName, 'CEComment', val);
																				})
																				.then(function(portfolioItemRecord){
																					var storePortfolioItemRecord = _.find(me.PortfolioItemStore.getRange(), function(item){ 
																						return item.data.ObjectID == matrixRecord.data.PortfolioItemObjectID; 
																					});
																					storePortfolioItemRecord.data.c_TeamCommits = portfolioItemRecord.data.c_TeamCommits;
																					me.MatrixGrid.view.refreshNode(row);
																				})
																				.fail(function(reason){ me._alert('ERROR', reason || ''); })
																				.then(function(portfolioItemRecord){
																					me.tooltip.panel.setLoading(false);
																					unlockFunc();
																				})
																				.done();
																		}, 'Queue-Main');
																	}
																}
															}]
														},{
															xtype:'button',
															cls:'tooltip-close',
															text:'X',
															width:20,
															handler: function(){ me._clearToolTip(); }
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
										unlockFunc();
									}, 'Queue-Main');
								}
							}
						});
					}
				},
				enableEditing:false,
				store: me.MatrixStore
			});	
			me.MatrixGrid.clearCustomFilters = removeFilters;
		}
	});
}());