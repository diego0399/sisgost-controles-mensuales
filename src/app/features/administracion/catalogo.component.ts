import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { AutoSyncService } from '../../core/services/auto-sync.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { AplicacionDepartamento, ControlCatalogo, Frecuencia } from '../../core/models/models';

/**
 * Catálogo de controles: los formatos institucionales modelados desde la carpeta real de
 * controles, con su frecuencia, sus reglas (evidencia, firma, justificación) y —sobre todo— su
 * **aplicación por Departamento**:
 *
 * · En los Departamentos que se distribuyen por Dirección/Registro (San Salvador) se eligen las
 *   Direcciones/Unidades donde aplica el control, y se programa uno por cada una.
 * · En los demás el control aplica al Departamento completo y se programa uno solo.
 *
 * La regla se decide por ID estable y la marca territorial `porDireccion`, nunca por el nombre
 * visible. El Administrador edita; el Encargado consulta. Guardar recalcula el período solo.
 */
@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent],
  styles: `
    .tbl th { white-space: normal; }
    .tbl th:nth-child(4) { width: 200px; }
    .col-nombre { max-width: 165px; }
    .aplica-lista { max-width: 220px; font-size: 12px; }
    .aplica-motivo { color: var(--tx-3); font-size: 11px; margin-top: 2px; }
    .col-si { text-align: center; white-space: nowrap; }
    .col-acciones { width: 150px; }
    .col-acciones .btn { margin: 1px 2px 1px 0; padding-left: 8px; padding-right: 8px; }
    .form-apl { border: 1px solid var(--line); border-radius: 10px; padding: 14px; margin-top: 12px; }
    .unidades { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-top: 10px; }
    .unidades h4 { font-size: 13px; color: var(--navy-900); margin-bottom: 6px; }
    .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; }
    .linea-off { opacity: .55; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Catálogo de controles
            <ui-help texto="La frecuencia, las reglas y la aplicación de cada control se configuran aquí. La aplicación se hace por Departamento: en San Salvador se eligen las Direcciones/Unidades; en los demás Departamentos el control aplica al Departamento completo." />
          </h1>
          <p class="page-sub">{{ data.catalogo().length }} controles modelados desde los formatos físicos de la carpeta de controles.</p>
        </div>
      </div>

      <div class="alert" style="margin-bottom: 16px;">
        <span class="alert-ico">i</span>
        <span>
          <b>La aplicación se configura por Departamento.</b> En San Salvador se programa un control por
          cada Dirección/Unidad seleccionada; en los demás Departamentos, uno solo para el Departamento
          completo. Donde no aplica, el control queda como <b>No aplica</b> y no cuenta como pendiente.
        </span>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr>
                <th>Código</th><th>Nombre del control</th><th>Frecuencia</th>
                <th>Aplica en</th>
                <th class="col-si">Evid.</th><th class="col-si">Firma</th><th class="col-si">Just.</th>
                <th class="col-si">Form.</th><th>Estado</th>@if (auth.esAdmin()) { <th>Acciones</th> }
              </tr></thead>
              <tbody>
                @for (c of data.catalogo(); track c.codigo) {
                  <tr [style.opacity]="c.activo ? 1 : .55">
                    <td><b class="mono">{{ c.codigo }}</b><div class="muted" style="font-size: 11px;">{{ c.version }}</div></td>
                    <td class="col-nombre">{{ c.nombre }}</td>
                    <td><ui-badge [estado]="c.frecuencia" /></td>
                    <td class="aplica-lista" [title]="c.aplicacion.observaciones">
                      {{ data.resumenAplicacion(c) }}
                      <div class="aplica-motivo">
                        Se programa en {{ data.paresAplicables(c.codigo).length }}
                        {{ data.paresAplicables(c.codigo).length === 1 ? 'ámbito' : 'ámbitos' }}
                      </div>
                    </td>
                    <td class="col-si">{{ c.requiereEvidencia ? 'Sí' : 'No' }}</td>
                    <td class="col-si">{{ c.requiereFirma ? 'Sí' : 'No' }}</td>
                    <td class="col-si">{{ c.permiteJustificacion ? 'Sí' : 'No' }}</td>
                    <td class="col-si">{{ c.plantilla.length }}</td>
                    <td><ui-badge [estado]="c.activo ? 'Activo' : 'Inactivo'" /></td>
                    @if (auth.esAdmin()) {
                      <td class="col-acciones">
                        <button class="btn btn-ghost btn-sm" type="button" (click)="detalle.set(c)">Ver detalle</button>
                        <button class="btn btn-ghost btn-sm" type="button" (click)="editar(c)">Editar control</button>
                        <button class="btn btn-outline btn-sm" type="button" (click)="abrirConfiguracion(c)">Configurar aplicación</button>
                        <button class="btn btn-ghost btn-sm" type="button" (click)="alternarEstado(c)">
                          {{ c.activo ? 'Desactivar' : 'Activar' }}
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Detalle -->
      @if (detalle(); as c) {
        <ui-modal [titulo]="c.codigo + ' — ' + c.nombre" [sub]="c.version + ' · ' + c.frecuencia" (cerrar)="detalle.set(null)">
          <p class="muted">{{ c.descripcion }}</p>
          <dl class="dl">
            <div><dt>Aplica en</dt><dd>{{ data.resumenAplicacion(c) }}</dd></div>
            <div><dt>Motivo de la aplicación</dt><dd>{{ c.aplicacion.observaciones || '—' }}</dd></div>
            <div><dt>Requiere evidencia</dt><dd>{{ c.requiereEvidencia ? 'Sí' : 'No' }}</dd></div>
            <div><dt>Requiere firma</dt><dd>{{ c.requiereFirma ? 'Sí' : 'No' }}</dd></div>
            <div><dt>Permite justificación</dt><dd>{{ c.permiteJustificacion ? 'Sí' : 'No' }}</dd></div>
            <div><dt>Trabaja con equipos</dt><dd>{{ data.requiereEquipos(c) ? 'Sí, sobre el inventario operativo' : 'No' }}</dd></div>
          </dl>
          <div class="sec-title">Se programa en</div>
          <div class="row" style="gap: 6px;">
            @for (p of data.paresAplicables(c.codigo); track p.direccion + p.unidad) {
              <span class="badge">{{ data.cortaDireccion(p.direccion) }} · {{ p.unidad }}</span>
            } @empty { <span class="badge danger">Ningún Departamento</span> }
          </div>
          <div class="sec-title">Secciones del formulario</div>
          <ol style="margin-left: 18px; font-size: 13px;">
            @for (s of c.plantilla; track s.titulo) { <li>{{ s.titulo }}</li> }
          </ol>
        </ui-modal>
      }

      <!-- Editar control -->
      @if (edicion(); as e) {
        <ui-modal [titulo]="'Editar ' + e.codigo" [sub]="e.nombre" (cerrar)="edicion.set(null)">
          <div class="form-grid">
            <div class="field">
              <label for="frec">Frecuencia</label>
              <select id="frec" class="control" [(ngModel)]="e.frecuencia">
                @for (f of frecuencias; track f) { <option [value]="f">{{ f }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="activo">Estado</label>
              <select id="activo" class="control" [(ngModel)]="e.activo">
                <option [ngValue]="true">Activo</option>
                <option [ngValue]="false">Inactivo</option>
              </select>
            </div>
            <div class="field">
              <label for="evid">Requiere evidencia</label>
              <select id="evid" class="control" [(ngModel)]="e.requiereEvidencia">
                <option [ngValue]="true">Sí</option><option [ngValue]="false">No</option>
              </select>
            </div>
            <div class="field">
              <label for="firma">Requiere firma</label>
              <select id="firma" class="control" [(ngModel)]="e.requiereFirma">
                <option [ngValue]="true">Sí</option><option [ngValue]="false">No</option>
              </select>
            </div>
            <div class="field">
              <label for="jus">Requiere justificación</label>
              <select id="jus" class="control" [(ngModel)]="e.permiteJustificacion">
                <option [ngValue]="true">Sí</option><option [ngValue]="false">No</option>
              </select>
            </div>
            <div class="field">
              <label for="apl">Aplica en</label>
              <input id="apl" class="control" [value]="data.resumenAplicacion(e)" readonly />
              <span class="hint">Se configura en «Configurar aplicación».</span>
            </div>
          </div>
          <div class="field" style="margin-top: 8px;">
            <label for="obs-ctl">Observaciones (motivo institucional de la aplicación)</label>
            <textarea id="obs-ctl" class="control" rows="2" [(ngModel)]="e.aplicacion.observaciones"></textarea>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="edicion.set(null)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardar()">Guardar cambios</button>
          </div>
        </ui-modal>
      }

      <!-- Configuración del control por Departamento -->
      @if (control(); as c) {
        <ui-modal titulo="Configuración del control" [sub]="c.codigo + ' — ' + c.nombre" [ancho]="true" (cerrar)="cerrarConfiguracion()">
          <dl class="dl">
            <div><dt>Código del control</dt><dd class="mono">{{ c.codigo }}</dd></div>
            <div><dt>Nombre del control</dt><dd>{{ c.nombre }}</dd></div>
            <div><dt>Frecuencia</dt><dd>{{ c.frecuencia }}</dd></div>
            <div><dt>Estado</dt><dd>{{ c.activo ? 'Activo' : 'Inactivo' }}</dd></div>
            <div><dt>Requiere evidencia</dt><dd>{{ c.requiereEvidencia ? 'Sí' : 'No' }}</dd></div>
            <div><dt>Requiere justificación</dt><dd>{{ c.permiteJustificacion ? 'Sí' : 'No' }}</dd></div>
          </dl>

          <div class="sec-title">Departamentos donde aplica</div>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr>
                <th>Zona</th><th>Departamento</th><th>Tipo de aplicación</th><th>Direcciones/Unidades</th>
                <th>Se programa en</th><th>Estado</th><th>Acciones</th>
              </tr></thead>
              <tbody>
                @for (l of data.lineasAplicacion(c); track l.id) {
                  <tr [class.linea-off]="!l.activo">
                    <td>{{ data.territorio.nombreZona(l.zonaId) }}</td>
                    <td><b>{{ data.territorio.nombreDepartamento(l.departamentoId) }}</b></td>
                    <td>{{ etiquetaTipo(l.tipoAplicacion) }}</td>
                    <td style="font-size: 12.5px;">
                      @if (l.tipoAplicacion === 'DIRECCION_UNIDAD') {
                        @for (id of l.direccionesUnidadesIds; track id) { <span class="badge">{{ data.territorio.nombreRegistro(id) }}</span> }
                      } @else { <span class="muted">Departamento completo</span> }
                    </td>
                    <td>
                      {{ data.paresDeLinea(c, l).length }} {{ data.paresDeLinea(c, l).length === 1 ? 'ámbito' : 'ámbitos' }}
                      @if (l.activo && !data.paresDeLinea(c, l).length && data.requiereEquipos(c)) {
                        <div class="hint">Sin inventario operativo activo</div>
                      }
                    </td>
                    <td><ui-badge [estado]="l.activo ? 'Activa' : 'Inactiva'" /></td>
                    <td style="white-space: nowrap;">
                      <button class="btn btn-ghost btn-sm" type="button" (click)="editarLinea(l)">Editar</button>
                      <button class="btn btn-ghost btn-sm" type="button" (click)="alternarLinea(c, l)">{{ l.activo ? 'Desactivar' : 'Activar' }}</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="muted">El control todavía no aplica en ningún Departamento.</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (data.requiereEquipos(c)) {
            <p class="hint" style="margin-top: 6px;">Este control trabaja con equipos: solo se programa donde hay inventario operativo activo.</p>
          }

          @if (!formAbierto()) {
            <div class="row" style="justify-content: space-between; margin-top: 14px;">
              <button class="btn btn-outline" type="button" (click)="nuevaLinea()">+ Agregar Departamento</button>
              <button class="btn btn-primary" type="button" (click)="cerrarConfiguracion()">Listo</button>
            </div>
          } @else {
            <div class="form-apl">
              <div class="sec-title" style="margin-top: 0;">{{ fId() ? 'Editar configuración' : 'Nueva configuración' }}</div>
              <div class="form-grid">
                <div class="field">
                  <label for="f-zona">Zona</label>
                  <select id="f-zona" class="control" [ngModel]="fZona()" (ngModelChange)="cambiarZona($event)">
                    <option value="">Seleccione una Zona…</option>
                    @for (z of data.territorio.zonasOrdenadas(); track z.id) { <option [value]="z.id">{{ z.nombre }}</option> }
                  </select>
                </div>
                <div class="field">
                  <label for="f-dep">Departamento</label>
                  <select id="f-dep" class="control" [ngModel]="fDep()" (ngModelChange)="cambiarDepartamento($event)" [disabled]="!fZona()">
                    <option value="">Seleccione un Departamento…</option>
                    @for (d of departamentosZona(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
                  </select>
                </div>
                <div class="field">
                  <label for="f-tipo">Tipo de aplicación</label>
                  <input id="f-tipo" class="control" readonly
                    [value]="fDep() ? etiquetaTipo(tipoForm()) : 'Se define al elegir el Departamento'" />
                </div>
              </div>

              @if (fDep() && tipoForm() === 'DIRECCION_UNIDAD') {
                <div class="unidades">
                  <h4>Direcciones/Unidades donde aplica el control</h4>
                  @for (r of registrosForm(); track r.id) {
                    <label class="chk">
                      <input type="checkbox" [checked]="fUnidades().includes(r.id)" (change)="alternarUnidad(r.id)" />
                      <span>{{ r.nombre }}</span>
                    </label>
                  }
                  <span class="hint">Seleccione una o varias. Se programará un control por cada Dirección/Unidad.</span>
                </div>
              } @else if (fDep()) {
                <div class="alert" style="margin-top: 10px;">
                  <span class="alert-ico">i</span>
                  <span>En este Departamento la configuración del control se realiza por Departamento completo. No es necesario seleccionar Dirección/Unidad.</span>
                </div>
              }
              @if (aviso()) {
                <div class="alert warn" style="margin-top: 10px;"><span class="alert-ico">!</span><span>{{ aviso() }}</span></div>
              }

              <div class="field" style="margin-top: 10px;">
                <label for="f-obs">Observaciones</label>
                <textarea id="f-obs" class="control" rows="2" [ngModel]="fObs()" (ngModelChange)="fObs.set($event)"
                  placeholder="Por qué este control aplica en este Departamento…"></textarea>
              </div>

              @if (fDep()) {
                <p class="hint">Con esta línea el control se programará en {{ previa().length }} {{ previa().length === 1 ? 'ámbito' : 'ámbitos' }}{{ previa().length ? ': ' + resumenPrevia() : '' }}.</p>
              }
              @if (error()) {
                <div class="alert danger" style="margin-top: 10px;"><span class="alert-ico">!</span><span>{{ error() }}</span></div>
              }
              <div class="row" style="justify-content: flex-end; margin-top: 12px;">
                <button class="btn btn-outline" type="button" (click)="formAbierto.set(false)">Cancelar</button>
                <button class="btn btn-primary" type="button" (click)="guardarLinea(c)">Guardar configuración</button>
              </div>
            </div>
          }
        </ui-modal>
      }
    </div>
  `
})
export class CatalogoComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly autoSync = inject(AutoSyncService);

  protected readonly frecuencias: Frecuencia[] = ['Mensual', 'Semanal',
    'Semanal con entrega mensual consolidada', 'Diaria', 'Eventual', 'Programado'];

  protected readonly detalle = signal<ControlCatalogo | null>(null);
  protected readonly edicion = signal<ControlCatalogo | null>(null);

  // ------------------------------------------------------------------ editar control

  protected editar(c: ControlCatalogo): void { this.edicion.set(structuredClone(c)); }

  protected guardar(): void {
    const e = this.edicion();
    if (!e) return;
    const error = this.data.actualizarCatalogo(e, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible guardar', error);
      return;
    }
    this.edicion.set(null);
    this.autoSync.invalidar();
    this.toast.ok('Catálogo actualizado', `${e.codigo}: frecuencia ${e.frecuencia.toLowerCase()}, ${e.activo ? 'activo' : 'inactivo'}. Controles del período recalculados automáticamente.`);
  }

  protected alternarEstado(c: ControlCatalogo): void {
    const copia = structuredClone(c);
    copia.activo = !copia.activo;
    const error = this.data.actualizarCatalogo(copia, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible activar el control', error);
      return;
    }
    this.autoSync.invalidar();
    this.toast.ok(copia.activo ? 'Control activado' : 'Control desactivado',
      `${c.codigo} quedó ${copia.activo ? 'activo' : 'inactivo'} en el catálogo.`);
  }

  // ------------------------------------------------------------------ configuración por Departamento

  /** Código del control abierto; la ficha se lee viva del catálogo para reflejar cada guardado. */
  private readonly codigo = signal<string | null>(null);
  protected readonly control = computed(() => {
    const cod = this.codigo();
    return cod ? this.data.catalogoDe(cod) ?? null : null;
  });

  // Formulario de una línea (Zona → Departamento → Direcciones/Unidades si aplica).
  protected readonly formAbierto = signal(false);
  protected readonly fId = signal('');
  protected readonly fZona = signal('');
  protected readonly fDep = signal('');
  protected readonly fUnidades = signal<string[]>([]);
  protected readonly fObs = signal('');
  private fActivo = true;
  /** Direcciones/Unidades que el formulario descartó al salir de San Salvador: se trazan al guardar. */
  private readonly limpiadas = signal<string[]>([]);
  protected readonly aviso = signal('');
  protected readonly error = signal('');

  protected readonly departamentosZona = computed(() => this.data.territorio.departamentosDe(this.fZona()));
  protected readonly tipoForm = computed(() => this.data.tipoAplicacionDe(this.fDep()));
  protected readonly registrosForm = computed(() => this.data.territorio.registrosDe(this.fDep()));

  /** Línea tal como quedaría con lo seleccionado; alimenta la vista previa. */
  private readonly lineaForm = computed<AplicacionDepartamento>(() => ({
    id: this.fId(), codigoControl: this.codigo() ?? '', zonaId: this.fZona(), departamentoId: this.fDep(),
    tipoAplicacion: this.tipoForm(),
    direccionesUnidadesIds: this.tipoForm() === 'DIRECCION_UNIDAD' ? this.fUnidades() : [],
    activo: true, observaciones: this.fObs()
  }));

  protected readonly previa = computed(() => {
    const c = this.control();
    return c && this.fDep() ? this.data.paresDeLinea(c, this.lineaForm()) : [];
  });

  protected resumenPrevia(): string {
    return this.previa().map((p) => this.data.dirUnidad(p.direccion, p.unidad)).join('; ');
  }

  protected etiquetaTipo(tipo: string): string {
    return tipo === 'DIRECCION_UNIDAD' ? 'Dirección/Unidad' : 'Departamento completo';
  }

  protected abrirConfiguracion(c: ControlCatalogo): void {
    this.codigo.set(c.codigo);
    this.formAbierto.set(false);
  }

  protected cerrarConfiguracion(): void {
    this.codigo.set(null);
    this.formAbierto.set(false);
  }

  private cargarForm(l: Partial<AplicacionDepartamento>): void {
    this.fId.set(l.id ?? '');
    this.fZona.set(l.zonaId ?? '');
    this.fDep.set(l.departamentoId ?? '');
    this.fUnidades.set([...(l.direccionesUnidadesIds ?? [])]);
    this.fObs.set(l.observaciones ?? '');
    this.fActivo = l.activo ?? true;
    this.limpiadas.set([]);
    this.aviso.set('');
    this.error.set('');
    this.formAbierto.set(true);
  }

  protected nuevaLinea(): void { this.cargarForm({}); }

  protected editarLinea(l: AplicacionDepartamento): void { this.cargarForm(l); }

  protected cambiarZona(zonaId: string): void {
    this.fZona.set(zonaId);
    // Un Departamento de otra zona deja de ser válido: se limpia junto con sus Direcciones/Unidades.
    if (this.fDep() && this.data.territorio.zonaDe(this.fDep()) !== zonaId) this.cambiarDepartamento('');
  }

  protected cambiarDepartamento(departamentoId: string): void {
    const previas = this.fUnidades();
    this.fDep.set(departamentoId);
    this.error.set('');
    if (departamentoId && this.data.tipoAplicacionDe(departamentoId) === 'DIRECCION_UNIDAD') {
      this.aviso.set('');
      return;
    }
    if (previas.length) {
      // Caso 1 del cambio: de San Salvador a otro Departamento → se limpian las Direcciones/Unidades.
      this.limpiadas.update((l) => [...new Set([...l, ...previas])]);
      this.fUnidades.set([]);
      this.aviso.set(`${this.data.MSG_APL_DEPTO_COMPLETO} Se limpiaron las Direcciones/Unidades seleccionadas: `
        + previas.map((id) => this.data.territorio.nombreRegistro(id)).join(', ') + '.');
    }
  }

  protected alternarUnidad(id: string): void {
    this.fUnidades.update((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
    this.error.set('');
  }

  protected guardarLinea(c: ControlCatalogo): void {
    const linea = { ...this.lineaForm(), activo: this.fActivo };
    const error = this.data.guardarLineaAplicacion(c.codigo, linea, this.auth.usuario()!, this.limpiadas());
    if (error) {
      this.error.set(error);
      this.toast.warn('Configuración no guardada', error);
      return;
    }
    this.formAbierto.set(false);
    // Guardar YA recalculó el período: el aviso lo dice, no pide pulsar nada más.
    this.autoSync.invalidar();
    this.toast.ok('Configuración guardada',
      'La configuración del control fue guardada y los controles del período se recalcularon automáticamente.');
  }

  protected alternarLinea(c: ControlCatalogo, l: AplicacionDepartamento): void {
    const error = this.data.cambiarEstadoLineaAplicacion(c.codigo, l.id, !l.activo, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible cambiar la configuración', error);
      return;
    }
    this.autoSync.invalidar();
    this.toast.ok(l.activo ? 'Configuración desactivada' : 'Configuración activada',
      `${c.codigo} en ${this.data.territorio.nombreDepartamento(l.departamentoId)}. Controles del período recalculados automáticamente.`);
  }
}
