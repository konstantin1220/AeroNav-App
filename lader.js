// Startseite: Zugangscode prüfen, App entschlüsseln und öffnen; auf zugang.html den Zugang verwalten.
(function () {
  'use strict';
  const basis = new URL('./', location.href).href;
  const verwalten = /zugang\.html$/.test(location.pathname);
  const $ = (id) => document.getElementById(id);
  const form = $('anmelden');
  const eingabe = $('code');
  const status = (text, art = '') => { $('status').textContent = text; $('status').dataset.art = art; };
  const sperren = (an) => { for (const el of form.elements) el.disabled = an; };

  async function impressumZeigen() {
    try {
      const i = await (await fetch('impressum.json')).json();
      if (!i.name) { $('impressum-teil').hidden = true; return; }
      const el = $('impressum');
      el.replaceChildren();
      const zeile = (text, fett) => { const p = document.createElement(fett ? 'strong' : 'span'); p.textContent = text; el.append(p, document.createElement('br')); };
      zeile('Angaben nach § 18 Abs. 1 MStV');
      zeile(i.name, true);
      for (const z of i.anschrift ?? []) zeile(z);
      if (i.vertreten) zeile(`Vertreten durch: ${i.vertreten}`);
      if (i.email) zeile(`E-Mail: ${i.email}`);
    } catch { $('impressum').textContent = 'Impressum gerade nicht erreichbar.'; }
  }

  /** Warten, bis der Service Worker diese Seite steuert, dann die App öffnen. */
  async function appOeffnen() {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((ok) => { navigator.serviceWorker.addEventListener('controllerchange', ok, { once: true }); setTimeout(ok, 3000); });
    }
    location.replace(basis);
  }

  async function freischalten(code) {
    sperren(true);
    status('Code wird geprüft …');
    try {
      const zugang = await AeroZugang.zugangHolen(basis);
      const bits = await AeroZugang.schluesselAusCode(code, zugang);
      if (!(await AeroZugang.passt(bits, zugang))) {
        await new Promise((ok) => setTimeout(ok, 800));
        status('Der Code stimmt nicht.', 'fehler');
        sperren(false);
        eingabe.select();
        return;
      }
      status('App wird entschlüsselt und gespeichert …');
      await AeroZugang.installieren(bits, zugang, basis);
      status('Fertig – AeroNav startet.', 'ok');
      await appOeffnen();
    } catch (fehler) {
      status(navigator.onLine === false ? 'Für das erste Öffnen braucht AeroNav Internet.' : `Das hat nicht geklappt: ${fehler.message}`, 'fehler');
      sperren(false);
    }
  }

  async function start() {
    impressumZeigen();
    if (!('serviceWorker' in navigator) || !('DecompressionStream' in window) || !window.crypto?.subtle || !('indexedDB' in window)) {
      status('Dieser Browser kann AeroNav nicht öffnen. Bitte Safari, Chrome, Edge oder Firefox in aktueller Version benutzen.', 'fehler');
      sperren(true);
      return;
    }
    try { await navigator.serviceWorker.register('sw.js'); } catch (fehler) { status(`Service Worker: ${fehler.message}`, 'fehler'); }
    const stand = await AeroZugang.lesen('stand').catch(() => null);
    fetch('zugang.json', { cache: 'no-store' }).then((a) => a.json()).then((z) => { if (z.ziffern) eingabe.inputMode = 'numeric'; }).catch(() => {});

    if (verwalten) {
      $('verwalten').hidden = false;
      form.hidden = Boolean(stand);
      $('verwalten-stand').textContent = stand ? `Freigeschaltet seit ${new Date(stand.seit).toLocaleString('de-DE')}.` : 'Auf diesem Gerät nicht freigeschaltet.';
      $('entfernen').disabled = !stand;
      $('entfernen').addEventListener('click', async () => {
        if (!confirm('Zugang auf diesem Gerät entfernen? Danach ist der Zugangscode wieder nötig.')) return;
        await AeroZugang.entfernen();
        location.replace(basis);
      });
    } else if (stand) {
      // Freigeschaltet, aber die App fehlt im Speicher (z. B. vom Browser aufgeräumt): ohne Code neu holen
      sperren(true);
      status('App wird geladen …');
      try {
        const zugang = await AeroZugang.zugangHolen(basis);
        if (await AeroZugang.passt(stand.bits, zugang)) {
          await AeroZugang.installieren(stand.bits, zugang, basis);
          await appOeffnen();
          return;
        }
        await AeroZugang.entfernen();
        status('Der Zugangscode wurde geändert – bitte den neuen Code eingeben.', 'fehler');
      } catch {
        status('Die App ist auf diesem Gerät nicht mehr gespeichert. Bitte mit Internet noch einmal öffnen.', 'fehler');
      }
      sperren(false);
    }

    if (!form.hidden) eingabe.focus();
  }

  // Sofort abfangen: Das Formular darf nie normal abgeschickt werden (sonst stünde der Code in der Adresse)
  let bereit = null;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await bereit;
    if (eingabe.value.trim() && !eingabe.disabled) freischalten(eingabe.value);
  });
  bereit = start();
})();
