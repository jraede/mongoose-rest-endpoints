express = require 'express'
request = require 'supertest'
should = require 'should'
Q = require 'q'

mongoose = require 'mongoose'
require('../lib/log').verbose(true)
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



mongoose.model('Post', postSchema)
mongoose.model('Comment', commentSchema)
mongoose.model('Author', authorSchema)

mongoose.set 'debug', true



describe 'Put', ->

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
		afterEach (done) ->
			# clear out
			mongoose.connection.collections.posts.drop()
			done()
		# it 'should let you put with no hooks', (done) ->

		# 	@endpoint.register(@app)

		# 	data = @mod.toObject()

		# 	data.number = 6;

		# 	request(@app).put('/api/posts/' + data._id).send(data).end (err, res) ->
		# 		res.status.should.equal(200)
		# 		res.body.number.should.equal(6)
		# 		res.body.string.should.equal('Test')
		# 		done()

		it 'should let you put the right one', (done) ->

			@endpoint.register(@app)

			data = @mod.toObject()

			data.number = 6;
			modClass = mongoose.model('Post')
			mod2 = modClass
				date:Date.now()
				number:6
				string:'Test2'
			data.string = 'Test3'
			mod2.save (err, res) =>
				request(@app).put('/api/posts/' + mod2._id).send(data).end (err, res) ->
					res.status.should.equal(200)
					res.body.number.should.equal(6)
					res.body.string.should.equal('Test3')
					res.body._id.should.equal(mod2._id.toString())
					done()

		# it 'should run middleware', (done) ->
		# 	@endpoint.addMiddleware('put', requirePassword('asdf')).register(@app)
		# 	data = @mod.toObject()

		# 	id = @mod._id

		# 	request(@app).put('/api/posts/' + id).query
		# 		password:'asdf'
		# 	.send(data).end (err, res) =>
		# 		res.status.should.equal(200)
		# 		res.body.number.should.equal(5)
		# 		res.body.string.should.equal('Test')

		# 		request(@app).put('/api/posts/' + id).query
		# 			password:'ffff'
		# 		.send(data).end (err, res) =>
		# 			res.status.should.equal(401)
		# 			done()
		# it 'should honor pre_filter fetch hook', (done) ->
		# 	@endpoint.tap 'pre_filter', 'fetch', (req, data, next) ->
		# 		data.number = 6
		# 		next(data)
		# 	.register(@app)

		# 	data = @mod.toObject()

		# 	data.number = 6;

		# 	request(@app).put('/api/posts/' + data._id).send(data).end (err, res) ->
		# 		res.status.should.equal(404)
		# 		done()

		# it 'should honor post_retrieve fetch hook', (done) ->
		# 	@endpoint.tap 'post_retrieve', 'put', (req, model, next) ->
		# 		if req.query.test isnt 'test'
		# 			err = new Error('Test')
		# 			err.code = 401
		# 			throw err
		# 		else
		# 			next(model)
		# 	.register(@app)

		# 	data = @mod.toObject()

		# 	data.number = 6;
		# 	id = data._id
		# 	request(@app).put('/api/posts/' + id).send(data).end (err, res) =>
		# 		res.status.should.equal(401)
		# 		request(@app).put('/api/posts/' + id).query
		# 			test:'test'
		# 		.send(data).end (err, res) =>
		# 			res.status.should.equal(200)
		# 			done()

		# it 'should honor pre_save fetch hook', (done) ->
		# 	@endpoint.tap 'pre_save', 'put', (req, model, next) ->
		# 		if req.query.test isnt 'test'
		# 			err = new Error('Test')
		# 			err.code = 401
		# 			throw err
		# 		else
		# 			next(model)
		# 	.register(@app)

		# 	data = @mod.toObject()

		# 	data.number = 6;
		# 	id = data._id
		# 	request(@app).put('/api/posts/' + id).send(data).end (err, res) =>
		# 		res.status.should.equal(401)
		# 		request(@app).put('/api/posts/' + id).query
		# 			test:'test'
		# 		.send(data).end (err, res) =>
		# 			res.status.should.equal(200)
		# 			done()


	

