(function(){
	var Ext = window.Ext4 || window.Ext;
	Ext.define('Intel.RetroDashboard', {
		extend: 'Intel.lib.IntelRallyApp',
		componentCls: 'app',
		requires: [
			'Intel.lib.chart.FastCumulativeFlowCalculator'
		],
		mixins: [
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.CumulativeFlowChartMixin',
			'Intel.lib.mixin.ParallelLoader'
		],
		items:[{
			xtype: 'container', 
			id: 'retroWrapper',
			cls: 'chart-wrapper',
			items:[{
				xtype: 'container', 
				id: 'datePickerWrapper',
				layout: {
					type: 'hbox'
				},
				items:[{
					xtype:'container',
					id: 'retroReleasePicker',
					width:'240px'
				},{
					xtype:'component',
					id:'cntClickForDateChange',
					cls:'clickForDateChange',
					width:'390px',
					autoEl: {
						tag: 'a',
						html: 'Please Click here to change the Release Start Date'
					},
					listeners   : {
						el : {
							click: {
								element: 'el', //bind to the underlying el property on the panel
								fn: function(){ 
									Rally.getApp()._buildReleasePickerStartDate();
								}
							}
						}
					}
				},{
					xtype:'container',
					id:'cntDatePickerWrapper',
					hidden: true,
					width: '390px',
					layout: {
						type: 'hbox',
						align:'left'
					}		
				}]
			},{
				xtype:'container',
				id:'cntInformation',
				items:[{
					xtype:'component',
					cls:'help',
					autoEl: {
						tag: 'a',
						html: '<span>Help <img src="https://rally1.rallydev.com/slm/images/icon_help.gif" alt="Help" title="Help" ></span>'
					},
					listeners   : {
						el : {
							click: {
								element: 'el', //bind to the underlying el property on the panel
								fn: function(){ 
									var html = ['<ul class ="ulInformation"><li><b>Scope Delta</b> = (Final Workload - Original Commit) / Original Commit</li>',
										'<li><b>A/C Original</b> = Final Accepted / Original Commit</li>',
										'<li><b>A/C Final</b> = Final Accepted / Final Workload</li>',
										'<li>Sample dates are taken on <b>7th day</b> of the Release Start Date and on the Release End Date for Scope Delta , and 10 days after Release Start Date for' +
										[lowestPortfolioItemType]  +'Scope Change.</li>',
										'<li>If there are 0 points at Release End Date, then the ideal and projected data are taken for the sample.</li>',
										'<li>You can change the Release Start Date for the selected Release. This will update the sample date for the Release Start Date.</li>',
										'<li>Once Release Start Date for a selected Release is changed, it will be saved and reloaded with the saved Release Start Date in future.</li>',
										'<li><b>Final Accepted</b> is the total points for user stories that are accepted at the Release End Date',
										'<li><b>Final Workload</b> is the total points for user stories at the Release End Date',
										'<li><b>Initial Commit</b> is the total points for user stories at the Release Start Date</ul>'
										].join('\n');
									Rally.getApp().alert('Information on Data Calculations',html);
								}
							}
						}
					}					
				}]

				},{
				xtype: 'container',//container divided later into three sub containers
				id: 'retroBarChartWrapper',
				cls: 'barchart-wrapper',
				layout: {
					type: 'hbox',
					align:'left'
				},
				renderTo: document.body,
				items:[{
					xtype:'container',
					id: 'retroChart',                   
					height: 390,
					width: '44%'                        
				},{
					xtype:'container',//Scope container Wrapper
					id : 'retroBarChartScopeWrapper',
					height: 350,
					width: '18%'
				},{
					xtype:'container',// CA original wrapper 
					id: 'retroBarChartCaOriginalWrapper',
					height: 350,
					width: '18%'
				},{ 
					xtype:'container',
					id: 'retroBarChartCaFinalWrapper',
					height: 350,
					width: '18%'//CA final container
				}] 
			},{
				xtype:'container',//legend
				id:'legend',
				html:[
					'<div class="legendwrapper">',
						'<div class="dtarget"></div>',
						'<div class="dtargetwrapper">Did Not Meet Target</div>',
						'<div class="mtarget"></div>',
						'<div class="mtargetwrapper">Met Target</div>',
						'<div class="atarget"></div>',
						'<div class="mtargetwrapper">A/C = Accept To Commit</div>',
					'</div>'].join('\n')
			},{
				xtype:'tabpanel',
				id: 'scopeGridWrapper',
				listeners: {
					boxready: function(){
						$('.x-tab-bar .x-tab-inner').css({'width':'130px','font-size':'12px'});
						$('.x-tab-bar .x-tab-default').removeClass("x-tab-default");
						$('.x-tab-bar').addClass("x-tab-default-override");
					}
				},
				items:[{
					xtype:'container',
					title: "Progress",
					id: 'scopeGrid'
				},{
					xtype:'container',
					title:"Art Scrum Fitness",
					items:[{
						xtype:'container',
						id: 'grdScrumHealthHeader'
					},{
						xtype:'container',
						id: 'grdScrumHealth',
						cls:'grd-ScrumHealth'
					}]

				}]
			}]
		}],
		projectFields: ['ObjectID', 'Releases', 'Children', 'Parent', 'Name'], //override intel-rally-app		
		portfolioItemFields: ['Name','ObjectID','FormattedID','Release','PlannedEndDate'], //override intel-rally-app
		releaseFields:  ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'], //override intel-rally-app
		userAppsPref: 'intel-retro-dashboard',	//dont share release scope settings with other apps	
		
		/****************************************************** RELEASE PICKER ********************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			Ext.getCmp('cntDatePickerWrapper').removeAll();
			Ext.getCmp('cntClickForDateChange').show();			
			Ext.getCmp('cntDatePickerWrapper').hide();
			me.releaseStartDateChanged = false;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			me._reloadEverything()
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		},
		_buildReleasePicker: function(){
			var me = this;
			me.ReleasePicker = Ext.getCmp('retroReleasePicker').add({
				xtype: 'intelreleasepicker',//this is a intel component in intel-release-picker.js
				labelWidth: 40,
				releases: me.ReleaseRecords,
				currentRelease: me.ReleaseRecord, 
				listeners: {
					change: function(combo, newval, oldval){if(newval.length===0) combo.setValue(oldval); },
					select: me._releasePickerSelected,
					scope: me 
				}
			});
		},
		_buildReleasePickerStartDate: function(){
			Ext.getCmp('cntDatePickerWrapper').removeAll(); 
			Ext.getCmp('cntClickForDateChange').hide();
			Ext.getCmp('cntDatePickerWrapper').show();
			var me = this;
			//var	_6days = 1000 * 60 *60 *24*6;
			var datePickerDefaultDate;
			var rid = me.ReleaseRecord.data.ObjectID;
			var pid = me.ProjectRecord.data.ObjectID;
			var releaseSampleDataDate =  new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 /* + _6days */);
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			datePickerDefaultDate = !!(me.AppsPref.projs[pid][rid]) ? new Date(me.AppsPref.projs[pid][rid].ReleaseStartDate):releaseSampleDataDate ;
			var maxDate = me.ReleaseRecord.data.ReleaseDate > new Date() ? new Date() : me.ReleaseRecord.data.ReleaseDate;
			var items = [{
				xtype: 'rallydatefield',
				id:'ReleaseDatePicker',
				fieldLabel: 'Select Release Start Date',
				labelWidth:140,
				minValue: releaseSampleDataDate,
				maxValue: maxDate,
				value: datePickerDefaultDate,
				showToday:false
			},{
				xtype:'button',
				text: 'Update',
				id: "btnUpdateReleaseDate",
				scope: me,
				handler: function() {
					var txtValue = new Date(Ext.getCmp('ReleaseDatePicker').value).toLocaleDateString();
					if(Date.parse(txtValue) >= Date.parse(new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 /* + _6days */)) && Date.parse(txtValue) <= Date.parse(maxDate)){
						//saving the release start date
						me.setLoading("Loading");
						return me.loadReleaseByNameForProject(me.ReleaseRecord.data.Name,me.ProjectRecord)
						.then(function(releaseRecordstore){
							//reseting it again as couldnt figure out why the time gets reset when date is picked from the calendar for past releases
							//TODO: find out why release record time get reset
							me.ReleaseRecord = releaseRecordstore;
							me.AppsPref.projs[pid] = me.AppsPref.projs[pid] || {};
							me.AppsPref.projs[pid][rid] =  me.AppsPref.projs[pid][rid] || {};
							me.AppsPref.projs[pid][rid].ReleaseStartDate = txtValue;
							return me.saveAppsPreference(me.AppsPref)
								.then(function(){ 
									me.releaseStartDateChanged = true;
									me.datePickerDate = txtValue;
									var date1 = me.ReleaseRecord.data.ReleaseStartDate,
										date2 = new Date(me.datePickerDate),
										_1day = 1000 * 60 * 60 * 24 ; 
									var daysCountDifference = Math.floor(( Date.parse(date2) - Date.parse(date1) ) / _1day );
									//taking sample 7 days before and after the release
									//data for calculating scope change
									//commit to accept original and final calculation
									me.initialAddedDaysCount = me.releaseStartDateChanged && daysCountDifference >= 0 ? daysCountDifference : 6; 
									me._buildCumulativeFlowChart(); 
									me._buildRetroChart();
									me._hideHighchartsLinks();
									Ext.getCmp('grdScrumHealthHeader').update(" ");
									Ext.getCmp('scopeGrid').removeAll(); 
									Ext.getCmp('grdScrumHealth').removeAll(); 
									me._buildScopeToReleaseStore();
									me._buildPortfolioProgressGrid();
									me._buildArtScrumFitnessGridStore();
									me._renderReleaseDetailHeader(); 
									me._buildFitnessGrid();
									me.setLoading(false);
								});
							})
						.fail(function(reason){ me.alert('ERROR', reason); })
						.done();
						
					}else{
						me.alert(
							"Date Validation Note:",
							"The entered date should be between Release start date(" + releaseSampleDataDate.toLocaleDateString() +") and Release end date("+ maxDate.toLocaleDateString() +")."
						);
					}
				}
			}];	
			Ext.getCmp('cntDatePickerWrapper').add(items); 
		},
		/****************************************************** DATA STORE METHODS ********************************************************/
		_getTeamTypeAndNumber: function(scrumName){ //NOTE this assumes that your teamNames are "<TeamType> <Number> - <TrainName>"
			var name = scrumName.split('-')[0],
				teamType = name.split(/\d/)[0],
				number = (teamType === name ? 1 : name.split(teamType)[1])*1;
			return {
				TeamType: teamType.trim(),
				Number: number
			};
		},	
		_loadAllChildReleases: function(){ 
			var me = this, releaseName = me.ReleaseRecord.data.Name;
			me.ReleasesWithNameHash ={};
			return me.loadReleasesByNameUnderProject(releaseName, me.ScrumGroupRootRecord)
				.then(function(releaseRecords){
					me.ReleasesWithNameHash = _.reduce(releaseRecords, function(hash, rr){
						hash[rr.data.ObjectID] = true;
						return hash;
					}, {});
				});
		},
		_getPortfolioItems: function(){
			var me=this, releaseName = me.ReleaseRecord.data.Name;
			me.LowestPortfolioItemsHash = {};
			me.PortfolioItemsInReleaseStore = null;
			//NOTE: we are loading ALL lowestPortfolioItems b/c sometimes we run into issues where
			//userstories in one release are under portfolioItems in another release (probably a user
			// mistake). And this messes up the numbers in the topPortfolioItem filter box
			return me.loadPortfolioItemsOfType(me.ScrumGroupPortfolioProject, me.PortfolioItemTypes[0])
				.then(function(portfolioItemStore){
					var portfolioItemsInRelease = _.filter(portfolioItemStore.getRange(), function(pi){ return (pi.data.Release || {}).Name == releaseName; });
					me.PortfolioItemsInReleaseStore = Ext.create('Rally.data.wsapi.Store', {
						model: me['PortfolioItem/' + me.PortfolioItemTypes[0]], 
						data: portfolioItemsInRelease,
						totalCount: portfolioItemsInRelease.length,
						disableMetaChangeEvent: true,
						load: function(){}
					});

					me.LowestPortfolioItemsHash = _.reduce(portfolioItemStore.getRange(), function(hash, r){
						hash[r.data.ObjectID] = (r.data.Release || {}).Name || 'No Release';
						return hash;
					}, {});
				});
		},
		_loadSnapshotStores: function(){
			var me = this, 
				releaseStart = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseEnd = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseName = me.ReleaseRecord.data.Name,
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			me.AllSnapshots = [];
			me.TeamStores = {};
			var projectId = "";
			return Q.all(_.map(me.CurrentScrum ? [me.CurrentScrum] : me.LeafProjects, function(project){
				var parallelLoaderConfig = {
					context:{ 
						workspace: me.getContext().getGlobalContext().getWorkspace()._ref,
						project: project.data._ref
					},
					compress:true,
					findConfig: { 
						_TypeHierarchy: 'HierarchicalRequirement',
						Project: project.data.ObjectID,
						_ValidFrom: { $lte: releaseEnd },
						_ValidTo: { $gt: releaseStart },
						Children: null
					},
					fetch: ['ScheduleState', 'PlanEstimate', 'Release', lowestPortfolioItemType, '_ValidFrom', '_ValidTo', 'ObjectID','Name'],
					hydrate: ['ScheduleState']
				};   
				return me.parallelLoadLookbackStore(parallelLoaderConfig).then(function(snapshotStore){ 
					//only keep snapshots where (release.name == releaseName || (!release && portfolioItem.Release.Name == releaseName))
					var records = _.filter(snapshotStore.getRange(), function(snapshot){
						projectId = snapshot.data.Project;
						//console.log( projectId, snapshot.data[lowestPortfolioItemType], me.LowestPortfolioItemsHash[snapshot.data[lowestPortfolioItemType]], releaseName)
						return (me.ReleasesWithNameHash[snapshot.data.Release] || 
								(!snapshot.data.Release  && me.LowestPortfolioItemsHash[snapshot.data[lowestPortfolioItemType]] == releaseName)) &&
							(snapshot.data._ValidFrom != snapshot.data._ValidTo);
					});
					if(!me.TeamStores[projectId]) me.TeamStores[projectId] = [];
					me.TeamStores[projectId] = me.TeamStores[projectId].concat(records);
					me.AllSnapshots = me.AllSnapshots.concat(records);
				});	
			}));
		},    
		_getUserStoryFilter: function(){			
			var me = this,
				releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseNameFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', value: releaseName }),// this will ONLY get leaf-stories (good)
				inIterationButNotReleaseFilter =
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.StartDate', operator:'<', value:releaseDate}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.EndDate', operator:'>', value:releaseStartDate})).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', operator: '!=', value: releaseName })).and(
          Ext.create('Rally.data.wsapi.Filter', { property: 'Iteration.Name', operator: 'contains', value: releaseName}).and(
					Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }))),
				userStoryProjectFilter;
				
			if(!me.ScrumGroupRootRecord) //scoped outside scrum group
				userStoryProjectFilter = Ext.create('Rally.data.wsapi.Filter', { 
					property: 'Project.ObjectID', 
					value: me.CurrentScrum.data.ObjectID 
				});
			else if(me.LeafProjects && Object.keys(me.LeafProjects).length) //load all US within scrum group
				userStoryProjectFilter = _.reduce(me.LeafProjects, function(filter, projectData, projectOID){
					var newFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'Project.ObjectID', value: projectOID});
					if(filter) return filter.or(newFilter);
					else return newFilter;
				}, null);
			else throw "No scrums were found!";
			return Rally.data.wsapi.Filter.and([
				userStoryProjectFilter, 
				Rally.data.wsapi.Filter.or([inIterationButNotReleaseFilter, releaseNameFilter])
			]);
		},				
		_getStories: function(){
			var me=this,
				lowestPortfolioItem = me.PortfolioItemTypes[0],
				config = {
					model: 'HierarchicalRequirement',
					filters: [me._getUserStoryFilter()],
					fetch:['Name', 'ObjectID', 'Project', 'PlannedEndDate', 'ActualEndDate', 'StartDate', 'EndDate', 'Iteration', 
							'Release', 'Description', 'Tasks', 'PlanEstimate', 'FormattedID', 'ScheduleState', 
							'Blocked', 'BlockedReason', 'Blocker', 'CreationDate', lowestPortfolioItem],
					context:{ 
						workspace:me.getContext().getWorkspace()._ref, 
						project: me.ProjectRecord.data._ref 
					}
				};
			return me.parallelLoadWsapiStore(config).then(function(store){
				me.UserStoryStore = store;
				return store;
			});
		},
		_buildScopeToReleaseStore: function(){
			var me = this,
				userStorySnapshots = me.AllSnapshots,
				_10days = 1000 * 60 *60 *24*10,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				date1 = me.ReleaseRecord.data.ReleaseStartDate,
				date2 = new Date(me.datePickerDate),
				daysCountDifference = Math.floor(( Date.parse(date2) - Date.parse(date1) )),
				startTargetDate = me.releaseStartDateChanged && daysCountDifference >0 ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + daysCountDifference): new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + _10days),
				finalTargetDate = new Date(new Date(me.ReleaseRecord.data.ReleaseDate)*1),
				scopeToReleaseGridRows = [],
				
				userStorySnapshotsInitialWithoutPortfolioItems = _.filter(userStorySnapshots, function (userStorySnapshot){
					return new Date(userStorySnapshot.data._ValidFrom) < startTargetDate && 
					new Date(userStorySnapshot.data._ValidTo) > startTargetDate && 
					!userStorySnapshot.data[lowestPortfolioItemType];
				}),
				userStorySnapshotsFinalWithoutPortfolioItems = _.filter(userStorySnapshots, function (userStorySnapshot){
					return new Date(userStorySnapshot.data._ValidFrom) < finalTargetDate && 
					new Date(userStorySnapshot.data._ValidTo) > finalTargetDate && 
					!userStorySnapshot.data[lowestPortfolioItemType];
				}),        
				userStorySnapshotsInitialWithPortfolioItems = _.filter(userStorySnapshots, function (userStorySnapshot){
					return new Date(userStorySnapshot.data._ValidFrom) < startTargetDate && 
					new Date(userStorySnapshot.data._ValidTo) > startTargetDate && 
					!!userStorySnapshot.data[lowestPortfolioItemType];
				}),
				userStorySnapshotsFinalWithPortfolioItems = _.filter(userStorySnapshots, function (userStorySnapshot){
					return new Date(userStorySnapshot.data._ValidFrom) < finalTargetDate && 
					new Date(userStorySnapshot.data._ValidTo) > finalTargetDate && 
					!!userStorySnapshot.data[lowestPortfolioItemType];
				});
			me.WsapiUserStoryMap = {};
			var UserStoryStoreItems = !(me.UserStoryStore) ? {} : me.UserStoryStore.getRange();
			me.WsapiUserStoryMap = _.reduce(UserStoryStoreItems, function(hash, r, key){
				if(r.data[lowestPortfolioItemType] !== null){
					var featureID = r.data[lowestPortfolioItemType].ObjectID;
					hash[r.data[lowestPortfolioItemType].ObjectID] = _.filter(me.UserStoryStore.getRange(),function(f){
						if(f.data[lowestPortfolioItemType] !== null) 
							return f.data[lowestPortfolioItemType].ObjectID === featureID; 
					});
				}
				return hash;
			}, {});
			_.each(me.PortfolioItemsInReleaseStore.getRange(), function(portfolioItemRecord,key){
				var scopeToReleaseGridRow = {},
					releaseStartSnapshots =[],
					releaseFinalSnapshots =[],
					userStoriesForPortfolioItem = me.WsapiUserStoryMap[portfolioItemRecord.data.ObjectID],

					userStorySnapshotsInitialForPortfolioItem = _.filter(userStorySnapshotsInitialWithPortfolioItems, function (userStorySnapshot){
						return portfolioItemRecord.data.ObjectID === userStorySnapshot.data[lowestPortfolioItemType];
					}),
					userStorySnapshotsFinalForPortfolioItem = _.filter(userStorySnapshotsFinalWithPortfolioItems, function (userStorySnapshot){
						return portfolioItemRecord.data.ObjectID === userStorySnapshot.data[lowestPortfolioItemType];
					});
					
			releaseStartSnapshots = releaseStartSnapshots.concat(userStorySnapshotsInitialForPortfolioItem);
			releaseFinalSnapshots = releaseFinalSnapshots.concat(userStorySnapshotsFinalForPortfolioItem);

			_.each(userStoriesForPortfolioItem, function(wsapiUserStory){
				var userStorySnapshotsInitialWithoutPortfolioItem = _.filter(userStorySnapshotsInitialWithoutPortfolioItems, function (userStorySnapshot){
						return userStorySnapshot.data.ObjectID === wsapiUserStory.data.ObjectID;
					}),
					userStorySnapshotsFinalWithoutPortfolioItem = _.filter(userStorySnapshotsFinalWithoutPortfolioItems, function (userStorySnapshot){
						return userStorySnapshot.data.ObjectID === wsapiUserStory.data.ObjectID;
					});
				releaseStartSnapshots = releaseStartSnapshots.concat(userStorySnapshotsInitialWithoutPortfolioItem);
				releaseFinalSnapshots = releaseFinalSnapshots.concat(userStorySnapshotsFinalWithoutPortfolioItem);
			});
				
			if(releaseStartSnapshots.length > 0 || releaseFinalSnapshots.length > 0){
				var startDateAcceptedPoints = _.reduce(releaseStartSnapshots, function(sum, item){ 
						return sum + (item.data.ScheduleState =='Accepted' ? item.data.PlanEstimate*1 : 0);
					}, 0),
					startDateNotAcceptedPoints =_.reduce(releaseStartSnapshots, function(sum, item){ 
						return sum + (item.data.ScheduleState !='Accepted' ? item.data.PlanEstimate*1 : 0);
					}, 0),
					startDateTotalPoints = _.reduce(releaseStartSnapshots, function(sum, item){ 
						return sum + (item.data.PlanEstimate*1);
					}, 0),
													
					//to get the % complete at release end
					//EndtargetDate  = new Date('03/07/2015')
					//EndreleaseStartSnapshots = _.filter(snapshots, ss._validFrom < targetDate && ss._ValidTo > targetDate)
					//completedPOints = sum EndreleaseStartSnapshots by PlanEstimate if ScheduleState == 'Completed' || 'Accepted'
					//totalPoints = sum EndreleaseStartSnapshots by PlanEstimate
					finalDateAcceptedPoints = _.reduce(releaseFinalSnapshots, function(sum, item){ 
						return sum + (item.data.ScheduleState =='Accepted' ? item.data.PlanEstimate*1 : 0);
					}, 0),
					finalDateNotAcceptedPoints =_.reduce(releaseFinalSnapshots, function(sum, item){ 
						return sum + (item.data.ScheduleState !='Accepted' ? item.data.PlanEstimate*1 : 0);
					}, 0),
					finalDatetotalPoints = _.reduce(releaseFinalSnapshots, function(sum, item){ 
						return sum + (item.data.PlanEstimate*1);
					}, 0);
							
				scopeToReleaseGridRow.completedAtStart = startDateAcceptedPoints / startDateTotalPoints;
				scopeToReleaseGridRow.completedAtEnd = finalDateAcceptedPoints / finalDatetotalPoints;
				if(isFinite(scopeToReleaseGridRow.completedAtStart) === false) {
					scopeToReleaseGridRow.completedAtStart = 0;
				}
				if(isFinite(scopeToReleaseGridRow.completedAtEnd) === false) {
					scopeToReleaseGridRow.completedAtEnd = 0;
				}
			
				if(startDateTotalPoints === 0) scopeToReleaseGridRow.growth = finalDatetotalPoints;                  
				else scopeToReleaseGridRow.growth = (finalDatetotalPoints - startDateTotalPoints )/ startDateTotalPoints;
				
				scopeToReleaseGridRow.intent = startDateTotalPoints.toFixed(0);//startDateNotAcceptedPoints;//plan to do //inital planned 
				scopeToReleaseGridRow.actual  = finalDatetotalPoints.toFixed(0); //finalDateNotAcceptedPoints;//acutal done //Points at end of release
				scopeToReleaseGridRow.FormattedID = portfolioItemRecord.data.FormattedID;
				scopeToReleaseGridRow.Name = portfolioItemRecord.data.Name;
				scopeToReleaseGridRow.ObjectID = portfolioItemRecord.data.ObjectID;
				scopeToReleaseGridRow.ProjectObjectID = portfolioItemRecord.data.Project.ObjectID;
				portfolioItemRecord.state = portfolioItemRecord.data.State;
				scopeToReleaseGridRows = scopeToReleaseGridRows.concat(scopeToReleaseGridRow);
			}
			});
			//the month starts from 0 so Jan is 0 
			me.InitialTargetDate = [startTargetDate.getMonth() + 1 ,startTargetDate.getDate(),startTargetDate.getFullYear()].join('/');
			me.CompleteFinalTargetDate = [finalTargetDate.getMonth() + 1,finalTargetDate.getDate(),finalTargetDate.getFullYear()].join('/');
			me.gridstore = Ext.create('Ext.data.Store',{
				fields:['completedAtStart', 'completedAtEnd','growth','intent','actual','FormattedID','Name','ObjectID','ProjectObjectID','state'],
				data: scopeToReleaseGridRows 
			});
		},
		_calculateDataIntegrity: function(projectStoreMap){
			var me = this;
			var releaseName = me.ReleaseRecord.data.Name;
			//blocked stories
			var blockedStories = 0, unsizedStoires= 0,  improperlySizedStoires= 0,  storyWithoutIteration= 0, 
				storyWithoutRelease= 0,  unacceptedStoriesinPastIteration= 0,  storiesScheduleAfterFeatureEndDate= 0;
				
			blockedStories = _.size(_.filter(projectStoreMap, function(userStories){
				return userStories.data.Blocked === true;
				}));
			// unsized stories
			unsizedStoires = _.size(_.filter(projectStoreMap, function(userStories){
				return userStories.data.PlanEstimate === null;
				}));
			//improperly sized stories
			improperlySizedStoires = _.size(_.filter(projectStoreMap, function(userStories){
				if (userStories.data.PlanEstimate !== null && 
					userStories.data.PlanEstimate !== 0 &&	
					userStories.data.PlanEstimate !== 1 &&	
					userStories.data.PlanEstimate !== 2 && 
					userStories.data.PlanEstimate !== 4 &&	
					userStories.data.PlanEstimate !== 8 && 
					userStories.data.PlanEstimate !== 16 )
          return userStories;
				}));
			//stories in release without iteration 
			storyWithoutIteration = _.size(_.filter(projectStoreMap, function(userStories){
				return userStories.data.Iteration === null;
				}));
			//stories in iteration not attached to release
			storyinIterationNotAttachedToRelease = _.size(_.filter(projectStoreMap, function(userStories){
				if(!userStories.data.Iteration)	return false;
				return (userStories.data.Iteration.Name.indexOf(releaseName) > -1) &&(!userStories.data.Release || userStories.data.Release.Name.indexOf(releaseName) < 0);
			}));
			//unaccepted stories in past iteration
			var today = new Date(),
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			unacceptedStoriesinPastIteration = _.size(_.filter(projectStoreMap, function(userStories){
				if(userStories.data.Iteration!==null && userStories.data.Iteration.EndDate < today.toISOString() && userStories.data.ScheduleState!='Accepted')
					return userStories;
			}));
			// stories scheduled after lowestPortfolioItemType end date
			storiesScheduleAfterFeatureEndDate =  _.size(_.filter(projectStoreMap, function(userStories){
				if(userStories.data[lowestPortfolioItemType] !==null && 
					userStories.data.Iteration!==null &&
					userStories.data[lowestPortfolioItemType].PlannedEndDate < userStories.data.Iteration.StartDate && 
					userStories.data.ScheduleState !="Accepted")
					return userStories;
				}));
				return unsizedStoires + improperlySizedStoires + storyWithoutIteration + storyWithoutRelease + unacceptedStoriesinPastIteration + storiesScheduleAfterFeatureEndDate;
		},
		_buildFitnessGrid: function(){
			var me = this;
			me.loadedFitnesstab = true;
			var columnConfiguration = [
				{
					header: "Scrum Team", 
					dataIndex: "scrumTeam",
					flex:2
				},
				{
					header: "Original Commit<br/>@" + me.initialCommitDate, 
					dataIndex: "initalCommit",
					flex:2
				},
				{
					header: "Final Workload<br/>@" + me.finalCommitDate, 
					dataIndex: "totalFinal",
					flex:2
				},
				{
					header: "Final Accepted<br/>@" + me.finalCommitDate, 
					dataIndex: "finalAccepted",
					flex:2
				}, 
				{
					header: "Scope Change<br/> Good : Acceptable Increase = +10% <br/>Good : Aceeptable Decrease = -10%", 
					dataIndex: "scopeChange",
					flex:2
				},
				{
					header: "Accept/Commit(Original) <br/> Good : >=90% but <=100% ",
					dataIndex: "acceptToCommit",
					flex:2
				},
				{
					header: "Data Integrity<br/>Good : DI <= 5 ", 
					dataIndex: "dataIntegrity",
					flex:1
				}
			];
			var scrumDataRequireAttentionStore = Ext.create('Rally.data.custom.Store',{
					data: me.scrumDataRequireAttention
				});	
			var scrumDataRequireAttentionGrid = Ext.create('Rally.ui.grid.Grid',{
					store: scrumDataRequireAttentionStore,
					showPagingToolbar: false,
					title:"<span class ='require-attention'>Require Attention</span>",
					columnCfgs:columnConfiguration 
				});
			var scrumDataRecognizedStore = Ext.create('Rally.data.custom.Store',{
					data: me.scrumDataRecognized 
				});	
			var scrumDataRecognizedGrid = Ext.create('Rally.ui.grid.Grid',{
					store: scrumDataRecognizedStore,
					showPagingToolbar: false,
					title:"<span class ='good-job'> Recognized Scrum</span>",
					columnCfgs:columnConfiguration 
				});
			var scrumDateReEnforceStore = Ext.create('Rally.data.custom.Store',{
					data: me.scrumDataReEnforce
				});	
			var scrumDateReEnforceStoreGrid = Ext.create('Rally.ui.grid.Grid',{
					store: scrumDateReEnforceStore,
					showPagingToolbar: false,
					title: "How Can I Help?" ,
					columnCfgs:columnConfiguration 
				});
			Ext.getCmp('grdScrumHealth').add(scrumDataRecognizedGrid);
			Ext.getCmp('grdScrumHealth').add(scrumDataRequireAttentionGrid);		
			Ext.getCmp('grdScrumHealth').add(scrumDateReEnforceStoreGrid);	
		},
		_renderReleaseDetailHeader: function() {
			var me = this,
				workWeek = me.ReleaseRecord.data.ReleaseDate < new Date() ? me.getWorkweek(me.ReleaseRecord.data.ReleaseDate) :    me.getWorkweek(new Date()),
				dataIntegrityDashboardLink = "<span class ='link-achor good-job'><a href='https://rally1.rallydev.com/#/" + me.ProjectRecord.data.ObjectID + "d/custom/22859089715' target='_blank'>Click here to view the  ART DATA INTEGRITY DASHBOARD</a></span>",
				dataAsOf = (me.ReleaseRecord.data.ReleaseDate < new Date() ? me.ReleaseRecord.data.ReleaseDate : new Date());

				var releaseDetailHeaderHtml = ["Release: " + me.ReleaseRecord.data.Name ,  
					"ReleaseStartDate: " + new Date(me.ReleaseRecord.data.ReleaseStartDate).toLocaleDateString() , 
					"ReleaseEndDate: " + new Date(me.ReleaseRecord.data.ReleaseDate).toLocaleDateString() , 
					"Data as of: " + dataAsOf.toLocaleDateString(), 
					"WorkWeek: ww" + workWeek,
					"<br/>" + dataIntegrityDashboardLink].join(",");

				Ext.getCmp('grdScrumHealthHeader').update(releaseDetailHeaderHtml);

    },		
		_buildPortfolioProgressGrid: function(){
			var me = this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			Ext.getCmp('scopeGrid').add({
				xtype: 'rallygrid',
				id: 'grid',
				showRowActionsColumn: false,
				selModel:{
					ignoreRightMouseSelection:true,
					checkOnly:true
				},
				enableEditing: false,
				autoScroll: true,
				height: 500,
				showPagingToolbar: false,
				title: [lowestPortfolioItemType] +' Progress in the Release ('+ me.InitialTargetDate + ' - ' + me.CompleteFinalTargetDate + ')',
				store: me.gridstore,
				columnCfgs: [{
					header: lowestPortfolioItemType + 's',
					dataIndex: "Name",
					flex:4,
					renderer: function(v, m, r) {
						return Ext.String.format('<a href="{0}/#/{1}d/detail/portfolioitem/{2}/{3}" target="_blank">{4}: </a>{5}', 
							me.BaseUrl, r.data.ProjectObjectID, lowestPortfolioItemType, r.data.ObjectID, r.data.FormattedID, v );
					}
				},{
					header: "% Complete<br/> @ Release Start " + me.InitialTargetDate,
					dataIndex: "completedAtStart",
					flex:2,
					xtype:'intelcomponentcolumn',
					tdCls: 'iconCell',
					resizable:false,
					draggable:false,
					renderer: function(v, meta, record){
						return {
							xtype:'progressbar',
							text:[(v* 100).toFixed(2), '%'].join(''),
							width:'100px',
							value:v 
						};
					}
				},{
					header:"% Complete<br/>@ Release End " + me.CompleteFinalTargetDate,
					dataIndex: "completedAtEnd",
					flex:2,
					xtype:'intelcomponentcolumn',
					tdCls: 'iconCell',
					resizable:false,
					draggable:false,
					renderer: function(v, meta, record){
						return {
							xtype:'progressbar',
							text:[(v* 100).toFixed(2), '%'].join(''),
							width:'100px',
							value:v 
						};                                      
					}
				},{
					header: "Points Planned<br/> @ Release Start " + me.InitialTargetDate,
					dataIndex: "intent",
					flex:1
				},{
					header: "Final Points <br/>@ Release End " + me.CompleteFinalTargetDate,
					dataIndex: "actual",
					flex:1
				},{
					header: lowestPortfolioItemType + " Scope Change",
					dataIndex: "growth",
					flex:2,
					xtype:'intelcomponentcolumn',
					tdCls: 'iconCell',
					resizable:false,
					draggable:false,
					renderer: function(v, meta, record){
						var growthText = "";
						if(v > 0) growthText = '+' + [(v* 100).toFixed(2), '%'].join('');
						else growthText = [(v* 100).toFixed(2), '%'].join('');
						return {
							xtype:'container',
							html:growthText
						};
					} 
				},{
					header: lowestPortfolioItemType + " State",
					dataIndex: "state",
					flex:1
				}]
			});
		
		},
		_buildArtScrumFitnessGridStore: function(){
			var me = this,
			calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator',{
					scheduleStates:me.ScheduleStates,
					startDate: me.ReleaseRecord.data.ReleaseStartDate,
					endDate: me.ReleaseRecord.data.ReleaseDate
				});
		//WsapiUserStoryMap for DataIntegrity
			me.TeamStoresDI = _.reduce(me.UserStoryStore.getRange(), function(hash, r,key){
				var teamName = r.data.Project.Name;
				hash[r.data.Project.Name] = _.filter(me.UserStoryStore.getRange(),function(f){ return f.data.Project.Name === teamName; });
				return hash;
			}, {});
			
			me.dataIntegrity[me.TeamType] = 0;
			me.initialAddedDaysCount = (typeof(me.initialAddedDaysCount) === "undefined") ? 6 : me.initialAddedDaysCount ;
