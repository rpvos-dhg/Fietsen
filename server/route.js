import { haversine, normRef } from './graph.js';
import { BROUTER_URL, USER_AGENT } from './config.js';

const MAX_CANDIDATES = 40;

/**
 * Knooppuntnummers zijn alleen binnen een regio uniek: "83" bestaat in heel
 * Nederland tientallen keren. We kiezen daarom per nummer de variant die de
 * hele reeks zo kort mogelijk maakt (Viterbi over de kandidaten, hemelsbrede
 * kosten als goedkope schatting).
 */
export function resolveSequence(net, rawNumbers, anchor) {
  const numbers = rawNumbers.map(normRef);
  const candidates = numbers.map((ref) => {
    let list = net.knooppunten.get(ref) || [];
    if (list.length > MAX_CANDIDATES) {
      list = [...list]
        .sort(
          (a, b) =>
            haversine(anchor.lat, anchor.lon, a.lat, a.lon) -
            haversine(anchor.lat, anchor.lon, b.lat, b.lon)
        )
        .slice(0, MAX_CANDIDATES);
    }
    return list;
  });

  const missing = numbers.filter((ref, i) => candidates[i].length === 0);
  if (missing.length) {
    const uniq = [...new Set(missing)];
    throw Object.assign(
      new Error(
        `Knooppunt${uniq.length > 1 ? 'en' : ''} ${uniq.join(', ')} niet gevonden in dit gebied. ` +
          `Vergroot de zoekstraal of kies een ander startgebied.`
      ),
      { status: 404, missing: uniq }
    );
  }

  // Hetzelfde nummer mag maar op een plek liggen: een rondje 83…83 moet
  // terugkomen op exact hetzelfde knooppunt, niet op een naamgenoot verderop.
  const groepen = new Map();
  numbers.forEach((n, i) => {
    if (!groepen.has(n)) groepen.set(n, []);
    groepen.get(n).push(i);
  });
  const herhaald = [...groepen.entries()].filter(([, pos]) => pos.length > 1);

  if (!herhaald.length) return viterbi(candidates, anchor).chain;

  // Het eerst herhaalde nummer wordt uitputtend geprobeerd; de rest wordt
  // daarna vastgezet op de gekozen variant en opnieuw doorgerekend.
  const [, eerstePosities] = herhaald[0];
  const varianten = candidates[eerstePosities[0]];
  let beste = null;

  for (const keuze of varianten) {
    const cands = candidates.map((list, i) =>
      eerstePosities.includes(i) ? [keuze] : list
    );
    const res = pinHerhalingen(cands, herhaald.slice(1), anchor);
    if (!beste || res.cost < beste.cost) beste = res;
  }
  return beste.chain;
}

/** Zet herhaalde nummers vast op een variant tot de oplossing stabiel is. */
function pinHerhalingen(candidates, herhaald, anchor) {
  let res = viterbi(candidates, anchor);
  for (let ronde = 0; ronde < 3 && herhaald.length; ronde++) {
    let veranderd = false;
    for (const [, posities] of herhaald) {
      const gekozen = res.chain[posities[0]];
      if (posities.every((p) => res.chain[p] === gekozen)) continue;
      for (const p of posities) candidates[p] = [gekozen];
      veranderd = true;
    }
    if (!veranderd) break;
    res = viterbi(candidates, anchor);
  }
  return res;
}

/**
 * Kosten tussen twee opeenvolgende knooppunten. Kwadratisch in de afstand: twee
 * buurknooppunten liggen zelden verder dan ~10 km uit elkaar, dus een keten met
 * een paar enorme sprongen (typisch: nummers uit twee verschillende regio's door
 * elkaar) moet duurder zijn dan een keten die overal kort is.
 */
function stapKosten(a, b) {
  const km = haversine(a.lat, a.lon, b.lat, b.lon) / 1000;
  return km * km;
}

