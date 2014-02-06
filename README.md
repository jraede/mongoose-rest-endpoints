[![Build Status](https://travis-ci.org/jraede/mongoose-rest-endpoints.png?branch=master)](https://travis-ci.org/jraede/mongoose-rest-endpoints)

mongoose-rest-endpoints
=======================

Easy REST api endpoint creation for express and mongoose documents

## What is this?

There are obviously a bunch of packages available on NPM that let you set up REST endpoints for Mongoose documents. The problem with these, at least from what I've seen, is they basically let you search for anything you want using any Mongo modifier you want in the URL. Meaning, there is no built-in limitation support on the server side, which could lead to severe problems.

I built this with the intention of extending it for additional functionality when needed. It lets you define which fields to populate from, which fields to take from the query string, as well as apply custom middleware per HTTP verb, to give you full control over your data and how it is manipulated and retrieved by the browser or another consumer.

## Installation

`npm install --save mongoose-rest-endpoints`

## How to set up an endpoint

Setting up an endpoint is pretty straightforward. First, obviously, you ned to require in the module, and then you just create a new endpoint and register it to your Express app.

```javascript
// Assuming that app has been defined above and is the Express app, before starting the server.

var mongooseRestEndpoints = require('mongoose-rest-endpoints');

var mongoose = require('mongoose');

var pageSchema = new mongoose.Schema({
  title:String,
  timestamp:Date,
  _author:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'User'
  },
  body:String
});

pageModel = mongoose.model('Page', pageSchema);
  

new mongooseRestEndpoints.endpoint('/api/pages', 'Page', {
  queryVars:['title','$gte_timestamp','$lte_timestamp'],
  populate:['_author']
}).addMiddleware('post', myAuthorizationFunction()).register(app);
```

So, you'll need to first define a Mongoose schema and register it to a document collection. Then you can register the endpoint, passing arguments for the `base url`, the `mongoose document prototype`, and then configuration options (see below).

### Available Config Options
#### queryVars
This defines which query vars from the query string are passed through as filters for the returned data in a GET request. If the variables in here match a schema path on your model, then they are used as `$match`. Alternatively you can prepend one of the following to the schema path, to do comparisons: 
* `$lt_` - Less than
* `$lte_` - Less than or equal to
* `$gt_` - Greater than
* `$gte_` - Greater than or equal to
* `$in_` - Value is contained in given array
* `$ne_` - Value is not equal to provided value.

*Example*

```javascript
new mongooseRestEndpoints.endpoint('/api/posts', 'Post', {
	queryVars:['author', '$in_categories']
}).register(app);
```

#### populate
This is an `array` of related fields to populate using Mongoose's native population.

*Example*
```javascript
new mongooseRestEndpoints.endpoint('/api/pages', 'Page', {
	populate:['_author']
}).register(app);
```

#### ignore
This is an `array` that tells the system which fields to ignore (remove) when issuing the response for a `GET` request (either `single` or `list`).

Say you have a `User` in the database that looks like this:

```javascript
{
	_id:'123456',
	username:'robocop',
	password:'some hashed password here'
}
```

You can prevent the password from being included in responses:

```javascript
new mongooseRestEndpoints.endpoint('/api/users', 'User', {
	ignore:['password']
}).register(app);
```

#### pagination
By default, endpoints do *not* paginate results. It is up to you to configure this if you need it:

```javascript
new mongooseRestEndpoints.endpoint('/api/pages', 'Page', {
	// Simply including this configuration will enable pagination
	pagination:{
		defaults:{
			perPage:20,
			sortField:'title'
		}
	}
}).register(app);
```

With pagination, the paginated data will be returned at the root-level, the same as unpaginated requests. You can access the total number of records via a line in the response header - `Record-Count`.
		
### Middleware

Then you can register middleware functions using `addMiddleware(HTTPVERB, FUNCTION(S)`, passing either a single function or an array of functions.

Finally, register it to your express app, which will set up the URL routes used to access your endpoint.

Default endpoint URLs are:

* POST: {BASE_URL}
* PUT: {BASE_URL}/{_ID}
* GET (single): {BASE_URL}/{_ID}
* GET (list): {BASE_URL}/list
* DELETE: {BASE_URL}/{_ID}

If you want to add your own you can extend the base `endPoint` class and add your custom methods (and make sure you register them as well).

