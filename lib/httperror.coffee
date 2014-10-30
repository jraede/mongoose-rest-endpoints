module.exports = class HttpError
	@forge:(msg, code) ->
		if @listeners[code]?
			for listener in @listeners[code]
				listener(msg)
		return new @(msg, code)
	constructor:(msg, code) ->
		@code = code
		@message = msg

	@listeners:{}
	@listen:(code, callback) ->
		if !@listeners[code]?
			@listeners[code] = []
		@listeners[code].push(callback)