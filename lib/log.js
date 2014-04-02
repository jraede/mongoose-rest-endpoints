var log, verbose, _;

_ = require('underscore');

require('colors');

verbose = false;

log = function() {
  var args;
  if (verbose) {
    args = _.values(arguments);
    args.unshift('[MRE]'.yellow.underline);
    return console.log.apply(this, args);
  }
};

log.verbose = function(v) {
  return verbose = v;
};

module.exports = log;
