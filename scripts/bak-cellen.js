/**
 * Bakt opgehaalde Overpass-cellen in de site.
 *
 * Van de ruwe OSM-JSON gebruikt de app maar twee dingen: de geometrie van de
 * wegen, en de positie plus het nummer van de knooppunten. Alle tags, bounds en
 * node-id-lijsten kunnen weg. Dat scheelt ongeveer 74% aan bestandsgrootte, en
 * met de gzip van GitHub Pages erbij ruim 90%.
 *
 * Wat overblijft is statisch: knooppuntnetwerken veranderen traag, dus dit hoeft
 * hooguit een paar keer per jaar opnieuw. Daarmee vervalt Overpass als
 * afhankelijkheid tijdens het fietsen, en is er ook geen cache-server meer nodig.
 *
 * Gebruik: node scripts/bak-cellen.js [bronmap]
 */
import fs from 'node:fs';
import path from 'node:path';
import { GEWICHTEN } from '../docs/shared/hoogtepunten.js';

const bron = process.argv[2] || 'cache-server/cache';
const doel = 'docs/cellen';

/** Zes decimalen is ongeveer 11 cm; nauwkeuriger opslaan heeft geen zin. */
const rond = (v) => +v.toFixed(6);

/** Alleen wat buildNetwork leest: de vorm van de wegen en de knooppunten. */
function bakNetwerk(elementen) {
  const w = [];
  const n = [];
  for (const el of elementen) {
    if (el.type === 'way') {
      if (!el.geometry || el.geometry.length < 2) continue;
      const c = [];
      // null blijft null: dat markeert een gat in de geometrie buiten het
      // opgevraagde gebied, en daar moet de keten afbreken.
      for (const g of el.geometry) c.push(g ? rond(g.lat) : null, g ? rond(g.lon) : null);
      w.push([el.id, c]);
    } else if (el.type === 'node') {
      const ref = el.tags?.rcn_ref?.trim();
      if (ref) n.push([el.id, ref, rond(el.lat), rond(el.lon)]);
    }
  }
  return { w, n };
}

/** Bezienswaardigheden zijn na het inlezen al klein; sla ze meteen geparst op. */
function bakHoogtepunten(elementen) {
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

fs.mkdirSync(doel, { recursive: true });

const index = [];
let ruwTotaal = 0;
let bakTotaal = 0;

for (const naam of fs.readdirSync(bron).sort()) {
  const soort = naam.startsWith('net_') ? 'net' : naam.startsWith('hl_') ? 'hl' : null;
  if (!soort || !naam.endsWith('.json')) continue;

  const pad = path.join(bron, naam);
  const ruw = fs.readFileSync(pad);
  const elementen = JSON.parse(ruw);
  const gebakken = soort === 'net' ? bakNetwerk(elementen) : bakHoogtepunten(elementen);
  const uit = Buffer.from(JSON.stringify(gebakken));

  fs.writeFileSync(path.join(doel, naam), uit);
  index.push(naam.replace(/\.json$/, ''));
  ruwTotaal += ruw.length;
  bakTotaal += uit.length;
}

// Zonder index zou de app voor elke ontbrekende cel een mislukt verzoek doen.
fs.writeFileSync(path.join(doel, 'index.json'), JSON.stringify(index));

const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
console.log(`${index.length} cellen gebakken naar ${doel}/`);
console.log(`  ruw     ${mb(ruwTotaal)}`);
console.log(`  gebakken ${mb(bakTotaal)}  (${(100 - (bakTotaal / ruwTotaal) * 100).toFixed(0)}% kleiner)`);
