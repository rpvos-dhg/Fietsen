import { netwerkQuery, hoogtepuntQuery, OVERPASS_MIRRORS, cellsForBbox } from './shared/cellen.js';
import { leesHoogtepunten } from './shared/hoogtepunten.js';

/**
 * Waar de gegevens vandaan komen, in deze volgorde:
 *
 *  1. IndexedDB op dit apparaat — instant, werkt offline;
 *  2. de cache-server, als je er een hebt ingesteld — die deelt zijn cache met
 *     al je apparaten en heeft de Overpass-mirrors al uitgevochten;
 *  3. Overpass rechtstreeks vanuit de browser.
 *
 * Stap 2 is puur versnelling: zonder server werkt alles, alleen duurt een nieuw
 * gebied de eerste keer langer.
 */

const DB_NAAM = 'knooppuntroutes';
const WINKEL = 'cellen';
const HOUDBAAR_MS = 1000 * 60 * 60 * 24 * 30; // 30 dagen

/**
 * Versie van wat er in IndexedDB staat. Ophogen zodra de vorm van een cel
 * verandert: records van een oudere versie worden dan genegeerd en opnieuw
 * opgehaald, in plaats van als geldig te worden ingelezen.
 *
 * 1 = ruwe Overpass-elementen, 2 = verdicht formaat.
 */
const FORMAAT = 2;

let dbBelofte = null;
function db() {
  if (dbBelofte) return dbBelofte;
  dbBelofte = new Promise((klaar, mis) => {
    const req = indexedDB.open(DB_NAAM, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(WINKEL)) req.result.createObjectStore(WINKEL);
    };
    req.onsuccess = () => klaar(req.result);
    req.onerror = () => mis(req.error);
  });
  return dbBelofte;
}

async function uitDb(sleutel) {
  try {
    const d = await db();
    return await new Promise((klaar, mis) => {
      const req = d.transaction(WINKEL, 'readonly').objectStore(WINKEL).get(sleutel);
      req.onsuccess = () => klaar(req.result);
      req.onerror = () => mis(req.error);
    });
  } catch {
    return undefined; // privémodus of geen IndexedDB: dan maar elke keer ophalen
  }
}

async function naarDb(sleutel, waarde) {
  try {
    const d = await db();
    await new Promise((klaar, mis) => {
      const tx = d.transaction(WINKEL, 'readwrite');
      tx.objectStore(WINKEL).put(waarde, sleutel);
      tx.oncomplete = () => klaar();
      tx.onerror = () => mis(tx.error);
    });
  } catch {
    /* opslag vol of geweigerd; niet fataal */
  }
}

/* ---------------- cache-server ---------------- */

/*
 * Het adres komt van buiten binnen in plaats van uit localStorage: deze module
 * draait ook in een Web Worker, en daar bestaat localStorage niet. De UI leest
 * de instelling en geeft hem door.
 */
let serverUrl = '';

export function cacheServer() {
  return serverUrl;
}

export function zetCacheServer(url) {
  serverUrl = (url || '').trim().replace(/\/+$/, '');
}

/* ---------------- Overpass rechtstreeks ---------------- */

const STRAF_MS = 5 * 60 * 1000;
const gezondheid = new Map(
  OVERPASS_MIRRORS.map((ep) => [ep, { falen: 0, strafTot: 0, laatsteSucces: 0 }])
);

/*
 * De mirrors verschillen enorm en wisselend: de ene ligt plat, de andere geeft
 * pas na anderhalve minuut een 504. Ze altijd in dezelfde volgorde aflopen kost
 * daardoor minuten voordat we bij de mirror zijn die het wél doet. Wie net
 * werkte gaat daarom voorop, wie faalde staat vijf minuten in de wachtkamer.
 */
function opVolgorde() {
  const nu = Date.now();
  const gestraft = (s) => (s.strafTot > nu ? 1 : 0);
  return [...OVERPASS_MIRRORS].sort((a, b) => {
    const A = gezondheid.get(a);
    const B = gezondheid.get(b);
    return gestraft(A) - gestraft(B) || B.laatsteSucces - A.laatsteSucces || A.falen - B.falen;
  });
}

