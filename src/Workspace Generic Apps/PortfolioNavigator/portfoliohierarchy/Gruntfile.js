/** 
	COPY AND PASTE THIS FILE INTO YOUR RALLY APP. ALSO COPY/PASTE THE JASMINE.TMPL FILE 
	INTO YOUR PROJECT'S TEST DIRECTORY 
**/
module.exports = function(grunt){
	var path = require('path');
	
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		config: grunt.file.readJSON('config.json'),
		jasmine: {
			dev: {
				src: "<%= config.javascript %>",
				options: {
					template: 'test/jasmine.tmpl',
					specs: ["test/**/*.js"],
					helpers: [],
					styles: "<%= config.css %>",
					vendor: ['<%= config.server %>/apps/<%= config.sdk %>/sdk-debug.js'],
				}
			}
		},
		jshint:{
			app: {
				src:["<%= config.javascript %>"],
				filter: function(filepath){
					return (grunt.config('config').ignoreJSHint || [])
						.map(function(file){ return path.normalize(file); })
						.indexOf(filepath) === -1;
				}
			},
			test: ['Gruntfile.js', 'test/**/*.js']
		}
	});
	
	grunt.loadNpmTasks('grunt-contrib-jasmine');
	grunt.loadNpmTasks('grunt-contrib-jshint');
	
	grunt.registerTask('test', ['jshint', 'jasmine']);
	grunt.registerTask('default', ['test']);
};

