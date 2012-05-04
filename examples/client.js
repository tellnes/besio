var besio = require('..');

var client = besio.connect(4746);

client.on('hello', function(cb) {
  console.log('Hello from server');
  cb('Hello World'); // Send message to server
});
