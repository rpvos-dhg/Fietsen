import { MinHeap, haversine } from './graph.js';

/**
 * Trekt het fijne wegennet samen tot het netwerk zoals een fietser het ziet:
 * knooppunten met daartussen directe verbindingen. Dat is de graaf waarop we
 * rondjes kunnen zoeken.
 */

/** Verder dan dit ligt geen buurknooppunt meer; voorkomt eindeloos zoeken. */
const MAX_BUUR_M = 20_000;

/**
 * Zoekt vanaf een knooppunt de direct bereikbare buurknooppunten: een Dijkstra
 * die stopt zodra hij een ander knooppunt raakt (dus niet erdoorheen loopt).
 */
function burenVan(net, start, isKnooppunt) {
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push(start, 0);
  const buren = [];

  while (heap.size) {
    const { node: u, prio } = heap.pop();
    if (prio > (dist.get(u) ?? Infinity)) continue;
    if (prio > MAX_BUUR_M) break;

    if (u !== start && isKnooppunt.has(u)) {
      // Pad terugbouwen voor de geometrie, en niet verder uitbreiden.
      const coords = [];
      for (let v = u; v !== undefined; v = prev.get(v)) coords.push([net.lon[v], net.lat[v]]);
      coords.reverse();
      buren.push({ vertex: u, meters: prio, coords });
      continue;
    }

    const a = net.adj[u];
    for (let i = 0; i < a.length; i += 2) {
      const v = a[i];
      const nd = prio + a[i + 1];
      if (nd < (dist.get(v) ?? Infinity)) {
        dist.set(v, nd);
        prev.set(v, u);
        heap.push(v, nd);
      }
    }
  }
  return buren;
}

/**
 * Bouwt de knooppuntgraaf en scoort elke verbinding op wat je onderweg ziet.
 * `index` is een HighlightIndex; zonder index krijgt alles score 0.
 */
export function bouwKnooppuntGraaf(net, index) {
  const isKnooppunt = new Map();
  for (const [, lijst] of net.knooppunten) {
    for (const k of lijst) isKnooppunt.set(k.vertex, k);
  }

  const knopen = [...isKnooppunt.values()];
  const idxVanVertex = new Map(knopen.map((k, i) => [k.vertex, i]));
  const randen = knopen.map(() => []);

  for (let i = 0; i < knopen.length; i++) {
    for (const buur of burenVan(net, knopen[i].vertex, isKnooppunt)) {
      const j = idxVanVertex.get(buur.vertex);
      if (j === undefined || j === i) continue;
      randen[i].push({
        naar: j,
        meters: buur.meters,
        mooi: index ? index.score(buur.coords) : 0,
      });
    }
  }

  return { knopen, randen, idxVanVertex };
}

/** Kortste afstand van elk knooppunt naar `doel`, over de knooppuntgraaf. */
export function afstandenNaar(kg, doel) {
  const n = kg.knopen.length;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap();
  dist[doel] = 0;
  heap.push(doel, 0);
  while (heap.size) {
    const { node: u, prio } = heap.pop();
    if (prio > dist[u]) continue;
    for (const r of kg.randen[u]) {
      const nd = prio + r.meters;
      if (nd < dist[r.naar]) {
        dist[r.naar] = nd;
        heap.push(r.naar, nd);
      }
    }
  }
  return dist;
}

export { haversine };
