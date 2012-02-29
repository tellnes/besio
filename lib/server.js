var net = require('net')
  , tls = require('tls')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , Client = require('./client').Client
  , winston = require('winston')
  ;


function Server() {
  EventEmitter.call(this);
  this.options = {};
}
util.inherits(Server, EventEmitter);
exports.Server = Server;


Server.prototype.log = winston;


Server.prototype.setOptions = function(options) {
  options = options || {};

  Object.keys(options).forEach(function(key) {
    this.options[key] = options[key];
  }, this);

};


Server.prototype.listen = function(arg1) {
  var server;
  if (arg1 instanceof Server) {
    server = arg1;
    server.on('client', this.emit.bind(this, 'client'));
    this.secure = server.secure;

  } else if (arg1 instanceof tls.Server) {
    server = arg1;
    server.on('secureConnection', this.onconnection.bind(this));
    this.secure = true;

  } else if (arg1 instanceof net.Server) {
    server = arg1;
    server.on('connection', this.onconnection.bind(this));
    this.secure = false;

  } else if (this.options.key && this.options.cert) {
    server = tls.createServer(this.options);
    server.listen.apply(server, arguments);

    server.on('secureConnection', this.onconnection.bind(this));
    this.secure = true;

  } else {
    server = net.createServer();
    server.listen.apply(server, arguments);

    server.on('connection', this.onconnection.bind(this));
    this.secure = false;

  }

  this.server = server;

  server.on('listening', this.emit.bind(this, 'listening'));
  server.on('close', this.emit.bind(this, 'close'));
  server.on('error', this.emit.bind(this, 'error'));
};


Server.prototype.onconnection = function(socket, encrypted) {
  this.log.debug('New connection');
  var client = new Client();

  client.server = this;
  client.socket = socket;
  client.log = this.log;

  if (this.secure) {
    client.encrypted = encrypted;
  }

  client.setup();
};


Server.prototype.authorization = function(fn) {
  this.auth = fn;
};


Server.prototype.authorize = function(data, cb) {
  if (this.auth) {
    this.auth(data, cb);
  } else {
    cb(null, true);
  }
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
