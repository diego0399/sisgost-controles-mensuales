import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AutoSyncService } from '../../core/services/auto-sync.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { ControlDeadlineService } from '../../core/services/control-deadline.service';
import { EstadoOperatividad, OperatividadService } from '../../core/services/operatividad.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { KpiDireccionesComponent } from '../../shared/kpi-direcciones';
import { MESES, formateaFecha, isoLocal, nombreMes } from '../../core/models/models';

/**
 * Controles del período organizados **por Dirección/Registro**, que es como se atienden: cada
 * Dirección/Registro tiene su Técnico de Soporte responsable según la distribución.
 *
 * - **Vista por Dirección** (predeterminada): tarjetas de operatividad y tabla comparativa; desde
 *   ahí se entra al detalle de cada Dirección/Registro.
 * - **Vista general**: la tabla plana de todos los controles, que se conserva para búsquedas.
 *
 * El Técnico de Soporte solo ve las Direcciones/Registros que tiene asignadas.
 */
@Component({
  selector: 'app-controles',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, DocumentoComponent, KpiDireccionesComponent],
  styles: `
    .vista-tabs { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 9px; overflow: hidden; }
    .vista-tabs button {
      border: 0; background: var(--surface); color: var(--tx-2); font-family: inherit; font-size: 12.5px;
      padding: 8px 16px; cursor: pointer; border-left: 1px solid var(--line);
    }
    .vista-tabs button:first-child { border-left: 0; }
    .vista-tabs button.on { background: var(--navy-800); color: #fff; font-weight: 600; }
    .filtros-barra { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .filtros-barra .control { width: 175px; }
    .mis-dir { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Operación</div>
          <h1>
            Controles mensuales
            <ui-help texto="Los controles se organizan por ámbito territorial: en San Salvador, por Dirección/Registro; en los demás departamentos, por Departamento completo. Cada ámbito tiene su Técnico de Soporte responsable según la distribución. Se entregan dentro de los primeros 3 días hábiles del mes siguiente al período que cubren." />
          </h1>
          <p class="page-sub">
            @if (auth.esTecnico()) { Mis Direcciones/Registros asignadas y los controles que me corresponden. }
            @else { Operatividad por ámbito territorial según la distribución de soportes y la aplicación de cada control. }
          </p>
          @if (auth.esTecnico()) {
            <div class="mis-dir">
              @for (p of misPares(); track p.direccion + p.unidad) {
                <span class="badge">{{ data.cortaDireccion(p.direccion) }} · {{ p.unidad }}</span>
              } @empty { <span class="badge danger">Sin Direcciones/Registros asignadas</span> }
            </div>
          }
        </div>
        <div class="vista-tabs">
          <button type="button" [class.on]="vista() === 'direccion'" (click)="vista.set('direccion')">Vista por Dirección</button>
          <button type="button" [class.on]="vista() === 'general'" (click)="vista.set('general')">Vista general</button>
        </div>
      </div>

      <!-- Filtros globales del período -->
      <div class="card" style="margin-bottom: 18px;">
        <div class="card-body filtros-barra">
          <select class="control" [(ngModel)]="anio">
            @for (a of anios; track a) { <option [ngValue]="a">{{ a }}</option> }
          </select>
          <select class="control" [(ngModel)]="mes">
            @for (m of MESES; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }
          </select>
          <select class="control" [(ngModel)]="fZona" (ngModelChange)="fDireccion.set(''); fUnidad.set('')">
            <option value="">Todas las zonas</option>
            @for (z of data.territorio.zonasOrdenadas(); track z.id) { <option [value]="z.id">{{ z.nombre }}</option> }
          </select>
          <select class="control" [(ngModel)]="fDireccion" (ngModelChange)="fUnidad.set('')">
            <option value="">Todos los departamentos</option>
            @for (d of direccionesVisibles(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
          </select>
          <select class="control" [(ngModel)]="fUnidad">
            <option value="">Todas las Direcciones/Registros</option>
            @for (u of unidadesVisibles(); track u) { <option [value]="u">{{ u }}</option> }
          </select>
          <select class="control" [(ngModel)]="fTecnico">
            <option value="">Todos los técnicos</option>
            @for (t of data.tecnicosSoporte(); track t.usuario) { <option [value]="t.nombre">{{ t.nombre }}</option> }
          </select>
          @if (vista() === 'general') {
            <select class="control" [(ngModel)]="fCodigo">
              <option value="">Todos los controles</option>
              @for (c of data.catalogo(); track c.codigo) { <option [value]="c.codigo">{{ c.codigo }}</option> }
            </select>
            <select class="control" [(ngModel)]="fEstado">
              <option value="">Todos los estados</option>
              @for (e of estados; track e) { <option [value]="e">{{ e }}</option> }
            </select>
          } @else {
            <select class="control" [(ngModel)]="fNivel">
              <option value="">Toda la operatividad</option>
              @for (n of niveles; track n) { <option [value]="n">{{ n }}</option> }
            </select>
          }
          <span class="muted" style="margin-left: auto;">
            Fecha límite del período: <b class="mono">{{ formatea(limitePeriodo()) }}</b>
          </span>
        </div>
      </div>

      @if (vista() === 'direccion') {
        <!-- KPIs globales del período -->
        <div class="grid grid-5" style="margin-bottom: 18px;">
          <div class="kpi"><div class="kpi-label">Direcciones/Registros</div><div class="kpi-value">{{ resumen().total }}</div><div class="kpi-hint">{{ resumen().promedio }} % de operatividad promedio</div></div>
          <div class="kpi"><div class="kpi-label">Operativas</div><div class="kpi-value">{{ resumen().operativas }}</div><div class="kpi-hint">90 % o más</div></div>
          <div class="kpi"><div class="kpi-label">En observación</div><div class="kpi-value">{{ resumen().observacion }}</div><div class="kpi-hint">entre 75 % y 89 %</div></div>
          <div class="kpi"><div class="kpi-label">Críticas</div><div class="kpi-value">{{ resumen().criticas }}</div><div class="kpi-hint">menos de 75 %</div></div>
          <div class="kpi"><div class="kpi-label">Sin soporte asignado</div><div class="kpi-value">{{ resumen().sinSoporte }}</div><div class="kpi-hint">nadie puede entregar</div></div>
        </div>

        <div class="sec-title">Operatividad por Departamento y Dirección/Registro · {{ nombreMes(mes()) }} {{ anio() }}</div>
        <ui-kpi-direcciones [kpis]="kpis()" modo="tarjetas" />

        <div class="card" style="margin-top: 20px;">
          <div class="card-head">
            <div>
              <h3>Comparativo por Dirección</h3>
              <p class="sub">
                Operatividad = controles entregados y justificados sobre los aplicables
                (70 %) más el cumplimiento de la bitácora diaria (30 %) donde la hay
              </p>
            </div>
          </div>
          <div class="card-body">
            <ui-kpi-direcciones [kpis]="kpis()" modo="tabla" />
          </div>
        </div>
      } @else {
        <div class="grid grid-4" style="margin-bottom: 18px;">
          <div class="kpi"><div class="kpi-label">Del período</div><div class="kpi-value">{{ filtrados().length }}</div><div class="kpi-hint">{{ nombreMes(mes()) }} {{ anio() }}</div></div>
          <div class="kpi"><div class="kpi-label">Por entregar</div><div class="kpi-value">{{ cuenta(['Programado', 'Pendiente', 'En proceso', 'Listo para entregar']) }}</div><div class="kpi-hint">límite {{ formatea(limitePeriodo()) }}</div></div>
          <div class="kpi"><div class="kpi-label">Entregados</div><div class="kpi-value">{{ cuenta(['Entregado', 'Entregado tarde', 'En revisión', 'Observado', 'Cerrado']) }}</div><div class="kpi-hint">{{ cuenta(['Entregado tarde']) }} tarde</div></div>
          <div class="kpi"><div class="kpi-label">Vencidos / justificados</div><div class="kpi-value">{{ cuenta(['Vencido']) }} / {{ cuenta(['Justificado']) }}</div><div class="kpi-hint">del período visible</div></div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h3>Controles del período</h3>
              <p class="sub">Vista general: todos los controles aplicables del período, sin agrupar</p>
            </div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr><th>Control</th><th>Período</th><th>Departamento / Dirección·Registro</th><th>Responsable</th><th>Fecha límite</th><th>Días restantes</th><th>Avance</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  @for (c of filtrados(); track c.id) {
                    <tr>
                      <td>
                        <b>{{ c.codigo }}</b>
                        <div class="muted" style="font-size: 11.5px; max-width: 260px;">{{ data.catalogoDe(c.codigo)?.nombre }}</div>
                      </td>
                      <td>{{ c.semana ? 'Semana ' + c.semana + ' de ' : '' }}{{ nombreMes(c.mes) }}</td>
                      <td>{{ data.cortaDireccion(c.direccion) }} <span class="muted">/ {{ c.unidad }}</span></td>
                      <td>{{ c.responsable }}</td>
                      <td class="mono">{{ formatea(c.fechaLimite) }}</td>
                      <td>
                        @if (abierto(c.estado)) {
                          @if (restan(c.fechaLimite) >= 0) {
                            <span [class.mono]="true">{{ restan(c.fechaLimite) }} hábil(es)</span>
                          } @else {
                            <span class="badge danger">Plazo vencido</span>
                          }
                        } @else { <span class="muted">—</span> }
                      </td>
                      <td style="min-width: 90px;">
                        <div class="progress" [class.ok]="c.avance === 100"><span [style.width.%]="c.avance"></span></div>
                      </td>
                      <td><ui-badge [estado]="c.estado" /></td>
                      <td>
                        <div class="row" style="gap: 6px;">
                          <a class="btn btn-ghost btn-sm" [routerLink]="['/controles', c.id]">
                            {{ abierto(c.estado) && puedeOperar(c) ? 'Completar' : 'Ver detalle' }}
                          </a>
                          @if (c.documento) {
                            <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(c.documento!)">Ver documento</button>
                          }
                        </div>
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="9" class="muted">Sin controles para los filtros seleccionados.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }

      <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
    </div>
  `
})
export class ControlesComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);
  private readonly oper = inject(OperatividadService);
  private readonly plazos = inject(ControlDeadlineService);

  /**
   * La pantalla abre en el **período activo**: el mes actual del sistema. Si el usuario elige otro
   * mes, su selección se respeta mientras permanezca en la pantalla.
   */
  private readonly periodo = this.plazos.periodoActivo();

  protected readonly MESES = MESES;
  protected readonly anios = [2026];
  protected readonly anio = signal(this.periodo.anio);
  protected readonly mes = signal(this.periodo.mes);
  /** Zona del catálogo territorial: acota los departamentos que ofrecen los demás filtros. */
  protected readonly fZona = signal('');
  protected readonly fDireccion = signal('');
  protected readonly fUnidad = signal('');
  protected readonly fTecnico = signal('');
  protected readonly fCodigo = signal('');
  protected readonly fEstado = signal('');
  protected readonly fNivel = signal<EstadoOperatividad | ''>('');
  protected readonly verDoc = signal('');

  /** Sincronización automática del período visible: sin botones, se dispara sola. */
  private readonly autoSync = inject(AutoSyncService);
  private readonly sincroniza = effect(() => this.autoSync.periodo(this.anio(), this.mes()));


  /** La vista por Dirección es la predeterminada; la general queda a un clic. */
  protected readonly vista = signal<'direccion' | 'general'>('direccion');

  protected readonly estados = ['Programado', 'Pendiente', 'En proceso', 'En revisión', 'Entregado',
    'Entregado tarde', 'Vencido', 'Justificado', 'Observado', 'Cerrado'];
  protected readonly niveles: EstadoOperatividad[] = ['Operativa', 'En observación', 'Crítica',
    'En curso', 'Sin soporte asignado', 'Sin controles aplicables'];

  /** Direcciones/Registros del técnico conectado (cabecera «Mis Direcciones asignadas»). */
  protected readonly misPares = computed(() => {
    const u = this.auth.usuario();
    return u ? this.data.paresDe(u.usuario) : [];
  });

  protected readonly direccionesVisibles = computed(() => {
    const u = this.auth.usuario();
    const zona = this.fZona();
    const base = zona
      ? this.data.direcciones().filter((d) => this.data.territorio.zonaDe(d.id) === zona)
      : this.data.direcciones();
    // El Técnico de Soporte solo ve los departamentos que atiende, según el rol ACTIVO: quien es
    // Encargado y Técnico a la vez ve todo mientras opera como Encargado.
    if (u?.clave === 'tec-soporte') {
      const propias = this.data.direccionesDe(u.usuario);
      return base.filter((d) => propias.includes(d.id));
    }
    return base;
  });

  protected readonly unidadesVisibles = computed(() => {
    const dir = this.fDireccion();
    const pares = this.auth.esTecnico() ? this.misPares() : this.data.pares();
    return [...new Set(pares.filter((p) => !dir || p.direccion === dir).map((p) => p.unidad))];
  });

  private readonly filtro = computed(() => ({
    anio: this.anio(), mes: this.mes(), zona: this.fZona(),
    direccion: this.fDireccion(), unidad: this.fUnidad(),
    tecnico: this.fTecnico(), nivel: this.fNivel()
  }));

  protected readonly kpis = computed(() => this.oper.kpis(this.filtro()));
  protected readonly resumen = computed(() => this.oper.resumen(this.filtro()));
  protected limitePeriodo(): string { return this.kpis()[0]?.fechaLimite ?? ''; }

  /**
   * Vista general: controles del período, del alcance del usuario, activos en el catálogo y
   * aplicables a su Dirección/Registro. Un control que no aplica no se lista ni cuenta.
   */
  protected readonly filtrados = computed(() => this.data.controlesVisibles(this.auth.usuario())
    .filter((c) => c.anio === this.anio() && c.mes === this.mes())
    .filter((c) => this.data.catalogoDe(c.codigo)?.activo !== false)
    .filter((c) => this.data.aplicaEn(c.codigo, c.direccion, c.unidad))
    .filter((c) => !this.fZona() || this.data.territorio.zonaDe(c.direccion) === this.fZona())
    .filter((c) => !this.fDireccion() || c.direccion === this.fDireccion())
    .filter((c) => !this.fUnidad() || c.unidad === this.fUnidad())
    .filter((c) => !this.fTecnico() || c.responsable === this.fTecnico())
    .filter((c) => !this.fCodigo() || c.codigo === this.fCodigo())
    .filter((c) => !this.fEstado() || c.estado === this.fEstado())
    .sort((a, b) => a.direccion.localeCompare(b.direccion) || a.unidad.localeCompare(b.unidad)
      || a.codigo.localeCompare(b.codigo) || (a.semana ?? 0) - (b.semana ?? 0)));

  protected cuenta(estados: string[]): number {
    return this.filtrados().filter((c) => estados.includes(c.estado)).length;
  }

  protected abierto(estado: string): boolean {
    return ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(estado);
  }

  /** El técnico opera solo sus Direcciones/Registros; el Coordinador nunca opera. */
  protected puedeOperar(c: { direccion: string; unidad: string }): boolean {
    const u = this.auth.usuario();
    if (!u || u.clave === 'coordinador') return false;
    return this.data.atiende(u, c.direccion, c.unidad);
  }

  protected restan(limite: string): number { return this.habiles.habilesHasta(limite, isoLocal(new Date())); }
  protected nombreMes(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }
}
