import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { DistribucionSoporte, formateaFecha, isoLocal } from '../../core/models/models';

/**
 * Distribución de soportes: qué Técnico de Soporte responde por cada Dirección/Unidad.
 * Esta tabla gobierna la asignación de controles y bitácoras, el filtro del inventario
 * operativo y la alerta de «Dirección sin soporte asignado».
 */
@Component({
  selector: 'app-distribucion',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Distribución de soportes
            <ui-help texto="Cada Dirección/Unidad tiene un Técnico de Soporte responsable, y un técnico puede atender varias Direcciones. Los controles y bitácoras se asignan al soporte responsable según esta distribución." />
          </h1>
          <p class="page-sub">Asignaciones de Técnicos de Soporte por Dirección/Unidad.</p>
        </div>
        @if (auth.esAdmin() || auth.esEncargado()) {
          <button class="btn btn-primary" type="button" (click)="nueva()">Nueva asignación</button>
        }
      </div>

      @if (data.direccionesSinSoporte().length) {
        <div class="alert danger" style="margin-bottom: 16px;">
          <span class="alert-ico">!</span>
          <span>
            <b>Direcciones sin soporte responsable:</b>
            {{ nombresSinSoporte() }}. Sus controles del período no tienen quién los entregue.
          </span>
        </div>
      }

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Asignaciones</h3>
            <p class="sub">{{ filtradas().length }} asignaciones</p>
          </div>
          <select class="control" [(ngModel)]="fEstado">
            <option value="">Activas y finalizadas</option>
            <option value="Activa">Solo activas</option>
            <option value="Finalizada">Solo finalizadas</option>
          </select>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Técnico de Soporte</th><th>Dirección</th><th>Unidad</th><th>Fecha de inicio</th><th>Estado</th><th>Observaciones</th>@if (auth.esAdmin() || auth.esEncargado()) { <th></th> }</tr></thead>
              <tbody>
                @for (d of filtradas(); track d.id) {
                  <tr [style.opacity]="d.estado === 'Activa' ? 1 : .6">
                    <td><b>{{ d.tecnico }}</b></td>
                    <td>{{ data.nombreDireccion(d.direccion) }}</td>
                    <td>{{ d.unidad }}</td>
                    <td class="mono">{{ formatea(d.fechaInicio) }}</td>
                    <td><ui-badge [estado]="d.estado" /></td>
                    <td style="max-width: 280px;">{{ d.observaciones || '—' }}</td>
                    @if (auth.esAdmin() || auth.esEncargado()) {
                      <td>
                        @if (d.estado === 'Activa') {
                          <button class="btn btn-ghost btn-sm" type="button" (click)="finalizar(d)">Finalizar</button>
                        }
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      @if (modal()) {
        <ui-modal titulo="Nueva asignación de soporte" sub="El técnico asignado responde por los controles y la bitácora de la Dirección/Unidad" (cerrar)="modal.set(false)">
          <div class="form-grid">
            <div class="field">
              <label for="na-tec">Técnico de Soporte <span style="color: var(--danger)">*</span></label>
              <select id="na-tec" class="control" [(ngModel)]="nuevoUsuario">
                <option value="">Seleccione…</option>
                @for (u of tecnicos(); track u.usuario) { <option [value]="u.usuario">{{ u.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-dir">Dirección <span style="color: var(--danger)">*</span></label>
              <select id="na-dir" class="control" [(ngModel)]="nuevaDireccion">
                <option value="">Seleccione…</option>
                @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-uni">Unidad</label>
              <select id="na-uni" class="control" [(ngModel)]="nuevaUnidad">
                <option value="Todas las unidades">Todas las unidades</option>
                @for (u of unidadesDe(); track u) { <option [value]="u">{{ u }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-obs">Observaciones</label>
              <input id="na-obs" class="control" [(ngModel)]="nuevaObs" />
            </div>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="modal.set(false)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardar()">Asignar</button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class DistribucionComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly fEstado = signal('');
  protected readonly modal = signal(false);
  protected nuevoUsuario = '';
  protected nuevaDireccion = '';
  protected nuevaUnidad = 'Todas las unidades';
  protected nuevaObs = '';

  protected readonly filtradas = computed(() => this.data.distribucion()
    .filter((d) => !this.fEstado() || d.estado === this.fEstado())
    .sort((a, b) => a.estado.localeCompare(b.estado) || a.direccion.localeCompare(b.direccion)));

  protected readonly tecnicos = computed(() => this.data.usuarios().filter((u) => u.clave === 'tec-soporte'));

  protected unidadesDe(): string[] {
    return this.data.direccionDe(this.nuevaDireccion)?.unidades ?? [];
  }

  protected nombresSinSoporte(): string {
    return this.data.direccionesSinSoporte().map((d) => d.nombre).join('; ');
  }

  protected nueva(): void {
    this.nuevoUsuario = '';
    this.nuevaDireccion = '';
    this.nuevaUnidad = 'Todas las unidades';
    this.nuevaObs = '';
    this.modal.set(true);
  }

  protected guardar(): void {
    const tecnico = this.tecnicos().find((t) => t.usuario === this.nuevoUsuario);
    if (!tecnico || !this.nuevaDireccion) {
      this.toast.warn('Datos incompletos', 'Seleccione el técnico y la Dirección a asignar.');
      return;
    }
    this.data.guardarDistribucion({
      id: '', usuario: tecnico.usuario, tecnico: tecnico.nombre, direccion: this.nuevaDireccion,
      unidad: this.nuevaUnidad, fechaInicio: isoLocal(new Date()), estado: 'Activa', observaciones: this.nuevaObs.trim()
    }, this.auth.usuario()!);
    this.modal.set(false);
    this.toast.ok('Soporte asignado', `${tecnico.nombre} queda como responsable de ${this.data.nombreDireccion(this.nuevaDireccion)}.`);
  }

  protected finalizar(d: DistribucionSoporte): void {
    this.data.guardarDistribucion({ ...d, estado: 'Finalizada', observaciones: `${d.observaciones ? d.observaciones + ' · ' : ''}Finalizada el ${formateaFecha(isoLocal(new Date()))}.` }, this.auth.usuario()!);
    this.toast.ok('Asignación finalizada', `${d.tecnico} deja de responder por ${this.data.nombreDireccion(d.direccion)}.`);
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
