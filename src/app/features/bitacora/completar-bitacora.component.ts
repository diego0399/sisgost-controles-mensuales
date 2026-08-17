import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { IconComponent } from '../../shared/icon';
import { ActividadDia, RevisionAtencion, formateaFecha, isoLocal } from '../../core/models/models';

/**
 * Completar bitácora diaria: revisión obligatoria del equipo de atención al público
 * (funciona / presenta falla / no aplica, con detalle de la falla), actividades del día
 * en tabla dinámica y envío con límite de las 5:00 p. m.
 */
@Component({
  selector: 'app-completar-bitacora',
  imports: [FormsModule, RouterLink, BadgeComponent, DocumentoComponent, IconComponent],
  styles: `
    .rev-row { padding: 10px 0; border-bottom: 1px dashed var(--line); }
    .rev-row:last-child { border-bottom: 0; }
    .rev-head { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; }
    .rev-nom { font-size: 13.5px; font-weight: 500; color: var(--navy-900); }
    .opciones { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 9px; overflow: hidden; }
    .opciones button {
      border: 0; background: var(--surface); color: var(--tx-2); font-family: inherit; font-size: 12px;
      padding: 6px 11px; cursor: pointer; border-left: 1px solid var(--line);
    }
    .opciones button:first-child { border-left: 0; }
    .opciones button.on-ok { background: var(--ok); color: #fff; font-weight: 600; }
    .opciones button.on-bad { background: var(--danger); color: #fff; font-weight: 600; }
    .opciones button.on-na { background: var(--navy-800); color: #fff; font-weight: 600; }
    .falla-det {
      margin-top: 10px; padding: 12px 14px; border: 1px solid var(--warn-line); background: var(--warn-bg);
      border-radius: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
    }
    .falla-det .span-2 { grid-column: 1 / -1; }
    .tabla-form td { padding: 4px 6px 4px 0; }
    .tabla-form input { width: 100%; }
    .reloj { font-variant-numeric: tabular-nums; }
  `,
  template: `
    @if (bitacora(); as b) {
      <div class="page">
        <div class="page-head">
          <div>
            <div class="page-kicker">Operación · {{ data.cortaDireccion(b.direccion) }}</div>
            <h1>Bitácora diaria — {{ formatea(b.fecha) }}</h1>
            <p class="page-sub">
              {{ data.nombreDireccion(b.direccion) }} · Responsable: {{ b.responsable }} ·
              Límite de envío: <b>5:00 p. m.</b>
              @if (editable() && esHoy()) {
                @if (dentroDeHorario()) { · <span class="badge ok">Dentro del horario</span> }
                @else { · <span class="badge warn">Fuera del horario: el envío quedará como tardío</span> }
              }
            </p>
          </div>
          <div class="row">
            <ui-badge [estado]="b.estado" />
            <a class="btn btn-outline btn-sm" routerLink="/bitacora">Volver al listado</a>
            @if (b.documento) { <button class="btn btn-primary btn-sm" type="button" (click)="verDoc.set(b.documento!)">Ver documento</button> }
          </div>
        </div>

        @if (b.estado === 'Vencida') {
          <div class="alert danger" style="margin-bottom: 16px;">
            <span class="alert-ico">!</span>
            <span><b>Bitácora vencida.</b> No fue enviada antes de las 5:00 p. m. del día correspondiente.</span>
          </div>
        }

        <div class="card">
          <div class="card-head">
            <div>
              <h3>Revisión del equipo de atención al público</h3>
              <p class="sub">Obligatoria: la bitácora no puede enviarse con elementos sin revisar</p>
            </div>
            @if (editable()) {
              <button class="btn btn-outline btn-sm" type="button" (click)="todoCorrecto()">Marcar todo «Funciona correctamente»</button>
            }
          </div>
          <div class="card-body">
            @for (r of revision; track r.elemento) {
              <div class="rev-row">
                <div class="rev-head">
                  <span class="rev-nom">{{ r.elemento }}</span>
                  @if (editable()) {
                    <span class="opciones">
                      <button type="button" [class.on-ok]="r.estado === 'Funciona correctamente'" (click)="marca(r, 'Funciona correctamente')">Funciona correctamente</button>
                      <button type="button" [class.on-bad]="r.estado === 'Presenta falla'" (click)="marca(r, 'Presenta falla')">Presenta falla</button>
                      <button type="button" [class.on-na]="r.estado === 'No aplica'" (click)="marca(r, 'No aplica')">No aplica</button>
                    </span>
                  } @else {
                    <ui-badge [estado]="r.estado || 'Sin revisar'" />
                  }
                </div>
                @if (r.estado === 'Presenta falla') {
                  @if (editable()) {
                    <div class="falla-det">
                      <div class="field span-2">
                        <label>Descripción de la falla <span style="color: var(--danger)">*</span></label>
                        <input class="control" [(ngModel)]="r.descripcionFalla" placeholder="Qué está fallando y desde cuándo…" />
                      </div>
                      <div class="field">
                        <label>Acción realizada <span style="color: var(--danger)">*</span></label>
                        <input class="control" [(ngModel)]="r.accionRealizada" placeholder="Qué se hizo para atenderla…" />
                      </div>
                      <div class="field">
                        <label>Estado final <span style="color: var(--danger)">*</span></label>
                        <select class="control" [(ngModel)]="r.estadoFinal">
                          <option value="">Seleccione…</option>
                          <option>Resuelto</option><option>Pendiente</option><option>Escalado</option><option>En observación</option>
                        </select>
                      </div>
                      <div class="field span-2">
                        <label>Evidencia (si aplica)</label>
                        <input class="control" type="file" (change)="evidenciaFalla($event, r)" />
                        @if (r.evidencia) { <span class="hint">Adjunta: {{ r.evidencia }}</span> }
                      </div>
                    </div>
                  } @else {
                    <div class="falla-det" style="grid-template-columns: 1fr;">
                      <div><b>Falla:</b> {{ r.descripcionFalla }}</div>
                      <div><b>Acción:</b> {{ r.accionRealizada }} · <b>Estado final:</b> {{ r.estadoFinal }}</div>
                      @if (r.evidencia) { <div><b>Evidencia:</b> {{ r.evidencia }}</div> }
                    </div>
                  }
                }
              </div>
            }
          </div>
        </div>

        <div class="card" style="margin-top: 16px;">
          <div class="card-head">
            <div>
              <h3>Actividades del día</h3>
              <p class="sub">Atenciones, revisiones, seguimiento GLPI y demás trabajo del soporte</p>
            </div>
            @if (editable()) {
              <button class="btn btn-outline btn-sm" type="button" (click)="agregarActividad()"><ui-icon name="plus" [size]="13" /> Agregar actividad</button>
            }
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl" [class.tabla-form]="editable()">
                <thead><tr><th style="width: 90px;">Hora</th><th>Actividad realizada</th><th>Equipo o área</th><th>Resultado</th><th>Observaciones</th>@if (editable()) { <th></th> }</tr></thead>
                <tbody>
                  @for (a of actividades; track $index; let i = $index) {
                    <tr>
                      @if (editable()) {
                        <td><input class="control" type="time" [(ngModel)]="a.hora" /></td>
                        <td><input class="control" [(ngModel)]="a.actividad" placeholder="Qué se hizo…" /></td>
                        <td><input class="control" [(ngModel)]="a.area" placeholder="Área o equipo…" /></td>
                        <td><input class="control" [(ngModel)]="a.resultado" placeholder="Resultado…" /></td>
                        <td><input class="control" [(ngModel)]="a.observaciones" /></td>
                        <td><button class="btn btn-ghost btn-sm" type="button" (click)="quitarActividad(i)">Quitar</button></td>
                      } @else {
                        <td class="mono">{{ a.hora }}</td><td>{{ a.actividad }}</td><td>{{ a.area }}</td><td>{{ a.resultado }}</td><td>{{ a.observaciones || '—' }}</td>
                      }
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="muted">Sin actividades registradas. Se requiere al menos una para enviar.</td></tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="field" style="margin-top: 14px;">
              <label for="obs">Observaciones generales</label>
              @if (editable()) { <textarea id="obs" class="control" rows="2" [(ngModel)]="observaciones"></textarea> }
              @else { <p>{{ b.observaciones || '—' }}</p> }
            </div>

            @if (editable()) {
              <div class="divider"></div>
              <div class="row-between">
                <button class="btn btn-outline" type="button" (click)="guardar()">Guardar borrador</button>
                <button class="btn btn-primary btn-lg" type="button" (click)="enviar()">Enviar bitácora del día</button>
              </div>
            }
          </div>
        </div>

        <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
      </div>
    } @else {
      <div class="page"><p class="muted">La bitácora indicada no existe.</p></div>
    }
  `
})
export class CompletarBitacoraComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();

  protected readonly bitacora = computed(() => this.data.bitacoraPorId(this.id()));
  protected readonly verDoc = signal('');

  protected revision: RevisionAtencion[] = [];
  protected actividades: ActividadDia[] = [];
  protected observaciones = '';
  private idCargado = '';

  constructor() {
    effect(() => {
      const b = this.bitacora();
      if (!b) { this.idCargado = ''; return; }
      if (b.id === this.idCargado) return;
      this.idCargado = b.id;
      this.revision = b.revision.map((r) => ({ ...r }));
      this.actividades = b.actividades.map((a) => ({ ...a }));
      this.observaciones = b.observaciones;
    });
  }

  protected readonly editable = computed(() => {
    const b = this.bitacora();
    const u = this.auth.usuario();
    if (!b || !u || u.clave === 'coordinador') return false;
    if (!['Pendiente', 'En edición'].includes(b.estado)) return false;
    if (u.clave === 'tec-soporte') return this.data.direccionesDe(u.usuario).includes(b.direccion);
    return true;
  });

  protected esHoy(): boolean { return this.bitacora()?.fecha === isoLocal(new Date()); }
  protected dentroDeHorario(): boolean { return new Date().toTimeString().slice(0, 5) <= '17:00'; }

  protected marca(r: RevisionAtencion, estado: RevisionAtencion['estado']): void {
    r.estado = estado;
    if (estado !== 'Presenta falla') {
      r.descripcionFalla = undefined;
      r.accionRealizada = undefined;
      r.estadoFinal = undefined;
      r.evidencia = undefined;
    }
  }

  protected todoCorrecto(): void {
    for (const r of this.revision) if (!r.estado) r.estado = 'Funciona correctamente';
  }

  protected evidenciaFalla(ev: Event, r: RevisionAtencion): void {
    const archivo = (ev.target as HTMLInputElement).files?.[0];
    if (archivo) r.evidencia = archivo.name;
  }

  protected agregarActividad(): void {
    this.actividades.push({ hora: new Date().toTimeString().slice(0, 5), actividad: '', area: '', resultado: '', observaciones: '' });
  }
  protected quitarActividad(i: number): void { this.actividades.splice(i, 1); }

  protected guardar(silencioso = false): void {
    const b = this.bitacora();
    if (!b || !this.editable()) return;
    this.data.guardarBitacora(b.id, this.revision, this.actividades.filter((a) => a.actividad.trim()), this.observaciones);
    if (!silencioso) this.toast.ok('Borrador guardado', 'La bitácora quedó en edición; recuerde enviarla antes de las 5:00 p. m.');
  }

  protected enviar(): void {
    const b = this.bitacora();
    if (!b) return;
    this.guardar(true);
    const r = this.data.enviarBitacora(b.id, this.auth.usuario()!);
    if (!r.ok) {
      this.toast.warn('No es posible enviar la bitácora', r.faltas[0]);
      return;
    }
    if (r.estado === 'Enviada tarde') {
      this.toast.warn('Bitácora enviada tarde', 'La bitácora diaria fue enviada fuera del horario establecido (5:00 p. m.).');
    } else {
      this.toast.ok('Bitácora enviada', 'El envío quedó registrado dentro del horario establecido.');
    }
    const doc = this.data.bitacoraPorId(b.id)?.documento;
    if (doc) this.verDoc.set(doc);
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
