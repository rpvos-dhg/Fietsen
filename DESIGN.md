---
name: Knooppuntroutes
description: Fietsrondjes over het Nederlandse knooppuntennetwerk, met de bewegwijzering als vormtaal.
colors:
  bordjesgroen: "#0f6b3d"
  bordjesgroen-diep: "#0a4f2d"
  bordjesgroen-vlak: "#eaf2ec"
  wegwijzerrood: "#cc3d10"
  wegwijzerrood-vlak: "#fcefe9"
  papier: "#faf9f6"
  vlak: "#ffffff"
  inkt: "#14201a"
  inkt-zacht: "#5a6560"
  inkt-flauw: "#8b938e"
  lijn: "#d9d8d0"
  lijn-zacht: "#e8e7e0"
  waarschuwing: "#7a4f00"
  waarschuwing-vlak: "#fdf3dd"
  fout: "#8f1d1d"
  fout-vlak: "#fbebeb"
  fout-lijn: "#f0d3d3"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "25px"
    fontWeight: 680
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.45
    letterSpacing: "-0.015em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  lead:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 620
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 620
    lineHeight: 1.5
    letterSpacing: "0.005em"
  reeks:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tabular-nums"
rounded:
  klein: "3px"
  chip: "4px"
  standaard: "6px"
  rond: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "22px"
  paneel: "24px"
components:
  button-primary:
    backgroundColor: "{colors.bordjesgroen}"
    textColor: "{colors.vlak}"
    rounded: "{rounded.standaard}"
    padding: "9px 15px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.bordjesgroen-diep}"
    textColor: "{colors.vlak}"
  button-ghost:
    backgroundColor: "{colors.vlak}"
    textColor: "{colors.inkt}"
    rounded: "{rounded.standaard}"
    padding: "9px 15px"
  input-text:
    backgroundColor: "{colors.vlak}"
    textColor: "{colors.inkt}"
    rounded: "{rounded.standaard}"
    padding: "9px 11px"
  gebied-item:
    backgroundColor: "{colors.vlak}"
    textColor: "{colors.inkt}"
    padding: "10px 12px"
  gebied-item-actief:
    backgroundColor: "{colors.bordjesgroen-vlak}"
    textColor: "{colors.bordjesgroen-diep}"
  voorstel-kaart:
    backgroundColor: "{colors.vlak}"
    textColor: "{colors.inkt}"
    rounded: "{rounded.standaard}"
    padding: "12px 14px"
  voorstel-kaart-actief:
    backgroundColor: "{colors.wegwijzerrood-vlak}"
    textColor: "{colors.wegwijzerrood}"
  chip-hoogtepunt:
    backgroundColor: "{colors.bordjesgroen-vlak}"
    textColor: "{colors.bordjesgroen-diep}"
    rounded: "{rounded.chip}"
    padding: "3px 7px"
  knooppunt-marker:
    backgroundColor: "{colors.vlak}"
    textColor: "{colors.bordjesgroen-diep}"
    rounded: "{rounded.rond}"
    size: "24px"
  knooppunt-marker-actief:
    backgroundColor: "{colors.wegwijzerrood}"
    textColor: "{colors.vlak}"
    rounded: "{rounded.rond}"
    size: "28px"
---

# Design System: Knooppuntroutes

## Overview

**Creative North Star: "Het Knooppuntbordje"**

De interface gedraagt zich als de bewegwijzering zelf. Een knooppuntbordje langs
een dijk is groen op wit, draagt cijfers in tabelvorm, heeft geen versiering en
is na tien jaar regen nog leesbaar. Het legt niets uit en laat niets weg. Elke
ontwerpbeslissing hier wordt aan datzelfde toetspunt gehouden: zou dit werken op
een paal langs de weg?

Daaruit volgt de dichtheid en de terughoudendheid. Vlakken zijn plat, randen zijn
één pixel, en er is geen enkel element dat aandacht vraagt zonder een functie te
hebben. De cijferreeks van een route staat in tabelcijfers omdat je hem naast de
bordjes onderweg moet kunnen leggen. Kleur draagt betekenis, nooit sfeer: groen
is het netwerk en alles wat je kunt doen, rood-oranje is de ene route die je hebt
gekozen.

Het gebruiksmoment stuurt de rest. Er wordt gepland vlak voor vertrek, vaak op
een telefoon, soms in het laatste daglicht naast een auto. Daarom haalt alles
bedienbaars op een aanraakscherm de volle 44 pixels, en daarom is de donkere
modus apart samengesteld in plaats van omgekeerd.

