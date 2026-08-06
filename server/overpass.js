import fs from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, OVERPASS_ENDPOINTS, USER_AGENT, REGION_CACHE_TTL_MS } from './config.js';

/**
 * Het knooppuntennetwerk wordt per vaste cel van 0.25 graden opgehaald en op schijf
 * gecachet. Zo hoeft Overpass (dat vaak overbelast is) maar een keer per gebied
 * bevraagd te worden en zijn latere routes puur lokaal.
 */
const CELL = 0.25;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function cellsForBbox({ south, west, north, east }) {
  const cells = [];
  const y0 = Math.floor(south / CELL);
  const y1 = Math.floor(north / CELL);
  const x0 = Math.floor(west / CELL);
  const x1 = Math.floor(east / CELL);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) cells.push({ y, x });
  }
  return cells;
}

export function cellBbox({ y, x }) {
  return {
    south: +(y * CELL).toFixed(4),
    west: +(x * CELL).toFixed(4),
    north: +((y + 1) * CELL).toFixed(4),
    east: +((x + 1) * CELL).toFixed(4),
  };
}

function cellQuery(cell) {
  const b = cellBbox(cell);
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  // Knooppuntnodes + alle wegen die tot het regionale fietsknooppuntennetwerk horen.
  // Zowel het relatie-model (gebruikelijk in NL) als direct getagde wegen.
  return `[out:json][timeout:180];
rel["type"="route"]["route"="bicycle"]["network"="rcn"](${bbox})->.r;
way(r.r)->.rw;
way["network"="rcn"](${bbox})->.dw;
(.rw; .dw;)->.w;
.w out body geom;
node["rcn_ref"](${bbox});
out body;`;
}

/**
 * Publieke Overpass-instanties geven per IP twee gelijktijdige slots. Alle
 * verzoeken lopen daarom door deze poort, ongeacht of ze van het wegennet of van
 * de bezienswaardigheden komen. Zo kunnen die twee wel tegelijk starten zonder
 * dat we onszelf op 429's trakteren.
 */
const MAX_GELIJKTIJDIG = 2;
let actief = 0;

/*
 * Twee wachtrijen, want niet alles is even dringend. Zonder wegennet is er geen
 * route en staat de gebruiker te wachten; bezienswaardigheden bepalen alleen
 * welk rondje het mooist is. Deelden ze één rij, dan kan een achtergrondklus van
 * een gebied dat allang niet meer gevraagd is de slots bezet houden terwijl het
 * echte antwoord wacht — dat is precies wat er gebeurde.
 */
const wachtrij = { hoog: [], laag: [] };

async function metSlot(fn, prioriteit) {
  if (actief >= MAX_GELIJKTIJDIG) {
    await new Promise((resolve) => wachtrij[prioriteit].push(resolve));
  }
  actief++;
  try {
    return await fn();
  } finally {
    actief--;
    (wachtrij.hoog.shift() || wachtrij.laag.shift())?.();
  }
}

/**
 * Voortgang van het ophalen, zodat de webapp kan laten zien hoe ver het is.
 * De telling zit hier en niet bij de aanroepers, want zowel het wegennet als de
 * bezienswaardigheden komen hierlangs — telde alleen het wegennet mee, dan stond
 * de balk stil tijdens de helft die het langst duurt.
 */
const voortgang = { totaal: 0, klaar: 0 };

export function getVoortgang() {
  return { ...voortgang, bezig: actief };
}

export function overpassFetch(query, prioriteit = 'hoog') {
  voortgang.totaal++;
  return metSlot(() => overpassFetchDirect(query), prioriteit).finally(() => {
    voortgang.klaar++;
    if (voortgang.klaar >= voortgang.totaal) {
      voortgang.totaal = 0;
      voortgang.klaar = 0;
    }
  });
}

/*
 * De mirrors verschillen enorm en wisselend: de ene ligt plat, de andere geeft
 * pas na anderhalve minuut een 504, en een derde antwoordt in 30 seconden. Ze
 * altijd in dezelfde volgorde aflopen kost daardoor minuten per cel voordat we
 * bij de mirror zijn die het wél doet. Daarom onthouden we per mirror hoe het
 * ging: wie net werkte gaat voorop, wie faalde staat een paar minuten in de
 * wachtkamer.
 */
