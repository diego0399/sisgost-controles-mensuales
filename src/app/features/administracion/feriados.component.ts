import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../core/services/data.service';
import { HolidayService } from '../../core/services/holiday.service';
import { ControlDeadlineService } from '../../core/services/control-deadline.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { Feriado, formateaFecha, nombreMes } from '../../core/models/models';

/**
 * Catálogo editable de feriados de El Salvador y de San Salvador. Ninguna fecha va quemada
 * en código: cambiar este catálogo cambia el cálculo de días hábiles y, con él, todas las
 * fechas límite de los controles.
 */
@Component({
  selector: 'app-feriados',
  imports: [FormsModule, BadgeComponent, HelpTipComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Feriados
            <ui-help texto="La fecha límite de los controles mensuales es el tercer día hábil del mes siguiente. Este catálogo define qué días NO son hábiles además de sábados y domingos; al editarlo cambian las fechas límite en todo el sistema." />
          </h1>
          <p class="page-sub">Catálogo configurable de días festivos nacionales y de la plaza de San Salvador.</p>
        </div>
      </div>

      <div class="grid grid-2" style="align-items: start;">
        <div class="card">
          <div class="card-head">
            <div><h3>Catálogo de feriados</h3><p class="sub">{{ feriadosSrv.feriados().length }} fechas registradas</p></div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Fecha</th><th>Feriado</th><th>Ámbito</th><th></th></tr></thead>
                <tbody>
                  @for (f of feriadosSrv.feriados(); track f.fecha + f.nombre) {
                    <tr>
                      <td class="mono">{{ formatea(f.fecha) }}</td>
                      <td>{{ f.nombre }}</td>
                      <td><ui-badge [estado]="f.ambito" /></td>
                      <td><button class="btn btn-ghost btn-sm" type="button" (click)="eliminar(f)">Eliminar</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card-head"><div><h3>Agregar feriado</h3><p class="sub">Se aplica de inmediato al cálculo de plazos</p></div></div>
            <div class="card-body">
              <div class="form-grid">
                <div class="field">
                  <label for="fe-fecha">Fecha <span style="color: var(--danger)">*</span></label>
                  <input id="fe-fecha" class="control" type="date" [(ngModel)]="fecha" />
                </div>
                <div class="field">
                  <label for="fe-ambito">Ámbito</label>
                  <select id="fe-ambito" class="control" [(ngModel)]="ambito">
                    <option>Nacional</option>
                    <option>San Salvador</option>
                  </select>
                </div>
                <div class="field span-2">
                  <label for="fe-nombre">Nombre del feriado <span style="color: var(--danger)">*</span></label>
                  <input id="fe-nombre" class="control" [(ngModel)]="nombre" placeholder="Ej.: Fiestas patronales…" />
                </div>
              </div>
              <div class="row" style="justify-content: flex-end; margin-top: 14px;">
                <button class="btn btn-primary" type="button" (click)="agregar()">Agregar al catálogo</button>
              </div>
            </div>
          </div>

          <div class="card" style="margin-top: 16px;">
            <div class="card-head"><div><h3>Fechas límite resultantes · 2026</h3><p class="sub">Tercer día hábil del mes siguiente a cada período</p></div></div>
            <div class="card-body">
              <div class="table-wrap">
                <table class="tbl">
                  <thead><tr><th>Período del control</th><th>Fecha límite de entrega</th></tr></thead>
                  <tbody>
                    @for (l of limites(); track l.mes) {
                      <tr><td>{{ l.periodo }}</td><td class="mono">{{ l.limite }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class FeriadosComponent {
  protected readonly data = inject(DataService);
  protected readonly feriadosSrv = inject(HolidayService);
  private readonly plazos = inject(ControlDeadlineService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  protected fecha = '';
  protected nombre = '';
  protected ambito: Feriado['ambito'] = 'Nacional';

  /** Vista previa del efecto del catálogo: los 12 límites del año. */
  protected readonly limites = computed(() => {
    // Se lee la señal para recalcular al editar el catálogo.
    this.feriadosSrv.feriados();
    return Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      periodo: `${nombreMes(i + 1)} 2026`,
      limite: formateaFecha(this.plazos.fechaLimiteMensual(2026, i + 1))
    }));
  });

  protected agregar(): void {
    if (!this.fecha || !this.nombre.trim()) {
      this.toast.warn('Datos incompletos', 'Indique la fecha y el nombre del feriado.');
      return;
    }
    this.feriadosSrv.agregar({ fecha: this.fecha, nombre: this.nombre.trim(), ambito: this.ambito });
    this.data.registrarEvento(this.auth.usuario(), { accion: 'Catálogo de feriados actualizado', observacion: `Se agregó «${this.nombre.trim()}» (${formateaFecha(this.fecha)}, ${this.ambito}).` });
    this.toast.ok('Feriado agregado', 'Las fechas límite se recalcularon con el nuevo catálogo.');
    this.fecha = '';
    this.nombre = '';
  }

  protected eliminar(f: Feriado): void {
    this.feriadosSrv.eliminar(f);
    this.data.registrarEvento(this.auth.usuario(), { accion: 'Catálogo de feriados actualizado', observacion: `Se eliminó «${f.nombre}» (${formateaFecha(f.fecha)}).` });
    this.toast.ok('Feriado eliminado', 'Las fechas límite se recalcularon con el nuevo catálogo.');
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
