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
 * Jefatura solo consulta (seguimiento, documentos y trazabilidad); Administración
 * queda reservada al Administrador, salvo el catálogo y la distribución, que el
 * Encargado de Soporte necesita consultar para asignar responsables.
 */
const OPERAN: ClaveRol[] = ['admin', 'enc-soporte', 'tec-soporte', 'jefatura'];

export const NAVEGACION: NavGrupo[] = [
  {
    titulo: 'Seguimiento',
    items: [
      { ruta: '/panel', titulo: 'Panel ejecutivo', icono: 'panel', roles: OPERAN },
      { ruta: '/calendario', titulo: 'Calendario de controles', icono: 'calendar', roles: OPERAN },
      { ruta: '/historial', titulo: 'Historial anual', icono: 'archive', roles: OPERAN }
    ]
  },
  {
    titulo: 'Operación',
    items: [
      { ruta: '/controles', titulo: 'Controles mensuales', icono: 'clipboard', roles: OPERAN },
      { ruta: '/bitacora', titulo: 'Bitácora diaria', icono: 'sun', roles: OPERAN },
      { ruta: '/justificaciones', titulo: 'Justificaciones', icono: 'mail', roles: OPERAN },
      { ruta: '/inventario', titulo: 'Inventario operativo', icono: 'box', roles: OPERAN }
    ]
  },
  {
    titulo: 'Documentación',
    items: [
      { ruta: '/documentos', titulo: 'Generador de documentos', icono: 'file', roles: OPERAN },
      { ruta: '/trazabilidad', titulo: 'Trazabilidad', icono: 'clock', roles: OPERAN }
    ]
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: '/administracion', titulo: 'Usuarios y direcciones', icono: 'users', roles: ['admin'] },
      { ruta: '/catalogo', titulo: 'Catálogo de controles', icono: 'layers', roles: ['admin', 'enc-soporte'] },
      { ruta: '/distribucion', titulo: 'Distribución de soportes', icono: 'assign', roles: ['admin', 'enc-soporte'] },
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
