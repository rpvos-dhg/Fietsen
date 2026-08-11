/* global L */

import { STARTGEBIEDEN, rijtijdMinuten } from './shared/startgebieden.js';
import { PDOK, cellsForBbox } from './shared/cellen.js';
import { haversine } from './shared/graph.js';
import { toGpx } from './shared/gpx.js';

const PDOK_WMS = PDOK.wms;
const PDOK_BRT = PDOK.brt;

/* ---------------- rekenwerk in de worker ---------------- */

const werker = new Worker('./werker.js', { type: 'module' });
let volgnummer = 0;
const openstaand = new Map();
let opVoortgangUI = null;

werker.addEventListener('message', (e) => {
  const { id, ok, resultaat, fout, type, ...rest } = e.data;
  if (type === 'voortgang') {
    opVoortgangUI?.(rest);
    return;
  }
  const wacht = openstaand.get(id);
  if (!wacht) return;
  openstaand.delete(id);
  ok ? wacht.klaar(resultaat) : wacht.mis(new Error(fout));
});

function vraag(type, gegevens = {}) {
  const id = ++volgnummer;
  return new Promise((klaar, mis) => {
    openstaand.set(id, { klaar, mis });
    werker.postMessage({ id, type, ...gegevens });
  });
}

/* ---------------- cache-server (optioneel) ---------------- */

const SERVER_SLEUTEL = 'knooppuntroutes.cacheserver';
const cacheServerUrl = () => localStorage.getItem(SERVER_SLEUTEL) || '';
vraag('instellen', { cacheServer: cacheServerUrl() });

const donker = window.matchMedia('(prefers-color-scheme: dark)');

const $ = (id) => document.getElementById(id);

/** Kaartkleuren uit dezelfde tokens als de rest van de interface. */
const kleur = (naam) =>
  getComputedStyle(document.documentElement).getPropertyValue(naam).trim();

const state = {
  anchor: null,        // { lat, lon, naam }
  startgebied: null,   // gekozen fietsgebied voor het genereren
  knooppunten: [],     // alle geladen knooppunten; getekend wordt wat in beeld is
  spookLaag: null,     // de niet-gekozen voorstellen
  spoken: new Map(),   // routeId -> spooklijn
  gekozenId: null,
  zweefTimer: null,
  huidigeRoute: null,  // wat er nu op de kaart staat
  gpxUrl: null,
  volg: null,          // voorgerekende afstanden voor de volgmodus
  volgId: null,        // watchPosition-id; null = locatie staat uit
  laatsteIndex: null,  // waar op de route je de vorige fix zat
  laatsteFix: 0,       // tijdstip van de laatste gps-fix
  watchGestart: 0,     // wanneer de huidige watchPosition begon
  signaalTimer: null,  // bewaakt of er nog fixes binnenkomen
  positieLaag: null,
  centreert: true,
  vorigeFix: null,     // voor het afleiden van de koers uit twee posities
  kaartHoek: 0,        // graden waarover de kaart gedraaid staat, doorlopend
  kaartModus: 'noord', // 'noord' | 'koers' | 'vrij'
  wakeLock: null,
  knooppuntLaag: null, // laag met klikbare knooppunten
  routeLaag: null,
  markerLaag: null,
  laadToken: 0,
};

/* ---------------- kaart ---------------- */

const MAX_ZOOM = 19;

const map = L.map('kaart', { zoomControl: true, maxZoom: MAX_ZOOM }).setView([52.09, 5.11], 11);
window.map = map; // handig om in de console mee te prutsen

/*
 * In het donker de grijze BRT-variant: de standaardkaart is fel wit en gaat op
 * een telefoon in het laatste daglicht staan glanzen. Grijs laat bovendien de
 * oranje routelijn scherper naar voren komen.
 */
const achtergrond = L.tileLayer(PDOK_BRT(donker.matches ? 'grijs' : 'standaard'), {
  maxZoom: MAX_ZOOM,
  attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> BRT Achtergrondkaart, &copy; Kadaster',
}).addTo(map);

// maxZoom moet expliciet: Leaflet gebruikt anders 18 en dan verdwijnen de
// PDOK-lagen zodra je verder inzoomt dan de achtergrondkaart.
const laagNetwerk = L.tileLayer.wms(PDOK_WMS, {
  layers: 'fietsnetwerken',
  format: 'image/png',
  transparent: true,
  version: '1.3.0',
  maxZoom: MAX_ZOOM,
  opacity: 0.85,
  attribution: '&copy; PDOK / Stichting Landelijk Fietsplatform',
}).addTo(map);

const laagKnooppunten = L.tileLayer.wms(PDOK_WMS, {
  layers: 'fietsknooppunten',
  format: 'image/png',
  transparent: true,
  version: '1.3.0',
  maxZoom: MAX_ZOOM,
}).addTo(map);

// Wisselt het systeem van thema, dan volgen de kaartlaag en de al getekende
// route mee; anders blijft een oranje uit het lichte thema op een grijze kaart
// achter.
donker.addEventListener('change', (e) => {
  achtergrond.setUrl(PDOK_BRT(e.matches ? 'grijs' : 'standaard'));
  state.routeLijn?.setStyle({ color: kleur('--route') });
  state.omranding?.setStyle({ color: kleur('--route-omranding') });
});

/*
 * Een eigen pane voor de spooklijnen, met een z-index onder het overlayPane
 * (400) en boven de kaartlagen (200). Zonder dat tekent de SVG-renderer op
 * volgorde van toevoegen en overtekenen de niet-gekozen rondjes juist de route
 * die je gekozen hebt.
 */
map.createPane('spoken');
map.getPane('spoken').style.zIndex = 390;
state.spookLaag = L.layerGroup().addTo(map);
state.routeLaag = L.layerGroup().addTo(map);
state.markerLaag = L.layerGroup().addTo(map);
state.knooppuntLaag = L.layerGroup().addTo(map);

$('laagNetwerk').addEventListener('change', (e) =>
  e.target.checked ? laagNetwerk.addTo(map) : map.removeLayer(laagNetwerk)
);
$('laagKnooppunten').addEventListener('change', (e) =>
  e.target.checked ? laagKnooppunten.addTo(map) : map.removeLayer(laagKnooppunten)
);
$('laagKlikbaar').addEventListener('change', (e) => {
  if (e.target.checked) {
    state.knooppuntLaag.addTo(map);
    if (state.knooppunten.length) tekenKnooppunten();
    else laadKnooppunten();
  } else {
    map.removeLayer(state.knooppuntLaag);
  }
});

/* ---------------- status ---------------- */

/**
 * Zolang een verzoek loopt tonen we hoeveel deelgebieden er nog van Overpass
 * moeten komen, zodat "duurt lang" niet aanvoelt als "hangt".
 */
function volgVoortgang(basis) {
  status(basis);
  opVoortgangUI = (v) => {
    if (v.totaal > 0) {
      status(
        `${basis} — deelgebied ${Math.min(v.klaar + 1, v.totaal)} van ${v.totaal} ophalen bij Overpass…`
      );
    } else {
      status(basis);
    }
  };
  return () => {
    opVoortgangUI = null;
  };
}

function status(tekst, soort = 'werk') {
  const el = $('status');
  if (!tekst) {
    el.classList.add('hidden');
    el.textContent = '';
    return;
  }
  el.className = `block status ${soort}`;
  el.textContent = tekst;
  el.classList.remove('hidden');
}

/* ---------------- plaatsnaam zoeken ---------------- */

/**
 * De PDOK Locatieserver matcht "3512 JE" op de woonplaats Sittard, maar
 * "3512JE" wel correct op de postcode. Daarom de spatie eruit halen.
 */
const normaliseerZoek = (q) => q.replace(/\b(\d{4})\s+([A-Za-z]{2})\b/, '$1$2');

