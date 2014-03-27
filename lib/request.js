var Q, Request, httperror, _;

Q = require('q');

_ = require('underscore');

httperror = require('./httperror');

module.exports = Request = (function() {
  function Request(endpoint, modelClass) {
    if (modelClass == null) {
      modelClass = null;
    }
    if (!modelClass) {
      modelClass = endpoint.$modelClass;
    }
    this.$$modelClass = modelClass;
    this.$$endpoint = endpoint;
  }

  /*
  	PRIVATE METHODS
  */


  Request.prototype.$$runHook = function(hook, method, args, mod) {
    var deferred, func, funcs, next, runFunction, taps, _i, _len;
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
    taps = this.$$endpoint.$taps;
    if (taps[hook] == null) {
      deferred.resolve(mod);
    } else if (taps[hook][method] == null) {
      deferred.resolve(mod);
    } else {
      funcs = taps[hook][method];
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

  Request.prototype.$$populateQuery = function(query) {
    var pop, _i, _len, _ref, _results;
    if ((this.$$endpoint.options.populate != null) && this.$$endpoint.options.populate.length) {
      _ref = this.$$endpoint.options.populate;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        pop = _ref[_i];
        _results.push(query.populate(pop));
      }
      return _results;
    }
  };

  Request.prototype.$$populateDocument = function(doc) {
    var pop, populatePath, promises, _i, _len, _ref;
    populatePath = function(path, doc) {
      var d;
      d = Q.defer();
      return doc.populate(path, function(err, doc) {
        return d.resolve();
      });
    };
    promises = [];
    _ref = this.$$endpoint.options.populate;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      pop = _ref[_i];
      promises.push(populatePath(pop, doc));
    }
    return Q.all(promises);
  };

  Request.prototype.$fetch = function(req, res) {
    var deferred, err, id,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id) {
      err = httperror.forge('ID not provided', 400);
      this.$$runHook('pre_response_error', 'fetch', req, err).then(function(err) {
        return res.send(err.message, err.code);
      }, function(err) {
        return deferred.reject(err);
      });
    } else if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      err = httperror.forge('Bad ID', 400);
      this.$$runHook('pre_response_error', 'fetch', req, err).then(function(err) {
        return res.send(err.message, err.code);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
        var query;
        filter._id = id;
        query = _this.$$modelClass.findOne(filter);
        _this.$$populateQuery(query);
        return query.exec(function(err, model) {
          if (err) {
            _this.$$runHook('pre_response_error', 'fetch', req, httperror.forge(err.message, 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          }
          if (!model) {
            return _this.$$runHook('pre_response_error', 'fetch', req, httperror.forge('Could not find document', 404)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            return _this.$$runHook('pre_response', 'fetch', req, model.toObject()).then(function(response) {
              return deferred.resolve(response);
            }, function(err) {
              return deferred.reject(err);
            });
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'fetch', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
          return deferred.reject(err);
        }, function(err) {
          return deferred.reject(err);
        });
      });
    }
    return deferred.promise;
  };

  Request.prototype.$list = function(req, res) {
    var deferred,
      _this = this;
    deferred = Q.defer();
    this.$$runHook('pre_filter', 'list', req, {}).then(function(filter) {
      var query;
      query = _this.$$modelClass.find(filter);
      _this.$$populateQuery(query);
      if (_this.$$endpoint.options.pagination) {
        return _this.$$modelClass.count(filter, function(err, count) {
          var config;
          if (err) {
            return _this.$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            res.setHeader('Record-Count', count.toString());
            config = _this.$$getPaginationConfig(req);
            return query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec(function(err, collection) {
              var f, final, _i, _len;
              if (err) {
                _this.$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then(function(err) {
                  return deferred.reject(err);
                }, function(err) {
                  return deferred.reject(err);
                });
                return deferred.reject(httperror.forge('Could not retrieve collection', 500));
              } else {
                final = [];
                for (_i = 0, _len = collection.length; _i < _len; _i++) {
                  f = collection[_i];
                  final.push(f.toObject());
                }
                return _this.$$runHook('pre_response', 'list', req, final).then(function(response) {
                  return deferred.resolve(response);
                }, function(err) {
                  return deferred.reject(err);
                });
              }
            });
          }
        });
      } else {
        return query.exec(function(err, collection) {
          var f, final, _i, _len;
          if (err) {
            _this.$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
            return deferred.reject(httperror.forge('Could not retrieve collection', 500));
          } else {
            final = [];
            for (_i = 0, _len = collection.length; _i < _len; _i++) {
              f = collection[_i];
              final.push(f.toObject());
            }
            return _this.$$runHook('pre_response', 'list', req, final).then(function(response) {
              return deferred.resolve(response);
            }, function(err) {
              return deferred.reject(err);
            });
          }
        });
      }
    }, function(err) {
      return _this.$$runHook('pre_response_error', 'list', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    });
    return deferred.promise;
  };

  Request.prototype.$post = function(req, res) {
    var deferred,
      _this = this;
    deferred = Q.defer();
    this.$$runHook('pre_filter', 'post', req, req.body).then(function(data) {
      var model;
      model = new _this.$$modelClass(data);
      if (_this.$$endpoint.options.cascade != null) {
        return model.cascadeSave(function(err, model) {
          if (err) {
            return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            return _this.$$populateDocument(model).then(function() {
              return _this.$$runHook('pre_response', 'post', req, model.toObject()).then(function(response) {
                return deferred.resolve(response);
              }, function(err) {
                return deferred.reject(err);
              });
            });
          }
        }, {
          limit: _this.$$endpoint.options.cascade.allowedRelations,
          filter: _this.$$endpoint.options.cascade.filter
        });
      } else {
        return model.save(function(err, model) {
          if (err) {
            return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            return _this.$$populateDocument(model).then(function() {
              return _this.$$runHook('pre_response', 'post', req, model.toObject()).then(function(response) {
                return deferred.resolve(response);
              }, function(err) {
                return deferred.reject(err);
              });
            });
          }
        });
      }
    }, function(err) {
      return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    });
    return deferred.promise;
  };

  Request.prototype.$put = function(req, res) {
    var deferred, id,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      this.$$runHook('pre_response_error', 'put', req, httperror.forge('Bad ID', 400)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
        var query;
        filter._id = id;
        query = _this.$$modelClass.findOne(filter);
        _this.$$populateQuery(query);
        return query.exec(function(err, model) {
          if (err) {
            _this.$$runHook('pre_response_error', 'put', req, httperror.forge('Server error', 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          }
          if (!model) {
            return _this.$$runHook('pre_response_error', 'put', req, httperror.forge('Not found', 404)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            return _this.$$runHook('post_retrieve', 'put', req, model).then(function(model) {
              var data;
              data = req.body;
              delete data._id;
              delete data.__v;
              return _this.$$runHook('pre_filter', 'put', req, data).then(function(data) {
                model.set(data);
                if (_this.$$endpoint.options.cascade != null) {
                  return model.cascadeSave(function(err, model) {
                    if (err) {
                      return _this.$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, 400)).then(function(err) {
                        return deferred.reject(err);
                      }, function(err) {
                        return deferred.reject(err);
                      });
                    } else {
                      return _this.$$populateDocument(model).then(function() {
                        return _this.$$runHook('pre_response', 'put', req, model.toObject()).then(function(response) {
                          return deferred.resolve(response);
                        }, function(err) {
                          return deferred.reject(err);
                        });
                      });
                    }
                  }, {
                    limit: _this.$$endpoint.options.cascade.allowedRelations,
                    filter: _this.$$endpoint.options.cascade.filter
                  });
                } else {
                  return model.save(function(err, model) {
                    if (err) {
                      return _this.$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, 400)).then(function(err) {
                        return deferred.reject(err);
                      }, function(err) {
                        return deferred.reject(err);
                      });
                    } else {
                      return _this.$$populateDocument(model).then(function() {
                        return _this.$$runHook('pre_response', 'put', req, model.toObject()).then(function(response) {
                          return deferred.resolve(response);
                        }, function(err) {
                          return deferred.reject(err);
                        });
                      });
                    }
                  });
                }
              });
            }, function(err) {
              return _this.$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
                return deferred.reject(err);
              }, function(err) {
                return deferred.reject(err);
              });
            });
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'put', req, httperror.forge('Server error', 500)).then(function(err) {
          return deferred.reject(err);
        }, function(err) {
          return deferred.reject(err);
        });
      });
    }
    return deferred.promise;
  };

  Request.prototype.$delete = function(req, res) {
    var deferred, id,
      _this = this;
    deferred = Q.defer();
    id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      this.$$runHook('pre_response_error', 'delete', req, httperror.forge('Bad ID', 400)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
        var query;
        filter._id = id;
        query = _this.$$modelClass.findOne(filter);
        _this.$$populateQuery(query);
        return query.exec(function(err, model) {
          if (err) {
            _this.$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          }
          if (!model) {
            return _this.$$runHook('pre_response_error', 'delete', req, httperror.forge('Not found', 404)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            return _this.$$runHook('post_retrieve', 'delete', req, model).then(function(model) {
              return model.remove(function(err) {
                if (err) {
                  return _this.$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, 500)).then(function(err) {
                    return deferred.reject(err);
                  }, function(err) {
                    return deferred.reject(err);
                  });
                } else {
                  return deferred.resolve();
                }
              });
            }, function(err) {
              return _this.$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
                return deferred.reject(err);
              }, function(err) {
                return deferred.reject(err);
              });
            });
          }
        });
      }, function(err) {
        return _this.$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
          return deferred.reject(err);
        }, function(err) {
          return deferred.reject(err);
        });
      });
    }
    return deferred.promise;
  };

  Request.prototype.$$getPaginationConfig = function(req) {
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
      result.perPage = this.$$endpoint.options.pagination.perPage;
    }
    if (result.sortField == null) {
      result.sortField = this.$$endpoint.options.pagination.sortField;
    }
    return result;
  };

  return Request;

})();
