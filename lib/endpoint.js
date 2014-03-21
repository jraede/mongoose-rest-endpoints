var Endpoint, Q, Response, dot, httperror, mongoose, _;

mongoose = require('mongoose');

Q = require('q');

httperror = require('./httperror');

_ = require('underscore');

Response = require('./response');

dot = require('dot-component');

/*
Middle ware is separate
HOOKS:
	pre_filter (before execution [default values, remove fields, etc])
	post_retrieve (after retrieval of the model [maybe they can only do something if the model has a certain value])
	pre_response (after execution, before response [hide fields, modify, etc])
*/


Endpoint = (function() {
  function Endpoint(path, modelId, opts) {
    this.path = path;
    this.modelId = modelId;
    this.$modelClass = mongoose.model(modelId);
    this.$$taps = {};
    this.options = {};
    this.middleware = {
      get: [],
      post: [],
      put: [],
      "delete": []
    };
  }

  Endpoint.prototype.tap = function(hook, method, func) {
    var methods, untap, _i, _len,
      _this = this;
    if (method === '*') {
      methods = ['fetch', 'list', 'create', 'update', 'delete'];
    } else {
      methods = [method];
    }
    if (!this.$$taps[hook]) {
      this.$$taps[hook] = {};
    }
    for (_i = 0, _len = methods.length; _i < _len; _i++) {
      method = methods[_i];
      if (!this.$$taps[hook][method]) {
        this.$$taps[hook][method] = [];
      }
      this.$$taps[hook][method].push(func);
    }
    untap = function() {
      var index;
      index = _this.$$taps[hook][method].indexOf(func);
      return _this.$$taps[hook][method].splice(index, 1);
    };
    return this;
  };

  Endpoint.prototype.$$runHook = function(hook, method, args, mod) {
    var deferred, func, funcs, next, runFunction, _i, _len;
    deferred = Q.defer();
    runFunction = function(f, next, args, data) {
      var ret;
      ret = _.bind(f, this, args, data, next)();
      if (ret != null) {
        return next(ret);
      }
    };
    if (this.$$taps[hook] == null) {
      deferred.resolve(mod);
    } else if (this.$$taps[hook][method] == null) {
      deferred.resolve(mod);
    } else {
      funcs = this.$$taps[hook][method];
      next = function(final) {
        return deferred.resolve(final);
      };
      funcs = funcs.reverse();
      for (_i = 0, _len = funcs.length; _i < _len; _i++) {
        func = funcs[_i];
        next = _.bind(runFunction, this, func, next, args);
      }
      next(mod);
    }
    return deferred.promise;
  };

  Endpoint.prototype.$$fetch = function(req) {
    var deferred, err, id,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id) {
      err = httperror.forge('ID not provided', 400);
      deferred.reject(err);
      return deferred.promise;
    }
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      err = httperror.forge('Bad ID', 400);
      deferred.reject(err);
      return deferred.promise;
    }
    this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
      var pop, query, _i, _len, _ref;
      filter._id = id;
      query = _this.$modelClass.findOne(filter);
      if ((_this.options.populate != null) && _this.options.populate.length) {
        _ref = _this.options.populate;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          pop = _ref[_i];
          query.populate(pop);
        }
      }
      return query.exec(function(err, model) {
        if (err) {
          return deferred.reject(httperror.forge('Error retrieving dcoument', 500));
        }
        if (!model) {
          return deferred.reject(httperror.forge('Could not find document', 404));
        }
        return deferred.resolve(model);
      });
    });
    return deferred.promise;
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

  Endpoint.prototype.register = function(app) {
    var _this = this;
    return app.get(this.path + '/:id', this.middleware.get, function(req, res) {
      return _this.$$fetch(req).then(function(model) {
        return _this.$$runHook('pre_response', 'fetch', req, model.toObject()).then(function(response) {
          return res.send(response, 200);
        }, function(err) {
          console.log('500 there', err.stack);
          return res.send(500);
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'fetch', req, err).then(function(err) {
          return res.send(err.message, err.code);
        }, function(err) {
          console.log('500 here', err.stack);
          return res.send(500);
        });
      });
    });
  };

  Endpoint.prototype.$$getPaginationConfig = function(req) {
    var data, result;
    data = req.query;
    result = {
      perPage: data.perPage,
      page: data.page,
      sortField: data.sortField
    };
    result.page = parseInt(data.page);
    if ((result.page == null) || isNaN(result.page) || result.page < 1) {
      result.page = 1;
    }
    if (result.perPage == null) {
      result.perPage = this.pagination.defaults.perPage;
    }
    if (result.sortField == null) {
      result.sortField = this.pagination.defaults.sortField;
    }
    return result;
  };

  Endpoint.prototype.constructFilterFromRequest = function(req, data) {
    var addToFilter, filter, query_var, _i, _len, _ref;
    addToFilter = function(filter, prop, key, val) {
      if (filter[prop] != null) {
        return filter[prop][key] = val;
      } else {
        filter[prop] = {};
        return filter[prop][key] = val;
      }
    };
    filter = {};
    if (this.queryVars) {
      _ref = this.queryVars;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        query_var = _ref[_i];
        if (req.query[query_var] && (_.isString(req.query[query_var]) || req.query[query_var] instanceof Date)) {
          if (query_var.substr(0, 4) === '$lt_') {
            addToFilter(filter, query_var.replace('$lt_', ''), '$lt', req.query[query_var]);
          } else if (query_var.substr(0, 5) === '$lte_') {
            addToFilter(filter, query_var.replace('$lte_', ''), '$lte', req.query[query_var]);
          } else if (query_var.substr(0, 4) === '$gt_') {
            addToFilter(filter, query_var.replace('$gt_', ''), '$gt', req.query[query_var]);
          } else if (query_var.substr(0, 5) === '$gte_') {
            addToFilter(filter, query_var.replace('$gte_', ''), '$gte', req.query[query_var]);
          } else if (query_var.substr(0, 4) === '$in_') {
            addToFilter(filter, query_var.replace('$in_', ''), '$in', req.query[query_var]);
          } else if (query_var.substr(0, 4) === '$ne_') {
            addToFilter(filter, query_var.replace('$ne_', ''), '$ne', req.query[query_var]);
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
    var data, deferred, model,
      _this = this;
    deferred = Q.defer();
    data = req.body;
    model = new this.modelClass();
    data = this.filterData(req, 'save', data);
    model.set(data);
    if (this.cascadeRelations.length && (model.cascadeSave != null)) {
      model.cascadeSave(function(err, model) {
        var returnVal;
        if (err) {
          console.error(err);
          return deferred.reject(httperror.forge(err, 400));
        } else {
          returnVal = model.toObject();
          return deferred.resolve(returnVal);
        }
      }, {
        limit: this.cascadeRelations,
        filter: this.relationsFilter
      });
    } else {
      model.save(function(err, model) {
        var returnVal;
        if (err) {
          console.error(err);
          return deferred.reject(httperror.forge(err, 400));
        } else {
          returnVal = model.toObject();
          return deferred.resolve(returnVal);
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
          if (_this.checks['update'] != null) {
            return _this.checks['update'](req, model).then(function() {
              return _this.finishPut(req, model, data, deferred);
            }, function(err) {
              return deferred.reject(httperror.forge('Cannot put', 403));
            });
          } else {
            return _this.finishPut(req, model, data, deferred);
          }
        }
      });
    }
    return deferred.promise;
  };

  Endpoint.prototype.finishPut = function(req, model, data, deferred) {
    var _this = this;
    data = this.filterData(req, 'save', data);
    delete data['_id'];
    delete data['__v'];
    model.set(data);
    if (this.cascadeRelations.length && (model.cascadeSave != null)) {
      return model.cascadeSave(function(err, model) {
        var returnVal;
        if (err) {
          return deferred.reject(httperror.forge(err, 400));
        }
        returnVal = model.toObject();
        return deferred.resolve(returnVal);
      }, {
        limit: this.cascadeRelations,
        filter: this.relationsFilter
      });
    } else {
      return model.save(function(err, model) {
        var returnVal;
        if (err) {
          return deferred.reject(httperror.forge(err, 400));
        }
        returnVal = model.toObject();
        return deferred.resolve(returnVal);
      });
    }
  };

  Endpoint.prototype["delete"] = function(req) {
    var deferred, id,
      _this = this;
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
        if (_this.checks['delete'] != null) {
          return _this.checks['delete'](req, model).then(function() {
            return _this.finishDelete(model, deferred);
          }, function(err) {
            return deferred.reject(httperror.forge('No access', 403));
          });
        } else {
          return _this.finishDelete(model, deferred);
        }
      });
    }
    return deferred.promise;
  };

  Endpoint.prototype.finishDelete = function(model, deferred) {
    return model.remove(function(err) {
      if (err) {
        return deferred.reject(httperror.forge('Error deleting document', 500));
      } else {
        return deferred.resolve();
      }
    });
  };

  Endpoint.prototype.list = function(req, res) {
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
    if (this.pagination) {
      this.modelClass.count(filter, function(err, count) {
        var config;
        if (err) {
          return deferred.reject(htperror.forge('Could not retrieve collection', 500));
        }
        res.setHeader('Record-Count', count.toString());
        config = _this.getPaginationConfig(req);
        return query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec(function(err, collection) {
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
      });
    } else {
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
    }
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

  Endpoint.prototype.response = function(type, req, res, data, code) {
    var response;
    response = new this.responsePrototype(type, req, res, data, code);
    return response;
  };

  return Endpoint;

})();

module.exports = Endpoint;
