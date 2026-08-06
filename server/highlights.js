import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, REGION_CACHE_TTL_MS } from './config.js';
import { overpassFetch, cellsForBbox, cellBbox } from './overpass.js';
import { haversine } from './graph.js';

/**
 * Bezienswaardigheden langs de route. Hiermee wordt een etappe "mooi" gescoord
 * en kunnen we achteraf vertellen wát je onderweg ziet.
 */
export const GEWICHTEN = {
  'tourism=viewpoint': { score: 6, label: 'uitzichtpunt' },
  'tourism=attraction': { score: 3, label: 'bezienswaardigheid' },
  'tourism=picnic_site': { score: 1, label: 'picknickplek' },
  'historic=castle': { score: 6, label: 'kasteel' },
  'historic=fort': { score: 5, label: 'fort' },
  'historic=ruins': { score: 3, label: 'ruïne' },
  'historic=monument': { score: 2, label: 'monument' },
  'historic=memorial': { score: 1, label: 'gedenkteken' },
  'historic=windmill': { score: 5, label: 'molen' },
  'man_made=windmill': { score: 5, label: 'molen' },
  'man_made=lighthouse': { score: 6, label: 'vuurtoren' },
  'man_made=water_tower': { score: 2, label: 'watertoren' },
  'natural=beach': { score: 5, label: 'strand' },
  'natural=dune': { score: 5, label: 'duin' },
  'natural=peak': { score: 4, label: 'hoogtepunt' },
  'natural=cape': { score: 4, label: 'kaap' },
  'natural=heath': { score: 3, label: 'heide' },
  'leisure=nature_reserve': { score: 4, label: 'natuurgebied' },
  'natural=wood': { score: 2, label: 'bos' },
  'landuse=forest': { score: 2, label: 'bos' },
};

const SOORTEN = [
  ['tourism', '^(viewpoint|attraction|picnic_site)$'],
  ['historic', '^(castle|fort|ruins|monument|memorial|windmill)$'],
  ['man_made', '^(windmill|lighthouse|water_tower)$'],
  ['natural', '^(beach|dune|peak|cape|heath)$'],
  ['leisure', '^(nature_reserve)$'],
];

/**
 * Bos alleen als het een naam heeft. Zonder die eis levert een enkele cel
 * tienduizenden naamloze bosperceeltjes op: dat maakt de query loodzwaar en
 * overstemt de echte bezienswaardigheden volledig.
 */
const BENOEMD = [
  ['natural', '^(wood)$'],
  ['landuse', '^(forest)$'],
];

/** Per etappe telt eenzelfde soort maar beperkt mee, zodat één bosrijk stuk
 *  niet de hele score bepaalt. */
const MAX_PER_SOORT = 3;

/** Binnen deze afstand van de route telt een bezienswaardigheid mee. */
const NABIJ_M = 400;

function cellQuery(cell) {
  const b = cellBbox(cell);
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  const delen = [
    ...SOORTEN.map(([k, v]) => `  nwr["${k}"~"${v}"](${bbox});`),
    ...BENOEMD.map(([k, v]) => `  nwr["${k}"~"${v}"]["name"](${bbox});`),
  ].join('\n');
  return `[out:json][timeout:180];\n(\n${delen}\n);\nout center tags;`;
}

