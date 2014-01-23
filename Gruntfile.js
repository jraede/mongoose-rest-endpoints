
var f, semver;

semver = require('semver');
var f = require('util').format;
var fs = require('fs');

module.exports = function(grunt) {
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-sed');
	grunt.loadNpmTasks('grunt-contrib-coffee');
	grunt.initConfig({
		version: grunt.file.readJSON('package.json').version,
		watch: {
			coffee:{
				files:['coffee/**/*.coffee', 'coffee/*.coffee'],
				tasks:['coffee']
			}
		},
		exec:{
			test: {
				cmd:function(ex) {
					return f('NODE_ENV=test mocha %s', ex)
				}
			}
		},
		coffee: {
			source:{
				options:{
					preserve_dirs:true,
					bare:true
				},
				files:[
					{
						expand:true,
						flatten:false,
						cwd:'coffee',
						src:['*.coffee','**/*.coffee'],
						dest:'',
						ext:'.js'
					}
				]
			}
		}
	});

	grunt.registerTask('dropTestDb', function() {
		var mongoose = require('mongoose');
		var done = this.async();
		mongoose.connect('mongodb://localhost/mre_test')
		mongoose.connection.on('open', function () { 
			mongoose.connection.db.dropDatabase(function(err) {
				if(err) {
					console.log(err);
				} else {
					console.log('Successfully dropped db');
				}
				mongoose.connection.close(done);
			});
		});
	});

	grunt.registerTask('test', 'Run tests', function(type) {
		var tasks = []
		switch(type) {

			case 'all':
				var files = fs.readdirSync('test');
				var file;
				for(var i=0;i<files.length;i++) {
					file = files[i];
						tasks.push('exec:test:"test/' + file + '"')
						tasks.push('dropTestDb')
				}
				//tasks = ['exec:test:"test/unit/*.js"']
				break;
			default:
				tasks = ['dropTestDb', 'exec:test:"test/' + type + '.js"', 'dropTestDb']
				break;
		}
		grunt.task.run(tasks);
	});
};
