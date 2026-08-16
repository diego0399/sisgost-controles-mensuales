import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { ControlCatalogo, Frecuencia } from '../../core/models/models';

/**
 * Catálogo de controles: los formatos institucionales modelados desde la carpeta real de
 * controles, con su frecuencia configurable y sus reglas (evidencia, firma, justificación).
 * El Administrador edita; el Encargado consulta.
 */
@Component({
  selector: 'app-catalogo',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Catálogo de controles
            <ui-help texto="La frecuencia y las reglas de cada control no van quemadas en el código: se configuran aquí. Un control semanal genera una instancia por semana; uno eventual solo cuando hay actividad, y si no la hay se cierra con carta de justificación." />
          </h1>
          <p class="page-sub">{{ data.catalogo().length }} controles modelados desde los formatos físicos de la carpeta de controles.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Código</th><th>Nombre del control</th><th>Frecuencia</th><th>Aplica a</th><th>Evidencia</th><th>Firma</th><th>Justificación</th><th>Formulario</th><th>Estado</th>@if (auth.esAdmin()) { <th></th> }</tr></thead>
              <tbody>
                @for (c of data.catalogo(); track c.codigo) {
                  <tr [style.opacity]="c.activo ? 1 : .55">
                    <td><b class="mono">{{ c.codigo }}</b><div class="muted" style="font-size: 11px;">{{ c.version }}</div></td>
                    <td style="max-width: 300px;">{{ c.nombre }}<div class="muted" style="font-size: 11.5px;">{{ c.descripcion.slice(0, 90) }}…</div></td>
                    <td><ui-badge [estado]="c.frecuencia" /></td>
                    <td>{{ c.aplicaA === 'Todas' ? 'Todas las direcciones' : c.aplicaA.length + ' direcciones' }}</td>
                    <td>{{ c.requiereEvidencia ? 'Sí' : 'No' }}</td>
                    <td>{{ c.requiereFirma ? 'Sí' : 'No' }}</td>
                    <td>{{ c.permiteJustificacion ? 'Sí' : 'No' }}</td>
                    <td>{{ c.plantilla.length }} secciones</td>
                    <td><ui-badge [estado]="c.activo ? 'Activo' : 'Inactivo'" /></td>
                    @if (auth.esAdmin()) {
                      <td><button class="btn btn-ghost btn-sm" type="button" (click)="editar(c)">Editar</button></td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      @if (edicion(); as e) {
        <ui-modal [titulo]="'Editar ' + e.codigo" [sub]="e.nombre" (cerrar)="edicion.set(null)">
          <div class="form-grid">
            <div class="field">
              <label for="frec">Frecuencia</label>
              <select id="frec" class="control" [(ngModel)]="e.frecuencia">
                @for (f of frecuencias; track f) { <option [value]="f">{{ f }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="activo">Estado</label>
              <select id="activo" class="control" [(ngModel)]="e.activo">
                <option [ngValue]="true">Activo</option>
                <option [ngValue]="false">Inactivo</option>
              </select>
            </div>
            <div class="field">
              <label for="evid">Requiere evidencia</label>
              <select id="evid" class="control" [(ngModel)]="e.requiereEvidencia">
                <option [ngValue]="true">Sí</option><option [ngValue]="false">No</option>
              </select>
            </div>
            <div class="field">
              <label for="jus">Permite justificación</label>
              <select id="jus" class="control" [(ngModel)]="e.permiteJustificacion">
                <option [ngValue]="true">Sí</option><option [ngValue]="false">No</option>
              </select>
            </div>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="edicion.set(null)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardar()">Guardar cambios</button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class CatalogoComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly frecuencias: Frecuencia[] = ['Mensual', 'Semanal', 'Diaria', 'Eventual', 'Programado'];
  protected readonly edicion = signal<ControlCatalogo | null>(null);

  protected editar(c: ControlCatalogo): void {
    this.edicion.set(structuredClone(c));
  }

  protected guardar(): void {
    const e = this.edicion();
    if (!e) return;
    this.data.actualizarCatalogo(e, this.auth.usuario()!);
    this.edicion.set(null);
    this.toast.ok('Catálogo actualizado', `${e.codigo}: frecuencia ${e.frecuencia.toLowerCase()}, ${e.activo ? 'activo' : 'inactivo'}.`);
  }
}
