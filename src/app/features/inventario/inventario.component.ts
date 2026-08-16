import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { EquipmentIntegrationService } from '../../core/services/equipment-integration.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { EquipoOperativo, formateaFecha } from '../../core/models/models';

/**
 * Inventario operativo por Dirección/Unidad: los equipos activos que alimentan controles como
 * F0422, mantenimiento preventivo y vulnerabilidades. Crece con las entregas aceptadas en
 * Gestión de Equipos y disminuye con los descargos (integración simulada).
 */
@Component({
  selector: 'app-inventario',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent, IconComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Operación</div>
          <h1>
            Inventario operativo
            <ui-help texto="Cuando el flujo de Gestión de Equipos finaliza con aceptación del Usuario Final, el equipo pasa al inventario operativo de la Dirección/Unidad solicitante. Un descargo posterior lo retira del inventario activo. Este inventario alimenta F0422, el mantenimiento preventivo y el análisis de vulnerabilidades." />
          </h1>
          <p class="page-sub">Equipos activos por Dirección/Unidad, conectados con SISGOST — Gestión de Equipos.</p>
        </div>
      </div>

      @if (integracion.pendientes().length && auth.puedeOperar()) {
        <div class="card" style="margin-bottom: 18px; border-color: var(--gold-500);">
          <div class="card-head">
            <div>
              <h3>Eventos pendientes de Gestión de Equipos</h3>
              <p class="sub">Integración simulada: aplique cada evento para actualizar el inventario operativo</p>
            </div>
          </div>
          <div class="card-body">
            @for (e of integracion.pendientes(); track e.id) {
              <div class="row-between" style="padding: 10px 0; border-bottom: 1px dashed var(--line); gap: 12px;">
                <div style="display: flex; gap: 12px; align-items: center;">
                  <ui-icon [name]="e.tipo === 'Entrega aceptada' ? 'arrow-down' : 'arrow-up'" [size]="18"
                    [style.color]="e.tipo === 'Entrega aceptada' ? 'var(--ok)' : 'var(--danger)'" />
                  <div>
                    <b>{{ e.tipo }}</b> · {{ formatea(e.fecha) }} · <span class="mono">{{ e.expedienteUnico }}</span>
                    <div class="muted" style="font-size: 12.5px;">
                      {{ e.equipo.tipo }} {{ e.equipo.marca }} {{ e.equipo.modelo }} · Inv. {{ e.equipo.inventario }} ·
                      {{ data.nombreDireccion(e.equipo.direccion) }} ({{ e.equipo.unidad }})
                      @if (e.tipo === 'Entrega aceptada') { · usuario final: {{ e.equipo.usuarioFinal }} }
                    </div>
                  </div>
                </div>
                <button class="btn btn-primary btn-sm" type="button" (click)="aplicar(e.id, e.tipo)">
                  {{ e.tipo === 'Entrega aceptada' ? 'Incorporar al inventario' : 'Aplicar descargo' }}
                </button>
              </div>
            }
          </div>
        </div>
      }

      <div class="grid grid-4" style="margin-bottom: 18px;">
        <div class="kpi"><div class="kpi-label">Equipos activos</div><div class="kpi-value">{{ cuenta('Activo en Dirección/Unidad') }}</div><div class="kpi-hint">en inventario operativo</div></div>
        <div class="kpi"><div class="kpi-label">En garantía / revisión</div><div class="kpi-value">{{ cuenta('En garantía') + cuenta('Pendiente de revisión') }}</div><div class="kpi-hint">requieren seguimiento</div></div>
        <div class="kpi"><div class="kpi-label">Descargados</div><div class="kpi-value">{{ cuenta('Descargado') }}</div><div class="kpi-hint">fuera del inventario activo</div></div>
        <div class="kpi"><div class="kpi-label">Eventos aplicados</div><div class="kpi-value">{{ integracion.aplicados().length }}</div><div class="kpi-hint">desde Gestión de Equipos</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Equipos por Dirección/Unidad</h3>
            <p class="sub">{{ filtrados().length }} equipos</p>
          </div>
          <div class="row">
            <input class="control" style="width: 220px;" placeholder="Buscar inventario, usuario, equipo…" [(ngModel)]="busca" />
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
              <thead><tr><th>N° inventario</th><th>Equipo</th><th>Usuario final</th><th>Dirección/Unidad</th><th>Soporte responsable</th><th>Aceptación</th><th>Garantía</th><th>Último control</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (e of filtrados(); track e.inventario) {
                  <tr>
                    <td class="mono">{{ e.inventario }}</td>
                    <td><b>{{ e.nombreEquipo }}</b><div class="muted" style="font-size: 11.5px;">{{ e.tipo }} · {{ e.marca }} {{ e.modelo }}</div></td>
                    <td>{{ e.usuarioFinal }}</td>
                    <td>{{ data.cortaDireccion(e.direccion) }} · {{ e.unidad }}</td>
                    <td>{{ e.soporteResponsable }}</td>
                    <td class="mono">{{ formatea(e.fechaAceptacion) }}</td>
                    <td style="max-width: 160px;">{{ e.garantia }}</td>
                    <td>
                      @if (e.ultimoControl) { {{ e.ultimoControl }} }
                      @else { <span class="badge warn">Sin control asociado</span> }
                    </td>
                    <td><ui-badge [estado]="e.estado" /></td>
                    <td><button class="btn btn-ghost btn-sm" type="button" (click)="detalle.set(e)">Detalle</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="10" class="muted">Sin equipos para los filtros seleccionados.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      @if (detalle(); as e) {
        <ui-modal [titulo]="e.nombreEquipo" [sub]="e.tipo + ' · ' + e.marca + ' ' + e.modelo" (cerrar)="detalle.set(null)">
          <dl class="dl">
            <div><dt>N° de inventario</dt><dd class="mono">{{ e.inventario }}</dd></div>
            <div><dt>Serie</dt><dd class="mono">{{ e.serie }}</dd></div>
            <div><dt>Usuario final</dt><dd>{{ e.usuarioFinal }}@if (e.carne !== '—') { (carné {{ e.carne }}) }</dd></div>
            <div><dt>Dirección/Unidad</dt><dd>{{ data.nombreDireccion(e.direccion) }} — {{ e.unidad }}</dd></div>
            <div><dt>Técnico de configuración</dt><dd>{{ e.tecnicoConfiguracion }}</dd></div>
            <div><dt>Soporte responsable</dt><dd>{{ e.soporteResponsable }}</dd></div>
            <div><dt>Fecha de aceptación</dt><dd class="mono">{{ formatea(e.fechaAceptacion) }}</dd></div>
            <div><dt>Expediente único</dt><dd class="mono">{{ e.expedienteUnico }}</dd></div>
            <div><dt>Garantía</dt><dd>{{ e.garantia }}</dd></div>
            <div><dt>Último control asociado</dt><dd>{{ e.ultimoControl ?? 'Sin control asociado' }}</dd></div>
            <div><dt>Estado</dt><dd><ui-badge [estado]="e.estado" /></dd></div>
          </dl>
          <div class="alert" style="margin-top: 14px;">
            <span class="alert-ico">i</span>
            <span>El equipo fue incorporado al inventario operativo de la Dirección/Unidad posterior a la aceptación del Usuario Final en Gestión de Equipos ({{ e.expedienteUnico }}).</span>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class InventarioComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  protected readonly integracion = inject(EquipmentIntegrationService);
  private readonly toast = inject(ToastService);

  protected readonly busca = signal('');
  protected readonly fDireccion = signal('');
  protected readonly fEstado = signal('');
  protected readonly detalle = signal<EquipoOperativo | null>(null);

  protected readonly estados = ['Activo en Dirección/Unidad', 'Descargado', 'En garantía',
    'Pendiente de revisión', 'Reingresado a Hardware', 'No disponible'];

  private readonly visibles = computed(() => {
    const u = this.auth.usuario();
    if (u?.clave !== 'tec-soporte') return this.data.inventario();
    const propias = this.data.direccionesDe(u.usuario);
    return this.data.inventario().filter((e) => propias.includes(e.direccion));
  });

  protected readonly filtrados = computed(() => {
    const q = this.busca().toLowerCase();
    return this.visibles()
      .filter((e) => !this.fDireccion() || e.direccion === this.fDireccion())
      .filter((e) => !this.fEstado() || e.estado === this.fEstado())
      .filter((e) => !q || [e.inventario, e.nombreEquipo, e.usuarioFinal, e.marca, e.modelo].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.direccion.localeCompare(b.direccion) || a.nombreEquipo.localeCompare(b.nombreEquipo));
  });

  protected cuenta(estado: string): number { return this.visibles().filter((e) => e.estado === estado).length; }

  protected aplicar(id: string, tipo: string): void {
    this.integracion.aplicar(id, this.auth.usuario()!);
    this.toast.ok(
      tipo === 'Entrega aceptada' ? 'Equipo incorporado' : 'Descargo aplicado',
      tipo === 'Entrega aceptada'
        ? 'El equipo fue incorporado al inventario operativo de la Dirección/Unidad posterior a la aceptación del Usuario Final.'
        : 'El equipo dejó de estar activo en la Dirección/Unidad; el cambio quedó en trazabilidad.'
    );
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
