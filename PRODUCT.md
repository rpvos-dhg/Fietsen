# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primair de eigenaar zelf, die af en toe de link deelt met vrienden en familie.
De typische situatie is spontaan: iemand heeft zin om te gaan fietsen, weet
ongeveer hoeveel kilometer en hoeveel tijd er is, en wil binnen enkele minuten
een route hebben om op te navigeren. Meelezers zijn geen fietsroute-experts en
krijgen geen uitleg vooraf, dus de interface moet zonder toelichting te bedienen
zijn. Het blijft een kleine kring; er is geen aanmelding, geen rollen en geen
verwachting van gelijktijdig gebruik door onbekenden.

## Product Purpose

De vraag "ik wil ongeveer 43 km fietsen" omzetten in een concrete route over
Nederlandse fietsknooppunten die daadwerkelijk bestaat, echte fietspaden volgt en
langs iets de moeite waards komt. Daarnaast het omgekeerde: een zelf ingevoerde
of elders gevonden knooppuntreeks natrekken tegen de echte data.

Het is gelukt wanneer de gebruiker de deur uit gaat met een route waarvan de
knooppuntnummers kloppen met de bordjes langs de weg.

## Positioning

De route wordt afgeleid uit het werkelijke knooppuntennetwerk in plaats van
plausibel opgeschreven. Daardoor kan de app iets wat een taalmodel of een
generieke routeplanner niet kan: aantonen dat een voorgestelde knooppuntreeks
*niet* bestaat. Opeenvolgende knooppunten liggen in werkelijkheid zelden verder
dan tien kilometer uit elkaar; een grotere sprong betekent vrijwel altijd dat de
nummers uit twee verschillende regionetwerken komen, en dat wordt gemeld in
plaats van weggepoetst met een rechte lijn.

De aanleiding is concreet: een chatbot leverde de reeks
`83 84 85 22 60 59 33 34 35 42 41 83` voor de Nieuwkoopse Plassen, met een
GPX-bestand van met de hand ingetypte coördinaten. Geen enkele variant van die
reeks bleek aaneengesloten te bestaan.

## Operating Context

Plannen gebeurt thuis, vooraf, op een laptop of telefoon. Vaak hoort daar een
autorit bij: de fiets gaat achterin en er wordt gezocht binnen een maximale
rijtijd vanaf een postcode. Vertrekken vanaf huis zonder auto is een gelijkwaardig
alternatief.

Onderweg wordt genavigeerd op een **iPhone met een fiets-app** (zoals Komoot,
OsmAnd of Fietsknoop). De GPX moet daar zonder nabewerking in te laden zijn en
bevat zowel het volledige spoor als een waypoint per knooppunt.

Een nieuw gebied kost de eerste keer minuten omdat de publieke Overpass-API
traag is; daarna komt het uit de lokale cache. Die wachttijd is een vast
onderdeel van het gebruik en moet zichtbaar zijn, niet verstopt.

## Capabilities and Constraints

Bevestigde functionaliteit:

- Rondjes genereren van een gevraagde lengte vanaf een gekozen startgebied,
  gescoord op bezienswaardigheden binnen 400 m van de route.
- Fietsgebieden voorstellen op geschatte rijtijd vanaf een postcode of plaats.
- Een zelf ingevoerde knooppuntreeks omzetten in een route, met waarschuwing bij
  etappes die op een verkeerde regio wijzen.
- GPX-export met spoor en knooppunt-waypoints.
- Een volgmodus voor onderweg: schermvullende kaart, eigen positie, eerstvolgend
  knooppunt en resterende afstand. De lopende rit wordt in de browser bewaard en
  na een herstart van de webapp hersteld, want een telefoon gooit een pagina weg
  zodra hij naar de achtergrond gaat.
- De kaart kan draaien: met twee vingers zelf, of automatisch mee met de
  rijrichting, zodat linksaf op het scherm ook linksaf op de weg is.
- Plannen werkt zonder verbinding: de gebiedenlijst zit in de app, de kaartcellen
  komen met de site mee. Alleen de plaatsnaamzoeker heeft het net nodig, en die
  valt terug op de volledige lijst.

Technische randvoorwaarden die toekomstig werk moet respecteren:

- PDOK publiceert Regionale Fietsnetwerken uitsluitend als WMS, dus als
  kaartbeeld. Er is geen WFS, OGC API Features of Atom-download. De officiële
  laag kan wel getoond worden, maar er valt geen routeerbare geometrie uit te
  halen; die komt uit het OpenStreetMap `rcn`-netwerk.
