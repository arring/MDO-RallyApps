DO NOT USE YET. DB NOT IMPLEMENTED

// /**
	// The Team Commit Model to be used as a base model for all SAFe Apps.
	// Validation should always be handled by this model as well.
	
	// This file is the source-of-truth for all things related to the schema and validation of Team Commits
// */
// (function(){
	// var Ext = window.Ext4 || window.Ext,
		// TEAM_COMMIT_KEY_PREFIX = 'teamcommit-',
		// COMMITMENT_OPTIONS = ['Undecided', 'N/A', 'Committed', 'Not Committed'],
		// INVALID_MESSAGE = 'is invalid';
	
	// /*************************** TeamCommit Custom Validators **********************************/
	// Ext.data.validations.TeamCommitIDMessage =                    INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitReleaseNameMessage =           INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitPortfolioItemObjectIDMessage = INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitProjectObjectIDMessage =       INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitExpectedMessage =              INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitCommitmentMessage =            INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitObjectiveMessage =             INVALID_MESSAGE;
	// Ext.data.validations.TeamCommitCECommentMessage =             INVALID_MESSAGE;
	
	// Ext.data.validations.TeamCommitID = function(config, value){
		// return typeof value === 'string' && new RegExp('^' + TEAM_COMMIT_KEY_PREFIX).test(value);
	// };
	// Ext.data.validations.TeamCommitReleaseName = function(config, value){
		// return typeof value === 'string' && value.length > 0;
	// };
	// Ext.data.validations.TeamCommitPortfolioItemObjectID = function(config, value){
		// return typeof value === 'number' && value > 0;
	// };
	// Ext.data.validations.TeamCommitProjectObjectID = function(config, value){
		// return typeof value === 'number' && value > 0;
	// };
	// Ext.data.validations.TeamCommitExpected = function(config, value){
		// return typeof value === 'boolean';
	// };
	// Ext.data.validations.TeamCommitCommitment = function(config, value){
		// return COMMITMENT_OPTIONS.indexOf(value) > -1;
	// };
	// Ext.data.validations.TeamCommitObjective = function(config, value){
		// return typeof value === 'string';
	// };
	// Ext.data.validations.TeamCommitCEComment = function(config, value){
		// return typeof value === 'string';
	// };

	// /*************************** TeamCommit Model Definition **********************************/
	// Ext.define('Intel.SAFe.lib.model.TeamCommit', {
		// extend: 'Ext.data.Model',
		// idProperty: 'TeamCommitID',
		// fields: [
			// {name: 'TeamCommitID', type:'auto'},
			// {name: 'ReleaseName', type:'auto'},
			// {name: 'PortfolioItemObjectID', type: 'auto'},
			// {name: 'ProjectObjectID', type:'auto'},
			// {name: 'Expected', type: 'auto'},
			// {name: 'Commitment', type: 'auto'},	
			// {name: 'Objective', type: 'auto'},
			// {name: 'CEComment', type: 'auto'}
		// ],
		// validations: [
			// {type: 'TeamCommitID', field: 'TeamCommitID'},
			// {type: 'TeamCommitReleaseName', field: 'ReleaseName'},
			// {type: 'TeamCommitPortfolioItemObjectID', field: 'PortfolioItemObjectID'},
			// {type: 'TeamCommitProjectObjectID', field: 'ProjectObjectID'},
			// {type: 'TeamCommitExpected', field: 'Expected'},
			// {type: 'TeamCommitCommitment', field: 'Commitment'},
			// {type: 'TeamCommitObjective', field: 'Objective'},
			// {type: 'TeamCommitCEComment', field: 'CEComment'},
		// ],
		// statics:{
			// isValidTeamCommitID: function(teamCommitID){
				// return typeof teamCommitID === 'string' && teamCommitID.indexOf(TEAM_COMMIT_KEY_PREFIX) === 0;
			// },
			// getCommitmentOptions: function(){
				// return COMMITMENT_OPTIONS.slice();
			// }
		// }
	// });
// }());