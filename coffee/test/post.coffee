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
		it 'should let you post with no hooks', (done) ->

			@endpoint.register(@app)

			data = 
				date:Date.now()
				number:5
				string:'Test'

			request(@app).post('/api/posts/').send(data).end (err, res) ->
				res.status.should.equal(201)
				res.body.number.should.equal(5)
				res.body.string.should.equal('Test')
				done()

		it 'should run middleware', (done) ->
			@endpoint.addMiddleware('post', requirePassword('asdf')).register(@app)
			data = 
				date:Date.now()
				number:5
				string:'Test'

			

			request(@app).post('/api/posts/').query
				password:'asdf'
			.send(data).end (err, res) =>
				res.status.should.equal(201)
				res.body.number.should.equal(5)
				res.body.string.should.equal('Test')

				request(@app).post('/api/posts/').query
					password:'ffff'
				.send(data).end (err, res) =>
					res.status.should.equal(401)
					done()

		it 'should run pre filter', (done) ->
			postData = 
				date:Date.now()
				number:5
				string:'Test'

			@endpoint.tap 'pre_filter', 'post', (req, data, next) ->
				data.number = 7
				next(data)
			.register(@app)

			request(@app).post('/api/posts/').send(postData).end (err, res) ->
				res.status.should.equal(201)
				res.body.number.should.equal(7)
				res.body.string.should.equal('Test')
				done()

		it 'should handle a thrown error on pre filter', (done) ->
			postData = 
				date:Date.now()
				number:5
				string:'Test'

			@endpoint.tap 'pre_filter', 'post', (req, data, next) ->
				setTimeout ->
					err = new Error('test')
					err.code = 405
					next(err)
				, 2000
			.register(@app)

			request(@app).post('/api/posts/').send(postData).end (err, res) ->
				res.status.should.equal(405)
				done()

		it 'should run pre response', (done) ->
			postData = 
				date:Date.now()
				number:5
				string:'Test'

			@endpoint.tap 'pre_response', 'post', (req, data, next) ->
				setTimeout ->
					data.number = 7
					next(data)
				, 2000
				return null
			.register(@app)

			request(@app).post('/api/posts/').send(postData).end (err, res) ->
				res.status.should.equal(201)
				res.body.number.should.equal(7)
				res.body.string.should.equal('Test')

				# Make sure it didn't actually update the post
				mongoose.model('Post').findById res.body._id, (err, mod) ->
					mod.number.should.equal(5)
					done()


		
	describe 'Cascading relations', ->
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

		it 'should let you post with relations', (done) ->
			@endpoint.cascade ['_comments'], (data, path) ->
				data.comment += 'FFF'
				return data
			.register(@app)

			data = 
				date:Date.now()
				number:5
				string:'Test'
				_related:
					_comments:[
							comment:'asdf1234'
					]

			request(@app).post('/api/posts/').send(data).end (err, res) ->
				res.status.should.equal(201)
				res.body.number.should.equal(5)
				res.body.string.should.equal('Test')
				res.body._comments.length.should.equal(1)
				res.body._related._comments.length.should.equal(1)
				res.body._related._comments[0].comment.should.equal('asdf1234FFF')
				done()

		it 'should let you post with a ref and respond with populated relation', (done) ->
			@endpoint.populate(['_author', '_comments']).cascade(['_comments']).register(@app)

			aClass = mongoose.model('Author')

			author = new aClass
				name:'Testy McGee'
			author.save =>
				data = 
					date:Date.now()
					number:5
					string:'Test'
					_author:author._id
					_related:
						_comments:[
								comment:'test'
						]
				request(@app).post('/api/posts/').send(data).end (err, res) =>
					console.log(res.body)
					should.exist(res.body._related._author._id)
					
					done()


		it 'should let you post, update, put, update', (done) ->

			@endpoint.cascade(['_comments'])
			.populate('_comments')
			.register(@app)



			data = 
				date:Date.now()
				number:5
				string:'Test'
				_related:
					_comments:[
							comment:'asdf1234'
					]

			console.log 'About to post...'
			request(@app).post('/api/posts/').send(data).end (err, res) =>
				post = res.body
				
				post._related._comments.push
					comment:'ffff5555'

							
				request(@app).put('/api/posts/' + post._id).send(post).end (err, res) ->
					res.status.should.equal(200)
					res.body._comments.length.should.equal(2)
					res.body._related._comments.length.should.equal(2)
					should.not.exist(res.body._comments[1]._id)
					res.body._related._comments[0].comment.should.equal('asdf1234')
					res.body._related._comments[1].comment.should.equal('ffff5555')
					done()
	
	describe 'Tracking interface', ->
		beforeEach (done) ->
			@endpoint = new mre('/api/posts', 'Post')
			@app = express()
			@app.use(express.bodyParser())
			@app.use(express.methodOverride())

			done()
		afterEach (done) ->
			if @mod
				@mod.remove ->
					done()
			else
				done()
		it 'should run tracking interface on success', (done) ->

		
			
			tracker.interface =
				track: (params) ->
					console.log 'Tracking params', params
					params.response.code.should.equal(201)
					(params.time < 50).should.equal(true)
					done()

			@endpoint.register(@app)

			
			data = 
				date:Date.now()
				number:5
				string:'Test'

			request(@app).post('/api/posts/').send(data).end (err, res) ->
				console.log 'Ended'
		it 'should run tracking interface on error', (done) ->
			tracker.interface =
				track: (params) ->
					console.log 'Tracking params:', params
					params.response.code.should.equal(400)
					(params.time < 50).should.equal(true)
					done()

			@endpoint.register(@app)

			
			data = 
				date:Date.now()
				number:5

			request(@app).post('/api/posts/').send(data).end (err, res) ->
				console.log 'Ended'

		it 'should calculate time based on X-Request-Start header', (done) ->
			tracker.interface =
				track: (params) ->
					params.response.code.should.equal(201)
					params.time.should.be.greaterThan(100)
					params.time.should.be.lessThan(200)
					done()

			@endpoint.register(@app)
			data = 
				date:Date.now()
				number:5
				string:'Test'

			

			requestStart = moment().valueOf() - 100
			request(@app).post('/api/posts/').set('X-Request-Start', requestStart.toString()).send(data).end (err, res) ->
				console.log 'Ended'
