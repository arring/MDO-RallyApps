/**
	this mixin takes in a releaseRecord and points for the release and returns the color
	that it would be in Rally based on this algorithm (same defaults are used):
		https://help.rallydev.com/track-portfolio-items#coloralg
*/
(function() {
	var Ext = window.Ext4 || window.Ext,
		RED_X_INTERCEPT = 40,	
		RED_X_SLOPE = 100/(100-RED_X_INTERCEPT),
		YELLOW_X_INTERCEPT = 20,
		YELLOW_X_SLOPE = 100/(100-YELLOW_X_INTERCEPT);
		
	Ext.define('Intel.lib.mixin.RallyReleaseColor', {
		
		/**
			Since releasePercentComplete (x value) and planEstimatePercentAccepted (y value) are between 0-100, 
			we set up are algorithm in the x and y ranges of 0-100 as well 
		*/
		getRallyReleaseColor: function(releaseRecord, completedPoints, totalPoints){
			var curDate = new Date()*1, 
				relStartDate = new Date(releaseRecord.data.ReleaseStartDate)*1,
				relEndDate = new Date(releaseRecord.data.ReleaseDate)*1,
				releasePercentComplete = 100*(curDate - relStartDate)/(relEndDate - relStartDate),
				planEstimatePercentAccepted = totalPoints === 0 ? 0 : 100*(completedPoints/totalPoints),
				redLineYValueAtX = (releasePercentComplete - RED_X_INTERCEPT)*RED_X_SLOPE,
				yellowLineYValueAtX = (releasePercentComplete - YELLOW_X_INTERCEPT)*YELLOW_X_SLOPE;
				
			releasePercentComplete = (releasePercentComplete > 100 ? 100 : (releasePercentComplete < 0 ? 0 : releasePercentComplete));
			redLineYValueAtX = redLineYValueAtX < 0 ? 0 : redLineYValueAtX;
			yellowLineYValueAtX = yellowLineYValueAtX < 0 ? 0 : yellowLineYValueAtX;
			
			if(planEstimatePercentAccepted === 0) return 'white';
			if(planEstimatePercentAccepted > 0 && releasePercentComplete < 0) return 'lightgray';
			if(planEstimatePercentAccepted === 100) return 'gray';
			if(planEstimatePercentAccepted > yellowLineYValueAtX) return 'green';
			if(planEstimatePercentAccepted <= yellowLineYValueAtX && planEstimatePercentAccepted > redLineYValueAtX) return 'yellow';
			if(planEstimatePercentAccepted <= redLineYValueAtX) return 'red';
			throw new Error('invalid getRallyColor input');
		}
	});
})();
