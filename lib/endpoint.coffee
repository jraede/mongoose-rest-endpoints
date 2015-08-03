mongoose = require('mongoose-q')()
_ = require('underscore')
Q = require('q')
log = require('./log')
request = require('./request')
minimatch = require('minimatch')
module.exports = class Endpoint
	constructor:(@path, model, config) ->

		if _.isString(model)
			@$modelClass = mongoose.model(model)
		else
			@$modelClass = model


		# Initialize taps as an object per endpoint instance
		@$taps = {}

		# Initialize default options
		@options =
			queryParams:[]
			pagination:
				perPage:50
				sortField:'_id'
				sortDirection:1
			populate:[]


		if opts?
			@options = _.extend(@options, opts)


		# Initialize middleware
		@$middleware =
			fetch:[]
			list:[]
			post:[]
			put:[]
			bulkpost:[]
			delete:[]


		# Add the default query constructor filter to list taps
		@tap('pre_filter', 'list', @$constructFilterFromRequest)


	#########
	# Chain methods for setting configuration on the endpoint
	#########


	###
	 * Add field to populate options. These fields will be populated on every request except delete
	 *
	 * @param String field
	 * @return Endpoint for chaining
	###
	populate:(field, fields=null) ->

		
		if field instanceof Array
			for p in field
				@options.populate.push(p)
		else if fields
			@options.populate.push([field,fields])
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
	 * Fetch only specific fields in a list request
	 *
	 * @param Array of fields
	###
	limitFields:(fields) ->
		@options.limitFields = fields
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
		log 'Tapping onto: ', hook.green + '::' + method.green
		if method is '*'
			methods = ['fetch','list','create','update','delete']
		else
			methods = [method]

		if !@$taps[hook]
			@$taps[hook] = {}
		for method in methods
			if !@$taps[hook][method]
				@$taps[hook][method] = []
			@$taps[hook][method].push(func)

		untap = =>
			index = @$taps[hook][method].indexOf(func)
			@$taps[hook][method].splice(index, 1)

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
			if @options.allowBulkPost
				@addMiddleware('bulkpost', middleware)
		else if method is 'write'
			for m in ['post','put','delete']
				@addMiddleware(m, middleware)
			if @options.allowBulkPost
				@addMiddleware('bulkpost', middleware)
		else if method is 'read'
			for m in ['fetch', 'list']
				@addMiddleware(m, middleware)
		else
			if middleware instanceof Array
				for m in middleware
					@addMiddleware(method, m)
			else
				@$middleware[method].push(middleware)

		return @

	###
	 * Enable bulk post for this endpoint.
	###
	allowBulkPost:->
		@options.allowBulkPost = true
		return @


	###
	 * Set pagination
	 * @param {Number} perPage
	 * @param {String} sortField
	 * @return {self} for chaining
	###
	paginate:(perPage, sortField, sortDirection = 1) ->
		@options.pagination.perPage = perPage
		@options.pagination.sortField = sortField
		@options.pagination.sortDirection = sortDirection

		return @




	#########
	# Register endpoints
	#########

	register:(app) ->
		log 'Registering endpoints for path:', @path.green

		# FETCH
		app.get @path + '/:id', @$middleware.fetch, (req, res) =>


			log @path.green, 'request to ', 'FETCH'.bold

			new request(@).fetch(req, res)


		# LIST
		app.get @path, @$middleware.list, (req, res) =>
			log @path.green, 'request to ', 'LIST'.bold
			new request(@).list(req, res)

		# POST
		app.post @path, @$middleware.post, (req, res) =>
			log @path.green, 'request to ', 'POST'.bold
			new request(@).post(req, res)

		# BULK POST
		if @options.allowBulkPost
			app.post @path + '/bulk', @$middleware.bulkpost, (req, res) =>
				log @path.green, 'request to ', 'BULKPOST'.bold
				new request(@).bulkpost(req, res)

		# PUT
		app.put @path + '/:id', @$middleware.put, (req, res) =>
			log @path.green, 'request to ', 'PUT'.bold
			new request(@).put(req, res)

		# DELETE
		app.delete @path + '/:id', @$middleware.delete, (req, res) =>
			log @path.green, 'request to ', 'DELETE'.bold
			new request(@).delete(req, res)


	###
	 * Construct filter from query params according to options. This is a TAP function, bound to the REQUEST, hence the @$endpoint reference.
	###
	$constructFilterFromRequest:(req, data, next) ->
		addToFilter = (filter, prop, key, val) ->
			console.log 'Adding to filter:', prop, key, val
			if key is '$in' and !_.isArray(val)
				val = [val]
			if !filter[prop]?
				filter[prop] = {}
			filter[prop][key] = val


		filter = {}
		if @$endpoint.options
			for k,v of req.query
				if v and (_.isString(v) or _.isDate(v))
					for q in @$endpoint.options.queryParams
						# For wildcard matching
						if minimatch(k, q)
							if v is '$exists'
								v =
									$exists:true

							foundManipulatorMatch = false
							basicManipulators = ['$lt', '$lte', '$gt', '$gte', '$in', '$ne']
							for b in basicManipulators
								if k.substr(0, b.length + 1) is b + '_'

									addToFilter(filter, k.replace((b + '_'), ''), b, v)
									foundManipulatorMatch = true
							
							if !foundManipulatorMatch
								if k.substr(0,7) is '$regex_'
									addToFilter(filter, k.replace('$regex_', ''), '$regex', new RegExp(v))
								else if k.substr(0,8) is '$regexi_'
									addToFilter(filter, k.replace('$regexi_', ''), '$regex', new RegExp(v, 'i'))
								else
									filter[k] = v
		# Move on to the next tap
		next(filter)

