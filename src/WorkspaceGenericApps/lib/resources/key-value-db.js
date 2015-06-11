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
		
		"key" field should be a 'string' field and "value field" should be a 'text' field.
		
		We have to keep track of which project this preference is stored in, so we create a custom field that keeps track of it.
		
		To Call the CRUD methods, you must first call initialize() method. You don't need to call initialize() before calling 
		setDatabaseProjectOID or getDatabaseProjectOID. The CRUD methods for the key value pairs will return an object or list 
		of objects of this form: 
			
			kvPair {
				key: dbKey,
				value: dbValue
			}
	
	DEPENDENCIES: 
		- kriskowal/q
		- the KEY_NAME and VALUE_NAME must be non-visible custom fields on whatever <MODEL_NAME> artifact type you choose.
	
	ISSUES: 
		If someone has an app open that uses this, and another person changes the projectOID, the first person will continue to 
		save key-value pairs to the old project. So make sure nobody is using apps that require this class when you are modifying the 
		project serving as the database.
		
		Also, this uses Ext.Ajax, not sure what that means with regards to CORS but I think you cannot use file:/// protocol when developing
		locally.
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	/** 
		The first 5 variables should probably just be left alone. But if you feel compelled to use Tasks or Defects as the KV storage
		medium (MODEL_NAME) or change the KEY_NAME or VALUE_NAME or PREF_NAME, knock yourself out.
		
		The last 2 variables will be modified as apps use this database
	*/
	var PREF_NAME = 'intel-key-value-database-project',
		MODEL_NAME = 'HierarchicalRequirement',
		KEY_NAME = 'c_usDbKey',
		VALUE_NAME = 'c_usDbValue',
		BASE_URL = Rally.environment.getServer().getBaseUrl() + '/slm/webservice/v2.0/' + MODEL_NAME,
		
		INITIALIZED = false,
		PROJECT_OID = null;
	
	Ext.define('Intel.lib.resources.KeyValueDb', {
		singleton: true,
		
		/** 
			You must call this before you can use it. Not using constructor because we need a promise to be returned.
			This fails if the preference does not exist or holds a bad value.
			returns Promise()
		*/
		initialize: function(){
			if(INITIALIZED) return Q.reject('already initialized');
			return this.getDatabaseProjectOID().then(function(projectOID){
				projectOID = parseInt(projectOID, 10);
				if(isNaN(projectOID) || projectOID <= 0) return Q.reject('Intel.KeyValueDb not properly initialized');
				else {
					PROJECT_OID = projectOID;
					INITIALIZED = true;
				}
			});
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
				filterByName: PREF_NAME,
				success: function(prefs){ 
					var projectOID = parseInt(prefs[PREF_NAME]);
					if(isNaN(projectOID) || projectOID <= 0) deferred.reject('invalid projectOID');
					else deferred.resolve(projectOID); 
				},
				failure: deferred.reject
			});
			return deferred.promise;
		},
		
		/**
			private method for sending requests to the rally server. 
		
			method must be an HTTP method
			params must be an object
			data may be undefined or a non-null object
			
			returns Promise(httpResponseData)
		*/
		_sendRequest: function(method, params, urlExtension, data){
			var deferred = Q.defer();
			if(!INITIALIZED) 																																													return Q.reject('not initialized');
			if(['GET', 'POST', 'PUT', 'DELETE'].indexOf(method) === -1) 																							return Q.reject('invalid method');
			if(!(data instanceof Object) || data === null) 																														return Q.reject('invalid params');
			if(typeof urlExtension !== 'undefined' && (typeof urlExtension !== 'string' || urlExtension[0] !== '/')) 	return Q.reject('invalid urlExtension');
			if(typeof data !== 'undefined' && (!(data instanceof Object) || data === null)) 													return Q.reject('invalid data');
			
			Ext.Ajax.request({
				url: BASE_URL + (urlExtension || ''),
				method: method,
				params: Ext.merge({
					fetch: ['ObjectID', keyName, valueName].join(','),
					project: PROJECT_OID,
					projectScopeUp: false,
					projectScopeDown: false
				}, params),
				jsonData: data,
				success: deferred.resolve,
				failure: deferred.reject
			});
			return deferred.promise;
		},
		
		/** returns Promise({<key>: <value>} || null) */
		getKeyValuePair: function(dbKey){
			return this._sendRequest('GET', {
				query: '(' + keyName + ' = "' + dbKey + '")',
				pagesize: 1
			}).then(function(data){
				debugger;
			});
		},
		
		/** returns Promise([{<key>: <value>}]) */
		queryKeyValuePairs: function(dbKeyContains){
			var me=this, total = [], start = 1;
			function nextPage(){
				return me._sendRequest('GET', {
					query: '(' + keyName + ' contains "' + dbKeyContains + '")',
					pagesize: 200,
					start: start
				}).then(function(pairs){
					if(pairs.length){
						total = total.concat(pairs);
						start += 200;
						return nextPage();
					}
				});
			}
			nextPage().then(function(){
				debugger;
			});
		},
		
		/** returns Promise({<key>: <value>}) */
		createKeyValuePair: function(dbKey, dbValue){
			var me = this, jsonData = {};
			jsonData[keyName] = dbKey;
			jsonData[valueName] = dbValue;
			jsonData.Name = dbKey; //Name is required
			
			return me.getKeyValuePair(dbKey).then(function(kvPair){
				if(kvPair) return Q.reject('key already exists');
				else return me._sendRequest('PUT', {}, '/create', jsonData);
			}).then(function(data){
				debugger;
			});
		},
		
		/** returns Promise({<key>: <value>}) */
		updateKeyValuePair: function(dbKey, dbValue){
			var jsonData = {};
			jsonData[keyName] = dbKey;
			jsonData[valueName] = dbValue;
			
			return me.getKeyValuePair(dbKey).then(function(kvPair){
				if(!kvPair) return Q.reject('key does not exist');
				else return me._sendRequest('POST', {}, ('/' + kvPair.ObjectID), jsonData);
			}).then(function(data){
				debugger;
			});
		},
		
		/** returns Promise(void) */
		deleteKeyValuePair: function(dbKey){
			return me.getKeyValuePair(dbKey).then(function(kvPair){
				if(kvPair) return me._sendRequest('DELETE', {}, ('/' + kvPair.ObjectID));
			});
		}
	});
}());