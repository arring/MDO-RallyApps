/** 
	SUMMARY: 
		CRUD API for Risks. Each Risk has a RiskID. Choose the ID carefully, as it will be very important for querying, and GET, PUT, POST, and DELETE
		all use RiskIDs as the key in the key-value storage. Recommended usage is to name the keys something like: 'risk-<release name>-<unique character hash>'
		
		this file does not handle schema or validation things for risks-- it only handles the CRUD interface for them. It uses the RiskModel object to do validation
	
	DEPENDENCIES: 
		- Intel.lib.resource.KeyValueDb
		- Intel.SAFe.lib.model.Risk
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		KeyValueDb = Intel.lib.resource.KeyValueDb,
		RiskModel = Intel.SAFe.lib.model.Risk;

	Ext.define('Intel.SAFe.lib.resource.RiskDb', {
		singleton: true,
		
		/** 
			private function. returns error if missing or invalid fields, else returns pruned riskJSON
			returns Promise(riskJSON)
		*/
		_validateRisk: function(riskJSON){
			var model = new RiskModel(riskJSON),
				errors = model.validate();
			if(errors.length) return Q.reject(_.map(errors.getRange(), function(error){ return error.field + ' ' + error.message; }));
			else return Q(model.data);
		},
		
		/** 
			You must call this before you can use it. Not using constructor because we need a promise to be returned.
			returns Promise()
		*/
		initialize: function(){
			return KeyValueDb.initialize();
		},
		
		/** returns Promise(riskJSON) */
		get: function(riskID){
			if(!RiskModel.isValidRiskID(riskID)) return Q.reject('invalid RiskID');
			return KeyValueDb.getKeyValuePair(riskID).then(function(kvPair){
				try { return kvPair ? _.merge(JSON.parse(kvPair.value), {RiskID: kvPair.key}) : null; }
				catch(e){ return Q.reject(e); }
			});
		},
		
		/** returns Promise( [riskJSON] ) */
		query: function(riskIDContains){
			if(!RiskModel.isValidRiskID(riskIDContains)) return Q.reject('invalid RiskID');
			return KeyValueDb.queryKeyValuePairs(riskIDContains).then(function(kvPairs){
				try { 
					return _.map(kvPairs, function(kvPair){
						return _.merge(JSON.parse(kvPair.value), {RiskID: kvPair.key});
					});
				}
				catch(e){ return Q.reject(e); }
			});
		},
		
		/** 
			validates the riskJSON and then creates risk if it is unique
			returns Promise(riskJSON) 
		*/
		create: function(riskID, riskJSON){
			if(!RiskModel.isValidRiskID(riskID)) return Q.reject('invalid RiskID');
			return this._validateRisk(_.merge(riskJSON, {RiskID: riskID})).then(function(riskJSON){
				var riskJSONString = JSON.stringify(riskJSON, null, '\t');		
				return KeyValueDb.createKeyValuePair(riskID, riskJSONString).then(function(kvPair){
					try { return _.merge(JSON.parse(kvPair.value), {RiskID: kvPair.key}); }
					catch(e){ return Q.reject(e); }
				});
			});
		},
		
		/** 
			validates the riskJSON and then updates risk if it exists
			returns Promise(riskJSON) 
		*/
		update: function(riskID, riskJSON){
			if(!RiskModel.isValidRiskID(riskID)) return Q.reject('invalid RiskID');
			return this._validateRisk(_.merge(riskJSON, {RiskID: riskID})).then(function(riskJSON){
				var riskJSONString = JSON.stringify(riskJSON, null, '\t');	
				return KeyValueDb.updateKeyValuePair(riskID, riskJSONString).then(function(kvPair){
					try { return _.merge(JSON.parse(kvPair.value), {RiskID: kvPair.key}); }
					catch(e){ return Q.reject(e); }
				});
			});
		},
		
		/** returns Promise(void) */
		'delete': function(riskID){
			if(!RiskModel.isValidRiskID(riskID)) return Q.reject('invalid RiskID');
			return KeyValueDb.deleteKeyValuePair(riskID);
		}
	});
}());