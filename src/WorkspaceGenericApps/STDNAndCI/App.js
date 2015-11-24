/** 
	me.GridData = {
		<TrainName>: {
			<HorizontalName: ACD>: {
				<ScrumTeamType:MIO CLK 1>: {
					scrumTeamType:<ScrumTeamType: MIO CLK 1>,
					scrumName:<projectName>
					scrumObjectID:<projectObjectID>,
					totalPoints: <number>,
					stdciPoints: <number>
				}
			}
		}
	}
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		STDN_CI_TOKEN = 'STDNCI',
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
	
	Ext.define('Intel.STDNAndCI', {
		extend: 'Intel.lib.IntelRallyApp',
		mixins:[
			'Intel.lib.mixin.WindowListener',
			'Intel.lib.mixin.PrettyAlert',
			'Intel.lib.mixin.IframeResize',
			'Intel.lib.mixin.ParallelLoader',
			'Intel.lib.mixin.UserAppsPreference',
			'Intel.lib.mixin.HorizontalTeamTypes'
		],
		
		layout: {
			type:'vbox',
			align:'stretch',
			pack:'start'
		},
		items:[{
			xtype:'container',
			itemId:'navbox'
		},{
			xtype:'container',
			itemId:'gridContainer',
			cls: 'grid-container'
		}],
		minWidth:910,
		
		userAppsPref: 'intel-SAFe-apps-preference',

		/**___________________________________ DATA STORE METHODS ___________________________________*/	

		/**
			get all leaf stories in this release for the leaf projects under the train
			*/
		getUserStoryQuery: function(){
			var me=this,
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: me.ReleaseRecord.data.Name }),
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children.Name', value: null });
				
			return releaseFilter.and(leafFilter).and(projectFilter);
		},
	
		/**
			get all STDNCI leaf stories in this release for the leaf projects under the train
			
			Super hardcoded. This assumes there are 3 levels of portfolio items and the top level has STDN_CI_TOKEN in the name. we will only
			query user stories under this 3rd level portfolioItem
			*/
		getStdCIUserStoryQuery: function(){
			var me=this,
				lowestPortfolioItemType = me.PortfolioItemTypes[0],
				leafFilter = Ext.create('Rally.data.wsapi.Filter', { property: 'DirectChildrenCount', value: 0 }),
				releaseFilter = 
					Ext.create('Rally.data.wsapi.Filter', {property: 'Release.Name', value: me.ReleaseRecord.data.Name }).and(
					Ext.create('Rally.data.wsapi.Filter', {property: lowestPortfolioItemType + '.Parent.Parent.Name', operator:'contains', value: STDN_CI_TOKEN })),
				projectFilter = Ext.create('Rally.data.wsapi.Filter', {property: 'Project.Children.Name', value: null });
				
			return releaseFilter.and(leafFilter).and(projectFilter);
		},		
		
		_loadStdnCIStories: function(){
			var me = this;
			newMatrixStdnCIUserStoryPlanEstimate = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group			
			return Q.all(_.map(me.AllScrumGroupRootRecords, function(train){
				var trainName= train.data.Name,
					config = {
						model: 'HierarchicalRequirement',
						filters: me.getStdCIUserStoryQuery(),
						fetch:['ObjectID', 'Name', 'PlanEstimate','Project'],
						context: {
							workspace: null,
							project: '/project/' + train.data.ObjectID,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						//userstories for standarization
						if(!newMatrixStdnCIUserStoryPlanEstimate[trainName]){
							newMatrixStdnCIUserStoryPlanEstimate[trainName] = {};
						}
						if(!newMatrixStdnCIUserStoryPlanEstimate[trainName][projectName]){
							newMatrixStdnCIUserStoryPlanEstimate[trainName][projectName] = 0 ;								
						}
						newMatrixStdnCIUserStoryPlanEstimate[trainName][projectName] += storyRecord.data.PlanEstimate;						
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.StdnCIUserStoryPlanEstimateMap = newMatrixStdnCIUserStoryPlanEstimate;
			});				
		},
		_loadUserStories: function(){
			var me = this,
				newMatrixProjectUserStoryPlanEstimate = {}; //filter out teams that entered a team commit but have no user stories AND are not a scrum under the scrum-group			
			return Q.all(_.map(me.AllScrumGroupRootRecords, function(train){
				var trainName = train.data.Name,
					config = {
						model: 'HierarchicalRequirement',
						filters: me.getUserStoryQuery() ,
						fetch:['ObjectID', 'Name', 'PlanEstimate','Project'],
						context: {
							workspace:null,
							project: '/project/' + train.data.ObjectID ,
							projectScopeDown: true,
							projectScopeUp: false
						}
					};
				return me.parallelLoadWsapiStore(config).then(function(store){
					_.each(store.getRange(), function(storyRecord){
						var projectName = storyRecord.data.Project.Name,
							projectOID = storyRecord.data.Project.ObjectID;		
						//userstories for standarization
						if(!newMatrixProjectUserStoryPlanEstimate[trainName]){
							newMatrixProjectUserStoryPlanEstimate[trainName] = {};
						}
						if(!newMatrixProjectUserStoryPlanEstimate[trainName][projectName]){
							newMatrixProjectUserStoryPlanEstimate[trainName][projectName] = 0 ;								
						}
						newMatrixProjectUserStoryPlanEstimate[trainName][projectName] += storyRecord.data.PlanEstimate;						
					});
					store.destroyStore();
				});
			}))
			.then(function(){
				me.ProjectUserStoryPlanEstimateMap = newMatrixProjectUserStoryPlanEstimate;
			});		
		},
		_loadAllLeafProjectsMap:function(){ //TODO: change horizontal-team-types mixin to NOT need projects, but takes arrays of projects names!
			var me = this,
				newTrainProjectMap ={};
			me.projectFields = ["ObjectID", "Releases", "Children", "Parent", "Name"];
			return Q.all(_.map(me.AllScrumGroupRootRecords, function(train){
				return me.loadAllLeafProjects(train).then(function(allProjects){
					if(!newTrainProjectMap[train.data.Name]) 
						newTrainProjectMap[train.data.Name] = {};
						newTrainProjectMap[train.data.Name] = allProjects; 
				});
			}))
			.then(function(){
				me.TrainProjectMap = newTrainProjectMap;
			});
		},
		_createGridDataHash: function(){ //TODO: clean this up, seems redundant loops
			var me = this;	
			me.GridData = _.reduce(me.AllScrumGroupRootRecords, function(hash,train,key){
				var d = me.getAllHorizontalTeamTypeInfos(me.TrainProjectMap[train.data.Name]);
				hash[me.getScrumGroupName(train)] = _.reduce(d, function(hash,item,key){
					var horizontal = (item.horizontal === null) ? "Other" : item.horizontal;
					hash[horizontal] = _.reduce(d, function(hash,r,key){
						var horizontal2 = (r.horizontal === null) ? "Other" : r.horizontal;
						if (horizontal === horizontal2 ){
							var scrumTeamType = r.teamType + " " + r.number;
							var projectName = r.projectRecord.data.Name;
							hash[scrumTeamType] = { 
								scrumTeamType: r.teamType + " " + r.number,
								scrumName: r.projectRecord.data.Name,
								scrumObjectID: r.projectRecord.data.ObjectID,
								totalPoints: me.ProjectUserStoryPlanEstimateMap[train.data.Name][projectName] || 0,
								stdciPoints: me.StdnCIUserStoryPlanEstimateMap[train.data.Name][projectName] || 0
							};
						}
						return hash;
					}, {});	 
					return hash;
				}, {});			
				return hash;
			}, {});			
		},
		
		/**___________________________________ LOADING AND RELOADING ___________________________________*/
		reloadStores: function(){
			var me = this;
			return Q.all([
				me._loadAllLeafProjectsMap(),
				me._loadStdnCIStories(),
				me._loadUserStories()
			]);
		},
		reloadEverything: function(){
			var me=this;

			me.setLoading('Loading Data');
			return me.reloadStores().then(function(){
				me._createGridDataHash();
				if(!me.ReleasePicker){ //only draw the first time
					me.renderReleasePicker();
				}				
				me.down('#gridContainer').removeAll();
				me.renderGrid();
			})
			.then(function(){ me.setLoading(false); });
		},
		
		/**___________________________________ LAUNCH ___________________________________*/	
		/*only used for testing the UI!!!!
		getTestData: function(){
			return {
				Train1: {
					Hrz1: {
						TypeA: {
							scrumTeamType: 'TypeA',
							scrumName: 'TypeA - T1',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 5
						},
						TypeB: {
							scrumTeamType: 'TypeB',
							scrumName: 'TypeB - T1',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 4
						},
						TypeC: {
							scrumTeamType: 'TypeC',
							scrumName: 'TypeC - T1',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 11
						}
					},
					Hrz2: {
						TypeD: {
							scrumTeamType: 'TypeD',
							scrumName: 'TypeD - T2',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 56
						}
					},
					Hrz3: {
						TypeE: {
							scrumTeamType: 'TypeE',
							scrumName: 'TypeE - T1',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 56
						}
					}
				},
				Train2: {
					Hrz2: {
						TypeD: {
							scrumTeamType: 'TypeD',
							scrumName: 'TypeD - T2',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 56
						}
					},
					Hrz3: {
						TypeE: {
							scrumTeamType: 'TypeE',
							scrumName: 'TypeE - T2',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 56
						}
					}
				},
				Train3: {
					Hrz1: {
						TypeA: {
							scrumTeamType: 'TypeA',
							scrumName: 'TypeA - T3',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 9
						},
						TypeC: {
							scrumTeamType: 'TypeC',
							scrumName: 'TypeC - T3',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 10
						}
					},
					Hrz3: {
						TypeE: {
							scrumTeamType: 'TypeE',
							scrumName: 'TypeE - T3',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 5
						}
					}
				},
				Train4: {
					Hrz1: {
						TypeB: {
							scrumTeamType: 'TypeB',
							scrumName: 'TypeB - T4',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 12
						}
					},
					Hrz2: {
						TypeD: {
							scrumTeamType: 'TypeD',
							scrumName: 'TypeD - T4',
							scrumObjectID: 10,
							totalPoints: 101,
							stdciPoints: 56
						}
					}
				}
			};
		},
		*/
		
		launch: function(){
			var me = this;
			//debugging the grid only
			// me.GridData = me.getTestData();
			// me.renderGrid();
	
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
					me.ScrumGroupConfig = _.filter(me.ScrumGroupConfig, function(item){ return item.IsTrain; }); //TODO: don'tload all scrumGroups to improve performance
					return me.loadAllScrumGroups();
				}).then(function(scrumGroupRootRecords){
					me.AllScrumGroupRootRecords = scrumGroupRootRecords;
				})
				.then(function(){
					me.ProjectRecord = me.AllScrumGroupRootRecords[0];
					return Q.all([
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
							})
					]); 
				}) 
				.then(function(){ 
					return me.reloadEverything(); 
				})
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
				.then(function(){ me.setLoading(false); })
				.done();
		},
		
		/**___________________________________ NAVIGATION AND STATE ___________________________________*/
		releasePickerSelected: function(combo, records){
			var me=this, pid = me.ProjectRecord.data.ObjectID;
			if(me.ReleaseRecord.data.Name === records[0].data.Name) return;
			me.setLoading("Saving Preference");
			me.ReleaseRecord = _.find(me.ReleaseRecords, function(rr){ return rr.data.Name == records[0].data.Name; });
			if(typeof me.AppsPref.projs[pid] !== 'object') me.AppsPref.projs[pid] = {};
			me.AppsPref.projs[pid].Release = me.ReleaseRecord.data.ObjectID;
			me.saveAppsPreference(me.AppsPref)
				.then(function(){ return me.reloadEverything(); })
				.fail(function(reason){
					me.setLoading(false);
					me.alert('ERROR', reason);
				})
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
		
		/************************************************************* RENDER ********************************************************************/
		renderGrid: function(){
			var me = this,
				trainTotals = {}, 
				horizontalTotals = {}, 
				horizontalTeamTypes = {};
				
			//preprocess the data so we can create the rows for the table
			_.each(me.GridData, function(trainData, trainName){
				trainTotals[trainName] = {TrainName:trainName, Total:0, STDCI:0};
				_.each(trainData, function(horizontalData, horizontalName){
					horizontalTotals[horizontalName] = horizontalTotals[horizontalName] || {HorizontalName:horizontalName, Total:0, STDCI:0};
					horizontalTeamTypes[horizontalName] = horizontalTeamTypes[horizontalName] || [];
					_.each(horizontalData, function(scrumData, scrumTeamType){
						horizontalTotals[horizontalName].STDCI += scrumData.stdciPoints;
						horizontalTotals[horizontalName].Total += scrumData.totalPoints;
						trainTotals[trainName].STDCI += scrumData.stdciPoints;
						trainTotals[trainName].Total += scrumData.totalPoints;
						horizontalTeamTypes[horizontalName].push(scrumTeamType);
					});
				});
			}, []);
			
			//build the rows for the table
			var data = _.map(_.keys(horizontalTotals), function(horizontalTotalName){
				return {
					horizontalData: horizontalTotals[horizontalTotalName],
					horizontalTeamTypes: _.uniq(horizontalTeamTypes[horizontalTotalName]).sort()
				};
			});
			_.each(trainTotals, function(trainTotal, trainName){
				_.each(data, function(row){
					row[trainName] = _.map(row.horizontalTeamTypes, function(teamType){
						if((me.GridData[trainName][row.horizontalData.HorizontalName] || {})[teamType])
							return me.GridData[trainName][row.horizontalData.HorizontalName][teamType];
						else 
							return null;
					});
				});
			});
			//build the last row, with the train data 
			data.push(_.merge({
				horizontalData: {HorizontalName:'', Total:0, STDCI:0},
				horizontalTeamTypes: ['-']
			}, _.reduce(trainTotals, function(map, trainTotal, trainName){
				map[trainName] = [{
					stdciPoints: trainTotal.STDCI, 
					totalPoints:trainTotal.Total,
					scrumName: trainName
				}];
				return map;
			}, {})));
			
			//create the store that will hold the rows in the table
			var gridStore = Ext.create('Ext.data.Store', {
				fields:[
					{name: 'horizontalData', type: 'auto'},
					{name: 'horizontalTeamTypes', type: 'auto'}
				]
				.concat(_.map(trainTotals, function(trainTotal){
					return {name:trainTotal.TrainName, type:'auto'};
				})),
				data: data
			});
			
			//create the column definitions and renderers
			var columns = [].concat(
				[{
					text:' ', //Horizontal Name Column
					dataIndex:'horizontalData',
					tdCls: 'horizontal-name-cell',
					width:100,
					sortable:false,
					renderer:function(horizontalData, meta){
						return horizontalData.HorizontalName;
					}
				},{
					text:' ', //Horizontal Team Types Column
					xtype:'intelcomponentcolumn',
					dataIndex:'horizontalTeamTypes',
					width:100,
					tdCls: 'stdci-cell-container',
					sortable:false,
					renderer:function(horizontalTeamTypes){
						return Ext.create('Ext.container.Container', {
							layout: { type: 'vbox' },
							width: '100%',
							items: _.map(horizontalTeamTypes, function(teamType){
								return {
									xtype: 'container',
									flex:1,
									cls: 'team-type-cell',
									html: teamType
								};
							})
						});
					}
				}],
				_.map(trainTotals, function(trainTotal){
					return {
						text: trainTotal.TrainName, //Train Column
						xtype:'intelcomponentcolumn',
						dataIndex: trainTotal.TrainName,
						width:100,
						cls: 'train-header-cls',
						tdCls: 'stdci-cell-container',
						sortable:false,
						renderer:function(scrumDataList){
							return Ext.create('Ext.container.Container', {
								layout: { type: 'vbox' },
								width: '100%',
								padding:0,
								margin:0,
								flex:1,
								items: _.map(scrumDataList, function(scrumData){
									var exists = (scrumData !== null);
									var percent = exists ? (scrumData.stdciPoints/scrumData.totalPoints*100)>>0 : 0;
									var tooltip = exists ? (scrumData.scrumName + ': ' + scrumData.stdciPoints + '/' + scrumData.totalPoints + ' points') : '';
									return {
										xtype: 'container',
										cls: exists ? (percent < 10 ? ' bad-stdci-cell' : ' good-stdci-cell') : ' stdci-cell',
										html: exists ? '<span title="' + tooltip + '">' + percent + '%</span>' : '-'
									};
								})
							});
						}
					};
				}), 
				[{
					text:' ', //Horizontal % column
					dataIndex:'horizontalData',
					tdCls: '',
					width:100,
					sortable:false,
					renderer:function(horizontalData, meta){
						var hasData = horizontalData.Total > 0;
						var percent =  hasData ? (horizontalData.STDCI/horizontalData.Total*100)>>0 : 0;
						var tooltip = hasData ? (horizontalData.HorizontalName + ': ' + horizontalData.STDCI + '/' + horizontalData.Total + ' points') : '';
						meta.tdCls += hasData ? (percent < 10 ? ' bad-stdci-cell' : ' good-stdci-cell') : ' stdci-cell';
						return hasData ? '<span title="' + tooltip + '">' + percent + '%</span>' : '-';
					}
				}]
			);
		
			//finally build the grid
			me.down('#gridContainer').add({
				xtype: 'grid',
				header: {
					items: [{
						xtype:'container',
						html: 'Standardization And Continuous Improvement Report'
					}]
				},
				viewConfig: {
					stripeRows: false,
					preserveScrollOnRefresh:true
				},
				width: _.reduce(columns, function(sum, column){ return sum + column.width; }, 2),
				columns: {
					defaults: {
						text:'',
						resizable: false,
						draggable: false,
						sortable: false,
						editor: false,
						menuDisabled: true,
						renderer: function(val){ return val || '-'; }
					},
					items: columns
				},
				store: gridStore,
				enableEditing:false,
				disableSelection: true
			});
			setTimeout(function(){
				me.doLayout();
			}, 500);
		}
	});
}());