function viterbi(candidates, anchor) {
  let costs = candidates[0].map(
    (c) => (haversine(anchor.lat, anchor.lon, c.lat, c.lon) / 1000) * 0.5
  );
  const back = [candidates[0].map(() => -1)];

  for (let i = 1; i < candidates.length; i++) {
    const next = new Array(candidates[i].length).fill(Infinity);
    const ptr = new Array(candidates[i].length).fill(-1);
    for (let b = 0; b < candidates[i].length; b++) {
      const cb = candidates[i][b];
      for (let a = 0; a < candidates[i - 1].length; a++) {
        const ca = candidates[i - 1][a];
        const step = costs[a] + stapKosten(ca, cb);
        if (step < next[b]) {
          next[b] = step;
          ptr[b] = a;
        }
      }
    }
    costs = next;
    back.push(ptr);
  }

  let bestIdx = 0;
  for (let i = 1; i < costs.length; i++) if (costs[i] < costs[bestIdx]) bestIdx = i;

  const chain = new Array(candidates.length);
  let idx = bestIdx;
  for (let i = candidates.length - 1; i >= 0; i--) {
    chain[i] = candidates[i][idx];
    idx = back[i][idx];
  }
  return { chain, cost: costs[bestIdx] };
}

async function brouterLeg(from, to) {
  const url =
    `${BROUTER_URL}?lonlats=${from.lon},${from.lat}|${to.lon},${to.lat}` +
    `&profile=trekking&alternativeidx=0&format=geojson`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`BRouter HTTP ${res.status}`);
  const json = await res.json();
  const feat = json.features?.[0];
  if (!feat) throw new Error('BRouter gaf geen route terug');
  const coords = feat.geometry.coordinates.map(([lon, lat]) => [lon, lat]);
  const meters = Number(feat.properties?.['track-length']) || pathLength(coords);
  return { coords, meters };
}

function pathLength(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) {
    m += haversine(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  return m;
}

/** Bouwt de volledige route: per etappe het kortste pad over echte fietspaden. */
export async function buildRoute(net, chain) {
  const legs = [];
  const coords = [];

  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i];
    const b = chain[i + 1];
    let leg = null;

    const path = net.shortestPath(a.vertex, b.vertex);
    if (path && path.coords.length > 1) {
      leg = { coords: path.coords, meters: path.meters, source: 'knooppuntennetwerk' };
    } else {
      // Gat in het netwerk (of ontbrekende OSM-relatie): val terug op een
      // fietsrouteplanner zodat de etappe alsnog fietspaden volgt.
      try {
        const bl = await brouterLeg(a, b);
        leg = { coords: bl.coords, meters: bl.meters, source: 'brouter-fallback' };
      } catch (e) {
        leg = {
          coords: [
            [a.lon, a.lat],
            [b.lon, b.lat],
          ],
          meters: haversine(a.lat, a.lon, b.lat, b.lon),
          source: 'hemelsbreed',
          warning: `Geen fietsroute gevonden tussen ${a.ref} en ${b.ref}: ${e.message}`,
        };
      }
    }

    // Buurknooppunten liggen zelden verder dan ~10 km uit elkaar. Zit er toch
    // zo'n sprong in, dan komt een van de twee vrijwel zeker uit een ander
    // regionetwerk: dan klopt het startgebied niet bij de ingevoerde nummers.
    const hemelsbreed = haversine(a.lat, a.lon, b.lat, b.lon);
    legs.push({
      from: a.ref,
      to: b.ref,
      meters: Math.round(leg.meters),
      source: leg.source,
      warning: leg.warning,
      verdacht: hemelsbreed > 10_000,
    });

    const start = coords.length === 0 ? 0 : 1; // punt niet dubbel opnemen
    for (let k = start; k < leg.coords.length; k++) coords.push(leg.coords[k]);
  }

  const verdacht = legs.filter((l) => l.verdacht);
  return {
    coords,
    legs,
    meters: legs.reduce((s, l) => s + l.meters, 0),
    waarschuwing: verdacht.length
      ? `${verdacht.length} etappe${verdacht.length > 1 ? 's zijn' : ' is'} ongewoon lang ` +
        `(${verdacht.map((l) => `${l.from}→${l.to}`).join(', ')}). ` +
        `Waarschijnlijk hoort een deel van deze nummers bij een ander knooppuntennetwerk: ` +
        `controleer het startgebied.`
      : null,
  };
}
