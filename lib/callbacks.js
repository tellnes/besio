var binson = require('./binson')
  , packets = require('./packets')
  , weak = require('weak')
  , extend = require('util')._extend


var counter = 0

function getId(fn) {
  if (!fn.__besio) {
    var pr = { __besio: ++counter }
    pr.__proto__ = fn.__proto__
    fn.__proto__ = pr
  }
  return fn.__besio
}

binson.register(1, {
  constructor: Function,
  deep: true,
  calculate: function(fn, size) {
    return binson.calculateElement(getId(fn), size)
  },
  encode: function (fn, bw) {
    var id = getId(fn)
    bw.client.callbacks[id] = fn

    return id
  },
  decode: function (id, properties, packet) {
    var client = packet.client

    if (client.remoteCallbacks[id] && !weak.isDead(client.remoteCallbacks[id])) {
      return weak.get(client.remoteCallbacks[id])
    }


    var fn = function() {
      var args = arguments

      var argsSize = packets.OutgoingPacket.calcArgs(args)
      var size = 2 // id
               + argsSize

      var packet = new packets.OutgoingPacket(client, packets.TYPE_CALLBACK, size)
      packet.writeUInt16BE(id, packet.index)
      packet.index += 2

      packet.writeArgs(args, argsSize)
      return client.sendPacket(packet)
    }

    var ref = weak(fn, function() {
      client.remoteCallbacks[id] = null

      var size = 2 // id

      var packet = new packets.OutgoingPacket(client, packets.TYPE_CALLBACK_GC, size)
      packet.writeUInt16BE(id, packet.index)
      packet.index += 2

      return client.sendPacket(packet)
    })

    client.remoteCallbacks[id] = ref

    if (properties) {
      extend(fn, properties)
    }

    return fn
  }
})
