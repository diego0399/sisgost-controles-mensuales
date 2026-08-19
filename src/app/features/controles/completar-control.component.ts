import { ChangeDetectorRef, Component, computed, effect, inject, input, signal } from '@angular/core';
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
  ControlMes, EvidenciaControl, ItemSeguridad, RespuestaEquipo, RespuestaEquipoChecklist,
  RespuestaIngreso,
  RespuestaEquipoIp, RespuestaItemSeguridad, RespuestaSeccion, RespuestaTelefono, ResumenMuestra,
  SeccionPlantilla,
  formateaFecha, isoLocal, nombreMes
} from '../../core/models/models';

/** Estado editable de una sección del formulario (espejo mutable de la plantilla). */
interface SeccionEdit {
  plantilla: SeccionPlantilla;
  campos: Record<string, string>;
  items: Record<string, { estado: string; medicion: string; nota: string }>;
  filas: string[][];
  /** Revisión por equipo, indexada por número de inventario (solo secciones de equipos). */
  equipos: Record<string, RespuestaEquipo>;
  /** Equipos verificados por IP (F0387): tantas filas como pida la plantilla. */
  equiposIp: RespuestaEquipoIp[];
  /** Teléfonos o extensiones verificados (F0387). */
  telefonos: RespuestaTelefono[];
  /** Muestra de equipos verificada ítem por ítem (F0382): tantos huecos como pida el formato. */
  checklistEquipos: RespuestaEquipoChecklist[];
  /** Bitácora de ingresos al cuarto de servidores (F0234). */
  ingresos: RespuestaIngreso[];
}

