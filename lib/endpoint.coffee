mongoose = require('mongoose')
Q = require('q')
httperror = require('./httperror')
_ = require('underscore')
Response = require './response'

dot = require 'dot-component'
class Endpoint

	####
	# @param String path - the base URL for the endpoint
	# @param String modelId - the name of the document
	# @param Object opts - Additional options
	#### 
	constructor:(path, modelId, opts) ->
		@path = path
		@modelId = modelId
		@modelClass = mongoose.model(modelId)
		if !opts?
			opts = {}
		@to_populate = if opts.populate? then opts.populate else []
		@queryVars = if opts.queryVars? then opts.queryVars else []
		@cascadeRelations = if opts.queryVars? then opts.queryVars else []
		@suggestion = opts.suggestion
		@ignore = if opts.ignore? then opts.ignore else []

		@prevent = if opts.prevent then opts.prevent else []
		@middleware = 
			get:[]
			post:[]
			put:[]
			delete:[]

		@dataFilters =
			fetch:[]
			save:[]
		@dataFilters.fetch.push(@constructFilterFromRequest)

		@responsePrototype = class CustomResponse extends Response

	addFilter:(method, f) ->
		@dataFilters[method].push(f)
		return @

	constructFilterFromRequest:(req, data, isChild) ->
		filter = {}
		if @queryVars
			for query_var in @queryVars
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
					else if query_var.substr(0,4) is '$ne_'
						filter[query_var.replace('$ne_', '')] =
							$ne:req.query[query_var]
					else
						filter[query_var]= req.query[query_var]
		return filter


	filterRelations:(req, data, isChild) ->
		unflatten = (data) ->
			if (Object(data)) isnt data or Array.isArray(data)
				return data
			result = {}

			doWhile = (func, condition) ->
				func()
				func() while condition()

			for key,val of data
				cur = result
				prop = ''
				last = 0
				idx = 0
				doWhile ->
					idx = p.indexOf('.', last)
					n = if idx isnt -1 then idx else undefined
					temp = p.substring(last, n)
					cur = 
				


		if (Object(data) !== data || Array.isArray(data))
		        return data;
		    var result = {}, cur, prop, idx, last, temp;
		    for(var p in data) {
		        cur = result, prop = "", last = 0;
		        do {
		            idx = p.indexOf(".", last);
		            temp = p.substring(last, idx !== -1 ? idx : undefined);
		            cur = cur[prop] || (cur[prop] = (!isNaN(parseInt(temp)) ? [] : {}));
		            prop = temp;
		            last = idx + 1;
		        } while(idx >= 0);
		        cur[prop] = data[p];
		    }
		    return result[""];
		if @cascadeRelations.length and data._related
			#Flatten, clear unwanted, unflatten
			flat = @flattenDataToPaths(data._related)
			keep = {}
			for rel in @cascadeRelations
				if flat[rel]?
					keep[rel] = flat[rel]
			data._related = unflatten(keep)
		else
			return data
	
	flattenDataToPaths:(data) ->
		paths = _.keys(@modelClass.paths)
		res = {}
		recurse = (obj, current) ->
			for key,val of obj
				if paths.indexOf(key) >= 0
					res[key] = val
				else
					newKey = if current then current + '.' + key else key
					if val? and typeof value is 'object'
						recurse(val, newKey)
					else
						console.error 'Invalid value for path:', current, val
		recurse(data)
		return res
		
	
	filterRelationAtPath:(path, data) ->

	filterData:(req, method, data, isChild) ->
		r = data
		if @dataFilters[method].length
			for f in @dataFilters[method]
				if typeof f isnt 'function'
					continue
				f = _.bind(f, @)
				r = f(req, r, isChild)
		return r
	

	post:(req) ->
		deferred = Q.defer()
		data = req.body
		@model = new @modelClass()

		data = @filterData(req, 'save', @postData)
		@model.set(data)

		if @cascadeRelations.length and @model.cascadeSave?
			method = 'cascadeSave'
		else
			method = 'save'
		@model[method] (err) =>
			if err
				console.error err
				deferred.reject(httperror.forge('Failure to create document', 400))
			else
				returnVal = @model.toObject()
				returnVal = @repopulate(returnVal)
				deferred.resolve(returnVal)
		, (err) ->
			console.error err
			deferred.reject(httperror.forge('Failure to create document', 400))
		return deferred.promise
	get:(req) ->
		deferred = Q.defer()
		id = req.params.id
		filter = 
			_id:id
		data = @filterData(req, 'fetch', filter)
		if !id
			err = httperror.forge('ID not provided', 400)
			deferred.reject(err)
		else
			query = @modelClass.findOne(data)

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
			data = req.body

			filter =
				_id:id

			filter = @filterData(req, 'fetch', filter)
			# We can't use findByIdAndUpdate because we want the pre/post middleware to be executed
			query = @modelClass.findOne(filter)
			


			query.exec (err, model) =>
				if err || !model
					deferred.reject(httperror.forge('Error retrieving document', 404))
				else 
					@model = model
					@handleRelations(req, data).then =>
						data = @filterData(req, 'save', @postData)
						for key,val of data
							if key isnt '_id' and key isnt '__v'
								@model[key] = val
						@model.save (err, model) =>
							returnVal = model.toObject()
							returnVal = @repopulate(returnVal)
							deferred.resolve(returnVal)
					, (err) ->
						deferred.reject(httperror.forge('Error saving document', 500))

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

		filter = @filterData(req, 'fetch')
				
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

	response: (type, req, res, data, code) ->
		response = new @responsePrototype(type, req, res, data, code)
		return response
	# Register this endpoint with the express app
	register: (app) ->
		console.log 'Registered endpoint for path:', @path
		if @suggestion
			app.get @path + '/suggestion', @middleware.get, (req, res) =>
				Q(@getSuggestions(req)).then (results) =>
					@response('suggestion', req, res, results, 200).send()
				, (error) =>
					@response('suggestion:error', req, res, error.message, error.code).send()

		app.get @path + '/:id', @middleware.get, (req, res) =>
			Q(@get(req)).then (results) ->
				@response(res, results, 200).send()
			, (error) =>
				console.error error
				@response('get:error', req, res, error.message, error.code).send()

		app.get @path, @middleware.get, (req, res) =>
			Q(@list(req)).then (results) =>
				@response('list', req, res, results, 200).send()
			, (error) =>
				console.error error
				@response('list:error', req, res, error.message, error.code).send()
		app.post @path, @middleware.post, (req, res) =>
			Q(@post(req)).then (results) =>
				@response('post', req, res, results, 201).send()
			, (error) =>
				console.error error
				@response('post:error', req, res, error.message, error.code).send()
		app.put @path + '/:id', @middleware.put, (req, res) =>
			Q(@put(req)).then (results) =>
				@response('put', req, res, results, 200).send()
			, (error) =>
				console.log 'put error'
				@response('put:error', req, res, error.message, error.code).send()
		app.delete @path + '/:id', @middleware.delete, (req, res) =>
			Q(@delete(req)).then (results) =>
				@response('delete', req, res, results, 200).send()
			, (error) =>
				@response('delete:error', req, res, error.message, error.code).send()

		

module.exports = Endpoint
