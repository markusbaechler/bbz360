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
        '01-agenda': 'modules/01-agenda.html',
      },
    },
  },
});
