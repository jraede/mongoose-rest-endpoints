Q = require('q')
_ = require('underscore')
httperror = require('./httperror')
log = require('./log')
moment = require('moment')
minimatch = require('minimatch')

validMongoId = (id) ->
	return id.match(/^[0-9a-fA-F]{24}$/)
module.exports = class Request
	constructor:(@$endpoint, modelClass = null) ->
		if !modelClass
			modelClass = @$endpoint.$modelClass

		@$modelClass = modelClass


	$runHook:(hook, method, args, mod) ->
		log 'Running hook on ' + hook.green + '::' + method.green
		deferred = Q.defer()
		runFunction = (f, next, a, data) ->
			log hook.green + '::' + method.green + ' - ', 'Data is now:', data
			if data instanceof Error
				return deferred.reject(data)
			try 
				# Now you MUST call next explicitly regardless of whether it is sychronous or not. To
				# avoid confusion with coffee script implicitly returning last value
				_.bind(f, @, a, data, next)()

			catch err
				deferred.reject(err)

		taps = @$endpoint.$taps
		if !taps[hook]?
			log 'No taps on hook'
			deferred.resolve(mod)
		else if !taps[hook][method]?
			log 'No taps on hook/method combo.'
			deferred.resolve(mod)
		else
			funcs = taps[hook][method]

			
			next = (final) ->
				log hook.green + '::' + method.green + ' - ', 'running final method', final
				if final instanceof Error
					deferred.reject(final)
				else
					deferred.resolve(final)

			# Run them in order. But we need to reverse them to accommodate the callbacks
			funcs = _.clone(funcs).reverse()
			for func in funcs

				next = _.bind(runFunction, @, func, next, args)
			
			next(mod)

		return deferred.promise

	$populateQuery:(query) ->
		if @$endpoint.options.populate? and @$endpoint.options.populate.length
			for pop in @$endpoint.options.populate
				if _.isArray(pop)
					query.populate(pop[0], pop[1])
				else
					query.populate(pop)

	$populateDocument:(doc) ->
		deferred = Q.defer()
		populatePath = (path, doc) ->
			return Q.ninvoke(doc.populate, path)

		promises = []
		for pop in @$endpoint.options.populate
			promises.push(populatePath(pop, doc))

		Q.all(promises).then ->
			deferred.resolve(doc)
		.fail(deferred.reject).done()

		return deferred.promise


	$getPaginationConfig:(req) ->
		data = req.query

		result = 
			perPage:data.perPage
			page:data.page
			sortField:data.sortField
			sortDirection:data.sortDirection
		result.page = parseInt(data.page)
		if !result.page? or isNaN(result.page) or result.page < 1
			result.page = 1
		if !result.perPage?
			result.perPage = @$endpoint.options.pagination.perPage
		if !result.sortField?
			result.sortField = @$endpoint.options.pagination.sortField
		if !result.sortDirection?
			result.sortDirection = @$endpoint.options.pagination.sortDirection

		return result
	fetch:(req, res) ->
		id = req.params.id

		log 'Running ' + 'FETCH'.bold
		if !id
			log 'ERROR:'.red, 'ID not provided in URL parameters'

			return @$runHook('pre_response_error', 'fetch', req, httperror.forge('ID not provided', 400)).then (err) ->
				return res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				return res.status(500).send()
			.done()

		else if !validMongoId(id)
			log 'ERROR:'.red, 'ID not in Mongo format'
			return @$runHook('pre_response_error', 'fetch', req, httperror.forge('Bad ID', 400)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				return res.status(500).send()
			.done()

		# Filter data
		@$runHook('pre_filter', 'fetch', req, {}).then (filter) =>
			filter._id = id
			query = @$modelClass.findOne(filter)
			@$populateQuery(query)
			return query.exec()
		.then (model) =>
			if !model
				log 'ERROR:'.red, 'Object not found'
				return @$runHook('pre_response_error', 'fetch', req, httperror.forge('Could not find document', 404)).then (err) ->
					res.status(err.code).send(err.message)
				.fail (err) ->
					console.log err.stack
					return res.status(500).send()
				.done()

			return @$runHook('post_retrieve', 'fetch', req, model).then (model) =>
				return @$runHook('pre_response', 'fetch', req, model.toObject())
			.then (response) ->
				res.status(200).send(response)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()
		.fail (err) =>
			log 'ERROR:'.red, 'Error running pre_filter hook: ', err.message
			@$runHook('pre_response_error', 'fetch', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()
		.done()


	list:(req, res) ->
		log 'Running ' + 'LIST'.bold

		applyPagination = (query, filter) =>
			deferred = Q.defer()
			if @$endpoint.options.pagination
				log 'Paginating'

				if @$endpoint.options.pagination.ignoreCount
					config = @$getPaginationConfig(req)
				
					if config.sortDirection is -1
						config.sortField = '-' + config.sortField
					# sorting =
					# 	config.sortField: config.sortDirection
					query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage)
					deferred.resolve(query)
				else
					
					@$modelClass.countQ(filter)
					.then (count) =>
						res.set('Time-PostCount', (new Date()).toISOString())
						log 'There are ' + count.toString().yellow + ' total documents that fit filter'
						res.setHeader('Record-Count', count.toString())

						config = @$getPaginationConfig(req)
						if config.sortDirection is -1
							config.sortField = '-' + config.sortField
						query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage)
						deferred.resolve(query)
					.fail(deferred.reject).done()
			else
				deferred.resolve(query)

			return deferred.promise

		@$runHook('pre_filter', 'list', req, {}).then (filter) =>
			query = @$modelClass.find(filter)
			@$populateQuery(query)
			# Handle pagination
			return applyPagination(query, filter)
		.then (query) =>
			if @$endpoint.options.limitFields?
				query.select(@$endpoint.options.limitFields.join(' '))
			return query.exec()
		.then (response) =>
			return @$runHook('post_retrieve', 'list', req, response)
		.then (response) =>
			final = []
			for f in response
				final.push(f.toObject())

			return @$runHook('pre_response', 'list', req, final)
		.then (response) ->
			res.status(200).send(response)
		.fail (err) =>
			console.log err.stack
			@$runHook('pre_response_error', 'list', req, httperror.forge(err.message, if err.code? then err.code else 500))
			.then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()
		.done()



	post:(req, res) ->
		log 'Running ' + 'POST'.bold

		model = new @$modelClass(req.body)

		@$runHook('pre_save', 'post', req, model).then (model) =>

			return model.saveQ()
		.then (model) =>
			log('Finished save. Populating')
			return @$populateDocument(model)
		.then (model) =>
			return @$runHook('pre_response', 'post', req, model.toObject())
		.then (response) ->
			res.status(201).send(response)
		.fail (err) =>
			console.log err.stack
			@$runHook('pre_resposne_error', 'post', req, httperror.forge(err.message, if err.code? then err.code else 500))
			.then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()
		.done()


	$doSingleBulkPost:(obj, req) ->
		deferred = Q.defer()
		model = new @$modelClass(obj)
		@$runHook('pre_save', 'bulkpost', req, model).then (data) =>
			return model.saveQ()
		.then (model) =>
			deferred.resolve()
		.fail (err) =>
			@$runHook('pre_response_error', 'bulkpost', req, httperror.forge(err, if err.code? then err.code else 400)).then (err) ->
				deferred.reject(err)
			.fail(deferred.reject).done()
		.done()

		return deferred.promise
	bulkpost:(req, res) ->
		log 'Running ' + 'BULKPOST'.bold

		if !_.isArray(req.body)
			log 'ERROR:'.red, 'Request body not array'
			return @$runHook('pre_response_error', 'bulkpost', req, httperror.forge('Request body is not an array', 400)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()


		promises = []

		for obj in req.body
			promises.push(@$doSingleBulkPost(obj, req))

		resolvedCount = 0
		rejectedCount = 0
		Q.allSettled(promises).then (results) =>
			
			for result in results
				if result.state is 'fulfilled'
					resolvedCount++
				else
					rejectedCount++


			return @$runHook('pre_response', 'bulkpost', req, results)
		.then (results) ->

			if resolvedCount and !rejectedCount
				res.status(201)
			else if !resolvedCount 
				res.status(results[0].reason.code)
			else
				res.status(207)

			res.send(results)
		.fail (err) =>
			console.log err.stack
			res.status(500).send()
		.done()

	put:(req, res) ->
		id = req.params.id

		log 'Running ' + 'PUT'.bold
		if !id
			log 'ERROR:'.red, 'ID not provided in URL parameters'

			return @$runHook('pre_response_error', 'fetch', req, httperror.forge('ID not provided', 400)).then (err) ->
				return res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				return res.status(500).send()
			.done()

		else if !validMongoId(id)
			log 'ERROR:'.red, 'ID not in Mongo format'
			return @$runHook('pre_response_error', 'fetch', req, httperror.forge('Bad ID', 400)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				return res.status(500).send()
			.done()

		# Fetch pre filter runs here in case they want to prevent fetching based on some parameter. Same would apply for this and DELETE
		@$runHook('pre_filter', 'fetch', req, {}).then (filter) =>
			filter._id = id
			query = @$modelClass.findOne(filter)

			@$populateQuery(query)
			return query.exec()
		.then (model) =>
			if !model
				log 'ERROR:'.red, 'No model found (404)'
				return @$runHook('pre_response_error', 'put', req, httperror.forge('Not found', 404))
				.then (err) ->
					res.status(err.code).send(err.message)
				.fail (err) ->
					res.status(500).send()
				.done()

			return @$runHook('post_retrieve', 'put', req, model).then (model) =>
				delete req.body._id
				model.set(req.body)
				return @$runHook('pre_save', 'put', req, model).then (model) =>
			.then =>
				return model.saveQ()
			.then (model) =>
				return @$populateDocument(model)
			.then (model) =>
				return @$runHook('pre_response', 'put', req, model.toObject())
			.then (response) ->
				res.status(200).send(response)
			.fail (err) =>
				console.log err.stack
				@$runHook('pre_response_error', 'put', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
					res.status(err.code).send(err.message)
				.fail (err) ->
					console.log err.stack
					res.status(500).send()
				.done()
			.done()
		.fail (err) =>
			console.log err.stack
			@$runHook('pre_response_error', 'put', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()
		.done()

	delete:(req, res) ->
		id = req.params.id

		log 'Running ' + 'DELETE'.bold
		if !id
			log 'ERROR:'.red, 'ID not provided in URL parameters'

			return @$runHook('pre_response_error', 'fetch', req, httperror.forge('ID not provided', 400)).then (err) ->
				return res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				return res.status(500).send()
			.done()

		else if !validMongoId(id)
			log 'ERROR:'.red, 'ID not in Mongo format'
			return @$runHook('pre_response_error', 'fetch', req, httperror.forge('Bad ID', 400)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				return res.status(500).send()
			.done()

		# Fetch pre filter runs here in case they want to prevent fetching based on some parameter. Same would apply for this and DELETE
		@$runHook('pre_filter', 'fetch', req, {}).then (filter) =>
			filter._id = id
			query = @$modelClass.findOne(filter)

			@$populateQuery(query)
			return query.exec()
		.then (model) =>
			if !model
				log 'ERROR:'.red, 'No model found (404)'
				return @$runHook('pre_response_error', 'put', req, httperror.forge('Not found', 404))
				.then (err) ->
					res.status(err.code).send(err.message)
				.fail (err) ->
					console.log err.stack
					res.status(500).send()
				.done()
			@$runHook('post_retrieve', 'delete', req, model).then (model) =>
				return model.removeQ()
			.then =>
				res.status(200).send()
			.fail (err) =>
				@$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
					res.status(err.code).send(err.message)
				.fail (err) ->
					console.log err.stack
					res.status(500).send()
				.done()
			.done()
		.fail (err) =>
			@$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
				res.status(err.code).send(err.message)
			.fail (err) ->
				console.log err.stack
				res.status(500).send()
			.done()
		.done()









