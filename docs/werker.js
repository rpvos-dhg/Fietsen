/**
 * Al het rekenwerk draait hier, buiten de tekenthread. Een gebied inlezen en de
 * graaf bouwen kost op een telefoon enkele seconden; zonder worker staat het
 * scherm dan stil, precies op het moment dat de gebruiker op een knop drukt.
 */
import {
  haalNetwerk,
  haalHoogtepunten,
  zetCacheServer,
  bijVoortgang,
  wisGebiedscache,
  opslagBeslag,
} from './bronnen.js';
import { buildNetwork, haversine } from './shared/graph.js';
import { clusterHoogtepunten, leesHoogtepunten, HoogtepuntIndex } from './shared/hoogtepunten.js';
import { bouwKnooppuntGraaf } from './shared/knooppuntgraaf.js';
import { genereerLussen } from './shared/genereer.js';
import { resolveSequence, buildRoute } from './shared/route.js';

/** Zolang wacht een verzoek op de bezienswaardigheden voordat het zonder gaat. */
const HOOGTEPUNTEN_BUDGET_MS = 40_000;

bijVoortgang((v) => post({ type: 'voortgang', ...v }));

function post(bericht) {
  self.postMessage(bericht);
}

const regioCache = new Map();
const regioLopend = new Map();

async function regio(bbox) {
  const sleutel = [
    Math.round(bbox.south * 4),
    Math.round(bbox.west * 4),
    Math.round(bbox.north * 4),
    Math.round(bbox.east * 4),
  ].join('|');
  if (regioCache.has(sleutel)) return regioCache.get(sleutel);
  if (regioLopend.has(sleutel)) return regioLopend.get(sleutel);

  const taak = (async () => {
    try {
      const netTaak = haalNetwerk(bbox);
      const hlTaak = haalHoogtepunten(bbox);
      hlTaak.catch(() => {});

      const elementen = await netTaak; // zonder wegennet is er geen route
      const net = buildNetwork(elementen);

      /*
       * De bezienswaardigheden bepalen alleen wélk rondje het mooist is; zonder
       * die gegevens kun je nog steeds prima fietsen. Ze mogen het antwoord dus
       * niet gijzelen. Het ophalen loopt op de achtergrond door, zodat het de
       * volgende poging wél uit de cache komt.
       */
      let punten = [];
      let volledig = true;
      try {
        const ruw = await Promise.race([
          hlTaak,
          new Promise((_, weiger) =>
            setTimeout(() => weiger(new Error('budget')), HOOGTEPUNTEN_BUDGET_MS)
          ),
        ]);
        punten = clusterHoogtepunten(leesHoogtepunten(ruw));
      } catch {
        volledig = false;
      }

      const index = new HoogtepuntIndex(punten);
      const kg = bouwKnooppuntGraaf(net, index);
      const uit = { net, index, kg, volledig };
      // Een regio zonder mooi-score niet vasthouden: de graaf bouwen kost een
      // fractie van een seconde en de volgende poging verdient de echte score.
      if (volledig) regioCache.set(sleutel, uit);
      return uit;
    } finally {
      regioLopend.delete(sleutel);
    }
  })();

  regioLopend.set(sleutel, taak);
  return taak;
}

const zonderHerhaling = (lijst, max) => {
  const gezien = new Set();
  const uit = [];
  for (const h of lijst) {
    const label = h.naam || h.soort;
    if (gezien.has(label)) continue;
    gezien.add(label);
    uit.push({ soort: h.soort, naam: h.naam });
    if (uit.length === max) break;
  }
  return uit;
};

async function maakRouteAntwoord(net, chain, index, naamPrefix) {
  const route = await buildRoute(net, chain);
  const hoogtepunten = index.langs(route.coords, 3);
  return { route, hoogtepunten, naam: naamPrefix };
}

