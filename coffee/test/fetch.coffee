express = require 'express'
request = require 'supertest'
should = require 'should'
Q = require 'q'

mongoose = require 'mongoose'

mre = require '../lib/endpoint'
# Custom "Post" and "Comment" documents

commentSchema = new mongoose.Schema
	comment:String
	_post:
		type:mongoose.Schema.Types.ObjectId
		ref:'Post'
	_author:
		type:mongoose.Schema.Types.ObjectId
		ref:'Author'
	account:String


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
	account:String

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



describe 'Fetch', ->

	describe 'Basic object', ->
		beforeEach (done) ->
			@endpoint = new mre('/api/posts', 'Post')
			@app = express()
			@app.use(express.bodyParser())
			@app.use(express.methodOverride())

			modClass = mongoose.model('Post')
			mod = modClass
				date:Date.now()
				number:5
				string:'Test'
			mod.save (err, res) =>
				@mod = res
				done()
		it 'should retrieve with no hooks', (done) ->
			

			@endpoint.register(@app)

			
			request(@app).get('/api/posts/' + @mod._id).end (err, res) ->
				res.status.should.equal(200)
				res.body.number.should.equal(5)
				res.body.string.should.equal('Test')
				done()

		it 'should honor bad pre_filter hook', (done) ->
			@endpoint.tap 'pre_filter', 'fetch', (args, data, next) ->
				data.number = 6
				return data
			.register(@app)

			request(@app).get('/api/posts/' + @mod._id).end (err, res) ->
				res.status.should.equal(404)
				done()

		it 'should honor good pre_filter hook', (done) ->
			@endpoint.tap 'pre_filter', 'fetch', (args, data, next) ->
				data.number = 5
				return data
			.register(@app)

			request(@app).get('/api/posts/' + @mod._id).end (err, res) ->
				res.status.should.equal(200)
				done()

		it 'should honor pre_response hook', (done) ->
			@endpoint.tap 'pre_response', 'fetch', (args, model, next) ->
				delete model.number
				next(model)
			.register(@app)
			request(@app).get('/api/posts/' + @mod._id).end (err, res) ->
				res.status.should.equal(200)
				should.not.exist(res.body.number)
				done()

		it 'should honor pre_response_error hook', (done) ->
			@endpoint.tap 'pre_response_error', 'fetch', (args, err, next) ->
				err.message = 'Foo'
				return err
			.register(@app)

			# ID must be acceptable otherwise we'll get a 400 instead of 404
			request(@app).get('/api/posts/abcdabcdabcdabcdabcdabcd').end (err, res) ->
				res.status.should.equal(404)
				res.text.should.equal('Foo')
				done()
		
	