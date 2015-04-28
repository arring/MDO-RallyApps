// describe('test testing', function(){
	// it('should be true', function(){
		// expect(true).not.toBe(false);
		// expect(true).toBe(true);
	// });
// });

// describe('app test suite', function(){
	// Ext.data.JsonP.request = jasmine.createSpy("Ext.data.JsonP.request() spy").andCallFake(function(options){
		// options = Ext.apply({}, options);

		// if(!options.url) Ext.Error.raise('A url must be specified for a JSONP request.');
		
		// var me = Ext.data.JsonP,
			// disableCaching = Ext.isDefined(options.disableCaching) ? options.disableCaching : me.disableCaching,
			// cacheParam = options.disableCachingParam || me.disableCachingParam,
			// id = ++me.requestCount,
			// callbackName = options.callbackName || 'callback' + id,
			// callbackKey = options.callbackKey || me.callbackKey,
			// timeout = Ext.isDefined(options.timeout) ? options.timeout : me.timeout,
			// params = Ext.apply({}, options.params),
			// url = options.url,
			// name = Ext.name,
			// request;
			// //script;


		// // Add cachebuster param unless it has already been done
		// if(disableCaching && !params[cacheParam]) params[cacheParam] = Ext.Date.now();

		// options.params = params;

		// params[callbackKey] = name + '.data.JsonP.' + callbackName;
		// //script = me.createScript(url, params, options);

		// me.requests[id] = request = {
				// url: url,
				// params: params,
				// //script: script,
				// script: null,
				// id: id,
				// scope: options.scope,
				// success: options.success,
				// failure: options.failure,
				// callback: options.callback,
				// callbackKey: callbackKey,
				// callbackName: callbackName
		// };

		// if (timeout > 0) {
				// request.timeout = setTimeout(Ext.bind(me.handleTimeout, me, [request]), timeout);
		// }

		// me.setupErrorHandling(request);
		// me[callbackName] = Ext.bind(me.handleResponse, me, [request], true);
		// //me.loadScript(request);
		// return request;
	// });
// });

// //what do i want to test?
	// - I am getting ALL the data (correctness). add features/user stories/Releases, then edit them, delete them, undelete them, and make sure we get what we expect. DO NOT MOCK THIS-- use the real webservice -- we are testing it after all. (how to get/configure/wipe a sandbox workspace/subscription that cannot fuck up other stuff?
	// - We handle bad connections, bad requests, things that could go wrong --we mock this JSONP and AJAX calls
	// - User interactions (resizing, click on dropdowns, scroll) -- we mock the JSONP and AJAX calls, Mock user interaction
	// - Memory leaks (GCing things that should be destroyed? -- we mock the JSONP and AJAX calls, Mock user interaction
	