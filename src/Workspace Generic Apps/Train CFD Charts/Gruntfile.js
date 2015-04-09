module.exports = function(grunt){
	require('load-grunt-plugins-from-parent')(grunt);
	
	var path = require('path'),
		e2eServerPort = 8001,
		unitServerPort = 8002,
		isWin32 = (process.platform === 'win32'),
		unitSpecRunnerFile = getUnitSpecRunnerFile();
	
	function getSrcBase(){ //get the srcBase directory for the app
		var curdir = path.normalize(__dirname);
		while(path.basename(curdir) != 'src') curdir = path.dirname(curdir);
		return curdir + '/';
	}
	function getSrcBaseRelative(){ //get the relative path from srcBase to current directory
		return path.relative(getSrcBase(), path.normalize(__dirname)) + '/';
	}
	function getE2E_URL(){
		return 'http://localhost:' + e2eServerPort + '/' + getSrcBaseRelative() + '/App-Debug.html';
	}
	function getUnitSpecRunnerFile(){
		return getSrcBaseRelative() + '/.tmp/_unitSpecRunner.html';
	}
	
	/*********************************************************************************************************************************************************************/
	grunt.loadNpmTasksFromParent('grunt-shell-spawn');
	grunt.loadNpmTasksFromParent('grunt-contrib-jshint');
	grunt.loadNpmTasksFromParent('grunt-mkdir');
	grunt.loadNpmTasksFromParent('grunt-contrib-clean');
	grunt.loadNpmTasksFromParent('grunt-contrib-connect');
	grunt.loadNpmTasksFromParent('grunt-contrib-jasmine');
	grunt.loadNpmTasksFromParent('grunt-webdriver-jasmine2-runner');
	grunt.loadNpmTasksFromParent('grunt-jasmine-node');
	
	grunt.registerMultiTask('__browser', 		'sets the BROWSER_NAME env', 							function(browser){ process.env.BROWSER_NAME = browser; });
	grunt.registerTask('__e2eEnv', 					'sets the E2E_URL env', 									function(){ process.env.E2E_URL = getE2E_URL() });
	grunt.registerTask('noop', 							'no-op', 																	function(){});
	
	grunt.registerTask('test:e2e:__init__', 'private. sets up e2e tests', 						['shell:start_selenium_standalone', 'connect:e2e', '__e2eEnv']);
	grunt.registerTask('test:e2e:__end__', 	'private. tears down e2e tests', 					['shell:start_selenium_standalone:kill', 'clean']);
	grunt.registerTask('test:e2e:fast',			'runs e2e tests in phantomjs', 						['test:e2e:__init__', '__browser:phantomjs', 'jasmine_node','test:e2e:__end__']);
	grunt.registerTask('test:e2e:firefox', 	'runs e2e tests in firefox', 							['test:e2e:__init__', '__browser:firefox', 'jasmine_node','test:e2e:__end__']);
	grunt.registerTask('test:e2e:chrome', 	'runs e2e tests in chrome', 							['test:e2e:__init__', '__browser:chrome', 'jasmine_node','test:e2e:__end__']);
	if(isWin32)
	grunt.registerTask('test:e2e:ie', 			'runs e2e tests in ie', 									['test:e2e:__init__', '__browser:internet explorer', 'jasmine_node','test:e2e:__end__']);
	grunt.registerTask('test:e2e', 					'runs e2e tests in all browsers',				 	['test:e2e:firefox', 'test:e2e:chrome',(isWin32 ? 'test:e2e:ie' : 'noop')]);

	grunt.registerTask('test:unit:__init__','private. sets up unit tests', 						['mkdir:tmp', 'jasmine:unit:build', 'shell:start_selenium_standalone', 'connect:unit']);
	grunt.registerTask('test:unit:__end__', 'private. tears down unit tests', 				['shell:start_selenium_standalone:kill', 'clean']);
	grunt.registerTask('test:unit:fast',		'runs unit tests in phantomjs', 					['test:unit:__init__', '__browser:phantomjs', 'webdriver_jasmine_runner','test:unit:__end__']);
	grunt.registerTask('test:unit:firefox', 'runs unit tests in firefox', 						['test:unit:__init__', '__browser:firefox', 'webdriver_jasmine_runner','test:unit:__end__']);
	grunt.registerTask('test:unit:chrome', 	'runs unit tests in chrome', 							['test:unit:__init__', '__browser:chrome', 'webdriver_jasmine_runner','test:unit:__end__']);
	if(isWin32)
	grunt.registerTask('test:unit:ie', 			'runs unit tests in ie', 									['test:unit:__init__', '__browser:internet explorer', 'webdriver_jasmine_runner','test:unit:__end__']);
	grunt.registerTask('test:unit', 				'runs unit tests in all browsers',				['test:unit:firefox', 'test:unit:chrome', (isWin32 ? 'test:unit:ie' : 'noop')]);

	grunt.registerTask('test', 							'runs unit and e2e tests in the browsers',['jshint', 'test:unit', 'test:e2e']);
	grunt.registerTask('test:fast', 				'runs unit and e2e tests in phantomjs', 	['jshint', 'test:unit:fast', 'test:e2e:fast']);
	
	grunt.registerTask('default', 					'jshint, test, build', 										['test:fast', 'shell:rab']);
	
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		config: grunt.file.readJSON('config.json'),
		browserName: function(){ return process.env.BROWSER_NAME || 'phantomjs'; },
		shell:{
			start_selenium_standalone: {
				command: "selenium-standalone start",
				options: { async: true }
			}
			rab: { 
				command: 'rally-app-builder' 
			}
		},
		jasmine_node: { 
			e2e: ["test/e2e/specs/**/*.js"]
		},
		webdriver_jasmine_runner: {
			unit: {
        options: {
					testServer:'localhost',
					testServerPort:unitServerPort,
					seleniumServerHost:'localhost',
					seleniumServerPort:4444,
					testFile: unitSpecRunnerFile
					browser: '<%= browserName() %>'
				}
			}
		},
		jasmine: {
			options: {
				template: 'test/unit/jasmine.tmpl',
				styles: "<%= config.css %>",
				vendor: ['https://rally1.rallydev.com/apps/<%= config.sdk %>/sdk-debug.js']
			},
			unit: {
				src: "<%= config.javascript %>",
				options: {
					outfile: '_unitSpecRunner.html',
					specs: ["test/unit/specs/**/*.js"],
					helpers: ["test/common/helpers/**/*.js", "test/unit/helpers/**/*.js"]
				}
			}
		},
		connect: {
			e2e: {
				options: {
					base: getSrcBase(),
					port: e2eServerPort
				}
			},
			unit: {
				options: {
					base: getSrcBase(),
					port: unitServerPort
				}
			}
		},
		mkdir: {
			tmp: {
				create: ['.tmp']
			}
		}
		clean: {
			all: [e2eSpecRunnerFile, unitSpecRunnerFile, '.grunt/', '.tmp/'],
		},
		jshint:{
			app: {
				src:["<%= config.javascript %>"],
				filter: function(filepath){
					filepath = path.normalize(filepath);
					return (grunt.config('config').ignoreJSHint || [])
						.map(function(file){ return path.normalize(file); })
						.indexOf(filepath) === -1;
				}
			},
			test: ['Gruntfile.js', 'test/**/*.js']
		}
	});
};

