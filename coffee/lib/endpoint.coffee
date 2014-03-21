mongoose = require('mongoose')
Q = require('q')
httperror = require('./httperror')
_ = require('underscore')
Response = require './response'

dot = require 'dot-component'


###
Middle ware is separate
HOOKS:
	pre_filter (before execution [default values, remove fields, etc])
	post_retrieve (after retrieval of the model [maybe they can only do something if the model has a certain value])
	pre_response (after execution, before response [hide fields, modify, etc])
###
class Endpoint

	####
	# @param String path - the base URL for the endpoint
	# @param String modelId - the name of the document
	# @param Object opts - Additional options
	#### 
	constructor:(path, modelId, opts) ->
		@path = path
		@modelId = modelId
		@$modelClass = mongoose.model(modelId)
		
		@$$taps = {}
		@options = {}
		# @to_populate = if opts.populate? then opts.populate else []
		# @queryVars = if opts.queryVars? then opts.queryVars else []
		# @cascadeRelations = if opts.cascadeRelations? then opts.cascadeRelations else []
		# @relationsFilter = opts.relationsFilter
		# @suggestion = opts.suggestion
		# @ignore = if opts.ignore? then opts.ignore else []

		# if opts.pagination
		# 	@pagination = opts.pagination



		# @checks =
		# 	update:null
		# 	delete:null

		# @prevent = if opts.prevent then opts.prevent else []
		@middleware = 
			get:[]
			post:[]
			put:[]
			delete:[]

		# @dataFilters =
		# 	fetch:[]
		# 	save:[]
		# @dataFilters.fetch.push(@constructFilterFromRequest)



		# @responsePrototype = class CustomResponse extends Response

	
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

	$$runHook:(hook, method, args, mod) ->
		deferred = Q.defer()
		
		runFunction = (f, next, args, data) ->
			ret = _.bind(f, @, args, data, next)()
			if ret?
				next(ret)
		if !@$$taps[hook]?
			deferred.resolve(mod)
		else if !@$$taps[hook][method]?
			deferred.resolve(mod)
		else
			funcs = @$$taps[hook][method]

			# Run them in order. But we need to reverse them to accommodate the callbacks
			next = (final) ->
				deferred.resolve(final)

			funcs = funcs.reverse()
			for func in funcs

				next = _.bind(runFunction, @, func, next, args)
			
			next(mod)

		return deferred.promise

	$$fetch:(req) ->
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
			if @options.populate? && @options.populate.length
				for pop in @options.populate
					query.populate(pop)

			query.exec (err, model) =>
				if err
					return deferred.reject(httperror.forge('Error retrieving dcoument', 500))
				if !model
					return deferred.reject(httperror.forge('Could not find document', 404))
				deferred.resolve(model)


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


	register: (app) ->
		app.get @path + '/:id', @middleware.get, (req, res) =>
			@$$fetch(req).then (model) =>
				# Run it through pre-response hooks
				@$$runHook('pre_response', 'fetch', req, model.toObject()).then (response) =>
					res.send(response, 200)
				, (err) ->
					# Fatal error during hooks
					console.log '500 there', err.stack
					res.send(500)
			, (err) =>
				@$$runHook('pre_response_error', 'fetch', req, err).then (err) =>
					res.send(err.message, err.code)
				, (err) ->
					console.log '500 here', err.stack
					res.send(500)
		# console.log 'Registered endpoint for path:', @path
		# if @suggestion
		# 	app.get @path + '/suggestion', @middleware.get, (req, res) =>
		# 		Q(@getSuggestions(req)).then (results) =>
		# 			@response('suggestion', req, res, results, 200).send()
		# 		, (error) =>
		# 			@response('suggestion:error', req, res, error.message, error.code).send()

		

		# app.get @path, @middleware.get, (req, res) =>
		# 	Q(@list(req, res)).then (results) =>
		# 		@response('list', req, res, results, 200).send()
		# 	, (error) =>
		# 		console.error error
		# 		@response('list:error', req, res, error.message, error.code).send()
		# app.post @path, @middleware.post, (req, res) =>
		# 	Q(@post(req)).then (results) =>
		# 		@response('post', req, res, results, 201).send()
		# 	, (error) =>
		# 		@response('post:error', req, res, error.message, error.code).send()
		# app.put @path + '/:id', @middleware.put, (req, res) =>
		# 	Q(@put(req)).then (results) =>
		# 		@response('put', req, res, results, 200).send()
		# 	, (error) =>
		# 		@response('put:error', req, res, error.message, error.code).send()
		# app.delete @path + '/:id', @middleware.delete, (req, res) =>
		# 	Q(@delete(req)).then (results) =>
		# 		@response('delete', req, res, results, 200).send()
		# 	, (error) =>
		# 		@response('delete:error', req, res, error.message, error.code).send()


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
			result.perPage = @pagination.defaults.perPage
		if !result.sortField?
			result.sortField = @pagination.defaults.sortField

		return result

	
	constructFilterFromRequest:(req, data) ->
		addToFilter = (filter, prop, key, val) ->
			if filter[prop]?
				filter[prop][key] = val
			else
				filter[prop] = {}
				filter[prop][key] = val
		filter = {}
		if @queryVars
			for query_var in @queryVars
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


	

	filterData:(req, method, data) ->
		r = data
		if @dataFilters[method].length
			for f in @dataFilters[method]
				if typeof f isnt 'function'
					continue
				f = _.bind(f, @)
				r = f(req, r)
		return r
	

	post:(req) ->
		deferred = Q.defer()
		data = req.body
		model = new @modelClass()

		data = @filterData(req, 'save', data)
		model.set(data)

		if @cascadeRelations.length and model.cascadeSave?
			model.cascadeSave (err, model) =>
				if err
					console.error err
					deferred.reject(httperror.forge(err, 400))
				else
					returnVal = model.toObject()
					deferred.resolve(returnVal)
			, 
				limit:@cascadeRelations
				filter:@relationsFilter
		else
			model.save (err, model) =>
				if err
					console.error err
					deferred.reject(httperror.forge(err, 400))
				else
					returnVal = model.toObject()
					deferred.resolve(returnVal)
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
			data = req.body



			filter = @filterData(req, 'fetch', {})
			filter._id = id
			# We can't use findByIdAndUpdate because we want the pre/post middleware to be executed
			query = @modelClass.findOne(filter)
			


			query.exec (err, model) =>
				if err || !model
					deferred.reject(httperror.forge('Error retrieving document', 404))
				else 

					if @checks['update']?
						@checks['update'](req, model).then =>
							@finishPut(req, model, data, deferred)
						, (err) ->
							deferred.reject(httperror.forge('Cannot put', 403))

					else
						@finishPut(req, model, data, deferred)

						
					

		return deferred.promise
				
	finishPut:(req, model, data, deferred) ->
		data = @filterData(req, 'save', data)
		delete data['_id']
		delete data['__v']
		model.set(data)


		if @cascadeRelations.length and model.cascadeSave?
			model.cascadeSave (err, model) =>
				if err
					return deferred.reject(httperror.forge(err, 400))
				returnVal = model.toObject()
				deferred.resolve(returnVal)
			, 
				limit:@cascadeRelations
				filter:@relationsFilter
		else
			model.save (err, model) =>
				if err
					return deferred.reject(httperror.forge(err, 400))
				returnVal = model.toObject()
				deferred.resolve(returnVal)
	delete:(req) ->
		deferred = Q.defer()
		id = req.params.id
		if !id
			deferred.reject(httperror.forge('ID not provided', 400))
		else
			@modelClass.findById id, (err, model) =>
				if !model
					return deferred.reject(httperror.forge('Document not found', 404))
				if err
					return deferred.reject(httperror.forge('Error deleting document', 500))
				if @checks['delete']?
					@checks['delete'](req, model).then =>
						@finishDelete(model, deferred)
					, (err) ->
						deferred.reject(httperror.forge('No access', 403))
				else
					@finishDelete(model, deferred)
			
		return deferred.promise
	finishDelete:(model, deferred) ->
		model.remove (err) ->

			if err
				deferred.reject(httperror.forge('Error deleting document', 500))
			else
				deferred.resolve()
	list:(req, res) ->
		deferred = Q.defer()

		filter = @filterData(req, 'fetch')
				
		query = @modelClass.find(filter) 


		if @to_populate.length
			for pop in @to_populate
				query.populate(pop)

		if @pagination
			# Get total
			@modelClass.count filter, (err, count) =>
				if err
					return deferred.reject(htperror.forge('Could not retrieve collection', 500))

				res.setHeader('Record-Count', count.toString())


				config = @getPaginationConfig(req)
				query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec (err, collection) =>
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
		else

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


	responseHook:(event, callback) ->
		@responsePrototype[event]('send', callback)
		return @

	

	response: (type, req, res, data, code) ->
		response = new @responsePrototype(type, req, res, data, code)
		return response
	# Register this endpoint with the express app
	

		

module.exports = Endpoint
