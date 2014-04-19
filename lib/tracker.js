var log, _;

log = require('./log');

_ = require('underscore');

module.exports = {
  "interface": null,
  track: function(params) {
    if (this["interface"]) {
      if ((this["interface"].track == null) || !(_.isFunction(this["interface"].track))) {
        log('Cannot track - interface does not have a track method.');
      } else {
        return this["interface"].track(params);
      }
    } else {
      return log('No tracking interface.');
    }
  }
};
