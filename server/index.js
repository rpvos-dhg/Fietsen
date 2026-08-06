import express from 'express';
import path from 'node:path';
import { ROOT, PORT, PDOK } from './config.js';
import { loadNetworkElements, cellsForBbox, getVoortgang } from './overpass.js';
import { buildNetwork, haversine } from './graph.js';
import { resolveSequence, buildRoute } from './route.js';
import { loadHighlights, HighlightIndex, clusterHighlights } from './highlights.js';
import { bouwKnooppuntGraaf } from './knooppuntgraaf.js';
import { genereerLussen } from './genereer.js';
import { STARTGEBIEDEN, rijtijdMinuten } from './startgebieden.js';
import { toGpx } from './gpx.js';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/leaflet', express.static(path.join(ROOT, 'node_modules/leaflet/dist')));

/** In-memory cache van gebouwde grafen, gesleuteld op de gebruikte cellen. */
const graphCache = new Map();
const graphInflight = new Map();
const routeStore = new Map(); // id -> route (voor GPX-download)

/**
 * De PDOK Locatieserver matcht "3512 JE" op een woonplaats Sittard, maar
 * "3512JE" wel correct op de postcode. Daarom de spatie eruit halen.
 */
function normaliseerZoek(q) {
  return q.replace(/\b(\d{4})\s+([A-Za-z]{2})\b/, '$1$2');
}

