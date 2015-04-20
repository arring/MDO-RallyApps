require('shelljs/global');
module.exports = (function(){
	var path = require('path'),
		testApiKeyPath = path.resolve(__dirname, 'rally-test-apikey'),
		testUsernamePath = path.resolve(__dirname, 'rally-test-username'),
		testPasswordPath = path.resolve(__dirname, 'rally-test-password'),
		testWorkspaceOIDPath = path.resolve(__dirname, 'rally-test-workspaceOID');
	
	var testApiKey = test('-f', testApiKeyPath) ? cat(testApiKeyPath) : '',
		testUsername = test('-f', testUsernamePath) ? cat(testUsernamePath) : '',
		testPassword = test('-f', testPasswordPath) ? cat(testPasswordPath) : '',
		testWorkspaceOID = test('-f', testWorkspaceOIDPath) ? cat(testWorkspaceOIDPath) : '';

	return {
		testApiKey: testApiKey,
		testWorkspaceOID: testWorkspaceOID,
		testUsername: testUsername,
		testPassword: testPassword
	};
}());
