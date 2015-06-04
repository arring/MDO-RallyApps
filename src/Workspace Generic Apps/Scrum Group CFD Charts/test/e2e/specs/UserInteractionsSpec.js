var util = require('util'),
	browserName = process.env.BROWSER_NAME || 'phantomjs',
	USERNAME = process.env.USERNAME,
	PASSWORD = process.env.PASSWORD,
	WORKSPACE_OID = process.env.WORKSPACE_OID,
	E2E_URL = process.env.E2E_URL,
	webdriverio = require('webdriverio'),
	initTestData = require('../../lib/init-test-data.js');
	
if(!E2E_URL) throw new Error('Invalid URL');
if(!WORKSPACE_OID) throw new Error('Invalid WORKSPACE_OID');
if(!USERNAME) throw new Error('Invalid USERNAME');
if(!PASSWORD) throw new Error('Invalid PASSWORD');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 9999999;

describe('Testing User Interactions', function(){
	var client = {};
	
	beforeAll(function(done){ initTestData().then(done); });
	
	beforeEach(function(done){
		client = webdriverio.remote({ desiredCapabilities: { browserName: browserName } });
		client
			.init()
			.url('https://rally1.rallydev.com/login/')
			.setValue('[name="username"]', USERNAME)
			.setValue('[name="password"]', PASSWORD)
			.click('#submit')
			.call(done);
	});
	
	afterEach(function(done){
		client.end(done);
	});
	
	it('should search for cookies', function(done){
		client
			.url('https://google.com')
			.setValue('[name="q"]', 'cookies')
			.isVisible('[value="Google Search"]', function(err, isVisible){
				if(isVisible) return this.click('[value="Google Search"]');
				else return this.click('[value="Search"]');
			})
			.pause(5000)
			.call(done);
	});
});