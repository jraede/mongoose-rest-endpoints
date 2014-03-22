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

postSchema.post 'remove', ->
	# Just do something that we'd see, like creating an author
	modelClass = mongoose.model('Author')
	author = new modelClass
		name:'Deleted Post'

	author.save()

postSchema.plugin(cascade)
commentSchema.plugin(cascade)
authorSchema.plugin(cascade)

mongoose.model('Post', postSchema)
mongoose.model('Comment', commentSchema)
mongoose.model('Author', authorSchema)

mongoose.set 'debug', true

app = express()
app.use(express.bodyParser())
app.use(express.methodOverride())



describe 'Hooks Test', ->

	it 'should run functions correctly', (done) ->
		endpoint = new mre('/api/posts', 'Post')
		.tap 'hook', 'fetch', (args, data, next) ->
			data += 'A'
			return data
		.tap 'hook', 'fetch', (args, data, next) ->
			data += 'B'
			next(data)
		.tap 'hook', 'fetch', (args, data, next) ->
			data += 'C'
			return data

		endpoint.$$runHook('hook', 'fetch', null, '').then (result) ->
			result.should.equal('ABC')
			done()

	it 'should accurately assign value of "this" in hooks', (done) ->
		endpoint = new mre('/api/posts', 'Post')
		.tap 'hook', 'fetch', (args, data, next) ->
			@.TEST += 'A'
			next()
		.tap 'hook', 'fetch', (args, data, next) ->
			@.TEST += 'B'
			next()
		.tap 'hook', 'fetch', (args, data, next) ->
			@.TEST += 'C'
			next()

		endpoint.TEST = ''
		endpoint.$$runHook('hook', 'fetch').then ->
			endpoint.TEST.should.equal('ABC')
			done()


	it 'should gracefully handle thrown errors', (done) ->
		endpoint = new mre('/api/posts', 'Post')
		.tap 'hook', 'fetch', (args, data, next) ->
			data += 'A'
			return data
		.tap 'hook', 'fetch', (args, data, next) ->
			data += 'B'

			error = new Error('foo')
			error.code = 401
			throw error
		.tap 'hook', 'fetch', (args, data, next) ->
			data += 'C'
			return data

		endpoint.$$runHook('hook', 'fetch', null, '').then (result) ->
			result.should.equal('ABC')
			done(new Error('Should not have gotten here'))
		, (err) ->
			err.code.should.equal(401)
			done()
	