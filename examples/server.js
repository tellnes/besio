var besio = require('..');

var server = besio.createServer(function(client) {
  client.emit('hello', function(message) {
    console.log('Client says: ' + message); // Client says: Hello World
  });
});

server.listen(4746, function() {
  console.log('Server listening on port ' + this.address().port + ' and address ' + this.address().address);
});
