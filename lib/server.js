var net = require('net')
  , tls = require('tls')
  , http = require('http')
  , https = require('https')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , Client = require('./client').Client
  , winston = require('winston')
  ;


function Server() {
  EventEmitter.call(this);
  this.options =  { resource: '/besio'
                  , destroyUpgrade: true
                  , http: false
                  }
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


Server.prototype.listen = function() {
  var server = arguments[0]
    , secure = false
    , useHttpUpgrade = this.options.http
    , self = this
    , client

  if (server instanceof tls.Server) {
    secure = true
    useHttpUpgrade = (server instanceof https.Server)

  } else if (server instanceof net.Server) {
    useHttpUpgrade = (server instanceof http.Server)

  } else if (this.options.key && this.options.cert) {
    secure = true
    server = (useHttpUpgrade ? https : tls).createServer(this.options)
    server.listen.apply(server, arguments)

  } else {
    server = (useHttpUpgrade ? http : net).createServer()
    server.listen.apply(server, arguments)

  }


  client = new Client()
  client.server = this
  client.log = this.log


  if (useHttpUpgrade) {

    server.on('upgrade', function(req, socket, upgradeHead) {
      var resource = self.options.resource

      if (req.url.substr(0, resource.length) !== resource) {
        // Non-besio upgrade
        if (self.options.destroyUpgrade) {
          socket.end()
          self.log.debug('destroying non-besio upgrade')
        }
        return
      }


      socket.write( 'HTTP/1.1 101 Switching Protocols\r\n'
                  + 'Upgrade: Besio\r\n'
                  + 'Connection: Upgrade\r\n'
                  + '\r\n'
                  )

      client.onSocket(socket, upgradeHead)
    })

  } else {
    server.on(secure ? 'secureConnection' : 'connection', function(socket) {
      client.onSocket(socket)
    })
  }


  this.server = server

  server.on('listening', this.emit.bind(this, 'listening'))
  server.on('close', this.emit.bind(this, 'close'))
  server.on('error', this.emit.bind(this, 'error'))

  return this
}


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
