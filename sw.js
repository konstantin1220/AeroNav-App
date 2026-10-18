// Service Worker der öffentlichen AeroNav-Seite.
// - Ist das Gerät freigeschaltet, liefert er die entschlüsselte App aus dem Speicher des Browsers (auch offline).
// - Sonst kommt die Startseite mit der Code-Eingabe, dem Impressum und dem Datenschutz.
// - Bei jedem Start der App schaut er (höchstens alle 10 Minuten) nach einer neuen Fassung und lädt sie im Hintergrund.
//   Hat sich der Zugangscode geändert, entfernt er den alten Schlüssel – dann ist der neue Code nötig.
// - Das Wetter kommt immer zuerst aus dem Netz, sonst die letzte Kopie. OpenStreetMap-Kacheln werden nie gespeichert.
importScripts('kern.js');

const LADER = 'aeronav-lader-ca87adf3ef';
const LADER_DATEIEN = ['./', 'index.html', 'zugang.html', 'kern.js', 'lader.js', 'lader.css', 'impressum.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
const WETTER = 'aeronav-wetter';
const PRUEFABSTAND = 10 * 60000;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(LADER).then((c) => c.addAll(LADER_DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('aeronav-lader-') && name !== LADER) await caches.delete(name);
    await self.clients.claim();
  })());
});

let zuletztGeprueft = 0;
/** Neue Fassung der App holen, wenn es eine gibt. */
async function aktualisieren() {
  if (Date.now() - zuletztGeprueft < PRUEFABSTAND) return;
  zuletztGeprueft = Date.now();
  const stand = await AeroZugang.lesen('stand');
  if (!stand) return;
  let zugang;
  try { zugang = await AeroZugang.zugangHolen(self.registration.scope); } catch { return; } // offline
  if (zugang.version === stand.version) return;
  if (zugang.salt !== stand.salt || !(await AeroZugang.passt(stand.bits, zugang))) {
    await AeroZugang.entfernen(); // neuer Zugangscode
    return;
  }
  try {
    await AeroZugang.installieren(stand.bits, zugang, self.registration.scope);
    for (const c of await self.clients.matchAll()) c.postMessage({ aeronav: 'neue-fassung', version: zugang.version });
  } catch { zuletztGeprueft = 0; }
}

self.addEventListener('fetch', (e) => {
  const anfrage = e.request;
  if (anfrage.method !== 'GET') return;
  const url = new URL(anfrage.url);

  // Wetter: Netz zuerst, sonst letzte Kopie
  if (url.hostname === 'raw.githubusercontent.com' && url.pathname.endsWith('/wetter.json')) {
    e.respondWith(fetch(anfrage).then((antwort) => {
      if (antwort.ok) { const kopie = antwort.clone(); caches.open(WETTER).then((c) => c.put(url.href, kopie)); }
      return antwort;
    }).catch(() => caches.match(url.href).then((alt) => alt ?? Response.error())));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const basis = new URL(self.registration.scope);
  const pfad = url.pathname.startsWith(basis.pathname) ? url.pathname.slice(basis.pathname.length) : url.pathname;
  // Zugangsdaten und die verschlüsselte App immer frisch aus dem Netz
  if (pfad === 'zugang.json' || /^app-[\w-]+\.bin$/.test(pfad)) return;

  const seite = anfrage.mode === 'navigate';
  if (seite) e.waitUntil(aktualisieren().catch(() => {}));

  e.respondWith((async () => {
    // Freigeschaltet: App aus dem Speicher (die Verwaltungsseite zugang.html bleibt immer erreichbar)
    if (pfad !== 'zugang.html') {
      const stand = await AeroZugang.lesen('stand').catch(() => null);
      if (stand) {
        const cache = await caches.open(stand.cache);
        const ziel = seite && (pfad === '' || pfad === 'index.html') ? new URL('index.html', basis).href : url.href;
        const treffer = await cache.match(ziel, { ignoreSearch: true });
        if (treffer) return treffer;
      }
    }
    // Startseite und ihre Dateien: Netz zuerst, ohne Netz die gespeicherte Fassung
    try {
      return await fetch(anfrage);
    } catch {
      const lader = await caches.open(LADER);
      return (await lader.match(anfrage, { ignoreSearch: true })) ?? (seite ? lader.match('index.html') : Response.error());
    }
  })());
});
