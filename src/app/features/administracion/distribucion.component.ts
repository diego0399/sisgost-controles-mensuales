import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, HelpTipComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { DistribucionSoporte, UsuarioSistema, formateaFecha, isoLocal } from '../../core/models/models';
import { etiquetaRoles } from '../../core/models/roles';

/** Una persona con todo lo que hoy responde: es la unidad de trabajo de esta pantalla. */
interface FichaSoporte {
  usuario: UsuarioSistema;
  asignaciones: DistribucionSoporte[];
  historicas: DistribucionSoporte[];
  controles: number;
  pendientes: number;
  bitacoras: number;
  equipos: number;
}

/**
 * Distribución de soportes por Dirección/Registro. Se administra AQUÍ, en Controles Mensuales,
 * y gobierna los dos módulos del ecosistema:
 *
 *  · en este módulo decide quién ve y completa cada control, bitácora e inventario operativo;
 *  · en Gestión de Equipos decide qué técnicos pueden recibir equipos para configurar en cada
 *    Dirección/Registro (Técnico de Configuración del expediente único).
 *
 * La pantalla se organiza **por persona**: se edita a quien responde, no la casilla. Un Técnico
 * de Soporte atiende varias Direcciones/Registros y es su lista completa la que hay que ver junta
 * para decidir si se le carga una más.
 */