- Publieke Overpass-instanties staan twee gelijktijdige verzoeken per IP toe en
  zijn regelmatig overbelast. Gebieden worden per cel van 0,25° op schijf
  gecachet.
- Knooppuntnummers zijn alleen binnen een regio uniek. Elke opzoeking heeft een
  geografisch ankerpunt nodig.
- Regionale Overpass-mirrors met een deelbestand van de wereld antwoorden met
  HTTP 200 en nul elementen buiten hun gebied; alleen wereldwijde mirrors zijn
  bruikbaar.
- BRouter dient als terugval wanneer het knooppuntennetwerk een gat heeft.
- Een webapp op een telefoon heeft geen achtergrondleven: naar de achtergrond
  gaan betekent dat de positiewatch stilvalt, het schermslot losgelaten wordt en
  de pagina weggegooid kan worden. Alles wat onderweg nodig is moet daarom
  herstelbaar zijn uit de browseropslag, en positie en schermslot moeten bij
  terugkeer opnieuw worden aangevraagd.
- Fouten van de locatiebepaling zijn onderweg normaal. Alleen een geweigerde
  toestemming is blijvend; time-outs en "positie onbeschikbaar" gaan over.

Terminologie: *knooppunt* is een genummerd kruispunt in het netwerk, *etappe* de
verbinding tussen twee opeenvolgende knooppunten, *rondje* een sluitende route
die eindigt waar hij begon.

Openstaand productbesluit, nog niet gebouwd:

- De generator blijft nu strikt op het officiële knooppuntennetwerk. Gewenst is
  dat knooppunten **leidend** blijven maar dat een mooi stuk fietspad buiten het
  netwerk ertussen mag zitten. Gevolg dat daarbij hoort: het routebriefje met
  nummers dekt de route dan niet meer volledig, en dat moet zichtbaar zijn voor
  wie op de bordjes rijdt.

## Brand Commitments

De interface is Nederlandstalig, inclusief foutmeldingen en de knooppuntreeks.
Getallen volgen de Nederlandse schrijfwijze (komma als decimaalteken). Er is geen
logo, huisstijl of merknaam vastgelegd.

## Evidence on Hand

Alle inhoud komt uit publieke bronnen en wordt live opgehaald: PDOK BRT
Achtergrondkaart en Regionale Fietsnetwerken (Stichting Landelijk Fietsplatform),
PDOK Locatieserver, OpenStreetMap via Overpass, BRouter.

De lijst met fietsgebieden in `server/startgebieden.js` is met de hand
samengesteld, met indicatieve startcoördinaten; de app zoekt daar het
dichtstbijzijnde knooppunt bij.

Er zijn geen gebruikersaantallen, reviews, testimonials of prestatieclaims. Die
mogen niet verzonnen worden.

**Knooppuntnummers, coördinaten en afstanden mogen nooit worden geschat of
ingevuld zonder dekking in de opgehaalde data.** Dat is de fout waar dit product
op antwoordt.

## Product Principles

1. **Alleen tonen wat in de data staat.** Een route die niet bestaat wordt als
   zodanig gemeld, niet gladgestreken tot een rechte lijn.
2. **De bordjes zijn de waarheid.** Wat op het scherm staat moet overeenkomen met
   wat de fietser onderweg ziet; een nummer twee keer in één rondje is daarom
   onbruikbaar.
3. **Klaar om op te navigeren.** Een route is pas af als hij zonder nabewerking
   in een fiets-app op de telefoon geladen kan worden.
4. **Wachten mag, stilvallen niet.** De trage eerste keer per gebied is inherent
   aan de gratis bronnen; die tijd wordt zichtbaar gemaakt met voortgang.
5. **Onbekende bediener.** Iemand die de link doorgestuurd krijgt moet zonder
   uitleg een route kunnen maken.

## Accessibility & Inclusion

Geen specifieke standaard vastgelegd. Wel bekend: de app wordt ook op een
telefoonscherm gebruikt, en meelezers kennen het knooppuntensysteem niet
noodzakelijk.

Wat wél vastligt, omdat het uit tests met bedachte gebruikers naar voren kwam:
de volgmodus moet met het toetsenbord te bedienen zijn (de kaartmarkeringen zijn
opschrift en horen niet in de tabvolgorde), de volgbalk is een live-gebied zodat
het volgende knooppunt wordt voorgelezen, en knoppen die uit losse tekstblokken
zijn opgebouwd krijgen een eigen `aria-label` — anders plakt een schermlezer die
blokken aan elkaar tot onzin.
