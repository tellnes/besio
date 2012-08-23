[![build status](https://secure.travis-ci.org/tellnes/besio.png)](http://travis-ci.org/tellnes/besio)
# Besio

Besio is a Node.js project that allows you to emit events and stream data over a TCP connection.

## How to Install

    npm install besio

## How to use

Require:

```js
var besio = require('besio');
```

server.js

```js
var server = besio.createServer(function(client) {
  client.emit('hello', function(message) {
    console.log('Client says: ' + message); // Client says: Hello World
  });
});

server.listen(4746, function() {
  console.log('Server listening on port ' + this.address().port + ' and address ' + this.address().address);
});
```

client.js

```js
var client = besio.connect(4746);

client.on('hello', function(cb) {
  console.log('Hello from server');
  cb('Hello World'); // Send message to server
});
```

## Emit streams

server.js

```js
var server = besio.createServer(function(client) {
  client.on('stdin', function(stream) {
    stream.pipe(process.stdout);
  });
  client.on('stdout', function(stream) {
    process.stdin.resume();
    process.stdin.pipe(stream);
  });
});

server.listen(4746, function() {
  console.log('Server listening on port ' + this.address().port + ' and address ' + this.address().address);
});
```

client.js

```js
var client = besio.connect(4746);

process.stdin.resume();

client.emit('stdin', process.stdin);
client.emit('stdout', process.stdout);
```
