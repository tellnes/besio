var net = require('net')
  , tls = require('tls')
  , http = require('http')
  , https = require('https')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , packets = require('./packets')
  , IncomingPacket = packets.IncomingPacket
  , OutgoingPacket = packets.OutgoingPacket
  , Stream = require('stream').Stream
  , BesioStream = require('./streams').BesioStream
  , BufferStream = require('./streams').BufferStream
  , binson = require('./binson')
  , debug = require('debug')('besio:client')
  , weak = require('weak')


function toArray(arr) {
  return Array.prototype.slice.call(arr);
}


function initClient(self) {
  self.streams = {}

  self.callbacks = {}

  self.packetQueue = []

  self.authorized = false
  self.destroyed = false
  self.ended = false

  this.socket = null
}


function Client() {
  EventEmitter.call(this);

  initClient(this)
}
util.inherits(Client, EventEmitter);
exports.Client = Client;


Client.prototype.connect = function() {
  var self = this
    , options

  if (typeof arguments[0] === 'object') {
    options = arguments[0];
  } else if (typeof arguments[1] === 'object') {
    options = arguments[1];
    options.port = arguments[0];
  } else if (typeof arguments[2] === 'object') {
    options = arguments[2];
    options.port = arguments[0];
    options.host = arguments[1];
  } else {
    options = {}
    if (typeof arguments[0] === 'number') {
      options.port = arguments[0];
    }
    if (typeof arguments[1] === 'string') {
      options.host = arguments[1];
    }
  }

  if (this.socket) {
    this.emit('error', new Error('The client ned to be fully ended before you can reuse it'))
    return
  }

  if (this.destroyed) {
    initClient(this)
  }

  var secure = (options.key && options.cert)

  if (typeof arguments[arguments.length - 1] === 'function') {
    this.once('connect', arguments[arguments.length - 1]);
  }

  function onConnect() {
    if (self.ended) return self._end()

    debug('Connected, starting handshake')
    var data = [options.handshake]
      , packet = new OutgoingPacket(self, packets.TYPE_HANDSHAKE, binson.calculate(data))
    packet.writeBinson(data)
    self.sendPacket(packet)
  }


  if (options.http) {

    options.path = options.resource || '/besio'
    options.headers = { 'Connection': 'Upgrade'
                      , 'Upgrade': 'Besio'
                      }

    if (secure) {
      options.agent = new https.Agent(options)
    }

    ;(secure ? https : http)
    .request(options)
    .on('upgrade', function(res, socket, upgradeHead) {
      debug('Got upgrade')
      self.onSocket(socket, upgradeHead)
      onConnect()
    })
    .on('error', this.emit.bind(this, 'error'))
    .end()

  } else {
    this.onSocket((secure ? tls : net).connect(options, onConnect))
  }

};


Client.prototype.onAuthorized = function(info) {
  if (this.ended) return this._end()

  debug('Handshake authorized');
  this.authorized = true;

  this.packetQueue.forEach(this.sendPacket.bind(this))
  this.packetQueue.length = 0

  if (this.server) {
    this.server.emit('client', this, info[0]);
  }

  this.emit('connect', info[0]);


  this.heartbeatTimeoutValue = info[1] * 1000
  this.heartbeatIntervalValue = info[2] * 1000

  this.setHeartbeatTimeout()
  this.setHeartbeatInterval()
}


Client.prototype.setHeartbeatTimeout = function() {
  if (this.heartbeatTimeout) return

  debug('set heartbeat timeout')

  var client = this
  this.heartbeatTimeout = setTimeout(function() {
    debug('fired heartbeat timeout')
    client.end()
  }, this.heartbeatTimeoutValue)
}


Client.prototype.clearHeartbeatTimeout = function() {
  if (!this.heartbeatTimeout) return

  clearTimeout(this.heartbeatTimeout)
  this.heartbeatTimeout = null

  debug('cleared heartbeat timeout')
}


