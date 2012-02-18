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



exports.createServer = function(cb) {
  var server = new Server();
  if (cb) {
    server.on('connection', cb);
  }
  return server;
};


exports.connect = function() {
  var client = new Client();
  client.connect.apply(client, arguments);
  return client;
};


exports.secureConnect = function() {
  var client = new Client();
  client.secureConnect.apply(client, arguments);
  return client;
};
