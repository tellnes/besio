var binson = require('./binson')
  , packets = require('./packets')
  ;


binson.register(1, {
  constructor: Callback,
  encode: function (cb) {
    return cb.id;
  },
  decode: function (id) {
    // packets.currentClient is sett before binson.decode is called
    var client = packets.currentClient;

    return function() {
      var args = client.encodeArgs(arguments);

      var argsSize = packets.OutgoingPacket.calcArgs(args);
      var size = 2 // id
               + argsSize;

      var packet = new packets.OutgoingPacket(packets.TYPE_CALLBACK, size);
      packet.writeUInt16BE(id, packet.index);
      packet.index += 2;

      packet.writeArgs(args, argsSize);
      return client.sendPacket(packet);
    };
  }
});


function Callback(client) {
  this.client = client;
}
exports.Callback = Callback;


Callback.prototype.wrap = function(fn) {
  this.fn = fn;

  this.id = this.client.callbacks.length;
  this.client.callbacks.push(this);
};
