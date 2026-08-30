import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import { ToastService } from '../../core/services/toast.service';
import { UsuarioSistema } from '../../core/models/models';
import { RolSistema, etiquetaRoles, nombreRol } from '../../core/models/roles';
import { BadgeComponent, ModalComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon';
import { URL_GESTION_EQUIPOS } from '../../core/config/modulos';

/**
 * Administración → Usuarios y roles.
 *
 * Aquí el Administrador **cambia los roles de cada usuario**. El rol dejó de ser un texto suelto
 * y es un arreglo: agregar y quitar son marcar y desmarcar casillas, se guardan de una vez y
 * quedan trazados con los roles anteriores y los nuevos.
 *
 * La pantalla no crea usuarios ni cuentas por rol: el ecosistema tiene un directorio único y una
 * persona con dos responsabilidades es **un usuario con dos roles**.
 */
@Component({
  selector: 'app-admin',
  imports: [FormsModule, RouterLink, BadgeComponent, ModalComponent, IconComponent],
  styles: `
    .chip-off { opacity: .55; }
    .lista-reset { margin: 8px 0 0 18px; font-size: 13px; color: var(--tx-2); }
    .lista-reset li { margin: 2px 0; }
    .roles-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .rol-chip {
      display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;
      background: var(--surface-2); border: 1px solid var(--line); color: var(--navy-800); white-space: nowrap;
    }
    .rol-chip.activo { background: var(--navy-800); border-color: var(--navy-800); color: #fff; }
    .rol-opciones { display: grid; gap: 10px; margin: 4px 0 2px; }
    .rol-op {
      display: grid; grid-template-columns: 20px 1fr; gap: 10px; align-items: start;
      border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; cursor: pointer;
    }
    .rol-op:hover { border-color: var(--line-strong); }
    .rol-op.puesto { border-color: var(--gold-500); background: #fdfaf2; }
    .rol-op input { margin-top: 3px; }
    .rol-op b { font-size: 13px; }
    .rol-op .d { font-size: 11.5px; color: var(--tx-2); line-height: 1.45; }
    .rol-op .aviso { font-size: 11.5px; color: var(--tx-3); font-style: italic; }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Administración</div>
          <h1>Usuarios y roles</h1>
          <p class="page-sub">
            Datos base compartidos con SISGOST — Gestión de Equipos: mismos usuarios, mismos roles y
            la misma estructura territorial de Zona, Departamento y Dirección/Registro.
          </p>
        </div>
        @if (auth.esAdmin()) {
          <button class="btn btn-outline" type="button" (click)="modalReset.set(true)">
            <ui-icon name="refresh" [size]="14" /> Restablecer datos de demostración
          </button>
        }
      </div>

      <div class="alert" style="margin-bottom: 18px;">
        <span class="alert-ico">i</span>
        <span>
          <b>Un usuario, varios roles.</b> Una persona que es jefa del área y además atiende sus propios
          Departamentos es un solo usuario con dos roles: no se duplica la cuenta ni se crea una por rol.
          Al iniciar sesión elige cuál usar —el <b>rol activo</b>— y puede cambiarlo desde la barra superior
          sin cerrar sesión. <a [href]="urlEquipos">Ir a Gestión de Equipos</a>.
        </span>
      </div>

      <div class="grid grid-3" style="margin-bottom: 18px;">
        <a class="card" routerLink="/catalogo" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="layers" [size]="22" style="color: var(--blue-600)" />
            <div><b>Catálogo de controles</b><div class="muted" style="font-size: 12.5px;">Frecuencias, evidencia, firma y justificación por control</div></div>
          </div>
        </a>
        <a class="card" routerLink="/distribucion" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="assign" [size]="22" style="color: var(--blue-600)" />
            <div><b>Distribución de soportes</b><div class="muted" style="font-size: 12.5px;">Responsables por Departamento y por Dirección/Registro · afecta también a Gestión de Equipos</div></div>
          </div>
        </a>
        <a class="card" routerLink="/responsables" style="text-decoration: none;">
          <div class="card-pad row" style="gap: 12px;">
            <ui-icon name="map" [size]="22" style="color: var(--blue-600)" />
            <div><b>Mapa de responsables</b><div class="muted" style="font-size: 12.5px;">Quién responde por cada Zona, Departamento y Dirección/Registro</div></div>
          </div>
        </a>
      </div>

      <div style="display: grid; gap: 16px;">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Usuarios del ecosistema</h3>
              <p class="sub">
                {{ data.usuarios().length }} usuarios · {{ conAcceso().length }} con acceso a Controles Mensuales.
                El personal de <b>Hardware</b> existe en el directorio y el sistema lo reconoce, pero
                <b>no atiende Departamentos ni Direcciones/Registros</b>: opera solo en Gestión de Equipos.
              </p>
            </div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Usuario</th><th>Nombre</th><th>Roles asignados</th><th>Unidad</th>
                    <th>Estado</th><th>Alcance</th>
                    @if (puedeEditar()) { <th style="text-align: right;">Acciones</th> }
                  </tr>
                </thead>
                <tbody>
                  @for (u of data.usuarios(); track u.usuario) {
                    <tr [class.chip-off]="!u.moduloControles">
                      <td class="mono">{{ u.usuario }}</td>
                      <td><b>{{ u.nombre }}</b><div class="muted" style="font-size: 11.5px;">{{ u.cargo }}</div></td>
                      <td>
                        <div class="roles-chips">
                          @for (r of u.roles; track r) {
                            <span class="rol-chip" [class.activo]="r === rolActivoDe(u)">{{ nombreDe(r) }}</span>
                          }
                          @if (!u.roles.length) { <span class="badge danger">Sin rol</span> }
                        </div>
                      </td>
                      <td>{{ u.unidad }}</td>
                      <td><ui-badge [estado]="u.estado" /></td>
                      <td style="max-width: 280px; font-size: 12.5px;">{{ alcance(u) }}</td>
                      @if (puedeEditar()) {
                        <td style="text-align: right;">
                          <button class="btn btn-ghost btn-sm" type="button" (click)="abrir(u)">Editar roles</button>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="alert" style="margin-top: 14px;">
              <span class="alert-ico">i</span>
              <span><b>Departamento y Dirección/Registro no son roles del sistema:</b> son el dato organizacional al que pertenecen controles, bitácoras e inventario. Quién atiende cada uno se define en la distribución de soportes.</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <h3>Estructura territorial atendida</h3>
              <p class="sub">
                Zona → Departamento → Dirección/Registro. En los departamentos que se distribuyen completos,
                la fila es el departamento y su alcance son todas sus Direcciones/Registros.
              </p>
            </div>
          </div>
          <div class="card-body">
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Zona</th><th>Departamento</th><th>Ámbito</th><th>Tipo</th><th>Equipos activos</th><th>Soporte responsable</th></tr></thead>
                <tbody>
                  @for (f of filas(); track f.clave) {
                    <tr>
                      <td>{{ f.zona }}</td>
                      <td><b>{{ f.direccion }}</b></td>
                      <td>{{ f.unidad }}</td>
                      <td><span class="rol-chip">{{ f.tipo }}</span></td>
                      <td>{{ f.equipos }}</td>
                      <td>
                        @if (f.tecnicos.length) { {{ f.tecnicos.join(' · ') }} }
                        @else { <span class="badge danger">Sin asignar</span> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      @if (editando(); as u) {
        <ui-modal [titulo]="'Roles de ' + u.nombre"
          sub="Un usuario puede tener uno o varios roles. Marque los que le correspondan."
          (cerrar)="cerrar()">
          <div class="rol-opciones">
            @for (r of data.rolesDisponibles; track r.rol) {
              <label class="rol-op" [class.puesto]="marcados().includes(r.rol)">
                <input type="checkbox" [checked]="marcados().includes(r.rol)" (change)="alternar(r.rol)" />
                <span>
                  <b>{{ r.nombre }}</b>
                  <div class="d">{{ r.descripcion }}</div>
                  @if (r.hardware) {
                    <div class="aviso">Rol de Hardware: el sistema lo reconoce, pero no puede quedar como responsable de soporte en Controles Mensuales.</div>
                  }
                </span>
              </label>
            }
          </div>

          <label class="lbl" for="obs-roles">Observación</label>
          <textarea id="obs-roles" class="control" rows="2" [(ngModel)]="observacion"
            placeholder="Por qué cambia la asignación de roles (queda en la trazabilidad)."></textarea>

          @if (error()) { <div class="alert warn" style="margin-top: 12px;"><span class="alert-ico">!</span><span>{{ error() }}</span></div> }

          <div class="alert" style="margin-top: 12px;">
            <span class="alert-ico">i</span>
            <span>
              Al guardar, los permisos se recalculan solos: no hay ningún botón de sincronizar.
              @if (marcados().length > 1) {
                {{ u.nombre }} podrá elegir su rol activo entre {{ etiqueta(marcados()) }}.
              }
            </span>
          </div>

          <div class="row" style="justify-content: space-between; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="alternarEstado(u)">
              {{ u.estado === 'Activo' ? 'Desactivar usuario' : 'Activar usuario' }}
            </button>
            <span class="row">
              <button class="btn btn-outline" type="button" (click)="cerrar()">Cancelar</button>
              <button class="btn btn-primary" type="button" (click)="guardar(u)">Guardar cambios</button>
            </span>
          </div>
        </ui-modal>
      }

      @if (modalReset()) {
        <ui-modal titulo="Restablecer datos de demostración"
          sub="Devuelve el prototipo al estado inicial para una nueva presentación"
          (cerrar)="modalReset.set(false)">
          <div class="alert warn">
            <span class="alert-ico">!</span>
            <span>
              Esta acción restablecerá los datos de demostración del módulo Controles Mensuales. ¿Desea continuar?
            </span>
          </div>
          <p class="muted" style="margin-top: 14px;">Se repondrán a su estado inicial:</p>
          <ul class="lista-reset">
            @for (c of data.coleccionesDemostracion; track c) { <li>{{ c }}</li> }
          </ul>
          <p class="muted" style="margin-top: 12px;">
            No se elimina la estructura del sistema ni se rompe la navegación: solo se descarta el trabajo
            registrado en esta sesión del navegador.
          </p>
          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button class="btn btn-outline" type="button" (click)="modalReset.set(false)">Cancelar</button>
            <button class="btn btn-primary" type="button" (click)="restablecer()">
              <ui-icon name="refresh" [size]="13" /> Restablecer datos
            </button>
          </div>
        </ui-modal>
      }
    </div>
  `
})
export class AdminComponent {
  protected readonly data = inject(DataService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly urlEquipos = URL_GESTION_EQUIPOS;
  protected readonly modalReset = signal(false);

  /** Usuario cuyos roles se están editando; null = ningún modal abierto. */
  protected readonly editando = signal<UsuarioSistema | null>(null);
  protected readonly marcados = signal<RolSistema[]>([]);
  protected observacion = '';
  protected readonly error = signal('');

  protected readonly conAcceso = computed(() => this.data.usuarios().filter((u) => u.moduloControles));

  /** Solo el Administrador edita roles; los demás ven el directorio sin acciones. */
  protected readonly puedeEditar = computed(() => this.data.puedeAdministrarUsuarios(this.auth.usuario()));

  protected nombreDe(rol: RolSistema): string { return nombreRol(rol); }
  protected etiqueta(roles: RolSistema[]): string { return etiquetaRoles(roles); }

  /** Rol activo del usuario conectado; en los demás, el de mayor alcance que muestra el directorio. */
  protected rolActivoDe(u: UsuarioSistema): RolSistema | undefined {
    return u.usuario === this.auth.usuario()?.usuario ? this.auth.rolActivo() : undefined;
  }

  protected abrir(u: UsuarioSistema): void {
    this.editando.set(u);
    this.marcados.set([...(u.roles ?? [])]);
    this.observacion = '';
    this.error.set('');
  }

  protected cerrar(): void { this.editando.set(null); this.error.set(''); }

  protected alternar(rol: RolSistema): void {
    this.marcados.update((l) => (l.includes(rol) ? l.filter((r) => r !== rol) : [...l, rol]));
    this.error.set('');
  }

  protected guardar(u: UsuarioSistema): void {
    const yo = this.auth.usuario();
    if (!yo) return;
    const fallo = this.data.actualizarRoles(u.usuario, this.marcados(), yo, this.observacion);
    if (fallo) { this.error.set(fallo); return; }
    const actualizado = this.data.usuarioPorId(u.usuario);
    // Si el Administrador se cambió los roles a sí mismo, la sesión adopta la ficha nueva en el
    // acto: nadie se queda operando con permisos que ya no tiene.
    if (actualizado) this.auth.refrescar(actualizado);
    this.toast.ok('Roles actualizados',
      `${u.nombre} queda con los roles: ${etiquetaRoles(this.marcados())}. Los permisos se recalcularon automáticamente.`);
    this.cerrar();
  }

  protected alternarEstado(u: UsuarioSistema): void {
    const yo = this.auth.usuario();
    if (!yo) return;
    const nuevo = u.estado === 'Activo' ? 'Inactivo' : 'Activo';
    const fallo = this.data.cambiarEstadoUsuario(u.usuario, nuevo, yo, this.observacion);
    if (fallo) { this.error.set(fallo); return; }
    this.toast.ok('Usuario actualizado', `${u.nombre} quedó ${nuevo.toLowerCase()}.`);
    this.cerrar();
  }

  /** Qué puede hacer cada usuario en este módulo, según **todos** sus roles. */
  protected alcance(u: UsuarioSistema): string {
    const roles = u.roles ?? [];
    const partes: string[] = [];
    if (roles.includes('ADMINISTRADOR')) partes.push('Administra usuarios, roles, catálogos y feriados.');
    if (roles.includes('ENCARGADO_SOPORTE')) partes.push('Ve toda la operatividad y administra la distribución de soportes.');
    if (roles.includes('COORDINADOR')) partes.push('Consulta panel, KPIs, historial, reportes y trazabilidad.');
    if (roles.includes('TECNICO_SOPORTE')) {
      const pares = this.data.paresDe(u.usuario);
      partes.push(pares.length
        ? `Opera ${pares.length} ámbito(s): ${pares.map((p) => this.data.territorio.etiqueta(p.direccion, p.unidad)).join('; ')}.`
        : 'Sin ámbitos asignados en la distribución de soportes.');
    }
    if (roles.some((r) => r === 'ENCARGADO_HARDWARE' || r === 'TECNICO_HARDWARE')) {
      partes.push('Opera en Gestión de Equipos; no atiende territorio en Controles Mensuales.');
    }
    return partes.join(' ') || 'Sin rol asignado.';
  }

  /** Una fila por ámbito de distribución: por Dirección/Registro en San Salvador, por Departamento en el resto. */
  protected readonly filas = computed(() => this.data.pares().map((p) => ({
    clave: `${p.direccion}|${p.unidad}`,
    zona: this.data.zonaDe(p.direccion),
    direccion: this.data.nombreDireccion(p.direccion),
    unidad: p.unidad,
    tipo: this.data.exigeRegistro(p.direccion) ? 'Dirección/Registro' : 'Departamento',
    equipos: this.data.equiposActivosDe(p.direccion, p.unidad).length,
    tecnicos: this.data.tecnicosDe(p.direccion, p.unidad).map((t) => this.data.soportes.soloNombre(t))
  })));

  protected restablecer(): void {
    this.toast.ok('Datos restablecidos', 'Los datos de demostración fueron restablecidos correctamente.');
    this.data.restablecerDemostracion();
  }
}
