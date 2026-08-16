import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { ControlDeadlineService } from '../../core/services/control-deadline.service';
import { BadgeComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { MESES, formateaFecha, isoLocal, nombreMes } from '../../core/models/models';

interface Alerta { tipo: 'danger' | 'warn' | 'ok'; titulo: string; texto: string; ruta: string; }

/**
 * Panel ejecutivo: la fotografía del mes en curso para el rol conectado. Indicadores de
 * controles y bitácoras, alertas accionables y el avance por Dirección/Unidad.
 */
@Component({
  selector: 'app-panel',
  imports: [RouterLink, BadgeComponent, IconComponent],
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
        <div class="kpi"><div class="kpi-label">Controles del mes</div><div class="kpi-value">{{ delMes().length }}</div><div class="kpi-hint">{{ mesActual }}</div></div>
        <div class="kpi"><div class="kpi-label">Entregados</div><div class="kpi-value">{{ cuenta(['Entregado', 'Entregado tarde', 'Cerrado']) }}</div><div class="kpi-hint">{{ cuenta(['Entregado tarde']) }} fuera de plazo</div></div>
        <div class="kpi"><div class="kpi-label">Pendientes</div><div class="kpi-value">{{ cuenta(['Programado', 'Pendiente', 'En proceso']) }}</div><div class="kpi-hint">{{ cuenta(['En proceso']) }} en proceso</div></div>
        <div class="kpi"><div class="kpi-label">Vencidos</div><div class="kpi-value">{{ vencidosTotales() }}</div><div class="kpi-hint">de todo el año</div></div>
        <div class="kpi"><div class="kpi-label">Justificados</div><div class="kpi-value">{{ justificadosAnio() }}</div><div class="kpi-hint">cartas emitidas en 2026</div></div>
      </div>

      <div class="grid grid-3" style="margin-top: 14px;">
        <div class="kpi"><div class="kpi-label">Bitácoras enviadas hoy</div><div class="kpi-value">{{ bitacorasHoy().enviadas }}</div><div class="kpi-hint">{{ esHabilHoy ? 'de ' + bitacorasHoy().total + ' esperadas' : 'hoy no es día hábil' }}</div></div>
        <div class="kpi"><div class="kpi-label">Bitácoras pendientes hoy</div><div class="kpi-value">{{ bitacorasHoy().pendientes }}</div><div class="kpi-hint">límite 5:00 p. m.</div></div>
        <div class="kpi"><div class="kpi-label">Próximos a vencer</div><div class="kpi-value">{{ proximos().length }}</div><div class="kpi-hint">dentro de 3 días hábiles</div></div>
      </div>

      @if (alertas().length) {
        <div class="sec-title" style="margin-top: 26px;">Alertas del sistema</div>
        <div style="display: grid; gap: 8px;">
          @for (a of alertas(); track a.titulo + a.texto) {
            <a class="alert {{ a.tipo }}" [routerLink]="a.ruta" style="text-decoration: none; color: inherit;">
              <span class="alert-ico">!</span>
              <span><b>{{ a.titulo }}.</b> {{ a.texto }}</span>
            </a>
          }
        </div>
      }

      <div class="grid grid-2" style="margin-top: 26px; align-items: start;">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Avance por Dirección/Unidad</h3>
              <p class="sub">Controles del período {{ mesActual }}</p>
            </div>
            <a class="btn btn-ghost btn-sm" routerLink="/controles">Ver controles</a>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Dirección</th><th>Soporte responsable</th><th>Entregados</th><th>Pendientes</th><th>Avance</th></tr></thead>
                <tbody>
                  @for (f of porDireccion(); track f.id) {
                    <tr>
                      <td><b>{{ f.corta }}</b> · {{ f.nombre }}</td>
                      <td>@if (f.soporte) { {{ f.soporte }} } @else { <span class="badge danger">Sin asignar</span> }</td>
                      <td>{{ f.entregados }} / {{ f.total }}</td>
                      <td>{{ f.pendientes }}</td>
                      <td style="min-width: 120px;">
                        <div class="progress" [class.ok]="f.pct === 100"><span [style.width.%]="f.pct"></span></div>
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

  private readonly hoy = isoLocal(new Date());
  protected readonly esHabilHoy = this.habiles.esHabil(this.hoy);
  protected readonly mesActual = `${nombreMes(new Date().getMonth() + 1)} ${new Date().getFullYear()}`;
  protected readonly limiteMes = formateaFecha(this.plazos.fechaLimiteMensual(new Date().getFullYear(), new Date().getMonth() + 1));

  private readonly visibles = computed(() => this.data.controlesVisibles(this.auth.usuario()));

  /** Controles del período en curso (los que están corriendo este mes). */
  protected readonly delMes = computed(() => {
    const [a, m] = [new Date().getFullYear(), new Date().getMonth() + 1];
    return this.visibles().filter((c) => c.anio === a && c.mes === m);
  });

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
      .filter((c) => ['Programado', 'Pendiente', 'En proceso'].includes(c.estado) && c.fechaLimite >= this.hoy)
      .filter((c) => this.habiles.habilesHasta(c.fechaLimite) <= 3)
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite))
      .slice(0, 8));

  protected restan(limite: string): number { return Math.max(this.habiles.habilesHasta(limite), 0); }
  protected formatea(iso: string): string { return formateaFecha(iso); }

  protected readonly porDireccion = computed(() => {
    const delMes = this.delMes();
    const dirs = this.auth.esTecnico()
      ? this.data.direcciones().filter((d) => this.data.direccionesDe(this.auth.usuario()!.usuario).includes(d.id))
      : this.data.direcciones().filter((d) => d.activa);
    return dirs.map((d) => {
      const propios = delMes.filter((c) => c.direccion === d.id);
      const entregados = propios.filter((c) => ['Entregado', 'Entregado tarde', 'Cerrado', 'Justificado'].includes(c.estado)).length;
      return {
        id: d.id, corta: d.corta, nombre: d.nombre,
        soporte: this.data.soporteDe(d.id)?.tecnico ?? '',
        total: propios.length, entregados,
        pendientes: propios.filter((c) => ['Programado', 'Pendiente', 'En proceso'].includes(c.estado)).length,
        pct: propios.length ? Math.round((entregados / propios.length) * 100) : 0
      };
    });
  });

  protected readonly alertas = computed<Alerta[]>(() => {
    const lista: Alerta[] = [];
    for (const d of this.data.direccionesSinSoporte()) {
      lista.push({ tipo: 'danger', titulo: 'Dirección sin soporte asignado', texto: `${d.nombre} no tiene Técnico de Soporte responsable: sus controles del período no tienen quién los entregue.`, ruta: '/distribucion' });
    }
    const vencidosSinJustificar = this.visibles().filter((c) => c.estado === 'Vencido');
    if (vencidosSinJustificar.length) {
      lista.push({ tipo: 'danger', titulo: 'Controles vencidos sin justificación', texto: `${vencidosSinJustificar.length} control(es) vencieron el plazo de entrega establecido y no tienen carta de justificación.`, ruta: '/controles' });
    }
    if (this.esHabilHoy && this.bitacorasHoy().pendientes > 0) {
      lista.push({ tipo: 'warn', titulo: 'Bitácoras diarias pendientes', texto: `${this.bitacorasHoy().pendientes} bitácora(s) de hoy aún sin enviar; el límite institucional es a las 5:00 p. m.`, ruta: '/bitacora' });
    }
    if (this.proximos().length) {
      lista.push({ tipo: 'warn', titulo: 'Controles por vencer', texto: `${this.proximos().length} control(es) vencen dentro de los próximos 3 días hábiles.`, ruta: '/controles' });
    }
    const sinControl = this.data.inventario().filter((e) => e.estado === 'Activo en Dirección/Unidad' && !e.ultimoControl);
    if (sinControl.length) {
      lista.push({ tipo: 'warn', titulo: 'Equipos activos sin control asociado', texto: `${sinControl.length} equipo(s) del inventario operativo no registran ningún control.`, ruta: '/inventario' });
    }
    return lista;
  });

  protected readonly MESES = MESES;
}
