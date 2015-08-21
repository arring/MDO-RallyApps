##Function
This app displays CFD charts for a given product and the features below it. When the title of a Feature CFD chart title is clicked, the user is taken to the detail page for that feature. When the content area of the CFD chart is clicked, a popup is displayed with a user story grid for that feature.
##Issues
Some decisions need to be made about how this app operates.
While it is given that all Features pulled by this app should be scoped to the selected release, the stories themselves may belong to any release. This presents the issue of do we show all stories before and after the release or do we show incomplete data that is scoped solely within the time constraints of the release. If the former is chosen, the app will need to be changed such that the minimum and maximum snapshot dates are found and given to the FCF Calculator. If the later is chosen, not much, if anything, will need to be changed.
