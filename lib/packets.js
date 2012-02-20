var util = require('util')
  , binson = require('./binson')
  , BitWorker = binson.BitWorker
  , BesioStream = require('./streams').BesioStream
  ;

var packets = exports;

function $A(arr) {
  return Array.prototype.slice.call(arr);
}


function OutgoingPacket(type, length) {
  if (length > OutgoingPacket.MAX_SIZE) {
    throw new Error('Packet to big');
  }

  Buffer.call(this, length + 3);
  this.writeUInt16BE(length+1, 0);
  this.writeUInt8(type, 2);
  this.index = 3;
  this.packetType = type;
}
util.inherits(OutgoingPacket, Buffer);
packets.OutgoingPacket = OutgoingPacket;


OutgoingPacket.MAX_SIZE = 65536 - 8*3;


OutgoingPacket.calcArgs = function(args) {
  return 1 + binson.calculate(args);
};

OutgoingPacket.prototype.writeArgs = function(args, argsSize) {
  this.writeUInt8(args.length, this.index++);
  binson.encode(args, this, this.index);
  this.index += (argsSize || OutgoingPacket.calcArgs(args));
};




function IncomingPacket(client, buffer) {
  if (!(this instanceof IncomingPacket)) { return new IncomingPacket(client, buffer); }

  this.client = client;
  BitWorker.call(this, buffer);
  this.readStart();

  this.type = this.readUInt8();

  switch(this.type) {
  case packets.TYPE_HANDSHAKE:
    this.handleHandshake();
    break;
  case packets.TYPE_ERROR:
    this.handleError();
    break;
  case packets.TYPE_CALLBACK:
    this.handleCallback();
    break;
  case packets.TYPE_MESSAGE:
    this.handleMessage();
  case packets.TYPE_EVENT:
    this.handleEvent();
    break;
  case packets.TYPE_STREAM:
    this.handleStream();
    break;
  default:
    this.client.log.error('Invalid packet');
    break;
  }
  
}
util.inherits(IncomingPacket, BitWorker);
packets.IncomingPacket = IncomingPacket;


packets.TYPE_HANDSHAKE = 0;
packets.TYPE_ERROR = 1;
packets.TYPE_MESSAGE = 2;
packets.TYPE_CALLBACK = 3;
packets.TYPE_EVENT = 4;
packets.TYPE_STREAM = 5;
packets.TYPE_HEARTBEAT = 6;



IncomingPacket.prototype.readBinson = function() {
  packets.currentClient = this.client; // binson custom types need this
  return binson.decodeElement(this, this.read(3)); // LENGTH_TYPE = 3
};


IncomingPacket.prototype.readArgs = function() {
  var args, length = this.readInt8();

  try {
    args = this.readBinson();
  } catch(err) {
    this.client.emit('error', err);
    return;
  }

  args.length = length;
  args = $A(args);

  return args;
};


IncomingPacket.prototype.handleHandshake = function() {
  this.client.log.debug('Handle handshake packet');
  var handshakeData, client = this.client, server = client.server;

  try {
    handshakeData = this.readBinson();
  } catch(err) {
    client.emit('error', err);
    return;
  }

  if (!server) {
    client.onAuthorized(handshakeData);

  } else {
    handshakeData = client.handshakeData(handshakeData);


    server.authorize(handshakeData, function(err, authorized, data) {
      if (!err && !authorized) {
        err = new Error('unauthorized');
      }

      if (err) {
        client.error(err);
        client.destroySoon();

      } else {
        var packet = new OutgoingPacket(packets.TYPE_HANDSHAKE, binson.calculate(data));
        binson.encode(data, packet, packet.index);
        client.sendPacket(packet);

        client.onAuthorized();
      }
    });
  }
};


IncomingPacket.prototype.handleError = function() {
  this.client.log.debug('Handle error packet');
  var args = this.readArgs();
  if (!args) {
    return;
  }

  args.unshift('error');
  this.client.$emit.apply(this.client, args);
};


IncomingPacket.prototype.handleCallback = function() {
  this.client.log.debug('Handle callback packet');
  var id = this.readUInt16BE(id);

  var cb = this.client.callbacks[id];
  if (!cb) {
    this.client.$emit('error', new Error('Cant find callback'));
    return;
  }
  delete this.client.callbacks[id];

  var args = this.readArgs();
  if (!args) {
    return;
  }

  cb.fn.apply(this.client, args);
};


IncomingPacket.prototype.handleEvent = function() {
  this.client.log.debug('Handle event packet');
  var args = this.readArgs();
  if (!args) {
    return;
  }

  this.client.$emit.apply(this.client, args);
};


IncomingPacket.prototype.handleMessage = function() {
  this.client.log.debug('Handle message packet');
  var args = this.readArgs();
  if (!args) {
    return;
  }

  args.unshift('message');
  this.client.$emit.apply(this, args);
};


IncomingPacket.prototype.handleStream = function() {
  var packet = this;

  var id = packet.readUInt32BE();
  var type = packet.readUInt8();

  var client = packet.client;

  var stream = client.streams[id];

  if (!stream) {
    this.client.log.debug('Got stream packet for unknown stream');
    return;
  }


  switch(type) {

  case BesioStream.TYPE_CREATE:
    this.client.log.debug('Handle stream create packet');
    stream.remoteId = packet.readUInt32BE();
    if (stream.paused) {
      stream.paused = false;
      stream.pause();
    }
    stream.writeQueue();
    break;
  case BesioStream.TYPE_END:
    this.client.log.debug('Handle stream end packet');
    stream.emit('end');
    stream.destroy();
    break;

  case BesioStream.TYPE_PAUSE:
    this.client.log.debug('Handle stream pause packet');
    stream.remotePaused = true;
    break;

  case BesioStream.TYPE_RESUME:
    this.client.log.debug('Handle stream resume packet');
    stream.remotePaused = false;
    stream.writeQueue();
    break;

  case BesioStream.TYPE_DATA:
    this.client.log.debug('Handle stream data packet');
    var data = binson.decode(packet.readBuffer(packet.max - packet.index));
    stream.emit('data', data);
    break;

  default:
    this.client.log.error('Invalid stream packet');
    break;
  }
};
