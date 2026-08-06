const esc = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

/**
 * GPX met zowel een track (de gereden lijn) als waypoints per knooppunt, zodat
 * navigatie-apps als OsmAnd, Komoot of een Garmin de route kunnen volgen.
 */
export function toGpx({ name, coords, chain }) {
  const wpts = chain
    .map(
      (k, i) =>
        `  <wpt lat="${k.lat}" lon="${k.lon}">\n` +
        `    <name>${esc(k.ref)}</name>\n` +
        `    <desc>Knooppunt ${esc(k.ref)} (${i + 1}e van ${chain.length})</desc>\n` +
        `    <sym>Flag</sym>\n  </wpt>`
    )
    .join('\n');

  const pts = coords
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="fietsknooppunten-app" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(name)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${wpts}
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
