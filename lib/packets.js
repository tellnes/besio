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
  Buffer.call(this, length + 3);
  this.fill(0xff);
  this.writeUInt16BE(length+1, 0);
  this.writeUInt8(type, 2);
  this.index = 3;
}
util.inherits(OutgoingPacket, Buffer);
packets.OutgoingPacket = OutgoingPacket;


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
  case packets.TYPE_SETUP:
    break;
  case packets.TYPE_END:
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
  }
  
}
util.inherits(IncomingPacket, BitWorker);
packets.IncomingPacket = IncomingPacket;


packets.TYPE_SETUP = 0;
packets.TYPE_END = 1;
packets.TYPE_MESSAGE = 2;
packets.TYPE_CALLBACK = 3;
packets.TYPE_EVENT = 4;
packets.TYPE_STREAM = 5;
packets.TYPE_HEARTBEAT = 6;



IncomingPacket.prototype.readArgs = function() {
  var args, length = this.readInt8();

  try {
    packets.currentClient = this.client;
    args = binson.decode(this.buffer, this.index);
  } catch(err) {
    this.client.emit('error', err);
    return;
  }

  args.length = length;
  args = $A(args);

  return args;
};


IncomingPacket.prototype.handleCallback = function() {
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
  var args = this.readArgs();
  if (!args) {
    return;
  }

  this.client.$emit.apply(this.client, args);
};


IncomingPacket.prototype.handleMessage = function() {
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

  switch(type) {

  case BesioStream.TYPE_CREATE:
    stream.remoteId = packet.readUInt32BE();
    if (stream.paused) {
      stream.paused = false;
      stream.pause();
    }
    stream.writeQueue();
    break;
  case BesioStream.TYPE_END:
    stream.emit('end');
    stream.destroy();
    break;

  case BesioStream.TYPE_PAUSE:
    stream.remotePaused = true;
    break;

  case BesioStream.TYPE_RESUME:
    stream.remotePaused = false;
    stream.writeQueue();
    break;

  case BesioStream.TYPE_DATA:
    var data = binson.decode(packet.readBuffer(packet.max - packet.index));
    stream.emit('data', data);
    break;

  }
};
