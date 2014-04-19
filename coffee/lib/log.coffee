_ = require 'underscore'
require 'colors'

verbose = false
log = ->
	if verbose
		args = _.values(arguments)
		args.unshift('[MRE]'.yellow.underline)
		return console.log.apply(@, args)
log.verbose = (v) ->
	verbose = v

module.exports = log