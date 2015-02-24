var fs = require('fs'),
	path = require('path'),
	curPath = __dirname;
	
function lookForFiles(curPath, targetFileName){
	var files = [];
	fs.readdirSync(curPath).forEach(function(fileName){
		var filePath = curPath + '/' + fileName;
		if(fileName == targetFileName) files.push(filePath);
		if(fs.statSync(filePath).isDirectory()) files = files.concat(lookForFiles(filePath, targetFileName));
	});
	return files;
}

function deleteFolderRecursive(path){
	if(fs.existsSync(path)){
		fs.readdirSync(path).forEach(function(file){
			var filePath = path + "/" + file;
			if(fs.lstatSync(filePath).isDirectory()) deleteFolderRecursive(filePath);
			else fs.unlinkSync(filePath);
		});
		fs.rmdirSync(path);
	}
}
deleteFolderRecursive('deploy-files');
fs.mkdir('deploy-files');
fs.mkdir('deploy-files/sm-rab-deploy-files/');

var deployFiles = lookForFiles(__dirname, 'App-uncompressed.html'),
	smRabFiles = lookForFiles(__dirname, 'sm-app.html');

deployFiles.forEach(function(filePath){ 
	var newFileName = path.basename(path.dirname(path.dirname(filePath))) + '-custom-app.html';
	fs.writeFileSync('deploy-files/' + newFileName, fs.readFileSync(filePath));
});

smRabFiles.forEach(function(filePath){ 
	var newFileName = path.basename(path.dirname(path.dirname(filePath))) + '-custom-sm-rab-app.html';
	fs.writeFileSync('deploy-files/sm-rab-deploy-files/' + newFileName, fs.readFileSync(filePath));
});
