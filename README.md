MDO-RallyApps
=============

A sweet suite of apps!


## For People who just want code
all the files are in the dist folder. just copy and paste into a custom app

## For Developers

all the apps are in the src/ folder, and all the dist files are in the dist folder. you can go
edit and add apps to the src as long as they follow the conventions of the other apps.
Do NOT install grunt-* stuff for your apps, instead, if you need devDependencies for your app,
install them in the root directory and then use 
[this module](https://github.com/ssteffl/load-grunt-plugins-from-parent) (which is already installed).

when you make changes to your app and are ready to push, come back to the root direcotry and 
run: grunt. This will go through and lint, test, and build everything. If you broke something,
you will know...

Some tests are already wired up for selenium e2e testing and jasmine unit testing. If you want
to test just use those apps as a template. 

### Testing Configuration
- If you are on Windows, in order to use IEWebDriver, you need to follow the extra instructions
[located here](https://code.google.com/p/selenium/wiki/InternetExplorerDriver#Required_Configuration).
- to run the tests for this suite you MUST get an API key from rally [here](https://rally1.rallydev.com/login/).
copy the key and make it the contents of config/rally-apikey, which you must create. This is required to 
run tests that setup and teardown mock workspaces. You must have subscription
- add the testing workspaceOID to config/rally-testing-workspaceOID

NOTE: your rallyApiKey must have workspace Admin priveledges for the testing workspace.

### Root-level directory commands
- To install: (must have git, npm, and node in PATH)
	- git clone
	- npm install -g rally-app-builder sm-rab grunt-cli bower jshint node-inspector selenium-standalone
	- npm install
	- bower install
	- grunt init

- To Test: grunt test
- jshint: grunt jshint && grunt appsjshint
- build dist files:	grunt build

### NOTES ABOUT DEVELOPING EXTERNALLY:

There are a few reasons why you must develop some apps in rally using the copy/paste
method. 

- Rally.environment is not set, this is a huge pain for testing and were working on correcting
	this issue.
- CORS, cookies, and iframes: we have no access to Rally's auth cookies when pointed
	at localhost, or using the file:/// protocol so we use JSONP for the "Posting" to Rally.
	This doesn't work for updating Dependencies, Risks, or other Custom Fields that make
	the GET request URL too long for JSONP. (The POST data gets put in the URL since you 
	cant make a JSONP GET with a request body.
- rab run doesn't work when you have "../../<rest of path>" in your config.json file
	because it ignores the ../../ -- one way around this is to open App-Debug.html 
	- FIXED: using the file:/// protocol in your browser, which uses the relative links correctly.
- Hangman Tokens: Rally's server needs to render the __PROJECT_OID__ and other hangman
	variables you have in your code. 
	- FIXED: This is fixed by using Rally.environment.getContext().getProject()

### WSAPI NOTES

- DO NOT USE PROJECTSCOPEDOWN FOR ANYTHING! It does not work correctly. It only gets a handful of items. Its
	better to first get the Train -> then get the child projects from it (usually by getting all projects and
	then filtering by ones under the Train Project) -> then create a query with a bunch of (project.ObjectID = ...)
	OR'ed together. 
	
- Sometimes we want to get the stories in a Release. The way I currently Do that is a query similar to this:
	((Release.Name = X) OR (DirectChildrenCount = 0) AND ((Release.Name = null) AND (Feature.Release.Name = X))).
	We need the DirectChildrenCount = 0 or else we will double count parent UserStories's PlanEstimates.
	
### LOOKBACK NOTES

- When doing lookback queryies for stories, you almost always want just the child stories, so you
	should add to the find field: Children: null. If you have Release: <releaseOID> already in the find,
	you dont need to worry about it, since only leaf stories can be tied to a Release.