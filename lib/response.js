var Response, f, hooks, k;

hooks = require('hooks');

Response = (function() {
  function Response(type, req, res, data, code) {
    this.req = req;
    this.type = type;
    this.res = res;
    this.data = data;
    this.code = code;
  }

  Response.prototype.send = function() {
    if (this.data) {
      return this.res.send(this.data, this.code);
    } else if (this.code) {
      return this.res.send(this.code);
    } else {
      return this.res.send(null);
    }
  };

  return Response;

})();

for (k in hooks) {
  f = hooks[k];
  Response[k] = hooks[k];
}

module.exports = Response;
