/**
	SUMMARY:
		This file is used for Data Integrity Dashboard when built with sm-rab, since Rally's outer environment
		uses super old Highcharts, and we want to use the most recent Highcharts. Make sure to place this 
		file before the Highcharts library in the sm-config.json
*/
delete window.Highcharts;
delete window.HighchartsAdapter;