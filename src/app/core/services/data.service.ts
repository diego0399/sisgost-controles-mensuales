import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ActividadDia, AplicacionControl, AreaTecnica, BitacoraDiaria, ControlCatalogo, ControlMes,
  Direccion, DistribucionSoporte, DocumentoGenerado, EquipoOperativo, ESTADOS_ACTIVOS,
  EstadoControl, EventoIntegracion, EventoTrazabilidad, Justificacion, RespuestaSeccion,
  RevisionAtencion, UsuarioSistema, isoLocal, nombreMes
} from '../models/models';
import { HolidayService } from './holiday.service';
import { BusinessDayService } from './business-day.service';
import { ControlDeadlineService } from './control-deadline.service';
import { SupportDistributionService } from './support-distribution.service';

const STORAGE_KEY = 'sisgost.controles.v1';

/** Hora límite institucional de la bitácora diaria. */
export const HORA_LIMITE_BITACORA = '17:00';

/** Nombre del módulo hermano del ecosistema. */
export const MODULO_EQUIPOS = 'SISGOST — Gestión de Equipos';
export const MODULO_CONTROLES = 'SISGOST — Controles Mensuales';

/** Elementos de atención al público que la bitácora diaria revisa obligatoriamente. */
export const ELEMENTOS_ATENCION = [
  'Equipos de técnicos', 'Equipos de consulta', 'Pantallas informativas', 'Kioskos de autoconsulta',
  'Audio de tomaturno', 'Sistema de tomaturno', 'Impresoras de atención al público',
  'Red y conectividad básica', 'Periféricos relevantes'
] as const;

interface Snapshot {
  controles: ControlMes[];
  bitacoras: BitacoraDiaria[];
  justificaciones: Justificacion[];
  inventario: EquipoOperativo[];
  eventosIntegracion: EventoIntegracion[];
  documentos: DocumentoGenerado[];
  trazabilidad: EventoTrazabilidad[];
  distribucion: DistribucionSoporte[];
  /** El catálogo se guarda porque su configuración (frecuencia y aplicación) es editable. */
  catalogo?: ControlCatalogo[];
}

