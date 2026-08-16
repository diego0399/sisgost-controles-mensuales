import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { MESES, formateaFecha } from '../../core/models/models';

/**
 * Trazabilidad: la bitácora de auditoría del módulo. Cada programación, entrega, vencimiento,
 * justificación, envío de bitácora, documento y evento de integración con Gestión de Equipos
 * queda registrado con fecha, hora, usuario, rol y estados anterior/nuevo.
 */
@Component({
  selector: 'app-trazabilidad',
  imports: [FormsModule, HelpTipComponent, DocumentoComponent],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Documentación</div>
          <h1>
            Trazabilidad
            <ui-help texto="Registro cronológico e inalterable de las acciones del módulo: controles programados, iniciados, entregados, vencidos y justificados; bitácoras enviadas; documentos generados y descargados; y los movimientos del inventario operativo que llegan desde Gestión de Equipos." />
          </h1>
          <p class="page-sub">{{ filtrados().length }} eventos registrados.</p>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Eventos del sistema</h3>
            <p class="sub">Ordenados del más reciente al más antiguo</p>
          </div>
          <div class="row">
            <input class="control" style="width: 220px;" placeholder="Buscar acción, usuario, control…" [(ngModel)]="busca" />
            <select class="control" [(ngModel)]="fDireccion">
              <option value="">Todas las direcciones</option>
              @for (d of data.direcciones(); track d.id) { <option [value]="d.id">{{ d.corta }}</option> }
            </select>
            <select class="control" [(ngModel)]="fMes">
              <option [ngValue]="0">Todos los meses</option>
              @for (m of MESES; track m; let i = $index) { <option [ngValue]="i + 1">{{ m }}</option> }
            </select>
            <select class="control" [(ngModel)]="fAccion">
              <option value="">Todas las acciones</option>
              @for (a of acciones(); track a) { <option [value]="a">{{ a }}</option> }
            </select>
          </div>
        </div>
        <div class="card-body">
          <div class="timeline">
            @for (e of pagina(); track e.id) {
              <div class="tl-item" [class.hito]="esHito(e.accion)">
                <div class="tl-when">{{ formatea(e.fecha) }} · {{ e.hora }}</div>
                <div class="tl-what">
                  {{ e.accion }}
                  @if (e.tipoControl) { — {{ e.tipoControl }} }
                  @if (e.direccion) { · {{ data.cortaDireccion(e.direccion) }} }
                </div>
                <div class="tl-who">
                  {{ e.usuario }} ({{ e.rol }})
                  @if (e.estadoAnterior || e.estadoNuevo) { · {{ e.estadoAnterior || '—' }} → <b>{{ e.estadoNuevo || '—' }}</b> }
                </div>
                @if (e.observacion) { <div class="tl-note">{{ e.observacion }}</div> }
                @if (e.documento) {
                  <div style="margin-top: 6px;">
                    <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(e.documento!)">Ver documento asociado</button>
                  </div>
                }
              </div>
            } @empty {
              <p class="muted">Sin eventos para los filtros seleccionados.</p>
            }
          </div>
          @if (filtrados().length > limite()) {
            <div class="row" style="justify-content: center; margin-top: 16px;">
              <button class="btn btn-outline btn-sm" type="button" (click)="limite.set(limite() + 60)">
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
export class TrazabilidadComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);

  protected readonly MESES = MESES;
  protected readonly busca = signal('');
  protected readonly fDireccion = signal('');
  protected readonly fMes = signal(0);
  protected readonly fAccion = signal('');
  protected readonly verDoc = signal('');
  protected readonly limite = signal(60);

  private readonly visibles = computed(() => {
    const u = this.auth.usuario();
    if (u?.clave !== 'tec-soporte') return this.data.trazabilidad();
    const propias = this.data.direccionesDe(u.usuario);
    return this.data.trazabilidad().filter((e) => !e.direccion || propias.includes(e.direccion));
  });

  protected readonly filtrados = computed(() => {
    const q = this.busca().toLowerCase();
    return this.visibles()
      .filter((e) => !this.fDireccion() || e.direccion === this.fDireccion())
      .filter((e) => !this.fMes() || Number(e.fecha.split('-')[1]) === this.fMes())
      .filter((e) => !this.fAccion() || e.accion === this.fAccion())
      .filter((e) => !q || [e.accion, e.usuario, e.tipoControl ?? '', e.observacion ?? ''].join(' ').toLowerCase().includes(q));
  });

  protected readonly pagina = computed(() => this.filtrados().slice(0, this.limite()));

  protected readonly acciones = computed(() => [...new Set(this.visibles().map((e) => e.accion))].sort());

  protected esHito(accion: string): boolean {
    return /(justificado|vencid|agregado desde|descargado desde|sin soporte)/i.test(accion);
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }
}
