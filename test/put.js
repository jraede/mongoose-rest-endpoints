var Q, authorSchema, cascade, commentSchema, express, mongoose, mre, postSchema, request, requirePassword, should;

express = require('express');

request = require('supertest');

should = require('should');

Q = require('q');

mongoose = require('mongoose');

require('../lib/log').verbose(true);

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

describe('Put', function() {
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
      mongoose.connection.collections.posts.drop();
      return done();
    });
    it('should let you put with no hooks', function(done) {
      var data;
      this.endpoint.register(this.app);
      data = this.mod.toObject();
      data.number = 6;
      return request(this.app).put('/api/posts/' + data._id).send(data).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(6);
        res.body.string.should.equal('Test');
        return done();
      });
    });
    it('should run middleware', function(done) {
      var data, id,
        _this = this;
      this.endpoint.addMiddleware('put', requirePassword('asdf')).register(this.app);
      data = this.mod.toObject();
      id = this.mod._id;
      return request(this.app).put('/api/posts/' + id).query({
        password: 'asdf'
      }).send(data).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        return request(_this.app).put('/api/posts/' + id).query({
          password: 'ffff'
        }).send(data).end(function(err, res) {
          res.status.should.equal(401);
          return done();
        });
      });
    });
    it('should honor pre_filter fetch hook', function(done) {
      var data;
      this.endpoint.tap('pre_filter', 'fetch', function(req, data, next) {
        data.number = 6;
        return next(data);
      }).register(this.app);
      data = this.mod.toObject();
      data.number = 6;
      return request(this.app).put('/api/posts/' + data._id).send(data).end(function(err, res) {
        res.status.should.equal(404);
        return done();
      });
    });
    it('should honor post_retrieve fetch hook', function(done) {
      var data, id,
        _this = this;
      this.endpoint.tap('post_retrieve', 'put', function(req, model, next) {
        var err;
        if (req.query.test !== 'test') {
          err = new Error('Test');
          err.code = 401;
          throw err;
        } else {
          return next(model);
        }
      }).register(this.app);
      data = this.mod.toObject();
      data.number = 6;
      id = data._id;
      return request(this.app).put('/api/posts/' + id).send(data).end(function(err, res) {
        res.status.should.equal(401);
        return request(_this.app).put('/api/posts/' + id).query({
          test: 'test'
        }).send(data).end(function(err, res) {
          res.status.should.equal(200);
          return done();
        });
      });
    });
    return it('should honor pre_save fetch hook', function(done) {
      var data, id,
        _this = this;
      this.endpoint.tap('pre_save', 'put', function(req, model, next) {
        var err;
        if (req.query.test !== 'test') {
          err = new Error('Test');
          err.code = 401;
          throw err;
        } else {
          return next(model);
        }
      }).register(this.app);
      data = this.mod.toObject();
      data.number = 6;
      id = data._id;
      return request(this.app).put('/api/posts/' + id).send(data).end(function(err, res) {
        res.status.should.equal(401);
        return request(_this.app).put('/api/posts/' + id).query({
          test: 'test'
        }).send(data).end(function(err, res) {
          res.status.should.equal(200);
          return done();
        });
      });
    });
  });
  return describe('Cascading relations', function() {
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
    return it('should let you put with relations', function(done) {
      var data;
      this.endpoint.cascade(['_comments'], function(data, path) {
        data.comment += 'FFF';
        return data;
      }).register(this.app);
      data = {
        date: Date.now(),
        number: 5,
        string: 'Test',
        _related: {
          _comments: [
            {
              comment: 'asdf1234'
            }
          ]
        }
      };
      return request(this.app).put('/api/posts/' + this.mod._id).send(data).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        res.body._comments.length.should.equal(1);
        res.body._related._comments.length.should.equal(1);
        res.body._related._comments[0].comment.should.equal('asdf1234FFF');
        return done();
      });
    });
  });
});
