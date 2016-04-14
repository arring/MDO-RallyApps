(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.TrainPerformanceDashboard', {
		extend: 'Intel.lib.IntelRallyApp',
		componentCls: 'app',
		requires: [
			'Intel.lib.chart.FastCumulativeFlowCalculator'
		],
		mixins: [
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.CfdProjectPreference',			
			'Intel.lib.mixin.IntelWorkweek',
			'Intel.lib.mixin.CumulativeFlowChartMixin',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.CustomAppObjectIDRegister'
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
										'<li>Sample dates are taken on <b>7th day</b> of the Release Start Date and on the Release End Date for Scope Delta , ',
											'and 10 days after Release Start Date for ' + Rally.getApp().PortfolioItemTypes[0] + ' Scope Change.</li>',
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
				renderTo: document.body
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
		portfolioItemFields: ['Name','ObjectID','FormattedID','Release','PlannedEndDate','Project'], //override intel-rally-app
		releaseFields:  ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'], //override intel-rally-app
		userAppsPref: 'intel-retro-dashboard',	//dont share release scope settings with other apps	
		
		/****************************************************** RELEASE PICKER ********************************************************/
		_releasePickerSelected: function(combo, records){
			var me=this;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading(true);
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			var pid = me.ProjectRecord.data.ObjectID;		
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			return Q.all([
				me._resetVariableAfterReleasePickerSelected(),
				me.saveAppsPreference(me.AppsPref),
				me.loadCfdProjPreference()//different preference for different Release selected
				.then(function(cfdprojPref){
					me.cfdProjReleasePref = cfdprojPref;
					me._setchangedReleaseStartDate();
				})
			])
			.then(function(){ return me._reloadEverything(); })
			.fail(function(reason){
				me.setLoading(false);
				me.alert('ERROR', reason);
			})
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
		/****************************************************** CFD Release Start Date Selection Option Component ********************/
		redrawChartAfterReleaseDateChanged: function(){
			var me=this;
			me.setLoading('Loading Charts');	
			Ext.getCmp('grdScrumHealthHeader').update(" ");
			Ext.getCmp('scopeGrid').removeAll(); 
			Ext.getCmp('grdScrumHealth').removeAll(); 
			me._buildCumulativeFlowChart(); 
			me._buildRetroChart();
			me._hideHighchartsLinks();
			me._buildScopeToReleaseStore();
			me._buildPortfolioProgressGrid();
			me._buildArtScrumFitnessGridStore();
			me._renderReleaseDetailHeader(); 
			me._buildFitnessGrid();
			me.setLoading(false);			
		},
		_setchangedReleaseStartDate: function(){
			var me = this;
			if(typeof me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name] !== 'object') me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name] = {};
			me.releaseStartDateChanged = _.isEmpty(me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name]) ? false : true;
			if(me.releaseStartDateChanged){
				me.changedReleaseStartDate = me.cfdProjReleasePref.releases[me.ReleaseRecord.data.Name].ReleaseStartDate;
			}else{
				var	_6days = 1000 * 60 *60 *24*6;	
				me.changedReleaseStartDate = (typeof(me.changedReleaseStartDate) === "undefined") ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1  + _6days) : me.changedReleaseStartDate ;				
			}					
		},		
		_checkToRenderCFDCalendar: function(){
			var me = this;
			me._setchangedReleaseStartDate();
			if(!me.optionSelectReleaseDate && me.getContext().getPermissions().isWorkspaceOrSubscriptionAdmin(me.getContext().getWorkspace())){
				if(Ext.getCmp('releasedatepicker-wrapper')) Ext.getCmp('releasedatepicker-wrapper').destroy();//redrawing everything for new release
				me._renderOptiontoSelectReleaseDate();
			}
		},
		_resetVariableAfterReleasePickerSelected: function(){
				var me = this;
				me.changedReleaseStartDate = undefined;
				me.optionSelectReleaseDate = undefined;
		},	
		_renderOptiontoSelectReleaseDate:function(){
			var me = this;
			me.optionSelectReleaseDate = Ext.getCmp('datePickerWrapper').add({
				xtype:'intelreleasedatachangepicker',
				labelWidth: 80,
				width: 240,
				ProjectRecord: me.ProjectRecord,
				currentRelease: me.ReleaseRecord,
				cfdProjReleasePref : me.cfdProjReleasePref,
				initialLoad: true,
				listeners: { releaseDateChanged: me._releaseDateChangePickerSelected.bind(me)}
			});	
		},		
		_releaseDateChangePickerSelected: function(date,cfdappPref){
			var me = this;
			me.setLoading(true);
			me.saveCfdProjPreference(cfdappPref)
				.then(function(){ 
					me.changedReleaseStartDate = date;
					me.redrawChartAfterReleaseDateChanged(); 
				})
				.fail(function(reason){ me.alert('ERROR', reason); me.setLoading(false); })
				.then(function(){ me.setLoading(false); })
				.done();
			
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
		/*_loadIterations: function(){
			var me=this,
				startDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseStartDate),
				endDate =	Rally.util.DateTime.toIsoString(me.ReleaseRecord.data.ReleaseDate);
				me.AllScrumTargetVelocitySum = 0;
			return Q.all(_.map(me.CurrentScrum ? [me.CurrentScrum] : me.LeafProjects, function(project){
				var config = {
					model: 'Iteration',
					filters: [{
						property: "EndDate",
						operator: ">=",
						value: startDate
					},{
						property: "StartDate",
						operator: "<=",
						value: endDate  
					}],
					fetch: ["PlannedVelocity"],
					context:{
						project: project.data._ref,
						projectScopeUp:false,
						projectScopeDown:false
					}
				};
				return me.parallelLoadWsapiStore(config).then(function(store){
					me.AllScrumTargetVelocitySum +=_.reduce(store.getRange(), function(sum, iteration) {
						var targetVelocity = iteration.data.PlannedVelocity;
						return sum + targetVelocity;
					},0);
				});				
			}));			
		},*/		
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
						return me.ReleasesWithNameHash[snapshot.data.Release] && (snapshot.data._ValidFrom != snapshot.data._ValidTo);
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
					Ext.create('Rally.data.wsapi.Filter', { property: 'Release.Name', operator: '=', value: null })).and(
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
		_loadStories: function(){
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
		/****************************************************** Calculations********************************************************/
		_calculateDataIntegrity: function(projectStoreMap){
			var me = this;
			var releaseName = me.ReleaseRecord.data.Name,
				releaseDate = new Date(me.ReleaseRecord.data.ReleaseDate),
				releaseStartDate = new Date(me.ReleaseRecord.data.ReleaseStartDate),
				now = new Date(),
				lowestPortfolioItemType = me.PortfolioItemTypes[0];
			//blocked stories
			var blockedStories = 0, unsizedStoires= 0,  improperlySizedStoires= 0,  storyWithoutIteration= 0, 
				storyinIterationNotAttachedToRelease= 0,  unacceptedStoriesinPastIteration= 0,  storiesScheduleAfterPortfolioItemEndDate= 0;

			unsizedStoires = _.size(_.filter(projectStoreMap, function(userStories){
				if(!userStories.data.Release || userStories.data.Release.Name != releaseName) return false;
				return userStories.data.PlanEstimate === null; 
			}));
			//improperly sized stories
			improperlySizedStoires = _.size(_.filter(projectStoreMap, function(userStories){
				if(!userStories.data.Release || userStories.data.Release.Name != releaseName) return false;
				if(userStories.data.Children.Count === 0) return false;
				var pe = userStories.data.PlanEstimate;
				return pe && pe !== 0 && pe !== 1 && pe !== 2 && pe !== 4 && pe !== 8 && pe !== 16;
				}));
			//stories in release without iteration 
			storyWithoutIteration = _.size(_.filter(projectStoreMap, function(userStories){
				if(!userStories.data.Release || userStories.data.Release.Name != releaseName) return false;
				return !userStories.data.Iteration; 
			}));
			//stories in iteration not attached to release
			storyinIterationNotAttachedToRelease = _.size(_.filter(projectStoreMap, function(userStories){
				if (!userStories.data.Iteration) return false;
				return (new Date(userStories.data.Iteration.StartDate) < releaseDate && new Date(userStories.data.Iteration.EndDate) > releaseStartDate) &&
				(!userStories.data.Release || userStories.data.Release.Name.indexOf(releaseName) < 0);
			}));
			//unaccepted stories in past iteration
			unacceptedStoriesinPastIteration = _.size(_.filter(projectStoreMap, function(userStories){
				if(!userStories.data.Release || userStories.data.Release.Name != releaseName) return false;
				if(!userStories.data.Iteration) return false;
				return new Date(userStories.data.Iteration.EndDate) < now && userStories.data.ScheduleState != 'Accepted';
			
			}));
			// stories scheduled after lowestPortfolioItemType end date
			storiesScheduleAfterPortfolioItemEndDate = _.size(_.filter(projectStoreMap, function(userStories){
				if(!userStories.data.Release || userStories.data.Release.Name != releaseName) return false;
				if(!userStories.data.Iteration || !userStories.data[lowestPortfolioItemType] || 
					!userStories.data[lowestPortfolioItemType].PlannedEndDate || !userStories.data.Iteration.StartDate) return false;
				if(userStories.data.ScheduleState == 'Accepted') return false;
				return userStories.data[lowestPortfolioItemType].PlannedEndDate < userStories.data.Iteration.StartDate;
				}));
				return unsizedStoires + improperlySizedStoires + storyWithoutIteration + storyinIterationNotAttachedToRelease + unacceptedStoriesinPastIteration + storiesScheduleAfterPortfolioItemEndDate;
		},
		_calcTrainMetric: function(aggregateChartData){
			var me = this,	totalinitial = 0,	finalCommit = 0, finalAccepted = 0,	totalProjected = 0,	totalideal = 0,
				finalCommitIndex = aggregateChartData.categories.length - 1;
				
			_.each(aggregateChartData.series,function(f){
				finalAccepted = f.name==="Accepted" ? finalAccepted + f.data[finalCommitIndex] : finalAccepted; 
				totalinitial = f.name==="Current Commit LCL" ? totalinitial + f.data[me.initialAddedDaysCount] : totalinitial;
				finalCommit = (f.name !="Ideal" && f.name != "Projected" && f.name != "Current Commit LCL" && f.name != "Available Velocity UCL") ? finalCommit + f.data[finalCommitIndex] : finalCommit;
				if(f.name === "Projected"  && typeof f.data[finalCommitIndex] === "object"){
					totalProjected = f.name === "Projected" ? totalProjected + f.data[finalCommitIndex].y : totalProjected;
				}else{
					totalProjected = f.name === "Projected" ? totalProjected + f.data[finalCommitIndex] : totalProjected;
				}
				totalideal = f.name === "Ideal" ? totalideal + f.data[finalCommitIndex] : totalideal;
			});
			finalAccepted = (finalCommit === 0) && totalProjected > 0 ? totalProjected : totalideal;
			finalCommit = (finalCommit === 0) && totalideal > 0 ? totalideal : totalProjected;			
			me.total = {};
			me.total.initialCommit = totalinitial;
			me.total.finalCommit = finalCommit;
			me.total.finalAccepted = finalAccepted;
		},	
		__calcFitnessGridColumnVal: function(teamName,healthIndicator){
				var me = this,
					finalCommitIndex = me.aggregateChartData[teamName].categories.length - 1;
					
				var totalinitial = _.reduce(me.aggregateChartData[teamName].series,function(sum,s){
					if(s.name== "Projected" || s.name=="Ideal" || s.name === "Current Commit LCL") return sum + 0;
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
					
				var DI =  me._calculateDataIntegrity(me.TeamStoresDI[teamName]),
					scopechange= ((totalIdeal - totalinitial)/totalinitial) * 100 ,
					acceptToCommit = (totalProjected/totalinitial)*100,
					teamStatus ="",
					scopeStatus ="";
					
				scopeStatus =  ( scopechange >= -10 && scopechange <= 10.99 )? healthIndicator.good : healthIndicator.requireAttention;
				teamStatus  = ( DI <= 5 &&	(( scopechange >= -10 && scopechange <= 10.99 )) && acceptToCommit>90 && acceptToCommit<=100.99) ? healthIndicator.recognized : healthIndicator.requireAttention;
				scopechange = ($.isNumeric(scopechange) ? (scopechange.toFixed(2)> 0 ? '+' + scopechange.toFixed(2) + '%' + scopeStatus : scopechange.toFixed(2) + '%'+ scopeStatus) : "-");
				acceptToCommit = ($.isNumeric(acceptToCommit) ? (acceptToCommit.toFixed(2) > 90 && acceptToCommit<=100.99 ? acceptToCommit.toFixed(2)+ '%'+ healthIndicator.good : acceptToCommit.toFixed(2) + '%'+ healthIndicator.requireAttention) : "-"); 
				
				return {
					initalCommit : totalinitial,
					totalFinal : totalIdeal,
					finalAccepted : totalProjected,
					scopeChange:  scopechange,
					acceptToCommit: acceptToCommit,
					dataIntegrity: DI <= 5 ? DI + healthIndicator.good :DI + healthIndicator.requireAttention,
					scrumTeam: teamName,
					status: teamStatus,
					categories: (teamName.split("-")[0])
				};				
		},		
		/****************************************************** RENDER Cumulative flow and bar Chart ********************************************************/
		_renderCFDContainer: function(){
			var me = this;
			Ext.getCmp('retroBarChartWrapper').removeAll();
			Ext.getCmp('retroBarChartWrapper').add({
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
			});			
		},
		_buildCumulativeFlowChart: function(){//setting the initial commit and final date change
				var me = this,
					calc = Ext.create('Intel.lib.chart.FastCumulativeFlowCalculator',{
						scheduleStates: me.ScheduleStates,
						startDate: me.ReleaseRecord.data.ReleaseStartDate,
						endDate: me.ReleaseRecord.data.ReleaseDate
					});
		
			//for the train as a whole 
			var updateOptions = {trendType:'Last2Sprints',date:me.changedReleaseStartDate},
				aggregateChartData = me.updateCumulativeFlowChartData((calc.runCalculation(me.AllSnapshots)), updateOptions),		
				datemap = aggregateChartData.datemap;
				
			me.initialAddedDaysCount =  me._getIndexOn(me._dateToStringDisplay(me.changedReleaseStartDate),datemap);
			me.finalCommitDate = datemap[datemap.length - 1];
			//adding a line for the velocity of train
			/*var targetVelocity =[];
			_.each(aggregateChartData.categories,function(f,key){
				targetVelocity.push(me.AllScrumTargetVelocitySum);
			});
			//console.log(commitDataPlus,commitDataMinus);
			aggregateChartData.series.push({
				colorIndex: 1,
				symbolIndex: 1,
				dashStyle: "shortdash",
				color: "#862A51",
				data:targetVelocity,
				name: "Available Velocity UCL",
				type: "line"
			}); */
			me._calcTrainMetric(aggregateChartData);	
			
			/*_.each(aggregateChartData.series, function(series,key){
					if(series.name === "Commitment") 
					aggregateChartData.series[key].name ="Current Commit LCL";
				});		 */	
			
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
					categories: aggregateChartData.categories,
					tickInterval: me.getCumulativeFlowChartTicks(me.ReleaseRecord.data.ReleaseStartDate, me.ReleaseRecord.data.ReleaseDate, me.getWidth()*0.44)
				},
				series: aggregateChartData.series
			},me.getInitialAndfinalCommitPlotLines(aggregateChartData,me.changedReleaseStartDate)));
			me.setCumulativeFlowChartDatemap($("#retroChart").children()[0].id, datemap);	
		
		},
		_hideHighchartsLinks: function(){
			$('.highcharts-container > svg > text:last-child').hide();
		},
		_setCharConfigForRetroChart: function(){
				var me = this,
				scopeDeltaPerc = ((me.total.finalCommit - me.total.initialCommit)/((me.total.initialCommit))) * 100;
				me.defaultRetroChartConfig = {
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
		},
		_renderScopeChangeChart: function(){
			var me = this,
			scopeDeltaPerc = ((me.total.finalCommit - me.total.initialCommit)/((me.total.initialCommit))) * 100,
			chartMax = [];
			chartMax.push(me.total.initialCommit,me.total.finalAccepted, me.total.finalCommit);
			me.defaultRetroChartConfig.yAxis.max = Math.max.apply(null, chartMax);
			me.defaultRetroChartConfig.yAxis.max = me.defaultRetroChartConfig.yAxis.max + ((20/100) * me.defaultRetroChartConfig.yAxis.max);//increasing the number by 20%
			Highcharts.setOptions((scopeDeltaPerc >= -10.99 && scopeDeltaPerc <= 10.99) ? me.metTargetColorConfig : me.didnotMetTargetColorConfig);
			if(scopeDeltaPerc >= 400){
				me.defaultRetroChartConfig.yAxis.plotLines[1].label = {                            
					text : 'Acceptable decrease (-10%)',
					align: 'right',
					x: -10,
					y: 16 
				};
			}
			$('#retroBarChartScopeWrapper').highcharts(Ext.Object.merge({},me.defaultRetroChartConfig));				
		},
		_renderACOriginalChart: function(){
				var me = this,
				originalCommitRatio = (me.total.finalAccepted/me.total.initialCommit)* 100;
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
			Highcharts.setOptions((originalCommitRatio >= 90) ? me.metTargetColorConfig : me.didnotMetTargetColorConfig );
			$("#retroBarChartCaOriginalWrapper").highcharts(Ext.Object.merge({}, me.defaultRetroChartConfig, CaOriginalchartConfig));				
		},
		_renderACFinalChart: function(){
				var me = this,
				finalCommitRatio = (me.total.finalAccepted /me.total.finalCommit)* 100,
				caFinalchartConfig = {
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
							y: me.total.finalCommit
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
			finalCommitRatio = (me.total.finalAccepted /me.total.finalCommit)* 100;
			//plus minus 10 is acceptable 
			Highcharts.setOptions((finalCommitRatio >= 90) ? me.metTargetColorConfig : me.didnotMetTargetColorConfig );
			$("#retroBarChartCaFinalWrapper").highcharts(Ext.Object.merge({}, me.defaultRetroChartConfig, caFinalchartConfig));				
		},
		_buildRetroChart: function(){
			var me = this,
			dataseries = [],
			chartdefaultColorConfig = { colors: ['#3A874F','#7cb5ec'] },
			chartMax = []; //set the max so that all the chart look the same
			me.metTargetColorConfig = { colors: ['#40d0ed','#92D050'] };
			me.didnotMetTargetColorConfig = { colors: ['#40d0ed','#d05052'] } ;
			Highcharts.setOptions(chartdefaultColorConfig);
			me._setCharConfigForRetroChart();
			me._renderScopeChangeChart();
			me._renderACOriginalChart();
			me._renderACFinalChart();
		},
/****************************************************** RENDER Porfolio progess in RELEASE TAB ********************************************************/
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
				title: [lowestPortfolioItemType] + ' Progress in the Release ('+ me.InitialTargetDate + ' - ' + me.CompleteFinalTargetDate + ')',
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
		_buildScopeToReleaseStore: function(){
			var me = this,
				userStorySnapshots = me.AllSnapshots,
				_10days = 1000 * 60 *60 *24*10,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				/* daysCountDifference = Rally.util.DateTime.getDifference(new Date(me.changedReleaseStartDate), new Date(me.ReleaseRecord.data.ReleaseStartDate), 'day'), */
				date1 = me.ReleaseRecord.data.ReleaseStartDate,
				date2 = new Date(me.changedReleaseStartDate), 
				daysCountDifference = Math.floor(( Date.parse(date2) - Date.parse(date1) )), 
				startTargetDate = me.releaseStartDateChanged && daysCountDifference > 0 ? new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + daysCountDifference): new Date(new Date(me.ReleaseRecord.data.ReleaseStartDate)*1 + _10days),
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
					var portfolioItemID = r.data[lowestPortfolioItemType].ObjectID;
					hash[r.data[lowestPortfolioItemType].ObjectID] = _.filter(me.UserStoryStore.getRange(),function(f){
						if(f.data[lowestPortfolioItemType] !== null) 
							return f.data[lowestPortfolioItemType].ObjectID === portfolioItemID; 
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
		_renderScopeToReleaseTab: function(){
			var me = this;
			if(me.AllSnapshots.length === 0 ){
					me.alert('ERROR', me.ScrumGroupRootRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name); 
			} else {
				me._buildScopeToReleaseStore();
				me._buildPortfolioProgressGrid();
			}
		},
/****************************************************** RENDER ART FITNESS TAB ********************************************************/
		_renderReleaseDetailHeader: function() {
			var me = this,
				workWeek = me.ReleaseRecord.data.ReleaseDate < new Date() ? me.getWorkweek(me.ReleaseRecord.data.ReleaseDate) :    me.getWorkweek(new Date()),
				dataIntegrityDashboardLink = me.ARTDataIntegrityAppObjectID ? 
					[
						"<span class ='link-achor good-job'>",
							"<a href='https://rally1.rallydev.com/#/" + me.ProjectRecord.data.ObjectID + "d/custom/" + 
							me.ARTDataIntegrityAppObjectID + "' target='_blank'>",
								"Click here to view the ART Data Integrity Dashboard",
							"</a>",
						"</span>"
					].join('\n') :
					"ART Data Integrity Dashboard cannot be located!",
				dataAsOf = (me.ReleaseRecord.data.ReleaseDate < new Date() ? me.ReleaseRecord.data.ReleaseDate : new Date());

				var releaseDetailHeaderHtml = [
					"Release: " + me.ReleaseRecord.data.Name,  
					"ReleaseStartDate: " + new Date(me.ReleaseRecord.data.ReleaseStartDate).toLocaleDateString(), 
					"ReleaseEndDate: " + new Date(me.ReleaseRecord.data.ReleaseDate).toLocaleDateString(), 
					"Data as of: " + dataAsOf.toLocaleDateString(), 
					"WorkWeek: ww" + workWeek,
					"<br/>" + dataIntegrityDashboardLink
				].join(",");

				Ext.getCmp('grdScrumHealthHeader').update(releaseDetailHeaderHtml);

    },	
		_buildFitnessGrid: function(){
			var me = this;
			var columnConfiguration = [
				{
					header: "Scrum Team", 
					dataIndex: "scrumTeam",
					flex:2
				},
				{
					header: "Original Commit<br/>@" + me._dateToStringDisplay(me.changedReleaseStartDate), 
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
		_buildScrumDataHashMap: function(updateOptions,calc,healthIndicator){
			var me = this;
			me.aggregateChartData ={};
			return _.reduce(me.ProjectsOfFunction, function(hash, r,key){
				var teamName = r.data.Name,
					teamObjectID = r.data.ObjectID;
				if(!me.TeamStores[teamObjectID]) return hash;
				me.aggregateChartData[teamName] = me.updateCumulativeFlowChartData((calc.runCalculation(me.TeamStores[teamObjectID])), updateOptions);
				hash[r.data.Name] =  me.__calcFitnessGridColumnVal(teamName,healthIndicator);
				return hash;
			}, {});			
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
			//Fitness grid 
			var updateOptions = {trendType:'Last2Sprints',date:me.changedReleaseStartDate},
				healthIndicator = {
					recognized : "<span class='good-job'> Recognized scrum of the week</span>",
					requireAttention : "<span class='require-attention'> Require Attention</span>",
					requireHelp : "<span class='require-attention'>How can I help?</span>",
					requireHelpImage : "<span><img src='https://rally1.rallydev.com/slm/images/icon_help.gif' alt='Help' title='How can I help?' border='0' height='24' width='24'></span>",
					reInforce : " (Re Enforce)",
					good : "<span class='good-job'> (Good)</span>"			
				};
				
			me.scrumData = me._buildScrumDataHashMap(updateOptions,calc,healthIndicator);
			//all healthIndicator.good
			me.scrumDataRecognized = [],
			me.scrumDataRequireAttention =[],
			me.scrumDataReEnforce =[];
			_.each(me.scrumData,function(team){
				if(team.status.indexOf(healthIndicator.recognized) > -1 ){
					me.scrumDataRecognized.push(team);
				}else if(team.scopeChange.indexOf(healthIndicator.requireAttention)> -1 && team.dataIntegrity.indexOf(healthIndicator.requireAttention)> -1 && team.acceptToCommit.indexOf(healthIndicator.requireAttention)> -1 ){
					team.scopeChange = team.scopeChange.replace(healthIndicator.requireAttention,healthIndicator.requireHelpImage);
					team.dataIntegrity = team.dataIntegrity.replace(healthIndicator.requireAttention,healthIndicator.requireHelpImage);
					team.acceptToCommit = team.acceptToCommit.replace(healthIndicator.requireAttention,healthIndicator.requireHelpImage);
					me.scrumDataRequireAttention.push(team);
				}else{
					team.scopeChange = team.scopeChange.replace(healthIndicator.requireAttention,healthIndicator.requireHelpImage);
					team.dataIntegrity = team.dataIntegrity.replace(healthIndicator.requireAttention,healthIndicator.requireHelpImage);
					team.acceptToCommit = team.acceptToCommit.replace(healthIndicator.requireAttention,healthIndicator.requireHelpImage);
					team.status = team.status.replace(healthIndicator.requireAttention,healthIndicator.requireHelp);
					me.scrumDataReEnforce.push(team);
				}
			});
		},		
		_renderARTScrumFitnessTab: function(){
			var me = this;
			me._buildArtScrumFitnessGridStore();
			me._buildFitnessGrid();
			Ext.getCmp('scopeGridWrapper').setLoading(false);
			Ext.getCmp('datePickerWrapper').setLoading(false);
			me._renderReleaseDetailHeader(); 

			Ext.getCmp('scopeGridWrapper').setLoading(false);
			Ext.getCmp('datePickerWrapper').setLoading(false);
		},
		_reloadEverything: function(){
			var me = this;
			me.setLoading('Loading Data');
			Ext.getCmp('scopeGrid').removeAll(); 
			Ext.getCmp('grdScrumHealthHeader').update(" ");
			Ext.getCmp('grdScrumHealth').removeAll(); 
			//render the release date change componentCls
			me._checkToRenderCFDCalendar();
			me._renderCFDContainer();
			//load all the child release to get the user story snap shots
			//get the portfolioItems from wsapi
			return Q.all([
				me._loadAllChildReleases(),
				me._getPortfolioItems()
			])
			.then(function(){ 
				//load data
				return Q.all([
					//me._loadIterations(),
					me._loadStories(),
					me._loadSnapshotStores()
				]);
			})
			.then(function(){  
				//load all the user story snap shot for release
				//load all the user stories for the release portfolioItems
				me._buildCumulativeFlowChart();
				me._buildRetroChart();
				me._hideHighchartsLinks();
			//hack to dynamically change the tab title
			//TODO: find a better way
			Ext.getCmp('scopeGridWrapper').tabBar.activeTab.update((me.PortfolioItemTypes[0] + " Progress").toUpperCase());
			$('.x-tab-bar .x-tab-active').css({'font-size':'12px'});
				if(me.AllSnapshots.length === 0 ){
					me.alert('ERROR', me.ScrumGroupRootRecord.data.Name + ' has no data for release: ' + me.ReleaseRecord.data.Name); 
				} else {
					Ext.getCmp('scopeGridWrapper').setLoading("Loading Scrum Fitness Grid");
					Ext.getCmp('datePickerWrapper').setLoading("Loading Scrum Fitness Grid");
					me._renderScopeToReleaseTab();
					me._renderARTScrumFitnessTab();
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
					return Q.all([
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
						me.getCustomAppObjectID('Intel.DataIntegrityDashboard.Vertical').then(function(customAppObjectID){
							me.ARTDataIntegrityAppObjectID = customAppObjectID;
						}),		
						me.loadCfdProjPreference()
						.then(function(cfdprojPref){
							me.cfdProjReleasePref = cfdprojPref;
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