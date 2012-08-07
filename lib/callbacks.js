var binson = require('./binson')
  , packets = require('./packets')
  , weak = require('weak')
  , extend = require('util')._extend
  , uuid = require('node-uuid')


var externalCallbacks = {}


function getId(fn) {
  if (!fn.__besio) {
    var pr = { __besio: uuid.v4() }
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

    if (externalCallbacks[id] && !weak.isDead(externalCallbacks[id])) {
      return weak.get(externalCallbacks[id])
    }

    var fn = function() {
      var args = client.encodeArgs(arguments)

      var argsSize = packets.OutgoingPacket.calcArgs(args)
      var size = 36 // uid
               + argsSize

      var packet = new packets.OutgoingPacket(client, packets.TYPE_CALLBACK, size)
      packet.write(id, packet.index, 36)
      packet.index += 36

      packet.writeArgs(args, argsSize)
      return client.sendPacket(packet)
    }

    var ref = weak(fn, function() {
      delete externalCallbacks[id]

      if (client.destroyed) return

      var packet = new packets.OutgoingPacket(client, packets.TYPE_CALLBACK_GC, 36)
      packet.write(id, packet.index, 36)
      packet.index += 36

      return client.sendPacket(packet)
    })

    externalCallbacks[id] = ref

    if (properties) {
      extend(fn, properties)
    }

    return fn
  }
})
