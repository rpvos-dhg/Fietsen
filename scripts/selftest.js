/**
 * Zelftest: haalt een klein gebied op, bouwt de graaf en plant een route.
 * Gebruik: node scripts/selftest.js [lat] [lon] [radiusKm] [83,84,85]
 */
import { loadNetworkElements } from '../server/overpass.js';
import { buildNetwork } from '../server/graph.js';
import { resolveSequence, buildRoute } from '../server/route.js';

const lat = Number(process.argv[2] ?? 52.03);
const lon = Number(process.argv[3] ?? 5.09);
const radiusKm = Number(process.argv[4] ?? 15);
const numbers = (process.argv[5] ?? '').split(',').filter(Boolean);

const dLat = radiusKm / 111.32;
const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
const bbox = { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };

console.log('bbox', bbox);
const t0 = Date.now();
const elements = await loadNetworkElements(bbox, (p) =>
  console.log(`  cel ${p.done}/${p.total}`)
);
console.log(`elementen: ${elements.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log('  ways:', elements.filter((e) => e.type === 'way').length);
console.log('  nodes:', elements.filter((e) => e.type === 'node').length);
const sample = elements.find((e) => e.type === 'way');
console.log('  way-sample keys:', sample && Object.keys(sample), 'geom pts:', sample?.geometry?.length);

const net = buildNetwork(elements);
console.log(`graaf: ${net.lat.length} vertices, ${net.knooppunten.size} unieke knooppuntnummers`);
const refs = [...net.knooppunten.keys()].sort((a, b) => a - b);
console.log('  nummers:', refs.slice(0, 40).join(' '), refs.length > 40 ? '…' : '');

const seq = numbers.length ? numbers : refs.slice(0, 4);
console.log('route over:', seq.join(' - '));
const chain = resolveSequence(net, seq, { lat, lon });
const lats = chain.map((k) => k.lat);
const lons = chain.map((k) => k.lon);
console.log(
  'gekozen keten spant %s x %s km',
  (((Math.max(...lats) - Math.min(...lats)) * 111.32)).toFixed(1),
  (((Math.max(...lons) - Math.min(...lons)) * 68.5)).toFixed(1)
);
console.log('  ' + chain.map((k) => `${k.ref}@${k.lat.toFixed(4)},${k.lon.toFixed(4)}`).join('  '));

const route = await buildRoute(net, chain);
console.log(`totaal: ${(route.meters / 1000).toFixed(1)} km, ${route.coords.length} punten`);
for (const leg of route.legs) {
  console.log(`  ${leg.from} → ${leg.to}: ${(leg.meters / 1000).toFixed(2)} km [${leg.source}]${leg.warning ? ' ' + leg.warning : ''}`);
}
