express = require 'express'
request = require 'supertest'
should = require 'should'
Q = require 'q'

mongoose = require 'mongoose'
require('../lib/log').verbose(true)
mre = require '../lib/endpoint'
# Custom "Post" and "Comment" documents
tracker = require '../lib/tracker'
moment = require 'moment'
commentSchema = new mongoose.Schema
	comment:String
	_post:
		type:mongoose.Schema.Types.ObjectId
		ref:'Post'
	_author:
		type:mongoose.Schema.Types.ObjectId
		ref:'Author'


postSchema = new mongoose.Schema
	date:Date
	number:Number
	string:
		type:String
		required:true
	_comments:[
			type:mongoose.Schema.Types.ObjectId
			ref:'Comment'
			$through:'_post'
	]
	_author:
		type:mongoose.Schema.Types.ObjectId
		ref:'Author'

authorSchema = new mongoose.Schema
	name:'String'

# Custom middleware for testing
requirePassword = (password) ->
	return (req, res, next) ->
		if req.query.password and req.query.password is password
			next()
		else
			res.send(401)
mongoose.connect('mongodb://localhost/mre_test')

cascade = require 'cascading-relations'


postSchema.plugin(cascade)
commentSchema.plugin(cascade)
authorSchema.plugin(cascade)

mongoose.model('Post', postSchema)
mongoose.model('Comment', commentSchema)
mongoose.model('Author', authorSchema)

mongoose.set 'debug', true



describe 'Post', ->
	@timeout(5000)
	describe 'Basic object', ->
		beforeEach (done) ->
			@endpoint = new mre('/api/posts', 'Post')
			@app = express()
			@app.use(express.bodyParser())
			@app.use(express.methodOverride())
			done()
		afterEach (done) ->
			# clear out
			mongoose.connection.collections.posts.drop()
			done()
		it 'should let you bulk post with no hooks', (done) ->

			@endpoint.allowBulkPost().register(@app)

			data = [
					date:Date.now()
					number:5
					string:'Test'
				,
					date:Date.now()
					number:8
					string:'Foo'
			]
				

			request(@app).post('/api/posts/bulk').send(data).end (err, res) ->
				res.status.should.equal(201)
				done()

		it 'should correctly handle errors', (done) ->

			@endpoint.allowBulkPost().register(@app)

			data = [
					date:Date.now()
					number:5
					string:'Test'
				,
					date:Date.now()
					number:8
				,
					date:Date.now()
					number:7
			]
				

			request(@app).post('/api/posts/bulk').send(data).end (err, res) ->
				# One succeeded. So we should get a 201. HOWEVER, the second two elements in the array should have status as rejected, with the appropriate code and message
				res.status.should.equal(207)
				res.body[0].state.should.equal('fulfilled')
				res.body[1].state.should.equal('rejected')
				res.body[2].state.should.equal('rejected')
				res.body[1].reason.message.message.should.equal('Validation failed')
				res.body[2].reason.message.message.should.equal('Validation failed')
				done()

		it 'should have the first error code if they are all errors', (done) ->
			@endpoint.allowBulkPost().register(@app)

			data = [
					date:Date.now()
					number:5
				,
					date:Date.now()
					number:8
				,
					date:Date.now()
					number:7
			]
				

			request(@app).post('/api/posts/bulk').send(data).end (err, res) ->
				
				res.status.should.equal(400)
				done()

		