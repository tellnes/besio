var Server = require('./server').Server
  , Client = require('./client').Client
  , streams = require('./streams')
  , binson = require('./binson')
  , Callback = require('./callbacks').Callback
  , packets = require('./packets')
  ;



exports.Server = Server;
exports.Client = Client;
exports.BesioStream = streams.BesioStream
exports.BufferStream = streams.BufferStream
exports.binson = binson;
exports.Callback = Callback;
exports.OutgoingPacket = packets.OutgoingPacket;
exports.IncomingPacket = packets.IncomingPacket;



exports.createServer = function(options, cb) {
  if (arguments.length == 1 && typeof options === 'function') {
    cb = options;
    options = {};
  }

  var server = new Server();

  server.setOptions(options);

  if (cb) {
    server.on('client', cb);
  }

  return server;
};


exports.connect = function() {
  var client = new Client();
  client.connect.apply(client, arguments);
  return client;
};
