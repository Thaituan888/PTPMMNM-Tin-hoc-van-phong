// Render with the production QR code library/helper, encode PNG, then decode its pixels independently.
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const path = require('node:path');
const jsQR = require('./vendor/jsqr/jsQR.js');
const root = path.join(__dirname, '..');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
}
function canvas() {
  let pixels;
  const canvas = {width: 0, height: 0};
  const context = {fillStyle: '#ffffff', fillRect(x, y, width, height) {
    pixels ||= Buffer.alloc(canvas.width * canvas.height * 4);
    const color = this.fillStyle === '#000000' ? 0 : 255;
    for (let row = y; row < y + height; row++) for (let column = x; column < x + width; column++) {
      const index = (row * canvas.width + column) * 4;
      pixels[index] = pixels[index+1] = pixels[index+2] = color; pixels[index+3] = 255;
    }
  }};
  canvas.getContext = () => context;
  canvas.toDataURL = () => {
    const header = Buffer.alloc(13); header.writeUInt32BE(canvas.width, 0); header.writeUInt32BE(canvas.height, 4);
    header[8] = 8; header[9] = 6;
    const rows = [];
    for (let y = 0; y < canvas.height; y++) rows.push(Buffer.from([0]), pixels.subarray(y*canvas.width*4, (y+1)*canvas.width*4));
    const png = Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',header),
      chunk('IDAT',zlib.deflateSync(Buffer.concat(rows))), chunk('IEND',Buffer.alloc(0))]);
    return 'data:image/png;base64,' + png.toString('base64');
  };
  return canvas;
}
const context = vm.createContext({window: {}, document: {createElement: type => {assert.equal(type,'canvas'); return canvas();}}});
vm.runInContext(fs.readFileSync(path.join(root,'vendor/nayuki/qrcodegen.js'),'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root,'lms-qr.js'),'utf8'), context);
const payload = fs.readFileSync(0,'utf8').trim();
const image = context.window.THVP_LMS_QR.png(payload);
const png = Buffer.from(image.split(',')[1],'base64');
let offset = 8, width, height, idat = [];
while (offset < png.length) {
  const length = png.readUInt32BE(offset), type = png.toString('ascii',offset+4,offset+8);
  const data = png.subarray(offset+8,offset+8+length);
  if (type === 'IHDR') {width=data.readUInt32BE(0);height=data.readUInt32BE(4);}
  if (type === 'IDAT') idat.push(data);
  offset += 12 + length;
}
const raw = zlib.inflateSync(Buffer.concat(idat)), pixels = new Uint8ClampedArray(width*height*4);
for (let y=0;y<height;y++) {
  const start=y*(width*4+1); assert.equal(raw[start],0);
  pixels.set(raw.subarray(start+1,start+1+width*4),y*width*4);
}
const decoded = jsQR(pixels,width,height);
assert(decoded);assert.equal(decoded.data,payload);
process.stdout.write(JSON.stringify({decoded: decoded.data, width, height, format: 'PNG'}));
