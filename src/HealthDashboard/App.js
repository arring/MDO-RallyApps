/*jshint smarttabs:true */
/*jslint white:true */
var app = null;
Ext.QuickTips.init();
Ext.define('HealthDashboard', {
    extend: 'Rally.app.App',

    componentCls: 'app',
    // items:{ html:'<a href="https://help.rallydev.com/apps/2.0rc3/doc/">App SDK 2.0rc3 Docs</a>'},
    launch: function() {
        app = this;
        app.codashGrid = null;
        app.currentScope = Rally.environment.getContext().getProject().Name;
        app.states = Ext.create('Ext.data.Store', {
            fields: ['abbr', 'name'],
            data: [
                { "abbr": "ACD all teams", "name": "'SIO' 'MIO' 'PT' 'CLK'" },
                { "abbr": "DCD all teams", "name": "'HTD' 'Array' 'Scan' 'Func Content' 'Func Module' 'Virtual Module' 'GT Content' 'GT Module'" },
                { "abbr": "MPV all teams", "name": "'MPV'" },
                { "abbr": "PHI all teams", "name": "'Binsplit' 'Yield PHI'" },
                { "abbr": "SCI all teams", "name": "'Fuse' 'TraceGen' 'TVPV' 'TMM' 'LIPORT' 'TPIE' 'CIFT' 'CTRACE'" },
                { "abbr": "TPI all teams", "name": "'Class TPI' 'Sort TPI' 'Sort Class TPI' 'Sort TD'" }
            ]
        });

        app.chartCI = { selected: app.getSetting("showCI"), dirty: false };
        app.timeHorizon = app.getSetting("timeHorizon");
        app.gridSize = app.timeHorizon * 50;
        app.getchartSize();
        app.addSettingsPanels();
        app.myVals = ['none_Delete_this_Line_To_See_All_in_Scope'];
        app.queryIterations(app.myVals);
    },


    getchartSize: function () {
        
        var timeH = document.getElementsByName("chartTimeHorizon");
        if (timeH !== null && timeH.length > 0) {
            app.timeHorizon = +timeH[0].value;
        }
        switch (app.timeHorizon) {
            case 5:
            case 6:
            case 7:
            case 8:
            case 9:
            case 10:
                break;
            default:
                app.timeHorizon = 4;
                break;
        }
        app.gridSize = app.timeHorizon * 50;

        var size = document.getElementsByName("chartDimensions");
        if (size !== null && size.length >0) {
            app.csize = +size[0].value;
        }
        else {
            app.csize = app.getSetting("size");
        }
        switch (app.csize) {
        case 1:
        case 2:
        case 3:
                break;
        default:
                app.csize = 1;
            break;
        }
        app.chartWidth = 100 * app.csize + (33 * app.csize * (app.timeHorizon - 4));
        app.chartHeight = 100 + (50 * (app.csize - 1));
       },
    getSettingsFields: function() {
        var values = [
            {
                name: 'size',
                xtype: 'rallytextfield',
                label: "chart size( valide values are 1=smal, 2= medium, 3=large"
            },
            {
                name: 'improvementTip',
                xtype: 'rallytextfield',
                label: "Text for % Improvement column tip"
            },
            {
                name: 'commitAcceptRatio',
                xtype: 'rallytextfield',
                label: "Target accepted .v. committed percent"
            },
            {
                name: 'showCI',
                xtype: 'rallytextfield',
                label: "Show Continuous improvements chart"
            },
            {
                name: 'timeHorizon',
                xtype: 'rallytextfield',
                label: "Desired time horizon ; How many sprints do you want to look back in time?"
            },
            {
                name: 'continuousImprovementRangeMin',
                xtype: 'rallytextfield',
                label: 'Continuous Improvement Range Min'
            },
            {
                name: 'continuousImprovementRangeMax',
                xtype: 'rallytextfield',
                label: 'Continuous Improvement Range Max'
            },
            {
                name: 'interruptLimitMax',
                xtype: 'rallytextfield',
                label: 'Max interrupt level (% of story points added ora/and subtracted)'
            },
            {
                name: 'VelocityVaration',
                xtype: 'rallytextfield',
                label: 'Max %velocity varation'
            }
        ];
        return values;
    },

    config: {
        defaultSettings: {
            size: 2,
            showCI: false,
			commitAcceptRatio: 10,
			timeHorizon: 4,
			continuousImprovementRangeMin: 5,
			continuousImprovementRangeMax: 10,
		    interruptLimitMax: 10,
            VelocityVaration: 10,
            improvementTip: 'Improvement is the sprint percent of  all improvement accepted story points to total of accepted points. for more ellaborate explanation please click the header of the column which is an active link to the help page on the subject.'
		}
	},

	/*
		queryIteration retrieves all iterations in scope that ended before today and after one
		year ago.
	*/
    queryIterations: function (vals) {

        app.chartCI.dirty = false;
		var today = new Date();
		var lastYear = new Date();
		lastYear.setDate(today.getDate()-365);
		var todayISO = Rally.util.DateTime.toIsoString(today, false);
		var lastYearISO = Rally.util.DateTime.toIsoString(lastYear, false);
        var configs = null;
        if ((vals !== null) && (vals.length > 0)) {
            configs = [
                {
                    model: "Iteration",
                    fetch: ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate'],
                    filters: [
                        Ext.create('Rally.data.wsapi.Filter', { property: 'EndDate', operator: "<=", value: todayISO }).and(
                            Ext.create('Rally.data.wsapi.Filter', { property: 'EndDate', operator: ">=", value: lastYearISO })).and(
                            _.reduce(vals, function(orFilter, val) {
                                if (!orFilter) return Ext.create('Rally.data.wsapi.Filter', { property: 'Project.Name', operator: "Contains", value: val });
                                else return orFilter.or(Ext.create('Rally.data.wsapi.Filter', { property: 'Project.Name', operator: "Contains", value: val }));
                            }, null))
                    ],
                    sorters: [{ property: 'EndDate', direction: 'ASC' }]
                }
            ];
        }
            else {
            configs = [
                {
                    model: "Iteration",
                    fetch: ['Name', 'ObjectID', 'Project', 'StartDate', 'EndDate'],
                    filters: [
                        { property: 'EndDate', operator: "<=", value: todayISO },
                        { property: 'EndDate', operator: ">=", value: lastYearISO }],
                    sorters: [{property: 'EndDate',direction: 'ASC'}]
                }
            ];
        }


        async.map( configs, app.wsapiQuery, function(error,results) {
		/*
			We group the iterations by project (team), and then get metrics for the last four iterations
			for each team.
		*/
			var iterationsRaw = results[0];
			var prjRefs = _.map(results[0],function(iter)
			{
							return iter.get("Project").ObjectID;
			});
			var uniqPrjRefs = _.uniq(prjRefs);
			var querConfigs = _.map(uniqPrjRefs,function(p) {
				return{
					model:"Project",
					fetch: ["TeamMembers"],
					filters: [{property:"ObjectID",value:p}]
				};
			});

			async.map(querConfigs, app.wsapiQuery, function (err, results) {

				var flatTM = _.flatten(results);
				var flatNotEmptyTM = _.filter(flatTM, function(prj) { return prj.get("TeamMembers").Count > 0; });
				var uniqPrjIdTM = _.map(flatNotEmptyTM, function(val) {
								return val.get("ObjectID");
				});
				var inerNoEmptyTM = _.filter(iterationsRaw, function(iter) { return _.contains(uniqPrjIdTM, iter.get("Project").ObjectID );});
				var groupedByProject = _.groupBy(inerNoEmptyTM, function (r) { return r.get("Project").Name; });
				var teams = _.keys(groupedByProject);
				var teamLastIterations = _.map(_.values(groupedByProject), function (gbp) {
				    return _.last(gbp, app.timeHorizon);
				});          

				/*
				Get the iteration data for each set of up to 4 iterations.
				*/
				async.map(teamLastIterations, app.teamData, function (error, results) {

					app.teamResults = _.map(results, function(result,i) {
						return {
							team : teams[i],
							summary : _.merge(results[i][0],results[i][1])//,results[i][2])
						};
					});
				    // create the table with the summary data.
					app.addTable(app.teamResults);
				});
			});
		});
	},


	/*
		Called for each team to return the iteration and improvements data records
	*/
	teamData : function( iterations, callback) {
		app.iterationsData( iterations, function(x,iterationResults) {
			app.improvementsData(iterations, function (err, improvementResults) {
			    app.allIterationItems(iterations, function(err, allIterationItems) {
			        callback(null, [iterationResults, improvementResults, allIterationItems]);
			    });
			});
		});
	},

	allIterationItems : function( iterations, callback) {

		var configs = _.map( iterations, function(iteration) {
			return {
				model  : "HierarchicalRequirement",
				fetch  : ['ObjectID','PlanEstimate','Name','FormattedID','Project','ScheduleState'],
				filters: [ {
						property : 'Iteration.ObjectID',
						operator: "=",
						value: iteration.get("ObjectID")
					}
				]
			};
		});

		async.map( configs, app.wsapiQuery, function(error,results) {
			var allData = [];
			_.each(results,function(allStories) {
			    var allIterationData = {
			        totalScope: _.reduce(allStories, function(memo, r) {
			            return memo + (r.get("PlanEstimate") !== null ? r.get("PlanEstimate") : 0);
			        }, 0),
			        lateAccepted: _.reduce(allStories, function(memo, r) {
			            return memo + app.acceptedValue(r);
			        }, 0)
			    };
				allData.push(allIterationData);
			});				
			callback(null,allData);
		});
	},

	improvementsData : function( iterations, callback) {

		var configs = _.map( iterations, function(iteration) {
			return {
				model  : "HierarchicalRequirement",
				fetch  : ['ObjectID','PlanEstimate','Name','FormattedID','Project','ScheduleState'],
				filters: [ {
						property : 'Feature.Name',
						operator: "contains",
						value: 'Continuous Improvement'
					},
					{
						property : 'Iteration.ObjectID',
						operator: "=",
						value: iteration.get("ObjectID")
					},
					{
						property : 'ScheduleState',
						operator: "=",
						value: "Accepted"
					}
				]
			};
		});

		async.map( configs, app.wsapiQuery, function(error,results) {
			var allData = [];
			_.each(results,function(result) {
			    var improvementRec = {
			        totalImprovementPoints: _.reduce(result, function(memo, r) {
			            return memo + app.acceptedValue(r);
			        }, 0)
			    };
				allData.push(improvementRec);
			});
			
			callback(null,allData);
		});

	},

	acceptedValue : function(story) {
		var accepted = story.get("ScheduleState") === "Accepted" || story.get("ScheduleState") == "Released";
		var val = accepted && (story.get("PlanEstimate")!==null) ? story.get("PlanEstimate") : 0;
		return val;
	},

	/*
		Retrieves the iteration metrics (iterationcumulativeflowdata) for each set of iterations
	*/
	iterationsData : function( iterations, callback) {
		// create a set of wsapi query configs from the iterations

		var configs = _.map( iterations, function(iteration) {
			return {
				model  : "IterationCumulativeFlowData",
				fetch  : ['CardEstimateTotal','CardState','CreationDate'],
				filters: [ Ext.create('Rally.data.wsapi.Filter', {
					property : 'IterationObjectID',
					operator: "=",
					value: iteration.get("ObjectID")
				})]
			};
		});

		// once we have the metrics data we do some gymnastics to calculate the committed and accepted values
		async.map( configs, app.wsapiQuery, function(error,results) {
			var summaries = [];
			_.each(results,function(iterationRecords, index) {
				if(iterationRecords.length >0) {
					// group the metrics by date,
					var groupedByDate = _.groupBy(iterationRecords,function(ir) { return ir.get("CreationDate");});

					var churnRatio = app.churnRatio(_.values(groupedByDate));
					var iterationDates = _.keys(groupedByDate);
					iterationDates = _.sortBy(iterationDates,function(d) {
						return Rally.util.DateTime.fromIsoString(d);
					});
					var firstDayRecs = groupedByDate[_.first(iterationDates)];
					var lastDayRecs = groupedByDate[_.last(iterationDates)];
					if((firstDayRecs.length>0) && (lastDayRecs.length>0))
					{
						var committed = _.reduce(firstDayRecs, function (memo, val) {


										return memo + (val.get("CardEstimateTotal") !== null ? val.get("CardEstimateTotal") : 0);
						}, 0 );
						var accepted = _.reduce( lastDayRecs, function(memo,val) {
							var estimate = val.get("CardEstimateTotal");
							var done = val.get("CardState") === "Accepted" || val.get("CardState") === "Released";
							return memo + ( done && !_.isNull(estimate) ) ? estimate : 0;
						}, 0 );
						summaries.push( {
							projectObjectID: (iterations[index].get("Project")).ObjectID,
							iterationName : iterations[index].get("Name"),
							iterationObjectID:  iterations[index].get("ObjectID"),
							committed: Math.round(committed),
                            velocityVar: 0,
							accepted : Math.round(accepted),
							churnRatio : churnRatio
						});
					}
				}
			});
			//console.log("summaries=", summaries);
			callback(null,summaries);
		});
	},

	addTable: function(teamResults) {
	    var grid;
	    var columnCfgs;

	
	    if (app.chartCI.selected) {

	        grid = Ext.create('Rally.ui.grid.Grid', {
	            id: 'CodashGridId',
	            cls: 'custom-grid',
	            store: Ext.create('Rally.data.custom.Store', { data: teamResults }),
	            columnCfgs: [
	            {
	                header: '<span data-qtip="Team name is an active link to the team dashboard.">Team</span>',
	                dataIndex: 'team',
	                renderer: function(value, store) {
	                    var link = Ext.String.format('<a href="https://rally1.rallydev.com/#/{0}/dashboard" target=_blank>{1}</a>', (store.record.get("summary"))[0].projectObjectID, value);
	                    return link;
	                },
	                frameHeader: true, columnLines: true
	            },
	            {
	                header: Ext.String.format('<span data-qtip=" Recent sprints committed & accepted story points. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/AgileMetrics", "Recent Sprints"),
	                dataIndex: 'summary', renderer: app.renderSummaries,   width: app.gridSize, align: "center",  frameHeader: true
	            },
	            {
	                header: Ext.String.format('<span data-qtip="% Accepted/committed ratio for Recent Sprints. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/CommittAccept", "% Acceptance"),
	                dataIndex: 'summary', renderer: app.renderAcceptedChart,  width: app.chartWidth, align: "center",  frameHeader: true
	            },
                {
                    header: Ext.String.format('<span data-qtip="% Sprint to sprint velocity delta/committed ratio for Recent Sprints. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target="_blank">{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/VelocityRatio", "% Velocity"),
                    dataIndex: 'summary', renderer: app.renderVelocityChart,  width: app.chartWidth, align: "center",  frameHeader: true
                },
	            {
	                header: Ext.String.format('<span data-qtip="% each sprint Story Pts  StdDev / Mean ratio for Recent Sprints. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/Interrupts", "% Interrupts"),
	                dataIndex: 'summary', renderer: app.renderChurnChart,  width: app.chartWidth, align: "center",  frameHeader: true
	            },
                {
                    header: Ext.String.format('<span data-qtip=" % Improvements/(all accepted)  story points. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/ContinuousImprovements", "% Improvements"),
                    dataIndex: 'summary',
                    renderer: app.renderImprovementChart,
                            
                    width: app.chartWidth,
                    align: "center",
                        frameHeader: true
                }
	                ]
	            });
	        }
        else {
	        grid = Ext.create('Rally.ui.grid.Grid', {
	            id: 'CodashGridId',
                cls: 'custom-grid',
	            store: Ext.create('Rally.data.custom.Store', { data: teamResults }),
	            columnCfgs: [
	                {
	                    header: '<span data-qtip="Team name is an active link to the team dashboard.">Team</span>',
	                    dataIndex: 'team',
	                    renderer: function(value, store) {
	                        var link = Ext.String.format('<a href="https://rally1.rallydev.com/#/{0}/dashboard" target=_blank>{1}</a>', (store.record.get("summary"))[0].projectObjectID, value);
                            return link;
	                    }, frameHeader: true, columnLines: true
                    },
                    {
                        header: Ext.String.format('<span data-qtip=" Recent sprints committed & accepted story points. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/AgileMetrics ", "Recent Sprints"),
                        dataIndex: 'summary', renderer: app.renderSummaries,  width: app.gridSize, align: "center",  frameHeader: true
                    },
                    {
                        header: Ext.String.format('<span data-qtip="% Accepted/committed ratio for Recent Sprints. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/CommittAccept", "% Acceptance"),
                        dataIndex: 'summary', renderer: app.renderAcceptedChart,  width: app.chartWidth, align: "center",  frameHeader: true
                    },
                    {
                        header: Ext.String.format('<span data-qtip="% Sprint to sprint velocity delta/committed ratio for Recent Sprints. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/VelocityRatio", "% Velocity"),
                        dataIndex: 'summary', renderer: app.renderVelocityChart,  width: app.chartWidth, align: "center",  frameHeader: true
                    },
                    {
                        header: Ext.String.format('<span data-qtip="% each sprint Story Pts  StdDev / Mean ratio for Recent Sprints. </p>For more ellaborate explanation please click the header of the column which will take you to a help page on the subject."><a href={0} target=_blank>{1}</a></span>', "http://smsurveymdo.intel.com/CoDashHelp/Interrupts", "% Interrupts"),
                        dataIndex: 'summary', renderer: app.renderChurnChart,  width: app.chartWidth, align: "center",  frameHeader: true
                    }
	            ]
	        });
	    }
	app.codashGrid = grid;
	app.add(grid);
	},

	// Returns the std dev when passed an array of arrays of daily cumulative flow recs
	churnRatio : function ( arrDailyRecs ) {
	    var maxRatio = app.getSetting("interruptLimitMax");
		var dailyTotals = _.map( arrDailyRecs, function(recs) {
		    return _.reduce(recs, function(memo, r) { return memo + r.get("CardEstimateTotal"); }, 0);
		});
		var dailyAverage = _.mean(dailyTotals);
		var stdDev = _.stdDeviation(dailyTotals);
		stdDev = stdDev * stdDev;     
		var ratio = dailyAverage > 0 ? Math.round((stdDev / dailyAverage) * 100) : 0;
		var drec = {
		    churnRatio: ratio,
            ratioMax: maxRatio,
			stdDev: stdDev,
			mean: dailyAverage
		};
		return drec;
	},

	
	myColor4Chart : function (data, field)
	{
	var mis = _.flatten(data, field);
		var sum = _.reduce(mis, function(sum, num){
			return sum + num;
			});
			 switch(sum)
			 { 
			 case 0:
			     myColor = '#D8F6CE';
				break;
			 case 1:
				myColor = 'none';
			   break;
			 case 2:
				myColor = 'none';
				break;
			 case 3:
			     myColor = '#F2F5A9';//yellow
				break;
			  default:
			      myColor = '#F6CECE';
				break;
		 }
		 return myColor;
	},
	
	addSettingsPanels: function () {

	    var grid = Ext.create('Rally.ui.grid.Grid', {
	        id: 'CodashSettingsId',
	        cls: 'custom-grid',
	        store: Ext.create('Rally.data.custom.Store', { data: { ala: 1 } }),
	        pagingToolbarCfg: {
	            disabled: true,
	            hidden: true,
	            pageSizes: [5, 10, 25]
	        },
	        columnCfgs: [
	            {
	                dataIndex: 'summary',
	                renderer: app.renderDispSettings,
	                width: '18%',
	                align: "center",
	                frameHeader: true,
	                columnLines: true
	            },
	            {
	                dataIndex: 'summary',
	                renderer: app.renderDataSettings,
	                width: '28%',
	                align: "center",
	                frameHeader: true,
	                columnLines: true
	            }
	        ]
	    });
	    app.add(grid);
	},

	renderDispSettings: function (value, metaData, record, rowIdx, colIdx, store, view)
	{
	        record.displayPanelConfig = {
	            title: '<span data-qtip="Settings controlling the display of the dashboard data.">Display Settings</span>',//'Dashboard Display Settings:',
	        //bodyPadding: 2,
	        cls: 'dataRetrivalPanel',
	        frame:true,
	        layout: {
	            type: 'vbox',
	            align: 'left'
	        },
	        items: [
	            {
	                xtype: 'numberfield',
	                anchor: '80%',
	                enforceMaxLength : true,
	                //autoCreate: {tag: 'input', type: 'text', size: '20', autocomplete: 'off', maxlength: '4'},
	               name: 'chartDimensions',
	               labelWidth: 100,
                    width: 120,
	               fieldLabel: 'Chart Size (1-3)',
	               hideTrigger: true,
	               fieldStyle: 'background-color: #D8F6CE; width:20px;',
                    value: app.getSetting("size"),
                    maxValue: 3,
                    minValue: 1
	            },
                {
                    xtype: 'checkboxgroup',
                    id: 'chartsCBox',
	                fieldLabel: 'Charts to Display',
	                labelWidth: 100,
	                width: '100%',
	                // Arrange checkboxes into two columns, distributed vertically
	                columns: 2,
	                vertical: false,
	                border: 1,
	                style: {
	                    borderColor: '#A9BCF5',
	                    borderStyle: 'solid'
	                },
	                listeners: {
	                    change: function (field, newValue, oldValue, eOpts) {
	                        app.chartCI.selected = newValue.rb4 !== null;
	                        app.chartCI.dirty = true;
	                    }
	                },
	                items: [
                        { boxLabel: 'Acceptance ', name: 'rb', inputValue: '1', checked: true, disabled: true },
                        { boxLabel: 'Velocity', name: 'rb', inputValue: '2', checked: true, disabled: true },
                        { boxLabel: 'Interrupts', name: 'rb', inputValue: '3', checked: true, disabled: true },
                        { boxLabel: 'Improvements', name: 'rb4', inputValue: '4' },
                        { boxLabel: 'Quality', name: 'rb4', inputValue: '5', checked: false, disabled: true },
	                    { boxLabel: 'HAPI Index', name: 'rb4', inputValue: '6', checked: false, disabled: true },
                        { boxLabel: 'Team Standards', name: 'rb4', inputValue: '7', checked: false, disabled: true },
                        { boxLabel: 'XFunctionality', name: 'rb4', inputValue: '8', checked: false, disabled: true }
	                    ]
	        }],
	        buttons: [
            {
                text: 'Refresh',
                anchor: '100%',
                layout: {
                    type: 'hbox',
                    padding: '5',
                    align: 'left'
                },
                handler: function () {
                    app.getchartSize();

                    if (app.chartCI.dirty) {
                        app.remove(app.codashGrid);
                        app.queryIterations(app.myVals);
                } else {
                        Ext.getCmp('CodashGridId').refresh();
                    }
                }
            }]
	    };


		var id = Ext.id();
		Ext.defer(function (id) {

		    record.displayPanelConfig.renderTo = id;

		    if (record.displaySettingsPanel === undefined)
		        record.displaySettingsPanel = Ext.create('Ext.form.Panel', record.displayPanelConfig);
		}, 50, undefined, [id]);

		return "<div id='" + id + "'></div>";
	},

	renderDataSettings: function (value, metaData, record, rowIdx, colIdx, store, view) {
	    var myTitle = '<span data-qtip="Settings controlling data retrieval for the dashboard.">Data Retrieval Settings  <h4>SCOPE: ' + app.currentScope + '</h4></span>';
	    record.dataPanelConfig = {
	        title: myTitle, //'<span data-qtip="Settings controlling data retrieval for the dashboard.">Data Retrieval Settings"+"</span>',//'Data Retrieval Settings:',
	        //width: '100%',
	        //height: '160px',
	        frame: true,
	        cls: 'dataRetrivalPanel',
	        layout: {
	            type: 'table',
                columns: 3
	            //align: 'left'
	        },
	        items: [
	             {
	                 html: '1,1',
	                xtype: 'numberfield',
	                anchor: '100%',
	                enforceMaxLength: true,
	                name: 'chartTimeHorizon',
	                labelWidth: 100,
	                width: 130,
	                fieldLabel: 'Time Horizon (4-10)',
	                hideTrigger: true,
	                fieldStyle: 'background-color: #D8F6CE; width:20px;',
	                value: app.timeHorizon,
	                maxValue: 10,
	                minValue: 4
	             },
                {
                    html: '1,2', colspan: 2,
                    labelAlign: 'right',
                    width: 380,
                    fieldLabel: 'MDO Teams:',
                    fieldStyle: 'background-color: #D8F6CE;',
                    xtype: 'combobox',
                    store: app.states,
                    queryMode: 'local',
                    displayField: 'abbr',
                    valueField: 'name',
                    multiSelect: true,
                    listeners: {
                        scope: this,
                        'select': function (p) {

                            var selected = _.reduce(p.value, function (memo, val) { return memo + ' ' + val; });
                            Ext.getCmp("teamKeywordsId").setValue(selected);
                            //console.log("selected=" + selected);
                        }
                    }
                },
	            {
	                xtype: 'splitter',
	                orientation: 'horizontal'// A splitter between the two child items
	            },
	            {
	                html: '2,2',
                    colspan:2,
	                xtype: 'textareafield',
	                grow: true,
                    id:'teamKeywordsId',
	                name: 'teamkeywords',
	                fieldLabel: 'Team Name</br> Keywords</br>(use quotes to</br>separate keywords</br>(for example: </br>"TMM" "Ever") ',
	                labelAlign : 'right',
	                labelWidth: 100,
	                width: 380,
                    height: 90,
	                anchor: '100%',
	                fieldStyle: 'background-color: #D8F6CE; width:20px;',
	                value:  _.reduce(app.myVals, function(sum, st) {return sum + "\"" + st + "\"";})
	            }
	        ],
	        buttons: [
            {
                text: 'Refresh',
                anchor: '100%',
                layout: {
                    type: 'hbox',
                    padding: '5',
                    align: 'left'
                },
                handler: function () {
                    app.getchartSize();
                    app.remove(app.codashGrid);

                    var keywords = document.getElementsByName("teamkeywords");
                    if (keywords !== null && keywords.length > 0) {

                        //var keys = keywords[0].value.split(/[^\s,"']+|"([^"]*)"+|'([^']*)'/);
                        var keys = keywords[0].value.split(/"([^"]*)"+|'([^']*)'/);
                        _.remove(keys, function (key) { return (typeof key === 'undefined') || (key.length === 0) || (key[0] == ' '); });
                        app.myVals = keys;
                    }
                    app.queryIterations(app.myVals);
                }
            }]
	    };


	    var id = Ext.id();
	    Ext.defer(function (id) {

	        record.dataPanelConfig.renderTo = id;

	        if (record.dataSettingsPanel === undefined)
	            record.dataSettingsPanel = Ext.create('Ext.form.Panel', record.dataPanelConfig);
	    }, 50, undefined, [id]);

	    return "<div id='" + id + "'></div>";
	},

	renderVelocityChart: function (value, metaData, record, rowIdx, colIdx, store, view) {
	    var margin = app.getSetting("VelocityVaration");
	    var currentRatio;

	    var data = _.map(value, function (v, i) {
	        var drec = {
	            prjID: v.projectObjectID,
	            iterID: v.iterationObjectID,
	            iterName: v.iterationName,
	            committed: v.committed,
	            velocityMax: margin,
	            velocityRatio: 0,
	            missedVelocityTarget: 0,
	            index: i + 1
	        };

	        return drec;
	    });

	    for (id = 0; id < data.length; id++) {
	        if ((id > 0) && (data[id].committed >0))
	            currentRatio = Math.round(Math.abs((data[id - 1].committed - data[id].committed) * 100 / data[id].committed));
	        else {
	            currentRatio = 0;
	        }
	        data[id].velocityRatio = currentRatio;
	        data[id].missedVelocityTarget = (currentRatio >= data[id].velocityMax) ? 1 : 0;
	    }

	    record.velocityChartStore = Ext.create('Ext.data.JsonStore', {
	        fields: ['index', 'velocityRatio', 'velocityMax', 'prjID', 'iterID', 'iterName'],
	        data: data
	    });

	    record.velocityChartConfig = {
	        style: {
	            backgroundColor: app.myColor4Chart(data, 'missedVelocityTarget')
	        },
	        width: app.chartWidth,
	        height: app.chartHeight,
	        axes: [{
	            type: 'Numeric',
	            position: 'left',
	            fields: ['velocityRatio', 'velocityMax'],
	            label: {
	                renderer: Ext.util.Format.numberRenderer('0,0')
	            },
	            grid: true
	        },
			{
			    type: 'Category',
			    position: 'bottom',
			    fields: ['index']
			}],
	        series: [
				{
				    type: 'line',
				    style: {
				        stroke: "red",
				        fill: 'green'
				    },
				    markerConfig: {
				        type: 'cross',
				        size: 1,
				        radius: 1
				    },
				    axis: 'left',
				    fill: true,
				    xField: 'index',
				    yField: 'velocityMax'
				},
				{
				    type: 'line',
				    highlight: {
				        size: 1,
				        radius: 6
				    },
				    tips: {
				        trackMouse: false,
				        width: 140,
				        height: 50,
				        renderer: function (storeItem, item) {
				            // change panel header
				            this.setTitle(storeItem.get('iterName'));

				            // change panel body              
				            this.update(storeItem.get('velocityRatio') + '% - ratio');
				        }
				    },
				    markerConfig: {
				        type: 'circle',
				        size: 1,
				        radius: 3
				    },
				    axis: 'left',
				    xField: 'index',
				    yField: 'velocityRatio',
				    listeners: {
				        'itemmouseup': function (p) {
				            //window.location.assign("https://rally1.rallydev.com/#/" + p.storeItem.get('prjID') + "/oiterationstatus?iterationKey=" + p.storeItem.get('iterID') + " target=_blank");
				            window.open("https://rally1.rallydev.com/#/" + p.storeItem.get('prjID') + "/oiterationstatus?iterationKey=" + p.storeItem.get('iterID'), '_blank');
				        }
				    }
				}
	        ]
	    };

	    var id = Ext.id();

	    Ext.defer(function (id) {
	        record.velocityChartConfig.renderTo = id;
	        record.velocityChartConfig.store = record.velocityChartStore;

	        if (record.velocityChart === undefined)
	            record.velocityChart = Ext.create('Ext.chart.Chart', record.velocityChartConfig);
	    }, 50, undefined, [id]);

	    return "<div id='" + id + "'></div>";


	},


	renderAcceptedChart: function (value, metaData, record, rowIdx, colIdx, store, view) {
	    var margin = app.getSetting("commitAcceptRatio");
	    var data = _.map(value, function (v, i) {

	        var vAcceptedPercent = v.committed > 0 ? Math.round((v.accepted / v.committed) * 100) : 0;
	        var acceptMin = 100 - margin;
	        var acceptMax = 100 + margin;
	        var drec = {
	            prjID: v.projectObjectID,
	            iterID: v.iterationObjectID,
	            iterName: v.iterationName,
	            committed: v.committed,
	            acceptedPercent: vAcceptedPercent,
	            targetPercentMin: acceptMin,
	            targetPercentMax: acceptMax,
	            missedTarget: ((vAcceptedPercent < acceptMin) || (vAcceptedPercent > acceptMax)) ? 1 : 0,
	            index: i + 1
	        };

	        return drec;
	    });
	    record.chartStore = Ext.create('Ext.data.JsonStore', {
	        fields: ['index', 'acceptedPercent', 'targetPercentMin', 'targetPercentMax', 'prjID', 'iterID', 'iterName'],
	        data: data
	    });

	    record.chartConfig = {
	        style: {
	            backgroundColor: app.myColor4Chart(data, 'missedTarget')
	        },
	        width: app.chartWidth,
	        height: app.chartHeight,
	        axes: [{
	            type: 'Numeric',
	            position: 'left',
	            fields: ['acceptedPercent', 'targetPercentMin', 'targetPercentMax'],
	            label: {
	                renderer: Ext.util.Format.numberRenderer('0,0')
	            },
	            grid: true
	        },

			{
			    type: 'Category',
			    position: 'bottom',
			    fields: ['index']
			}],
	        series: [
				{
				    type: 'line',
				    style: {
				        stroke: '#ff0000',
				        fill: 'red'
				    },
				    markerConfig: {
				        type: 'cross',
				        size: 1,
				        radius: 1
				    },
				    axis: 'left',
				    fill: true,
				    xField: 'index',
				    yField: 'targetPercentMin'
				},
				{
				    type: 'line',
				    style: {
				        stroke: "red",
				        fill: 'green'
				    },
				    markerConfig: {
				        type: 'cross',
				        size: 1,
				        radius: 1
				    },
				    axis: 'left',
				    fill: true,
				    xField: 'index',
				    yField: 'targetPercentMax'
				},
				{
				    type: 'line',
				    highlight: {
				        size: 1,
				        radius: 6
				    },
				    tips: {
				        trackMouse: false,
				        width: 140,
				        height: 50,
				        renderer: function (storeItem, item) {

				            // calculate and display percentage on hover
				            //var total = 0;
				            //store.each(function (rec) {
				            //    total += rec.get('data');
				            //});

				            // change panel header
				            //this.setTitle(storeItem.get('name'));
				            this.setTitle(storeItem.get('iterName'));

				            // change panel body              
				            this.update(storeItem.get('acceptedPercent') + '% - accepted');
				            //var href = 'https://rally1.rallydev.com/#/17657518684/custom/18200665984';
				            //id = 1234;
				            //this.update('link here <a id=' + id + 'href='+href+' target=_blank></a>');
				            //console.log("storeItem", storeItem);
				        }
				    },
				    markerConfig: {
				        type: 'circle',
				        size: 1,
				        radius: 3
				    },
				    axis: 'left',
				    xField: 'index',
				    yField: 'acceptedPercent',
				    listeners: {
				        'itemmouseup': function (p) {
				            //window.location.assign("https://rally1.rallydev.com/#/" + p.storeItem.get('prjID') + "/oiterationstatus?iterationKey=" + p.storeItem.get('iterID') + " target=_blank");
				            window.open("https://rally1.rallydev.com/#/" + p.storeItem.get('prjID') + "/oiterationstatus?iterationKey=" + p.storeItem.get('iterID'), '_blank');
				        }
				    }
				}
	        ]
	    };

	    var id = Ext.id();
	    
	    Ext.defer(function (id) {
	        record.chartConfig.renderTo = id;
	        record.chartConfig.store = record.chartStore;

	        if (record.chart === undefined)
	            record.chart = Ext.create('Ext.chart.Chart', record.chartConfig);
	    }, 50, undefined, [id]);

	    var prj = value[0].projectObjectID;
	    var iteration = _.last(value).id;
	    var href = "https://rally1.rallydev.com/#/" + prj + "/oiterationstatus?iterationKey=" + iteration + " target='_blank'";
	    return "<div id='" + id + "'></div>";
	    //return "<a id='" + id + "'href=" + href + " target=_blank></a>";
	},

	renderImprovementChart: function (value, metaData, record, rowIdx, colIdx, store, view) {
		var continuousImprovementRangeMax = app.getSetting("continuousImprovementRangeMax");
		var continuousImprovementRangeMin = app.getSetting("continuousImprovementRangeMin");

		var data = _.map(value, function (v, i) {
			var improvements = v.totalScope > 0 ? Math.round((v.totalImprovementPoints / v.totalScope) * 100) : 0;
			var drec =  {
				improvementPercent: improvements,
				continuousImprovementRangeMax: continuousImprovementRangeMax,
				continuousImprovementRangeMin: continuousImprovementRangeMin,
				missedTarget: ((improvements < continuousImprovementRangeMin) || (improvements > continuousImprovementRangeMax)) ? 1 : 0,
				index : i+1
			};
			return drec;
		});

		record.improvementChartStore = Ext.create('Ext.data.JsonStore', {
			fields: ['index', 'improvementPercent', 'continuousImprovementRangeMin','continuousImprovementRangeMax'],
			data: data
		});

		record.improvementChartConfig = {
			style: {
			    backgroundColor: app.myColor4Chart(data, 'missedTarget')
			},
			width: app.chartWidth,
			height: app.chartHeight,
			axes: [{
				type: 'Numeric',
				position: 'left',
				fields: ['improvementPercent', 'continuousImprovementRangeMin', 'continuousImprovementRangeMax'],
				label: {
					renderer: Ext.util.Format.numberRenderer('0,0')
				},
				grid: true
			}, {
				type: 'Category',
				position: 'bottom',
				fields: ['index']
			}],
			series: [
				{
					type: 'line',
					style: {
						stroke: '#ff0000',
						fill: 'red'
					},
					markerConfig: {
						type: 'cross',
						size: 1,
						radius: 1
					},
					axis: 'left',
					fill: true,
					xField: 'index',
					yField: 'continuousImprovementRangeMin'
				},
				{
					type: 'line',
					style: {
						stroke: "red",
						fill: 'green'
					},
					markerConfig: {
						type: 'cross',
						size: 1,
						radius: 1
					},
					axis: 'left',
					fill: true,
					xField: 'index',
					yField: 'continuousImprovementRangeMax'
				},
				{
					type: 'line',
					highlight: {
						size: 4,
						radius: 4
					},
					axis: 'left',
					xField: 'index',
					yField: 'improvementPercent'
				}
			]
		};

		var id = Ext.id();
		Ext.defer(function (id) {
			record.improvementChartConfig.renderTo = id;
			record.improvementChartConfig.store = record.improvementChartStore;
			if (record.improvementChart===undefined)
				record.improvementChart = Ext.create('Ext.chart.Chart', record.improvementChartConfig);
		}, 50, undefined, [id]);

		return "<div id='"+id+"'></div>";
	},

	renderChurnChart: function (value, metaData, record, rowIdx, colIdx, store, view) {

		//console.log("DGvale=", value);
		var data = _.map(value, function (v, i) {
			
			return {
			    ratio: v.churnRatio.churnRatio,
                maxRatio: v.churnRatio.ratioMax,
				mean: v.churnRatio.mean,
				stdDev: v.churnRatio.stdDev,
				missedTarget: (v.churnRatio.churnRatio > v.churnRatio.ratioMax) ? 1 : 0,
				index : i+1
			};
		});
		//console.log("data=", data);
		record.churnChartStore = Ext.create('Ext.data.JsonStore', {
		    fields: ['index', 'ratio', 'mean', 'stdDev', 'maxRatio'],
			data: data
		});

		record.churnChartConfig = {
		    style: {
		        backgroundColor: app.myColor4Chart(data, 'missedTarget')
		    },
		    width: app.chartWidth,
		    height: app.chartHeight,
			axes: [{
				type: 'Numeric',
				position: 'left',
				fields: ['ratio', 'maxRatio'],
				label: {
					renderer: Ext.util.Format.numberRenderer('0,0')
				},
				grid: true
			}, {
				type: 'Category',
				position: 'bottom',
				fields: ['index']
			}],
			series: [
				{
					type: 'line',
					style: {
						stroke: "green",
						fill: "green"
					},
					markerConfig: {
						type: 'cross',
						size: 2,
						radius: 2
					},
					axis: 'left',
					fill: true,
					xField: 'index',
					yField: 'maxRatio'
				},
				{
				    type: 'line',
				    style: {
				        stroke: "red",
				        fill: 'red'
				    },
				    tips: {
				        trackMouse: false,
				        width: 140,
				        height: 50,
				        renderer: function (storeItem, item) {

				            this.setTitle('StdDev/Mean');
				            // change panel body              
				            this.update(storeItem.get('ratio') + '% - ratio');
				        }
				    },

					markerConfig: {
						type: 'circle',
						size: 2,
						radius: 2
					},
					highlight: {
						size: 4,
						radius: 4
					},
					axis: 'left',
					fill: false,
				xField: 'index',
				yField: 'ratio'
				}
			]
		};

		var id = Ext.id();
		Ext.defer(function (id) {
			record.churnChartConfig.renderTo = id;
			record.churnChartConfig.store = record.churnChartStore;
			if (record.churnChart===undefined)
				record.churnChart = Ext.create('Ext.chart.Chart', record.churnChartConfig);
		}, 50, undefined, [id]);

	    //return "<div id='"+id+"'></div>";

		var prj = value[0].projectObjectID;
		var iteration = _.last(value).id;
		var href = "https://rally1.rallydev.com/#/" + prj + "/custom/18200665984" + " target='_blank'";
	    //https://rally1.rallydev.com/#/15771369888/custom/18200665984
		return "<a id='" + id + "'href=" + href + " target=_blank></a>";
	},

	LinkRenderer: function(value, metaData, record, rowIdx, colIdx, store, view) {
		var workspace=app.getContext().getProject().ObjectID;
		var lastSprintId= _.last(value).id;
		return "<a href='https://rally1.rallydev.com/#/"+workspace+"/oiterationstatus?iterationKey="+lastSprintId+"' target='_blank'>Last one</a>";
	},

	renderSummaries: function (value, metaData, record, rowIdx, colIdx, store, view) {
	    var str = "<table class='iteration-summary' height='"+app.chartHeight+"px'>" +
			"<tr>" +
			"<td width='70px'>Committed</td>";
	    _.forEach(value, function(rec) {
	        //console.log("rec=", rec);
	        str += "<td width='20px'>" + rec.committed + "</td>";
	    });

		str += "</tr>" +
			 "<tr>" +
			 "<td>Accepted</td>";

	    _.forEach(value, function(rec) {

	        str += rec.accepted < rec.committed ? "<td class='accepted'>" + rec.accepted + "</td>" : "<td>" + rec.accepted + "</td>";
	    });
	    str += "</tr>";
	    str += "</table>";
			return str;
	},

	wsapiQuery : function( config , callback ) {
		Ext.create('Rally.data.WsapiDataStore', {
			autoLoad : true,
			limit : "Infinity",
			model : config.model,
			fetch : config.fetch,
			filters : config.filters,
			sorters : config.sorters,
			listeners : {
				scope : this,
				load : function(store, data) {
					callback(null,data);
				}
			}
		});
	}
});