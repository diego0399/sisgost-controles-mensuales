import { Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AutoSyncService } from '../../core/services/auto-sync.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { ControlDeadlineService } from '../../core/services/control-deadline.service';
import { OperatividadService } from '../../core/services/operatividad.service';
import { BadgeComponent } from '../../shared/ui';
import { KpiDireccionesComponent } from '../../shared/kpi-direcciones';
import { IconComponent } from '../../shared/icon';
import { MESES, formateaFecha, isoLocal, nombreMes } from '../../core/models/models';
import { URL_GESTION_EQUIPOS } from '../../core/config/modulos';

interface Alerta { tipo: 'danger' | 'warn' | 'ok'; titulo: string; texto: string; ruta: string; }

/**
 * Panel ejecutivo: la fotografía del mes en curso para el rol conectado. Indicadores de
 * controles y bitácoras, alertas accionables y el avance por Dirección/Unidad.
 */
@Component({
  selector: 'app-panel',
  imports: [RouterLink, BadgeComponent, IconComponent, KpiDireccionesComponent],
  styles: `
    .dos-col { grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); }
    @media (max-width: 1100px) { .dos-col { grid-template-columns: 1fr; } }
    .col-num { text-align: center; }
    .modulo-card { border-left: 3px solid var(--gold-500); }
    .mod-ico {
      display: inline-flex; align-items: center; justify-content: center;
      width: 42px; height: 42px; border-radius: 10px; flex: none;
      background: var(--navy-50, #eef3fa); color: var(--navy-800);
    }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Seguimiento · {{ mesActual }}</div>
          <h1>Panel ejecutivo</h1>
          <p class="page-sub">
            Controles del período {{ mesActual }} con entrega en los primeros 3 días hábiles del mes siguiente
            (fecha límite: <b>{{ limiteMes }}</b>) y bitácoras diarias con cierre a las 5:00 p. m.
          </p>
        </div>
        <a class="btn btn-outline" routerLink="/historial">Ver historial anual</a>
      </div>

      <div class="grid grid-5">
        <div class="kpi">
          <div class="kpi-label">Controles aplicables del mes</div>
          <div class="kpi-value">{{ delMes().length }}</div>
          <div class="kpi-hint">{{ mesActual }} · {{ noAplicables() }} no aplicables</div>
        </div>
        <div class="kpi"><div class="kpi-label">Entregados</div><div class="kpi-value">{{ cuenta(['Entregado', 'Entregado tarde', 'Cerrado']) }}</div><div class="kpi-hint">{{ cuenta(['Entregado tarde']) }} fuera de plazo</div></div>
        <div class="kpi"><div class="kpi-label">Pendientes</div><div class="kpi-value">{{ cuenta(['Programado', 'Pendiente', 'En proceso', 'Listo para entregar']) }}</div><div class="kpi-hint">{{ cuenta(['En proceso']) }} en proceso</div></div>
        <div class="kpi"><div class="kpi-label">Vencidos</div><div class="kpi-value">{{ vencidosTotales() }}</div><div class="kpi-hint">de todo el año</div></div>
        <div class="kpi"><div class="kpi-label">Justificados</div><div class="kpi-value">{{ justificadosAnio() }}</div><div class="kpi-hint">cartas emitidas en 2026</div></div>
      </div>

      <div class="grid grid-5" style="margin-top: 14px;">
        <div class="kpi"><div class="kpi-label">Bitácoras enviadas hoy</div><div class="kpi-value">{{ bitacorasHoy().enviadas }}</div><div class="kpi-hint">{{ esHabilHoy ? 'de ' + bitacorasHoy().total + ' esperadas' : 'hoy no es día hábil' }}</div></div>
        <div class="kpi"><div class="kpi-label">Bitácoras pendientes hoy</div><div class="kpi-value">{{ bitacorasHoy().pendientes }}</div><div class="kpi-hint">límite 5:00 p. m.</div></div>
        <div class="kpi"><div class="kpi-label">Próximos a vencer</div><div class="kpi-value">{{ proximos().length }}</div><div class="kpi-hint">dentro de 3 días hábiles</div></div>
        <div class="kpi"><div class="kpi-label">Equipos activos</div><div class="kpi-value">{{ equiposActivos() }}</div><div class="kpi-hint">en inventario operativo</div></div>
        <div class="kpi"><div class="kpi-label">Equipos con incidencias</div><div class="kpi-value">{{ equiposIncidencia() }}</div><div class="kpi-hint">en garantía, revisión o con hallazgo</div></div>
      </div>

      <!-- Operatividad por Dirección/Unidad -->
      <div class="grid grid-5" style="margin-top: 14px;">
        <div class="kpi"><div class="kpi-label">Direcciones atendidas</div><div class="kpi-value">{{ resumenOper().total }}</div><div class="kpi-hint">{{ resumenOper().promedio }} % de operatividad promedio</div></div>
        <div class="kpi"><div class="kpi-label">Operativas</div><div class="kpi-value">{{ resumenOper().operativas }}</div><div class="kpi-hint">90 % o más</div></div>
        <div class="kpi"><div class="kpi-label">En observación</div><div class="kpi-value">{{ resumenOper().observacion }}</div><div class="kpi-hint">entre 75 % y 89 %</div></div>
        <div class="kpi"><div class="kpi-label">Críticas</div><div class="kpi-value">{{ resumenOper().criticas }}</div><div class="kpi-hint">menos de 75 %</div></div>
        <div class="kpi"><div class="kpi-label">Sin soporte asignado</div><div class="kpi-value">{{ resumenOper().sinSoporte }}</div><div class="kpi-hint">nadie puede entregar</div></div>
      </div>

      @if (alertas().length) {
        <div class="sec-title" style="margin-top: 26px;">Alertas del sistema · {{ alertas().length }}</div>
        <div style="display: grid; gap: 8px;">
          @for (a of alertasVisibles(); track a.titulo + a.texto) {
            <a class="alert {{ a.tipo }}" [routerLink]="a.ruta" style="text-decoration: none; color: inherit;">
              <span class="alert-ico">!</span>
              <span><b>{{ a.titulo }}.</b> {{ a.texto }}</span>
            </a>
          }
          @if (alertas().length > alertasVisibles().length) {
            <p class="muted" style="font-size: 12.5px;">
              y {{ alertas().length - alertasVisibles().length }} alerta(s) más; el detalle de cada
              Dirección/Unidad las muestra completas.
            </p>
          }
        </div>
      }

      <!-- Acceso al módulo hermano del ecosistema SISGOST -->
      <div class="card modulo-card" style="margin-top: 26px;">
        <div class="card-body row-between" style="gap: 18px; flex-wrap: wrap;">
          <div class="row" style="gap: 14px; align-items: flex-start;">
            <span class="mod-ico"><ui-icon name="box" [size]="22" /></span>
            <div>
              <h3 style="margin: 0 0 3px; font-size: 15px;">SISGOST — Gestión de Equipos</h3>
              <p class="muted" style="margin: 0; max-width: 620px;">
                Consulta preparación, asignación, configuración, aceptación, garantía y descargo de equipos.
                Los equipos que aquel módulo deja aceptados alimentan el inventario operativo de este:
                <b>{{ equiposActivos() }}</b> equipo(s) activo(s) en {{ data.pares().length }} Direcciones/Unidades,
                <b>{{ integracionPendiente().length }}</b> movimiento(s) por aplicar.
              </p>
            </div>
          </div>
          <div class="row">
            <a class="btn btn-outline btn-sm" routerLink="/inventario">Ver inventario operativo</a>
            <a class="btn btn-primary btn-sm" [href]="urlEquipos">
              <ui-icon name="external" [size]="13" /> Ir a Gestión de Equipos
            </a>
          </div>
        </div>
      </div>

      <!-- Operatividad por Dirección: la misma tabla comparativa de Controles mensuales. -->
      <div class="card" style="margin-top: 18px;">
        <div class="card-head">
          <div>
            <h3>Operatividad por Dirección</h3>
            <p class="sub">
              Controles aplicables, bitácoras, inventario y semáforo institucional del período {{ mesActual }}
            </p>
          </div>
          <a class="btn btn-outline btn-sm" routerLink="/controles">Ver controles por Dirección</a>
        </div>
        <div class="card-body">
          <ui-kpi-direcciones [kpis]="kpis()" modo="tabla" />
        </div>
      </div>

      <div class="grid dos-col" style="margin-top: 18px; align-items: start;">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Carga por Técnico de Soporte</h3>
              <p class="sub">Direcciones/Unidades atendidas y controles abiertos del período</p>
            </div>
            <a class="btn btn-ghost btn-sm" routerLink="/distribucion">Ver distribución</a>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Técnico de Soporte</th><th class="col-num">Dir./Unid.</th><th class="col-num">Abiertos</th><th class="col-num">Venc.</th><th>Carga</th></tr></thead>
                <tbody>
                  @for (c of cargaSoportes(); track c.tecnico) {
                    <tr>
                      <td><b>{{ c.tecnico }}</b></td>
                      <td class="col-num">{{ c.pares }}</td>
                      <td class="col-num">{{ c.abiertos }}</td>
                      <td class="col-num">{{ c.vencidos }}</td>
                      <td style="min-width: 110px;">
                        <div class="progress"><span [style.width.%]="pctCarga(c.abiertos)"></span></div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h3>Controles próximos a vencer</h3>
              <p class="sub">Fecha límite dentro de los próximos 3 días hábiles</p>
            </div>
            <a class="btn btn-ghost btn-sm" routerLink="/calendario">Ver calendario</a>
          </div>
          <div class="card-body">
            @if (proximos().length) {
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr><th>Control</th><th>Dirección</th><th>Límite</th><th>Restan</th><th>Estado</th></tr></thead>
                  <tbody>
                    @for (c of proximos(); track c.id) {
                      <tr>
                        <td><b>{{ c.codigo }}</b>@if (c.semana) { <span class="muted"> · Sem. {{ c.semana }}</span> }</td>
                        <td>{{ data.cortaDireccion(c.direccion) }}</td>
                        <td class="mono">{{ formatea(c.fechaLimite) }}</td>
                        <td>{{ restan(c.fechaLimite) }} día(s) hábil(es)</td>
                        <td><ui-badge [estado]="c.estado" /></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="muted"><ui-icon name="check-circle" [size]="15" /> Ningún control vence en los próximos 3 días hábiles.</p>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class PanelComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);
  private readonly oper = inject(OperatividadService);

  protected readonly urlEquipos = URL_GESTION_EQUIPOS;

  private readonly hoy = isoLocal(new Date());
  protected readonly esHabilHoy = this.habiles.esHabil(this.hoy);
  /** Período activo del sistema: el panel siempre habla del mes en curso. */
  private readonly periodo = this.plazos.periodoActivo(this.hoy);
  /** El panel también pone al día el período al abrirse; no hay nada que pulsar. */
  private readonly autoSync = inject(AutoSyncService);
  private readonly sincroniza = effect(() => this.autoSync.periodo(this.periodo.anio, this.periodo.mes));
  protected readonly mesActual = `${nombreMes(this.periodo.mes)} ${this.periodo.anio}`;
  protected readonly limiteMes = formateaFecha(this.plazos.fechaLimiteMensual(this.periodo.anio, this.periodo.mes));

  private readonly visibles = computed(() => this.data.controlesVisibles(this.auth.usuario()));

  /** Controles del período en curso (los que están corriendo este mes). */
  protected readonly delMes = computed(() =>
    this.visibles().filter((c) => c.anio === this.periodo.anio && c.mes === this.periodo.mes));

  protected cuenta(estados: string[]): number {
    return this.delMes().filter((c) => estados.includes(c.estado)).length;
  }

  protected readonly vencidosTotales = computed(() => this.visibles().filter((c) => c.estado === 'Vencido').length);
  protected readonly justificadosAnio = computed(() => this.visibles().filter((c) => c.estado === 'Justificado').length);

  protected readonly bitacorasHoy = computed(() => {
    const deHoy = this.data.bitacorasVisibles(this.auth.usuario()).filter((b) => b.fecha === this.hoy);
    return {
      total: deHoy.length,
      enviadas: deHoy.filter((b) => b.estado === 'Enviada' || b.estado === 'Enviada tarde').length,
      pendientes: deHoy.filter((b) => b.estado === 'Pendiente' || b.estado === 'En edición').length
    };
  });

  /** Controles abiertos cuyo límite cae dentro de los próximos 3 días hábiles. */
  protected readonly proximos = computed(() =>
    this.visibles()
      .filter((c) => ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado) && c.fechaLimite >= this.hoy)
      .filter((c) => this.habiles.habilesHasta(c.fechaLimite) <= 3)
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite))
      .slice(0, 8));

  protected restan(limite: string): number { return Math.max(this.habiles.habilesHasta(limite), 0); }
  protected formatea(iso: string): string { return formateaFecha(iso); }

  /** Operatividad por Dirección/Unidad del período en curso. */
  private readonly filtroOper = computed(() => ({ anio: this.periodo.anio, mes: this.periodo.mes }));
  protected readonly kpis = computed(() => this.oper.kpis(this.filtroOper()));
  protected readonly resumenOper = computed(() => this.oper.resumen(this.filtroOper()));
  protected readonly cargaSoportes = computed(() => this.oper.cargaSoportes(this.filtroOper()));

  /** Barra de carga relativa al técnico más cargado del período. */
  protected pctCarga(abiertos: number): number {
    const max = Math.max(...this.cargaSoportes().map((c) => c.abiertos), 1);
    return Math.round((abiertos / max) * 100);
  }

  protected readonly equiposIncidencia = computed(() =>
    this.kpis().reduce((n, k) => n + k.equiposIncidencia, 0));

  /** Eventos de Gestión de Equipos aún sin aplicar al inventario operativo. */
  protected readonly integracionPendiente = computed(() => this.data.eventosIntegracion().filter((e) => !e.aplicado));

  protected readonly equiposActivos = computed(() => this.data.inventarioVisible(this.auth.usuario())
    .filter((e) => e.estado === 'Activo en Dirección/Unidad').length);

  /**
   * Combinaciones control × Dirección/Unidad que **no aplican** este mes. Es informativo: no
   * cuentan como pendientes ni como vencidos, porque ese control no se trabaja ahí.
   */
  protected readonly noAplicables = computed(() => {
    const u = this.auth.usuario();
    const pares = this.auth.esTecnico() && u ? this.data.paresDe(u.usuario) : this.data.pares();
    const mensuales = this.data.catalogo().filter((c) => c.activo && ['Mensual', 'Semanal',
      'Semanal con entrega mensual consolidada'].includes(c.frecuencia));
    let n = 0;
    for (const c of mensuales) {
      for (const p of pares) if (!this.data.aplicaEn(c.codigo, p.direccion, p.unidad)) n++;
    }
    return n;
  });

  protected readonly alertas = computed<Alerta[]>(() => {
    const lista: Alerta[] = [];
    // ---- alertas por Dirección/Unidad (§19): cada una lleva a su detalle de operatividad
    for (const k of this.kpis()) {
      const ruta = `/controles/direccion/${k.direccion}/${k.unidad}`;
      if (k.estado === 'Sin soporte asignado') {
        lista.push({
          tipo: 'danger', titulo: 'Dirección/Unidad sin soporte responsable',
          texto: `${this.data.dirUnidad(k.direccion, k.unidad)} tiene ${k.aplicables} control(es) aplicables, pero no posee Técnico de Soporte asignado${k.equiposActivos ? `; además, ${k.equiposActivos} equipo(s) activo(s) quedan sin responsable` : ''}.`,
          ruta: '/distribucion'
        });
      }
      if (k.vencidos) {
        lista.push({
          tipo: 'danger', titulo: 'Dirección con controles vencidos',
          texto: `${this.data.dirUnidad(k.direccion, k.unidad)}: ${k.vencidos} control(es) vencieron el plazo sin carta de justificación.`,
          ruta
        });
      }
      if (k.estado === 'Crítica') {
        lista.push({
          tipo: 'danger', titulo: 'Dirección con baja operatividad',
          texto: `${this.data.dirUnidad(k.direccion, k.unidad)} cerró el período con ${k.operatividad} % de operatividad (menos del 75 % institucional).`,
          ruta
        });
      }
      if (k.bitacorasPendientes || k.bitacorasVencidas) {
        lista.push({
          tipo: 'warn', titulo: 'Dirección con bitácoras pendientes',
          texto: `${this.data.dirUnidad(k.direccion, k.unidad)}: ${k.bitacorasPendientes} bitácora(s) pendientes y ${k.bitacorasVencidas} vencida(s) en el período.`,
          ruta: '/bitacora'
        });
      }
      if (k.equiposActivos && k.ultimoF0422 === 'No aplica') {
        lista.push({
          tipo: 'warn', titulo: 'Equipos activos sin control F0422',
          texto: `${this.data.dirUnidad(k.direccion, k.unidad)} tiene ${k.equiposActivos} equipo(s) activo(s) y ningún F0422 programado en el período.`,
          ruta: '/catalogo'
        });
      }
      if (k.equiposIncidencia) {
        lista.push({
          tipo: 'warn', titulo: 'Dirección con incidencias en equipos',
          texto: `${this.data.dirUnidad(k.direccion, k.unidad)}: ${k.equiposIncidencia} equipo(s) con incidencia en atención al público, garantía o revisión.`,
          ruta: '/inventario'
        });
      }
    }
    if (this.integracionPendiente().length) {
      lista.push({
        tipo: 'warn', titulo: 'Movimientos de Gestión de Equipos por aplicar',
        texto: `${this.integracionPendiente().length} evento(s) de aceptación o descargo esperan incorporarse al inventario operativo.`,
        ruta: '/inventario'
      });
    }
    if (this.esHabilHoy && this.bitacorasHoy().pendientes > 0) {
      lista.push({ tipo: 'warn', titulo: 'Bitácoras diarias pendientes', texto: `${this.bitacorasHoy().pendientes} bitácora(s) de hoy aún sin enviar; el límite institucional es a las 5:00 p. m.`, ruta: '/bitacora' });
    }
    if (this.proximos().length) {
      lista.push({ tipo: 'warn', titulo: 'Controles por vencer', texto: `${this.proximos().length} control(es) vencen dentro de los próximos 3 días hábiles.`, ruta: '/controles' });
    }
    const sinControl = this.data.inventarioVisible(this.auth.usuario())
      .filter((e) => e.estado === 'Activo en Dirección/Unidad' && !this.data.controlesDeEquipo(e.inventario).length);
    if (sinControl.length) {
      lista.push({ tipo: 'warn', titulo: 'Equipos activos sin control asociado', texto: `${sinControl.length} equipo(s) del inventario operativo no aparecen en ningún control del año.`, ruta: '/inventario' });
    }
    // Primero lo crítico: las alertas rojas encabezan la lista.
    return lista.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'danger' ? -1 : 1));
  });

  /** El panel muestra las ocho primeras; el resto se consulta en cada pantalla. */
  protected readonly alertasVisibles = computed(() => this.alertas().slice(0, 8));

  protected readonly MESES = MESES;
}
