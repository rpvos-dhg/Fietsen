/**
 * Alles wat nodig is om te bepalen wélke gegevens er opgehaald moeten worden,
 * zonder iets te weten over hoe. Deze module draait ongewijzigd in de browser en
 * in de cache-server, zodat beide exact dezelfde cellen en queries gebruiken.
 */

/** Het netwerk wordt per vaste cel van 0,25 graad opgehaald en bewaard. */
export const CEL = 0.25;

export function cellsForBbox({ south, west, north, east }) {
  const cells = [];
  for (let y = Math.floor(south / CEL); y <= Math.floor(north / CEL); y++) {
    for (let x = Math.floor(west / CEL); x <= Math.floor(east / CEL); x++) {
      cells.push({ y, x });
    }
  }
  return cells;
}

export function cellBbox({ y, x }) {
  return {
    south: +(y * CEL).toFixed(4),
    west: +(x * CEL).toFixed(4),
    north: +((y + 1) * CEL).toFixed(4),
    east: +((x + 1) * CEL).toFixed(4),
  };
}

const bboxTekst = (cell) => {
  const b = cellBbox(cell);
  return `${b.south},${b.west},${b.north},${b.east}`;
};

/**
 * Knooppuntnodes plus alle wegen van het regionale fietsknooppuntennetwerk.
 * Zowel het relatie-model (gebruikelijk in NL) als direct getagde wegen.
 */
export function netwerkQuery(cell) {
  const bbox = bboxTekst(cell);
  return `[out:json][timeout:180];
rel["type"="route"]["route"="bicycle"]["network"="rcn"](${bbox})->.r;
way(r.r)->.rw;
way["network"="rcn"](${bbox})->.dw;
(.rw; .dw;)->.w;
.w out body geom;
node["rcn_ref"](${bbox});
out body;`;
}

const SOORTEN = [
  ['tourism', '^(viewpoint|attraction|picnic_site)$'],
  ['historic', '^(castle|fort|ruins|monument|memorial|windmill)$'],
  ['man_made', '^(windmill|lighthouse|water_tower)$'],
  ['natural', '^(beach|dune|peak|cape|heath)$'],
  ['leisure', '^(nature_reserve)$'],
];

/**
 * Bos alleen als het een naam heeft. Zonder die eis levert één cel tienduizenden
 * naamloze bosperceeltjes op: dat maakt de query loodzwaar en overstemt de echte
 * bezienswaardigheden volledig.
 */
const BENOEMD = [
  ['natural', '^(wood)$'],
  ['landuse', '^(forest)$'],
];

export function hoogtepuntQuery(cell) {
  const bbox = bboxTekst(cell);
  const delen = [
    ...SOORTEN.map(([k, v]) => `  nwr["${k}"~"${v}"](${bbox});`),
    ...BENOEMD.map(([k, v]) => `  nwr["${k}"~"${v}"]["name"](${bbox});`),
  ].join('\n');
  return `[out:json][timeout:180];\n(\n${delen}\n);\nout center tags;`;
}

/**
 * Alleen mirrors met een wereldwijde database. Regionale mirrors (zoals
 * overpass.osm.ch) antwoorden met HTTP 200 en nul elementen buiten hun gebied,
 * wat een leeg netwerk zou opleveren zonder zichtbare fout.
 */
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export const BROUTER_URL = 'https://brouter.de/brouter';

export const PDOK = {
  wms: 'https://service.pdok.nl/fietsplatform/regionale-fietsnetwerken/wms/v1_0',
  locatieserver: 'https://api.pdok.nl/bzk/locatieserver/search/v3_1',
  brt: (stijl) =>
    `https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/${stijl}/EPSG:3857/{z}/{x}/{y}.png`,
};
