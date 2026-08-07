# Knooppuntroutes

Fietsrondjes over het Nederlandse knooppuntennetwerk, **over echte fietspaden**.
Je zegt hoeveel kilometer je wilt fietsen en waar je vandaan vertrekt; de app
stelt fietsgebieden voor binnen je maximale rijtijd en genereert daar rondjes,
gekozen op wat je onderweg ziet. Daarna kun je de route op de kaart volgen en als
GPX exporteren.

De hele app draait in de browser. Er is geen server nodig, geen account en geen
sleutel.

> **Let op bij door AI verzonnen knooppuntreeksen.** Chatbots noemen graag
> knooppuntnummers die er plausibel uitzien maar niet aan elkaar grenzen. Deze app
> rekent een reeks na tegen de echte data en waarschuwt bij etappes die ongewoon
> lang zijn — dat betekent bijna altijd dat de nummers uit verschillende
> regionetwerken komen en de route dus niet bestaat.

## Op je telefoon zetten

De app staat op GitHub Pages: **https://rpvos-dhg.github.io/Fietsen/**

Op een iPhone: open die link in Safari, tik op *Deel* en kies *Zet op
beginscherm*. Daarna start hij als een app, zonder adresbalk. Op Android doet
Chrome hetzelfde via *App installeren*.

Wat er dan lokaal blijft staan:

- **bewaarde routes** in localStorage — die overleven een herstart;
- **opgehaalde gebieden** in IndexedDB, dertig dagen houdbaar;
- **kaarttegels van gebieden die je bekeken hebt**, via de service worker. Val je
  onderweg zonder bereik, dan blijft de kaart zichtbaar waar je al geweest bent.

## Publiceren

De site is de map `docs/`; er is geen buildstap.

1. Push naar `main`.
2. In de repo: **Settings → Pages → Source: Deploy from a branch**, branch `main`,
   map `/docs`.

Dat is alles. Elke push naar `main` is meteen live.

## Een gebied toevoegen

De kaartcellen worden **met de site meegeleverd**. Daardoor is er tijdens het
fietsen geen Overpass en geen server nodig, en is een gebied in ongeveer een
seconde geladen in plaats van minuten.

Een nieuw gebied voeg je thuis toe:

```bash
node scripts/voeg-gebied-toe.js "Schoorl" 25
```

Dat haalt alleen de ontbrekende cellen op, verdicht ze en werkt de index bij.
Daarna committen en pushen; vanaf dat moment is het gebied voor al je apparaten
instant.

Van de ruwe OSM-JSON gebruikt de app alleen de geometrie van de wegen en de
positie plus het nummer van de knooppunten. Tags, `bounds` en node-id-lijsten
worden bij het bakken weggegooid: 63,1 MB ruw werd 16,3 MB, en met de gzip van
GitHub Pages erbij ruim 90% kleiner.

Zit een gebied er niet in, dan valt de app terug op Overpass — traag, maar het
werkt. Met `scripts/bak-cellen.js` zet je een bestaande ruwe cache in één keer om.

## De cache-server (optioneel, niet meer nodig)

Sinds de cellen met de site meekomen heeft deze server geen functie meer in het
dagelijks gebruik, en hij kost geld zolang hij draait. Hij staat er nog voor het
geval je ooit een gedeelde cache wilt die zichzelf bijwerkt zonder push.

Hij doet één ding: cellen bij Overpass ophalen en op schijf bewaren, zodat al je
apparaten daarvan meeprofiteren en het uitvechten met de Overpass-mirrors maar
één keer hoeft.

```bash
npm start --prefix cache-server
```

Deployen kan met de meegeleverde `Dockerfile`. Bouwen gebeurt **vanuit de
projectwortel**, want de server deelt `docs/shared` met de webapp:

```bash
docker build -f cache-server/Dockerfile -t knooppuntroutes-cache .
```

Voor Fly.io staat `fly.toml` klaar in de projectwortel — bewust daar en niet in
`cache-server/`, omdat fly de map van `fly.toml` als build-context gebruikt.

```bash
fly launch --copy-config --no-deploy
fly volumes create cache --size 1 --region ams
fly deploy
```

**Het volume is niet optioneel.** Zonder blijvende opslag is de cache bij elke
herstart weg, en dan heeft de server geen enkel nut: het bewaren is zijn hele
bestaansreden.

Vul het adres daarna in bij *Instellingen en opslag* in de app. Omdat GitHub
Pages op https draait, moet de cache-server dat ook — een `http://`-adres wordt
door de browser geblokkeerd als mixed content. De app controleert dat en zegt het.

## Databronnen

