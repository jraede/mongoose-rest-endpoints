module.exports = class HttpError extends Error
	@forge:(msg, code) ->
		if @listeners[code]?
			for listener in @listeners[code]
				listener(msg)
		return new @(msg, null, null, code)
	constructor:(msg, fileName, lineNumber, code) ->
		@code = code

		super
	@listeners:{}
	@listen:(code, callback) ->
		if !@listeners[code]?
			@listeners[code] = []
		@listeners[code].push(callback)