async function loadCell(cell) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `hl_${cell.y}_${cell.x}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs < REGION_CACHE_TTL_MS) {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    }
  } catch {
    /* nog niet gecachet */
  }

  const naam = `cel ${cell.y}/${cell.x}`;
  const t0 = Date.now();
  console.log(`[hoogtepunten] ophalen ${naam}…`);
  // Lage prioriteit: het wegennet moet eerst, anders wacht de route op iets
  // wat alleen de volgorde van de voorstellen bepaalt.
  const data = await overpassFetch(cellQuery(cell), 'laag');
  const punten = [];
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null || !el.tags) continue;
    for (const [k, v] of Object.entries(el.tags)) {
      const def = GEWICHTEN[`${k}=${v}`];
      if (!def) continue;
      punten.push({ lat, lon, soort: def.label, score: def.score, naam: el.tags.name || null });
      break;
    }
  }
  await fs.writeFile(file, JSON.stringify(punten), 'utf8');
  console.log(
    `[hoogtepunten] ${naam} klaar: ${punten.length} punten in ${((Date.now() - t0) / 1000).toFixed(0)}s`
  );
  return punten;
}

const inflight = new Map();

const CONCURRENCY = 2;

export async function loadHighlights(bbox) {
  const cells = cellsForBbox(bbox);
  const uitkomst = new Array(cells.length);
  let volgende = 0;

  async function worker() {
    for (;;) {
      const i = volgende++;
      if (i >= cells.length) return;
      const sleutel = `${cells[i].y}_${cells[i].x}`;
      let p = inflight.get(sleutel);
      if (!p) {
        p = loadCell(cells[i]).finally(() => inflight.delete(sleutel));
        inflight.set(sleutel, p);
      }
      uitkomst[i] = await p;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cells.length) }, worker));
  return uitkomst.flat();
}

/**
 * Trekt bezienswaardigheden van dezelfde soort die vlak bij elkaar liggen samen
 * tot één. In OSM staat een dierenpark als tientallen losse verblijven en een
 * duingebied als een reeks uitzichtpunten; zonder samentrekken telt zo'n plek
 * tienvoudig mee in de score en vult hij in zijn eentje de lijst met wat je
 * onderweg ziet. Het hoogst gewaardeerde en benoemde exemplaar blijft staan.
 */
const CLUSTER_M = 250;

export function clusterHighlights(punten) {
  const gesorteerd = [...punten].sort(
    (a, b) => b.score - a.score || (b.naam ? 1 : 0) - (a.naam ? 1 : 0)
  );
  const raster = new Map();
  const behouden = [];

  for (const p of gesorteerd) {
    const cy = Math.round(p.lat * 400);
    const cx = Math.round(p.lon * 400);
    let dubbel = false;
    for (let dy = -1; dy <= 1 && !dubbel; dy++) {
      for (let dx = -1; dx <= 1 && !dubbel; dx++) {
        for (const q of raster.get(`${cy + dy}/${cx + dx}`) || []) {
          if (q.soort === p.soort && haversine(p.lat, p.lon, q.lat, q.lon) <= CLUSTER_M) {
            dubbel = true;
            break;
          }
        }
      }
    }
    if (dubbel) continue;
    behouden.push(p);
    const sleutel = `${cy}/${cx}`;
    if (!raster.has(sleutel)) raster.set(sleutel, []);
    raster.get(sleutel).push(p);
  }
  return behouden;
}

/** Rasterindex zodat "wat ligt er vlak bij dit punt" goedkoop blijft. */
export class HighlightIndex {
  constructor(punten) {
    this.punten = punten;
    this.grid = new Map();
    punten.forEach((p, i) => {
      const k = `${Math.round(p.lat * 200)}/${Math.round(p.lon * 200)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    });
  }

  /** Unieke bezienswaardigheden binnen NABIJ_M van de lijn (op punten bemonsterd). */
  langs(coords, stap = 4) {
    const gevonden = new Map();
    for (let i = 0; i < coords.length; i += stap) {
      const [lon, lat] = coords[i];
      const cy = Math.round(lat * 200);
      const cx = Math.round(lon * 200);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = this.grid.get(`${cy + dy}/${cx + dx}`);
          if (!bucket) continue;
          for (const idx of bucket) {
            if (gevonden.has(idx)) continue;
            const p = this.punten[idx];
            if (haversine(lat, lon, p.lat, p.lon) <= NABIJ_M) gevonden.set(idx, p);
          }
        }
      }
    }
    return [...gevonden.values()];
  }

  score(coords) {
    const perSoort = new Map();
    let som = 0;
    // Hoogste score eerst, zodat de kap de mooiste exemplaren overhoudt.
    for (const p of this.langs(coords).sort((a, b) => b.score - a.score)) {
      const n = perSoort.get(p.soort) || 0;
      if (n >= MAX_PER_SOORT) continue;
      perSoort.set(p.soort, n + 1);
      som += p.score;
    }
    return som;
  }
}
