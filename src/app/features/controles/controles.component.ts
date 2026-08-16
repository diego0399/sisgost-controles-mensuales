import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { MESES, formateaFecha, isoLocal, nombreMes } from '../../core/models/models';

/**
 * Controles del período: lo que cada Técnico de Soporte debe entregar por Dirección/Unidad,
 * con su fecha límite calculada en días hábiles y los días restantes. El Encargado ve todas
 * las direcciones; el Técnico, solo las suyas.
 */
@Component({
  selector: 'app-controles',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, DocumentoComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Operación</div>
          <h1>
            Controles mensuales
            <ui-help texto="Los controles mensuales se entregan dentro de los primeros 3 días hábiles del mes siguiente al período que cubren. Sábados, domingos y los feriados del catálogo no cuentan como días hábiles." />
          </h1>
          <p class="page-sub">Controles asignados por Dirección/Unidad según la distribución de soportes.</p>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px;">
        <div class="kpi"><div class="kpi-label">Del período</div><div class="kpi-value">{{ filtrados().length }}</div><div class="kpi-hint">{{ nombreMes(mes()) }} {{ anio() }}</div></div>
        <div class="kpi"><div class="kpi-label">Por entregar</div><div class="kpi-value">{{ cuenta(['Programado', 'Pendiente', 'En proceso']) }}</div><div class="kpi-hint">límite {{ limiteVisible() }}</div></div>
        <div class="kpi"><div class="kpi-label">Entregados</div><div class="kpi-value">{{ cuenta(['Entregado', 'Entregado tarde', 'En revisión', 'Observado', 'Cerrado']) }}</div><div class="kpi-hint">{{ cuenta(['Entregado tarde']) }} tarde</div></div>
        <div class="kpi"><div class="kpi-label">Vencidos / justificados</div><div class="kpi-value">{{ cuenta(['Vencido']) }} / {{ cuenta(['Justificado']) }}</div><div class="kpi-hint">del período visible</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Controles del período</h3>
            <p class="sub">Seleccione un control para completarlo, entregarlo o justificarlo</p>
          </div>
          <div class="row">
            <select class="control" [(ngModel)]="mes">
              @for (m of MESES; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }
            </select>
            <select class="control" [(ngModel)]="fDireccion">
              <option value="">Todas las direcciones</option>
              @for (d of direccionesVisibles(); track d.id) { <option [value]="d.id">{{ d.corta }} — {{ d.nombre }}</option> }
            </select>
            <select class="control" [(ngModel)]="fEstado">
              <option value="">Todos los estados</option>
              @for (e of estados; track e) { <option [value]="e">{{ e }}</option> }
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr><th>Control</th><th>Período</th><th>Dirección/Unidad</th><th>Responsable</th><th>Fecha límite</th><th>Días restantes</th><th>Avance</th><th>Estado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                @for (c of filtrados(); track c.id) {
                  <tr>
                    <td>
                      <b>{{ c.codigo }}</b>
                      <div class="muted" style="font-size: 11.5px; max-width: 260px;">{{ data.catalogoDe(c.codigo)?.nombre }}</div>
                    </td>
                    <td>{{ c.semana ? 'Semana ' + c.semana + ' de ' : '' }}{{ nombreMes(c.mes) }}</td>
                    <td>{{ data.cortaDireccion(c.direccion) }}</td>
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

      <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
    </div>
  `
})
export class ControlesComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);

  protected readonly MESES = MESES;
  protected readonly anio = signal(2026);
  protected readonly mes = signal(new Date().getMonth() + 1);
  protected readonly fDireccion = signal('');
  protected readonly fEstado = signal('');
  protected readonly verDoc = signal('');

  protected readonly estados = ['Programado', 'Pendiente', 'En proceso', 'En revisión', 'Entregado',
    'Entregado tarde', 'Vencido', 'Justificado', 'Observado', 'Cerrado'];

  protected readonly direccionesVisibles = computed(() => {
    const u = this.auth.usuario();
    if (u?.clave === 'tec-soporte') {
      const propias = this.data.direccionesDe(u.usuario);
      return this.data.direcciones().filter((d) => propias.includes(d.id));
    }
    return this.data.direcciones();
  });

  protected readonly filtrados = computed(() => this.data.controlesVisibles(this.auth.usuario())
    .filter((c) => c.anio === this.anio() && c.mes === this.mes())
    .filter((c) => !this.fDireccion() || c.direccion === this.fDireccion())
    .filter((c) => !this.fEstado() || c.estado === this.fEstado())
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || (a.semana ?? 0) - (b.semana ?? 0) || a.direccion.localeCompare(b.direccion)));

  protected cuenta(estados: string[]): number {
    return this.filtrados().filter((c) => estados.includes(c.estado)).length;
  }

  protected abierto(estado: string): boolean {
    return ['Programado', 'Pendiente', 'En proceso'].includes(estado);
  }

  /** El técnico opera solo sus direcciones; jefatura nunca opera. */
  protected puedeOperar(c: { direccion: string }): boolean {
    const u = this.auth.usuario();
    if (!u || u.clave === 'jefatura') return false;
    if (u.clave === 'tec-soporte') return this.data.direccionesDe(u.usuario).includes(c.direccion);
    return true;
  }

  protected restan(limite: string): number { return this.habiles.habilesHasta(limite, isoLocal(new Date())); }
  protected limiteVisible(): string {
    const primero = this.filtrados().find((c) => !c.semana);
    return primero ? formateaFecha(primero.fechaLimite) : '—';
  }
  protected nombreMes(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }
}
