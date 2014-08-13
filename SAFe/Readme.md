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
1. The first issue faced was adding buttons and grids into table cells. My First solution, found from stack overflow
  was to render the button and grid after-the-fact:
  > renderer:function(val, meta, record){
  >   var id = Ext.id();
  >   Ext.defer(function(){
  >     Ext.widget({
  >       xtype:'button',
  >       text:'click me',
  >       handler:function(){...},
  >       renderTo: id
  >     });
  >   }, 50);
  >   return Ext.String.format("<div id="{0}"></div>", id);
  > }
  
  But this was a bad solution because it made the grid look really choppy and flicker on every refresh, and it was really
  pronounced on large grids. 
  
  The second solution was to use Skirtles 'componentcolumn' class that he provides on his website, skirtlesden.com
  The component column allows you to return a component in the renderer, as opposed to a string, which allowed for 
  returning a rallygrid and button config. I used a cache to reuse the grids in the cells, instead of recreating a new
  grid and store for every grid refresh (that also caused a flicker during refresh anyways).
  
2. 
