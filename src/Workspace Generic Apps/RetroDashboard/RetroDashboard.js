(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('RetroDashboard', {
		extend: 'IntelRallyApp',
		componentCls: 'app',
		requires: [
			'FastCumulativeFlowCalculator'
		],
		mixins: [
			'PrettyAlert',
			'UserAppsPreference',
			'IntelWorkweek',
			'CumulativeFlowChartMixin',
			'ParallelLoader'
		],
		items:[{
			xtype: 'container', //outside container has dropdown and the donut container
			id: 'retroWrapper',
			cls: 'chart-wrapper',
			items:[{
				xtype: 'container', //outside container has dropdown and the donut container
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
					hidden:true,
					width: '390px',
					layout: {
						type: 'hbox',
						align:'left'
					}		
				}]
			},{
				xtype:'component',
				id:'cntInformation',
				cls:'clickForDateChange appInfo',
				autoEl: {
					tag: 'a',
					html: 'Help <img src="/slm/images/icon_help.gif" alt="Help" title="Help" >'
				},
				listeners   : {
					el : {
						click: {
							element: 'el', //bind to the underlying el property on the panel
							fn: function(){ 
								var html = ['<ul class ="ulInformation"><li><b>Scope Delta</b> = (Final Workload - Original Commit) / Original Commit</li>',
									'<li><b>A/C Original</b> = Final Accepted / Original Commit</li>',
									'<li><b>A/C Final</b> = Final Accepted / Original Commit</li>',
									'<li>Sample dates are taken 7 days after Release Start Date and 7 days before the Release end date for Scope Delta , and 10 days after Release Start Date for Feature Scope Change.</li>',
									'<li>If there are 0 points at Release Start Date, then the projected data is taken for the sample, and if there is no projected data, ideal data is taken for the sample.</li>',
									'<li>You can change the Release Start Date for the selected Release. This will update the sample date for the Release Start Date.</li>',
									'<li><b>Final Accepted</b> is the total points for user stories that are accepted at the Release End Date',
									'<li><b>Final Workload</b> is the total points for user stories at the Release End Date',
									'<li><b>Initial Commit</b> is the total points for user stories at the Release Start Date</ul>'
									].join('\n');
								Rally.getApp()._alert('Information on Data Calculations',html);
							}
						}
					}
				}
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
					height: 450,
					width: '44%'                        
				},{
					xtype:'container',//Scope container Wrapper
					id : 'retroBarChartScopeWrapper',
					height: 400,
					width: '18%'
				},{
					xtype:'container',// CA original wrapper 
					id: 'retroBarChartCaOriginalWrapper',
					height: 400,
					width: '18%'
				},{ 
					xtype:'container',
					id: 'retroBarChartCaFinalWrapper',
					height: 400,
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
					'</div>'
				].join('\n')
			},{
				xtype:'container',
				id: 'scopeGridWrapper',
				items:[{
					xtype:'container',
					id: 'scopeGrid',
					width:'99%'
					//Feature grid
				}]
			}]
		}],
			
		_userAppsPref: 'intel-retro-dashboard',	//dont share release scope settings with other apps	
		
		/****************************************************** RELEASE PICKER ********************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			Ext.getCmp('cntDatePickerWrapper').removeAll(); 
			Ext.getCmp('cntDatePickerWrapper').hide();
			Ext.getCmp('cntClickForDateChange').show();
			me.releaseStartDateChanged = false;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			debugger;
			me._reloadEverything();
		},
		_buildReleasePicker: function(){
			var me = this;
			debugger;
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
			var	_6days = 1000 * 60 *60 *24*6;
			var datePickerDefaultDate;
			var rid = me.ReleaseRecord.data.ObjectID;
			var pid = me.ProjectRecord.data.ObjectID;
			var releaseSampleDataDate =  new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + _6days);
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
						handler: function() {
							var txtValue = new Date(Ext.getCmp('ReleaseDatePicker').value).toLocaleDateString();
							if(Date.parse(txtValue) >= Date.parse(new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + _6days)) && Date.parse(txtValue) <= Date.parse(maxDate)){
								//saving the release start date
								me.setLoading("Loading Data");
								me.AppsPref.projs[pid] = me.AppsPref.projs[pid] || {};
								me.AppsPref.projs[pid][rid] =  me.AppsPref.projs[pid][rid] || {};
								me.AppsPref.projs[pid][rid].ReleaseStartDate = txtValue;
								me._saveAppsPreference(me.AppsPref)
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
									me.initialAddedDaysCount = me.releaseStartDateChanged && daysCountDifference>0 ? daysCountDifference : 6; 
									me._buildCumulativeFlowChart(); 
									me._buildRetroChart();
									me._hideHighchartsLinks();
									me._loadScopeToReleaseStore();
									me._buildScopeToReleaseGrid();
									me.setLoading(false);
									})
								.fail(function(reason){
									me._alert('ERROR', reason || '');
									me.setLoading(false);})
								.done();
								
							}else{
								me._alert("Date Validation Note:","The entered date should be between Release start date(" + releaseSampleDataDate.toLocaleDateString() +") and Release end date("+ maxDate.toLocaleDateString() +").");
							}
						}
					}];	
			Ext.getCmp('cntDatePickerWrapper').add(items); 
		},
		/****************************************************** DATA STORE METHODS ********************************************************/
		_loadAllChildReleases: function(){ 
			var me = this, releaseName = me.ReleaseRecord.data.Name;	
				me.ReleasesWithNameHash ={};
			return me._loadReleasesByNameUnderProject(releaseName, me.TrainRecord)
				.then(function(releaseRecords){
					me.ReleasesWithNameHash = _.reduce(releaseRecords, function(hash, rr){
						hash[rr.data.ObjectID] = true;
							console.log("load child release", new Date());
						return hash;
					
					}, {});
				});
		},
		_loadSnapshotStores: function(){
			debugger;
			var me = this, 
				releaseStart = new Date(me.ReleaseRecord.data.ReleaseStartDate).toISOString(),
				releaseEnd = new Date(me.ReleaseRecord.data.ReleaseDate).toISOString(),
				releaseName = me.ReleaseRecord.data.Name,
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			//if scoped to a scrum but not a train 
			if (!me._isScopedToTrain){
				me.LeafProjects = me.CurrentScrum;
			}
			me.AllSnapshots = [];
			return Q.all(_.map(me.LeafProjects, function(project){
				var parallelLoaderConfig = {
					pagesize:20000,
					url: me.BaseUrl + '/analytics/v2.0/service/rally/workspace/' + 
						me.getContext().getWorkspace().ObjectID + '/artifact/snapshot/query.js',
					params: {
						workspace: me.getContext().getGlobalContext().getWorkspace()._ref,
						compress:true,
						pagesize:20000,
						find: JSON.stringify({ 
							_TypeHierarchy: 'HierarchicalRequirement',
							Children: null,
							Project: project.data.ObjectID,
							_ValidFrom: { $lte: releaseEnd },
							_ValidTo: { $gt: releaseStart }
						}),
						fields:JSON.stringify(['ScheduleState', 'PlanEstimate', 'Release', lowestPortfolioItemType, '_ValidFrom', '_ValidTo', 'ObjectID']),
						hydrate:JSON.stringify(['ScheduleState'])
					}
				};   
				return me._parallelLoadLookbackStore(parallelLoaderConfig)
					.then(function(snapshotStore){ 
						//only keep snapshots where (release.name == releaseName || (!release && portfolioItem.Release.Name == releaseName))
						var records = _.filter(snapshotStore.getRange(), function(snapshot){
							return (me.ReleasesWithNameHash[snapshot.data.Release] || 
								(!snapshot.data.Release && me.LowestPortfolioItemsHash[snapshot.data[lowestPortfolioItemType]] == releaseName));
						});
						
						//BUG IN LBAPI with duplicates. must workaround it.... POLYFILL thing
						var tmpRecs = records.slice(),
							convertDupes = function(dupes){
								return _.map(_.sortBy(dupes, 
									function(d){ return new Date(d.data._ValidFrom); }),
									function(d, i, a){ if(i < a.length-1) d.raw._ValidTo = a[i+1].raw._ValidFrom; return d; });
							};
						for(var i=tmpRecs.length-1;i>=0;--i){
							var dupes = [];
							for(var j=i-1;j>=0;--j){
								if(tmpRecs[i].data.ObjectID == tmpRecs[j].data.ObjectID){
									if(tmpRecs[i].data._ValidTo == tmpRecs[j].data._ValidTo){
										dupes.push(tmpRecs.splice(j, 1)[0]);
										--i;
									}
								}
							}
							if(dupes.length){
								dupes.push(tmpRecs.splice(i, 1)[0]);
								tmpRecs = tmpRecs.concat(convertDupes(dupes));
							}
						}
						records = tmpRecs;
						//END BUG IN LBAPI Polyfill thing
						console.log("load snapshot release", new Date())
						me.AllSnapshots = me.AllSnapshots.concat(records);
					});	
			}));
		},    
		_getPortfolioItems: function(){
			var me=this,
				releaseName = me.ReleaseRecord.data.Name;
			
			me.LowestPortfolioItemsHash = {};
			me.PortfolioItemsInReleaseStore = null;
			
			//NOTE: we are loading ALL lowestPortfolioItems b/c sometimes we run into issues where
			//userstories in one release are under portfolioItems in another release (probably a user
			// mistake). And this messes up the numbers in the topPortfolioItem filter box
			return me._loadPortfolioItemsOfType(me.TrainPortfolioProject, me.PortfolioItemTypes[0])
				.then(function(portfolioItemStore){
					var portfolioItemsInRelease = _.filter(portfolioItemStore.getRange(), function(pi){ return (pi.data.Release || {}).Name == releaseName; });
					me.PortfolioItemsInReleaseStore = Ext.create('Rally.data.wsapi.Store', {
						model: me[me.PortfolioItemTypes[0]],
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
		_loadUserStoriesforPortfolioItems: function(){
			var me = this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				parallelLoaderConfig = {
					pagesize:200,
					model: me.UserStory,
					url: me.BaseUrl + '/slm/webservice/v2.0/hierarchicalrequirement',
					params: {
						project: me.TrainRecord.data._ref,
						projectScopeDown: true,
						projectScopeUp: false,
						fetch:['ScheduleState', 'PlanEstimate', lowestPortfolioItemType, 'ObjectID'].join(',')
					}
				};     
			me.WsapiUserStoryMap = {};     
			return Q.all(_.map(me.PortfolioItemsInReleaseStore.data.items, function(portfolioItemRecord){
				var portfolioItemFilter = Ext.create('Rally.data.wsapi.Filter', { 
					property: lowestPortfolioItemType + '.ObjectID', 
					value: portfolioItemRecord.data.ObjectID
				});               
				parallelLoaderConfig.params.query = portfolioItemFilter.toString();				
				return me._parallelLoadWsapiStore(parallelLoaderConfig)
					.then(function(userStoryStore){ 
						me.WsapiUserStoryMap[portfolioItemRecord.data.ObjectID] = userStoryStore.getRange();
					});
			}));            
		},
		_loadScopeToReleaseStore: function(){
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
		_buildScopeToReleaseGrid: function(){
			var me = this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			Ext.getCmp('scopeGrid').removeAll(); 
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
				title: 'Scope to release ('+ me.InitialTargetDate + ' - ' + me.CompleteFinalTargetDate + ')',
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
					xtype:'fastgridcolumn',
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
					xtype:'fastgridcolumn',
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
					xtype:'fastgridcolumn',
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
		_buildCumulativeFlowChart: function(){
			var me = this,
				calc = Ext.create('FastCumulativeFlowCalculator',{
					scheduleStates:me.ScheduleStates,
					startDate: me.ReleaseRecord.data.ReleaseStartDate,
					endDate: me.ReleaseRecord.data.ReleaseDate
				});

			//chart config setting 
			//using jquery to use the high charts
			//uses ChartUpdater mixin
			//uses IntelWorkweek mixin
			var aggregateChartData = me._updateCumulativeFlowChartData(calc.runCalculation(me.AllSnapshots), {trendType:'Last2Sprints'}),
				datemap = aggregateChartData.datemap;

			//retro dashboard calculation

			var total = {};
				total.initialCommit = 0;
				total.finalCommit = 0;
				total.finalAccepted = 0;
				total.projected = 0;
				total.ideal = 0;
			//for shaky date difference calc
			//sometimes the days difference is in points and it would be off by one or two days
			if(!!(me.releaseStartDateChanged && me.initialAddedDaysCount)){
				while(Date.parse(datemap[me.initialAddedDaysCount]) != Date.parse(me.datePickerDate)){
					if (Date.parse(datemap[me.initialAddedDaysCount]) > Date.parse(me.datePickerDate)){
						me.initialAddedDaysCount = me.initialAddedDaysCount - 1;
					}else if(Date.parse(datemap[me.initialAddedDaysCount]) < Date.parse(me.datePickerDate)){
						me.initialAddedDaysCount = me.initialAddedDaysCount + 1;
					}
				}		
			}
			
			
			me.initialAddedDaysCount = !(me.initialAddedDaysCount) ? 6 : me.initialAddedDaysCount ;
			_.each(aggregateChartData.series,function(f){
				if(f.name==="Accepted"){
					total.finalAccepted = total.finalAccepted + f.data[aggregateChartData.categories.length - 6];
				}
				//we want to ignore the ideal and the projected from the aggregateChartData
				if(f.name !="Ideal" && f.name != "Projected"){
					//taking sample after 7 days and before 7 days 
					//or date from date picker
					total.initialCommit = total.initialCommit + f.data[me.initialAddedDaysCount];
					total.finalCommit = total.finalCommit + f.data[aggregateChartData.categories.length - 6];
				}
				//if the release is still on going we would like to use the projected data for the final commit
				if(f.name === "Projected"){
					total.projected = total.projected + f.data[aggregateChartData.categories.length - 6];
				}
				if(f.name === "Ideal"){
					total.ideal = total.ideal + f.data[aggregateChartData.categories.length - 6];
				}
			});
			if(total.finalCommit === 0){
				total.finalCommit = total.projected > 0 ? total.projected : total.ideal;
				total.finalAccepted = total.projected > 0 ? total.projected : total.ideal;
			}
			var commitDataPlus =[];
			// commitDataMinus = [];
			//adding a line for the initial Commitment projection
			_.each(aggregateChartData.categories,function(f,key){
				commitDataPlus.push(total.initialCommit);
				//commitDataMinus.push(total.initialCommit - 10);
			});
			//console.log(commitDataPlus,commitDataMinus);
			aggregateChartData.series.push({
				colorIndex: 1,
				symbolIndex: 1,
				dashStyle: "shortdash",
				color: "red",
				data:commitDataPlus,
				name: "Commitment",
				type: "spline"
			});

			me.total = total;

			$("#retroChart").highcharts(Ext.Object.merge({}, me._defaultCumulativeFlowChartConfig, me._getCumulativeFlowChartColors(), {
				chart: {
					height: 400,
					width: me.getWidth()*0.42>>0
				},
				legend:{
					borderWidth:0,
					width:500,
					itemWidth: me.getWidth()*0.42>>0 - 50
				},
				title: {
					text: me.TrainRecord.data.Name 
				},
				subtitle:{
					text: me.ReleaseRecord.data.Name.split(' ')[0]
				},
				xAxis:{
					categories: aggregateChartData.categories,
					tickInterval: me._getCumulativeFlowChartTicks(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.44)
				},
				series: aggregateChartData.series
			}));
			me._setCumulativeFlowChartDatemap($("#retroChart").children()[0].id, datemap);
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
				chartMax = []; //set the max so that all the chart look the same
			Highcharts.setOptions({ colors: ['#3A874F','#7cb5ec'] });
			var	chartConfig = {
					chart: {
						type: 'column'
					},
					title: {
						text: 'Scope'
					},
					subtitle: {
						text: '4 of 6 '
					},
					xAxis: {
						categories: [], 
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
							value : 0,
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
							value : 0,
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
						data: dataseries,
						dataLabels: {
							enabled: true,
							format: '{point.y:,.0f}'//show no decimal points
						}
					}]
				};
			chartMax.push(me.total.initialCommit,me.total.finalAccepted, me.total.finalCommit);
			chartConfig.yAxis.max = Math.max.apply(null, chartMax);
			chartConfig.yAxis.max = chartConfig.yAxis.max + ((20/100) * chartConfig.yAxis.max);//increasing the number by 20%
			
			if(scopeDeltaPerc > 0) chartConfig.title.text = 'Scope Delta: +' + scopeDeltaPerc.toFixed(2) + '%';
			else chartConfig.title.text = 'Scope Delta:' + scopeDeltaPerc.toFixed(2) + '%';
			
			chartConfig.subtitle.text = Math.round(me.total.finalCommit) + ' of ' + Math.round(me.total.initialCommit);
			dataseries.push(new Array('InitialCommit', me.total.initialCommit));
			dataseries.push(new Array('FinalWorkload',me.total.finalCommit));
			chartConfig.series.data = dataseries;
			chartConfig.yAxis.plotLines[0].value = me.total.initialCommit + (0.1 * me.total.initialCommit); //max target
			chartConfig.yAxis.plotLines[1].value = me.total.initialCommit - (0.1 * me.total.initialCommit); //min target

			//scope delta increase and decrease by 10% which is acceptable
			if(scopeDeltaPerc >= -10.99 && scopeDeltaPerc <= 10.99){
				Highcharts.setOptions({ colors: ['#40d0ed','#92D050'] });
			} else {
				Highcharts.setOptions({ colors: ['#40d0ed','#d05052'] });
			}
			if(scopeDeltaPerc >= 400){
				chartConfig.yAxis.plotLines[1].label = {                            
					text : 'Acceptable decrease (-10%)',
					align: 'right',
					x: -10,
					y: 16 
				};
			}
			chartConfig.xAxis.categories[0] = 'Original Commit';
			chartConfig.xAxis.categories[1] = 'Final Workload';

			$('#retroBarChartScopeWrapper').highcharts(chartConfig);
			var	chartConfig2 = {
					chart: {
						type: 'column'
					},
					title: {
						text: 'Scope'
					},
					subtitle: {
						text: '4 of 6 '
					},
					xAxis: {
						categories: [], 
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
							value : 0,
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
							value : 0,
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
						data: dataseries,
						dataLabels: {
							enabled: true,
							format: '{point.y:,.0f}'//show no decimal points
						}
					}]
				};
			//second chart CA orginial 
			chartConfig2.yAxis.max = chartConfig.yAxis.max;
			/*chartConfig2.yAxis.max = Math.max.apply(null, chartMax);
			chartConfig2.yAxis.max = chartConfig.yAxis.max + ((20/100) * chartConfig.yAxis.max);//increasing the number by 20% */
			chartConfig2.title.text = 'A/C Original: ' + originalCommitRatio.toFixed(0) + '%';
			chartConfig2.subtitle.text = Math.round(me.total.finalAccepted) + ' of ' + Math.round(me.total.initialCommit);
			chartConfig2.xAxis.categories[0] = 'Original Commit';
			chartConfig2.xAxis.categories[1] = 'Final Accepted';
			chartConfig2.yAxis.plotLines[0].label = {                            
				text : 'Target >90%',
				align: 'center'
			};
			
			//set the yaxis max so that it matches the other 2 charts  
			dataseries.length = 0;
			dataseries.push(new Array('InitialCommit', me.total.initialCommit));
			dataseries.push(new Array('FinalAccepted',me.total.finalAccepted));
			chartConfig2.series.data = dataseries;
			chartConfig2.yAxis.plotLines[0].value = (0.9 * me.total.initialCommit);//max target
			chartConfig2.yAxis.plotLines.splice(1,1);
			if(originalCommitRatio >= 90){ //100 percentage would be all the work completed so plus minus 10 is acceptable
				Highcharts.setOptions({ colors: ['#40d0ed','#92D050'] });
			} else {
				Highcharts.setOptions({ colors: ['#40d0ed','#d05052'] });
			}
			$('#retroBarChartCaOriginalWrapper').highcharts(chartConfig2);
			
			//third chart CA orginial 
			var	chartConfig3 = {
					chart: {
						type: 'column'
					},
					title: {
						text: 'Scope'
					},
					subtitle: {
						text: '4 of 6 '
					},
					xAxis: {
						categories: [], 
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
							value : 0,
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
							value : 0,
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
						data: dataseries,
						dataLabels: {
							enabled: true,
							format: '{point.y:,.0f}'//show no decimal points
						}
					}]
				};
			finalCommitRatio = (me.total.finalAccepted /me.total.finalCommit)* 100;
			chartConfig3.yAxis.max = chartConfig.yAxis.max;
			/*chartConfig3.yAxis.max = Math.max.apply(null, chartMax);
			chartConfig3.yAxis.max = chartConfig.yAxis.max + ((20/100) * chartConfig.yAxis.max);//increasing the number by 20% */
			chartConfig3.title.text = 'A/C Final: ' + finalCommitRatio.toFixed(0) + '%';
			chartConfig3.subtitle.text = Math.round(me.total.finalAccepted) + ' of ' + Math.round(me.total.finalCommit);
			chartConfig3.xAxis.categories[0] = 'Final Workload';
			chartConfig3.xAxis.categories[1] = 'Final Accepted';
			chartConfig3.yAxis.plotLines[0].label = {                            
				text : 'Target >90%',
				align: 'center'
			};
			dataseries.length = 0;
			
			dataseries.push(new Array('FinalCommit', me.total.finalCommit));
			dataseries.push(new Array('FinalAccepted',me.total.finalAccepted));
			chartConfig3.series.data = dataseries;
			chartConfig3.yAxis.plotLines[0].value = (0.9 * me.total.finalCommit);//max target
			chartConfig3.yAxis.plotLines.splice(1,1);
			if(finalCommitRatio >= 90){//plus minus 10 is acceptable when 90 percentage is done, only 10% is left which is acceptable 
				Highcharts.setOptions({ colors: ['#40d0ed','#92D050'] });
			}else{
				Highcharts.setOptions({ colors: ['#40d0ed','#d05052'] });
			}
			$('#retroBarChartCaFinalWrapper').highcharts(chartConfig3);
		},
		_loadUserPreferenceReleaseStartDate:function(){
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
		_reloadEverything: function(){
			var me = this;
			me.setLoading('Loading Data');
			//load all the child release to get the user story snap shots
			//get the portfolioItems from wsapi
			return Q.all([
				me._loadAllChildReleases(),
				me._getPortfolioItems()
				
			])
			.then(function(){
				Q.all([me._loadSnapshotStores()])
			})
			.then(function() {  
				//load all the user story snap shot for release
				//load all the user stories for the release portfolioItems
				me._buildCumulativeFlowChart();
				me._buildRetroChart();
				me._hideHighchartsLinks();
				return Q.all([
					me._loadUserStoriesforPortfolioItems()
				]);
			})
			.then(function(){
				//check if the release start date is set in preference
				//if saved in preference load it 
				me._loadAppsPreference() /******** load stream 2 *****/
				.then(function(appsPref){
				me.AppsPref = appsPref;
				me._loadUserPreferenceReleaseStartDate();
				});
			})
			.then(function(){ 
				if(me.AllSnapshots.length === 0 ){
					me.setLoading(false);
					me._alert('ERROR', me.TrainRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name);
					return;     
				}else{
					me._loadScopeToReleaseStore();
					me._buildScopeToReleaseGrid();
					me.setLoading(false);
				}
			})
			.fail(function(reason){
				me.setLoading(false);           
				me._alert('ERROR', reason || '');
			})
			.done();   
		},   
		launch: function() {
			var me = this;
			me.setLoading('Loading Configuration');
			me._configureIntelRallyApp()
				.then(function(){
					var scopeProject = me.getContext().getProject();
					return me._loadProject(scopeProject.ObjectID);
				})
				.then(function(scopeProjectRecord){
					me.ProjectRecord = scopeProjectRecord;
					return Q.all([ //two streams
						me._projectInWhichTrain(me.ProjectRecord) /********* 1 ************/
							.then(function(trainRecord){
								if(trainRecord){
									if(trainRecord.data.ObjectID != me.ProjectRecord.data.ObjectID) me._isScopedToTrain = false;
									else me._isScopedToTrain = true;
									me.TrainRecord = trainRecord;
									return Q.all([
										me._loadAllLeafProjects(me.TrainRecord)
											.then(function(leftProjects){
												me.LeafProjects = leftProjects;
												if(me._isScopedToTrain) me.CurrentScrum = null;
												else {
													me.CurrentScrum ={};
													me.CurrentScrum[me.ProjectRecord.data.ObjectID] = me.ProjectRecord;
												}
											}),
										me._loadTrainPortfolioProject(me.TrainRecord)
											.then(function(trainPortfolioProject){
												me.TrainPortfolioProject = trainPortfolioProject;
											})
									]);
								} else {
									me.CurrentScrum ={};
									me.CurrentScrum[me.ProjectRecord.data.ObjectID] = me.ProjectRecord;
									me._isScopedToTrain = false;
								}
							}),				
						me._loadAppsPreference() /******** load stream 2 *****/
							.then(function(appsPref){
								me.AppsPref = appsPref;
								var oneYear = 1000*60*60*24*365;
								var endDate = new Date();
								return me._loadReleasesBetweenDatesAndCurrent(me.ProjectRecord, (new Date()*1 - oneYear), endDate);
							})
							.then(function(releaseRecords){
								me.ReleaseRecords = releaseRecords;
								//scope the release to current release
								//me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, me.AppsPref)
								var currentRelease = me._getScopedRelease(releaseRecords, me.ProjectRecord.data.ObjectID, null);
								if(currentRelease) me.ReleaseRecord = currentRelease;
								else return Q.reject('This project has no releases.');
							})
					]);
				})
				.then(function(){ 
					me._buildReleasePicker(); 
				})
				.then(function(){ return me._reloadEverything();  })
				.fail(function(reason){
					me.setLoading(false);
					me._alert('ERROR', reason || '');
				})
				.done();
		}
	});
}());