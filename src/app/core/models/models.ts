/**
 * Modelo de datos de SISGOST — Controles Mensuales.
 *
 * El dominio sale del análisis de la carpeta `controles/` real de la oficina departamental:
 * controles normados (F0234, F0389, F0382, F0384, F0386, F0387, F0422, mantenimientos F017x/F0288,
 * GLPI, vulnerabilidades), su frecuencia observada (semanal en F0389 y F0387, mensual en el resto,
 * eventual cuando dependen de actividad) y la carta de justificación de `Formatos_nuevos_2025_.docx`
 * con sus tres firmas.
 */

// ---------------------------------------------------------------------------- Organización

/** Dirección u oficina atendida. NO es un rol del sistema: es dato organizacional. */
export interface Direccion {
  id: string;
  nombre: string;
  /** Abreviatura para tablas y chips («USU», «CSOD»). */
  corta: string;
  /** Unidades o áreas internas atendidas (RPRH, IGCN, DTI…). */
  unidades: string[];
  /** Direcciones sin soporte asignado generan alerta en el panel ejecutivo. */
  activa: boolean;
}

export type ClaveRol = 'admin' | 'enc-soporte' | 'tec-soporte' | 'jefatura';

export interface UsuarioSistema {
  usuario: string;
  nombre: string;
  iniciales: string;
  rol: string;
  clave: ClaveRol;
  cargo: string;
}

/** Asignación de un Técnico de Soporte a una Dirección/Unidad. */
export interface DistribucionSoporte {
  id: string;
  usuario: string;
  tecnico: string;
  direccion: string;
  unidad: string;
  fechaInicio: string;
  estado: 'Activa' | 'Finalizada';
  observaciones: string;
}

// ---------------------------------------------------------------------------- Calendario

export interface Feriado {
  /** ISO `AAAA-MM-DD`. */
  fecha: string;
  nombre: string;
  /** Los feriados de San Salvador solo aplican a las oficinas de esa plaza; el catálogo es editable. */
  ambito: 'Nacional' | 'San Salvador';
}

// ---------------------------------------------------------------------------- Catálogo de controles

export type Frecuencia = 'Mensual' | 'Semanal' | 'Diaria' | 'Eventual' | 'Programado';

/** Campo de una sección de formulario digital. */
export interface CampoPlantilla {
  id: string;
  etiqueta: string;
  tipo: 'texto' | 'fecha' | 'hora' | 'numero' | 'area' | 'opcion';
  opciones?: string[];
  obligatorio?: boolean;
  ayuda?: string;
}

/** Ítem de checklist con estado por marcar. */
export interface ItemPlantilla {
  id: string;
  nombre: string;
  /** Estados admitidos; por defecto Bueno/Malo/No aplica. */
  estados?: string[];
  /** Pide medición o nivel junto al estado (temperatura, % UPS…). */
  medicion?: string;
}

/** Columnas de una tabla dinámica de filas libres. */
export interface TablaPlantilla {
  columnas: string[];
  /** Nº mínimo de filas exigidas para entregar (0 = opcional). */
  minimo: number;
}

/** Sección de un formulario digital; el «stepper» de completar control recorre estas secciones. */
export interface SeccionPlantilla {
  titulo: string;
  descripcion?: string;
  campos?: CampoPlantilla[];
  items?: ItemPlantilla[];
  tabla?: TablaPlantilla;
}

export interface ControlCatalogo {
  codigo: string;
  nombre: string;
  version: string;
  frecuencia: Frecuencia;
  /** A qué direcciones aplica: lista de ids o «Todas». */
  aplicaA: string[] | 'Todas';
  requiereEvidencia: boolean;
  requiereFirma: boolean;
  permiteJustificacion: boolean;
  activo: boolean;
  descripcion: string;
  /** Secciones del formulario digital construidas desde el formato físico real. */
  plantilla: SeccionPlantilla[];
}

// ---------------------------------------------------------------------------- Controles del período

export type EstadoControl =
  | 'Programado' | 'Pendiente' | 'En proceso' | 'En revisión' | 'Entregado'
  | 'Entregado tarde' | 'Vencido' | 'Justificado' | 'Observado' | 'Cerrado' | 'No aplica';

export interface RespuestaCampo { id: string; valor: string; }
export interface RespuestaItem { id: string; estado: string; medicion?: string; nota?: string; }
export interface RespuestaSeccion {
  titulo: string;
  campos?: RespuestaCampo[];
  items?: RespuestaItem[];
  filas?: string[][];
}

export interface EvidenciaControl { nombre: string; descripcion: string; fecha: string; }