async function viaOverpass(query) {
  let laatste = 'geen mirror geprobeerd';
  for (const ep of opVolgorde()) {
    const s = gezondheid.get(ep);
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(75_000),
      });
      if (!res.ok) {
        laatste = `${ep} → HTTP ${res.status}`;
        s.falen++;
        s.strafTot = Date.now() + STRAF_MS;
        continue;
      }
      const json = await res.json();
      s.falen = 0;
      s.strafTot = 0;
      s.laatsteSucces = Date.now();
      return json.elements || [];
    } catch (e) {
      laatste = `${ep} → ${e.message}`;
      s.falen++;
      s.strafTot = Date.now() + STRAF_MS;
    }
  }
  throw new Error(`Overpass niet bereikbaar (${laatste}).`);
}

/* ---------------- één cel ophalen ---------------- */

/** Twee gelijktijdige verzoeken: meer staat Overpass per IP niet toe. */
const MAX_GELIJKTIJDIG = 2;
let actief = 0;
const wachtrij = { hoog: [], laag: [] };

async function metSlot(fn, prioriteit) {
  if (actief >= MAX_GELIJKTIJDIG) {
    await new Promise((klaar) => wachtrij[prioriteit].push(klaar));
  }
  actief++;
  try {
    return await fn();
  } finally {
    actief--;
    (wachtrij.hoog.shift() || wachtrij.laag.shift())?.();
  }
}

const lopend = new Map();
let opVoortgang = null;
export function bijVoortgang(fn) {
  opVoortgang = fn;
}
const voortgang = { totaal: 0, klaar: 0 };
function tel(delta) {
  if (delta === 'start') voortgang.totaal++;
  else voortgang.klaar++;
  if (voortgang.klaar >= voortgang.totaal) {
    voortgang.totaal = 0;
    voortgang.klaar = 0;
  }
  opVoortgang?.({ ...voortgang });
}

/**
 * Welke cellen met de site zijn meegeleverd. Zonder deze index zou de app voor
 * elk gebied dat niet gebakken is een mislukt verzoek per cel doen.
 */
let gebakkenIndex = null;
async function isGebakken(naam) {
  if (!gebakkenIndex) {
    gebakkenIndex = fetch(new URL('cellen/index.json', import.meta.url))
      .then((r) => (r.ok ? r.json() : []))
      .then((lijst) => new Set(lijst))
      .catch(() => new Set());
  }
  return (await gebakkenIndex).has(naam);
}

/**
 * Klopt de vorm van een cel? Een cel met een ander formaat leverde eerder pas
 * verderop een onbegrijpelijke fout op ("undefined is not an object"); zo valt
 * hij op waar hij vandaan komt.
 */
function heeftJuisteVorm(soort, data) {
  if (!data) return false;
  return soort === 'net' ? Array.isArray(data.w) && Array.isArray(data.n) : Array.isArray(data);
}

/** Zet ruwe Overpass-elementen om in hetzelfde compacte formaat als de gebakken cellen. */
function verdicht(soort, elementen) {
  const rond = (v) => +v.toFixed(6);
  if (soort === 'net') {
    const w = [];
    const n = [];
    for (const el of elementen) {
      if (el.type === 'way') {
        if (!el.geometry || el.geometry.length < 2) continue;
        const c = [];
        for (const g of el.geometry) c.push(g ? rond(g.lat) : null, g ? rond(g.lon) : null);
        w.push([el.id, c]);
      } else if (el.type === 'node') {
        const ref = el.tags?.rcn_ref?.trim();
        if (ref) n.push([el.id, ref, rond(el.lat), rond(el.lon)]);
      }
    }
    return { w, n };
  }
  return leesHoogtepunten(elementen).map((p) => [
    rond(p.lat),
    rond(p.lon),
    p.soort,
    p.score,
    p.naam,
  ]);
}

