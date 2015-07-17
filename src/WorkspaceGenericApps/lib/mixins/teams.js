(function() {
	var Ext = window.Ext4 || window.Ext;
	
	var teamTypes = [
		'Analog DV', 'Array', 'BI', 'Binsplit',
		'Class TPI', 'CLK', 'EVG','Func Module',
		'Fuse', 'GT Module', 'HTD', 'MIO', 'MIO CLK',
		'MPV', 'PT', 'QRE Qual', 'Reliability', 'Scan',
		'SIO', 'SIO MIO CLK', 'Sort Class TPI', 'Sort TD',
		'Sort TPI', 'TVPV', 'Yield PHI'
	],
		// In English: matches a team type, maybe a number, a hyphen, a train name, and maybe a suffixed parenthetical
		// Remembers the team type, associated keywords, the number or '', and the train name
		teamInfoRegExp = /^([A-Za-z\s\-]*[A-Za-z])\s+(?:\([A-Za-z\d\s]+\))?\s*(\d*)\s*-\s+([A-Za-z\s]*[A-Za-z]).*$/,
		teamRegExp = /^[A-Za-z ]*[A-Za-z](?:\s\d)?\s-\s.+$/,
		keywordSplitRegExp = /[\s\-]+/;
	
	Ext.define('Teams', {
		_getTeamInfo: function(project) {
			var results = teamInfoRegExp.exec(project.data.Name),
				team = {};
			if (!results) {
				return null;
			}
			team.FullName = project.data.Name;
			team.Type = results[1];
			team.KeyWords = results[1].split(keywordSplitRegExp).concat('');
			team.Number = (results[2] !== '' ? parseInt(results[2], 10) : 1);
			team.Train = results[3];
			team.Name = team.Type + ' ' + team.Number;
			return team;
		},
		
		_createTeamInfoMap: function(teams) {
			var me = this,
				map = {},
				team;
			for (var i in teams) {
				map[teams[i].data.ObjectID] = {
					project: teams[i],
					info: me._getTeamInfo(teams[i])
				};
			}
			return map;
		},
		
		_isValidTeamProjectName: function(project) {
			return teamRegExp.test(project.data.Name) && project.data.Children.Count === 0;
		},
		
		_isValidTeamType: function(type) {
			return _.includes(teamTypes, type);
		},
		
		_filterProjectsByTeamType: function(projects, type) {
			var me = this,
				filter = new RegExp((!type || type === '' || type === 'All') ? '.*' : type),
				filteredProjects = {};
			for (var i in projects) {
				if (filter.test(projects[i].data.Name)) {
					filteredProjects[projects[i].data.ObjectID] = projects[i];
				}
			}
			return filteredProjects;
		},
		
		filterMapByTeamType: function(map, type) {
			var me = this,
				filter = new RegExp((!type || type === '' || type === 'All') ? '.*' : type),
				filteredProjects = {};
			for (var i in map) {
				if (filter.test(map[i].project.data.Name)) {
					filteredProjects[map[i].project.data.ObjectID] = map[i].project;
				}
			}
			return filteredProjects;
		}
	});
})();
