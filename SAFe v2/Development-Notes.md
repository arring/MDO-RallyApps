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
    grid and store for every grid refresh (that also caused a flicker during refresh anyways). I am still using Skirtle's plugin.
  
3.	Proxy issue. I was using a memory proxy for the longest time before I realized that memory proxies are read-only, so 
	I overrode the memory proxies update, destroy and create methods to update the records, but this was pretty much turning it
	into a session storage proxy... which i later found out was what i needed. So i deleted my custom memory proxy class and
	switched to sessionstorage proxy. NOTE: I had to randomize the sessionstorage proxy with Math.random(), becasue it would 
	reuse the proxy on subsequent page refreshes, with all of its old data too.

4.	CURRENTLY NOT FIXED YET: Grid refreshing Problem. When the rallygrid refreshes, and there are a lot of records, 
	it does not preserve the scroll	on refresh. I checked online, and tried all the hacky solutions as well as using the 
	'Extjs' solution of setting 
	
		preserverScrollOnRefresh: true 
	
	in the config. But this did not fix anything.

5.	TODO: Talk about how annoying it is to keep things consistent in the dependencies grids, especieally becasue user 
	stories can get deleted, and dependencies are a many to one releationship, and can move between user stories. 
	Lots of logic for consistency. It is actually probably not possible to keep c_dependencies field consistent with 
	Predecessors and Successors fields on UserStories, becasue there are so many different ways these fields can be changed,
	especially outside these SAFe apps. Right now i just clobber everything in the Predecessor and Successor fields and make
	them match what the c_dependencies app contains.

6. 	TODO: talk about caching and how i messed it up for a long time, requireing me to reload EVERYTHING every single time 
	things were synced with proxy. I fixed that now by actually updating the proxy correctly. 

## Other Notes, common design patters
I ended up following my own design pattern in all the code. 

1. In the source code I separate everything into these categories (in this order in the source):
	1. data store/model methods
	2. launch method
	3. other miscellaneous functions sections.
	4. rendering methods 

2. I have a separate custom store for each of the grids/charts/ui things. I never use actual wsapi stores for ui component backing
	stores. I refresh the *real* feature/userstory/project/etc.. stores every 10-15 seconds on a timer, and then I reload the 
	custom stores to update the records that are not being edited or pending changes. 

3. model.getCollection('model type').sync(...); sync does not call the callback unless there are CRUD operations to perform, so 
	make sure to check for that. 
