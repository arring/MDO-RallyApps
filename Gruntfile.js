require('shelljs/global');

var path = require('path'),
	util = require('util'),
	format = util.format.bind(util);

module.exports = function(grunt){
	
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-shell-spawn');
	
	grunt.registerMultiTask('appsjshint', 'jshints all apps', function(){
		this.filesSrc.forEach(function(gruntFile){
			cd(grunt.config('cwd'));
			var appDir = path.resolve(path.dirname(gruntFile)),
				appName = require(format('%s/package.json', appDir)).name;
			echo('JShinting ' + appName);
			cd(appDir);
			exec('grunt jshint');
		});
		cd(grunt.config('cwd'));
	});
	grunt.registerMultiTask('test', 'runs all tests for all apps', function(){	
		this.filesSrc.forEach(function(gruntFile){
			cd(grunt.config('cwd'));
			var appDir = path.resolve(path.dirname(gruntFile)),
				appName = require(format('%s/package.json', appDir)).name;
			echo('Testing ' + appName);
			cd(appDir);
			exec('grunt test');
		});
		cd(grunt.config('cwd'));
	});
	grunt.registerTask('build', 'Builds and assembles deploy files', function(){ 
		cd(grunt.config('cwd'));
		exec('node scripts/build');
		cd(grunt.config('cwd'));
	});
	grunt.registerTask('default', ['jshint', 'appsjshint', 'test', 'build']);
	
	grunt.registerMultiTask('init', 'extra stuff for installing', function(){ 
		this.filesSrc.forEach(function(packageJSON){
			cd(grunt.config('cwd'));
			var appDir = path.resolve(path.dirname(packageJSON)),
				appName = require(path.resolve(packageJSON)).name;
			echo('Installing ' + appName);
			cd(appDir);
			exec('npm install');
		});
		cd(grunt.config('cwd'));
		grunt.task.run('shell:install_selenium_standalone');
	});
	
	grunt.initConfig({
		cwd: process.cwd(),
		pkg: grunt.file.readJSON('package.json'),
		jshint: {
			base: ['scripts/**/*.js', 'Gruntfile.js'],
		}
		appsjshint: {
			apps: ['src/**/Gruntfile.js', '!src/**/bower_components/**', '!src/**/node_modules/**']
		},
		test:{
			apps: ['src/**/Gruntfile.js', '!src/**/bower_components/**', '!src/**/node_modules/**']
		},
		installApps:{
			apps: ['src/**/package.json', '!src/**/bower_components/**', '!src/**/node_modules/**']
		}
		shell:{
			install_selenium_standalone: {
				command: 'selenium-standalone install',
				options: {
					async: false
				}
			}
		},
	});
};

