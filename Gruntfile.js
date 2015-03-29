require('shelljs/global');

var path = require('path'),
	util = require('util'),
	format = util.format.bind(util);

module.exports = function(grunt){
	grunt.initConfig({
		cwd: process.cwd(),
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			base: ['scripts/**/*.js', 'Gruntfile.js']
		},
		appsjshint:{
			apps: ['src/**/Gruntfile.js', '!src/**/bower_components/**', '!src/**/node_modules/**']
		},
		test:{
			all: ['src/**/Gruntfile.js', '!src/**/bower_components/**', '!src/**/node_modules/**']
		},
		init:{
			all: ['src/**/package.json', '!src/**/bower_components/**', '!src/**/node_modules/**']
		}
	});
	
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.registerMultiTask('appsjshint', function(){
		this.filesSrc.forEach(function(gruntFile){
			cd(grunt.config('cwd'));
			var appDir = path.resolve(path.dirname(gruntFile)),
				appName = require(format('%s/config.json', appDir)).name;
			echo('JShinting ' + appName);
			cd(appDir);
			exec('grunt jshint');
		});
		cd(grunt.config('cwd'));
	});
	grunt.registerMultiTask('test', function(){	
		this.filesSrc.forEach(function(gruntFile){
			cd(grunt.config('cwd'));
			var appDir = path.resolve(path.dirname(gruntFile)),
				appName = require(format('%s/config.json', appDir)).name;
			echo('Testing ' + appName);
			cd(appDir);
			exec('grunt jasmine');
		});
		cd(grunt.config('cwd'));
	});
	grunt.registerTask('build', function(){ 
		cd(grunt.config('cwd'));
		exec('node scripts/build');
	});
	grunt.registerTask('default', ['jshint', 'appsjshint', 'test', 'build']);
	
	grunt.registerMultiTask('init', function(){ 
		this.filesSrc.forEach(function(packageJSON){
			cd(grunt.config('cwd'));
			var appDir = path.resolve(path.dirname(packageJSON)),
				appName = require(format('%s/config.json', appDir)).name;
			echo('Installing ' + appName);
			cd(appDir);
			exec('npm install');
		});
		cd(grunt.config('cwd'));
	});
};

