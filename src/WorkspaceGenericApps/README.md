Workspace Generic Apps
======================

To use these apps, you must first add the "Workspace Config" app
to configure for your workspace for the apps to use. After 
that everything else should work (except the SAFe apps, read the README for them
for additional config instructions).

## Note on permissions
Many errors occur due to lack of proper permissions to edit projects. You need to be
a workspace admin to edit the workspace configuration app. You need to have editor
privileges to any project you want to edit.

## Developer Notes

- You might create an app that loads userStories for a given release.
	The CORRECT filter for getting userStories under portfolioItems for a given release is:
	
			((Release.Name = "Q113") OR ((Release = null) AND (<lowestPortfolioItemType>.Release.Name = "Q113")))
	
	This above filter will get all stories in Q113 or stories not attached to a release, but
	their portfolioItem is attached to release Q113
	
- When fetching the portfolioItem field for UserStories, you must ALWAYS use `<lowestPortfolioItemType>`
	instead of `PortfolioItem`. This is because the two fields are really quite different:
	
	- `<lowestPortfolioItemType>`: all nested userStories have this, even leaf stories.
	- `PortfolioItem`: only the direct children of leaf portfolioItems have this field. Leaf stories
		with parent stories have PortfolioItem:null, which is usually not what we want.