/**
	This mixin exposes a few public methods that allow the caller to easily get 
	info about the horizontal and teamTypeInfo for a list of projects.
	
	The reason that you should call getAllHorizontalTeamTypeInfos with multiple 
	projects instead of 1 project is because this allows the 'number' field of
	the teamTypeInfo to be set correctly.
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
				scrumName = projectRecord.data.Name.split('-')[0].trim(),
				scrumTeamType = scrumName.split(/\d/)[0].trim(),
				number = (scrumTeamType === scrumName ? 1 : parseInt(scrumName.split(scrumTeamType)[1], 10)),
				notInHorizontalObject = {
					projectRecord: projectRecord,
					horizontal:null, 
					teamType:scrumTeamType, 
					number:number
				},
				teamTypeObject = _.reduce(this.HorizontalGroupingConfig.groups, function(result, teamTypes, horizontal){
					if(result) return result; 
					else {
						var teamTypeMatches = _.reduce(teamTypes, function(teamTypeMatches, teamType){
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
		isProjectInHorizontal: function(projectRecord, horizontal){
			return this._getHorizontalTeamTypeInfo(projectRecord).horizontal === horizontal;
		},
		getAllHorizontalTeamTypes: function(){
			return [].concat.apply([], _.values(this.HorizontalGroupingConfig.groups));
		},
		getAllHorizontals: function(){
			return _.keys(this.HorizontalGroupingConfig.groups);
		}
	});
}());
