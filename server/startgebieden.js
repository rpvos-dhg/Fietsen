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
    waarom: 'Afwisseling van afgegraven zandafgravingen, heideterreinen zoals de Bussumerheide en historische buitenplaatsen.' },
  { naam: 'Grenspark Kalmthoutse Heide', bij: 'Ossendrecht', lat: 51.4050, lon: 4.4000,
    waarom: 'Grensoverschrijdend natuurgebied met stille vennen, paarse heide en weidse dennenbossen net over de Belgische grens.' },
  { naam: 'Hoge Veluwe en omgeving', bij: 'Otterlo', lat: 52.1000, lon: 5.7833,
    waarom: 'Zandverstuivingen, heide en eindeloze bospaden.' },
  { naam: 'Sallandse Heuvelrug', bij: 'Holten', lat: 52.3300, lon: 6.4200,
    waarom: 'Paarse heide en de steilste klim van Overijssel.' },
  { naam: 'Maasduinen', bij: 'Well', lat: 51.5500, lon: 6.1000,
    waarom: 'Langgerekte duinenrij langs de Maas met vennen en heide.' },
  { naam: 'Drents-Friese Wold', bij: 'Appelscha', lat: 52.9500, lon: 6.3500,
    waarom: 'Zandverstuiving, bos en heide zover je kijkt.' },

  // --- kust, duinen en deltawerken ---
  { naam: 'Schoorlse Duinen', bij: 'Schoorl', lat: 52.6950, lon: 4.6800,
    waarom: 'De hoogste en breedste duinen van Nederland. Zeer afwisselende paden door dichte bossen en open zandvlaktes, langs De Kerf waar de zee het duin in stroomt.' },
  { naam: 'Nationaal Park Zuid-Kennemerland', bij: 'Overveen', lat: 52.4033, lon: 4.6167,
    waarom: 'Ruig duinlandschap met slingerende schelpenpaden, grote kans op wisenten of Schotse hooglanders, en strakke fietspaden langs de kust.' },
  { naam: 'Amsterdamse Waterleidingduinen', bij: 'Vogelenzang', lat: 52.3200, lon: 4.5700,
    waarom: 'Stille duinvalleien vol damherten, smalle paden en veel water.' },
  { naam: 'Oosterscheldekering & Westerschouwen', bij: 'Burgh-Haamstede', lat: 51.6900, lon: 3.7200,
    waarom: 'Recht over de Deltawerken met de Noordzee aan de ene kant en het Oosterscheldenatuurgebied aan de andere, gecombineerd met de ruige duinen van Schouwen.' },
  { naam: 'Walcheren & Westkapelle', bij: 'Westkapelle', lat: 51.5270, lon: 3.4400,
    waarom: 'Over de zeedijk van Westkapelle, buitendijks langs zeeschepen bij Vlissingen en door karakteristieke Zeeuwse ringdorpen.' },
  { naam: 'Voornes Duin & Goeree', bij: 'Oostvoorne', lat: 51.9050, lon: 4.0900,
    waarom: 'Een van de soortenrijkste duingebieden van Europa, stille stranden en de historische vesting en houten haven van Goedereede.' },
  { naam: 'Brouwersdam en de Grevelingen', bij: 'Ouddorp', lat: 51.7600, lon: 3.8300,
    waarom: 'Water aan beide kanten, kitesurfers, strand en open horizon.' },
  { naam: 'Zeeuws-Vlaamse kust', bij: 'Cadzand', lat: 51.3700, lon: 3.4000,
    waarom: 'Brede stranden, kreekruggen en het Zwin.' },
  { naam: 'Lauwersmeer', bij: 'Lauwersoog', lat: 53.4000, lon: 6.2000,
    waarom: 'Donkerste stukje Nederland, wad en enorme luchten.' },

  // --- meren en rivieren ---
  { naam: 'De Linge & De Betuwe', bij: 'Buren', lat: 51.9200, lon: 5.3400,
    waarom: 'Kronkelende dijken langs het langste riviertje van Nederland, vol fruitboomgaarden en nostalgische rivierdorpjes zoals Buren en Leerdam.' },
  { naam: 'Vechtstreek & Loosdrechtse Plassen', bij: 'Loenen aan de Vecht', lat: 52.2100, lon: 5.0200,
    waarom: 'De meanderende Vecht rijgt 17e-eeuwse koepelwoningen, theehuisjes en oude ophaalbruggen aaneen, met de uitgestrekte Loosdrechtse Plassen ernaast.' },
  { naam: 'Nationaal Park De Biesbosch', bij: 'Dordrecht', lat: 51.7667, lon: 4.7167,
    waarom: 'Een zeldzaam zoetwatergetijdengebied. Fietspaden over kades door wilgenvloedbossen, langs open water en beverleefgebieden.' },
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

  // --- bijzondere landschappen ---
  { naam: 'Radio Kootwijk & Kootwijkerzand', bij: 'Radio Kootwijk', lat: 52.1750, lon: 5.8100,
    waarom: 'De grootste actieve zandverstuiving van West-Europa, met het monumentale art-deco zendgebouw dat midden in de open zandvlakte verrijst.' },
  { naam: 'Oostvaardersplassen & Markermeerdijk', bij: 'Lelystad', lat: 52.4500, lon: 5.3800,
    waarom: 'Ruige wildernis op de voormalige zeebodem. Strakke, weidse fietspaden met zicht op heckrunderen, konikpaarden en het Markermeer.' },
  { naam: 'Zak van Zuid-Beveland', bij: "'s-Heer Abtskerke", lat: 51.4600, lon: 3.8300,
    waarom: 'Kleinschalig cultuurlandschap van kronkelende bloemendijken, meidoornheggen en vergeten polders.' },
  { naam: 'Waterland', bij: 'Broek in Waterland', lat: 52.4300, lon: 4.9900,
    waarom: 'Houten huizen, veenweide en dijken langs het Markermeer.' },
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
