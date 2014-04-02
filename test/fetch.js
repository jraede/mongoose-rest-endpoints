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
  otherField: Number,
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

describe('Fetch', function() {
  return describe('Populate', function() {
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
              comment: 'Asdf1234',
              otherField: 5
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
      return this.mod.remove(function() {
        return done();
      });
    });
    it('should populate on _related', function(done) {
      this.endpoint.populate('_comments').register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        res.body._related._comments.length.should.equal(1);
        res.body._comments.length.should.equal(1);
        res.body._related._comments[0].comment.should.equal('Asdf1234');
        res.body._related._comments[0].otherField.should.equal(5);
        return done();
      });
    });
    return it('should populate when specifying fields', function(done) {
      this.endpoint.populate('_comments', 'comment').register(this.app);
      return request(this.app).get('/api/posts/' + this.mod._id).end(function(err, res) {
        res.status.should.equal(200);
        res.body.number.should.equal(5);
        res.body.string.should.equal('Test');
        res.body._related._comments.length.should.equal(1);
        res.body._comments.length.should.equal(1);
        res.body._related._comments[0].comment.should.equal('Asdf1234');
        should.not.exist(res.body._related._comments[0].otherField);
        return done();
      });
    });
  });
});
