mongoose = require('mongoose')
Q = require('q')
httperror = require('./httperror')
_ = require('underscore')

dot = require 'dot-component'


###
Middle ware is separate

###
module.exports = class Endpoint

	###
	 * @param String path 			the base URL for the endpoint
	 * @param String modelId 		the name of the document
	 * @param Object opts 			Additional options (see defaults below)
	### 
	constructor:(path, modelId, opts) ->
		@path = path
		@modelId = modelId
		@$modelClass = mongoose.model(modelId)
		
		@$$taps = {}
		@options = 
			queryParams:[]
			#cascade:
			#	allowedRelations:[]
			#	filter:(data, schemaPath) ->
			#		return data
			pagination:
				perPage:50
				sortField:'_id'
			populate:[]
		if opts?
			@options = _.extend(@options, opts)


		@$$middleware = 
			fetch:[]
			list:[]
			post:[]
			put:[]
			delete:[]

		# We want to tap into the list to use our default filtering function for req.query
		@tap('pre_filter', 'list', @$$constructFilterFromRequest)

	###
	 * Add field to populate options. These fields will be populated on every request except delete
	 *
	 * @param String field
	 * @return Endpoint for chaining
	###
	populate:(field) ->

		if field instanceof Array
			for p in field
				@options.populate.push(p)
		else
			@options.populate.push(field)
		return @

	###
	 * Allow a query param or params to become part of the search filter for list requests.
	 *
	 * @param String|Array param
	 * @return Endpoint for chaining
	###
	allowQueryParam:(param) ->

		if param instanceof Array
			for p in param
				@options.queryParams.push(p)
		else
			@options.queryParams.push(param)

		return @

	###
	 * Set cascade parameters for playing nicely with cascading-relations package
	 *
	 * @param Array allowed 		Allowed relation paths
	 * @param Function filter 		Filter function to pass all related docs through
	 * @return Endpoint for chaining
	###
	cascade:(allowed, filter) ->
		@options.cascade =
			allowedRelations:allowed
			filter:filter
		return @

	###
	 * Tap a function onto a hook. Hooks may pass a value through each function to get the final 
	 * result (filter) or just execute all the functions in a row (action). 
	 * Each function is structured the same; they just may have a null value for the 
	 * `data` argument (2nd argument).
	 *
	 * Functions look like this:
	 * `function(arguments, data, next) {}`
	 * 
	 * ...and must either call next(data) (optionally with modified data) or just return a 
	 * non-null value (the system assumes that a null return value means that next will be 
	 * called instead)
	 *
	 * HOOKS:
	 * * pre_filter (before execution [default values, remove fields, etc]). Note that the "fetch"
	 * 		filter will be used for retrieving documents in PUT and DELETE requests before performing
	 * 		operations on them. Useful for limiting the documents people have access to.
	 * * post_retrieve (after retrieval of the model [maybe they can only do something 
	 * 		if the model has a certain value]). Only applies on PUT/DELETE requests
	 * * pre_response (after execution, before response [hide fields, modify, etc])
	 * * pre_response_error (after execution, before response, if execution throws an error)
	 * 
	 * @param String hook 		The name of the hook
	 * @param String method 	The method (fetch, list, post, put, delete).
	 * @param Function func 	Function to run on hook
	###
	tap:(hook, method, func) ->
		if method is '*'
			methods = ['fetch','list','create','update','delete']
		else
			methods = [method]

		if !@$$taps[hook]
			@$$taps[hook] = {}
		for method in methods
			if !@$$taps[hook][method]
				@$$taps[hook][method] = []
			@$$taps[hook][method].push(func)

		untap = =>
			index = @$$taps[hook][method].indexOf(func)
			@$$taps[hook][method].splice(index, 1)

		# Do we want to return untap here?
		return @

	###
	 * Add standard express middleware to one of the five methods. "all" or "*"
	 * apply for all five. Connect middleware syntax applies.
	 * 
	 * @param String method 			Method name
	 * @param Function middleware 		Connect-style middleware function
	 * @return Endpoint for chaining
	###
	addMiddleware:(method, middleware) ->
		if method is 'all' or method is '*'
			for m in ['list','fetch','post','put','delete']
				@addMiddleware(m, middleware)
		else
			if middleware instanceof Array
				for m in middleware
					@addMiddleware(method, m)
			else
				@$$middleware[method].push(middleware)

		return @



	###
	 * Register the endpoints on an express app.
	 * 
	 * @param Express app
	###
	register: (app) ->

		# Fetch
		app.get @path + '/:id', @$$middleware.fetch, (req, res) =>
			@$$fetch(req, res).then (model) =>
				# Run it through pre-response hooks
				@$$runHook('pre_response', 'fetch', req, model.toObject()).then (response) =>
					res.send(response, 200)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)
			, (err) =>
				@$$runHook('pre_response_error', 'fetch', req, err).then (err) =>
					res.send(err.message, err.code)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)

		app.get @path, @$$middleware.list, (req, res) =>
			@$$list(req, res).then (models) =>
				final = []
				for model in models
					final.push(model.toObject())
				# Run it through pre-response hooks
				@$$runHook('pre_response', 'list', req, final).then (response) =>
					res.send(response, 200)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)
			, (err) =>
				@$$runHook('pre_response_error', 'list', req, err).then (err) =>
					res.send(err.message, err.code)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)

		app.post @path, @$$middleware.post, (req, res) =>
			@$$post(req, res).then (model) =>
				@$$runHook('pre_response', 'post', req, model.toObject()).then (response) =>
					res.send(response, 201)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)
			, (err) =>
				@$$runHook('pre_response_error', 'post', req, err).then (err) =>
					res.send(err.message, err.code)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)

		app.put @path + '/:id', @$$middleware.put, (req, res) =>
			@$$put(req, res).then (model) =>
				@$$runHook('pre_response', 'put', req, model.toObject()).then (response) =>
					res.send(response, 200)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)
			, (err) =>
				@$$runHook('pre_response_error', 'put', req, err).then (err) =>
					res.send(err.message, err.code)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)


		app.delete @path + '/:id', @$$middleware.delete, (req, res) =>
			@$$delete(req, res).then =>
				@$$runHook('pre_response', 'delete', req, {}).then ->
					res.send(200)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)
			, (err) =>
				@$$runHook('pre_response_error', 'delete', req, err).then (err) =>
					res.send(err.message, err.code)
				, (err) ->
					if err.code
						res.send(err.message, err.code)
					else
						res.send(500)
	

	###
	PRIVATE METHODS
	###
	$$runHook:(hook, method, args, mod) ->
		deferred = Q.defer()
		
		runFunction = (f, next, args, data) ->
			try 
				ret = _.bind(f, @, args, data, next)()
				if ret?
					next(ret)
			catch err
				deferred.reject(err)

		if !@$$taps[hook]?
			deferred.resolve(mod)
		else if !@$$taps[hook][method]?
			deferred.resolve(mod)
		else
			funcs = @$$taps[hook][method]

			
			next = (final) ->
				deferred.resolve(final)


			# Run them in order. But we need to reverse them to accommodate the callbacks
			funcs = funcs.reverse()
			for func in funcs

				next = _.bind(runFunction, @, func, next, args)
			
			next(mod)

		return deferred.promise

	$$populateQuery:(query) ->
		if @options.populate? and @options.populate.length
			for pop in @options.populate
				query.populate(pop)
	$$populateDocument:(doc) ->

		populatePath = (path, doc) ->
			d = Q.defer()
			doc.populate path, (err, doc) ->
				d.resolve()

		promises = []
		for pop in @options.populate
			promises.push(populatePath(pop, doc))

		return Q.all(promises)

	$$fetch:(req, res) ->
		deferred = Q.defer()
		id = req.params.id


		if !id
			err = httperror.forge('ID not provided', 400)
			deferred.reject(err)
			return deferred.promise

		if !id.match(/^[0-9a-fA-F]{24}$/)
			err = httperror.forge('Bad ID', 400)
			deferred.reject(err)
			return deferred.promise


		# Filter the data
		@$$runHook('pre_filter', 'fetch', req, {}).then (filter) =>

			filter._id = id
			query = @$modelClass.findOne(filter)

			# Populate
			@$$populateQuery(query)

			query.exec (err, model) =>
				if err
					return deferred.reject(httperror.forge('Error retrieving dcoument', 500))
				if !model
					return deferred.reject(httperror.forge('Could not find document', 404))
				deferred.resolve(model)


		return deferred.promise


	$$list:(req, res) ->
		deferred = Q.defer()

		@$$runHook('pre_filter', 'list', req, {}).then (filter) =>
			query = @$modelClass.find(filter)

			# Populate
			@$$populateQuery(query)

			if @options.pagination
				# Get total
				# 
				@$modelClass.count filter, (err, count) =>
					if err
						return deferred.reject(httperror.forge('Could not retrieve collection', 500))

					res.setHeader('Record-Count', count.toString())


					config = @$$getPaginationConfig(req)
					query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec (err, collection) =>


						if err
							deferred.reject(httperror.forge('Could not retrieve collection', 500))
						else
							deferred.resolve(collection)

			else

				query.exec (err, collection) =>
					if err
						deferred.reject(httperror.forge('Could not retrieve collection', 500))
					else
						deferred.resolve(collection)

			return deferred.promise



	$$post:(req, res) ->
		deferred = Q.defer()

		@$$runHook('pre_filter', 'post', req, req.body).then (data) =>
			model = new @$modelClass(data)

			if @options.cascade?
				model.cascadeSave (err, model) =>
					if err
						deferred.reject(httperror.forge(err, 400))
					else
						@$$populateDocument(model).then ->
							deferred.resolve(model)
				, 
					limit:@options.cascade.allowedRelations
					filter:@options.cascade.filter
			else
				model.save (err, model) =>
					# Populate
					if err
						return deferred.reject(httperror.forge(err, 400))
					@$$populateDocument(model).then ->
						deferred.resolve(model)
					
		return deferred.promise

	$$put:(req, res) ->
		deferred = Q.defer()


		id = req.params.id
		if !id.match(/^[0-9a-fA-F]{24}$/)
			deferred.reject(httperror.forge('Bad ID', 400))
			return deferred.promise

		# The fetch pre filter runs here in case they want to prevent fetching based on
		# some parameter. Same would apply for this (and delete)
		@$$runHook('pre_filter', 'fetch', req, {}).then (filter) =>

			filter._id = id

			query = @$modelClass.findOne(filter)

			@$$populateQuery(query)
			query.exec (err, model) =>
				if err
					return deferred.reject(httperror.forge('Server error', 500))
				if !model
					return deferred.reject(httperror.forge('Not found', 404))

				# Post retrieve hook

				@$$runHook('post_retrieve', 'put', req, model).then (model) =>
					# Now parse the data
					# 
					data = req.body
					delete data._id
					delete data.__v
					@$$runHook('pre_filter', 'put', req, data).then (data) =>
						model.set(data)

						if @options.cascade?
							model.cascadeSave (err, model) =>
								if err
									deferred.reject(httperror.forge(err, 400))
								else
									@$$populateDocument(model).then ->
										deferred.resolve(model)
							, 
								limit:@options.cascade.allowedRelations
								filter:@options.cascade.filter
						else
							model.save (err, model) =>
								# Populate
								if err
									return deferred.reject(httperror.forge(err, 400))
								@$$populateDocument(model).then ->
									deferred.resolve(model)
				, (err) ->
					return deferred.reject(httperror.forge(err.message, err.code))

					
		return deferred.promise

	$$delete:(req, res) ->
		deferred = Q.defer()


		id = req.params.id
		if !id.match(/^[0-9a-fA-F]{24}$/)
			deferred.reject(httperror.forge('Bad ID', 400))
			return deferred.promise

		# The fetch pre filter runs here in case they want to prevent fetching based on
		# some parameter. Same would apply for this (and delete)
		@$$runHook('pre_filter', 'fetch', req, {}).then (filter) =>
			filter._id = id
			query = @$modelClass.findOne(filter)

			@$$populateQuery(query)
			query.exec (err, model) =>
				if err
					return deferred.reject(httperror.forge('Server error', 500))
				if !model
					return deferred.reject(httperror.forge('Not found', 404))

				# Post retrieve hook
				@$$runHook('post_retrieve', 'delete', req, model).then (model) =>

					model.remove (err) ->
						if err
							return deferred.reject(httperror.forge(err, 400))
						return deferred.resolve()

					return deferred.reject(httperror.forge(err.message, err.code))
				, (err) ->
					return deferred.reject(httperror.forge(err.message, err.code))


					
		return deferred.promise


	$$getPaginationConfig:(req) ->
		data = req.query

		result = 
			perPage:data.perPage
			page:data.page
			sortField:data.sortField
		result.page = parseInt(data.page)
		if !result.page? or isNaN(result.page) or result.page < 1
			result.page = 1
		if !result.perPage?
			result.perPage = @options.pagination.perPage
		if !result.sortField?
			result.sortField = @options.pagination.sortField

		return result

	
	$$constructFilterFromRequest:(req, data, next) ->
		addToFilter = (filter, prop, key, val) ->
			if filter[prop]?
				filter[prop][key] = val
			else
				filter[prop] = {}
				filter[prop][key] = val
		filter = {}
		if @options.queryParams
			for query_var in @options.queryParams
				if req.query[query_var] and (_.isString(req.query[query_var]) or req.query[query_var] instanceof Date)
					if query_var.substr(0, 4) is '$lt_'
						addToFilter(filter, query_var.replace('$lt_', ''), '$lt', req.query[query_var])
					else if query_var.substr(0, 5) is '$lte_'
						addToFilter(filter, query_var.replace('$lte_', ''), '$lte', req.query[query_var])
					else if query_var.substr(0, 4) is '$gt_'
						addToFilter(filter, query_var.replace('$gt_', ''), '$gt', req.query[query_var])
					else if query_var.substr(0, 5) is '$gte_'
						addToFilter(filter, query_var.replace('$gte_', ''), '$gte', req.query[query_var])
					else if query_var.substr(0,4) is '$in_'
						addToFilter(filter, query_var.replace('$in_', ''), '$in', req.query[query_var])
					else if query_var.substr(0,4) is '$ne_'
						addToFilter(filter, query_var.replace('$ne_', ''), '$ne', req.query[query_var])
					else
						filter[query_var]= req.query[query_var]
		return filter