@Component({
  selector: 'app-distribucion',
  imports: [FormsModule, BadgeComponent, HelpTipComponent, ModalComponent, IconComponent],
  styles: `
    .vista-tabs { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 9px; overflow: hidden; }
    .vista-tabs button {
      border: 0; background: var(--surface); color: var(--tx-2); font-family: inherit; font-size: 12.5px;
      padding: 7px 14px; cursor: pointer; border-left: 1px solid var(--line);
    }
    .vista-tabs button:first-child { border-left: 0; }
    .vista-tabs button.on { background: var(--navy-800); color: #fff; font-weight: 600; }
    .grupo { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
    .grupo h4 { margin: 0 0 3px; font-size: 13.5px; color: var(--navy-900); }
    .grupo .sub { margin: 0 0 8px; font-size: 12px; color: var(--tx-3); }
    .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .grupo-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>
            Distribución de soportes
            <ui-help texto="Cada Técnico de Soporte responde por uno o varios ámbitos territoriales. En San Salvador se asigna Dirección/Registro por Dirección/Registro; en los demás departamentos, el departamento completo. Se edita desde la persona: sus responsabilidades se ven y se cambian juntas." />
          </h1>
          <p class="page-sub">Responsabilidades por Zona, Departamento y Dirección/Registro · registro compartido del ecosistema SISGOST.</p>
        </div>
        @if (puedeGestionar()) {
          <button class="btn btn-primary" type="button" (click)="nueva('', '', '')">Nueva asignación</button>
        }
      </div>

      <div class="alert" style="margin-bottom: 16px;">
        <span class="alert-ico">i</span>
        <span>
          <b>La regla territorial.</b> En <b>San Salvador</b> la distribución es por Dirección/Registro:
          un soporte responde por el Registro de Comercio, o por el IGCN, y por ninguno más. En
          <b>los demás departamentos</b> es por Departamento: quien responde por Santa Ana atiende
          todas sus Direcciones/Registros sin asignarse una por una.
          <br />
          <b>Esto afecta también a Gestión de Equipos.</b> Al crear el expediente único, aquel módulo
          ofrece como Técnico de Configuración únicamente a quien responde por el requerimiento según
          esta regla. Al guardar un cambio, los controles del período se recalculan solos: no hay
          ningún botón que lo dispare.
        </span>
      </div>

      @if (!puedeGestionar()) {
        <div class="alert warn" style="margin-bottom: 16px;">
          <span class="alert-ico">!</span>
          <span>
            <b>Consulta.</b>
            {{ soloSuyo()
              ? 'Aquí ve los Departamentos y Direcciones/Registros de los que es responsable. La distribución la modifica el Encargado de Soporte o el Administrador.'
              : 'Su rol consulta la distribución; modificarla corresponde al Encargado de Soporte o al Administrador.' }}
          </span>
        </div>
      }

      @if (puedeGestionar() && data.paresSinSoporte().length) {
        <div class="alert danger" style="margin-bottom: 16px;">
          <span class="alert-ico">!</span>
          <span>
            <b>Ámbitos sin soporte responsable:</b>
            {{ sinSoporte() }}. Sus controles del período no tienen quién los entregue y sus equipos
            activos quedan sin Técnico de Soporte responsable.
          </span>
        </div>
      }

      <div class="card">
        <div class="card-head">
          <div>
            <h3>Consulta</h3>
            <p class="sub">Las mismas responsabilidades, vistas por Técnico de Soporte, por ámbito territorial o una por una.</p>
          </div>
          <div class="vista-tabs">
            <button type="button" [class.on]="vista() === 'tecnico'" (click)="vista.set('tecnico')">Por soporte</button>
            <button type="button" [class.on]="vista() === 'direccion'" (click)="vista.set('direccion')">Por Departamento</button>
            <button type="button" [class.on]="vista() === 'tabla'" (click)="vista.set('tabla')">Todas</button>
          </div>
        </div>
        <div class="card-body">

          <div class="row" style="margin-bottom: 12px;">
            <input id="dist-buscar" class="control" style="max-width: 320px;" [(ngModel)]="busqueda"
              placeholder="Buscar Técnico de Soporte, Zona, Departamento o Dirección/Registro…" />
            @if (vista() === 'tabla') {
              <select class="control" style="width: 220px;" [(ngModel)]="fEstado">
                <option value="">Vigentes e históricas</option>
                <option value="activa">Solo vigentes</option>
                <option value="desactivada">Solo desactivadas</option>
              </select>
            }
            <span class="muted" style="align-self: center;">
              {{ vista() === 'tecnico' ? fichas().length + ' Técnico(s) de Soporte' : '' }}
              {{ vista() === 'direccion' ? porDireccion().length + ' ámbito(s) territorial(es)' : '' }}
              {{ vista() === 'tabla' ? filtradas().length + ' asignación(es)' : '' }}
            </span>
          </div>

          @if (vista() === 'tecnico') {
            @for (f of fichas(); track f.usuario.usuario) {
              <div class="grupo">
                <div class="grupo-head">
                  <div>
                    <h4>{{ f.usuario.nombre }} <ui-badge [estado]="f.usuario.estado" /></h4>
                    <p class="sub">
                      Roles: {{ rolesDe(f.usuario) }} · {{ f.asignaciones.length }} ámbito(s) asignado(s)
                      · {{ f.pendientes }} control(es) pendiente(s) de {{ f.controles }} del período
                      · {{ f.equipos }} equipo(s) en inventario operativo
                    </p>
                  </div>
                  <div class="row" style="flex-wrap: nowrap;">
                    <button class="btn btn-ghost btn-sm" type="button" (click)="verDetalle(f)">Ver detalle</button>
                    @if (puedeGestionar()) {
                      <button class="btn btn-outline btn-sm" type="button" (click)="editar(f)">Editar responsabilidades</button>
                    }
                  </div>
                </div>
                <div class="chip-list">
                  @for (d of f.asignaciones; track d.id) {
                    <span class="badge">{{ data.soportes.etiqueta(d.direccion, d.unidad) }}</span>
                  }
                  @if (!f.asignaciones.length) { <span class="badge warn">Sin ámbitos asignados</span> }
                </div>
              </div>
            } @empty {
              <p class="muted">Ningún Técnico de Soporte coincide con la búsqueda.</p>
            }
          }

          @else if (vista() === 'direccion') {
            @for (g of porDireccion(); track g.clave) {
              <div class="grupo">
                <div class="grupo-head">
                  <div>
                    <h4>{{ g.etiqueta }}</h4>
                    <p class="sub">
                      {{ g.zona }} · asignación por <b>{{ g.tipo }}</b>
                      · {{ g.equipos }} equipo(s) activo(s) · {{ g.controles }} control(es) del año
                    </p>
                  </div>
                  @if (puedeGestionar()) {
                    <button class="btn btn-outline btn-sm" type="button" (click)="nueva(g.direccion, g.unidad, '')">Agregar soporte</button>
                  }
                </div>
                @if (!g.asignaciones.length) {
                  <div class="chip-list"><span class="badge danger">Sin soporte responsable</span></div>
                }
                @if (!g.porDireccion) {
                  <!-- §21: al expandir un departamento se ven sus Direcciones/Registros, dejando
                       claro que TODAS quedan cubiertas por el responsable del departamento. -->
                  <p class="sub" style="margin: 6px 0 0;">
                    Alcance cubierto por el responsable del Departamento:
                  </p>
                  <div class="chip-list" style="margin-top: 4px;">
                    @for (r of g.registros; track r) { <span class="badge">{{ r }}</span> }
                  </div>
                }
                @for (d of g.asignaciones; track d.id) {
                  <div class="row" style="margin-top: 6px;">
                    <span class="badge">{{ soloNombre(d.tecnico) }}</span>
                    <button class="btn btn-ghost btn-sm" type="button" (click)="verDetalleDe(d.tecnico)">Ver detalle</button>
                    @if (puedeGestionar()) {
                      <button class="btn btn-ghost btn-sm" type="button" (click)="abrirDesactivar(d)">Desactivar soporte</button>
                    }
                  </div>
                }
              </div>
            } @empty {
              <p class="muted">Ninguna Dirección/Registro coincide con la búsqueda.</p>
            }
          }

          @else {
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr>
                  <th>Código</th><th>Técnico de Soporte</th><th>Zona</th><th>Departamento</th>
                  <th>Dirección/Registro</th><th>Tipo</th>
                  <th>Fecha de inicio</th><th>Estado</th><th>Observaciones</th>
                  @if (puedeGestionar()) { <th></th> }
                </tr></thead>
                <tbody>
                  @for (d of filtradas(); track d.id) {
                    <tr [style.opacity]="d.activo ? 1 : .6">
                      <td class="mono">{{ d.id }}</td>
                      <td><b>{{ soloNombre(d.tecnico) }}</b></td>
                      <td>{{ zonaDe(d) }}</td>
                      <td>{{ d.direccion }}</td>
                      <td>{{ d.unidad }}</td>
                      <td>{{ tipoDe(d) }}</td>
                      <td class="mono">{{ formatea(d.fecha) }}</td>
                      <td><ui-badge [estado]="d.activo ? 'Activa' : 'Desactivada'" /></td>
                      <td style="max-width: 300px;">{{ d.observacion || '—' }}</td>
                      @if (puedeGestionar()) {
                        <td>
                          @if (d.activo) {
                            <button class="btn btn-ghost btn-sm" type="button" (click)="abrirDesactivar(d)">Desactivar</button>
                          }
                        </td>
                      }
                    </tr>
                  } @empty {
                    <tr><td colspan="10" class="muted" style="text-align: center; padding: 24px;">Ninguna asignación coincide con la búsqueda.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }

        </div>
      </div>

      @if (ficha(); as f) {
        <ui-modal [titulo]="(modo() === 'editar' ? 'Editar responsabilidades — ' : 'Detalle del soporte — ') + f.usuario.nombre"
          [sub]="rolesDe(f.usuario) + ' · ' + f.usuario.estado + ' · ' + f.asignaciones.length + ' ámbito(s) vigente(s)'"
          (cerrar)="cerrarFicha()">

          <dl class="dl">
            <dt>Técnico de Soporte</dt><dd>{{ f.usuario.nombre }}</dd>
            <dt>Roles</dt><dd>{{ rolesDe(f.usuario) }}</dd>
            <dt>Estado</dt><dd><ui-badge [estado]="f.usuario.estado" /></dd>
            <dt>Carga actual del período</dt>
            <dd>{{ f.controles }} control(es) del período · {{ f.pendientes }} sin entregar</dd>
            <dt>Bitácoras asociadas</dt><dd>{{ f.bitacoras }} bitácora(s) diaria(s) de sus ámbitos</dd>
            <dt>Inventario operativo visible</dt><dd>{{ f.equipos }} equipo(s) activo(s)</dd>
          </dl>

          <hr class="divider" />
          <div class="sec-title">Ámbitos territoriales asignados</div>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr>
                <th>Zona</th><th>Departamento / Dirección·Registro</th><th>Tipo</th><th>Fecha de inicio</th><th>Estado</th>
                <th>Controles del período</th><th>Equipos</th><th>Observaciones</th>
                @if (modo() === 'editar') { <th></th> }
              </tr></thead>
              <tbody>
                @for (d of f.historicas; track d.id) {
                  <tr [style.opacity]="d.activo ? 1 : .6">
                    <td>{{ zonaDe(d) }}</td>
                    <td><b>{{ data.soportes.etiqueta(d.direccion, d.unidad) }}</b></td>
                    <td>{{ tipoDe(d) }}</td>
                    <td class="mono">{{ formatea(d.fecha) }}</td>
                    <td><ui-badge [estado]="d.activo ? 'Activa' : 'Desactivada'" /></td>
                    <td>{{ controlesDe(d) }}</td>
                    <td>{{ equiposDe(d) }}</td>
                    <td style="max-width: 260px;">
                      {{ d.observacion || '—' }}
                      @if (!d.activo && d.motivoDesactivacion) {
                        <div class="muted">Desactivada el {{ formatea(d.fechaDesactivacion ?? '') }}: {{ d.motivoDesactivacion }}</div>
                      }
                    </td>
                    @if (modo() === 'editar') {
                      <td>
                        @if (d.activo) {
                          <button class="btn btn-ghost btn-sm" type="button" (click)="abrirDesactivar(d)">Desactivar</button>
                        }
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="muted" style="text-align: center; padding: 20px;">Todavía no atiende ningún ámbito territorial.</td></tr>
                }
              </tbody>
            </table>
          </div>

          @if (modo() === 'editar') {
            <hr class="divider" />
            <div class="sec-title">Agregar ámbito territorial</div>
            <div class="form-grid">
              <div class="field">
                <label for="ag-zona">Zona</label>
                <select id="ag-zona" class="control" [(ngModel)]="nuevaZona" (ngModelChange)="alCambiarZona()">
                  <option value="">Todas las zonas</option>
                  @for (z of data.territorio.zonasOrdenadas(); track z.id) { <option [value]="z.id">{{ z.nombre }}</option> }
                </select>
              </div>
              <div class="field">
                <label for="ag-dir">Departamento <span style="color: var(--danger)">*</span></label>
                <select id="ag-dir" class="control" [(ngModel)]="nuevaDireccion" (ngModelChange)="nuevaUnidad = ''">
                  <option value="">Seleccione…</option>
                  @for (d of departamentos(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
                </select>
              </div>
              <!-- §23: la Dirección/Registro solo se pide donde la regla territorial lo exige; en
                   los demás departamentos se explica por qué no aparece, en vez de dejar el campo
                   mudo o, peor, guardar una asignación que la regla no admite. -->
              @if (exigeRegistro()) {
                <div class="field">
                  <label for="ag-uni">Dirección/Registro <span style="color: var(--danger)">*</span></label>
                  <select id="ag-uni" class="control" [(ngModel)]="nuevaUnidad">
                    <option value="">Seleccione…</option>
                    @for (u of unidadesDe(); track u) { <option [value]="u">{{ u }}</option> }
                  </select>
                </div>
              } @else if (nuevaDireccion) {
                <div class="field" style="grid-column: 1 / -1;">
                  <div class="alert"><span class="alert-ico">i</span><span>{{ data.MSG_DIST_POR_DEPARTAMENTO }}
                    El responsable cubrirá las {{ unidadesDe().length }} Direcciones/Registros de {{ nombreDepartamento() }}.</span></div>
                </div>
              }
              <div class="field">
                <label for="ag-fecha">Fecha de inicio</label>
                <input id="ag-fecha" class="control" type="date" [(ngModel)]="nuevaFecha" />
              </div>
              <div class="field">
                <label for="ag-estado">Estado</label>
                <select id="ag-estado" class="control" [(ngModel)]="nuevoEstado">
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </div>
              <div class="field" style="grid-column: 1 / -1;">
                <label for="ag-obs">Observaciones</label>
                <input id="ag-obs" class="control" [(ngModel)]="nuevaObs" placeholder="Motivo de la asignación…" />
              </div>
            </div>
            <div class="row" style="justify-content: flex-end; margin-top: 12px;">
              <button id="ag-guardar" class="btn btn-primary" type="button" (click)="agregar(f)">
                <ui-icon name="assign" [size]="13" /> Agregar ámbito
              </button>
            </div>
          }
        </ui-modal>
      }

      @if (modal()) {
        <ui-modal titulo="Nueva asignación de soporte"
          sub="El técnico asignado responde por los controles y la bitácora del ámbito, y queda disponible como Técnico de Configuración en Gestión de Equipos"
          (cerrar)="modal.set(false)">
          <div class="form-grid">
            <div class="field">
              <label for="na-tec">Técnico de Soporte <span style="color: var(--danger)">*</span></label>
              <select id="na-tec" class="control" [(ngModel)]="nuevoUsuario">
                <option value="">Seleccione…</option>
                @for (u of data.tecnicosSoporte(); track u.usuario) { <option [value]="u.usuario">{{ u.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-zona">Zona</label>
              <select id="na-zona" class="control" [(ngModel)]="nuevaZona" (ngModelChange)="alCambiarZona()">
                <option value="">Todas las zonas</option>
                @for (z of data.territorio.zonasOrdenadas(); track z.id) { <option [value]="z.id">{{ z.nombre }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="na-dir">Departamento <span style="color: var(--danger)">*</span></label>
              <select id="na-dir" class="control" [(ngModel)]="nuevaDireccion" (ngModelChange)="nuevaUnidad = ''">
                <option value="">Seleccione…</option>
                @for (d of departamentos(); track d.id) { <option [value]="d.id">{{ d.nombre }}</option> }
              </select>
            </div>
            @if (exigeRegistro()) {
              <div class="field">
                <label for="na-uni">Dirección/Registro <span style="color: var(--danger)">*</span></label>
                <select id="na-uni" class="control" [(ngModel)]="nuevaUnidad">
                  <option value="">Seleccione…</option>
                  @for (u of unidadesDe(); track u) { <option [value]="u">{{ u }}</option> }
                </select>
              </div>
            } @else if (nuevaDireccion) {
              <div class="field" style="grid-column: 1 / -1;">
                <div class="alert"><span class="alert-ico">i</span><span>{{ data.MSG_DIST_POR_DEPARTAMENTO }}
                  El responsable cubrirá las {{ unidadesDe().length }} Direcciones/Registros de {{ nombreDepartamento() }}.</span></div>
              </div>
            }
            <div class="field">
              <label for="na-fecha">Fecha de inicio</label>
              <input id="na-fecha" class="control" type="date" [(ngModel)]="nuevaFecha" />
            </div>
            <div class="field">
              <label for="na-estado">Estado</label>
              <select id="na-estado" class="control" [(ngModel)]="nuevoEstado">
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
            </div>
            <div class="field">
              <label for="na-obs">Observaciones</label>
              <input id="na-obs" class="control" [(ngModel)]="nuevaObs" placeholder="Motivo de la asignación…" />
            </div>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="modal.set(false)">Cancelar</button>
            <button id="na-guardar" class="btn btn-primary" type="button" (click)="guardar()">Asignar</button>
          </div>
        </ui-modal>
      }

      @if (aDesactivar(); as d) {
        <ui-modal titulo="Desactivar responsabilidad" [sub]="soloNombre(d.tecnico) + ' · ' + data.soportes.etiqueta(d.direccion, d.unidad)" (cerrar)="aDesactivar.set(null)">
          <div class="alert warn" style="margin-bottom: 14px;">
            <span class="alert-ico">!</span>
            <span>La responsabilidad no se borra: queda en el historial porque los controles y equipos
              registrados mientras estuvo vigente siguen apuntando a ella. Los controles ya entregados
              se conservan.</span>
          </div>
          <div class="field">
            <label for="dz-motivo">Motivo <span style="color: var(--danger)">*</span></label>
            <textarea id="dz-motivo" class="control" rows="3" [(ngModel)]="motivoDesactivar"></textarea>
          </div>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="aDesactivar.set(null)">Cancelar</button>
            <button id="dz-confirmar" class="btn btn-danger" type="button" (click)="desactivar()">
              <ui-icon name="alert" [size]="13" /> Desactivar responsabilidad
            </button>
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

  protected readonly vista = signal<'tecnico' | 'direccion' | 'tabla'>('tecnico');
  protected readonly busqueda = signal('');
  protected readonly fEstado = signal('');
  protected readonly modal = signal(false);
  protected readonly aDesactivar = signal<DistribucionSoporte | null>(null);
  /** Persona abierta en el panel y con qué intención: consultarla o editarla. */
  protected readonly enPantalla = signal<string>('');
  protected readonly modo = signal<'detalle' | 'editar'>('detalle');

  protected nuevoUsuario = '';
  /** Filtro de zona del formulario: acota la lista de departamentos, no forma parte del dato. */
  protected nuevaZona = '';
  protected nuevaDireccion = '';
  protected nuevaUnidad = '';
  protected nuevaFecha = isoLocal(new Date());
  protected nuevoEstado = 'Activo';
  protected nuevaObs = '';
  protected motivoDesactivar = '';

  protected puedeGestionar(): boolean { return this.data.puedeGestionarDistribucion(this.auth.usuario()); }
  protected soloSuyo(): boolean { return this.data.soloVeLoSuyo(this.auth.usuario()); }

  private coincide(...textos: string[]): boolean {
    const q = this.busqueda().trim().toLowerCase();
    return !q || textos.some((t) => (t ?? '').toLowerCase().includes(q));
  }

  /** Una ficha por Técnico de Soporte; el técnico conectado solo se ve a sí mismo. */
  protected readonly fichas = computed<FichaSoporte[]>(() => {
    const yo = this.auth.usuario();
    return this.data.tecnicosSoporte()
      .filter((u) => !this.soloSuyo() || u.usuario === yo?.usuario)
      .map((u) => this.fichaDe(u))
      .filter((f) => this.coincide(f.usuario.nombre, ...f.asignaciones.map((d) => `${this.zonaDe(d)} ${d.direccion} ${d.unidad}`)));
  });

  private fichaDe(u: UsuarioSistema): FichaSoporte {
    const carga = this.data.cargaDeSoporte(u.usuario);
    const todas = this.data.soportes.todasDeTecnico(u.nombre);
    return {
      usuario: u,
      asignaciones: todas.filter((d) => d.activo),
      historicas: [...todas].sort((a, b) => Number(b.activo) - Number(a.activo) || a.direccion.localeCompare(b.direccion)),
      controles: carga.controlesPeriodo,
      pendientes: carga.pendientes + carga.vencidos,
      bitacoras: carga.bitacoras,
      equipos: carga.equipos
    };
  }

  protected readonly ficha = computed<FichaSoporte | null>(() => {
    const u = this.data.tecnicosSoporte().find((x) => x.usuario === this.enPantalla());
    return u ? this.fichaDe(u) : null;
  });

  /** Una tarjeta por Dirección/Registro del catálogo organizacional, con o sin soporte. */
  protected readonly porDireccion = computed(() => this.data.pares()
    .map((p) => ({
      clave: `${p.direccion}|${p.unidad}`,
      direccion: p.direccion,
      unidad: p.unidad,
      zona: this.data.zonaDe(p.direccion),
      porDireccion: this.data.exigeRegistro(p.direccion),
      tipo: this.data.exigeRegistro(p.direccion) ? 'Dirección/Registro' : 'Departamento',
      // El alcance completo del ámbito: en un departamento distribuido entero son todas sus
      // Direcciones/Registros, y es lo que hay que poder ver al expandirlo (§21).
      registros: this.data.registrosDelAmbito(p.direccion, p.unidad).map((r) => r.unidad),
      etiqueta: this.data.dirUnidad(p.direccion, p.unidad),
      asignaciones: this.data.soportes.deDireccionUnidad(p.direccion, p.unidad),
      equipos: this.data.equiposActivosDe(p.direccion, p.unidad).length,
      controles: this.data.controles().filter((c) => c.direccion === p.direccion && c.unidad === p.unidad).length
    }))
    .filter((g) => !this.soloSuyo() || g.asignaciones.some((d) => d.tecnicoId === this.data.soportes.idTecnico(this.auth.usuario()?.nombre ?? '')))
    .filter((g) => this.coincide(g.etiqueta, ...g.asignaciones.map((d) => d.tecnico))));

  protected readonly filtradas = computed(() => this.data.distribucion()
    .filter((d) => !this.soloSuyo() || d.tecnicoId === this.data.soportes.idTecnico(this.auth.usuario()?.nombre ?? ''))
    .filter((d) => !this.fEstado() || (this.fEstado() === 'activa' ? d.activo : !d.activo))
    .filter((d) => this.coincide(d.tecnico, d.direccion, d.unidad, d.id, this.zonaDe(d)))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.direccion.localeCompare(b.direccion) || a.unidad.localeCompare(b.unidad)));

  /** Departamentos que ofrece el formulario, acotados por la zona elegida. */
  protected departamentos() {
    const zona = this.nuevaZona;
    const lista = this.data.territorio.departamentosActivos();
    return zona ? lista.filter((d) => d.zonaId === zona) : lista;
  }

  /** Al cambiar de zona se limpia lo elegido debajo: un departamento de otra zona no aplica. */
  protected alCambiarZona(): void { this.nuevaDireccion = ''; this.nuevaUnidad = ''; }

  /**
   * ¿El departamento elegido exige Dirección/Registro? Lo dice el catálogo territorial, no una
   * comparación contra el texto «San Salvador».
   */
  protected exigeRegistro(): boolean {
    return !!this.nuevaDireccion && this.data.exigeRegistro(this.nuevaDireccion);
  }

  protected nombreDepartamento(): string { return this.data.nombreDireccion(this.nuevaDireccion); }

  protected unidadesDe(): string[] {
    return this.data.territorio.registrosDe(this.nuevaDireccion).map((r) => r.nombre);
  }

  /** Zona de una asignación, para las tablas. */
  protected zonaDe(d: DistribucionSoporte): string {
    return this.data.territorio.nombreZona(d.zonaId || this.data.territorio.zonaDe(d.departamentoId || d.direccion));
  }

  protected tipoDe(d: DistribucionSoporte): string {
    return d.tipoAsignacion === 'DIRECCION_REGISTRO' ? 'Dirección/Registro' : 'Departamento';
  }

  /** «Encargado de Soporte · Técnico de Soporte»: todos los roles, no solo el activo. */
  protected rolesDe(u: UsuarioSistema): string { return etiquetaRoles(u.roles ?? []); }

  protected sinSoporte(): string {
    return this.data.paresSinSoporte().map((p) => this.data.territorio.etiqueta(p.direccion, p.unidad)).join('; ');
  }

  protected soloNombre(tecnico: string): string { return this.data.soportes.soloNombre(tecnico); }
  protected formatea(iso: string): string { return iso ? formateaFecha(iso) : '—'; }

  protected controlesDe(d: DistribucionSoporte): number {
    return this.data.controlesDeResponsabilidad(d.departamentoId || d.direccion, d.unidad).length;
  }
  protected equiposDe(d: DistribucionSoporte): number {
    return this.data.equiposActivosDe(d.departamentoId || d.direccion, d.unidad).length;
  }

  // ------------------------------------------------------------------ acciones

  /** Detalle de un responsable desde la vista por Dirección/Registro: es la misma ficha. */
  protected verDetalleDe(tecnico: string): void {
    const id = this.data.soportes.idTecnico(tecnico);
    const u = this.data.tecnicosSoporte().find((x) => this.data.soportes.idTecnico(x.nombre) === id);
    if (u) this.verDetalle(this.fichaDe(u));
  }

  protected verDetalle(f: FichaSoporte): void {
    this.modo.set('detalle');
    this.enPantalla.set(f.usuario.usuario);
    this.data.registrarConsultaDistribucion(f.usuario.nombre, this.auth.usuario());
  }

  protected editar(f: FichaSoporte): void {
    this.limpiarFormulario();
    this.modo.set('editar');
    this.enPantalla.set(f.usuario.usuario);
  }

  protected cerrarFicha(): void { this.enPantalla.set(''); }

  private limpiarFormulario(): void {
    this.nuevaZona = '';
    this.nuevaDireccion = '';
    this.nuevaUnidad = '';
    this.nuevaFecha = isoLocal(new Date());
    this.nuevoEstado = 'Activo';
    this.nuevaObs = '';
  }

  protected nueva(direccion: string, unidad: string, usuario: string): void {
    this.limpiarFormulario();
    this.nuevoUsuario = usuario;
    this.nuevaZona = direccion ? this.data.territorio.zonaDe(direccion) : '';
    this.nuevaDireccion = direccion;
    // Un ámbito departamental llega con «Todo el departamento» como unidad: eso no es una
    // Dirección/Registro elegible, así que el formulario arranca sin nada seleccionado.
    this.nuevaUnidad = direccion && this.data.exigeRegistro(direccion) ? unidad : '';
    this.modal.set(true);
  }

  /** Alta desde la ficha de la persona: el técnico ya está decidido. */
  protected agregar(f: FichaSoporte): void {
    if (this.aplicar(f.usuario.usuario)) this.limpiarFormulario();
  }

  protected guardar(): void {
    if (this.aplicar(this.nuevoUsuario)) this.modal.set(false);
  }

  /**
   * Guardar es lo único que hace el usuario: la sincronización de controles, perfiles e
   * inventario ocurre dentro, sin botón que la dispare.
   */
  private aplicar(usuario: string): boolean {
    const error = this.data.asignarDistribucion({
      direccion: this.nuevaDireccion, unidad: this.nuevaUnidad, tecnico: usuario,
      observacion: this.nuevaObs, fechaInicio: this.nuevaFecha, activo: this.nuevoEstado === 'Activo'
    }, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible asignar', error);
      return false;
    }
    this.toast.ok('Distribución actualizada', this.data.MSG_DIST_SINCRONIZADA);
    return true;
  }

  protected abrirDesactivar(d: DistribucionSoporte): void {
    this.motivoDesactivar = '';
    this.aDesactivar.set(d);
  }

  protected desactivar(): void {
    const d = this.aDesactivar();
    if (!d) return;
    const error = this.data.desactivarDistribucion(d.id, this.motivoDesactivar, this.auth.usuario()!);
    if (error) {
      this.toast.warn('No es posible desactivar', error);
      return;
    }
    this.aDesactivar.set(null);
    this.toast.ok('Responsabilidad desactivada', this.data.MSG_DIST_SINCRONIZADA);
  }
}
