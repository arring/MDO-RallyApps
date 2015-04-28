//we would use this file to initialize the projects/users/trains/userstories, features, etc.... it would be a large file
//but alas! we cannot create projects through wsapi so this is a deadend.
module.exports = function(){
	var util = require('util'),
		HTTP_PROXY = process.env.HTTP_PROXY,
		API_KEY = process.env.API_KEY,
		WORKSPACE_OID = process.env.WORKSPACE_OID,
		
		Q = require('q'),
		rally = require('rally'),
		queryUtils = rally.util.query,
		refUtils = rally.util.ref,
		restApi = rally({
			apiKey: API_KEY,
			requestOptions: {
				jar: true,
				proxy: HTTP_PROXY || undefined,
				pool: { maxSockets:2000 }
			}
		}),
		
		workspaceRef = '/workspace/' + WORKSPACE_OID;
		
	
	if(!WORKSPACE_OID) throw new Error('Invalid WORKSPACE_OID');
	if(!API_KEY) throw new Error('Invalid API_KEY');

	return restApi.query({
		type:'Project',
		limit:1,
		fetch:['Name', 'ObjectID'],
		scope: { workspace: workspaceRef },
		query: queryUtils.where('Name', '=', 'Testing ART')
	})
	.then(function(result){
		console.log('h0', result);
		if(result.Results.length) return result.Results[0];
		else {
		console.log('h22');
			return restApi.create({
				type:'Project',
				fetch:['Name', 'ObjectID'],
				scope: { workspace:workspaceRef },
				data: {
					Name: 'Testing ART',
					Workspace: workspaceRef,
					State: 'Open'
				}
			})
			.then(function(result){ console.log('wii'); return result.Object; });
		}
	})
	.then(function(train){
		console.log('hi');
		console.log(JSON.stringify(train, null, '  '));
	})
	.fail(function(error){
		throw new Error(error);
	});
};
	