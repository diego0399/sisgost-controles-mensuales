import { Injectable, computed, signal } from '@angular/core';
import { UsuarioSistema } from '../models/models';
import {
  ClaveRolSistema, RolSistema, claveDeRol, etiquetaRoles, nombreRol, normalizaRoles, ordenaRoles,
  rolDeClave, rolPrincipal
} from '../models/roles';

const STORAGE_KEY = 'sisgost.controles.sesion';

/**
 * Sesión simulada de SISGOST — Controles Mensuales.
 *
 * **Un usuario puede tener más de un rol.** La sesión guarda todos (`usuario().roles`) y, además,
 * cuál está **activo**: el rol activo ordena el menú, el panel, los filtros y las acciones a la
 * vista, para que quien es Encargado y Técnico a la vez no tenga que leer dos interfaces
 * mezcladas. Los demás roles no se pierden nunca: `tieneRol()` sigue respondiendo por todos, así
 * que un Administrador que además es Técnico de Soporte entra a Administración y ve sus
 * asignaciones técnicas sin cerrar sesión ni cambiar de cuenta.
 *
 * `usuario().clave` y `usuario().rol` reflejan **el rol activo**; por eso todas las pantallas que
 * ya los leían siguen funcionando y pasan a responder al rol elegido.
 *
 * Dirección/Registro NO es un rol: es dato organizacional de los controles.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly usuario = signal<UsuarioSistema | null>(this.leerSesion());

  /** Todos los roles del usuario conectado, en orden de mando. */
  readonly roles = computed<RolSistema[]>(() => this.usuario()?.roles ?? []);

  /** Rol activo de la sesión. */
  readonly rolActivo = computed<RolSistema | undefined>(() => rolDeClave(this.usuario()?.clave));

  /** ¿Tiene más de un rol? Solo entonces aparece el selector de rol activo. */
  readonly multirol = computed(() => this.roles().length > 1);

  /** «Encargado de Soporte · Técnico de Soporte», para la ficha del usuario y la trazabilidad. */
  readonly etiquetaRoles = computed(() => etiquetaRoles(this.roles()));

  // --------------------------------------------------------- rol activo (lo que se ve)

  readonly esAdmin = computed(() => this.usuario()?.clave === 'admin');
  readonly esEncargado = computed(() => this.usuario()?.clave === 'enc-soporte');
  readonly esTecnico = computed(() => this.usuario()?.clave === 'tec-soporte');
  /** El Coordinador consulta indicadores y reportes; nunca completa ni entrega. */
  readonly esConsulta = computed(() => this.usuario()?.clave === 'coordinador');
  /** El Encargado de Soporte es el jefe del área. */
  readonly esJefe = computed(() => this.usuario()?.clave === 'enc-soporte');
  /** Puede completar/entregar controles y bitácoras (técnico) o revisar (encargado). */
  readonly puedeOperar = computed(() => this.esTecnico() || this.esEncargado() || this.esAdmin());

  // --------------------------------------------------------- permisos combinados (lo que se puede)

  /** ¿El usuario tiene ese rol, esté activo o no? Es la base de los permisos combinados (§6). */
  tieneRol(rol: RolSistema): boolean { return this.roles().includes(rol); }

  /** ¿Tiene alguno de estos roles? */
  tieneAlguno(...roles: RolSistema[]): boolean { return roles.some((r) => this.tieneRol(r)); }

  /** Puede administrar aunque ahora mismo esté mirando el sistema con otro rol activo. */
  readonly puedeAdministrar = computed(() => this.roles().includes('ADMINISTRADOR'));

  /** Tiene responsabilidades técnicas propias, aunque su rol activo sea otro. */
  readonly esTambienTecnico = computed(() => this.roles().includes('TECNICO_SOPORTE'));

  // --------------------------------------------------------- sesión

  private leerSesion(): UsuarioSistema | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? this.normalizar(JSON.parse(raw) as UsuarioSistema) : null;
    } catch {
      return null;
    }
  }

  /**
   * Deja el usuario con sus roles resueltos y un rol activo coherente. Acepta un registro
   * heredado —el que solo traía `clave`— para que una sesión anterior a este cambio siga
   * abriendo sin dejar a nadie fuera.
   */
  private normalizar(u: UsuarioSistema, activo?: RolSistema): UsuarioSistema {
    const roles = ordenaRoles(normalizaRoles(u));
    const elegido = activo && roles.includes(activo)
      ? activo
      : (rolDeClave(u.clave) && roles.includes(rolDeClave(u.clave)!) ? rolDeClave(u.clave)! : rolPrincipal(roles));
    return {
      ...u,
      roles,
      clave: (elegido ? claveDeRol(elegido) : u.clave) as ClaveRolSistema,
      rol: elegido ? nombreRol(elegido) : u.rol
    };
  }

  login(u: UsuarioSistema, rolInicial?: RolSistema): void {
    const listo = this.normalizar(u, rolInicial);
    this.usuario.set(listo);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(listo));
  }

  /**
   * Cambia el rol activo **sin cerrar sesión**. Devuelve el rol que estaba activo antes, o `null`
   * si no hubo cambio (el usuario no tiene ese rol, o ya lo tenía activo): quien llama lo usa
   * para registrar el evento de trazabilidad con el estado anterior y el nuevo.
   */
  cambiarRolActivo(rol: RolSistema): RolSistema | null {
    const u = this.usuario();
    if (!u || !u.roles.includes(rol)) return null;
    const anterior = rolDeClave(u.clave);
    if (anterior === rol) return null;
    const listo = this.normalizar(u, rol);
    this.usuario.set(listo);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(listo));
    return anterior ?? null;
  }

  /**
   * Adopta la ficha actualizada del usuario conectado cuando el Administrador le cambia los
   * roles: si el rol activo dejó de existir, se pasa al de mayor alcance que le quede.
   */
  refrescar(u: UsuarioSistema): void {
    if (this.usuario()?.usuario !== u.usuario) return;
    const activo = rolDeClave(this.usuario()!.clave);
    this.login(u, activo && u.roles?.includes(activo) ? activo : undefined);
  }

  logout(): void {
    this.usuario.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
