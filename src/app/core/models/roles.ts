/**
 * ROLES DEL ECOSISTEMA SISGOST — **este archivo es el mismo en los dos proyectos** (Controles
 * Mensuales y Gestión de Equipos) y no debe divergir.
 *
 * Un usuario **puede tener más de un rol**. El rol dejó de ser un texto suelto y pasó a ser un
 * arreglo (`roles: RolSistema[]`); una persona que es jefa del área y además atiende sus propias
 * Direcciones/Registros es **un solo usuario con dos roles**, no dos cuentas.
 *
 * Cuando alguien tiene varios roles elige un **rol activo** para la sesión: es el que ordena el
 * menú, el panel y las acciones a la vista. El sistema, en cambio, nunca olvida los demás: los
 * permisos combinados siguen ahí (`AuthService.tieneRol`), de modo que un Administrador que
 * también es Técnico de Soporte entra a Administración y ve sus asignaciones técnicas sin
 * cambiar de cuenta.
 *
 * `clave` es la forma corta con la que el prototipo venía trabajando (`admin`, `tec-soporte`…).
 * Se conserva porque es la que leen el menú, los guards y las pantallas, y ahora significa
 * exactamente **el rol activo**.
 */

/** Rol del sistema, en la forma canónica con la que se guarda y se traza. */
export type RolSistema =
  | 'ADMINISTRADOR'
  | 'ENCARGADO_SOPORTE'
  | 'TECNICO_SOPORTE'
  | 'COORDINADOR'
  | 'ENCARGADO_HARDWARE'
  | 'TECNICO_HARDWARE';

/** Forma corta del rol; es la que usan el menú, los guards y las pantallas. */
export type ClaveRolSistema =
  'admin' | 'enc-soporte' | 'tec-soporte' | 'coordinador' | 'enc-hardware' | 'tec-hardware';

export interface DefinicionRol {
  rol: RolSistema;
  clave: ClaveRolSistema;
  /** Nombre institucional del rol, tal como se muestra. */
  nombre: string;
  descripcion: string;
  /**
   * Prioridad al elegir el rol activo por omisión: el más alto manda. Quien es Encargado y
   * Técnico entra como Encargado, que es la vista más amplia, y cambia de rol si lo necesita.
   */
  prioridad: number;
  /** `true` = el rol opera dentro de SISGOST — Controles Mensuales. */
  moduloControles: boolean;
  /** `true` = el rol pertenece a la unidad de Hardware. */
  hardware: boolean;
}

/**
 * Los seis roles del ecosistema. Hardware existe y el sistema lo reconoce, pero **no atiende
 * Direcciones/Registros**: en Controles Mensuales nunca puede quedar como responsable de soporte.
 */
export const ROLES: DefinicionRol[] = [
  {
    rol: 'ADMINISTRADOR', clave: 'admin', nombre: 'Administrador',
    descripcion: 'Administra usuarios, roles, catálogos y la configuración del sistema.',
    prioridad: 60, moduloControles: true, hardware: false
  },
  {
    rol: 'ENCARGADO_SOPORTE', clave: 'enc-soporte', nombre: 'Encargado de Soporte',
    descripcion: 'Jefe del área: ve toda la operatividad, revisa entregas y administra la distribución de soportes.',
    prioridad: 50, moduloControles: true, hardware: false
  },
  {
    rol: 'ENCARGADO_HARDWARE', clave: 'enc-hardware', nombre: 'Encargado de Hardware',
    descripcion: 'Responsable del inventario y la preparación técnica de equipos en Gestión de Equipos.',
    prioridad: 40, moduloControles: false, hardware: true
  },
  {
    rol: 'COORDINADOR', clave: 'coordinador', nombre: 'Coordinador',
    descripcion: 'Consulta y seguimiento: panel, operatividad, KPIs, historial y reportes. No opera ni administra.',
    prioridad: 30, moduloControles: true, hardware: false
  },
  {
    rol: 'TECNICO_SOPORTE', clave: 'tec-soporte', nombre: 'Técnico de Soporte',
    descripcion: 'Atiende las Direcciones/Registros que le asigna la distribución de soportes.',
    prioridad: 20, moduloControles: true, hardware: false
  },
  {
    rol: 'TECNICO_HARDWARE', clave: 'tec-hardware', nombre: 'Técnico de Hardware',
    descripcion: 'Prepara equipos (F0288) en Gestión de Equipos. No atiende Direcciones/Registros.',
    prioridad: 10, moduloControles: false, hardware: true
  }
];

