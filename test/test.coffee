express = require 'express'
request = require 'supertest'
should = require 'should'

mongoose = require 'mongoose'

endpoint = require '../lib/endpoint'
# Custom "Post" and "Comment" documents

commentSchema = new mongoose.Schema
	comment:String
	_post:
		type:mongoose.Schema.Types.ObjectId
		ref:'Post'


postSchema = new mongoose.Schema
	date:Date
	number:Number
	string:String
	_comments:[
			type:mongoose.Schema.Types.ObjectId
			ref:'Comment'
	]
	account:String

# Custom middleware for testing
requirePassword = (password) ->
	return (req, res, next) ->
		if req.query.password and req.query.password is password
			next()
		else
			res.send(401)
mongoose.connect('mongodb://localhost/mre_test')
mongoose.model('Post', postSchema)
mongoose.model('Comment', commentSchema)
mongoose.set 'debug', true

app = express()
app.use(express.bodyParser())
app.use(express.methodOverride())



describe 'Endpoint Test', ->
	before (done) ->
		# clear out
		mongoose.connection.collections.posts.drop()
		mongoose.connection.collections.comments.drop()
		# set up endpoints

		new endpoint '/api/posts', 'Post',
			populate:['_comments']
			allowRelations:
				_comments:
					deleteUnattached:true
			queryVars:['$gt_date', '$lt_date', 'number']
		.addMiddleware('delete', requirePassword('password'))
		.addFilter 'save', (req, data, isChild) ->
			if !isChild
				data.account = 'asdf'
			return data
		.responseHook 'pre', (next) ->
			if @type is 'post'
				@data.type = 'POST'
			next()
		.register(app)

		app.listen 5555, ->

			done()

	it 'should let you create a post', (done) ->
		request(app).post('/api/posts').send
			date:new Date()
			number:111
			string:'Test'
			_comments:[]
		.end (err, response) =>
			response.status.should.equal(201)
			response.body.number.should.equal(111)
			response.body.string.should.equal('Test')
			response.body._comments.length.should.equal(0)
			@post1 = response.body
			done()
	it 'should have passed it through the save filter', ->
		@post1.account.should.equal('asdf')

	it 'should have passed it through the response hooks', ->
		@post1.type.should.equal('POST')
	it 'should not let you delete a post without a password', (done) ->
		request(app).del('/api/posts/' + @post1._id).end (err, response) ->
			response.status.should.equal(401)
			done()
	it 'should let you delete a post with a password', (done) ->
		request(app).del('/api/posts/' + @post1._id + '?password=password').end (err, response) ->
			response.status.should.equal(200)
			done()

	it 'should let you post related documents, insert them into their own collection, and return with them populated', (done) ->
		request(app).post('/api/posts').send
			date: new Date()
			number:111
			string:'Test'
			_comments:[
					comment:'This is comment 1'
				,
					comment: 'This is comment 2'
			]
		.end (err, response) =>
			response.status.should.equal(201)
			response.body._comments.length.should.equal(2)
			response.body._comments[0]._id.length.should.be.greaterThan(10)

			@post2 = response.body
			done()

	it 'should let you modify a comment and save the entire thing', (done) ->
		@post2._comments[0].comment = 'Changed comment to this'
		@post2._comments.splice(1, 1)
		request(app).put('/api/posts/' + @post2._id).send(@post2).end (err, response) ->
			response.status.should.equal(202)
			response.body._comments.length.should.equal(1)
			response.body._comments[0].comment.should.equal 'Changed comment to this'
			done()

	it 'should return populated comments when listing posts', (done) ->
		request(app).get('/api/posts').end (err, response) =>
			response.status.should.equal(200)
			response.body.length.should.equal(1)
			response.body[0]._comments[0].comment.should.equal 'Changed comment to this'
			response.body[0]._comments[0]._post.should.equal @post2._id
			done()

	it 'should let you do a normal put request with the ID and maintain the result', (done) ->
		@post2._comments = [@post2._comments[0]._id]
		request(app).put('/api/posts/' + @post2._id).send(@post2).end (err, response) =>
			response.status.should.equal(202)
			response.body._comments.length.should.equal(1)
			response.body._comments[0].should.equal(@post2._comments[0])
			done()

	it 'should let you delete all subdocuments', (done) ->
		@post2._comments = []
		request(app).put('/api/posts/' + @post2._id).send(@post2).end (err, response) ->
			response.status.should.equal(202)
			response.body._comments.length.should.equal(0)
			done()
	it 'should let you do greater than date requests', (done) ->
		nextYear = new Date()
		nextYear.setFullYear(nextYear.getFullYear() + 1)
		request(app).get('/api/posts').query
			$gt_date:nextYear
		.end (err, response) ->
			response.status.should.equal(200)
			response.body.length.should.equal(0)
			done()

	it 'should let you do less than date requests', (done) ->
		lastYear = new Date()
		lastYear.setFullYear(lastYear.getFullYear() - 1)
		request(app).get('/api/posts').query
			$lt_date:lastYear
		.end (err, response) ->
			response.status.should.equal(200)
			response.body.length.should.equal(0)
			done()

	it 'should let you do straight match requests', (done) ->
		request(app).get('/api/posts').query
			number:110
		.end (err, response) ->
			response.status.should.equal(200)
			response.body.length.should.equal(0)

			request(app).get('/api/posts').query
				number:111
			.end (err, response) ->
				response.status.should.equal(200)
				response.body.length.should.equal(1)
				done()


