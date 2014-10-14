/*
 * Copyright (c) 2014 Pixel Flavor LLC. All Rights Reserved.
 * Please see the LICENSE file included with this distribution for details.
 */

var crypto = require('crypto');
var child_process = require('child_process');

var fields = require('fields');
var Hashids = require("hashids");
var _s = require('underscore.string');
var jsonfile = require('jsonfile');

var config = require('./config');

var exec = child_process.exec;

var toSave = {};
toSave.developer = {};
toSave.security = {};
toSave.pubnubKeys = {};

function getGitUserName(next) {
    exec('git config user.name', function (error, stdout, stderr) {
        if (error !== null) {
            promptForUserName('', next);
            return;
        }
        promptForUserName(_s.trim(stdout), next);
    });   
}

function promptForUserName(name, next) {
	fields.Text({
		default: name,
	    promptLabel: 'What is your name?',
	    desc: 'This must match your git config name. To check use "git config user.name" in the command line.',
	   	validate: function (value) {
			if (!value) {
				throw new Error('Name is required.');
			}
			return true;
		}
	}).prompt(function (err, value) {
	    if (err) {
	        console.error('There was an error!\n' + err);
	    } else {
	        toSave.developer.name = _s.trim(value);
	        promptForGitHubUser(next);
	    }
	});
}

function promptForGitHubUser(next) {
	fields.Text({
	    promptLabel: 'What is your github username?',
	}).prompt(function (err, value) {
	    if (err) {
	        console.error('There was an error!\n' + err);
	    } else {
	        toSave.developer.githubUser = _s.trim(value);
	        promptForSubKey(next);
	    }
	});
}

function promptForSubKey(next) {
	fields.Text({
	    promptLabel: 'What is your PubNub subscription key?',
	   	validate: function (value) {
			if (!value) {
				throw new Error('Subscription key is required.');
			}
			return true;
		}
	}).prompt(function (err, value) {
	    if (err) {
	        console.error('There was an error!\n' + err);
	    } else {
	        toSave.pubnubKeys.subKey = _s.trim(value);
	        promptForPubKey(next);
	    }
	});		
}

function promptForPubKey(next) {
	fields.Text({
	    promptLabel: 'What is your PubNub publish key?',
	   	validate: function (value) {
			if (!value) {
				throw new Error('Publish Key is required.');
			}
			return true;
		}
	}).prompt(function (err, value) {
	    if (err) {
	        console.error('There was an error!\n' + err);
	    } else {
	        toSave.pubnubKeys.pubKey = _s.trim(value);
	        promptForPassword(next);
	    }
	});		
}

function promptForPassword(next) {
	var hashids = new Hashids((new Date().getTime()).toString(36));
	fields.Text({
		title: 'To protect your project information we require a password.',
		desc: 'This password will be the salt for your project url\nthat way it will not be guessable.\n\nYou will need this key to share with other project members.',
	    promptLabel: 'What is your project password?',
	    default: hashids.encode(new Date().getTime()),
	   	validate: function (value) {
			if (!value) {
				throw new Error('Password is required.');
			}
			return true;
		}
	}).prompt(function (err, value) {
	    if (err) {
	        console.error('There was an error!\n' + err);
	    } else {
	        toSave.security.password = _s.trim(value);
	        saveToFile(next);
	    }
	});		
}

function saveToFile(next) {
	jsonfile.writeFile(process.cwd() + '/.snitchconfig', toSave, function(err) {
		if (err) throw err;
		next();
	});
}

exports.init = function(next) {	
	if (!next) {
		next = function() {
			process.exit();
		};
	}
	getGitUserName(next);
};
