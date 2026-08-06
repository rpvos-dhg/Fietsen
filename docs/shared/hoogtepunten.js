import { haversine } from './graph.js';

/**
 * Bezienswaardigheden langs de route: het wegen, samentrekken en opzoeken
 * ervan. Zuiver rekenwerk, dus zowel de browser als de cache-server gebruiken
 * deze module ongewijzigd.
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

/** Binnen deze afstand van de route telt een bezienswaardigheid mee. */
const NABIJ_M = 400;

/** Per etappe telt eenzelfde soort maar beperkt mee. */
const MAX_PER_SOORT = 3;

/** Zet de ruwe Overpass-elementen om in punten met een score. */
export function leesHoogtepunten(elements) {
  const punten = [];
  for (const el of elements || []) {
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
  return punten;
}

/**
 * Trekt bezienswaardigheden van dezelfde soort die vlak bij elkaar liggen samen
 * tot één. In OSM staat een dierenpark als tientallen losse verblijven en een
 * duingebied als een reeks uitzichtpunten; zonder samentrekken telt zo'n plek
 * tienvoudig mee en vult hij in zijn eentje de lijst met wat je onderweg ziet.
 */
const CLUSTER_M = 250;

export function clusterHoogtepunten(punten) {
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
export class HoogtepuntIndex {
  constructor(punten) {
    this.punten = punten;
    this.grid = new Map();
    punten.forEach((p, i) => {
      const k = `${Math.round(p.lat * 200)}/${Math.round(p.lon * 200)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    });
  }

  /** Unieke bezienswaardigheden binnen NABIJ_M van de lijn. */
  langs(coords, stap = 4) {
    const gevonden = new Map();
    for (let i = 0; i < coords.length; i += stap) {
      const [lon, lat] = coords[i];
      const cy = Math.round(lat * 200);
      const cx = Math.round(lon * 200);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (const idx of this.grid.get(`${cy + dy}/${cx + dx}`) || []) {
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
