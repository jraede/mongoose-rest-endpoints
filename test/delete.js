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

describe('Delete', function() {
  return describe('Basic object', function() {
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
      mongoose.connection.collections.posts.drop();
      return done();
    });
    it('should let you delete with no hooks', function(done) {
      var data;
      this.endpoint.register(this.app);
      data = this.mod.toObject();
      data.number = 6;
      return request(this.app).del('/api/posts/' + data._id).end(function(err, res) {
        res.status.should.equal(200);
        return mongoose.model('Post').findById(data._id, function(err, res) {
          should.not.exist(err);
          should.not.exist(res);
          return done();
        });
      });
    });
    it('should run middleware', function(done) {
      var data, id,
        _this = this;
      this.endpoint.addMiddleware('delete', requirePassword('asdf')).register(this.app);
      data = this.mod.toObject();
      id = this.mod._id;
      return request(this.app).del('/api/posts/' + id).query({
        password: 'ffff'
      }).end(function(err, res) {
        res.status.should.equal(401);
        return request(_this.app).del('/api/posts/' + id).query({
          password: 'asdf'
        }).end(function(err, res) {
          res.status.should.equal(200);
          return done();
        });
      });
    });
    it('should honor pre_filter fetch hook', function(done) {
      this.endpoint.tap('pre_filter', 'fetch', function(req, data, next) {
        data.number = 6;
        return next(data);
      }).register(this.app);
      return request(this.app).del('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(404);
        return done();
      });
    });
    return it('should honor post_retrieve fetch hook', function(done) {
      var id,
        _this = this;
      this.endpoint.tap('post_retrieve', 'delete', function(req, model, next) {
        var err;
        if (req.query.test !== 'test') {
          err = new Error('Test');
          err.code = 401;
          throw err;
        } else {
          return next(model);
        }
      }).register(this.app);
      id = this.mod._id;
      return request(this.app).del('/api/posts/' + id).end(function(err, res) {
        res.status.should.equal(401);
        return request(_this.app).del('/api/posts/' + id).query({
          test: 'test'
        }).end(function(err, res) {
          res.status.should.equal(200);
          return done();
        });
      });
    });
  });
});
