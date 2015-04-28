module.exports = function(grunt){
	require('load-grunt-plugins-from-parent')(grunt);
	
	/*********************************************** CONFIG && UTIL FUNCS *************************************************************/
	var path = require('path'),
		normalizeurl = require('normalizeurl'),
		connectPorts = { test: 8001 },
		isWin32 = (process.platform === 'win32'),
		unitSpecRunnerFile = getUnitSpecRunnerFile(),
		seleniumStarts = 0, //keep track so we only start/kill selenium once
		connectStarted = { e2e:false, unit:false };
	
	function getBROWSER_NAME(){
		if(!process.env.BROWSER_NAME) throw new Error('no browser set'); 
		else return process.env.BROWSER_NAME; 
	}	
	function setBROWSER_NAME(browser){ 
		process.env.BROWSER_NAME = (browser==='ie' ? 'internet explorer' : browser); 
	}
	function setTestEnvVars(){
		var config = getRallyTestConfig();
		process.env.USERNAME = config.testUsername;
		process.env.PASSWORD = config.testPassword;
		process.env.WORKSPACE_OID = config.testWorkspaceOID;
		process.env.API_KEY = config.testApiKey;
		process.env.E2E_URL = normalizeurl('http://localhost:' + connectPorts.test + '/' + getSrcBaseRelative() + 'App-Debug.html');
	}

	function noop(){}
	function webdriver_jasmine(){
		var browser = getBROWSER_NAME();
		browser = (browser === 'internet explorer' ? 'ie' : browser);
		grunt.task.run('webdriver_jasmine_runner:' + browser);
	}
	function connect_server(testType){
		if(!connectStarted[testType]){
			connectStarted[testType] = true;
			grunt.task.run('connect:' + testType);
		}
		else console.log('connect:' + testType + ' already started');
	}
	function start_selenium(){
		//only starts selenium 1 time
		if(0 === seleniumStarts++){
			grunt.task.run('shell:start_selenium_standalone');
			grunt.task.run('wait:start_selenium');
		}
		else console.log('selenium already started');
	}
	function kill_selenium(){
		//only kills selenium 1 time
		if(0 === --seleniumStarts) grunt.task.run('shell:start_selenium_standalone:kill');	
	}
	function getRallyTestConfig(){ //get the srcBase directory for the app
		return require(path.resolve(getSrcBase(), '../config/test-config.js'));
	}
	function getSrcBase(){ //get the srcBase directory for the app
		var curdir = path.normalize(__dirname);
		while(path.basename(curdir) != 'src') curdir = path.dirname(curdir);
		return curdir + '/';
	}
	function getSrcBaseRelative(){ //get the relative path from srcBase to current directory
		return path.relative(getSrcBase(), path.normalize(__dirname)) + '/';
	}
	function getUnitSpecRunnerFile(){
		return getSrcBaseRelative() + '/.tmp/_unitSpecRunner.html';
	}
	
	/************************************************ GRUNT TASKS ********************************************************************/
	grunt.loadNpmTasksFromParent('grunt-wait');
	grunt.loadNpmTasksFromParent('grunt-contrib-jshint');
	grunt.loadNpmTasksFromParent('grunt-mkdir');
	grunt.loadNpmTasksFromParent('grunt-contrib-clean');
	grunt.loadNpmTasksFromParent('grunt-contrib-connect');
	grunt.loadNpmTasksFromParent('grunt-contrib-jasmine');
	grunt.loadNpmTasksFromParent('grunt-shell-spawn2');
	grunt.loadNpmTasksFromParent('grunt-webdriver-jasmine2-runner');
	
	grunt.registerTask('_setBROWSER_NAME', 	'sets the BROWSER_NAME env', 							setBROWSER_NAME);
	grunt.registerTask('_setTestEnvVars', 	'sets the test env', 											setTestEnvVars);
	grunt.registerTask('_noop', 						'no-op', 																	noop);
	grunt.registerTask('_webdriver_jasmine','runs the jasmine tests',									webdriver_jasmine);
	grunt.registerTask('_connect',					'runs the connect server',								connect_server);
	grunt.registerTask('_start_selenium',		'runs the selenium server',								start_selenium);
	grunt.registerTask('_kill_selenium',		'kills the selenium server',							kill_selenium);
	
	grunt.registerTask('test:e2e:__init__', 'private. sets up e2e tests', 						['_start_selenium', '_setTestEnvVars', '_connect:test']);
	grunt.registerTask('test:e2e:__end__', 	'private. tears down e2e tests', 					['_kill_selenium']);
	grunt.registerTask('test:e2e:fast',			'runs e2e tests in phantomjs', 						['_setBROWSER_NAME:phantomjs',	'test:e2e:__init__', 'shell:jasmine_e2e', 	'test:e2e:__end__']);
	grunt.registerTask('test:e2e:firefox', 	'runs e2e tests in firefox', 							['_setBROWSER_NAME:firefox',		'test:e2e:__init__', 'shell:jasmine_e2e', 	'test:e2e:__end__']);
	grunt.registerTask('test:e2e:chrome', 	'runs e2e tests in chrome', 							['_setBROWSER_NAME:chrome', 		'test:e2e:__init__', 'shell:jasmine_e2e', 	'test:e2e:__end__']);
	if(isWin32)
	grunt.registerTask('test:e2e:ie', 			'runs e2e tests in ie', 									['_setBROWSER_NAME:ie', 				'test:e2e:__init__', 'shell:jasmine_e2e',	'test:e2e:__end__']);
	grunt.registerTask('test:e2e', 					'runs e2e tests in all browsers',				 	['_start_selenium', 'test:e2e:firefox', 'test:e2e:chrome',	(isWin32 ? 'test:e2e:ie' : '_noop'), '_kill_selenium']);

	grunt.registerTask('test:unit:__init__','private. sets up unit tests', 						['mkdir:tmp', 'jasmine:unit:build', '_start_selenium', '_setTestEnvVars', '_connect:test']);
	grunt.registerTask('test:unit:__end__', 'private. tears down unit tests', 				['_kill_selenium', 'clean']);
	grunt.registerTask('test:unit:fast',		'runs unit tests in phantomjs', 					['jasmine:unit']);
	grunt.registerTask('test:unit:firefox', 'runs unit tests in firefox', 						['_setBROWSER_NAME:firefox',		'test:unit:__init__', '_webdriver_jasmine',	'test:unit:__end__']);
	grunt.registerTask('test:unit:chrome', 	'runs unit tests in chrome', 							['_setBROWSER_NAME:chrome',			'test:unit:__init__', '_webdriver_jasmine',	'test:unit:__end__']);
	if(isWin32)
	grunt.registerTask('test:unit:ie', 			'runs unit tests in ie', 									['_setBROWSER_NAME:ie',					'test:unit:__init__', '_webdriver_jasmine',	'test:unit:__end__']);
	grunt.registerTask('test:unit', 				'runs unit tests in all browsers',				['_start_selenium', 'test:unit:firefox', 'test:unit:chrome', (isWin32 ? 'test:unit:ie' : '_noop'), '_kill_selenium']);

	grunt.registerTask('test', 							'runs unit and e2e tests in the browsers',['jshint', '_start_selenium', 'test:unit', 'test:e2e', '_kill_selenium']);
	grunt.registerTask('test:fast', 				'runs unit and e2e tests in phantomjs', 	['jshint', '_start_selenium', 'test:unit:fast', 'test:e2e:fast', '_kill_selenium']);
	
	grunt.registerTask('default', 					'jshint, test, build', 										['test:fast', 'shell:rab']);
	
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		config: grunt.file.readJSON('config.json'),
		shell:{
			start_selenium_standalone: {
				command: "selenium-standalone start",
				options: { async: true }
			},
			rab: { 
				command: 'rally-app-builder' 
			},
			jasmine_e2e: {
				command: "jasmine"
			}
		},
		webdriver_jasmine_runner: {
			options: {
				testServer:'localhost',
				testServerPort: connectPorts.test,
				seleniumServerHost:'localhost',
				seleniumServerPort:4444,
				testFile: unitSpecRunnerFile
			},
			phantomjs:{ options:{ browser:'phantomjs'}},
			chrome:		{ options:{ browser:'chrome' }},
			firefox:	{ options:{ browser:'firefox' }},
			ie:				{ options:{ browser:'internet explorer'}}
		},
		jasmine: {
			unit: {
				src: "<%= config.javascript %>",
				options: {
					template: 'test/unit/jasmine.tmpl',
					outfile: '.tmp/_unitSpecRunner.html',
					specs: ["test/unit/specs/**/*.js"],
					helpers: ["test/common/helpers/**/*.js", "test/unit/helpers/**/*.js"],
					styles: "<%= config.css %>",
					vendor: ['https://rally1.rallydev.com/apps/<%= config.sdk %>/sdk-debug.js']
				}
			}
		},
		connect: {
			test:	{ 
				options:{ 
					port: connectPorts.test, 
					protocol: 'http',
					debug: true,
					base: getSrcBase() 
				}
			}
		},
		wait: {
			start_selenium: {
				options: {
					delay: 4000,
					before: function(){ console.log('waiting 4s for selenium server'); }
				}
			}
		},
		mkdir: {
			tmp: {
				create: ['.tmp/']
			}
		},
		clean: {
			all: [unitSpecRunnerFile, '.grunt/', '.tmp/'],
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

