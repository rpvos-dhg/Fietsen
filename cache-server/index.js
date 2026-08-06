/**
 * Optionele cache-server. Doet precies één ding: cellen van het knooppunten-
 * netwerk en de bezienswaardigheden ophalen bij Overpass en op schijf bewaren,
 * zodat al je apparaten daarvan meeprofiteren en het uitvechten met de mirrors
 * maar één keer hoeft.
 *
 * De webapp werkt zonder deze server; hij maakt een nieuw gebied alleen sneller.
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  netwerkQuery,
  hoogtepuntQuery,
  OVERPASS_MIRRORS,
} from '../docs/shared/cellen.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = process.env.CACHE_DIR || path.join(HIER, 'cache');
const PORT = Number(process.env.PORT) || 8080;
const HOUDBAAR_MS = 1000 * 60 * 60 * 24 * 30;
const UA = 'knooppuntroutes-cache/1.0 (persoonlijk gebruik)';

/* --- Overpass met mirrors op gezondheid --- */

const STRAF_MS = 5 * 60 * 1000;
const gezondheid = new Map(
  OVERPASS_MIRRORS.map((ep) => [ep, { falen: 0, strafTot: 0, laatsteSucces: 0 }])
);

function opVolgorde() {
  const nu = Date.now();
  const gestraft = (s) => (s.strafTot > nu ? 1 : 0);
  return [...OVERPASS_MIRRORS].sort((a, b) => {
    const A = gezondheid.get(a);
    const B = gezondheid.get(b);
    return gestraft(A) - gestraft(B) || B.laatsteSucces - A.laatsteSucces || A.falen - B.falen;
  });
}

/** Twee gelijktijdige verzoeken; het wegennet gaat voor. */
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

async function viaOverpass(query) {
  let laatste = 'geen mirror geprobeerd';
  for (const ep of opVolgorde()) {
    const s = gezondheid.get(ep);
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
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

/* --- cellen --- */

const lopend = new Map();

async function cel(soort, y, x) {
  const naam = `${soort}_${y}_${x}.json`;
  const bestand = path.join(CACHE_DIR, naam);
  try {
    const stat = await fs.stat(bestand);
    if (Date.now() - stat.mtimeMs < HOUDBAAR_MS) {
      return JSON.parse(await fs.readFile(bestand, 'utf8'));
    }
  } catch {
    /* nog niet gecachet */
  }

  const bezig = lopend.get(naam);
  if (bezig) return bezig;

  const taak = (async () => {
    const t0 = Date.now();
    console.log(`[ophalen] ${naam}…`);
    try {
      const query = soort === 'net' ? netwerkQuery({ y, x }) : hoogtepuntQuery({ y, x });
      const elementen = await metSlot(
        () => viaOverpass(query),
        soort === 'net' ? 'hoog' : 'laag'
      );
      await fs.mkdir(CACHE_DIR, { recursive: true });
      await fs.writeFile(bestand, JSON.stringify(elementen), 'utf8');
      console.log(
        `[ophalen] ${naam} klaar: ${elementen.length} elementen in ${((Date.now() - t0) / 1000).toFixed(0)}s`
      );
      return elementen;
    } finally {
      lopend.delete(naam);
    }
  })();

  lopend.set(naam, taak);
  return taak;
}

/* --- http --- */

const app = express();
app.use(cors()); // de webapp staat op een ander domein (GitHub Pages)

app.get('/gezond', (_req, res) => res.json({ ok: true }));

/**
 * Zolang wacht een verzoek op een cel die er nog niet is. Daarna krijgt de
 * client 202 en haalt hij hem zelf op, terwijl wij doorgaan met ophalen.
 *
 * Zonder deze grens blokkeert elk verzoek tot Overpass antwoordt. Met twee
 * gelijktijdige slots en een rij van tien of meer cellen wordt dat minuten, en
 * dan loopt de client in zijn eigen time-out — die had al die tijd zelf al klaar
 * kunnen zijn. Snelle cellen worden nog steeds gewoon geserveerd.
 */
const WACHT_MAX_MS = 25_000;

app.get('/cel/:soort/:y/:x', async (req, res) => {
  const { soort } = req.params;
  const y = Number(req.params.y);
  const x = Number(req.params.x);
  if (!['net', 'hl'].includes(soort) || !Number.isInteger(y) || !Number.isInteger(x)) {
    return res.status(400).json({ error: 'Ongeldige cel.' });
  }
  try {
    const taak = cel(soort, y, x);
    taak.catch(() => {}); // mag op de achtergrond falen zonder ophef
    const elementen = await Promise.race([
      taak,
      new Promise((_, weiger) => setTimeout(() => weiger(new Error('nog-bezig')), WACHT_MAX_MS)),
    ]).catch((e) => {
      if (e.message === 'nog-bezig') return null;
      throw e;
    });

    if (elementen === null) {
      res.set('Cache-Control', 'no-store');
      return res.status(202).json({ bezig: true });
    }
    // Niet in de browsercache: de client bewaart cellen zelf al dertig dagen in
    // IndexedDB. Een tweede cachelaag voegt niets toe en zorgt er alleen voor
    // dat een gewijzigd antwoord dagenlang niet doorkomt.
    res.set('Cache-Control', 'no-store');
    res.json({ elementen });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Cache-server luistert op poort ${PORT}, cache in ${CACHE_DIR}`));
