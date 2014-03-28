Q = require 'q'
_ = require 'underscore'
httperror = require './httperror'
module.exports = class Request
	constructor:(endpoint, modelClass = null) ->

		if !modelClass
			modelClass = endpoint.$modelClass

		@$$modelClass = modelClass

		@$$endpoint = endpoint

	###
	PRIVATE METHODS
	###
	$$runHook:(hook, method, args, mod) ->
		deferred = Q.defer()
		runFunction = (f, next, args, data) ->
			if data instanceof Error
				return deferred.reject(data)
			try 
				# Now you MUST call next explicitly regardless of whether it is sychronous or not. To
				# avoid confusion with coffee script implicitly returning last value
				_.bind(f, @, args, data, next)()

			catch err
				deferred.reject(err)

		taps = @$$endpoint.$taps
		if !taps[hook]?
			deferred.resolve(mod)
		else if !taps[hook][method]?
			deferred.resolve(mod)
		else
			funcs = taps[hook][method]

			
			next = (final) ->
				if final instanceof Error
					deferred.reject(final)
				else
					deferred.resolve(final)

			# Run them in order. But we need to reverse them to accommodate the callbacks
			funcs = funcs.reverse()
			for func in funcs

				next = _.bind(runFunction, @, func, next, args)
			
			next(mod)

		return deferred.promise

	$$populateQuery:(query) ->
		if @$$endpoint.options.populate? and @$$endpoint.options.populate.length
			for pop in @$$endpoint.options.populate
				query.populate(pop)
	$$populateDocument:(doc) ->

		populatePath = (path, doc) ->
			d = Q.defer()
			doc.populate path, (err, doc) ->
				d.resolve()

		promises = []
		for pop in @$$endpoint.options.populate
			promises.push(populatePath(pop, doc))

		return Q.all(promises)

	$fetch:(req, res) ->
		deferred = Q.defer()
		id = req.params.id


		if !id
			err = httperror.forge('ID not provided', 400)
			@$$runHook('pre_response_error', 'fetch', req, err).then (err) ->
				res.send(err.message, err.code)
			, (err) ->
				deferred.reject(err)

		else if !id.match(/^[0-9a-fA-F]{24}$/)
			err = httperror.forge('Bad ID', 400)
			@$$runHook('pre_response_error', 'fetch', req, err).then (err) ->
				res.send(err.message, err.code)
			, (err) ->
				deferred.reject(err)


		else
			# Filter the data

			@$$runHook('pre_filter', 'fetch', req, {}).then (filter) =>

				filter._id = id
				query = @$$modelClass.findOne(filter)

				# Populate
				@$$populateQuery(query)
				query.exec (err, model) =>
					if err
						@$$runHook('pre_response_error', 'fetch', req, httperror.forge(err.message, 500)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					if !model
						@$$runHook('pre_response_error', 'fetch', req, httperror.forge('Could not find document', 404)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
	
					else
						@$$runHook('pre_response', 'fetch', req, model.toObject()).then (response) =>
							deferred.resolve(response)
						, (err) ->
							deferred.reject(err)
			, (err) =>
				@$$runHook('pre_response_error', 'fetch', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
					deferred.reject(err)
				, (err) ->
					deferred.reject(err)


		return deferred.promise


	$list:(req, res) ->
		deferred = Q.defer()

		@$$runHook('pre_filter', 'list', req, {}).then (filter) =>
			query = @$$modelClass.find(filter)

			# Populate
			@$$populateQuery(query)

			if @$$endpoint.options.pagination
				# Get total
				# 
				@$$modelClass.count filter, (err, count) =>
					if err
						@$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					else
						res.setHeader('Record-Count', count.toString())


						config = @$$getPaginationConfig(req)
						query.sort(config.sortField).skip((config.page - 1) * config.perPage).limit(config.perPage).exec (err, collection) =>


							if err
								@$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then (err) ->
									deferred.reject(err)
								, (err) ->
									deferred.reject(err)
								deferred.reject(httperror.forge('Could not retrieve collection', 500))
							else
								final = []
								for f in collection
									final.push(f.toObject())
								@$$runHook('pre_response', 'list', req, final).then (response) ->
									deferred.resolve(response)
								, (err) ->
									deferred.reject(err)

			else

				query.exec (err, collection) =>
					if err
						@$$runHook('pre_response_error', 'list', req, httperror.forge('Could not retrieve collection', 500)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
						deferred.reject(httperror.forge('Could not retrieve collection', 500))
					else
						final = []
						for f in collection
							final.push(f.toObject())
						@$$runHook('pre_response', 'list', req, final).then (response) ->
							deferred.resolve(response)
						, (err) ->
							deferred.reject(err)
		, (err) =>
			@$$runHook('pre_response_error', 'list', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
				deferred.reject(err)
			, (err) ->
				deferred.reject(err)
		return deferred.promise



	$post:(req, res) ->
		deferred = Q.defer()

		@$$runHook('pre_filter', 'post', req, req.body).then (data) =>
			model = new @$$modelClass(data)
			if @$$endpoint.options.cascade?
				model.cascadeSave (err, model) =>
					if err
						@$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					else
						@$$populateDocument(model).then =>
							@$$runHook('pre_response', 'post', req, model.toObject()).then (response) ->
								deferred.resolve(response)
							, (err) ->
								deferred.reject(err)
				, 
					limit:@$$endpoint.options.cascade.allowedRelations
					filter:@$$endpoint.options.cascade.filter
			else
				model.save (err, model) =>
					# Populate
					if err
						@$$runHook('pre_response_error', 'post', req, httperror.forge(err, 400)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					else
						@$$populateDocument(model).then =>
							@$$runHook('pre_response', 'post', req, model.toObject()).then (response) ->
								deferred.resolve(response)
							, (err) ->
								deferred.reject(err)
		, (err) =>
			@$$runHook('pre_response_error', 'post', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
				deferred.reject(err)
			, (err) ->
				deferred.reject(err)
					
		return deferred.promise

	$put:(req, res) ->
		deferred = Q.defer()


		id = req.params.id
		if !id.match(/^[0-9a-fA-F]{24}$/)
			@$$runHook('pre_response_error', 'put', req, httperror.forge('Bad ID', 400)).then (err) ->
				deferred.reject(err)
			, (err) ->
				deferred.reject(err)
		else
			# The fetch pre filter runs here in case they want to prevent fetching based on
			# some parameter. Same would apply for this (and delete)
			@$$runHook('pre_filter', 'fetch', req, {}).then (filter) =>

				filter._id = id

				query = @$$modelClass.findOne(filter)

				@$$populateQuery(query)
				query.exec (err, model) =>
					if err
						@$$runHook('pre_response_error', 'put', req, httperror.forge('Server error', 500)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					if !model
						@$$runHook('pre_response_error', 'put', req, httperror.forge('Not found', 404)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)

					else
						# Post retrieve hook

						@$$runHook('post_retrieve', 'put', req, model).then (model) =>
							# Now parse the data
							# 
							data = req.body
							delete data._id
							delete data.__v
							@$$runHook('pre_filter', 'put', req, data).then (data) =>
								model.set(data)

								if @$$endpoint.options.cascade?
									model.cascadeSave (err, model) =>
										if err
											@$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, 400)).then (err) ->
												deferred.reject(err)
											, (err) ->
												deferred.reject(err)
										else
											@$$populateDocument(model).then =>
												@$$runHook('pre_response', 'put', req, model.toObject()).then (response) ->
													deferred.resolve(response)
												, (err) ->
													deferred.reject(err)
									, 
										limit:@$$endpoint.options.cascade.allowedRelations
										filter:@$$endpoint.options.cascade.filter
								else
									model.save (err, model) =>
										# Populate
										if err
											@$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, 400)).then (err) ->
												deferred.reject(err)
											, (err) ->
												deferred.reject(err)
										else
											@$$populateDocument(model).then =>
												@$$runHook('pre_response', 'put', req, model.toObject()).then (response) ->
													deferred.resolve(response)
												, (err) ->
													deferred.reject(err)
						, (err) =>
							@$$runHook('pre_response_error', 'put', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
								deferred.reject(err)
							, (err) ->
								deferred.reject(err)
			, (err) =>
				@$$runHook('pre_response_error', 'put', req, httperror.forge('Server error', 500)).then (err) ->
					deferred.reject(err)
				, (err) ->
					deferred.reject(err)

					
		return deferred.promise

	$delete:(req, res) ->
		deferred = Q.defer()


		id = req.params.id
		if !id.match(/^[0-9a-fA-F]{24}$/)
			@$$runHook('pre_response_error', 'delete', req, httperror.forge('Bad ID', 400)).then (err) ->
				deferred.reject(err)
			, (err) ->
				deferred.reject(err)

		else

			# The fetch pre filter runs here in case they want to prevent fetching based on
			# some parameter. Same would apply for this (and delete)
			@$$runHook('pre_filter', 'fetch', req, {}).then (filter) =>
				filter._id = id
				query = @$$modelClass.findOne(filter)

				@$$populateQuery(query)
				query.exec (err, model) =>
					if err
						@$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					if !model
						@$$runHook('pre_response_error', 'delete', req, httperror.forge('Not found', 404)).then (err) =>
							deferred.reject(err)
						, (err) ->
							deferred.reject(err)
					else

						# Post retrieve hook
						@$$runHook('post_retrieve', 'delete', req, model).then (model) =>
							model.remove (err) =>
								if err
									@$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, 500)).then (err) ->
										deferred.reject(err)
									, (err) ->
										deferred.reject(err)

								else
									deferred.resolve()

						, (err) =>
							@$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
								deferred.reject(err)
							, (err) ->
								deferred.reject(err)
			, (err) =>
				@$$runHook('pre_response_error', 'delete', req, httperror.forge(err.message, if err.code? then err.code else 500)).then (err) ->
					deferred.reject(err)
				, (err) ->
					deferred.reject(err)


					
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
			result.perPage = @$$endpoint.options.pagination.perPage
		if !result.sortField?
			result.sortField = @$$endpoint.options.pagination.sortField

		return result

	
	
