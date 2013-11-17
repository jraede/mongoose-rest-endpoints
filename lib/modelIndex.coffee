mongoose = require('mongoose')

module.exports = class ModelIndex
	@cache:{}
	@fetch:(name, schema) ->
		if !@cache[name]
			@cache[name] = mongoose.model(name, schema)



		return @cache[name]