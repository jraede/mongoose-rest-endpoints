mongoose = require('mongoose')
Q = require('q')
httperror = require('httperror')
_ = require('underscore')

class Endpoint

	constructor:(path, model, opts) ->
		@path = path
		@modelClass = model

		if !opts?
			opts = {}
		@to_populate = if opts.populate? then opts.populate else []
		@query_vars = if opts.query_vars? then opts.query_vars else []
		@suggestion = opts.suggestion
		@ignore = if opts.ignore? then opts.ignore else []


		@middleware = 
			get:[]
			post:[]
			put:[]
			delete:[]


	# Replace _XXX with the _id of the subdocument or related document
	# Remove the _id field since we can't explicitly say that in an update request
	#
	cleanData: (data, req) ->
		delete data._id
		for key,val of data

			if val and key.substr(0,1) is '_' and val instanceof Array
				console.log 'cleaning data for ', key, val
				data[key] = new Array()
				for obj in val
					if typeof obj is 'object'
						data[key].push(obj._id)
					else
						data[key].push(obj)
			else if val and key.substr(0, 1) is '_' and typeof val is 'object'
				data[key] = val._id
			else if val and key.substr(0,1) is '_' and typeof val is 'array'
				
			else if val and typeof val is 'object'
				data[key] = @cleanData(val, req)
		return data
	post:(req) ->
		deferred = Q.defer()

		data = @cleanData(req.body, req)
		model = new @modelClass(data)
		###@handleRelations(req).then ->###
		model.save (err) ->
			if err
				console.error err
				deferred.reject(httperror.forge('Failure to create document', 400))
			else
				deferred.resolve(model.toObject())
		###, (err) ->
			deferred.reject(httperror.forge('Failure to create document', 400))###
		return deferred.promise
	get:(req) ->
		deferred = Q.defer()
		id = req.params.id
		if !id
			err = httperror.forge('ID not provided', 400)
			deferred.reject(err)
		else
			query = @modelClass.findById(id)

			if @to_populate.length
				for pop in @to_populate
					query.populate(pop)
			query.exec (err, model) =>
				
				if err
					deferred.reject(httperror.forge('Error retrieving document', 500))
				else if !model
					deferred.reject(httperror.forge('Could not find document', 404))
				else
					doc = model.toObject()
					if @ignore.length
						for field in @ignore
							delete doc[field]
					deferred.resolve(doc)
		return deferred.promise

	populate: (model, rel) ->
		deferred = Q.defer()
		model.populate rel, (err, model) ->
			if err
				deferred.reject(err)
			else
				deferred.resolve(model)
		return deferred.promise
	put:(req) ->
		deferred = Q.defer()
		id = req.params.id
		if !id
			deferred.reject(httperror.forge('ID not provided', 400))
		else
			# Remove ID from req body
			console.log 'cleaning data:', req.body
			data = @cleanData(req.body, req)
			console.log 'cleaned data', data
			# We can't use findByIdAndUpdate because we want the pre/post middleware to be executed
			query = @modelClass.findById(id)
			console.log 'should be populating', @populate
			


			query.exec (err, model) =>
				if err || !model
					console.log err
					deferred.reject(httperror.forge('Error retrieving document', 404))
				else 
					for key,val of data
						model[key] = val

					model.save (err, model) =>
						populates = []
						# Now we populate
						if @to_populate.length
							
							for pop in @to_populate
								console.log 'populating', pop
								populates.push(@populate(model, pop))

						Q.all(populates).then ->
							deferred.resolve(model)
						, (err) ->
							console.log err
							deferred.reject(httperror.forge('Failure to update document', 500))

		return deferred.promise
				
	
	delete:(req) ->
		deferred = Q.defer()
		id = req.params.id
		if !id
			deferred.reject(httperror.forge('ID not provided', 400))
		else
			@modelClass.findByIdAndRemove id, (err, model) ->
				if err
					deferred.reject(httperror.forge('Error deleting document', 500))
				else if !model
					deferred.reject(httperror.forge('Document not found', 404))
				else
					deferred.resolve()
		return deferred.promise
	list:(req) ->
		deferred = Q.defer()

		filter = {}
		if @query_vars
			for query_var in @query_vars
				if req.query[query_var] and (_.isString(req.query[query_var]) or req.query[query_var] instanceof Date)
					if query_var.substr(0, 4) is '$lt_'
						filter[query_var.replace('$lt_', '')] =
							$lt:req.query[query_var]
					else if query_var.substr(0, 5) is '$lte_'
						filter[query_var.replace('$lte_', '')] =
							$lte:req.query[query_var]
					else if query_var.substr(0, 4) is '$gt_'
						filter[query_var.replace('$gt_', '')] =
							$gt:req.query[query_var]
					else if query_var.substr(0, 5) is '$gte_'
						filter[query_var.replace('$gte_', '')] = 
							$gte:req.query[query_var]
					else if query_var.substr(0,4) is '$in_'
						filter[query_var.replace('$in_', '')] =
							$in:req.query[query_var]
					else
						filter[query_var]= req.query[query_var]
				else
					console.log 'bad query var:', query_var
		query = @modelClass.find(filter) 

		if @to_populate.length
			for pop in @to_populate
				query.populate(pop)


		query.exec (err, collection) =>
			if @ignore.length
				for obj,key in collection
					obj = obj.toObject()
					for field in @ignore
						delete obj[field]
					collection[key] = obj
			if err
				deferred.reject(httperror.forge('Could not retrieve collection', 500))
			else
				deferred.resolve(collection)

		return deferred.promise

	getSuggestions: (req) ->
		console.log 'getting suggestions...'
		deferred = Q.defer()
		if @suggestion.forgeQuery
			params = @suggestion.forgeQuery(req)
		else
			params = null

		@modelClass.find params, (err, results) =>
			if err
				console.error err
				deferred.reject(httperror.forge('Error fetching results', 500))
			else
				final = []

				for res in results
					obj=
						id:res._id
						value:@suggestion.getLabel(res)
						tokens: @suggestion.getTokens(res)
					final.push(obj)
				deferred.resolve(final)
		
		return deferred.promise



	addMiddleware:(method, middleware) ->
		if method is 'all'
			for m in ['get','post','put','delete']
				@addMiddleware(m, middleware)
		else
			if middleware instanceof Array
				for m in middleware
					@addMiddleware(method, m)
			else
				@middleware[method].push(middleware)

		return @

	# Register this endpoint with the express app
	register: (app) ->
		if @suggestion
			app.get @path + '/suggestion', @middleware.get, (req, res) =>
				Q(@getSuggestions(req)).then (results) ->
					res.send(results, 200)
				, (error) ->
					res.send(error.message, error.code)

		app.get @path + '/:id', @middleware.get, (req, res) =>
			Q(@get(req)).then (results) ->
				res.send(results, 200)
			, (error) ->
				res.send(error.message, error.code)

		app.get @path, @middleware.get, (req, res) =>
			Q(@list(req)).then (results) ->
				res.send(results, 200)
			, (error) ->
				res.send(error.message, error.code)
		app.post @path, @middleware.post, (req, res) =>
			Q(@post(req)).then (results) ->
				res.send(results, 201)
			, (error) ->
				res.send(error.message, error.code)
		app.put @path + '/:id', @middleware.put, (req, res) =>
			Q(@put(req)).then (results) ->
				res.send(results, 202)
			, (error) ->
				res.send(error.message, error.code)
		app.delete @path + '/:id', @middleware.delete, (req, res) =>
			Q(@delete(req)).then (results) ->
				res.send(results, 200)
			, (error) ->
				res.send(error.message, error.code)

		

module.exports = Endpoint
