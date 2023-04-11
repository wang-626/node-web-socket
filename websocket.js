const http = require('node:http');
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');

class WebSocketServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 4000;
    this.GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    this.OPCODES = { text: 0x01, close: 0x08 };
    this.#init();
  }

  #generateAcceptValue(acceptKey) {
    return crypto
      .createHash('sha1')
      .update(acceptKey + this.GUID, 'binary')
      .digest('base64');
  }

  _unmask(payload, maskingKey) {
    const result = Buffer.alloc(payload.byteLength);

    for (let i = 0; i < payload.byteLength; ++i) {
      const j = i % 4;
      const maskingKeyByteShift = j === 3 ? 0 : (3 - j) << 3;
      const maskingKeyByte = (maskingKey >> maskingKeyByteShift) & 0b11111111;
      const transformedByte = maskingKeyByte ^ payload.readUInt8(i);
      result.writeUInt8(transformedByte, i);
    }

    return result;
  }

  parseFrame(buffer) {
    const firstByte = buffer.readUInt8(0);
    const opCode = firstByte & 0b00001111;

    if (opCode === this.OPCODES.close) {
      this.emit('close');
      return null;
    } else if (opCode !== this.OPCODES.text) {
      return;
    }

    const secondByte = buffer.readUInt8(1);

    let offset = 2;

    let payloadLength = secondByte & 0b01111111; // get last 7 bits of a second byte

    if (payloadLength === 126) {
      offset += 2;
    } else if (payloadLength === 127) {
      offset += 8;
    }
    const isMasked = Boolean((secondByte >>> 7) & 0b00000001); // get first bit of a second byte

    if (isMasked) {
      const maskingKey = buffer.readUInt32BE(offset); // read 4-byte (32-bit) masking key
      offset += 4;
      const payload = buffer.subarray(offset);
      const result = this._unmask(payload, maskingKey);
      return result.toString('utf-8');
    }

    return buffer.subarray(offset).toString('utf-8');
  }

  createFrame(data) {
    const payload = JSON.stringify(data);
    const payloadByteLength = Buffer.byteLength(payload);
    let payloadBytesOffset = 2;
    let payloadLength = payloadByteLength;

    if (payloadByteLength > 65535) { // length value cannot fit in 2 bytes
      payloadBytesOffset += 8;
      payloadLength = 127;
    } else if (payloadByteLength > 125) {
      payloadBytesOffset += 2;
      payloadLength = 126;
    }

    const buffer = Buffer.alloc(payloadBytesOffset + payloadByteLength);

    // first byte
    buffer.writeUInt8(0b10000001, 0); // [FIN (1), RSV1 (0), RSV2 (0), RSV3 (0), Opсode (0x01 - text frame)]

    buffer[1] = payloadLength; // second byte - actual payload size (if <= 125 bytes) or 126, or 127

    if (payloadLength === 126) { // write actual payload length as a 16-bit unsigned integer
      buffer.writeUInt16BE(payloadByteLength, 2);
    } else if (payloadByteLength === 127) { // write actual payload length as a 64-bit unsigned integer
      buffer.writeBigUInt64BE(BigInt(payloadByteLength), 2);
    }

    buffer.write(payload, payloadBytesOffset);
    return buffer;

  }


  #init() {
    if (this._server) throw new Error('Server already initialized');

    this._server = http.createServer((req, res) => {
      const UPGRADE_REQUIRED = 426;
      const body = http.STATUS_CODES[UPGRADE_REQUIRED];
      res.writeHead(UPGRADE_REQUIRED, {
        'Content-Type': 'text/plain',
        'Upgrade': 'WebSocket',
      });
      res.end(body);
    });

    this._server.on('upgrade', (req, socket) => {

      if (req.headers.upgrade !== 'websocket') {
        socket.end('HTTP/1.1 400 Bad Request');
        return;
      }

      this.emit('connection');

      this.on('close', () => {
        console.log('closing....');
        socket.destroy();
      });

      this.on('broadcast', (message) => {
        socket.write(this.createFrame(message))
      });

      socket.on('data', (buffer) => {
        const data = JSON.parse(this.parseFrame(buffer),);
        this.emit(
          'broadcast',
          data
        )
      });

      const acceptKey = req.headers['sec-websocket-key'];
      const acceptValue = this.#generateAcceptValue(acceptKey);

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptValue}`,
      ];

      socket.write(responseHeaders.concat('\r\n').join('\r\n'));
    });
  }

  listen(callback) {
    this._server.listen(this.port, callback);
  }
}

module.exports = WebSocketServer;


