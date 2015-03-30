/** 
	COPY AND PASTE THIS FILE INTO YOUR RALLY APP. ALSO COPY/PASTE THE JASMINE.TMPL FILE 
	INTO YOUR PROJECT'S TEST DIRECTORY 
**/
module.exports = function(grunt){
	var path = require('path');
	
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		jasmine: {
			dev: {
				src: ["./**/*.js"],
				filter: function(filePath){
					return !filePath.match(/^node_modules/) && 
						!filePath.match(/Gruntfile/) &&
						!filePath.match(/^test/);
				},
				options: {
					template: 'test/jasmine.tmpl',
					specs: ["test/**/*.js"],
					helpers: [],
					styles: ["css/**/*.css"],
					vendor: ['https://rally1.rallydev.com/apps/2.0/sdk-debug.js'],
				}
			}
		},
		jshint:{
			app: {
				src: ["./**/*.js"],
				filter: function(filePath){
					return !filePath.match(/^node_modules/) && 
						!filePath.match(/Gruntfile/) &&
						!filePath.match(/^test/);
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

