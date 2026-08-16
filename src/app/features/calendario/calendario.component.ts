import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { HolidayService } from '../../core/services/holiday.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { ControlDeadlineService } from '../../core/services/control-deadline.service';
import { IconComponent } from '../../shared/icon';
import { BadgeComponent } from '../../shared/ui';
import { formateaFecha, isoLocal, nombreMes } from '../../core/models/models';

interface Dia {
  iso: string;
  numero: number;
  delMes: boolean;
  hoy: boolean;
  finDeSemana: boolean;
  feriado?: string;
  /** Controles cuya fecha límite cae este día. */
  limites: { id: string; codigo: string; direccion: string; estado: string; semana?: number }[];
  /** Límites que no caben en la celda (el detalle completo está en la tabla inferior). */
  masLimites: number;
  bitacora: boolean;
}

/**
 * Calendario del mes: días hábiles y feriados del catálogo, fechas límite de los controles
 * (los mensuales del período anterior vencen aquí, dentro de los primeros 3 días hábiles)
 * y los días con bitácora diaria.
 */
@Component({
  selector: 'app-calendario',
  imports: [RouterLink, IconComponent, BadgeComponent],
  styles: `
    .cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
    .cal-h { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--tx-3); text-align: center; padding: 6px 0; }
    .cal-d {
      min-height: 96px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
      padding: 8px 9px; display: flex; flex-direction: column; gap: 5px; font-size: 12px;
    }
    .cal-d.fuera { opacity: .38; background: var(--surface-2); }
    .cal-d.finde { background: var(--surface-2); }
    .cal-d.feriado { background: var(--warn-bg); border-color: var(--warn-line); }
    .cal-d.hoy { border-color: var(--blue-600); box-shadow: 0 0 0 2px var(--blue-100); }
    .cal-num { font-weight: 700; color: var(--navy-900); display: flex; align-items: center; gap: 6px; }
    .cal-num .f-nom { font-weight: 500; font-size: 10.5px; color: var(--gold-700, #8a6d1a); line-height: 1.2; }
    .cal-lim {
      display: block; border-radius: 7px; padding: 3px 7px; font-size: 11px; font-weight: 600;
      background: var(--blue-100); color: var(--blue-700, #1d4f8f); text-decoration: none; line-height: 1.3;
    }
    .cal-lim.vencido { background: var(--danger-bg); color: var(--danger); }
    .cal-lim.listo { background: var(--ok-bg); color: var(--ok); }
    .cal-bit { font-size: 10.5px; color: var(--tx-3); margin-top: auto; display: inline-flex; align-items: center; gap: 4px; }
    .cal-mas { font-size: 10.5px; font-weight: 600; color: var(--blue-600); }
    .leyenda { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--tx-2); margin-top: 14px; }
    .leyenda .muestra { display: inline-block; width: 12px; height: 12px; border-radius: 4px; vertical-align: -1px; margin-right: 5px; border: 1px solid var(--line-strong); }
    @media (max-width: 900px) { .cal-d { min-height: 74px; } }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Seguimiento</div>
          <h1>Calendario de controles</h1>
          <p class="page-sub">
            Los controles mensuales de {{ nombreMesPrevio() }} vencen el <b>{{ limitePrevio() }}</b>
            (tercer día hábil de {{ nombreMesVista() }}); sábados, domingos y feriados no cuentan como hábiles.
          </p>
        </div>
        <div class="row">
          <button class="btn btn-outline btn-sm" type="button" (click)="mueve(-1)"><ui-icon name="chevron" [size]="13" style="transform: rotate(180deg)" /> Mes anterior</button>
          <button class="btn btn-outline btn-sm" type="button" (click)="hoyMes()">Hoy</button>
          <button class="btn btn-outline btn-sm" type="button" (click)="mueve(1)">Mes siguiente <ui-icon name="chevron" [size]="13" /></button>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>{{ nombreMesVista() }} {{ anio() }}</h3>
            <p class="sub">{{ habilesDelMes() }} días hábiles en el mes · bitácora diaria en cada día hábil</p>
          </div>
        </div>
        <div class="card-body">
          <div class="cal">
            @for (h of encabezados; track h) { <div class="cal-h">{{ h }}</div> }
            @for (d of dias(); track d.iso) {
              <div class="cal-d" [class.fuera]="!d.delMes" [class.finde]="d.finDeSemana" [class.feriado]="!!d.feriado" [class.hoy]="d.hoy">
                <div class="cal-num">
                  {{ d.numero }}
                  @if (d.feriado) { <span class="f-nom">{{ d.feriado }}</span> }
                </div>
                @for (l of d.limites; track l.id) {
                  <a class="cal-lim" [class.vencido]="l.estado === 'Vencido'"
                     [class.listo]="['Entregado', 'Entregado tarde', 'Cerrado', 'Justificado'].includes(l.estado)"
                     [routerLink]="['/controles', l.id]"
                     title="Fecha límite de {{ l.codigo }} — {{ data.cortaDireccion(l.direccion) }} ({{ l.estado }})">
                    {{ l.codigo }}@if (l.semana) { · S{{ l.semana }} } · {{ data.cortaDireccion(l.direccion) }}
                  </a>
                }
                @if (d.masLimites > 0) { <span class="cal-mas">+{{ d.masLimites }} control(es) más en la tabla</span> }
                @if (d.bitacora) { <span class="cal-bit"><ui-icon name="sun" [size]="11" /> Bitácora diaria</span> }
              </div>
            }
          </div>

          <div class="leyenda">
            <span><span class="muestra" style="background: var(--warn-bg);"></span>Feriado (catálogo editable)</span>
            <span><span class="muestra" style="background: var(--surface-2);"></span>Fin de semana</span>
            <span><span class="muestra" style="background: var(--blue-100);"></span>Fecha límite de control</span>
            <span><span class="muestra" style="background: var(--ok-bg);"></span>Límite con control ya entregado o justificado</span>
            <span><span class="muestra" style="background: var(--danger-bg);"></span>Límite con control vencido</span>
          </div>
        </div>
      </div>

      @if (limitesDelMes().length) {
        <div class="card" style="margin-top: 18px;">
          <div class="card-head">
            <div>
              <h3>Fechas límite dentro de {{ nombreMesVista() }}</h3>
              <p class="sub">Todo control con vencimiento en el mes visible</p>
            </div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Fecha límite</th><th>Control</th><th>Período que cubre</th><th>Dirección</th><th>Responsable</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  @for (c of limitesDelMes(); track c.id) {
                    <tr>
                      <td class="mono">{{ formatea(c.fechaLimite) }}</td>
                      <td><b>{{ c.codigo }}</b></td>
                      <td>{{ c.semana ? 'Semana ' + c.semana + ' de ' : '' }}{{ periodo(c.mes) }}</td>
                      <td>{{ data.cortaDireccion(c.direccion) }} <span class="muted">/ {{ c.unidad }}</span></td>
                      <td>{{ c.responsable }}</td>
                      <td><ui-badge [estado]="c.estado" /></td>
                      <td><a class="btn btn-ghost btn-sm" [routerLink]="['/controles', c.id]">Abrir</a></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class CalendarioComponent {
  protected readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly feriadosSrv = inject(HolidayService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);

  protected readonly encabezados = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  protected readonly anio = signal(new Date().getFullYear());
  protected readonly mes = signal(new Date().getMonth() + 1);

  protected mueve(paso: number): void {
    let m = this.mes() + paso;
    let a = this.anio();
    if (m < 1) { m = 12; a--; }
    if (m > 12) { m = 1; a++; }
    this.mes.set(m);
    this.anio.set(a);
  }

  protected hoyMes(): void {
    this.anio.set(new Date().getFullYear());
    this.mes.set(new Date().getMonth() + 1);
  }

  protected nombreMesVista(): string { return nombreMes(this.mes()); }
  protected nombreMesPrevio(): string { return this.mes() === 1 ? `${nombreMes(12)} ${this.anio() - 1}` : nombreMes(this.mes() - 1); }
  protected limitePrevio(): string {
    const [a, m] = this.mes() === 1 ? [this.anio() - 1, 12] : [this.anio(), this.mes() - 1];
    return formateaFecha(this.plazos.fechaLimiteMensual(a, m));
  }
  protected periodo(mes: number): string { return `${nombreMes(mes)}`; }
  protected formatea(iso: string): string { return formateaFecha(iso); }

  private readonly visibles = computed(() => this.data.controlesVisibles(this.auth.usuario()));

  /** Controles cuya fecha límite cae dentro del mes visible. */
  protected readonly limitesDelMes = computed(() => {
    const pref = `${this.anio()}-${String(this.mes()).padStart(2, '0')}`;
    return this.visibles()
      .filter((c) => c.fechaLimite.startsWith(pref))
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite) || a.codigo.localeCompare(b.codigo));
  });

  protected readonly habilesDelMes = computed(() => {
    let n = 0;
    const ultimo = new Date(this.anio(), this.mes(), 0).getDate();
    for (let d = 1; d <= ultimo; d++) {
      if (this.habiles.esHabil(isoLocal(new Date(this.anio(), this.mes() - 1, d)))) n++;
    }
    return n;
  });

  protected readonly dias = computed<Dia[]>(() => {
    const a = this.anio();
    const m = this.mes();
    const hoy = isoLocal(new Date());
    const primero = new Date(a, m - 1, 1);
    // Lunes de la semana del día 1.
    const desplaza = (primero.getDay() + 6) % 7;
    const inicio = new Date(a, m - 1, 1 - desplaza);
    const limites = this.limitesDelMes();
    const celdas: Dia[] = [];
    for (let i = 0; i < 42; i++) {
      const f = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      const iso = isoLocal(f);
      const delMes = f.getMonth() === m - 1;
      const finDeSemana = f.getDay() === 0 || f.getDay() === 6;
      const feriado = this.feriadosSrv.esFeriado(iso);
      const delDia = delMes ? limites.filter((c) => c.fechaLimite === iso) : [];
      celdas.push({
        iso, numero: f.getDate(), delMes, hoy: iso === hoy, finDeSemana,
        feriado: feriado ? feriado.nombre : undefined,
        limites: delDia.slice(0, 4).map((c) => ({ id: c.id, codigo: c.codigo, direccion: c.direccion, estado: c.estado, semana: c.semana })),
        masLimites: Math.max(delDia.length - 4, 0),
        bitacora: delMes && !finDeSemana && !feriado && iso <= hoy
      });
    }
    // Recorta la sexta semana si quedó completamente fuera del mes.
    return celdas.length > 35 && celdas.slice(35).every((c) => !c.delMes) ? celdas.slice(0, 35) : celdas;
  });
}
