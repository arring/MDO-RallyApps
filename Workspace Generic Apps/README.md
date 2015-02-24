Workspace Generic Apps
======================

To use these apps, you must first add the "Workspace Train Configuration" app
and then set the Trains and Portfolio locations for your workspace. After 
that everything else should work (except the SAFe apps, read the README for them
for additional config instructions).

All the deploy files are located in the deploy-files/ folder. Just copy and paste
the contents of those files into the custom app in rally. 

All the deploy files generated with sm-rab are located in the 
deploy-files/sm-rab-deploy-files/ folder. 

If you want to change something in the apps, go into the source, change the code,
run rally-app-builder build (rab) or sm-rab depending on the desired output file.
then come back to this directory and run node build.js to update the deploy-files/
directory.

## Note on permissions
many errors occur due to lack of proper permissions to edit projects. You need to be
a workspace admin to edit the workspace configuration app. You need to have editor
privileges to any project you want to add a dependency to. And you need editor access
to you portfolio projects (if they are different from your train project) if you want 
to edit risks and team-commits
