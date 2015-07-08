/**
	The Risk Model to be used as a base model for all SAFe Apps.
	Validation should always be handled by this model as well.
	
	This file is the source-of-truth for all things related to the schema and validation of Risks
*/
(function(){
	var Ext = window.Ext4 || window.Ext,
		RISK_KEY_PREFIX = 'risk-',
		STATUS_OPTIONS = ['Open', 'WIP', 'Materialized', 'Closed'],
		RISK_LEVEL_OPTIONS = ['High', 'Medium', 'Low'],
		INVALID_MESSAGE = 'is invalid';
	
	/*************************** Risk Custom Validators **********************************/
	Ext.data.validations.RiskIDMessage =                    INVALID_MESSAGE;
	Ext.data.validations.RiskReleaseNameMessage =           INVALID_MESSAGE;
	Ext.data.validations.RiskPortfolioItemObjectIDMessage = INVALID_MESSAGE;
	Ext.data.validations.RiskProjectObjectIDMessage =       INVALID_MESSAGE;
	Ext.data.validations.RiskDescriptionMessage =           INVALID_MESSAGE;
	Ext.data.validations.RiskImpactMessage =                INVALID_MESSAGE;
	Ext.data.validations.RiskMitigationPlanMessage =        INVALID_MESSAGE;
	Ext.data.validations.RiskStatusMessage =                INVALID_MESSAGE;
	Ext.data.validations.RiskLevelMessage =                 INVALID_MESSAGE;
	Ext.data.validations.RiskOwnerObjectIDMessage =         INVALID_MESSAGE;
	Ext.data.validations.RiskSubmitterObjectIDMessage =     INVALID_MESSAGE;
	Ext.data.validations.RiskCheckpointMessage =            INVALID_MESSAGE;
	
	Ext.data.validations.RiskID = function(config, value){
		return typeof value === 'string' && new RegExp('^' + RISK_KEY_PREFIX).test(value);
	};
	Ext.data.validations.RiskReleaseName = function(config, value){
		return typeof value === 'string' && value.length > 0;
	};
	Ext.data.validations.RiskPortfolioItemObjectID = function(config, value){
		return typeof value === 'number' && value > 0;
	};
	Ext.data.validations.RiskProjectObjectID = function(config, value){
		return value === undefined || (typeof value === 'number' && value > 0);
	};
	Ext.data.validations.RiskDescription = function(config, value){
		return typeof value === 'string' && value.length > 0;
	};
	Ext.data.validations.RiskImpact = function(config, value){
		return typeof value === 'string' && value.length > 0;
	};
	Ext.data.validations.RiskMitigationPlan = function(config, value){
		return typeof value === 'string' && value.length > 0;
	};
	Ext.data.validations.RiskStatus = function(config, value){
		return STATUS_OPTIONS.indexOf(value) > -1;
	};
	Ext.data.validations.RiskLevel = function(config, value){
		return RISK_LEVEL_OPTIONS.indexOf(value) > -1;
	};
	Ext.data.validations.RiskOwnerObjectID = function(config, value){
		return typeof value === 'number' && value > 0;
	};
	Ext.data.validations.RiskSubmitterObjectID = function(config, value){
		return typeof value === 'number' && value > 0;
	};
	Ext.data.validations.RiskCheckpoint = function(config, value){
		return typeof value === 'number' && value >= 0;
	};
	
	/*************************** Risk Model Definition **********************************/
	Ext.define('Intel.SAFe.lib.model.Risk', {
		extend: 'Ext.data.Model',
		fields: [
			{name: 'RiskID', type:'auto'},
			{name: 'ReleaseName', type:'auto'},
			{name: 'PortfolioItemObjectID', type: 'auto'},
			{name: 'ProjectObjectID', type:'auto', defaultValue: undefined},
			{name: 'Description', type: 'auto'},
			{name: 'Impact', type: 'auto'},	
			{name: 'MitigationPlan', type: 'auto'},
			{name: 'RiskLevel', type: 'auto'},
			{name: 'Status', type: 'auto'},
			{name: 'OwnerObjectID', type: 'auto'},
			{name: 'SubmitterObjectID', type: 'auto'},
			{name: 'Checkpoint', type: 'auto'}
		],
		validations: [
			{type: 'RiskID', field: 'RiskID'},
			{type: 'RiskReleaseName', field: 'ReleaseName'},
			{type: 'RiskPortfolioItemObjectID', field: 'PortfolioItemObjectID'},
			{type: 'RiskProjectObjectID', field: 'ProjectObjectID'},
			{type: 'RiskDescription', field: 'Description'},
			{type: 'RiskImpact', field: 'Impact'},
			{type: 'RiskMitigationPlan', field: 'MitigationPlan'},
			{type: 'RiskStatus', field: 'Status'},
			{type: 'RiskLevel', field: 'RiskLevel'},
			{type: 'RiskOwnerObjectID', field: 'OwnerObjectID'},
			{type: 'RiskSubmitterObjectID', field: 'SubmitterObjectID'},
			{type: 'RiskCheckpoint', field: 'Checkpoint'}
		],
		statics:{
			isValidRiskID: function(riskID){
				return typeof riskID === 'string' && riskID.indexOf(RISK_KEY_PREFIX) === 0;
			},
			getStatusOptions: function(){
				return STATUS_OPTIONS.slice();
			},
			getRiskLevelOptions: function(){
				return RISK_LEVEL_OPTIONS.slice(); 
			}
		}
	});
}());