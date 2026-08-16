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
export const NAVEGACION: NavGrupo[] = [
  {
    titulo: 'Seguimiento',
    items: [
      { ruta: '/panel', titulo: 'Panel ejecutivo', icono: 'panel' },
      { ruta: '/calendario', titulo: 'Calendario de controles', icono: 'calendar' },
      { ruta: '/historial', titulo: 'Historial anual', icono: 'archive' }
    ]
  },
  {
    titulo: 'Operación',
    items: [
      { ruta: '/controles', titulo: 'Controles mensuales', icono: 'clipboard' },
      { ruta: '/bitacora', titulo: 'Bitácora diaria', icono: 'sun' },
      { ruta: '/justificaciones', titulo: 'Justificaciones', icono: 'mail' },
      { ruta: '/inventario', titulo: 'Inventario operativo', icono: 'box' }
    ]
  },
  {
    titulo: 'Documentación',
    items: [
      { ruta: '/documentos', titulo: 'Generador de documentos', icono: 'file' },
      { ruta: '/trazabilidad', titulo: 'Trazabilidad', icono: 'clock' }
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
