/**
 * Test de routegenerator: node scripts/genereertest.js [lat] [lon] [km]
 */
import { loadNetworkElements } from '../server/overpass.js';
import { buildNetwork, haversine } from '../server/graph.js';
import { loadHighlights, HighlightIndex } from '../server/highlights.js';
import { bouwKnooppuntGraaf } from '../server/knooppuntgraaf.js';
import { genereerLussen } from '../server/genereer.js';
import { buildRoute } from '../server/route.js';

const lat = Number(process.argv[2] ?? 52.15);
const lon = Number(process.argv[3] ?? 4.7833);
const km = Number(process.argv[4] ?? 43);
const radiusKm = Math.max(12, km / 3);

const dLat = radiusKm / 111.32;
const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
const bbox = { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };

const t0 = Date.now();
const [els, punten] = await Promise.all([loadNetworkElements(bbox), loadHighlights(bbox)]);
console.log(`netwerk: ${els.length} elementen`);
console.log(`bezienswaardigheden: ${punten.length} (samen ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
let t = Date.now();
const soorten = {};
for (const p of punten) soorten[p.soort] = (soorten[p.soort] || 0) + 1;
console.log('  ', Object.entries(soorten).map(([k, v]) => `${k}:${v}`).join(' '));

const net = buildNetwork(els);
const index = new HighlightIndex(punten);

t = Date.now();
const kg = bouwKnooppuntGraaf(net, index);
console.log(`knooppuntgraaf: ${kg.knopen.length} knooppunten (${((Date.now() - t) / 1000).toFixed(1)}s)`);
const graden = kg.randen.map((r) => r.length);
console.log(`  buren per knooppunt: gem ${(graden.reduce((a, b) => a + b, 0) / graden.length).toFixed(1)}, max ${Math.max(...graden)}, zonder buren ${graden.filter((g) => g === 0).length}`);

let startIdx = 0, best = Infinity;
kg.knopen.forEach((k, i) => {
  const d = haversine(lat, lon, k.lat, k.lon);
  if (d < best) { best = d; startIdx = i; }
});
console.log(`start: knooppunt ${kg.knopen[startIdx].ref} op ${(best / 1000).toFixed(1)} km`);

t = Date.now();
const lussen = genereerLussen(kg, startIdx, km * 1000, { aantal: 3 });
console.log(`${lussen.length} rondjes gevonden (${((Date.now() - t) / 1000).toFixed(1)}s)`);

for (const lus of lussen) {
  const chain = lus.pad.map((i) => kg.knopen[i]);
  const route = await buildRoute(net, chain);
  const hl = index.langs(route.coords, 3);
  const namen = hl.filter((h) => h.naam).slice(0, 8).map((h) => `${h.naam} (${h.soort})`);
  console.log(`\n${(route.meters / 1000).toFixed(1)} km — mooiscore ${lus.mooi} (${lus.mooiPerKm.toFixed(1)}/km)`);
  console.log(`  ${chain.map((k) => k.ref).join(' - ')}`);
  console.log(`  ${hl.length} bezienswaardigheden onderweg`);
  if (namen.length) console.log(`  o.a. ${namen.join(', ')}`);
  const raar = route.legs.filter((l) => l.verdacht || l.source !== 'knooppuntennetwerk');
  if (raar.length) console.log(`  LET OP: ${raar.length} verdachte etappes`);
}
