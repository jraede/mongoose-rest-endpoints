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
    return it('should let you post, update, put, update', function(done) {
      var data,
        _this = this;
      this.endpoint.cascade(['_comments']).populate('_comments').register(this.app);
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
        var post;
        post = res.body;
        return mongoose.model('Post').findById(res.body._id).populate('_comments').exec(function(err, post) {
          console.log('executed');
          post._related._comments.push({
            comment: 'ffff5555'
          });
          console.log('RELATED:', post._related);
          try {
            return post.cascadeSave(function(err) {
              console.log('Cascade saved...');
              if (err) {
                return done(err);
              } else {
                console.log('MODEL', model);
                return done();
              }
            });
          } catch (_error) {
            err = _error;
            return console.log(err.stack);
          }
        });
      });
    });
  });
});
