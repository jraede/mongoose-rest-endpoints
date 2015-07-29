module.exports = class HttpError
	constructor:(msg, code) ->
		@code = code
		@message = msg

	@forge:(msg, code) ->
		if @listeners[code]?
			listener(msg) for listener in @listeners[code]
		return new @(msg, code)

	@listeners:{}

	@listen:(code, callback) ->
		(@listeners[code] ?= []).push(callback)
