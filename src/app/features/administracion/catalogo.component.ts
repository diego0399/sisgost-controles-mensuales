import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { AplicacionControl, ControlCatalogo, Frecuencia, ModoAplicacion } from '../../core/models/models';

/**
 * Catálogo de controles: los formatos institucionales modelados desde la carpeta real de
 * controles, con su frecuencia, sus reglas (evidencia, firma, justificación) y —sobre todo— su
 * **aplicación**: en qué Direcciones, Unidades o área técnica se trabaja cada control. No todos
 * los controles se llevan en todas las Direcciones/Unidades, y el calendario solo programa un
 * control donde su configuración dice que aplica.
 *
 * El Administrador edita; el Encargado consulta.
 */
@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent],
  styles: `
    /* Once columnas: sin anchos acotados la tabla se sale de la tarjeta. */
    /* Los encabezados largos empujan la tabla: aquí pueden partirse en dos líneas. */
    .tbl th { white-space: normal; }
    .tbl th:nth-child(4) { width: 130px; }
    .tbl th:nth-child(5) { width: 190px; }
    .col-nombre { max-width: 165px; }
    .aplica-lista { max-width: 205px; font-size: 12px; }
    .aplica-motivo { color: var(--tx-3); font-size: 11px; margin-top: 2px; }
    .col-si { text-align: center; white-space: nowrap; }
    .col-acciones { width: 150px; }
    .col-acciones .btn { margin: 1px 2px 1px 0; padding-left: 8px; padding-right: 8px; }
    .opcion-modo {
      display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; cursor: pointer;
      border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px;
    }
    .opcion-modo.on { border-color: var(--navy-800); background: var(--surface-2, #f8fafc); }
    .opcion-modo b { font-size: 13px; color: var(--navy-900); }
    .opcion-modo .d { display: block; font-size: 12px; color: var(--tx-3); margin-top: 2px; }
    .seleccion { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin: 4px 0 10px 30px; }
    .chk { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; }
    .resultado { font-size: 12.5px; color: var(--tx-2); }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Catálogo de controles
            <ui-help texto="La frecuencia, las reglas y la aplicación de cada control no van quemadas en el código: se configuran aquí. Un control semanal genera una instancia por semana; uno eventual solo cuando hay actividad. La aplicación decide en qué Direcciones/Unidades se programa: no todos los controles se trabajan en todas." />
          </h1>
          <p class="page-sub">{{ data.catalogo().length }} controles modelados desde los formatos físicos de la carpeta de controles.</p>
        </div>
      </div>

      <div class="alert" style="margin-bottom: 16px;">
        <span class="alert-ico">i</span>
        <span>
          <b>«Aplica a» es configurable.</b> El calendario mensual solo programa cada control en las
          Direcciones/Unidades donde aplica; donde no aplica, el control no aparece como pendiente
          ni cuenta como vencido: queda simplemente como <b>No aplica</b>.
        </span>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr>
                <th>Código</th><th>Nombre del control</th><th>Frecuencia</th><th>Aplica a</th>
                <th>Direcciones/Unidades configuradas</th>
                <th class="col-si">Evid.</th><th class="col-si">Firma</th><th class="col-si">Just.</th>
                <th class="col-si">Form.</th><th>Estado</th>@if (auth.esAdmin()) { <th>Acciones</th> }
              </tr></thead>
              <tbody>
                @for (c of data.catalogo(); track c.codigo) {
                  <tr [style.opacity]="c.activo ? 1 : .55">
                    <td><b class="mono">{{ c.codigo }}</b><div class="muted" style="font-size: 11px;">{{ c.version }}</div></td>
                    <td class="col-nombre">{{ c.nombre }}</td>
                    <td><ui-badge [estado]="c.frecuencia" /></td>
                    <td [title]="c.aplicacion.observaciones">
                      <ui-badge [estado]="c.aplicacion.modo" />
                    </td>
                    <td class="aplica-lista">
                      {{ data.resumenAplicacion(c) }}
                      <div class="aplica-motivo">
                        Se programa en {{ data.paresAplicables(c.codigo).length }}
                        {{ data.paresAplicables(c.codigo).length === 1 ? 'Dirección/Unidad' : 'Direcciones/Unidades' }}
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
                        <button class="btn btn-outline btn-sm" type="button" (click)="editarAplicacion(c)">Editar aplicación</button>
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
            <div><dt>Aplica a</dt><dd>{{ c.aplicacion.modo }}</dd></div>
            <div><dt>Direcciones/Unidades</dt><dd>{{ data.resumenAplicacion(c) }}</dd></div>
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
            } @empty { <span class="badge danger">Ninguna Dirección/Unidad</span> }
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
              <label for="jus">Permite justificación</label>
              <select id="jus" class="control" [(ngModel)]="e.permiteJustificacion">
                <option [ngValue]="true">Sí</option><option [ngValue]="false">No</option>
              </select>
            </div>
            <div class="field">
              <label for="apl">Aplica a</label>
              <input id="apl" class="control" [value]="e.aplicacion.modo" readonly />
              <span class="hint">Se configura en «Editar aplicación».</span>
            </div>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="edicion.set(null)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardar()">Guardar cambios</button>
          </div>
        </ui-modal>
      }

      <!-- Configurar aplicación -->
      @if (aplicacion(); as a) {
        <ui-modal titulo="Configurar aplicación del control"
          [sub]="a.codigo + ' — ' + a.nombre" [ancho]="true" (cerrar)="aplicacion.set(null)">
          <p class="muted" style="margin-bottom: 12px;">
            Indique dónde se trabaja este control. El calendario mensual solo lo programará en las
            Direcciones/Unidades resultantes.
          </p>

          @for (m of modos; track m.valor) {
            <label class="opcion-modo" [class.on]="a.aplicacion.modo === m.valor">
              <input type="radio" name="modo" [value]="m.valor" [(ngModel)]="a.aplicacion.modo" />
              <span><b>{{ m.valor }}</b><span class="d">{{ m.detalle }}</span></span>
            </label>

            @if (a.aplicacion.modo === m.valor && m.valor === 'Direcciones específicas') {
              <div class="seleccion">
                @for (d of data.direcciones(); track d.id) {
                  <label class="chk">
                    <input type="checkbox" [checked]="a.aplicacion.direcciones.includes(d.id)"
                      (change)="alternarDireccion(a.aplicacion, d.id)" />
                    <span>{{ d.corta }} — {{ d.nombre }}</span>
                  </label>
                }
              </div>
            }
            @if (a.aplicacion.modo === m.valor && m.valor === 'Unidades específicas') {
              <div class="seleccion">
                @for (p of data.pares(); track p.direccion + p.unidad) {
                  <label class="chk">
                    <input type="checkbox" [checked]="tieneUnidad(a.aplicacion, p)"
                      (change)="alternarUnidad(a.aplicacion, p)" />
                    <span>{{ data.cortaDireccion(p.direccion) }} · {{ p.unidad }}</span>
                  </label>
                }
              </div>
            }
            @if (a.aplicacion.modo === m.valor && m.valor === 'Área técnica específica') {
              <div class="seleccion">
                @for (ar of data.areas(); track ar.id) {
                  <label class="chk">
                    <input type="radio" name="area" [value]="ar.id" [(ngModel)]="a.aplicacion.area" />
                    <span>
                      <b>{{ ar.nombre }}</b>
                      <span class="muted" style="display: block; font-size: 11.5px;">{{ ar.descripcion }}</span>
                    </span>
                  </label>
                }
              </div>
            }
          }

          <div class="field" style="margin-top: 8px;">
            <label for="apl-obs">Observaciones (motivo institucional)</label>
            <textarea id="apl-obs" class="control" rows="2" [(ngModel)]="a.aplicacion.observaciones"
              placeholder="Por qué este control aplica solo ahí…"></textarea>
          </div>

          <div class="alert" style="margin-top: 12px;">
            <span class="alert-ico">i</span>
            <span class="resultado">
              Con esta configuración el control se programará en
              <b>{{ paresPrevistos().length }}</b>
              {{ paresPrevistos().length === 1 ? 'Dirección/Unidad' : 'Direcciones/Unidades' }}:
              {{ resumenPrevisto() }}.
              @if (data.requiereEquipos(a)) {
                Este control trabaja con equipos, así que solo se programa donde hay inventario operativo activo.
              }
            </span>
          </div>

          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="aplicacion.set(null)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardarAplicacion()">Guardar configuración</button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class CatalogoComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly frecuencias: Frecuencia[] = ['Mensual', 'Semanal', 'Diaria', 'Eventual', 'Programado'];
  protected readonly modos: { valor: ModoAplicacion; detalle: string }[] = [
    { valor: 'Todas las direcciones', detalle: 'El control se lleva en todas las Direcciones/Unidades atendidas por Soporte Técnico.' },
    { valor: 'Direcciones específicas', detalle: 'Solo en las Direcciones seleccionadas, con todas sus unidades.' },
    { valor: 'Unidades específicas', detalle: 'Solo en los pares Dirección/Unidad seleccionados.' },
    { valor: 'Área técnica específica', detalle: 'No aplica por Dirección: aplica al área técnica responsable (cuarto de servidores, respaldos, infraestructura…).' }
  ];

  protected readonly detalle = signal<ControlCatalogo | null>(null);
  protected readonly edicion = signal<ControlCatalogo | null>(null);
  protected readonly aplicacion = signal<ControlCatalogo | null>(null);

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
    this.toast.ok('Catálogo actualizado', `${e.codigo}: frecuencia ${e.frecuencia.toLowerCase()}, ${e.activo ? 'activo' : 'inactivo'}.`);
  }

  protected alternarEstado(c: ControlCatalogo): void {
    const copia = structuredClone(c);
    copia.activo = !copia.activo;
    const error = this.data.actualizarCatalogo(copia, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible activar el control', error);
      return;
    }
    this.toast.ok(copia.activo ? 'Control activado' : 'Control desactivado',
      `${c.codigo} quedó ${copia.activo ? 'activo' : 'inactivo'} en el catálogo.`);
  }

  // ------------------------------------------------------------------ editar aplicación

  protected editarAplicacion(c: ControlCatalogo): void { this.aplicacion.set(structuredClone(c)); }

  protected tieneUnidad(a: AplicacionControl, p: { direccion: string; unidad: string }): boolean {
    return a.unidades.some((u) => u.direccion === p.direccion && u.unidad === p.unidad);
  }

  protected alternarDireccion(a: AplicacionControl, id: string): void {
    a.direcciones = a.direcciones.includes(id) ? a.direcciones.filter((x) => x !== id) : [...a.direcciones, id];
  }

  protected alternarUnidad(a: AplicacionControl, p: { direccion: string; unidad: string }): void {
    a.unidades = this.tieneUnidad(a, p)
      ? a.unidades.filter((u) => !(u.direccion === p.direccion && u.unidad === p.unidad))
      : [...a.unidades, { ...p }];
  }

  /** Vista previa: en qué Direcciones/Unidades quedaría el control con lo seleccionado. */
  protected readonly paresPrevistos = computed(() => {
    const c = this.aplicacion();
    if (!c) return [];
    const a = c.aplicacion;
    let pares = this.data.pares();
    if (a.modo === 'Direcciones específicas') pares = pares.filter((p) => a.direcciones.includes(p.direccion));
    else if (a.modo === 'Unidades específicas') pares = pares.filter((p) => this.tieneUnidad(a, p));
    else if (a.modo === 'Área técnica específica') {
      const area = this.data.areaDe(a.area);
      pares = pares.filter((p) => (area?.pares ?? []).some((u) => u.direccion === p.direccion && u.unidad === p.unidad));
    }
    if (this.data.requiereEquipos(c)) pares = pares.filter((p) => this.data.equiposActivosDe(p.direccion, p.unidad).length > 0);
    return pares;
  });

  protected resumenPrevisto(): string {
    const lista = this.paresPrevistos().map((p) => `${this.data.cortaDireccion(p.direccion)} · ${p.unidad}`);
    return lista.length ? lista.join('; ') : 'ninguna todavía';
  }

  protected guardarAplicacion(): void {
    const c = this.aplicacion();
    if (!c) return;
    const error = this.data.actualizarAplicacion(c.codigo, c.aplicacion, this.auth.usuario()!);
    if (error) {
      this.toast.warn('Aplicación incompleta', error);
      return;
    }
    this.aplicacion.set(null);
    this.toast.ok('Aplicación actualizada', 'La aplicación del control fue actualizada correctamente.');
  }
}
