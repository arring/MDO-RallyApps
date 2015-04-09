Train CFD Charts
================

This app shows CFD charts for a train and its children scrums
for a given release. You can filter by PortfolioItem and Release.
Trendlines are included.

NOTES
=====
Not using _ItemHierarchy because:
- we want to capture all work for the train's scrums in a release, including the stories not attached to a portfolioItem.
- it is slow to make a request for each of the ~70 portfolioItems, for each of the ~15 releases. thats 15 vs 15*70 requests.
		
Not using _ProjectHierarchy for the userStories because:
- we could _POSSIBLY_ run into issues with closed projects and permission errors (unless we use removeUnauthorizedSnapshots, but they recommend against that because everyone should see the same thing.
- Using (_ProjectHierarchy + _ValidFrom + _ValidTo) and hydrating the Release and Project takes WAY longer than just sending a request for (Release) for each of the Scrums under the train. Also the data ended up the same anyways, so there was no real reason to use the _ProjectHierarchy method.

The moral of the story is KEEP THE QUERIES AS SIMPLE AS POSSIBLE (that means no $in's $and's, $or's, _ProjectHierarchy's or _ItemHierarchies. Instead, make many requests with the specific ObjectIDs of the Releases or Projects you care about.

--------------------------------------
Conclusion: just iterating through the Scrums in the Train and sending a query for each of them for the scoped release is the fastest, easiest and most accurate way to do it.


INSTALL APP
===========
The following is how to install the app
- npm install
- grunt init

TESTING
=======
- grunt unitTestFast (headless unittest)
- grunt unitTest (unittest in ie,ff,chrome)
- grunt e2eTest (selenium/webdriver in ie,ff,chrome
- grunt test (jshint, unitTestFast, unitTest, e2eTest)


JSHINT
======
grunt jshint

BUILD
=====
rally-app-builder or rab