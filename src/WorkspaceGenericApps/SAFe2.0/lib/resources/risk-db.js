/** 
	SUMMARY: 
		CRUD API for Risks. Each Risk has a RiskID. Choose the ID carefully, as it will be very important for querying, and GET, PUT, POST, and DELETE
		all use RiskIDs as the key in the key-value storage. Recommended usage is to name the keys something like: 'risk-<release name>-<unique character hash>'
		
		All risks have to have a RiskID that starts with 'risk-'
	
	DEPENDENCIES: 
		- Intel.lib.resources.KeyValueDb
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		RISK_KEY_PREFIX = 'risk-',
		KeyValueDb = Intel.lib.resources.KeyValueDb;

	Ext.define('Intel.SAFe.lib.resources.RiskDb', {
		singleton: true,

		/** 
			private function:
			you will make changes to the risk schema here, since this is the only validator of it
			returns Promise(riskJSON) 
		*/
		_validateRisk: function(riskJSON){
			if(!(riskJSON instanceof Object) || riskJSON === null)                                           return Q.reject('invalid riskJSON');
			if(typeof riskJSON.ReleaseName !== 'string')                                                     return Q.reject('invalid ReleaseName');
			if(['number', 'undefined'].indexOf(typeof riskJSON.PortfolioItemObjectID) === -1)                return Q.reject('invalid PortfolioItemObjectID');
			if(['number', 'undefined'].indexOf(typeof riskJSON.ProjectObjectID) === -1)                      return Q.reject('invalid ProjectObjectID');
			if(typeof riskJSON.Description !== 'string')                                                     return Q.reject('invalid Description');
			if(typeof riskJSON.Impact !== 'string')                                                          return Q.reject('invalid Impact');
			if(typeof riskJSON.MitigationPlan !== 'string')                                                  return Q.reject('invalid MitigationPlan');
			if(['High', 'Medium', 'Low', 'Undefined'].indexOf(riskJSON.Urgency) === -1)                      return Q.reject('invalid Urgency');
			if(['Undefined', 'Resolved', 'Owned', 'Accepted', 'Mitigated'].indexOf(riskJSON.Status) === -1)  return Q.reject('invalid Status');
			if(typeof riskJSON.Contact !== 'string')                                                         return Q.reject('invalid Contact');
			if(typeof riskJSON.Checkpoint !== 'number')                                                      return Q.reject('invalid Checkpoint');
			
			return Q({
				ReleaseName:            riskJSON.ReleaseName,
				PortfolioItemObjectID:  riskJSON.PortfolioItemObjectID,
				ProjectObjectID:        riskJSON.ProjectObjectID,
				Description:            riskJSON.Description,
				Impact:                 riskJSON.Impact,
				MitigationPlan:         riskJSON.MitigationPlan,
				Urgency:                riskJSON.Urgency,
				Status:                 riskJSON.Status,
				Contact:                riskJSON.Contact,
				Checkpoint:             riskJSON.Checkpoint
			});
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
			if(!riskID || riskID.indexOf(RISK_KEY_PREFIX) !== 0) return Q.reject('invalid RiskID');
			return KeyValueDb.getKeyValuePair(riskID).then(function(kvPair){
				try { return kvPair ? _.merge({RiskID: kvPair.key}, JSON.parse(kvPair.value)) : null; }
				catch(e){ return Q.reject(e); }
			});
		},
		
		/** returns Promise( [riskJSON] ) */
		query: function(riskIDContains){
			if(!riskIDContains || riskIDContains.indexOf(RISK_KEY_PREFIX) !== 0) return Q.reject('invalid RiskID');
			return KeyValueDb.queryKeyValuePairs(riskIDContains).then(function(kvPairs){
				try { 
					return _.map(kvPairs, function(kvPair){
						return _.merge({RiskID: kvPair.key}, JSON.parse(kvPair.value));
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
			if(!riskID || riskID.indexOf(RISK_KEY_PREFIX) !== 0) return Q.reject('invalid RiskID');
			return this._validateRisk(riskJSON).then(function(riskJSON){
				var riskJSONString = JSON.stringify(riskJSON, null, '\t');		
				return KeyValueDb.createKeyValuePair(riskID, riskJSONString).then(function(kvPair){
					try { return _.merge({RiskID: kvPair.key}, JSON.parse(kvPair.value)); }
					catch(e){ return Q.reject(e); }
				});
			});
		},
		
		/** 
			validates the riskJSON and then updates risk if it exists
			returns Promise(riskJSON) 
		*/
		update: function(riskID, riskJSON){
			if(!riskID || riskID.indexOf(RISK_KEY_PREFIX) !== 0) return Q.reject('invalid RiskID');
			return this._validateRisk(riskJSON).then(function(riskJSON){
				var riskJSONString = JSON.stringify(riskJSON, null, '\t');	
				return KeyValueDb.updateKeyValuePair(riskID, riskJSONString).then(function(kvPair){
					try { return _.merge({RiskID: kvPair.key}, JSON.parse(kvPair.value)); }
					catch(e){ return Q.reject(e); }
				});
			});
		},
		
		/** returns Promise(void) */
		delete: function(riskID){
			if(!riskID || riskID.indexOf(RISK_KEY_PREFIX) !== 0) return Q.reject('invalid RiskID');
			return KeyValueDb.deleteKeyValuePair(riskID);
		}
	});
}());