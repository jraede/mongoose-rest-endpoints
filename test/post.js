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
    return it('should let you post with a ref and respond with populated relation', function(done) {
      var aClass, author,
        _this = this;
      this.endpoint.populate(['_author', '_comments']).cascade(['_comments']).register(this.app);
      aClass = mongoose.model('Author');
      author = new aClass({
        name: 'Testy McGee'
      });
      return author.save(function() {
        var data;
        data = {
          date: Date.now(),
          number: 5,
          string: 'Test',
          _author: author._id,
          _related: {
            _comments: [
              {
                comment: 'test'
              }
            ]
          }
        };
        return request(_this.app).post('/api/posts/').send(data).end(function(err, res) {
          console.log(res.body);
          should.exist(res.body._related._author._id);
          return done();
        });
      });
    });
  });
});