/** Instancia de un control programado para un mes (o semana) y una Dirección/Unidad. */
export interface ControlMes {
  id: string;
  codigo: string;
  anio: number;
  /** 1–12. */
  mes: number;
  /** Solo controles semanales: número de semana dentro del mes (1–5). */
  semana?: number;
  direccion: string;
  unidad: string;
  responsable: string;
  estado: EstadoControl;
  /** ISO; primeros 3 días hábiles del mes para los mensuales. */
  fechaLimite: string;
  fechaEntrega?: string;
  horaEntrega?: string;
  /** 0–100, calculado desde las secciones respondidas. */
  avance: number;
  secciones: RespuestaSeccion[];
  evidencias: EvidenciaControl[];
  observaciones: string;
  /** Id del documento generado al entregar. */
  documento?: string;
  /** Id de la justificación cuando el control cerró sin actividad. */
  justificacion?: string;
}

// ---------------------------------------------------------------------------- Bitácora diaria

export type EstadoBitacora = 'Pendiente' | 'En edición' | 'Enviada' | 'Enviada tarde' | 'Vencida' | 'Observada' | 'Cerrada';

/** Elemento del equipo de atención al público revisado a diario. */
export interface RevisionAtencion {
  elemento: string;
  estado: 'Funciona correctamente' | 'Presenta falla' | 'No aplica' | '';
  descripcionFalla?: string;
  accionRealizada?: string;
  estadoFinal?: 'Resuelto' | 'Pendiente' | 'Escalado' | 'En observación' | '';
  evidencia?: string;
}

export interface ActividadDia {
  hora: string;
  actividad: string;
  area: string;
  resultado: string;
  observaciones: string;
}

export interface BitacoraDiaria {
  id: string;
  /** ISO del día que cubre. */
  fecha: string;
  direccion: string;
  unidad: string;
  responsable: string;
  estado: EstadoBitacora;
  /** Límite institucional: 17:00 del mismo día. */
  horaEnvio?: string;
  revision: RevisionAtencion[];
  actividades: ActividadDia[];
  observaciones: string;
  documento?: string;
}

// ---------------------------------------------------------------------------- Justificaciones

export interface FirmaJustificacion { nombre: string; cargo: string; estado: 'Registrada' | 'Pendiente'; }

/** Carta emitida cuando un control no tuvo actividad en el mes (formato Formatos_nuevos_2025_.docx). */
export interface Justificacion {
  id: string;
  codigoControl: string;
  anio: number;
  mes: number;
  direccion: string;
  responsable: string;
  motivo: string;
  /** Cuerpo de la carta («Se informa que en el mes de … no se realizó …, debido a que …»). */
  texto: string;
  fecha: string;
  estado: 'Emitida' | 'En revisión' | 'Aceptada';
  firmas: FirmaJustificacion[];
  documento?: string;
}

// ---------------------------------------------------------------------------- Inventario operativo

export type EstadoEquipoOperativo =
  | 'Activo en Dirección/Unidad' | 'Descargado' | 'En garantía'
  | 'Pendiente de revisión' | 'Reingresado a Hardware' | 'No disponible';

/** Equipo activo en una Dirección/Unidad; entra desde Gestión de Equipos al aceptarse la entrega. */
export interface EquipoOperativo {
  inventario: string;
  tipo: string;
  marca: string;
  modelo: string;
  serie: string;
  nombreEquipo: string;
  usuarioFinal: string;
  carne: string;
  direccion: string;
  unidad: string;
  tecnicoConfiguracion: string;
  soporteResponsable: string;
  fechaAceptacion: string;
  expedienteUnico: string;
  estado: EstadoEquipoOperativo;
  garantia: string;
  ultimoControl?: string;
}

/** Evento simulado que emite Gestión de Equipos hacia este módulo. */
export interface EventoIntegracion {
  id: string;
  tipo: 'Entrega aceptada' | 'Descargo de equipo';
  fecha: string;
  expedienteUnico: string;
  equipo: EquipoOperativo;
  aplicado: boolean;
}

// ---------------------------------------------------------------------------- Documentos y trazabilidad

export interface DocumentoGenerado {
  id: string;
  tipo: 'Control mensual' | 'Bitácora diaria' | 'Justificación' | 'Reporte mensual consolidado' | 'Reporte por Dirección';
  nombre: string;
  codigo: string;
  fecha: string;
  hora: string;
  generadoPor: string;
  direccion: string;
  mes: number;
  anio: number;
  hash: string;
  estado: 'Generado' | 'Descargado';
  /** Id del registro origen (control, bitácora o justificación). */
  referencia: string;
}

export interface EventoTrazabilidad {
  id: string;
  fecha: string;
  hora: string;
  usuario: string;
  rol: string;
  direccion?: string;
  tipoControl?: string;
  mes?: number;
  anio?: number;
  accion: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
  observacion?: string;
  documento?: string;
}

// ---------------------------------------------------------------------------- Utilidades

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const;

export function nombreMes(mes: number): string { return MESES[mes - 1] ?? String(mes); }

/** `AAAA-MM-DD` local, sin depender de zona horaria de `toISOString`. */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formateaFecha(iso: string): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}
