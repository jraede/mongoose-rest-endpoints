var HttpError;

module.exports = HttpError = (function() {
  HttpError.forge = function(msg, code) {
    var listener, _i, _len, _ref;
    if (this.listeners[code] != null) {
      _ref = this.listeners[code];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        listener = _ref[_i];
        listener(msg);
      }
    }
    return new this(msg, code);
  };

  function HttpError(msg, code) {
    this.code = code;
    this.message = msg;
  }

  HttpError.listeners = {};

  HttpError.listen = function(code, callback) {
    if (this.listeners[code] == null) {
      this.listeners[code] = [];
    }
    return this.listeners[code].push(callback);
  };

  return HttpError;

})();
