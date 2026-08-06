/**
 * Bouwt een routeerbare graaf uit de ruwe OSM-elementen van het regionale
 * fietsknooppuntennetwerk (rcn). Knopen zijn de daadwerkelijke vertices van de
 * fietspaden, dus een route volgt exact het pad en niet de hemelsbrede lijn.
 */

const R = 6371008.8; // straal aarde, meter

export function haversine(aLat, aLon, bLat, bLon) {
  const p = Math.PI / 180;
  const dLat = (bLat - aLat) * p;
  const dLon = (bLon - aLon) * p;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const keyOf = (lat, lon) => `${lat.toFixed(7)},${lon.toFixed(7)}`;

/**
 * Knooppuntnummers staan in OSM soms met voorloopnullen ("083") en soms zonder
 * ("83"). Voor het opzoeken normaliseren we die naar dezelfde sleutel.
 */
export const normRef = (s) =>
  String(s).trim().toUpperCase().replace(/^0+(?=\d)/, '');

export class MinHeap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(node, prio) {
    const a = this.a;
    a.push({ node, prio });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].prio <= a[i].prio) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].prio < a[m].prio) m = l;
        if (r < a.length && a[r].prio < a[m].prio) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class Network {
  constructor() {
    this.lat = [];
    this.lon = [];
    this.adj = []; // adj[i] = [vertexIndex, meters, vertexIndex, meters, ...]
    this.index = new Map(); // coordkey -> vertexIndex
    this.knooppunten = new Map(); // ref -> [{ref, lat, lon, vertex, osmId}]
    this.grid = new Map(); // spatial index voor snapping
  }

  vertex(lat, lon) {
    const k = keyOf(lat, lon);
    let i = this.index.get(k);
    if (i === undefined) {
      i = this.lat.length;
      this.lat.push(lat);
      this.lon.push(lon);
      this.adj.push([]);
      this.index.set(k, i);
      const gk = `${Math.round(lat * 200)}/${Math.round(lon * 200)}`;
      let bucket = this.grid.get(gk);
      if (!bucket) this.grid.set(gk, (bucket = []));
      bucket.push(i);
    }
    return i;
  }

  link(a, b) {
    if (a === b) return;
    const w = haversine(this.lat[a], this.lon[a], this.lat[b], this.lon[b]);
    this.adj[a].push(b, w);
    this.adj[b].push(a, w);
  }

  /** Dichtstbijzijnde netwerkvertex binnen maxMeters, of -1. */
  nearestVertex(lat, lon, maxMeters = 150) {
    const exact = this.index.get(keyOf(lat, lon));
    if (exact !== undefined) return exact;
    const cy = Math.round(lat * 200);
    const cx = Math.round(lon * 200);
    let best = -1;
    let bestD = maxMeters;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.grid.get(`${cy + dy}/${cx + dx}`);
        if (!bucket) continue;
        for (const i of bucket) {
          const d = haversine(lat, lon, this.lat[i], this.lon[i]);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
    }
    return best;
  }

  /**
   * Kortste pad over het fietsnetwerk. Geeft de volledige puntenreeks terug,
   * dus de echte loop van het fietspad.
   */
  shortestPath(from, to) {
    if (from === to) return { meters: 0, coords: [[this.lon[from], this.lat[from]]] };
    const n = this.lat.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    const heap = new MinHeap();
    dist[from] = 0;
    heap.push(from, 0);

    while (heap.size) {
      const { node: u, prio } = heap.pop();
      if (done[u]) continue;
      if (prio > dist[u]) continue;
      done[u] = 1;
      if (u === to) break;
      const a = this.adj[u];
      for (let i = 0; i < a.length; i += 2) {
        const v = a[i];
        if (done[v]) continue;
        const nd = dist[u] + a[i + 1];
        if (nd < dist[v]) {
          dist[v] = nd;
          prev[v] = u;
          heap.push(v, nd);
        }
      }
    }

    if (!Number.isFinite(dist[to])) return null;
    const coords = [];
    for (let v = to; v !== -1; v = prev[v]) coords.push([this.lon[v], this.lat[v]]);
    coords.reverse();
    return { meters: dist[to], coords };
  }
}

export function buildNetwork(elements) {
  const net = new Network();

  for (const el of elements) {
    if (el.type !== 'way') continue;
    const geom = el.geometry;
    if (!geom || geom.length < 2) continue;
    let prev = -1;
    for (const g of geom) {
      if (!g) {
        // gat in de geometrie (buiten het opgevraagde gebied): keten afbreken
        prev = -1;
        continue;
      }
      const v = net.vertex(g.lat, g.lon);
      if (prev !== -1) net.link(prev, v);
      prev = v;
    }
  }

  for (const el of elements) {
    if (el.type !== 'node') continue;
    const raw = el.tags?.rcn_ref?.trim();
    if (!raw) continue;
    const ref = normRef(raw);
    if (!ref) continue;
    const vertex = net.nearestVertex(el.lat, el.lon, 150);
    if (vertex === -1) continue; // knooppunt zonder netwerk in beeld
    const list = net.knooppunten.get(ref) || [];
    list.push({ ref, osmRef: raw, lat: el.lat, lon: el.lon, vertex, osmId: el.id });
    net.knooppunten.set(ref, list);
  }

  ontdubbelKnooppunten(net);
  return net;
}

/**
 * Eenzelfde knooppunt staat in OSM soms dubbel: de kruising zelf en het bordje
 * ernaast dragen allebei hetzelfde rcn_ref. Zonder opschonen levert dat routes
 * op als "23 - 23 - 23" met etappes van nul meter.
 */
const DUBBEL_M = 250;

function ontdubbelKnooppunten(net) {
  for (const [ref, lijst] of net.knooppunten) {
    if (lijst.length < 2) continue;
    const uniek = [];
    for (const k of lijst) {
      const bestaat = uniek.some((u) => haversine(u.lat, u.lon, k.lat, k.lon) < DUBBEL_M);
      if (!bestaat) uniek.push(k);
    }
    net.knooppunten.set(ref, uniek);
  }
}
