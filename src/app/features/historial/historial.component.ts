import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { OperatividadService } from '../../core/services/operatividad.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { MESES, formateaFecha, nombreMes } from '../../core/models/models';

/**
 * Historial anual: los doce meses del año con su resumen visual y el detalle filtrable
 * por Dirección, técnico, tipo de control y estado. Desde aquí se genera el reporte
 * mensual consolidado para la jefatura del área.
 */
@Component({
  selector: 'app-historial',
  imports: [FormsModule, RouterLink, BadgeComponent, DocumentoComponent],
  styles: `
    .meses { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
    .mes-card {
      border: 1px solid var(--line); border-radius: 12px; background: var(--surface);
      padding: 13px 15px; cursor: pointer; text-align: left; font-family: inherit; width: 100%;
      transition: border-color .12s, box-shadow .12s;
    }
    .mes-card:hover { border-color: var(--blue-500); box-shadow: var(--shadow-1); }
    .mes-card.on { border-color: var(--blue-600); box-shadow: 0 0 0 2px var(--blue-100); }
    .mes-card.vacio { opacity: .5; cursor: default; }
    .mes-nom { font-weight: 700; color: var(--navy-900); font-size: 13.5px; display: flex; justify-content: space-between; align-items: baseline; }
    .mes-nom small { font-weight: 500; color: var(--tx-3); }
    .mes-bar { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: var(--neutral-bg); margin: 9px 0 7px; }
    .mes-bar span { display: block; height: 100%; }
    .mes-det { font-size: 11px; color: var(--tx-2); display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .pip { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 3px; }
    .col-num { text-align: center; }
    .fila-sel { background: var(--blue-50, #eef4fc); }
    @media (max-width: 1100px) { .meses { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 760px) { .meses { grid-template-columns: repeat(2, 1fr); } }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Seguimiento</div>
          <h1>Historial anual</h1>
          <p class="page-sub">Controles que se debían entregar en cada mes, con su entrega, responsable y documento generado.</p>
        </div>
        <div class="row">
          <select class="control" style="width: 120px;" [(ngModel)]="anio">
            @for (a of anios; track a) { <option [ngValue]="a">{{ a }}</option> }
          </select>
          @if (!auth.esTecnico()) {
            <button class="btn btn-gold" type="button" (click)="generarReporte()">Generar reporte mensual consolidado</button>
          }
        </div>
      </div>

      <div class="meses">
        @for (m of resumenMeses(); track m.mes) {
          <button type="button" class="mes-card" [class.on]="m.mes === mesSel()" [class.vacio]="!m.total" (click)="m.total && mesSel.set(m.mes)">
            <div class="mes-nom">{{ m.nombre }} <small>{{ m.total }} controles</small></div>
            <div class="mes-bar" [title]="m.entregados + ' entregados · ' + m.tarde + ' tarde · ' + m.justificados + ' justificados · ' + m.vencidos + ' vencidos · ' + m.abiertos + ' abiertos'">
              @if (m.total) {
                <span style="background: var(--ok)" [style.width.%]="pct(m.entregados, m.total)"></span>
                <span style="background: var(--warn)" [style.width.%]="pct(m.tarde, m.total)"></span>
                <span style="background: var(--gold-500)" [style.width.%]="pct(m.justificados, m.total)"></span>
                <span style="background: var(--danger)" [style.width.%]="pct(m.vencidos, m.total)"></span>
              }
            </div>
            <div class="mes-det">
              <span><span class="pip" style="background: var(--ok)"></span>{{ m.entregados }} a tiempo</span>
              <span><span class="pip" style="background: var(--warn)"></span>{{ m.tarde }} tarde</span>
              <span><span class="pip" style="background: var(--gold-500)"></span>{{ m.justificados }} justif.</span>
              <span><span class="pip" style="background: var(--danger)"></span>{{ m.vencidos }} vencidos</span>
              @if (m.abiertos) { <span>{{ m.abiertos }} abiertos</span> }
            </div>
          </button>
        }
      </div>

      <!-- Historial por Dirección/Unidad: operatividad mes a mes -->
      @if (fDireccion() && parSeleccionado()) {
        <div class="card" style="margin-top: 20px;">
          <div class="card-head">
            <div>
              <h3>{{ data.dirUnidad(fDireccion(), unidadSel()) }} — Año {{ anio() }}</h3>
              <p class="sub">
                Operatividad mes a mes: controles entregados y justificados sobre los aplicables,
                más el cumplimiento de la bitácora diaria donde la hay
              </p>
            </div>
            <button class="btn btn-outline btn-sm" type="button" (click)="reporteAnual()">
              Reporte anual por Dirección
            </button>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Mes</th><th class="col-num">Aplicables</th><th class="col-num">Entregados</th>
                  <th class="col-num">Pendientes</th><th class="col-num">Vencidos</th><th class="col-num">Justificados</th>
                  <th class="col-num">Bitácoras</th><th style="min-width: 140px;">Operatividad</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  @for (k of anual(); track $index; let i = $index) {
                    <tr [class.fila-sel]="mesSel() === i + 1">
                      <td><b>{{ nombreMesCorto(i + 1) }}</b></td>
                      <td class="col-num">{{ k.aplicables }}</td>
                      <td class="col-num">{{ k.entregados + k.entregadosTarde }}</td>
                      <td class="col-num">{{ k.pendientes }}</td>
                      <td class="col-num">{{ k.vencidos }}</td>
                      <td class="col-num">{{ k.justificados }}</td>
                      <td class="col-num">{{ k.bitacorasEnviadas + k.bitacorasTarde }} / {{ k.bitacoras }}</td>
                      <td>
                        @if (k.aplicables) {
                          <div class="row" style="gap: 8px; flex-wrap: nowrap;">
                            <b class="mono">{{ k.operatividad }} %</b>
                            <div class="progress" style="flex: 1;" [class.ok]="k.operatividad >= 90">
                              <span [style.width.%]="k.operatividad"></span>
                            </div>
                          </div>
                        } @else { <span class="muted">—</span> }
                      </td>
                      <td><ui-badge [estado]="k.estado" /></td>
                      <td><button class="btn btn-ghost btn-sm" type="button" (click)="mesSel.set(i + 1)">Ver mes</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="row" style="margin-top: 12px;">
              <a class="btn btn-outline btn-sm" [routerLink]="['/controles/direccion', fDireccion(), unidadSel()]">
                Ver detalle de operatividad de la Dirección/Unidad
              </a>
            </div>
          </div>
        </div>
      }

      <div class="card" style="margin-top: 20px;">
        <div class="card-head">
          <div>
            <h3>Detalle de {{ nombreMesSel() }} {{ anio() }}</h3>
            <p class="sub">{{ filtrados().length }} de {{ delMes().length }} controles del mes</p>
          </div>
          <div class="row" style="flex-wrap: wrap;">
            <select class="control" style="width: 190px;" [(ngModel)]="fDireccion" (ngModelChange)="fUnidad.set('')">
              <option value="">Todas las direcciones</option>
              @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.corta }} — {{ d.nombre }}</option> }
            </select>
            <select class="control" style="width: 175px;" [(ngModel)]="fUnidad" [disabled]="!fDireccion()">
              <option value="">Todas las unidades</option>
              @for (u of unidadesDe(); track u) { <option [value]="u">{{ u }}</option> }
            </select>
            <select class="control" style="width: 180px;" [(ngModel)]="fTecnico">
              <option value="">Todos los técnicos</option>
              @for (t of tecnicos(); track t) { <option [value]="t">{{ t }}</option> }
            </select>
            <select class="control" style="width: 160px;" [(ngModel)]="fCodigo">
              <option value="">Todos los controles</option>
              @for (c of data.catalogo(); track c.codigo) { <option [value]="c.codigo">{{ c.codigo }}</option> }
            </select>
            <select class="control" style="width: 160px;" [(ngModel)]="fEstado">
              <option value="">Todos los estados</option>
              @for (e of estados; track e) { <option [value]="e">{{ e }}</option> }
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Control</th><th>Período</th><th>Dirección/Unidad</th><th>Responsable</th><th>Fecha límite</th><th>Entrega</th><th>Estado</th><th>Documento</th></tr></thead>
              <tbody>
                @for (c of filtrados(); track c.id) {
                  <tr>
                    <td><b>{{ c.codigo }}</b></td>
                    <td>{{ c.semana ? 'Semana ' + c.semana : nombreMesCorto(c.mes) }}</td>
                    <td>{{ data.cortaDireccion(c.direccion) }} <span class="muted">/ {{ c.unidad }}</span></td>
                    <td>{{ c.responsable }}</td>
                    <td class="mono">{{ formatea(c.fechaLimite) }}</td>
                    <td class="mono">{{ c.fechaEntrega ? formatea(c.fechaEntrega) : '—' }}</td>
                    <td><ui-badge [estado]="c.estado" /></td>
                    <td>
                      @if (c.documento) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(c.documento!)">Ver documento</button>
                      } @else if (c.justificacion) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="verJustificacion(c.justificacion!)">Ver carta</button>
                      } @else {
                        <a class="btn btn-ghost btn-sm" [routerLink]="['/controles', c.id]">Abrir control</a>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="muted">Sin controles para los filtros seleccionados.</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (fDireccion() && noAplican().length) {
            <div class="divider"></div>
            <div class="sec-title">Controles que no aplican a esta Dirección</div>
            <p class="muted" style="font-size: 12.5px; margin-bottom: 8px;">
              Según la configuración «Aplica a» del catálogo, estos controles no se trabajan aquí.
              Es un estado informativo: no se cuentan como pendientes ni vencen.
            </p>
            <div class="row" style="gap: 6px;">
              @for (n of noAplican(); track n.codigo + n.unidad) {
                <span class="badge" [title]="n.motivo">
                  {{ n.codigo }} · {{ n.unidad }} — No aplica
                </span>
              }
            </div>
          }
        </div>
      </div>

      <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
    </div>
  `
})
export class HistorialComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly oper = inject(OperatividadService);

  protected readonly anios = [2026];
  protected readonly anio = signal(2026);
  protected readonly mesSel = signal(new Date().getMonth() + 1);
  protected readonly fDireccion = signal('');
  protected readonly fUnidad = signal('');
  protected readonly fTecnico = signal('');
  protected readonly fCodigo = signal('');
  protected readonly fEstado = signal('');
  protected readonly verDoc = signal('');

  protected readonly estados = ['Programado', 'Pendiente', 'En proceso', 'En revisión', 'Entregado',
    'Entregado tarde', 'Vencido', 'Justificado', 'Observado', 'Cerrado'];

  private readonly visibles = computed(() =>
    this.data.controlesVisibles(this.auth.usuario()).filter((c) => c.anio === this.anio()));

  protected readonly resumenMeses = computed(() => MESES.map((nombre, i) => {
    const mes = i + 1;
    const del = this.visibles().filter((c) => c.mes === mes);
    return {
      mes, nombre,
      total: del.length,
      entregados: del.filter((c) => ['Entregado', 'Cerrado', 'Observado', 'En revisión'].includes(c.estado)).length,
      tarde: del.filter((c) => c.estado === 'Entregado tarde').length,
      justificados: del.filter((c) => c.estado === 'Justificado').length,
      vencidos: del.filter((c) => c.estado === 'Vencido').length,
      abiertos: del.filter((c) => ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado)).length
    };
  }));

  protected pct(n: number, total: number): number { return total ? (n / total) * 100 : 0; }
  protected nombreMesSel(): string { return nombreMes(this.mesSel()); }
  protected nombreMesCorto(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }

  protected readonly tecnicos = computed(() =>
    [...new Set(this.visibles().map((c) => c.responsable))].sort());

  protected readonly delMes = computed(() => this.visibles().filter((c) => c.mes === this.mesSel()));

  // ------------------------------------------------------------------ historial por Dirección/Unidad

  /** Unidad del historial por Dirección: la elegida o la primera de la Dirección. */
  protected readonly unidadSel = computed(() => {
    if (this.fUnidad()) return this.fUnidad();
    return this.data.direccionDe(this.fDireccion())?.unidades[0] ?? '';
  });

  protected readonly parSeleccionado = computed(() => !!this.fDireccion() && !!this.unidadSel());

  /** Operatividad de los doce meses del año para la Dirección/Unidad seleccionada. */
  protected readonly anual = computed(() =>
    this.parSeleccionado() ? this.oper.anual(this.fDireccion(), this.unidadSel(), this.anio()) : []);

  protected readonly unidadesDe = computed(() => this.data.direccionDe(this.fDireccion())?.unidades ?? []);

  protected reporteAnual(): void {
    const doc = this.data.generarReporteDireccion('Reporte anual por Dirección', {
      anio: this.anio(), mes: this.mesSel(), direccion: this.fDireccion(), unidad: this.unidadSel()
    }, this.auth.usuario()!);
    this.verDoc.set(doc);
    this.toast.ok('Reporte anual generado',
      `${this.data.dirUnidad(this.fDireccion(), this.unidadSel())} · ${this.anio()}.`);
  }

  /**
   * Controles activos que NO aplican a la Dirección filtrada. Se muestran como «No aplica»
   * —informativo— para que la ausencia de un control no se lea como un olvido.
   */
  protected readonly noAplican = computed(() => {
    const dir = this.fDireccion();
    if (!dir) return [];
    const unidades = this.data.direccionDe(dir)?.unidades ?? [];
    const salida: { codigo: string; unidad: string; motivo: string }[] = [];
    for (const u of unidades) {
      for (const c of this.data.controlesNoAplicablesDe(dir, u)) {
        salida.push({
          codigo: c.codigo, unidad: u,
          motivo: `${c.nombre} — ${c.aplicacion.observaciones || 'No configurado para esta Dirección/Unidad.'}`
        });
      }
    }
    return salida;
  });

  protected readonly filtrados = computed(() => this.delMes()
    .filter((c) => !this.fDireccion() || c.direccion === this.fDireccion())
    .filter((c) => !this.fUnidad() || c.unidad === this.fUnidad())
    .filter((c) => !this.fTecnico() || c.responsable === this.fTecnico())
    .filter((c) => !this.fCodigo() || c.codigo === this.fCodigo())
    .filter((c) => !this.fEstado() || c.estado === this.fEstado())
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || (a.semana ?? 0) - (b.semana ?? 0) || a.direccion.localeCompare(b.direccion)));

  protected verJustificacion(idJus: string): void {
    const j = this.data.justificaciones().find((x) => x.id === idJus);
    if (j?.documento) this.verDoc.set(j.documento);
  }

  /** Reporte consolidado del mes seleccionado (todas las direcciones o la filtrada). */
  protected generarReporte(): void {
    const doc = this.data.generarReporteMensual(this.anio(), this.mesSel(), this.fDireccion(), this.auth.usuario()!);
    this.verDoc.set(doc);
    this.toast.ok('Reporte generado', `Reporte mensual consolidado de ${nombreMes(this.mesSel())} ${this.anio()}.`);
  }
}
