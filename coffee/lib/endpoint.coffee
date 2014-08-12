mongoose = require('mongoose')
Q = require('q')
httperror = require('./httperror')
_ = require('underscore')

dot = require 'dot-component'

request = require './request'

log = require('./log')

moment = require 'moment'

tracker = require './tracker'

hooks = require 'hooks'
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
		if typeof modelId is 'string'
			@$modelClass = mongoose.model(modelId)
		else 
			@$modelClass = modelId
		log "Creating endpoint at path: #{path}"
		@$taps = {}
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
			fetch:[@$$trackingMiddleware(@)]
			list:[@$$trackingMiddleware(@)]
			post:[@$$trackingMiddleware(@)]
			put:[@$$trackingMiddleware(@)]
			bulkpost:[@$$trackingMiddleware(@)]
			delete:[@$$trackingMiddleware(@)]


		# We want to tap into the list to use our default filtering function for req.query
		@tap('pre_filter', 'list', @$$constructFilterFromRequest)

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
		else
			if middleware instanceof Array
				for m in middleware
					@addMiddleware(method, m)
			else
				@$$middleware[method].push(middleware)

		return @


	###
	 * Enable bulk post for this endpoint.
	###
	allowBulkPost:->
		@options.allowBulkPost = true
		return @

	###
	 * Expose the verb handlers as methods so they can be used in HMVC
	 *
	###
	$fetch: (req, res) ->
		return new request(@).$fetch(req, res)

	$list: (req, res) ->
		return new request(@).$list(req, res)

	$post: (req, res) ->
		return new request(@).$post(req, res)

	$put: (req, res) ->
		return new request(@).$put(req, res)

	$delete: (req, res) ->
		return new request(@).$delete(req, res)

	$$trackingMiddleware:(endpoint) ->
		return (req,res,next) ->
			for k,v of hooks
				res[k] = hooks[k]

			path = endpoint.path
			if req.header('X-Request-Start')
				startTime = moment(parseInt(req.header('X-Request-Start')))
			else
				startTime = moment()


			# Replace the res.send method so we can track the elapsed time
			res.$mre =
				startTime:startTime

				# Requests will set this
				method:null
			# Every response in MRE has code,data arguments
			
			res.post 'end', (next, data) ->
				code = @statusCode
				elapsed = moment().diff(@$mre.startTime)
				tracker.track
					request:req
					time:elapsed
					endpoint:path
					url:req.originalUrl
					method:@$mre.method
					response:
						code:code
						success: if code >= 200 and code < 400 then true else false
						error:if code >= 400 and data? then data else null
				next()

			next()




	###
	 * Register the endpoints on an express app.
	 * 
	 * @param Express app
	###
	register: (app) ->
		log 'Registered endpoints for path:', @path.green

		# Fetch
		app.get @path + '/:id', @$$middleware.fetch, (req, res) =>
			res.$mre.method = 'fetch'
			log @path.green, 'request to ', 'FETCH'.bold
			new request(@).$fetch(req, res).then (response) ->

				log 'About to send.'
				res.send(200, response)
			, (err) ->
				if err.code
					res.send(err.code, err.message)
				else
					res.send(500)

		app.get @path, @$$middleware.list, (req, res) =>
			res.$mre.method = 'list'
			log @path.green, 'request to ', 'LIST'.bold
			new request(@).$list(req, res).then (response) ->

				res.send(200, response)
			, (err) ->
				if err.code
					res.send(err.code, err.message)
				else
					res.send(500)

		app.post @path, @$$middleware.post, (req, res) =>
			res.$mre.method = 'post'
			log @path.green, 'request to ', 'POST'.bold
			new request(@).$post(req, res).then (response) ->

				res.send(201, response)
			, (err) ->
				if err.code
					res.send(err.code, err.message)
				else
					res.send(500)

		# Bulk post
		if @options.allowBulkPost
			app.post @path + '/bulk', @$$middleware.bulkpost, (req, res) =>
				res.$mre.method = 'bulkpost'
				log @path.green, 'request to ', 'BULKPOST'.bold


				new request(@).$bulkpost(req, res).then (response) ->
					res.send(201, response)
				, (err) ->
					if err.code
						res.send(err.code, err)
					else
						res.send(500)

		app.put @path + '/:id', @$$middleware.put, (req, res) =>
			res.$mre.method = 'put'
			log @path.green, 'request to ', 'PUT'.bold
			new request(@).$put(req, res).then (response) ->

				res.send(200, response)
			, (err) ->
				if err.code
					res.send(err.code, err.message)
				else
					res.send(500)


		app.delete @path + '/:id',@$$middleware.delete, (req, res) =>
			res.$mre.method = 'delete'
			log @path.green, 'request to ', 'DELETE'.bold
			new request(@).$delete(req, res).then ->

				res.send(200)
			, (err) ->
				if err.code
						res.send(err.code, err.message)
				else
					res.send(500)

	# Taps run on the request and are bound to request. Hence the @$$endpoint
	$$constructFilterFromRequest:(req, data, next) ->
		addToFilter = (filter, prop, key, val) ->
			if key is '$in' and !(val instanceof Array)
				val = [val]
			if filter[prop]?
				filter[prop][key] = val
			else
				filter[prop] = {}
				filter[prop][key] = val
		filter = {}
		if @$$endpoint.options.queryParams
			for query_var in @$$endpoint.options.queryParams
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
					else if query_var.substr(0,7) is '$regex_'
						addToFilter(filter, query_var.replace('$regex_', ''), '$regex', new RegExp(req.query[query_var]))
					else if query_var.substr(0,8) is '$regexi_'
						addToFilter(filter, query_var.replace('$regexi_', ''), '$regex', new RegExp(req.query[query_var], 'i'))
					else
						filter[query_var]= req.query[query_var]
		next(filter)
	

	