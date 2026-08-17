import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BadgeComponent } from './ui';
import { IconComponent } from './icon';
import { KpiDireccion } from '../core/services/operatividad.service';
import { formateaFecha } from '../core/models/models';

/**
 * Operatividad por Dirección/Unidad. Un solo componente presentacional con dos presentaciones
 * —tarjetas ejecutivas y tabla comparativa— que comparten la vista de Controles mensuales, el
 * panel ejecutivo y el historial anual: así los mismos indicadores se leen igual en todas partes.
 *
 * El semáforo se dibuja con badges y un borde de color; sin emojis.
 */
@Component({
  selector: 'ui-kpi-direcciones',
  imports: [RouterLink, BadgeComponent, IconComponent],
  styles: `
    .tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 14px; }
    .dir-card {
      border: 1px solid var(--line); border-left: 4px solid var(--line-strong);
      border-radius: 12px; background: var(--surface); padding: 14px 16px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .dir-card.op-ok { border-left-color: var(--ok); }
    .dir-card.op-warn { border-left-color: var(--warn); }
    .dir-card.op-danger { border-left-color: var(--danger); }
    .dir-card.op-neutral { border-left-color: var(--line-strong); }
    .d-tit { font-size: 14.5px; font-weight: 700; color: var(--navy-900); line-height: 1.25; }
    .d-uni { font-size: 11.5px; letter-spacing: .05em; text-transform: uppercase; color: var(--gold-600); font-weight: 700; }
    .d-resp { font-size: 12px; color: var(--tx-2); }
    .d-cifras { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
    .cif { text-align: center; border: 1px solid var(--line); border-radius: 8px; padding: 6px 4px; }
    .cif b { display: block; font-size: 16px; color: var(--navy-900); line-height: 1.1; }
    .cif span { font-size: 10.5px; color: var(--tx-3); }
    .cif.mal b { color: var(--danger); }
    .d-op { display: flex; align-items: center; gap: 10px; }
    .d-op .pct { font-size: 22px; font-weight: 700; color: var(--navy-900); line-height: 1; }
    .d-op .barra { flex: 1; }
    .d-pie { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: var(--tx-3); }
    /* Doce columnas: sin anchos acotados el comparativo se sale de la tarjeta. */
    .col-num { text-align: center; width: 74px; }
    .comparativo th { white-space: normal; }
    .comparativo .c-dir { max-width: 150px; }
    .comparativo .c-resp { max-width: 145px; font-size: 12px; }
    .comparativo .c-estado { white-space: nowrap; }
    .mini { font-size: 11.5px; color: var(--tx-3); }
  `,
  template: `
    @if (modo() === 'tarjetas') {
      <div class="tarjetas">
        @for (k of kpis(); track k.direccion + k.unidad) {
          <div class="dir-card" [class]="'dir-card ' + clase(k)">
            <div>
              <div class="d-uni">{{ k.corta }}</div>
              <div class="d-tit">{{ k.unidad === k.nombre ? k.nombre : k.nombre + ' / ' + k.unidad }}</div>
              <div class="d-resp">
                @if (k.responsables.length) {
                  {{ k.responsables.length === 1 ? 'Responsable: ' : 'Responsables: ' }}{{ k.responsables.join(', ') }}
                } @else { <span class="badge danger">Sin soporte responsable</span> }
              </div>
            </div>

            <div class="d-op">
              <span class="pct">{{ k.aplicables ? k.operatividad + ' %' : '—' }}</span>
              <div class="barra">
                <div class="progress" [class.ok]="k.operatividad >= 90"><span [style.width.%]="k.operatividad"></span></div>
                <div class="mini">Operatividad del período · cumplimiento {{ k.cumplimiento }} %</div>
              </div>
              <ui-badge [estado]="k.estado" />
            </div>

            <div class="d-cifras">
              <div class="cif"><b>{{ k.aplicables }}</b><span>Aplicables</span></div>
              <div class="cif"><b>{{ k.entregados + k.entregadosTarde }}</b><span>Entregados</span></div>
              <div class="cif" [class.mal]="k.pendientes > 0"><b>{{ k.pendientes }}</b><span>Pendientes</span></div>
              <div class="cif" [class.mal]="k.vencidos > 0"><b>{{ k.vencidos }}</b><span>Vencidos</span></div>
            </div>

            <div class="d-pie">
              <span>
                {{ k.justificados }} justificado(s) · {{ k.equiposActivos }} equipo(s) activo(s)
                @if (k.equiposIncidencia) { · {{ k.equiposIncidencia }} con incidencia }
              </span>
              <a class="btn btn-outline btn-sm" [routerLink]="['/controles/direccion', k.direccion, k.unidad]">
                Ver detalle <ui-icon name="chevron" [size]="12" />
              </a>
            </div>
          </div>
        } @empty {
          <p class="muted">Sin Direcciones/Unidades para los filtros seleccionados.</p>
        }
      </div>
    } @else {
      <div class="table-wrap">
        <table class="tbl comparativo">
          <thead><tr>
            <th>Dirección/Unidad</th><th>Responsable(s)</th>
            <th class="col-num">Aplic.</th><th class="col-num">Entreg.</th><th class="col-num">Pend.</th>
            <th class="col-num">Venc.</th><th class="col-num">Justif.</th>
            <th class="col-num">Bitác.</th><th class="col-num">Equipos</th>
            <th class="col-num">Operat.</th><th>Estado</th>
          </tr></thead>
          <tbody>
            @for (k of kpis(); track k.direccion + k.unidad) {
              <tr>
                <td class="c-dir">
                  <a [routerLink]="['/controles/direccion', k.direccion, k.unidad]" [title]="'Ver detalle de ' + k.nombre">
                    <b>{{ k.corta }}</b> · {{ k.unidad }}
                  </a>
                </td>
                <td class="c-resp">
                  @if (k.responsables.length) { {{ k.responsables.join(' · ') }} }
                  @else { <span class="badge danger">Sin asignar</span> }
                </td>
                <td class="col-num">{{ k.aplicables }}</td>
                <td class="col-num">{{ k.entregados + k.entregadosTarde }}</td>
                <td class="col-num">{{ k.pendientes }}</td>
                <td class="col-num">{{ k.vencidos }}</td>
                <td class="col-num">{{ k.justificados }}</td>
                <td class="col-num">{{ k.bitacorasEnviadas + k.bitacorasTarde }} / {{ k.bitacoras }}</td>
                <td class="col-num">{{ k.equiposActivos }}@if (k.equiposIncidencia) { <span class="mini"> ({{ k.equiposIncidencia }})</span> }</td>
                <td class="col-num"><b>{{ k.aplicables ? k.operatividad + ' %' : '—' }}</b></td>
                <td class="c-estado"><ui-badge [estado]="k.estado" /></td>
              </tr>
            } @empty {
              <tr><td colspan="11" class="muted">Sin Direcciones/Unidades para los filtros seleccionados.</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `
})
export class KpiDireccionesComponent {
  readonly kpis = input.required<KpiDireccion[]>();
  readonly modo = input<'tarjetas' | 'tabla'>('tarjetas');

  protected clase(k: KpiDireccion): string {
    switch (k.estado) {
      case 'Operativa': return 'op-ok';
      case 'En observación': return 'op-warn';
      case 'Crítica': return 'op-danger';
      default: return 'op-neutral';
    }
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
