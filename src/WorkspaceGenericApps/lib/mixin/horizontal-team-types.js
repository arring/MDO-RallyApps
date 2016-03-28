/**
	This mixin exposes a few public methods that allow the caller to easily get 
	info about the horizontal and teamTypeInfo for a list of projects.
	
	The reason that you should ALWAYS call getAllHorizontalTeamTypeInfos with multiple 
	projects instead of getHorizontalTeamTypeInfo 1 project is because this allows the 
	'number' field of the teamTypeInfo to be set correctly.
	For example:
		You have projects: ['MPV 1', 'MPV 2', 'MVP OR'],
		this will map to: ['MPV 1', 'MPV 2', 'MPV 3']
		but if you passed all three separately: ['MPV 1'], ['MPV 2'], ['MVP OR'],
		you would end up with 2 'MPV 1's: ['MPV 1'], ['MPV 2'], ['MVP 1'],
		
	The above example shows that the algorithm tries to set the numbers of teams
	with no numbers. the numbers assigned to these will be relative to the other
	projects passed in. That is why you will ALMOST ALWAYS WASNT TO PASS IN ALL
	PROJECTS OF A TRAIN AT ONCE!
*/
(function(){
	var Ext = window.Ext4 || window.Ext;

	Ext.define('Intel.lib.mixin.HorizontalTeamTypes', {
		requires:['Intel.lib.IntelRallyApp'],
		
		_getHorizontalTeamTypeInfo: function(projectRecord){
			var me=this,
				scrumName = projectRecord.data.Name.split('-')[0].replace(/\(.*\)/g, '').trim(),
				scrumTeamType = scrumName.split(/\d/)[0].trim(),
				number = (scrumTeamType === scrumName ? 1 : parseInt(scrumName.split(scrumTeamType)[1], 10)),
				notInHorizontalObject = {
					projectRecord: projectRecord,
					horizontal:null, 
					teamType:scrumTeamType,
					teamTypeComponents: [],
					number:number
				},
				teamTypeObject = _.reduce(this.HorizontalGroupingConfig.groups, function(result, teamTypes, horizontal){
					if(result) return result; 
					else {
						var teamTypeMatches = _.reduce(teamTypes, function(teamTypeMatches, teamType){
							/**
								If the teamType is in the name of the scrum, add it to teamTypeMatches.
								If there is another teamType already added that is a substring of this teamType,
								remove it from the teamType matches. If the current teamType is a substring of another
								teamType already matches, DO NOT add this teamType to the matched teamTypes
								
								Example:	
									scrum name="ABC - Train"
									teamType options:["AB" "ABC" "ABCD"]
											
									the above scrum name will match "AB" and "ABC", but will only return ["ABC"]
							*/
							if(scrumName.indexOf(teamType) > -1){
								for(var i=teamTypeMatches.length-1;i>=0;--i){
									if(teamTypeMatches[i].indexOf(teamType) > -1) return teamTypeMatches;
									if(teamType.indexOf(teamTypeMatches[i]) > -1) teamTypeMatches.splice(i, 1);
								}
								teamTypeMatches.push(teamType);
							}
							return teamTypeMatches;
						}, []);
						return teamTypeMatches.length ? {
								projectRecord: projectRecord,
								horizontal:horizontal, 
								teamType: teamTypeMatches.sort().join(' '), 
								teamTypeComponents: teamTypeMatches.sort(),
								number:number
							} : 
							null;
					}
				}, null);
			return teamTypeObject || notInHorizontalObject;
		},	
		_resolveTeamTypeInfoConflicts: function(teamTypeInfos, startIndex){
			startIndex = startIndex || 1;
			_.each(_.sortBy(teamTypeInfos, 
				function(teamTypeInfo){ return teamTypeInfo.projectRecord.data.Name; }),
				function(teamTypeInfo, index){ teamTypeInfo.number = index + startIndex; return teamTypeInfo; });
		},
		getAllHorizontalTeamTypeInfos: function(projectRecords){
			var me = this;
			return [].concat.apply([], _.map(_.groupBy(_.map(projectRecords, 
				function(projectRecord){ return me._getHorizontalTeamTypeInfo(projectRecord); }),
				function(teamTypeInfo){ return teamTypeInfo.teamType; }),
				function(teamTypeInfos){
					if(teamTypeInfos.length === 1) return teamTypeInfos; 
					else {
						var teamTypeInfosWithNumber1 = _.filter(teamTypeInfos, function(teamTypeInfo){ return teamTypeInfo.number === 1; });
						if(teamTypeInfosWithNumber1.length > 1){
							var projectsWithoutExplicit1 = _.filter(teamTypeInfosWithNumber1, function(teamTypeInfo){ 
									return teamTypeInfo.projectRecord.data.Name.indexOf('1') === -1; 
								}),
								startIndex = Math.max.apply(Math, _.pluck(teamTypeInfos, 'number')) + 1;
							me._resolveTeamTypeInfoConflicts(projectsWithoutExplicit1, startIndex);
						}
						return teamTypeInfos;
					}
				})
			);
		},
		getHorizontalTeamTypeInfo: function(projectRecord){
			return this._getHorizontalTeamTypeInfo(projectRecord);
		},
		isProjectInHorizontal: function(projectRecord, horizontal){
			return this._getHorizontalTeamTypeInfo(projectRecord).horizontal === horizontal;
		},
		
		_getHorizontalTeamTypeInfoFromProjectName: function(projectName){
			var me=this,
				scrumName = projectName.split('-')[0].replace(/\(.*\)/g, '').trim(),
				scrumTeamType = scrumName.split(/\d/)[0].trim(),
				number = (scrumTeamType === scrumName ? 1 : parseInt(scrumName.split(scrumTeamType)[1], 10)),
				notInHorizontalObject = {
					projectName: projectName,
					horizontal:null, 
					teamType:scrumTeamType,
					teamTypeComponents: [],
					number:number
				},
				teamTypeObject = _.reduce(this.HorizontalGroupingConfig.groups, function(result, teamTypes, horizontal){
					if(result) return result; 
					else {
						var teamTypeMatches = _.reduce(teamTypes, function(teamTypeMatches, teamType){
							/**
								If the teamType is in the name of the scrum, add it to teamTypeMatches.
								If there is another teamType already added that is a substring of this teamType,
								remove it from the teamType matches. If the current teamType is a substring of another
								teamType already matches, DO NOT add this teamType to the matched teamTypes
								
								Example:	
									scrum name="ABC - Train"
									teamType options:["AB" "ABC" "ABCD"]
											
									the above scrum name will match "AB" and "ABC", but will only return ["ABC"]
							*/
							if(scrumName.indexOf(teamType) > -1){
								for(var i=teamTypeMatches.length-1;i>=0;--i){
									if(teamTypeMatches[i].indexOf(teamType) > -1) return teamTypeMatches;
									if(teamType.indexOf(teamTypeMatches[i]) > -1) teamTypeMatches.splice(i, 1);
								}
								teamTypeMatches.push(teamType);
							}
							return teamTypeMatches;
						}, []);
						return teamTypeMatches.length ? {
								projectName: projectName,
								horizontal:horizontal, 
								teamType: teamTypeMatches.sort().join(' '), 
								teamTypeComponents: teamTypeMatches.sort(),
								number:number
							} : 
							null;
					}
				}, null);
			return teamTypeObject || notInHorizontalObject;
		},
		_resolveTeamTypeInfoConflictsFromProjectNames: function(teamTypeInfos, startIndex){
			startIndex = startIndex || 1;
			_.each(_.sortBy(teamTypeInfos, 
				function(teamTypeInfo){ return teamTypeInfo.projectName; }),
				function(teamTypeInfo, index){ teamTypeInfo.number = index + startIndex; return teamTypeInfo; });
		},	
		getAllHorizontalTeamTypeInfosFromProjectNames: function(projectNames){
			var me = this;
			return [].concat.apply([], _.map(_.groupBy(_.map(projectNames, 
				function(projectName){ return me._getHorizontalTeamTypeInfoFromProjectName(projectName); }),
				function(teamTypeInfo){ return teamTypeInfo.teamType; }),
				function(teamTypeInfos){
					if(teamTypeInfos.length === 1) return teamTypeInfos; 
					else {
						var teamTypeInfosWithNumber1 = _.filter(teamTypeInfos, function(teamTypeInfo){ return teamTypeInfo.number === 1; });
						if(teamTypeInfosWithNumber1.length > 1){
							var projectsWithoutExplicit1 = _.filter(teamTypeInfosWithNumber1, function(teamTypeInfo){ 
									return teamTypeInfo.projectName.indexOf('1') === -1; 
								}),
								startIndex = Math.max.apply(Math, _.pluck(teamTypeInfos, 'number')) + 1;
							me._resolveTeamTypeInfoConflictsFromProjectNames(projectsWithoutExplicit1, startIndex);
						}
						return teamTypeInfos;
					}
				})
			);
		},		
		getHorizontalTeamTypeInfoFromProjectName: function(projectName){
			return this._getHorizontalTeamTypeInfoFromProjectName(projectName);
		},
		isProjectNameInHorizontal: function(projectName, horizontal){
			return this._getHorizontalTeamTypeInfoFromProjectName(projectName).horizontal === horizontal;
		},
		
		getAllHorizontalTeamTypeComponents: function(){
			return [].concat.apply([], _.values(this.HorizontalGroupingConfig.groups));
		},
		getAllHorizontals: function(){
			return _.keys(this.HorizontalGroupingConfig.groups);
		},
		teamTypeComponentInWhichHorizontal: function(teamType){
			var me=this;
			return _.find(_.keys(me.HorizontalGroupingConfig.groups), function(hz){ 
				return _.contains(me.HorizontalGroupingConfig.groups[hz], teamType);
			});
		}
	});
}());
