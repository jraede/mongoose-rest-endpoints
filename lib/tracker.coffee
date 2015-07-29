log = require('./log')
_ = require 'lodash'
module.exports =
	interface:null
	track:(params) ->
		if @interface
			if !@interface.track? or !(_.isFunction(@interface.track))
				log 'Cannot track - interface does not have a track method.'
				return
			else
				@interface.track(params)
		else
			log 'No tracking interface.'
