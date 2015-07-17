/*
 *	Utility functions relating to horizontal groups
 */
 (function(){
	var Ext = window.Ext4 || window.Ext;

	var HorizontalGroups = {
		ACD: ['CLK 1', 'MIO 1', 'MIO CLK 1', 'CLK MIO 1' /*Incorrect scrum name in Rally*/, 'PT 1', 'PT 2', 'SIO 1', 'SIO 2', 'SIO MIO CLK 1', 'MIO-SIO 2'/*D.N.E. in TCD*/],
		DCD: ['Array 1', 'Array 2', 'Func Module 1', 'Func Module 2', 'GT Module 1', 'HTD 1', 'Scan 1', 'Scan 2'],
		MPV: ['MPV 1', 'MPV 2', 'MPV 3'],
		PHI: ['Binsplit 1', 'Binsplit 2', 'Yield PHI 1'],
		QRE: ['BI 1', 'Reliability 1'],
		SCI: ['Fuse 1', 'Fuse 2', 'TVPV 1', 'TVPV 2'],
		TPI: ['Class TPI 1', 'Sort Class TPI 1', 'Sort Class TPI 2', 'Sort Class TPI 3', 'Sort Class TPI 4', 'Sort Class TPI 5', 'Sort TD 1', 'Sort TPI 1'],
		// The 1's are added for consistency with the other naming conventions
		Other: ['Analog DV 1', 'EVG 1', 'QRE Qual 1']
	};
	var TeamToGroupMap = {
		'CLK 1': 'ACD', 'MIO 1': 'ACD', 'MIO CLK 1': 'ACD', 'CLK MIO 1': 'ACD' /*Incorrect scrum name in Rally*/, 'PT 1': 'ACD', 'PT 2': 'ACD', 'SIO 1': 'ACD', 'SIO 2': 'ACD', 'SIO MIO CLK 1': 'ACD', 'MIO-SIO 2': 'ACD'/*D.N.E in TCD*/,
		'Array 1': 'DCD', 'Array 2': 'DCD', 'Func Module 1': 'DCD', 'Func Module 2': 'DCD', 'GT Module 1': 'DCD', 'HTD 1': 'DCD', 'Scan 1': 'DCD', 'Scan 2': 'DCD',
		'MPV 1': 'MPV', 'MPV 2': 'MPV', 'MPV 3': 'MPV',
		'Binsplit 1': 'PHI', 'Binsplit 2': 'PHI', 'Yield PHI 1': 'PHI',
		'BI 1': 'QRE', 'Reliability 1': 'QRE',
		'Fuse 1': 'SCI', 'Fuse 2': 'SCI', 'TVPV 1': 'SCI', 'TVPV 2': 'SCI',
		'Class TPI 1': 'TPI', 'Sort Class TPI 1': 'TPI', 'Sort Class TPI 2': 'TPI', 'Sort Class TPI 3': 'TPI', 'Sort Class TPI 4': 'TPI', 'Sort Class TPI 5': 'TPI', 'Sort TD 1': 'TPI', 'Sort TPI 1': 'TPI',
		'Analog DV 1': 'Other', 'EVG 1': 'Other', 'QRE Qual 1': 'Other'
	};

	Ext.define('HorizontalGroups', {
		requires: ['Teams'],
	
		_getHorizontalGroups: function() {
			return HorizontalGroups;
		},
		
		_getAllTeams: function() {
			teams = [];
			for (var i in HorizontalGroups) {
				teams = teams.concat(HorizontalGroups[i]);
			}
			return teams;
		},
		
		_isInGroup: function(project, group, info) {
			var me = this,
				team = info || me._getTeamInfo(project);
			// return !!_.find(HorizontalGroups[group], function(team) {return team === teamNameAndNumber;});
			return (TeamToGroupMap[team.Name] === group);
		},
		
		_inWhichGroup: function(project) {
			var team = me._getTeamInfo(project),
				name = team.Type + ' ' + team.Number,
				compareFn = function(n) {return n === name;};
			for (var i in HorizontalGroups) {
				if (_.find(HorizontalGroups[i], compareFn)) {
					return i;
				}
			}
		},
		
		_filterProjectsByHorizontalGroup: function(projects, group) {
			var me = this,
				filteredProjects = {};
			if (!group || group === 'All' || group === '') {
				return projects;
			}
			else {
				for (var i in projects) {
					if (me._isInGroup(projects[i], group)) {
						filteredProjects[projects[i].data.ObjectID] = projects[i];
					}
				}
				return filteredProjects;
			}
		},
		
		_filterMapByHorizontalGroup: function(map, group) {
			var me = this,
				filteredProjects = {};
			if (!group || group === 'All' || group === '') {
				for (var j in map) {
					filteredProjects[map[j].project.data.ObjectID] = map[j].project;
				}
			}
			else {
				for (var i in map) {
					if (me._isInGroup(map[i].project, group, map[i].info)) {
						filteredProjects[map[i].project.data.ObjectID] = map[i].project;
					}
				}
			}
			return filteredProjects;
		},
		
		_loadHorizontalGroup: function(group) {
			return me._loadAllLeafProjects().then(function (projects) {
				return me._filterProjectsByHorizontalGroup(projects, group);
			});
		},
		
		_loadAllHorizontalGroups: function() {
			return me._loadAllLeafProjects().then(function(projects) {
				var groupedProjects = {
					ACD: {},
					DCD: {},
					MPV: {},
					PHI: {},
					QRE: {},
					SCI: {},
					TPI: {},
					Other: {}
				};
				for (var i in projects) {
					groupedProjects[me._inWhichGroup(projects[i])] = projects[i];
				}
				return groupedProjects;
			});
		}
		
	});
}());
