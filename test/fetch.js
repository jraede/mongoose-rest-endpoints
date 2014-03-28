var Q, authorSchema, cascade, commentSchema, express, mongoose, mre, postSchema, request, requirePassword, should;

express = require('express');

request = require('supertest');

should = require('should');

Q = require('q');

mongoose = require('mongoose');

mre = require('../lib/endpoint');

commentSchema = new mongoose.Schema({
  comment: String,
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
  return describe('Populate', function() {
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
              comment: 'Asdf1234'
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
    return it('should populate on _related', function(done) {
      this.endpoint.populate('_comments').register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        res.body._related._comments.length.should.equal(1);
        res.body._comments.length.should.equal(1);
        res.body._related._comments[0].comment.should.equal('Asdf1234');
        return done();
      });
    });
  });
});
