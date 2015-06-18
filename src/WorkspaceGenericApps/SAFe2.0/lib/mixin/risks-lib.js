/**
	DO NOT USE THIS: IT IS DEPRECATED! 
	
	USE Intel.SAFe.lib.resource.RiskDb instead!!!!!!!!!!!
*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	var RALLY_MAX_STRING_SIZE = 32768;
	
	Ext.define('Intel.SAFe.lib.mixin.RisksLib', {
		requires: ['Intel.lib.IntelRallyApp'],
		
		_getRisks: function(portfolioItemRecord){
			var risks = portfolioItemRecord.data.c_Risks;
			try{ risks = JSON.parse(atob(risks)) || {}; } //b64 decode risks
			catch(e) { risks = {}; }
			return risks;
		},
		
		_removeRisk: function(portfolioItemRecord, riskData, projectRecord, risksParsedData){ 
			risksParsedData = risksParsedData || [];
			
			var me=this,
				risks = me._getRisks(portfolioItemRecord),
				projectOID = projectRecord.data.ObjectID,
				deferred = Q.defer();
				
			if(risks[projectOID]){
				delete risks[projectOID][riskData.RiskID];
				
				var indexToSplice = _.findIndex(risksParsedData, function(cachedRisk){ /** update cache */
					return cachedRisk.RiskID === riskData.RiskID && cachedRisk.PortfolioItemObjectID === riskData.PortfolioItemObjectID; 
				});
				if(indexToSplice > -1) risksParsedData.splice(indexToSplice, 1);
				
				var risksString = btoa(JSON.stringify(risks, null, '\t')); //b64 encode 
				if(risksString.length >= RALLY_MAX_STRING_SIZE) 
					deferred.reject('Risks field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
				else {
					portfolioItemRecord.set('c_Risks', risksString);
					portfolioItemRecord.save({
						callback:function(record, operation, success){
							if(!success) 
								deferred.reject('Failed to modify ' + me.PortfolioItemTypes[0] + ': ' + portfolioItemRecord.data.FormattedID);
							else deferred.resolve();
						}
					});
				}
			} else deferred.resolve();		
			return deferred.promise;
		},	
		_addRisk: function(portfolioItemRecord, riskData, projectRecord, risksParsedData){
			risksParsedData = risksParsedData || [];
			
			var me=this,
				risks = me._getRisks(portfolioItemRecord),
				projectOID = projectRecord.data.ObjectID,
				deferred = Q.defer();

			riskData = Ext.clone(riskData);
			riskData.Edited = false;
			
			if(!risks[projectOID]) risks[projectOID] = {};
			risks[projectOID][riskData.RiskID] = {
				Checkpoint: riskData.Checkpoint,
				Description: riskData.Description,
				Impact: riskData.Impact,
				MitigationPlan: riskData.MitigationPlan,
				Urgency: riskData.Urgency,
				Status: riskData.Status,
				Contact: riskData.Contact
			};
			
			var indexToSplice = _.findIndex(risksParsedData, function(cachedRisk){ /** update cache */
				return cachedRisk.RiskID === riskData.RiskID && cachedRisk.PortfolioItemObjectID === riskData.PortfolioItemObjectID; 
			});
			if(indexToSplice > -1) risksParsedData.splice(indexToSplice, 1);
			risksParsedData.push(riskData);
			
			var risksString = btoa(JSON.stringify(risks, null, '\t'));
			if(risksString.length >= RALLY_MAX_STRING_SIZE)
				deferred.reject('Risks field for ' + portfolioItemRecord.data.FormattedID + ' ran out of space! Cannot save');
			else {
				portfolioItemRecord.set('c_Risks', risksString);
				portfolioItemRecord.save({
					callback:function(record, operation, success){
						if(!success) 
							deferred.reject('Failed to modify ' + me.PortfolioItemTypes[0] + ': ' + portfolioItemRecord.data.FormattedID);
						else deferred.resolve();
					}
				});
			}	
			return deferred.promise;
		}
	});
}());