//			me.dataIntegrity[teamName] = DI;
			//Fitness grid 
			var recognized = "<span class='good-job'> Recognized scrum of the week</span>",
				requireAttention = "<span class='require-attention'> Require Attention</span>",
				requireHelp = "<span class='require-attention'>How can I help?</span>",
				requireHelpImage = "<span><img src='https://rally1.rallydev.com/slm/images/icon_help.gif' alt='Help' title='How can I help?' border='0' height='24' width='24'></span>",
				reInforce = " (Re Enforce)",
				good = "<span class='good-job'> (Good)</span>";
			me.scrumData = _.reduce(me.ProjectsOfFunction, function(hash, r,key){
				var teamName = r.data.Name,
					teamObjectID = r.data.ObjectID;
				if(!me.TeamStores[teamObjectID]) return hash;
				me.aggregateChartData[teamName] = me.updateCumulativeFlowChartData((calc.runCalculation(me.TeamStores[teamObjectID])), {trendType:'Last2Sprints'});
				var finalCommitIndex = me.aggregateChartData[teamName].categories.length - 1;
				hash[r.data.Name] = function fitnessGridColumnCalc(){
					var totalinitial = _.reduce(me.aggregateChartData[teamName].series,function(sum,s){
						if(s.name== "Projected" || s.name=="Ideal") return sum + 0;
						return  sum + s.data[me.initialAddedDaysCount];
					},0);
					var totalProjected = _.reduce(me.aggregateChartData[teamName].series,function(sum,s){
						if(s.name!= "Projected") return sum + 0;
						if(typeof(s.data[finalCommitIndex]) == "object") return sum +  s.data[finalCommitIndex].y;
						else	return sum + s.data[finalCommitIndex];					
						},0);
					var totalIdeal = _.reduce(me.aggregateChartData[teamName].series,function(sum,s){
						if(s.name === "Ideal") return sum + s.data[finalCommitIndex];
						else	return sum + 0;					
						},0);
					var DI =  me._calculateDataIntegrity(me.TeamStoresDI[teamName]);
					scopechange= ((totalIdeal - totalinitial)/totalinitial) * 100 ;
					acceptToCommit = (totalProjected/totalinitial)*100;
					var teamStatus ="",
						scopeStatus ="";
					scopeStatus =  (scopechange>= -10 && scopechange <= 10.99)? good : requireAttention;
					teamStatus  = (DI <= 5 &&	((scopechange >= -10 && scopechange <= 10.99) ) && 
					acceptToCommit>90 && acceptToCommit<=100.99) ? recognized : requireAttention;
					scopechange = ($.isNumeric(scopechange) ? (scopechange.toFixed(2)> 0 ? '+' + scopechange.toFixed(2) + '%' + scopeStatus : scopechange.toFixed(2) + '%'+ scopeStatus) : "-");
					acceptToCommit = ($.isNumeric(acceptToCommit) ? (acceptToCommit.toFixed(2) > 90 && acceptToCommit<=100.99 ? acceptToCommit.toFixed(2)+ '%'+ good : acceptToCommit.toFixed(2) + '%'+ requireAttention) : "-"); 
					/* scopechange = $.isNumeric(scopechange) ? scopechange : "-";
					acceptToCommit = $.isNumeric(acceptToCommit) ? acceptToCommit : "-"; */
					
					return {initalCommit : totalinitial,
						totalFinal : totalIdeal,
						finalAccepted : totalProjected,
						scopeChange:  scopechange,
						acceptToCommit: acceptToCommit,
						dataIntegrity: DI <= 5 ? DI + good :DI + requireAttention,
						scrumTeam:teamName,
						status:teamStatus,
						categories: (teamName.split("-")[0])
					};
			}();
			return hash;
			}, {});
		//all good
		me.scrumDataRecognized = [],
		me.scrumDataRequireAttention =[],
		me.scrumDataReEnforce =[];
		_.each(me.scrumData,function(team){
			if(team.status.indexOf(recognized) > -1 ){
				me.scrumDataRecognized.push(team);
			}else if(team.scopeChange.indexOf(requireAttention)> -1 && team.dataIntegrity.indexOf(requireAttention)> -1 && team.acceptToCommit.indexOf(requireAttention)> -1 ){
				team.scopeChange = team.scopeChange.replace(requireAttention,requireHelpImage);
				team.dataIntegrity = team.dataIntegrity.replace(requireAttention,requireHelpImage);
				team.acceptToCommit = team.acceptToCommit.replace(requireAttention,requireHelpImage);
				me.scrumDataRequireAttention.push(team);
			}else{
				team.scopeChange = team.scopeChange.replace(requireAttention,requireHelpImage);
				team.dataIntegrity = team.dataIntegrity.replace(requireAttention,requireHelpImage);
				team.acceptToCommit = team.acceptToCommit.replace(requireAttention,requireHelpImage);
				team.status = team.status.replace(requireAttention,requireHelp);
				me.scrumDataReEnforce.push(team);
			}
		});
		},
		_buildCumulativeFlowChart: function(){
			var me = this,
			calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator',{
					scheduleStates:me.ScheduleStates,
					startDate: me.ReleaseRecord.data.ReleaseStartDate,
					endDate: me.ReleaseRecord.data.ReleaseDate
				});

			//chart config setting 
			//using jquery to use the high charts
			//uses ChartUpdater mixin
			//uses IntelWorkweek mixin
			me.initialAddedDaysCount = (typeof(me.initialAddedDaysCount) === "undefined") ? 6 : me.initialAddedDaysCount ;
			me.dataIntegrity ={},
			me.aggregateChartData ={};
			me.dataIntegrity[me.TeamType] = 0;
			me.totalInitial = {};
			var scopechange ={},
				acceptToCommit={},
				datemap = {},
				totalCommitReleaseStart = {},
				categories = [],
				dataAcceptCommit=[],
				dataScope=[],
				todayIndex = -1,
				lastIndex = -1;
			//calculation Scope Change and A/C
			function calculateScopeAC(teamName){
				var totalinitial = 0 ;
				var finalCommit = 0 ; 
				var finalAccepted = 0;
				var totalProjected = 0 ; 
				var totalideal = 0;
				var finalCommitIndex = me.aggregateChartData[teamName].categories.length - 1;
				_.each(me.aggregateChartData[teamName].series,function(f){
					if(f.name==="Accepted"){
						finalAccepted = finalAccepted + f.data[finalCommitIndex];}
					//we want to ignore the ideal and the projected from the aggregateChartData
					if(f.name !="Ideal" && f.name != "Projected"){
						//taking sample after 7 days and before 7 days 
						//or date from date picker
						totalinitial = totalinitial + f.data[me.initialAddedDaysCount];
						finalCommit = finalCommit + f.data[finalCommitIndex];}
					//if the release is still on going we would like to use the projected data for the final commit
					if(f.name === "Projected"){
						totalProjected = totalProjected+ f.data[finalCommitIndex];}
					if(f.name === "Ideal"){
						totalideal = totalideal + f.data[finalCommitIndex];}
				});
				if(finalCommit === 0){
					finalCommit = totalideal > 0 ? totalideal : totalProjected;
					finalAccepted = totalProjected > 0 ? totalProjected : totalideal;}
				if(teamName === me.TeamType){
					me.total ={};
					me.total.initialCommit = totalinitial;
					me.total.finalCommit = finalCommit;
					me.total.finalAccepted = finalAccepted;}  
				scopechange[teamName] = ((finalCommit - totalinitial)/totalinitial) * 100;
				acceptToCommit[teamName] = (finalAccepted/totalinitial)*100;
				categories.push(teamName.split("-")[0]);
				dataAcceptCommit.push(acceptToCommit[teamName]);
				dataScope.push(scopechange[teamName]);
			}
			//for the train as a whole 
			me.aggregateChartData[me.TeamType] = me.updateCumulativeFlowChartData((calc.runCalculation(me.AllSnapshots)), {trendType:'Last2Sprints'});
			
			datemap[me.TeamType] = me.aggregateChartData[me.TeamType].datemap;
			calculateScopeAC(me.TeamType);
			me.initialCommitDate = datemap[me.TeamType][me.initialAddedDaysCount];
			me.finalCommitDate = datemap[me.TeamType][datemap[me.TeamType].length - 1];
			me.categories = me.TeamType;
			me.dataAcceptCommit = acceptToCommit[me.TeamType];
			me.dataScope = scopechange[me.TeamType];

			//cumulative flow chart 
			var commitDataPlus =[];
			// commitDataMinus = [];
			//adding a line for the initial Commitment projection
			_.each(me.aggregateChartData[me.TeamType].categories,function(f,key){
				commitDataPlus.push(me.total.initialCommit);//commitDataMinus.push(total.initialCommit - 10);
			});
			//console.log(commitDataPlus,commitDataMinus);
			me.aggregateChartData[me.TeamType].series.push({
				colorIndex: 1,
				symbolIndex: 1,
				dashStyle: "shortdash",
				color: "red",
				data:commitDataPlus,
				name: "Commitment",
				type: "spline"
			});
			$("#retroChart").highcharts(Ext.Object.merge(me.getDefaultCFCConfig(), me.getCumulativeFlowChartColors(), {
				chart: {
					height: 400,
					width: me.getWidth()*0.42>>0,
					zoomType: ""
				},
				legend:{
					borderWidth:0,
					width:500,
					itemWidth: me.getWidth()*0.42>>0 - 50
				},
				title: {
					text: me.ProjectRecord.data.Name
				},
				subtitle:{
					text: me.ReleaseRecord.data.Name.split(' ')[0]
				},
				xAxis:{
					categories: me.aggregateChartData[me.TeamType].categories,
					tickInterval: me.getCumulativeFlowChartTicks(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.44),
					plotLines: [{
						color: '#58FAF4', // Color value
						dashStyle: 'shortdash', // Style of the plot line. Default to solid
						type: "spline",
						value: me.initialAddedDaysCount, // Value of where the line will appear
						width: 2,
						zIndex: 5,
						label : {
							text : 'Original Commit ',
							style:{
								color:'black',
								'text-shadow': '0 1px 0 white',
								background:'#40d0ed'
							}
						}						
					},{
						color: '#58FAF4', // Color value
						dashStyle: 'shortdash', // Style of the plot line. Default to solid
						type: "spline",
						value: [me.aggregateChartData[me.TeamType].categories.length - 1], // Value of where the line will appear
						width: 2,
						zIndex: 5,
						label : {
							text : 'Final Workload & Accepted',
							style:{
								color:'black',
								'text-shadow': '0 1px 0 white'
							}
						}						
						
					}]
				},
				series: me.aggregateChartData[me.TeamType].series
			}));
			me.setCumulativeFlowChartDatemap($("#retroChart").children()[0].id, datemap[me.TeamType]);
		},
		_hideHighchartsLinks: function(){
			$('.highcharts-container > svg > text:last-child').hide();
		},
		_buildRetroChart: function(){
			var me = this,
				scopeDeltaPerc = ((me.total.finalCommit - me.total.initialCommit)/((me.total.initialCommit))) * 100,
				originalCommitRatio = (me.total.finalAccepted/me.total.initialCommit)* 100,
				finalCommitRatio = (me.total.finalAccepted /me.total.finalCommit)* 100,
				dataseries = [],
				chartdefaultColorConfig = { colors: ['#3A874F','#7cb5ec'] },
				metTargetColorConfig = { colors: ['#40d0ed','#92D050'] },
				didnotMetTargetColorConfig = { colors: ['#40d0ed','#d05052'] } ,
				chartMax = []; //set the max so that all the chart look the same
			Highcharts.setOptions(chartdefaultColorConfig);
			var	defaultchartConfig = {
					chart: {
						type: 'column'
					},
					title: {
						text: scopeDeltaPerc > 0 ? 'Scope Delta: +' + scopeDeltaPerc.toFixed(2) + '%' :'Scope Delta:' + scopeDeltaPerc.toFixed(2) + '%'
					},
					subtitle: {
						text: Math.round(me.total.finalCommit) + ' of ' + Math.round(me.total.initialCommit)
					},
					xAxis: {
						categories: ['Original Commit','Final Workload'], 
						tickLength:10
					},
					yAxis: {
						min: 0,
						tickPixelInterval: 50,
						title: {
							text: 'Total Points'
						},
						plotLines : [{
							name:'maxTarget',
							value : me.total.initialCommit + (0.1 * me.total.initialCommit), //max target,
							color : '#92d947',
							dashStyle : 'shortdash',
							width : 2,
							zIndex: 5,
							label : {
								text : 'Acceptable increase (+10%)',
								style:{
									color:'black',
									'text-shadow': '0 1px 0 white'
								}
							}
						},{
							name:'minTarget',
							value : me.total.initialCommit - (0.1 * me.total.initialCommit),
							color : '#92d947',
							dashStyle : 'shortdash',
							zIndex: 5,
							width : 2,
							label : {
								text : 'Acceptable decrease (-10%) ' ,
								style:{
									color:'black',
									'text-shadow': '0 1px 0 white'
								}
							}
						}]
					},
					tooltip: {
						valueDecimals: 1
					},
					plotOptions: {
						series: {
							stacking: 'normal',
							borderWidth: 2,
							borderColor: 'white',
							shadow: true
						},
						column: {colorByPoint: true}
					},
					series: [{
						name: ['Total'],
						showInLegend: false,
						data: [{
							name:'Original Commit',
							y:me.total.initialCommit
						},{
							name:'Final Workload',
							y: me.total.finalCommit
						}],
						dataLabels: {
							enabled: true,
							format: '{point.y:,.0f}'//show no decimal points
						}
					}]
				};
			chartMax.push(me.total.initialCommit,me.total.finalAccepted, me.total.finalCommit);
			defaultchartConfig.yAxis.max = Math.max.apply(null, chartMax);
			defaultchartConfig.yAxis.max = defaultchartConfig.yAxis.max + ((20/100) * defaultchartConfig.yAxis.max);//increasing the number by 20%
			Highcharts.setOptions((scopeDeltaPerc >= -10.99 && scopeDeltaPerc <= 10.99) ? metTargetColorConfig : didnotMetTargetColorConfig);
			if(scopeDeltaPerc >= 400){
				defaultchartConfig.yAxis.plotLines[1].label = {                            
					text : 'Acceptable decrease (-10%)',
					align: 'right',
					x: -10,
					y: 16 
				};
			}
			$('#retroBarChartScopeWrapper').highcharts(defaultchartConfig);
			var	CaOriginalchartConfig = {
					subtitle: {
						text: Math.round(me.total.finalAccepted) + ' of ' + Math.round(me.total.initialCommit)
					},
					xAxis: {
						categories: ['Original Commit','Final Accepted'], 
						tickLength:10
					},  
					title: {
						text: 'A/C Original: ' + originalCommitRatio.toFixed(0) + '%'
					},
					yAxis: {
						plotLines : [{
							name:'maxTarget',
							value : (0.9 * me.total.initialCommit),
							color : '#92d947',
							dashStyle : 'shortdash',
							width : 2,
							zIndex: 5,
							label : {
								text :'Target >90%',
								align:'center',
								style:{
									color:'black',
									'text-shadow': '0 1px 0 white'
								}
							}
						}]
					},
					series: [{
						name: ['Total'],
						showInLegend: false,
						data: [{
							name:'Original Commit',
							y: me.total.initialCommit
						},{
							name:'Final Accepted',
							y: me.total.finalAccepted 
						}],
						dataLabels: {
							enabled: true,
							format: '{point.y:,.0f}'//show no decimal points
						}
					}]
				};
			Highcharts.setOptions((originalCommitRatio >= 90) ? metTargetColorConfig : didnotMetTargetColorConfig );
			$("#retroBarChartCaOriginalWrapper").highcharts(Ext.Object.merge({}, defaultchartConfig, CaOriginalchartConfig));
			
			//third chart CA orginial 
			var	caFinalchartConfig = {
					title: {
						text: 'A/C Final: ' + finalCommitRatio.toFixed(0) + '%'
					},
					subtitle: {
						text: Math.round(me.total.finalAccepted) + ' of ' + Math.round(me.total.finalCommit)
					},
					xAxis: {
						categories: ['Final Workload','Final Accepted'], 
						tickLength:10
					},
					yAxis: {
						plotLines : [{
							name:'maxTarget',
							value : (0.9 * me.total.finalCommit),
							color : '#92d947',
							dashStyle : 'shortdash',
							width : 2,
							zIndex: 5,
							label : {
								text : 'Target >90%',
								align: 'center',
								style:{
									color:'black',
									'text-shadow': '0 1px 0 white'
								}
							}
						}]
					},
					series: [{
						name: ['Total'],
						showInLegend: false,
						data: [{
							name:'Final Workload',
							y:me.total.finalCommit
						},{
							name:'Final Accepted',
							y:me.total.finalAccepted
						}],
						dataLabels: {
							enabled: true,
							format: '{point.y:,.0f}'//show no decimal points
						}
					}]
				};
			finalCommitRatio = (me.total.finalAccepted /me.total.finalCommit)* 100;
			//plus minus 10 is acceptable 
			Highcharts.setOptions((finalCommitRatio >= 90) ? metTargetColorConfig : didnotMetTargetColorConfig );
			$("#retroBarChartCaFinalWrapper").highcharts(Ext.Object.merge({}, defaultchartConfig, caFinalchartConfig));
		},
		_setUserPreferenceReleaseStartDate:function(){
			var me = this,
				rid = me.ReleaseRecord.data.ObjectID,
				pid = me.ProjectRecord.data.ObjectID;
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.releaseStartDateChanged = (!!(me.AppsPref.projs[pid][rid]))? true : false;
			if(me.releaseStartDateChanged){
				me.datePickerDate = me.AppsPref.projs[pid][rid].ReleaseStartDate;
				var date1 = me.ReleaseRecord.data.ReleaseStartDate,
					date2 = new Date(me.datePickerDate),
					_1day = 1000 * 60 * 60 * 24 ; 
				me.initialAddedDaysCount = Math.floor(( Date.parse(date2) - Date.parse(date1) ) / _1day );				
			}
		},
		_loadScopeToReleaseTab: function(){
			var me = this;
			if(me.AllSnapshots.length === 0 ){
					me.alert('ERROR', me.ScrumGroupRootRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name);
					return;     
				}else{
					me._buildScopeToReleaseStore();
					me._buildPortfolioProgressGrid();
				}
		},
		_loadARTScrumFitnessTab: function(){
			var me = this;
			return Q.all([
				me._getStories()
			])
			.then(function(){
				me._buildArtScrumFitnessGridStore();
				me._buildFitnessGrid();
				Ext.getCmp('scopeGridWrapper').setLoading(false);
				Ext.getCmp('datePickerWrapper').setLoading(false);
				me._renderReleaseDetailHeader(); 
			})
			.fail(function(reason){
				Ext.getCmp('scopeGridWrapper').setLoading(false);
				Ext.getCmp('datePickerWrapper').setLoading(false);
				me.alert('ERROR', reason); 
			})
			.done();

		},
		_reloadEverything: function(){
			var me = this;
			me.setLoading('Loading Data');
			Ext.getCmp('scopeGrid').removeAll(); 
			Ext.getCmp('grdScrumHealthHeader').update(" ");
			Ext.getCmp('grdScrumHealth').removeAll(); 
			//hack to dynamically change the tab title
			//TODO: find a better way
			Ext.getCmp('scopeGridWrapper').tabBar.activeTab.update((me.PortfolioItemTypes[0] + " Progess").toUpperCase());
			$('.x-tab-bar .x-tab-active').css({'font-size':'12px'});
			//load all the child release to get the user story snap shots
			//get the portfolioItems from wsapi
			return Q.all([
				me._loadAllChildReleases() ,
				me._getPortfolioItems()
			])
			.then(function(){
				//loading it again if you have multiple tab open for the same app 
				//and changing date from different tab
				//you will be able to see the right away
				return me.loadAppsPreference().then(function(appsPref){
					me.AppsPref = appsPref;
					me._setUserPreferenceReleaseStartDate();
				});
			})
			.then(function(){ 
				return me._loadSnapshotStores(); 
			})
			.then(function(){  
				//load all the user story snap shot for release
				//load all the user stories for the release portfolioItems
				me._buildCumulativeFlowChart();
				me._buildRetroChart();
				me._hideHighchartsLinks();

			})
			.then(function(){ 
				if(me.AllSnapshots.length === 0 ){
					me.alert('ERROR', me.ScrumGroupRootRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name);
					return;     
				}else{
					Ext.getCmp('scopeGridWrapper').setLoading("Loading Scrum Fitness Grid");
					Ext.getCmp('datePickerWrapper').setLoading("Loading Scrum Fitness Grid");
					me._loadScopeToReleaseTab();
					me._loadARTScrumFitnessTab();
				}
			});
		},   
		launch: function() {
			var me = this;
			me.setLoading('Loading Configuration');
			me.configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me.loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //two streams
						me.projectInWhichScrumGroup(me.ProjectRecord) /********* 1 ************/
							.then(function(scrumGroupRootRecord){
								if(scrumGroupRootRecord){
									me.ScrumGroupRootRecord = scrumGroupRootRecord;
									return Q.all([
										me.loadAllLeafProjects(me.ScrumGroupRootRecord)
											.then(function(leafProjects){
												me.LeafProjects = leafProjects;
												me.TeamType = me.ProjectRecord.data.Name.split(" ")[0];
												me.ProjectsOfFunction = _.filter(me.LeafProjects, function(proj){
													return me._getTeamTypeAndNumber(proj.data.Name).TeamType; //== me.TeamType; 
												});												
												if(_.find(leafProjects, function(p){ return p.data.ObjectID == me.ProjectRecord.data.ObjectID; }))
													me.CurrentScrum = me.ProjectRecord;
												else me.CurrentScrum = null;
											}),
										me.loadScrumGroupPortfolioProject(me.ScrumGroupRootRecord)
											.then(function(scrumGroupPortfolioProject){
												me.ScrumGroupPortfolioProject = scrumGroupPortfolioProject;
											})
									]);
								} 
								else me.CurrentScrum = me.ProjectRecord;
							}),				
						me.loadAppsPreference() /******** load stream 2 *****/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var oneYear = 1000*60*60*24*365;
								var endDate = new Date();
								return me.loadReleasesBetweenDates(me.ProjectRecord, (new Date()*1 - oneYear), endDate);
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								var currentRelease = me.getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, null);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){ me._buildReleasePicker(); })
				.then(function(){ return me._reloadEverything(); })
				.fail(function(reason){ me.alert('ERROR', reason); })
				.then(function(){ me.setLoading(false); })
				.done();
		}
	});
}());