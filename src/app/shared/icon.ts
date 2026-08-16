import { Component, input } from '@angular/core';

/**
 * Íconos de línea (estilo minimalista) de toda la interfaz: navegación, encabezados, estados,
 * checklists, botones y tablas. Se dibujan aquí y no con emojis porque un emoji cambia de forma y
 * de color según el sistema operativo y la fuente: el mismo estado terminaba viéndose distinto en
 * cada equipo. El trazo hereda `currentColor`, así que un texto en verde dibuja su icono en verde.
 */
@Component({
  selector: 'ui-icon',
  styles: `:host { display: inline-flex; vertical-align: -.14em; } svg { width: var(--icon-size, 18px); height: var(--icon-size, 18px); }`,
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true" [style.--icon-size.px]="size()">
      @switch (name()) {
        @case ('panel') { <rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/> }
        @case ('inbox') { <path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/> }
        @case ('assign') { <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/> }
        @case ('folder') { <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/> }
        @case ('archive') { <rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/> }
        @case ('tool') { <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/> }
        @case ('settings') { <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/> }
        @case ('truck') { <path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/> }
        @case ('shield') { <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/> }
        @case ('file') { <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/> }
        @case ('report') { <path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/> }
        @case ('clock') { <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/> }
        @case ('users') { <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/> }
        @case ('logout') { <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/> }
        @case ('mail') { <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/> }
        @case ('check') { <path d="M20 6 9 17l-5-5"/> }
        @case ('eye') { <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/> }
        @case ('download') { <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/> }
        @case ('send') { <path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/> }
        @case ('plus') { <path d="M12 5v14M5 12h14"/> }
        @case ('link') { <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/> }
        @case ('alert') { <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/> }
        @case ('box') { <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/> }
        @case ('map') { <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/> }
        @case ('undo') { <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/> }
        @case ('layers') { <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/> }
        @case ('search') { <circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/> }
        @case ('x') { <path d="M18 6 6 18M6 6l12 12"/> }
        @case ('circle') { <circle cx="12" cy="12" r="8"/> }
        @case ('check-circle') { <circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-5.5"/> }
        @case ('x-circle') { <circle cx="12" cy="12" r="9"/><path d="M15 9 9 15M9 9l6 6"/> }
        @case ('monitor') { <rect x="2" y="4" width="20" height="12" rx="2"/><path d="M9 20h6M12 16v4"/> }
        @case ('laptop') { <rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/> }
        @case ('user') { <circle cx="12" cy="8" r="4"/><path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1"/> }
        @case ('lock') { <rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/> }
        @case ('image') { <rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.7"/><path d="m4 18 5-5 4 4 3-2.5 4 3.5"/> }
        @case ('pen') { <path d="M12 3 4 11l-1 6 6-1 8-8-5-5z"/><path d="m14.5 5.5 4 4"/> }
        @case ('handshake') { <path d="m3 11 4-4h3l2 1.7L14 7h3l4 4-5.5 6-2.5-2.2L10.5 17 3 11z"/> }
        @case ('arrow-down') { <path d="M12 4v14"/><path d="m6 12.5 6 5.5 6-5.5"/> }
        @case ('arrow-up') { <path d="M12 20V6"/><path d="m6 11.5 6-5.5 6 5.5"/> }
        @case ('info') { <circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6h.01"/> }
        @case ('edit') { <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="m14.5 6.5 3 3"/> }
        @case ('chevron') { <path d="m9 5 7 7-7 7"/> }
        @case ('calendar') { <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/> }
        @case ('clipboard') { <rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 6 0"/><path d="M9 11h6M9 15h6"/> }
        @case ('sun') { <circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/> }
        @case ('flag') { <path d="M5 21V4"/><path d="M5 4h13l-2.5 4L18 12H5"/> }
        @case ('printer') { <path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/> }
      }
    </svg>
  `
})
export class IconComponent {
  readonly name = input.required<string>();
  /** Tamaño en píxeles. Sin valor, manda la variable `--icon-size` del contenedor (18 por defecto). */
  readonly size = input<number | undefined>(undefined);
}
