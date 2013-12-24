hooks = require 'hooks'
class Response
	constructor:(type, res, data, code) ->
		@type = type
		@res = res
		@data = data
		@code = code
	send:->
		if @data
			@res.send(@data, @code)
		else if @code
			@res.send(@code)
		else
			@res.send(null)
			
for k,f of hooks
	Response[k] = hooks[k]

module.exports = Response