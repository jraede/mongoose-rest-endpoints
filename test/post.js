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
  describe('Basic object', function() {
    beforeEach(function(done) {
      this.endpoint = new mre('/api/posts', mongoose.model('Post'));
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
    it('should run pre save', function(done) {
      var postData;
      postData = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      this.endpoint.tap('pre_save', 'post', function(req, model, next) {
        model.set('number', 8);
        return next(model);
      }).register(this.app);
      return request(this.app).post('/api/posts/').send(postData).end(function(err, res) {
        res.status.should.equal(201);
        res.body.number.should.equal(8);
        res.body.string.should.equal('Test');
        return done();
      });
    });
    it('should handle a thrown error on pre save', function(done) {
      var postData;
      postData = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      this.endpoint.tap('pre_save', 'post', function(req, model, next) {
        return setTimeout(function() {
          var err;
          err = new Error('test');
          err.code = 405;
          return next(err);
        }, 2000);
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
        setTimeout(function() {
          data.number = 7;
          return next(data);
        }, 2000);
        return null;
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
  describe('Cascading relations', function() {
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
    it('should let you post with relations', function(done) {
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
    it('should let you post with a ref and respond with populated relation', function(done) {
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
      console.log('About to post...');
      return request(this.app).post('/api/posts/').send(data).end(function(err, res) {
        var post;
        post = res.body;
        post._related._comments.push({
          comment: 'ffff5555'
        });
        return request(_this.app).put('/api/posts/' + post._id).send(post).end(function(err, res) {
          res.status.should.equal(200);
          res.body._comments.length.should.equal(2);
          res.body._related._comments.length.should.equal(2);
          should.not.exist(res.body._comments[1]._id);
          res.body._related._comments[0].comment.should.equal('asdf1234');
          res.body._related._comments[1].comment.should.equal('ffff5555');
          return done();
        });
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
      var data;
      tracker["interface"] = {
        track: function(params) {
          console.log('Tracking params', params);
          params.response.code.should.equal(201);
          (params.time < 50).should.equal(true);
          return done();
        }
      };
      this.endpoint.register(this.app);
      data = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      return request(this.app).post('/api/posts/').send(data).end(function(err, res) {
        return console.log('Ended');
      });
    });
    it('should run tracking interface on error', function(done) {
      var data;
      tracker["interface"] = {
        track: function(params) {
          console.log('Tracking params:', params);
          params.response.code.should.equal(400);
          (params.time < 50).should.equal(true);
          return done();
        }
      };
      this.endpoint.register(this.app);
      data = {
        date: Date.now(),
        number: 5
      };
      return request(this.app).post('/api/posts/').send(data).end(function(err, res) {
        return console.log('Ended');
      });
    });
    return it('should calculate time based on X-Request-Start header', function(done) {
      var data, requestStart;
      tracker["interface"] = {
        track: function(params) {
          params.response.code.should.equal(201);
          params.time.should.be.greaterThan(100);
          params.time.should.be.lessThan(200);
          return done();
        }
      };
      this.endpoint.register(this.app);
      data = {
        date: Date.now(),
        number: 5,
        string: 'Test'
      };
      requestStart = moment().valueOf() - 100;
      return request(this.app).post('/api/posts/').set('X-Request-Start', requestStart.toString()).send(data).end(function(err, res) {
        return console.log('Ended');
      });
    });
  });
});