/** Un paso del formulario. Una sección de muestra ocupa dos: elegir equipos y verificarlos. */
interface PasoForm {
  titulo: string;
  /** Índice de la sección de la plantilla, o -1 en evidencias y resumen. */
  seccion: number;
  fase: 'seccion' | 'muestra' | 'verificacion' | 'evidencias' | 'resumen';
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
    /* Documento de respaldo del F0234 */
    .respaldo {
      border: 1px solid var(--line-strong); border-radius: 10px; padding: 11px 13px;
      background: var(--surface-2, #f8fafc); display: grid; gap: 9px;
    }
    .respaldo img { width: 148px; border: 1px solid var(--line); border-radius: 6px; background: #fff; }
    .ev-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 13px; }
    .ev-item:last-child { border-bottom: 0; }
    /* Equipos del inventario operativo dentro del formulario */
    .eq-card { border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px; margin-bottom: 9px; }
    .eq-card.on { border-color: var(--navy-400, #7ba3d8); background: var(--surface-2, #f8fafc); }
    .eq-check { display: flex; gap: 10px; align-items: flex-start; font-size: 13px; cursor: pointer; }
    .eq-check input { margin-top: 3px; }
    .eq-verif { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
    .chip-check {
      display: inline-flex; align-items: center; gap: 5px;
      border: 1px solid var(--line-strong); background: var(--surface); color: var(--tx-2);
      font-family: inherit; font-size: 11.5px; padding: 5px 10px; border-radius: 20px; cursor: pointer;
    }
    .chip-check.on { background: var(--navy-800); border-color: var(--navy-800); color: #fff; font-weight: 600; }
    /* Avance semanal del control consolidado (F0387) */
    .semanal { border-left: 3px solid var(--gold-500); }
    .semanas { display: flex; flex-wrap: wrap; gap: 8px; }
    .sem {
      display: inline-flex; flex-direction: column; gap: 4px; align-items: flex-start;
      border: 1px solid var(--line); border-radius: 9px; padding: 7px 10px; font-size: 11.5px;
    }
    .sem.on { border-color: var(--navy-400, #7ba3d8); background: var(--surface-2, #f8fafc); }
    /* Verificación por IP y por teléfono/extensión (F0387) */
    .ip-fila { display: grid; grid-template-columns: 1fr 160px; gap: 12px; align-items: start; }
    .tel-fila { display: grid; grid-template-columns: 1fr 1fr 1fr 140px; gap: 12px; align-items: start; }
    .ip-datos { margin-top: 10px; }
    /* Muestra de equipos verificada ítem por ítem (F0382) */
    .slot { border: 1px dashed var(--line-strong); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
    .slot.on { border-style: solid; border-color: var(--navy-400, #7ba3d8); background: var(--surface-2, #f8fafc); }
    .slot-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .slot-num { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--tx-3); }
    .eq-elegido { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px 16px; margin-top: 10px; }
    .eq-elegido .d { font-size: 12.5px; }
    .eq-elegido .d dt { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--tx-3); }
    .eq-elegido .d dd { margin: 0; color: var(--navy-900); font-weight: 600; }
    .sin-dato { color: var(--tx-3); font-weight: 400; font-style: italic; }
    .buscador-eq { max-height: 420px; overflow: auto; }
    .fila-eq { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 4px; border-bottom: 1px dashed var(--line); }
    .fila-eq:last-child { border-bottom: 0; }
    .item-seg { border: 1px solid var(--line); border-radius: 10px; padding: 11px 13px; margin-bottom: 9px; }
    .item-seg.mal { border-left: 3px solid var(--danger); }
    .item-seg.na { border-left: 3px solid var(--gold-500); }
    .item-seg-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
    .item-seg .grupo { font-size: 11px; color: var(--tx-3); }
    .avance-eq { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .avance-eq .a { border: 1px solid var(--line); border-radius: 9px; padding: 7px 10px; font-size: 11.5px; }
    .avance-eq .a.ok { border-color: var(--ok); }
    @media (max-width: 760px) {
      .ip-fila, .tel-fila { grid-template-columns: 1fr; }
    }
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
              {{ data.dirUnidad(c.direccion, c.unidad) }} ·
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

        @if (bloqueo()) {
          <div class="alert danger" style="margin-bottom: 16px;">
            <span class="alert-ico">!</span>
            <span><b>Control fuera de su distribución.</b> {{ bloqueo() }}</span>
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
                  @if (s.equipos?.length) {
                    <div class="table-wrap" style="margin: 8px 0;">
                      <table class="tbl">
                        <thead><tr><th>N° de inventario</th><th>Equipo</th><th>Usuario final</th><th>Verificaciones</th><th>Observación</th><th>Estado</th></tr></thead>
                        <tbody>
                          @for (e of s.equipos; track e.inventario) {
                            <tr>
                              <td class="mono">{{ e.inventario }}</td>
                              <td>{{ data.equipoDe(e.inventario)?.nombreEquipo || '—' }}</td>
                              <td>{{ data.equipoDe(e.inventario)?.usuarioFinal || '—' }}</td>
                              <td>{{ e.verificaciones.join(' · ') || '—' }}</td>
                              <td>{{ e.observacion || '—' }}</td>
                              <td><ui-badge [estado]="e.estado" /></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                  @if (s.ingresos?.length || esF0234(s.titulo)) {
                    @if (conIngresos(s).length) {
                      <div class="table-wrap" style="margin: 8px 0;">
                        <table class="tbl">
                          <thead><tr>
                            <th>N.º</th><th>Fecha</th><th>Entrada</th><th>Salida</th><th>Carné</th>
                            <th>Nombre de quien ingresa</th><th>Cargo o institución</th>
                            <th>Tipo de personal</th><th>Motivo del ingreso</th>
                          </tr></thead>
                          <tbody>
                            @for (reg of conIngresos(s); track $index; let i = $index) {
                              <tr>
                                <td>{{ i + 1 }}</td>
                                <td class="mono">{{ reg.fecha ? formatea(reg.fecha) : '—' }}</td>
                                <td class="mono">{{ reg.horaEntrada || '—' }}</td>
                                <td class="mono">{{ reg.horaSalida || '—' }}</td>
                                <td class="mono">{{ reg.carne || '—' }}</td>
                                <td>{{ reg.nombre || '—' }}</td>
                                <td>{{ reg.cargo || '—' }}</td>
                                <td>{{ reg.tipoPersonal || '—' }}</td>
                                <td>{{ reg.motivo || '—' }}</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    } @else {
                      <p class="muted">
                        Durante el periodo evaluado no se registraron ingresos al cuarto de servidores.
                      </p>
                    }
                  }
                  @if (conChecklist(s).length) {
                    <div class="table-wrap" style="margin: 8px 0;">
                      <table class="tbl">
                        <thead><tr>
                          <th>N.º</th><th>N° de inventario</th><th>Nombre del usuario</th><th>Nombre del equipo</th>
                          <th>IP</th><th>Clasificación</th><th class="col-num">Ítems incumplidos</th><th>Estado final</th>
                        </tr></thead>
                        <tbody>
                          @for (eq of conChecklist(s); track eq.inventario; let i = $index) {
                            <tr>
                              <td>{{ i + 1 }}</td>
                              <td class="mono">{{ eq.inventario }}</td>
                              <td>{{ equipoDe(eq.inventario)?.usuarioFinal || '—' }}</td>
                              <td>{{ equipoDe(eq.inventario)?.nombreEquipo || '—' }}</td>
                              <td class="mono">{{ equipoDe(eq.inventario)?.ip || '—' }}</td>
                              <td>{{ eq.clasificacion || '—' }}</td>
                              <td class="col-num">{{ data.itemsIncumplidos(eq).length }}</td>
                              <td><ui-badge [estado]="estadoFinalLectura(s.titulo, eq)" /></td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                    @for (eq of conChecklist(s); track eq.inventario) {
                      <div class="sec-title">Equipo {{ eq.inventario }} — {{ equipoDe(eq.inventario)?.nombreEquipo || 'sin nombre registrado' }}</div>
                      <div style="display: grid; gap: 4px; margin: 8px 0;">
                        @for (i of eq.items; track i.id) {
                          @if (i.cumplimiento) {
                            <div class="row-between" style="font-size: 13px; align-items: flex-start;">
                              <span style="max-width: 620px;">
                                {{ nombreItem(s.titulo, i.id) }}
                                @if (i.cumplimiento === 'No cumple') {
                                  <div class="muted" style="font-size: 12px;">
                                    {{ i.descripcion }} · Acción correctiva: {{ i.accionCorrectiva }}
                                    @if (i.fechaAccion) { ({{ formatea(i.fechaAccion) }}) }
                                    · {{ i.estadoItem }}
                                  </div>
                                }
                                @if (i.cumplimiento === 'No aplica' && i.justificacion) {
                                  <div class="muted" style="font-size: 12px;">Justificación: {{ i.justificacion }}</div>
                                }
                              </span>
                              <ui-badge [estado]="i.cumplimiento" />
                            </div>
                          }
                        }
                      </div>
                      @if (eq.observaciones) { <p class="muted" style="font-size: 12.5px;">{{ eq.observaciones }}</p> }
                    }
                  }
                  @if (conIp(s).length) {
                    <div class="table-wrap" style="margin: 8px 0;">
                      <table class="tbl">
                        <thead><tr><th>IP</th><th>N° de inventario</th><th>Equipo</th><th>Usuario final</th><th>Estado</th><th>Hora</th></tr></thead>
                        <tbody>
                          @for (e of conIp(s); track e.ip) {
                            <tr>
                              <td class="mono">{{ e.ip }}</td>
                              <td class="mono">{{ e.inventario || '—' }}</td>
                              <td>{{ e.nombreEquipo || '—' }}</td>
                              <td>{{ e.usuarioFinal || '—' }}</td>
                              <td>{{ e.estadoEquipo || '—' }}</td>
                              <td class="mono">{{ e.hora || '—' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                  @if (conTelefono(s).length) {
                    <div class="table-wrap" style="margin: 8px 0;">
                      <table class="tbl">
                        <thead><tr><th>Teléfono / Extensión</th><th>Ubicación o área</th><th>Resultado</th><th>Hora</th><th>Observaciones</th></tr></thead>
                        <tbody>
                          @for (t of conTelefono(s); track t.numero) {
                            <tr>
                              <td class="mono">{{ t.numero }}</td>
                              <td>{{ t.ubicacion || '—' }}</td>
                              <td>{{ t.resultado || '—' }}</td>
                              <td class="mono">{{ t.hora || '—' }}</td>
                              <td>{{ t.observaciones || '—' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
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
          <!-- Semanal consolidado (F0387): avance por semana y un solo documento del mes. -->
          @if (data.esSemanalConsolidado(c.codigo)) {
            <div class="card semanal" style="margin-bottom: 14px;">
              <div class="card-body">
                <div class="row-between" style="gap: 12px; flex-wrap: wrap;">
                  <div>
                    <b>Frecuencia: Semanal · Entrega: Mensual consolidada · Período: {{ nombreMes(c.mes) }} {{ c.anio }}</b>
                    <div class="muted" style="font-size: 12.5px; max-width: 620px;">
                      Se llena semana a semana y se guarda el avance; al cerrar el mes se genera
                      <b>un solo documento</b> con todas las semanas, no uno por semana.
                    </div>
                  </div>
                  <div class="semanas">
                    @for (s of semanas(); track s.semana) {
                      <span class="sem" [class.on]="s.estado !== 'Semana pendiente'">
                        <b>Semana {{ s.semana }}</b>
                        <ui-badge [estado]="s.estado" />
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Edición: stepper por secciones. -->
          <div class="card">
            <div class="card-body">
              <div class="stepper">
                @for (p of pasos(); track p.titulo + $index; let i = $index) {
                  <div class="step" [class.done]="i < paso()" [class.now]="i === paso()">
                    <span class="dot">{{ i + 1 }}</span>
                    <span class="lbl">{{ p.titulo }}</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: 14px;">
            <div class="card-head">
              <div>
                <h3>{{ pasoActual().titulo }}</h3>
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
                  <div><dt>Dirección/Unidad</dt><dd>{{ data.dirUnidad(c.direccion, c.unidad) }}</dd></div>
                  <div><dt>Código del formato</dt><dd class="mono">{{ c.codigo }} · {{ catalogo()?.version }}</dd></div>
                  <div><dt>Responsable</dt><dd>{{ auth.usuario()?.nombre }}</dd></div>
                  <div><dt>Fecha límite</dt><dd class="mono">{{ formatea(c.fechaLimite) }}</dd></div>
                  <div><dt>Entrega prevista</dt><dd>
                    @if (restan() >= 0) { Dentro del plazo }
                    @else { <span class="badge warn">Se registrará como «Entregado tarde»</span> }
                  </dd></div>
                </dl>
                @if (resumenMuestra(); as rm) {
                  <div class="sec-title" style="margin-top: 16px;">Resumen de validación de la muestra</div>
                  <dl class="dl">
                    <div><dt>Equipos seleccionados</dt><dd class="mono">{{ rm.seleccionados }}/{{ rm.pedidos }}</dd></div>
                    <div><dt>Equipos verificados por completo</dt><dd class="mono">{{ rm.verificados }}/{{ rm.pedidos }}</dd></div>
                    <div><dt>Ítems cumplidos</dt><dd class="mono">{{ rm.itemsCumplidos }}</dd></div>
                    <div><dt>Ítems incumplidos</dt><dd class="mono">{{ rm.itemsIncumplidos }}</dd></div>
                    <div><dt>Ítems No aplica</dt><dd class="mono">{{ rm.itemsNoAplica }}</dd></div>
                    <div><dt>Acciones correctivas registradas</dt><dd class="mono">{{ rm.accionesCorrectivas }}/{{ rm.itemsIncumplidos }}</dd></div>
                    <div><dt>Justificaciones registradas</dt><dd class="mono">{{ rm.justificaciones }}/{{ rm.itemsNoAplica }}</dd></div>
                    <div><dt>Observaciones generales</dt><dd>{{ rm.observaciones ? 'Completadas' : 'Pendientes' }}</dd></div>
                    <div><dt>Estado listo para entrega</dt>
                      <dd [style.color]="rm.listo ? 'var(--ok)' : 'var(--danger)'">{{ rm.listo ? 'Sí' : 'No' }}</dd>
                    </div>
                  </dl>
                  @if (rm.faltas.length) {
                    <div class="alert warn" style="margin-bottom: 14px;">
                      <span class="alert-ico">!</span>
                      <span>
                        <b>Falta completar en la muestra de equipos:</b>
                        <ul style="margin: 6px 0 0 16px;">
                          @for (f of rm.faltas; track f) { <li>{{ f }}</li> }
                        </ul>
                      </span>
                    </div>
                  }
                }
                @for (s of modelo; track s.plantilla.titulo) {
                  <div class="sec-title">{{ s.plantilla.titulo }}</div>
                  <p class="muted" style="font-size: 12.5px;">
                    @if (s.plantilla.campos?.length) { {{ camposLlenos(s) }} de {{ s.plantilla.campos?.length }} campo(s) completado(s). }
                    @if (s.plantilla.items?.length) { {{ itemsMarcados(s) }} de {{ s.plantilla.items?.length }} ítem(s) marcado(s). }
                    @if (s.plantilla.tabla) { {{ s.filas.length }} registro(s) en la tabla. }
                    @if (s.plantilla.equipos) { {{ equiposRevisados(s) }} de {{ equiposActivos().length }} equipo(s) del inventario operativo revisado(s). }
                    @if (s.plantilla.equiposIp; as pip) { {{ equiposIpLlenos(s) }} de {{ pip.cantidad }} equipo(s) verificados por IP con hora. }
                    @if (s.plantilla.telefonos; as ptel) { {{ telefonosLlenos(s) }} de {{ ptel.cantidad }} teléfono(s)/extensión(es) con hora. }
                    @if (s.plantilla.ingresos) {
                      @if (sinIngresos(s)) { Mes declarado sin ingresos al cuarto de servidores. }
                      @else { {{ ingresosLlenos(s) }} ingreso(s) registrados, {{ ingresosIncompletos(s) }} incompleto(s). }
                    }
                    @if (s.plantilla.checklistEquipos; as pchk) {
                      {{ elegidos(s) }} de {{ pchk.cantidad }} equipo(s) seleccionado(s);
                      {{ verificadosCompletos(s) }} verificado(s) por completo.
                      Ítems: {{ cuentaCumplimiento(s, 'Cumple') }} cumplen,
                      {{ cuentaCumplimiento(s, 'No cumple') }} no cumplen,
                      {{ cuentaCumplimiento(s, 'No aplica') }} no aplican;
                      {{ accionesRegistradas(s) }} acción(es) correctiva(s) registrada(s).
                    }
                  </p>
                }
              }

              @else if (seccionActual(); as s) {
                <!-- Paso 1 del F0382: datos del control programado, en solo lectura. -->
                @if (s.plantilla.datosControl) {
                  <dl class="dl">
                    <div><dt>Código del formato</dt><dd class="mono">{{ c.codigo }} · {{ catalogo()?.version }}</dd></div>
                    <div><dt>Nombre del control</dt><dd>{{ catalogo()?.nombre }}</dd></div>
                    <div><dt>Frecuencia</dt><dd>{{ data.etiquetaFrecuencia(c.codigo) }}</dd></div>
                    <div><dt>Período</dt><dd>{{ nombreMes(c.mes) }} {{ c.anio }}</dd></div>
                    <div><dt>Mes</dt><dd>{{ nombreMes(c.mes) }}</dd></div>
                    <div><dt>Año</dt><dd class="mono">{{ c.anio }}</dd></div>
                    <div><dt>Dirección</dt><dd>{{ data.nombreDireccion(c.direccion) }}</dd></div>
                    <div><dt>Unidad</dt><dd>{{ c.unidad }}</dd></div>
                    <div><dt>Técnico responsable</dt><dd>{{ c.responsable }}</dd></div>
                    <div><dt>Fecha límite</dt><dd class="mono">{{ formatea(c.fechaLimite) }}</dd></div>
                    <div><dt>Estado del control</dt><dd><ui-badge [estado]="c.estado" /></dd></div>
                    <div><dt>Equipos activos en la Dirección/Unidad</dt><dd>{{ equiposActivos().length }}</dd></div>
                  </dl>
                  <p class="muted" style="margin-top: 12px;">
                    Estos datos vienen del control programado: no se digitan aquí. Si algo no
                    corresponde, corrija la programación o la distribución de soportes.
                  </p>
                }

                <!-- Paso 2 del F0382: selección de la muestra desde el inventario operativo. -->
                <!-- Bitácora de ingresos al cuarto de servidores (F0234). -->
                @if (s.plantilla.ingresos; as ping) {
                  @if (sinIngresos(s)) {
                    <div class="alert warn" style="margin: 12px 0;">
                      <span class="alert-ico">!</span>
                      <span>
                        <b>Mes declarado sin ingresos.</b> No se piden registros, pero debe explicarlo
                        en las <b>observaciones del mes</b>; así consta por qué el control se entrega vacío.
                      </span>
                    </div>
                  } @else {
                    <div class="row-between" style="margin: 14px 0 10px;">
                      <div class="sec-title" style="margin: 0;">
                        Ingresos registrados · {{ ingresosLlenos(s) }}
                      </div>
                      <button class="btn btn-primary btn-sm" type="button" (click)="nuevoIngreso(s)">
                        <ui-icon name="plus" [size]="13" /> Agregar registro
                      </button>
                    </div>
                    @if (ingresosLlenos(s)) {
                      <div class="table-wrap">
                        <table class="tbl">
                          <thead><tr>
                            <th>N.º</th><th>Fecha</th><th>Entrada</th><th>Salida</th>
                            <th>Tipo de ingreso</th><th>Técnico de Soporte</th>
                            <th>Acompañante</th><th>Tipo de personal</th>
                            <th>Motivo del ingreso</th><th>Documento respaldo</th>
                            <th>Estado</th><th>Acciones</th>
                          </tr></thead>
                          <tbody>
                            @for (reg of s.ingresos; track $index; let i = $index) {
                              @if (!data.ingresoVacio(reg)) {
                                <tr>
                                  <td>{{ i + 1 }}</td>
                                  <td class="mono">{{ reg.fecha ? formatea(reg.fecha) : '—' }}</td>
                                  <td class="mono">{{ reg.horaEntrada || '—' }}</td>
                                  <td class="mono">{{ reg.horaSalida || '—' }}</td>
                                  <td>{{ reg.tipoIngreso || '—' }}</td>
                                  <td>{{ reg.nombre || '—' }}</td>
                                  <td>
                                    @if (data.conAcompanante(reg)) { {{ reg.acompanante || '—' }} }
                                    @else { <span class="muted">No aplica</span> }
                                  </td>
                                  <td>
                                    @if (data.conAcompanante(reg)) { {{ reg.tipoPersonalAcompanante || '—' }} }
                                    @else { <span class="muted">No aplica</span> }
                                  </td>
                                  <td style="max-width: 220px;">{{ reg.motivo || '—' }}</td>
                                  <td>
                                    @if (data.anexaRespaldo(reg)) {
                                      @if (reg.documentoImagen) { Sí }
                                      @else { <span class="badge warn">Sí · falta la imagen</span> }
                                    } @else { No }
                                  </td>
                                  <td>
                                    <ui-badge [estado]="data.faltasIngreso(reg).length ? 'Incompleto' : 'Completo'" />
                                  </td>
                                  <td style="white-space: nowrap;">
                                    <button class="btn btn-ghost btn-sm" type="button" (click)="verIngreso.set(i)">Ver detalle</button>
                                    <button class="btn btn-ghost btn-sm" type="button" (click)="editarIngreso(i)">Editar</button>
                                    <button class="btn btn-ghost btn-sm" type="button" (click)="eliminarIngreso(s, i)">Eliminar</button>
                                  </td>
                                </tr>
                              }
                            }
                          </tbody>
                        </table>
                      </div>
                      @if (ingresosIncompletos(s)) {
                        <div class="alert warn" style="margin-top: 12px;">
                          <span class="alert-ico">!</span>
                          <span>
                            Hay {{ ingresosIncompletos(s) }} registro(s) incompletos.
                            Complete o elimine los registros incompletos antes de entregar el control.
                          </span>
                        </div>
                      }
                    } @else {
                      <p class="muted">
                        Todavía no hay ingresos registrados. Use <b>Agregar registro</b> por cada visita
                        al cuarto de servidores, o declare arriba que el mes no tuvo ingresos.
                      </p>
                    }
                  }
                }

                @if (s.plantilla.checklistEquipos; as pchk) {
                  @if (esMuestra()) {
                    <div class="alert" style="margin-bottom: 12px;">
                      <span class="alert-ico">i</span>
                      <span>
                        El formato exige <b>{{ pchk.cantidad }} equipos</b>. Elíjalos del
                        <b>inventario operativo</b> de {{ data.dirUnidad(c.direccion, c.unidad) }}:
                        {{ equiposActivos().length }} equipo(s) activo(s) disponibles.
                        @if (pchk.ayuda) { {{ pchk.ayuda }} }
                      </span>
                    </div>
                    @for (eq of s.checklistEquipos; track $index; let i = $index) {
                      <div class="slot" [class.on]="!!eq.inventario">
                        <div class="slot-cab">
                          <div>
                            <div class="slot-num">Equipo {{ i + 1 }} de {{ pchk.cantidad }}</div>
                            @if (equipoDe(eq.inventario); as info) {
                              <b>{{ info.nombreEquipo || info.tipo }}</b>
                              <span class="mono muted"> · {{ info.inventario }}</span>
                            } @else {
                              <span class="muted">Sin equipo seleccionado</span>
                            }
                          </div>
                          <div class="row">
                            <button class="btn btn-outline btn-sm" type="button" (click)="abrirSelector(i)">
                              <ui-icon name="search" [size]="13" />
                              {{ eq.inventario ? 'Cambiar equipo' : 'Seleccionar desde inventario' }}
                            </button>
                            @if (eq.inventario) {
                              <button class="btn btn-ghost btn-sm" type="button" (click)="quitarEquipo(s, i)">Quitar equipo</button>
                            }
                          </div>
                        </div>
                        @if (equipoDe(eq.inventario); as info) {
                          <div class="eq-elegido">
                            <div class="d"><dt>N° de inventario</dt><dd class="mono">{{ info.inventario }}</dd></div>
                            <div class="d"><dt>Nombre del usuario</dt><dd>{{ info.usuarioFinal || sinDato }}</dd></div>
                            <div class="d"><dt>Nombre del equipo</dt><dd>{{ info.nombreEquipo || sinDato }}</dd></div>
                            <div class="d"><dt>Tipo de equipo</dt><dd>{{ info.tipo }}</dd></div>
                            <div class="d"><dt>Marca</dt><dd>{{ info.marca || sinDato }}</dd></div>
                            <div class="d"><dt>Modelo</dt><dd>{{ info.modelo || sinDato }}</dd></div>
                            <div class="d"><dt>Serie</dt><dd class="mono">{{ info.serie || sinDato }}</dd></div>
                            <div class="d"><dt>IP</dt><dd class="mono">{{ info.ip || sinDato }}</dd></div>
                            <div class="d"><dt>Dirección</dt><dd>{{ data.nombreDireccion(info.direccion) }}</dd></div>
                            <div class="d"><dt>Unidad</dt><dd>{{ info.unidad }}</dd></div>
                            <div class="d"><dt>Estado operativo</dt><dd>{{ info.estado }}</dd></div>
                          </div>
                          <div class="field" style="margin-top: 12px; max-width: 460px;">
                            <label [for]="'clas-' + i">
                              Clasificación en el formato <span style="color: var(--danger)">*</span>
                              <ui-help texto="El formato agrupa sus ítems: cinco aplican a equipos de usuario interno, tres a los de consulta al público y uno a ambos." />
                            </label>
                            <select [id]="'clas-' + i" class="control" [(ngModel)]="eq.clasificacion">
                              <option value="">Seleccione…</option>
                              @for (o of pchk.clasificaciones; track o) { <option [value]="o">{{ o }}</option> }
                            </select>
                          </div>
                        }
                      </div>
                    }
                  }

                  <!-- Paso 3 del F0382: verificación de los ítems, equipo por equipo. -->
                  @if (esVerificacion()) {
                    <div class="avance-eq">
                      @for (eq of s.checklistEquipos; track $index; let i = $index) {
                        <span class="a" [class.ok]="eq.inventario && verificados(s, i) === aplicables(s, i)">
                          <b>Equipo {{ i + 1 }}</b>:
                          @if (!eq.inventario) { sin seleccionar }
                          @else if (!eq.clasificacion) { falta clasificar }
                          @else { {{ verificados(s, i) }} de {{ aplicables(s, i) }} ítems verificados }
                        </span>
                      }
                    </div>
                    <div class="table-wrap">
                      <table class="tbl">
                        <thead><tr>
                          <th>N.º</th><th>N° de inventario</th><th>Nombre del usuario</th><th>Nombre del equipo</th>
                          <th>IP</th><th>Tipo</th><th class="col-num">Ítems incumplidos</th>
                          <th>Acción correctiva</th><th>Estado final</th><th>Acciones</th>
                        </tr></thead>
                        <tbody>
                          @for (eq of s.checklistEquipos; track $index; let i = $index) {
                            <tr>
                              <td>{{ i + 1 }}</td>
                              @if (equipoDe(eq.inventario); as info) {
                                <td class="mono">{{ info.inventario }}</td>
                                <td>{{ info.usuarioFinal || sinDato }}</td>
                                <td>{{ info.nombreEquipo || sinDato }}</td>
                                <td class="mono">{{ info.ip || sinDato }}</td>
                                <td>{{ info.tipo }}</td>
                                <td class="col-num" [class.mal]="incumplidos(s, i) > 0">{{ incumplidos(s, i) }}</td>
                                <td style="max-width: 220px;">{{ accionesDe(s, i) || '—' }}</td>
                                <td><ui-badge [estado]="estadoFinal(s, i)" /></td>
                                <td style="white-space: nowrap;">
                                  <button class="btn btn-primary btn-sm" type="button" (click)="verificar(i)">Verificar ítems</button>
                                  <button class="btn btn-ghost btn-sm" type="button" (click)="detalleEquipo.set(eq.inventario)">Ver detalle</button>
                                  <button class="btn btn-ghost btn-sm" type="button" (click)="abrirSelector(i)">Cambiar equipo</button>
                                  <button class="btn btn-ghost btn-sm" type="button" (click)="quitarEquipo(s, i)">Quitar equipo</button>
                                </td>
                              } @else {
                                <td colspan="8" class="muted">Sin equipo seleccionado.</td>
                                <td><button class="btn btn-outline btn-sm" type="button" (click)="abrirSelector(i)">Seleccionar</button></td>
                              }
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  }
                }

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

                @if (s.plantilla.equipos; as pe) {
                  <div class="alert" style="margin-bottom: 12px;">
                    <span class="alert-ico">i</span>
                    <span>
                      Estos son los <b>{{ equiposActivos().length }} equipo(s) activo(s)</b> de
                      {{ data.dirUnidad(c.direccion, c.unidad) }} según el inventario operativo.
                      No aparecen equipos de otras Direcciones/Unidades: el inventario proviene de las entregas
                      aceptadas en Gestión de Equipos.
                      @if (pe.minimo === 0) { Deben revisarse todos. }
                      @else { Debe revisarse al menos {{ pe.minimo }}. }
                    </span>
                  </div>
                  <div class="row-between" style="margin-bottom: 10px;">
                    <span class="muted">{{ equiposRevisados(s) }} de {{ equiposActivos().length }} equipo(s) marcado(s)</span>
                    <button class="btn btn-outline btn-sm" type="button" (click)="todosLosEquipos(s)">Marcar todos como revisados</button>
                  </div>
                  @for (eq of equiposActivos(); track eq.inventario) {
                    <div class="eq-card" [class.on]="s.equipos[eq.inventario].incluido">
                      <div class="row-between" style="gap: 12px; align-items: flex-start;">
                        <label class="eq-check">
                          <input type="checkbox" [checked]="s.equipos[eq.inventario].incluido" (change)="alterna(s, eq.inventario)" />
                          <span>
                            <b>{{ eq.nombreEquipo || eq.tipo }}</b>
                            <span class="mono muted"> · {{ eq.inventario }}</span>
                            <div class="muted" style="font-size: 12px;">
                              {{ eq.tipo }} {{ eq.marca }} {{ eq.modelo }} · usuario final: {{ eq.usuarioFinal }} ·
                              estado operativo: {{ eq.estado }}
                            </div>
                          </span>
                        </label>
                        <select class="control" style="width: 200px;" [(ngModel)]="s.equipos[eq.inventario].estado"
                          [disabled]="!s.equipos[eq.inventario].incluido">
                          <option value="">Estado…</option>
                          @for (op of pe.estados; track op) { <option [value]="op">{{ op }}</option> }
                        </select>
                      </div>
                      @if (s.equipos[eq.inventario].incluido) {
                        <div class="eq-verif">
                          @for (v of pe.verificaciones; track v) {
                            <button type="button" class="chip-check"
                              [class.on]="s.equipos[eq.inventario].verificaciones.includes(v)"
                              (click)="alternaVerificacion(s, eq.inventario, v)">
                              @if (s.equipos[eq.inventario].verificaciones.includes(v)) { <ui-icon name="check" [size]="11" /> }
                              {{ v }}
                            </button>
                          }
                        </div>
                        <input class="control" style="margin-top: 8px;" placeholder="Observación del equipo (opcional)…"
                          [(ngModel)]="s.equipos[eq.inventario].observacion" />
                      }
                    </div>
                  } @empty {
                    <p class="muted">
                      Esta Dirección/Unidad no tiene equipos activos en el inventario operativo. Los equipos entran
                      cuando el Usuario Final acepta la entrega en Gestión de Equipos.
                    </p>
                  }
                }

                @if (s.plantilla.equiposIp; as pip) {
                  <div class="sec-title">Equipos revisados por IP</div>
                  <div class="alert" style="margin-bottom: 12px;">
                    <span class="alert-ico">i</span>
                    <span>
                      Digite la IP de <b>{{ pip.cantidad }} equipos distintos</b>. La IP se busca en el
                      <b>inventario operativo</b> de {{ data.dirUnidad(c.direccion, c.unidad) }}, que proviene de las
                      entregas aceptadas en Gestión de Equipos: no se admite una IP de otra Dirección/Unidad.
                      @if (pip.ayuda) { {{ pip.ayuda }} }
                      @if (ipsDisponibles().length) {
                        Hay {{ ipsDisponibles().length }} equipo(s) activo(s) con IP registrada.
                      } @else {
                        <b>Esta Dirección/Unidad no tiene equipos con IP registrada en el inventario operativo.</b>
                      }
                    </span>
                  </div>
                  <datalist [id]="'ips-' + paso()">
                    @for (eq of ipsDisponibles(); track eq.ciclo) { <option [value]="eq.ip"></option> }
                  </datalist>
                  @for (e of s.equiposIp; track $index; let i = $index) {
                    <div class="eq-card" [class.on]="!!equipoDeIp(e.ip)">
                      <div class="ip-fila">
                        <div class="field">
                          <label [for]="'ip-' + paso() + '-' + i">Equipo {{ i + 1 }} — IP <span style="color: var(--danger)">*</span></label>
                          <input [id]="'ip-' + paso() + '-' + i" class="control mono" [attr.list]="'ips-' + paso()"
                            placeholder="192.168.10.25" [(ngModel)]="e.ip" />
                        </div>
                        <div class="field">
                          <label [for]="'ip-hora-' + paso() + '-' + i">Hora de verificación <span style="color: var(--danger)">*</span></label>
                          <input [id]="'ip-hora-' + paso() + '-' + i" class="control" type="time" [(ngModel)]="e.hora" />
                        </div>
                      </div>
                      @if (errorIp(s, i); as err) {
                        <div class="alert danger" style="margin-top: 9px;">
                          <span class="alert-ico">!</span><span>{{ err }}</span>
                        </div>
                      } @else if (equipoDeIp(e.ip); as eq) {
                        <!-- Autocompletado: los datos NO se teclean, salen del inventario operativo. -->
                        <dl class="dl ip-datos">
                          <div><dt>N° de inventario</dt><dd class="mono">{{ eq.inventario }}</dd></div>
                          <div><dt>Equipo</dt><dd>{{ eq.nombreEquipo || eq.tipo }}</dd></div>
                          <div><dt>Tipo, marca y modelo</dt><dd>{{ eq.tipo }} {{ eq.marca }} {{ eq.modelo }}</dd></div>
                          <div><dt>Usuario final</dt><dd>{{ eq.usuarioFinal }}</dd></div>
                          <div><dt>Dirección/Unidad</dt><dd>{{ data.dirUnidad(eq.direccion, eq.unidad) }}</dd></div>
                          <div><dt>Estado operativo</dt><dd>{{ eq.estado }}</dd></div>
                        </dl>
                      }
                    </div>
                  }
                }

                @if (s.plantilla.telefonos; as ptel) {
                  <div class="sec-title">Teléfonos y extensiones revisados</div>
                  <div class="alert" style="margin-bottom: 12px;">
                    <span class="alert-ico">i</span>
                    <span>
                      Registre <b>{{ ptel.cantidad }} teléfonos o extensiones</b> con su ubicación, el resultado de la
                      verificación y la <b>hora</b> de cada uno.
                      @if (ptel.ayuda) { {{ ptel.ayuda }} }
                    </span>
                  </div>
                  @for (t of s.telefonos; track $index; let i = $index) {
                    <div class="eq-card" [class.on]="!!t.numero.trim()">
                      <div class="tel-fila">
                        <div class="field">
                          <label [for]="'tel-' + paso() + '-' + i">Teléfono / Extensión {{ i + 1 }} <span style="color: var(--danger)">*</span></label>
                          <input [id]="'tel-' + paso() + '-' + i" class="control mono" placeholder="Ext. 3428" [(ngModel)]="t.numero" />
                        </div>
                        <div class="field">
                          <label [for]="'tel-ub-' + paso() + '-' + i">Ubicación o área</label>
                          <input [id]="'tel-ub-' + paso() + '-' + i" class="control" [(ngModel)]="t.ubicacion" />
                        </div>
                        <div class="field">
                          <label [for]="'tel-res-' + paso() + '-' + i">Resultado <span style="color: var(--danger)">*</span></label>
                          <select [id]="'tel-res-' + paso() + '-' + i" class="control" [(ngModel)]="t.resultado">
                            <option value="">Seleccione…</option>
                            @for (o of ptel.resultados; track o) { <option [value]="o">{{ o }}</option> }
                          </select>
                        </div>
                        <div class="field">
                          <label [for]="'tel-hora-' + paso() + '-' + i">Hora de verificación <span style="color: var(--danger)">*</span></label>
                          <input [id]="'tel-hora-' + paso() + '-' + i" class="control" type="time" [(ngModel)]="t.hora" />
                        </div>
                      </div>
                      <input class="control" style="margin-top: 8px;" placeholder="Observaciones (opcional)…"
                        [(ngModel)]="t.observaciones" />
                    </div>
                  }
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

        <!-- Alta y edición de un ingreso al cuarto de servidores (F0234) -->
        @if (editaIngreso() >= 0 && seccionIngresos(); as si) {
          @if (borrador; as reg) {
            <ui-modal [titulo]="editaIngreso() < si.ingresos.length ? 'Editar registro de ingreso' : 'Nuevo registro de ingreso'"
              [sub]="data.dirUnidad(c.direccion, c.unidad) + ' · ' + nombreMes(c.mes) + ' ' + c.anio"
              (cerrar)="cancelarIngreso()">
              <!-- De esto depende el resto del formulario: no siempre hay acompañante. -->
              <div class="field" style="margin-bottom: 14px;">
                <label>Tipo de ingreso <span style="color: var(--danger)">*</span></label>
                <div id="in-tipo-ingreso" style="display: grid; gap: 5px;">
                  @for (t of si.plantilla.ingresos?.tiposIngreso ?? []; track t) {
                    <label class="eq-check">
                      <input type="radio" name="tipoIngreso" [value]="t"
                        [checked]="reg.tipoIngreso === t" (change)="cambiarTipoIngreso(reg, t)" />
                      <span>{{ t }}</span>
                    </label>
                  }
                </div>
                <p class="muted" style="font-size: 12px; margin: 6px 0 0;">
                  <b>Individual</b>: entra solo el Técnico de Soporte.
                  <b>Con acompañante</b>: además se registran los datos de quien lo acompaña.
                </p>
              </div>

              <div class="form-grid">
                <div class="field">
                  <label for="in-fecha">Fecha <span style="color: var(--danger)">*</span></label>
                  <input id="in-fecha" class="control" type="date" [(ngModel)]="reg.fecha" />
                </div>
                <div class="field">
                  <label for="in-motivo">Motivo del ingreso <span style="color: var(--danger)">*</span></label>
                  <select id="in-motivo" class="control" [(ngModel)]="reg.motivo">
                    <option value="">Seleccione…</option>
                    @for (m of si.plantilla.ingresos?.motivos ?? []; track m) { <option [value]="m">{{ m }}</option> }
                  </select>
                </div>
                <div class="field">
                  <label for="in-entrada">Hora de entrada <span style="color: var(--danger)">*</span></label>
                  <input id="in-entrada" class="control" type="time" [(ngModel)]="reg.horaEntrada" />
                </div>
                <div class="field">
                  <label for="in-salida">Hora de salida <span style="color: var(--danger)">*</span></label>
                  <input id="in-salida" class="control" type="time" [(ngModel)]="reg.horaSalida" />
                </div>
                <div class="field span-2 sec-title" style="margin: 6px 0 0;">Técnico de Soporte que ingresa</div>
                <div class="field">
                  <label for="in-nombre">
                    Técnico de Soporte que ingresa <span style="color: var(--danger)">*</span>
                  </label>
                  <input id="in-nombre" class="control" [(ngModel)]="reg.nombre" />
                  <p class="muted" style="font-size: 12px; margin: 4px 0 0;">
                    Rol: {{ auth.usuario()?.rol }}. Viene del usuario que completa el control; puede corregirlo.
                  </p>
                </div>
                <div class="field">
                  <label for="in-carne">Carné</label>
                  <input id="in-carne" class="control mono" [(ngModel)]="reg.carne" />
                </div>
                <div class="field">
                  <label for="in-cargo">Cargo</label>
                  <input id="in-cargo" class="control" [(ngModel)]="reg.cargo" />
                </div>
                <div class="field">
                  <label for="in-tipo">Tipo de personal</label>
                  <select id="in-tipo" class="control" [(ngModel)]="reg.tipoPersonal">
                    <option value="">Seleccione…</option>
                    @for (t of si.plantilla.ingresos?.tiposPersonal ?? []; track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                </div>
                <!-- Los datos del acompañante solo existen cuando el ingreso los tiene. -->
                @if (data.conAcompanante(reg)) {
                  <div class="field span-2 sec-title" style="margin: 6px 0 0;">Acompañante o visita</div>
                  <div class="field">
                    <label for="in-acomp">
                      Nombre del acompañante <span style="color: var(--danger)">*</span>
                    </label>
                    <input id="in-acomp" class="control" [(ngModel)]="reg.acompanante" />
                  </div>
                  <div class="field">
                    <label for="in-carne-acomp">Carné del acompañante</label>
                    <input id="in-carne-acomp" class="control mono" [(ngModel)]="reg.carneAcompanante" />
                  </div>
                  <div class="field span-2">
                    <label for="in-cargo-acomp">
                      Cargo o institución del acompañante <span style="color: var(--danger)">*</span>
                    </label>
                    <input id="in-cargo-acomp" class="control" [(ngModel)]="reg.cargoAcompanante" />
                  </div>
                  <div class="field span-2">
                    <label>
                      Tipo de personal del acompañante <span style="color: var(--danger)">*</span>
                    </label>
                    <div id="in-tipo-acomp" style="display: grid; gap: 5px;">
                      @for (t of si.plantilla.ingresos?.tiposPersonal ?? []; track t) {
                        <label class="eq-check">
                          <input type="radio" name="tipoAcompanante" [value]="t"
                            [checked]="reg.tipoPersonalAcompanante === t"
                            (change)="reg.tipoPersonalAcompanante = t" />
                          <span>{{ t }}</span>
                        </label>
                      }
                    </div>
                  </div>
                } @else if (reg.tipoIngreso) {
                  <div class="field span-2">
                    <p class="muted" style="margin: 0;">
                      <b>Ingreso individual.</b> No se piden datos de acompañante y no se exigen para entregar el control.
                    </p>
                  </div>
                }
                <!-- Documento de respaldo: si se declara, la imagen es obligatoria. -->
                <div class="field span-2">
                  <label>¿Anexa documento de respaldo?</label>
                  <div class="respaldo">
                    <label class="eq-check">
                      <input id="in-anexo" type="checkbox" [checked]="data.anexaRespaldo(reg)"
                        (change)="marcarRespaldo(reg, $event)" />
                      <span>Sí, se anexa documento de respaldo</span>
                    </label>
                    @if (data.anexaRespaldo(reg)) {
                      <div class="field">
                        <label for="in-respaldo">
                          Documento de respaldo <span style="color: var(--danger)">*</span>
                        </label>
                        <input id="in-respaldo" class="control" type="file"
                          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                          (change)="respaldoElegido(reg, $event)" />
                        <p class="muted" style="font-size: 12px; margin: 4px 0 0;">
                          Solo imágenes PNG, JPG, JPEG o WEBP. La imagen sale impresa en el documento del control.
                        </p>
                      </div>
                      @if (reg.documentoImagen) {
                        <div class="row" style="align-items: flex-start; gap: 12px;">
                          <img [src]="reg.documentoImagen" alt="Documento de respaldo" />
                          <div>
                            <div class="mono" style="font-size: 12px;">{{ reg.documentoNombre }}</div>
                            <button class="btn btn-ghost btn-sm" type="button" (click)="quitarRespaldo(reg)">
                              Quitar imagen
                            </button>
                          </div>
                        </div>
                      }
                    }
                  </div>
                </div>
                <div class="field span-2">
                  <label for="in-obs">Observación del registro</label>
                  <textarea id="in-obs" class="control" rows="2" [(ngModel)]="reg.observacion"></textarea>
                </div>
              </div>
              @if (faltasBorrador().length) {
                <div class="alert warn" style="margin-top: 14px;">
                  <span class="alert-ico">!</span>
                  <span>
                    <b>Falta completar:</b>
                    <ul style="margin: 6px 0 0 16px;">
                      @for (f of faltasBorrador(); track f) { <li>{{ f }}</li> }
                    </ul>
                  </span>
                </div>
              }
              <div class="row" style="justify-content: flex-end; margin-top: 16px;">
                <button class="btn btn-outline" type="button" (click)="cancelarIngreso()">Cancelar</button>
                <button class="btn btn-primary" type="button" (click)="guardarIngreso(si)">Guardar registro</button>
              </div>
            </ui-modal>
          }
        }

        <!-- Detalle de un ingreso ya registrado -->
        @if (verIngreso() >= 0 && seccionIngresos(); as si) {
          @if (si.ingresos[verIngreso()]; as reg) {
            <ui-modal titulo="Registro de ingreso"
              [sub]="(reg.fecha ? formatea(reg.fecha) : 'Sin fecha') + ' · ' + (reg.nombre || 'sin nombre')"
              (cerrar)="verIngreso.set(-1)">
              <dl class="dl">
                <div><dt>Tipo de ingreso</dt><dd>{{ reg.tipoIngreso || '—' }}</dd></div>
                <div><dt>Fecha</dt><dd class="mono">{{ reg.fecha ? formatea(reg.fecha) : '—' }}</dd></div>
                <div><dt>Hora de entrada</dt><dd class="mono">{{ reg.horaEntrada || '—' }}</dd></div>
                <div><dt>Hora de salida</dt><dd class="mono">{{ reg.horaSalida || '—' }}</dd></div>
                <div><dt>Técnico de Soporte que ingresa</dt><dd>{{ reg.nombre || '—' }}</dd></div>
                <div><dt>Carné</dt><dd class="mono">{{ reg.carne || '—' }}</dd></div>
                <div><dt>Cargo</dt><dd>{{ reg.cargo || '—' }}</dd></div>
                <div><dt>Tipo de personal</dt><dd>{{ reg.tipoPersonal || '—' }}</dd></div>
                @if (data.conAcompanante(reg)) {
                  <div><dt>Acompañante o visita</dt><dd>{{ reg.acompanante || '—' }}</dd></div>
                  <div><dt>Carné del acompañante</dt><dd class="mono">{{ reg.carneAcompanante || '—' }}</dd></div>
                  <div><dt>Cargo o institución del acompañante</dt><dd>{{ reg.cargoAcompanante || '—' }}</dd></div>
                  <div><dt>Tipo de personal del acompañante</dt><dd>{{ reg.tipoPersonalAcompanante || '—' }}</dd></div>
                } @else {
                  <div><dt>Acompañante o visita</dt><dd>No aplica</dd></div>
                }
                <div><dt>Anexa documento</dt><dd>{{ reg.anexaDocumento || '—' }}</dd></div>
                <div><dt>Motivo del ingreso</dt><dd>{{ reg.motivo || '—' }}</dd></div>
                <div><dt>Observación</dt><dd>{{ reg.observacion || '—' }}</dd></div>
              </dl>
              @if (data.anexaRespaldo(reg)) {
                <div class="sec-title" style="margin-top: 14px;">Documento de respaldo</div>
                @if (reg.documentoImagen) {
                  <div class="row" style="align-items: flex-start; gap: 12px;">
                    <img [src]="reg.documentoImagen" alt="Documento de respaldo" />
                    <div class="mono" style="font-size: 12px;">{{ reg.documentoNombre }}</div>
                  </div>
                } @else {
                  <p class="muted">Se declaró documento de respaldo, pero la imagen no está cargada.</p>
                }
              }
              @if (data.faltasIngreso(reg).length) {
                <div class="alert warn" style="margin-top: 12px;">
                  <span class="alert-ico">!</span>
                  <span>Este registro está incompleto: {{ data.faltasIngreso(reg).join(' ') }}</span>
                </div>
              }
            </ui-modal>
          }
        }

        <!-- Selector de equipos del inventario operativo (F0382) -->
        @if (slotEquipo() >= 0 && seccionMuestra(); as sm) {
          <ui-modal titulo="Seleccionar equipo desde inventario"
            [sub]="'Equipos activos de ' + data.dirUnidad(c.direccion, c.unidad)"
            (cerrar)="slotEquipo.set(-1)">
            <div class="field">
              <label for="busca-eq">Buscar equipo</label>
              <input id="busca-eq" class="control" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)"
                placeholder="Número de inventario, nombre del equipo, usuario final, IP, tipo, marca, modelo o unidad…" />
              <span class="hint">
                Solo se listan equipos activos de esta Dirección/Unidad: el inventario operativo proviene
                de las entregas aceptadas en Gestión de Equipos.
              </span>
            </div>
            <div class="buscador-eq" style="margin-top: 12px;">
              @for (eq of equiposBuscados(); track eq.ciclo) {
                <div class="fila-eq">
                  <div>
                    <b>{{ eq.nombreEquipo || eq.tipo }}</b>
                    <span class="mono muted"> · {{ eq.inventario }}</span>
                    <div class="muted" style="font-size: 12px;">
                      {{ eq.tipo }} {{ eq.marca }} {{ eq.modelo }} · {{ eq.usuarioFinal }}
                      @if (eq.ip) { · IP <span class="mono">{{ eq.ip }}</span> }
                      · {{ eq.unidad }} · {{ eq.estado }}
                    </div>
                  </div>
                  @if (yaElegido(sm, eq.inventario) && !esDelSlot(sm, eq.inventario)) {
                    <span class="badge warn" [title]="data.MSG_EQUIPO_REPETIDO">Ya seleccionado</span>
                  } @else {
                    <button class="btn btn-primary btn-sm" type="button" (click)="elegirEquipo(sm, eq.inventario)">
                      Seleccionar
                    </button>
                  }
                </div>
              } @empty {
                <p class="muted">
                  Ningún equipo activo de esta Dirección/Unidad coincide con la búsqueda.
                </p>
              }
            </div>
          </ui-modal>
        }

        <!-- Verificación de ítems de un equipo (F0382) -->
        @if (slotVerificar() >= 0 && seccionMuestra(); as sm) {
          @if (sm.checklistEquipos[slotVerificar()]; as eq) {
            <ui-modal [titulo]="'Verificación de ítems · equipo ' + (slotVerificar() + 1)"
              [sub]="(equipoDe(eq.inventario)?.nombreEquipo || 'Sin equipo') + ' · ' + (eq.inventario || '—')"
              (cerrar)="slotVerificar.set(-1)">
              @if (!eq.inventario) {
                <p class="muted">Seleccione primero un equipo del inventario operativo.</p>
              } @else if (!eq.clasificacion) {
                <div class="alert warn">
                  <span class="alert-ico">!</span>
                  <span>Indique la clasificación del equipo en el paso anterior: de ella dependen los ítems que aplican.</span>
                </div>
              } @else {
                <dl class="dl" style="margin-bottom: 14px;">
                  <div><dt>Inventario</dt><dd class="mono">{{ eq.inventario }}</dd></div>
                  <div><dt>Usuario</dt><dd>{{ equipoDe(eq.inventario)?.usuarioFinal || sinDato }}</dd></div>
                  <div><dt>Nombre del equipo</dt><dd>{{ equipoDe(eq.inventario)?.nombreEquipo || sinDato }}</dd></div>
                  <div><dt>IP</dt><dd class="mono">{{ equipoDe(eq.inventario)?.ip || sinDato }}</dd></div>
                  <div><dt>Dirección/Unidad</dt><dd>{{ data.dirUnidad(c.direccion, c.unidad) }}</dd></div>
                  <div><dt>Clasificación</dt><dd>{{ eq.clasificacion }}</dd></div>
                </dl>
                @for (item of itemsDelEquipo(sm, slotVerificar()); track item.id) {
                  @if (respuestaItem(eq, item.id); as ri) {
                    <div class="item-seg" [class.mal]="ri.cumplimiento === 'No cumple'" [class.na]="ri.cumplimiento === 'No aplica'">
                      <div class="item-seg-cab">
                        <div>
                          <div>{{ item.nombre }}</div>
                          <div class="grupo">{{ item.grupo }}</div>
                        </div>
                        <span class="opciones">
                          @for (op of sm.plantilla.checklistEquipos?.cumplimiento ?? []; track op) {
                            <button type="button" [class.on]="ri.cumplimiento === op" (click)="marcaItem(ri, op)">{{ op }}</button>
                          }
                        </span>
                      </div>
                      @if (ri.cumplimiento === 'No cumple') {
                        <div class="form-grid" style="margin-top: 10px;">
                          <div class="field span-2">
                            <label [for]="'desc-' + item.id">Descripción del incumplimiento <span style="color: var(--danger)">*</span></label>
                            <textarea [id]="'desc-' + item.id" class="control" rows="2" [(ngModel)]="ri.descripcion"></textarea>
                          </div>
                          <div class="field span-2">
                            <label [for]="'ac-' + item.id">Acción correctiva <span style="color: var(--danger)">*</span></label>
                            <textarea [id]="'ac-' + item.id" class="control" rows="2" [(ngModel)]="ri.accionCorrectiva"></textarea>
                          </div>
                          <div class="field">
                            <label [for]="'est-' + item.id">Estado final <span style="color: var(--danger)">*</span></label>
                            <select [id]="'est-' + item.id" class="control" [(ngModel)]="ri.estadoItem">
                              <option value="">Seleccione…</option>
                              @for (o of sm.plantilla.checklistEquipos?.estadosItem ?? []; track o) { <option [value]="o">{{ o }}</option> }
                            </select>
                          </div>
                          <div class="field">
                            <label [for]="'fec-' + item.id">Fecha de la acción correctiva</label>
                            <input [id]="'fec-' + item.id" class="control" type="date" [(ngModel)]="ri.fechaAccion" />
                          </div>
                        </div>
                      }
                      @if (ri.cumplimiento === 'No aplica') {
                        <div class="field" style="margin-top: 10px;">
                          <label [for]="'jus-' + item.id">Justificación <span style="color: var(--danger)">*</span></label>
                          <textarea [id]="'jus-' + item.id" class="control" rows="2" [(ngModel)]="ri.justificacion"
                            placeholder="Debe justificar por qué este ítem no aplica para el equipo seleccionado."></textarea>
                        </div>
                      }
                    </div>
                  }
                }
                <div class="field" style="margin-top: 12px;">
                  <label for="obs-eq">Observaciones del equipo</label>
                  <textarea id="obs-eq" class="control" rows="2" [(ngModel)]="eq.observaciones"></textarea>
                </div>
              }
              <div class="row" style="justify-content: space-between; margin-top: 16px;">
                <span class="muted">
                  Estado final del equipo: <b>{{ estadoFinal(sm, slotVerificar()) }}</b>
                </span>
                <button class="btn btn-primary" type="button" (click)="cerrarVerificacion()">Guardar verificación</button>
              </div>
            </ui-modal>
          }
        }

        <!-- Ficha del equipo, tal como está en el inventario operativo -->
        @if (detalleEquipo(); as inv) {
          @if (equipoDe(inv); as info) {
            <ui-modal [titulo]="info.nombreEquipo || info.tipo"
              [sub]="'Ficha del inventario operativo · ' + info.inventario" (cerrar)="detalleEquipo.set('')">
              <dl class="dl">
                <div><dt>N° de inventario</dt><dd class="mono">{{ info.inventario }}</dd></div>
                <div><dt>Nombre del usuario</dt><dd>{{ info.usuarioFinal || sinDato }}</dd></div>
                <div><dt>Nombre del equipo</dt><dd>{{ info.nombreEquipo || sinDato }}</dd></div>
                <div><dt>Tipo de equipo</dt><dd>{{ info.tipo }}</dd></div>
                <div><dt>Marca y modelo</dt><dd>{{ info.marca }} {{ info.modelo }}</dd></div>
                <div><dt>Serie</dt><dd class="mono">{{ info.serie || sinDato }}</dd></div>
                <div><dt>IP</dt><dd class="mono">{{ info.ip || sinDato }}</dd></div>
                <div><dt>MAC</dt><dd class="mono">{{ info.mac || sinDato }}</dd></div>
                <div><dt>Dirección</dt><dd>{{ data.nombreDireccion(info.direccion) }}</dd></div>
                <div><dt>Unidad</dt><dd>{{ info.unidad }}</dd></div>
                <div><dt>Estado operativo</dt><dd><ui-badge [estado]="info.estado" /></dd></div>
                <div><dt>Soporte responsable</dt><dd>{{ info.soporteResponsable || sinDato }}</dd></div>
                <div><dt>Expediente único</dt><dd class="mono">{{ info.expedienteUnico || sinDato }}</dd></div>
                <div><dt>Fecha de aceptación</dt><dd class="mono">{{ formatea(info.fechaAceptacion) }}</dd></div>
              </dl>
              <p class="muted" style="margin-top: 12px;">
                Datos tomados del inventario operativo, alimentado por las entregas aceptadas en
                SISGOST — Gestión de Equipos. No se editan desde el control.
              </p>
            </ui-modal>
          }
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
  /**
   * La aplicación no usa zonas: lo que cambia dentro de una promesa —la lectura de la imagen del
   * respaldo— no repinta solo. Este es el único punto del formulario que lo necesita.
   */
  private readonly cd = inject(ChangeDetectorRef);

  /** Id del control, enlazado desde la ruta. */
  readonly id = input.required<string>();

  protected readonly control = computed(() => this.data.controlPorId(this.id()));
  protected readonly catalogo = computed(() => {
    const c = this.control();
    return c ? this.data.catalogoDe(c.codigo) : undefined;
  });

  protected readonly paso = signal(0);
  protected readonly verDoc = signal('');
  /** Hueco de la muestra cuyo selector de inventario está abierto; -1 = cerrado (F0382). */
  protected readonly slotEquipo = signal(-1);
  /** Hueco cuya verificación de ítems está abierta; -1 = cerrado (F0382). */
  protected readonly slotVerificar = signal(-1);
  protected readonly busqueda = signal('');
  protected readonly detalleEquipo = signal('');
  /** Texto único para lo que el inventario operativo no tiene registrado. */
  protected readonly sinDato = 'Dato no registrado en inventario operativo';
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

  /** Estado de cada semana en los controles semanales consolidados (F0387). */
  protected readonly semanas = computed(() => {
    const c = this.control();
    return c ? this.data.estadoSemanas(c) : [];
  });

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
      const activos = this.data.equiposDeControl(c);
      this.modelo = cat.plantilla.map((p) => {
        const r = c.secciones.find((s) => s.titulo === p.titulo);
        const campos: Record<string, string> = {};
        for (const campo of p.campos ?? []) campos[campo.id] = r?.campos?.find((x) => x.id === campo.id)?.valor ?? '';
        const items: SeccionEdit['items'] = {};
        for (const item of p.items ?? []) {
          const ri = r?.items?.find((x) => x.id === item.id);
          items[item.id] = { estado: ri?.estado ?? '', medicion: ri?.medicion ?? '', nota: ri?.nota ?? '' };
        }
        // La lista de equipos NO se teclea: son los activos de la Dirección/Unidad del control.
        const equipos: Record<string, RespuestaEquipo> = {};
        if (p.equipos) {
          for (const eq of activos) {
            const re = r?.equipos?.find((x) => x.inventario === eq.inventario);
            equipos[eq.inventario] = {
              inventario: eq.inventario, incluido: re?.incluido ?? false,
              estado: re?.estado ?? '', verificaciones: [...(re?.verificaciones ?? [])],
              observacion: re?.observacion ?? ''
            };
          }
        }
        // Equipos por IP y teléfonos: siempre tantas filas como exija la plantilla, para que el
        // técnico vea los tres huecos aunque todavía no haya registrado ninguno.
        const equiposIp: RespuestaEquipoIp[] = [];
        for (let i = 0; i < (p.equiposIp?.cantidad ?? 0); i++) {
          const g = r?.equiposIp?.[i];
          equiposIp.push({
            ip: g?.ip ?? '', hora: g?.hora ?? '', inventario: g?.inventario ?? '',
            nombreEquipo: g?.nombreEquipo ?? '', usuarioFinal: g?.usuarioFinal ?? '',
            estadoEquipo: g?.estadoEquipo ?? ''
          });
        }
        const telefonos: RespuestaTelefono[] = [];
        for (let i = 0; i < (p.telefonos?.cantidad ?? 0); i++) {
          const t = r?.telefonos?.[i];
          telefonos.push({
            numero: t?.numero ?? '', ubicacion: t?.ubicacion ?? '', resultado: t?.resultado ?? '',
            hora: t?.hora ?? '', observaciones: t?.observaciones ?? ''
          });
        }
        // Muestra del F0382: siempre tantos huecos como pida el formato, con todos sus ítems
        // listos para responder. Del equipo solo se guarda el inventario: lo demás lo pone el
        // inventario operativo al dibujar.
        const checklistEquipos: RespuestaEquipoChecklist[] = [];
        for (let i = 0; i < (p.checklistEquipos?.cantidad ?? 0); i++) {
          const g = r?.checklistEquipos?.[i];
          checklistEquipos.push({
            inventario: g?.inventario ?? '',
            clasificacion: g?.clasificacion ?? '',
            observaciones: g?.observaciones ?? '',
            items: (p.checklistEquipos?.items ?? []).map((it) => {
              const ri = g?.items?.find((x) => x.id === it.id);
              return {
                id: it.id, cumplimiento: ri?.cumplimiento ?? '', descripcion: ri?.descripcion ?? '',
                accionCorrectiva: ri?.accionCorrectiva ?? '', estadoItem: ri?.estadoItem ?? '',
                fechaAccion: ri?.fechaAccion ?? '', justificacion: ri?.justificacion ?? ''
              };
            })
          });
        }
        return {
          plantilla: p, campos, items, equipos, equiposIp, telefonos, checklistEquipos,
          ingresos: (r?.ingresos ?? []).map((x) => this.data.normalizaIngreso(x)),
          filas: (r?.filas ?? []).map((f) => [...f])
        };
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
    if (!c || !u || u.clave === 'coordinador') return false;
    if (!['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado)) return false;
    // Un técnico no completa controles de una Dirección/Unidad que no tiene asignada.
    return this.data.atiende(u, c.direccion, c.unidad);
  });

  /** Motivo por el que el formulario está bloqueado para el usuario conectado. */
  protected readonly bloqueo = computed(() => {
    const c = this.control();
    const u = this.auth.usuario();
    if (!c || !u || this.editable()) return '';
    if (u.clave === 'tec-soporte' && !this.data.atiende(u, c.direccion, c.unidad)) return this.data.MSG_FUERA_DE_DISTRIBUCION;
    return '';
  });

  protected puedeRevisar(): boolean {
    const c = this.control();
    return !!c && (this.auth.esEncargado() || this.auth.esAdmin())
      && ['Entregado', 'Entregado tarde', 'En revisión', 'Observado'].includes(c.estado);
  }

  /**
   * Pasos del formulario. Cada sección de la plantilla es un paso, salvo la sección de muestra
   * (F0382), que se abre en dos: primero se eligen los equipos del inventario y después se
   * verifican sus ítems.
   */
  protected readonly pasos = computed<PasoForm[]>(() => {
    const lista: PasoForm[] = [];
    (this.catalogo()?.plantilla ?? []).forEach((p, i) => {
      if (p.checklistEquipos) {
        lista.push({ titulo: 'Selección de equipos desde inventario', seccion: i, fase: 'muestra' });
        lista.push({ titulo: 'Verificación de ítems por equipo', seccion: i, fase: 'verificacion' });
      } else {
        lista.push({ titulo: p.titulo, seccion: i, fase: 'seccion' });
      }
    });
    if (this.catalogo()?.requiereEvidencia) lista.push({ titulo: 'Evidencias', seccion: -1, fase: 'evidencias' });
    lista.push({ titulo: 'Resumen y entrega', seccion: -1, fase: 'resumen' });
    return lista;
  });

  protected pasoActual(): PasoForm {
    return this.pasos()[this.paso()] ?? this.pasos()[this.pasos().length - 1];
  }
  protected esResumen(): boolean { return this.pasoActual().fase === 'resumen'; }
  protected esEvidencias(): boolean { return this.pasoActual().fase === 'evidencias'; }
  protected esMuestra(): boolean { return this.pasoActual().fase === 'muestra'; }
  protected esVerificacion(): boolean { return this.pasoActual().fase === 'verificacion'; }
  protected seccionActual(): SeccionEdit | undefined {
    const p = this.pasoActual();
    return p.seccion >= 0 ? this.modelo[p.seccion] : undefined;
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
      // ngModel sobre <input type="number"> entrega un number: se normaliza a texto para que
      // las validaciones y los documentos trabajen siempre con cadenas.
      campos: (s.plantilla.campos ?? []).map((c) => ({ id: c.id, valor: String(s.campos[c.id] ?? '') })),
      items: (s.plantilla.items ?? []).map((i) => ({
        id: i.id, estado: s.items[i.id]?.estado ?? '',
        medicion: s.items[i.id]?.medicion || undefined, nota: s.items[i.id]?.nota || undefined
      })),
      filas: s.filas.filter((f) => f.some((x) => x.trim())),
      equipos: s.plantilla.equipos ? Object.values(s.equipos).filter((e) => e.incluido) : undefined,
      // La IP se guarda junto con los datos que el inventario operativo tenía al registrarla: el
      // documento del mes debe seguir siendo legible aunque el equipo se descargue después.
      equiposIp: s.plantilla.equiposIp
        ? s.equiposIp.map((e) => {
          const eq = this.equipoDeIp(e.ip);
          return {
            ip: String(e.ip ?? '').trim(), hora: String(e.hora ?? ''),
            inventario: eq?.inventario ?? '', nombreEquipo: eq?.nombreEquipo ?? '',
            usuarioFinal: eq?.usuarioFinal ?? '', estadoEquipo: eq?.estado ?? ''
          };
        })
        : undefined,
      telefonos: s.plantilla.telefonos
        ? s.telefonos.map((t) => ({
          numero: String(t.numero ?? '').trim(), ubicacion: String(t.ubicacion ?? ''),
          resultado: String(t.resultado ?? ''), hora: String(t.hora ?? ''),
          observaciones: String(t.observaciones ?? '')
        }))
        : undefined,
      checklistEquipos: s.plantilla.checklistEquipos
        ? s.checklistEquipos.map((e) => ({
          inventario: String(e.inventario ?? '').trim(),
          clasificacion: String(e.clasificacion ?? ''),
          observaciones: String(e.observaciones ?? ''),
          items: e.items.map((i) => ({
            id: i.id, cumplimiento: String(i.cumplimiento ?? ''),
            descripcion: String(i.descripcion ?? ''), accionCorrectiva: String(i.accionCorrectiva ?? ''),
            estadoItem: String(i.estadoItem ?? ''), fechaAccion: String(i.fechaAccion ?? ''),
            justificacion: String(i.justificacion ?? '')
          }))
        }))
        : undefined,
      ingresos: s.plantilla.ingresos ? s.ingresos.map((x) => ({ ...x })) : undefined
    }));
  }

  // ------------------------------------------------------------------ ingresos al CSOD (F0234)

  /** Índice del registro que se está creando o editando; -1 = modal cerrado. */
  protected readonly editaIngreso = signal(-1);
  /** Índice del registro cuyo detalle se está mirando; -1 = cerrado. */
  protected readonly verIngreso = signal(-1);
  /** Copia de trabajo: el registro solo entra a la lista cuando se guarda. */
  protected borrador: RespuestaIngreso | null = null;

  /** Sección de registros de ingreso del formulario, si el control la tiene. */
  protected seccionIngresos(): SeccionEdit | undefined {
    return this.modelo.find((m) => !!m.plantilla.ingresos);
  }

  /** ¿Se declaró que el mes no tuvo ingresos? */
  protected sinIngresos(s: SeccionEdit): boolean {
    return s.campos['sin-ingresos'] === 'Sí';
  }

  protected ingresosLlenos(s: SeccionEdit): number {
    return s.ingresos.filter((r) => !this.data.ingresoVacio(r)).length;
  }
  protected ingresosIncompletos(s: SeccionEdit): number {
    return s.ingresos.filter((r) => !this.data.ingresoVacio(r) && this.data.faltasIngreso(r).length).length;
  }

  /**
   * Registro en blanco. El Técnico de Soporte que ingresa viene del usuario que está completando
   * el control —es él quien abre el cuarto de servidores—; el tipo de ingreso, en cambio, se deja
   * sin elegir a propósito: es una decisión del registro, no un valor por omisión.
   */
  private ingresoNuevo(): RespuestaIngreso {
    const u = this.auth.usuario();
    return {
      tipoIngreso: '', fecha: '', horaEntrada: '', horaSalida: '', carne: '',
      nombre: u?.nombre ?? '', cargo: u?.cargo ?? '',
      tipoPersonal: '', acompanante: '', carneAcompanante: '', tipoPersonalAcompanante: '',
      cargoAcompanante: '', anexaDocumento: 'No', documentoNombre: '', documentoImagen: '',
      motivo: '', observacion: ''
    };
  }

  /**
   * Cambia el tipo de ingreso. Al volver a «Individual» se borran los datos del acompañante:
   * un campo que deja de mostrarse no puede seguir viajando con el registro.
   */
  protected cambiarTipoIngreso(reg: RespuestaIngreso, tipo: string): void {
    reg.tipoIngreso = tipo;
    if (this.data.conAcompanante(reg)) return;
    reg.acompanante = '';
    reg.carneAcompanante = '';
    reg.cargoAcompanante = '';
    reg.tipoPersonalAcompanante = '';
  }

  /** Marca o desmarca el documento de respaldo; al desmarcarlo se descarta la imagen cargada. */
  protected marcarRespaldo(reg: RespuestaIngreso, ev: Event): void {
    reg.anexaDocumento = (ev.target as HTMLInputElement).checked ? 'Sí' : 'No';
    if (reg.anexaDocumento === 'No') {
      reg.documentoNombre = '';
      reg.documentoImagen = '';
    }
  }

  protected quitarRespaldo(reg: RespuestaIngreso): void {
    reg.documentoNombre = '';
    reg.documentoImagen = '';
  }

  /**
   * Lee la imagen del respaldo y la guarda reducida a 900 px por lado. El prototipo guarda su
   * estado en el navegador: una fotografía de teléfono a tamaño original no cabría.
   */
  protected async respaldoElegido(reg: RespuestaIngreso, ev: Event): Promise<void> {
    const entrada = ev.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    if (!archivo) return;
    if (!this.data.formatoRespaldoValido(archivo.name)) {
      entrada.value = '';
      this.toast.warn('Formato no admitido', this.data.MSG_RESPALDO_FORMATO);
      return;
    }
    if (!archivo.size) {
      entrada.value = '';
      this.toast.warn('Archivo vacío', this.data.MSG_RESPALDO_IMAGEN);
      return;
    }
    try {
      reg.documentoImagen = await this.reducirImagen(archivo);
      reg.documentoNombre = archivo.name;
    } catch {
      entrada.value = '';
      this.toast.warn('No fue posible leer la imagen', this.data.MSG_RESPALDO_FORMATO);
    }
    this.cd.markForCheck();
  }

  private async reducirImagen(archivo: File): Promise<string> {
    const original = await new Promise<string>((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(lector.result as string);
      lector.onerror = () => mal(new Error('lectura'));
      lector.readAsDataURL(archivo);
    });
    const img = new Image();
    await new Promise<void>((ok, mal) => {
      img.onload = () => ok();
      img.onerror = () => mal(new Error('imagen'));
      img.src = original;
    });
    const escala = Math.min(1, 900 / Math.max(img.width, img.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(img.width * escala));
    lienzo.height = Math.max(1, Math.round(img.height * escala));
    const ctx = lienzo.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    return lienzo.toDataURL('image/jpeg', 0.72);
  }

  protected nuevoIngreso(s: SeccionEdit): void {
    this.borrador = this.ingresoNuevo();
    this.editaIngreso.set(s.ingresos.length);
  }

  protected editarIngreso(i: number): void {
    const s = this.seccionIngresos();
    if (!s?.ingresos[i]) return;
    this.borrador = { ...s.ingresos[i] };
    this.editaIngreso.set(i);
  }

  protected cancelarIngreso(): void {
    this.borrador = null;
    this.editaIngreso.set(-1);
  }

  /** Lo que le falta al borrador; el modal lo muestra en vivo. */
  protected faltasBorrador(): string[] {
    return this.borrador ? this.data.faltasIngreso(this.borrador) : [];
  }

  protected guardarIngreso(s: SeccionEdit): void {
    if (!this.borrador) return;
    const faltas = this.data.faltasIngreso(this.borrador);
    if (faltas.length) {
      this.toast.warn('Registro incompleto', faltas[0]);
      return;
    }
    const i = this.editaIngreso();
    if (i >= 0 && i < s.ingresos.length) s.ingresos[i] = { ...this.borrador };
    else s.ingresos.push({ ...this.borrador });
    this.cancelarIngreso();
    this.guardar(true);
    this.toast.ok('Registro guardado', 'El ingreso quedó registrado en la bitácora del mes.');
  }

  protected eliminarIngreso(s: SeccionEdit, i: number): void {
    const reg = s.ingresos[i];
    if (!reg) return;
    s.ingresos.splice(i, 1);
    this.guardar(true);
    this.toast.ok('Registro eliminado',
      (reg.nombre || 'El registro') + ' salió de la bitácora de ingresos del mes.');
  }

  // ------------------------------------------------------------------ muestra de equipos (F0382)

  /**
   * Cuentas de validación de la muestra para el paso de resumen. Se calculan sobre el control ya
   * guardado, de modo que lo que se ve es exactamente lo que la entrega va a validar.
   */
  protected resumenMuestra(): ResumenMuestra | null {
    const c = this.control();
    return c ? this.data.resumenMuestra(c) : null;
  }

  /** Sección de muestra del formulario, si el control la tiene. */
  protected seccionMuestra(): SeccionEdit | undefined {
    return this.modelo.find((m) => !!m.plantilla.checklistEquipos);
  }

  /** Ficha del equipo en el inventario operativo; undefined si el hueco está vacío. */
  protected equipoDe(inventario: string) {
    return inventario ? this.data.equipoDe(inventario) : undefined;
  }

  /** Equipos activos de la Dirección/Unidad que coinciden con la búsqueda del modal. */
  protected readonly equiposBuscados = computed(() => {
    const c = this.control();
    return c ? this.data.equiposParaMuestra(c, this.busqueda()) : [];
  });

  protected abrirSelector(i: number): void {
    this.busqueda.set('');
    this.slotEquipo.set(i);
  }

  protected yaElegido(s: SeccionEdit, inventario: string): boolean {
    return s.checklistEquipos.some((e) => e.inventario === inventario);
  }
  protected esDelSlot(s: SeccionEdit, inventario: string): boolean {
    return s.checklistEquipos[this.slotEquipo()]?.inventario === inventario;
  }

  /** Coloca el equipo elegido en su hueco. El mismo equipo no puede ocupar dos huecos. */
  protected elegirEquipo(s: SeccionEdit, inventario: string): void {
    const c = this.control();
    const i = this.slotEquipo();
    const hueco = s.checklistEquipos[i];
    if (!c || !hueco) return;
    const otros = s.checklistEquipos.filter((_, k) => k !== i).map((e) => e.inventario);
    const bloqueo = this.data.bloqueoEquipoMuestra(c, inventario, otros);
    if (bloqueo) {
      this.toast.warn('Equipo no admitido', bloqueo);
      return;
    }
    // Cambiar de equipo descarta la verificación anterior: los ítems son de ese equipo, no del hueco.
    if (hueco.inventario && hueco.inventario !== inventario) this.limpiaItems(hueco);
    hueco.inventario = inventario;
    const eq = this.data.equipoDe(inventario);
    if (!hueco.clasificacion) {
      const clas = s.plantilla.checklistEquipos?.clasificaciones ?? [];
      // Los equipos de consulta al público se reconocen por su usuario final en el inventario.
      hueco.clasificacion = /consulta|público|publico/i.test(eq?.usuarioFinal ?? '') ? clas[1] ?? '' : clas[0] ?? '';
    }
    this.slotEquipo.set(-1);
    this.guardar(true);
    this.toast.ok('Equipo agregado a la muestra',
      (eq?.nombreEquipo || eq?.tipo || inventario) + ' · ' + inventario + '.');
  }

  protected quitarEquipo(s: SeccionEdit, i: number): void {
    const hueco = s.checklistEquipos[i];
    if (!hueco?.inventario) return;
    const inventario = hueco.inventario;
    hueco.inventario = '';
    hueco.clasificacion = '';
    hueco.observaciones = '';
    this.limpiaItems(hueco);
    this.guardar(true);
    this.toast.ok('Equipo retirado', inventario + ' salió de la muestra del control.');
  }

  private limpiaItems(hueco: RespuestaEquipoChecklist): void {
    for (const it of hueco.items) {
      it.cumplimiento = '';
      it.descripcion = '';
      it.accionCorrectiva = '';
      it.estadoItem = '';
      it.fechaAccion = '';
      it.justificacion = '';
    }
  }

  protected verificar(i: number): void { this.slotVerificar.set(i); }

  protected cerrarVerificacion(): void {
    this.slotVerificar.set(-1);
    this.guardar(true);
  }

  /** Ítems que aplican al equipo del hueco según su clasificación en el formato. */
  protected itemsDelEquipo(s: SeccionEdit, i: number): ItemSeguridad[] {
    const eq = s.checklistEquipos[i];
    return eq ? this.data.itemsDeClasificacion(s.plantilla, eq.clasificacion) : [];
  }

  protected respuestaItem(eq: RespuestaEquipoChecklist, id: string): RespuestaItemSeguridad | undefined {
    return eq.items.find((x) => x.id === id);
  }

  /** Marcar un cumplimiento limpia lo que ya no corresponde (AC si vuelve a cumplir, etc.). */
  protected marcaItem(ri: RespuestaItemSeguridad, valor: string): void {
    ri.cumplimiento = ri.cumplimiento === valor ? '' : valor;
    if (ri.cumplimiento !== 'No cumple') {
      ri.descripcion = '';
      ri.accionCorrectiva = '';
      ri.estadoItem = '';
      ri.fechaAccion = '';
    }
    if (ri.cumplimiento !== 'No aplica') ri.justificacion = '';
  }

  protected verificados(s: SeccionEdit, i: number): number {
    const eq = s.checklistEquipos[i];
    return eq ? this.data.itemsVerificados(s.plantilla, eq) : 0;
  }
  protected aplicables(s: SeccionEdit, i: number): number {
    return this.itemsDelEquipo(s, i).length;
  }
  protected incumplidos(s: SeccionEdit, i: number): number {
    const eq = s.checklistEquipos[i];
    return eq ? this.data.itemsIncumplidos(eq).length : 0;
  }
  protected estadoFinal(s: SeccionEdit, i: number): string {
    const eq = s.checklistEquipos[i];
    return eq ? this.data.estadoFinalEquipo(s.plantilla, eq) : 'Pendiente';
  }
  /** Acciones correctivas del equipo, resumidas para la columna de la tabla. */
  protected accionesDe(s: SeccionEdit, i: number): string {
    const eq = s.checklistEquipos[i];
    if (!eq) return '';
    return this.data.itemsIncumplidos(eq).map((x) => x.accionCorrectiva).filter(Boolean).join(' · ');
  }
  /** Cuántos huecos de la muestra ya tienen equipo. */
  protected elegidos(s: SeccionEdit): number {
    return s.checklistEquipos.filter((e) => e.inventario).length;
  }
  /** Cuántos equipos de la muestra tienen su verificación terminada. */
  protected verificadosCompletos(s: SeccionEdit): number {
    return s.checklistEquipos.filter((e, i) => e.inventario && this.verificados(s, i) === this.aplicables(s, i)).length;
  }

  // ------------------------------------------------------------------ equipos verificados por IP

  /** Equipo activo de la Dirección/Unidad del control que tiene esa IP, si lo hay. */
  protected equipoDeIp(ip: string) {
    const c = this.control();
    return c ? this.data.buscarEquipoIp(ip, c.direccion, c.unidad).equipo : undefined;
  }

  /** Motivo por el que la IP digitada no sirve, o '' si es válida (o si aún no se digitó nada). */
  protected errorIp(s: SeccionEdit, i: number): string {
    const c = this.control();
    const ip = String(s.equiposIp[i]?.ip ?? '').trim();
    if (!c || !ip) return '';
    const repetida = s.equiposIp.some((e, k) => k < i && String(e.ip ?? '').trim() === ip);
    if (repetida) return 'Esta IP ya se registró en esta semana; deben ser tres equipos distintos.';
    return this.data.buscarEquipoIp(ip, c.direccion, c.unidad).error ?? '';
  }

  /** IPs que el técnico puede usar: las de los equipos activos de la Dirección/Unidad del control. */
  protected readonly ipsDisponibles = computed(() => {
    const c = this.control();
    return c ? this.data.ipsDeControl(c) : [];
  });

  // ------------------------------------------------------------------ equipos del inventario operativo

  /** Equipos activos de la Dirección/Unidad del control: la única lista admitida. */
  protected readonly equiposActivos = computed(() => {
    const c = this.control();
    return c ? this.data.equiposDeControl(c) : [];
  });

  protected alterna(s: SeccionEdit, inventario: string): void {
    const e = s.equipos[inventario];
    if (!e) return;
    e.incluido = !e.incluido;
    if (e.incluido && !e.estado) e.estado = s.plantilla.equipos?.estados[0] ?? '';
  }

  protected alternaVerificacion(s: SeccionEdit, inventario: string, v: string): void {
    const e = s.equipos[inventario];
    if (!e) return;
    e.verificaciones = e.verificaciones.includes(v)
      ? e.verificaciones.filter((x) => x !== v)
      : [...e.verificaciones, v];
    if (!e.incluido) this.alterna(s, inventario);
  }

  protected todosLosEquipos(s: SeccionEdit): void {
    for (const eq of this.equiposActivos()) {
      const e = s.equipos[eq.inventario];
      if (!e) continue;
      e.incluido = true;
      if (!e.estado) e.estado = s.plantilla.equipos?.estados[0] ?? '';
      if (!e.verificaciones.length) e.verificaciones = [...(s.plantilla.equipos?.verificaciones ?? [])];
    }
  }

  protected equiposRevisados(s: SeccionEdit): number {
    return Object.values(s.equipos).filter((e) => e.incluido).length;
  }

  protected guardar(silencioso = false): void {
    const c = this.control();
    if (!c || !this.editable()) return;
    this.data.guardarAvance(c.id, this.respuestas(), this.evidencias, c.observaciones, this.auth.usuario());
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

  /** Registros de ingreso de una sección ya entregada (F0234). */
  protected conIngresos(s: RespuestaSeccion): RespuestaIngreso[] {
    return (s.ingresos ?? []).filter((x) => !this.data.ingresoVacio(x));
  }
  /** ¿Esa sección es la bitácora de ingresos del control abierto? */
  protected esF0234(titulo: string): boolean {
    return !!this.catalogo()?.plantilla.find((p) => p.titulo === titulo)?.ingresos;
  }

  /** Equipos de la muestra registrados en una sección ya entregada (F0382). */
  protected conChecklist(s: RespuestaSeccion): RespuestaEquipoChecklist[] {
    return (s.checklistEquipos ?? []).filter((e) => e.inventario.trim());
  }
  /** Nombre del ítem de seguridad, tomado de la plantilla del catálogo. */
  protected nombreItem(titulo: string, id: string): string {
    const p = this.catalogo()?.plantilla.find((x) => x.titulo === titulo);
    return p ? this.data.nombreItemSeguridad(p, id) : id;
  }
  protected estadoFinalLectura(titulo: string, eq: RespuestaEquipoChecklist): string {
    const p = this.catalogo()?.plantilla.find((x) => x.titulo === titulo);
    return p ? this.data.estadoFinalEquipo(p, eq) : 'Pendiente';
  }

  /** Filas con IP registrada de una sección ya entregada (vista de solo lectura). */
  protected conIp(s: RespuestaSeccion): RespuestaEquipoIp[] {
    return (s.equiposIp ?? []).filter((e) => e.ip.trim());
  }
  /** Teléfonos/extensiones registrados de una sección ya entregada. */
  protected conTelefono(s: RespuestaSeccion): RespuestaTelefono[] {
    return (s.telefonos ?? []).filter((t) => t.numero.trim());
  }

  protected equiposIpLlenos(s: SeccionEdit): number {
    return s.equiposIp.filter((e) => e.ip.trim() && e.hora.trim()).length;
  }
  protected telefonosLlenos(s: SeccionEdit): number {
    return s.telefonos.filter((t) => t.numero.trim() && t.hora.trim()).length;
  }

  /** Ítems de toda la muestra con ese cumplimiento (resumen del paso final). */
  protected cuentaCumplimiento(s: SeccionEdit, valor: string): number {
    return s.checklistEquipos
      .filter((e) => e.inventario)
      .reduce((n, e) => n + e.items.filter((i) => i.cumplimiento === valor).length, 0);
  }
  protected accionesRegistradas(s: SeccionEdit): number {
    return s.checklistEquipos
      .filter((e) => e.inventario)
      .reduce((n, e) => n + e.items.filter((i) => i.accionCorrectiva.trim()).length, 0);
  }

  protected camposLlenos(s: SeccionEdit): number {
    return (s.plantilla.campos ?? []).filter((c) => String(s.campos[c.id] ?? '').trim()).length;
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
