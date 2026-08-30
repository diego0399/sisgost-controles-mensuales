import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { DistribucionSoporte, UsuarioSistema, formateaFecha, isoLocal } from '../../core/models/models';
import { etiquetaRoles } from '../../core/models/roles';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';

/** Una fila del mapa: un ámbito territorial con quién responde por él. */
interface FilaResponsable {
  clave: string;
  zonaId: string;
  zona: string;
  departamentoId: string;
  departamento: string;
  /** Nombre de la Dirección/Registro, o «Todo el departamento». */
  ambito: string;
  tipo: 'Departamento' | 'Dirección/Registro';
  porDireccion: boolean;
  /** Direcciones/Registros que el ámbito cubre; con más de una, la fila se puede expandir. */
  alcance: string[];
  asignaciones: DistribucionSoporte[];
  equipos: number;
  controles: number;
  pendientes: number;
}

/**
 * MAPA DE RESPONSABLES DE SOPORTE — la vista territorial del ecosistema.
 *
 * Responde de un vistazo a la pregunta que antes había que reconstruir a mano: **quién responde
 * por cada Departamento y por cada Dirección/Registro**. Se organiza como la organización real,
 * `Zona → Departamento → Dirección/Registro`, y muestra la regla territorial tal como es:
 *
 * · en **San Salvador** hay una fila por Dirección/Registro, porque ahí se asigna una por una;
 * · en **los demás departamentos** hay una sola fila por departamento, y al expandirla se ven sus
 *   Direcciones/Registros con la advertencia de que **todas** quedan cubiertas por el responsable
 *   del departamento. No es que falten asignaciones: es que la regla no las pide.
 *
 * Qué se puede hacer aquí depende del rol activo: el Administrador y el Encargado de Soporte
 * editan; el Técnico de Soporte consulta lo suyo; el Coordinador consulta y filtra.
 */