/**
 * Almacén único de SISGOST — Controles Mensuales. Carga la semilla JSON de assets/data,
 * conserva los cambios de la sesión en localStorage y concentra todas las reglas de negocio:
 * entrega dentro de los primeros 3 días hábiles, bitácora antes de las 5:00 p. m.,
 * justificación obligatoria cuando no hay actividad y la integración con Gestión de Equipos.
 *
 * Los datos base (usuarios, Direcciones/Unidades, distribución de soportes y equipos) son los
 * mismos del módulo Gestión de Equipos: este servicio no inventa organización propia.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly feriadosSrv = inject(HolidayService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);
  /** Registro compartido con Gestión de Equipos. */
  readonly soportes = inject(SupportDistributionService);

  readonly listo = signal(false);

  readonly usuarios = signal<UsuarioSistema[]>([]);
  readonly direcciones = signal<Direccion[]>([]);
  readonly areas = signal<AreaTecnica[]>([]);
  readonly catalogo = signal<ControlCatalogo[]>([]);
  readonly controles = signal<ControlMes[]>([]);
  readonly bitacoras = signal<BitacoraDiaria[]>([]);
  readonly justificaciones = signal<Justificacion[]>([]);
  readonly inventario = signal<EquipoOperativo[]>([]);
  readonly eventosIntegracion = signal<EventoIntegracion[]>([]);
  readonly documentos = signal<DocumentoGenerado[]>([]);
  readonly trazabilidad = signal<EventoTrazabilidad[]>([]);

  /** Distribución de soportes: vive en el servicio compartido. */
  readonly distribucion = computed(() => this.soportes.registros());

  /** Usuarios con acceso a este módulo (Hardware opera solo en Gestión de Equipos). */
  readonly usuariosDelModulo = computed(() => this.usuarios().filter((u) => u.moduloControles && u.estado === 'Activo'));

  /** Técnicos de Soporte del ecosistema, en el formato «Nombre — Rol» de la distribución. */
  readonly tecnicosSoporte = computed(() =>
    this.usuarios().filter((u) => u.clave === 'tec-soporte' && u.estado === 'Activo'));

  private secuencia = 1000;

  // ------------------------------------------------------------------ carga y persistencia

  async cargar(): Promise<void> {
    if (this.listo()) return;
    await this.feriadosSrv.cargar();

    const [usuarios, direcciones, areas, catalogo] = await Promise.all([
      this.json<UsuarioSistema[]>('usuarios-sistema'),
      this.json<Direccion[]>('direcciones'),
      this.json<AreaTecnica[]>('areas-tecnicas'),
      this.json<ControlCatalogo[]>('catalogo-controles')
    ]);
    this.usuarios.set(usuarios);
    this.direcciones.set(direcciones);
    this.areas.set(areas);
    this.catalogo.set(catalogo);

    const guardado = this.leerSnapshot();
    if (guardado) {
      this.controles.set(guardado.controles);
      this.bitacoras.set(guardado.bitacoras);
      this.justificaciones.set(guardado.justificaciones);
      this.inventario.set(guardado.inventario);
      this.eventosIntegracion.set(guardado.eventosIntegracion);
      this.documentos.set(guardado.documentos);
      this.trazabilidad.set(guardado.trazabilidad);
      this.soportes.cargar(guardado.distribucion);
      // Una foto anterior a la aplicación configurable no trae catálogo: entonces manda el JSON.
      if (guardado.catalogo?.length && guardado.catalogo.every((c) => !!c.aplicacion)) {
        this.catalogo.set(guardado.catalogo);
      }
    } else {
      const [controles, bitacoras, justificaciones, inventario, eventos, documentos, trazas, distribucion] = await Promise.all([
        this.json<ControlMes[]>('controles'),
        this.json<BitacoraDiaria[]>('bitacoras'),
        this.json<Justificacion[]>('justificaciones'),
        this.json<EquipoOperativo[]>('inventario-operativo'),
        this.json<EventoIntegracion[]>('eventos-integracion'),
        this.json<DocumentoGenerado[]>('documentos-generados'),
        this.json<EventoTrazabilidad[]>('trazabilidad'),
        this.json<DistribucionSoporte[]>('distribucion-soportes')
      ]);
      this.controles.set(controles);
      this.bitacoras.set(bitacoras);
      this.justificaciones.set(justificaciones);
      this.inventario.set(inventario);
      this.eventosIntegracion.set(eventos);
      this.documentos.set(documentos);
      this.trazabilidad.set(trazas);
      this.soportes.cargar(distribucion);
    }

    // El inventario operativo se pone al día ANTES de reconciliar: los equipos que Gestión de
    // Equipos aceptó o descargó ya deben estar reflejados cuando se calcula lo demás.
    this.sincronizarInventario();
    this.reconciliarVencidos();
    this.asegurarBitacorasDeHoy();
    this.persistir();
    this.listo.set(true);
  }

  private async json<T>(nombre: string): Promise<T> {
    const res = await fetch(`assets/data/${nombre}.json`);
    return (await res.json()) as T;
  }

  private leerSnapshot(): Snapshot | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Snapshot) : null;
    } catch {
      return null;
    }
  }

  private persistir(): void {
    const s: Snapshot = {
      controles: this.controles(), bitacoras: this.bitacoras(), justificaciones: this.justificaciones(),
      inventario: this.inventario(), eventosIntegracion: this.eventosIntegracion(),
      documentos: this.documentos(), trazabilidad: this.trazabilidad(), distribucion: this.distribucion(),
      catalogo: this.catalogo()
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* cuota llena: la sesión sigue en memoria */ }
  }

  /**
   * Restablece los datos de demostración: borra el estado guardado y vuelve a la semilla original
   * (controles, bitácoras, justificaciones, documentos, trazabilidad, inventario operativo y
   * distribución de soportes). No toca la estructura del sistema ni la navegación.
   */
  restablecerDemostracion(): void {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

  /** Alias histórico de `restablecerDemostracion`. */
  reiniciarDatos(): void { this.restablecerDemostracion(); }

  /** Qué colecciones repone el restablecimiento (se muestra en la confirmación). */
  readonly coleccionesDemostracion = [
    'Controles mensuales', 'Bitácoras diarias', 'Justificaciones', 'Documentos generados',
    'Trazabilidad de controles', 'Inventario operativo simulado', 'Distribución de soportes inicial',
    'Datos base (usuarios, Direcciones/Unidades y catálogo)'
  ];

  /**
   * Un control abierto con la fecha límite vencida pasa a «Vencido»; una bitácora de un día
   * anterior que nunca se envió pasa a «Vencida». Corre al cargar para que la semilla siga
   * siendo coherente cualquiera que sea el día en que se abra el prototipo.
   */
  private reconciliarVencidos(): void {
    const hoy = isoLocal(new Date());
    this.controles.update((lista) => lista.map((c) => (this.plazos.estaVencido(c, hoy) ? { ...c, estado: 'Vencido' as EstadoControl } : c)));
    this.bitacoras.update((lista) => lista.map((b) =>
      (b.fecha < hoy && (b.estado === 'Pendiente' || b.estado === 'En edición')) ? { ...b, estado: 'Vencida' as const } : b));
  }

  /** Crea la bitácora «Pendiente» del día para cada Dirección/Unidad con soporte activo. */
  private asegurarBitacorasDeHoy(): void {
    const hoy = isoLocal(new Date());
    if (!this.habiles.esHabil(hoy)) return;
    const cubiertas = new Set(this.bitacoras().filter((b) => b.fecha === hoy).map((b) => `${b.direccion}|${b.unidad}`));
    const nuevas: BitacoraDiaria[] = [];
    for (const b of this.bitacorasDelDiaAnterior()) {
      if (cubiertas.has(`${b.direccion}|${b.unidad}`)) continue;
      const responsable = this.responsableDe(b.direccion, b.unidad);
      nuevas.push({
        id: this.idNuevo('BIT'), fecha: hoy, direccion: b.direccion, unidad: b.unidad,
        responsable: responsable || 'Sin asignar', estado: 'Pendiente',
        revision: ELEMENTOS_ATENCION.map((elemento) => ({ elemento, estado: '' as const })),
        actividades: [], observaciones: ''
      });
    }
    if (nuevas.length) this.bitacoras.update((l) => [...l, ...nuevas]);
  }

  /** Pares Dirección/Unidad que llevan bitácora, tomados del histórico ya sembrado. */
  private bitacorasDelDiaAnterior(): { direccion: string; unidad: string }[] {
    const mapa = new Map<string, { direccion: string; unidad: string }>();
    for (const b of this.bitacoras()) mapa.set(`${b.direccion}|${b.unidad}`, { direccion: b.direccion, unidad: b.unidad });
    return [...mapa.values()];
  }

  private idNuevo(prefijo: string): string {
    return `${prefijo}-${new Date().getFullYear()}-${String(++this.secuencia).padStart(4, '0')}`;
  }

  // ------------------------------------------------------------------ organización y distribución

  direccionDe(id: string): Direccion | undefined { return this.direcciones().find((d) => d.id === id); }
  nombreDireccion(id: string): string { return this.direccionDe(id)?.nombre ?? id; }
  cortaDireccion(id: string): string { return this.direccionDe(id)?.corta ?? id; }
  /** Id de la Dirección a partir del nombre institucional que usa Gestión de Equipos. */
  idDireccion(nombre: string): string { return this.direcciones().find((d) => d.nombre === nombre)?.id ?? nombre; }

  /**
   * «Dirección / Unidad» para mostrar. Cuando la unidad se llama igual que la Dirección
   * (Gerencia de Tecnología, Dirección de Registro) se escribe una sola vez.
   */
  dirUnidad(direccionId: string, unidad: string): string {
    const nombre = this.nombreDireccion(direccionId);
    return !unidad || unidad === nombre ? nombre : `${nombre} / ${unidad}`;
  }
  catalogoDe(codigo: string): ControlCatalogo | undefined { return this.catalogo().find((c) => c.codigo === codigo); }

  /** Todos los pares Dirección/Unidad del catálogo organizacional. */
  readonly pares = computed(() => this.direcciones()
    .filter((d) => d.activa)
    .flatMap((d) => d.unidades.map((u) => ({ direccion: d.id, unidad: u }))));

  /** Técnico responsable (formato «Nombre — Rol») de una Dirección/Unidad. */
  responsableDe(direccionId: string, unidad: string, preferido = ''): string {
    return this.soportes.responsableDe(this.nombreDireccion(direccionId), unidad, preferido);
  }

  /** Técnicos responsables de una Dirección/Unidad. */
  tecnicosDe(direccionId: string, unidad: string): string[] {
    return this.soportes.tecnicosDe(this.nombreDireccion(direccionId), unidad);
  }

  /** Primera asignación vigente de una Dirección (cualquiera de sus unidades). */
  soporteDe(direccionId: string): DistribucionSoporte | undefined {
    return this.soportes.deDireccion(this.nombreDireccion(direccionId))[0];
  }

  /** Pares Dirección/Unidad asignados a un usuario del sistema. */
  paresDe(usuario: string): { direccion: string; unidad: string }[] {
    const u = this.usuarios().find((x) => x.usuario === usuario);
    if (!u) return [];
    return this.soportes.deTecnico(u.nombre).map((d) => ({ direccion: this.idDireccion(d.direccion), unidad: d.unidad }));
  }

  /** Ids de Dirección asignados a un usuario (una Dirección basta con que tenga una unidad suya). */
  direccionesDe(usuario: string): string[] {
    return [...new Set(this.paresDe(usuario).map((p) => p.direccion))];
  }

  /** ¿El usuario atiende esa Dirección/Unidad? Los demás roles no están limitados. */
  atiende(u: UsuarioSistema | null, direccionId: string, unidad: string): boolean {
    if (!u) return false;
    if (u.clave !== 'tec-soporte') return true;
    return this.soportes.atiende(u.nombre, this.nombreDireccion(direccionId), unidad);
  }

  /** Direcciones/Unidades activas sin ningún soporte responsable: alerta del panel ejecutivo. */
  readonly paresSinSoporte = computed(() => this.pares()
    .filter((p) => !this.soportes.deDireccionUnidad(this.nombreDireccion(p.direccion), p.unidad).length));

  // ------------------------------------------------------------------ aplicación de los controles

  areaDe(id: string): AreaTecnica | undefined { return this.areas().find((a) => a.id === id); }

  /**
   * Direcciones/Unidades donde **aplica** un control, según su configuración del catálogo.
   * El calendario solo programa el control en estos pares: no todos los controles se trabajan en
   * todas las Direcciones/Unidades. Los controles que revisan equipos se limitan además a los
   * pares que tienen inventario operativo activo.
   */
  paresAplicables(codigo: string): { direccion: string; unidad: string }[] {
    const c = this.catalogoDe(codigo);
    if (!c) return [];
    const a = c.aplicacion;
    let pares: { direccion: string; unidad: string }[];
    switch (a.modo) {
      case 'Todas las direcciones':
        pares = this.pares();
        break;
      case 'Direcciones específicas':
        pares = this.pares().filter((p) => a.direcciones.includes(p.direccion));
        break;
      case 'Unidades específicas':
        pares = this.pares().filter((p) => a.unidades.some((u) => u.direccion === p.direccion && u.unidad === p.unidad));
        break;
      default: {
        const area = this.areaDe(a.area);
        pares = this.pares().filter((p) => (area?.pares ?? []).some((u) => u.direccion === p.direccion && u.unidad === p.unidad));
      }
    }
    if (this.requiereEquipos(c)) pares = pares.filter((p) => this.equiposActivosDe(p.direccion, p.unidad).length > 0);
    return pares;
  }

  /** ¿El control trabaja sobre los equipos del inventario operativo? */
  requiereEquipos(c: ControlCatalogo): boolean { return c.plantilla.some((s) => !!s.equipos); }

  /** ¿Aplica este control en esa Dirección/Unidad? */
  aplicaEn(codigo: string, direccionId: string, unidad: string): boolean {
    return this.paresAplicables(codigo).some((p) => p.direccion === direccionId && p.unidad === unidad);
  }

  /** Controles activos que aplican a una Dirección/Unidad. */
  controlesAplicablesDe(direccionId: string, unidad: string): ControlCatalogo[] {
    return this.catalogo().filter((c) => c.activo && this.aplicaEn(c.codigo, direccionId, unidad));
  }

  /** Controles activos que NO aplican a una Dirección/Unidad (estado informativo «No aplica»). */
  controlesNoAplicablesDe(direccionId: string, unidad: string): ControlCatalogo[] {
    return this.catalogo().filter((c) => c.activo && !this.aplicaEn(c.codigo, direccionId, unidad));
  }

  /** Texto corto de la aplicación de un control, para tablas y documentos. */
  resumenAplicacion(c: ControlCatalogo): string {
    const a = c.aplicacion;
    switch (a.modo) {
      case 'Todas las direcciones': return 'Todas las Direcciones/Unidades';
      case 'Direcciones específicas': return a.direcciones.map((d) => this.cortaDireccion(d)).join(' · ') || 'Sin configurar';
      case 'Unidades específicas': return a.unidades.map((u) => `${this.cortaDireccion(u.direccion)} / ${u.unidad}`).join(' · ') || 'Sin configurar';
      default: return this.areaDe(a.area)?.nombre ?? 'Sin configurar';
    }
  }

  /**
   * Direcciones/Unidades que tienen controles aplicables pero ningún Técnico de Soporte
   * responsable: nadie puede entregarlos.
   */
  readonly paresAplicablesSinSoporte = computed(() => this.paresSinSoporte()
    .map((p) => ({ ...p, controles: this.controlesAplicablesDe(p.direccion, p.unidad).length }))
    .filter((p) => p.controles > 0));

  /** Direcciones sin ningún soporte en ninguna de sus unidades. */
  readonly direccionesSinSoporte = computed(() => this.direcciones()
    .filter((d) => d.activa && !this.soportes.deDireccion(d.nombre).length));

  /** El Técnico de Soporte solo ve sus Direcciones/Unidades; los demás roles ven todo. */
  controlesVisibles(u: UsuarioSistema | null): ControlMes[] {
    if (!u) return [];
    if (u.clave !== 'tec-soporte') return this.controles();
    return this.controles().filter((c) => this.atiende(u, c.direccion, c.unidad));
  }

  bitacorasVisibles(u: UsuarioSistema | null): BitacoraDiaria[] {
    if (!u) return [];
    if (u.clave !== 'tec-soporte') return this.bitacoras();
    return this.bitacoras().filter((b) => this.atiende(u, b.direccion, b.unidad));
  }

  /** Inventario operativo visible: el Técnico de Soporte solo ve los equipos que atiende. */
  inventarioVisible(u: UsuarioSistema | null): EquipoOperativo[] {
    if (!u) return [];
    if (u.clave !== 'tec-soporte') return this.inventario();
    return this.inventario().filter((e) => this.atiende(u, e.direccion, e.unidad));
  }

  // ------------------------------------------------------------------ equipos del inventario operativo

  /** Todo el inventario que sigue vigente (sin descargados ni ciclos históricos). */
  readonly inventarioActivo = computed(() => this.inventario().filter((e) => ESTADOS_ACTIVOS.includes(e.estado)));

  /** Equipos ACTIVOS de una Dirección/Unidad: los que cuentan para los controles. */
  equiposActivosDe(direccionId: string, unidad: string): EquipoOperativo[] {
    return this.inventarioActivo().filter((e) => e.direccion === direccionId && e.unidad === unidad);
  }

  /** Equipos que un control puede revisar: los activos de su propia Dirección/Unidad. */
  equiposDeControl(c: ControlMes): EquipoOperativo[] {
    return this.equiposActivosDe(c.direccion, c.unidad);
  }

  /** Ficha vigente de un número de inventario (si tiene varios ciclos, el que sigue abierto). */
  equipoDe(inventario: string): EquipoOperativo | undefined {
    const propios = this.inventario().filter((e) => e.inventario === inventario);
    return propios.find((e) => ESTADOS_ACTIVOS.includes(e.estado)) ?? propios[0];
  }

  /** Todos los ciclos operativos de un número de inventario, del más reciente al más antiguo. */
  ciclosDe(inventario: string): EquipoOperativo[] {
    return this.inventario()
      .filter((e) => e.inventario === inventario)
      .sort((a, b) => (b.fechaAceptacion || '').localeCompare(a.fechaAceptacion || ''));
  }

  /** Controles en los que aparece un equipo: su historial de controles. */
  controlesDeEquipo(inventario: string): ControlMes[] {
    return this.controles()
      .filter((c) => c.secciones.some((s) => s.equipos?.some((e) => e.inventario === inventario && e.incluido)))
      .sort((a, b) => (b.anio - a.anio) || (b.mes - a.mes));
  }

  // ------------------------------------------------------------------ ciclo de vida del control

  controlPorId(id: string): ControlMes | undefined { return this.controles().find((c) => c.id === id); }

  private actualizaControl(id: string, cambio: (c: ControlMes) => ControlMes): void {
    this.controles.update((lista) => lista.map((c) => (c.id === id ? cambio(c) : c)));
    this.persistir();
  }

  /** Mensaje único de la regla de pertenencia (se repite en varias validaciones). */
  readonly MSG_FUERA_DE_DISTRIBUCION =
    'Este control pertenece a una Dirección/Unidad que no está asignada al técnico en la distribución de soportes.';

  iniciarControl(id: string, u: UsuarioSistema): void {
    const c = this.controlPorId(id);
    if (!c || !['Programado', 'Pendiente'].includes(c.estado)) return;
    if (!this.atiende(u, c.direccion, c.unidad)) return;
    this.actualizaControl(id, (x) => ({ ...x, estado: 'En proceso', responsable: u.clave === 'tec-soporte' ? u.nombre : x.responsable }));
    this.registrarEvento(u, { direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio, accion: 'Control iniciado', estadoAnterior: c.estado, estadoNuevo: 'En proceso' });
  }

  guardarAvance(id: string, secciones: RespuestaSeccion[], evidencias: ControlMes['evidencias'],
    observaciones: string, u: UsuarioSistema | null = null): void {
    const antes = this.controlPorId(id);
    this.actualizaControl(id, (c) => ({
      ...c, secciones, evidencias, observaciones,
      estado: this.estadoTrasAvance(c, secciones),
      avance: this.calculaAvance(c.codigo, secciones)
    }));
    // Los controles semanales consolidados dejan traza de cada semana que se cierra.
    const despues = this.controlPorId(id);
    if (antes && despues && this.esSemanalConsolidado(despues.codigo)) {
      const nuevas = this.semanasCompletas(despues).filter((s) => !this.semanasCompletas(antes).includes(s));
      for (const semana of nuevas) {
        this.registrarEvento(u, {
          direccion: despues.direccion, unidad: despues.unidad, tipoControl: despues.codigo,
          mes: despues.mes, anio: despues.anio, accion: `${despues.codigo} semana completada`,
          observacion: `Semana ${semana} registrada en el control ${despues.codigo} de ${nombreMes(despues.mes)} ${despues.anio}; el documento se genera una sola vez al cerrar el mes.`
        });
      }
      if (despues.estado === 'Listo para entregar' && antes.estado !== 'Listo para entregar') {
        this.registrarEvento(u, {
          direccion: despues.direccion, unidad: despues.unidad, tipoControl: despues.codigo,
          mes: despues.mes, anio: despues.anio, accion: 'Control listo para entregar',
          estadoAnterior: antes.estado, estadoNuevo: 'Listo para entregar',
          observacion: 'Todas las semanas aplicables del mes quedaron registradas.'
        });
      }
    }
  }

  // ------------------------------------------------------------------ controles semanales consolidados

  /**
   * ¿El control se trabaja semana a semana pero se entrega en **un solo documento mensual**?
   * Es el caso del F0387: cuatro o cinco verificaciones semanales, una sola hoja al cierre.
   */
  esSemanalConsolidado(codigo: string): boolean {
    return this.catalogoDe(codigo)?.frecuencia === 'Semanal con entrega mensual consolidada';
  }

  /** Secciones semanales de la plantilla de un control (vacío si no es consolidado). */
  seccionesSemanales(codigo: string): { titulo: string; semana: number }[] {
    return (this.catalogoDe(codigo)?.plantilla ?? [])
      .filter((s) => !!s.semana)
      .map((s) => ({ titulo: s.titulo, semana: s.semana! }));
  }

  /** Estado interno de cada semana: «Semana pendiente» mientras no se declare. */
  estadoSemanas(c: ControlMes): { semana: number; titulo: string; estado: string }[] {
    return this.seccionesSemanales(c.codigo).map((s) => ({
      ...s,
      estado: c.secciones.find((r) => r.titulo === s.titulo)?.campos?.find((x) => x.id === 'estado')?.valor
        || 'Semana pendiente'
    }));
  }

  /** Números de semana ya declaradas (completada, observada o no aplica). */
  private semanasCompletas(c: ControlMes): number[] {
    return this.estadoSemanas(c).filter((s) => s.estado !== 'Semana pendiente').map((s) => s.semana);
  }

  /**
   * Estado del control tras guardar: los semanales consolidados pasan a «Listo para entregar»
   * cuando todas sus semanas están declaradas; el resto sigue la regla normal.
   */
  private estadoTrasAvance(c: ControlMes, secciones: RespuestaSeccion[]): EstadoControl {
    if (!['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado)) return c.estado;
    if (this.esSemanalConsolidado(c.codigo)) {
      const semanas = this.estadoSemanas({ ...c, secciones });
      if (semanas.length && semanas.every((s) => s.estado !== 'Semana pendiente')) return 'Listo para entregar';
      if (semanas.some((s) => s.estado !== 'Semana pendiente')) return 'En proceso';
      return c.estado === 'Programado' || c.estado === 'Pendiente' ? c.estado : 'En proceso';
    }
    return c.estado === 'Programado' || c.estado === 'Pendiente' ? 'En proceso' : c.estado;
  }

  /** Avance = proporción de secciones de la plantilla con alguna respuesta. */
  private calculaAvance(codigo: string, secciones: RespuestaSeccion[]): number {
    const plantilla = this.catalogoDe(codigo)?.plantilla ?? [];
    if (!plantilla.length) return secciones.length ? 100 : 0;
    let conRespuesta = 0;
    for (const p of plantilla) {
      const r = secciones.find((s) => s.titulo === p.titulo);
      if (!r) continue;
      const tiene = (r.campos?.some((x) => String(x.valor ?? '').trim()) ?? false)
        || (r.items?.some((x) => x.estado) ?? false)
        || ((r.filas?.length ?? 0) > 0)
        || (r.equipos?.some((x) => x.incluido && x.estado) ?? false);
      if (tiene) conRespuesta++;
    }
    return Math.round((conRespuesta / plantilla.length) * 100);
  }

  /**
   * Valida que el control pueda entregarse: campos obligatorios, mínimos de tabla, checklist
   * completo, equipos revisados y evidencia cuando el catálogo la exige. Devuelve la lista de
   * faltantes (vacía = ok).
   */
  validarEntrega(c: ControlMes): string[] {
    const faltas: string[] = [];
    const cat = this.catalogoDe(c.codigo);
    const activos = this.equiposDeControl(c);
    for (const p of cat?.plantilla ?? []) {
      const r = c.secciones.find((s) => s.titulo === p.titulo);
      // Una semana declarada «no aplica» no exige el resto de sus datos, pero sí declararse.
      const semanaNoAplica = !!p.semana
        && (r?.campos?.find((x) => x.id === 'estado')?.valor ?? '') === 'Semana no aplica';
      for (const campo of p.campos ?? []) {
        if (semanaNoAplica && campo.id !== 'estado') continue;
        if (campo.obligatorio && !String(r?.campos?.find((x) => x.id === campo.id)?.valor ?? '').trim()) {
          faltas.push(`«${campo.etiqueta}» (${p.titulo}) es obligatorio.`);
        }
      }
      if (p.items?.length) {
        const sinMarcar = p.items.filter((i) => !(r?.items?.find((x) => x.id === i.id)?.estado));
        if (sinMarcar.length) faltas.push(`${p.titulo}: ${sinMarcar.length} ítem(s) del checklist sin marcar.`);
      }
      if (p.tabla && (r?.filas?.length ?? 0) < p.tabla.minimo) {
        faltas.push(`${p.titulo}: se requiere al menos ${p.tabla.minimo} registro(s). Si el mes no tuvo actividad, genere la carta de justificación.`);
      }
      if (p.equipos) {
        const revisados = (r?.equipos ?? []).filter((e) => e.incluido);
        // Un equipo solo puede registrarse si pertenece a la Dirección/Unidad del control.
        const ajenos = revisados.filter((e) => !activos.some((a) => a.inventario === e.inventario));
        if (ajenos.length) {
          faltas.push(`${p.titulo}: ${ajenos.map((e) => e.inventario).join(', ')} no pertenece(n) a la Dirección/Unidad del control.`);
        }
        const sinEstado = revisados.filter((e) => !e.estado);
        if (sinEstado.length) faltas.push(`${p.titulo}: ${sinEstado.length} equipo(s) seleccionado(s) sin estado registrado.`);
        if (p.equipos.minimo === 0) {
          const faltantes = activos.filter((a) => !revisados.some((e) => e.inventario === a.inventario));
          if (faltantes.length) faltas.push(`${p.titulo}: faltan por revisar ${faltantes.length} equipo(s) activo(s) de la Dirección/Unidad.`);
        } else if (revisados.length < p.equipos.minimo) {
          faltas.push(`${p.titulo}: se requiere revisar al menos ${p.equipos.minimo} equipo(s) del inventario operativo.`);
        }
      }
    }
    if (cat?.requiereEvidencia && !c.evidencias.length) faltas.push('Este control requiere al menos una evidencia.');
    return faltas;
  }

  /** Entrega el control: estado según el plazo, documento formal y trazabilidad. */
  entregarControl(id: string, u: UsuarioSistema): { ok: boolean; faltas: string[]; estado?: EstadoControl } {
    const c = this.controlPorId(id);
    if (!c) return { ok: false, faltas: ['El control no existe.'] };
    if (!this.atiende(u, c.direccion, c.unidad)) return { ok: false, faltas: [this.MSG_FUERA_DE_DISTRIBUCION] };
    const faltas = this.validarEntrega(c);
    if (faltas.length) return { ok: false, faltas };
    const hoy = isoLocal(new Date());
    const estado = this.plazos.evaluaEntrega(c, hoy);
    const doc = this.generaDocumento({
      tipo: 'Control mensual',
      nombre: `${c.codigo} — ${c.semana ? `Semana ${c.semana} de ` : ''}${nombreMes(c.mes)} ${c.anio}`,
      codigo: c.codigo, generadoPor: u.nombre, direccion: c.direccion, unidad: c.unidad, mes: c.mes, anio: c.anio, referencia: c.id
    });
    this.actualizaControl(id, (x) => ({
      ...x, estado, fechaEntrega: hoy, avance: 100, documento: doc,
      horaEntrega: new Date().toTimeString().slice(0, 5)
    }));
    this.registrarEvento(u, {
      direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
      accion: estado === 'Entregado' ? 'Control entregado' : 'Control entregado tarde',
      estadoAnterior: c.estado, estadoNuevo: estado, documento: doc,
      observacion: estado === 'Entregado tarde' ? 'Entrega registrada fuera del plazo de los primeros tres días hábiles.' : undefined
    });
    // El semanal consolidado deja constancia de que su documento del mes es uno solo.
    if (this.esSemanalConsolidado(c.codigo)) {
      const semanas = this.estadoSemanas(this.controlPorId(id)!);
      this.registrarEvento(u, {
        direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
        accion: `${c.codigo} consolidado mensual generado`, documento: doc,
        observacion: `Documento único de ${nombreMes(c.mes)} ${c.anio} con ${semanas.filter((s) => s.estado === 'Semana completada').length} semana(s) completada(s), ${semanas.filter((s) => s.estado === 'Semana observada').length} observada(s) y ${semanas.filter((s) => s.estado === 'Semana no aplica').length} sin aplicar.`
      });
    }
    return { ok: true, faltas: [], estado };
  }

  /** Cierra un control sin actividad mediante carta de justificación (regla: nunca queda vacío). */
  justificarControl(id: string, motivo: string, texto: string, u: UsuarioSistema): { ok: boolean; error?: string } {
    const c = this.controlPorId(id);
    if (!c) return { ok: false, error: 'El control no existe.' };
    if (!this.catalogoDe(c.codigo)?.permiteJustificacion) return { ok: false, error: 'Este control no admite justificación.' };
    if (!motivo.trim() || !texto.trim()) return { ok: false, error: 'La justificación requiere motivo y texto de la carta.' };
    if (!c.direccion || !c.unidad || !u.nombre) {
      return { ok: false, error: 'No es posible generar la carta sin mes, Dirección/Unidad y responsable.' };
    }
    if (!this.atiende(u, c.direccion, c.unidad)) return { ok: false, error: this.MSG_FUERA_DE_DISTRIBUCION };
    const hoy = isoLocal(new Date());
    const j: Justificacion = {
      id: this.idNuevo('JUS'), codigoControl: c.codigo, anio: c.anio, mes: c.mes, direccion: c.direccion,
      unidad: c.unidad, responsable: u.nombre, motivo: motivo.trim(), texto: texto.trim(), fecha: hoy,
      estado: 'Emitida', firmas: this.firmasCarta(u)
    };
    j.documento = this.generaDocumento({
      tipo: 'Justificación', nombre: `Carta de justificación — ${c.codigo} — ${nombreMes(c.mes)} ${c.anio}`,
      codigo: c.codigo, generadoPor: u.nombre, direccion: c.direccion, unidad: c.unidad, mes: c.mes, anio: c.anio, referencia: j.id
    });
    this.justificaciones.update((l) => [j, ...l]);
    this.actualizaControl(id, (x) => ({ ...x, estado: 'Justificado', justificacion: j.id, fechaEntrega: hoy }));
    this.registrarEvento(u, {
      direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio, accion: 'Control justificado',
      estadoAnterior: c.estado, estadoNuevo: 'Justificado', documento: j.documento,
      observacion: 'No se registró actividad mensual asociada a este control; se generó carta de justificación.'
    });
    return { ok: true };
  }

  /**
   * Las tres firmas del formato institucional, tomadas del directorio: el técnico que la emite,
   * el Coordinador de Soporte Técnico y el Encargado de Soporte, que es el jefe del área.
   */
  private firmasCarta(u: UsuarioSistema): Justificacion['firmas'] {
    const coordinador = this.usuarios().find((x) => x.clave === 'coordinador');
    const jefe = this.usuarios().find((x) => x.clave === 'enc-soporte');
    return [
      { nombre: u.nombre, cargo: u.cargo, estado: 'Registrada' },
      { nombre: coordinador?.nombre ?? 'Coordinador', cargo: coordinador?.cargo ?? 'Coordinador de Soporte Técnico', estado: 'Pendiente' },
      { nombre: jefe?.nombre ?? 'Encargado de Soporte', cargo: jefe?.cargo ?? 'Jefe del Departamento de Soporte Técnico', estado: 'Pendiente' }
    ];
  }

  /** Revisión del Encargado: observa (devuelve) o cierra un control entregado. */
  revisarControl(id: string, veredicto: 'Cerrado' | 'Observado', observacion: string, u: UsuarioSistema): void {
    const c = this.controlPorId(id);
    if (!c || !['Entregado', 'Entregado tarde', 'En revisión', 'Observado'].includes(c.estado)) return;
    this.actualizaControl(id, (x) => ({ ...x, estado: veredicto, observaciones: veredicto === 'Observado' ? observacion : x.observaciones }));
    this.registrarEvento(u, {
      direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
      accion: veredicto === 'Cerrado' ? 'Control revisado y cerrado' : 'Control observado',
      estadoAnterior: c.estado, estadoNuevo: veredicto, observacion: veredicto === 'Observado' ? observacion : undefined
    });
  }

  // ------------------------------------------------------------------ bitácora diaria

  bitacoraPorId(id: string): BitacoraDiaria | undefined { return this.bitacoras().find((b) => b.id === id); }

  guardarBitacora(id: string, revision: RevisionAtencion[], actividades: ActividadDia[], observaciones: string): void {
    this.bitacoras.update((l) => l.map((b) => (b.id === id
      ? { ...b, revision, actividades, observaciones, estado: b.estado === 'Pendiente' ? 'En edición' : b.estado }
      : b)));
    this.persistir();
  }

  /** La bitácora no puede cerrarse sin revisar TODO el equipo de atención al público. */
  validarBitacora(b: BitacoraDiaria): string[] {
    const faltas: string[] = [];
    const sinRevisar = b.revision.filter((r) => !r.estado);
    if (sinRevisar.length) faltas.push(`Revisión de atención al público incompleta: ${sinRevisar.map((r) => r.elemento).join(', ')}.`);
    for (const r of b.revision.filter((x) => x.estado === 'Presenta falla')) {
      if (!r.descripcionFalla?.trim() || !r.accionRealizada?.trim() || !r.estadoFinal) {
        faltas.push(`«${r.elemento}» presenta falla: registre descripción, acción realizada y estado final.`);
      }
    }
    if (!b.actividades.length) faltas.push('Registre al menos una actividad del día.');
    return faltas;
  }

  /** Envía la bitácora del día; después de las 5:00 p. m. queda marcada «Enviada tarde». */
  enviarBitacora(id: string, u: UsuarioSistema): { ok: boolean; faltas: string[]; estado?: BitacoraDiaria['estado'] } {
    const b = this.bitacoraPorId(id);
    if (!b) return { ok: false, faltas: ['La bitácora no existe.'] };
    if (!this.atiende(u, b.direccion, b.unidad)) return { ok: false, faltas: [this.MSG_FUERA_DE_DISTRIBUCION] };
    const faltas = this.validarBitacora(b);
    if (faltas.length) return { ok: false, faltas };
    const ahora = new Date();
    const hora = ahora.toTimeString().slice(0, 5);
    const hoy = isoLocal(ahora);
    const tarde = b.fecha < hoy || hora > HORA_LIMITE_BITACORA;
    const estado = tarde ? 'Enviada tarde' as const : 'Enviada' as const;
    const doc = this.generaDocumento({
      tipo: 'Bitácora diaria', nombre: `Bitácora diaria — ${b.fecha.split('-').reverse().join('/')} — ${this.cortaDireccion(b.direccion)}`,
      codigo: 'BITACORA', generadoPor: u.nombre, direccion: b.direccion, unidad: b.unidad,
      mes: Number(b.fecha.split('-')[1]), anio: Number(b.fecha.split('-')[0]), referencia: b.id
    });
    this.bitacoras.update((l) => l.map((x) => (x.id === id ? { ...x, estado, horaEnvio: hora, documento: doc } : x)));
    this.persistir();
    this.registrarEvento(u, {
      direccion: b.direccion, unidad: b.unidad, tipoControl: 'Bitácora diaria',
      mes: Number(b.fecha.split('-')[1]), anio: Number(b.fecha.split('-')[0]),
      accion: tarde ? 'Bitácora enviada tarde' : 'Bitácora enviada', estadoAnterior: b.estado, estadoNuevo: estado, documento: doc,
      observacion: tarde ? 'La bitácora diaria fue enviada fuera del horario establecido.' : undefined
    });
    return { ok: true, faltas: [], estado };
  }

  // ------------------------------------------------------------------ integración con Gestión de Equipos

  /**
   * Sincroniza el inventario operativo con los eventos de Gestión de Equipos. **No hay acción
   * manual**: el usuario no «incorpora» ni «aplica» nada. Se ejecuta al cargar el módulo y es
   * idempotente —un evento ya procesado no vuelve a aplicarse ni duplica el equipo—.
   * Devuelve cuántos movimientos se aplicaron en esta pasada.
   */
  sincronizarInventario(): number {
    let aplicados = 0;
    for (const ev of this.eventosIntegracion()) {
      if (ev.aplicado) continue;
      if (ev.tipo === 'Entrega aceptada') this.onEquipmentAccepted(ev);
      else this.onEquipmentDischarged(ev);
      this.eventosIntegracion.update((l) => l.map((e) => (e.id === ev.id ? { ...e, aplicado: true } : e)));
      aplicados++;
    }
    if (aplicados) this.persistir();
    return aplicados;
  }

  /** Contexto común de los eventos de trazabilidad de integración. */
  private trazaEquipo(ev: EventoIntegracion): Partial<EventoTrazabilidad> {
    return {
      direccion: ev.equipo.direccion, unidad: ev.equipo.unidad, inventario: ev.equipo.inventario,
      equipo: `${ev.equipo.tipo} ${ev.equipo.marca} ${ev.equipo.modelo}`.trim(),
      usuarioFinal: ev.equipo.usuarioFinal, expedienteUnico: ev.expedienteUnico || ev.expediente,
      moduloOrigen: MODULO_EQUIPOS, moduloDestino: MODULO_CONTROLES
    };
  }

  /**
   * El Usuario Final aceptó la conformidad en Gestión de Equipos: el equipo queda activo en su
   * Dirección/Unidad y entra **automáticamente** al inventario operativo. Si el mismo número de
   * inventario ya tenía un ciclo abierto (nueva entrega tras un descargo), el ciclo anterior pasa
   * a «Histórico» y se crea un registro operativo nuevo: el historial no se pierde.
   */
  private onEquipmentAccepted(ev: EventoIntegracion): void {
    const previos = this.inventario().filter((e) => e.inventario === ev.equipo.inventario);
    const mismoCiclo = previos.find((e) => e.ciclo === ev.equipo.ciclo);
    if (mismoCiclo) return; // ya procesado: no duplicar
    const abiertos = previos.filter((e) => e.estado !== 'Descargado' && e.estado !== 'Histórico');
    const equipo: EquipoOperativo = {
      ...ev.equipo,
      soporteResponsable: this.responsableDe(ev.equipo.direccion, ev.equipo.unidad, ev.equipo.tecnicoConfiguracion)
        || ev.equipo.soporteResponsable,
      estado: 'Activo en Dirección/Unidad'
    };
    if (abiertos.length) {
      this.inventario.update((l) => l.map((e) => (abiertos.some((a) => a.ciclo === e.ciclo)
        ? { ...e, estado: 'Histórico' as const } : e)));
      for (const a of abiertos) {
        this.registrarEvento(null, {
          ...this.trazaEquipo(ev), accion: 'Equipo movido a histórico operativo',
          estadoAnterior: a.estado, estadoNuevo: 'Histórico',
          observacion: `El equipo inicia un nuevo ciclo operativo en ${this.dirUnidad(equipo.direccion, equipo.unidad)}; el registro anterior de ${this.dirUnidad(a.direccion, a.unidad)} se conserva como histórico.`
        });
      }
    }
    this.inventario.update((l) => [equipo, ...l]);
    this.registrarEvento(null, {
      ...this.trazaEquipo(ev), accion: 'Equipo incorporado automáticamente desde Gestión de Equipos',
      estadoAnterior: 'Entregado', estadoNuevo: 'Activo en Dirección/Unidad',
      observacion: `El Usuario Final aceptó la conformidad (${ev.expedienteUnico || ev.expediente}); el equipo se incorporó automáticamente al inventario operativo de ${this.dirUnidad(equipo.direccion, equipo.unidad)}. Soporte responsable: ${equipo.soporteResponsable || 'sin asignar'}.`
    });
  }

  /**
   * Soporte registró el descargo en Gestión de Equipos: el equipo sale **automáticamente** del
   * inventario operativo activo, conservando su registro con estado «Descargado».
   */
  private onEquipmentDischarged(ev: EventoIntegracion): void {
    const activo = this.inventario().find((e) => e.inventario === ev.equipo.inventario
      && e.estado !== 'Descargado' && e.estado !== 'Histórico');
    if (!activo) return; // ya descargado o nunca estuvo activo: no repetir movimiento
    this.inventario.update((l) => l.map((e) => (e.ciclo === activo.ciclo
      ? { ...e, estado: 'Descargado' as const, fechaDescargo: ev.fecha, motivoDescargo: e.motivoDescargo ?? ev.detalle }
      : e)));
    this.registrarEvento(null, {
      ...this.trazaEquipo(ev), accion: 'Equipo retirado automáticamente por descargo',
      estadoAnterior: activo.estado, estadoNuevo: 'Descargado',
      observacion: `${ev.detalle} El equipo salió automáticamente del inventario operativo de ${this.dirUnidad(activo.direccion, activo.unidad)} y deja de contar para sus controles.`
    });
  }

  // ------------------------------------------------------------------ documentos y trazabilidad

  documentoPorId(id: string): DocumentoGenerado | undefined { return this.documentos().find((d) => d.id === id); }

  private generaDocumento(d: Omit<DocumentoGenerado, 'id' | 'fecha' | 'hora' | 'hash' | 'estado'>): string {
    const ahora = new Date();
    const doc: DocumentoGenerado = {
      ...d, id: this.idNuevo('DOC'), fecha: isoLocal(ahora), hora: ahora.toTimeString().slice(0, 5),
      hash: this.huella(d.referencia + isoLocal(ahora)), estado: 'Generado'
    };
    this.documentos.update((l) => [doc, ...l]);
    return doc.id;
  }

  private huella(s: string): string {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const hex = h.toString(16).toUpperCase().padStart(8, '0');
    return `${hex.slice(0, 4)}·${hex.slice(4)}`;
  }

  registrarDescarga(idDoc: string, u: UsuarioSistema): void {
    const d = this.documentoPorId(idDoc);
    if (!d) return;
    this.documentos.update((l) => l.map((x) => (x.id === idDoc ? { ...x, estado: 'Descargado' as const } : x)));
    this.persistir();
    this.registrarEvento(u, { direccion: d.direccion, unidad: d.unidad, tipoControl: d.codigo, mes: d.mes, anio: d.anio, accion: 'Documento descargado', documento: idDoc });
  }

  /** Reporte mensual consolidado de una Dirección (o de todas) para presentar a la jefatura. */
  generarReporteMensual(anio: number, mes: number, direccion: string, u: UsuarioSistema): string {
    const doc = this.generaDocumento({
      tipo: 'Reporte mensual consolidado',
      nombre: `Reporte mensual consolidado — ${nombreMes(mes)} ${anio}${direccion ? ` — ${this.cortaDireccion(direccion)}` : ''}`,
      codigo: 'REPORTE', generadoPor: u.nombre, direccion: direccion || 'Todas', mes, anio,
      referencia: `REP-${anio}-${mes}-${direccion || 'todas'}`
    });
    this.registrarEvento(u, { direccion: direccion || undefined, mes, anio, accion: 'Vista PDF generada', documento: doc, observacion: 'Reporte mensual consolidado generado desde el Generador de documentos.' });
    return doc;
  }

  /**
   * Reportes formales por Dirección/Unidad (mensual, anual, pendientes, operatividad, inventario
   * y bitácoras). El contenido lo arma el visor con los datos vivos del período; aquí solo se
   * registra el documento y su traza.
   */
  generarReporteDireccion(tipo: string, p: { anio: number; mes: number; direccion: string; unidad: string },
    u: UsuarioSistema): string {
    const anual = tipo.includes('anual');
    const periodo = anual ? `${p.anio}` : `${nombreMes(p.mes)} ${p.anio}`;
    const doc = this.generaDocumento({
      tipo: tipo as DocumentoGenerado['tipo'],
      nombre: `${tipo} — ${this.cortaDireccion(p.direccion)} / ${p.unidad} — ${periodo}`,
      codigo: 'REPORTE', generadoPor: u.nombre, direccion: p.direccion, unidad: p.unidad,
      mes: p.mes, anio: p.anio,
      referencia: `REP-${p.anio}-${anual ? 'ANUAL' : p.mes}-${p.direccion}-${p.unidad}-${tipo.length}`
    });
    this.registrarEvento(u, {
      direccion: p.direccion, unidad: p.unidad, mes: p.mes, anio: p.anio,
      accion: 'Reporte de Dirección generado', documento: doc,
      observacion: `${tipo} de ${this.dirUnidad(p.direccion, p.unidad)} · ${periodo}.`
    });
    return doc;
  }

  registrarEvento(u: UsuarioSistema | null, e: Partial<EventoTrazabilidad> & { accion: string }): void {
    const ahora = new Date();
    const evento: EventoTrazabilidad = {
      id: this.idNuevo('TRZ'), fecha: isoLocal(ahora), hora: ahora.toTimeString().slice(0, 5),
      usuario: u?.usuario ?? 'sistema', rol: u?.rol ?? 'Sistema', moduloOrigen: MODULO_CONTROLES, ...e
    };
    this.trazabilidad.update((l) => [evento, ...l]);
    this.persistir();
  }

  // ------------------------------------------------------------------ administración de la distribución

  /** Solo el Encargado de Soporte y el Administrador gestionan la distribución. */
  puedeGestionarDistribucion(u: UsuarioSistema | null): boolean {
    return u?.clave === 'enc-soporte' || u?.clave === 'admin';
  }

  /**
   * Asigna un Técnico de Soporte a una Dirección/Unidad. El efecto es doble: en este módulo pasa
   * a ver y completar sus controles y bitácoras; en Gestión de Equipos pasa a estar disponible
   * como Técnico de Configuración para los requerimientos de esa Dirección/Unidad.
   */
  asignarDistribucion(datos: { direccion: string; unidad: string; tecnico: string; observacion: string },
    u: UsuarioSistema): string | null {
    if (!this.puedeGestionarDistribucion(u)) {
      return 'Solo el Encargado de Soporte o el Administrador pueden gestionar la distribución de soportes.';
    }
    if (!datos.direccion || !datos.unidad) return 'Debe indicar la Dirección y la Unidad.';
    if (!datos.tecnico) return 'Debe seleccionar el Técnico de Soporte responsable.';
    const tec = this.usuarios().find((x) => datos.tecnico.includes(x.nombre));
    if (!tec || tec.clave !== 'tec-soporte') {
      return 'La distribución solo admite Técnicos de Soporte: Hardware no atiende Direcciones/Unidades.';
    }
    const nombreDir = this.nombreDireccion(datos.direccion);
    if (this.soportes.atiende(datos.tecnico, nombreDir, datos.unidad)) {
      return `${tec.nombre} ya atiende ${nombreDir} / ${datos.unidad}.`;
    }
    const ahora = new Date();
    const nuevo: DistribucionSoporte = {
      id: this.soportes.siguienteId(ahora.getFullYear()),
      direccion: nombreDir, unidad: datos.unidad, tecnico: `${tec.nombre} — ${tec.rol}`,
      asignadoPor: `${u.nombre} — ${u.rol}`, fecha: isoLocal(ahora), hora: ahora.toTimeString().slice(0, 5),
      activo: true, observacion: datos.observacion.trim()
    };
    this.soportes.agregar(nuevo);
    this.persistir();
    this.registrarEvento(u, {
      direccion: datos.direccion, unidad: datos.unidad, accion: 'Distribución de soporte modificada',
      moduloOrigen: MODULO_CONTROLES, estadoNuevo: `${tec.nombre} asignado`,
      observacion: `${tec.nombre} atiende ${nombreDir} / ${datos.unidad}. ${nuevo.observacion}`.trim()
    });
    this.registrarEvento(u, {
      direccion: datos.direccion, unidad: datos.unidad, accion: 'Distribución aplicada en Gestión de Equipos',
      moduloOrigen: MODULO_CONTROLES, moduloDestino: MODULO_EQUIPOS,
      observacion: `Desde esta fecha, Gestión de Equipos ofrece a ${tec.nombre} como Técnico de Configuración para los requerimientos de esta Dirección/Unidad.`
    });
    return null;
  }

  /**
   * Desactiva una asignación. Nunca se borra: los controles y equipos registrados mientras
   * estuvo vigente siguen apuntando a ella.
   */
  desactivarDistribucion(id: string, motivo: string, u: UsuarioSistema): string | null {
    if (!this.puedeGestionarDistribucion(u)) {
      return 'Solo el Encargado de Soporte o el Administrador pueden gestionar la distribución de soportes.';
    }
    const actual = this.distribucion().find((d) => d.id === id);
    if (!actual) return 'No se encontró la asignación indicada.';
    if (!actual.activo) return 'La asignación ya está desactivada.';
    if (!motivo.trim()) return 'Debe indicar el motivo por el que se desactiva la asignación.';
    const idDir = this.idDireccion(actual.direccion);
    const equipos = this.equiposActivosDe(idDir, actual.unidad);
    const quedan = this.soportes.deDireccionUnidad(actual.direccion, actual.unidad).filter((d) => d.id !== id);
    if (equipos.length && !quedan.length) {
      return `No se puede desactivar: ${actual.direccion} / ${actual.unidad} tiene ${equipos.length} equipo(s) activo(s) y quedaría sin ningún Técnico de Soporte responsable.`;
    }
    this.soportes.desactivar(id, `${u.nombre} — ${u.rol}`, isoLocal(new Date()), motivo.trim());
    // Los equipos activos pasan al responsable que queda vigente: nunca quedan sin soporte.
    if (equipos.length && quedan.length) {
      const nuevo = quedan[0].tecnico;
      this.inventario.update((l) => l.map((e) => (e.direccion === idDir && e.unidad === actual.unidad
        && e.estado !== 'Descargado' ? { ...e, soporteResponsable: nuevo } : e)));
    }
    this.persistir();
    this.registrarEvento(u, {
      direccion: idDir, unidad: actual.unidad, accion: 'Distribución de soporte modificada',
      estadoAnterior: this.soportes.soloNombre(actual.tecnico),
      estadoNuevo: quedan.length ? quedan.map((d) => this.soportes.soloNombre(d.tecnico)).join(' · ') : 'Sin soporte asignado',
      observacion: motivo.trim()
    });
    this.registrarEvento(u, {
      direccion: idDir, unidad: actual.unidad, accion: 'Distribución aplicada en Gestión de Equipos',
      moduloOrigen: MODULO_CONTROLES, moduloDestino: MODULO_EQUIPOS,
      observacion: `Gestión de Equipos deja de ofrecer a ${this.soportes.soloNombre(actual.tecnico)} como Técnico de Configuración de esta Dirección/Unidad.`
    });
    return null;
  }

  actualizarCatalogo(c: ControlCatalogo, u: UsuarioSistema): string | null {
    const error = this.validarAplicacion(c.aplicacion);
    if (c.activo && error) return `No es posible activar el control sin configurar su aplicación. ${error}`;
    this.catalogo.update((l) => l.map((x) => (x.codigo === c.codigo ? c : x)));
    this.persistir();
    this.registrarEvento(u, { tipoControl: c.codigo, accion: 'Catálogo de controles actualizado', observacion: `${c.codigo}: frecuencia ${c.frecuencia.toLowerCase()}, ${c.activo ? 'activo' : 'inactivo'}.` });
    return null;
  }

  /** Una aplicación vacía no se guarda: el control quedaría sin ninguna Dirección/Unidad donde correr. */
  validarAplicacion(a: AplicacionControl): string | null {
    if (a.modo === 'Todas las direcciones') return null;
    if (a.modo === 'Direcciones específicas' && !a.direcciones.length) {
      return 'Debe seleccionar al menos una Dirección, Unidad o área donde aplica este control.';
    }
    if (a.modo === 'Unidades específicas' && !a.unidades.length) {
      return 'Debe seleccionar al menos una Dirección, Unidad o área donde aplica este control.';
    }
    if (a.modo === 'Área técnica específica' && !a.area) {
      return 'Debe seleccionar al menos una Dirección, Unidad o área donde aplica este control.';
    }
    return null;
  }

  /**
   * Guarda dónde aplica un control. Cambiar la aplicación cambia qué Direcciones/Unidades verán
   * ese control en el calendario del próximo período; los controles ya programados no se tocan,
   * porque pertenecen a un período cerrado.
   */
  actualizarAplicacion(codigo: string, aplicacion: AplicacionControl, u: UsuarioSistema): string | null {
    const c = this.catalogoDe(codigo);
    if (!c) return 'El control no existe en el catálogo.';
    const error = this.validarAplicacion(aplicacion);
    if (error) return error;
    const antes = this.resumenAplicacion(c);
    this.catalogo.update((l) => l.map((x) => (x.codigo === codigo ? { ...x, aplicacion } : x)));
    this.persistir();
    const despues = this.resumenAplicacion(this.catalogoDe(codigo)!);
    this.registrarEvento(u, {
      tipoControl: codigo, accion: 'Aplicación del control actualizada',
      estadoAnterior: antes, estadoNuevo: despues,
      observacion: `${codigo}: ${aplicacion.modo.toLowerCase()}. ${aplicacion.observaciones}`.trim()
    });
    return null;
  }
}
