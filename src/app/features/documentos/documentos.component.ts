import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { MESES, formateaFecha, nombreMes } from '../../core/models/models';

/**
 * Generador de documentos: catálogo de todo lo emitido por el sistema —controles entregados,
 * bitácoras, cartas de justificación y reportes consolidados— con vista previa tipo PDF,
 * descarga e impresión. Desde aquí también se generan los reportes por Dirección y el
 * consolidado mensual para la jefatura del área.
 */
@Component({
  selector: 'app-documentos',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, DocumentoComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Documentación</div>
          <h1>
            Generador de documentos
            <ui-help texto="Todos los documentos se abren en una vista formal tipo PDF con encabezado institucional, secciones ordenadas, firmas y pie de página, lista para imprimir o presentar en reuniones. Nada se muestra como tarjeta simple." />
          </h1>
          <p class="page-sub">Documentos generados por controles, bitácoras, justificaciones y reportes.</p>
        </div>
      </div>

      @if (!auth.esTecnico()) {
        <div class="card" style="margin-bottom: 18px;">
          <div class="card-head">
            <div>
              <h3>Generar reporte</h3>
              <p class="sub">Consolidado del mes o reportes formales por Dirección/Registro</p>
            </div>
          </div>
          <div class="card-body">
            <div class="row" style="flex-wrap: wrap; gap: 8px;">
              <select class="control" style="width: 150px;" [(ngModel)]="repMes">
                @for (m of MESES; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }
              </select>
              <select class="control" style="width: 220px;" [(ngModel)]="repDireccion" (ngModelChange)="repUnidad.set('')">
                <option value="">Todas las direcciones (consolidado)</option>
                @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.corta }} — {{ d.nombre }}</option> }
              </select>
              <select class="control" style="width: 200px;" [(ngModel)]="repUnidad" [disabled]="!repDireccion()">
                <option value="">Unidad…</option>
                @for (u of unidadesRep(); track u) { <option [value]="u">{{ u }}</option> }
              </select>
              <select class="control" style="width: 300px;" [(ngModel)]="repTipo" [disabled]="!repDireccion()">
                @for (t of tiposReporte; track t) { <option [value]="t">{{ t }}</option> }
              </select>
              <button class="btn btn-gold" type="button" (click)="generarReporte()">
                {{ repDireccion() ? 'Generar reporte por Dirección' : 'Generar reporte consolidado del mes' }}
              </button>
            </div>
            <p class="muted" style="font-size: 12.5px; margin-top: 10px;">
              Los reportes por Dirección/Registro incluyen los KPIs del período, los controles aplicables,
              las bitácoras, el inventario operativo y la conclusión del estado operativo. Se abren en la
              vista formal, lista para imprimir o descargar.
            </p>
          </div>
        </div>
      }

      <div class="grid grid-4" style="margin-bottom: 18px;">
        <div class="kpi"><div class="kpi-label">Documentos</div><div class="kpi-value">{{ visibles().length }}</div><div class="kpi-hint">emitidos por el sistema</div></div>
        <div class="kpi"><div class="kpi-label">De controles</div><div class="kpi-value">{{ cuentaTipo('Control mensual') }}</div><div class="kpi-hint">formularios entregados</div></div>
        <div class="kpi"><div class="kpi-label">De bitácoras</div><div class="kpi-value">{{ cuentaTipo('Bitácora diaria') }}</div><div class="kpi-hint">envíos diarios</div></div>
        <div class="kpi"><div class="kpi-label">Cartas y reportes</div><div class="kpi-value">{{ cuentaTipo('Justificación') + cuentaTipo('Reporte mensual consolidado') }}</div><div class="kpi-hint">justificaciones y consolidados</div></div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Documentos generados</h3>
            <p class="sub">{{ filtrados().length }} documentos · vista previa, descarga e impresión desde el visor</p>
          </div>
          <div class="row">
            <input class="control" style="width: 220px;" placeholder="Buscar nombre o código…" [(ngModel)]="busca" />
            <select class="control" [(ngModel)]="fTipo">
              <option value="">Todos los tipos</option>
              @for (t of tipos; track t) { <option [value]="t">{{ t }}</option> }
            </select>
            <select class="control" [(ngModel)]="fMes">
              <option [ngValue]="0">Todos los meses</option>
              @for (m of MESES; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }
            </select>
            <select class="control" [(ngModel)]="fDireccion">
              <option value="">Todas las direcciones</option>
              @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.corta }}</option> }
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Documento</th><th>Tipo</th><th>Período</th><th>Dirección</th><th>Generado por</th><th>Fecha</th><th>Huella</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                @for (d of pagina(); track d.id) {
                  <tr>
                    <td style="max-width: 300px;"><b>{{ d.nombre }}</b></td>
                    <td>{{ d.tipo }}</td>
                    <td>{{ nombreMes(d.mes) }} {{ d.anio }}</td>
                    <td>{{ d.direccion === 'Todas' ? 'Todas' : data.cortaDireccion(d.direccion) }}@if (d.unidad) { <span class="muted"> / {{ d.unidad }}</span> }</td>
                    <td>{{ d.generadoPor }}</td>
                    <td class="mono">{{ formatea(d.fecha) }} · {{ d.hora }}</td>
                    <td class="mono">{{ d.hash }}</td>
                    <td><ui-badge [estado]="d.estado" /></td>
                    <td><button class="btn btn-primary btn-sm" type="button" (click)="verDoc.set(d.id)">Vista previa</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="muted">Sin documentos para los filtros seleccionados.</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (filtrados().length > limite()) {
            <div class="row" style="justify-content: center; margin-top: 14px;">
              <button class="btn btn-outline btn-sm" type="button" (click)="limite.set(limite() + 40)">
                Mostrar más ({{ filtrados().length - limite() }} restantes)
              </button>
            </div>
          }
        </div>
      </div>

      <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
    </div>
  `
})
export class DocumentosComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly MESES = MESES;
  protected readonly busca = signal('');
  protected readonly fTipo = signal('');
  protected readonly fMes = signal(0);
  protected readonly fDireccion = signal('');
  protected readonly verDoc = signal('');
  protected readonly limite = signal(40);
  protected readonly repMes = signal(new Date().getMonth() + 1);
  protected readonly repDireccion = signal('');
  protected readonly repUnidad = signal('');
  protected readonly repTipo = signal('Reporte mensual por Dirección');

  protected readonly tipos = ['Control mensual', 'Bitácora diaria', 'Justificación', 'Reporte mensual consolidado',
    'Reporte mensual por Dirección', 'Reporte anual por Dirección', 'Reporte de operatividad por Dirección',
    'Reporte de controles pendientes por Dirección', 'Reporte de inventario operativo por Dirección',
    'Reporte de bitácoras diarias por Dirección'];

  /** Los seis reportes formales por Dirección/Registro. */
  protected readonly tiposReporte = ['Reporte mensual por Dirección', 'Reporte anual por Dirección',
    'Reporte de operatividad por Dirección', 'Reporte de controles pendientes por Dirección',
    'Reporte de inventario operativo por Dirección', 'Reporte de bitácoras diarias por Dirección',
    'Reporte de F0387 consolidado mensual por Dirección'];

  protected readonly unidadesRep = computed(() => this.data.direccionDe(this.repDireccion())?.unidades ?? []);

  protected readonly visibles = computed(() => {
    const u = this.auth.usuario();
    if (u?.clave !== 'tec-soporte') return this.data.documentos();
    const propias = this.data.direccionesDe(u.usuario);
    return this.data.documentos().filter((d) => propias.includes(d.direccion) || d.direccion === 'Todas');
  });

  protected readonly filtrados = computed(() => {
    const q = this.busca().toLowerCase();
    return this.visibles()
      .filter((d) => !this.fTipo() || d.tipo === this.fTipo())
      .filter((d) => !this.fMes() || d.mes === this.fMes())
      .filter((d) => !this.fDireccion() || d.direccion === this.fDireccion())
      .filter((d) => !q || (d.nombre + ' ' + d.codigo).toLowerCase().includes(q));
  });

  protected readonly pagina = computed(() => this.filtrados().slice(0, this.limite()));

  protected cuentaTipo(tipo: string): number { return this.visibles().filter((d) => d.tipo === tipo).length; }

  protected generarReporte(): void {
    // Sin Dirección elegida se genera el consolidado; con Dirección/Registro, el reporte formal por Dirección.
    if (!this.repDireccion()) {
      const doc = this.data.generarReporteMensual(2026, this.repMes(), '', this.auth.usuario()!);
      this.verDoc.set(doc);
      this.toast.ok('Reporte generado', `Reporte mensual consolidado de ${nombreMes(this.repMes())} 2026.`);
      return;
    }
    const unidad = this.repUnidad() || this.unidadesRep()[0] || '';
    const doc = this.data.generarReporteDireccion(this.repTipo(), {
      anio: 2026, mes: this.repMes(), direccion: this.repDireccion(), unidad
    }, this.auth.usuario()!);
    this.verDoc.set(doc);
    this.toast.ok('Reporte generado', `${this.repTipo()} · ${this.data.dirUnidad(this.repDireccion(), unidad)}.`);
  }

  protected nombreMes(m: number): string { return nombreMes(m); }
  protected formatea(iso: string): string { return formateaFecha(iso); }
}
