/*
 * Copyright (c) 2014 Pixel Flavor LLC. All Rights Reserved.
 * Please see the LICENSE file included with this distribution for details.
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var child_process = require('child_process');

var lazy = require('lazy');
var git = require('nodegit');
var _ = require('underscore');
var _s = require('underscore.string');
var flow = require('gowiththeflow');

var configFilename = '.snitchConfig';
var gitPath = process.cwd() + '/.git';
var exec = child_process.exec;
var branch = 'master';

var config = {};
config.paths = ['**/*', '**/.*', '**/.git/*'];

var ignoreFiles = ['.gitignore', '.snitchignore'];

var configFilenameGlobal = getUserHome() + '/' + configFilename;
configFilename = process.cwd() + '/.snitchConfig';

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function getRemoteOriginUrl(next) {
    exec('git config --get remote.origin.url', function (error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
            return;
        }
        config.gitOriginUrl = _s.trim(stdout);
        checkConfigFile(next);
    });   
}

function checkConfigFile(next) {
    if (fs.existsSync(configFilename)) {
        fs.readFile(configFilename, 'utf8', function (err, data) {
            if (err) throw err;
            _.extend(config, JSON.parse(data));
            checkIgnoreFile(0, next);
        });
    } else if (fs.existsSync(configFilenameGlobal)) {        
        fs.readFile(configFilenameGlobal, 'utf8', function (err, data) {
            if (err) throw err;
            _.extend(config, JSON.parse(data));
            checkIgnoreFile(0, next);
        });
    } else {
        require('./setup').init(function() {
            checkConfigFile(next);
        });
    }    
}

function checkIgnoreFile(index, next) {
    if (!ignoreFiles[index]) {
        createProjectKey(next);
        return;
    }
    if (fs.existsSync(ignoreFiles[index])) {
        lazy(fs.createReadStream(ignoreFiles[index]))
            .lines
            .forEach(function(line){
                var lineAsString = line.toString();
                if (lineAsString.indexOf('/') === 0) {
                    lineAsString = lineAsString.substring(1);
                }
                if (fs.existsSync(lineAsString)) {
                    var fileStat = fs.statSync(lineAsString);
                    if (fileStat.isDirectory()) {
                        config.paths.push('!' + path.normalize(lineAsString) + '/**/*' );
                    }
                    if (fileStat.isFile()) {
                        config.paths.push('!**/' + lineAsString);
                    }
                }
            }).sum(function() {
                checkIgnoreFile(index + 1, next);
            });
    } else {
        checkIgnoreFile(index + 1, next);   
    }
}

function createProjectKey(next) {
    var password = (config.security.password) ? config.security.password : '';

    config.projectKey = crypto.createHash('md5').update(config.gitOriginUrl + password).digest('hex');

    next();
}

config.setup = function(next) {
    if (!fs.existsSync(gitPath)) {
        process.exit();
        return;
    }

    getRemoteOriginUrl(next);
};

module.exports = config;