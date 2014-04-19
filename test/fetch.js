var Q, authorSchema, cascade, commentSchema, express, moment, mongoose, mre, postSchema, request, requirePassword, should, tracker;

express = require('express');

request = require('supertest');

should = require('should');

Q = require('q');

mongoose = require('mongoose');

moment = require('moment');

require('../lib/log').verbose(true);

tracker = require('../lib/tracker');

mre = require('../lib/endpoint');

commentSchema = new mongoose.Schema({
  comment: String,
  otherField: Number,
  _post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  },
  _author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Author'
  }
});

postSchema = new mongoose.Schema({
  date: Date,
  number: Number,
  string: {
    type: String,
    required: true
  },
  _comments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      $through: '_post'
    }
  ]
});

authorSchema = new mongoose.Schema({
  name: 'String'
});

requirePassword = function(password) {
  return function(req, res, next) {
    if (req.query.password && req.query.password === password) {
      return next();
    } else {
      return res.send(401);
    }
  };
};

mongoose.connect('mongodb://localhost/mre_test');

cascade = require('cascading-relations');

postSchema.plugin(cascade);

commentSchema.plugin(cascade);

authorSchema.plugin(cascade);

mongoose.model('Post', postSchema);

mongoose.model('Comment', commentSchema);

mongoose.model('Author', authorSchema);

mongoose.set('debug', true);

describe('Fetch', function() {
  describe('Basic object', function() {
    beforeEach(function(done) {
      var mod, modClass,
        _this = this;
      this.endpoint = new mre('/api/posts', 'Post');
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      modClass = mongoose.model('Post');
      mod = modClass({
        date: Date.now(),
        number: 5,
        string: 'Test'
      });
      return mod.save(function(err, res) {
        _this.mod = res;
        return done();
      });
    });
    afterEach(function(done) {
      return this.mod.remove(function() {
        return done();
      });
    });
    it('should retrieve with no hooks', function(done) {
      this.endpoint.register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        console.log(res.text);
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        return done();
      });
    });
    it('should honor bad pre_filter hook', function(done) {
      this.endpoint.tap('pre_filter', 'fetch', function(args, data, next) {
        data.number = 6;
        return next(data);
      }).register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(404);
        return done();
      });
    });
    it('should honor good pre_filter hook', function(done) {
      this.endpoint.tap('pre_filter', 'fetch', function(args, data, next) {
        data.number = 5;
        return next(data);
      }).register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        return done();
      });
    });
    it('should honor pre_response hook', function(done) {
      this.endpoint.tap('pre_response', 'fetch', function(args, model, next) {
        delete model.number;
        return next(model);
      }).register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        should.not.exist(res.body.number);
        return done();
      });
    });
    return it('should honor pre_response_error hook', function(done) {
      this.endpoint.tap('pre_response_error', 'fetch', function(args, err, next) {
        err.message = 'Foo';
        return next(err);
      }).register(this.app);
      return request(this.app).get('/api/posts/abcdabcdabcdabcdabcdabcd').end(function(err, res) {
        res.status.should.equal(404);
        res.text.should.equal('Foo');
        return done();
      });
    });
  });
  describe('With middleware', function() {
    beforeEach(function(done) {
      var mod, modClass,
        _this = this;
      this.endpoint = new mre('/api/posts', 'Post');
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      modClass = mongoose.model('Post');
      mod = modClass({
        date: Date.now(),
        number: 5,
        string: 'Test'
      });
      return mod.save(function(err, res) {
        _this.mod = res;
        return done();
      });
    });
    afterEach(function(done) {
      return this.mod.remove(function() {
        return done();
      });
    });
    it('should retrieve with middleware', function(done) {
      this.endpoint.addMiddleware('fetch', requirePassword('asdf'));
      this.endpoint.register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).query({
        password: 'asdf'
      }).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        return done();
      });
    });
    return it('should give a 401 with wrong password', function(done) {
      this.endpoint.addMiddleware('fetch', requirePassword('asdf'));
      this.endpoint.register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).query({
        password: 'ffff'
      }).end(function(err, res) {
        res.status.should.equal(401);
        return done();
      });
    });
  });
  describe('Populate', function() {
    beforeEach(function(done) {
      var mod, modClass,
        _this = this;
      this.endpoint = new mre('/api/posts', 'Post');
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      modClass = mongoose.model('Post');
      mod = modClass({
        date: Date.now(),
        number: 5,
        string: 'Test',
        _related: {
          _comments: [
            {
              comment: 'Asdf1234',
              otherField: 5
            }
          ]
        }
      });
      return mod.cascadeSave(function(err, res) {
        _this.mod = res;
        return done();
      });
    });
    afterEach(function(done) {
      return this.mod.remove(function() {
        return done();
      });
    });
    it('should populate on _related', function(done) {
      this.endpoint.populate('_comments').register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        res.body._related._comments.length.should.equal(1);
        res.body._comments.length.should.equal(1);
        res.body._related._comments[0].comment.should.equal('Asdf1234');
        res.body._related._comments[0].otherField.should.equal(5);
        return done();
      });
    });
    return it('should populate when specifying fields', function(done) {
      this.endpoint.populate('_comments', 'comment').register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        res.body._related._comments.length.should.equal(1);
        res.body._comments.length.should.equal(1);
        res.body._related._comments[0].comment.should.equal('Asdf1234');
        should.not.exist(res.body._related._comments[0].otherField);
        return done();
      });
    });
  });
  return describe('Tracking interface', function() {
    beforeEach(function(done) {
      this.endpoint = new mre('/api/posts', 'Post');
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      return done();
    });
    afterEach(function(done) {
      if (this.mod) {
        return this.mod.remove(function() {
          return done();
        });
      } else {
        return done();
      }
    });
    it('should run tracking interface on success', function(done) {
      var mod, modClass,
        _this = this;
      modClass = mongoose.model('Post');
      mod = modClass({
        date: Date.now(),
        number: 5,
        string: 'Test'
      });
      return mod.save(function(err, res) {
        _this.mod = res;
        tracker["interface"] = {
          track: function(params) {
            console.log('Tracking params', params);
            params.response.code.should.equal(200);
            (params.time < 50).should.equal(true);
            return done();
          }
        };
        _this.endpoint.register(_this.app);
        return request(_this.app).get('/api/posts/' + _this.mod._id).end(function(err, res) {
          return console.log('Ended');
        });
      });
    });
    it('should run tracking interface on error', function(done) {
      tracker["interface"] = {
        track: function(params) {
          console.log('Tracking params:', params);
          params.response.code.should.equal(400);
          (params.time < 50).should.equal(true);
          return done();
        }
      };
      this.endpoint.register(this.app);
      return request(this.app).get('/api/posts/asdf').end(function(err, res) {
        return console.log('Ended');
      });
    });
    return it('should calculate time based on X-Request-Start header', function(done) {
      var requestStart;
      tracker["interface"] = {
        track: function(params) {
          params.response.code.should.equal(400);
          params.time.should.be.greaterThan(100);
          params.time.should.be.lessThan(200);
          return done();
        }
      };
      this.endpoint.register(this.app);
      requestStart = moment().valueOf() - 100;
      return request(this.app).get('/api/posts/asdf').set('X-Request-Start', requestStart.toString()).end(function(err, res) {
        return console.log('Ended');
      });
    });
  });
});
