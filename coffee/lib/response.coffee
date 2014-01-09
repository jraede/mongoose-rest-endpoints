hooks = require 'hooks'
class Response
	constructor:(type, req, res, data, code) ->
		@req = req
		@type = type
		@res = res
		@data = data
		@code = code
	send:->
		if @data
			@res.send(@data, @code)
		else if @code
			@res.send(@code, @data)
		else
			@res.send(null)
			
for k,f of hooks
	Response[k] = hooks[k]

module.exports = Response