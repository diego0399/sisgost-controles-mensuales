import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { BusinessDayService } from '../../core/services/business-day.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { formateaFecha, isoLocal } from '../../core/models/models';

/**
 * Bitácora diaria del Técnico de Soporte: una por Dirección/Unidad y día hábil, con envío
 * obligatorio antes de las 5:00 p. m. La prioridad de la bitácora es que el equipo de
 * atención al público esté funcionando.
 */
@Component({
  selector: 'app-bitacora',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, DocumentoComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Operación</div>
          <h1>
            Bitácora diaria
            <ui-help texto="La bitácora del día debe enviarse antes de las 5:00 p. m. Si se envía después queda marcada «Enviada tarde»; si el día termina sin envío, queda «Vencida». No puede cerrarse sin revisar todo el equipo de atención al público." />
          </h1>
          <p class="page-sub">
            @if (esHabilHoy) { Hoy es día hábil: la bitácora de cada Dirección debe enviarse antes de las <b>5:00 p. m.</b> }
            @else { Hoy no es día hábil: no se genera bitácora diaria. }
          </p>
        </div>
      </div>

      @if (deHoy().length) {
        <div class="sec-title">Bitácoras de hoy · {{ formatea(hoy) }}</div>
        <div class="grid grid-3" style="margin-bottom: 20px;">
          @for (b of deHoy(); track b.id) {
            <div class="card">
              <div class="card-pad">
                <div class="row-between" style="margin-bottom: 6px;">
                  <b>{{ data.cortaDireccion(b.direccion) }} · {{ data.nombreDireccion(b.direccion) }}</b>
                  <ui-badge [estado]="b.estado" />
                </div>
                <p class="muted" style="font-size: 12.5px; margin-bottom: 12px;">
                  Responsable: {{ b.responsable }}
                  @if (b.horaEnvio) { · enviada a las {{ b.horaEnvio }} }
                </p>
                <a class="btn btn-sm" [class.btn-primary]="puedeEditar(b)" [class.btn-outline]="!puedeEditar(b)" [routerLink]="['/bitacora', b.id]">
                  {{ puedeEditar(b) ? 'Completar bitácora' : 'Ver bitácora' }}
                </a>
              </div>
            </div>
          }
        </div>
      }

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Historial de bitácoras</h3>
            <p class="sub">{{ filtradas().length }} bitácoras</p>
          </div>
          <div class="row">
            <select class="control" [(ngModel)]="fDireccion">
              <option value="">Todas las direcciones</option>
              @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.corta }} — {{ d.nombre }}</option> }
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
              <thead><tr><th>Fecha</th><th>Dirección/Unidad</th><th>Responsable</th><th>Hora de envío</th><th>Fallas del día</th><th>Actividades</th><th>Estado</th><th>Acciones</th></tr></thead>
              <tbody>
                @for (b of filtradas(); track b.id) {
                  <tr>
                    <td class="mono">{{ formatea(b.fecha) }}</td>
                    <td>{{ data.cortaDireccion(b.direccion) }}</td>
                    <td>{{ b.responsable }}</td>
                    <td class="mono">{{ b.horaEnvio ?? '—' }}</td>
                    <td>
                      @if (fallas(b) > 0) { <span class="badge warn">{{ fallas(b) }} falla(s)</span> }
                      @else { <span class="muted">Sin fallas</span> }
                    </td>
                    <td>{{ b.actividades.length }}</td>
                    <td><ui-badge [estado]="b.estado" /></td>
                    <td>
                      <div class="row" style="gap: 6px;">
                        <a class="btn btn-ghost btn-sm" [routerLink]="['/bitacora', b.id]">{{ puedeEditar(b) ? 'Completar' : 'Ver detalle' }}</a>
                        @if (b.documento) { <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(b.documento!)">Ver documento</button> }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="muted">Sin bitácoras para los filtros seleccionados.</td></tr>
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
export class BitacoraComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);

  protected readonly hoy = isoLocal(new Date());
  protected readonly esHabilHoy = this.habiles.esHabil(this.hoy);
  protected readonly fDireccion = signal('');
  protected readonly fEstado = signal('');
  protected readonly verDoc = signal('');
  protected readonly estados = ['Pendiente', 'En edición', 'Enviada', 'Enviada tarde', 'Vencida', 'Observada', 'Cerrada'];

  private readonly visibles = computed(() => this.data.bitacorasVisibles(this.auth.usuario()));

  protected readonly deHoy = computed(() => this.visibles().filter((b) => b.fecha === this.hoy));

  protected readonly filtradas = computed(() => this.visibles()
    .filter((b) => !this.fDireccion() || b.direccion === this.fDireccion())
    .filter((b) => !this.fEstado() || b.estado === this.fEstado())
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.direccion.localeCompare(b.direccion)));

  protected fallas(b: { revision: { estado: string }[] }): number {
    return b.revision.filter((r) => r.estado === 'Presenta falla').length;
  }

  protected puedeEditar(b: { estado: string; direccion: string }): boolean {
    const u = this.auth.usuario();
    if (!u || u.clave === 'jefatura') return false;
    if (!['Pendiente', 'En edición'].includes(b.estado)) return false;
    if (u.clave === 'tec-soporte') return this.data.direccionesDe(u.usuario).includes(b.direccion);
    return true;
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
