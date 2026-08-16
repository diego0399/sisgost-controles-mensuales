import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon';

@Component({
  selector: 'app-acceso-restringido',
  imports: [RouterLink, IconComponent],
  template: `
    <div class="page">
      <div class="card" style="max-width: 560px; margin: 60px auto; text-align: center;">
        <div class="card-pad">
          <ui-icon name="lock" [size]="40" style="color: var(--gold-600)" />
          <h2 style="margin: 12px 0 6px;">Acceso restringido</h2>
          <p class="muted" style="margin-bottom: 18px;">
            Su rol no tiene permisos para esta sección del sistema.
          </p>
          <a class="btn btn-primary" routerLink="/panel">Volver al panel ejecutivo</a>
        </div>
      </div>
    </div>
  `
})
export class AccesoRestringidoComponent {}
