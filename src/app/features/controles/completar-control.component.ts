import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { IconComponent } from '../../shared/icon';
import {
  ControlMes, EvidenciaControl, RespuestaSeccion, SeccionPlantilla,
  formateaFecha, isoLocal, nombreMes
} from '../../core/models/models';

/** Estado editable de una sección del formulario (espejo mutable de la plantilla). */
interface SeccionEdit {
  plantilla: SeccionPlantilla;
  campos: Record<string, string>;
  items: Record<string, { estado: string; medicion: string; nota: string }>;
  filas: string[][];
}

/**
 * Completar control: formulario digital por secciones (stepper) construido desde la plantilla
 * del catálogo — la traducción digital del formato físico real. Al finalizar muestra el resumen,
 * valida obligatorios y mínimos, y entrega generando el documento formal.
 */
@Component({
  selector: 'app-completar-control',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, ModalComponent, DocumentoComponent, IconComponent],
  styles: `
    .paso-cuerpo { max-width: 900px; }
    /* Espacio entre pasos: las etiquetas largas de las secciones no deben tocarse. */
    .step { min-width: 170px; }
    .step .lbl { max-width: 150px; }
    .item-row {
      display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center;
      padding: 9px 0; border-bottom: 1px dashed var(--line);
    }
    .item-row:last-child { border-bottom: 0; }
    .item-nom { font-size: 13px; color: var(--navy-900); }
    .opciones { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 9px; overflow: hidden; }
    .opciones button {
      border: 0; background: var(--surface); color: var(--tx-2); font-family: inherit; font-size: 12px;
      padding: 6px 11px; cursor: pointer; border-left: 1px solid var(--line);
    }
    .opciones button:first-child { border-left: 0; }
    .opciones button.on { background: var(--navy-800); color: #fff; font-weight: 600; }
    .medicion { width: 120px; }
    .tabla-form td { padding: 4px 6px 4px 0; }
    .tabla-form input { width: 100%; }
    .resumen-check { color: var(--ok); }
    .ev-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 13px; }
    .ev-item:last-child { border-bottom: 0; }
  `,
  template: `
    @if (control(); as c) {
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-kicker">Operación · {{ data.cortaDireccion(c.direccion) }}</div>
            <h1>{{ c.codigo }} — {{ catalogo()?.nombre }}</h1>
            <p class="page-sub">
              {{ c.semana ? 'Semana ' + c.semana + ' de ' : '' }}{{ nombreMes(c.mes) }} {{ c.anio }} ·
              {{ data.nombreDireccion(c.direccion) }} ·
              Fecha límite <b>{{ formatea(c.fechaLimite) }}</b>
              @if (editable()) {
                ·
                @if (restan() >= 0) { restan {{ restan() }} día(s) hábil(es) }
                @else { <span class="badge danger">plazo vencido</span> }
              }
            </p>
          </div>
          <div class="row">
            <ui-badge [estado]="c.estado" />
            <a class="btn btn-outline btn-sm" routerLink="/controles">Volver al listado</a>
          </div>
        </div>

        @if (c.estado === 'Observado' && c.observaciones) {
          <div class="alert warn" style="margin-bottom: 16px;">
            <span class="alert-ico">!</span>
            <span><b>Control observado por el Encargado de Soporte.</b> {{ c.observaciones }}</span>
          </div>
        }

        @if (!editable()) {
          <!-- Solo lectura: detalle del control ya entregado, justificado o fuera del alcance del rol. -->
          <div class="card">
            <div class="card-head">
              <div>
                <h3>Detalle del control</h3>
                <p class="sub">
                  @if (c.fechaEntrega) { Entregado el {{ formatea(c.fechaEntrega) }}@if (c.horaEntrega) { a las {{ c.horaEntrega }} }. }
                  @else { Este control aún no registra entrega. }
                </p>
              </div>
              <div class="row">
                @if (c.documento) { <button class="btn btn-primary btn-sm" type="button" (click)="verDoc.set(c.documento!)">Ver documento</button> }
                @if (c.justificacion) { <button class="btn btn-gold btn-sm" type="button" (click)="verCarta()">Ver carta de justificación</button> }
                @if (puedeRevisar()) {
                  <button class="btn btn-outline btn-sm" type="button" (click)="modalRevision.set(true)">Revisar entrega</button>
                }
              </div>
            </div>
            <div class="card-body">
              @if (c.secciones.length) {
                @for (s of c.secciones; track s.titulo) {
                  <div class="sec-title">{{ s.titulo }}</div>
                  @if (s.campos?.length) {
                    <dl class="dl">
                      @for (campo of s.campos; track campo.id) {
                        <div><dt>{{ etiquetaCampo(s.titulo, campo.id) }}</dt><dd>{{ campo.valor || '—' }}</dd></div>
                      }
                    </dl>
                  }
                  @if (s.items?.length) {
                    <div style="display: grid; gap: 4px; margin: 8px 0;">
                      @for (i of s.items; track i.id) {
                        <div class="row-between" style="font-size: 13px;">
                          <span>{{ etiquetaItem(s.titulo, i.id) }}</span>
                          <span class="row" style="gap: 8px;">
                            @if (i.medicion) { <span class="mono muted">{{ i.medicion }}</span> }
                            <ui-badge [estado]="i.estado" />
                          </span>
                        </div>
                      }
                    </div>
                  }
                  @if (s.filas?.length) {
                    <div class="table-wrap" style="margin: 8px 0;">
                      <table class="tbl">
                        <thead><tr>@for (col of columnasDe(s.titulo); track col) { <th>{{ col }}</th> }</tr></thead>
                        <tbody>@for (f of s.filas; track $index) { <tr>@for (celda of f; track $index) { <td>{{ celda || '—' }}</td> }</tr> }</tbody>
                      </table>
                    </div>
                  }
                }
              } @else {
                <p class="muted">Este control no tiene formulario registrado{{ c.justificacion ? ': el período se cerró mediante carta de justificación.' : '.' }}</p>
              }
            </div>
          </div>
        } @else {
          <!-- Edición: stepper por secciones. -->
          <div class="card">
            <div class="card-body">
              <div class="stepper">
                @for (p of pasos(); track p; let i = $index) {
                  <div class="step" [class.done]="i < paso()" [class.now]="i === paso()">
                    <span class="dot">{{ i + 1 }}</span>
                    <span class="lbl">{{ p }}</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: 14px;">
            <div class="card-head">
              <div>
                <h3>{{ pasos()[paso()] }}</h3>
                @if (esResumen()) { <p class="sub">Verifique la información antes de entregar; la entrega genera el documento formal.</p> }
                @else if (seccionActual()?.plantilla?.descripcion) { <p class="sub">{{ seccionActual()?.plantilla?.descripcion }}</p> }
              </div>
              <div class="row">
                <button class="btn btn-outline btn-sm" type="button" (click)="guardar()">Guardar avance</button>
                @if (catalogo()?.permiteJustificacion) {
                  <button class="btn btn-gold btn-sm" type="button" (click)="abrirJustificar()">
                    Justificar sin actividad
                  </button>
                }
              </div>
            </div>
            <div class="card-body paso-cuerpo">

              @if (esEvidencias()) {
                <p class="muted" style="margin-bottom: 10px;">
                  Este control exige evidencia (registro fotográfico u otro respaldo). En el prototipo se registra el
                  nombre del archivo y su descripción.
                </p>
                <div class="row" style="align-items: flex-end; gap: 10px; margin-bottom: 12px;">
                  <div class="field" style="flex: 1;">
                    <label for="ev-file">Archivo de evidencia</label>
                    <input id="ev-file" class="control" type="file" (change)="archivoElegido($event)" />
                  </div>
                  <div class="field" style="flex: 2;">
                    <label for="ev-desc">Descripción</label>
                    <input id="ev-desc" class="control" [(ngModel)]="evDescripcion" placeholder="Qué documenta la evidencia…" />
                  </div>
                  <button class="btn btn-primary" type="button" (click)="agregarEvidencia()">Agregar</button>
                </div>
                @for (e of evidencias; track e.nombre + $index) {
                  <div class="ev-item">
                    <ui-icon name="image" [size]="15" style="color: var(--tx-3)" />
                    <span style="flex: 1;"><b>{{ e.nombre }}</b> — {{ e.descripcion }}</span>
                    <button class="btn btn-ghost btn-sm" type="button" (click)="quitarEvidencia($index)">Quitar</button>
                  </div>
                } @empty { <p class="muted">Sin evidencias registradas.</p> }
              }

              @else if (esResumen()) {
                @if (faltas().length) {
                  <div class="alert warn" style="margin-bottom: 14px;">
                    <span class="alert-ico">!</span>
                    <span>
                      <b>No es posible entregar todavía:</b>
                      <ul style="margin: 6px 0 0 16px;">
                        @for (f of faltas(); track f) { <li>{{ f }}</li> }
                      </ul>
                    </span>
                  </div>
                } @else {
                  <div class="alert ok" style="margin-bottom: 14px;">
                    <span class="alert-ico"><ui-icon name="check" [size]="11" /></span>
                    <span><b>El formulario está completo.</b> La entrega registrará fecha y hora, generará el documento formal y quedará en trazabilidad.</span>
                  </div>
                }
                <dl class="dl">
                  <div><dt>Control</dt><dd>{{ c.codigo }} — {{ catalogo()?.nombre }}</dd></div>
                  <div><dt>Período</dt><dd>{{ c.semana ? 'Semana ' + c.semana + ' de ' : '' }}{{ nombreMes(c.mes) }} {{ c.anio }}</dd></div>
                  <div><dt>Dirección/Unidad</dt><dd>{{ data.nombreDireccion(c.direccion) }}</dd></div>
                  <div><dt>Responsable</dt><dd>{{ auth.usuario()?.nombre }}</dd></div>
                  <div><dt>Fecha límite</dt><dd class="mono">{{ formatea(c.fechaLimite) }}</dd></div>
                  <div><dt>Entrega prevista</dt><dd>
                    @if (restan() >= 0) { Dentro del plazo }
                    @else { <span class="badge warn">Se registrará como «Entregado tarde»</span> }
                  </dd></div>
                </dl>
                @for (s of modelo; track s.plantilla.titulo) {
                  <div class="sec-title">{{ s.plantilla.titulo }}</div>
                  <p class="muted" style="font-size: 12.5px;">
                    @if (s.plantilla.campos?.length) { {{ camposLlenos(s) }} de {{ s.plantilla.campos?.length }} campo(s) completado(s). }
                    @if (s.plantilla.items?.length) { {{ itemsMarcados(s) }} de {{ s.plantilla.items?.length }} ítem(s) marcado(s). }
                    @if (s.plantilla.tabla) { {{ s.filas.length }} registro(s) en la tabla. }
                  </p>
                }
              }

              @else if (seccionActual(); as s) {
                @if (s.plantilla.campos?.length) {
                  <div class="form-grid">
                    @for (campo of s.plantilla.campos; track campo.id) {
                      <div class="field" [class.span-2]="campo.tipo === 'area'">
                        <label [for]="campo.id">
                          {{ campo.etiqueta }}@if (campo.obligatorio) { <span style="color: var(--danger)"> *</span> }
                          @if (campo.ayuda) { <ui-help [texto]="campo.ayuda" /> }
                        </label>
                        @switch (campo.tipo) {
                          @case ('area') { <textarea [id]="campo.id" class="control" rows="3" [(ngModel)]="s.campos[campo.id]"></textarea> }
                          @case ('fecha') { <input [id]="campo.id" class="control" type="date" [(ngModel)]="s.campos[campo.id]" /> }
                          @case ('hora') { <input [id]="campo.id" class="control" type="time" [(ngModel)]="s.campos[campo.id]" /> }
                          @case ('numero') { <input [id]="campo.id" class="control" type="number" [(ngModel)]="s.campos[campo.id]" /> }
                          @case ('opcion') {
                            <select [id]="campo.id" class="control" [(ngModel)]="s.campos[campo.id]">
                              <option value="">Seleccione…</option>
                              @for (o of campo.opciones ?? []; track o) { <option [value]="o">{{ o }}</option> }
                            </select>
                          }
                          @default { <input [id]="campo.id" class="control" [(ngModel)]="s.campos[campo.id]" /> }
                        }
                      </div>
                    }
                  </div>
                }

                @if (s.plantilla.items?.length) {
                  <div>
                    @for (item of s.plantilla.items; track item.id) {
                      <div class="item-row">
                        <span class="item-nom">{{ item.nombre }}</span>
                        @if (item.medicion) {
                          <input class="control medicion" [placeholder]="item.medicion" [(ngModel)]="s.items[item.id].medicion" />
                        } @else { <span></span> }
                        <span class="opciones">
                          @for (op of item.estados ?? estadosBase; track op) {
                            <button type="button" [class.on]="s.items[item.id].estado === op" (click)="s.items[item.id].estado = op">{{ op }}</button>
                          }
                        </span>
                      </div>
                    }
                  </div>
                }

                @if (s.plantilla.tabla; as t) {
                  <div class="table-wrap">
                    <table class="tbl tabla-form">
                      <thead><tr>@for (col of t.columnas; track col) { <th>{{ col }}</th> } <th></th></tr></thead>
                      <tbody>
                        @for (fila of s.filas; track $index; let fi = $index) {
                          <tr>
                            @for (col of t.columnas; track col; let ci = $index) {
                              <td><input class="control" [(ngModel)]="fila[ci]" /></td>
                            }
                            <td><button class="btn btn-ghost btn-sm" type="button" (click)="quitarFila(s, fi)">Quitar</button></td>
                          </tr>
                        } @empty {
                          <tr><td [attr.colspan]="t.columnas.length + 1" class="muted">Sin registros. @if (t.minimo > 0) { Se requiere al menos {{ t.minimo }}. }</td></tr>
                        }
                      </tbody>
                    </table>
                  </div>
                  <button class="btn btn-outline btn-sm" type="button" style="margin-top: 10px;" (click)="agregarFila(s)">
                    <ui-icon name="plus" [size]="13" /> Agregar registro
                  </button>
                }
              }

              <div class="divider"></div>
              <div class="row-between">
                <button class="btn btn-outline" type="button" [disabled]="paso() === 0" (click)="paso.set(paso() - 1)">Anterior</button>
                @if (esResumen()) {
                  <button class="btn btn-primary btn-lg" type="button" (click)="entregar()">Entregar control</button>
                } @else {
                  <button class="btn btn-primary" type="button" (click)="siguiente()">Siguiente</button>
                }
              </div>
            </div>
          </div>
        }

        <!-- Modal de justificación -->
        @if (modalJustificar()) {
          <ui-modal titulo="Carta de justificación" [sub]="'Cierra el control sin actividad: ' + c.codigo + ' · ' + nombreMes(c.mes) + ' ' + c.anio" (cerrar)="modalJustificar.set(false)">
            <div class="alert" style="margin-bottom: 14px;">
              <span class="alert-ico">i</span>
              <span>Si el control mensual no tuvo actividad, no debe quedar vacío: se cierra mediante carta de justificación con el formato institucional (tres firmas).</span>
            </div>
            <div class="field">
              <label for="jus-motivo">Motivo <span style="color: var(--danger)">*</span></label>
              <select id="jus-motivo" class="control" [(ngModel)]="jusMotivo" (ngModelChange)="plantillaCarta()">
                <option value="">Seleccione el motivo…</option>
                @for (m of motivos; track m) { <option [value]="m">{{ m }}</option> }
              </select>
            </div>
            <div class="field" style="margin-top: 12px;">
              <label for="jus-texto">Texto de la carta <span style="color: var(--danger)">*</span></label>
              <textarea id="jus-texto" class="control" rows="6" [(ngModel)]="jusTexto"></textarea>
              <span class="hint">Basado en el formato «Formatos_nuevos_2025_.docx»: se informa el mes, el control no realizado y la causa.</span>
            </div>
            <div class="row" style="justify-content: flex-end; margin-top: 16px;">
              <button class="btn btn-outline" type="button" (click)="modalJustificar.set(false)">Cancelar</button>
              <button class="btn btn-gold" type="button" (click)="justificar()">Emitir carta de justificación</button>
            </div>
          </ui-modal>
        }

        <!-- Modal de revisión del Encargado -->
        @if (modalRevision()) {
          <ui-modal titulo="Revisión de la entrega" [sub]="c.codigo + ' · ' + data.cortaDireccion(c.direccion)" (cerrar)="modalRevision.set(false)">
            <div class="field">
              <label for="rev-obs">Observación (solo si se devuelve)</label>
              <textarea id="rev-obs" class="control" rows="3" [(ngModel)]="revObservacion"></textarea>
            </div>
            <div class="row" style="justify-content: flex-end; margin-top: 16px;">
              <button class="btn btn-outline" type="button" (click)="revisar('Observado')">Observar y devolver</button>
              <button class="btn btn-primary" type="button" (click)="revisar('Cerrado')">Aprobar y cerrar</button>
            </div>
          </ui-modal>
        }

        <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
      </div>
    } @else {
      <div class="page"><p class="muted">El control indicado no existe.</p></div>
    }
  `
})
export class CompletarControlComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Id del control, enlazado desde la ruta. */
  readonly id = input.required<string>();

  protected readonly control = computed(() => this.data.controlPorId(this.id()));
  protected readonly catalogo = computed(() => {
    const c = this.control();
    return c ? this.data.catalogoDe(c.codigo) : undefined;
  });

  protected readonly paso = signal(0);
  protected readonly verDoc = signal('');
  protected readonly modalJustificar = signal(false);
  protected readonly modalRevision = signal(false);

  protected readonly estadosBase = ['Bueno', 'Malo', 'No aplica'];
  protected readonly motivos = [
    'Sin actividad mensual asociada al control',
    'No hubo traslado de cintas en el mes',
    'No se registraron tiquetes GLPI aplicables',
    'No se realizó cambio de equipo informático',
    'Otro (detallar en la carta)'
  ];

  /** Espejo mutable de la plantilla con las respuestas ya guardadas. */
  protected modelo: SeccionEdit[] = [];
  protected evidencias: EvidenciaControl[] = [];
  protected evNombre = '';
  protected evDescripcion = '';
  protected jusMotivo = '';
  protected jusTexto = '';
  protected revObservacion = '';

  /** Último control cargado en el modelo: evita reconstruirlo (y perder el paso) en cada guardado. */
  private idCargado = '';

  constructor() {
    // Reconstruye el modelo editable solo cuando cambia el control abierto.
    effect(() => {
      const c = this.control();
      const cat = this.catalogo();
      if (!c || !cat) { this.modelo = []; this.idCargado = ''; return; }
      if (c.id === this.idCargado) return;
      this.idCargado = c.id;
      this.modelo = cat.plantilla.map((p) => {
        const r = c.secciones.find((s) => s.titulo === p.titulo);
        const campos: Record<string, string> = {};
        for (const campo of p.campos ?? []) campos[campo.id] = r?.campos?.find((x) => x.id === campo.id)?.valor ?? '';
        const items: SeccionEdit['items'] = {};
        for (const item of p.items ?? []) {
          const ri = r?.items?.find((x) => x.id === item.id);
          items[item.id] = { estado: ri?.estado ?? '', medicion: ri?.medicion ?? '', nota: ri?.nota ?? '' };
        }
        return { plantilla: p, campos, items, filas: (r?.filas ?? []).map((f) => [...f]) };
      });
      this.evidencias = c.evidencias.map((e) => ({ ...e }));
      this.paso.set(0);
    });
  }

  // ------------------------------------------------------------------ permisos y pasos

  /** El formulario solo se edita si el control está abierto y el rol puede operar esa Dirección. */
  protected readonly editable = computed(() => {
    const c = this.control();
    const u = this.auth.usuario();
    if (!c || !u || u.clave === 'jefatura') return false;
    if (!['Programado', 'Pendiente', 'En proceso'].includes(c.estado)) return false;
    if (u.clave === 'tec-soporte') return this.data.direccionesDe(u.usuario).includes(c.direccion);
    return true;
  });

  protected puedeRevisar(): boolean {
    const c = this.control();
    return !!c && (this.auth.esEncargado() || this.auth.esAdmin())
      && ['Entregado', 'Entregado tarde', 'En revisión', 'Observado'].includes(c.estado);
  }

  protected readonly pasos = computed(() => {
    const nombres = (this.catalogo()?.plantilla ?? []).map((p) => p.titulo);
    if (this.catalogo()?.requiereEvidencia) nombres.push('Evidencias');
    nombres.push('Resumen y entrega');
    return nombres;
  });

  protected esResumen(): boolean { return this.paso() === this.pasos().length - 1; }
  protected esEvidencias(): boolean {
    return !!this.catalogo()?.requiereEvidencia && this.paso() === this.pasos().length - 2;
  }
  protected seccionActual(): SeccionEdit | undefined {
    return this.esResumen() || this.esEvidencias() ? undefined : this.modelo[this.paso()];
  }

  protected siguiente(): void {
    this.guardar(true);
    this.paso.set(Math.min(this.paso() + 1, this.pasos().length - 1));
  }

  // ------------------------------------------------------------------ edición

  protected agregarFila(s: SeccionEdit): void {
    s.filas.push(new Array(s.plantilla.tabla?.columnas.length ?? 0).fill(''));
  }
  protected quitarFila(s: SeccionEdit, i: number): void { s.filas.splice(i, 1); }

  protected archivoElegido(ev: Event): void {
    const archivo = (ev.target as HTMLInputElement).files?.[0];
    if (archivo) this.evNombre = archivo.name;
  }

  protected agregarEvidencia(): void {
    if (!this.evNombre && !this.evDescripcion.trim()) {
      this.toast.warn('Evidencia incompleta', 'Elija un archivo o escriba una descripción.');
      return;
    }
    this.evidencias.push({
      nombre: this.evNombre || `evidencia-${this.evidencias.length + 1}.jpg`,
      descripcion: this.evDescripcion.trim() || 'Registro fotográfico del control',
      fecha: isoLocal(new Date())
    });
    this.evNombre = '';
    this.evDescripcion = '';
    this.guardar(true);
  }

  protected quitarEvidencia(i: number): void {
    this.evidencias.splice(i, 1);
    this.guardar(true);
  }

  private respuestas(): RespuestaSeccion[] {
    return this.modelo.map((s) => ({
      titulo: s.plantilla.titulo,
      campos: (s.plantilla.campos ?? []).map((c) => ({ id: c.id, valor: s.campos[c.id] ?? '' })),
      items: (s.plantilla.items ?? []).map((i) => ({
        id: i.id, estado: s.items[i.id]?.estado ?? '',
        medicion: s.items[i.id]?.medicion || undefined, nota: s.items[i.id]?.nota || undefined
      })),
      filas: s.filas.filter((f) => f.some((x) => x.trim()))
    }));
  }

  protected guardar(silencioso = false): void {
    const c = this.control();
    if (!c || !this.editable()) return;
    this.data.guardarAvance(c.id, this.respuestas(), this.evidencias, c.observaciones);
    if (!silencioso) this.toast.ok('Avance guardado', 'El formulario quedó guardado; puede continuar más tarde.');
  }

  // ------------------------------------------------------------------ entrega, justificación y revisión

  protected readonly faltas = computed(() => {
    const c = this.control();
    return c ? this.data.validarEntrega(c) : [];
  });

  protected entregar(): void {
    const c = this.control();
    if (!c) return;
    this.guardar(true);
    const r = this.data.entregarControl(c.id, this.auth.usuario()!);
    if (!r.ok) {
      this.toast.warn('No es posible entregar', r.faltas[0]);
      return;
    }
    if (r.estado === 'Entregado tarde') {
      this.toast.warn('Control entregado tarde', 'Este control venció el plazo de entrega establecido; la entrega quedó registrada fuera de plazo.');
    } else {
      this.toast.ok('Control entregado', 'La entrega quedó registrada dentro del plazo establecido.');
    }
    const doc = this.data.controlPorId(c.id)?.documento;
    if (doc) this.verDoc.set(doc);
  }

  protected abrirJustificar(): void {
    this.jusMotivo = '';
    this.jusTexto = '';
    this.modalJustificar.set(true);
  }

  /** Pre-redacta la carta con el formato institucional según el motivo elegido. */
  protected plantillaCarta(): void {
    const c = this.control();
    if (!c || !this.jusMotivo) return;
    const mes = nombreMes(c.mes).toLowerCase();
    const dir = this.data.nombreDireccion(c.direccion);
    const causa: Record<string, string> = {
      'No hubo traslado de cintas en el mes': `no hubo visita del técnico del Departamento de Operaciones. Sin embargo, los respaldos fueron realizados a disco`,
      'No se registraron tiquetes GLPI aplicables': `no hubo ningún incidente reportado por las áreas en la ${dir}`,
      'No se realizó cambio de equipo informático': `no se realizó ningún cambio de equipo informático en la ${dir}`
    };
    this.jusTexto = `Se informa que en el mes de ${mes} de ${c.anio} no se realizó el control ${c.codigo} ${this.catalogo()?.nombre ?? ''}, debido a que ${causa[this.jusMotivo] ?? '(detallar la causa)'}.`;
  }

  protected justificar(): void {
    const c = this.control();
    if (!c) return;
    if (!this.jusMotivo || !this.jusTexto.trim()) {
      this.toast.warn('Justificación incompleta', 'No es posible justificar sin motivo y sin el texto de la carta.');
      return;
    }
    const r = this.data.justificarControl(c.id, this.jusMotivo, this.jusTexto, this.auth.usuario()!);
    if (!r.ok) {
      this.toast.warn('No es posible justificar', r.error ?? '');
      return;
    }
    this.modalJustificar.set(false);
    this.toast.ok('Carta de justificación emitida', 'El control quedó justificado y la carta está disponible en el Generador de documentos.');
    this.verCarta();
  }

  protected verCarta(): void {
    const c = this.control();
    const j = c?.justificacion ? this.data.justificaciones().find((x) => x.id === c.justificacion) : undefined;
    if (j?.documento) this.verDoc.set(j.documento);
  }

  protected revisar(veredicto: 'Cerrado' | 'Observado'): void {
    const c = this.control();
    if (!c) return;
    if (veredicto === 'Observado' && !this.revObservacion.trim()) {
      this.toast.warn('Observación requerida', 'Para devolver el control indique qué debe corregirse.');
      return;
    }
    this.data.revisarControl(c.id, veredicto, this.revObservacion.trim(), this.auth.usuario()!);
    this.modalRevision.set(false);
    this.toast.ok(veredicto === 'Cerrado' ? 'Control cerrado' : 'Control observado',
      veredicto === 'Cerrado' ? 'La entrega fue aprobada y el control quedó cerrado.' : 'El control fue devuelto al responsable con observación.');
  }

  // ------------------------------------------------------------------ utilitarios de lectura

  protected etiquetaCampo(titulo: string, id: string): string {
    return this.catalogo()?.plantilla.find((p) => p.titulo === titulo)?.campos?.find((c) => c.id === id)?.etiqueta ?? id;
  }
  protected etiquetaItem(titulo: string, id: string): string {
    return this.catalogo()?.plantilla.find((p) => p.titulo === titulo)?.items?.find((c) => c.id === id)?.nombre ?? id;
  }
  protected columnasDe(titulo: string): string[] {
    return this.catalogo()?.plantilla.find((p) => p.titulo === titulo)?.tabla?.columnas ?? [];
  }

  protected camposLlenos(s: SeccionEdit): number {
    return (s.plantilla.campos ?? []).filter((c) => (s.campos[c.id] ?? '').trim()).length;
  }
  protected itemsMarcados(s: SeccionEdit): number {
    return (s.plantilla.items ?? []).filter((i) => s.items[i.id]?.estado).length;
  }

  protected restan(): number {
    const c = this.control();
    return c ? this.habiles.habilesHasta(c.fechaLimite, isoLocal(new Date())) : 0;
  }
  protected nombreMes(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }
}