function bboxAround(lat, lon, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

async function getNetwork(bbox) {
  const key = cellsForBbox(bbox)
    .map((c) => `${c.y}_${c.x}`)
    .sort()
    .join('|');
  if (graphCache.has(key)) return graphCache.get(key);

  // Klikbare knooppunten en route plannen vragen vaak hetzelfde gebied vlak na
  // elkaar; die moeten op dezelfde bouw wachten in plaats van twee keer te laden.
  const bezig = graphInflight.get(key);
  if (bezig) return bezig;

  const taak = (async () => {
    try {
      const elements = await loadNetworkElements(bbox);
      const net = buildNetwork(elements);
      graphCache.set(key, net);
      return net;
    } finally {
      graphInflight.delete(key);
    }
  })();
  graphInflight.set(key, taak);
  return taak;
}

/**
 * Alles wat nodig is om rondjes te genereren: het netwerk, de
 * bezienswaardigheden en de daarop gescoorde knooppuntgraaf.
 */
const regioCache = new Map();
const regioInflight = new Map();

/** Zolang wacht een verzoek op de bezienswaardigheden voordat het zonder gaat. */
const HOOGTEPUNTEN_BUDGET_MS = 40_000;

async function getRegio(bbox) {
  const key = cellsForBbox(bbox)
    .map((c) => `${c.y}_${c.x}`)
    .sort()
    .join('|');
  if (regioCache.has(key)) return regioCache.get(key);
  const bezig = regioInflight.get(key);
  if (bezig) return bezig;

  const taak = (async () => {
    try {
      // Wegennet en bezienswaardigheden tegelijk ophalen; de slotlimiet in
      // overpass.js zorgt dat we Overpass daarmee niet overvragen.
      const netTaak = getNetwork(bbox);
      const hoogtepuntTaak = loadHighlights(bbox);
      hoogtepuntTaak.catch(() => {}); // mag later alsnog falen zonder ophef

      const net = await netTaak; // zonder wegennet is er geen route
      const t0 = Date.now();

      /*
       * De bezienswaardigheden bepalen alleen wélk rondje het mooist is; zonder
       * die gegevens kun je nog steeds prima fietsen. Ze mogen het antwoord dus
       * niet gijzelen. Duurt Overpass te lang, dan gaan we door met een lege
       * index en blijft het ophalen op de achtergrond doorlopen, zodat het de
       * volgende poging wél uit de cache komt.
       */
      let punten = [];
      let volledig = true;
      try {
        const ruw = await Promise.race([
          hoogtepuntTaak,
          new Promise((_, weiger) =>
            setTimeout(() => weiger(new Error('budget')), HOOGTEPUNTEN_BUDGET_MS)
          ),
        ]);
        punten = clusterHighlights(ruw);
        console.log(`[regio] ${ruw.length} bezienswaardigheden, ${punten.length} na samentrekken`);
      } catch {
        volledig = false;
        console.log('[regio] bezienswaardigheden nog niet binnen; route zonder mooi-score');
      }

      const index = new HighlightIndex(punten);
      const kg = bouwKnooppuntGraaf(net, index);
      console.log(
        `[regio] graaf klaar: ${kg.knopen.length} knooppunten in ${((Date.now() - t0) / 1000).toFixed(1)}s`
      );

      const regio = { net, index, kg, volledig };
      // Een regio zonder mooi-score niet vasthouden: de graaf bouwen kost een
      // fractie van een seconde, en de volgende poging verdient de echte score.
      if (volledig) regioCache.set(key, regio);
      return regio;
    } finally {
      regioInflight.delete(key);
    }
  })();
  regioInflight.set(key, taak);
  return taak;
}

app.get('/api/config', (_req, res) => {
  res.json({ pdok: PDOK });
});

/** Hoeveel deelgebieden er nog van Overpass moeten komen. */
app.get('/api/voortgang', (_req, res) => {
  res.json(getVoortgang());
});

/** Plaatsnaam → coordinaat via de PDOK Locatieserver. */
app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Geef een plaatsnaam op.' });
  try {
    const url = `${PDOK.locatieserver}/free?q=${encodeURIComponent(normaliseerZoek(q))}&rows=6&fl=weergavenaam,centroide_ll,type`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Locatieserver HTTP ${r.status}`);
    const j = await r.json();
    const results = (j.response?.docs || [])
      .map((d) => {
        const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(d.centroide_ll || '');
        if (!m) return null;
        return { naam: d.weergavenaam, type: d.type, lon: +m[1], lat: +m[2] };
      })
      .filter(Boolean);
    res.json({ results });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** Fietsgebieden gesorteerd op geschatte rijtijd vanaf een postcode of plaats. */
app.get('/api/startgebieden', async (req, res) => {
  const q = String(req.query.vanaf || '').trim();
  const maxMinuten = Number(req.query.minuten) || 60;
  try {
    let vertrek = null;
    if (q) {
      const url = `${PDOK.locatieserver}/free?q=${encodeURIComponent(normaliseerZoek(q))}&rows=1&fl=weergavenaam,centroide_ll`;
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const j = await r.json();
      const doc = j.response?.docs?.[0];
      const m = doc && /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll || '');
      if (!m) return res.status(404).json({ error: `Kon "${q}" niet vinden.` });
      vertrek = { naam: doc.weergavenaam, lat: +m[2], lon: +m[1] };
    }

    const gebieden = STARTGEBIEDEN.map((g) => {
      if (!vertrek) return { ...g, km: null, minuten: null };
      const km = haversine(vertrek.lat, vertrek.lon, g.lat, g.lon) / 1000;
      return { ...g, km: Math.round(km), minuten: rijtijdMinuten(km) };
    })
      .filter((g) => g.minuten === null || g.minuten <= maxMinuten)
      .sort((a, b) => (a.minuten ?? 0) - (b.minuten ?? 0));

    res.json({ vertrek, gebieden });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/**
 * Warmt een gebied vast op zodra het gekozen is, terwijl de gebruiker nog het
 * aantal kilometers invult. Antwoordt meteen; het laden loopt door op de
 * achtergrond. Scheelt precies de wachttijd die anders na de klik komt.
 */
app.post('/api/opwarmen', (req, res) => {
  const lat = +req.body?.lat;
  const lon = +req.body?.lon;
  const km = Math.min(Math.max(Number(req.body?.km) || 40, 10), 120);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Ongeldig startpunt.' });
  }
  const bbox = bboxAround(lat, lon, Math.max(12, km / 3));
  getRegio(bbox).catch((e) => console.log(`[opwarmen] ${e.message}`));
  res.status(202).json({ bezig: true });
});

/** Genereert mooie rondjes van ongeveer de gevraagde lengte. */
app.post('/api/genereer', async (req, res) => {
  const km = Math.min(Math.max(Number(req.body?.km) || 40, 10), 120);
  const start = req.body?.start;
  if (!start || !Number.isFinite(+start.lat) || !Number.isFinite(+start.lon)) {
    return res.status(400).json({ error: 'Kies eerst een startgebied.' });
  }
  const lat = +start.lat;
  const lon = +start.lon;
  const radiusKm = Math.max(12, km / 3);

  try {
    const regio = await getRegio(bboxAround(lat, lon, radiusKm));
    const { net, index, kg } = regio;
    if (!kg.knopen.length) {
      return res.status(404).json({ error: 'Geen fietsknooppunten gevonden in dit gebied.' });
    }

    // Dichtstbijzijnde knooppunt bij het opgegeven startpunt.
    let startIdx = 0;
    let besteAfstand = Infinity;
    kg.knopen.forEach((k, i) => {
      const d = haversine(lat, lon, k.lat, k.lon);
      if (d < besteAfstand) {
        besteAfstand = d;
        startIdx = i;
      }
    });

    const lussen = genereerLussen(kg, startIdx, km * 1000, { aantal: 3 });
    if (!lussen.length) {
      return res.status(404).json({
        error:
          `Geen rondje van ongeveer ${km} km gevonden vanaf knooppunt ${kg.knopen[startIdx].ref}. ` +
          `Probeer een andere afstand of een ander startgebied.`,
      });
    }

    const opgebouwd = [];
    for (const lus of lussen) {
      const chain = lus.pad.map((i) => kg.knopen[i]);
      const route = await buildRoute(net, chain);
      const hoogtepunten = index.langs(route.coords, 3);
      opgebouwd.push({ lus, chain, route, hoogtepunten });
    }

    // Welke bezienswaardigheid ligt alleen langs dít rondje? Dat is de vraag
    // waarop je de keuze maakt; het totaalaantal zegt daar weinig over.
    const sleutel = (h) => `${h.lat.toFixed(5)},${h.lon.toFixed(5)}`;
    const perRoute = opgebouwd.map((o) => new Set(o.hoogtepunten.map(sleutel)));

    const routes = opgebouwd.map((o, i) => {
      const { chain, route, hoogtepunten } = o;
      const anderen = perRoute.filter((_, j) => j !== i);
      const id = Math.random().toString(36).slice(2, 10);
      const naam = `Rondje ${Math.round(route.meters / 1000)} km vanaf knooppunt ${chain[0].ref}`;
      routeStore.set(id, { naam, coords: route.coords, chain });

      // Meest bijzondere bezienswaardigheden eerst, met naam als die er is.
      const opValus = (a, b) => b.score - a.score || (b.naam ? 1 : 0) - (a.naam ? 1 : 0);
      // Naamloze punten van dezelfde soort tonen als "uitzichtpunt,
      // uitzichtpunt"; in een opsomming is dat ruis, niet informatie.
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

      const top = zonderHerhaling([...hoogtepunten].sort(opValus), 12);
      const uniek = zonderHerhaling(
        hoogtepunten.filter((h) => !anderen.some((set) => set.has(sleutel(h)))).sort(opValus),
        6
      );

      return {
        id,
        naam,
        meters: route.meters,
        legs: route.legs,
        waarschuwing: route.waarschuwing,
        knooppunten: chain.map((k) => ({ ref: k.ref, lat: k.lat, lon: k.lon })),
        reeks: chain.map((k) => k.ref).join(' - '),
        hoogtepunten: top,
        uniek,
        aantalHoogtepunten: hoogtepunten.length,
        geojson: {
          type: 'Feature',
          properties: { naam, meters: route.meters },
          geometry: { type: 'LineString', coordinates: route.coords },
        },
      };
    });

    while (routeStore.size > 40) routeStore.delete(routeStore.keys().next().value);
    res.json({
      routes,
      startKnooppunt: kg.knopen[startIdx].ref,
      zonderHoogtepunten: !regio.volledig,
    });
  } catch (e) {
    console.error('[genereer]', e);
    res.status(e.status || 502).json({ error: e.message });
  }
});

/** Knooppunten in beeld, om ze aanklikbaar te maken. */
app.get('/api/knooppunten', async (req, res) => {
  const { south, west, north, east } = req.query;
  const bbox = { south: +south, west: +west, north: +north, east: +east };
  if (!Object.values(bbox).every(Number.isFinite)) {
    return res.status(400).json({ error: 'Ongeldige bbox.' });
  }
  try {
    const net = await getNetwork(bbox);
    const out = [];
    for (const list of net.knooppunten.values()) {
      for (const k of list) {
        if (k.lat >= bbox.south && k.lat <= bbox.north && k.lon >= bbox.west && k.lon <= bbox.east) {
          out.push({ ref: k.ref, lat: k.lat, lon: k.lon });
        }
      }
    }
    res.json({ knooppunten: out });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/** Hoofdendpoint: reeks knooppuntnummers → route over echte fietspaden. */
app.post('/api/route', async (req, res) => {
  const numbers = (req.body?.numbers || []).map((n) => String(n).trim()).filter(Boolean);
  const center = req.body?.center;
  const radiusKm = Math.min(Math.max(Number(req.body?.radiusKm) || 25, 5), 80);

  if (numbers.length < 2) {
    return res.status(400).json({ error: 'Geef minstens twee knooppunten op, bijvoorbeeld 83-84-85.' });
  }
  if (!center || !Number.isFinite(+center.lat) || !Number.isFinite(+center.lon)) {
    return res.status(400).json({ error: 'Kies eerst een startgebied (plaatsnaam of klik op de kaart).' });
  }

  const anchor = { lat: +center.lat, lon: +center.lon };
  const bbox = bboxAround(anchor.lat, anchor.lon, radiusKm);

  try {
    const net = await getNetwork(bbox);
    const chain = resolveSequence(net, numbers, anchor);
    const route = await buildRoute(net, chain);

    const id = Math.random().toString(36).slice(2, 10);
    const naam = `Knooppuntroute ${numbers.join('-')}`;
    routeStore.set(id, { naam, coords: route.coords, chain });
    if (routeStore.size > 20) routeStore.delete(routeStore.keys().next().value);

    res.json({
      id,
      naam,
      meters: route.meters,
      legs: route.legs,
      waarschuwing: route.waarschuwing,
      knooppunten: chain.map((k) => ({ ref: k.ref, lat: k.lat, lon: k.lon })),
      geojson: {
        type: 'Feature',
        properties: { naam, meters: route.meters },
        geometry: { type: 'LineString', coordinates: route.coords },
      },
    });
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message, missing: e.missing });
  }
});

app.get('/api/route/:id.gpx', (req, res) => {
  const route = routeStore.get(req.params.id);
  if (!route) return res.status(404).send('Route niet gevonden (server herstart?). Plan hem opnieuw.');
  res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${route.naam.replace(/[^\w-]+/g, '_')}.gpx"`);
  res.send(toGpx({ name: route.naam, coords: route.coords, chain: route.chain }));
});

app.listen(PORT, () => {
  console.log(`Fietsknooppunten draait op http://localhost:${PORT}`);
});
