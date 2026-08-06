/**
 * Maakt de app-iconen zonder externe beeldbibliotheek: een ronde knooppuntmarker
 * op bordjesgroen, precies de vorm uit DESIGN.md. iOS wil PNG voor het
 * beginscherm, dus een SVG volstaat hier niet.
 *
 * Gebruik: node scripts/maak-iconen.js
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const GROEN = [15, 107, 61]; // --actie #0f6b3d
const WIT = [255, 255, 255];

function crc32(buf) {
  let c;
  const tabel = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabel[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tabel[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function blok(type, data) {
  const lengte = Buffer.alloc(4);
  lengte.writeUInt32BE(data.length);
  const inhoud = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(inhoud));
  return Buffer.concat([lengte, inhoud, crc]);
}

function png(breedte, hoogte, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0);
  ihdr.writeUInt32BE(hoogte, 4);
  ihdr[8] = 8; // bitdiepte
  ihdr[9] = 2; // kleurtype 2 = RGB
  const rijen = [];
  for (let y = 0; y < hoogte; y++) {
    rijen.push(Buffer.from([0])); // filtertype 0
    rijen.push(pixels.subarray(y * breedte * 3, (y + 1) * breedte * 3));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blok('IHDR', ihdr),
    blok('IDAT', deflateSync(Buffer.concat(rijen), { level: 9 })),
    blok('IEND', Buffer.alloc(0)),
  ]);
}

/** Dekking van een pixel, 4x4 bemonsterd zodat de rand niet kartelt. */
function dekking(px, py, test) {
  let raak = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      if (test(px + (sx + 0.5) / 4, py + (sy + 0.5) / 4)) raak++;
    }
  }
  return raak / 16;
}

function maak(maat) {
  const pixels = Buffer.alloc(maat * maat * 3);
  const midden = maat / 2;
  const buiten = maat * 0.34;
  const binnen = maat * 0.22;

  const inRing = (x, y) => {
    const d = Math.hypot(x - midden, y - midden);
    return d <= buiten && d >= binnen;
  };

  for (let y = 0; y < maat; y++) {
    for (let x = 0; x < maat; x++) {
      const a = dekking(x, y, inRing);
      const i = (y * maat + x) * 3;
      for (let k = 0; k < 3; k++) {
        pixels[i + k] = Math.round(GROEN[k] * (1 - a) + WIT[k] * a);
      }
    }
  }
  return png(maat, maat, pixels);
}

for (const maat of [192, 512]) {
  const bestand = `docs/icoon-${maat}.png`;
  writeFileSync(bestand, maak(maat));
  console.log(`${bestand} geschreven`);
}
