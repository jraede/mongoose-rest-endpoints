express = require 'express'
request = require 'supertest'
should = require 'should'
Q = require 'q'

mongoose = require 'mongoose'

endpoint = require '../lib/endpoint'
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



describe 'Endpoint Test', ->
	before (done) ->
		# clear out
		mongoose.connection.collections.posts.drop()
		mongoose.connection.collections.comments.drop()
		# set up endpoints

		new endpoint '/api/posts', 'Post',
			populate:['_comments']
			cascadeRelations:['_comments']
			relationsFilter: (data, path) ->
				data.account = 'asdf'
				return data
			queryVars:['$gt_date', '$lt_date', 'number']
		.addMiddleware('delete', requirePassword('password'))
		.addFilter 'save', (req, data) ->
			data.account = 'asdf'
			return data
		.responseHook 'pre', (next) ->
			if @type is 'post'
				@data.type = 'POST'
			next()
		.check 'update', (req, model) ->
			deferred = Q.defer()
			if req.query.stop_update? 
				deferred.reject()
			else
				deferred.resolve()
			return deferred.promise
		.check 'delete', (req, model) ->
			deferred = Q.defer()
			if req.query.stop_delete
				deferred.reject()
			else
				deferred.resolve()
			return deferred.promise
		.register(app)

		new endpoint('/api/posts2', 'Post').register(app)
		new endpoint '/api/authors', 'Author',
			queryVars:['name']
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
			console.log 'RESPONSE TEXT:', response.text
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

	it 'should give you post info on get', (done) ->
		request(app).get('/api/posts/' + @post1._id).end (err, res) ->
			res.status.should.equal(200)
			res.body.number.should.equal(111)
			res.body.string.should.equal('Test')
			done()

	it 'should run the update check', (done) ->
		request(app).put('/api/posts/' + @post1._id).query
			stop_update:true
		.end (err, res) ->
			res.status.should.equal(403)
			done()
	it 'should not let you delete a post without a password', (done) ->
		request(app).del('/api/posts/' + @post1._id).end (err, response) ->
			response.status.should.equal(401)
			done()

	it 'should run the delete check', (done) ->
		request(app).del('/api/posts/' + @post1._id + '?password=password').query
			stop_delete:true
		.end (err, res) ->
			res.status.should.equal(403)
			done()
	it 'should let you delete a post with a password', (done) ->
		request(app).del('/api/posts/' + @post1._id + '?password=password').end (err, response) ->
			response.status.should.equal(200)
			done()


	it 'should have executed remove middleware', (done) ->
		# Wait a few seconds for post delete to run since
		setTimeout =>
			request(app).get('/api/authors').query
				name:'Deleted Post'
			.end (err, response) ->
				response.body.length.should.equal(1)
				done()
		, 1000




	

	it 'should save related and honor the cascadeRelations config', (done) ->
		request(app).post('/api/posts').send
			date:new Date()
			number:111
			string:'Test'
			_related:
				_comments:[
						comment:'This is a comment'
						_related:
							_author:
								name:'Foo McFooterson'
				]
		.end (err, res) =>
			@post2 = res.body
			# Should have saved the comment but not the author
			res.body._comments.length.should.equal(1)
			should.not.exist(res.body._related._comments._author)
			done()

	it 'should have applied filters to relations', (done) ->
		@post2._related._comments[0].account.should.equal('asdf')
		done()

	it 'should return populated comments when listing posts', (done) ->
		request(app).get('/api/posts').end (err, response) =>
			response.status.should.equal(200)
			response.body.length.should.equal(1)
			response.body[0]._related._comments[0].comment.should.equal 'This is a comment'
			response.body[0]._related._comments[0]._post.should.equal @post2._id
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
	it 'should let you do a greater than and less than request together and combine them accurately', (done) ->
		nextYear = new Date()
		nextYear.setFullYear(nextYear.getFullYear() + 1)
		request(app).get('/api/posts').query
			$lt_date:nextYear
			$gt_date:nextYear
			

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

	it 'should save a model with no relations set', (done) ->
		request(app).post('/api/posts2').send
			date:new Date()
			number:111
			string:'Test'
		.end (err, res) =>
			res.status.should.equal(201)
			@regpost = res.body
			done()

	it 'should be able to put a model with no relations set', (done) ->
		@regpost.string = 'Test1'
		request(app).put('/api/posts2/' + @regpost._id).send(@regpost).end (err, res) ->
			res.status.should.equal(200)
			done()

	it 'should pass through the validation errors when there is a 400 level error', (done) ->
		request(app).post('/api/posts').send
			date:new Date()
			number:111
			
		.end (err, res) =>
			res.status.should.equal(400)
			res.body.message.should.equal('Validation failed')
			done()

	it 'should display validation errors on PUT request', (done) ->
		@regpost.string = null
		request(app).put('/api/posts2/' + @regpost._id).send(@regpost).end (err, res) ->
			res.status.should.equal(400)
			res.body.message.should.equal('Validation failed')
			done()




