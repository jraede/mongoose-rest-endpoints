var Q, app, createPost, endpoint, express, moment, mongoose, postSchema, request, requirePassword, should;

express = require('express');

request = require('supertest');

should = require('should');

mongoose = require('mongoose');

endpoint = require('../lib/endpoint');

Q = require('q');

postSchema = new mongoose.Schema({
  date: Date,
  number: Number,
  string: String
});

moment = require('moment');

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

mongoose.model('Post', postSchema);

mongoose.set('debug', true);

app = express();

app.use(express.bodyParser());

app.use(express.methodOverride());

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

describe('Pagination', function() {
  before(function(done) {
    var data, post, promises, _i, _len;
    mongoose.connection.collections.posts.drop();
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
      new endpoint('/api/posts', 'Post', {
        pagination: {
          defaults: {
            sortField: 'string',
            perPage: 2
          }
        }
      }).register(app);
      return app.listen(5555, function() {
        return done();
      });
    });
  });
  it('should give paginated results by default', function(done) {
    return request(app).get('/api/posts').end(function(err, res) {
      res.body.length.should.equal(2);
      res.body[0].string.should.equal('a');
      res.body[1].string.should.equal('c');
      return done();
    });
  });
  it('should give you the total results in the header', function(done) {
    return request(app).get('/api/posts').end(function(err, res) {
      res.header['record-count'].should.equal('4');
      return done();
    });
  });
  it('should take your custom pagination parameters', function(done) {
    return request(app).get('/api/posts').query({
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
    return request(app).get('/api/posts').query({
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
