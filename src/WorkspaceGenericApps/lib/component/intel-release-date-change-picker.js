/** 
	SUMMARY:
		This component is an easy release date picker based off Rally.ui.picker.DatePicker. Example:
			{
				xtype:'intelreleasedatachangepicker',
				labelWidth: 80,
				width: 240,
				ProjectRecord: me.ProjectRecord,
				currentRelease: me.ReleaseRecord,
				CfdAppsPref : me.CfdAppsPref,
				initialLoad: true,
				listeners: { ReleaseDateChangeOptionSelected: me._renderReleaseDateChangePicker.bind(me) }
			}		
		YOU MUST PASS IT 3 THINGS IN THE CONFIG
			1: Project Record 
			2: currentRelease (what to show as initial value
			3: if its initial load
	*/
(function(){
	var Ext = window.Ext4 || window.Ext;
	
	Ext.define('Intel.lib.component.ReleaseDateChangePicker', {
		extend:'Ext.container.Container',
		requires:['Rally.ui.picker.DatePicker',
			'Ext.button.Button'],
		alias: ['widget.intelreleasedatachangepicker'],

		/**________________________________________ YOU MUST SUPPLY THESE ________________________________________*/
		ProjectRecord: null,
		currentRelease: null,
		CfdAppsPref: null, 
		initialLoad: null,
		items:[],
		/**________________________________________ INITIALIZE/PRIVATE METHODS ________________________________________*/
		initComponent: function(){
			var me = this;
			if(me.initialLoad){
				me._renderOption();
			} else {
				me._renderCalendarAndButton();
			}
			me.callParent(arguments);
		},
		/**________________________________________ Render Option to render Calendar and button ________________________________________*/
		_renderOption: function(){
			var me = this;
			Ext.apply(me,{
				xtype:'container',
				id:'releasedatepicker-wrapper',
				width:'390px',
				layout:{
					type:'hbox'
				},
				items:[{
					xtype:'component',
					id:'cntClickForDateChange',
					cls:'clickForDateChange',
					autoEl: {
						tag: 'a',
						html: 'Please Click here to change the Release Start Date'
					},
					listeners   : {
						el : {
							click: {
								element: 'el', //bind to the underlying el property on the panel
								fn: function(){ 
									me._renderCalendarAndButton();
								}
							}
						}
					}
				}]	
			});			
		},
		/**________________________________________ Render Calendar and button ________________________________________*/		
		_renderCalendarAndButton: function(){
			var me = this;
			var datePickerDefaultDate;
			var rid = me.currentRelease.data.ObjectID;
			var pid = me.ProjectRecord.data.ObjectID;			
			me.fieldLabel = 'Select Release Start Date';
			me.labelWidth = 140;
			if(typeof me.CfdAppsPref.releases[rid] !== 'object') me.CfdAppsPref.releases[rid] = {};
			me.minValue= new Date(new Date(me.currentRelease.data.ReleaseStartDate)*1 /* + _6days */);
			me.value = _.isEmpty(me.CfdAppsPref.releases[rid]) ? me.minValue: new Date(me.CfdAppsPref.releases[rid].ReleaseStartDate) ;
			me.maxValue = me.currentRelease.data.ReleaseDate > new Date() ? new Date() : me.currentRelease.data.ReleaseDate;
			me.showToday = false;
			Ext.getCmp('releasedatepicker-wrapper').removeAll();
			Ext.getCmp('releasedatepicker-wrapper').add({
				xtype: 'rallydatefield',
				id:'ReleaseDatePicker',
				fieldLabel: 'Select Release Start Date',
				labelWidth:140,
				minValue: me.minValue,
				maxValue: me.maxValue,
				value: me.value,
				showToday:false
				},{
				xtype:'button',
				text: 'Update',
				id: "btnUpdateReleaseDate",
				scope: me,
				handler: function() {
					//when the button is click
					//save the date in the app preference
					var dateSelected = Ext.getCmp('ReleaseDatePicker').value;
 						me.CfdAppsPref.releases[rid] = me.CfdAppsPref.releases[rid] || {};
						//me.CfdAppsPref.projs[pid][rid] =  me.CfdAppsPref.projs[pid][rid] || {};
						me.CfdAppsPref.releases[rid].ReleaseStartDate = dateSelected; 
						me.fireEvent('releaseDateChanged',dateSelected,me.CfdAppsPref);	
				}	
			});			
		}
	});
}());
