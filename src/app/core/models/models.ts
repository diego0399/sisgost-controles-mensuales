/**
 * Modelo de datos de SISGOST — Controles Mensuales.
 *
 * El dominio sale del análisis de la carpeta `controles/` real de la oficina departamental:
 * controles normados (F0234, F0389, F0382, F0384, F0386, F0387, F0422, mantenimientos F017x/F0288,
 * GLPI, vulnerabilidades), su frecuencia observada (semanal en F0389; semanal con entrega mensual
 * consolidada en F0387; mensual en el resto,
 * eventual cuando dependen de actividad) y la carta de justificación de `Formatos_nuevos_2025_.docx`
 * con sus tres firmas.
 *
 * Los datos base —usuarios, roles, Direcciones/Unidades, distribución de soportes y equipos—
 * son los MISMOS de SISGOST — Gestión de Equipos: ambos módulos son un solo ecosistema y este
 * módulo no inventa identidades ni organización propia.
 */

// ---------------------------------------------------------------------------- Organización

/** Dirección u oficina atendida. NO es un rol del sistema: es dato organizacional. */
export interface Direccion {
  id: string;
  /** Nombre institucional; es el mismo texto que usa Gestión de Equipos en sus requerimientos. */
  nombre: string;
  /** Abreviatura para tablas y chips («REGS», «RPRH»). */
  corta: string;
  /** Unidades o áreas internas atendidas (Registro de la Propiedad, IGN, RPRH…). */
  unidades: string[];
  /** Direcciones sin soporte asignado generan alerta en el panel ejecutivo. */
  activa: boolean;
}

/**
 * Roles de SISGOST — Controles Mensuales. **Hardware no participa en este módulo**: sus usuarios
 * operan solo en Gestión de Equipos y no figuran en este directorio.
 *
 * · `enc-soporte` — Encargado de Soporte: es el **jefe** del área; ve todo y da seguimiento.
 * · `coordinador` — Coordinador: consulta y seguimiento (panel, operatividad, reportes, historial,
 *   documentos y trazabilidad); no completa controles ni administra.
 */
export type ClaveRol = 'admin' | 'enc-soporte' | 'tec-soporte' | 'coordinador';

export interface UsuarioSistema {
  usuario: string;
  nombre: string;
  iniciales: string;
  rol: string;
  clave: ClaveRol;
  /** Unidad organizativa a la que pertenece (Soporte, Hardware, DTI…). */
  unidad: string;
  cargo: string;
  estado: 'Activo' | 'Inactivo';
  /** false = usuario del ecosistema que opera solo en Gestión de Equipos. */
  moduloControles: boolean;
}

/**
 * Asignación de un Técnico de Soporte a una Dirección/Unidad. **Registro compartido**: se
 * administra desde este módulo (Administración → Distribución de soportes) y Gestión de Equipos
 * lo consume para ofrecer únicamente los técnicos responsables de la Dirección/Unidad del
 * requerimiento como Técnico de Configuración.
 *
 * Nunca se borra una asignación: se desactiva, porque los equipos aceptados mientras estuvo
 * vigente siguen apuntando a ella en su historial.
 */
