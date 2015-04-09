require('shelljs/global');
module.exports = (function(){
	var path = require('path'),
		apiKeyPath = path.resolve(__dirname, 'rally-apikey'),
		testingWorkspaceOIDPath = path.resolve(__dirname, 'rally-testing-workspaceOID');
	
	var apiKey = test('-f', apiKeyPath) ? cat(apiKeyPath) : '',
		apiKey = test('-f', testingWorkspaceOIDPath) ? cat(testingWorkspaceOIDPath) : '';

	return {
		apiKey:apiKey,
		testingWorkspaceOID:testingWorkspaceOIDPath
	};
}());
