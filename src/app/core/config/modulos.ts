/**
 * Módulos del ecosistema SISGOST. Los dos prototipos son sistemas Angular independientes que
 * comparten datos base (usuarios, Direcciones/Unidades, distribución de soportes y equipos),
 * así que la navegación entre ellos es un enlace: si Gestión de Equipos está levantado en su
 * puerto, el enlace abre ese módulo; si no, el enlace queda como muestra de la integración.
 *
 * `URL_GESTION_EQUIPOS` es lo único que hay que cambiar para apuntar a otro despliegue.
 */
export const URL_GESTION_EQUIPOS = 'http://localhost:4200/';

export interface ModuloSisgost {
  clave: 'equipos' | 'controles';
  nombre: string;
  descripcion: string;
  url: string;
  icono: string;
  /** true = el módulo en el que ya está el usuario. */
  actual: boolean;
}

export const MODULOS: ModuloSisgost[] = [
  {
    clave: 'equipos',
    nombre: 'Gestión de Equipos',
    descripcion: 'Preparación, asignación, configuración, aceptación, garantía y descargo de equipos.',
    url: URL_GESTION_EQUIPOS,
    icono: 'box',
    actual: false
  },
  {
    clave: 'controles',
    nombre: 'Controles Mensuales',
    descripcion: 'Controles normados, bitácora diaria, justificaciones, inventario operativo y documentos.',
    url: '/panel',
    icono: 'clipboard',
    actual: true
  }
];
