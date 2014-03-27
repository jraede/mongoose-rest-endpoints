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

describe('Post', function() {
  describe('Basic object', function() {
    beforeEach(function(done) {
      this.endpoint = new mre('/api/posts', 'Post');
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      return done();
    });
    afterEach(function(done) {
      mongoose.connection.collections.posts.drop();
      return done();
    });
    it('should let you post with no hooks', function(done) {
      var data;
      this.endpoint.register(this.app);
      data = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      return request(this.app).post('/api/posts/').send(data).end(function(err, res) {
        res.status.should.equal(201);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        return done();
      });
    });
    it('should run middleware', function(done) {
      var data,
        _this = this;
      this.endpoint.addMiddleware('post', requirePassword('asdf')).register(this.app);
      data = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      return request(this.app).post('/api/posts/').query({
        password: 'asdf'
      }).send(data).end(function(err, res) {
        res.status.should.equal(201);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        return request(_this.app).post('/api/posts/').query({
          password: 'ffff'
        }).send(data).end(function(err, res) {
          res.status.should.equal(401);
          return done();
        });
      });
    });
    it('should run pre filter', function(done) {
      var postData;
      postData = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      this.endpoint.tap('pre_filter', 'post', function(req, data, next) {
        data.number = 7;
        return data;
      }).register(this.app);
      return request(this.app).post('/api/posts/').send(postData).end(function(err, res) {
        res.status.should.equal(201);
        res.body.number.should.equal(7);
        res.body.string.should.equal('Test');
        return done();
      });
    });
    it('should handle a thrown error on pre filter', function(done) {
      var postData;
      postData = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      this.endpoint.tap('pre_filter', 'post', function(req, data, next) {
        var err;
        err = new Error('test');
        err.code = 405;
        throw err;
      }).register(this.app);
      return request(this.app).post('/api/posts/').send(postData).end(function(err, res) {
        res.status.should.equal(405);
        return done();
      });
    });
    return it('should run pre response', function(done) {
      var postData;
      postData = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      this.endpoint.tap('pre_response', 'post', function(req, data, next) {
        data.number = 7;
        return data;
      }).register(this.app);
      return request(this.app).post('/api/posts/').send(postData).end(function(err, res) {
        res.status.should.equal(201);
        res.body.number.should.equal(7);
        res.body.string.should.equal('Test');
        return mongoose.model('Post').findById(res.body._id, function(err, mod) {
          mod.number.should.equal(5);
          return done();
        });
      });
    });
  });
  return describe('Cascading relations', function() {
    beforeEach(function(done) {
      this.endpoint = new mre('/api/posts', 'Post');
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      return done();
    });
    afterEach(function(done) {
      mongoose.connection.collections.posts.drop();
      return done();
    });
    return it('should let you post with relations', function(done) {
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
      return request(this.app).post('/api/posts/').send(data).end(function(err, res) {
        res.status.should.equal(201);
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