export function definicionRol(rol: RolSistema): DefinicionRol | undefined {
  return ROLES.find((r) => r.rol === rol);
}

export function nombreRol(rol: RolSistema): string {
  return definicionRol(rol)?.nombre ?? rol;
}

export function claveDeRol(rol: RolSistema): ClaveRolSistema {
  return definicionRol(rol)?.clave ?? 'tec-soporte';
}

export function rolDeClave(clave: string | undefined): RolSistema | undefined {
  return ROLES.find((r) => r.clave === clave)?.rol;
}

/** ¿Es un rol de la unidad de Hardware? Ninguno puede ser responsable de soporte. */
export function esRolHardware(rol: RolSistema): boolean {
  return definicionRol(rol)?.hardware === true;
}

/** Roles que operan dentro de Controles Mensuales. */
export const ROLES_CONTROLES: RolSistema[] = ROLES.filter((r) => r.moduloControles).map((r) => r.rol);

/**
 * El **único** rol que puede quedar como responsable de una Dirección/Registro. Ni Hardware ni el
 * Coordinador atienden territorio: el Coordinador solo consulta y Hardware trabaja equipos, no
 * oficinas.
 */
export const ROL_RESPONSABLE_SOPORTE: RolSistema = 'TECNICO_SOPORTE';

/**
 * Normaliza los roles de un usuario. Acepta el arreglo nuevo, el `clave` heredado o el nombre
 * del rol escrito a mano, para que una foto de estado guardada antes de este cambio siga
 * abriendo sin perder a nadie.
 */
export function normalizaRoles(origen: { roles?: unknown; clave?: unknown; rol?: unknown }): RolSistema[] {
  const validos = new Set(ROLES.map((r) => r.rol));
  const salida: RolSistema[] = [];
  const agrega = (r: RolSistema | undefined) => { if (r && validos.has(r) && !salida.includes(r)) salida.push(r); };

  if (Array.isArray(origen.roles)) {
    for (const r of origen.roles) {
      if (typeof r !== 'string') continue;
      const texto = r.trim().toUpperCase().replace(/[\s-]+/g, '_');
      agrega(validos.has(texto as RolSistema) ? (texto as RolSistema) : rolDeClave(r.trim()));
    }
  }
  if (!salida.length) agrega(rolDeClave(typeof origen.clave === 'string' ? origen.clave : undefined));
  if (!salida.length && typeof origen.rol === 'string') {
    const porNombre = ROLES.find((r) => r.nombre.toLowerCase() === origen.rol!.toString().trim().toLowerCase());
    agrega(porNombre?.rol);
  }
  return ordenaRoles(salida);
}

/** Los roles siempre en el mismo orden de mando: así la lista se lee igual en todas partes. */
export function ordenaRoles(roles: RolSistema[]): RolSistema[] {
  return [...roles].sort((a, b) => (definicionRol(b)?.prioridad ?? 0) - (definicionRol(a)?.prioridad ?? 0));
}

/** Rol activo por omisión de un usuario con varios roles: el de mayor alcance. */
export function rolPrincipal(roles: RolSistema[]): RolSistema | undefined {
  return ordenaRoles(roles)[0];
}

/** «Encargado de Soporte · Técnico de Soporte», para tablas, chips y trazabilidad. */
export function etiquetaRoles(roles: RolSistema[]): string {
  return ordenaRoles(roles).map(nombreRol).join(' · ') || 'Sin rol asignado';
}