async function haalCel(soort, cell, prioriteit) {
  const naam = `${soort}_${cell.y}_${cell.x}`;
  const sleutel = `${soort}/${cell.y}/${cell.x}`;
  const bewaard = await uitDb(sleutel);
  if (
    bewaard?.formaat === FORMAAT &&
    Date.now() - bewaard.tijd < HOUDBAAR_MS &&
    heeftJuisteVorm(soort, bewaard.data)
  ) {
    return bewaard.data;
  }

  const bezig = lopend.get(sleutel);
  if (bezig) return bezig;

  const taak = (async () => {
    // Een meegeleverde cel komt van dezelfde host, uit de CDN en gezipt. Die
    // hoeft niet mee in de voortgangsteller en niet door de Overpass-poort:
    // die limiet van twee bestaat alleen om Overpass niet te overvragen.
    try {
      if (await isGebakken(naam)) {
        const res = await fetch(new URL(`cellen/${naam}.json`, import.meta.url));
        if (res.ok) {
          const data = await res.json();
          if (!heeftJuisteVorm(soort, data)) throw new Error(`Cel ${naam} heeft een onverwacht formaat.`);
          await naarDb(sleutel, { tijd: Date.now(), formaat: FORMAAT, data });
          return data;
        }
      }
    } catch {
      /* niet meegeleverd of offline: hieronder zelf ophalen */
    }

    tel('start');
    try {
      let data = null;

      const server = cacheServer();
      if (server) {
        try {
          const res = await fetch(`${server}/cel/${soort}/${cell.y}/${cell.x}`, {
            signal: AbortSignal.timeout(35_000),
          });
          // Alleen 200 betekent "hier is de cel". Bij 202 heeft de server hem
          // nog niet en is hij hem aan het ophalen; dan zijn wij sneller door
          // het zelf te doen, en heeft de server hem de volgende keer wel.
          if (res.status === 200) data = verdicht(soort, (await res.json()).elementen);
        } catch {
          /* server plat of traag: gewoon zelf ophalen */
        }
      }
      if (!data) {
        const query = soort === 'net' ? netwerkQuery(cell) : hoogtepuntQuery(cell);
        data = verdicht(soort, await metSlot(() => viaOverpass(query), prioriteit));
      }

      await naarDb(sleutel, { tijd: Date.now(), formaat: FORMAAT, data });
      return data;
    } finally {
      tel('klaar');
      lopend.delete(sleutel);
    }
  })();

  lopend.set(sleutel, taak);
  return taak;
}

/* ---------------- hele gebieden ---------------- */

/** Voegt de cellen samen tot één netwerk; wegen op de celgrens komen dubbel voor. */
export async function haalNetwerk(bbox) {
  const delen = await Promise.all(cellsForBbox(bbox).map((c) => haalCel('net', c, 'hoog')));
  const w = [];
  const n = [];
  const gezien = new Set();
  for (const deel of delen) {
    for (const weg of deel.w) {
      if (gezien.has(`w${weg[0]}`)) continue;
      gezien.add(`w${weg[0]}`);
      w.push(weg);
    }
    for (const knoop of deel.n) {
      if (gezien.has(`n${knoop[0]}`)) continue;
      gezien.add(`n${knoop[0]}`);
      n.push(knoop);
    }
  }
  return { w, n };
}

export async function haalHoogtepunten(bbox) {
  const delen = await Promise.all(cellsForBbox(bbox).map((c) => haalCel('hl', c, 'laag')));
  return delen.flat().map(([lat, lon, soort, score, naam]) => ({ lat, lon, soort, score, naam }));
}

/** Hoeveel megabyte er op dit apparaat staat, om te kunnen opruimen. */
export async function opslagBeslag() {
  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) || {};
    return { gebruikt: usage, quotum: quota };
  } catch {
    return { gebruikt: 0, quotum: 0 };
  }
}

export async function wisGebiedscache() {
  const d = await db();
  await new Promise((klaar, mis) => {
    const tx = d.transaction(WINKEL, 'readwrite');
    tx.objectStore(WINKEL).clear();
    tx.oncomplete = () => klaar();
    tx.onerror = () => mis(tx.error);
  });
}
