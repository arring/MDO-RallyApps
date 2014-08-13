SAFe Readme
===========

## Workspace Requirements

This app requires a few things set up in your Rally workspace for it to work as is:
- You need custom fields on the following things
    - HierarchicalRequirement: c_Dependencies (32 kB)
    - PortfolioItem/Feature: c_Risks (32 kB), and c_TeamCommits (32 kB)
- You need to have a particular naming convention for your ARTs, Releases and scums. 
    - ARTs naming convention: <ART Name> "ART" <optional other text>
        examples are "Alpha ART ABC", "Bravo ART", "Charlie ART (ABC)"
    - Scrums naming convention: <scrum name> "-" <ART name> 
        examples are "Team1 - Alpha"
    - Releases just have to contain the ART they belong to. Example: "Q314 Bravo"
  
##Challenges faced and Workarounds/solutions

1.  The first issue faced was adding buttons and grids into table cells. My First solution, found from stack overflow 
    was to render the button and grid after-the-fact:
  
        renderer:function(val, meta, record){
            var id = Ext.id();
            Ext.defer(function(){
                Ext.widget({
                xtype:'button',
                        text:'click me',
                        handler:function(){...},
                        renderTo: id
                    });
                }, 50);
            return Ext.String.format("<div id="{0}"></div>", id);
        }
  
    But this was a bad solution because it made the grid look really choppy and flicker on every refresh, and it was really
  pronounced on large grids. 
  
    The second solution was to use Skirtles 'componentcolumn' class that he provides on his website, skirtlesden.com
    The component column allows you to return a component in the renderer, as opposed to a string, which allowed for 
    returning a rallygrid and button config. I used a cache to reuse the grids in the cells, instead of recreating a new
    grid and store for every grid refresh (that also caused a flicker during refresh anyways).
  
2.  The second issue was not being able to fully use the wsapi query language due to Ext's filter syntax. This poses        problems when you need at least one OR clause in your query, as you cannot make 'ORs' in Extjs' filter language.
    The workaround I found was to override the _hydrateModel to sneak in the filter string. here is an example of what
    I mean:

		var filterString = Ext.create('Rally.data.wsapi.Filter', {
			property:'Project.ObjectID',
			value: me.ProjectRecord.get('ObjectID')
		}).or(Ext.create('Rally.data.wsapi.Filter', { 
			property:'Name',
			operator:'contains',
			value: trainName
		})).toString();

		var store = Ext.create('Rally.data.wsapi.Store',{
			model: //model type
			limit:Infinity,
			fetch: //fields to fetch
			context:{
				workspace: me.getContext().getWorkspace()._ref,
				project: null
			},
			filters:[
				{
					property:'Dummy',
					value:'value'
				}
			],
			listeners: {
				load: {
					fn: function(store, records){
						//do stuff with store
					},
					single:true
				}
			}
		});
		store._hydrateModelAndLoad = function(options){
            var deferred = new Deft.Deferred();

            this.hydrateModel().then({
                success: function(model) {
					this.proxy.encodeFilters = function(){ //inject custom filter here. woot
						return filterString;
					};
                    this.load(options).then({
                        success: Ext.bind(deferred.resolve, deferred),
                        failure: Ext.bind(deferred.reject, deferred)
                    });
                },
                scope: this
            });
		};
		store.load();

    Notice how I use fake values 'Dummy' and 'value' in the filters field. These are needed or else the filter injected into
    _hydrateModelAndLoad will not get sent to the server. This work around gets the job done, but is hacky none-the-less.
    
3.
