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

```
# Assuming that app has been defined above and is the Express app, before starting the server.

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
  

new mongooseRestEndpoint.endpoint('/api/pages', pageModel, {
  query_vars:['title','$gte_timestamp','$lte_timestamp'],
  populate:['_author']
}).addMiddleware('post', myAuthorizationFunction()).register(app);
```

So, you'll need to first define a Mongoose schema and register it to a document collection. Then you can register the endpoint, passing arguments for the `base url`, the `mongoose document prototype`, and then any additional data like `populate` (which object ID references to populate automatically) and `query_vars` which query variables to parse from the query string.

Then you can register middleware functions using `addMiddleware(VERB, FUNCTION(S)`, passing either a single function or an array of functions.

Finally, register it to your express app, which will set up the URL routes used to access your endpoint.

Default endpoint URLs are:

* POST: {BASE_URL}
* PUT: {BASE_URL}/{_ID}
* GET (single): {BASE_URL}/{_ID}
* GET (list): {BASE_URL}/list
* DELETE: {BASE_URL}/{_ID}

If you want to add your own you can extend the base `endPoint` class and add your custom methods (and make sure you register them as well).

