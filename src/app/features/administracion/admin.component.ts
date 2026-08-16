import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { URL_GESTION_EQUIPOS } from '../../core/config/modulos';

/**
 * Administración: directorio de usuarios y catálogo de Direcciones/Unidades —los mismos datos
 * base que usa SISGOST — Gestión de Equipos— más el restablecimiento de los datos de
 * demostración. Los catálogos con efecto en las reglas (controles, distribución, feriados)
 * tienen su propia pantalla, enlazada desde aquí.
 */
@Component({
  selector: 'app-admin',
  imports: [RouterLink, BadgeComponent, ModalComponent, IconComponent],
  styles: `
    .chip-off { opacity: .55; }
    .lista-reset { margin: 8px 0 0 18px; font-size: 13px; color: var(--tx-2); }
    .lista-reset li { margin: 2px 0; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>Usuarios y direcciones</h1>
          <p class="page-sub">
            Datos base compartidos con SISGOST — Gestión de Equipos: mismos usuarios, mismos roles y
            la misma estructura de Direcciones/Unidades.
          </p>
        </div>
        @if (auth.esAdmin()) {
          <button class="btn btn-outline" type="button" (click)="modalReset.set(true)">
            <ui-icon name="refresh" [size]="14" /> Restablecer datos de demostración
          </button>
        }
      </div>

      <div class="alert" style="margin-bottom: 18px;">
        <span class="alert-ico">i</span>
        <span>
          <b>Un solo ecosistema.</b> Los usuarios, las Direcciones/Unidades, los equipos y la distribución de
          soportes no se duplican entre módulos: se administran una vez y los dos sistemas los consumen.
          <a [href]="urlEquipos">Ir a Gestión de Equipos</a>.
        </span>
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
            <div><b>Distribución de soportes</b><div class="muted" style="font-size: 12.5px;">Técnicos responsables por Dirección/Unidad · afecta también a Gestión de Equipos</div></div>
          </div>
        </a>
        <a class="card" routerLink="/feriados" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="flag" [size]="22" style="color: var(--blue-600)" />
            <div><b>Feriados</b><div class="muted" style="font-size: 12.5px;">Catálogo editable que gobierna los días hábiles</div></div>
          </div>
        </a>
      </div>

      <!-- Las dos tablas van a ancho completo: la de usuarios lleva cinco columnas y en media
           página se le recortaba la última. -->
      <div style="display: grid; gap: 16px;">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Usuarios del ecosistema SISGOST</h3>
              <p class="sub">{{ conAcceso().length }} con acceso a Controles Mensuales · {{ sinAcceso().length }} operan solo en Gestión de Equipos</p>
            </div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Unidad</th><th>Acceso a este módulo</th></tr></thead>
                <tbody>
                  @for (u of data.usuarios(); track u.usuario) {
                    <tr [class.chip-off]="!u.moduloControles">
                      <td class="mono">{{ u.usuario }}</td>
                      <td><b>{{ u.nombre }}</b><div class="muted" style="font-size: 11.5px;">{{ u.cargo }}</div></td>
                      <td><ui-badge [estado]="u.rol" /></td>
                      <td>{{ u.unidad }}</td>
                      <td>
                        @if (u.moduloControles) { <span class="badge ok">Controles Mensuales</span> }
                        @else { <span class="badge">Solo Gestión de Equipos</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="alert" style="margin-top: 14px;">
              <span class="alert-ico">i</span>
              <span><b>Dirección/Unidad no es un rol del sistema:</b> es el dato organizacional al que pertenecen controles, bitácoras e inventario. Quién atiende cada una se define en la distribución de soportes.</span>
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
                <thead><tr><th>Código</th><th>Dirección</th><th>Unidad</th><th>Equipos activos</th><th>Soporte responsable</th></tr></thead>
                <tbody>
                  @for (f of filas(); track f.clave) {
                    <tr>
                      <td><b>{{ f.corta }}</b></td>
                      <td>{{ f.direccion }}</td>
                      <td>{{ f.unidad }}</td>
                      <td>{{ f.equipos }}</td>
                      <td>
                        @if (f.tecnicos.length) { {{ f.tecnicos.join(' · ') }} }
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

      @if (modalReset()) {
        <ui-modal titulo="Restablecer datos de demostración"
          sub="Devuelve el prototipo al estado inicial para una nueva presentación"
          (cerrar)="modalReset.set(false)">
          <div class="alert warn">
            <span class="alert-ico">!</span>
            <span>
              Esta acción restablecerá los datos de demostración del módulo Controles Mensuales. ¿Desea continuar?
            </span>
          </div>
          <p class="muted" style="margin-top: 14px;">Se repondrán a su estado inicial:</p>
          <ul class="lista-reset">
            @for (c of data.coleccionesDemostracion; track c) { <li>{{ c }}</li> }
          </ul>
          <p class="muted" style="margin-top: 12px;">
            No se elimina la estructura del sistema ni se rompe la navegación: solo se descarta el trabajo
            registrado en esta sesión del navegador.
          </p>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="modalReset.set(false)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="restablecer()">
              <ui-icon name="refresh" [size]="13" /> Restablecer datos
            </button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class AdminComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly urlEquipos = URL_GESTION_EQUIPOS;
  protected readonly modalReset = signal(false);

  protected readonly conAcceso = computed(() => this.data.usuarios().filter((u) => u.moduloControles));
  protected readonly sinAcceso = computed(() => this.data.usuarios().filter((u) => !u.moduloControles));

  /** Una fila por Dirección/Unidad: es la unidad mínima de la distribución y del inventario. */
  protected readonly filas = computed(() => this.data.pares().map((p) => ({
    clave: `${p.direccion}|${p.unidad}`,
    corta: this.data.cortaDireccion(p.direccion),
    direccion: this.data.nombreDireccion(p.direccion),
    unidad: p.unidad,
    equipos: this.data.equiposActivosDe(p.direccion, p.unidad).length,
    tecnicos: this.data.tecnicosDe(p.direccion, p.unidad).map((t) => this.data.soportes.soloNombre(t))
  })));

  protected restablecer(): void {
    this.toast.ok('Datos restablecidos', 'Los datos de demostración fueron restablecidos correctamente.');
    this.data.restablecerDemostracion();
  }
}
