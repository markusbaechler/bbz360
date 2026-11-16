import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Multi-Page-App (ADR-1): 1 Modul = 1 HTML-Entry.
// base '/bbz360/' fuer GitHub-Pages-Projektpfad.
// Rollup-Input als root-relative Pfade -> keine Node-Typen noetig.
// Modul-Entries werden pro portiertem Modul ergaenzt (Brief Schritt 3).
export default defineConfig({
  base: '/bbz360/',
  worker: { format: 'es' },
  plugins: [
    // Offline-faehig als PWA (ADR-21): Alle Seiten, Skripte, Stile, Grundlagen und Bilder werden vorab
    // zwischengespeichert; das Beratungsgespraech laeuft danach ohne Netz. Kundendaten bleiben im localStorage.
    VitePWA({
      // Keine stille Uebernahme mitten im Gespraech: Eine neue Version gilt, sobald alle Fenster geschlossen waren.
      registerType: 'prompt',
      injectRegister: 'script-defer',
      includeAssets: ['brand/favicon.ico', 'brand/bbz-icon-180.png'],
      manifest: {
        id: '/bbz360/',
        name: 'bbz360 — Beratungsdialog',
        short_name: 'bbz360',
        description: 'Digitales Beratungsgespräch der bbz bank st.gallen: von der Agenda bis zum Gesprächsbericht.',
        lang: 'de-CH',
        start_url: '/bbz360/',
        scope: '/bbz360/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFFFFF',
        theme_color: '#004078',
        icons: [
          { src: 'brand/bbz-icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'brand/bbz-icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Multi-Page-App: jede Seite ist eine eigene Datei, kein Rueckfall auf index.html
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,html,json,png,jpg,jpeg,svg,ico,ttf,woff2,webp}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        index: 'index.html',
        admin: 'admin.html',
        '01-agenda': 'modules/01-agenda.html',
        '02-bank': 'modules/02-bank.html',
        '03-berater': 'modules/03-berater.html',
        '04-philosophie': 'modules/04-philosophie.html',
        '05-cockpit': 'modules/05-cockpit.html',
        '05b-budget': 'modules/05b-budget.html',
        '06-ziele': 'modules/06-ziele.html',
        '07-lebensplan': 'modules/07-lebensplan.html',
        '07a-finanzieren': 'modules/07a-finanzieren.html',
        '07b-anlegen': 'modules/07b-anlegen.html',
        '07c-pension': 'modules/07c-pension.html',
        '07d-steuern': 'modules/07d-steuern.html',
        '07e-absicherung': 'modules/07e-absicherung.html',
        '07f-nachlass': 'modules/07f-nachlass.html',
        '08-vereinbarungen': 'modules/08-vereinbarungen.html',
        '09-feedback': 'modules/09-feedback.html',
        '10-abschluss': 'modules/10-abschluss.html',
      },
    },
  },
});
