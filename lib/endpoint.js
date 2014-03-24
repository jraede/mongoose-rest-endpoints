var Endpoint, Q, dot, httperror, mongoose, _;

mongoose = require('mongoose');

Q = require('q');

httperror = require('./httperror');

_ = require('underscore');

dot = require('dot-component');

/*
Middle ware is separate
*/


module.exports = Endpoint = (function() {
  /*
  	 * @param String path 			the base URL for the endpoint
  	 * @param String modelId 		the name of the document
  	 * @param Object opts 			Additional options (see defaults below)
  */

  function Endpoint(path, modelId, opts) {
    this.path = path;
    this.modelId = modelId;
    this.$modelClass = mongoose.model(modelId);
    this.$$taps = {};
    this.options = {
      queryParams: [],
      pagination: {
        perPage: 50,
        sortField: '_id'
      },
      populate: []
    };
    if (opts != null) {
      this.options = _.extend(this.options, opts);
    }
    this.$$middleware = {
      fetch: [],
      list: [],
      post: [],
      put: [],
      "delete": []
    };
    this.tap('pre_filter', 'list', this.$$constructFilterFromRequest);
  }

  /*
  	 * Add field to populate options. These fields will be populated on every request except delete
  	 *
  	 * @param String field
  	 * @return Endpoint for chaining
  */


  Endpoint.prototype.populate = function(field) {
    var p, _i, _len;
    if (field instanceof Array) {
      for (_i = 0, _len = field.length; _i < _len; _i++) {
        p = field[_i];
        this.options.populate.push(p);
      }
    } else {
      this.options.populate.push(field);
    }
    return this;
  };

  /*
  	 * Allow a query param or params to become part of the search filter for list requests.
  	 *
  	 * @param String|Array param
  	 * @return Endpoint for chaining
  */


  Endpoint.prototype.allowQueryParam = function(param) {
    var p, _i, _len;
    if (param instanceof Array) {
      for (_i = 0, _len = param.length; _i < _len; _i++) {
        p = param[_i];
        this.options.queryParams.push(p);
      }
    } else {
      this.options.queryParams.push(param);
    }
    return this;
  };

  /*
  	 * Set cascade parameters for playing nicely with cascading-relations package
  	 *
  	 * @param Array allowed 		Allowed relation paths
  	 * @param Function filter 		Filter function to pass all related docs through
  	 * @return Endpoint for chaining
  */


  Endpoint.prototype.cascade = function(allowed, filter) {
    this.options.cascade = {
      allowedRelations: allowed,
      filter: filter
    };
    return this;
  };

  /*
  	 * Tap a function onto a hook. Hooks may pass a value through each function to get the final 
  	 * result (filter) or just execute all the functions in a row (action). 
  	 * Each function is structured the same; they just may have a null value for the 
  	 * `data` argument (2nd argument).
  	 *
  	 * Functions look like this:
  	 * `function(arguments, data, next) {}`
  	 * 
  	 * ...and must either call next(data) (optionally with modified data) or just return a 
  	 * non-null value (the system assumes that a null return value means that next will be 
  	 * called instead)
  	 *
  	 * HOOKS:
  	 * * pre_filter (before execution [default values, remove fields, etc]). Note that the "fetch"
  	 * 		filter will be used for retrieving documents in PUT and DELETE requests before performing
  	 * 		operations on them. Useful for limiting the documents people have access to.
  	 * * post_retrieve (after retrieval of the model [maybe they can only do something 
  	 * 		if the model has a certain value]). Only applies on PUT/DELETE requests
  	 * * pre_response (after execution, before response [hide fields, modify, etc])
  	 * * pre_response_error (after execution, before response, if execution throws an error)
  	 * 
  	 * @param String hook 		The name of the hook
  	 * @param String method 	The method (fetch, list, post, put, delete).
  	 * @param Function func 	Function to run on hook
  */


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

  /*
  	 * Add standard express middleware to one of the five methods. "all" or "*"
  	 * apply for all five. Connect middleware syntax applies.
  	 * 
  	 * @param String method 			Method name
  	 * @param Function middleware 		Connect-style middleware function
  	 * @return Endpoint for chaining
  */


  Endpoint.prototype.addMiddleware = function(method, middleware) {
    var m, _i, _j, _len, _len1, _ref;
    if (method === 'all' || method === '*') {
      _ref = ['list', 'fetch', 'post', 'put', 'delete'];
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
        this.$$middleware[method].push(middleware);
      }
    }
    return this;
  };

  /*
  	 * Register the endpoints on an express app.
  	 * 
  	 * @param Express app
  */


  Endpoint.prototype.register = function(app) {
    var _this = this;
    app.get(this.path + '/:id', this.$$middleware.fetch, function(req, res) {
      return _this.$$fetch(req, res).then(function(model) {
        return _this.$$runHook('pre_response', 'fetch', req, model.toObject()).then(function(response) {
          return res.send(response, 200);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'fetch', req, err).then(function(err) {
          return res.send(err.message, err.code);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      });
    });
    app.get(this.path, this.$$middleware.list, function(req, res) {
      return _this.$$list(req, res).then(function(models) {
        var final, model, _i, _len;
        final = [];
        for (_i = 0, _len = models.length; _i < _len; _i++) {
          model = models[_i];
          final.push(model.toObject());
        }
        return _this.$$runHook('pre_response', 'list', req, final).then(function(response) {
          return res.send(response, 200);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'list', req, err).then(function(err) {
          return res.send(err.message, err.code);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      });
    });
    app.post(this.path, this.$$middleware.post, function(req, res) {
      return _this.$$post(req, res).then(function(model) {
        return _this.$$runHook('pre_response', 'post', req, model.toObject()).then(function(response) {
          return res.send(response, 201);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'post', req, err).then(function(err) {
          return res.send(err.message, err.code);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      });
    });
    app.put(this.path + '/:id', this.$$middleware.put, function(req, res) {
      return _this.$$put(req, res).then(function(model) {
        return _this.$$runHook('pre_response', 'put', req, model.toObject()).then(function(response) {
          return res.send(response, 200);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'put', req, err).then(function(err) {
          return res.send(err.message, err.code);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      });
    });
    return app["delete"](this.path + '/:id', this.$$middleware["delete"], function(req, res) {
      return _this.$$delete(req, res).then(function() {
        return _this.$$runHook('pre_response', 'delete', req, {}).then(function() {
          return res.send(200);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'delete', req, err).then(function(err) {
          return res.send(err.message, err.code);
        }, function(err) {
          if (err.code) {
            return res.send(err.message, err.code);
          } else {
            return res.send(500);
          }
        });
      });
    });
  };

  /*
  	PRIVATE METHODS
  */


  Endpoint.prototype.$$runHook = function(hook, method, args, mod) {
    var deferred, func, funcs, next, runFunction, _i, _len;
    deferred = Q.defer();
    runFunction = function(f, next, args, data) {
      var err, ret;
      try {
        ret = _.bind(f, this, args, data, next)();
        if (ret != null) {
          return next(ret);
        }
      } catch (_error) {
        err = _error;
        return deferred.reject(err);
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

  Endpoint.prototype.$$populateQuery = function(query) {
    var pop, _i, _len, _ref, _results;
    if ((this.options.populate != null) && this.options.populate.length) {
      _ref = this.options.populate;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        pop = _ref[_i];
        _results.push(query.populate(pop));
      }
      return _results;
    }
  };

  Endpoint.prototype.$$populateDocument = function(doc) {
    var pop, populatePath, promises, _i, _len, _ref;
    populatePath = function(path, doc) {
      var d;
      d = Q.defer();
      return doc.populate(path, function(err, doc) {
        return deferred.resolve();
      });
    };
    promises = [];
    _ref = this.options.populate;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      pop = _ref[_i];
      promises.push(populatePath(pop, doc));
    }
    return Q.all(promises);
  };

  Endpoint.prototype.$$fetch = function(req, res) {
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
      var query;
      filter._id = id;
      query = _this.$modelClass.findOne(filter);
      _this.$$populateQuery(query);
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

  Endpoint.prototype.$$list = function(req, res) {
    var deferred,
      _this = this;
    deferred = Q.defer();
    return this.$$runHook('pre_filter', 'list', req, {}).then(function(filter) {
      var query;
      query = _this.$modelClass.find(filter);
      _this.$$populateQuery(query);
      if (_this.options.pagination) {
        _this.$modelClass.count(filter, function(err, count) {
          var config;
          if (err) {
            return deferred.reject(httperror.forge('Could not retrieve collection', 500));
          }
          res.setHeader('Record-Count', count.toString());
          config = _this.$$getPaginationConfig(req);
          return query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec(function(err, collection) {
            if (err) {
              return deferred.reject(httperror.forge('Could not retrieve collection', 500));
            } else {
              return deferred.resolve(collection);
            }
          });
        });
      } else {
        query.exec(function(err, collection) {
          if (err) {
            return deferred.reject(httperror.forge('Could not retrieve collection', 500));
          } else {
            return deferred.resolve(collection);
          }
        });
      }
      return deferred.promise;
    });
  };

  Endpoint.prototype.$$post = function(req, res) {
    var deferred,
      _this = this;
    deferred = Q.defer();
    this.$$runHook('pre_filter', 'post', req, req.body).then(function(data) {
      var model;
      model = new _this.$modelClass(data);
      if (_this.options.cascade != null) {
        return model.cascadeSave(function(err, model) {
          if (err) {
            return deferred.reject(httperror.forge(err, 400));
          } else {
            return _this.$$populateDocument(model).then(function() {
              return deferred.resolve(model);
            });
          }
        }, {
          limit: _this.options.cascade.allowedRelations,
          filter: _this.options.cascade.filter
        });
      } else {
        return model.save(function(err, model) {
          if (err) {
            return deferred.reject(httperror.forge(err, 400));
          }
          return _this.$$populateDocument(model).then(function() {
            return deferred.resolve(model);
          });
        });
      }
    });
    return deferred.promise;
  };

  Endpoint.prototype.$$put = function(req, res) {
    var deferred, id,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      deferred.reject(httperror.forge('Bad ID', 400));
      return deferred.promise;
    }
    this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
      var query;
      filter._id = id;
      query = _this.$modelClass.findOne(filter);
      _this.$$populateQuery(query);
      return query.exec(function(err, model) {
        if (err) {
          return deferred.reject(httperror.forge('Server error', 500));
        }
        if (!model) {
          return deferred.reject(httperror.forge('Not found', 404));
        }
        return _this.$$runHook('post_retrieve', 'put', req, model).then(function(model) {
          var data;
          data = req.body;
          delete data._id;
          delete data.__v;
          return _this.$$runHook('pre_filter', 'put', req, data).then(function(data) {
            model.set(data);
            if (_this.options.cascade != null) {
              return model.cascadeSave(function(err, model) {
                if (err) {
                  return deferred.reject(httperror.forge(err, 400));
                } else {
                  return _this.$$populateDocument(model).then(function() {
                    return deferred.resolve(model);
                  });
                }
              }, {
                limit: _this.options.cascade.allowedRelations,
                filter: _this.options.cascade.filter
              });
            } else {
              return model.save(function(err, model) {
                if (err) {
                  return deferred.reject(httperror.forge(err, 400));
                }
                return _this.$$populateDocument(model).then(function() {
                  return deferred.resolve(model);
                });
              });
            }
          });
        }, function(err) {
          return deferred.reject(httperror.forge(err.message, err.code));
        });
      });
    });
    return deferred.promise;
  };

  Endpoint.prototype.$$delete = function(req, res) {
    var deferred, id,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      deferred.reject(httperror.forge('Bad ID', 400));
      return deferred.promise;
    }
    this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
      var query;
      filter._id = id;
      query = _this.$modelClass.findOne(filter);
      _this.$$populateQuery(query);
      return query.exec(function(err, model) {
        if (err) {
          return deferred.reject(httperror.forge('Server error', 500));
        }
        if (!model) {
          return deferred.reject(httperror.forge('Not found', 404));
        }
        return _this.$$runHook('post_retrieve', 'delete', req, model).then(function(model) {
          model.remove(function(err) {
            if (err) {
              return deferred.reject(httperror.forge(err, 400));
            }
            return deferred.resolve();
          });
          return deferred.reject(httperror.forge(err.message, err.code));
        }, function(err) {
          return deferred.reject(httperror.forge(err.message, err.code));
        });
      });
    });
    return deferred.promise;
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
      result.perPage = this.options.pagination.perPage;
    }
    if (result.sortField == null) {
      result.sortField = this.options.pagination.sortField;
    }
    return result;
  };

  Endpoint.prototype.$$constructFilterFromRequest = function(req, data, next) {
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
    if (this.options.queryParams) {
      _ref = this.options.queryParams;
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

  return Endpoint;

})();
