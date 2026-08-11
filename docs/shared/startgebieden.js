/**
 * Handmatig samengestelde lijst met fietsgebieden die de moeite waard zijn, met
 * een indicatief startpunt. De app zoekt daar het dichtstbijzijnde knooppunt bij,
 * dus het hoeft niet exact een parkeerplaats te zijn.
 */
export const STARTGEBIEDEN = [
  // --- heuvels, heide en bos ---
  { naam: 'Veluwezoom & Posbank', bij: 'Rheden', lat: 52.0180, lon: 6.0110,
    waarom: 'Het meest geaccidenteerde terrein van Midden-Nederland: pittige klimmen tot boven 100 meter, uitgestrekte paarse heidevelden en panorama over de IJsselvallei.' },
  { naam: 'Utrechtse Heuvelrug & Amerongse Berg', bij: 'Amerongen', lat: 52.0060, lon: 5.4650,
    waarom: 'Dichte loof- en dennenbossen afgewisseld met historische kastelen zoals Kasteel Amerongen. De Amerongse Berg is een van de stevigste klimmen van de regio.' },
  { naam: 'Loonse en Drunense Duinen', bij: 'Kaatsheuvel', lat: 51.6500, lon: 5.1150,
    waarom: 'De "Brabantse Sahara": een enorm gebied met levend stuifzand, naaldbossen en gezellige Brabantse uitspanningen langs de randen.' },
  { naam: 'Gooi & Vechtstreek', bij: 'Bussum', lat: 52.2700, lon: 5.1900,
    waarom: 'Heide en zandafgravingen, historische buitenplaatsen, de dubbele stervesting van Naarden en het Naardermeer: het oudste beschermde natuurgebied van Nederland.' },
  { naam: 'Grenspark Kalmthoutse Heide', bij: 'Ossendrecht', lat: 51.4050, lon: 4.4000,
    waarom: 'Grensoverschrijdend natuurgebied met stille vennen, paarse heide en weidse dennenbossen net over de Belgische grens.' },
  { naam: 'Hoge Veluwe en omgeving', bij: 'Otterlo', lat: 52.1000, lon: 5.7833,
    waarom: 'Zandverstuivingen, heide en eindeloze bospaden.' },
  { naam: 'Sallandse Heuvelrug', bij: 'Holten', lat: 52.3300, lon: 6.4200,
    waarom: 'Paarse heide en de steilste klim van Overijssel, over de Holterberg door het laatste korhoenreservaat van Nederland.' },
  { naam: 'Maasduinen', bij: 'Well', lat: 51.5500, lon: 6.1000,
    waarom: 'Langgerekte duinenrij langs de Maas met vennen en heide.' },
  { naam: 'Drents-Friese Wold', bij: 'Appelscha', lat: 52.9500, lon: 6.3500,
    waarom: 'Bos en heide zover je kijkt, met de Kale Duinen van het Aekingerzand als open zandvlakte middenin.' },
  { naam: 'Speulder- en Sprielderbos', bij: 'Garderen', lat: 52.2450, lon: 5.6600,
    waarom: 'Het bos van de dansende bomen: eeuwenoude beuken op oude wallen, zo grillig gegroeid dat ze lijken te bewegen.' },
  { naam: 'Lemelerberg & Archemerberg', bij: 'Lemele', lat: 52.4650, lon: 6.4000,
    waarom: 'Een losse stuwwal die zestig meter boven Salland uitsteekt, met heide, jeneverbes en uitzicht over het vlakke land eromheen.' },
  { naam: 'Lutterzand & Dinkel', bij: 'De Lutte', lat: 52.3600, lon: 6.9950,
    waarom: 'De Dinkel slingert hier vrij door het zand en ondergraaft steile oevers; eeuwenoude dennen en jeneverbes aan de Duitse grens.' },
  { naam: 'Sint-Jansberg & Mookerheide', bij: 'Mook', lat: 51.7500, lon: 5.8900,
    waarom: 'On-Nederlands reliëf waar bronbeken door een steile stuwwal naar beneden lopen, met uitzicht over het Maasdal.' },
  { naam: 'Dwingelderveld', bij: 'Ruinen', lat: 52.8100, lon: 6.4000,
    waarom: 'Het grootste natte heidegebied van West-Europa: vennen, jeneverbes, schaapskuddes en de schotels van de radiosterrenwacht.' },
  { naam: 'Bargerveen', bij: 'Zwartemeer', lat: 52.6800, lon: 7.0300,
    waarom: 'Een overgebleven stuk oorspronkelijk hoogveen aan de Duitse grens, met veenputten, wollegras en een stilte die je nergens anders hoort.' },

  // --- kust, duinen en deltawerken ---
  { naam: 'Schoorlse Duinen', bij: 'Schoorl', lat: 52.6950, lon: 4.6800,
    waarom: 'De hoogste en breedste duinen van Nederland. Zeer afwisselende paden door dichte bossen en open zandvlaktes, langs De Kerf waar de zee het duin in stroomt.' },
  { naam: 'Nationaal Park Zuid-Kennemerland', bij: 'Overveen', lat: 52.4033, lon: 4.6167,
    waarom: 'Ruig duinlandschap met slingerende schelpenpaden, grote kans op wisenten of Schotse hooglanders, en strakke fietspaden langs de kust.' },
  { naam: 'Amsterdamse Waterleidingduinen', bij: 'Vogelenzang', lat: 52.3200, lon: 4.5700,
    waarom: 'Stille duinvalleien vol damherten, smalle paden en veel water.' },
  { naam: 'Oosterscheldekering & Westerschouwen', bij: 'Burgh-Haamstede', lat: 51.6900, lon: 3.7200,
    waarom: 'Recht over de Deltawerken langs Neeltje Jans, met de Noordzee aan de ene kant en de Oosterschelde aan de andere, en daarachter de ruige duinen en de boswachterij van Kop van Schouwen.' },
  { naam: 'Walcheren & Westkapelle', bij: 'Westkapelle', lat: 51.5270, lon: 3.4400,
    waarom: 'Over de zeedijk van Westkapelle, buitendijks langs zeeschepen bij Vlissingen en door karakteristieke Zeeuwse ringdorpen.' },
  { naam: 'Voornes Duin & Goeree', bij: 'Oostvoorne', lat: 51.9050, lon: 4.0900,
    waarom: 'Een van de soortenrijkste duingebieden van Europa, stille stranden en de historische vesting en houten haven van Goedereede.' },
  { naam: 'Brouwersdam en de Grevelingen', bij: 'Ouddorp', lat: 51.7600, lon: 3.8300,
    waarom: 'Water aan beide kanten, kitesurfers, strand en open horizon.' },
  { naam: 'Zeeuws-Vlaamse kust', bij: 'Cadzand', lat: 51.3700, lon: 3.4000,
    waarom: 'Brede stranden en kreekruggen, tot aan het Zwin waar de zee via een brede geul het polderland in loopt.' },
  { naam: 'Lauwersmeer', bij: 'Lauwersoog', lat: 53.4000, lon: 6.2000,
    waarom: 'Dark Sky Park op de grens van zoet en zout: het donkerste stukje Nederland, met wad en enorme luchten.' },
  { naam: 'Texel', bij: 'Den Burg', lat: 53.0550, lon: 4.7950, veerboot: 'Den Helder',
    waarom: 'De Slufter waar de zee dwars door de duinen het land in loopt, de rode vuurtoren en schapenboeten tussen de tuunwallen.' },
  { naam: 'Schiermonnikoog', bij: 'Schiermonnikoog', lat: 53.4800, lon: 6.1600, veerboot: 'Lauwersoog',
    waarom: 'Autovrij eiland met een van de breedste stranden van Europa, kwelders en schelpenpaden; alles gaat er per fiets.' },

  // --- meren en rivieren ---
  { naam: 'De Linge & De Betuwe', bij: 'Buren', lat: 51.9200, lon: 5.3400,
    waarom: 'Kronkelende dijken langs het langste riviertje van Nederland, vol fruitboomgaarden en nostalgische rivierdorpjes zoals Buren en Leerdam.' },
  { naam: 'Vechtstreek & Loosdrechtse Plassen', bij: 'Loenen aan de Vecht', lat: 52.2100, lon: 5.0200,
    waarom: 'De meanderende Vecht rijgt 17e-eeuwse koepelwoningen, theehuisjes en oude ophaalbruggen aaneen, met de uitgestrekte Loosdrechtse Plassen ernaast.' },
  { naam: 'Nationaal Park De Biesbosch', bij: 'Dordrecht', lat: 51.7667, lon: 4.7167,
    waarom: 'Een zeldzaam zoetwatergetijdengebied. Fietspaden over smalle kades door wilgenvloedbossen en langs open water, te combineren met de oudste stad van Holland.' },
  { naam: 'Nieuwkoopse Plassen & De Meije', bij: 'Nieuwkoop', lat: 52.1500, lon: 4.7833,
    waarom: 'Typisch Hollands veenweidegebied. Het kronkelende dijkje langs de Meije met het watertorentje "Pietje Potlood" geeft klassieke uitzichten.' },
  { naam: 'Reeuwijkse Plassen & Krimpenerwaard', bij: 'Reeuwijk', lat: 52.0450, lon: 4.7300,
    waarom: 'Smalle fietspaden dwars door het merengebied, gecombineerd met stiltepolders en historische kaasboerderijen rond Gouda.' },
  { naam: 'Kinderdijk en de Alblasserwaard', bij: 'Kinderdijk', lat: 51.8833, lon: 4.6400,
    waarom: 'Negentien molens op een rij, daarna eindeloze polderlinten.' },
  { naam: 'Rivierenland bij Wijk bij Duurstede', bij: 'Wijk bij Duurstede', lat: 51.9750, lon: 5.3400,
    waarom: 'Uiterwaarden, veerpontjes en dijken langs de Lek en de Rijn.' },
  { naam: 'Land van Maas en Waal', bij: 'Beuningen', lat: 51.8600, lon: 5.7700,
    waarom: 'Twee rivieren, uiterwaarden en pontjes.' },
  { naam: 'Veerse Meer en Walcheren', bij: 'Veere', lat: 51.5500, lon: 3.6700,
    waarom: 'Historisch havenstadje, dijken langs het meer en Zeeuwse binnenduinrand.' },
  { naam: 'Weerribben-Wieden', bij: 'Giethoorn', lat: 52.7400, lon: 6.0800,
    waarom: 'Rietland, trekgaten en varende dorpjes.' },
  { naam: 'Alde Feanen', bij: 'Earnewâld', lat: 53.1000, lon: 5.9200,
    waarom: 'Fries laagveenmoeras van meren, rietland en petgaten, aan elkaar geregen met zelfbedieningspontjes.' },
  { naam: 'Rivierpark Maasvallei', bij: 'Maaseik', lat: 51.0970, lon: 5.7900,
    waarom: 'De Grensmaas mag hier weer vrij meanderen: grindbanken, ooibos en een rivier die per hoogwater van vorm verandert, met pontjes naar de overkant.' },
  { naam: 'Bieslandse Bos & Ackerdijkse Plassen', bij: 'Delfgauw', lat: 51.9950, lon: 4.3950,
    waarom: 'Vogelrijke moerasnatuur op fietsafstand van de stad. Het hart van de Ackerdijkse Plassen is gesloten voor de rust; je rijdt eromheen.' },

  // --- bijzondere landschappen ---
  { naam: 'Radio Kootwijk & Kootwijkerzand', bij: 'Radio Kootwijk', lat: 52.1750, lon: 5.8100,
    waarom: 'De grootste actieve zandverstuiving van West-Europa, met het monumentale art-deco zendgebouw dat midden in de open zandvlakte verrijst.' },
  { naam: 'Oostvaardersplassen & Markermeerdijk', bij: 'Lelystad', lat: 52.4500, lon: 5.3800,
    waarom: 'Ruige wildernis op de voormalige zeebodem. Strakke, weidse fietspaden met zicht op heckrunderen, konikpaarden en het Markermeer.' },
  { naam: 'Zak van Zuid-Beveland', bij: "'s-Heer Abtskerke", lat: 51.4600, lon: 3.8300,
    waarom: 'Kleinschalig cultuurlandschap van kronkelende bloemendijken, meidoornheggen en vergeten polders.' },
  { naam: 'Waterland', bij: 'Broek in Waterland', lat: 52.4300, lon: 4.9900,
    waarom: 'Houten huizen, veenweide en dijken langs het Markermeer.' },

  // --- vestingsteden, linies en de Limes ---
  { naam: 'Westfriese Omringdijk', bij: 'Enkhuizen', lat: 52.7050, lon: 5.2900,
    waarom: 'Eeuwenoude zeedijk als aaneengesloten fietsroute, met het IJsselmeer aan de ene kant en oude havensteden aan de andere.' },
  { naam: 'Willemstad & het Volkerak', bij: 'Willemstad', lat: 51.6930, lon: 4.4380,
    waarom: 'Zevenpuntige vestingstad aan het water, met de haven binnen de gracht en de Volkeraksluizen in zicht.' },
  { naam: 'Slot Loevestein & Woudrichem', bij: 'Woudrichem', lat: 51.8180, lon: 5.0060,
    waarom: 'Waar Waal en Maas samenkomen: een middeleeuws slot, twee vestingstadjes en pontjes die de drie oevers verbinden.' },
  { naam: 'Heusden & de Bergsche Maas', bij: 'Heusden', lat: 51.7350, lon: 5.1350,
    waarom: 'In oude staat herbouwde vesting met molens op de wallen, gevolgd door strakke dijken langs de Bergsche Maas.' },
  { naam: 'Fort Vechten & de Kromme Rijn', bij: 'Bunnik', lat: 52.0570, lon: 5.1900,
    waarom: 'Het hart van de Nieuwe Hollandse Waterlinie, op de plek waar ook de Romeinse Limes liep: forten, inundatiekanalen en de Kromme Rijn door de boomgaarden.' },
  { naam: 'Bourtange & Westerwolde', bij: 'Bourtange', lat: 52.9950, lon: 7.1900,
    waarom: 'Volledig herbouwde sterschans in een weids, leeg landschap; vanaf de wal zie je de hele vorm in één blik.' },

  // --- net over de grens ---
  { naam: 'Mergelland & Heuvelland', bij: 'Gulpen', lat: 50.8150, lon: 5.8850,
    waarom: 'Hellingbossen, holle wegen en vakwerkdorpen, met kuitenbijters als de Keutenberg en de Eyserbosweg: het enige echte klimwerk van Nederland.' },
  { naam: 'Voerstreek', bij: "'s-Gravenvoeren", lat: 50.7580, lon: 5.7900,
    waarom: 'Stille dalen net over de grens, met hoogstamboomgaarden, kasteelhoeves en vergezichten die in Nederland niet bestaan.' },
  { naam: 'Hoge Kempen & Fietsen door het Water', bij: 'Bokrijk', lat: 50.9631, lon: 5.3927,
    waarom: 'Bij knooppunt 91 rijd je tweehonderd meter dwars door een vijver, met het water op ooghoogte; daarachter liggen de dennenbossen van de Hoge Kempen.' },
  { naam: 'Fietsen door de Bomen in Bosland', bij: 'Hechtel-Eksel', lat: 51.1616, lon: 5.3106,
    waarom: 'Bij knooppunt 272 draait een dubbele cirkel van zevenhonderd meter je omhoog tot tien meter hoogte, tussen de kruinen van het Pijnven.' },
  { naam: 'Brugse Ommeland & Damse Vaart', bij: 'Damme', lat: 51.2510, lon: 3.2830,
    waarom: 'Kaarsrechte vaart onder een gewelf van populieren, van het boekendorp Damme naar de rand van Brugge.' },
];

/**
 * Ruwe schatting van de rijtijd uit de hemelsbrede afstand. Eén vaste snelheid
 * klopt niet: een kort ritje gaat over stads- en N-wegen met veel omweg, een
 * lange rit grotendeels over de snelweg en veel directer. Vandaar dat zowel de
 * omwegfactor als de snelheid meeschuiven met de afstand.
 *
 * Geijkt op bekende ritten vanaf Den Haag: Nieuwkoop ~40 min, Zuid-Kennemerland
 * ~50 min, Veluwezoom ~80 min. Bedoeld om gebieden te sorteren, niet als
 * reisadvies.
 */
export function rijtijdMinuten(km) {
  const lang = Math.min(1, km / 120);
  const wegKm = km * (1.35 - 0.25 * lang);
  const snelheid = 60 + 30 * lang;
  return Math.round((wegKm / snelheid) * 60);
}
