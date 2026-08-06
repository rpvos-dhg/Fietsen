import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_DIR = path.join(ROOT, 'cache');

export const PORT = Number(process.env.PORT) || 5173;

/** Overpass mirrors, tried in order. Public instances are frequently busy (504). */
// Alleen mirrors met een wereldwijde database. Regionale mirrors (zoals
// overpass.osm.ch) antwoorden met HTTP 200 en nul elementen buiten hun gebied,
// wat een leeg netwerk zou opleveren zonder zichtbare fout.
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export const USER_AGENT = 'fietsknooppunten-app/1.0 (persoonlijk gebruik)';

/** BRouter public instance, used only as fallback when the knooppunt network has a gap. */
export const BROUTER_URL = 'https://brouter.de/brouter';

/** PDOK endpoints (publieke dataset Regionale Fietsnetwerken). */
export const PDOK = {
  wms: 'https://service.pdok.nl/fietsplatform/regionale-fietsnetwerken/wms/v1_0',
  locatieserver: 'https://api.pdok.nl/bzk/locatieserver/search/v3_1',
  brtWmts: 'https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0',
};

/** Region tiles are cached per whole-degree-tenth cell so nearby requests reuse them. */
export const REGION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dagen
