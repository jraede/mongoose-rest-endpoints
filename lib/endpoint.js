var Endpoint, Q, Response, dot, httperror, mongoose, _,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

mongoose = require('mongoose');

Q = require('q');

httperror = require('./httperror');

_ = require('underscore');

Response = require('./response');

dot = require('dot-component');

Endpoint = (function() {
  function Endpoint(path, modelId, opts) {
    var CustomResponse, _ref;
    this.path = path;
    this.modelId = modelId;
    this.modelClass = mongoose.model(modelId);
    if (opts == null) {
      opts = {};
    }
    this.to_populate = opts.populate != null ? opts.populate : [];
    this.queryVars = opts.queryVars != null ? opts.queryVars : [];
    this.cascadeRelations = opts.cascadeRelations != null ? opts.cascadeRelations : [];
    this.relationsFilter = opts.relationsFilter;
    this.suggestion = opts.suggestion;
    this.ignore = opts.ignore != null ? opts.ignore : [];
    this.prevent = opts.prevent ? opts.prevent : [];
    this.middleware = {
      get: [],
      post: [],
      put: [],
      "delete": []
    };
    this.dataFilters = {
      fetch: [],
      save: []
    };
    this.dataFilters.fetch.push(this.constructFilterFromRequest);
    this.responsePrototype = CustomResponse = (function(_super) {
      __extends(CustomResponse, _super);

      function CustomResponse() {
        _ref = CustomResponse.__super__.constructor.apply(this, arguments);
        return _ref;
      }

      return CustomResponse;

    })(Response);
  }

  Endpoint.prototype.addFilter = function(method, f) {
    this.dataFilters[method].push(f);
    return this;
  };

  Endpoint.prototype.constructFilterFromRequest = function(req, data) {
    var filter, query_var, _i, _len, _ref;
    filter = {};
    if (this.queryVars) {
      _ref = this.queryVars;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        query_var = _ref[_i];
        if (req.query[query_var] && (_.isString(req.query[query_var]) || req.query[query_var] instanceof Date)) {
          if (query_var.substr(0, 4) === '$lt_') {
            filter[query_var.replace('$lt_', '')] = {
              $lt: req.query[query_var]
            };
          } else if (query_var.substr(0, 5) === '$lte_') {
            filter[query_var.replace('$lte_', '')] = {
              $lte: req.query[query_var]
            };
          } else if (query_var.substr(0, 4) === '$gt_') {
            filter[query_var.replace('$gt_', '')] = {
              $gt: req.query[query_var]
            };
          } else if (query_var.substr(0, 5) === '$gte_') {
            filter[query_var.replace('$gte_', '')] = {
              $gte: req.query[query_var]
            };
          } else if (query_var.substr(0, 4) === '$in_') {
            filter[query_var.replace('$in_', '')] = {
              $in: req.query[query_var]
            };
          } else if (query_var.substr(0, 4) === '$ne_') {
            filter[query_var.replace('$ne_', '')] = {
              $ne: req.query[query_var]
            };
          } else {
            filter[query_var] = req.query[query_var];
          }
        }
      }
    }
    return filter;
  };

  Endpoint.prototype.filterData = function(req, method, data) {
    var f, r, _i, _len, _ref;
    r = data;
    if (this.dataFilters[method].length) {
      _ref = this.dataFilters[method];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        f = _ref[_i];
        if (typeof f !== 'function') {
          continue;
        }
        f = _.bind(f, this);
        r = f(req, r);
      }
    }
    return r;
  };

  Endpoint.prototype.post = function(req) {
    var data, deferred,
      _this = this;
    deferred = Q.defer();
    data = req.body;
    this.model = new this.modelClass();
    data = this.filterData(req, 'save', data);
    this.model.set(data);
    if (this.cascadeRelations.length && (this.model.cascadeSave != null)) {
      this.model.cascadeSave(function(err) {
        var returnVal;
        if (err) {
          console.error(err);
          return deferred.reject(httperror.forge(err, 400));
        } else {
          returnVal = _this.model.toObject();
          return deferred.resolve(returnVal);
        }
      }, {
        limit: this.cascadeRelations,
        filter: this.relationsFilter
      });
    } else {
      this.model.save(function(err) {
        var returnVal;
        if (err) {
          console.error(err);
          return deferred.reject(httperror.forge(err, 400));
        } else {
          returnVal = _this.model.toObject();
          return deferred.resolve(returnVal);
        }
      });
    }
    return deferred.promise;
  };

  Endpoint.prototype.get = function(req) {
    var data, deferred, err, id, pop, query, _i, _len, _ref,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    data = this.filterData(req, 'fetch', {});
    data._id = id;
    if (!id) {
      err = httperror.forge('ID not provided', 400);
      deferred.reject(err);
    } else {
      query = this.modelClass.findOne(data);
      if (this.to_populate.length) {
        _ref = this.to_populate;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          pop = _ref[_i];
          query.populate(pop);
        }
      }
      query.exec(function(err, model) {
        var doc, field, _j, _len1, _ref1;
        if (err) {
          return deferred.reject(httperror.forge('Error retrieving document', 500));
        } else if (!model) {
          return deferred.reject(httperror.forge('Could not find document', 404));
        } else {
          doc = model.toObject();
          if (_this.ignore.length) {
            _ref1 = _this.ignore;
            for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
              field = _ref1[_j];
              delete doc[field];
            }
          }
          return deferred.resolve(doc);
        }
      });
    }
    return deferred.promise;
  };

  Endpoint.prototype.populate = function(model, rel) {
    var deferred;
    deferred = Q.defer();
    model.populate(rel, function(err, model) {
      if (err) {
        return deferred.reject(err);
      } else {
        return deferred.resolve(model);
      }
    });
    return deferred.promise;
  };

  Endpoint.prototype.put = function(req) {
    var data, deferred, filter, id, query,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id) {
      deferred.reject(httperror.forge('ID not provided', 400));
    } else {
      data = req.body;
      filter = this.filterData(req, 'fetch', {});
      filter._id = id;
      query = this.modelClass.findOne(filter);
      query.exec(function(err, model) {
        if (err || !model) {
          return deferred.reject(httperror.forge('Error retrieving document', 404));
        } else {
          _this.model = model;
          data = _this.filterData(req, 'save', data);
          delete data['_id'];
          delete data['__v'];
          _this.model.set(data);
          if (_this.cascadeRelations.length && (_this.model.cascadeSave != null)) {
            return _this.model.cascadeSave(function(err, model) {
              var returnVal;
              if (err) {
                return deferred.reject(httperror.forge(err, 400));
              }
              returnVal = model.toObject();
              return deferred.resolve(returnVal);
            }, {
              limit: _this.cascadeRelations,
              filter: _this.relationsFilter
            });
          } else {
            return _this.model.save(function(err, model) {
              var returnVal;
              if (err) {
                return deferred.reject(httperror.forge(err, 400));
              }
              returnVal = model.toObject();
              return deferred.resolve(returnVal);
            });
          }
        }
      });
    }
    return deferred.promise;
  };

  Endpoint.prototype["delete"] = function(req) {
    var deferred, id;
    deferred = Q.defer();
    id = req.params.id;
    if (!id) {
      deferred.reject(httperror.forge('ID not provided', 400));
    } else {
      this.modelClass.findById(id, function(err, model) {
        if (!model) {
          return deferred.reject(httperror.forge('Document not found', 404));
        }
        if (err) {
          return deferred.reject(httperror.forge('Error deleting document', 500));
        }
        return model.remove(function(err) {
          if (err) {
            return deferred.reject(httperror.forge('Error deleting document', 500));
          } else {
            return deferred.resolve();
          }
        });
      });
    }
    return deferred.promise;
  };

  Endpoint.prototype.list = function(req) {
    var deferred, filter, pop, query, _i, _len, _ref,
      _this = this;
    deferred = Q.defer();
    filter = this.filterData(req, 'fetch');
    query = this.modelClass.find(filter);
    if (this.to_populate.length) {
      _ref = this.to_populate;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        pop = _ref[_i];
        query.populate(pop);
      }
    }
    query.exec(function(err, collection) {
      var field, key, obj, _j, _k, _len1, _len2, _ref1;
      if (_this.ignore.length) {
        for (key = _j = 0, _len1 = collection.length; _j < _len1; key = ++_j) {
          obj = collection[key];
          obj = obj.toObject();
          _ref1 = _this.ignore;
          for (_k = 0, _len2 = _ref1.length; _k < _len2; _k++) {
            field = _ref1[_k];
            delete obj[field];
          }
          collection[key] = obj;
        }
      }
      if (err) {
        return deferred.reject(httperror.forge('Could not retrieve collection', 500));
      } else {
        return deferred.resolve(collection);
      }
    });
    return deferred.promise;
  };

  Endpoint.prototype.getSuggestions = function(req) {
    var deferred, params,
      _this = this;
    deferred = Q.defer();
    if (this.suggestion.forgeQuery) {
      params = this.suggestion.forgeQuery(req);
    } else {
      params = null;
    }
    this.modelClass.find(params, function(err, results) {
      var final, obj, res, _i, _len;
      if (err) {
        console.error(err);
        return deferred.reject(httperror.forge('Error fetching results', 500));
      } else {
        final = [];
        for (_i = 0, _len = results.length; _i < _len; _i++) {
          res = results[_i];
          obj = {
            id: res._id,
            value: _this.suggestion.getLabel(res),
            tokens: _this.suggestion.getTokens(res)
          };
          final.push(obj);
        }
        return deferred.resolve(final);
      }
    });
    return deferred.promise;
  };

  Endpoint.prototype.responseHook = function(event, callback) {
    this.responsePrototype[event]('send', callback);
    return this;
  };

  Endpoint.prototype.addMiddleware = function(method, middleware) {
    var m, _i, _j, _len, _len1, _ref;
    if (method === 'all') {
      _ref = ['get', 'post', 'put', 'delete'];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        m = _ref[_i];
        this.addMiddleware(m, middleware);
      }
    } else {
      if (middleware instanceof Array) {
        for (_j = 0, _len1 = middleware.length; _j < _len1; _j++) {
          m = middleware[_j];
          this.addMiddleware(method, m);
        }
      } else {
        this.middleware[method].push(middleware);
      }
    }
    return this;
  };

  Endpoint.prototype.response = function(type, req, res, data, code) {
    var response;
    response = new this.responsePrototype(type, req, res, data, code);
    return response;
  };

  Endpoint.prototype.register = function(app) {
    var _this = this;
    console.log('Registered endpoint for path:', this.path);
    if (this.suggestion) {
      app.get(this.path + '/suggestion', this.middleware.get, function(req, res) {
        return Q(_this.getSuggestions(req)).then(function(results) {
          return _this.response('suggestion', req, res, results, 200).send();
        }, function(error) {
          return _this.response('suggestion:error', req, res, error.message, error.code).send();
        });
      });
    }
    app.get(this.path + '/:id', this.middleware.get, function(req, res) {
      return Q(_this.get(req)).then(function(results) {
        return this.response(res, results, 200).send();
      }, function(error) {
        console.error(error);
        return _this.response('get:error', req, res, error.message, error.code).send();
      });
    });
    app.get(this.path, this.middleware.get, function(req, res) {
      return Q(_this.list(req)).then(function(results) {
        return _this.response('list', req, res, results, 200).send();
      }, function(error) {
        console.error(error);
        return _this.response('list:error', req, res, error.message, error.code).send();
      });
    });
    app.post(this.path, this.middleware.post, function(req, res) {
      return Q(_this.post(req)).then(function(results) {
        return _this.response('post', req, res, results, 201).send();
      }, function(error) {
        return _this.response('post:error', req, res, error.message, error.code).send();
      });
    });
    app.put(this.path + '/:id', this.middleware.put, function(req, res) {
      return Q(_this.put(req)).then(function(results) {
        return _this.response('put', req, res, results, 200).send();
      }, function(error) {
        return _this.response('put:error', req, res, error.message, error.code).send();
      });
    });
    return app["delete"](this.path + '/:id', this.middleware["delete"], function(req, res) {
      return Q(_this["delete"](req)).then(function(results) {
        return _this.response('delete', req, res, results, 200).send();
      }, function(error) {
        return _this.response('delete:error', req, res, error.message, error.code).send();
      });
    });
  };

  return Endpoint;

})();

module.exports = Endpoint;