export interface DistribucionSoporte {
  id: string;
  direccion: string;
  unidad: string;
  /** Técnico de Soporte responsable, en formato «Nombre — Rol». */
  tecnico: string;
  /** Encargado de Soporte o Administrador que registró la distribución. */
  asignadoPor: string;
  fecha: string;
  hora: string;
  activo: boolean;
  observacion: string;
  desactivadaPor?: string;
  fechaDesactivacion?: string;
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

export type Frecuencia = 'Mensual' | 'Semanal' | 'Diaria' | 'Eventual' | 'Programado'
  /** Se trabaja semana a semana pero se entrega en un único documento mensual (F0387). */
  | 'Semanal con entrega mensual consolidada';

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

/**
 * Sección que trabaja sobre los equipos ACTIVOS de la Dirección/Unidad atendida. La lista no se
 * teclea: sale del inventario operativo, que a su vez proviene de las entregas aceptadas en
 * Gestión de Equipos. Así ningún control puede registrar un equipo de otra Dirección/Unidad.
 */
export interface EquiposPlantilla {
  /** Casillas de verificación aplicables a cada equipo. */
  verificaciones: string[];
  /** Estados admitidos por equipo (el primero es el estado conforme). */
  estados: string[];
  /** Mínimo de equipos que deben revisarse; 0 = todos los equipos activos. */
  minimo: number;
  ayuda?: string;
}

/**
 * Verificación de equipos identificados por su **IP**. La IP no se acepta a ciegas: se busca en el
 * inventario operativo —que proviene de las entregas aceptadas en Gestión de Equipos— y solo vale
 * si corresponde a un equipo ACTIVO de la misma Dirección/Unidad del control. Es la sección de
 * verificación semanal del F0387.
 */
export interface EquiposIpPlantilla {
  /** Cuántos equipos distintos deben registrarse (F0387: 3). */
  cantidad: number;
  ayuda?: string;
}

/** Verificación de teléfonos o extensiones, cada uno con su hora (F0387). */
export interface TelefonosPlantilla {
  /** Cuántos teléfonos o extensiones deben registrarse (F0387: 3). */
  cantidad: number;
  /** Resultados admitidos de la verificación. */
  resultados: string[];
  ayuda?: string;
}

/**
 * Ítem del checklist de seguridad TIC que se verifica **equipo por equipo** (F0382). El formato
 * físico agrupa sus nueve ítems según a qué equipos aplican: los de usuario interno, los de
 * consulta al público y los que se revisan en ambos.
 */
export interface ItemSeguridad {
  id: string;
  nombre: string;
  /** Grupo del formato: «Usuarios internos», «Usuarios externos» o «Ambos equipos». */
  grupo: string;
}

/**
 * Sección que verifica una **muestra de equipos** del inventario operativo ítem por ítem. Es la
 * traducción digital del cuadro del F0382: cinco filas de equipo, nueve columnas de ítem y, por
 * cada incumplimiento, su observación (Obs), su acción correctiva (AC) y su estado final.
 *
 * Los equipos no se teclean: se eligen del inventario operativo de la Dirección/Unidad del
 * control, que a su vez proviene de las entregas aceptadas en Gestión de Equipos.
 */
export interface ChecklistEquiposPlantilla {
  /** Cuántos equipos exige el formato (F0382: 5). */
  cantidad: number;
  items: ItemSeguridad[];
  /** Respuestas admitidas por ítem; la primera es la conforme. */
  cumplimiento: string[];
  /** Estados finales de un incumplimiento (Corregido, Pendiente, Escalado, En seguimiento). */
  estadosItem: string[];
  /** Clasificación del equipo dentro del formato (interno, público, ambos). */
  clasificaciones: string[];
  ayuda?: string;
}

/**
 * Bitácora de ingresos al cuarto de servidores (F0234). El formato físico es una hoja por
 * quincena con una fila por visita: fecha, hora de entrada y de salida (E/S), carné y nombre del
 * personal autorizado, carné y nombre del acompañante, si es personal técnico de la DTI, interno
 * del CNR o externo, si anexa documento, la actividad o motivo y las firmas.
 */
export interface IngresosPlantilla {
  /** Motivos frecuentes que ofrece el formulario; el técnico puede escribir otro. */
  motivos: string[];
  /** Clasificación del personal que ingresa, como las columnas del formato. */
  tiposPersonal: string[];
  /**
   * Formas de la visita: el técnico entra solo o acompañado. De esto depende qué campos pide el
   * formulario, porque el cuarto de servidores no siempre se abre para una visita externa.
   */
  tiposIngreso: string[];
  ayuda?: string;
}

/** Sección de un formulario digital; el «stepper» de completar control recorre estas secciones. */
export interface SeccionPlantilla {
  titulo: string;
  descripcion?: string;
  /** Número de semana en los controles semanales con entrega mensual consolidada (F0387, F0389). */
  semana?: number;
  campos?: CampoPlantilla[];
  items?: ItemPlantilla[];
  tabla?: TablaPlantilla;
  equipos?: EquiposPlantilla;
  equiposIp?: EquiposIpPlantilla;
  telefonos?: TelefonosPlantilla;
  checklistEquipos?: ChecklistEquiposPlantilla;
  ingresos?: IngresosPlantilla;
  /** Paso de solo lectura con los datos del control programado (F0382, paso 1). */
  datosControl?: boolean;
}

/**
 * Área técnica responsable de un control. No todos los controles se trabajan por Dirección:
 * el cuarto de servidores, los respaldos o la infraestructura de red pertenecen a un área, y el
 * área resuelve a las Direcciones/Unidades concretas donde el control se ejecuta.
 */
export interface AreaTecnica {
  id: string;
  nombre: string;
  descripcion: string;
  /** Direcciones/Unidades donde el área tiene presencia física. */
  pares: { direccion: string; unidad: string }[];
}

export type ModoAplicacion =
  | 'Todas las direcciones'
  | 'Direcciones específicas'
  | 'Unidades específicas'
  | 'Área técnica específica';

/**
 * Dónde aplica un control. Es configurable desde el catálogo porque **no todos los controles se
 * trabajan en todas las Direcciones/Unidades**: el calendario solo programa un control en las
 * Direcciones/Unidades que resultan de esta configuración.
 */
export interface AplicacionControl {
  modo: ModoAplicacion;
  /** Ids de Dirección (modo «Direcciones específicas»). */
  direcciones: string[];
  /** Pares Dirección/Unidad (modo «Unidades específicas»). */
  unidades: { direccion: string; unidad: string }[];
  /** Id del área técnica (modo «Área técnica específica»). */
  area: string;
  /** Motivo institucional de la aplicación; se muestra en el catálogo. */
  observaciones: string;
}

export interface ControlCatalogo {
  codigo: string;
  nombre: string;
  version: string;
  frecuencia: Frecuencia;
  /** Dónde aplica el control; editable desde Administración → Catálogo de controles. */
  aplicacion: AplicacionControl;
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
  | 'Programado' | 'Pendiente' | 'En proceso' | 'Listo para entregar' | 'En revisión' | 'Entregado'
  | 'Entregado tarde' | 'Vencido' | 'Justificado' | 'Observado' | 'Cerrado' | 'No aplica';

export interface RespuestaCampo { id: string; valor: string; }
export interface RespuestaItem { id: string; estado: string; medicion?: string; nota?: string; }

/** Revisión de un equipo del inventario operativo dentro de un control. */
export interface RespuestaEquipo {
  /** Número de inventario: el mismo que usa Gestión de Equipos. */
  inventario: string;
  incluido: boolean;
  estado: string;
  verificaciones: string[];
  observacion: string;
}

/**
 * Equipo verificado por su IP. Solo se guarda `ip` y `hora`: los demás datos son el reflejo del
 * inventario operativo al momento del registro y se conservan para que el documento del mes siga
 * siendo legible aunque el equipo se descargue después.
 */
export interface RespuestaEquipoIp {
  ip: string;
  /** Hora de verificación `HH:mm`. */
  hora: string;
  inventario?: string;
  nombreEquipo?: string;
  usuarioFinal?: string;
  /** Estado operativo del equipo al momento de la verificación. */
  estadoEquipo?: string;
}

/** Teléfono o extensión verificado dentro de una semana del F0387. */
export interface RespuestaTelefono {
  numero: string;
  ubicacion: string;
  resultado: string;
  /** Hora de verificación `HH:mm`. */
  hora: string;
  observaciones: string;
}

/** Respuesta a un ítem de seguridad dentro de un equipo verificado (F0382). */
export interface RespuestaItemSeguridad {
  id: string;
  /** Cumple · No cumple · No aplica. */
  cumplimiento: string;
  /** Descripción del incumplimiento; obligatoria con «No cumple». */
  descripcion: string;
  /** Acción correctiva (AC del formato); obligatoria con «No cumple». */
  accionCorrectiva: string;
  /** Estado final del incumplimiento; obligatorio con «No cumple». */
  estadoItem: string;
  /** Fecha de la acción correctiva, como la pide el formato. */
  fechaAccion: string;
  /** Justificación; obligatoria con «No aplica». */
  justificacion: string;
}

/**
 * Equipo de la muestra verificado en el F0382. Solo se guarda el número de inventario: los datos
 * del equipo se leen del inventario operativo, nunca se copian a mano.
 */
export interface RespuestaEquipoChecklist {
  inventario: string;
  /** Clasificación del formato: usuario interno, consulta al público o ambos. */
  clasificacion: string;
  observaciones: string;
  items: RespuestaItemSeguridad[];
}

/** Un ingreso al cuarto de servidores, tal como lo pide el formato F0234. */
export interface RespuestaIngreso {
  /** `Individual` (solo el Técnico de Soporte) o `Con acompañante`. Decide qué se exige. */
  tipoIngreso: string;
  fecha: string;
  /** `HH:mm`; el formato las rotula E = Entrada y S = Salida. */
  horaEntrada: string;
  horaSalida: string;
  /** Carné del personal autorizado que ingresa. */
  carne: string;
  nombre: string;
  /** Cargo del Técnico de Soporte que ingresa. */
  cargo: string;
  /** Personal técnico DTI · Personal interno CNR · Personal externo al CNR. */
  tipoPersonal: string;
  acompanante: string;
  carneAcompanante: string;
  /** Cargo o institución del acompañante; obligatorio solo en el ingreso con acompañante. */
  cargoAcompanante: string;
  /**
   * Clasificación del acompañante, con el mismo catálogo que el titular. El formato clasifica a
   * TODO el que entra, no solo a quien firma: obligatoria en cuanto hay acompañante.
   */
  tipoPersonalAcompanante: string;
  /** Si se anexó documento de respaldo de la visita (columna «Anexa el documento» del formato). */
  anexaDocumento: string;
  /** Nombre del archivo del documento de respaldo; solo cuando se marcó que lo anexa. */
  documentoNombre: string;
  /** La imagen del respaldo, en data URL, para que salga impresa en el documento formal. */
  documentoImagen: string;
  /** Actividad o motivo de la visita. */
  motivo: string;
  observacion: string;
}

export interface RespuestaSeccion {
  titulo: string;
  campos?: RespuestaCampo[];
  items?: RespuestaItem[];
  filas?: string[][];
  equipos?: RespuestaEquipo[];
  equiposIp?: RespuestaEquipoIp[];
  telefonos?: RespuestaTelefono[];
  checklistEquipos?: RespuestaEquipoChecklist[];
  ingresos?: RespuestaIngreso[];
}

/**
 * Cuentas de la muestra del F0382 antes de entregar: lo que el paso de resumen pone sobre la mesa
 * para que el técnico vea de un vistazo si el control está listo y, si no, qué le falta.
 */
export interface ResumenMuestra {
  pedidos: number;
  seleccionados: number;
  /** Equipos con TODOS sus ítems aplicables respondidos. */
  verificados: number;
  itemsCumplidos: number;
  itemsIncumplidos: number;
  itemsNoAplica: number;
  accionesCorrectivas: number;
  justificaciones: number;
  observaciones: boolean;
  listo: boolean;
  faltas: string[];
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
  unidad: string;
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
  | 'Pendiente de revisión' | 'Reingresado a Hardware' | 'No disponible'
  /** Ciclo cerrado: el equipo volvió a entregarse y su registro anterior queda de historia. */
  | 'Histórico';

/** Estados que siguen contando como inventario activo de la Dirección/Unidad. */
export const ESTADOS_ACTIVOS: EstadoEquipoOperativo[] = [
  'Activo en Dirección/Unidad', 'En garantía', 'Pendiente de revisión'
];

/**
 * Equipo activo en una Dirección/Unidad. Entra desde Gestión de Equipos cuando el Usuario Final
 * acepta la entrega y sale cuando allí se registra su descargo; los datos son los mismos que
 * maneja ese módulo (número de inventario, expediente único, técnico de configuración).
 */
export interface EquipoOperativo {
  /**
   * Identificador del **ciclo operativo**: un mismo número de inventario puede tener varios
   * registros a lo largo del tiempo (se descarga y vuelve a entregarse en otra Dirección/Unidad).
   * El ciclo anterior queda como «Histórico» y nunca se sobrescribe.
   */
  ciclo: string;
  inventario: string;
  tipo: string;
  marca: string;
  modelo: string;
  serie: string;
  nombreEquipo: string;
  /**
   * IP fija del equipo, cuando Gestión de Equipos registró la reserva en el F0302. Es el dato con
   * el que el F0387 identifica los equipos que verifica cada semana; los equipos sin reserva de IP
   * no pueden usarse en esa verificación.
   */
  ip?: string;
  /** MAC con la que se solicitó la reserva de IP, si la hubo. */
  mac?: string;
  usuarioFinal: string;
  carne: string;
  correoInstitucional: string;
  direccion: string;
  unidad: string;
  tecnicoConfiguracion: string;
  soporteResponsable: string;
  fechaAceptacion: string;
  /** Solicitud/requerimiento que originó el proceso en Gestión de Equipos. */
  expediente: string;
  expedienteUnico: string;
  estado: EstadoEquipoOperativo;
  garantia: string;
  /** Módulo del que proviene el registro. */
  origen: string;
  ultimoControl?: string;
  fechaDescargo?: string;
  motivoDescargo?: string;
  accionPosterior?: string;
}

/** Evento simulado que emite Gestión de Equipos hacia este módulo. */
export interface EventoIntegracion {
  id: string;
  tipo: 'Entrega aceptada' | 'Descargo de equipo';
  fecha: string;
  moduloOrigen: string;
  moduloDestino: string;
  expediente: string;
  expedienteUnico: string;
  detalle: string;
  equipo: EquipoOperativo;
  aplicado: boolean;
}

// ---------------------------------------------------------------------------- Documentos y trazabilidad

export interface DocumentoGenerado {
  id: string;
  tipo: 'Control mensual' | 'Bitácora diaria' | 'Justificación' | 'Reporte mensual consolidado'
  | 'Reporte mensual por Dirección' | 'Reporte anual por Dirección'
  | 'Reporte de controles pendientes por Dirección' | 'Reporte de operatividad por Dirección'
  | 'Reporte de inventario operativo por Dirección' | 'Reporte de bitácoras diarias por Dirección'
  | 'Reporte de F0387 consolidado mensual por Dirección'
  | 'Reporte de F0389 consolidado mensual por Dirección';
  nombre: string;
  codigo: string;
  fecha: string;
  hora: string;
  generadoPor: string;
  direccion: string;
  unidad?: string;
  mes: number;
  anio: number;
  hash: string;
  estado: 'Generado' | 'Descargado';
  /** Id del registro origen (control, bitácora o justificación). */
  referencia: string;
}

/**
 * Evento de trazabilidad. Los eventos de integración entre módulos guardan además el módulo
 * origen y destino y el equipo afectado, para poder auditar el flujo completo del ecosistema.
 */
export interface EventoTrazabilidad {
  id: string;
  fecha: string;
  hora: string;
  usuario: string;
  rol: string;
  direccion?: string;
  unidad?: string;
  tipoControl?: string;
  mes?: number;
  anio?: number;
  accion: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
  observacion?: string;
  documento?: string;
  moduloOrigen?: string;
  moduloDestino?: string;
  /** Tipo de ingreso al cuarto de servidores, en los eventos del F0234. */
  tipoIngreso?: string;
  /** Número de inventario del equipo afectado, en eventos de integración. */
  inventario?: string;
  /** Descripción del equipo y su usuario final, en eventos de integración. */
  equipo?: string;
  usuarioFinal?: string;
  expedienteUnico?: string;
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
