MDO-RallyApps
=============

A sweet suite of apps!


## For People who just want code
all the files are in the dist folder. just copy and paste into a custom app

## For Developers

- To install: (must have git and node in PATH)
	- git clone
	- npm install -g rally-app-builder sm-rab grunt-cli bower node-inspector
	- npm install
	- bower install
	- grunt init //npm installs all the projects so they can be tested

- Test: 						grunt test
- jshint: 					grunt jshint && grunt appsjshint //jshints the base and apps
- build dist files:	grunt build

In the test folder at the root directory are the Gruntfile and jasmine 
template you should use for your projects. Copy/Paste them into your
project if you want to just worry about writing your tests. 

### NOTES ABOUT DEVELOPING EXTERNALLY:

There are a few reasons why you must develop some apps in rally using the copy/paste
method. 
	- rab run doesn't work when you have "../../<rest of path>" in your config.json file because it ignores the ../../ -- one way around this is to open App-Debug.html using the file:/// protocol in your browser, which uses the relative links correctly.
	- CORS, cookies, and iframes: we have no access to Rally's auth cookies when pointed at localhost, or using the file:/// protocol so we use JSONP for the "Posting" to Rally. This doesn't work for updating Dependencies, Risks, or other Custom Fields that make the GET request URL too long for JSONP. (The POST data gets put in the URL since you cant make a JSONP GET with a request body.
	- Hangman Tokens: Rally's server needs to render the __PROJECT_OID__ and other hangman variables you have in your code

Apps that must be developed within Rally include: all the SAFe Apps, Portfolio Hierarchy
	
