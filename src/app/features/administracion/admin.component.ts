import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../core/services/data.service';
import { BadgeComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';

/**
 * Administración: usuarios del sistema y catálogo de Direcciones/Unidades. Los catálogos
 * editables con efecto en las reglas (controles, distribución, feriados) tienen su propia
 * pantalla, enlazada desde aquí.
 */
@Component({
  selector: 'app-admin',
  imports: [RouterLink, BadgeComponent, IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>Usuarios y direcciones</h1>
          <p class="page-sub">Roles del sistema y estructura organizacional atendida por Soporte Técnico.</p>
        </div>
        <button class="btn btn-outline" type="button" (click)="data.reiniciarDatos()">Restablecer datos de demostración</button>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px;">
        <a class="card" routerLink="/catalogo" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="layers" [size]="22" style="color: var(--blue-600)" />
            <div><b>Catálogo de controles</b><div class="muted" style="font-size: 12.5px;">Frecuencias, evidencia, firma y justificación por control</div></div>
          </div>
        </a>
        <a class="card" routerLink="/distribucion" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="assign" [size]="22" style="color: var(--blue-600)" />
            <div><b>Distribución de soportes</b><div class="muted" style="font-size: 12.5px;">Técnicos responsables por Dirección/Unidad</div></div>
          </div>
        </a>
        <a class="card" routerLink="/feriados" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="flag" [size]="22" style="color: var(--blue-600)" />
            <div><b>Feriados</b><div class="muted" style="font-size: 12.5px;">Catálogo editable que gobierna los días hábiles</div></div>
          </div>
        </a>
      </div>

      <div class="grid grid-2" style="align-items: start;">
        <div class="card">
          <div class="card-head">
            <div><h3>Usuarios del sistema</h3><p class="sub">Roles: Administrador, Encargado de Soporte, Técnico de Soporte y Jefatura (consulta)</p></div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Cargo</th></tr></thead>
                <tbody>
                  @for (u of data.usuarios(); track u.usuario) {
                    <tr>
                      <td class="mono">{{ u.usuario }}</td>
                      <td><b>{{ u.nombre }}</b></td>
                      <td><ui-badge [estado]="u.rol" /></td>
                      <td>{{ u.cargo }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="alert" style="margin-top: 14px;">
              <span class="alert-ico">i</span>
              <span><b>Dirección/Unidad no es un rol del sistema:</b> es el dato organizacional al que pertenecen controles, bitácoras e inventario.</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h3>Direcciones y unidades</h3><p class="sub">Estructura atendida por el Departamento de Soporte Técnico</p></div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Código</th><th>Dirección</th><th>Unidades</th><th>Soporte responsable</th></tr></thead>
                <tbody>
                  @for (d of data.direcciones(); track d.id) {
                    <tr>
                      <td><b>{{ d.corta }}</b></td>
                      <td>{{ d.nombre }}</td>
                      <td>
                        @for (u of d.unidades; track u) { <span class="chip">{{ u }}</span> }
                      </td>
                      <td>
                        @if (data.soporteDe(d.id); as s) { {{ s.tecnico }} }
                        @else { <span class="badge danger">Sin asignar</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AdminComponent {
  protected readonly data = inject(DataService);
}