**Key Characteristics:**
- Groen voert het netwerk en de handelingen; rood-oranje uitsluitend de gekozen route
- Plat: tonale vlakken en 1px-randen, geen schaduw op panelen
- Tabelcijfers overal waar knooppuntnummers, afstanden of tijden staan
- Nederlandse schrijfwijze, inclusief komma als decimaalteken
- Twee samengestelde thema's, elk met een eigen achtergrondkaart

## Colors

Een palet van twee betekenisdragers op een neutrale, licht warme ondergrond; de
neutralen hebben een groenzweem zodat ze bij het accent horen in plaats van
ernaast te staan.

### Primary
- **Bordjesgroen** (`#0f6b3d` licht / `#2f9c5f` donker): het netwerk en alles wat
  bedienbaar is. Primaire knoppen, het actieve tabblad, focusringen, selectie van
  een fietsgebied, de rand van een knooppuntmarker, de accentkleur van
  schuifregelaars en vinkjes. Als tekst wordt de diepere variant gebruikt
  (`#0a4f2d` licht / `#74d69e` donker), want dezelfde tint kan niet tegelijk
  knopvulling en leesbare tekst zijn.

### Secondary
- **Wegwijzerrood** (`#cc3d10` licht / `#ff7043` donker): de gekozen route, en
  verder niets. De routelijn op de kaart, de markers van de knooppunten die
  erop liggen, en de rand van het geselecteerde voorstel. Een pijl op een
  wegwijzer wijst één kant op en er is er maar één.

### Neutral
- **Papier** (`#faf9f6` licht / `#111613` donker): de ondergrond van pagina en paneel.
- **Vlak** (`#ffffff` licht / `#1a201c` donker): alles wat boven die ondergrond
  ligt — invoervelden, keuzerijen, kaarten, markers.
- **Inkt** (`#14201a` licht / `#e9ede9` donker): primaire tekst.
- **Inkt zacht** (`#5a6560` licht / `#a3b1a6` donker): secundaire tekst, toelichtingen, waarden in de etappelijst.
- **Inkt flauw** (`#8b938e` licht / `#7d8a80` donker): uitsluitend placeholders.
- **Lijn** (`#d9d8d0` licht / `#333c36` donker) en **Lijn zacht** (`#e8e7e0` / `#262e29`): randen en scheidingen.

### Semantisch
- **Waarschuwing** (`#7a4f00` licht / `#e8bb6a` donker) op vlak `#fdf3dd` / `#2a2214`:
  etappes die buiten het knooppuntennetwerk omlopen of op een verkeerde regio wijzen.
- **Fout** (`#8f1d1d` licht / `#ff9b9b` donker) op vlak `#fbebeb` / `#2b1717` met rand
  `#f0d3d3` / `#4a2523`.

### Named Rules

**De Enige Pijl-regel.** Wegwijzerrood komt uitsluitend voor op de gekozen route
en wat daar direct bij hoort. Zodra het ergens anders opduikt — een badge, een
knop, een grafiek — verliest de route zijn voorrang op een kaart die al vol
lijnen staat. Voor waarschuwingen bestaat een aparte kleur; die mag hier niet
voor lenen. Ook de niet-gekozen voorstellen krijgen hem niet: die staan neutraal
op de kaart, want drie rode lijnen zijn geen pijl meer.

**De Twee Thema's-regel.** Licht en donker worden apart samengesteld, nooit
mechanisch omgekeerd. De achtergrondkaart wisselt mee: PDOK `standaard` in het
licht, PDOK `grijs` in het donker, omdat een felwitte kaart op een telefoon in
het laatste daglicht staat te glanzen. Tokennamen beschrijven daarom een rol
(`--actie-tekst`), niet een kleur (`--groen-diep`), want in het donker wordt die
tint juist lichter.

## Typography

