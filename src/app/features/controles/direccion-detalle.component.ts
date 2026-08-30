import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AutoSyncService } from '../../core/services/auto-sync.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { ControlDeadlineService } from '../../core/services/control-deadline.service';
import { KpiDireccion, OperatividadService } from '../../core/services/operatividad.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { IconComponent } from '../../shared/icon';
import { MESES, formateaFecha, isoLocal, nombreMes } from '../../core/models/models';

/**
 * Detalle de operatividad de un ámbito territorial en un período: sus responsables, sus KPIs,
 * los controles que le aplican, su bitácora diaria, su inventario operativo y los documentos
 * generados. Es la pantalla a la que llega el Encargado de Soporte desde la vista por Dirección.
 */
@Component({
  selector: 'app-direccion-detalle',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, DocumentoComponent, IconComponent],
  styles: `
    .cab { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start; justify-content: space-between; }
    .ficha { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 18px; }
    .ficha .f { font-size: 13px; }
    .ficha .f dt { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--tx-3); margin-bottom: 2px; }
    .ficha .f dd { margin: 0; color: var(--navy-900); font-weight: 600; }
    .op-grande { display: flex; align-items: center; gap: 14px; }
    .op-grande .pct { font-size: 34px; font-weight: 700; color: var(--navy-900); line-height: 1; }
    .col-num { text-align: center; }
    .col-num.mal { color: var(--danger); font-weight: 700; }
    .fila-sel { background: var(--blue-50, #eef4fc); }
    /* Las dos tarjetas de media página llevan tablas: los encabezados pueden partirse. */
    .tbl th { white-space: normal; }
  `,
  template: `
    @if (existe()) {
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-kicker">Operación · {{ kpi().corta }}</div>
            <h1>
              {{ kpi().nombre }}@if (kpi().unidad !== kpi().nombre) { <span class="muted"> / {{ kpi().unidad }}</span> }
              <ui-help texto="Operatividad del ámbito territorial en el período: controles que le aplican según el catálogo, bitácoras diarias, inventario operativo y documentos generados." />
            </h1>
            <p class="page-sub">
              {{ nombreMes(mes()) }} {{ anio() }} · fecha límite <b>{{ formatea(kpi().fechaLimite) }}</b> ·
              @if (kpi().responsables.length) {
                {{ kpi().responsables.length === 1 ? 'responsable' : 'responsables' }}:
                <b>{{ kpi().responsables.join(', ') }}</b>
              } @else { <span class="badge danger">sin Técnico de Soporte responsable</span> }
            </p>
          </div>
          <div class="row">
            <select class="control" style="width: 150px;" [(ngModel)]="mes">
              @for (m of MESES; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }
            </select>
            <button class="btn btn-primary btn-sm" type="button" (click)="generarReporte('Reporte mensual por Dirección')">
              <ui-icon name="file" [size]="13" /> Reporte mensual
            </button>
            <a class="btn btn-outline btn-sm" routerLink="/controles">Volver</a>
          </div>
        </div>

        <!-- Estado general -->
        <div class="card" style="margin-bottom: 18px;">
          <div class="card-body cab">
            <div class="op-grande">
              <span class="pct">{{ kpi().aplicables ? kpi().operatividad + ' %' : '—' }}</span>
              <div>
                <ui-badge [estado]="kpi().estado" />
                <div class="muted" style="font-size: 12.5px; margin-top: 4px; max-width: 420px;">
                  Operatividad del período: {{ kpi().entregados + kpi().entregadosTarde }} entregados y
                  {{ kpi().justificados }} justificado(s) de {{ kpi().aplicables }} aplicables
                  @if (kpi().bitacoras) { · bitácora diaria {{ kpi().bitacorasEnviadas + kpi().bitacorasTarde }} de {{ kpi().bitacoras }} }
                </div>
              </div>
            </div>
            <div class="row">
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte de operatividad por Dirección')">Reporte de operatividad</button>
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte de controles pendientes por Dirección')">Controles pendientes</button>
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte de inventario operativo por Dirección')">Inventario operativo</button>
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte de bitácoras diarias por Dirección')">Bitácoras diarias</button>
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte de F0387 consolidado mensual por Dirección')">F0387 consolidado</button>
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte de F0389 consolidado mensual por Dirección')">F0389 consolidado</button>
              <button class="btn btn-outline btn-sm" type="button" (click)="generarReporte('Reporte anual por Dirección')">Reporte anual</button>
            </div>
          </div>
        </div>

        <!-- KPIs -->
        <div class="grid grid-5" style="margin-bottom: 14px;">
          <div class="kpi"><div class="kpi-label">Controles aplicables</div><div class="kpi-value">{{ kpi().aplicables }}</div><div class="kpi-hint">según «Aplica a» del catálogo</div></div>
          <div class="kpi"><div class="kpi-label">Entregados</div><div class="kpi-value">{{ kpi().entregados + kpi().entregadosTarde }}</div><div class="kpi-hint">{{ kpi().entregadosTarde }} fuera de plazo</div></div>
          <div class="kpi"><div class="kpi-label">Pendientes</div><div class="kpi-value">{{ kpi().pendientes }}</div><div class="kpi-hint">{{ kpi().proximosAVencer }} vence(n) en 3 días hábiles</div></div>
          <div class="kpi"><div class="kpi-label">Vencidos</div><div class="kpi-value">{{ kpi().vencidos }}</div><div class="kpi-hint">sin entrega ni justificación</div></div>
          <div class="kpi"><div class="kpi-label">Justificados</div><div class="kpi-value">{{ kpi().justificados }}</div><div class="kpi-hint">cerrados con carta</div></div>
        </div>
        <div class="grid grid-5" style="margin-bottom: 18px;">
          <div class="kpi"><div class="kpi-label">Cumplimiento</div><div class="kpi-value">{{ kpi().cumplimiento }} %</div><div class="kpi-hint">entregados a tiempo y justificados</div></div>
          <div class="kpi"><div class="kpi-label">Bitácoras enviadas</div><div class="kpi-value">{{ kpi().bitacorasEnviadas }}</div><div class="kpi-hint">{{ kpi().bitacorasTarde }} tarde · {{ kpi().bitacorasPendientes }} pendientes</div></div>
          <div class="kpi"><div class="kpi-label">Equipos activos</div><div class="kpi-value">{{ kpi().equiposActivos }}</div><div class="kpi-hint">en inventario operativo</div></div>
          <div class="kpi"><div class="kpi-label">Equipos con incidencia</div><div class="kpi-value">{{ kpi().equiposIncidencia }}</div><div class="kpi-hint">{{ kpi().equiposDescargados }} descargado(s) en el mes</div></div>
          <div class="kpi"><div class="kpi-label">Documentos</div><div class="kpi-value">{{ kpi().documentos }}</div><div class="kpi-hint">generados en el período</div></div>
        </div>

        <!-- Alertas de la Dirección -->
        @if (alertas().length) {
          <div style="display: grid; gap: 8px; margin-bottom: 18px;">
            @for (a of alertas(); track a) {
              <div class="alert warn"><span class="alert-ico">!</span><span>{{ a }}</span></div>
            }
          </div>
        }

        <!-- Meses pendientes por completar -->
        <div class="card" style="margin-bottom: 18px;">
          <div class="card-head">
            <div>
              <h3>Meses pendientes por completar</h3>
              <p class="sub">
                Meses del año {{ anio() }} con controles pendientes o vencidos en este ámbito territorial
              </p>
            </div>
            <button class="btn btn-ghost btn-sm" type="button" (click)="verHistorial.set(!verHistorial())">
              {{ verHistorial() ? 'Ver solo pendientes' : 'Ver historial mensual completo' }}
            </button>
          </div>
          <div class="card-body">
            @if (mesesVisibles().length) {
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr>
                    <th>Mes</th><th class="col-num">Aplicables</th><th class="col-num">Entregados</th>
                    <th class="col-num">Pendientes</th><th class="col-num">Vencidos</th>
                    <th class="col-num">Justificados</th><th>Estado general</th><th>Acción</th>
                  </tr></thead>
                  <tbody>
                    @for (m of mesesVisibles(); track m.mes) {
                      <tr [class.fila-sel]="m.mes === mes()">
                        <td><b>{{ nombreMes(m.mes) }} {{ anio() }}</b></td>
                        <td class="col-num">{{ m.kpi.aplicables }}</td>
                        <td class="col-num">{{ m.kpi.entregados + m.kpi.entregadosTarde }}</td>
                        <td class="col-num" [class.mal]="m.kpi.pendientes > 0">{{ m.kpi.pendientes }}</td>
                        <td class="col-num" [class.mal]="m.kpi.vencidos > 0">{{ m.kpi.vencidos }}</td>
                        <td class="col-num">{{ m.kpi.justificados }}</td>
                        <td><ui-badge [estado]="m.estado" /></td>
                        <td>
                          <button class="btn btn-outline btn-sm" type="button" (click)="abrirMes(m.mes)">
                            Ver controles del mes
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="muted">
                Este ámbito territorial no tiene meses pendientes en {{ anio() }}: todos sus controles
                aplicables quedaron entregados, justificados o cerrados.
              </p>
            }
          </div>
        </div>

        <!-- Controles aplicables -->
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Controles aplicables de {{ nombreMes(mes()) }} {{ anio() }}</h3>
              <p class="sub">Solo los controles que el catálogo programa en este ámbito territorial</p>
            </div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Código</th><th>Nombre del control</th><th>Frecuencia</th><th>Responsable</th><th>Fecha límite</th><th>Avance</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  @for (c of controles(); track c.id) {
                    <tr>
                      <td><b class="mono">{{ c.codigo }}</b>@if (c.semana) { <div class="muted" style="font-size: 11px;">Semana {{ c.semana }}</div> }</td>
                      <td style="max-width: 280px;">{{ data.catalogoDe(c.codigo)?.nombre }}</td>
                      <td>
                        <ui-badge [estado]="data.etiquetaFrecuencia(c.codigo)" />
                        @if (data.etiquetaEntrega(c.codigo); as ent) {
                          <div class="muted" style="font-size: 11px;">{{ ent }}</div>
                        }
                      </td>
                      <td>{{ c.responsable }}</td>
                      <td class="mono">{{ formatea(c.fechaLimite) }}</td>
                      <td style="min-width: 90px;">
                        <div class="progress" [class.ok]="c.avance === 100"><span [style.width.%]="c.avance"></span></div>
                      </td>
                      <td><ui-badge [estado]="c.estado" /></td>
                      <td style="white-space: nowrap;">
                        @if (abierto(c.estado) && puedeCompletar(c)) {
                          <a class="btn btn-primary btn-sm" [routerLink]="['/controles', c.id]">
                            {{ c.avance > 0 ? 'Continuar' : 'Completar' }}
                          </a>
                        } @else {
                          <a class="btn btn-ghost btn-sm" [routerLink]="['/controles', c.id]">Ver detalle</a>
                        }
                        @if (c.documento) {
                          <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(c.documento!)">Ver documento</button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8" class="muted">Ningún control del catálogo aplica a este ámbito territorial en el período.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            @if (noAplican().length) {
              <div class="divider"></div>
              <div class="sec-title">No aplican a este ámbito territorial</div>
              <div class="row" style="gap: 6px;">
                @for (n of noAplican(); track n.codigo) {
                  <span class="badge" [title]="n.motivo">{{ n.codigo }} — No aplica</span>
                }
              </div>
            }
          </div>
        </div>

        <div class="grid grid-2" style="margin-top: 18px; align-items: start;">
          <!-- Bitácoras -->
          <div class="card">
            <div class="card-head">
              <div><h3>Bitácoras diarias del período</h3><p class="sub">Cierre a las 5:00 p. m. de cada día hábil</p></div>
              <a class="btn btn-ghost btn-sm" routerLink="/bitacora">Ver bitácoras</a>
            </div>
            <div class="card-body">
              @if (bitacoras().length) {
                <div class="table-wrap">
                  <table class="tbl">
                    <thead><tr><th>Fecha</th><th>Responsable</th><th>Envío</th><th>Fallas</th><th>Estado</th></tr></thead>
                    <tbody>
                      @for (b of bitacoras(); track b.id) {
                        <tr>
                          <td class="mono">{{ formatea(b.fecha) }}</td>
                          <td>{{ b.responsable }}</td>
                          <td class="mono">{{ b.horaEnvio ?? '—' }}</td>
                          <td class="col-num">{{ fallas(b.id) }}</td>
                          <td><ui-badge [estado]="b.estado" /></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              } @else {
                <p class="muted">Este ámbito territorial no lleva bitácora diaria de atención al público.</p>
              }
            </div>
          </div>

          <!-- Inventario -->
          <div class="card">
            <div class="card-head">
              <div><h3>Inventario operativo</h3><p class="sub">Equipos activos que alimentan F0422, mantenimiento y vulnerabilidades</p></div>
              <a class="btn btn-ghost btn-sm" routerLink="/inventario">Ver inventario</a>
            </div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr><th>N° inventario</th><th>Equipo y usuario final</th><th>Último control</th><th>Estado</th></tr></thead>
                  <tbody>
                    @for (e of equipos(); track e.ciclo) {
                      <tr>
                        <td class="mono">{{ e.inventario }}</td>
                        <td>
                          <b>{{ e.nombreEquipo || e.tipo }}</b>
                          <div class="muted" style="font-size: 11.5px;">{{ e.marca }} {{ e.modelo }} · {{ e.usuarioFinal }}</div>
                        </td>
                        <td>{{ ultimoControl(e.inventario) }}</td>
                        <td><ui-badge [estado]="e.estado" /></td>
                      </tr>
                    } @empty {
                      <tr><td colspan="4" class="muted">Sin equipos activos en este ámbito territorial.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- Documentos del período -->
        <div class="card" style="margin-top: 18px;">
          <div class="card-head">
            <div><h3>Documentos generados en el período</h3><p class="sub">Controles entregados, bitácoras, cartas y reportes de este ámbito territorial</p></div>
            <a class="btn btn-ghost btn-sm" routerLink="/documentos">Ver generador</a>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th>Generado por</th><th>Huella</th><th></th></tr></thead>
                <tbody>
                  @for (d of documentos(); track d.id) {
                    <tr>
                      <td>{{ d.nombre }}</td>
                      <td>{{ d.tipo }}</td>
                      <td class="mono">{{ formatea(d.fecha) }}</td>
                      <td>{{ d.generadoPor }}</td>
                      <td class="mono">{{ d.hash }}</td>
                      <td><button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(d.id)">Vista previa</button></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="muted">Sin documentos generados en el período.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
      </div>
    } @else {
      <div class="page">
        <p class="muted">El ámbito territorial indicado no existe o no está asignada a su usuario.</p>
        <a class="btn btn-outline" routerLink="/controles">Volver a Controles mensuales</a>
      </div>
    }
  `
})
export class DireccionDetalleComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly oper = inject(OperatividadService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);
  /** El detalle abre en el mes actual del sistema; el selector respeta lo que elija el usuario. */
  private readonly periodo = this.plazos.periodoActivo();
  private readonly toast = inject(ToastService);

  /** Parámetros de la ruta `/controles/direccion/:direccion/:unidad`. */
  readonly direccion = input.required<string>();
  readonly unidad = input.required<string>();

  protected readonly MESES = MESES;
  protected readonly anio = signal(this.periodo.anio);
  protected readonly mes = signal(this.periodo.mes);
  protected readonly verDoc = signal('');

  /** Sincronización automática del período visible: sin botones, se dispara sola. */
  private readonly autoSync = inject(AutoSyncService);
  private readonly sincroniza = effect(() => this.autoSync.periodo(this.anio(), this.mes()));


  /** Deja constancia de la consulta de operatividad, una vez por ámbito territorial y período. */
  private consultado = '';

  constructor() {
    effect(() => {
      const clave = `${this.direccion()}|${this.unidad()}|${this.anio()}-${this.mes()}`;
      if (!this.existe() || clave === this.consultado) return;
      this.consultado = clave;
      const k = this.kpi();
      this.data.registrarEvento(this.auth.usuario(), {
        direccion: this.direccion(), unidad: this.unidad(), mes: this.mes(), anio: this.anio(),
        accion: 'Vista de operatividad consultada',
        observacion: `Operatividad ${k.operatividad} % (${k.estado}): ${k.entregados + k.entregadosTarde} entregados, ${k.pendientes} pendientes, ${k.vencidos} vencidos y ${k.justificados} justificados de ${k.aplicables} controles aplicables.`
      });
    });
  }

  protected readonly existe = computed(() => {
    const u = this.auth.usuario();
    const par = this.data.pares().some((p) => p.direccion === this.direccion() && p.unidad === this.unidad());
    if (!par) return false;
    return !u || u.clave !== 'tec-soporte' || this.data.atiende(u, this.direccion(), this.unidad());
  });

  protected readonly kpi = computed(() => this.oper.kpi(this.direccion(), this.unidad(), this.anio(), this.mes()));

  protected readonly controles = computed(() =>
    this.oper.controlesDe(this.direccion(), this.unidad(), this.anio(), this.mes())
      .sort((a, b) => a.codigo.localeCompare(b.codigo) || (a.semana ?? 0) - (b.semana ?? 0)));

  /** ¿Puede el usuario conectado completar este control? (el Coordinador nunca opera) */
  protected puedeCompletar(c: { direccion: string; unidad: string }): boolean {
    const u = this.auth.usuario();
    if (!u || u.clave === 'coordinador') return false;
    return this.data.atiende(u, c.direccion, c.unidad);
  }

  protected abierto(estado: string): boolean {
    return ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(estado);
  }

  // ------------------------------------------------------------------ meses pendientes

  protected readonly verHistorial = signal(false);

  /**
   * Los doce meses del año con su resumen. «Estado general» resume el mes completo:
   * un mes con algo vencido es Vencido; si queda algo por entregar, Pendiente o En proceso;
   * si todo se entregó o justificó, Entregado / Justificado / Cerrado.
   */
  protected readonly meses = computed(() =>
    this.oper.anual(this.direccion(), this.unidad(), this.anio())
      .map((kpi, i) => ({ mes: i + 1, kpi, estado: this.estadoDelMes(kpi) }))
      .filter((m) => m.kpi.aplicables > 0));

  /** Meses con controles pendientes o vencidos: lo primero que debe ver el usuario. */
  protected readonly mesesPendientes = computed(() =>
    this.meses().filter((m) => m.kpi.pendientes > 0 || m.kpi.vencidos > 0));

  protected readonly mesesVisibles = computed(() =>
    this.verHistorial() ? this.meses() : this.mesesPendientes());

  private estadoDelMes(k: KpiDireccion): string {
    if (!k.aplicables) return 'No aplica';
    if (k.vencidos) return 'Vencido';
    if (k.pendientes === k.aplicables) return 'Pendiente';
    if (k.pendientes) return 'En proceso';
    if (k.justificados === k.aplicables) return 'Justificado';
    if (k.entregados && k.entregados + k.justificados === k.aplicables && !k.entregadosTarde) {
      return k.enRevision ? 'En revisión' : 'Cerrado';
    }
    if (k.entregadosTarde) return 'Entregado tarde';
    return 'Entregado';
  }

  /** Abre el mes elegido y deja constancia de la consulta. */
  protected abrirMes(mes: number): void {
    this.mes.set(mes);
    const k = this.oper.kpi(this.direccion(), this.unidad(), this.anio(), mes);
    this.data.registrarEvento(this.auth.usuario(), {
      direccion: this.direccion(), unidad: this.unidad(), mes, anio: this.anio(),
      accion: 'Mes pendiente visualizado',
      observacion: `${nombreMes(mes)} ${this.anio()}: ${k.pendientes} control(es) pendientes y ${k.vencidos} vencido(s) de ${k.aplicables} aplicables.`
    });
  }

  protected readonly noAplican = computed(() =>
    this.data.controlesNoAplicablesDe(this.direccion(), this.unidad())
      .map((c) => ({ codigo: c.codigo, motivo: `${c.nombre} — ${c.aplicacion.observaciones}` })));

  protected readonly bitacoras = computed(() => {
    const prefijo = `${this.anio()}-${String(this.mes()).padStart(2, '0')}`;
    return this.data.bitacoras()
      .filter((b) => b.fecha.startsWith(prefijo) && b.direccion === this.direccion() && b.unidad === this.unidad())
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  protected readonly equipos = computed(() => this.data.equiposActivosDe(this.direccion(), this.unidad()));

  protected readonly documentos = computed(() => this.data.documentos()
    .filter((d) => d.anio === this.anio() && d.mes === this.mes() && d.direccion === this.direccion())
    .sort((a, b) => b.fecha.localeCompare(a.fecha)));

  /** Alertas de el ámbito territorial (las mismas que ve el Encargado en el panel). */
  protected readonly alertas = computed(() => {
    const k = this.kpi();
    const lista: string[] = [];
    if (!k.responsables.length && k.aplicables) {
      lista.push('Este ámbito territorial tiene controles aplicables, pero no posee Técnico de Soporte asignado.');
    }
    if (k.vencidos) lista.push(`${k.vencidos} control(es) vencieron el plazo de entrega sin carta de justificación.`);
    if (k.bitacorasPendientes || k.bitacorasVencidas) {
      lista.push(`${k.bitacorasPendientes} bitácora(s) pendientes y ${k.bitacorasVencidas} vencida(s) en el período.`);
    }
    if (k.aplicables && k.operatividad < 75) lista.push(`Operatividad crítica (${k.operatividad} %) en el período.`);
    if (k.equiposActivos && k.ultimoF0422 !== 'No aplica' && !['Entregado', 'Entregado tarde', 'Cerrado'].includes(k.ultimoF0422)) {
      lista.push(`Hay ${k.equiposActivos} equipo(s) activo(s) y el control F0422 del período está en estado «${k.ultimoF0422}».`);
    }
    if (k.equiposIncidencia) lista.push(`${k.equiposIncidencia} equipo(s) con incidencia en atención al público o en garantía/revisión.`);
    if (k.proximosAVencer) lista.push(`${k.proximosAVencer} control(es) vencen dentro de los próximos 3 días hábiles.`);
    return lista;
  });

  protected fallas(idBitacora: string): number {
    return this.data.bitacoraPorId(idBitacora)?.revision.filter((r) => r.estado === 'Presenta falla').length ?? 0;
  }

  protected ultimoControl(inventario: string): string {
    const c = this.data.controlesDeEquipo(inventario)[0];
    return c ? `${c.codigo} · ${nombreMes(c.mes)}` : 'Sin control asociado';
  }

  protected generarReporte(tipo: string): void {
    const doc = this.data.generarReporteDireccion(tipo, {
      anio: this.anio(), mes: this.mes(), direccion: this.direccion(), unidad: this.unidad()
    }, this.auth.usuario()!);
    this.verDoc.set(doc);
    this.toast.ok('Reporte generado', `${tipo} · ${this.data.dirUnidad(this.direccion(), this.unidad())}.`);
  }

  protected restan(limite: string): number { return this.habiles.habilesHasta(limite, isoLocal(new Date())); }
  protected nombreMes(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }
}
