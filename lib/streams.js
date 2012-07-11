var Stream = require('stream')
  , util = require('util')
  , binson = require('./binson')
  , packets = require('./packets')
  , debug = require('debug')('besio:streams')


binson.register(0, {
  constructor: BesioStream,
  encode: function (stream) {
    return [stream.id, !!stream.readable, !!stream.writable];
  }, 
  decode: function (data) {
    // packets.currentClient is sett before binson.decode is called
    var stream = new BesioStream(packets.currentClient);
    stream.remoteId = data[0];
    stream.readable = data[1];
    stream.writable = data[2];

    var packet = stream.createPacket(BesioStream.TYPE_CREATE, 4);
    packet.writeUInt32BE(stream.id, packet.index);
    stream.client.sendPacket(packet);

    return stream;
  }
});



function BesioStream(client) {
  Stream.call(this);

  this.client = client;

  this.id = client.streamCounter++;
  client.streams[this.id] = this;

  this._writeQueue = [];

  this.remoteId = null;

  this.readable = true;
  this.writable = true;

  var self = this;
  this.onclientdrain = function () {
    if (!self.remotePaused) {
      self.emit('drain');
    }
  };
  this.onclientclose = function() {
    self.emit('close');
    self.destroy();
  };
  client.on('drain', this.onclientdrain);
  client.on('close', this.onclientclose);
}
util.inherits(BesioStream, Stream);
exports.BesioStream = BesioStream;


BesioStream.TYPE_CREATE = 0;
BesioStream.TYPE_END = 1;

BesioStream.TYPE_PAUSE = 2;
BesioStream.TYPE_RESUME = 3;

BesioStream.TYPE_DATA = 4;


BesioStream.prototype.wrap = function(parent) {
  var self = this;
  this.parent = parent;
  parent.on('destroy', function() {
    self.destroy();
  });

  if (parent.readable) {
    parent.pipe(this);
  }
  if (parent.writable) {
    this.pipe(parent);
  }
};


BesioStream.prototype.writeQueue = function() {
  for (var i = 0, l = this._writeQueue.length; i < l; i++) {
    this._write(this._writeQueue[i]);
  }
  this._writeQueue = [];
  this.emit('drain');
};


BesioStream.prototype.write = function(data) {
  if (this.remoteId === null || this.remotePaused) {
    this._writeQueue.push(data);
    return false;
  } else {
    return this._write(data);
  }
};


BesioStream.prototype._write = function(data) {
  var packet = this.createPacket(BesioStream.TYPE_DATA, binson.calculate(data));
  packet.writeBinson(data);

  debug('Sending stream data')

  return this.client.sendPacket(packet);
};


BesioStream.prototype.pause = function() {
  if (this.paused) {
    return;
  }

  this.paused = true;

  if (this.remoteId === null) {
    return;
  }

  debug('Sending stream pause')

  var packet = this.createPacket(BesioStream.TYPE_PAUSE, 0);
  this.client.sendPacket(packet);
};


BesioStream.prototype.resume = function() {
  if (!this.paused) {
    return;
  }

  this.paused = false;

  if (this.remoteId === null) {
    return;
  }

  debug('Sending stream resume')

  var packet = this.createPacket(BesioStream.TYPE_RESUME, 0);
  this.client.sendPacket(packet);
};


BesioStream.prototype.end = function(data) {
  if (data) {
    this.write(data);
  }

  debug('Sending stream end')

  var packet = this.createPacket(BesioStream.TYPE_END, 0);
  this.client.sendPacket(packet);

  this.destroySoon();
};


BesioStream.prototype.destroy = function() {
  delete this.client.streams[this.id];
  this.readable = false;
  this.writable = false;
  this.client.removeListener('drain', this.onclientdrain);
  this.client.removeListener('close', this.onclientclose);
};

BesioStream.prototype.destroySoon = BesioStream.prototype.destroy;


BesioStream.prototype.createPacket = function(type, length) {
  var packet = new packets.OutgoingPacket(this.client, packets.TYPE_STREAM, length + 5);

  packet.writeUInt32BE(this.remoteId, packet.index);
  packet.index += 4;

  packet.writeUInt8(type, packet.index++);

  return packet;
};







function BufferStream(options) {
  Stream.call(this);
  this.buffers = [];
  this.size = 0;
  this.index = 0;
  this.nextSize = null;
  this.readable = this.writable = true;

  options = options || {};
  this.sizeLength = options.sizeLength || 2;
}
util.inherits(BufferStream, Stream);
exports.BufferStream = BufferStream;


BufferStream.prototype.write = function(buffer) {
  this.buffers.push(buffer);
  this.size += buffer.length;

  if (!this.nextSize) {
    this.nextSize = this.findSize();
  }
  this.check();
  return !this.paused;
};


BufferStream.prototype.check = function() {
  if (!this.nextSize) {
    return;
  }

  var buffer = this.readBuffer(this.nextSize);
  if (!buffer) {
    return;
  }

  this.emit('data', buffer);

  this.nextSize = this.findSize();
  this.check();
};


BufferStream.prototype.findSize = function() {
  var size = this.readBuffer(this.sizeLength);

  if (!size) {
    return null;
  }

  switch(this.sizeLength) {
  case 1:
    size = size.readUInt8(0);
    break;
  case 2:
    size = size.readUInt16BE(0);
    break;
  case 3: 
    size = (size[0] << 16)
         + (size[1] << 8)
         +  size[2];
    break;
  case 4:
    size = size.readUInt32BE(0);
    break;
  default:
    throw new Error('Size lenght must be 1, 2, 3 or 4');
  }

  return size;
};


BufferStream.prototype.readBuffer = function(size) {
  if (size > this.size) {
    return null;
  }

  var buffer;

  if (this.buffers[0].length >= (size + this.index)) { // can slice
    buffer = this.buffers[0].slice(this.index, this.index + size);
    this.index += size;

    if (this.index >= this.buffers[0].length) {
      this.buffers.shift();
      this.index = 0;
    }


  } else { // must merge

    buffer = new Buffer(size);

    var source, index, read, offset = 0;

    while(offset < size) {
      index = this.index;
      source = this.buffers.shift();
      read = Math.min((source.length - index), size - offset);
      source.copy(buffer, offset, index, index + read);
      offset += read;
      this.index = 0;
    }

    if (this.index < source.length) {
      this.index = index + read;
      this.buffers.unshift(source);
    } else {
      this.index = 0;
    }

  }

  this.size -= size;

  return buffer;
};


BufferStream.prototype.end = function(data) {
  if (data) {
    this.write(data);
  }

  this.readable = this.writable = false;
  this.destroySoon();
};


BufferStream.prototype.destroy = function() {
  this.buffers = null;
};

BufferStream.prototype.destroySoon = BufferStream.prototype.destroy;


BufferStream.prototype.pause = function() {
  this.paused = true;
};

BufferStream.prototype.resume = function() {
  this.paused = false;
  this.emit('drain');
};
