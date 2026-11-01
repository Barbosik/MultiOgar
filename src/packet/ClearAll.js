function ClearAll() { }

module.exports = ClearAll;

ClearAll.prototype.build = function (protocol) {
    var buffer = Buffer.alloc(1);
    buffer.writeUInt8(0x12, 0, true);
    return buffer;
};

