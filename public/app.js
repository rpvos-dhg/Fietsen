/* global L */

const PDOK_WMS = 'https://service.pdok.nl/fietsplatform/regionale-fietsnetwerken/wms/v1_0';
const PDOK_BRT = (stijl) =>
  `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${stijl}/EPSG:3857/{z}/{x}/{y}.png`;

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
  positieLaag: null,
  centreert: true,
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
  let gestopt = false;
  const tick = async () => {
    if (gestopt) return;
    try {
      const r = await fetch('/api/voortgang');
      const v = await r.json();
      if (gestopt) return;
      if (v.totaal > 0) {
        status(`${basis} — deelgebied ${Math.min(v.klaar + 1, v.totaal)} van ${v.totaal} ophalen bij Overpass…`);
      } else {
        status(basis);
      }
    } catch {
      /* voortgang is bijzaak */
    }
  };
  tick();
  const timer = setInterval(tick, 2000);
  return () => {
    gestopt = true;
    clearInterval(timer);
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
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'zoeken mislukt');
    if (!j.results.length) {
      box.innerHTML = '<button disabled>niets gevonden</button>';
      return;
    }
    box.innerHTML = '';
    for (const res of j.results) {
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
    const q = new URLSearchParams(b).toString();
    const r = await fetch(`/api/knooppunten?${q}`);
    const j = await r.json();
    stop();
    if (token !== state.laadToken) return;
    if (!r.ok) throw new Error(j.error || 'laden mislukt');

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

function bewaarRoute(route) {
  const lijst = laadBewaard();
  if (lijst.some((r) => r.id === route.id)) return { ok: true, dubbel: true };
  lijst.unshift({
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
  });
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

/* ---------------- GPX in de browser ---------------- */

const esc = (s) =>
  String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]
  );

function maakGpx(route) {
  const wpts = route.knooppunten
    .map(
      (k, i) =>
        `  <wpt lat="${k.lat}" lon="${k.lon}">\n    <name>${esc(k.ref)}</name>\n` +
        `    <desc>Knooppunt ${esc(k.ref)} (${i + 1}e van ${route.knooppunten.length})</desc>\n` +
        `    <sym>Flag</sym>\n  </wpt>`
    )
    .join('\n');
  const pts = route.geojson.geometry.coordinates
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"/>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="knooppuntroutes" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(route.naam)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts}
  <trk>
    <name>${esc(route.naam)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

/* ---------------- route plannen ---------------- */

function parseReeks(tekst) {
  return tekst
    .split(/[^0-9A-Za-z]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function plan() {
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
    const r = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numbers,
        center: { lat: state.anchor.lat, lon: state.anchor.lon },
        radiusKm: Number($('straal').value),
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'route mislukt');
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
    })
      .bindTooltip(`${i + 1}. knooppunt ${k.ref}`, { direction: 'top' })
      .addTo(state.markerLaag);
  });

  naarUitsnede(lijn.getBounds());

  // Bij de gestapelde indeling staat de kaart onder het paneel: zonder dit
  // verschijnt de route buiten beeld en lijkt er niets te gebeuren.
  if (window.matchMedia('(max-width: 820px)').matches) {
    $('kaart').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
}

/* ---------------- tabbladen ---------------- */

const TABS = [
  { knop: 'tabGenereer', paneel: 'paneelGenereer' },
  { knop: 'tabZelf', paneel: 'paneelZelf' },
];