Client.prototype.setHeartbeatInterval = function() {
  var client = this

  client.heartbeatInterval = setTimeout(function() {
    if (!client.socket) return

    debug('sending heartbeat')

    var packet = new OutgoingPacket(client, packets.TYPE_HEARTBEAT, 0)
    client.sendPacket(packet)

    client.setHeartbeatInterval()
  }, client.heartbeatIntervalValue)

  debug('set heartbeat interval')
}


Client.prototype.handshakeData = function(data) {
  var hd =  { data: data
            , issued: new Date()
            , client: this
            , secure: !!this.socket.encrypted
            , socket: this.socket
            }

  return hd
}


Client.prototype.onSocket = function(socket, upgradeHead) {
  var self = this
    , bs = new BufferStream()

  this.socket = socket

  socket.pipe(bs)

  socket.setNoDelay(true)
  socket.setTimeout(0)
  socket.setKeepAlive(true)

  socket.on('close', function(had_error) {
    debug('Socket close event')
    self.$emit('close', had_error)
    self.destroy()
  })

  ;['end', 'timeout', 'drain', 'error'].forEach(function(name) {
    socket.on(name, function() {
      debug('Socket ' + name + ' event')
      var args = toArray(arguments)
      args.unshift(name)
      self.$emit.apply(self, args)
    })
  })

  bs.on('data', function(buffer) {
    debug('Socket data event')
    new IncomingPacket(self, buffer)
  })

  if (upgradeHead) {
    bs.write(upgradeHead)
  }

}


Client.prototype.sendPacket = function(packet) {
  if (!this.authorized && !(packet.packetType === packets.TYPE_HANDSHAKE || packet.packetType === packets.TYPE_ERROR)) {
    this.packetQueue.push(packet);
    return false;
  }

  try {
    return this.socket.write(packet);
  } catch(err) {
    this.$emit('error', err);
  }
};


Client.prototype.$emit = EventEmitter.prototype.emit;

Client.prototype.emit = function(name) {
  if (name === 'error' || name === 'newListener') {
    return this.$emit.apply(this, arguments);
  } else {
    return this.sendArgsPacket(packets.TYPE_EVENT, arguments);
  }
};


Client.prototype.send = function() {
  this.sendArgsPacket(packets.TYPE_MESSAGE, arguments);
};


Client.prototype.error = function() {
  return this.sendArgsPacket(packets.TYPE_ERROR, arguments);
};


Client.prototype.encodeArgs = function(args) {
  args = toArray(args)

  args.forEach(function(arg, i) {
    if ((arg instanceof Stream) && !(arg instanceof BesioStream)) {
      args[i] = new BesioStream(this);
      args[i].wrap(arg);
    }
  }, this);

  return args;
};


Client.prototype.sendArgsPacket = function(type, args) {
  args = this.encodeArgs(args);

  var argsSize = OutgoingPacket.calcArgs(args);
  var packet = new OutgoingPacket(this, type, argsSize);
  packet.writeArgs(args, argsSize);
  return this.sendPacket(packet);
};


Client.prototype.destroy = function() {
  debug('Destroying client')
  if (this.socket) {
    this.socket.destroy()
    this.socket = null
  }

  this.server = null
  this.streams = null
  this.callbacks = null
  this.packetQueue = null
  this.destroyed = true
  this.ended = true
}


Client.prototype.end = function() {
  if (this.ended) return
  this.ended = true

  debug('Ending client')

  for(var id in this.streams) {
    this.streams[id].destroy()
  }
  this.streams = null

  this._end()
}


Client.prototype._end = function() {
  if (this.socket) {
    this.socket.end()
    this.socket = null
  }
}


;['pause', 'resume', 'setTimeout'].forEach(function(name) {
  Client.prototype[name] = function() {
    return this.socket[name].apply(this.socket, arguments);
  };
});


