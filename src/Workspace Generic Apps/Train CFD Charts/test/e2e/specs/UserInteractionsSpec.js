var browserName = process.env.BROWSER_NAME || 'phantomjs',
	E2E_URL = process.env.E2E_URL,
	webdriverio = require('webdriverio');
	
if(!E2E_URL) throw new Error('Invalid URL');

describe('Testing User Interactions', function(){
	var client = {};
		
	beforeAll(function(){
		//workspace init
		//mock jsonp init
		//mock ajax init
		//mock userinteraction init
	});
	
	afterAll(function(){
		//mock jsonp uninstall
		//mock ajax uninstall
		//mock userinteraction uninstall
	});
	
	beforeEach(function(){
		client = webdriverio.remote({ desiredCapabilities: { browserName: browserName } });
		client.init();
	});
	
	it('test it', function(done) {
		client
			.url('https://github.com/')
			.getElementSize('.header-logo-wordmark', function(err, result) {
				expect(err).toBeFalsy();
				expect(result.height).toBe(26);
				expect(result.width).toBe(37);
			})
			.getTitle(function(err, title) {
				expect(err).toBeFalsy();
				expect(title).toBe('GitHub · Build software better, together.');
			})
			.getCssProperty('a[href="/plans"]', 'color', function(err, color){
				expect(err).toBeFalsy();
				expect(color).toBe('rgba(65,131,196,1)');
			})
			.call(done);
	});

	afterEach(function(done) {
		client.end(done);
	});
});

// //what do i want to test?
	// - User interactions (resizing, click on dropdowns, scroll) -- we mock the JSONP and AJAX calls, Mock user interaction
	