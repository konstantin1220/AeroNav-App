// AeroNav mit Zugangscode – gemeinsamer Kern für die Startseite und den Service Worker.
// Die App liegt verschlüsselt im öffentlichen Repository (AES-GCM, 256 Bit). Der Schlüssel wird im Browser aus dem
// Zugangscode abgeleitet (PBKDF2 mit SHA-256). Der Code selbst verlässt das Gerät nicht und wird nicht gespeichert;
// gespeichert werden nur der abgeleitete Schlüssel und die entschlüsselten App-Dateien – bis man den Zugang entfernt.
(function (global) {
  'use strict';
  const DB = 'aeronav-zugang';
  const SPEICHER = 'werte';
  const APP_CACHE = 'aeronav-app-entschluesselt';
  const PRUEFTEXT = 'AeroNav';
  const TYPEN = {
    html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  };

  const ausBase64 = (text) => {
    const roh = atob(text);
    const bytes = new Uint8Array(roh.length);
    for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
    return bytes;
  };

  // ---------- Kleiner Speicher (IndexedDB) ----------

  function oeffnen() {
    return new Promise((ok, fehler) => {
      const anfrage = indexedDB.open(DB, 1);
      anfrage.onupgradeneeded = () => anfrage.result.createObjectStore(SPEICHER);
      anfrage.onsuccess = () => ok(anfrage.result);
      anfrage.onerror = () => fehler(anfrage.error);
    });
  }
  async function lesen(name) {
    const db = await oeffnen();
    return new Promise((ok, fehler) => {
      const a = db.transaction(SPEICHER).objectStore(SPEICHER).get(name);
      a.onsuccess = () => ok(a.result ?? null);
      a.onerror = () => fehler(a.error);
    });
  }
  async function schreiben(name, wert) {
    const db = await oeffnen();
    return new Promise((ok, fehler) => {
      const t = db.transaction(SPEICHER, 'readwrite');
      t.objectStore(SPEICHER).put(wert, name);
      t.oncomplete = () => ok();
      t.onerror = () => fehler(t.error);
    });
  }
  /** Zugang auf diesem Gerät entfernen: Schlüssel und entschlüsselte App löschen. */
  async function entfernen() {
    await schreiben('stand', null);
    for (const name of await caches.keys()) if (name.startsWith(APP_CACHE)) await caches.delete(name);
  }

  // ---------- Schlüssel und Entschlüsseln ----------

  /** 256 Bit aus dem Code ableiten (Salz und Wiederholungen stehen öffentlich in zugang.json). */
  async function schluesselAusCode(code, zugang) {
    const roh = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(code).trim()), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: ausBase64(zugang.salt), iterations: zugang.iterationen }, roh, 256);
    return new Uint8Array(bits);
  }

  /** daten = 12 Byte IV, dann Geheimtext mit Prüfsumme. Wirft bei falschem Schlüssel. */
  async function entschluesseln(bits, daten) {
    const schluessel = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: daten.slice(0, 12) }, schluessel, daten.slice(12)));
  }

  /** Passt der Schlüssel zum aktuellen Stand? */
  async function passt(bits, zugang) {
    try {
      return new TextDecoder().decode(await entschluesseln(bits, ausBase64(zugang.pruef))) === PRUEFTEXT;
    } catch {
      return false;
    }
  }

  async function entpacken(bytes) {
    const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(strom).arrayBuffer());
  }

  async function zugangHolen(basis) {
    const antwort = await fetch(new URL('zugang.json', basis), { cache: 'no-store' });
    if (!antwort.ok) throw new Error(`zugang.json: HTTP ${antwort.status}`);
    return antwort.json();
  }

  /** App laden, entschlüsseln und in den Speicher des Browsers legen. Danach liefert der Service Worker sie aus. */
  async function installieren(bits, zugang, basis) {
    const antwort = await fetch(new URL(zugang.datei, basis), { cache: 'no-store' });
    if (!antwort.ok) throw new Error(`App-Datei: HTTP ${antwort.status}`);
    const klar = await entpacken(await entschluesseln(bits, new Uint8Array(await antwort.arrayBuffer())));
    const paket = JSON.parse(new TextDecoder().decode(klar));
    const name = `${APP_CACHE}-${zugang.version}`;
    await caches.delete(name);
    const cache = await caches.open(name);
    await Promise.all(Object.entries(paket.dateien).map(([pfad, d]) => cache.put(
      new URL(pfad, basis).href,
      new Response(d.text ?? ausBase64(d.b64), { headers: { 'Content-Type': TYPEN[pfad.split('.').pop()] ?? 'application/octet-stream' } }),
    )));
    await schreiben('stand', { bits, version: zugang.version, salt: zugang.salt, cache: name, seit: new Date().toISOString() });
    for (const alt of await caches.keys()) if (alt.startsWith(APP_CACHE) && alt !== name) await caches.delete(alt);
    return paket;
  }

  global.AeroZugang = { APP_CACHE, lesen, schreiben, entfernen, schluesselAusCode, passt, zugangHolen, installieren };
})(self);
