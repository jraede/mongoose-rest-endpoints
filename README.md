[![Build Status](https://travis-ci.org/jraede/mongoose-rest-endpoints.png?branch=master)](https://travis-ci.org/jraede/mongoose-rest-endpoints)

mongoose-rest-endpoints
=======================

Easy REST api endpoint creation for express and mongoose documents

## What is this?

There are obviously a bunch of packages available on NPM that let you set up REST endpoints for Mongoose documents. The problem with these is that they start by opening up *everything* to the client, and you are expected to *close* areas that need more security. The potential for missing something in this is pretty high, especially if you have a complex application. This package, by contrast, *closes* everything to the client by default, and you are expected to *open* each specific endpoint beyond its basic functionality, meaning you get complete control over what happens with and who can access your data.

## Installation

`npm install --save mongoose-rest-endpoints`

## Basics

Each endpoint has 5 different request types:

* *FETCH* - retrieves a single document based on ID
* *LIST* - retrieves a list of documents that match a query
* *POST* - creates a new document
* *PUT* - updates an existing document, based on ID
* *DELETE* - deletes an existing document, based on ID


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
  

new mongooseRestEndpoints.endpoint('/api/pages', 'Page').register(app);
```

So, you'll need to first define a Mongoose schema and register it to a document collection. Then you can register the endpoint, passing arguments for the `base url`, the `mongoose document prototype`, optionally configure it, then register it to the Express app.

## Configuration
### Query Params
```javascript
endpoint.allowQueryParam([] || '')
```

This defines which parameters from the query string are passed through as filters for the returned data in a *LIST* request. If the variables in here match a path on your document schema, then they are used as `$match`. Alternatively you can prepend one of the following to the path, to do comparisons: 
* `$lt_` - Less than
* `$lte_` - Less than or equal to
* `$gt_` - Greater than
* `$gte_` - Greater than or equal to
* `$in_` - Value is contained in given array
* `$ne_` - Value is not equal to provided value.

#### Example:

```javascript
endpoint.allowQueryParam(['author', '$in_categories', '$gte_date_posted'])
```

### Populate Related Documents
```javascript
endpoint.populate([] || '')
```

This takes a `String` or `Array` of `String`s which represent which fields to populate on the main document (using Mongoose's native population). Documents are populated with this list on all requests (except *DELETE*, obviously).

#### Example:
```javascript
new mongooseRestEndpoints.endpoint('/api/pages', 'Page', {
	populate:['_author']
}).register(app);
```

### Enable Cascading Relations
```javascript
endpoint.cascade([], function(data,path){});
```

This package is meant to work in tandem with my Mongoose plugin [Cascading Relations](https://github.com/jraede/cascading-relations). To enable this feature, just run the `cascade` method on the endpoint, passing an `Array` of allowed relation paths as the first argument, and optionally a filter function to run on every related document before it is saved. Related documents will be created or modified from the `_related` property of the data passed via *PUT* or *POST* requests, and will be populated on the same property in each response.

#### Example:

```javascript
endpoint.cascade(['_comments'], function(commentData, schemaPath) {
    commentData.ranThroughFilter = true;
    return commentData;
});
```

### Pagination
By default, endpoints paginate results at 50 per page, ordered by the `_id` field. Note that this is the opposite of the `2.*` API, which did *not* paginate results unless you told it to.

To set the pagination defaults to something else, call the `paginate` method:

```javascript
endpoint.paginate(resultsPerPage, sortField)
```

Defaults are overridden by query variables

```javascript
new mongooseRestEndpoints.endpoint('/api/pages', 'Page', {
	// Simply including this configuration will enable pagination
	pagination:{
		perPage:20,
		sortField:'title'
		
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

### Taps
Taps are a way to run code at various points in the request/response process of a particular endpoint. If you want to stop the request from going through, you must call the `next()` function with an error. Otherwise, call the `next()` function with the modified or unmodified data.

By default, failed taps send a `500` response code. If you want the system to issue a different status code, you can set a `code` parameter on the `Error` object. E.g.: 

```javascript
var error = new Error('You cannot do this!');
error.code = 403;
next(error);
```

All tap functions have the same general arguments: the original request object, the data going through the tap stack, and `next()` for passing the data to the next function in the stack.

#### Tap Hooks
There are X tap hooks in the stack:


##### `pre_filter`
In FETCH/LIST requests, used to modify query parameters being passed to Mongo (runs after the query parameters are parsed and put into the filter). In POST/PUT requestss, used to modify incoming data before it gets set on the document. Note that the `pre_filter::fetch` hook will run before fetching a document to be modified in a `PUT` request. 

```javascript
endpoint.tap('pre_filter', 'list', function(req, query, next) {
  query.newVal = 'foo';
  next(query);
});
```
Mongo query will be `db.{collection}.find({newVal:'foo'});`


##### `post_retrieve`
Only runs in PUT and DELETE requests. Runs after the document is retrieved but before it is modified - useful for requiring a certain relationship between logged-in user and document (e.g. make sure the user is an administrator or "owns" the object)

```javascript
endpoint.tap('post_retrieve', 'put', function(req, document, next) {
  if(document._owner != req.user._id) {
    var error = new Error('Unauthorized');
    error.code = 403;
    return next(error);
  }
  next(document);
});
```

##### `pre_response`
Used to manipulate data after it has been retrieved but before it is sent back to the client. This runs after the Mongoose document has been converted with `toJSON()`.

```javascript
endpoint.tap('pre_response', 'fetch', function(req, data, next) {
  if(req.user.role != 'administrator') {
    delete data['some_proprietary_field'];
  }
  return next(data);
});
```

##### `pre_response_error`
Used to manipulate an error response before it is sent back to the client.

```javascript
endpoint.tap('pre_response_error', 'post', function(req, error, next) {
  if(error.code && error.code == 403) {
    error.message = 'This is an alternate message for 403, which will replace the generic express "Forbidden"';
  }
  next(error);
});
```

## Logging
You can turn on `verbose` mode to see the internal logs of your endpoints:

`require('mongoose-rest-endpoints').log.verbose(true);`

All log lines are prefixed with `[MRE]`.

## Tracking
As of version 3.3, this package tracks the response time for requests to your endpoints. If you use Heroku, the start time will be the value of the `X-Request-Start` header, which is the time the request reached the Heroku router, rather than your actual Dyno. Otherwise the start time will be the current unix offset.

By default there is no tracking interface - you are expected to add your own, with a `track` method. To add a tracking interface:

```javascript
require('mongoose-rest-endpoints').tracker.interface = {
  /**
   * Params are:
   * `request` - The original express request object
   * `time` - The total time elapsed, in milliseconds
   * `url` - The absolute URL used in the request
   * `method` - The [MRE] method (fetch, list, post, put, delete)
   * `response` - {
   *    `code` - The response code
   *    `success` - Boolean, true response code was successful (200-level), false if not.
   *    `error` - If there was an error, the error object will be here
   * }

  track:function(params) {
    // Store in a log somewhere
  }
}
```

I am in the middle of writing a Keen IO driver for this tracking with an automated alert system, so I will post a link to it here when I finish. In the meantime it should not be too difficult to integrate with your own tracking solution.
