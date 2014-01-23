express = require 'express'
request = require 'supertest'
should = require 'should'

mongoose = require 'mongoose'

endpoint = require '../lib/endpoint'

Q = require 'q'
postSchema = new mongoose.Schema
	date:Date
	number:Number
	string:String

moment = require 'moment'


# Custom middleware for testing
requirePassword = (password) ->
	return (req, res, next) ->
		if req.query.password and req.query.password is password
			next()
		else
			res.send(401)
mongoose.connect('mongodb://localhost/mre_test')



mongoose.model('Post', postSchema)

mongoose.set 'debug', true

app = express()
app.use(express.bodyParser())
app.use(express.methodOverride())


createPost = (data) ->
	deferred = Q.defer()
	postClass = mongoose.model('Post')
	post = new postClass(data)
	post.save (err, res) ->
		if err
			return deferred.reject(err)
		return deferred.resolve()

	return deferred.promise

describe 'Pagination', ->
	before (done) ->
		# clear out
		mongoose.connection.collections.posts.drop()
		# set up endpoints

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
		Q.all(promises).then ->
			new endpoint '/api/posts', 'Post',
				pagination:
					defaults:
						sortField:'string'
						perPage:2
			.register(app)


			app.listen 5555, ->

				done()

	it 'should give paginated results by default', (done) ->
		request(app).get('/api/posts').end (err, res) ->
			res.body.length.should.equal(2)
			res.body[0].string.should.equal('a')
			res.body[1].string.should.equal('c')
			done()
	it 'should give you the total results in the header', (done) ->
		request(app).get('/api/posts').end (err, res) ->
			res.header['record-count'].should.equal('4')
			done()

	it 'should take your custom pagination parameters', (done) ->
		request(app).get('/api/posts').query
			page:2
			perPage:1
			sortField:'-number'
		.end (err, res) ->
			res.body.length.should.equal(1)
			res.body[0].string.should.equal('c')
			done()
	it 'should sort by date too!', (done) ->
		request(app).get('/api/posts').query
			page:1
			perPage:2
			sortField:'date'
		.end (err, res) ->
			res.body.length.should.equal(2)
			res.body[0].string.should.equal('z')
			done()



