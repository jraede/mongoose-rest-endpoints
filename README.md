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
* *BULKPOST* - creates multiple new documents
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
* `$regex_` - Value matches a regular expression
* `$regexi_` - Value matches a case-insensitve regular expression

#### Update in version 3.6.0
You can now use a * to match parts of query variables. E.g. "objectField.*" will allow any query param starting with "objectField.".

Also, you can use "$exists" as a value to check if the field exists on the document (`{$exists:true}`)

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

### Bulk posting
Bulk posting is disabled by default. To allow it, run `allowBulkPost()` on your endpoint before registering. The response code for a bulk post will be a 201 if ALL saves were successful, with no response body. Otherwise if some failed and some were successful, the code will be a 207. Or if everything failed, the response code will be the error code for the first error. For these two "error" instances, the response body will be an array of the results of each promise, structured like so:

`[
  {state:'fulfilled',value:undefined}, // No response, so it will be undefined. You only care about the state
  {state:'rejected', reason:{}} // The reason will be the error thrown
]`

You can use this response to show which requests failed and which succeeded in the bulk request (the order of the returned values will be the same order that they came in).

### Pagination
By default, endpoints paginate results at 50 per page, ordered by the `_id` field. Note that this is the opposite of the `2.*` API, which did *not* paginate results unless you told it to.

To set the pagination defaults to something else, call the `paginate` method:

```javascript
endpoint.paginate(resultsPerPage, sortField, sortDirection)
```

Defaults are overridden by query variables.

With pagination, the paginated data will be returned at the root-level, the same as unpaginated requests. You can access the total number of records via a line in the response header - `Record-Count`.
		
### Middleware

Then you can register middleware functions using `addMiddleware(METHOD, FUNCTION(S)`, passing either a single function or an array of functions.

Methods are:

* 'fetch'
* 'list'
* 'post'
* 'bulkpost'
* 'put'
* 'delete'

You can also use `'all`' for all methods, `'write'` for `'post', 'put','delete','bulkpost'` methods, and `'read'` for `'fetch','list'` methods.

### Registering Endpoints

Finally, register it to your express app, which will set up the URL routes used to access your endpoint.

Default endpoint URLs are:

* POST: {BASE_URL}
* BULKPOST: {BASE_URL}/bulk
* PUT: {BASE_URL}/{_ID}
* GET (single): {BASE_URL}/{_ID}
* GET (list): {BASE_URL}
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
Used in FETCH/LIST requests to modify query parameters being passed to Mongo (runs after the query parameters are parsed and put into the filter). Also used in PUT and DELETE requests to modify the query used to retrieve the document.

```javascript
endpoint.tap('pre_filter', 'list', function(req, query, next) {
  query.newVal = 'foo';
  next(query);
});
```
Mongo query will be `db.{collection}.find({newVal:'foo'});`


##### `pre_save`
This is used only in POST, BULKPOST, and PUT requests. Similar to `pre_filter`, but object passed through is the document before it is saved.

##### `post_retrieve`
Only runs in PUT and DELETE requests. Runs after the document is retrieved but before it is modified - useful for requiring a certain relationship between logged-in user and document (e.g. make sure the user is an administrator or "owns" the object). If you want to do a `pre_save` tap on a PUT request, use this instead.

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
