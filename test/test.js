var app, commentSchema, endpoint, express, mongoose, postSchema, request, requirePassword, should;

express = require('express');

request = require('supertest');

should = require('should');

mongoose = require('mongoose');

endpoint = require('../lib/endpoint');

commentSchema = new mongoose.Schema({
  comment: String,
  _post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }
});

postSchema = new mongoose.Schema({
  date: Date,
  number: Number,
  string: String,
  _comments: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment'
    }
  ],
  account: String
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

mongoose.model('Post', postSchema);

mongoose.model('Comment', commentSchema);

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
      allowRelations: {
        _comments: {
          deleteUnattached: true
        }
      },
      queryVars: ['$gt_date', '$lt_date', 'number']
    }).addMiddleware('delete', requirePassword('password')).addFilter('save', function(req, data, isChild) {
      if (!isChild) {
        data.account = 'asdf';
      }
      return data;
    }).responseHook('pre', function(next) {
      if (this.type === 'post') {
        this.data.type = 'POST';
      }
      return next();
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
  it('should not let you delete a post without a password', function(done) {
    return request(app).del('/api/posts/' + this.post1._id).end(function(err, response) {
      response.status.should.equal(401);
      return done();
    });
  });
  it('should let you delete a post with a password', function(done) {
    return request(app).del('/api/posts/' + this.post1._id + '?password=password').end(function(err, response) {
      response.status.should.equal(200);
      return done();
    });
  });
  it('should let you post related documents, insert them into their own collection, and return with them populated', function(done) {
    var _this = this;
    return request(app).post('/api/posts').send({
      date: new Date(),
      number: 111,
      string: 'Test',
      _comments: [
        {
          comment: 'This is comment 1'
        }, {
          comment: 'This is comment 2'
        }
      ]
    }).end(function(err, response) {
      response.status.should.equal(201);
      response.body._comments.length.should.equal(2);
      response.body._comments[0]._id.length.should.be.greaterThan(10);
      _this.post2 = response.body;
      return done();
    });
  });
  it('should let you modify a comment and save the entire thing', function(done) {
    this.post2._comments[0].comment = 'Changed comment to this';
    this.post2._comments.splice(1, 1);
    return request(app).put('/api/posts/' + this.post2._id).send(this.post2).end(function(err, response) {
      response.status.should.equal(202);
      response.body._comments.length.should.equal(1);
      response.body._comments[0].comment.should.equal('Changed comment to this');
      return done();
    });
  });
  it('should return populated comments when listing posts', function(done) {
    var _this = this;
    return request(app).get('/api/posts').end(function(err, response) {
      response.status.should.equal(200);
      response.body.length.should.equal(1);
      response.body[0]._comments[0].comment.should.equal('Changed comment to this');
      response.body[0]._comments[0]._post.should.equal(_this.post2._id);
      return done();
    });
  });
  it('should let you do a normal put request with the ID and maintain the result', function(done) {
    var _this = this;
    this.post2._comments = [this.post2._comments[0]._id];
    return request(app).put('/api/posts/' + this.post2._id).send(this.post2).end(function(err, response) {
      response.status.should.equal(202);
      response.body._comments.length.should.equal(1);
      response.body._comments[0].should.equal(_this.post2._comments[0]);
      return done();
    });
  });
  it('should let you delete all subdocuments', function(done) {
    this.post2._comments = [];
    return request(app).put('/api/posts/' + this.post2._id).send(this.post2).end(function(err, response) {
      response.status.should.equal(202);
      response.body._comments.length.should.equal(0);
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
  return it('should let you do straight match requests', function(done) {
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
});
