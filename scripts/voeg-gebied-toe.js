/**
 * Voegt een fietsgebied toe aan de meegeleverde kaartcellen.
 *
 * Haalt de ontbrekende cellen bij Overpass op, verdicht ze meteen tot het
 * formaat dat de app leest, en schrijft ze in docs/cellen/. Daarna committen en
 * pushen; vanaf dat moment is het gebied voor iedereen instant, zonder server.
 *
 * Gebruik:
 *   node scripts/voeg-gebied-toe.js "Schoorl" 25
 *   node scripts/voeg-gebied-toe.js 52.018,6.011 20
 *
 * De straal is in kilometers en mag weg; standaard 20.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  cellsForBbox,
  netwerkQuery,
  hoogtepuntQuery,
  OVERPASS_MIRRORS,
  PDOK,
} from '../docs/shared/cellen.js';
import { GEWICHTEN } from '../docs/shared/hoogtepunten.js';

const DOEL = 'docs/cellen';
const UA = 'knooppuntroutes/1.0 (persoonlijk gebruik)';
const rond = (v) => +v.toFixed(6);

const [plaatsArg, straalArg] = process.argv.slice(2);
if (!plaatsArg) {
  console.error('Geef een plaats of "lat,lon" op. Bijvoorbeeld: node scripts/voeg-gebied-toe.js "Schoorl" 25');
  process.exit(1);
}
const straalKm = Number(straalArg) || 20;

/* --- waar ligt het? --- */

async function bepaalMidden(arg) {
  const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(arg.trim());
  if (m) return { lat: +m[1], lon: +m[2], naam: `${m[1]}, ${m[2]}` };

  const vraag = arg.replace(/\b(\d{4})\s+([A-Za-z]{2})\b/, '$1$2');
  const url = `${PDOK.locatieserver}/free?q=${encodeURIComponent(vraag)}&rows=1&fl=weergavenaam,centroide_ll`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Locatieserver HTTP ${r.status}`);
  const doc = (await r.json()).response?.docs?.[0];
  const p = doc && /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll || '');
  if (!p) throw new Error(`Kon "${arg}" niet vinden.`);
  return { lat: +p[2], lon: +p[1], naam: doc.weergavenaam };
}

/* --- Overpass, met mirrors op gezondheid --- */

const STRAF_MS = 5 * 60 * 1000;
const gezondheid = new Map(OVERPASS_MIRRORS.map((ep) => [ep, { falen: 0, strafTot: 0, laatste: 0 }]));

function opVolgorde() {
  const nu = Date.now();
  const gestraft = (s) => (s.strafTot > nu ? 1 : 0);
  return [...OVERPASS_MIRRORS].sort((a, b) => {
    const A = gezondheid.get(a);
    const B = gezondheid.get(b);
    return gestraft(A) - gestraft(B) || B.laatste - A.laatste || A.falen - B.falen;
  });
}

async function viaOverpass(query) {
  let laatsteFout = 'geen mirror geprobeerd';
  for (const ep of opVolgorde()) {
    const s = gezondheid.get(ep);
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(180_000),
      });
      if (!res.ok) {
        laatsteFout = `${ep} → HTTP ${res.status}`;
        s.falen++;
        s.strafTot = Date.now() + STRAF_MS;
        continue;
      }
      const json = await res.json();
      s.falen = 0;
      s.strafTot = 0;
      s.laatste = Date.now();
      return json.elements || [];
    } catch (e) {
      laatsteFout = `${ep} → ${e.message}`;
      s.falen++;
      s.strafTot = Date.now() + STRAF_MS;
    }
  }
  throw new Error(`Overpass niet bereikbaar (${laatsteFout}).`);
}

/* --- verdichten tot wat de app leest --- */

function verdichtNetwerk(elementen) {
  const w = [];
  const n = [];
  for (const el of elementen) {
    if (el.type === 'way') {
      if (!el.geometry || el.geometry.length < 2) continue;
      const c = [];
      for (const g of el.geometry) c.push(g ? rond(g.lat) : null, g ? rond(g.lon) : null);
      w.push([el.id, c]);
    } else if (el.type === 'node') {
      const ref = el.tags?.rcn_ref?.trim();
      if (ref) n.push([el.id, ref, rond(el.lat), rond(el.lon)]);
    }
  }
  return { w, n };
}

function verdichtHoogtepunten(elementen) {
  const punten = [];
  for (const el of elementen) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !el.tags) continue;
    for (const [k, v] of Object.entries(el.tags)) {
      const def = GEWICHTEN[`${k}=${v}`];
      if (!def) continue;
      punten.push([rond(lat), rond(lon), def.label, def.score, el.tags.name || null]);
      break;
    }
  }
  return punten;
}

/* --- uitvoeren --- */

const midden = await bepaalMidden(plaatsArg);
const dLat = straalKm / 111.32;
const dLon = straalKm / (111.32 * Math.cos((midden.lat * Math.PI) / 180));
const cellen = cellsForBbox({
  south: midden.lat - dLat,
  west: midden.lon - dLon,
  north: midden.lat + dLat,
  east: midden.lon + dLon,
});

fs.mkdirSync(DOEL, { recursive: true });
const indexPad = path.join(DOEL, 'index.json');
const index = new Set(fs.existsSync(indexPad) ? JSON.parse(fs.readFileSync(indexPad, 'utf8')) : []);

const taken = [];
for (const cel of cellen) {
  for (const soort of ['net', 'hl']) taken.push({ soort, cel, naam: `${soort}_${cel.y}_${cel.x}` });
}
const teDoen = taken.filter((t) => !index.has(t.naam));

console.log(`${midden.naam} (${midden.lat.toFixed(4)}, ${midden.lon.toFixed(4)}), straal ${straalKm} km`);
console.log(`${taken.length} cellen nodig, ${teDoen.length} nog op te halen\n`);
if (!teDoen.length) {
  console.log('Alles zit er al in. Niets te doen.');
  process.exit(0);
}

// Twee tegelijk: meer staat Overpass per IP niet toe. Het wegennet gaat voor,
// want zonder dat is er geen route.
let volgende = 0;
let klaar = 0;
teDoen.sort((a, b) => (a.soort === b.soort ? 0 : a.soort === 'net' ? -1 : 1));

async function werker() {
  for (;;) {
    const t = teDoen[volgende++];
    if (!t) return;
    const start = Date.now();
    try {
      const query = t.soort === 'net' ? netwerkQuery(t.cel) : hoogtepuntQuery(t.cel);
      const ruw = await viaOverpass(query);
      const data = t.soort === 'net' ? verdichtNetwerk(ruw) : verdichtHoogtepunten(ruw);
      fs.writeFileSync(path.join(DOEL, `${t.naam}.json`), JSON.stringify(data));
      index.add(t.naam);
      fs.writeFileSync(indexPad, JSON.stringify([...index].sort()));
      const aantal = t.soort === 'net' ? `${data.w.length} wegen` : `${data.length} punten`;
      console.log(`  [${++klaar}/${teDoen.length}] ${t.naam}: ${aantal} in ${Math.round((Date.now() - start) / 1000)}s`);
    } catch (e) {
      console.log(`  [${++klaar}/${teDoen.length}] ${t.naam} MISLUKT: ${e.message}`);
    }
  }
}

await Promise.all([werker(), werker()]);

console.log(`\nKlaar. ${index.size} cellen in ${DOEL}/.`);
console.log('Committen en pushen om het gebied live te zetten.');
