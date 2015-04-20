(function(){
	var Ext = window.Ext4 || window.Ext;

		/** Mixin functions related to queries, you need to require Q as a dependency in your rally app
		Q can be found here: https://cdnjs.cloudflare.com/ajax/libs/q.js/1.0.1/q.js
		most functions return promises that resolve to stores
	*/

	Ext.define('ReleaseQuery', {

		_loadAllReleases: function(projectRecord){
			var deferred = Q.defer();
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Release',
				limit:Infinity,
				autoLoad:true,
				fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[
					{
						property:'Project.ObjectID',
						value: projectRecord.data.ObjectID
					}
				],
				listeners: {
					load: {
						fn: function(releaseStore, releaseRecords){
							console.log('releases loaded:', releaseRecords);
							deferred.resolve(releaseStore);
						},
						single:true
					}
				}
			});
			return deferred.promise;
		},

		/** gets releases for this project that have release date >= now. returns promise that resolves to the releaseStore */
		_loadReleasesInTheFuture: function(projectRecord){
			var deferred = Q.defer();
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Release',
				limit:Infinity,
				autoLoad:true,
				fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[
					{
						property:'Project.ObjectID',
						value: projectRecord.data.ObjectID
					},{
						property:'ReleaseDate',
						operator:'>=',
						value: new Date().toISOString()
					}
				],
				listeners: {
					load: {
						fn: function(releaseStore, releaseRecords){
							console.log('releases loaded:', releaseRecords);
							deferred.resolve(releaseStore);
						},
						single:true
					}
				}
			});
			return deferred.promise;
		},

		/** loads this release for each scrum whose name contains the second parament. returns promise with the release Store
			the scrums that the releases belong to will have at least 1 team member, and the train's release is not included
			in the results.
		**/
		_loadReleasesWithName: function(releaseName, nameContains){
			var deferred = Q.defer();
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Release',
				limit:Infinity,
				autoLoad:true,
				fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project', 'TeamMembers'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[
					{
						property:'Name', //match the release
						value: releaseName
					},{
						property:'Project.Name',
						operator:'contains',
						value:nameContains
					},{
						property:'Project.Children.Name', //has children
						operator:'=',
						value:''
					},{
						property:'Project.Name', //but not the train release itsself
						operator:'!contains',
						value:' ART'
					}
				],
				listeners: {
					load: {
						fn: function(store, records){
							console.log('releasesWithName loaded:', records);
							deferred.resolve(store);
						},
						single:true
					}
				}
			});
			return deferred.promise;
		},

		_loadReleaseByNameForProject: function(releaseName, projectRecord){
			var deferred = Q.defer();
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Release',
				limit:Infinity,
				autoLoad:true,
				fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
					property:'Name',
					value: releaseName
				},{
					property:'Project',
					value:projectRecord.data._ref
				}],
				listeners: {
					load: {
						fn: function(store, records){
							deferred.resolve(records.pop());
						},
						single:true
					}
				}
			});
			return deferred.promise;
		},

		_loadReleasesByNameContainsForProject: function(releaseName, projectRecord){
			var deferred = Q.defer();
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Release',
				limit:Infinity,
				autoLoad:true,
				fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[{
					property:'Name',
					operator:'contains',
					value: releaseName
				},{
					property:'Project',
					value:projectRecord.data._ref
				}],
				listeners: {
					load: {
						fn: function(store, records){
							deferred.resolve(records);
						},
						single:true
					}
				}
			});
			return deferred.promise;
		},
		/** gets releases for this project that have release date >= givenDate. returns promise that resolves to the releaseStore */
		_loadReleasesAfterGivenDate: function(projectRecord, givenDate){
			var deferred = Q.defer();
			Ext.create('Rally.data.wsapi.Store',{
				model: 'Release',
				limit:Infinity,
				autoLoad:true,
				fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
				context:{
					workspace: this.getContext().getWorkspace()._ref,
					project: null
				},
				filters:[
					{
						property:'Project.ObjectID',
						value: projectRecord.data.ObjectID
					},{
						property:'ReleaseDate',
						operator:'>=',
						value: new Date(givenDate).toISOString()
					}
				],
				listeners: {
					load: {
						fn: function(releaseStore, releaseRecords){
							console.log('releases loaded:', releaseRecords);
							deferred.resolve(releaseStore);
						},
						single:true
					}
				}
			});
			return deferred.promise;
		},
	/** gets releases for this project that have release within the given dates. returns promise that resolves to the releaseStore */
	_loadReleasesBetweenDates: function(projectRecord, startDate, endDate){
		var deferred = Q.defer();
		Ext.create('Rally.data.wsapi.Store',{
			model: 'Release',
			limit:Infinity,
			autoLoad:true,
			fetch: ['Name', 'ObjectID', 'ReleaseDate', 'ReleaseStartDate', 'Project'],
			context:{
				workspace: this.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Project.ObjectID',
					value: projectRecord.data.ObjectID
				},{
					property:'ReleaseDate',
					operator:'<=',
					value: new Date(endDate).toISOString()
				},{
					property:'ReleaseDate',
					operator:'>=',
					value: new Date(startDate).toISOString()
				}
			],
			listeners: {
				load: {
					fn: function(releaseStore, releaseRecords){
						console.log('releases loaded:', releaseRecords);
						deferred.resolve(releaseStore);
					},
					single:true
				}
			}
		});
		return deferred.promise;
	},
		/** gets the most likely release to scope to base on the following order:
			1) if this.AppPrefs.projs[pid] is set to a release ObjectID, and the ReleaseStore has that release (you need
							to use preferences for this one)
			2) if we are in a release
			3) the closest release planning date to the current date
		*/
		_getScopedRelease: function(releaseRecords, projectOID, appPrefs){
			var me=this,
				d = new Date(),
				rs = releaseRecords,
				prefOID = appPrefs && appPrefs.projs && appPrefs.projs[projectOID] && appPrefs.projs[projectOID].Release;
			return (prefOID && _.find(rs, function(r){ return r.data.ObjectID == prefOID; })) ||
				_.find(rs, function(r){
					return (new Date(r.data.ReleaseDate) >= d) && (new Date(r.data.ReleaseStartDate) <= d);
				}) ||
				_.reduce(rs, function(best, r){
					if(best===null) return r;
					else {
						var d1 = new Date(best.data.ReleaseStartDate), d2 = new Date(r.data.ReleaseStartDate), now = new Date();
						return (Math.abs(d1-now) < Math.abs(d2-now)) ? best : r;
					}
				}, null);
		}
	});
}());