var Q, authorSchema, cascade, commentSchema, express, moment, mongoose, mre, postSchema, request, requirePassword, should, tracker;

express = require('express');

request = require('supertest');

should = require('should');

Q = require('q');

mongoose = require('mongoose');

require('../lib/log').verbose(true);

mre = require('../lib/endpoint');

tracker = require('../lib/tracker');

moment = require('moment');

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
  ],
  _author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Author'
  }
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
  this.timeout(5000);
  return describe('Basic object', function() {
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
    it('should let you bulk post with no hooks', function(done) {
      var data;
      this.endpoint.allowBulkPost().register(this.app);
      data = [
        {
          date: Date.now(),
          number: 5,
          string: 'Test'
        }, {
          date: Date.now(),
          number: 8,
          string: 'Foo'
        }
      ];
      return request(this.app).post('/api/posts/bulk').send(data).end(function(err, res) {
        res.status.should.equal(201);
        return done();
      });
    });
    it('should correctly handle errors', function(done) {
      var data;
      this.endpoint.allowBulkPost().register(this.app);
      data = [
        {
          date: Date.now(),
          number: 5,
          string: 'Test'
        }, {
          date: Date.now(),
          number: 8
        }, {
          date: Date.now(),
          number: 7
        }
      ];
      return request(this.app).post('/api/posts/bulk').send(data).end(function(err, res) {
        res.status.should.equal(201);
        res.body[0].state.should.equal('fulfilled');
        res.body[1].state.should.equal('rejected');
        res.body[2].state.should.equal('rejected');
        res.body[1].reason.message.message.should.equal('Validation failed');
        res.body[2].reason.message.message.should.equal('Validation failed');
        return done();
      });
    });
    return it('should have the first error code if they are all errors', function(done) {
      var data;
      this.endpoint.allowBulkPost().register(this.app);
      data = [
        {
          date: Date.now(),
          number: 5
        }, {
          date: Date.now(),
          number: 8
        }, {
          date: Date.now(),
          number: 7
        }
      ];
      return request(this.app).post('/api/posts/bulk').send(data).end(function(err, res) {
        res.status.should.equal(400);
        return done();
      });
    });
  });
});