@Component({
  selector: 'app-responsables',
  imports: [FormsModule, RouterLink, BadgeComponent, HelpTipComponent, ModalComponent, IconComponent],
  styles: `
    .filtros { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
    @media (max-width: 1100px) { .filtros { grid-template-columns: repeat(2, 1fr); } }
    .zona-h {
      display: flex; align-items: baseline; gap: 10px; margin: 18px 0 8px;
      padding-bottom: 6px; border-bottom: 2px solid var(--gold-500);
    }
    .zona-h h3 { margin: 0; font-size: 15px; color: var(--navy-900); }
    .zona-h .n { font-size: 12px; color: var(--tx-3); }
    .fila-exp { background: var(--surface-2); }
    .fila-exp .alcance { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .tipo-dep { color: var(--tx-2); font-size: 11.5px; }
    .resp-lista { display: grid; gap: 3px; }
    /* Nueve columnas: sin anchos acotados, «Observaciones» y las acciones se salen de la vista,
       que es justo lo que hay que poder leer de un vistazo. */
    .tbl th { white-space: normal; line-height: 1.2; vertical-align: bottom; }
    .c-dep { width: 116px; }
    .c-amb { width: 190px; }
    .c-tipo { width: 96px; }
    .c-tec { width: 128px; }
    .c-roles { width: 130px; }
    .c-desde { width: 84px; }
    .c-estado { width: 92px; }
    .c-obs { width: 200px; font-size: 12px; }
    .c-acc { width: 150px; text-align: right; }
    .kpi-mini { display: flex; gap: 14px; flex-wrap: wrap; }
    .kpi-mini > div { min-width: 92px; }
    .kpi-mini b { display: block; font-size: 19px; color: var(--navy-900); line-height: 1.1; }
    .kpi-mini span { font-size: 11px; color: var(--tx-3); text-transform: uppercase; letter-spacing: .04em; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Mapa de responsables de soporte
            <ui-help texto="Quién responde por cada Zona, Departamento y Dirección/Registro. En San Salvador la responsabilidad es por Dirección/Registro; en los demás departamentos, por Departamento completo." />
          </h1>
          <p class="page-sub">Responsables por Departamento y Dirección/Registro · la misma distribución que consume Gestión de Equipos.</p>
        </div>
        @if (puedeEditar()) {
          <a class="btn btn-outline" routerLink="/distribucion">
            <ui-icon name="assign" [size]="14" /> Administrar por persona
          </a>
        }
      </div>

      <div class="alert" style="margin-bottom: 16px;">
        <span class="alert-ico">i</span>
        <span>
          <b>Cómo leer este mapa.</b> Una fila «Dirección/Registro» significa que el soporte responde
          por ese Registro y por ningún otro; hoy solo San Salvador se distribuye así. Una fila
          «Departamento» significa que el soporte atiende <b>todas</b> las Direcciones/Registros del
          departamento: expándala para verlas. Los cambios se reflejan solos en los controles, el
          inventario y Gestión de Equipos; no hay ningún botón de sincronizar.
        </span>
      </div>

      <div class="card" style="margin-bottom: 16px;">
        <div class="card-body">
          <div class="kpi-mini">
            <div><b>{{ resumen().ambitos }}</b><span>Ámbitos</span></div>
            <div><b>{{ resumen().conResponsable }}</b><span>Con responsable</span></div>
            <div><b>{{ resumen().sinResponsable }}</b><span>Sin responsable</span></div>
            <div><b>{{ resumen().tecnicos }}</b><span>Técnicos asignados</span></div>
            <div><b>{{ resumen().departamentos }}</b><span>Departamentos</span></div>
            <div><b>{{ resumen().registros }}</b><span>Direcciones/Registros</span></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Distribución territorial</h3>
            <p class="sub">
              {{ filas().length }} ámbito(s) según los filtros ·
              {{ soloSuyo() ? 'limitado a los ámbitos que usted atiende' : 'toda la estructura del país' }}
            </p>
          </div>
        </div>
        <div class="card-body">
          <div class="filtros">
            <select class="control" [(ngModel)]="fZona" (ngModelChange)="fDepartamento.set('')">
              <option value="">Zona: todas</option>
              @for (z of data.territorio.zonasOrdenadas(); track z.id) { <option [value]="z.id">{{ z.nombre }}</option> }
            </select>
            <select class="control" [(ngModel)]="fDepartamento" (ngModelChange)="fRegistro.set('')">
              <option value="">Departamento: todos</option>
              @for (d of departamentosFiltro(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
            </select>
            <select class="control" [(ngModel)]="fRegistro">
              <option value="">Dirección/Registro: todas</option>
              @for (r of registrosFiltro(); track r.id) { <option [value]="r.id">{{ r.nombre }}</option> }
            </select>
            <select class="control" [(ngModel)]="fTecnico">
              <option value="">Técnico de Soporte: todos</option>
              @for (t of data.tecnicosSoporte(); track t.usuario) { <option [value]="t.usuario">{{ t.nombre }}</option> }
            </select>
            <select class="control" [(ngModel)]="fEstado">
              <option value="">Estado: todos</option>
              <option value="activo">Con responsable activo</option>
              <option value="inactivo">Sin responsable</option>
            </select>
          </div>

          @for (g of porZona(); track g.zonaId) {
            <div class="zona-h">
              <h3>{{ g.zona }}</h3>
              <span class="n">{{ g.filas.length }} ámbito(s) · {{ g.departamentos }} departamento(s)</span>
            </div>
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th class="c-dep">Departamento</th><th class="c-amb">Dirección/Registro</th>
                    <th class="c-tipo">Tipo de asignación</th>
                    <th class="c-tec">Técnico responsable</th><th class="c-roles">Roles del técnico</th>
                    <th class="c-desde">Desde</th>
                    <th class="c-estado">Estado</th><th class="c-obs">Observaciones</th>
                    <th class="c-acc">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of g.filas; track f.clave) {
                    <tr>
                      <td><b>{{ f.departamento }}</b></td>
                      <td>
                        {{ f.ambito }}
                        @if (!f.porDireccion) {
                          <div class="tipo-dep">{{ f.alcance.length }} Direcciones/Registros cubiertas</div>
                        }
                      </td>
                      <td>{{ f.tipo }}</td>
                      <td>
                        <div class="resp-lista">
                          @for (d of f.asignaciones; track d.id) { <span><b>{{ soloNombre(d.tecnico) }}</b></span> }
                          @if (!f.asignaciones.length) { <span class="badge danger">Sin responsable</span> }
                        </div>
                      </td>
                      <td style="font-size: 11.5px;">
                        @for (d of f.asignaciones; track d.id) { <div>{{ rolesDe(d.tecnico) }}</div> }
                        @if (!f.asignaciones.length) { <span class="muted">—</span> }
                      </td>
                      <td class="mono">
                        @for (d of f.asignaciones; track d.id) { <div>{{ formatea(d.fecha) }}</div> }
                        @if (!f.asignaciones.length) { <span class="muted">—</span> }
                      </td>
                      <td><ui-badge [estado]="f.asignaciones.length ? 'Activo' : 'Sin asignar'" /></td>
                      <td class="c-obs">
                        @for (d of f.asignaciones; track d.id) { <div>{{ d.observacion || '—' }}</div> }
                        @if (!f.asignaciones.length) { <span class="muted">Ningún Técnico de Soporte responde por este ámbito.</span> }
                      </td>
                      <td class="c-acc">
                        <button class="btn btn-ghost btn-sm" type="button" (click)="alternar(f.clave)">
                          {{ expandida() === f.clave ? 'Ocultar' : 'Ver detalle' }}
                        </button>
                        @if (puedeEditar()) {
                          <button class="btn btn-outline btn-sm" type="button" (click)="abrirEdicion(f)">
                            {{ f.asignaciones.length ? 'Editar responsable' : 'Agregar responsable' }}
                          </button>
                        }
                      </td>
                    </tr>

                    @if (expandida() === f.clave) {
                      <tr class="fila-exp">
                        <td colspan="9">
                          <b>Alcance de atención</b>
                          @if (!f.porDireccion) {
                            <p class="sub" style="margin: 4px 0 0;">
                              En {{ f.departamento }} la distribución se realiza por Departamento: todas estas
                              Direcciones/Registros quedan cubiertas por
                              {{ f.asignaciones.length ? nombresDe(f) : 'el responsable que se asigne al departamento' }}.
                            </p>
                          } @else {
                            <p class="sub" style="margin: 4px 0 0;">
                              En {{ f.departamento }} la distribución se realiza por Dirección/Registro: este responsable
                              atiende únicamente {{ f.ambito }}.
                            </p>
                          }
                          <div class="alcance">
                            @for (r of f.alcance; track r) { <span class="badge">{{ r }}</span> }
                          </div>

                          <div class="kpi-mini" style="margin-top: 12px;">
                            <div><b>{{ f.controles }}</b><span>Controles del período</span></div>
                            <div><b>{{ f.pendientes }}</b><span>Sin entregar</span></div>
                            <div><b>{{ f.equipos }}</b><span>Equipos activos</span></div>
                          </div>

                          <div class="row" style="margin-top: 12px;">
                            <a class="btn btn-ghost btn-sm" routerLink="/controles">Ver controles asociados</a>
                            <a class="btn btn-ghost btn-sm" routerLink="/inventario">Ver inventario operativo</a>
                            @if (f.asignaciones.length) {
                              <button class="btn btn-ghost btn-sm" type="button" (click)="verHistorial(f)">Ver historial</button>
                            }
                          </div>

                          @if (historial().length && expandida() === f.clave) {
                            <div class="table-wrap" style="margin-top: 10px;">
                              <table class="tbl tbl-compacta">
                                <thead><tr><th>Código</th><th>Técnico</th><th>Desde</th><th>Estado</th><th>Motivo / observación</th></tr></thead>
                                <tbody>
                                  @for (h of historial(); track h.id) {
                                    <tr [style.opacity]="h.activo ? 1 : .6">
                                      <td class="mono">{{ h.id }}</td>
                                      <td>{{ soloNombre(h.tecnico) }}</td>
                                      <td class="mono">{{ formatea(h.fecha) }}</td>
                                      <td><ui-badge [estado]="h.activo ? 'Activa' : 'Desactivada'" /></td>
                                      <td>{{ h.motivoDesactivacion || h.observacion || '—' }}</td>
                                    </tr>
                                  }
                                </tbody>
                              </table>
                            </div>
                          }
                        </td>
                      </tr>
                    }
                  } @empty {
                    <tr><td colspan="9" class="muted" style="text-align: center; padding: 22px;">Ningún ámbito coincide con los filtros.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          } @empty {
            <p class="muted">Ningún ámbito coincide con los filtros seleccionados.</p>
          }
        </div>
      </div>

      @if (editando(); as f) {
        <ui-modal [titulo]="(f.asignaciones.length ? 'Editar responsable — ' : 'Agregar responsable — ') + f.departamento"
          [sub]="f.zona + ' · ' + f.ambito + ' · asignación por ' + f.tipo"
          (cerrar)="cerrarEdicion()">

          <!-- §23: el aviso no es decorativo. Explica por qué no hay selector de Dirección/Registro
               en los departamentos que se distribuyen completos. -->
          @if (!f.porDireccion) {
            <div class="alert" style="margin-bottom: 14px;">
              <span class="alert-ico">i</span>
              <span>
                {{ data.MSG_DIST_POR_DEPARTAMENTO }} El responsable que elija atenderá las
                {{ f.alcance.length }} Direcciones/Registros de {{ f.departamento }}:
                {{ f.alcance.join(' · ') }}.
              </span>
            </div>
          }

          @if (f.asignaciones.length) {
            <div class="sec-title">Responsables vigentes</div>
            <div class="table-wrap" style="margin-bottom: 14px;">
              <table class="tbl tbl-compacta">
                <thead><tr><th>Técnico</th><th>Roles</th><th>Desde</th><th></th></tr></thead>
                <tbody>
                  @for (d of f.asignaciones; track d.id) {
                    <tr>
                      <td><b>{{ soloNombre(d.tecnico) }}</b></td>
                      <td>{{ rolesDe(d.tecnico) }}</td>
                      <td class="mono">{{ formatea(d.fecha) }}</td>
                      <td style="text-align: right;">
                        <button class="btn btn-ghost btn-sm" type="button" (click)="abrirDesactivar(d)">Desactivar</button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }

          <div class="sec-title">Agregar responsable</div>
          <div class="form-grid">
            <div class="field">
              <label for="mr-tec">Técnico de Soporte <span style="color: var(--danger)">*</span></label>
              <select id="mr-tec" class="control" [(ngModel)]="nuevoUsuario">
                <option value="">Seleccione…</option>
                @for (u of data.tecnicosSoporte(); track u.usuario) { <option [value]="u.usuario">{{ u.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="mr-fecha">Fecha de inicio</label>
              <input id="mr-fecha" class="control" type="date" [(ngModel)]="nuevaFecha" />
            </div>
            <div class="field" style="grid-column: 1 / -1;">
              <label for="mr-obs">Observaciones</label>
              <input id="mr-obs" class="control" [(ngModel)]="nuevaObs" placeholder="Motivo de la asignación…" />
            </div>
          </div>

          <div class="alert" style="margin-top: 12px;">
            <span class="alert-ico">i</span>
            <span>
              Solo se pueden asignar usuarios con rol <b>Técnico de Soporte</b>. El personal de Hardware
              y el Coordinador no atienden territorio.
            </span>
          </div>

          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="cerrarEdicion()">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="guardar(f)">Asignar responsable</button>
          </div>
        </ui-modal>
      }

      @if (aDesactivar(); as d) {
        <ui-modal titulo="Desactivar responsabilidad"
          [sub]="soloNombre(d.tecnico) + ' · ' + data.soportes.etiqueta(d.direccion, d.unidad)"
          (cerrar)="aDesactivar.set(null)">
          <div class="alert warn" style="margin-bottom: 14px;">
            <span class="alert-ico">!</span>
            <span>La responsabilidad no se borra: queda en el historial porque los controles y los equipos
              registrados mientras estuvo vigente siguen apuntando a ella.</span>
          </div>
          <div class="field">
            <label for="mr-motivo">Motivo <span style="color: var(--danger)">*</span></label>
            <textarea id="mr-motivo" class="control" rows="3" [(ngModel)]="motivoDesactivar"></textarea>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="aDesactivar.set(null)">Cancelar</button>
            <button class="btn btn-danger" type="button" (click)="desactivar()">
              <ui-icon name="alert" [size]="13" /> Desactivar responsabilidad
            </button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class ResponsablesComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly fZona = signal('');
  protected readonly fDepartamento = signal('');
  protected readonly fRegistro = signal('');
  protected readonly fTecnico = signal('');
  protected readonly fEstado = signal('');

  protected readonly expandida = signal('');
  protected readonly historial = signal<DistribucionSoporte[]>([]);
  protected readonly editando = signal<FilaResponsable | null>(null);
  protected readonly aDesactivar = signal<DistribucionSoporte | null>(null);

  protected nuevoUsuario = '';
  protected nuevaFecha = isoLocal(new Date());
  protected nuevaObs = '';
  protected motivoDesactivar = '';

  constructor() {
    // Consultar el mapa es un hecho auditable: deja constancia de quién miró la distribución
    // territorial y con qué rol activo (§32).
    const u = this.auth.usuario();
    this.data.registrarEvento(u, {
      accion: 'Pantalla dinámica de responsables consultada',
      observacion: `${u?.nombre ?? 'Sistema'} abrió el mapa de responsables de soporte con el rol activo ${u?.rol ?? '—'}.`
    });
  }

  /** El Administrador y el Encargado de Soporte editan; el Técnico y el Coordinador consultan. */
  protected puedeEditar(): boolean { return this.data.puedeGestionarDistribucion(this.auth.usuario()); }
  protected soloSuyo(): boolean { return this.data.soloVeLoSuyo(this.auth.usuario()); }

  protected departamentosFiltro() {
    const z = this.fZona();
    const lista = this.data.territorio.departamentosActivos();
    return z ? lista.filter((d) => d.zonaId === z) : lista;
  }

  protected registrosFiltro() {
    const d = this.fDepartamento();
    return d ? this.data.territorio.registrosDe(d) : this.data.territorio.direccionesRegistro();
  }

  /** Todas las filas del mapa, ya filtradas. */
  protected readonly filas = computed<FilaResponsable[]>(() => {
    const yo = this.auth.usuario();
    const idYo = this.data.soportes.idTecnico(yo?.nombre ?? '');
    return this.data.pares()
      .map((p) => this.filaDe(p.direccion, p.unidad))
      .filter((f) => !this.fZona() || f.zonaId === this.fZona())
      .filter((f) => !this.fDepartamento() || f.departamentoId === this.fDepartamento())
      .filter((f) => !this.fRegistro() || f.alcance.includes(this.data.territorio.nombreRegistro(this.fRegistro())))
      .filter((f) => !this.fTecnico() || f.asignaciones.some((d) => d.tecnicoId === this.idDe(this.fTecnico())))
      .filter((f) => !this.fEstado()
        || (this.fEstado() === 'activo' ? f.asignaciones.length > 0 : f.asignaciones.length === 0))
      // El Técnico de Soporte ve el mapa limitado a lo que atiende: consultar, no editar (§22).
      .filter((f) => !this.soloSuyo() || f.asignaciones.some((d) => d.tecnicoId === idYo));
  });

  /** Las filas agrupadas por zona: así se lee la organización como es. */
  protected readonly porZona = computed(() => this.data.territorio.zonasOrdenadas()
    .map((z) => {
      const filas = this.filas().filter((f) => f.zonaId === z.id);
      return {
        zonaId: z.id, zona: z.nombre, filas,
        departamentos: new Set(filas.map((f) => f.departamentoId)).size
      };
    })
    .filter((g) => g.filas.length > 0));

  protected readonly resumen = computed(() => {
    const filas = this.filas();
    const tecnicos = new Set(filas.flatMap((f) => f.asignaciones.map((d) => d.tecnicoId)));
    return {
      ambitos: filas.length,
      conResponsable: filas.filter((f) => f.asignaciones.length).length,
      sinResponsable: filas.filter((f) => !f.asignaciones.length).length,
      tecnicos: tecnicos.size,
      departamentos: new Set(filas.map((f) => f.departamentoId)).size,
      registros: filas.reduce((n, f) => n + f.alcance.length, 0)
    };
  });

  private filaDe(departamentoId: string, unidad: string): FilaResponsable {
    const t = this.data.territorio;
    const porDireccion = t.distribuyePorDireccion(departamentoId);
    const controles = this.data.controlesDeResponsabilidad(departamentoId, unidad);
    return {
      clave: `${departamentoId}|${unidad}`,
      zonaId: t.zonaDe(departamentoId),
      zona: t.nombreZona(t.zonaDe(departamentoId)),
      departamentoId,
      departamento: t.nombreDepartamento(departamentoId),
      ambito: unidad,
      tipo: porDireccion ? 'Dirección/Registro' : 'Departamento',
      porDireccion,
      alcance: this.data.registrosDelAmbito(departamentoId, unidad).map((r) => r.unidad),
      asignaciones: this.data.soportes.deDireccionUnidad(departamentoId, unidad),
      equipos: this.data.equiposActivosDe(departamentoId, unidad).length,
      controles: controles.length,
      pendientes: controles.filter((c) => !['Entregado', 'Entregado tarde', 'Cerrado', 'Justificado', 'No aplica'].includes(c.estado)).length
    };
  }

  private idDe(usuario: string): string {
    const u = this.data.usuarios().find((x) => x.usuario === usuario);
    return this.data.soportes.idTecnico(u?.nombre ?? usuario);
  }

  protected alternar(clave: string): void {
    this.historial.set([]);
    this.expandida.update((c) => (c === clave ? '' : clave));
  }

  protected verHistorial(f: FilaResponsable): void {
    const reg = this.data.territorio.idRegistro(f.departamentoId, f.ambito);
    this.historial.set(this.data.soportes.historialDe(f.departamentoId, reg)
      .sort((a, b) => Number(b.activo) - Number(a.activo) || b.fecha.localeCompare(a.fecha)));
  }

  protected nombresDe(f: FilaResponsable): string {
    return f.asignaciones.map((d) => this.soloNombre(d.tecnico)).join(' · ');
  }

  protected soloNombre(tecnico: string): string { return this.data.soportes.soloNombre(tecnico); }
  protected formatea(iso: string): string { return iso ? formateaFecha(iso) : '—'; }

  /** Todos los roles del técnico, no solo aquel con el que figura en la asignación (§20). */
  protected rolesDe(tecnico: string): string {
    const id = this.data.soportes.idTecnico(tecnico);
    const u: UsuarioSistema | undefined = this.data.usuarios()
      .find((x) => this.data.soportes.idTecnico(x.nombre) === id);
    return u ? etiquetaRoles(u.roles ?? []) : this.data.soportes.rolDe(tecnico);
  }

  // ------------------------------------------------------------------ edición

  protected abrirEdicion(f: FilaResponsable): void {
    this.nuevoUsuario = '';
    this.nuevaFecha = isoLocal(new Date());
    this.nuevaObs = '';
    this.editando.set(f);
  }

  protected cerrarEdicion(): void { this.editando.set(null); }

  /**
   * Guardar es lo único que hace el usuario. La Dirección/Registro no se pregunta aquí: la fila
   * ya define el ámbito, y la regla territorial decide si se guarda como departamental o no.
   */
  protected guardar(f: FilaResponsable): void {
    const yo = this.auth.usuario();
    if (!yo) return;
    const error = this.data.asignarDistribucion({
      direccion: f.departamentoId,
      unidad: f.porDireccion ? f.ambito : '',
      tecnico: this.nuevoUsuario,
      observacion: this.nuevaObs,
      fechaInicio: this.nuevaFecha,
      activo: true
    }, yo);
    if (error) { this.toast.warn('No es posible asignar', error); return; }
    this.toast.ok('Responsable asignado', this.data.MSG_DIST_SINCRONIZADA);
    this.cerrarEdicion();
  }

  protected abrirDesactivar(d: DistribucionSoporte): void {
    this.motivoDesactivar = '';
    this.aDesactivar.set(d);
  }

  protected desactivar(): void {
    const d = this.aDesactivar();
    const yo = this.auth.usuario();
    if (!d || !yo) return;
    const error = this.data.desactivarDistribucion(d.id, this.motivoDesactivar, yo);
    if (error) { this.toast.warn('No es posible desactivar', error); return; }
    this.aDesactivar.set(null);
    this.cerrarEdicion();
    this.toast.ok('Responsabilidad desactivada', this.data.MSG_DIST_SINCRONIZADA);
  }
}
