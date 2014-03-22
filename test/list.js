var Q, authorSchema, cascade, commentSchema, createPost, express, moment, mongoose, mre, postSchema, request, requirePassword, should;

express = require('express');

request = require('supertest');

should = require('should');

Q = require('q');

mongoose = require('mongoose');

moment = require('moment');

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

createPost = function(data) {
  var deferred, post, postClass;
  deferred = Q.defer();
  postClass = mongoose.model('Post');
  post = new postClass(data);
  post.save(function(err, res) {
    if (err) {
      return deferred.reject(err);
    }
    return deferred.resolve();
  });
  return deferred.promise;
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

describe('List', function() {
  describe('Basics', function() {
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
      return this.mod.remove(function(err, res) {
        return done();
      });
    });
    it('should retrieve with no hooks', function(done) {
      this.endpoint.register(this.app);
      return request(this.app).get('/api/posts/').end(function(err, res) {
        res.status.should.equal(200);
        res.body.length.should.equal(1);
        res.body[0].number.should.equal(5);
        res.body[0].string.should.equal('Test');
        return done();
      });
    });
    it('should allow through with middleware', function(done) {
      this.endpoint.addMiddleware('list', requirePassword('asdf')).register(this.app);
      return request(this.app).get('/api/posts').query({
        password: 'asdf'
      }).end(function(err, res) {
        res.status.should.equal(200);
        res.body.length.should.equal(1);
        return done();
      });
    });
    it('should prevent on bad middleware', function(done) {
      this.endpoint.addMiddleware('list', requirePassword('asdf')).register(this.app);
      return request(this.app).get('/api/posts').query({
        password: 'ffff'
      }).end(function(err, res) {
        res.status.should.equal(401);
        return done();
      });
    });
    it('should work with default query hook', function(done) {
      var _this = this;
      this.endpoint.allowQueryParam(['$gte_number', '$lte_number', '$gte_date', '$lte_date']).register(this.app);
      return request(this.app).get('/api/posts/').query({
        '$gte_number': 6
      }).end(function(err, res) {
        res.status.should.equal(200);
        res.body.length.should.equal(0);
        return request(_this.app).get('/api/posts/').query({
          '$lte_number': 6
        }).end(function(err, res) {
          res.status.should.equal(200);
          res.body.length.should.equal(1);
          return request(_this.app).get('/api/posts/').query({
            '$gte_date': moment().add('day', 1).toDate()
          }).end(function(err, res) {
            res.status.should.equal(200);
            res.body.length.should.equal(0);
            return request(_this.app).get('/api/posts/').query({
              '$lte_date': moment().add('day', 1).toDate()
            }).end(function(err, res) {
              res.status.should.equal(200);
              res.body.length.should.equal(1);
              return done();
            });
          });
        });
      });
    });
    return it('should work with pre_response hook', function(done) {
      var _this = this;
      this.endpoint.tap('pre_response', 'list', function(req, collection, next) {
        var col, _i, _len;
        for (_i = 0, _len = collection.length; _i < _len; _i++) {
          col = collection[_i];
          col.number = 10;
        }
        return next(collection);
      }).register(this.app);
      return request(this.app).get('/api/posts/').end(function(err, res) {
        res.body.length.should.equal(1);
        res.body[0].number.should.equal(10);
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
      return this.mod.remove(function(err, res) {
        return done();
      });
    });
    return it('should return populated data', function(done) {
      this.endpoint.populate('_comments').register(this.app);
      return request(this.app).get('/api/posts/').end(function(err, res) {
        res.status.should.equal(200);
        res.body.length.should.equal(1);
        res.body[0]._comments.length.should.equal(1);
        res.body[0]._related._comments.length.should.equal(1);
        res.body[0]._related._comments[0].comment.should.equal('Asdf1234');
        return done();
      });
    });
  });
  return describe('Pagination', function() {
    beforeEach(function(done) {
      var data, post, promises, _i, _len,
        _this = this;
      this.app = express();
      this.app.use(express.bodyParser());
      this.app.use(express.methodOverride());
      data = [
        {
          date: moment().add('days', 26).toDate(),
          number: 13,
          string: 'a'
        }, {
          date: moment().add('days', 25).toDate(),
          number: 17,
          string: 'c'
        }, {
          date: moment().add('days', 24).toDate(),
          number: 12,
          string: 'f'
        }, {
          date: moment().add('days', 20).toDate(),
          number: 50,
          string: 'z'
        }
      ];
      promises = [];
      for (_i = 0, _len = data.length; _i < _len; _i++) {
        post = data[_i];
        promises.push(createPost(post));
      }
      return Q.all(promises).then(function() {
        new mre('/api/posts', 'Post', {
          pagination: {
            sortField: 'string',
            perPage: 2
          }
        }).register(_this.app);
        return done();
      });
    });
    afterEach(function(done) {
      mongoose.connection.collections.posts.drop();
      return done();
    });
    it('should give paginated results by default', function(done) {
      return request(this.app).get('/api/posts').end(function(err, res) {
        res.body.length.should.equal(2);
        res.body[0].string.should.equal('a');
        res.body[1].string.should.equal('c');
        return done();
      });
    });
    it('should give you the total results in the header', function(done) {
      return request(this.app).get('/api/posts').end(function(err, res) {
        res.header['record-count'].should.equal('4');
        return done();
      });
    });
    it('should take your custom pagination parameters', function(done) {
      return request(this.app).get('/api/posts').query({
        page: 2,
        perPage: 1,
        sortField: '-number'
      }).end(function(err, res) {
        res.body.length.should.equal(1);
        res.body[0].string.should.equal('c');
        return done();
      });
    });
    return it('should sort by date too!', function(done) {
      return request(this.app).get('/api/posts').query({
        page: 1,
        perPage: 2,
        sortField: 'date'
      }).end(function(err, res) {
        res.body.length.should.equal(2);
        res.body[0].string.should.equal('z');
        return done();
      });
    });
  });
});
