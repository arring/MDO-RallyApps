MDO-RallyApps
=============

A sweet suite of apps.

## How to use these apps in your Workspace
All the apps are in the `dist/` folder.

__Before you install any app:__ You need to install the `dist/Workspace Configuration.html` custom app. This app configures the various things such as Trains, Horizontals, and locations of specific projects. 

After you install the `dist/Workspace Configuration.html` app, you can install any of the other apps in the `dist/` folder by copying the code into a custom app page in Rally.

__Many Apps have extra configuration__: Especially all the `SAFe` apps, like `dist/Team Report.html` and `dist/Risk Swimlanes.html`, etc... To look at these extra configuration options, look at the Wiki page for that app.

## For Developers
All the apps are in the `src/` folder, and all the generated output files are in the `dist/` folder. You can go
edit and add apps to the src as long as they follow the conventions of the other apps.
Do NOT `npm install` stuff for your apps, instead, if you need devDependencies for your app,
install them in the root directory

### Root-level directory commands
- To install: (must have git, npm, and node in PATH)

		git clone
		npm install -g rally-app-builder sm-rab jshint
		npm install

- To Test: `npm run test` 
- To Lint: `npm run lint`
- To build dist/ files: `npm run build`

### NOTES ABOUT DEVELOPING EXTERNALLY:

There are a few reasons why it is easier to develop some apps in rally using the copy/paste method instead of developing locally:

- Rally.environment is not set. You can't do Rally.env.Environment.getContext() or get the current user, project, workspace etc.
- CORS, cookies, and iframes: we have no access to Rally's auth cookies when pointed
	at localhost, or using the file:/// protocol so we use JSONP for the "Posting" to Rally.
	This doesn't work for updating Dependencies, Risks, or other Custom Fields that make
	the GET request URL too long for JSONP. (The POST data gets put in the URL since you 
	cant make a JSONP GET with a request body.
- Hangman Tokens: Rally's server needs to render the __PROJECT_OID__ and other hangman
	variables you have in your code. 
- `rab run` doesn't work when you have `../../<rest of path>` in your config.json file because it ignores the `../../` -- one way around this is to open `App-Debug.html`
	- FIXED: using the `file:///` protocol in your browser, which uses the relative links correctly.
	- FIXED: creating a simple express server that serves the files (avoiding the `file:///` protocol)

### WSAPI NOTES

- __DO NOT USE PROJECTSCOPEDOWN FOR WORK ITEMS!__ It sometimes does not work correctly. Its better to first get the Parent Project -> then get the child projects from it (usually by getting all projects and then filtering by ones under the Train Project) -> then create a query with a bunch of (project.ObjectID = ...) OR'ed together. 

- Sometimes we want to get the stories in a Release. The way I currently Do that is a query similar to this: ((Release.Name = X) OR (DirectChildrenCount = 0) AND ((Release.Name = null) AND (Feature.Release.Name = X))). We need the DirectChildrenCount = 0 or else we will double count parent UserStories's PlanEstimates.

- you have to use `sdk 2.0rc3` instead of `sdk 2.0` because there is a weird issue in the sdk with fetch:[] fields and compress:true used together in queries. This bug makes some fetch:[] fields not return correctly
	
### LOOKBACK NOTES

- When doing lookback queryies for stories, you almost always want just the child stories, so you
	should add to the find field: Children: null. If you have Release: <releaseOID> already in the find,
	you dont need to worry about it, since only leaf stories can be tied to a Release.