var net = require('net')
  , tls = require('tls')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , Client = require('./client').Client
  ;


function Server() {
  EventEmitter.call(this);
}
util.inherits(Server, EventEmitter);
exports.Server = Server;


Server.prototype.listen = function(arg1) {
  var server;
  if (arg1 instanceof Server) {
    server = arg1;
    server.on('client', this.emit.bind(this, 'client'));

  } else if (arg1 instanceof tls.Server) {
    server = arg1;
    server.on('secureConnection', this.onconnection.bind(this));

  } else if (arg1 instanceof net.Server) {
    server = arg1;
    server.on('connection', this.onconnection.bind(this));

  } else {
    server = net.createServer();
    server.listen.apply(server, arguments);

    server.on('connection', this.onconnection.bind(this));

  }

  this.server = server;

  server.on('listening', this.emit.bind(this, 'listening'));
  server.on('close', this.emit.bind(this, 'close'));
  server.on('error', this.emit.bind(this, 'error'));
};


Server.prototype.onconnection = function(socket) {
  var client = new Client();

  client.socket = socket;
  client.setup();

  this.emit('client', client);
};


Server.prototype.authorization = function(cb) {
  this.on('authorization', cb);
};


Server.prototype.close = function() {
  return this.server.close();
};


Server.prototype.address = function() {
  return this.server.address();
};


Object.defineProperty(Server.prototype, 'maxConnections', {
  get: function() {
    return this.server.maxConnections;
  },
  set: function(value) {
    this.server.maxConnections = value;
  }
});


Object.defineProperty(Server.prototype, 'connections', {
  get: function() {
    return this.server.connections;
  }
});
