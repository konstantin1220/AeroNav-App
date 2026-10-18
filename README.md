# AeroNav

Flugvorbereitung für VFR-Piloten im Verein – **nur mit Zugangscode**.

**https://konstantin1220.github.io/AeroNav-App/**

AeroNav ist eine Planungs- und Orientierungshilfe, **keine zugelassene Navigationsquelle**. Verbindlich sind AIP,
ICAO-Karte, NOTAM, amtliches Flugwetter (DWD) und das Flughandbuch.

## So funktioniert der Zugang

- Die App liegt hier nur **verschlüsselt** (`app-….bin`, AES-GCM mit 256 Bit). Ohne Code ist sie nicht lesbar.
- Auf der Startseite gibt man den Zugangscode ein. Der Browser leitet daraus den Schlüssel ab (PBKDF2, SHA-256,
  Salz und Wiederholungen in `zugang.json`), entschlüsselt die App und speichert sie auf dem Gerät. Danach startet
  AeroNav direkt und funktioniert auch offline.
- Der Code steht nirgends im Klartext und wird nicht übertragen.
- Neue Fassungen lädt die App beim Start im Hintergrund. Wird der Code geändert, muss man den neuen Code eingeben.
- Zugang auf einem Gerät entfernen: `zugang.html`.

Der Quelltext der App liegt in einem privaten Repository; dieses Repository enthält nur die Startseite, die
verschlüsselte App und das Wetter.

## Wetter

Die Action „Wetter holen“ legt alle 30 Minuten METAR und TAF vom Aviation Weather Center (NOAA, gemeinfrei) als
`wetter.json` auf den Zweig `wetter`.

## Lizenzen

Startseite und Service Worker: MIT-Lizenz (`LICENSE`). In der App: Luftfahrtdaten von openAIP (CC BY-NC 4.0),
Hindernisse © OpenStreetMap-Mitwirkende (ODbL), Grundkarte Natural Earth (gemeinfrei), Leaflet (BSD-2-Clause) –
Einzelheiten in der App unter „Mehr“.
