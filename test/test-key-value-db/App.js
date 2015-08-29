/** 
	This app tests the CRUD operations for the key-value-db.js resource. It assumes you have already set the database Project OID.
	
	Just copy/paste this in a custom app in Rally. test results are console.logged
*/
(function(){
	var KeyValueDb = Intel.lib.resource.KeyValueDb,
		TEST_TOKEN = 'KeyValueDbTestingAppToken-',
		passing = 0, failing = 0;
	
	function runTest(testFn){
		return testFn()
			.then(function(){ passing++; })
			.fail(function(reason){ 
				failing++; 
				console.log('test ' + (passing + failing) + ' failed with message:', reason);
			});
	}
	
	Ext.define('Test.KeyValueDb', {
		extend: 'Rally.app.App',
		
		launch: function(){
			var me = this;
			me.setLoading('loading configuration');
			KeyValueDb.initialize()
				.then(function(){ me.setLoading(false); })
				.then(function(){ return me.runTests(); })
				.then(function(){ return me.cleanup(); })
				.fail(function(reason){ alert(JSON.stringify(reason, null, '  ')); })
				.done();
		},
		
		runTests: function(){
			var testFns = [
				/************************ TEST GET **********************************/
				function(){ //should get nothing but not fail
					return KeyValueDb.getKeyValuePair(TEST_TOKEN + 'not-exist').then(function(kvPair){
						if(kvPair) return Q.reject();
					});
				},
				function(){ //should fail if not string argument
					var deferred = Q.defer();
					KeyValueDb.getKeyValuePair()
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'invalid key') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				
				/************************ TEST CREATE **********************************/
				function(){ //should create kvPair
					return KeyValueDb.createKeyValuePair(TEST_TOKEN + 'create1', 'magic')
						.then(function(data){ 
							if(data.key !== (TEST_TOKEN + 'create1') || data.value !== 'magic') return Q.reject();
						});
				},
				function(){ //should not create duplicate kvPair
					var deferred = Q.defer();
					KeyValueDb.createKeyValuePair(TEST_TOKEN + 'create1', 'magic')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'key already exists') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				
				/************************ TEST UPDATE **********************************/
				function(){ //should update kvPair
					return KeyValueDb.updateKeyValuePair(TEST_TOKEN + 'create1', 'magic2')
						.then(function(data){ 
							if(data.key !== (TEST_TOKEN + 'create1') || data.value !== 'magic2') return Q.reject();
						});
				},
				function(){ //should not update non-existent kvPair
					var deferred = Q.defer();
					KeyValueDb.updateKeyValuePair(TEST_TOKEN + 'create2', 'magic2')
						.then(deferred.reject)
						.fail(function(reason){
							if(reason === 'key does not exist') deferred.resolve();
							else deferred.reject();
						})
						.done();
					return deferred.promise;
				},
				
				/************************ TEST DELETE **********************************/
				function(){ //should delete kvPair
					return KeyValueDb.deleteKeyValuePair(TEST_TOKEN + 'create1').then(function(){ 
						return KeyValueDb.getKeyValuePair(TEST_TOKEN + 'create1').then(function(kvPair){
							if(kvPair) return Q.reject();
						});
					});
				},
				function(){ //should no-op delete a non-existent kvPair
					return KeyValueDb.deleteKeyValuePair(TEST_TOKEN + 'not-exist');
				},
				
				/************************ TEST QUERY **********************************/
				function(){ //should only get matching kvPairs by name
					return Q.all(_.times(20, function(n){
						return KeyValueDb.createKeyValuePair(TEST_TOKEN + 'create' + (n+1), 'magic');
					}))
					.then(function(){
						return KeyValueDb.queryKeyValuePairs(TEST_TOKEN + 'create1').then(function(kvPairs){
							if(kvPairs.length !== 11) return Q.reject();
						});
					});
				}
			];
			
				/************************ RUN TESTS **********************************/
			return testFns
				.reduce(function(promise, testFn){ return promise.then(function(){ return runTest(testFn); }); }, Q())
				.then(function(){ console.log(passing + ' tests passed, ' + failing + ' tests failed'); });
		},
		
		cleanup: function(){
			//get all testing user stories and delete them
			return KeyValueDb.queryKeyValuePairs(TEST_TOKEN).then(function(kvPairs){
				return Q.all(kvPairs.map(function(kvPair){
					return KeyValueDb.deleteKeyValuePair(kvPair.key);
				}));
			});
		}
	});
}());