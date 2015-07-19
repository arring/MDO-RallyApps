DO NOT USE THIS YET. NOT IMPLEMENTED

// /** 
	// SUMMARY: 
		// for each release we want to be able to get
			// - team commits for a particular team for one train
			// - team commits for a particular team across all trains
			// - team commits for a particular train for all teams
			// - all team commits in a release
			
		// each team commit is a 1 to 1 mapping for portfolioitem/project
			// - needs to contain both the portoflioitme and project in id
			
		// therefore: the TeamCommitID should be in this format
			// teamcommit-<release name>-<scrumgroupid>-<portfolioitem id>-<project id>
			
		// The teamcommit 'value' is obfuscated because Rally strips html characters from the text, which then breaks JSON. it is obfuscated by using:
		// btoa(encodeURIComponent(JSON.stringify(teamCommitJSON, null, '\t')))
		
		// this file does not handle schema or validation things for risks -- it only handles the CRUD interface for them. It uses the TeamCommitModel object 
		// to do validation
	
	// DEPENDENCIES: 
		// - Intel.SAFe.lib.model.TeamCommit
// */
// (function(){
	// var Ext = window.Ext4 || window.Ext,
		// KeyValueDb = Intel.lib.resource.KeyValueDb,
		// TeamCommitModel = Intel.SAFe.lib.model.TeamCommit;

	// Ext.define('Intel.SAFe.lib.resource.TeamCommitDb', {
		// singleton: true,
		
		// /** 
			// private function. returns error if missing or invalid fields, else returns pruned teamCommitJSON
			// returns Promise(teamCommitJSON)
		// */
		// _validateTeamCommit: function(teamCommitJSON){
			// var model = new TeamCommitModel(teamCommitJSON),
				// errors = model.validate();
			// if(errors.length) return Q.reject(_.map(errors.getRange(), function(error){ return error.field + ' ' + error.message; }));
			// else return Q(model.data);
		// },
		
		// _getPortfolioItem: function(
		// _updatePortfolioItem: function(portfolioItem, teamCommitJSON){
			// (PortfolioItemType.Ordinal%20=%200)
		// },
		
		// /** 
			// You must call this before you can use it. Not using constructor because we need a promise to be returned.
			// returns Promise()
		// */
		// initialize: function(){
			// return KeyValueDb.initialize();
		// },
		
		// /** returns Promise(teamCommitJSON) */
		// get: function(teamCommitID){
			// if(!TeamCommitModel.isValidTeamCommitID(teamCommitID)) return Q.reject('invalid TeamCommitID');
			// return KeyValueDb.getKeyValuePair(teamCommitID).then(function(kvPair){
				// try { return kvPair ? _.merge(JSON.parse(decodeURIComponent(atob(kvPair.value))), {TeamCommitID: kvPair.key}) : null; }
				// catch(e){ return Q.reject(e); }
			// });
		// },
		
		// /** 
			// currently does not have ability to filter just by project, since implementation is still backed by custom fields on 
			// portfolio items. So we can't say: give me all team commits for project 'X' in the entire workspace.
			// returns Promise( [teamCommitJSON] ) 
		// */
		// query: function(opts){
			// var me = this,
				// filter = null,
				// context = { 
					// workspace: Rally.environment.getContext().getWorkspace()._ref,
					// project: null
				// };
			// if(opts.releaseName) filter = Ext.create('Ext.data.wsapi.Filter', {property:'Release.Name', value: opts.releaseName});
			// if(opts.scrumGroupOID) context = { project: '/project/' + opts.scrumGroupOID };
			// if(opts.portfolioItemOID){
				// var newFilter = Ext.create('Ext.data.wsapi.Filter', {property:'ObjectID', value: opts.portfolioItemOID});
				// filter = filter ? filter.and(newFilter) : newFilter;
			// }
			// if(opts.projectOID){
				// var newFilter = Ext.create('Ext.data.wsapi.Filter', {property:'ObjectID', value: opts.portfolioItemOID});
				// filter = filter ? filter.and(newFilter) : newFilter;
			// }
			// return me._queryPortfolioItems(context, filter).then(function(portfolioItems){
				// var teamCommits = [];
				// _.each(portfolioItems, function(portfolioItem){
					// var newTeamCommits = {};
					// try { newTeamCommits = JSON.parse(decodeURIComponent(atob(portfolioItem.data.c_TeamCommits))); }
					// catch(e){ newTeamCommits = {}; }
					// _.each(newTeamCommits, function(data, projectOID){
						// //validate/clean data here and add to teamCommits[]
					// });
				// });
				// if(opts.projectOID){
					// var newFilter = Ext.create('Ext.data.wsapi.Filter', {property:'ObjectID', value: opts.portfolioItemOID});
					// filter = filter ? filter.and(newFilter) : newFilter;
				// }
			// });
		// },
		
		// btoa(encodeURIComponent(JSON.stringify(riskJSON, null, '\t')));		
				// return KeyValueDb.createKeyValuePair(riskID, riskJSONString).then(function(kvPair){
					// try { return _.merge(JSON.parse(decodeURIComponent(atob(kvPair.value))),
					
		// /** 
			// validates the teamCommitJSON and then creates risk if it is unique
			// returns Promise(teamCommitJSON) 
		// */
		// create: function(teamCommitID, teamCommitJSON){
			// if(!TeamCommitModel.isValidTeamCommitID(teamCommitID)) return Q.reject('invalid TeamCommitID');
			// return this._validateTeamCommit(_.merge(teamCommitJSON, {TeamCommitID: teamCommitID})).then(function(teamCommitJSON){
				// var teamCommitJSONString = btoa(encodeURIComponent(JSON.stringify(teamCommitJSON, null, '\t')));		
				// return KeyValueDb.createKeyValuePair(teamCommitID, teamCommitJSONString).then(function(kvPair){
					// try { return _.merge(JSON.parse(decodeURIComponent(atob(kvPair.value))), {TeamCommitID: kvPair.key}); }
					// catch(e){ return Q.reject(e); }
				// });
			// });
		// },
		
		// /** 
			// validates the teamCommitJSON and then updates risk if it exists
			// returns Promise(teamCommitJSON) 
		// */
		// update: function(teamCommitID, teamCommitJSON){
			// if(!TeamCommitModel.isValidTeamCommitID(teamCommitID)) return Q.reject('invalid TeamCommitID');
			// return this._validateTeamCommit(_.merge(teamCommitJSON, {TeamCommitID: teamCommitID})).then(function(teamCommitJSON){
				// var teamCommitJSONString = btoa(encodeURIComponent(JSON.stringify(teamCommitJSON, null, '\t')));	
				// return KeyValueDb.updateKeyValuePair(teamCommitID, teamCommitJSONString).then(function(kvPair){
					// try { return _.merge(JSON.parse(decodeURIComponent(atob(kvPair.value))), {TeamCommitID: kvPair.key}); }
					// catch(e){ return Q.reject(e); }
				// });
			// });
		// },
		
		// /** returns Promise(void) */
		// 'delete': function(teamCommitID){
			// if(!TeamCommitModel.isValidTeamCommitID(teamCommitID)) return Q.reject('invalid TeamCommitID');
			// return KeyValueDb.deleteKeyValuePair(teamCommitID);
		// }
	// });
// }());