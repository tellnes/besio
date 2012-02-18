# Besio

Besio is a Node.js project that allows you to emit events and stream data over a TCP connection.

## How to Install

    npm install besio

## How to use

Require:

```js
var io = require('besio');
```

server.js

```js
var server = besio.createServer(function(client) {
  client.emit('hello', function() {
    console.log('Hello from client');
  });
});

server.listen(4746, function() {
  console.log('Server listening on port ' + this.address().port + ' and address ' + this.address().address);
});
```

client.js

```js
var client = besio.connect(4746);

socket.on('hello', function(cb) {
  console.log('Hello from server');
  cb(); // Send hello back to server
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
