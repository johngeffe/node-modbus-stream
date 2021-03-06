var util          = require("util");
var buffer        = require("../buffer");
var BaseTransport = require("./transport");

function Transport(stream, options) {
	options = options || {};

	BaseTransport.call(this, stream, options);

	this.callback        = null;
	this.callbackSlaveId = null;
	this.queued          = null;
};
util.inherits(Transport, BaseTransport);

Transport.prototype.wrap = function (pdu, options, next) {
	options = options || {};
	next    = next || null;

	var slaveId = (typeof options.slaveId != "undefined" ? options.slaveId : 1);
	var data    = buffer.alloc(pdu.length + 3);

	data.writeUInt8(slaveId, 0);

	if (typeof next == "function") {
		this.callbackSlaveId = slaveId;
		this.callback        = next;
	}

	pdu.copy(data, 1);

	data.writeUInt16LE(Transport.crc16(data.slice(0, data.length - 2)), pdu.length + 1);

	return data;
};

Transport.prototype.unwrap = function (data) {
	if (this.queued !== null) {
		data = buffer.concat([ this.queued, data ]);
	}

	if (data.length <= 3) return false;

	var unwrapped = {
		slaveId      : data.readUInt8(0),
		crc          : data.readUInt16LE(data.length - 2),
		expected_crc : Transport.crc16(data.slice(0, data.length - 2)),
		pdu          : data.slice(1, data.length - 2)
	};

	if (unwrapped.crc != unwrapped.expected_crc) {
		this.queued = data;
		return false;
	} else {
		this.queued = null;
	}

	if (typeof this.callback == "function") {
		if (unwrapped.slaveId != this.callbackSlaveId) return false;

		unwrapped.callback = this.callback;
	}

	return unwrapped;
};

Transport.crc16 = function (buffer) {
	var crc = 0xFFFF;

	for (var i = 0; i < buffer.length; i++) {
		crc ^= buffer[i];

		for (var j = 8; j != 0; j--) {
			if ((crc & 0x0001) != 0) {
				crc >>= 1;
				crc ^= 0xA001;
			} else {
				crc >>= 1;
			}
		}
	}

	return crc;
};

Transport.prepare = function (options) {
	return function (stream) {
		return new Transport(stream, options);
	};
};

module.exports = Transport;
