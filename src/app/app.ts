import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DataService } from './core/services/data.service';
import { ToastService } from './core/services/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    @if (data.listo()) {
      <router-outlet />
    } @else {
      <div class="cargando">
        <div class="logo-pulse">SISGOST</div>
        <p>Cargando datos simulados…</p>
      </div>
    }

    <div class="toast-host" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast {{ t.tipo }}">
          <div>
            <b>{{ t.titulo }}</b>
            @if (t.texto) { <div>{{ t.texto }}</div> }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .cargando { min-height: 100vh; display: grid; place-content: center; text-align: center; gap: 8px; color: var(--tx-2); }
    .logo-pulse { font-family: var(--font-brand); font-size: 34px; color: var(--navy-900); animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: .45; } }
  `
})
export class App {
  protected readonly data = inject(DataService);
  protected readonly toast = inject(ToastService);

  constructor() {
    this.data.cargar();
  }
}
