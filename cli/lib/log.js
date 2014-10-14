var chalk = require('chalk');
var _ = require('underscore');

var devLog = false;

var levels = {
	info: chalk.white,
	trace: chalk.grey,
	debug: chalk.blue,
	error: chalk.red,
	warn: chalk.yellow
};

_.each(levels, function(color, level) {
	if (!devLog && level !== 'info') {
		exports[level] = function() {};
		return;
	}
	exports[level] = function(msg) {
    	console.log(color('[' + level.toUpperCase() + ']') + (level.length !== 5 ? ' ' : '') + ' ' + msg);
  	};
});
