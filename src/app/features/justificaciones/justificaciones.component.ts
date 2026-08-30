import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { formateaFecha, nombreMes } from '../../core/models/models';

/**
 * Justificaciones: las cartas emitidas cuando un control no tuvo actividad mensual
 * (GLPI sin tiquetes, traslado de cintas sin visita…). La carta sustituye al control
 * vacío y lleva las tres firmas del formato institucional.
 */
@Component({
  selector: 'app-justificaciones',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, DocumentoComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Operación</div>
          <h1>
            Justificaciones
            <ui-help texto="Si un control mensual no tuvo actividad, no debe quedar simplemente vacío: se cierra con una carta de justificación basada en el formato institucional (Formatos_nuevos_2025_.docx), firmada por el técnico, el Coordinador de Soporte Técnico y el Encargado de Soporte." />
          </h1>
          <p class="page-sub">Cartas de justificación emitidas por período y Dirección/Registro.</p>
        </div>
        <a class="btn btn-outline" routerLink="/controles">Justificar desde un control</a>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px;">
        <div class="kpi"><div class="kpi-label">Cartas emitidas</div><div class="kpi-value">{{ visibles().length }}</div><div class="kpi-hint">en 2026</div></div>
        <div class="kpi"><div class="kpi-label">Aceptadas</div><div class="kpi-value">{{ cuenta('Aceptada') }}</div><div class="kpi-hint">con las tres firmas</div></div>
        <div class="kpi"><div class="kpi-label">En trámite</div><div class="kpi-value">{{ cuenta('Emitida') + cuenta('En revisión') }}</div><div class="kpi-hint">con firmas pendientes</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Cartas de justificación</h3>
            <p class="sub">La carta se genera desde el control correspondiente («Justificar sin actividad»)</p>
          </div>
          <div class="row">
            <select class="control" [(ngModel)]="fDireccion">
              <option value="">Todas las direcciones</option>
              @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.corta }} — {{ d.nombre }}</option> }
            </select>
            <select class="control" [(ngModel)]="fControl">
              <option value="">Todos los controles</option>
              @for (c of codigos(); track c) { <option [value]="c">{{ c }}</option> }
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Control</th><th>Período</th><th>Dirección/Registro</th><th>Responsable</th><th>Motivo</th><th>Fecha</th><th>Firmas</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (j of filtradas(); track j.id) {
                  <tr>
                    <td><b>{{ j.codigoControl }}</b></td>
                    <td>{{ nombreMes(j.mes) }} {{ j.anio }}</td>
                    <td>{{ data.cortaDireccion(j.direccion) }} <span class="muted">/ {{ j.unidad }}</span></td>
                    <td>{{ j.responsable }}</td>
                    <td style="max-width: 260px;">{{ j.motivo }}</td>
                    <td class="mono">{{ formatea(j.fecha) }}</td>
                    <td>{{ firmasRegistradas(j) }} / {{ j.firmas.length }}</td>
                    <td><ui-badge [estado]="j.estado" /></td>
                    <td>
                      @if (j.documento) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(j.documento!)">Ver carta</button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="muted">Sin cartas de justificación para los filtros seleccionados.</td></tr>
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
export class JustificacionesComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);

  protected readonly fDireccion = signal('');
  protected readonly fControl = signal('');
  protected readonly verDoc = signal('');

  protected readonly visibles = computed(() => {
    const u = this.auth.usuario();
    if (u?.clave !== 'tec-soporte') return this.data.justificaciones();
    const propias = this.data.direccionesDe(u.usuario);
    return this.data.justificaciones().filter((j) => propias.includes(j.direccion));
  });

  protected readonly filtradas = computed(() => this.visibles()
    .filter((j) => !this.fDireccion() || j.direccion === this.fDireccion())
    .filter((j) => !this.fControl() || j.codigoControl === this.fControl())
    .sort((a, b) => b.fecha.localeCompare(a.fecha)));

  protected readonly codigos = computed(() => [...new Set(this.visibles().map((j) => j.codigoControl))].sort());

  protected cuenta(estado: string): number { return this.visibles().filter((j) => j.estado === estado).length; }
  protected firmasRegistradas(j: { firmas: { estado: string }[] }): number {
    return j.firmas.filter((f) => f.estado === 'Registrada').length;
  }
  protected nombreMes(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }
}