const STRAF_MS = 5 * 60 * 1000;
const gezondheid = new Map(
  OVERPASS_ENDPOINTS.map((ep) => [ep, { falen: 0, strafTot: 0, laatsteSucces: 0 }])
);

function opVolgorde() {
  const nu = Date.now();
  const gestraft = (s) => (s.strafTot > nu ? 1 : 0);
  return [...OVERPASS_ENDPOINTS].sort((a, b) => {
    const A = gezondheid.get(a);
    const B = gezondheid.get(b);
    return (
      gestraft(A) - gestraft(B) ||
      B.laatsteSucces - A.laatsteSucces ||
      A.falen - B.falen
    );
  });
}

async function overpassFetchDirect(query) {
  let lastErr = 'geen endpoint geprobeerd';
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const ep of opVolgorde()) {
      const s = gezondheid.get(ep);
      try {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(query),
          // Een gezonde mirror doet een zware cel in ~30s. Wie er 75 over doet
          // is overbelast; dan zijn we sneller uit bij de volgende.
          signal: AbortSignal.timeout(75_000),
        });
        if (!res.ok) {
          lastErr = `${ep} → HTTP ${res.status}`;
          s.falen++;
          s.strafTot = Date.now() + STRAF_MS;
          continue;
        }
        const json = await res.json();
        s.falen = 0;
        s.strafTot = 0;
        s.laatsteSucces = Date.now();
        return json;
      } catch (e) {
        lastErr = `${ep} → ${e.message}`;
        s.falen++;
        s.strafTot = Date.now() + STRAF_MS;
      }
    }
    if (attempt === 0) await sleep(3000);
  }
  throw new Error(
    `Overpass niet bereikbaar (${lastErr}). Alle publieke mirrors zijn druk; probeer het zo nog eens.`
  );
}

async function readCache(file) {
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > REGION_CACHE_TTL_MS) return null;
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const inflight = new Map();

/** Haalt de ruwe OSM-elementen voor een cel op (uit cache indien mogelijk). */
async function loadCell(cell) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `cell_${cell.y}_${cell.x}.json`);
  const cached = await readCache(file);
  if (cached) return cached;

  // Dezelfde cel kan tegelijk door twee verzoeken gevraagd worden (klikbare
  // knooppunten + route plannen). Een gedeelde belofte voorkomt dat we Overpass
  // twee keer hetzelfde vragen.
  const bezig = inflight.get(file);
  if (bezig) return bezig;

  const taak = (async () => {
    const naam = `cel ${cell.y}/${cell.x}`;
    const t0 = Date.now();
    console.log(`[overpass] ophalen ${naam}…`);
    try {
      const data = await overpassFetch(cellQuery(cell));
      const elements = data.elements || [];
      await fs.writeFile(file, JSON.stringify(elements), 'utf8');
      console.log(
        `[overpass] ${naam} klaar: ${elements.length} elementen in ${((Date.now() - t0) / 1000).toFixed(0)}s`
      );
      return elements;
    } finally {
      inflight.delete(file);
    }
  })();

  inflight.set(file, taak);
  return taak;
}

/**
 * Haalt alle cellen op die de bbox overlappen. Publieke Overpass-instanties geven
 * per IP twee gelijktijdige slots, dus meer parallelisme levert alleen 429's op.
 * Gecachete cellen komen direct van schijf.
 */
const CONCURRENCY = 2;

export async function loadNetworkElements(bbox, onProgress) {
  const cells = cellsForBbox(bbox);
  const results = new Array(cells.length);
  let next = 0;
  let done = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= cells.length) return;
      results[i] = await loadCell(cells[i]);
      onProgress?.({ done: ++done, total: cells.length });
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, cells.length) }, worker));

  const all = [];
  const seen = new Set();
  for (const elements of results) {
    for (const el of elements) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(el);
    }
  }
  return all;
}
