/**
 * Eenmalige migratie van de cache van de oude Node-server naar de cache-server.
 *
 * De netwerkcellen zijn ongewijzigd (ruwe OSM-elementen) en worden alleen
 * hernoemd. De highlightcellen niet: de oude server bewaarde al geparste punten
 * `{lat, lon, soort, score, naam}`, terwijl de nieuwe keten in de browser parseert
 * en dus ruwe elementen verwacht. Die punten worden hier terugvertaald naar een
 * minimaal OSM-element met de tag die bij hun soort hoort — voldoende, want de
 * pipeline gebruikt verder alleen positie, soort, score en naam.
 *
 * Gebruik: node scripts/migreer-cache.js [bron] [doel]
 */
import fs from 'node:fs';
import path from 'node:path';
import { GEWICHTEN } from '../docs/shared/hoogtepunten.js';

const bron = process.argv[2] || 'cache';
const doel = process.argv[3] || 'cache-server/cache';

/** Eerste tag die bij een label hoort; varianten delen score en label. */
const tagVoorSoort = new Map();
for (const [sleutel, def] of Object.entries(GEWICHTEN)) {
  if (!tagVoorSoort.has(def.label)) tagVoorSoort.set(def.label, sleutel.split('='));
}

fs.mkdirSync(doel, { recursive: true });
let net = 0;
let hl = 0;
let overgeslagen = 0;
let synthetischId = 1;

for (const naam of fs.readdirSync(bron)) {
  const pad = path.join(bron, naam);

  if (naam.startsWith('cell_')) {
    fs.copyFileSync(pad, path.join(doel, 'net_' + naam.slice(5)));
    net++;
    continue;
  }

  if (!naam.startsWith('hl_')) continue;

  const punten = JSON.parse(fs.readFileSync(pad, 'utf8'));
  if (punten.length && punten[0].type) {
    // Al ruwe elementen: gewoon overnemen.
    fs.copyFileSync(pad, path.join(doel, naam));
    hl++;
    continue;
  }

  const elementen = [];
  for (const p of punten) {
    const tag = tagVoorSoort.get(p.soort);
    if (!tag) {
      overgeslagen++;
      continue;
    }
    const tags = { [tag[0]]: tag[1] };
    if (p.naam) tags.name = p.naam;
    elementen.push({ type: 'node', id: -synthetischId++, lat: p.lat, lon: p.lon, tags });
  }
  fs.writeFileSync(path.join(doel, naam), JSON.stringify(elementen), 'utf8');
  hl++;
}

console.log(
  `${net} netwerkcellen hernoemd, ${hl} highlightcellen omgezet` +
    (overgeslagen ? `, ${overgeslagen} punten zonder bekende soort overgeslagen` : '')
);
