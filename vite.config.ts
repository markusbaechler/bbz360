import { defineConfig } from 'vite';

// Multi-Page-App (ADR-1): 1 Modul = 1 HTML-Entry.
// base '/bbz360/' fuer GitHub-Pages-Projektpfad.
// Rollup-Input als root-relative Pfade -> keine Node-Typen noetig.
// Modul-Entries werden pro portiertem Modul ergaenzt (Brief Schritt 3).
export default defineConfig({
  base: '/bbz360/',
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
        '06-ziele': 'modules/06-ziele.html',
        '07a-finanzieren': 'modules/07a-finanzieren.html',
        '07b-anlegen': 'modules/07b-anlegen.html',
        '08-vereinbarungen': 'modules/08-vereinbarungen.html',
        '09-feedback': 'modules/09-feedback.html',
      },
    },
  },
});