**Display Font:** systeemstack (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto`)
**Body Font:** dezelfde stack

**Character:** Er is één familie, zonder eigen lettertype. De hiërarchie komt
volledig uit grootte, gewicht en letterafstand — zoals op bewegwijzering, waar
ook geen tweede letter meedoet. Gewichten zitten op 620 en 680 in plaats van de
gebruikelijke 600/700 stappen; die tussenwaarden geven de koppen precies genoeg
vastheid zonder dat het schreeuwerig wordt.

### Hierarchy
- **Display** (680, 25px, 1.1, -0.025em): de paginatitel, één keer per scherm.
- **Headline** (700, 26px, tabelcijfers, -0.02em): het kilometergetal van de gekozen route.
- **Title** (700, 17px, -0.015em): de afstand op een voorstelkaart.
- **Body** (400, 15px, 1.5): lopende tekst; toelichtingen lopen tot maximaal 42ch.
- **Lead** (620 of 400, 14px, 1.4): de trede tussen body en label, voor tekst die
  net iets meer gewicht draagt dan een label maar geen kop is — de ondertitel
  onder de paginatitel, de naam van een fietsgebied in de lijst, en de
  GPX-downloadlink.
- **Label** (620, 13px, 0.005em): veldlabels en stapkoppen.
- **Reeks** (400, 11.5px, tabelcijfers): de knooppuntreeks onder een voorstel.

### Named Rules

**De Tabelcijfer-regel.** Elk getal dat met de werkelijkheid overeenkomt —
knooppuntnummers, kilometers, rijtijden — staat in `font-variant-numeric:
tabular-nums`. Ze worden naast elkaar gelezen en met de bordjes vergeleken, dus
ze moeten uitlijnen.

## Layout

Twee kolommen: een paneel van `minmax(340px, 400px)` naast een kaart die de rest
vult, met de paginahoogte vast op `100vh` en scroll binnen het paneel. Onder
820px klapt het om naar één kolom met de kaart op `55vh` eronder, en scrollt de
pagina als geheel; bij het tekenen van een route scrollt de kaart dan automatisch
in beeld, omdat hij anders onder de vouw blijft.

Ritme: het paneel heeft 24px boven, 22px opzij en 40px onder. Secties zijn
blokken met 22px marge boven en 20px binnenruimte, gescheiden door een 1px lijn
in plaats van door witruimte alleen. Rijen met bedieningselementen gebruiken 8px
tussenruimte. De gebiedenlijst is begrensd op 280px met eigen scroll, zodat
stap 2 zichtbaar blijft.

Op `pointer: coarse` krijgen knoppen, invoervelden, tabbladen, de GPX-link, het
etappe-opendichtelement en de kaartlaagregels allemaal minimaal 44px hoogte.

## Elevation & Depth

Het systeem is plat. Diepte komt uit tonale lagen — papier onder, vlak erboven —
en uit 1px randen, niet uit schaduw. Panelen, kaarten, invoervelden en
keuzerijen hebben geen `box-shadow`.

### Shadow Vocabulary
- **Boven de kaart** (`box-shadow: 0 1px 4px rgb(0 0 0 / 0.35)`): uitsluitend voor
  elementen die letterlijk boven het kaartbeeld zweven — de marker van een
  knooppunt op de gekozen route, en tooltips.

### Named Rules

**De Plat-tenzij-je-zweeft-regel.** Schaduw is voorbehouden aan elementen die
boven de kaart liggen. Alles binnen het paneel blijft plat; hiërarchie komt daar
uit vlakverschil, randen en typografie.

## Shapes

Eén radius voor vrijwel alles: 6px op knoppen, invoervelden, kaarten en
meldingen. Chips gebruiken 4px, inline code 3px, en knooppuntmarkers zijn rond —
de enige cirkels in het systeem, omdat ze de ronde bordjes uit het veld
nabootsen. Randen zijn overal 1px; het actieve tabblad is de enige uitzondering
met een 2px onderrand. Er wordt niet geknipt, gemaskeerd of afgeschuind, met
uitzondering van het vinkje, dat via `mask-image` de tekstkleur overneemt.

## Components

### Buttons
- **Shape:** 6px radius, 1px rand, 9px 15px binnenruimte.
- **Primary:** bordjesgroen vlak met contrasterende tekst (`#ffffff` licht,
  `#06140c` donker), gewicht 620. Voor de handeling die de stap afsluit: *Maak
  rondjes*, *Plan route*.
- **Hover / Focus:** hover verdiept de vulling; alle knoppen krijgen bij
  `:focus-visible` een 2px ring in de groentekstkleur met 2px offset. Overgangen
  duren 120ms en raken alleen randkleur en achtergrond.
- **Disabled:** vult met inkt-zacht en zet de cursor op `progress`; wordt gebruikt
  terwijl er op Overpass gewacht wordt.
- **Ghost:** vlak met een gewone rand, voor nevenhandelingen (*Zoek*, *Wis*).

### Chips
- **Style:** groen op groenvlak, 4px radius, 3px 7px binnenruimte, 12px.
- **Gebruik:** de bezienswaardigheden langs een route. Alleen tonen, niet klikbaar.

### Cards / Containers
- **Voorstelkaart:** 6px radius, 1px rand, 12px 14px binnenruimte, op vlak.
  Geselecteerd krijgt hij de wegwijzerroodrand plus het route-vlak, én een
  getekend vinkje.
- **Gebiedenlijst:** rijen zonder eigen radius in een omhulsel van 6px, gescheiden
  door 1px raster. Geselecteerd krijgt de rij het groenvlak plus een vinkje.
- **Shadow Strategy:** geen, zie Elevation & Depth.

