var Q, Request, getStartTime, httperror, log, moment, _;

Q = require('q');

_ = require('underscore');

httperror = require('./httperror');

log = require('./log');

moment = require('moment');

getStartTime = function(req) {
  var startTime;
  if (req.headers('X-Request-Start')) {
    startTime = moment(req.headers('X-Request-Start'));
  } else {
    startTime = moment();
  }
  return startTime;
};

module.exports = Request = (function() {
  function Request(endpoint, modelClass) {
    if (modelClass == null) {
      modelClass = null;
    }
    log('Forged request');
    if (!modelClass) {
      modelClass = endpoint.$modelClass;
    }
    this.$$modelClass = modelClass;
    this.$$endpoint = endpoint;
  }

  Request.prototype.$$runHook = function(hook, method, args, mod) {
    var deferred, func, funcs, next, runFunction, taps, _i, _len;
    log('Running hook on ' + hook.green + '::' + method.green);
    deferred = Q.defer();
    runFunction = function(f, next, a, data) {
      var err;
      log(hook.green + '::' + method.green + ' - ', 'Data is now:', data);
      if (data instanceof Error) {
        return deferred.reject(data);
      }
      try {
        return _.bind(f, this, a, data, next)();
      } catch (_error) {
        err = _error;
        return deferred.reject(err);
      }
    };
    taps = this.$$endpoint.$taps;
    if (taps[hook] == null) {
      log('No taps on hook');
      deferred.resolve(mod);
    } else if (taps[hook][method] == null) {
      log('No taps on hook/method combo.');
      deferred.resolve(mod);
    } else {
      funcs = taps[hook][method];
      next = function(final) {
        log(hook.green + '::' + method.green + ' - ', 'running final method', final);
        if (final instanceof Error) {
          return deferred.reject(final);
        } else {
          return deferred.resolve(final);
        }
      };
      funcs = _.clone(funcs).reverse();
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
        if (pop instanceof Array) {
          _results.push(query.populate(pop[0], pop[1]));
        } else {
          _results.push(query.populate(pop));
        }
      }
      return _results;
    }
  };

  Request.prototype.$$populateDocument = function(doc) {
    var pop, populatePath, promises, _i, _len, _ref;
    populatePath = function(path, doc) {
      var d;
      d = Q.defer();
      doc.populate(path, function(err, doc) {
        console.log('Populate finished;', doc);
        return d.resolve();
      });
      return d.promise;
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
    log('Running ' + 'FETCH'.bold);
    if (!id) {
      log('ERROR:'.red, 'ID not provided in URL parameters');
      err = httperror.forge('ID not provided', 400);
      this.$$runHook('pre_response_error', 'fetch', req, err).then(function(err) {
        return res.send(err.message, err.code);
      }, function(err) {
        return deferred.reject(err);
      });
    } else if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      log('ERROR:'.red, 'ID not in Mongo format');
      err = httperror.forge('Bad ID', 400);
      this.$$runHook('pre_response_error', 'fetch', req, err).then(function(err) {
        return res.send(err.message, err.code);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
        var query;
        log('Successfuly ran pre_filter hook: ', JSON.stringify(filter));
        filter._id = id;
        query = _this.$$modelClass.findOne(filter);
        _this.$$populateQuery(query);
        return query.exec(function(err, model) {
          if (err) {
            log('ERROR:'.red, err.message);
            _this.$$runHook('pre_response_error', 'fetch', req, httperror.forge(err.message, 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          }
          if (!model) {
            log('ERROR:'.red, 'Object not found');
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
        log('ERROR:'.red, 'Error running pre_filter hook: ', err.message);
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
    log('Running ' + 'LIST'.bold);
    this.$$runHook('pre_filter', 'list', req, {}).then(function(filter) {
      var query;
      log('Successfuly ran pre_filter hook: ', JSON.stringify(filter));
      query = _this.$$modelClass.find(filter);
      _this.$$populateQuery(query);
      if (_this.$$endpoint.options.pagination) {
        log('Paginating');
        return _this.$$modelClass.count(filter, function(err, count) {
          var config;
          if (err) {
            log('ERROR:'.red, 'Count could not be retrieved:', err.message);
            return _this.$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            log('There are ' + count.toString().yellow + ' total documents that fit filter');
            res.setHeader('Record-Count', count.toString());
            config = _this.$$getPaginationConfig(req);
            return query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec(function(err, collection) {
              var f, final, _i, _len;
              if (err) {
                log('ERROR:'.red, 'Error executing query:', err.message);
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
        log('No pagination, getting all results');
        return query.exec(function(err, collection) {
          var f, final, _i, _len;
          if (err) {
            log('ERROR:'.red, 'Error executing query:', err.message);
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
      log('ERROR:'.red, 'Error running pre_filter hook: ', err.message);
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
    log('Running ' + 'POST'.bold);
    this.$$runHook('pre_filter', 'post', req, req.body).then(function(data) {
      var model;
      log('Successfuly ran pre_filter hook: ', JSON.stringify(data));
      model = new _this.$$modelClass(data);
      if (_this.$$endpoint.options.cascade != null) {
        log('Running cascade save');
        return model.cascadeSave(function(err, model) {
          if (err) {
            log('ERROR:'.red, 'Cascade save failed:', err.message);
            return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            log('Finished cascade save. Populating');
            return _this.$$populateDocument(model).then(function() {
              log('Populated');
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
        log('Saving normally (no cascade)');
        return model.save(function(err, model) {
          if (err) {
            log('ERROR:'.red, 'Save failed:', err.message);
            return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            log('Finished save. Populating');
            return _this.$$populateDocument(model).then(function() {
              log('Populated');
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
      log('ERROR:'.red, 'Error running pre_filter hook: ', err.message);
      return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    });
    return deferred.promise;
  };

  Request.prototype.$$doBulkPostForSingle = function(obj, req) {
    var deferred,
      _this = this;
    deferred = Q.defer();
    this.$$runHook('pre_filter', 'post', req, obj).then(function(data) {
      var model;
      log('Successfuly ran pre_filter hook: ', JSON.stringify(data));
      model = new _this.$$modelClass(data);
      log('Saving normally (no cascade allowed on bulkpost)');
      return model.save(function(err, model) {
        if (err) {
          log('ERROR:'.red, 'Save failed:', err.message);
          return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then(function(err) {
            return deferred.reject(err);
          }, function(err) {
            return deferred.reject(err);
          });
        } else {
          log('Finished save, resolving');
          return deferred.resolve();
        }
      });
    }, function(err) {
      log('ERROR:'.red, 'Error running pre_filter hook: ', err.message);
      return _this.$$runHook('pre_response_error', 'post', req, httperror.forge(err, err.code != null ? err.code : 500)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    });
    return deferred.promise;
  };

  Request.prototype.$bulkpost = function(req, res) {
    var deferred, obj, promises, _i, _len, _ref;
    deferred = Q.defer();
    log('Running ' + 'BULKPOST'.bold);
    if (!(req.body instanceof Array)) {
      log('ERROR:'.red, 'Request body not array');
      this.$$runHook('pre_response_error', 'bulkpost', req, httperror.forge('Request body is not an array', 400)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      promises = [];
      _ref = req.body;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        obj = _ref[_i];
        promises.push(this.$$doBulkPostForSingle(obj, req));
      }
      Q.allSettled(promises).then(function(results) {
        var rejectedCount, resolvedCount, result, _j, _len1;
        resolvedCount = 0;
        rejectedCount = 0;
        for (_j = 0, _len1 = results.length; _j < _len1; _j++) {
          result = results[_j];
          if (result.state === 'fulfilled') {
            resolvedCount++;
          } else {
            rejectedCount++;
          }
        }
        if (resolvedCount && !rejectedCount) {
          return deferred.resolve();
        } else if (resolvedCount) {
          results.code = 207;
          return deferred.reject(results);
        }
        if (results[0].reason != null) {
          results.code = results[0].reason.code;
        }
        return deferred.reject(results);
      });
    }
    return deferred.promise;
  };

  Request.prototype.$put = function(req, res) {
    var deferred, id,
      _this = this;
    deferred = Q.defer();
    log('Running ' + 'PUT'.bold);
    id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      log('ERROR:'.red, 'ID not in Mongo format');
      this.$$runHook('pre_response_error', 'put', req, httperror.forge('Bad ID', 400)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
        var query;
        log('Successfuly ran pre_filter hook: ', JSON.stringify(filter));
        filter._id = id;
        query = _this.$$modelClass.findOne(filter);
        _this.$$populateQuery(query);
        return query.exec(function(err, model) {
          if (err) {
            log('ERROR:'.red, 'Error fetching model:', err.message);
            _this.$$runHook('pre_response_error', 'put', req, httperror.forge('Server error', 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          }
          if (!model) {
            log('ERROR:'.red, 'No model found (404)');
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
              log('Ran post retrieve hook', model.toObject());
              return _this.$$runHook('pre_filter', 'put', req, data).then(function(data) {
                model.set(data);
                log('Ran pre filter hook', data);
                if (_this.$$endpoint.options.cascade != null) {
                  log('Cascade saving', model._related);
                  return model.cascadeSave(function(err) {
                    if (err) {
                      log('ERROR:'.red, 'Error during cascade save:', err.message);
                      return _this.$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, 400)).then(function(err) {
                        return deferred.reject(err);
                      }, function(err) {
                        return deferred.reject(err);
                      });
                    } else {
                      log('Cascade saved. Populating', model);
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
                  log('Regular save (no cascade)');
                  return model.save(function(err, model) {
                    if (err) {
                      log('ERROR:'.red, 'Error during save:', err.message);
                      return _this.$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, 400)).then(function(err) {
                        return deferred.reject(err);
                      }, function(err) {
                        return deferred.reject(err);
                      });
                    } else {
                      log('Saved. Populating');
                      return _this.$$populateDocument(model).then(function() {
                        log('Populated');
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
        log('ERROR:'.red, 'Error running pre_filter hook: ', err.message);
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
    log('Running ' + 'PUT'.bold);
    id = req.params.id;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      log('ERROR:'.red, 'ID not in Mongo format');
      this.$$runHook('pre_response_error', 'delete', req, httperror.forge('Bad ID', 400)).then(function(err) {
        return deferred.reject(err);
      }, function(err) {
        return deferred.reject(err);
      });
    } else {
      this.$$runHook('pre_filter', 'fetch', req, {}).then(function(filter) {
        var query;
        log('Successfuly ran pre_filter hook: ', JSON.stringify(filter));
        filter._id = id;
        query = _this.$$modelClass.findOne(filter);
        _this.$$populateQuery(query);
        return query.exec(function(err, model) {
          if (err) {
            log('ERROR:'.red, 'Error fetching model:', err.message);
            _this.$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          }
          if (!model) {
            log('ERROR:'.red, 'No model found (404)');
            return _this.$$runHook('pre_response_error', 'delete', req, httperror.forge('Not found', 404)).then(function(err) {
              return deferred.reject(err);
            }, function(err) {
              return deferred.reject(err);
            });
          } else {
            return _this.$$runHook('post_retrieve', 'delete', req, model).then(function(model) {
              return model.remove(function(err) {
                if (err) {
                  log('ERROR:'.red, 'Failure to delete:', err.message);
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
              log('ERROR:'.red, 'Error thrown during post retrieve', err.message);
              return _this.$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, err.code != null ? err.code : 500)).then(function(err) {
                return deferred.reject(err);
              }, function(err) {
                return deferred.reject(err);
              });
            });
          }
        });
      }, function(err) {
        log('ERROR:'.red, 'Error running pre_filter hook: ', err.message);
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