| Onderdeel | Bron |
|---|---|
| Achtergrondkaart | PDOK BRT Achtergrondkaart (WMTS), licht `standaard`, donker `grijs` |
| Knooppunten- en netwerkweergave | [PDOK Regionale Fietsnetwerken](https://www.pdok.nl/ogc-webservices/-/article/regionale-fietsnetwerken) (WMS), Stichting Landelijk Fietsplatform |
| Plaatsnaam en postcode zoeken | PDOK Locatieserver |
| Routegeometrie | OpenStreetMap `rcn`-knooppuntennetwerk via Overpass |
| Bezienswaardigheden | OpenStreetMap (uitzichtpunten, molens, kastelen, forten, duinen, stranden, heide, natuurgebieden, benoemde bossen) |
| Terugval bij netwerkgaten | BRouter (`trekking`-profiel) |

**Waarom twee bronnen voor hetzelfde netwerk?** PDOK publiceert Regionale
Fietsnetwerken uitsluitend als WMS, dus als kaart*beeld*. Er is geen WFS, OGC API
Features of Atom-download — alle endpoints geven 404. Er valt dus geen routeerbare
vectorgeometrie uit te halen. De PDOK-laag wordt daarom gebruikt als officiële
kaartweergave, terwijl de route zelf wordt berekend over hetzelfde netwerk zoals
dat in OpenStreetMap is gemapt (`network:type=node_network`, `rcn_ref`).

## Hoe een rondje wordt bedacht

1. Het fijne wegennet wordt samengetrokken tot de graaf zoals een fietser hem
   ziet: knooppunten met daartussen directe verbindingen.
2. Elke verbinding krijgt een score op basis van de bezienswaardigheden binnen
   400 m. Per verbinding telt eenzelfde soort maar drie keer mee, anders bepaalt
   één bosrijk stuk in zijn eentje de uitkomst.
3. Vanaf het startknooppunt lopen duizenden gewogen willekeurige wandelingen.
   Een stap mag alleen als je daarna nog binnen het kilometerbudget thuis kunt
   komen; mooie verbindingen krijgen een groter gewicht.
4. De drie beste rondjes komen als voorstel terug, met per rondje wat er
   *alleen* daar langs ligt — dat is waar je de keuze op maakt.

Alleen **benoemde** bossen tellen mee, en bezienswaardigheden van dezelfde soort
binnen 250 m worden samengetrokken. Zonder die twee regels levert één cel
tienduizenden naamloze bosperceeltjes op en explodeert één dierenpark in
tientallen "bezienswaardigheden".

## Onderweg

**Bewaar op dit apparaat** zet de hele route inclusief geometrie in de browser.
De GPX wordt ook in de browser gemaakt, dus downloaden werkt offline.

**Volg op de kaart** zet het paneel weg, maakt de kaart schermvullend en toont
onderaan een balk binnen duimbereik. Er is geen turn-by-turn navigatie: je volgt
de lijn en de nummers, zoals je de bordjes zou volgen.

**Toon mijn positie** is een aparte knop en staat standaard uit. Aan: een stip
met nauwkeurigheidscirkel, het eerstvolgende knooppunt, de resterende afstand en
— als je meer dan 60 meter van de lijn zit — hoe ver je ernaast bent.

Je positie wordt nergens heen gestuurd; hij wordt alleen in de browser gebruikt.
Wel eerlijk erbij: de kaarttegels van het gebied waar je bent worden bij PDOK
opgehaald, zoals bij elke online kaart.

## Waarom een nieuw gebied traag is

Alles komt van gratis publieke diensten, en Overpass is de traagste schakel.

- **Mirrors worden op gezondheid gesorteerd.** Ze verschillen enorm en wisselend:
  tijdens het bouwen lag `overpass-api.de` plat, gaven `kumi.systems` en
  `private.coffee` pas na 97 en 111 seconden een 504, en antwoordde
  `maps.mail.ru` in 30 seconden. Star op volgorde aflopen kostte daardoor ruim
  drie minuten per cel. Nu gaat de mirror die net werkte voorop en staat wie
  faalde vijf minuten in de wachtkamer.
- **Het gebied wordt alvast opgehaald zodra je het kiest**, terwijl jij nog het
  aantal kilometers invult.
- **De bezienswaardigheden mogen het antwoord niet gijzelen.** Zijn ze na 40
  seconden niet binnen, dan krijg je gewoon je rondjes, met de melding dat ze nog
  niet gerangschikt zijn. Het ophalen loopt door, dus even later klopt het wel.

Een volledig nieuw gebied kost de eerste keer enkele minuten; dat zit in het
wegennet, en dat heeft bewust geen budget, want zonder wegennet is er geen route.

## Structuur

```
docs/              de webapp — dit is wat GitHub Pages serveert
  app.js           interface en kaart
  werker.js        al het rekenwerk, in een Web Worker (anders bevriest een telefoon)
  bronnen.js       IndexedDB, optionele cache-server, Overpass
  sw.js            service worker: app-schil en kaarttegels offline
  shared/          logica die browser én cache-server delen
cache-server/      optionele gedeelde cache (Docker, fly.toml)
scripts/           iconen genereren, cache migreren
```

## Ontwerp

`PRODUCT.md` legt de productwaarheid vast, `DESIGN.md` het ontwerpsysteem, met
`.impeccable/design.json` als machineleesbare zijkant. De North Star is *"Het
Knooppuntbordje"*: groen op wit, cijfers in tabelvorm, geen versiering, en
wegwijzerrood uitsluitend voor de route die je gekozen hebt.
