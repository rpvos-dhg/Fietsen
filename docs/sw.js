/*
 * Twee heel verschillende dingen worden hier bewaard.
 *
 * De app zelf gaat in een versie-cache: bij een nieuwe versie wordt de oude in
 * zijn geheel weggegooid. Zo kan er nooit een halve mix van oud en nieuw
 * ontstaan.
 *
 * Kaarttegels gaan in een aparte, blijvende cache met een eigen limiet. Die zijn
 * onderweg het waardevolst: heb je een gebied eenmaal bekeken, dan blijft de
 * kaart zichtbaar als het bereik wegvalt. Ze verlopen niet met een nieuwe versie
 * van de app, want de tegels zelf veranderen daar niet van.
 */
const VERSIE = 'v3';
const APP_CACHE = `knooppuntroutes-${VERSIE}`;
const TEGEL_CACHE = 'knooppuntroutes-tegels';
const MAX_TEGELS = 3000;

const SCHIL = [
  './',
  './index.html',
  './app.js',
  './werker.js',
  './bronnen.js',
  './style.css',
  './manifest.webmanifest',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './shared/cellen.js',
  './shared/graph.js',
  './shared/knooppuntgraaf.js',
  './shared/genereer.js',
  './shared/route.js',
  './shared/hoogtepunten.js',
  './shared/startgebieden.js',
  './shared/gpx.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(SCHIL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((namen) =>
        Promise.all(
          namen
            .filter((n) => n.startsWith('knooppuntroutes-') && n !== APP_CACHE && n !== TEGEL_CACHE)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Houdt de tegelcache begrensd; oudste eruit. */
async function snoei(cache) {
  const sleutels = await cache.keys();
  if (sleutels.length <= MAX_TEGELS) return;
  for (const s of sleutels.slice(0, sleutels.length - MAX_TEGELS)) await cache.delete(s);
}

const isTegel = (url) =>
  url.hostname === 'service.pdok.nl' &&
  (url.pathname.includes('/wmts/') || url.searchParams.has('BBOX') || url.searchParams.has('bbox'));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Kaarttegels: eerst uit de cache, anders van het net en dan bewaren. Zo
  // blijft de kaart staan waar je al geweest bent, ook zonder bereik.
  if (isTegel(url)) {
    e.respondWith(
      caches.open(TEGEL_CACHE).then(async (cache) => {
        const uitCache = await cache.match(e.request);
        if (uitCache) return uitCache;
        const res = await fetch(e.request);
        if (res.ok) {
          await cache.put(e.request, res.clone());
          snoei(cache);
        }
        return res;
      })
    );
    return;
  }

  // Overpass, BRouter en de Locatieserver nooit cachen: die antwoorden worden
  // al in IndexedDB bewaard, met een eigen houdbaarheid.
  if (url.origin !== self.location.origin) return;

  /*
   * Meegeleverde kaartcellen zijn onveranderlijk: ze wijzigen alleen wanneer er
   * een nieuwe versie van de site wordt gepubliceerd, en dan onder dezelfde
   * naam met andere inhoud. Cache-first dus, in de tegelcache zodat ze een
   * versiewissel van de app overleven — opnieuw ophalen kost megabytes.
   */
  if (url.pathname.includes('/cellen/') && !url.pathname.endsWith('index.json')) {
    e.respondWith(
      caches.open(TEGEL_CACHE).then(async (cache) => {
        const uitCache = await cache.match(e.request);
        if (uitCache) return uitCache;
        const res = await fetch(e.request);
        if (res.ok) await cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // De app zelf: eerst het net (zodat een nieuwe versie meteen doorkomt), met de
  // cache als vangnet wanneer je offline bent.
  e.respondWith(appSchil(e.request));
});

/*
 * Offline geeft fetch meteen een fout, maar "verbonden zonder werkelijk bereik"
 * — de normale toestand ergens in de polder — laat hem tientallen seconden
 * hangen. Wie dan de app opent staat naar een wit scherm te kijken terwijl de
 * hele boel gewoon in de cache staat. Daarom een wedstrijdje: is het net niet
 * binnen NET_GEDULD_MS terug, dan wint de cache. Het netantwoord blijft lopen en
 * ververst de cache alsnog, dus de volgende start heeft de nieuwe versie.
 */
const NET_GEDULD_MS = 2500;

async function appSchil(request) {
  const uitCache = caches.match(request);
  const vanNet = fetch(request).then((res) => {
    if (res.ok) {
      const kopie = res.clone();
      caches.open(APP_CACHE).then((c) => c.put(request, kopie));
    }
    return res;
  });
  // Wint de cache de wedstrijd, dan kijkt niemand meer naar dit antwoord; zonder
  // deze lege vanger meldt de browser dat als een onafgehandelde fout.
  vanNet.catch(() => {});

  const traag = new Promise((klaar) => setTimeout(() => klaar(null), NET_GEDULD_MS));
  try {
    const eerste = await Promise.race([vanNet, traag.then(() => uitCache)]);
    if (eerste) return eerste;
    return await vanNet;
  } catch {
    return (await uitCache) || (await caches.match('./index.html'));
  }
}
