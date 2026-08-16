import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { DistribucionSoporte, formateaFecha } from '../../core/models/models';

/**
 * Distribución de soportes por Dirección/Unidad. Se administra AQUÍ, en Controles Mensuales,
 * y gobierna los dos módulos del ecosistema:
 *
 *  · en este módulo decide quién ve y completa cada control, bitácora e inventario operativo;
 *  · en Gestión de Equipos decide qué técnicos pueden recibir equipos para configurar en cada
 *    Dirección/Unidad (Técnico de Configuración del expediente único).
 */
@Component({
  selector: 'app-distribucion',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent, IconComponent],
  styles: `
    .vista-tabs { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 9px; overflow: hidden; }
    .vista-tabs button {
      border: 0; background: var(--surface); color: var(--tx-2); font-family: inherit; font-size: 12.5px;
      padding: 7px 14px; cursor: pointer; border-left: 1px solid var(--line);
    }
    .vista-tabs button:first-child { border-left: 0; }
    .vista-tabs button.on { background: var(--navy-800); color: #fff; font-weight: 600; }
    .grupo { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
    .grupo h4 { margin: 0 0 3px; font-size: 13.5px; color: var(--navy-900); }
    .grupo .sub { margin: 0 0 8px; font-size: 12px; color: var(--tx-3); }
    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Distribución de soportes
            <ui-help texto="Cada Dirección/Unidad tiene uno o más Técnicos de Soporte responsables, y un técnico puede atender varias Direcciones/Unidades. Esta tabla se administra desde Controles Mensuales y la consume también Gestión de Equipos." />
          </h1>
          <p class="page-sub">Asignación de Técnicos de Soporte por Dirección/Unidad · registro compartido del ecosistema SISGOST.</p>
        </div>
        @if (puedeGestionar()) {
          <button class="btn btn-primary" type="button" (click)="nueva()">Nueva asignación</button>
        }
      </div>

      <div class="alert" style="margin-bottom: 16px;">
        <span class="alert-ico">i</span>
        <span>
          <b>Esta distribución afecta también a Gestión de Equipos.</b>
          Un Técnico de Soporte solo puede recibir equipos para configurar en las Direcciones/Unidades
          donde es responsable: al crear el expediente único, aquel módulo ofrece únicamente los técnicos
          que aparecen aquí para la Dirección/Unidad del requerimiento.
        </span>
      </div>

      @if (data.paresSinSoporte().length) {
        <div class="alert danger" style="margin-bottom: 16px;">
          <span class="alert-ico">!</span>
          <span>
            <b>Direcciones/Unidades sin soporte responsable:</b>
            {{ sinSoporte() }}. Sus controles del período no tienen quién los entregue y sus equipos
            activos quedan sin Técnico de Soporte responsable.
          </span>
        </div>
      }

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Consulta</h3>
            <p class="sub">Las mismas asignaciones, vistas por Dirección/Unidad o por Técnico de Soporte.</p>
          </div>
          <div class="vista-tabs">
            <button type="button" [class.on]="vista() === 'tabla'" (click)="vista.set('tabla')">Todas</button>
            <button type="button" [class.on]="vista() === 'direccion'" (click)="vista.set('direccion')">Por Dirección/Unidad</button>
            <button type="button" [class.on]="vista() === 'tecnico'" (click)="vista.set('tecnico')">Por soporte</button>
          </div>
        </div>
        <div class="card-body">

          @if (vista() === 'tabla') {
            <div class="row" style="margin-bottom: 12px;">
              <select class="control" style="width: 220px;" [(ngModel)]="fEstado">
                <option value="">Vigentes e históricas</option>
                <option value="activa">Solo vigentes</option>
                <option value="desactivada">Solo desactivadas</option>
              </select>
              <span class="muted" style="align-self: center;">{{ filtradas().length }} asignación(es)</span>
            </div>
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Código</th><th>Técnico de Soporte</th><th>Dirección</th><th>Unidad</th>
                  <th>Fecha de inicio</th><th>Estado</th><th>Observaciones</th>
                  @if (puedeGestionar()) { <th></th> }
                </tr></thead>
                <tbody>
                  @for (d of filtradas(); track d.id) {
                    <tr [style.opacity]="d.activo ? 1 : .6">
                      <td class="mono">{{ d.id }}</td>
                      <td><b>{{ soloNombre(d.tecnico) }}</b></td>
                      <td>{{ d.direccion }}</td>
                      <td>{{ d.unidad }}</td>
                      <td class="mono">{{ formatea(d.fecha) }}</td>
                      <td><ui-badge [estado]="d.activo ? 'Activa' : 'Desactivada'" /></td>
                      <td style="max-width: 300px;">{{ d.observacion || '—' }}</td>
                      @if (puedeGestionar()) {
                        <td>
                          @if (d.activo) {
                            <button class="btn btn-ghost btn-sm" type="button" (click)="abrirDesactivar(d)">Desactivar</button>
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          @else if (vista() === 'direccion') {
            @for (g of porDireccion(); track g.clave) {
              <div class="grupo">
                <h4>{{ g.direccion }}@if (g.unidad !== g.direccion) { <span class="muted"> / {{ g.unidad }}</span> }</h4>
                <p class="sub">{{ g.equipos }} equipo(s) activo(s) en el inventario operativo · {{ g.controles }} control(es) del año</p>
                <div class="chip-list">
                  @for (t of g.tecnicos; track t) { <span class="badge">{{ t }}</span> }
                  @if (!g.tecnicos.length) { <span class="badge danger">Sin soporte responsable</span> }
                </div>
              </div>
            }
          }

          @else {
            @for (g of porTecnico(); track g.tecnico) {
              <div class="grupo">
                <h4>{{ g.tecnico }}</h4>
                <p class="sub">{{ g.pares.length }} Dirección/Unidad atendida(s) · {{ g.equipos }} equipo(s) activo(s) · {{ g.pendientes }} control(es) pendiente(s)</p>
                <div class="chip-list">
                  @for (p of g.pares; track p) { <span class="badge">{{ p }}</span> }
                  @if (!g.pares.length) { <span class="badge warn">Sin Direcciones/Unidades asignadas</span> }
                </div>
              </div>
            }
          }

        </div>
      </div>

      @if (modal()) {
        <ui-modal titulo="Nueva asignación de soporte"
          sub="El técnico asignado responde por los controles y la bitácora de la Dirección/Unidad, y queda disponible como Técnico de Configuración en Gestión de Equipos"
          (cerrar)="modal.set(false)">
          <div class="form-grid">
            <div class="field">
              <label for="na-tec">Técnico de Soporte <span style="color: var(--danger)">*</span></label>
              <select id="na-tec" class="control" [(ngModel)]="nuevoUsuario">
                <option value="">Seleccione…</option>
                @for (u of data.tecnicosSoporte(); track u.usuario) { <option [value]="u.usuario">{{ u.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-dir">Dirección <span style="color: var(--danger)">*</span></label>
              <select id="na-dir" class="control" [(ngModel)]="nuevaDireccion" (ngModelChange)="nuevaUnidad = ''">
                <option value="">Seleccione…</option>
                @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-uni">Unidad <span style="color: var(--danger)">*</span></label>
              <select id="na-uni" class="control" [(ngModel)]="nuevaUnidad">
                <option value="">Seleccione…</option>
                @for (u of unidadesDe(); track u) { <option [value]="u">{{ u }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-obs">Observaciones</label>
              <input id="na-obs" class="control" [(ngModel)]="nuevaObs" placeholder="Motivo de la asignación…" />
            </div>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="modal.set(false)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardar()">Asignar</button>
          </div>
        </ui-modal>
      }

      @if (aDesactivar(); as d) {
        <ui-modal titulo="Desactivar asignación" [sub]="soloNombre(d.tecnico) + ' · ' + d.direccion + ' / ' + d.unidad" (cerrar)="aDesactivar.set(null)">
          <div class="alert warn" style="margin-bottom: 14px;">
            <span class="alert-ico">!</span>
            <span>La asignación no se borra: queda en el historial porque los controles y equipos
              registrados mientras estuvo vigente siguen apuntando a ella.</span>
          </div>
          <div class="field">
            <label for="dz-motivo">Motivo <span style="color: var(--danger)">*</span></label>
            <textarea id="dz-motivo" class="control" rows="3" [(ngModel)]="motivoDesactivar"></textarea>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="aDesactivar.set(null)">Cancelar</button>
            <button class="btn btn-danger" type="button" (click)="desactivar()">
              <ui-icon name="alert" [size]="13" /> Desactivar asignación
            </button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class DistribucionComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly vista = signal<'tabla' | 'direccion' | 'tecnico'>('tabla');
  protected readonly fEstado = signal('');
  protected readonly modal = signal(false);
  protected readonly aDesactivar = signal<DistribucionSoporte | null>(null);
  protected nuevoUsuario = '';
  protected nuevaDireccion = '';
  protected nuevaUnidad = '';
  protected nuevaObs = '';
  protected motivoDesactivar = '';

  protected puedeGestionar(): boolean { return this.data.puedeGestionarDistribucion(this.auth.usuario()); }

  protected readonly filtradas = computed(() => this.data.distribucion()
    .filter((d) => !this.fEstado() || (this.fEstado() === 'activa' ? d.activo : !d.activo))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.direccion.localeCompare(b.direccion) || a.unidad.localeCompare(b.unidad)));

  /** Una tarjeta por Dirección/Unidad del catálogo organizacional, con o sin soporte. */
  protected readonly porDireccion = computed(() => this.data.pares().map((p) => ({
    clave: `${p.direccion}|${p.unidad}`,
    direccion: this.data.nombreDireccion(p.direccion),
    unidad: p.unidad,
    tecnicos: this.data.tecnicosDe(p.direccion, p.unidad).map((t) => this.soloNombre(t)),
    equipos: this.data.equiposActivosDe(p.direccion, p.unidad).length,
    controles: this.data.controles().filter((c) => c.direccion === p.direccion && c.unidad === p.unidad).length
  })));

  /** Una tarjeta por Técnico de Soporte con lo que atiende hoy. */
  protected readonly porTecnico = computed(() => this.data.tecnicosSoporte().map((u) => {
    const pares = this.data.paresDe(u.usuario);
    return {
      tecnico: u.nombre,
      pares: pares.map((p) => `${this.data.cortaDireccion(p.direccion)} · ${p.unidad}`),
      equipos: pares.reduce((n, p) => n + this.data.equiposActivosDe(p.direccion, p.unidad).length, 0),
      pendientes: this.data.controles().filter((c) => pares.some((p) => p.direccion === c.direccion && p.unidad === c.unidad)
        && ['Pendiente', 'Programado', 'En proceso', 'Vencido'].includes(c.estado)).length
    };
  }));

  protected unidadesDe(): string[] { return this.data.direccionDe(this.nuevaDireccion)?.unidades ?? []; }

  protected sinSoporte(): string {
    return this.data.paresSinSoporte().map((p) => `${this.data.cortaDireccion(p.direccion)} / ${p.unidad}`).join('; ');
  }

  protected soloNombre(tecnico: string): string { return this.data.soportes.soloNombre(tecnico); }

  protected nueva(): void {
    this.nuevoUsuario = '';
    this.nuevaDireccion = '';
    this.nuevaUnidad = '';
    this.nuevaObs = '';
    this.modal.set(true);
  }

  protected guardar(): void {
    const tecnico = this.data.tecnicosSoporte().find((t) => t.usuario === this.nuevoUsuario);
    if (!tecnico || !this.nuevaDireccion || !this.nuevaUnidad) {
      this.toast.warn('Datos incompletos', 'Seleccione el técnico, la Dirección y la Unidad a asignar.');
      return;
    }
    const error = this.data.asignarDistribucion({
      direccion: this.nuevaDireccion, unidad: this.nuevaUnidad,
      tecnico: tecnico.nombre, observacion: this.nuevaObs
    }, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible asignar', error);
      return;
    }
    this.modal.set(false);
    this.toast.ok('Soporte asignado',
      `${tecnico.nombre} responde por ${this.data.nombreDireccion(this.nuevaDireccion)} / ${this.nuevaUnidad}, aquí y en Gestión de Equipos.`);
  }

  protected abrirDesactivar(d: DistribucionSoporte): void {
    this.motivoDesactivar = '';
    this.aDesactivar.set(d);
  }

  protected desactivar(): void {
    const d = this.aDesactivar();
    if (!d) return;
    const error = this.data.desactivarDistribucion(d.id, this.motivoDesactivar, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible desactivar', error);
      return;
    }
    this.aDesactivar.set(null);
    this.toast.ok('Asignación desactivada',
      `${this.soloNombre(d.tecnico)} deja de responder por ${d.direccion} / ${d.unidad}.`);
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
