import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService, MODULO_CONTROLES, MODULO_EQUIPOS } from '../../core/services/data.service';
import { EquipmentIntegrationService } from '../../core/services/equipment-integration.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { EquipoOperativo, formateaFecha, nombreMes } from '../../core/models/models';

/**
 * Inventario operativo por Dirección/Unidad: los equipos activos que alimentan controles como
 * F0422, mantenimiento preventivo y vulnerabilidades. Crece con las entregas aceptadas en
 * Gestión de Equipos y disminuye con los descargos, **automáticamente**: esta pantalla no tiene
 * acciones manuales de incorporación ni de descargo, solo muestra lo ya sincronizado.
 */
@Component({
  selector: 'app-inventario',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, ModalComponent, IconComponent],
  styles: `
    /* Tres filtros en una línea: sin anchos fijos se estiran y recortan el texto. */
    .filtros { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .filtros .control { width: 210px; }
    .sync { border-left: 3px solid var(--ok, #1f7a4d); }
    .mov {
      display: grid; grid-template-columns: 20px 1fr auto; gap: 12px; align-items: start;
      padding: 10px 0; border-bottom: 1px dashed var(--line);
    }
    .mov:last-child { border-bottom: 0; }
    .ver-hist { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--tx-2); white-space: nowrap; }
  `,
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

      <!-- Movimientos ya sincronizados: informativos, sin acciones manuales. -->
      <div class="card sync" style="margin-bottom: 18px;">
        <div class="card-head">
          <div>
            <h3>Últimos movimientos sincronizados desde Gestión de Equipos</h3>
            <p class="sub">
              {{ MODULO_EQUIPOS }} → {{ MODULO_CONTROLES }} · el inventario operativo se actualiza
              automáticamente: no hay nada que confirmar
            </p>
          </div>
          <a class="btn btn-ghost btn-sm" routerLink="/trazabilidad">Ver trazabilidad completa</a>
        </div>
        <div class="card-body">
          @for (e of integracion.ultimos(5); track e.id) {
            <div class="mov">
              <ui-icon [name]="e.tipo === 'Entrega aceptada' ? 'arrow-down' : 'arrow-up'" [size]="18"
                [style.color]="e.tipo === 'Entrega aceptada' ? 'var(--ok)' : 'var(--danger)'" />
              <div>
                <div>
                  <b>{{ e.tipo }}</b> · {{ formatea(e.fecha) }} ·
                  <span class="mono">{{ e.expedienteUnico || e.expediente }}</span>
                </div>
                <div class="muted" style="font-size: 12.5px;">
                  {{ e.equipo.tipo }} {{ e.equipo.marca }} {{ e.equipo.modelo }} · Inv. {{ e.equipo.inventario }}
                  @if (e.tipo === 'Entrega aceptada') { · usuario final: {{ e.equipo.usuarioFinal }} }
                </div>
                <div class="muted" style="font-size: 12.5px;">
                  @if (e.tipo === 'Entrega aceptada') {
                    Equipo incorporado automáticamente al inventario operativo de
                    {{ data.dirUnidad(e.equipo.direccion, e.equipo.unidad) }}.
                  } @else {
                    Equipo retirado automáticamente del inventario operativo de
                    {{ data.dirUnidad(e.equipo.direccion, e.equipo.unidad) }}.
                  }
                </div>
              </div>
              <span class="badge ok plain">Sincronizado</span>
            </div>
          } @empty {
            <p class="muted">Todavía no hay movimientos sincronizados desde Gestión de Equipos.</p>
          }
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom: 18px;">
        <div class="kpi"><div class="kpi-label">Equipos activos</div><div class="kpi-value">{{ cuenta('Activo en Dirección/Unidad') }}</div><div class="kpi-hint">en inventario operativo</div></div>
        <div class="kpi"><div class="kpi-label">En garantía / revisión</div><div class="kpi-value">{{ cuenta('En garantía') + cuenta('Pendiente de revisión') }}</div><div class="kpi-hint">requieren seguimiento</div></div>
        <div class="kpi"><div class="kpi-label">Descargados e históricos</div><div class="kpi-value">{{ cuenta('Descargado') + cuenta('Histórico') }}</div><div class="kpi-hint">fuera del inventario activo</div></div>
        <div class="kpi"><div class="kpi-label">Movimientos sincronizados</div><div class="kpi-value">{{ integracion.totalSincronizados() }}</div><div class="kpi-hint">{{ integracion.aceptaciones() }} aceptaciones · {{ integracion.descargos() }} descargos</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Equipos por Dirección/Unidad</h3>
            <p class="sub">
              {{ filtrados().length }} equipos ·
              {{ verHistorico() ? 'incluye descargados e históricos' : 'solo equipos activos' }}
            </p>
          </div>
          <div class="filtros">
            <label class="ver-hist">
              <input type="checkbox" [checked]="verHistorico()" (change)="alternarHistorico()" />
              Ver descargados e históricos
            </label>
            <input class="control" placeholder="Buscar inventario o usuario…" [(ngModel)]="busca" />
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
                @for (e of filtrados(); track e.ciclo) {
                  <tr>
                    <td class="mono">{{ e.inventario }}</td>
                    <td><b>{{ e.nombreEquipo }}</b><div class="muted" style="font-size: 11.5px;">{{ e.tipo }} · {{ e.marca }} {{ e.modelo }}</div></td>
                    <td>{{ e.usuarioFinal }}</td>
                    <td>{{ data.cortaDireccion(e.direccion) }} · {{ e.unidad }}</td>
                    <td>{{ e.soporteResponsable }}</td>
                    <td class="mono">{{ formatea(e.fechaAceptacion) }}</td>
                    <td style="max-width: 160px;">{{ e.garantia }}</td>
                    <td>
                      @if (ultimoControl(e.inventario); as uc) { {{ uc }} }
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
            <div><dt>Técnico de configuración</dt><dd>{{ e.tecnicoConfiguracion || '—' }}</dd></div>
            <div><dt>Soporte responsable</dt><dd>
              @if (e.soporteResponsable) { {{ e.soporteResponsable }} }
              @else { <span class="badge danger">Sin soporte responsable</span> }
            </dd></div>
            <div><dt>Fecha de aceptación</dt><dd class="mono">{{ formatea(e.fechaAceptacion) }}</dd></div>
            <div><dt>Expediente</dt><dd class="mono">{{ e.expediente || '—' }}</dd></div>
            <div><dt>Expediente único</dt><dd class="mono">{{ e.expedienteUnico || '—' }}</dd></div>
            <div><dt>Garantía</dt><dd>{{ e.garantia }}</dd></div>
            <div><dt>Estado operativo</dt><dd><ui-badge [estado]="e.estado" /></dd></div>
            @if (e.fechaDescargo) {
              <div><dt>Fecha de descargo</dt><dd class="mono">{{ formatea(e.fechaDescargo) }}</dd></div>
              <div><dt>Motivo del descargo</dt><dd>{{ e.motivoDescargo }}</dd></div>
              <div><dt>Acción posterior</dt><dd>{{ e.accionPosterior }}</dd></div>
            }
          </dl>

          @if (ciclosPrevios().length) {
            <div class="sec-title">Ciclos operativos anteriores</div>
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Dirección/Unidad</th><th>Usuario final</th><th>Aceptación</th><th>Expediente</th><th>Estado</th></tr></thead>
                <tbody>
                  @for (p of ciclosPrevios(); track p.ciclo) {
                    <tr>
                      <td>{{ data.dirUnidad(p.direccion, p.unidad) }}</td>
                      <td>{{ p.usuarioFinal }}</td>
                      <td class="mono">{{ formatea(p.fechaAceptacion) }}</td>
                      <td class="mono">{{ p.expedienteUnico || p.expediente }}</td>
                      <td><ui-badge [estado]="p.estado" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="sec-title">Historial de controles del equipo</div>
          @if (historial().length) {
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Control</th><th>Período</th><th>Dirección/Unidad</th><th>Responsable</th><th>Estado</th></tr></thead>
                <tbody>
                  @for (c of historial(); track c.id) {
                    <tr>
                      <td><b>{{ c.codigo }}</b></td>
                      <td>{{ mes(c.mes) }} {{ c.anio }}</td>
                      <td>{{ data.cortaDireccion(c.direccion) }} · {{ c.unidad }}</td>
                      <td>{{ c.responsable }}</td>
                      <td><ui-badge [estado]="c.estado" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="muted">Este equipo todavía no aparece en ningún control (F0422, mantenimiento preventivo o vulnerabilidades).</p>
          }

          <div class="alert" style="margin-top: 14px;">
            <span class="alert-ico">i</span>
            <span>Registro proveniente de <b>{{ e.origen }}</b>: el equipo se incorporó
              <b>automáticamente</b> al inventario operativo tras la aceptación del Usuario
              Final{{ e.expedienteUnico ? ' (' + e.expedienteUnico + ')' : '' }}, y saldrá igual de
              automático cuando allí se registre su descargo. Su Dirección/Unidad y su soporte
              responsable no se editan aquí: cambian en Gestión de Equipos y en la distribución de
              soportes.</span>
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

  protected readonly busca = signal('');
  protected readonly fDireccion = signal('');
  protected readonly fEstado = signal('');
  /** Por defecto la tabla muestra solo los equipos activos (regla del inventario operativo). */
  protected readonly verHistorico = signal(false);
  protected readonly detalle = signal<EquipoOperativo | null>(null);

  protected readonly estados = ['Activo en Dirección/Unidad', 'Descargado', 'En garantía',
    'Pendiente de revisión', 'Reingresado a Hardware', 'No disponible', 'Histórico'];
  protected readonly MODULO_EQUIPOS = MODULO_EQUIPOS;
  protected readonly MODULO_CONTROLES = MODULO_CONTROLES;

  /** El Técnico de Soporte solo ve los equipos de las Direcciones/Unidades que atiende. */
  private readonly visibles = computed(() => this.data.inventarioVisible(this.auth.usuario()));

  /** Historial de controles del equipo abierto en el detalle. */
  protected readonly historial = computed(() => {
    const e = this.detalle();
    return e ? this.data.controlesDeEquipo(e.inventario) : [];
  });

  protected readonly filtrados = computed(() => {
    const q = this.busca().toLowerCase();
    const fuera = ['Descargado', 'Histórico', 'Reingresado a Hardware', 'No disponible'];
    return this.visibles()
      .filter((e) => this.verHistorico() || this.fEstado() || !fuera.includes(e.estado))
      .filter((e) => !this.fDireccion() || e.direccion === this.fDireccion())
      .filter((e) => !this.fEstado() || e.estado === this.fEstado())
      .filter((e) => !q || [e.inventario, e.nombreEquipo, e.usuarioFinal, e.marca, e.modelo].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.direccion.localeCompare(b.direccion) || a.nombreEquipo.localeCompare(b.nombreEquipo));
  });

  protected alternarHistorico(): void { this.verHistorico.update((v) => !v); }

  protected cuenta(estado: string): number { return this.visibles().filter((e) => e.estado === estado).length; }

  /** Ciclos operativos anteriores del mismo número de inventario (historial del equipo). */
  protected readonly ciclosPrevios = computed(() => {
    const e = this.detalle();
    return e ? this.data.ciclosDe(e.inventario).filter((x) => x.ciclo !== e.ciclo) : [];
  });

  /** Último control en el que el equipo fue revisado (o su descargo). */
  protected ultimoControl(inventario: string): string {
    const c = this.data.controlesDeEquipo(inventario)[0];
    if (c) return `${c.codigo} · ${nombreMes(c.mes)} ${c.anio}`;
    return this.data.equipoDe(inventario)?.ultimoControl ?? '';
  }

  protected mes(m: number): string { return nombreMes(m); }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
