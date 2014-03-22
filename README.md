[![Build Status](https://travis-ci.org/jraede/mongoose-rest-endpoints.png?branch=master)](https://travis-ci.org/jraede/mongoose-rest-endpoints)

mongoose-rest-endpoints
=======================

Easy REST api endpoint creation for express and mongoose documents

## What is this?

There are obviously a bunch of packages available on NPM that let you set up REST endpoints for Mongoose documents. The problem with these is that they start by opening up *everything* to the client, and you are expected to *close* areas that need more security. The potential for missing something in this is pretty high, especially if you have a complex application. This package, by contract, *closes* everything to the client by default, and you are expected to *open* each specific endpoint beyond its basic functionality, meaning you get complete control over what happens with and who can access your data.

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

