/**
 * Módulos del ecosistema SISGOST.
 * Ambos prototipos son aplicaciones Angular independientes desplegadas en Vercel.
 * Los botones de Gestión de Equipos redirigen al despliegue principal de SISGOST.
 */
export const URL_GESTION_EQUIPOS = 'https://prototipo-angular-three.vercel.app/';

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
