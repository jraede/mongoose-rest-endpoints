var Q, app, authorSchema, cascade, commentSchema, endpoint, express, mongoose, postSchema, request, requirePassword, should;

express = require('express');

request = require('supertest');

should = require('should');

Q = require('q');

mongoose = require('mongoose');

endpoint = require('../lib/endpoint');

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

describe('Endpoint Test', function() {
  before(function(done) {
    mongoose.connection.collections.posts.drop();
    mongoose.connection.collections.comments.drop();
    new endpoint('/api/posts', 'Post', {
      populate: ['_comments'],
      cascadeRelations: ['_comments'],
      relationsFilter: function(data, path) {
        data.account = 'asdf';
        return data;
      },
      queryVars: ['$gt_date', '$lt_date', 'number']
    }).addMiddleware('delete', requirePassword('password')).addFilter('save', function(req, data) {
      data.account = 'asdf';
      return data;
    }).responseHook('pre', function(next) {
      if (this.type === 'post') {
        this.data.type = 'POST';
      }
      return next();
    }).check('update', function(req, model) {
      var deferred;
      deferred = Q.defer();
      if (req.query.stop_update != null) {
        deferred.reject();
      } else {
        deferred.resolve();
      }
      return deferred.promise;
    }).check('delete', function(req, model) {
      var deferred;
      deferred = Q.defer();
      if (req.query.stop_delete) {
        deferred.reject();
      } else {
        deferred.resolve();
      }
      return deferred.promise;
    }).register(app);
    new endpoint('/api/posts2', 'Post').register(app);
    new endpoint('/api/authors', 'Author', {
      queryVars: ['name']
    }).register(app);
    return app.listen(5555, function() {
      return done();
    });
  });
  it('should let you create a post', function(done) {
    var _this = this;
    return request(app).post('/api/posts').send({
      date: new Date(),
      number: 111,
      string: 'Test',
      _comments: []
    }).end(function(err, response) {
      console.log('RESPONSE TEXT:', response.text);
      response.status.should.equal(201);
      response.body.number.should.equal(111);
      response.body.string.should.equal('Test');
      response.body._comments.length.should.equal(0);
      _this.post1 = response.body;
      return done();
    });
  });
  it('should have passed it through the save filter', function() {
    return this.post1.account.should.equal('asdf');
  });
  it('should have passed it through the response hooks', function() {
    return this.post1.type.should.equal('POST');
  });
  it('should give you post info on get', function(done) {
    return request(app).get('/api/posts/' + this.post1._id).end(function(err, res) {
      res.status.should.equal(200);
      res.body.number.should.equal(111);
      res.body.string.should.equal('Test');
      return done();
    });
  });
  it('should run the update check', function(done) {
    return request(app).put('/api/posts/' + this.post1._id).query({
      stop_update: true
    }).end(function(err, res) {
      res.status.should.equal(403);
      return done();
    });
  });
  it('should not let you delete a post without a password', function(done) {
    return request(app).del('/api/posts/' + this.post1._id).end(function(err, response) {
      response.status.should.equal(401);
      return done();
    });
  });
  it('should run the delete check', function(done) {
    return request(app).del('/api/posts/' + this.post1._id + '?password=password').query({
      stop_delete: true
    }).end(function(err, res) {
      res.status.should.equal(403);
      return done();
    });
  });
  it('should let you delete a post with a password', function(done) {
    return request(app).del('/api/posts/' + this.post1._id + '?password=password').end(function(err, response) {
      response.status.should.equal(200);
      return done();
    });
  });
  it('should have executed remove middleware', function(done) {
    var _this = this;
    return setTimeout(function() {
      return request(app).get('/api/authors').query({
        name: 'Deleted Post'
      }).end(function(err, response) {
        response.body.length.should.equal(1);
        return done();
      });
    }, 1000);
  });
  it('should save related and honor the cascadeRelations config', function(done) {
    var _this = this;
    return request(app).post('/api/posts').send({
      date: new Date(),
      number: 111,
      string: 'Test',
      _related: {
        _comments: [
          {
            comment: 'This is a comment',
            _related: {
              _author: {
                name: 'Foo McFooterson'
              }
            }
          }
        ]
      }
    }).end(function(err, res) {
      _this.post2 = res.body;
      res.body._comments.length.should.equal(1);
      should.not.exist(res.body._related._comments._author);
      return done();
    });
  });
  it('should have applied filters to relations', function(done) {
    this.post2._related._comments[0].account.should.equal('asdf');
    return done();
  });
  it('should return populated comments when listing posts', function(done) {
    var _this = this;
    return request(app).get('/api/posts').end(function(err, response) {
      response.status.should.equal(200);
      response.body.length.should.equal(1);
      response.body[0]._related._comments[0].comment.should.equal('This is a comment');
      response.body[0]._related._comments[0]._post.should.equal(_this.post2._id);
      return done();
    });
  });
  it('should let you do greater than date requests', function(done) {
    var nextYear;
    nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return request(app).get('/api/posts').query({
      $gt_date: nextYear
    }).end(function(err, response) {
      response.status.should.equal(200);
      response.body.length.should.equal(0);
      return done();
    });
  });
  it('should let you do less than date requests', function(done) {
    var lastYear;
    lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    return request(app).get('/api/posts').query({
      $lt_date: lastYear
    }).end(function(err, response) {
      response.status.should.equal(200);
      response.body.length.should.equal(0);
      return done();
    });
  });
  it('should let you do a greater than and less than request together and combine them accurately', function(done) {
    var nextYear;
    nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return request(app).get('/api/posts').query({
      $lt_date: nextYear,
      $gt_date: nextYear
    }).end(function(err, response) {
      response.status.should.equal(200);
      response.body.length.should.equal(0);
      return done();
    });
  });
  it('should let you do straight match requests', function(done) {
    return request(app).get('/api/posts').query({
      number: 110
    }).end(function(err, response) {
      response.status.should.equal(200);
      response.body.length.should.equal(0);
      return request(app).get('/api/posts').query({
        number: 111
      }).end(function(err, response) {
        response.status.should.equal(200);
        response.body.length.should.equal(1);
        return done();
      });
    });
  });
  it('should save a model with no relations set', function(done) {
    var _this = this;
    return request(app).post('/api/posts2').send({
      date: new Date(),
      number: 111,
      string: 'Test'
    }).end(function(err, res) {
      res.status.should.equal(201);
      _this.regpost = res.body;
      return done();
    });
  });
  it('should be able to put a model with no relations set', function(done) {
    this.regpost.string = 'Test1';
    return request(app).put('/api/posts2/' + this.regpost._id).send(this.regpost).end(function(err, res) {
      res.status.should.equal(200);
      return done();
    });
  });
  it('should pass through the validation errors when there is a 400 level error', function(done) {
    var _this = this;
    return request(app).post('/api/posts').send({
      date: new Date(),
      number: 111
    }).end(function(err, res) {
      res.status.should.equal(400);
      res.body.message.should.equal('Validation failed');
      return done();
    });
  });
  return it('should display validation errors on PUT request', function(done) {
    this.regpost.string = null;
    return request(app).put('/api/posts2/' + this.regpost._id).send(this.regpost).end(function(err, res) {
      res.status.should.equal(400);
      res.body.message.should.equal('Validation failed');
      return done();
    });
  });
});