async function geocode(q, rijen = 6) {
  const url =
    `${PDOK.locatieserver}/free?q=${encodeURIComponent(normaliseerZoek(q))}` +
    `&rows=${rijen}&fl=weergavenaam,centroide_ll,type`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Locatieserver HTTP ${r.status}`);
  const j = await r.json();
  return (j.response?.docs || [])
    .map((d) => {
      const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(d.centroide_ll || '');
      return m ? { naam: d.weergavenaam, type: d.type, lon: +m[1], lat: +m[2] } : null;
    })
    .filter(Boolean);
}

/* ---------------- gebied ---------------- */

function zetAnchor(lat, lon, naam) {
  state.anchor = { lat, lon, naam };
  $('gebiedActief').textContent = naam;
  map.setView([lat, lon], Math.max(map.getZoom(), 12));
  laadKnooppunten();
}

async function zoekGebied() {
  const q = $('gebied').value.trim();
  if (!q) return;
  const box = $('gebiedResultaten');
  box.innerHTML = '<button disabled>zoeken…</button>';
  box.classList.remove('hidden');
  try {
    const resultaten = await geocode(q);
    if (!resultaten.length) {
      box.innerHTML = '<button disabled>niets gevonden</button>';
      return;
    }
    box.innerHTML = '';
    for (const res of resultaten) {
      const b = document.createElement('button');
      b.textContent = res.naam;
      b.addEventListener('click', () => {
        box.classList.add('hidden');
        zetAnchor(res.lat, res.lon, res.naam);
      });
      box.appendChild(b);
    }
  } catch (e) {
    box.innerHTML = `<button disabled>${e.message}</button>`;
  }
}

$('zoekGebied').addEventListener('click', zoekGebied);
$('gebied').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    zoekGebied();
  }
});
$('gebruikKaart').addEventListener('click', () => {
  const c = map.getCenter();
  zetAnchor(c.lat, c.lng, `kaartmidden (${c.lat.toFixed(3)}, ${c.lng.toFixed(3)})`);
});

$('straal').addEventListener('input', (e) => {
  $('straalLabel').textContent = `${e.target.value} km`;
});
$('straal').addEventListener('change', laadKnooppunten);

/* ---------------- klikbare knooppunten ---------------- */

function bboxRond(lat, lon, km) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

async function laadKnooppunten() {
  if (!state.anchor || !$('laagKlikbaar').checked) return;
  const token = ++state.laadToken;
  const km = Number($('straal').value);
  const b = bboxRond(state.anchor.lat, state.anchor.lon, km);

  const stop = volgVoortgang('Knooppuntennetwerk laden (eerste keer per gebied duurt minuten, daarna uit cache)');
  try {
    const j = await vraag('knooppunten', { bbox: b });
    stop();
    if (token !== state.laadToken) return;

    state.knooppunten = j.knooppunten;
    tekenKnooppunten();
    status(`${j.knooppunten.length} knooppunten geladen binnen ${km} km van ${state.anchor.naam}.`);
    setTimeout(() => token === state.laadToken && status(''), 4000);
  } catch (e) {
    stop();
    if (token === state.laadToken) status(e.message, 'fout');
  }
}

/**
 * Alleen de knooppunten in beeld krijgen een marker. Een heel gebied tegelijk
 * is al gauw enkele honderden DOM-elementen, wat op een telefoon merkbaar
 * stroef wordt terwijl je toch maar een klein deel ziet.
 */
function tekenKnooppunten() {
  state.knooppuntLaag.clearLayers();
  if (!state.knooppunten.length || !$('laagKlikbaar').checked) return;
  const grenzen = map.getBounds().pad(0.2);
  for (const k of state.knooppunten) {
    if (!grenzen.contains([k.lat, k.lon])) continue;
    const m = L.marker([k.lat, k.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="kp-marker" style="width:24px;height:24px">${k.ref}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
      keyboard: false,
    });
    m.on('click', () => voegToe(k.ref));
    m.bindTooltip(`Knooppunt ${k.ref} — klik om toe te voegen`, { direction: 'top' });
    state.knooppuntLaag.addLayer(m);
  }
}

map.on('moveend zoomend', tekenKnooppunten);

function voegToe(ref) {
  const veld = $('reeks');
  const huidig = veld.value.trim();
  veld.value = huidig ? `${huidig} - ${ref}` : ref;
}

/* ---------------- bewaren op dit apparaat ---------------- */

const OPSLAG = 'knooppuntroutes.bewaard';

/**
 * Bewaarde routes staan volledig in de browser, inclusief hun geometrie. Daarmee
 * overleven ze een herstart van de server, en kan de GPX ook zonder server
 * gemaakt worden — precies wat je nodig hebt als je al onderweg bent.
 */
function laadBewaard() {
  try {
    return JSON.parse(localStorage.getItem(OPSLAG) || '[]');
  } catch {
    return [];
  }
}

function schrijfBewaard(lijst) {
  localStorage.setItem(OPSLAG, JSON.stringify(lijst));
}

/** Zes decimalen is ~11 cm; meer opslaan heeft geen zin en kost ruimte. */
const kort = (coords) => coords.map(([lon, lat]) => [+lon.toFixed(6), +lat.toFixed(6)]);

/**
 * De platte vorm waarin een route de browser in gaat: alles wat nodig is om hem
 * terug te tekenen, een GPX te maken en hem te volgen, zonder de kaartlagen.
 */
function alsPlatteRoute(route) {
  return {
    id: route.id,
    naam: route.naam,
    bewaardOp: new Date().toISOString(),
    meters: route.meters,
    reeks: route.reeks || route.knooppunten.map((k) => k.ref).join(' - '),
    knooppunten: route.knooppunten,
    hoogtepunten: route.hoogtepunten || [],
    legs: route.legs || [],
    waarschuwing: route.waarschuwing || null,
    coords: kort(route.geojson.geometry.coordinates),
  };
}

function bewaarRoute(route) {
  const lijst = laadBewaard();
  if (lijst.some((r) => r.id === route.id)) return { ok: true, dubbel: true };
  lijst.unshift(alsPlatteRoute(route));
  try {
    schrijfBewaard(lijst);
    return { ok: true };
  } catch (e) {
    return { ok: false, fout: `Opslag zit vol (${e.name}). Verwijder eerst een bewaarde route.` };
  }
}

/** Zet een bewaarde route terug in de vorm die de rest van de app verwacht. */
function alsRoute(bewaard) {
  return {
    ...bewaard,
    geojson: {
      type: 'Feature',
      properties: { naam: bewaard.naam, meters: bewaard.meters },
      geometry: { type: 'LineString', coordinates: bewaard.coords },
    },
  };
}

function toonBewaard() {
  const lijst = laadBewaard();
  const blok = $('bewaardBlok');
  const ul = $('bewaardLijst');
  ul.innerHTML = '';
  if (!lijst.length) {
    blok.classList.add('hidden');
    return;
  }
  for (const b of lijst) {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'bewaard-open';
    open.innerHTML =
      `<span class="bewaard-km">${(b.meters / 1000).toFixed(1).replace('.', ',')} km</span>` +
      `<span class="bewaard-meta">${b.knooppunten.length} knooppunten · ` +
      `${new Date(b.bewaardOp).toLocaleDateString('nl-NL')}</span>`;
    open.addEventListener('click', () => {
      const route = alsRoute(b);
      state.spookLaag.clearLayers();
      state.spoken.clear();
      state.gekozenId = b.id;
      toonRoute(route);
      status('');
    });

    const weg = document.createElement('button');
    weg.className = 'bewaard-weg';
    weg.type = 'button';
    weg.setAttribute('aria-label', `Verwijder route van ${(b.meters / 1000).toFixed(1)} km`);
    weg.textContent = 'Verwijder';
    weg.addEventListener('click', () => {
      schrijfBewaard(laadBewaard().filter((r) => r.id !== b.id));
      toonBewaard();
    });

    li.append(open, weg);
    ul.appendChild(li);
  }
  blok.classList.remove('hidden');
}

/* ---------------- de lopende sessie ---------------- */

/*
 * Onderweg is een browsertabblad geen veilige plek. Op een telefoon gooit het
 * systeem de pagina weg zodra je hem in je zak stopt, een bericht beantwoordt of
 * even de kaart-app opent; bij terugkomst begint de webapp overnieuw. Zonder de
 * onderstaande regels sta je dan langs de weg met een leeg beginscherm.
 *
 * Daarom houdt de app de lopende rit apart bij: welke route je volgt, of de
 * volgmodus aanstond, of je positie aanstond en waar de kaart keek. Bij het
 * opstarten wordt dat teruggezet, zodat een tussentijdse herstart hooguit een
 * seconde kost in plaats van je rit.
 */
const SESSIE = 'knooppuntroutes.sessie';
const SESSIE_HOUDBAAR_MS = 24 * 60 * 60 * 1000;

let herstelBezig = false;

function vergeetSessie() {
  localStorage.removeItem(SESSIE);
}

function bewaarSessie() {
  // Tijdens het herstellen niet terugschrijven: dan zou een half opgebouwde
  // toestand de zojuist gelezen sessie overschrijven.
  if (herstelBezig) return;
  // Geen route op het scherm is geen reden om een bewaarde rit weg te gooien:
  // dit moment komt ook langs vlak voordat de pagina herlaadt, en dan is het
  // juist die rit die terug moet komen. Wissen doet alleen vergeetSessie().
  if (!state.huidigeRoute) return;
  const midden = map.getCenter();
  const sessie = {
    bijgewerkt: Date.now(),
    volgmodus: document.body.classList.contains('volgmodus'),
    positie: state.volgId != null,
    centreert: state.centreert,
    kaartModus: state.kaartModus,
    kaartHoek: state.kaartHoek,
    laatstePositie: state.laatstePositie,
    startgebied: state.startgebied,
    anker: state.anchor,
    midden: [midden.lat, midden.lng],
    zoom: map.getZoom(),
    route: alsPlatteRoute(state.huidigeRoute),
  };
  try {
    localStorage.setItem(SESSIE, JSON.stringify(sessie));
  } catch {
    /* Opslag vol: vervelend, maar een rit mag daar niet op stuklopen. */
  }
}

function leesSessie() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(SESSIE) || 'null');
  } catch {
    s = null;
  }
  if (!s?.route?.coords?.length) return null;
  // Een rit van gisteren is geen lopende rit meer; die staat desgewenst bij de
  // bewaarde routes.
  if (Date.now() - (s.bijgewerkt || 0) > SESSIE_HOUDBAAR_MS) {
    localStorage.removeItem(SESSIE);
    return null;
  }
  return s;
}

function herstelSessie() {
  const s = leesSessie();
  if (!s) return;
  herstelBezig = true;
  try {
    state.gekozenId = s.route.id;
    // Zonder dit is onderweg een nieuw rondje maken onmogelijk: het gekozen
    // gebied is dan weg en opnieuw zoeken vraagt een verbinding die je net niet
    // hebt.
    if (s.startgebied) {
      state.startgebied = s.startgebied;
      $('gekozenGebied').textContent = `Start: ${s.startgebied.naam} (bij ${s.startgebied.bij}).`;
    }
    if (s.anker) {
      state.anchor = s.anker;
      $('gebiedActief').textContent = s.anker.naam;
    }
    if (s.laatstePositie) state.laatstePositie = s.laatstePositie;
    toonRoute(alsRoute(s.route));
    if (s.volgmodus) {
      startVolgen();
      // De uitsnede van startVolgen laat de hele route zien; had je de kaart bij
      // je eigen positie staan, dan is dát waar je verder wilt.
      if (s.midden) map.setView(s.midden, s.zoom || map.getZoom(), { animate: false });
      if (DRAAISTANDEN[s.kaartModus]) {
        state.kaartModus = s.kaartModus;
        werkDraaiknopBij();
        // Zonder animatie: je was al gedraaid, dus dit is geen beweging maar de
        // stand waarin je de app verliet.
        if (s.kaartModus !== 'noord' && s.kaartHoek) zetKaartHoek(s.kaartHoek, { direct: true });
      }
      if (s.positie) {
        startPositie();
        // Had je de kaart zelf weggeschoven, dan blijft dat zo, inclusief de
        // knop om weer op jezelf te centreren.
        state.centreert = s.centreert !== false;
        toonKaartknop('volgCentreer', !state.centreert);
      }
      // Met de laatste positie van vóór de onderbreking staat het volgende
      // knooppunt er meteen; anders is het wachten op de eerste nieuwe fix.
      if (!(s.laatstePositie && toonVoortgangUitPositie(s.laatstePositie.lat, s.laatstePositie.lon))) {
        $('volgDetail').textContent = 'Rit hervat na herstart van de app.';
      }
    } else {
      status('De laatste route staat er weer.');
      setTimeout(() => status(''), 4000);
    }
  } finally {
    herstelBezig = false;
  }
  bewaarSessie();
}

/*
 * Het wegvallen van een pagina op een telefoon gaat via pagehide en via
 * visibilitychange, en welke van de twee je krijgt verschilt per systeem — dus
 * allebei. Deze twee zijn de laatste momenten waarop nog iets bewaard kan
 * worden; unload is op iOS onbetrouwbaar.
 */
addEventListener('pagehide', bewaarSessie);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') bewaarSessie();
});

/* ---------------- GPX in de browser ---------------- */

const maakGpx = (route) =>
  toGpx({
    name: route.naam,
    coords: route.geojson.geometry.coordinates,
    chain: route.knooppunten,
  });

/* ---------------- route plannen ---------------- */

function parseReeks(tekst) {
  return tekst
    .split(/[^0-9A-Za-z]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function plan() {
  status('');
  const numbers = parseReeks($('reeks').value);
  if (numbers.length < 2) {
    status('Geef minstens twee knooppunten op, bijvoorbeeld 83 - 84 - 85.', 'fout');
    return;
  }
  if (!state.anchor) {
    status('Kies eerst een startgebied: zoek een plaatsnaam of klik op "Gebruik kaartmidden".', 'fout');
    return;
  }

  const knop = $('plan');
  knop.disabled = true;
  $('resultaat').classList.add('hidden');
  const stop = volgVoortgang(`Route plannen over ${numbers.length} knooppunten`);

  try {
    const j = await vraag('plan', {
      numbers,
      center: { lat: state.anchor.lat, lon: state.anchor.lon },
      radiusKm: Number($('straal').value),
    });
    toonRoute(j);
    status(j.waarschuwing || '', 'fout');
  } catch (e) {
    status(e.message, 'fout');
  } finally {
    stop();
    knop.disabled = false;
  }
}

function toonRoute(route) {
  state.routeLaag.clearLayers();
  state.markerLaag.clearLayers();

  const latlngs = route.geojson.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
  state.omranding = L.polyline(latlngs, {
    color: kleur('--route-omranding'),
    weight: 9,
    opacity: 0.85,
  }).addTo(state.routeLaag);
  const lijn = L.polyline(latlngs, {
    color: kleur('--route'),
    weight: 5,
    opacity: 0.95,
    className: 'route-lijn',
  }).addTo(state.routeLaag);

  // De streepjes-truc tekent de lijn in, maar moet daarna weg: bij verder
  // inzoomen wordt het pad langer dan de dasharray en valt er anders een gat in.
  state.routeLijn = lijn;
  const pad = lijn.getElement?.();
  pad?.addEventListener('animationend', () => pad.classList.remove('route-lijn'), { once: true });

  route.knooppunten.forEach((k, i) => {
    L.marker([k.lat, k.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="kp-marker actief" style="width:28px;height:28px">${k.ref}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
      zIndexOffset: 500,
      // Deze markers zijn opschrift, geen bediening: zonder dit staan er op een
      // route van twintig knooppunten twintig tabstops tussen jou en de
      // volgbalk, en is die met het toetsenbord onbereikbaar.
      keyboard: false,
    })
      .bindTooltip(`${i + 1}. knooppunt ${k.ref}`, { direction: 'top' })
      .addTo(state.markerLaag);
  });

  naarUitsnede(lijn.getBounds());

  // Bij de gestapelde indeling staat de kaart onder het paneel: zonder dit
  // verschijnt de route buiten beeld en lijkt er niets te gebeuren.
  if (window.matchMedia('(max-width: 820px)').matches) {
    $('kaartvak').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('afstand').textContent = (route.meters / 1000).toFixed(1).replace('.', ',');
  $('aantalKnooppunten').textContent =
    `${route.knooppunten.length} knooppunten in ${route.legs.length} etappes`;
  // GPX in de browser bouwen in plaats van bij de server ophalen: zo werkt de
  // download ook voor een bewaarde route en na een herstart van de server.
  if (state.gpxUrl) URL.revokeObjectURL(state.gpxUrl);
  state.gpxUrl = URL.createObjectURL(new Blob([maakGpx(route)], { type: 'application/gpx+xml' }));
  $('gpx').href = state.gpxUrl;
  $('gpx').download = `${route.naam.replace(/[^\w-]+/g, '_')}.gpx`;
  state.huidigeRoute = route;

  const hl = $('hoogtepunten');
  hl.innerHTML = '';
  for (const h of route.hoogtepunten || []) {
    const s = document.createElement('span');
    s.textContent = h.naam ? `${h.naam} (${h.soort})` : h.soort;
    hl.appendChild(s);
  }

  const lijst = $('etappes');
  lijst.innerHTML = '';
  for (const leg of route.legs) {
    const li = document.createElement('li');
    if (leg.source !== 'knooppuntennetwerk' || leg.verdacht) li.classList.add('fallback');
    const label = document.createElement('span');
    label.textContent = `${leg.from} → ${leg.to}`;
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent =
      `${(leg.meters / 1000).toFixed(1)} km` +
      (leg.verdacht ? ' · andere regio?' : '') +
      (leg.source === 'brouter-fallback' ? ' · omleiding' : leg.source === 'hemelsbreed' ? ' · geen pad!' : '');
    li.append(label, val);
    if (leg.warning) li.title = leg.warning;
    else if (leg.verdacht) li.title = 'Ongewoon lange etappe voor twee opeenvolgende knooppunten.';
    lijst.appendChild(li);
  }

  $('resultaat').classList.remove('hidden');
  bewaarSessie();
}

/* ---------------- tabbladen ---------------- */

const TABS = [
  { knop: 'tabGenereer', paneel: 'paneelGenereer' },
  { knop: 'tabZelf', paneel: 'paneelZelf' },
];

function kiesTab(naam) {
  // Een melding hoort bij de handeling die hem opriep. Bleef hij staan, dan las
  // je in het ene tabblad een rode fout over het andere.
  status('');
  for (const t of TABS) {
    const actief = t.knop === naam;
    const knop = $(t.knop);
    knop.classList.toggle('actief', actief);
    knop.setAttribute('aria-selected', String(actief));
    // Alleen het actieve tabblad zit in de tabvolgorde; met de pijltjes
    // wissel je ertussen, zoals een tablist hoort te werken.
    knop.tabIndex = actief ? 0 : -1;
    $(t.paneel).classList.toggle('hidden', !actief);
  }
}

TABS.forEach(({ knop }, i) => {
  $(knop).addEventListener('click', () => kiesTab(knop));
  $(knop).addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const richting = e.key === 'ArrowRight' ? 1 : -1;
    const volgende = TABS[(i + richting + TABS.length) % TABS.length].knop;
    kiesTab(volgende);
    $(volgende).focus();
  });
});

/* ---------------- route laten maken ---------------- */

$('rijtijd').addEventListener('input', (e) => {
  $('rijtijdLabel').textContent = `${e.target.value} min`;
});

/*
 * Welke gebieden met de site zijn meegeleverd. Voor die gebieden is het
 * knooppuntennetwerk er in een seconde; voor de rest moet het bij Overpass
 * vandaan komen en duurt de eerste keer minuten. Dat verschil hoort in de lijst
 * te staan en niet pas te blijken als je op "Maak rondjes" hebt gedrukt.
 */
let meegeleverd = null;
function meegeleverdeCellen() {
  if (!meegeleverd) {
    meegeleverd = fetch(new URL('cellen/index.json', import.meta.url))
      .then((r) => (r.ok ? r.json() : []))
      .then((lijst) => new Set(lijst))
      .catch(() => new Set());
  }
  return meegeleverd;
}

/** Dezelfde uitsnede als de worker gebruikt om te genereren; anders klopt het oordeel niet. */
function cellenVoorGebied(g, km) {
  const straal = Math.max(12, km / 3);
  const dLat = straal / 111.32;
  const dLon = straal / (111.32 * Math.cos((g.lat * Math.PI) / 180));
  return cellsForBbox({
    south: g.lat - dLat,
    west: g.lon - dLon,
    north: g.lat + dLat,
    east: g.lon + dLon,
  });
}

async function isMeegeleverd(g, km) {
  const set = await meegeleverdeCellen();
  return cellenVoorGebied(g, km).every((c) => set.has(`net_${c.y}_${c.x}`));
}

async function zoekGebieden() {
  status('');
  const vanaf = $('vanaf').value.trim();
  const minuten = Number($('rijtijd').value);
  const lijst = $('gebiedenLijst');
  lijst.innerHTML = '<p class="hint">zoeken…</p>';
  /*
   * De plaatsnaamzoeker is het enige onderdeel hier dat een verbinding nodig
   * heeft. De gebieden staan in de app zelf en de kaartcellen komen met de site
   * mee, dus zonder bereik kun je nog steeds een gebied kiezen en een rondje
   * laten maken — als de zoekfout je tenminste niet de weg verspert.
   */
  let melding = '';
  let vertrek = null;
  if (vanaf) {
    try {
      vertrek = (await geocode(vanaf, 1))[0] || null;
      if (!vertrek) melding = `Kon "${vanaf}" niet vinden. Hieronder staan alle gebieden.`;
    } catch {
      melding =
        'Geen verbinding met de plaatsnaamzoeker, dus geen rijtijden. ' +
        'Hieronder staan alle gebieden; een rondje maken werkt ook zonder bereik.';
    }
  }

  try {
    const gebieden = STARTGEBIEDEN.map((g) => {
      if (!vertrek) return { ...g, km: null, minuten: null };
      const km = haversine(vertrek.lat, vertrek.lon, g.lat, g.lon) / 1000;
      return { ...g, km: Math.round(km), minuten: rijtijdMinuten(km) };
    })
      .filter((g) => g.minuten === null || g.minuten <= minuten)
      .sort((a, b) => (a.minuten ?? 0) - (b.minuten ?? 0));

    if (!gebieden.length) {
      lijst.innerHTML = '<p class="hint">Geen gebieden binnen die rijtijd. Zet de schuif hoger.</p>';
      return;
    }
    lijst.innerHTML = '';
    if (melding) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = melding;
      lijst.appendChild(p);
    }
    // Niet iedereen wil de fiets in de auto laden: vanaf het vertrekpunt zelf
    // vertrekken hoort gewoon een van de opties te zijn.
    const opties = vertrek
      ? [
          {
            naam: 'Vanaf hier, zonder auto',
            bij: vertrek.naam,
            lat: vertrek.lat,
            lon: vertrek.lon,
            waarom: `Rondje dat begint bij ${vertrek.naam}.`,
            minuten: 0,
            km: 0,
          },
          ...gebieden,
        ]
      : gebieden;
    const km = Number($('afstandWens').value) || 40;
    for (const g of opties) {
      const b = document.createElement('button');
      b.className = 'gebied';
      const rij = g.minuten ? `${g.minuten} min · ${g.km} km` : g.minuten === 0 ? 'geen autorit' : '';
      // Een eiland bereik je niet met de auto alleen; de geschatte rijtijd gaat
      // tot de kade en zegt niets over de overtocht.
      const extra = g.veerboot ? ` · veerboot vanaf ${g.veerboot}` : '';
      b.innerHTML =
        `<span class="kop"><span class="naam vink">${g.naam}</span>` +
        (rij || extra ? `<span class="rij">${rij}${extra}</span>` : '') +
        `</span><span class="waarom">${g.waarom}</span>`;
      // Zonder eigen naam plakt een schermlezer de losse spans aan elkaar:
      // "Vanaf hier, zonder autogeen autoritRondje dat begint bij…".
      b.setAttribute('aria-label', `${g.naam}${rij ? `, ${rij}` : ''}${extra}. ${g.waarom}`);
      // De uitkomst komt uit een bestand dat nog geladen kan worden; de knop
      // staat er al, de melding komt er zo nodig achteraan bij.
      isMeegeleverd(g, km).then((klaar) => {
        if (klaar) return;
        const wacht = document.createElement('span');
        wacht.className = 'wachttijd';
        wacht.textContent = 'Nog niet meegeleverd: de eerste keer duurt dit gebied enkele minuten.';
        b.appendChild(wacht);
        b.setAttribute('aria-label', `${b.getAttribute('aria-label')} ${wacht.textContent}`);
      });
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        [...lijst.children].forEach((c) => {
          c.classList.remove('actief');
          c.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('actief');
        b.setAttribute('aria-pressed', 'true');
        state.startgebied = g;
        $('gekozenGebied').textContent = `Start: ${g.naam} (bij ${g.bij}).`;
        map.setView([g.lat, g.lon], 12);
        // Vast beginnen met laden terwijl je het aantal kilometers nog invult.
        vraag('opwarmen', { lat: g.lat, lon: g.lon, km: Number($('afstandWens').value) }).catch(
          () => {}
        );
      });
      lijst.appendChild(b);
    }
  } catch (e) {
    lijst.innerHTML = `<p class="hint">${e.message}</p>`;
  }
}

$('zoekGebieden').addEventListener('click', zoekGebieden);
$('vanaf').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    zoekGebieden();
  }
});

async function genereer() {
  status('');
  if (!state.startgebied) {
    status('Kies eerst een gebied uit de lijst.', 'fout');
    return;
  }
  const km = Number($('afstandWens').value);
  const knop = $('genereer');
  knop.disabled = true;
  $('voorstellen').classList.add('hidden');
  $('resultaat').classList.add('hidden');
  const stop = volgVoortgang(`Rondjes van ~${km} km zoeken bij ${state.startgebied.naam}`);

  try {
    const j = await vraag('genereer', {
      km,
      lat: state.startgebied.lat,
      lon: state.startgebied.lon,
    });
    // Zonder de bezienswaardigheden kloppen de routes wel, maar is de volgorde
    // willekeurig in plaats van "mooiste eerst". Dat hoort de gebruiker te weten.
    // De melding gaat mee naar toonVoorstellen: die selecteert het eerste
    // voorstel automatisch, en die selectie zette de statusregel anders meteen
    // weer leeg — waarmee de waarschuwing onzichtbaar werd.
    const melding = j.zonderHoogtepunten
      ? 'Deze rondjes zijn nog niet op bezienswaardigheden gerangschikt: die gegevens ' +
        'waren op tijd niet binnen bij Overpass. Ze worden nu op de achtergrond opgehaald — ' +
        'probeer het over een paar minuten opnieuw voor de mooiste variant.'
      : '';
    toonVoorstellen(j.routes, melding);
  } catch (e) {
    status(e.message, 'fout');
  } finally {
    stop();
    knop.disabled = false;
  }
}

/**
 * De drie voorstellen staan tegelijk op de kaart. Niet-gekozen rondjes zijn
 * neutraal, dun en gestreept: drie signalen die losstaan van kleur, zodat
 * wegwijzerrood van de gekozen route blijft (De Enige Pijl-regel).
 */
function tekenSpooklijnen(routes, gekozenId) {
  state.spookLaag.clearLayers();
  state.spoken.clear();
  for (const r of routes) {
    if (r.id === gekozenId) continue;
    const latlngs = r.geojson.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    const lijn = L.polyline(latlngs, {
      color: kleur('--inkt-zacht'),
      weight: 2,
      opacity: 0.5,
      dashArray: '2 6',
      className: 'route-spook',
      interactive: false,
      pane: 'spoken',
    }).addTo(state.spookLaag);
    state.spoken.set(r.id, lijn);
  }
}

/** Laat één spooklijn naar voren komen zonder hem te kiezen. */
function benadruk(id) {
  for (const [rid, lijn] of state.spoken) {
    const aan = rid === id;
    const el = lijn.getElement?.();
    el?.classList.toggle('route-spook-aan', aan);
  }
}

const rustigeMotie = window.matchMedia('(prefers-reduced-motion: reduce)');
const grofAanwijzen = window.matchMedia('(pointer: coarse)');

/** Glijdt naar een uitsnede in plaats van te springen. */
function naarUitsnede(bounds) {
  if (rustigeMotie.matches) map.fitBounds(bounds, { padding: [40, 40] });
  else map.flyToBounds(bounds, { padding: [40, 40], duration: 0.6 });
}

function toonVoorstellen(routes, melding = '') {
  const bak = $('voorstellen');
  // Een <label> zonder besturingselement betekent niets voor een schermlezer;
  // dit is een kop boven een lijst keuzes.
  bak.innerHTML = '<h2 class="stapkop">3. Kies een rondje</h2>';
  routes.forEach((route, i) => {
    const b = document.createElement('button');
    b.className = 'voorstel';
    const soorten = [...new Set(route.hoogtepunten.map((h) => h.soort))].slice(0, 6);
    // Wat alleen langs dit rondje ligt, is waar je de keuze op maakt.
    const alleenHier = (route.uniek || [])
      .map((h) => h.naam || h.soort)
      .slice(0, 3);
    b.innerHTML =
      `<span class="kop vink">${(route.meters / 1000).toFixed(1).replace('.', ',')} km</span>` +
      `<span class="mee">${route.aantalHoogtepunten} bezienswaardigheden — ${soorten.join(', ')}</span>` +
      (alleenHier.length
        ? `<span class="alleenhier">Alleen hier: ${alleenHier.join(', ')}</span>`
        : '') +
      `<span class="reeks">${route.reeks}</span>`;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      [...bak.querySelectorAll('.voorstel')].forEach((c) => {
        c.classList.remove('actief');
        c.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('actief');
      b.setAttribute('aria-pressed', 'true');
      state.gekozenId = route.id;
      toonRoute(route);
      tekenSpooklijnen(routes, route.id);
      // Een waarschuwing over déze route gaat voor; anders blijft de melding
      // over het hele gebied staan in plaats van te verdwijnen bij de klik.
      if (route.waarschuwing) status(route.waarschuwing, 'fout');
      else status(melding);
    });

    // Zweven laat het rondje oplichten; pas na een korte rust glijdt de kaart
    // mee, zodat langsvegen over de lijst geen reeks vluchten veroorzaakt.
    // De invoertoets gebeurt bij het afvuren: een tik op een aanraakscherm
    // stuurt ook een mouseenter, en die mag de kaart niet verplaatsen.
    b.addEventListener('mouseenter', () => {
      if (grofAanwijzen.matches || route.id === state.gekozenId) return;
      benadruk(route.id);
      clearTimeout(state.zweefTimer);
      state.zweefTimer = setTimeout(() => {
        const lijn = state.spoken.get(route.id);
        if (lijn) naarUitsnede(lijn.getBounds());
      }, 300);
    });
    b.addEventListener('focus', () => benadruk(route.id));
    b.addEventListener('blur', () => benadruk(null));

    bak.appendChild(b);
    if (i === 0) setTimeout(() => b.click(), 0);
  });

  bak.addEventListener('mouseleave', () => {
    if (grofAanwijzen.matches) return;
    clearTimeout(state.zweefTimer);
    benadruk(null);
    if (state.routeLijn) naarUitsnede(state.routeLijn.getBounds());
  });

  bak.classList.remove('hidden');
}

/* ---------------- route volgen op de kaart ---------------- */

const R_AARDE = 6371008.8;
function meters(aLat, aLon, bLat, bLon) {
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLon = (bLon - aLon) * p;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R_AARDE * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Bij het openen van de volgmodus wordt de route één keer voorgerekend: de
 * afstand tot elk punt, en waar elk knooppunt op de lijn ligt. Daarna kost een
 * positie-update alleen nog een scan langs de punten.
 */
function bereidVolgenVoor(route) {
  const coords = route.geojson.geometry.coordinates;
  const cum = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) {
    cum[i] = cum[i - 1] + meters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
  }
  const kpIndex = route.knooppunten.map((k) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = meters(k.lat, k.lon, coords[i][1], coords[i][0]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  });
  return { coords, cum, kpIndex, totaal: cum[cum.length - 1] };
}

/** Eerste punt dat minstens `afstand` meter langs de route ligt. */
function indexOpAfstand(cum, afstand) {
  let laag = 0;
  let hoog = cum.length - 1;
  while (laag < hoog) {
    const mid = (laag + hoog) >> 1;
    if (cum[mid] < afstand) laag = mid + 1;
    else hoog = mid;
  }
  return laag;
}

function scan(volg, lat, lon, van, tot) {
  let best = van;
  let bestD = Infinity;
  for (let i = van; i <= tot; i++) {
    const d = meters(lat, lon, volg.coords[i][1], volg.coords[i][0]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, afstand: bestD };
}

/*
 * Een rondje raakt zichzelf: bij een lus, een parallel fietspad of een stuk dat
 * je heen én terug rijdt ligt het hemelsbreed dichtstbijzijnde punt soms
 * kilometers verderop in de route. Dan springt "nog zoveel km" heen en weer en
 * wijst het volgende knooppunt de verkeerde kant op.
 *
 * Daarom zoeken we eerst in een venster rond waar je de vorige keer zat — een
 * halve kilometer terug voor gps-ruis, anderhalve vooruit voor een lange stilte
 * — en pas als daar niets dichtbij ligt over de hele route. Dat laatste is ook
 * wat er gebeurt als je middenin de rit de app opnieuw opent.
 */
const VENSTER_TERUG_M = 500;
const VENSTER_VOORUIT_M = 1500;
const VENSTER_GOED_M = 120;

function dichtstbijzijndePunt(volg, lat, lon, vorige = null) {
  if (vorige != null && vorige < volg.coords.length) {
    const van = indexOpAfstand(volg.cum, volg.cum[vorige] - VENSTER_TERUG_M);
    const tot = indexOpAfstand(volg.cum, volg.cum[vorige] + VENSTER_VOORUIT_M);
    const dichtbij = scan(volg, lat, lon, van, Math.max(van, tot));
    if (dichtbij.afstand <= VENSTER_GOED_M) return dichtbij;
  }
  return scan(volg, lat, lon, 0, volg.coords.length - 1);
}

const km = (m) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;

function startVolgen() {
  const route = state.huidigeRoute;
  if (!route) return;
  state.volg = bereidVolgenVoor(route);
  state.laatsteIndex = null;
  document.body.classList.add('volgmodus');
  $('volgbalk').classList.remove('hidden');
  state.spookLaag.clearLayers();
  state.spoken.clear();
  map.invalidateSize();
  naarUitsnede(state.routeLijn.getBounds());
  $('volgTitel').textContent = km(route.meters);
  $('volgDetail').textContent = navigator.wakeLock
    ? `${route.knooppunten.length} knooppunten · ${route.reeks || ''}`
    : `${route.knooppunten.length} knooppunten · deze browser houdt het scherm niet wakker`;
  vraagSchermWakker();
  // Het paneel waar de focus stond is nu display:none; zonder deze sprong valt
  // de focus terug op de pagina en begint het tabben weer bovenaan de kaart.
  $('volgbalk').focus({ preventScroll: true });
  bewaarSessie();
}

function stopVolgen() {
  document.body.classList.remove('volgmodus');
  $('volgbalk').classList.add('hidden');
  $('volgbalk').classList.remove('naast-route', 'geen-signaal');
  stopPositie();
  laatSchermLos();
  // Terug in het planscherm hoort de kaart weer op het noorden te staan; een
  // scheve kaart naast een paneel met tekst leest niet.
  kiesDraaistand('noord');
  map.invalidateSize();
  $('volg').focus({ preventScroll: true });
  bewaarSessie();
}

/* --- positie: uitdrukkelijk opt-in, blijft in de browser --- */

const GPS_OPTIES = { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 };

/** Na zoveel stilte is er iets mis genoeg om het te melden. */
const STIL_MELDEN_MS = 20_000;
/** En na zoveel stilte gaan we ervan uit dat de watch zelf is blijven hangen. */
const STIL_HERSTARTEN_MS = 45_000;

function stopPositie() {
  if (state.volgId != null) navigator.geolocation.clearWatch(state.volgId);
  state.volgId = null;
  clearInterval(state.signaalTimer);
  state.signaalTimer = null;
  state.laatsteFix = 0;
  state.positieLaag?.clearLayers();
  state.vorigeFix = null;
  $('volgPositie').setAttribute('aria-pressed', 'false');
  $('volgPositie').setAttribute('aria-label', 'Toon mijn positie op de kaart');
  toonKaartknop('volgCentreer', false);
  $('volgbalk').classList.remove('geen-signaal');
  bewaarSessie();
}

/**
 * In de volgmodus is het paneel verborgen, dus daar komt een melding via
 * status() nooit in beeld. Onderweg is de balk het enige wat je ziet.
 */
function meldOnderweg(tekst) {
  if (document.body.classList.contains('volgmodus')) {
    $('volgTitel').textContent = 'Locatie uit';
    $('volgDetail').textContent = tekst;
  } else {
    status(tekst, 'fout');
  }
}

function startPositie() {
  if (!navigator.geolocation) {
    meldOnderweg('Deze browser kent geen locatiebepaling.');
    return;
  }
  if (!state.positieLaag) state.positieLaag = L.layerGroup().addTo(map);
  state.centreert = true;
  $('volgPositie').setAttribute('aria-pressed', 'true');
  $('volgPositie').setAttribute('aria-label', 'Mijn positie staat aan; tik om hem uit te zetten');

  beginWatch();
  clearInterval(state.signaalTimer);
  state.signaalTimer = setInterval(bewaakSignaal, 5000);
  bewaarSessie();
}

function beginWatch() {
  if (state.volgId != null) navigator.geolocation.clearWatch(state.volgId);
  state.watchGestart = Date.now();
  state.volgId = navigator.geolocation.watchPosition(werkPositieBij, opPositieFout, GPS_OPTIES);
}

/*
 * Alleen een geweigerde toestemming is een reden om ermee te stoppen. Een
 * tunnel, een bosrand of een telefoon die net uit je zak komt levert TIMEOUT of
 * POSITION_UNAVAILABLE op; dat is onderweg doodnormaal en gaat vanzelf over.
 * Daarvoor de hele positieweergave uitzetten — zoals eerder gebeurde — betekent
 * dat je hem met natte handschoenen weer moet aanzetten, precies op het moment
 * dat je hem nodig hebt.
 */
function opPositieFout(err) {
  if (err.code === err.PERMISSION_DENIED) {
    stopPositie();
    meldOnderweg('Geen toegang tot je locatie. De route blijft gewoon op de kaart staan.');
    return;
  }
  bewaakSignaal();
}

/**
 * Sommige browsers laten de watch na een tijd op de achtergrond stilvallen
 * zonder ooit nog een fix of een fout te geven. Alleen opnieuw beginnen helpt
 * dan, dus houden we bij wanneer de laatste fix binnenkwam.
 */
function bewaakSignaal() {
  if (state.volgId == null) return;
  const stil = Date.now() - (state.laatsteFix || state.watchGestart || 0);
  if (stil < STIL_MELDEN_MS) return;

  $('volgbalk').classList.add('geen-signaal');
  $('volgDetail').textContent = `Geen gps-signaal, ${Math.round(stil / 1000)} s stil.`;
  if (!state.laatsteFix) $('volgTitel').textContent = 'Zoeken naar je positie…';

  if (stil > STIL_HERSTARTEN_MS && Date.now() - state.watchGestart > STIL_HERSTARTEN_MS) {
    beginWatch();
  }
}

function werkPositieBij(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  const volg = state.volg;
  state.laatsteFix = Date.now();
  state.laatstePositie = { lat, lon };
  $('volgbalk').classList.remove('geen-signaal');
  state.positieLaag.clearLayers();
  L.circle([lat, lon], {
    radius: Math.max(accuracy, 5),
    color: kleur('--actie'),
    weight: 1,
    opacity: 0.5,
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(state.positieLaag);
  L.marker([lat, lon], {
    icon: L.divIcon({ className: '', html: '<div class="hier"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false,
    interactive: false,
  }).addTo(state.positieLaag);

  if (state.centreert) map.setView([lat, lon], Math.max(map.getZoom(), 15), { animate: false });

  // Meedraaien met de rijrichting. De demping haalt de laatste trilling uit de
  // gps-koers; onder de twee graden gebeurt er niets, anders staat de kaart de
  // hele rit te bibberen.
  const koers = bepaalKoers(pos, lat, lon);
  if (state.kaartModus === 'koers' && koers != null) {
    const verschil = ((-koers - state.kaartHoek + 540) % 360) - 180;
    if (Math.abs(verschil) > 2) draaiNaar(-koers, { demping: 0.6 });
  }

  if (!volg) return;
  const { index, afstand } = dichtstbijzijndePunt(volg, lat, lon, state.laatsteIndex);
  state.laatsteIndex = index;
  const resterend = Math.max(0, volg.totaal - volg.cum[index]);
  const volgendeIdx = volg.kpIndex.findIndex((i) => i > index);
  const volgende =
    volgendeIdx === -1 ? state.huidigeRoute.knooppunten[0] : state.huidigeRoute.knooppunten[volgendeIdx];

  toonVoortgang(volgende.ref, resterend, afstand);
}

/*
 * Wat er onderweg in de balk staat. Ver van de route klopt de projectie op de
 * lijn niet meer — het dichtstbijzijnde punt kan dan overal liggen — en dan is
 * "nog zoveel km" een getal met een stelligheid die het niet waarmaakt. Boven
 * die grens vertelt de balk alleen nog hoe ver je ernaast zit.
 */
const VER_VAN_ROUTE_M = 250;

function toonVoortgang(ref, resterend, afstand) {
  // Ver van de route is het dichtstbijzijnde knooppunt het enige zinnige dat de
  // app nog kan zeggen; op een smal scherm moet die regel kort genoeg blijven om
  // niet afgekapt te worden, dus het nummer gaat naar de titel.
  const ver = afstand > VER_VAN_ROUTE_M;
  $('volgTitel').textContent = ver ? `Dichtstbij: knooppunt ${ref}` : `Volgende: knooppunt ${ref}`;
  // Boven de 60 m ben je van de route af; dat is precies wat je wilt weten als
  // je een afslag mist, en het is het enige wat deze modus je vertelt.
  $('volgDetail').textContent = ver
    ? `${Math.round(afstand)} m van de route`
    : `nog ${km(resterend)}` + (afstand > 60 ? ` · ${Math.round(afstand)} m ernaast` : '');
  $('volgbalk').classList.toggle('naast-route', afstand > 60);
}

/**
 * Na een herstart is er nog geen nieuwe gps-fix, maar de laatste van vóór de
 * onderbreking staat in de sessie. Daarmee staat het eerstvolgende knooppunt er
 * meteen, in plaats van de lengte van de hele route tot de eerste fix binnen is.
 */
function toonVoortgangUitPositie(lat, lon) {
  const volg = state.volg;
  if (!volg) return false;
  const { index, afstand } = dichtstbijzijndePunt(volg, lat, lon, null);
  state.laatsteIndex = index;
  const volgendeIdx = volg.kpIndex.findIndex((i) => i > index);
  const volgende =
    volgendeIdx === -1 ? state.huidigeRoute.knooppunten[0] : state.huidigeRoute.knooppunten[volgendeIdx];
  toonVoortgang(volgende.ref, Math.max(0, volg.totaal - volg.cum[index]), afstand);
  return true;
}

/* --- scherm aan houden tijdens het fietsen --- */

async function vraagSchermWakker() {
  if (state.wakeLock) return;
  try {
    const slot = await navigator.wakeLock?.request('screen');
    if (!slot) return;
    state.wakeLock = slot;
    /*
     * Het systeem laat het slot zelf los zodra het scherm dooft of de app naar
     * de achtergrond gaat. Zonder dit te onthouden denkt de app dat het scherm
     * nog wakker gehouden wordt en vraagt niemand het ooit opnieuw aan — de rest
     * van de rit valt het scherm dan elke minuut in slaap.
     */
    slot.addEventListener?.('release', () => {
      if (state.wakeLock === slot) state.wakeLock = null;
    });
  } catch {
    /* niet beschikbaar of geweigerd; de rit gaat gewoon door */
    state.wakeLock = null;
  }
}
function laatSchermLos() {
  state.wakeLock?.release?.();
  state.wakeLock = null;
}

/*
 * Terug in beeld na een schermvergrendeling of een uitstapje naar een andere
 * app: het slot opnieuw aanvragen, en nagaan of de positiewatch nog leeft.
 * pageshow hoort erbij voor het geval de pagina uit de terug-cache komt.
 */
function hervatNaTerugkeer() {
  if (!document.body.classList.contains('volgmodus')) return;
  vraagSchermWakker();
  if (state.volgId == null) return;
  // Was de app zo lang weg dat er geen verse fix meer is, dan is de watch
  // vrijwel zeker onderweg stilgevallen. Opnieuw beginnen kost niets.
  if (Date.now() - (state.laatsteFix || state.watchGestart) > STIL_MELDEN_MS) beginWatch();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') hervatNaTerugkeer();
});
addEventListener('pageshow', hervatNaTerugkeer);

/* --- de kaart draaien --- */

/*
 * Leaflet kan geen gedraaide kaart. Het draaien gebeurt daarom in CSS, op de
 * kaart als geheel, en twee dingen moeten daarna weer rechtgezet worden:
 *
 * 1. Slepen. Leaflet verschuift de kaartlaag met het verschil tussen twee
 *    vingerposities op het scherm. Staat de kaart scheef, dan hoort dat
 *    verschil eerst teruggedraaid te worden, anders loopt de kaart schuin weg
 *    onder je vinger vandaan.
 * 2. Waar je tikt. Leaflet rekent een schermpunt om naar een punt op de kaart
 *    met de omhullende rechthoek van het element; van een gedraaid element
 *    klopt die niet meer. Daarmee zou knijpzoomen om het verkeerde punt draaien.
 *
 * Beide worden hieronder afgevangen, en alleen zolang de kaart daadwerkelijk
 * scheef staat; recht vooruit blijft het gewone Leaflet.
 */
const DRAAI_MS = 350;
const staatScheef = () => Math.abs(state.kaartHoek % 360) > 0.01;

function roteerPunt(punt, graden) {
  const r = (graden * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return L.point(punt.x * c - punt.y * s, punt.x * s + punt.y * c);
}

const origNaarContainerpunt = map.mouseEventToContainerPoint;
map.mouseEventToContainerPoint = function (e) {
  if (!staatScheef()) return origNaarContainerpunt.call(this, e);
  // De draai gaat om het midden van het element, en dat midden is ook het
  // midden van de omhullende rechthoek — dus vanaf daar rekenen klopt precies.
  const r = this._container.getBoundingClientRect();
  const vanafMidden = L.point(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  return roteerPunt(vanafMidden, -state.kaartHoek).add(
    L.point(this._container.offsetWidth / 2, this._container.offsetHeight / 2)
  );
};

const origVerplaats = L.Draggable.prototype._updatePosition;
L.Draggable.prototype._updatePosition = function () {
  if (staatScheef() && this._element === map._mapPane && this._lastEvent) {
    const e = this._lastEvent;
    const v = e.touches && e.touches.length === 1 ? e.touches[0] : e;
    const verschil = L.point(v.clientX, v.clientY).subtract(this._startPoint);
    this._newPos = this._startPos.add(roteerPunt(verschil, -state.kaartHoek));
  }
  origVerplaats.call(this);
};

/*
 * De draaiknop en "Centreer" horen bij de kaart, niet bij de balk. In de balk
 * duwden ze de tekst naar een tweede regel en aten ze op een klein scherm ruim
 * een kwart van het beeld op — precies wat de volgmodus niet moet doen. Als
 * kaartknop staan ze bovendien binnen de laag die tegendraait, dus ze blijven
 * rechtop staan als de kaart scheef staat.
 */
function kaartknop(id, tekst, opKlik) {
  const bak = L.DomUtil.create('div', 'leaflet-bar kaartknoppen');
  const knop = L.DomUtil.create('button', 'kaartknop', bak);
  knop.id = id;
  knop.type = 'button';
  knop.textContent = tekst;
  L.DomEvent.disableClickPropagation(bak).on(knop, 'click', L.DomEvent.stop).on(knop, 'click', opKlik);
  return bak;
}

const DraaiControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    const bak = kaartknop('volgDraai', 'Noord boven', () => volgendeDraaistand());
    // Tijdens het plannen staat de kaart op het noorden en heeft de knop geen
    // functie; hij verschijnt zodra je gaat volgen of de kaart zelf draait.
    bak.classList.add('alleen-onderweg');
    return bak;
  },
});
const CentreerControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd: () =>
    kaartknop('volgCentreer', 'Centreer', () => {
      state.centreert = true;
      toonKaartknop('volgCentreer', false);
      bewaarSessie();
    }),
});
map.addControl(new DraaiControl());
map.addControl(new CentreerControl());

/** Toont of verbergt een kaartknop mét zijn kadertje; los verbergen laat een leeg vakje staan. */
function toonKaartknop(id, zichtbaar) {
  $(id).parentElement.classList.toggle('hidden', !zichtbaar);
}
toonKaartknop('volgCentreer', false);

const kaartvak = $('kaartvak');

/** De kaart moet zo groot zijn als de diagonaal van zijn venster; zie style.css. */
function zetVakMaten() {
  const b = kaartvak.clientWidth;
  const h = kaartvak.clientHeight;
  const stijl = document.documentElement.style;
  stijl.setProperty('--vakbreedte', `${b}px`);
  stijl.setProperty('--vakhoogte', `${h}px`);
  stijl.setProperty('--kaartzijde', `${Math.ceil(Math.hypot(b, h))}px`);
}

let rechtTimer = null;

function zetKaartHoek(graden, { direct = false } = {}) {
  state.kaartHoek = graden;
  document.documentElement.style.setProperty('--kaartdraai', `${graden.toFixed(2)}deg`);
  document.body.classList.toggle('direct-draaien', direct);
  clearTimeout(rechtTimer);

  if (staatScheef()) {
    if (!document.body.classList.contains('gedraaid')) {
      zetVakMaten();
      document.body.classList.add('gedraaid');
      map.invalidateSize({ pan: false });
    }
    return;
  }
  // Weer recht: pas terugschakelen naar het gewone formaat als de kaart is
  // uitgedraaid, anders springt hij halverwege de animatie.
  rechtTimer = setTimeout(
    () => {
      document.body.classList.remove('gedraaid');
      map.invalidateSize({ pan: false });
    },
    direct ? 0 : DRAAI_MS
  );
}

/** Draait langs de korte kant naar `doel` graden; `demping` tempert gps-ruis. */
function draaiNaar(doel, { direct = false, demping = 1 } = {}) {
  const verschil = ((doel - state.kaartHoek + 540) % 360) - 180;
  zetKaartHoek(state.kaartHoek + verschil * demping, { direct });
}

const DRAAISTANDEN = {
  noord: { tekst: 'Noord boven', uitleg: 'De kaart staat op het noorden.' },
  koers: { tekst: 'Rijrichting', uitleg: 'De kaart draait mee met je rijrichting.' },
  vrij: { tekst: 'Vrij gedraaid', uitleg: 'Je hebt de kaart zelf gedraaid.' },
};

function werkDraaiknopBij() {
  const stand = DRAAISTANDEN[state.kaartModus];
  const knop = $('volgDraai');
  knop.textContent = stand.tekst;
  knop.setAttribute('aria-pressed', String(state.kaartModus === 'koers'));
  knop.setAttribute('aria-label', `Kaartrichting: ${stand.uitleg} Tik voor de volgende stand.`);
}

function kiesDraaistand(modus) {
  state.kaartModus = modus;
  if (modus === 'noord') draaiNaar(0);
  // Meedraaien kan alleen als de app weet waar je heen gaat; zonder positie
  // gebeurt er anders niets en lijkt de knop stuk.
  if (modus === 'koers' && state.volgId == null) startPositie();
  werkDraaiknopBij();
  bewaarSessie();
}

// Vanuit vrij gedraaid eerst terug naar het noorden: dat is het herkenbare
// ijkpunt, en van daaruit is meedraaien één tik verder.
function volgendeDraaistand() {
  kiesDraaistand(state.kaartModus === 'noord' ? 'koers' : 'noord');
}

/*
 * Draaien met twee vingers, tegelijk met knijpzoomen — daar heeft Leaflet geen
 * last van, want het kijkt alleen naar de afstand tussen de vingers en wij
 * alleen naar de hoek. De drempel van tien graden voorkomt dat een gewone
 * knijpbeweging, die nooit helemaal recht is, de kaart ongevraagd scheefzet.
 */
const DRAAIDREMPEL = 10;
let vingerhoek = null;
let vingerdraai = 0;

const hoekTussenVingers = (t) =>
  (Math.atan2(t[1].clientY - t[0].clientY, t[1].clientX - t[0].clientX) * 180) / Math.PI;

$('kaart').addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 2) return;
    vingerhoek = hoekTussenVingers(e.touches);
    vingerdraai = 0;
  },
  { passive: true }
);

$('kaart').addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length !== 2 || vingerhoek == null) return;
    const nu = hoekTussenVingers(e.touches);
    const stap = ((nu - vingerhoek + 540) % 360) - 180;
    vingerhoek = nu;
    vingerdraai += stap;
    if (Math.abs(vingerdraai) < DRAAIDREMPEL) return;
    if (state.kaartModus !== 'vrij') {
      state.kaartModus = 'vrij';
      werkDraaiknopBij();
    }
    zetKaartHoek(state.kaartHoek + stap, { direct: true });
  },
  { passive: true }
);

// Ook bij touchcancel: een telefoongesprek of een systeemveeg haalt de vingers
// weg zonder touchend, en dan zou de kaart in de directe stand blijven hangen.
for (const soort of ['touchend', 'touchcancel']) {
  $('kaart').addEventListener(soort, () => {
    if (vingerhoek == null) return;
    vingerhoek = null;
    document.body.classList.remove('direct-draaien');
    bewaarSessie();
  });
}

/** Kompaskoers van a naar b, in graden vanaf het noorden. */
function peiling(aLat, aLon, bLat, bLon) {
  const p = Math.PI / 180;
  const dLon = (bLon - aLon) * p;
  const y = Math.sin(dLon) * Math.cos(bLat * p);
  const x =
    Math.cos(aLat * p) * Math.sin(bLat * p) -
    Math.sin(aLat * p) * Math.cos(bLat * p) * Math.cos(dLon);
  return (Math.atan2(y, x) / p + 360) % 360;
}

/*
 * De koers van de gps is alleen bruikbaar als je ook echt rijdt: stilstaand
 * levert hij niets dan ruis, en een kaart die dan rondtolt is onbruikbaar.
 * Geeft het toestel geen koers mee — dat komt voor — dan leiden we hem af uit
 * de vorige positie, mits je ver genoeg bent opgeschoven.
 */
const STILSTAND_M_PER_S = 0.8;
const GENOEG_VERPLAATST_M = 8;

function bepaalKoers(pos, lat, lon) {
  const vorig = state.vorigeFix;
  state.vorigeFix = { lat, lon };
  const { heading, speed } = pos.coords;
  if (speed != null && Number.isFinite(speed) && speed < STILSTAND_M_PER_S) return null;
  if (heading != null && Number.isFinite(heading)) return heading;
  if (vorig && meters(vorig.lat, vorig.lon, lat, lon) > GENOEG_VERPLAATST_M) {
    return peiling(vorig.lat, vorig.lon, lat, lon);
  }
  return null;
}

addEventListener('resize', () => {
  zetVakMaten();
  if (staatScheef()) map.invalidateSize({ pan: false });
});
zetVakMaten();
werkDraaiknopBij();

map.on('dragstart', () => {
  if (state.volgId != null) {
    state.centreert = false;
    toonKaartknop('volgCentreer', true);
  }
});

$('volg').addEventListener('click', startVolgen);
$('volgStop').addEventListener('click', stopVolgen);
$('volgPositie').addEventListener('click', () => {
  if (state.volgId != null) stopPositie();
  else startPositie();
});

$('bewaar').addEventListener('click', () => {
  if (!state.huidigeRoute) return;
  const uit = bewaarRoute(state.huidigeRoute);
  if (!uit.ok) {
    status(uit.fout, 'fout');
    return;
  }
  toonBewaard();
  status(uit.dubbel ? 'Deze route stond er al bij.' : 'Bewaard op dit apparaat.');
  setTimeout(() => status(''), 3000);
});

/* ---------------- instellingen en opslag ---------------- */

async function toonOpslag() {
  const { gebruikt } = await vraag('opslag');
  $('opslagInfo').textContent = gebruikt
    ? `${(gebruikt / 1024 / 1024).toFixed(1)} MB op dit apparaat`
    : '';
}

$('cacheserver').value = cacheServerUrl();
$('cacheserverOpslaan').addEventListener('click', async () => {
  const url = $('cacheserver').value.trim().replace(/\/+$/, '');
  // Mixed content: een pagina op https mag geen http-server aanroepen. Draait de
  // app zelf op http (lokaal), dan mag het wel — anders kun je thuis geen
  // cache-server gebruiken.
  if (url.startsWith('http://') && location.protocol === 'https:') {
    status('Deze pagina draait op https, dus de cache-server moet dat ook.', 'fout');
    return;
  }
  if (url) localStorage.setItem(SERVER_SLEUTEL, url);
  else localStorage.removeItem(SERVER_SLEUTEL);
  await vraag('instellen', { cacheServer: url });
  status(url ? `Cache-server ingesteld op ${url}.` : 'Cache-server uitgeschakeld.');
  setTimeout(() => status(''), 3000);
});

$('wisCache').addEventListener('click', async () => {
  await vraag('opruimen');
  await toonOpslag();
  status('Kaartgegevens gewist. Het volgende gebied wordt opnieuw opgehaald.');
  setTimeout(() => status(''), 3000);
});

toonOpslag();
toonBewaard();

$('genereer').addEventListener('click', genereer);

$('plan').addEventListener('click', plan);
$('wis').addEventListener('click', () => {
  $('reeks').value = '';
  state.routeLaag.clearLayers();
  state.markerLaag.clearLayers();
  state.spookLaag.clearLayers();
  state.spoken.clear();
  $('resultaat').classList.add('hidden');
  state.huidigeRoute = null;
  vergeetSessie();
  status('');
});

/*
 * Als laatste, want herstellen tekent een route en kan de volgmodus openen: dan
 * moeten alle kaartlagen, knoppen en luisteraars hierboven al klaarstaan.
 */
herstelSessie();
