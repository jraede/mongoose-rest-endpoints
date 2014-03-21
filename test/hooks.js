var Q, app, authorSchema, cascade, commentSchema, express, mongoose, mre, postSchema, request, requirePassword, should;

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
  },
  account: String
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
  account: String
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

postSchema.post('remove', function() {
  var author, modelClass;
  modelClass = mongoose.model('Author');
  author = new modelClass({
    name: 'Deleted Post'
  });
  return author.save();
});

postSchema.plugin(cascade);

commentSchema.plugin(cascade);

authorSchema.plugin(cascade);

mongoose.model('Post', postSchema);

mongoose.model('Comment', commentSchema);

mongoose.model('Author', authorSchema);

mongoose.set('debug', true);

app = express();

app.use(express.bodyParser());

app.use(express.methodOverride());

describe('Hooks Test', function() {
  it('should run functions correctly', function(done) {
    var endpoint;
    endpoint = new mre('/api/posts', 'Post').tap('hook', 'fetch', function(args, data, next) {
      data += 'A';
      return data;
    }).tap('hook', 'fetch', function(args, data, next) {
      data += 'B';
      return next(data);
    }).tap('hook', 'fetch', function(args, data, next) {
      data += 'C';
      return data;
    });
    return endpoint.$$runHook('hook', 'fetch', null, '').then(function(result) {
      result.should.equal('ABC');
      return done();
    });
  });
  return it('should accurately assign value of "this" in hooks', function(done) {
    var endpoint;
    endpoint = new mre('/api/posts', 'Post').tap('hook', 'fetch', function(args, data, next) {
      this.TEST += 'A';
      return next();
    }).tap('hook', 'fetch', function(args, data, next) {
      this.TEST += 'B';
      return next();
    }).tap('hook', 'fetch', function(args, data, next) {
      this.TEST += 'C';
      return next();
    });
    endpoint.TEST = '';
    return endpoint.$$runHook('hook', 'fetch').then(function() {
      endpoint.TEST.should.equal('ABC');
      return done();
    });
  });
});
