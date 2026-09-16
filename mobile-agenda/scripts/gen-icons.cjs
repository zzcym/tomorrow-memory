/** 生成安卓启动图标(各分辨率 mipmap 目录下的 ic_launcher.png,纯 Node 实现) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(c) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(c.h * (c.w * 4 + 1));
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.px.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function drawIcon(size) {
  const c = { w: size, h: size, px: new Uint8Array(size * size * 4) };
  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    c.px[i] = r; c.px[i + 1] = g; c.px[i + 2] = b; c.px[i + 3] = a;
  };
  const S = size / 256;
  const rr = (x0, y0, w, h, rad, col) => {
    for (let y = Math.floor(y0); y < y0 + h; y++) {
      for (let x = Math.floor(x0); x < x0 + w; x++) {
        const dx = Math.max(x0 + rad - x, x - (x0 + w - 1 - rad), 0);
        const dy = Math.max(y0 + rad - y, y - (y0 + h - 1 - rad), 0);
        if (dx * dx + dy * dy <= rad * rad) set(x, y, col);
      }
    }
  };
  // 背景渐变紫(全尺寸方形,启动器会自己遮圆角)
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const col = [Math.round(139 - t * 24), Math.round(92 - t * 22), Math.round(246 - t * 12), 255];
    for (let x = 0; x < size; x++) set(x, y, col);
  }
  const WHITE = [255, 255, 255, 255];
  const HEAD = [109, 74, 255, 255];
  rr(64 * S, 78 * S, 128 * S, 118 * S, 14 * S, WHITE);
  rr(64 * S, 78 * S, 128 * S, 30 * S, 14 * S, HEAD);
  rr(64 * S, 96 * S, 128 * S, 12 * S, 0, HEAD);
  rr(92 * S, 62 * S, 12 * S, 28 * S, 6 * S, WHITE);
  rr(152 * S, 62 * S, 12 * S, 28 * S, 6 * S, WHITE);
  const dot = [124, 92, 255, 255];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = 88 * S + col * 36 * S;
      const cy = 130 * S + row * 24 * S;
      const rad = 5 * S;
      for (let dy = Math.floor(-rad); dy <= rad; dy++) {
        for (let dx = Math.floor(-rad); dx <= rad; dx++) {
          if (dx * dx + dy * dy <= rad * rad) set(Math.round(cx + dx), Math.round(cy + dy), dot);
        }
      }
    }
  }
  return encodePng(c);
}

const resDir = path.join(__dirname, '..', 'res');
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, size] of Object.entries(SIZES)) {
  const dir = path.join(resDir, `mipmap-${dpi}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), drawIcon(size));
  console.log(`mipmap-${dpi}: ${size}px ✓`);
}
