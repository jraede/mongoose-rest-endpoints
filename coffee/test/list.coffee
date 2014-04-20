express = require 'express'
request = require 'supertest'
should = require 'should'
Q = require 'q'

mongoose = require 'mongoose'
require('../lib/log').verbose(true)
moment = require 'moment'
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
	foo:
		bar:Number

authorSchema = new mongoose.Schema
	name:'String'

# Custom middleware for testing
requirePassword = (password) ->
	return (req, res, next) ->
		if req.query.password and req.query.password is password
			next()
		else
			res.send(401)

createPost = (data) ->
	deferred = Q.defer()
	postClass = mongoose.model('Post')
	post = new postClass(data)
	post.save (err, res) ->
		if err
			return deferred.reject(err)
		return deferred.resolve()

	return deferred.promise
mongoose.connect('mongodb://localhost/mre_test')

cascade = require 'cascading-relations'


postSchema.plugin(cascade)
commentSchema.plugin(cascade)
authorSchema.plugin(cascade)

mongoose.model('Post', postSchema)
mongoose.model('Comment', commentSchema)
mongoose.model('Author', authorSchema)

mongoose.set 'debug', true



describe 'List', ->

	describe 'Basics', ->
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
			@mod.remove (err, res) ->
				done()
		it 'should retrieve with no hooks', (done) ->
			

			@endpoint.register(@app)

			request(@app).get('/api/posts/').end (err, res) ->
				res.status.should.equal(200)
				res.body.length.should.equal(1)
				res.body[0].number.should.equal(5)
				res.body[0].string.should.equal('Test')
				done()

		it 'should allow through with middleware', (done) ->
			@endpoint.addMiddleware('list', requirePassword('asdf')).register(@app)

			request(@app).get('/api/posts').query
				password:'asdf'
			.end (err, res) ->
				res.status.should.equal(200)
				res.body.length.should.equal(1)
				done()
		it 'should prevent on bad middleware', (done) ->
			@endpoint.addMiddleware('list', requirePassword('asdf')).register(@app)

			request(@app).get('/api/posts').query
				password:'ffff'
			.end (err, res) ->
				res.status.should.equal(401)
				done()
		it 'should work with default query hook', (done) ->
			@endpoint.allowQueryParam(['$gte_number', '$lte_number', '$gte_date', '$lte_date']).register(@app)

			request(@app).get('/api/posts/').query
				'$gte_number':6
			.end (err, res) =>
				res.status.should.equal(200)
				res.body.length.should.equal(0)


				request(@app).get('/api/posts/').query
					'$lte_number':6
				.end (err, res) =>
					res.status.should.equal(200)
					res.body.length.should.equal(1)

					request(@app).get('/api/posts/').query
						'$gte_date':moment().add('day', 1).toDate()
					.end (err, res) =>
						res.status.should.equal(200)
						res.body.length.should.equal(0)

						request(@app).get('/api/posts/').query
							'$lte_date':moment().add('day', 1).toDate()
						.end (err, res) =>
							res.status.should.equal(200)
							res.body.length.should.equal(1)

							done()
		it 'should work with pre_response hook', (done) ->
			@endpoint.tap 'pre_response', 'list', (req, collection, next) ->
				for col in collection
					col.number = 10
				next(collection)
			.register(@app)

			request(@app).get('/api/posts/').end (err, res) =>

				res.body.length.should.equal(1)
				res.body[0].number.should.equal(10)
				done()

		it 'should do a regex search', (done) ->
			@endpoint.allowQueryParam('$regex_string').register(@app)
			request(@app).get('/api/posts/').query
				'$regex_string':'tes'
			.end (err, res) =>
				res.status.should.equal(200)
				res.body.length.should.equal(0)
				request(@app).get('/api/posts/').query
					'$regex_string':'Tes'
				.end (err, res) =>
					res.status.should.equal(200)
					res.body.length.should.equal(1)
					done()

		it 'should do a case insensitive regex search', (done) ->

			@endpoint.allowQueryParam('$regexi_string').register(@app)
			request(@app).get('/api/posts/').query
				'$regexi_string':'tes'
			.end (err, res) =>
				res.status.should.equal(200)
				res.body.length.should.equal(1)
				request(@app).get('/api/posts/').query
					'$regexi_string':'Tes'
				.end (err, res) =>
					res.status.should.equal(200)
					res.body.length.should.equal(1)
					done()

	
	describe 'Populate', ->
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
				_related:
					_comments:[
							comment:'Asdf1234'
					]
			mod.cascadeSave (err, res) =>
				@mod = res
				done()

		afterEach (done) ->
			@mod.remove (err, res) ->
				done()
		it 'should return populated data', (done) ->
			

			@endpoint.populate('_comments').register(@app)

			
			request(@app).get('/api/posts/').end (err, res) ->
				res.status.should.equal(200)
				res.body.length.should.equal(1)
				res.body[0]._comments.length.should.equal(1)
				res.body[0]._related._comments.length.should.equal(1)
				res.body[0]._related._comments[0].comment.should.equal('Asdf1234')
				done()
	describe 'Pagination', ->
		beforeEach (done) ->
			
			# set up endpoints
			@app = express()
			@app.use(express.bodyParser())
			@app.use(express.methodOverride())
			# Create a whole bunch of posts
			data = [
					date:moment().add('days', 26).toDate()
					number:13
					string:'a'
				,
					date:moment().add('days', 25).toDate()
					number:17
					string:'c'
				,
					date:moment().add('days', 24).toDate()
					number:12
					string:'f'
				,
					date:moment().add('days', 20).toDate()
					number:50
					string:'z'
			]
			promises = []
			for post in data
				promises.push(createPost(post))
			Q.all(promises).then =>

				new mre '/api/posts', 'Post',
					pagination:
						sortField:'string'
						perPage:2
				.register(@app)


				done()
		afterEach (done) ->
			# clear out
			mongoose.connection.collections.posts.drop()
			done()

		it 'should give paginated results by default', (done) ->

			request(@app).get('/api/posts').end (err, res) ->
				res.body.length.should.equal(2)
				res.body[0].string.should.equal('a')
				res.body[1].string.should.equal('c')
				done()
		it 'should give you the total results in the header', (done) ->
			request(@app).get('/api/posts').end (err, res) ->
				res.header['record-count'].should.equal('4')
				done()

		it 'should take your custom pagination parameters', (done) ->
			request(@app).get('/api/posts').query
				page:2
				perPage:1
				sortField:'-number'
			.end (err, res) ->
				res.body.length.should.equal(1)
				res.body[0].string.should.equal('c')
				done()
		it 'should sort by date too!', (done) ->
			request(@app).get('/api/posts').query
				page:1
				perPage:2
				sortField:'date'
			.end (err, res) ->
				res.body.length.should.equal(2)
				res.body[0].string.should.equal('z')
				done()

	describe 'Deep querying', ->
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
				foo:
					bar:6
			mod.save (err, res) =>
				@mod = res
				done()

		afterEach (done) ->
			@mod.remove (err, res) ->
				done()

		it 'should allow deep querying', (done) ->
			@endpoint.allowQueryParam(['foo.bar']).register(@app)

			request(@app).get('/api/posts/').query
				'foo.bar':7
			.end (err, res) ->
				res.status.should.equal(200)
				res.body.length.should.equal(0)
				done()

	describe 'Alternator bug', ->
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
				foo:
					bar:6
			mod.save (err, res) =>
				@mod = res
				done()

		afterEach (done) ->
			@mod.remove (err, res) ->
				done()

		it 'should allow deep querying', (done) ->
			@endpoint.tap 'pre_filter', 'list', (req, data, next) ->
				data.number = 6
				console.log 'Set number to 6'
				next(data)
			.register(@app)

			request(@app).get('/api/posts/').end (err, res) =>
				res.status.should.equal(200)
				res.body.length.should.equal(0)

				request(@app).get('/api/posts/').end (err, res) =>
					res.status.should.equal(200)
					res.body.length.should.equal(0)
					request(@app).get('/api/posts/').end (err, res) ->
						res.status.should.equal(200)
						res.body.length.should.equal(0)
						done()




