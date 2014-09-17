/** exported functions :
  * rawSearch(uri, base, opts, callback(err, results))
  * getPeople(fields, callback(err, people))
  * getPerson(fields or String, callback(err, person))
  * getManager(person, callback(err, person))
  * getDirectReports(person, callback(err, [people]))
  * getSiblings(person, callback(err, [people]))
  * getManagerOfOrgUnit(orgUnit, callback(err, person))
  * getWorkersOfOrgUnit(orgUnit, callback(err, [person]))
  * getOrgUnits(fields, callback(err, [orgUnits]))
  * getOrgUnit(fields or string, callback(err, orgUnit))
  * getOrgUnitByID(string, callback(err, orgUnit))
  * getParentOrgUnit(orgUnit, callback(err, orgUnit))
  * getChildOrgUnits(orgUnit, callback(err, [orgUnits]))
  * getPersonsOrgUnit(person, callback(err, orgUnit))
  * getPersonsManagedOrgUnit(person, callback(err, orgUnit))
  * authenticate(username, password, callback(err, person))
  */

(function(ldap, myUsername, myPassword){
	if(!ldap || !myUsername || !myPassword) return;
	
	var ldap_intel = {};
							 											
	var rootWorkerBase = 'DC=corp,DC=intel,DC=com';						
	var orgUnitBase = 'OU=Org Unit Number,OU=Application Managed,OU=Groups,DC=corp,DC=intel,DC=com';
	var globalCatalogUri = 'ldap://corp.intel.com:3268';				
	var workerDomains = ['amr', 'gar', 'ger', 'ccr']; 						

	/********************************** Default Attrs and Field Mappings. *********************************/

	/** personAttrs and orgUnitAddrs are the attributes returns when searching for org or person */
	var personAttrs = [
		'cn', 							// common name
		'directReports', 				// semi-colon separated list of distinguishedNames of direct subordinates
		'distinguishedName', 			// distinguished name of the person
		'employeeBadgeType',			// BB or GB
		'employeeID',					// 8 digit id
		'intelDivisionCode',			// not in orgtree.intel.com
		'intelDivisionDescr', 			// div in orgtree.intel.com
		'intelGroupCode', 				// not in orgtree.intel.com
		'intelGroupDescr',				// group field in orgTree.intel.com
		'intelGroupShortName',			// not in orgtree.intel.com
		'intelOrgUnitCode',				// orgUnitId in orgtree.intel.com
		'intelOrgUnitDescr',			// orgUnit in orgtree.intel.com (org they are in, not head of)
		'intelRegionCode',				// 2 (maybe 3) letter region code
		'intelRegionDescr',				// Region Description
		'intelSiteCode',				// 2 letter abbreviation
		'intelSiteName',				// State, City
		'intelSuperGroupCode',			// 6 letter code 10000*
		'intelSuperGroupDescr',			// full name of supergroup (same supergroup as in orgTree.intel.com
		'intelSuperGroupShortName', 	// 3 letter abbreviation
		'mail', 						// email 
		'memberOf', 					// groups (and OrgUnits ! person is member of 
		'sAMAccountName', 				// login name prefix: <login name>@<domain name>
		'mgrWWID', 						// 8 digit manager wwid
		'manager', 						// distinguishedName of manager
		'name',							// the name of the person
	];
	
	var orgUnitAddrs = [
		'member', 		//orgs and people below (and at current level of) this org
		'memberOf',		//org above this org
		'name'			//org name (same as CN)
	];
	
	/** maps names used in this app to indexed attrs used by Active Directory for people and org units
	  * ONLY USE THESE IF YOU PLAN ON BUILDING FILTERS. the other option is to use a DN string for getOrgUnit
	  * or getPerson, and they will just use that string for the search
	  */
	var personIndex = {
		'costCenterCode': 'intelCostCenterCode',
		'campusCode': 'intelCampusCode',
		'siteCode': 'intelSiteCode',
		'badgeType': 'employeeBadgeType',
		'wwid': 'employeeID',
		'email': 'mail', 						//same as userPrincipalName
		'login': 'sAMAccountName',
		'name': 'name',
		'surname':'sn',
	};
	
	var orgUnitIndex = {
		'name': 'name'
	}
	
	/****************************************************** Filter Construction ***********************************************/
	
	/** ONLY TAKES AN OBJECT. all keys must map to a valid value in fieldToAttr Object above. The Rules Are:
	  * $or keyword only takes an array of objects as value
	  * $and keyword only takes an array of objects as value
	  * $not keyword only takes an object as value
	  * an object with more than one key is an IMPLICIT AND
	  * an object key with an ARRAY OF (BOOLEAN|NUMBER|STRING) for value is an implicit OR
	  * examples:
	      * { name: 5 } 									==> '(name=5)'
		  * { name: 5, age:3 } 								==> '(&(name=5)(age=3))'
		  * { name: ['h', 'b'], age:3} 						==> '(&(|(name=h)(name=b))(age=3))'
		  * { $not: {name: 3}} 								==> '(!(name=3))'
		  * { $or: [ {name: 3}, {age: [ 1,2,3]} ] } 		==> '(|(name=3)(|(age=1)(age=2)(age=3)))'
		  * { $and: [ {name: 3}, {age: [ 1 ]} ] } 			==> '(&(name=3)(age=1))'
		  * { $and: [ {name: 3}], age: 1 } 					==> '(&(name=3)(age=1))'
		  * { $and: [], age: 1} 							==> '(age=1)'
	  */
	function makeFilter(fields, indexMap){
		if(!fields || !indexMap) return;
		var specialKeys = ['$and', '$or', '$not'];
		
		function isNullOrUndefined(v){
			return (v === undefined || v === null )
		}
		
		// works for both literals and objects (eg: works for var x = new Boolean(true), and var y = true)
		function getClass(obj){
			if(isNullOrUndefined(obj)) return;
			else return obj.constructor.name;
		}
		
		function makeSingleFilter(fields){
			if(isNullOrUndefined(fields) || getClass(fields) !== 'Object'){
				console.log('invalid fields');
				return;
			}
			var str = '';
			var keys = Object.keys(fields);
			for(var i = 0;i<keys.length;++i){
				var key = keys[i];
				var attr = indexMap[key];
				var val = fields[key];
				if((isNullOrUndefined(attr) && specialKeys.indexOf(key) === -1) || isNullOrUndefined(val)) {
					console.log('invalid field. key: ' + key + ' value: ' + val);
					return;
				}
				var tmpStr;
				switch(key){
					case '$and':
						tmpStr = makeAndFilter(val);
						break;
					case '$or':
						tmpStr = makeOrFilter(val);
						break;
					case '$not':
						tmpStr = makeNotFilter(val);
						break;
					default:
						switch(val.constructor.name){
							case 'Array':
								var arr = [];
								for(var i = 0;i<val.length;++i){
									var obj = {};
									var constructor = getClass(val[i]);
									if(	constructor !== 'String' && 
										constructor !== 'Boolean' && 
										constructor !== 'Number') 
										return;
									obj[key] = val[i];
									arr.push(obj);
								}
								tmpStr = makeOrFilter(arr);
								break;
							case 'String':
							case 'Number':
							case 'Boolean':
								tmpStr = '(' + attr + '=' + val + ')';
								break;
							default:
								console.log('invalid constructor: ' + val.constructor.name);
								return;
						}
						break;
				}
				if(isNullOrUndefined(tmpStr)) return;
				else str += tmpStr;
			}
			if(keys.length>1) str = '(&' + str + ')';
			return str;
		}
		
		function makeNotFilter(fields){
			var res = makeSingleFilter(fields);
			if(isNullOrUndefined(res)) return;
			else return '(!' + res + ')';
		}
		
		function makeOrFilter(array){
			var str = '';
			for(var i = 0;i<array.length;++i){
				var res = makeSingleFilter(array[i]);
				if(isNullOrUndefined(res)) return;
				else str += res;
			}
			if(array.length <= 1) return str;
			else return '(|' + str + ')';
		}
		
		function makeAndFilter(array){
			var str = '';
			for(var i = 0;i<array.length;++i){
				var res = makeSingleFilter(array[i]);
				if(isNullOrUndefined(res)) return;
				else str += res;
			}
			if(array.length <= 1) return str;
			else return '(&' + str + ')';
		}
		
		
		if(isNullOrUndefined(fields) || getClass(fields) !== 'Object'){
			console.log('invalid fields');
			return;
		}
		var res;
		var fieldCount = Object.keys(fields).length;
		if(fieldCount == 0) return '';
		return makeSingleFilter(fields);
	 }
	
	/******************************* SEARCHING. PUBLIC FUNCTIONS *************************************/
	
	
	/** searches the ldap server at 'uri' with base 'base' with the options 'opts'. 'opts' is 
	  * outlined in the documentation for ldap.js
	  * callback(err, [entries]) 
	  */
	var currentUsername, currentPassword, currentUri, conns = 200, client;
	ldap_intel.closeConnections = function(){ client.unbind(); } // user of this module must call this
	ldap_intel.createConnections = function(){ 
		if(client) { try{ client.unbind(); } catch(e){}}
		currentUsername = myUsername;
		currentPassword = myPassword;
		currentUri = globalCatalogUri;
		client = ldap.createClient({
			url: currentUri, 
			maxConnections:conns, 
			bindDN:currentUsername, 
			bindCredentials:currentPassword
		});
	} 
	ldap_intel.createConnections();
	
	function search(username, password, uri, base, opts, callback){
		if(!client) ldap_intel.createConnections();
		if(uri != currentUri){
			client.unbind();
			client= ldap.createClient({
				url: uri, 
				maxConnections:conns, 
				bindDN:currentUsername, 
				bindCredentials:currentPassword
			});
			currentUri = uri;
			search(username, password, uri, base, opts, callback);
		} else if(username != currentUsername || password != currentPassword){
			client.unbind();
			client.bind(currentUsername, currentPassword, function(err){
				if(err){
					client.unbind();
					console.log(err);
					search(username, password, uri, base, opts, callback);
				} else {
					currentUsername = username;
					currentPassword = password;
				}
			});
		}
		else{
			var resultEntries = [];
			opts.timeLimit = 120; /* 2 minute timeout */

			/**
			  * gotta add this for referrals to other domains. There are never any 
			  * referrals when searching the global catalog though. 
			  */
			var referralQueue = [];
			function nextReferral(){
				if(referralQueue.length >0){
					var refUri = referralQueue.pop();
					refUri = refUri.split('/');
					var refBase = refUri.pop();
					refUri = refUri.join('/');
					_search(refUri, refBase);
				}
				else {
					//console.log('ldap search success: ' + new Date()*1);
					callback(null, resultEntries); 
				}
			}	
			
			function _search(uri, base){
				try{
					client.search(base, opts, function(err, res){
						if(err) {
							console.log('1 Trying uri:'+uri + ', base:' + base + ' again');
							_search(uri, base);
							return;
						}
						res.on('searchEntry', function(entry){
							resultEntries.push(entry.object);
						});
						res.on('searchReference', function(referral){
							for(var i = 0;i<referral.uris.length;++i)
								referralQueue.splice(0, 0, referral.uris[i]);
						});
						res.on('error', function(err){
							console.log('2 Trying uri:' + uri+', base:' + base + ' again');
							_search(uri, base);
						});
						res.on('end', function(status){
							nextReferral();
						});
					});
				}
				catch(err){	
					console.log('3 Trying uri:' + uri + ', base:' + base + ' again');
					_search(uri, base)
				}
			}
			_search(uri, base);
		}
	}



	/* searches global catalog for given distinguished name, and returns the specified attrs. 
	 * callback(err, person)
	 */
	function searchByDistinguishedName(username, password, dn, attrs, callback){
		if(!callback) return;
		var base = dn;
		var opts = {
			scope: 'base',
			attributes: attrs,
		};
		search(username, password, globalCatalogUri, base, opts, function(err, results){
			if(err) callback(err);
			else if(results.length != 1) callback('invalid search result count: ' + results.length);
			else callback(null, results[0]);
		});
	}
	
	/******************************  RAW Filter SEARCHING.  **************************************/	
	ldap_intel.rawSearch = function(uri, base, opts, callback){
		if(!callback) return;
		if(!uri || !base || !opts || !opts.filter) { callback('invalid args'); return; }
		search(myUsername, myPassword, uri, base, opts, callback);
	}
	
	/******************************  PEOPLE SEARCHING.  **************************************/
	/** removes all groups from memberOf attribute unless it begins with ORGU (we only care about orgs and people)
	  * args is either a single person or an array of people */
	function removePeopleGroups(args){
		if(!args) return;
		var people = [];
		var isSingle = false;
		if(args.constructor.name != 'Array') {
			people.push(args);
			isSingle = true;
		}
		else people = args;
		for(var i = 0;i<people.length;++i){
			var person = people[i];
			var memberOf = person.memberOf;
			for(var j=memberOf.length-1; j>=0; --j){
				if(memberOf[j].indexOf('CN=ORGU') !== 0)
					memberOf.splice(j, 1);
			}
		}
		if(isSingle) return people.pop();
		else return people;
	}
	
	/** searches global catalog with a given filter. Only looks in one level under the list of worker domains 
	  * callback(err, [results]); Current implementation iterates through the 4 domains' OU=Workers in oneLevel
	  * searches, and adds all the results from all 4. (its a global catalog search still )
	  */
	function searchPeopleByFilter(username, password, filter, callback){
		//somebody explain to me why filter goes out of scope when nextBaseSearch calls itself
		if(!callback) return;
		
		var opts = {
			scope: 'one',
			attributes: personAttrs,
			filter: filter
		};
		var opts_copy = JSON.parse(JSON.stringify(opts));
		var allResults = [];
		
		var doms = workerDomains.slice(0);
		function getNextBase(){ 
			if(doms.length==0) return;
			else return 'OU=Workers,DC=' + doms.pop() + ',' + rootWorkerBase;
		}
		function nextBaseSearch(err, results){
			if(err) callback(err);
			else{
				allResults = allResults.concat(results);
				var nextBase = getNextBase();
				var opts_copy = JSON.parse(JSON.stringify(opts));
				if(!nextBase) callback(null, removePeopleGroups(allResults));
				else search(username, password, globalCatalogUri, nextBase, opts_copy, nextBaseSearch);
			}
		}
		var nextBase = getNextBase();
		if(!nextBase) callback('there were no valid worker domains!');
		else search(username, password, globalCatalogUri, nextBase, opts_copy, nextBaseSearch);
	};
		
	/* callback(err, people) */
	ldap_intel.getPeople = function(fields, callback){
		if(!callback) return;
		var filter = makeFilter(fields, personIndex);
		if(!filter) callback('invalid fields');
		else searchPeopleByFilter(myUsername, myPassword, filter, callback);
	}
	
	/* callback(err, person) */
	ldap_intel.getPerson = function(fields, callback){
		if(!callback) return;
		if(typeof fields === 'string') 
			searchByDistinguishedName(myUsername, myPassword, fields, personAttrs, function(err, person){
				if(err) callback(err);
				else callback(null, removePeopleGroups(person));
			});
		else{
			ldap_intel.getPeople(fields, function(err, results){
				if(err) callback(err);
				else if(results.length != 1) callback(results.length + ' results returned');
				else callback(null, results[0]);
			});
		}
	}
	
	ldap_intel.getManager = function(person, callback){
		if(!callback) return;
		ldap_intel.getPerson(person.manager, callback);
	}

	ldap_intel.getDirectReports = function(person, callback){
		if(!callback) return;
		var list = [];
		var drs = person.directReports;
		if(!drs) callback(null, list);
		else{
			for(var i = 0;i<drs.length;++i) 
				list.push(drs[i].split(',OU')[0].split('=')[1].replace("\\,", ","));
			ldap_intel.getPeople({'name': list}, callback);
		}
	}
	
	/* excluding the current person! */
	ldap_intel.getSiblings = function(person, callback){
		if(!callback) return;
		ldap_intel.getManager(person, function(err, manager){
			if(err) callback(err);
			else {
				ldap_intel.getDirectReports(manager, function(err, people){
				if(err) callback(err);
					var i;
					for(var j=0;j<people.length;++j){
						if(people[j].employeeID===person.employeeID){
							people.splice(j, 1);
							callback(null, people);
							return;
						}
					}
					callback('did not return self when should have');
				});
			}
		});
	}
	
	/******************************  ORG UNIT SEARCHING.  **************************************/
	
	// NOTE: fields is a query with the correct syntax and indexed fields (see top) (eg $and, $not, $or) 
	ldap_intel.getOrgUnits = function(fields, callback){
		if(!callback) return;
		var filter = makeFilter(fields, orgUnitIndex);
		if(!filter) callback('invalid fields');
		else {		
			var opts = {
				scope: 'one',
				attributes: orgUnitAddrs,
				filter: filter
			};
			search(myUsername, myPassword, globalCatalogUri, orgUnitBase, opts, callback);
		}
	};
	

	// NOTE: fields is either a DN or a query with the correct syntax and indexed fields (see top)
	ldap_intel.getOrgUnit = function(fields, callback){
		if(!callback) return;
		if(fields.constructor.name === 'String'){
			searchByDistinguishedName(myUsername, myPassword, fields, orgUnitAddrs, callback);
		}
		else{
			ldap_intel.getOrgUnits(fields, function(err, orgUnits){
				if(err) callback(err);
				else if(orgUnits.length != 1) callback('invalid number of search results');
				else callback(null, orgUnits[0]);
			});
		}
	};
	
	ldap_intel.getOrgUnitByID = function(orgID, callback){
		if(!callback) return;
		ldap_intel.getOrgUnit({'name':'ORGU' + orgID + '*'}, callback);
	}
	
	ldap_intel.getParentOrgUnit = function(orgUnit, callback){
		if(!callback) return;
		ldap_intel.getOrgUnit(orgUnit.memberOf, callback);
	}
	
	ldap_intel.getManagerOfOrgUnit = function(orgUnit, callback){
		if(!callback) return;
		ldap_intel.getOrgUnit(orgUnit.memberOf, function(err, parentOrgUnit){
			if(err) callback(err);
			else {
				for(var i = 0;i<orgUnit.member.length;++i){
					var dn = orgUnit.member[i];
					if(parentOrgUnit.member.indexOf(dn) != -1){
						ldap_intel.getPerson(dn, callback);
						return;
					}
				}
				callback('org has no manager');
			}
		});
	}
	
	ldap_intel.getWorkersOfOrgUnit = function(orgUnit, callback){
		if(!callback) return;
		ldap_intel.getManagerOfOrgUnit(orgUnit, function(err, person){
			if(err) callback(err);
			else {
				var members = orgUnit.member;
					for(var i = members.length-1; i>=0; --i){
					if(members[i] === person.distinguishedName || members[i].indexOf('CN=ORGU') === 0)
						members.splice(i, 1);
				}
				var workers = [];
				if(members.length==0) callback(null, workers);
				else{
					function getNextWorker(err, person){
						if(err) callback(err);
						else{
							workers.push(person);
							if(members.length==0) callback(null, workers);
							else ldap_intel.getPerson(members.pop(), getNextWorker);
						}
					}
					ldap_intel.getPerson(members.pop(), getNextWorker);
				}
			}
		});
	}
	
	ldap_intel.getChildOrgUnits = function(orgUnit, callback){
		if(!callback) return;
		var members = orgUnit.member;
		for(var i = members.length-1; i>=0; --i){
			if(members[i].indexOf('CN=ORGU') !== 0)
				members.splice(i, 1);
		}
		var childOrgUnits = [];
		if(members.length==0) callback(null, childOrgUnits);
		else{
			function getNextOrgUnit(err, childOrgUnit){
				if(err) callback(err);
				else{
					childOrgUnits.push(childOrgUnit);
					if(members.length==0) callback(null, childOrgUnits);
					else ldap_intel.getOrgUnit(members.pop(), getNextOrgUnit);
				}
			}
			ldap_intel.getOrgUnit(members.pop(), getNextOrgUnit);
		}
	}
	
	/** NOTE: THIS IS !NOT! THE ORG UNIT THEIR MAANGER OF. THAT IS getPersonsManagedOrgUnit */
	ldap_intel.getPersonsOrgUnit = function(person, callback){
		if(!callback) return;
		if(!person || !person.memberOf || !person.employeeID) callback('invalid person');
		var total = person.memberOf.length;
		var returned = false;
		if(total == 0) {  callback('there is no memberOf'); return; }
		var tried = 0;
		for(var i = 0;i<person.memberOf.length;++i){
			ldap_intel.getOrgUnit(person.memberOf[i], function(err, orgUnit){
				if(returned) return;
				if(err) { returned = true; callback(err); }
				else {
					ldap_intel.getManagerOfOrgUnit(orgUnit, function(err, manager){
						if(returned) return;
						if(err) { returned = true; callback(err); }
						else {
							if(manager.employeeID != person.employeeID) {
								returned = true; 
								callback(null, orgUnit);
							}
							else if(++tried==total) callback('could not resolve query');
						}
					});
				}
			});
		}
	}

	/** returns teh org unit the person is manager of */
	ldap_intel.getPersonsManagedOrgUnit = function(person, callback){
		if(!callback) return;
		if(!person || !person.memberOf || !person.employeeID) callback('invalid person');
		var total = person.memberOf.length;
		var returned = false;
		if(total == 0) {  callback('there is no memberOf'); return; }
		var tried = 0;
		for(var i = 0;i<person.memberOf.length;++i){
			ldap_intel.getOrgUnit(person.memberOf[i], function(err, orgUnit){
				if(returned) return;
				if(err) { returned = true; callback(err); }
				else {
					ldap_intel.getManagerOfOrgUnit(orgUnit, function(err, manager){
						if(returned) return;
						if(err) { returned = true; callback(err); }
						else {
							if(manager.employeeID == person.employeeID) {
								returned = true; 
								callback(null, orgUnit);
							}
							else if(++tried==total) callback('could not resolve query');
						}
					});
				}
			});
		}
	}
	
	/******************************  AUTHENTICATION FUNCTION  **************************************/
	function getDomainFromDistinguishedName(dn){
		if(typeof dn !== 'string') return;
		var split = dn.split(',');
		if(split.length<4) {
			console.log('ERROR: split.length == ' + split.length);
			return;
		}
		var domain = split[split.length-4].split('=')[1].toLowerCase();
		if(workerDomains.indexOf(domain) == -1) return;
		else return domain;
	}
	
	/** 
	  * callback(err, person) 
	  * username of form username, the Domain is not needed. 
	  * password is login password
	  */
	ldap_intel.authenticate = function(username, password, callback){
		if(!callback) {
			console.log('authenticate: no callback!');
			return;
		}
		if(!username || !password){
			callback('invalid username or password');
			return;
		}
		ldap_intel.getPerson({'login':username}, function(err, person){
			if(err) callback(err);
			else{
				var domain = getDomainFromDistinguishedName(person.distinguishedName);	
				var fullUsername = username + '@' + domain + '.corp.intel.com';	
				searchByDistinguishedName(fullUsername, password, person.distinguishedName, 
						personAttrs, function(err, person){
					if(err) callback(err);
					else callback(null, removePeopleGroups(person));
				});
			}
		});
	};

	return ldap_intel;
})('samuel.steffl@intel.com', 'deadlift700!');
