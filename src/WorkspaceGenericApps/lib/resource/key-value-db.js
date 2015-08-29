/** 
	SUMMARY: 
		A project is used as a database. Each artifact in that project is a key-value pair. That means that all artifact of a certain type 
		created in that project are created with 'key' and 'value' fields. Multiple artifacts can have the same 'key',
		which will allow for easier filtering by other apps.
		
		Example: you want to make UserStories that represent the favorite color count for each person on each scrum. Every Story could
		represent 1 person. So for project 'scrumA', and scrum member 'jim' who likes color 'blue' we would have:
		
			UserStory: {
				c_usDbKey: 'favoriteColor-<scrumA ObjectID>-<userA ObjectID>',
				c_usDbValue: 'blue'
			}
		
		"key" field should be a unique 'string' field and "value field" should be a 'text' field.
		
		We have to keep track of which project this preference is stored in, so we create a custom field that keeps track of it.
		
		To Call the CRUD methods, you must first call initialize() method. You don't need to call initialize() before calling 
		setDatabaseProjectOID or getDatabaseProjectOID. The CRUD methods for the key value pairs will return an object or list 
		of objects of this form: 
			
			kvPair {
				key: dbKey,
				value: dbValue
				ObjectID: artifactID
			}
	
	DEPENDENCIES: 
		- kriskowal/q
		- jquery 2.X
		- lodash
		- the KEY_NAME and VALUE_NAME must be hidden custom fields on the <MODEL_NAME> artifact type you choose.
			> so, if you use the defaults in this app, you have to create hidden c_usDbKey(string) and c_usDbValue(text) fields on 
				HierarchicalRequirement in your workspace. Dont mess up the (string) and (text) part
	
	ISSUES: 
		If someone has an app open that uses this, and another person changes the projectOID, the first person will continue to 
		save key-value pairs to the old project. So make sure nobody is using apps that require this class when you are modifying the 
		project serving as the database.
		
		Ext.Ajax keeps changing the apiKey in the url for POST, PUT and DELETE requests. Could not figure out why, so using jquery instead.
		
		Also, this uses ajax, not sure what that means with regards to CORS but I think you cannot use file:/// protocol when developing
		locally.
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/** 
		The first 6 variables should probably just be left alone. But if you feel compelled to use Tasks or Defects as the KV storage
		medium (MODEL_NAME) or change the KEY_NAME or VALUE_NAME or PREF_NAME, knock yourself out.
		
		The next 2 variables are the max length the key and value strings can be.
		
		The last 2 variables will be modified as apps use this database
	*/
	var PREF_NAME = 'intel-key-value-database-project',
		MODEL_NAME = 'HierarchicalRequirement',
		KEY_NAME = 'c_usDbKey',
		VALUE_NAME = 'c_usDbValue',
		SECURITY_KEY = Rally.env.IoProvider.getSecurityToken(),
		BASE_URL = Rally.environment.getServer().getBaseUrl() + '/slm/webservice/v2.0',
		
		MAX_TEXT_LENGTH = 65536,
		MAX_STRING_LENGTH = 256,
		
		INITIALIZED = false,
		PROJECT_OID = 0;
	
	Ext.define('Intel.lib.resource.KeyValueDb', {
		singleton: true,
		
		/**
			private method for sending requests to the rally server. 
		
			method must be an HTTP method
			params must be an object
			data may be undefined or a non-null object
			
			returns Promise(httpResponseData)
		*/
		_sendRequest: function(method, params, urlExtension, data){
			var deferred = Q.defer();
			
			if(['GET', 'POST', 'PUT', 'DELETE'].indexOf(method) === -1)                     return Q.reject('invalid method');
			if(!(params instanceof Object) || params === null)                              return Q.reject('invalid params');
			if(typeof urlExtension !== 'string' || urlExtension[0] !== '/')                 return Q.reject('invalid urlExtension');
			if(typeof data !== 'undefined' && (!(data instanceof Object) || data === null)) return Q.reject('invalid data');

			data = (data === undefined ? data : JSON.stringify(data, null, '  '));
			params = _.map(Ext.merge({
				fetch: ['ObjectID', KEY_NAME, VALUE_NAME].join(','),
				project: '/project/' + PROJECT_OID,
				projectScopeUp: false,
				projectScopeDown: false,
				key: SECURITY_KEY
			}, params), function(value, key){ return key + '=' + value; }).join('&');
			
			var request = $.ajax({
				url: BASE_URL + urlExtension + '?' + params,
				method: method,
				data: data,
				dataType: 'json',
				headers: {
					'Content-Type' : 'application/json'
				},
				xhrFields: {
					withCredentials: true
				}
			});
			request.done(function(json){
				var results, errors;
				json = json.OperationResult || json.QueryResult || json.CreateResult || json[MODEL_NAME];
				errors = json.Errors;
				results = json.Results || json.Object || json;
				if(errors && errors.length) deferred.reject(errors);
				else deferred.resolve(results);
			});
			request.fail(function(jqXHR, textStatus){
				deferred.reject(textStatus);
			});
			
			return deferred.promise;
		},
		
		/** 
			You must call this before you can use it. Not using constructor because we need a promise to be returned.
			This fails if the preference does not exist or holds a bad value.
			returns Promise()
		*/
		initialize: function(){
			if(INITIALIZED) return Q();
			return this.getDatabaseProjectOID()
				.then(function(projectOID){
					projectOID = parseInt(projectOID, 10);
					if(isNaN(projectOID) || projectOID <= 0) return Q.reject('KeyValueDb not properly initialized');
					else PROJECT_OID = projectOID;
				})
				.then(function(){ INITIALIZED = true; });
		},
		
		/** 
			Sets the ObjectID for the project that will serve as a database.
			returns Promise(projectOID)
		*/
		setDatabaseProjectOID: function(projectOID){
			var settings = {}, deferred = Q.defer();
			
			projectOID = parseInt(projectOID, 10);
			if(isNaN(projectOID) || projectOID <= 0) return Q.reject('invalid projectOID');
			
			settings[PREF_NAME] = projectOID; 
			Rally.data.PreferenceManager.update({
				workspace: Rally.environment.getContext().getWorkspace()._ref,
				filterByName: PREF_NAME,
				settings: settings,
				success: function(prefs){ 
					PROJECT_OID = projectOID;
					deferred.resolve(projectOID); 
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
	
		/** 
			Gets the projectOID that serves as a database.
			returns Promise(projectOID)
		*/
		getDatabaseProjectOID: function(){
			var deferred = Q.defer();
			Rally.data.PreferenceManager.load({
				workspace: Rally.environment.getContext().getWorkspace()._ref,
				filterByName: PREF_NAME,
				success: function(prefs){ 
					var projectOID = parseInt(prefs[PREF_NAME], 10);
					if(isNaN(projectOID) || projectOID <= 0) deferred.reject('invalid projectOID');
					else deferred.resolve(projectOID); 
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		
		/** returns Promise(kvPair || null) */
		getKeyValuePair: function(dbKey){
			if(!INITIALIZED)                      return Q.reject('not initialized');
			if(typeof dbKey !== 'string')         return Q.reject('invalid key');
			if(dbKey.length === 0)                return Q.reject('key too short');
			if(dbKey.length > MAX_STRING_LENGTH)  return Q.reject('key too long');
			
			var urlExtension = '/' + MODEL_NAME,
				params = {
					query: '(' + KEY_NAME + ' = "' + dbKey + '")',
					pagesize: 1
				};
			
			return this._sendRequest('GET', params, urlExtension).then(function(items){ 
				if(items.length){
					return {
						key: items[0][KEY_NAME],
						value: items[0][VALUE_NAME],
						ObjectID: items[0].ObjectID
					};
				}
				else return null;
			});
		},
		
		/** returns Promise( [kvPair] ) */
		queryKeyValuePairs: function(dbKeyContains){
			var me=this, allItems = [];
			
			if(!INITIALIZED)                              return Q.reject('not initialized');
			if(typeof dbKeyContains !== 'string')         return Q.reject('invalid key');
			if(dbKeyContains.length > MAX_STRING_LENGTH)  return Q.reject('key too long');
			
			var urlExtension = '/' + MODEL_NAME,
				params = {
					query: '(' + KEY_NAME + ' contains "' + dbKeyContains + '")',
					pagesize: 200,
					start: 1
				};
				
			function nextPage(){
				return me._sendRequest('GET', params, urlExtension).then(function(items){
					if(items.length){
						allItems = allItems.concat(items);
						params.start += 200;
						return nextPage();
					}
				});
			}
			return nextPage().then(function(){
				return allItems.map(function(item){
					return {
						key: item[KEY_NAME],
						value: item[VALUE_NAME],
						ObjectID: item.ObjectID
					};
				});
			});
		},
		
		/** returns Promise(kvPair) */
		createKeyValuePair: function(dbKey, dbValue){
			var me = this, jsonData = {};
			
			if(!INITIALIZED)                      return Q.reject('not initialized');
			if(typeof dbKey !== 'string')         return Q.reject('invalid key');
			if(typeof dbValue !== 'string')       return Q.reject('invalid value');
			if(dbKey.length === 0)                return Q.reject('key too short');
			if(dbKey.length > MAX_STRING_LENGTH)  return Q.reject('key too long');
			if(dbValue.length > MAX_TEXT_LENGTH)  return Q.reject('value too long');
			
			jsonData[MODEL_NAME] = {};
			jsonData[MODEL_NAME][KEY_NAME] = dbKey;
			jsonData[MODEL_NAME][VALUE_NAME] = dbValue;
			jsonData[MODEL_NAME].Name = dbKey;
			
			return me.getKeyValuePair(dbKey).then(function(kvPair){
				if(kvPair) return Q.reject('key already exists');
				else {					
					var urlExtension = '/' + MODEL_NAME + '/create';
					return me._sendRequest('PUT', {}, urlExtension, jsonData);
				}
			}).then(function(item){
				return {
					key: item[KEY_NAME],
					value: item[VALUE_NAME],
					ObjectID: item.ObjectID
				};
			});
		},
		
		/** returns Promise(kvPair) */
		updateKeyValuePair: function(dbKey, dbValue){
			var me = this, jsonData = {};
			
			if(!INITIALIZED)                      return Q.reject('not initialized');
			if(typeof dbKey !== 'string')         return Q.reject('invalid key');
			if(typeof dbValue !== 'string')       return Q.reject('invalid value');
			if(dbKey.length === 0)                return Q.reject('key too short');
			if(dbKey.length > MAX_STRING_LENGTH)  return Q.reject('key too long');
			if(dbValue.length > MAX_TEXT_LENGTH)  return Q.reject('value too long');
			
			jsonData[MODEL_NAME] = {};
			jsonData[MODEL_NAME][KEY_NAME] = dbKey;
			jsonData[MODEL_NAME][VALUE_NAME] = dbValue;
			jsonData[MODEL_NAME].Name = dbKey;

			return me.getKeyValuePair(dbKey).then(function(kvPair){
				if(!kvPair) return Q.reject('key does not exist');
				else{					
					var urlExtension = '/' + MODEL_NAME + '/' + kvPair.ObjectID;
					return me._sendRequest('POST', {}, urlExtension, jsonData);
				}
			}).then(function(item){
				return {
					key: item[KEY_NAME],
					value: item[VALUE_NAME],
					ObjectID: item.ObjectID
				};
			});
		},
		
		/** returns Promise(void) */
		deleteKeyValuePair: function(dbKey){
			var me = this;
			
			if(!INITIALIZED)                      return Q.reject('not initialized');
			if(typeof dbKey !== 'string')         return Q.reject('invalid key');
			if(dbKey.length === 0)                return Q.reject('key too short');
			if(dbKey.length > MAX_STRING_LENGTH)  return Q.reject('key too long');

			return me.getKeyValuePair(dbKey).then(function(kvPair){
				if(kvPair){
					var urlExtension = '/' + MODEL_NAME + '/' + kvPair.ObjectID;	
					return me._sendRequest('DELETE', {}, urlExtension);
				}
			});
		}
	});
}());