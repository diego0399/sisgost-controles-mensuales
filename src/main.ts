import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Versión neutral para oferta: descarta UNA sola vez lo que versiones anteriores dejaron en
// localStorage (traía nombres e instituciones reales). Las claves compartidas no cambian; solo
// se vacían para que ambos módulos se vuelvan a sembrar con los datos demo.
const MARCA_DEMO = 'sisgost_demo_anonimizado_v1';
try {
  if (localStorage.getItem(MARCA_DEMO) !== '1') {
    Object.keys(localStorage).filter((k) => k.startsWith('sisgost')).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(MARCA_DEMO, '1');
  }
} catch { /* sin localStorage: la demo corre en memoria */ }

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
