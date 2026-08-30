import { ClaveRol } from '../models/models';

export interface NavItem {
  ruta: string;
  titulo: string;
  icono: string;
  /** Sin lista = visible para todos los roles conectados. */
  roles?: ClaveRol[];
}

export interface NavGrupo {
  titulo: string;
  items: NavItem[];
}

/**
 * Menú y permisos por rol, compartidos entre el shell y el guard de rutas.
 *
 * · **Administrador**: todo, incluida la configuración (usuarios, catálogo, feriados, demo).
 * · **Encargado de Soporte** (jefe del área): ve todas las Direcciones/Registros, la operatividad,
 *   los pendientes y vencidos, el historial, los reportes y la distribución de soportes.
 * · **Técnico de Soporte**: opera lo suyo (controles, bitácora, justificaciones e inventario de
 *   sus Direcciones/Registros) y consulta —sin editar— la distribución de las que atiende.
 * · **Coordinador**: consulta y seguimiento — panel, operatividad por Dirección, historial,
 *   documentos, trazabilidad y distribución de soportes. No completa controles ni administra.
 */
/** Todos los roles del módulo. */
const TODOS: ClaveRol[] = ['admin', 'enc-soporte', 'tec-soporte', 'coordinador'];
/** Roles que operan controles y bitácoras; el Coordinador solo consulta. */
const OPERAN: ClaveRol[] = ['admin', 'enc-soporte', 'tec-soporte'];

export const NAVEGACION: NavGrupo[] = [
  {
    titulo: 'Seguimiento',
    items: [
      { ruta: '/panel', titulo: 'Panel ejecutivo', icono: 'panel', roles: TODOS },
      { ruta: '/calendario', titulo: 'Calendario de controles', icono: 'calendar', roles: OPERAN },
      { ruta: '/historial', titulo: 'Historial anual', icono: 'archive', roles: TODOS }
    ]
  },
  {
    titulo: 'Operación',
    items: [
      { ruta: '/controles', titulo: 'Controles mensuales', icono: 'clipboard', roles: TODOS },
      { ruta: '/bitacora', titulo: 'Bitácora diaria', icono: 'sun', roles: OPERAN },
      { ruta: '/justificaciones', titulo: 'Justificaciones', icono: 'mail', roles: OPERAN },
      { ruta: '/inventario', titulo: 'Inventario operativo', icono: 'box', roles: OPERAN }
    ]
  },
  {
    titulo: 'Documentación',
    items: [
      { ruta: '/documentos', titulo: 'Generador de documentos', icono: 'file', roles: TODOS },
      { ruta: '/trazabilidad', titulo: 'Trazabilidad', icono: 'clock', roles: TODOS }
    ]
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: '/administracion', titulo: 'Usuarios y roles', icono: 'users', roles: ['admin'] },
      { ruta: '/catalogo', titulo: 'Catálogo de controles', icono: 'layers', roles: ['admin', 'enc-soporte'] },
      // La distribución la CONSULTAN los cuatro roles —el técnico, limitado a lo suyo; el
      // Coordinador, sin editar—; modificarla sigue siendo del Encargado de Soporte y el
      // Administrador, y eso lo decide la pantalla, no el menú.
      { ruta: '/distribucion', titulo: 'Distribución de soportes', icono: 'assign', roles: TODOS },
      // Mapa de responsables: la vista territorial de quién responde por cada Departamento y por
      // cada Dirección/Registro de San Salvador. La consultan los cuatro roles; editar sigue
      // siendo del Encargado de Soporte y el Administrador, y eso lo decide la pantalla.
      { ruta: '/responsables', titulo: 'Mapa de responsables', icono: 'map', roles: TODOS },
      { ruta: '/feriados', titulo: 'Feriados', icono: 'flag', roles: ['admin'] }
    ]
  }
];

/** ¿El rol puede entrar a la ruta? (misma tabla que dibuja el menú). */
export function permiteRuta(clave: ClaveRol | undefined, ruta: string): boolean {
  if (!clave) return false;
  for (const g of NAVEGACION) {
    const item = g.items.find((i) => ruta.startsWith(i.ruta));
    if (item) return !item.roles || item.roles.includes(clave);
  }
  return true;
}
