require('shelljs/global');

var fs = require('fs'),
	util = require('util'),
	path = require('path'),
	
	hasSmRab = which('sm-rab'),
	cwd = process.cwd(),
	format = util.format.bind(util),
	
	srcDir = path.resolve('src'),
	rabDeployDir = path.resolve('dist'),
	smDeployDir = path.resolve('dist/sm-dist');
	
function getFiles(targetFileName){
	return find(srcDir)
		.filter(function(fileName){ return new RegExp('\/' + targetFileName).exec(fileName); })
		.map(function(fileName){ return path.resolve(fileName); });
}
function buildEachProject(configFiles, buildCommand, srcFile, deployDir){
	configFiles.forEach(function(configFile){
		var appConfig = require(configFile),
			appName = appConfig.name,
			appDir = path.dirname(configFile),
			deployFile = format('%s/%s.html', deployDir, appName);
		echo('Building ' + appName);
		cd(appDir);
		exec(buildCommand);
		cp(srcFile, deployFile);
		echo('\n');
	});
}
function buildEachRabProject(){
	buildEachProject(getFiles('config.json'), 'rab', 'deploy/App-uncompressed.html', rabDeployDir);
}
function buildEachSmProject(){
	buildEachProject(getFiles('sm-config.json'), 'sm-rab', 'sm-deploy/sm-app.html', smDeployDir);
}

rm('-fr', rabDeployDir);
rm('-fr', smDeployDir);
mkdir(rabDeployDir);
mkdir(smDeployDir);
cd(cwd); buildEachRabProject();
cd(cwd); if(hasSmRab) buildEachSmProject(); else echo('You do not have sm-rab installed');