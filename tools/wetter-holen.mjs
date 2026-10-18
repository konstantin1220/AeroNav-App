// Holt aktuelle METAR und TAF für den Kartenbereich vom Aviation Weather Center (NOAA)
// und schreibt sie in eine kleine JSON-Datei.
// Aufruf: node tools/wetter-holen.mjs [Zieldatei]   (Standard: wetter.json im aktuellen Ordner)
//
// Läuft alle 30 Minuten als GitHub Action (.github/workflows/wetter.yml). Der Browser kann
// aviationweather.gov nicht direkt abfragen (kein CORS), deshalb dieser Umweg.
// Daten der US-Regierung (NOAA) sind gemeinfrei.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const BEREICH = [4.5,46.3,16.5,55.6]; // Westen, Süden, Osten, Norden

const API = 'https://aviationweather.gov/api/data/';
const KOPF = { 'User-Agent': 'AeroNav-Wetter (https://github.com/konstantin1220/AeroNav-App)' };

async function abrufen(pfad) {
  for (let versuch = 1; ; versuch++) {
    const antwort = await fetch(API + pfad, { headers: KOPF });
    if (antwort.status === 204) return [];
    if (antwort.ok) return antwort.json();
    if (versuch >= 3) throw new Error(`${pfad.slice(0, 60)}…: HTTP ${antwort.status}`);
    await new Promise((r) => setTimeout(r, 5000 * versuch));
  }
}

const iso = (sekunden) => new Date(sekunden * 1000).toISOString();

async function main() {
  const [w, s, o, n] = BEREICH;
  const stationen = await abrufen(`stationinfo?bbox=${s},${w},${n},${o}&format=json`);
  const ids = stationen.filter((st) => st.siteType?.some((t) => t === 'METAR' || t === 'TAF')).map((st) => st.icaoId);
  const pakete = [];
  for (let i = 0; i < ids.length; i += 80) pakete.push(ids.slice(i, i + 80).join(','));

  const metar = {};
  const taf = {};
  for (const paket of pakete) {
    for (const m of await abrufen(`metar?ids=${paket}&format=json&hours=3`)) {
      const alt = metar[m.icaoId];
      if (alt && alt.zeit >= iso(m.obsTime)) continue;
      metar[m.icaoId] = { roh: m.rawOb, zeit: iso(m.obsTime), lat: m.lat, lon: m.lon, name: m.name };
    }
    for (const t of await abrufen(`taf?ids=${paket}&format=json`)) {
      if (t.validTimeTo * 1000 < Date.now()) continue; // abgelaufen
      const alt = taf[t.icaoId];
      const ausgabe = new Date(t.issueTime).toISOString();
      if (alt && alt.zeit >= ausgabe) continue;
      taf[t.icaoId] = { roh: t.rawTAF, zeit: ausgabe, gueltigVon: iso(t.validTimeFrom), gueltigBis: iso(t.validTimeTo), lat: t.lat, lon: t.lon, name: t.name };
    }
  }

  if (Object.keys(metar).length < 30) throw new Error(`Nur ${Object.keys(metar).length} METAR – nichts geschrieben.`);
  const ziel = process.argv[2] ?? 'wetter.json';
  writeFileSync(ziel, JSON.stringify({
    stand: new Date().toISOString(),
    quelle: 'Aviation Weather Center (NOAA), aviationweather.gov',
    metar,
    taf,
  }));
  console.log(`${Object.keys(metar).length} METAR und ${Object.keys(taf).length} TAF nach ${ziel} geschrieben.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
