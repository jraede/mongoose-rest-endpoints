var Endpoint, Q, Response, httperror, mongoose, _,
  __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; };

mongoose = require('mongoose');

Q = require('q');

httperror = require('./httperror');

_ = require('underscore');

Response = require('./response');

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
    this.allowRelations = opts.allowRelations != null ? opts.allowRelations : [];
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

  Endpoint.prototype.constructFilterFromRequest = function(req, data, isChild) {
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

  Endpoint.prototype.filterData = function(req, method, data, isChild) {
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
        r = f(req, data, isChild);
      }
    }
    return r;
  };

  Endpoint.prototype.handleRelationArray = function(req, prop, config) {
    var child, childId, childSchema, childSchemaConfig, childSchemaProp, deferred, index, parentProp, previousChildren, replacementProp, saves, shouldBeSaving, subdoc, _i, _j, _len, _len1, _ref, _ref1,
      _this = this;
    deferred = Q.defer();
    replacementProp = [];
    this.replacePropBeforeResponse[prop] = [];
    saves = [];
    subdoc = mongoose.model(config[0].ref);
    if (this.postData[prop] instanceof Array) {
      childSchema = subdoc.schema;
      parentProp = null;
      _ref = childSchema.paths;
      for (childSchemaProp in _ref) {
        childSchemaConfig = _ref[childSchemaProp];
        if ((childSchemaConfig.options.type != null) && childSchemaConfig.options.type === mongoose.Schema.Types.ObjectId && childSchemaConfig.options.ref.toLowerCase() === this.modelClass.modelName.toLowerCase()) {
          parentProp = childSchemaProp;
          break;
        }
      }
      previousChildren = [];
      if (!this.model.isNew) {
        previousChildren = this.model[prop];
      }
      shouldBeSaving = _.keys(this.allowRelations).indexOf(prop) >= 0 ? true : false;
      _ref1 = this.postData[prop];
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        child = _ref1[_i];
        if (typeof child === 'string') {
          index = previousChildren.indexOf(child);
          if (index >= 0) {
            previousChildren.splice(index, 1);
          }
          replacementProp.push(child);
          this.replacePropBeforeResponse[prop].push(child);
          continue;
        }
        child = this.filterData(req, 'save', child, true);
        if (child._id) {
          child = new subdoc(child, {
            _id: false
          });
          child.isNew = false;
          delete child.$__.activePaths.states.modify._id;
        } else {
          child = new subdoc(child);
        }
        index = previousChildren.indexOf(child._id);
        if (index >= 0) {
          previousChildren.splice(index, 1);
        }
        this.replacePropBeforeResponse[prop].push(child.toObject());
        replacementProp.push(child._id);
        if (shouldBeSaving) {
          if (parentProp) {
            child[parentProp] = this.model._id;
          }
          saves.push(child.save(function(err, result) {
            if (err) {
              return console.error('Failed to save child doc');
            }
          }));
        }
      }
      if (shouldBeSaving) {
        if (previousChildren.length && (this.allowRelations[prop].deleteUnattached != null)) {
          for (_j = 0, _len1 = previousChildren.length; _j < _len1; _j++) {
            childId = previousChildren[_j];
            saves.push(mongoose.model(config[0].ref).findByIdAndRemove(childId, function(err, results) {
              if (err) {
                return console.error('Failed to delete unattached child doc');
              }
            }));
          }
        }
        Q.all(saves).then(function() {
          _this.postData[prop] = replacementProp;
          return deferred.resolve();
        }, function(err) {
          return deferred.reject(err);
        });
      } else {
        this.postData[prop] = replacementProp;
        deferred.resolve();
      }
    } else {
      deferred.resolve();
    }
    return deferred.promise;
  };

  Endpoint.prototype.handleRelationObject = function(req, prop, config) {
    var child, childSchema, childSchemaConfig, childSchemaProp, parentProp, replacementProp, shouldBeSaving, subdoc, _ref,
      _this = this;
    subdoc = mongoose.model(config.ref);
    childSchema = subdoc.schema;
    parentProp = null;
    _ref = childSchema.tree;
    for (childSchemaProp in _ref) {
      childSchemaConfig = _ref[childSchemaProp];
      if ((childSchemaConfig.options.type != null) && childSchemaConfig.options.type === mongoose.Schema.Types.ObjectId && childSchemaConfig.options.ref.toLowerCase() === this.modelClass.modelName.toLowerCase()) {
        parentProp = childSchemaProp;
        break;
      }
    }
    shouldBeSaving = _.keys(this.allowRelations).indexOf(prop) >= 0 ? true : false;
    child = this.filterData(req, 'save', child, true);
    child = new subdoc(child);
    replacementProp = child._id;
    this.replacePropBeforeResponse[prop] = child.toObject();
    if (shouldBeSaving) {
      child.save(function(err, res) {
        if (err) {
          return deferred.reject(err);
        } else {
          _this.postData[prop] = replacementProp;
          return deferred.resolve();
        }
      });
    } else {
      this.postData[prop] = replacementProp;
      deferred.resolve();
    }
    return deferred;
  };

  Endpoint.prototype.handleRelations = function(req, data) {
    var config, deferred, prop, schema, totalDeferreds, _ref;
    deferred = Q.defer();
    this.postData = data;
    totalDeferreds = [];
    schema = this.modelClass.schema;
    _ref = schema.tree;
    for (prop in _ref) {
      config = _ref[prop];
      if (prop.substr(0, 1) === '_' && prop !== '_id' && prop !== '__v') {
        if (config instanceof Array && config[0].type === mongoose.Schema.Types.ObjectId) {
          totalDeferreds.push(this.handleRelationArray(req, prop, config));
        } else if ((config.type != null) && config.type === mongoose.Schema.Types.ObjectId) {
          totalDeferreds.push(this.handleRelationObject(req, prop, config));
        }
      }
    }
    Q.all(totalDeferreds).then(function() {
      return deferred.resolve();
    }, function(err) {
      return deferred.reject(err);
    });
    return deferred.promise;
  };

  Endpoint.prototype.replacePropBeforeResponse = {};

  Endpoint.prototype.repopulate = function(returnVal) {
    var prop, val, _ref;
    _ref = this.replacePropBeforeResponse;
    for (prop in _ref) {
      val = _ref[prop];
      returnVal[prop] = val;
    }
    this.replacePropBeforeResponse = {};
    return returnVal;
  };

  Endpoint.prototype.post = function(req) {
    var data, deferred,
      _this = this;
    deferred = Q.defer();
    data = req.body;
    this.model = new this.modelClass();
    this.handleRelations(req, data).then(function() {
      var key, val;
      data = _this.filterData(req, 'save', _this.postData);
      for (key in data) {
        val = data[key];
        _this.model[key] = val;
      }
      return _this.model.save(function(err) {
        var returnVal;
        if (err) {
          console.error(err);
          return deferred.reject(httperror.forge('Failure to create document', 400));
        } else {
          returnVal = _this.model.toObject();
          returnVal = _this.repopulate(returnVal);
          return deferred.resolve(returnVal);
        }
      }, function(err) {
        console.error(err);
        return deferred.reject(httperror.forge('Failure to create document', 400));
      });
    });
    return deferred.promise;
  };

  Endpoint.prototype.get = function(req) {
    var deferred, err, id, pop, query, _i, _len, _ref,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id) {
      err = httperror.forge('ID not provided', 400);
      deferred.reject(err);
    } else {
      query = this.modelClass.findById(id);
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
    var data, deferred, id, query,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id) {
      deferred.reject(httperror.forge('ID not provided', 400));
    } else {
      data = req.body;
      query = this.modelClass.findById(id);
      query.exec(function(err, model) {
        if (err || !model) {
          return deferred.reject(httperror.forge('Error retrieving document', 404));
        } else {
          _this.model = model;
          return _this.handleRelations(req, data).then(function() {
            var key, val;
            data = _this.filterData(req, 'save', _this.postData);
            for (key in data) {
              val = data[key];
              if (key !== '_id' && key !== '__v') {
                _this.model[key] = val;
              }
            }
            return _this.model.save(function(err, model) {
              var returnVal;
              returnVal = model.toObject();
              returnVal = _this.repopulate(returnVal);
              return deferred.resolve(returnVal);
            });
          }, function(err) {
            return deferred.reject(httperror.forge('Error saving document', 500));
          });
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
      this.modelClass.findByIdAndRemove(id, function(err, model) {
        if (err) {
          return deferred.reject(httperror.forge('Error deleting document', 500));
        } else if (!model) {
          return deferred.reject(httperror.forge('Document not found', 404));
        } else {
          return deferred.resolve();
        }
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

  Endpoint.prototype.response = function(type, res, data, code) {
    var response;
    response = new this.responsePrototype(type, res, data, code);
    return response;
  };

  Endpoint.prototype.register = function(app) {
    var _this = this;
    console.log('Registered endpoint for path:', this.path);
    if (this.suggestion) {
      app.get(this.path + '/suggestion', this.middleware.get, function(req, res) {
        return Q(_this.getSuggestions(req)).then(function(results) {
          return _this.response(res, results, 200).send();
        }, function(error) {
          return _this.response('SUGGESTION', res, error.message, error.code).send();
        });
      });
    }
    app.get(this.path + '/:id', this.middleware.get, function(req, res) {
      return Q(_this.get(req)).then(function(results) {
        return this.response(res, results, 200).send();
      }, function(error) {
        console.error(error);
        return _this.response('get:error', res, error.message, error.code).send();
      });
    });
    app.get(this.path, this.middleware.get, function(req, res) {
      return Q(_this.list(req)).then(function(results) {
        return _this.response('list', res, results, 200).send();
      }, function(error) {
        console.error(error);
        return _this.response('list:error', res, error.message, error.code).send();
      });
    });
    app.post(this.path, this.middleware.post, function(req, res) {
      return Q(_this.post(req)).then(function(results) {
        return _this.response('post', res, results, 201).send();
      }, function(error) {
        console.error(error);
        return _this.response('post:error', res, error.message, error.code).send();
      });
    });
    app.put(this.path + '/:id', this.middleware.put, function(req, res) {
      return Q(_this.put(req)).then(function(results) {
        return _this.response('put', res, results, 202).send();
      }, function(error) {
        return _this.response('put:error', res, error.message, error.code).send();
      });
    });
    return app["delete"](this.path + '/:id', this.middleware["delete"], function(req, res) {
      return Q(_this["delete"](req)).then(function(results) {
        return _this.response('delete', res, results, 200).send();
      }, function(error) {
        return _this.response('delete:error', res, error.message, error.code).send();
      });
    });
  };

  return Endpoint;

})();

module.exports = Endpoint;