function kiesTab(naam) {
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

async function zoekGebieden() {
  const vanaf = $('vanaf').value.trim();
  const minuten = Number($('rijtijd').value);
  const lijst = $('gebiedenLijst');
  lijst.innerHTML = '<p class="hint">zoeken…</p>';
  try {
    const r = await fetch(
      `/api/startgebieden?vanaf=${encodeURIComponent(vanaf)}&minuten=${minuten}`
    );
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'zoeken mislukt');
    if (!j.gebieden.length) {
      lijst.innerHTML = '<p class="hint">Geen gebieden binnen die rijtijd. Zet de schuif hoger.</p>';
      return;
    }
    lijst.innerHTML = '';
    // Niet iedereen wil de fiets in de auto laden: vanaf het vertrekpunt zelf
    // vertrekken hoort gewoon een van de opties te zijn.
    const opties = j.vertrek
      ? [
          {
            naam: 'Vanaf hier, zonder auto',
            bij: j.vertrek.naam,
            lat: j.vertrek.lat,
            lon: j.vertrek.lon,
            waarom: `Rondje dat begint bij ${j.vertrek.naam}.`,
            minuten: 0,
            km: 0,
          },
          ...j.gebieden,
        ]
      : j.gebieden;
    for (const g of opties) {
      const b = document.createElement('button');
      b.className = 'gebied';
      const rij = g.minuten ? `${g.minuten} min · ${g.km} km` : g.minuten === 0 ? 'geen autorit' : '';
      b.innerHTML =
        `<span class="kop"><span class="naam vink">${g.naam}</span>` +
        (rij ? `<span class="rij">${rij}</span>` : '') +
        `</span><span class="waarom">${g.waarom}</span>`;
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
        fetch('/api/opwarmen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: g.lat, lon: g.lon, km: Number($('afstandWens').value) }),
        }).catch(() => {});
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
    const r = await fetch('/api/genereer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        km,
        start: { lat: state.startgebied.lat, lon: state.startgebied.lon },
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'genereren mislukt');
    toonVoorstellen(j.routes);
    // Zonder de bezienswaardigheden kloppen de routes wel, maar is de volgorde
    // willekeurig in plaats van "mooiste eerst". Dat hoort de gebruiker te weten.
    if (j.zonderHoogtepunten) {
      status(
        'Deze rondjes zijn nog niet op bezienswaardigheden gerangschikt: die gegevens ' +
          'waren op tijd niet binnen bij Overpass. Ze worden nu op de achtergrond opgehaald — ' +
          'probeer het over een paar minuten opnieuw voor de mooiste variant.'
      );
    } else {
      status('');
    }
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

function toonVoorstellen(routes) {
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
      status(route.waarschuwing || '', 'fout');
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

function dichtstbijzijndePunt(volg, lat, lon) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < volg.coords.length; i++) {
    const d = meters(lat, lon, volg.coords[i][1], volg.coords[i][0]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, afstand: bestD };
}

const km = (m) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;

function startVolgen() {
  const route = state.huidigeRoute;
  if (!route) return;
  state.volg = bereidVolgenVoor(route);
  document.body.classList.add('volgmodus');
  $('volgbalk').classList.remove('hidden');
  state.spookLaag.clearLayers();
  state.spoken.clear();
  map.invalidateSize();
  naarUitsnede(state.routeLijn.getBounds());
  $('volgTitel').textContent = km(route.meters);
  $('volgDetail').textContent = `${route.knooppunten.length} knooppunten · ${route.reeks || ''}`;
  vraagSchermWakker();
}

function stopVolgen() {
  document.body.classList.remove('volgmodus');
  $('volgbalk').classList.add('hidden');
  stopPositie();
  laatSchermLos();
  map.invalidateSize();
}

/* --- positie: uitdrukkelijk opt-in, blijft in de browser --- */

function stopPositie() {
  if (state.volgId != null) navigator.geolocation.clearWatch(state.volgId);
  state.volgId = null;
  state.positieLaag?.clearLayers();
  $('volgPositie').setAttribute('aria-pressed', 'false');
  $('volgPositie').textContent = 'Toon mijn positie';
  $('volgCentreer').classList.add('hidden');
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
  $('volgPositie').textContent = 'Positie uit';

  state.volgId = navigator.geolocation.watchPosition(
    (pos) => werkPositieBij(pos),
    (err) => {
      stopPositie();
      meldOnderweg(
        err.code === err.PERMISSION_DENIED
          ? 'Geen toegang tot je locatie. De route blijft gewoon op de kaart staan.'
          : `Locatie niet beschikbaar: ${err.message}`
      );
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
  );
}

function werkPositieBij(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;
  const volg = state.volg;
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

  if (!volg) return;
  const { index, afstand } = dichtstbijzijndePunt(volg, lat, lon);
  const resterend = Math.max(0, volg.totaal - volg.cum[index]);
  const volgendeIdx = volg.kpIndex.findIndex((i) => i > index);
  const volgende =
    volgendeIdx === -1 ? state.huidigeRoute.knooppunten[0] : state.huidigeRoute.knooppunten[volgendeIdx];

  $('volgTitel').textContent = `Volgende: knooppunt ${volgende.ref}`;
  // Boven de 60 m ben je van de route af; dat is precies wat je wilt weten als
  // je een afslag mist, en het is het enige wat deze modus je vertelt.
  $('volgDetail').textContent =
    `nog ${km(resterend)}` + (afstand > 60 ? ` · ${Math.round(afstand)} m van de route` : '');
  $('volgbalk').classList.toggle('naast-route', afstand > 60);
}

/* --- scherm aan houden tijdens het fietsen --- */

async function vraagSchermWakker() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* niet beschikbaar of geweigerd; geen probleem */
  }
}
function laatSchermLos() {
  state.wakeLock?.release?.();
  state.wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.classList.contains('volgmodus')) {
    vraagSchermWakker();
  }
});

map.on('dragstart', () => {
  if (state.volgId != null) {
    state.centreert = false;
    $('volgCentreer').classList.remove('hidden');
  }
});

$('volg').addEventListener('click', startVolgen);
$('volgStop').addEventListener('click', stopVolgen);
$('volgCentreer').addEventListener('click', () => {
  state.centreert = true;
  $('volgCentreer').classList.add('hidden');
});
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
  status('');
});
