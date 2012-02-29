var net = require('net')
  , tls = require('tls')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , packets = require('./packets')
  , IncomingPacket = packets.IncomingPacket
  , OutgoingPacket = packets.OutgoingPacket
  , Stream = require('stream').Stream
  , BesioStream = require('./streams').BesioStream
  , BufferStream = require('./streams').BufferStream
  , binson = require('./binson')
  , Callback = require('./callbacks').Callback
  , winston = require('winston')
  ;


function $A(arr) {
  return Array.prototype.slice.call(arr);
}


function Client() {
  EventEmitter.call(this);

  this.streams = {};
  this.streamCounter = 0;

  this.callbacks = {};
  this.callbackCounter = 0;

  this.packetQueue = [];
}
util.inherits(Client, EventEmitter);
exports.Client = Client;


Client.prototype.log = winston;


Client.prototype.connect = function() {
  var options = {};

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
    if (typeof arguments[0] === 'number') {
      options.port = arguments[0];
    }
    if (typeof arguments[1] === 'string') {
      options.host = arguments[1];
    }
  }

  if (options.logger) {
    this.log = options.logger;
  }

  if (typeof arguments[arguments.length - 1] === 'function') {
    this.on('connect', arguments[arguments.length - 1]);
  }

  var onConnect = this.onConnect.bind(this, options.handshake);

  if (options.key && options.cert) {
    this.log.debug('Setting up tls connection');
    this.socket = tls.connect(options.port, options, onConnect);
  } else {
    this.log.debug('Setting up tcp connection');
    this.socket = net.connect(options.port, options.host, onConnect);
  }

  this.setup();
};


Client.prototype.onConnect = function(data) {
  this.log.debug('Connected, starting handshake');
  var packet = new OutgoingPacket(packets.TYPE_HANDSHAKE, binson.calculate(data));
  binson.encode(data, packet, packet.index);
  this.sendPacket(packet);
};


Client.prototype.onAuthorized = function(data) {
  this.log.info('Handshake authorized');
  this.authorized = true;

  if (this.server) {
    this.server.emit('client', this, data);
  }

  this.emit('connect', data);
};


Client.prototype.handshakeData = function(data) {
  var hd = {
    data: data,
    issued: new Date(),
    secure: this.server.secure
  };

  if (this.server.secure) {
    hd.cleartext = this.socket;
    hd.encrypted = this.encrypted;
  } else {
    hd.socket = this.socket;
  }

  return hd;
};


Client.prototype.setup = function() {
  var bs, self = this;

  bs = new BufferStream();

  bs.on('data', function(buffer) {
    new IncomingPacket(self, buffer);
  });

  this.socket.pipe(bs);

  ['end', 'timeout', 'drain', 'error', 'close'].forEach(function(name) {
    self.socket.on(name, function() {
      self.log.debug('Socket ' + name + ' event');
      var args = $A(arguments);
      args.unshift(name);
      self.$emit.apply(self, args);
    });
  });
};


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


Client.prototype.sendPacketQueue = function() {
  this.packetQueue.forEach(this.sendPacket.bind(this));
  this.packetQueue = [];
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
  args = $A(args);

  args.forEach(function(arg, i) {
    if ((arg instanceof Stream) && !(arg instanceof BesioStream)) {
      args[i] = new BesioStream(this);
      args[i].wrap(arg);
    } else if (typeof arg === 'function') {
      args[i] = new Callback(this);
      args[i].wrap(arg);
    }
  }, this);

  return args;
};


Client.prototype.sendArgsPacket = function(type, args) {
  args = this.encodeArgs(args);

  var argsSize = OutgoingPacket.calcArgs(args);
  var packet = new OutgoingPacket(type, argsSize);
  packet.writeArgs(args, argsSize);
  return this.sendPacket(packet);
};


Client.prototype.destroy = function() {
  this.socket.destroy();
  this.streams = [];
  this.callbacks = [];
};


Client.prototype.destroySoon = function() {
  if (this.writable) {
    this.end();
  } else {
    this.destroy();
  }
};


['end', 'pause', 'resume', 'setTimeout', 'setNoDelay', 'setKeepAlive', 'address'].forEach(function(name) {
  Client.prototype[name] = function() {
    return this.socket[name].apply(this.socket, arguments);
  };
});


['remoteAddress', 'remotePort', 'bytesRead', 'bytesWritten'].forEach(function(name) {
  Object.defineProperty(Client.prototype, name, {
    get: function() {
      return this.socket[name];
    }
  });
});
