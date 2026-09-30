const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, r, g, b, innerR, innerG, innerB) {
  // 8-byte PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    // CRC
    let c = 0xffffffff;
    const crcBuf = buf.subarray(4, 8 + len);
    for (let i = 0; i < crcBuf.length; i++) {
      c ^= crcBuf[i];
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (-(c & 1) & 0xedb88320);
      }
    }
    buf.writeInt32BE((c ^ 0xffffffff) | 0, 8 + len);
    return buf;
  }

  // Raw image bytes: (width * 4 + 1) * height
  const rowLen = width * 4 + 1;
  const raw = Buffer.alloc(rowLen * height);
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;
  const innerRadius = width * 0.36;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= innerRadius) {
        // Inner Disc (Deep Forest Green)
        raw[pxOffset] = r;
        raw[pxOffset + 1] = g;
        raw[pxOffset + 2] = b;
        raw[pxOffset + 3] = 255;
      } else if (dist <= radius) {
        // Gold Outer Ring
        raw[pxOffset] = innerR;
        raw[pxOffset + 1] = innerG;
        raw[pxOffset + 2] = innerB;
        raw[pxOffset + 3] = 255;
      } else {
        // Background rounded corners (Forest Green)
        const cornerDist = Math.max(Math.abs(dx), Math.abs(dy));
        if (cornerDist < width * 0.48) {
          raw[pxOffset] = r;
          raw[pxOffset + 1] = g;
          raw[pxOffset + 2] = b;
          raw[pxOffset + 3] = 255;
        } else {
          raw[pxOffset] = 0;
          raw[pxOffset + 1] = 0;
          raw[pxOffset + 2] = 0;
          raw[pxOffset + 3] = 0;
        }
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const dir = path.join(__dirname, '..', 'public', 'assets');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// Pine Forest: rgb(30, 63, 50), Marigold Gold: rgb(255, 173, 0)
const png192 = createPng(192, 192, 30, 63, 50, 255, 173, 0);
fs.writeFileSync(path.join(dir, 'icon-192.png'), png192);

const png512 = createPng(512, 512, 30, 63, 50, 255, 173, 0);
fs.writeFileSync(path.join(dir, 'icon-512.png'), png512);

console.log('Generated icon-192.png and icon-512.png successfully in public/assets/');
