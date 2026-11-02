function ClearOwned() { }

module.exports = ClearOwned;

ClearOwned.prototype.build = function (protocol) {
    var buffer = Buffer.alloc(1);
    buffer.writeUInt8(0x14, 0, true);
    return buffer;
};

