/*
 * Copyright (c) 2014 Pixel Flavor LLC. All Rights Reserved.
 * Please see the LICENSE file included with this distribution for details.
 */

var fs = require('fs');
var crypto = require('crypto');

// var gaze = require('gaze');
var lazy = require('lazy');
var _ = require('underscore');
var moment = require('moment');
var watch = require('watch');
var _s = require('underscore.string');
var child_process = require('child_process');

var pubnub = {};
var config = require('./config');
var log = require('./log');

var watcher = {};
var cwd = process.cwd();
var exec = child_process.exec;

var files = {};

function getCurrentBranch(next) {
    exec('git rev-parse --abbrev-ref HEAD', function (error, stdout, stderr) {
        if (error !== null) {
            log.error('exec error: ' + error);
            return;
        }
        next(_s.trim(stdout));
    });      
}

function getCurrentGitHash(next) {
    exec('git rev-parse --short HEAD', function (error, stdout, stderr) {
        if (error !== null) {
            log.error('exec error: ' + error);
            return;
        }
        next(_s.trim(stdout));
    });    
}

function getFileStatus(string) {
    var status = _s.trim(string.substring(0, 2));
    switch (status) {
        case 'M':
            return 'modified';
        case 'D':
            return 'deleted';
        case 'A':
            return 'added';            
        case '??':
            return 'added';            
        default:
    }
}

function getFilePath(string) {
    return _s.trim(string.substring(2));
}

function getFilenameHash(filename) {
    return crypto.createHash('md5').update(filename).digest('hex');
}

function parseGitLogPretty(status) {
    var splitStatus = _.compact(status.split('hash:'));
    var gitHash = null;
    var gitDate = null;
    var gitUser = null;
    var newArray = [];

    function processSplitStatus(item, index) {
        var lineArray = _.compact(_s.lines(item));
        _.each(lineArray, processLineItems);    

    }
    _.each(splitStatus, processSplitStatus);

    function processLineItems(item, index) {
        if (!item) {
            return;
        }

        if (index === 0) {
            var hashAndDate = item.split('~~');
            gitHash = _s.trim(hashAndDate[0]);
            gitDate = moment(new Date(_s.trim(hashAndDate[1]))).format('X');
            gitUser = _s.trim(hashAndDate[2]);
            return;
        }

        var filePath = getFilePath(item);
        var fileHash = getFilenameHash(filePath);
        var fileGitHash = fileHash + gitHash;

        if (gitUser === config.developer.name) {
            newArray.push({
                when: gitDate,
                gitHash: gitHash,
                fileHash: fileHash,
                filePath: filePath,
                status: getFileStatus(item),
                updated: (!files[fileGitHash])
            });      
        }
    }

    return newArray;
}

function getGitLogPretty(next) {
    exec('git log --name-status --pretty=format:"hash:%h~~%cd~~%cn" origin/master...HEAD', function (error, stdout, stderr) {
        if (error !== null) {
            log.error('exec error: ' + error);
            return;
        }
        var parsed = parseGitLogPretty(_s.trim(stdout));
        next(parsed);
    });    
}

function parseGitStatus(gitHash, status) {

    var statusArray = _s.lines(status);
    var newArray = [];
    _.each(statusArray, function(item, index) {
        var filePath = getFilePath(item);
        var fileHash = getFilenameHash(filePath);

        if (filePath === '') {
            return;
        }
        newArray.push({
            gitHash: 'working',
            fileHash: fileHash,
            filePath: filePath,
            status: getFileStatus(item),
            updated: (!files[fileHash + 'working'])
        });
    });
    return newArray;
}

function getGitStatus(next) {
    exec('git status --porcelain', function (error, stdout, stderr) {
        if (error !== null) {
            log.error('exec error: ' + error);
            return;
        }
        getCurrentGitHash(function(gitHash) {
            var parsed = parseGitStatus(gitHash, _s.trim(stdout));
            next(parsed);            
        });
    });    
}

function filterForAction(fileArray, next) {
    log.debug('[watcher] filterForAction() fileArray =');

    var clonedFilesObj = _.clone(files);
    var pushArray = [];

    _.each(fileArray, function(item, index) {
        var fileGitHash = item.fileHash + item.gitHash;

        if (clonedFilesObj[fileGitHash]) {
            delete clonedFilesObj[fileGitHash];
        }

        if (item.updated) {
            pushArray.push(item);
        }

        if (!files[fileGitHash]) {
            files[fileGitHash] = item;
        }        
    });

    _.each(clonedFilesObj, function(value, key) {
        var itemValue = value;
        itemValue.deleteItem = true;

        pushArray.push(itemValue);
        delete files[key];
    });

    next(pushArray);
}

function getAllGitChanges(next) {
    getGitStatus(function(gitStatusArray) {
        getGitLogPretty(function(gitLogPrettyArray) {
            filterForAction(_.union(gitStatusArray, gitLogPrettyArray), next);
        });
    });
}

var throttleGetAllGitChanges = _.throttle(getAllGitChanges, 50, {leading: false});

function onFileEvent(event, filepath) {  
    getCurrentBranch(function(currentBranch) {
        throttleGetAllGitChanges(function(fileArray) {
            var message = {
                head: currentBranch,
                dev: config.developer.name,
                changes: fileArray
            };

            if (fileArray.length !== 0) {
                pubnub.publish({ 
                    channel: config.projectKey + '-filestat',
                    message: message,
                    callback: function(e) { log.debug( 'SUCCESS!', e ); },
                    error: function(e) { log.error( 'FAILED! RETRY PUBLISH!', e ); }
                });
            } else {
                log.debug("No changes to push.");
            }
        });
    });

    log.trace(filepath.replace(cwd, '') + ' was ' + event);
}

function onNewConnection() {
    log.debug('[watcher] onNewConnection()');
    files = {};
    onFileEvent('newConnection', 'none'); 
}

var throttleOnEvent = _.debounce(onFileEvent, 50);

function filterDir(path, stat) {
    return (!config.paths.some(function(item) {
        return (new RegExp('\\b' + item + '\\b')).test(path);
    }));
}

watcher.start = function(next) {
	// We need to initialize pubnub here to make sure the config is set.
	pubnub = require('./pubnub');
    config = require('./config');

    watch.createMonitor(process.cwd(), {filter: filterDir}, function (monitor) {
        monitor.on("created", function (f, stat) {
            throttleOnEvent('created', f);
        });
        monitor.on("changed", function (f, curr, prev) {
            throttleOnEvent('changed', f);
        });
        monitor.on("removed", function (f, stat) {
            throttleOnEvent('removed', f);
        });
    });

    /**
    TODO: Get GAZE working again. For some reason GAZE crashes when too many files are changed.
    Watch works perfectlty. But is much slower to respond.
    **/

    // var responder;
    // gaze(config.paths, {cwd: process.cwd(), interval: 50}, function(err, watcher) {
    //     // this.on('all', throttleOnEvent);
    //     this.on('all', function(event, filepath) {
    //         if (!responder) responder = setTimeout(function() {
    //             throttleOnEvent(event, filepath);
    //             responder = undefined;
    //         }, 20);
    //     });
    // });

    pubnub.subscribe({
        channel: config.projectKey + '-filestat',
        callback: function(message) {
            log.trace(JSON.stringify(message));
        },
        connect: onNewConnection
    });  

    pubnub.subscribe({
        channel: config.projectKey + '-connections',
        callback: onNewConnection
    });    
};

module.exports = watcher;