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

cascade = require 'cascading-relations'


postSchema.plugin(cascade)
commentSchema.plugin(cascade)
authorSchema.plugin(cascade)

mongoose.model('Post', postSchema)
mongoose.model('Comment', commentSchema)
mongoose.model('Author', authorSchema)

mongoose.set 'debug', true



describe 'Delete', ->

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
		it 'should let you delete with no hooks', (done) ->

			@endpoint.register(@app)

			data = @mod.toObject()

			data.number = 6;

			request(@app).del('/api/posts/' + data._id).end (err, res) ->
				res.status.should.equal(200)
				
				mongoose.model('Post').findById data._id, (err, res) ->
					should.not.exist(err)
					should.not.exist(res)
					done()

		it 'should run middleware', (done) ->
			@endpoint.addMiddleware('delete', requirePassword('asdf')).register(@app)
			data = @mod.toObject()

			id = @mod._id

			request(@app).del('/api/posts/' + id).query
				password:'ffff'
			.end (err, res) =>
				res.status.should.equal(401)

				request(@app).del('/api/posts/' + id).query
					password:'asdf'
				.end (err, res) =>
					res.status.should.equal(200)
					done()

		it 'should honor pre_filter fetch hook', (done) ->
			@endpoint.tap 'pre_filter', 'fetch', (req, data, next) ->
				data.number = 6
				next(data)
			.register(@app)


			request(@app).del('/api/posts/' + @mod._id).end (err, res) ->
				res.status.should.equal(404)
				done()
		it 'should honor post_retrieve fetch hook', (done) ->
			@endpoint.tap 'post_retrieve', 'delete', (req, model, next) ->
				if req.query.test isnt 'test'
					err = new Error('Test')
					err.code = 401
					throw err
				else
					next(model)
			.register(@app)


			id = @mod._id
			request(@app).del('/api/posts/' + id).end (err, res) =>
				res.status.should.equal(401)
				request(@app).del('/api/posts/' + id).query
					test:'test'
				.end (err, res) =>
					res.status.should.equal(200)
					done()