async function genereer({ lat, lon, km }) {
  const straal = Math.max(12, km / 3);
  const dLat = straal / 111.32;
  const dLon = straal / (111.32 * Math.cos((lat * Math.PI) / 180));
  const bbox = { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };

  const { net, index, kg, volledig } = await regio(bbox);
  if (!kg.knopen.length) throw new Error('Geen fietsknooppunten gevonden in dit gebied.');

  let startIdx = 0;
  let beste = Infinity;
  kg.knopen.forEach((k, i) => {
    const d = haversine(lat, lon, k.lat, k.lon);
    if (d < beste) {
      beste = d;
      startIdx = i;
    }
  });

  const lussen = genereerLussen(kg, startIdx, km * 1000, { aantal: 3 });
  if (!lussen.length) {
    throw new Error(
      `Geen rondje van ongeveer ${km} km gevonden vanaf knooppunt ${kg.knopen[startIdx].ref}. ` +
        `Probeer een andere afstand of een ander startgebied.`
    );
  }

  const opgebouwd = [];
  for (const lus of lussen) {
    const chain = lus.pad.map((i) => kg.knopen[i]);
    opgebouwd.push(await maakRouteAntwoord(net, chain, index, null));
    opgebouwd[opgebouwd.length - 1].chain = chain;
  }

  // Welke bezienswaardigheid ligt alleen langs dít rondje? Dat is de vraag
  // waarop je de keuze maakt; het totaalaantal zegt daar weinig over.
  const sleutel = (h) => `${h.lat.toFixed(5)},${h.lon.toFixed(5)}`;
  const perRoute = opgebouwd.map((o) => new Set(o.hoogtepunten.map(sleutel)));
  const opValus = (a, b) => b.score - a.score || (b.naam ? 1 : 0) - (a.naam ? 1 : 0);

  const routes = opgebouwd.map((o, i) => {
    const anderen = perRoute.filter((_, j) => j !== i);
    const naam = `Rondje ${Math.round(o.route.meters / 1000)} km vanaf knooppunt ${o.chain[0].ref}`;
    return {
      id: Math.random().toString(36).slice(2, 10),
      naam,
      meters: o.route.meters,
      legs: o.route.legs,
      waarschuwing: o.route.waarschuwing,
      knooppunten: o.chain.map((k) => ({ ref: k.ref, lat: k.lat, lon: k.lon })),
      reeks: o.chain.map((k) => k.ref).join(' - '),
      hoogtepunten: zonderHerhaling([...o.hoogtepunten].sort(opValus), 12),
      uniek: zonderHerhaling(
        o.hoogtepunten.filter((h) => !anderen.some((s) => s.has(sleutel(h)))).sort(opValus),
        6
      ),
      aantalHoogtepunten: o.hoogtepunten.length,
      geojson: {
        type: 'Feature',
        properties: { naam, meters: o.route.meters },
        geometry: { type: 'LineString', coordinates: o.route.coords },
      },
    };
  });

  return { routes, startKnooppunt: kg.knopen[startIdx].ref, zonderHoogtepunten: !volledig };
}

async function plan({ numbers, center, radiusKm }) {
  const straal = Math.min(Math.max(radiusKm || 25, 5), 80);
  const dLat = straal / 111.32;
  const dLon = straal / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const bbox = {
    south: center.lat - dLat,
    west: center.lon - dLon,
    north: center.lat + dLat,
    east: center.lon + dLon,
  };
  const { net, index } = await regio(bbox);
  const chain = resolveSequence(net, numbers, center);
  const route = await buildRoute(net, chain);
  const hoogtepunten = index.langs(route.coords, 3);
  const opValus = (a, b) => b.score - a.score || (b.naam ? 1 : 0) - (a.naam ? 1 : 0);
  const naam = `Knooppuntroute ${numbers.join('-')}`;
  return {
    id: Math.random().toString(36).slice(2, 10),
    naam,
    meters: route.meters,
    legs: route.legs,
    waarschuwing: route.waarschuwing,
    knooppunten: chain.map((k) => ({ ref: k.ref, lat: k.lat, lon: k.lon })),
    reeks: chain.map((k) => k.ref).join(' - '),
    hoogtepunten: zonderHerhaling([...hoogtepunten].sort(opValus), 12),
    aantalHoogtepunten: hoogtepunten.length,
    geojson: {
      type: 'Feature',
      properties: { naam, meters: route.meters },
      geometry: { type: 'LineString', coordinates: route.coords },
    },
  };
}

async function knooppunten({ bbox }) {
  const { net } = await regio(bbox);
  const uit = [];
  for (const lijst of net.knooppunten.values()) {
    for (const k of lijst) {
      if (k.lat >= bbox.south && k.lat <= bbox.north && k.lon >= bbox.west && k.lon <= bbox.east) {
        uit.push({ ref: k.ref, lat: k.lat, lon: k.lon });
      }
    }
  }
  return { knooppunten: uit };
}

const acties = {
  genereer,
  plan,
  knooppunten,
  opwarmen: async ({ lat, lon, km }) => {
    const straal = Math.max(12, km / 3);
    const dLat = straal / 111.32;
    const dLon = straal / (111.32 * Math.cos((lat * Math.PI) / 180));
    regio({ south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon }).catch(
      () => {}
    );
    return { bezig: true };
  },
  instellen: async ({ cacheServer }) => {
    zetCacheServer(cacheServer);
    return { ok: true };
  },
  opruimen: async () => {
    regioCache.clear();
    await wisGebiedscache();
    return { ok: true };
  },
  opslag: async () => opslagBeslag(),
};

self.addEventListener('message', async (e) => {
  const { id, type, ...rest } = e.data;
  try {
    const actie = acties[type];
    if (!actie) throw new Error(`Onbekende opdracht: ${type}`);
    post({ id, ok: true, resultaat: await actie(rest) });
  } catch (fout) {
    post({ id, ok: false, fout: fout.message });
  }
});
