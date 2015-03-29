var fs = require('fs'),
	config = require('./config.json'),
	_ = require('lodash'),
	rally = require('rally'),
	restApi = rally({
		apiKey: config.apiKey,
		requestOptions: {
			proxy: config.proxy
		}
	});
restApi.query({
	type:'Project',
	limit:Infinity,
	fetch:['ObjectID', 'Name'],
	scope:{
		workspace: config.workspace
	}
}, function(err, result){
	var map = _.reduce(result.Results, function(map, p){
		map[p.Name] = p.ObjectID;
		return map;
	}, {});
	fs.writeFileSync('output.json', JSON.stringify(map, null, '  '));
	console.log('data is in file: output.json');
});