### Inputs / Fields
- **Style:** vlak met 1px rand, 6px radius, 9px 11px binnenruimte.
- **Focus:** de rand wordt groen en er komt een 2px ring omheen zonder offset.
- **Placeholder:** inkt-flauw, de enige plek waar die kleur voorkomt.

### Navigation
- **Tabbladen:** volle breedte, gedeeld, tekst in inkt-zacht met een doorzichtige
  2px onderrand. Het actieve tabblad krijgt de groentekstkleur, een groene
  onderrand en gewicht 620. Volledig als `tablist` opgebouwd: alleen het actieve
  tabblad zit in de tabvolgorde, pijltjes wisselen ertussen.

### Volgbalk (signature)
Onderweg telt maar één ding: de kaart. In de volgmodus verdwijnt het paneel, wordt
de kaart schermvullend en verschijnt een vaste balk onderaan met
`env(safe-area-inset-bottom)` eronder — binnen duimbereik van een stuurhouder.
Links het eerstvolgende knooppunt (17px, tabelcijfers) met daaronder de resterende
afstand; rechts de knoppen. Zit je meer dan 60 m van de lijn, dan kleuren de
bovenrand en de titel waarschuwingsgeel: dat is het enige wat deze modus je
vertelt, want er is bewust geen turn-by-turn.

Omdat het paneel verborgen is, mag een melding hier nooit via de gewone
statusregel lopen — die zit ín het paneel. Een geweigerde locatietoestemming
verschijnt daarom in de balk zelf.

### Eigen positie
Een gevulde stip van 18px in de actiekleur met een witte rand van 3px en de
schaduw die alles krijgt wat boven de kaart zweeft, met daaromheen een cirkel op
de gemelde nauwkeurigheid. Bewust gevuld en groen, waar knooppuntmarkers open en
omrand zijn: onderweg mag je die twee nooit verwarren.

### Spooklijnen (signature)
De twee niet-gekozen voorstellen blijven zichtbaar op de kaart, zodat je kunt
vergelijken zonder te klikken. Ze onderscheiden zich op drie manieren tegelijk,
waarvan er maar één kleur is: inkt-zacht in plaats van wegwijzerrood, 2px in
plaats van 5px, en gestreept (`2 6`) in plaats van massief. Zweven over een
voorstel maakt zijn lijn in 320ms massief en dik met dezelfde uitloop-curve als
de route-intekening; na 300ms rust glijdt de kaart naar die uitsnede. Op
`pointer: coarse` gebeurt geen van beide, want een tik stuurt ook een
`mouseenter` en de kaart mag niet onder je duim wegschuiven.

Ze liggen in een eigen Leaflet-pane op z-index 390, onder het overlayPane (400).
Zonder die pane tekent de SVG-renderer op volgorde van toevoegen en overtekenen
de spoken juist de route die je gekozen hebt.

### Knooppuntmarker (signature)
Een ronde marker van 24px met 2px groene rand, wit vlak en het nummer in
tabelcijfers van 11px. Ligt het knooppunt op de gekozen route, dan wordt hij
28px, vult zich met wegwijzerrood, krijgt een rand in de omrandingskleur en de
enige schaduw in het systeem. Dit is het element waarin de North Star het
letterlijkst zit: het is het bordje.

## Do's and Don'ts

### Do:
- **Do** houd wegwijzerrood exclusief voor de gekozen route en zijn knooppunten.
- **Do** zet elk getal dat met de werkelijkheid overeenkomt in tabelcijfers.
- **Do** benoem tokens naar hun rol (`--actie-tekst`), niet naar hun kleur.
- **Do** stel licht en donker apart samen, inclusief de bijpassende PDOK-kaartstijl.
- **Do** geef elke gekozen staat naast kleur ook een vorm: het vinkje is er omdat
  kleur alleen geen code is.
- **Do** haal 44px op `pointer: coarse`; dit wordt buiten bediend.
- **Do** schrijf getallen Nederlands, met een komma als decimaalteken.

### Don't:
- **Don't** gebruik schaduw binnen het paneel; alleen wat boven de kaart zweeft krijgt diepte.
- **Don't** voeg een tweede lettertype toe; hiërarchie komt uit grootte en gewicht.
- **Don't** keer het lichte thema mechanisch om voor de donkere modus.
- **Don't** maak er een toeristische reisapp van: geen sfeerfoto's, hero-beelden of
  sterbeoordelingen. Dit product heeft geen beeldmateriaal en mag dat ook niet
  suggereren; de kaart is het beeld.
- **Don't** zet een kicker of bovenkopje boven een kop.
- **Don't** vervang het vinkje door een unicode-teken of emoji.
