import { afstandenNaar } from './knooppuntgraaf.js';

/**
 * Zoekt rondjes over het knooppuntennetwerk met een gevraagde lengte, en kiest
 * daarbij zoveel mogelijk verbindingen die langs iets moois lopen.
 *
 * Aanpak: veel gewogen willekeurige wandelingen vanaf het startknooppunt. Een
 * stap mag alleen als je daarna nog binnen het kilometerbudget thuis kunt komen
 * (dat weten we uit de afstandstabel naar het start). Mooie verbindingen krijgen
 * een groter gewicht, dus de mooie rondjes komen vanzelf bovendrijven.
 */

const MAX_STAPPEN = 60;

function kiesGewogen(opties) {
  let som = 0;
  for (const o of opties) som += o.gewicht;
  let r = Math.random() * som;
  for (const o of opties) {
    r -= o.gewicht;
    if (r <= 0) return o;
  }
  return opties[opties.length - 1];
}

export function genereerLussen(kg, startIdx, targetM, opties = {}) {
  const tolerantie = opties.tolerantie ?? 0.15;
  const pogingen = opties.pogingen ?? 4000;
  const minM = targetM * (1 - tolerantie);
  const maxM = targetM * (1 + tolerantie);

  const terug = afstandenNaar(kg, startIdx);
  if (!Number.isFinite(terug[startIdx])) return [];

  const kandidaten = new Map();

  for (let poging = 0; poging < pogingen; poging++) {
    const pad = [startIdx];
    const bezocht = new Set([startIdx]);
    // Naburige regio's hergebruiken dezelfde nummers. Twee keer "28" op een
    // routebriefje is niet te volgen, dus elk nummer mag maar een keer voorkomen.
    const gebruikteNummers = new Set([kg.knopen[startIdx].ref]);
    let afstand = 0;
    let mooi = 0;
    let hier = startIdx;
    let vorige = -1;

    for (let stap = 0; stap < MAX_STAPPEN; stap++) {
      // Kunnen we hier afsluiten?
      if (hier !== startIdx && afstand >= minM) {
        const sluit = kg.randen[hier].find((r) => r.naar === startIdx);
        if (sluit && afstand + sluit.meters <= maxM) {
          const totaal = afstand + sluit.meters;
          const totaalMooi = mooi + sluit.mooi;
          const volledig = [...pad, startIdx];
          const sleutel = [...bezocht].sort((a, b) => a - b).join(',');
          const bestaand = kandidaten.get(sleutel);
          if (!bestaand || totaalMooi > bestaand.mooi) {
            kandidaten.set(sleutel, { pad: volledig, meters: totaal, mooi: totaalMooi });
          }
          break;
        }
      }

      const mogelijk = [];
      for (const r of kg.randen[hier]) {
        if (r.naar === vorige) continue;
        if (r.naar !== startIdx && bezocht.has(r.naar)) continue;
        if (r.naar !== startIdx && gebruikteNummers.has(kg.knopen[r.naar].ref)) continue;
        if (r.naar === startIdx && afstand + r.meters < minM) continue;
        if (!Number.isFinite(terug[r.naar])) continue;
        if (afstand + r.meters + terug[r.naar] > maxM) continue;
        const km = Math.max(r.meters / 1000, 0.05);
        const mooiPerKm = r.mooi / km;
        mogelijk.push({ r, gewicht: Math.pow(1 + mooiPerKm, 1.6) });
      }
      if (!mogelijk.length) break;

      const gekozen = kiesGewogen(mogelijk).r;
      afstand += gekozen.meters;
      mooi += gekozen.mooi;
      vorige = hier;
      hier = gekozen.naar;
      pad.push(hier);
      if (hier === startIdx) {
        if (afstand >= minM) {
          const sleutel = [...bezocht].sort((a, b) => a - b).join(',');
          const bestaand = kandidaten.get(sleutel);
          if (!bestaand || mooi > bestaand.mooi) {
            kandidaten.set(sleutel, { pad: [...pad], meters: afstand, mooi });
          }
        }
        break;
      }
      bezocht.add(hier);
      gebruikteNummers.add(kg.knopen[hier].ref);
    }
  }

  // Beste rondjes eerst: mooi per kilometer, afgestraft naar mate de lengte van
  // de gevraagde afstand afwijkt. Beide als factor, want een verschil optellen
  // bij een score per kilometer vergelijkt appels met peren.
  return [...kandidaten.values()]
    .map((k) => {
      const mooiPerKm = k.mooi / (k.meters / 1000);
      const afwijking = Math.abs(k.meters - targetM) / targetM;
      return { ...k, mooiPerKm, afwijking, rang: mooiPerKm * (1 - afwijking) };
    })
    .sort((a, b) => b.rang - a.rang)
    .slice(0, opties.aantal ?? 3);
}
