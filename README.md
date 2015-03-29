MDO-RallyApps
=============

A sweet suite of apps!


## For People who just want code
all the files are in the dist folder. just copy and paste into a custom app

## For Developers

To install: (must have git and node in PATH)
	git clone
	npm install -g rally-app-builder sm-rab grunt-cli bower node-inspector
	npm install
	bower install
	grunt init //npm installs all the projects so they can be tested

Test: 						grunt test
jshint: 					grunt jshint && grunt appsjshint //jshints the base and apps
build dist files:	grunt build

In the test folder at the root directory are the Gruntfile and jasmine 
template you should use for your projects. Copy/Paste them into your
project if you want to just worry about writing your tests. 
	
