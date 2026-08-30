import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ActividadDia, AplicacionControl, AreaTecnica, BitacoraDiaria, ControlCatalogo, ControlMes,
  Direccion, DistribucionSoporte, DocumentoGenerado, EquipoOperativo, ESTADOS_ACTIVOS,
  EstadoControl, EventoIntegracion, EventoTrazabilidad, Frecuencia, Justificacion, RespuestaSeccion,
  ItemSeguridad, RespuestaEquipoChecklist, RespuestaIngreso, RespuestaItemSeguridad, RevisionAtencion,
  ResumenMuestra, SeccionPlantilla, UsuarioSistema, isoLocal, nombreMes
} from '../models/models';
import {
  RolSistema, ROLES, ROL_RESPONSABLE_SOPORTE, claveDeRol, esRolHardware, etiquetaRoles, nombreRol,
  normalizaRoles, ordenaRoles, rolPrincipal
} from '../models/roles';
import { ETIQUETA_TODO_EL_DEPARTAMENTO } from '../models/territorio';
import { HolidayService } from './holiday.service';
import { BusinessDayService } from './business-day.service';
import { ControlDeadlineService } from './control-deadline.service';
import { SupportDistributionService } from './support-distribution.service';
import { TerritorioService } from './territorio.service';
import { EquipoOperativoCompartido, SharedInventoryService } from './shared-inventory.service';
import { SharedInventoryBridgeService } from './shared-inventory-bridge.service';

/**
 * v2: la foto de estado cambió de forma con la estructura territorial
 * `Zona → Departamento → Dirección/Registro` y con los usuarios multirrol. Una foto v1 describe
 * una organización que ya no existe, así que se ignora y el módulo vuelve a sembrar la
 * demostración; no se borra nada del navegador en silencio.
 */
const STORAGE_KEY = 'sisgost.controles.v2';

/** Qué movió una pasada de sincronización automática del período. */
export interface ResumenAutoSync {
  creados: number;
  noAplica: number;
  reabiertos: number;
  responsables: number;
}

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
  /** Los usuarios se guardan porque el Administrador edita sus roles y su estado. */
  usuarios?: UsuarioSistema[];
}

/**
 * Almacén único de SISGOST — Controles Mensuales. Carga la semilla JSON de assets/data,
 * conserva los cambios de la sesión en localStorage y concentra todas las reglas de negocio:
 * entrega dentro de los primeros 3 días hábiles, bitácora antes de las 5:00 p. m.,
 * justificación obligatoria cuando no hay actividad y la integración con Gestión de Equipos.
 *
 * Los datos base (usuarios, Direcciones/Registros, distribución de soportes y equipos) son los
 * mismos del módulo Gestión de Equipos: este servicio no inventa organización propia.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly feriadosSrv = inject(HolidayService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);
  /** Catálogo territorial `Zona → Departamento → Dirección/Registro`, compartido del ecosistema. */
  readonly territorio = inject(TerritorioService);
  /** Inventario operativo compartido: lo escribe Gestión de Equipos al aceptar la conformidad. */
  private readonly compartido = inject(SharedInventoryService);
  /** Puente hacia el otro origen: los dos módulos corren en puertos distintos. */
  private readonly puente = inject(SharedInventoryBridgeService);
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

  /**
   * Técnicos de Soporte del ecosistema. Se busca **entre todos los roles del usuario**, no en el
   * rol activo: quien es Encargado y además Técnico de Soporte puede recibir asignaciones, y con
   * la comparación anterior desaparecía de la lista en cuanto entraba como Encargado.
   */
  readonly tecnicosSoporte = computed(() =>
    this.usuarios().filter((u) => u.roles?.includes(ROL_RESPONSABLE_SOPORTE) && u.estado === 'Activo'));

  /** Catálogo de roles del sistema, para Administración → Usuarios. */
  readonly rolesDisponibles = ROLES;

  private secuencia = 1000;

  // ------------------------------------------------------------------ carga y persistencia

  async cargar(): Promise<void> {
    if (this.listo()) return;
    // El catálogo territorial entra primero: es quien resuelve zona, departamento y
    // Dirección/Registro para todo lo demás.
    await Promise.all([this.feriadosSrv.cargar(), this.territorio.cargar()]);

    const [usuarios, direcciones, areas, catalogo] = await Promise.all([
      this.json<UsuarioSistema[]>('usuarios-sistema'),
      this.json<Direccion[]>('direcciones'),
      this.json<AreaTecnica[]>('areas-tecnicas'),
      this.json<ControlCatalogo[]>('catalogo-controles')
    ]);
    this.usuarios.set(usuarios.map((u) => this.normalizaUsuario(u)));
    this.direcciones.set(direcciones);
    // El catálogo organizacional entra al servicio compartido ANTES que la distribución: es quien
    // resuelve el nombre de una Dirección/Registro a su ID estable.
    this.soportes.cargarOrganizacion(direcciones);
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
      // Los roles y el estado que el Administrador haya editado mandan sobre la semilla.
      if (guardado.usuarios?.length) this.usuarios.set(guardado.usuarios.map((x) => this.normalizaUsuario(x)));
      this.soportes.cargar(guardado.distribucion);
      this.alinearDistribucionCompartida();
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
      this.alinearDistribucionCompartida();
    }

    // El inventario operativo se pone al día ANTES de reconciliar: los equipos que Gestión de
    // Equipos aceptó o descargó ya deben estar reflejados cuando se calcula lo demás.
    this.sincronizarInventario();
    // Y se consulta al otro módulo por si escribió estando en otro origen (puertos distintos).
    void this.puente.consultar().then((n) => { if (n) this.sincronizarInventario(); });
    // Si otra pestaña del mismo origen escribe el compartido, se refleja en el acto.
    this.compartido.escuchar(() => this.sincronizarInventario());
    this.reconciliarVencidos();
    this.asegurarBitacorasDeHoy();
    this.trazarCatalogoTerritorial();
    this.persistir();
    this.listo.set(true);
  }

  /**
   * Deja constancia de con qué catálogo territorial está trabajando el módulo (§32). Se registra
   * una sola vez por versión: repetirlo en cada arranque llenaría la trazabilidad de ruido.
   */
  private trazarCatalogoTerritorial(): void {
    const version = this.territorio.version();
    if (!version) return;
    const yaEsta = this.trazabilidad().some((e) => e.accion === 'Catálogo territorial actualizado'
      && e.estadoNuevo === version);
    if (yaEsta) return;
    this.registrarEvento(null, {
      accion: 'Catálogo territorial actualizado', estadoNuevo: version,
      observacion: `El módulo trabaja con ${this.territorio.zonas().length} zonas, ${this.territorio.departamentos().length} departamentos y ${this.territorio.direccionesRegistro().length} Direcciones/Registros. Se distribuyen por Dirección/Registro: ${this.territorio.departamentosPorDireccion().map((d) => d.nombre).join(', ') || 'ninguno'}; el resto, por Departamento completo.`
    });
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

  /**
   * Deja la distribución de este módulo y la fuente compartida diciendo lo mismo.
   *
   * Si ya hay algo compartido en este origen **manda lo compartido**: es lo que se editó por
   * última vez y sobrevive a que se borre la foto local. Si no hay nada, se publica lo que trae
   * la semilla, que es la única forma de sembrar la demostración sin pisar cambios del usuario.
   */
  private alinearDistribucionCompartida(): void {
    // Una copia de una versión anterior del contrato describe una organización que ya no existe
    // (Direcciones/Registros en vez de Departamentos y Direcciones/Registros): se ignora y se
    // vuelve a publicar la semilla territorial encima.
    if (this.soportes.compartida.vigente()) {
      this.soportes.adoptarDelOrigen();
      return;
    }
    this.soportes.publicar();
  }

  /**
   * Publica el cambio para el otro módulo y lo deja trazado. Se llama al guardar, nunca desde un
   * botón: Gestión de Equipos lee esta clave al arrancar, al entrar al expediente único, al abrir
   * el selector de técnico y cada vez que recupera el foco.
   */
  private publicarDistribucion(u: UsuarioSistema | null, detalle: string): void {
    const marca = this.soportes.publicar();
    this.registrarEvento(u, {
      accion: 'Distribución guardada en fuente compartida',
      moduloOrigen: MODULO_CONTROLES, moduloDestino: MODULO_EQUIPOS,
      estadoNuevo: `${this.soportes.activas().length} responsabilidad(es) vigente(s)`,
      observacion: `${detalle} Publicada en «${this.soportes.compartida.clave}» (${marca}); Gestión de Equipos la lee sin ninguna acción manual.`
    });
  }

  private persistir(): void {
    const s: Snapshot = {
      controles: this.controles(), bitacoras: this.bitacoras(), justificaciones: this.justificaciones(),
      inventario: this.inventario(), eventosIntegracion: this.eventosIntegracion(),
      documentos: this.documentos(), trazabilidad: this.trazabilidad(), distribucion: this.distribucion(),
      catalogo: this.catalogo(), usuarios: this.usuarios()
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
    // La distribución compartida también se repone: si se quedara la editada, el arranque la
    // adoptaría y el restablecimiento no habría restablecido nada. Es un reset pedido a mano,
    // nunca automático.
    try {
      localStorage.removeItem(this.soportes.compartida.clave);
      localStorage.removeItem(this.soportes.compartida.claveActualizada);
      localStorage.removeItem(this.soportes.compartida.claveVersion);
    } catch { /* sin localStorage no hay nada que reponer */ }
    location.reload();
  }

  /** Alias histórico de `restablecerDemostracion`. */
  reiniciarDatos(): void { this.restablecerDemostracion(); }

  /** Qué colecciones repone el restablecimiento (se muestra en la confirmación). */
  readonly coleccionesDemostracion = [
    'Controles mensuales', 'Bitácoras diarias', 'Justificaciones', 'Documentos generados',
    'Trazabilidad de controles', 'Inventario operativo simulado', 'Distribución de soportes inicial',
    'Datos base (usuarios, Direcciones/Registros y catálogo)'
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

  /** Crea la bitácora «Pendiente» del día para cada Dirección/Registro con soporte activo. */
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

  /** Pares Dirección/Registro que llevan bitácora, tomados del histórico ya sembrado. */
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
  idDireccion(nombre: string): string { return this.territorio.idDepartamento(nombre); }

  /**
   * «Dirección / Unidad» para mostrar. Cuando la unidad se llama igual que la Dirección
   * (Gerencia de Tecnología, Dirección de Registro) se escribe una sola vez.
   */
  dirUnidad(direccionId: string, unidad: string): string {
    return this.territorio.etiqueta(direccionId, unidad);
  }

  /** «Zona Central · San Salvador · Registro de Comercio», para encabezados y documentos. */
  rutaTerritorial(direccionId: string, unidad = ''): string {
    return this.territorio.ruta(direccionId, unidad);
  }

  /** Zona a la que pertenece un departamento. */
  zonaDe(direccionId: string): string {
    return this.territorio.nombreZona(this.territorio.zonaDe(direccionId));
  }
  catalogoDe(codigo: string): ControlCatalogo | undefined { return this.catalogo().find((c) => c.codigo === codigo); }

  /** Todos los pares Dirección/Registro del catálogo organizacional. */
  readonly pares = computed(() => this.territorio.ambitosDistribuibles().map((a) => ({
    direccion: a.departamentoId,
    unidad: a.direccionRegistroId
      ? this.territorio.nombreRegistro(a.direccionRegistroId)
      : ETIQUETA_TODO_EL_DEPARTAMENTO
  })));

  /**
   * Todas las Direcciones/Registros, una por una, con independencia de cómo se distribuya el
   * departamento. Es lo que se muestra **al expandir** un departamento: su alcance completo, aun
   * cuando el control y el responsable sean del departamento entero (§21, §30).
   */
  readonly registrosTodos = computed(() => this.territorio.departamentosActivos()
    .flatMap((d) => this.territorio.registrosDe(d.id)
      .map((r) => ({ direccion: d.id, unidad: r.nombre, registroId: r.id }))));

  /** Direcciones/Registros que cubre un ámbito de control (una sola, o todas las del departamento). */
  registrosDelAmbito(direccionId: string, unidad: string): { direccion: string; unidad: string }[] {
    const dep = this.territorio.idDepartamento(direccionId);
    const reg = this.territorio.idRegistro(dep, unidad);
    if (reg) return [{ direccion: dep, unidad: this.territorio.nombreRegistro(reg) }];
    return this.territorio.registrosDe(dep).map((r) => ({ direccion: dep, unidad: r.nombre }));
  }

  /** Técnico responsable (formato «Nombre — Rol») de un ámbito territorial. */
  responsableDe(direccionId: string, unidad: string, preferido = ''): string {
    return this.soportes.responsableDe(direccionId, unidad, preferido);
  }

  /** Técnicos responsables de un ámbito territorial. */
  tecnicosDe(direccionId: string, unidad: string): string[] {
    return this.soportes.tecnicosDe(direccionId, unidad);
  }

  /** Primera asignación vigente del departamento (departamental o de cualquiera de sus registros). */
  soporteDe(direccionId: string): DistribucionSoporte | undefined {
    return this.soportes.deDireccion(direccionId)[0];
  }

  /** Ámbitos territoriales asignados a un usuario del sistema. */
  paresDe(usuario: string): { direccion: string; unidad: string }[] {
    const u = this.usuarios().find((x) => x.usuario === usuario);
    if (!u) return [];
    return this.soportes.deTecnico(u.nombre).map((d) => ({ direccion: d.departamentoId, unidad: d.unidad }));
  }

  /** Ids de departamento asignados a un usuario. */
  direccionesDe(usuario: string): string[] {
    return [...new Set(this.paresDe(usuario).map((p) => p.direccion))];
  }

  /**
   * ¿El usuario atiende ese ámbito? Solo limita al Técnico de Soporte, y la comprobación es
   * territorial: quien tiene el departamento completo atiende todas sus Direcciones/Registros.
   *
   * Se pregunta por el **rol activo**: quien es Encargado y Técnico a la vez ve todo mientras
   * opera como Encargado, y se limita a lo suyo en cuanto pasa a Técnico. Esa es justamente la
   * razón de que el rol activo exista.
   */
  atiende(u: UsuarioSistema | null, direccionId: string, unidad: string): boolean {
    if (!u) return false;
    if (u.clave !== 'tec-soporte') return true;
    return this.soportes.atiende(u.nombre, direccionId, unidad);
  }

  /** Ámbitos territoriales activos sin ningún soporte responsable: alerta del panel ejecutivo. */
  readonly paresSinSoporte = computed(() => this.pares()
    .filter((p) => !this.soportes.deDireccionUnidad(p.direccion, p.unidad).length));

  // ------------------------------------------------------------------ aplicación de los controles

  areaDe(id: string): AreaTecnica | undefined { return this.areas().find((a) => a.id === id); }

  /**
   * Direcciones/Registros donde **aplica** un control, según su configuración del catálogo.
   * El calendario solo programa el control en estos pares: no todos los controles se trabajan en
   * todas las Direcciones/Registros. Los controles que revisan equipos se limitan además a los
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
  requiereEquipos(c: ControlCatalogo): boolean {
    return c.plantilla.some((s) => !!s.equipos || !!s.checklistEquipos);
  }

  /** ¿Aplica este control en esa Dirección/Registro? */
  aplicaEn(codigo: string, direccionId: string, unidad: string): boolean {
    return this.paresAplicables(codigo).some((p) => p.direccion === direccionId && p.unidad === unidad);
  }

  /** Controles activos que aplican a una Dirección/Registro. */
  controlesAplicablesDe(direccionId: string, unidad: string): ControlCatalogo[] {
    return this.catalogo().filter((c) => c.activo && this.aplicaEn(c.codigo, direccionId, unidad));
  }

  /** Controles activos que NO aplican a una Dirección/Registro (estado informativo «No aplica»). */
  controlesNoAplicablesDe(direccionId: string, unidad: string): ControlCatalogo[] {
    return this.catalogo().filter((c) => c.activo && !this.aplicaEn(c.codigo, direccionId, unidad));
  }

  /** Texto corto de la aplicación de un control, para tablas y documentos. */
  resumenAplicacion(c: ControlCatalogo): string {
    const a = c.aplicacion;
    switch (a.modo) {
      case 'Todas las direcciones': return 'Todas las Direcciones/Registros';
      case 'Direcciones específicas': return a.direcciones.map((d) => this.cortaDireccion(d)).join(' · ') || 'Sin configurar';
      case 'Unidades específicas': return a.unidades.map((u) => `${this.cortaDireccion(u.direccion)} / ${u.unidad}`).join(' · ') || 'Sin configurar';
      default: return this.areaDe(a.area)?.nombre ?? 'Sin configurar';
    }
  }

  /**
   * Direcciones/Registros que tienen controles aplicables pero ningún Técnico de Soporte
   * responsable: nadie puede entregarlos.
   */
  readonly paresAplicablesSinSoporte = computed(() => this.paresSinSoporte()
    .map((p) => ({ ...p, controles: this.controlesAplicablesDe(p.direccion, p.unidad).length }))
    .filter((p) => p.controles > 0));

  /** Departamentos sin ningún soporte, ni departamental ni por Dirección/Registro. */
  readonly direccionesSinSoporte = computed(() => this.direcciones()
    .filter((d) => d.activa && !this.soportes.deDireccion(d.id).length));

  /** El Técnico de Soporte solo ve sus Direcciones/Registros; los demás roles ven todo. */
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

  /**
   * Equipos ACTIVOS de un ámbito territorial: los que cuentan para los controles. Cuando el
   * ámbito es un departamento completo —fuera de San Salvador— entran los equipos de **todas**
   * sus Direcciones/Registros, porque el control y el responsable también lo son.
   */
  equiposActivosDe(direccionId: string, unidad: string): EquipoOperativo[] {
    const dep = this.territorio.idDepartamento(direccionId);
    const reg = this.territorio.idRegistro(dep, unidad);
    return this.inventarioActivo().filter((e) => this.territorio.idDepartamento(e.direccion) === dep
      && (!reg || this.territorio.idRegistro(dep, e.unidad) === reg));
  }

  /** Equipos que un control puede revisar: los activos de su propia Dirección/Registro. */
  equiposDeControl(c: ControlMes): EquipoOperativo[] {
    return this.equiposActivosDe(c.direccion, c.unidad);
  }

  /** Ficha vigente de un número de inventario (si tiene varios ciclos, el que sigue abierto). */
  equipoDe(inventario: string): EquipoOperativo | undefined {
    const propios = this.inventario().filter((e) => e.inventario === inventario);
    return propios.find((e) => ESTADOS_ACTIVOS.includes(e.estado)) ?? propios[0];
  }

  // ------------------------------------------------------------------ búsqueda de equipos por IP

  /** Mensajes de la validación de IP del F0387; se reutilizan en el formulario y en la entrega. */
  readonly MSG_IP_NO_ENCONTRADA =
    'No se encontró un equipo activo con esta IP en el inventario operativo.';
  readonly MSG_IP_OTRA_UNIDAD =
    'La IP ingresada pertenece a otra Dirección/Registro y no puede usarse en este control.';

  /**
   * Equipo ACTIVO cuya IP coincide con la buscada. La IP viene del inventario operativo, es decir,
   * de la reserva registrada en Gestión de Equipos al aceptar la conformidad: este módulo no la
   * inventa ni permite escribir una IP suelta.
   */
  equipoPorIp(ip: string): EquipoOperativo | undefined {
    const buscada = (ip ?? '').trim();
    if (!buscada) return undefined;
    return this.inventarioActivo().find((e) => (e.ip ?? '').trim() === buscada);
  }

  /**
   * Resuelve una IP dentro de una Dirección/Registro. Devuelve el equipo o el motivo del rechazo:
   * la IP no existe entre los equipos activos, o existe pero en otra Dirección/Registro.
   */
  buscarEquipoIp(ip: string, direccionId: string, unidad: string):
    { equipo?: EquipoOperativo; error?: string } {
    const equipo = this.equipoPorIp(ip);
    if (!equipo) return { error: this.MSG_IP_NO_ENCONTRADA };
    // El equipo tiene que caer dentro del ámbito del control: la misma Dirección/Registro, o
    // cualquiera del departamento cuando el control es departamental.
    if (!this.equiposActivosDe(direccionId, unidad).some((e) => e.ciclo === equipo.ciclo)) {
      return { error: this.MSG_IP_OTRA_UNIDAD };
    }
    return { equipo };
  }

  /** IPs disponibles para un control: las de los equipos activos de su Dirección/Registro. */
  ipsDeControl(c: ControlMes): EquipoOperativo[] {
    return this.equiposDeControl(c).filter((e) => (e.ip ?? '').trim());
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
    'Este control pertenece a una Dirección/Registro que no está asignada al técnico en la distribución de soportes.';

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
    // Los controles con muestra de equipos (F0382) dejan traza de qué equipos entraron y salieron
    // y de cada verificación e incumplimiento registrado.
    if (antes && despues && this.checklistDe(despues.codigo)) this.trazarMuestra(antes, despues, u);
    // La bitácora de ingresos (F0234) deja traza de cada registro agregado, editado o eliminado.
    if (antes && despues && this.ingresosDe(despues.codigo)) this.trazarIngresos(antes, despues, u);
  }

  /** Diferencia la bitácora de ingresos entre dos versiones del control y deja sus eventos. */
  private trazarIngresos(antes: ControlMes, despues: ControlMes, u: UsuarioSistema | null): void {
    const p = this.ingresosDe(despues.codigo)!;
    const registros = (c: ControlMes) =>
      (c.secciones.find((x) => x.titulo === p.titulo)?.ingresos ?? [])
        .map((x) => this.normalizaIngreso(x))
        .filter((x) => !this.ingresoVacio(x));
    const previos = registros(antes);
    const actuales = registros(despues);
    const base = {
      direccion: despues.direccion, unidad: despues.unidad, tipoControl: despues.codigo,
      mes: despues.mes, anio: despues.anio, moduloOrigen: MODULO_CONTROLES
    };
    /** Un registro se identifica por fecha + hora de entrada + nombre. */
    const clave = (x: RespuestaIngreso) => `${x.fecha}|${x.horaEntrada}|${x.nombre}`;
    const resumen = (x: RespuestaIngreso) =>
      `${x.fecha || 'sin fecha'} ${x.horaEntrada || '--:--'}–${x.horaSalida || '--:--'} · ${x.nombre || 'sin nombre'} (${x.cargo || 'sin cargo'}) · ${x.motivo || 'sin motivo'} · ${x.tipoIngreso || 'sin tipo de ingreso'}`;

    const clavesPrevias = new Set(previos.map(clave));
    const clavesActuales = new Set(actuales.map(clave));
    for (const reg of actuales) {
      if (clavesPrevias.has(clave(reg))) continue;
      // El alta se nombra por su tipo: quién entró solo y quién entró acompañando a alguien.
      this.registrarEvento(u, {
        ...base, tipoIngreso: reg.tipoIngreso,
        accion: this.conAcompanante(reg)
          ? 'Registro de ingreso con acompañante agregado'
          : 'Registro de ingreso individual agregado',
        observacion: this.conAcompanante(reg)
          ? `Ingreso al cuarto de servidores acompañado por ${reg.acompanante || 'sin nombre'} (${reg.tipoPersonalAcompanante || 'sin clasificar'}, ${reg.cargoAcompanante || 'sin cargo'}): ${resumen(reg)}.`
          : `Ingreso al cuarto de servidores del Técnico de Soporte, sin acompañante: ${resumen(reg)}.`
      });
    }
    for (const reg of previos) {
      if (clavesActuales.has(clave(reg))) continue;
      this.registrarEvento(u, {
        ...base, tipoIngreso: reg.tipoIngreso, accion: 'Registro de ingreso eliminado',
        observacion: `Salió de la bitácora del mes: ${resumen(reg)}.`
      });
    }
    // Mismo registro con datos distintos: es una edición.
    for (const reg of actuales) {
      const previo = previos.find((x) => clave(x) === clave(reg));
      if (!previo || JSON.stringify(previo) === JSON.stringify(reg)) continue;
      this.registrarEvento(u, {
        ...base, tipoIngreso: reg.tipoIngreso, accion: 'Registro de ingreso editado',
        estadoAnterior: previo.tipoIngreso === reg.tipoIngreso ? resumen(previo) : `${previo.tipoIngreso} · ${resumen(previo)}`,
        estadoNuevo: previo.tipoIngreso === reg.tipoIngreso ? resumen(reg) : `${reg.tipoIngreso} · ${resumen(reg)}`,
        observacion: `Se corrigieron datos del ingreso de ${reg.nombre || 'sin nombre'}.`
      });
    }
    // El documento de respaldo deja dos huellas distintas: cuándo se declaró y cuándo se cargó.
    for (const reg of actuales) {
      const previo = previos.find((x) => clave(x) === clave(reg));
      if (this.anexaRespaldo(reg) && !(previo && this.anexaRespaldo(previo))) {
        this.registrarEvento(u, {
          ...base, tipoIngreso: reg.tipoIngreso, accion: 'Documento de respaldo marcado',
          estadoAnterior: previo ? previo.anexaDocumento || 'Sin declarar' : 'Sin declarar',
          estadoNuevo: 'Anexa documento de respaldo',
          observacion: `El ingreso de ${reg.nombre || 'sin nombre'} declaró documento de respaldo; la imagen es obligatoria para entregar el control.`
        });
      }
      const imagenNueva = reg.documentoImagen.trim() && reg.documentoImagen !== (previo?.documentoImagen ?? '');
      if (imagenNueva) {
        this.registrarEvento(u, {
          ...base, tipoIngreso: reg.tipoIngreso, accion: 'Documento de respaldo cargado',
          estadoNuevo: this.formatoRespaldoValido(reg.documentoNombre) ? 'Imagen válida' : 'Formato no admitido',
          observacion: `${reg.documentoNombre || 'imagen sin nombre'} adjunta al ingreso de ${reg.nombre || 'sin nombre'} del ${reg.fecha || 'sin fecha'}.`
        });
      }
    }
    // Declarar el mes sin ingresos también queda registrado.
    const sinAntes = this.mesSinIngresos(antes);
    const sinDespues = this.mesSinIngresos(despues);
    if (sinAntes !== sinDespues) {
      this.registrarEvento(u, {
        ...base, accion: sinDespues ? 'Mes sin ingresos marcado' : 'Mes sin ingresos desmarcado',
        estadoAnterior: sinAntes ? 'Mes sin ingresos' : 'Con ingresos registrados',
        estadoNuevo: sinDespues ? 'Mes sin ingresos' : 'Con ingresos registrados',
        observacion: sinDespues
          ? `Se declaró que en ${nombreMes(despues.mes)} ${despues.anio} no hubo ingresos al cuarto de servidores de ${this.dirUnidad(despues.direccion, despues.unidad)}; debe sustentarse en las observaciones.`
          : 'Se retiró la declaración de mes sin ingresos: el control vuelve a exigir registros.'
      });
    }
  }

  /** Diferencia la muestra de equipos entre dos versiones del control y deja sus eventos. */
  private trazarMuestra(antes: ControlMes, despues: ControlMes, u: UsuarioSistema | null): void {
    const p = this.checklistDe(despues.codigo)!;
    const muestra = (c: ControlMes) =>
      (c.secciones.find((x) => x.titulo === p.titulo)?.checklistEquipos ?? []).filter((e) => e.inventario.trim());
    const previa = muestra(antes);
    const actual = muestra(despues);
    const base = {
      direccion: despues.direccion, unidad: despues.unidad, tipoControl: despues.codigo,
      mes: despues.mes, anio: despues.anio, moduloOrigen: MODULO_CONTROLES
    };
    /** Datos del equipo para la traza; salen del inventario operativo, no del formulario. */
    const datos = (inventario: string) => {
      const eq = this.equipoDe(inventario);
      return {
        inventario,
        equipo: eq ? `${eq.nombreEquipo || eq.tipo} · ${eq.marca} ${eq.modelo}` : 'Equipo no registrado en inventario operativo',
        usuarioFinal: eq?.usuarioFinal ?? '',
        expedienteUnico: eq?.expedienteUnico ?? ''
      };
    };

    for (const eq of actual) {
      if (previa.some((x) => x.inventario === eq.inventario)) continue;
      this.registrarEvento(u, {
        ...base, ...datos(eq.inventario), accion: 'Equipo seleccionado desde inventario',
        observacion: `El equipo se incorporó a la muestra del ${despues.codigo} de ${nombreMes(despues.mes)} ${despues.anio} como ${eq.clasificacion || 'equipo sin clasificar'}.`
      });
    }
    for (const eq of previa) {
      if (actual.some((x) => x.inventario === eq.inventario)) continue;
      this.registrarEvento(u, {
        ...base, ...datos(eq.inventario), accion: 'Equipo removido del control',
        observacion: `El equipo salió de la muestra del ${despues.codigo} de ${nombreMes(despues.mes)} ${despues.anio}.`
      });
    }
    for (const eq of actual) {
      const antesEq = previa.find((x) => x.inventario === eq.inventario);
      const verificados = this.itemsVerificados(p, eq);
      const verificadosAntes = antesEq ? this.itemsVerificados(p, antesEq) : 0;
      const aplicables = this.itemsDeClasificacion(p, eq.clasificacion).length;
      if (verificados > verificadosAntes && verificados === aplicables) {
        this.registrarEvento(u, {
          ...base, ...datos(eq.inventario), accion: 'Ítems de seguridad verificados',
          estadoAnterior: antesEq ? this.estadoFinalEquipo(p, antesEq) : 'Pendiente',
          estadoNuevo: this.estadoFinalEquipo(p, eq),
          observacion: `${verificados} de ${aplicables} ítems verificados; ${this.itemsIncumplidos(eq).length} incumplimiento(s).`
        });
      }
      for (const item of this.itemsIncumplidos(eq)) {
        const previo = antesEq?.items.find((x) => x.id === item.id);
        if (previo?.cumplimiento !== 'No cumple') {
          this.registrarEvento(u, {
            ...base, ...datos(eq.inventario), accion: 'Incumplimiento registrado',
            observacion: `${this.nombreItemSeguridad(p, item.id)}: ${item.descripcion || 'sin descripción'}.`
          });
        }
        if (item.accionCorrectiva.trim() && previo?.accionCorrectiva.trim() !== item.accionCorrectiva.trim()) {
          this.registrarEvento(u, {
            ...base, ...datos(eq.inventario), accion: 'Acción correctiva registrada',
            estadoNuevo: item.estadoItem,
            observacion: `${this.nombreItemSeguridad(p, item.id)}: ${item.accionCorrectiva}${item.fechaAccion ? ` (fecha ${item.fechaAccion})` : ''}.`
          });
        }
      }
    }
  }

  /** Nombre del ítem de seguridad dentro de la plantilla de la muestra. */
  nombreItemSeguridad(p: SeccionPlantilla, id: string): string {
    return p.checklistEquipos?.items.find((i) => i.id === id)?.nombre ?? id;
  }

  // ------------------------------------------------------------------ controles semanales consolidados

  /**
   * ¿El control se trabaja semana a semana pero se entrega en **un solo documento mensual**?
   * Es el caso del F0387: cuatro o cinco verificaciones semanales, una sola hoja al cierre.
   */
  esSemanalConsolidado(codigo: string): boolean {
    return this.catalogoDe(codigo)?.frecuencia === 'Semanal con entrega mensual consolidada';
  }

  /**
   * Cómo se rotula la frecuencia en las tablas: los consolidados se leen como «Semanal» con la
   * nota de que la entrega es mensual, para que la columna no arrastre una etiqueta larguísima.
   */
  etiquetaFrecuencia(codigo: string): string {
    return this.esSemanalConsolidado(codigo) ? 'Semanal' : this.catalogoDe(codigo)?.frecuencia ?? '';
  }

  /** Nota de entrega del control: '' cuando la entrega coincide con la frecuencia. */
  etiquetaEntrega(codigo: string): string {
    return this.esSemanalConsolidado(codigo) ? 'Entrega mensual consolidada' : '';
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
        || (r.equipos?.some((x) => x.incluido && x.estado) ?? false)
        || (r.equiposIp?.some((x) => x.ip.trim() || x.hora.trim()) ?? false)
        || (r.telefonos?.some((x) => x.numero.trim() || x.hora.trim()) ?? false)
        || (r.checklistEquipos?.some((x) => x.inventario.trim()) ?? false)
        || (r.ingresos?.some((x) => !this.ingresoVacio(x)) ?? false);
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
        // Un equipo solo puede registrarse si pertenece a la Dirección/Registro del control.
        const ajenos = revisados.filter((e) => !activos.some((a) => a.inventario === e.inventario));
        if (ajenos.length) {
          faltas.push(`${p.titulo}: ${ajenos.map((e) => e.inventario).join(', ')} no pertenece(n) a la Dirección/Registro del control.`);
        }
        const sinEstado = revisados.filter((e) => !e.estado);
        if (sinEstado.length) faltas.push(`${p.titulo}: ${sinEstado.length} equipo(s) seleccionado(s) sin estado registrado.`);
        if (p.equipos.minimo === 0) {
          const faltantes = activos.filter((a) => !revisados.some((e) => e.inventario === a.inventario));
          if (faltantes.length) faltas.push(`${p.titulo}: faltan por revisar ${faltantes.length} equipo(s) activo(s) de la Dirección/Registro.`);
        } else if (revisados.length < p.equipos.minimo) {
          faltas.push(`${p.titulo}: se requiere revisar al menos ${p.equipos.minimo} equipo(s) del inventario operativo.`);
        }
      }
      if (p.equiposIp && !semanaNoAplica) faltas.push(...this.faltasEquiposIp(p, r, c));
      if (p.telefonos && !semanaNoAplica) faltas.push(...this.faltasTelefonos(p, r));
      if (p.checklistEquipos) faltas.push(...this.faltasChecklistEquipos(p, r, c));
      if (p.ingresos) faltas.push(...this.faltasIngresos(p, r, c));
    }
    if (cat?.requiereEvidencia && !c.evidencias.length) faltas.push('Este control requiere al menos una evidencia.');
    // Los controles con muestra de equipos cierran la lista con la regla que los gobierna.
    if (faltas.length && this.checklistDe(c.codigo)) {
      faltas.push(`No puede entregar el control ${c.codigo} con campos pendientes.`);
    }
    return faltas;
  }

  /**
   * Reglas de los equipos verificados por IP (F0387): deben ser tantos como pida la plantilla,
   * distintos entre sí, existir como equipos ACTIVOS del inventario operativo, pertenecer a la
   * Dirección/Registro del control y llevar hora de verificación.
   */
  private faltasEquiposIp(p: SeccionPlantilla, r: RespuestaSeccion | undefined, c: ControlMes): string[] {
    const faltas: string[] = [];
    const pedidos = p.equiposIp!.cantidad;
    const filas = (r?.equiposIp ?? []).slice(0, pedidos);
    const conIp = filas.filter((e) => e.ip.trim());
    if (conIp.length < pedidos) {
      faltas.push(`${p.titulo}: debe registrar ${pedidos} equipos distintos para completar la verificación semanal.`);
    }
    const vistas = new Set<string>();
    for (const [i, e] of filas.entries()) {
      const ip = e.ip.trim();
      if (!ip) continue;
      if (vistas.has(ip)) {
        faltas.push(`${p.titulo}: la IP ${ip} se repite; deben registrarse ${pedidos} equipos distintos.`);
        continue;
      }
      vistas.add(ip);
      const { error } = this.buscarEquipoIp(ip, c.direccion, c.unidad);
      if (error) faltas.push(`${p.titulo} · equipo ${i + 1} (${ip}): ${error}`);
      if (!e.hora.trim()) {
        faltas.push(`${p.titulo}: debe seleccionar la hora de verificación para cada equipo.`);
      }
    }
    return faltas;
  }

  // ---------------------------------------------------------------- ingresos al CSOD (F0234)

  /** Mensajes de la bitácora de ingresos; se reutilizan en el formulario y en la entrega. */
  readonly MSG_SALIDA_ANTES = 'La hora de salida no puede ser menor que la hora de entrada.';
  readonly MSG_SIN_INGRESOS =
    'Debe ingresar una observación indicando que no se registraron ingresos durante el mes.';
  readonly MSG_TIPO_INGRESO = 'Debe seleccionar el tipo de ingreso.';
  readonly MSG_TECNICO = 'Debe ingresar el nombre del Técnico de Soporte que ingresa.';
  readonly MSG_ACOMPANANTE = 'Debe ingresar el nombre del acompañante.';
  readonly MSG_TIPO_ACOMPANANTE = 'Debe seleccionar el tipo de personal del acompañante.';
  readonly MSG_CARGO_ACOMPANANTE = 'Debe ingresar el cargo o institución del acompañante.';

  /** El ingreso que hace el técnico solo, sin visita que acompañar. */
  readonly INGRESO_INDIVIDUAL = 'Individual';
  readonly INGRESO_ACOMPANADO = 'Con acompañante';

  /** ¿El registro declaró que la visita entró acompañada? */
  conAcompanante(reg: RespuestaIngreso): boolean {
    return reg.tipoIngreso === this.INGRESO_ACOMPANADO;
  }
  readonly MSG_RESPALDO_IMAGEN = 'Debe adjuntar la imagen del documento de respaldo.';
  readonly MSG_RESPALDO_FORMATO =
    'El documento de respaldo debe ser una imagen en formato PNG, JPG, JPEG o WEBP.';
  readonly MSG_RESPALDO_INDICADO = 'Debe adjuntar el documento de respaldo indicado.';
  readonly MSG_REGISTROS_INCOMPLETOS =
    'Complete o elimine los registros incompletos antes de entregar el control.';

  /** El respaldo del formato es un documento fotografiado o escaneado: solo imágenes. */
  readonly FORMATOS_RESPALDO = ['png', 'jpg', 'jpeg', 'webp'];

  /** ¿El archivo del respaldo es una de las imágenes admitidas? */
  formatoRespaldoValido(nombre: string): boolean {
    return this.FORMATOS_RESPALDO.includes((nombre.split('.').pop() ?? '').trim().toLowerCase());
  }

  /** ¿El registro declaró que anexa documento de respaldo? */
  anexaRespaldo(reg: RespuestaIngreso): boolean {
    return reg.anexaDocumento === 'Sí';
  }

  /**
   * Un registro con todos sus campos presentes. Los controles guardados en el navegador antes de
   * que el formato pidiera clasificar al acompañante y anexar el respaldo no traen esos campos:
   * se completan al leerlos para que las validaciones no tropiecen con un `undefined`.
   *
   * El tipo de ingreso se deduce de los registros anteriores a esta versión —si tenían
   * acompañante, era un ingreso acompañado— pero solo cuando falta del todo: un borrador nuevo
   * llega con el tipo en blanco a propósito, para que el técnico lo elija.
   */
  normalizaIngreso(reg: Partial<RespuestaIngreso>): RespuestaIngreso {
    return {
      tipoIngreso: reg.tipoIngreso
        ?? ((reg.acompanante ?? '').trim() ? this.INGRESO_ACOMPANADO : this.INGRESO_INDIVIDUAL),
      fecha: reg.fecha ?? '', horaEntrada: reg.horaEntrada ?? '', horaSalida: reg.horaSalida ?? '',
      carne: reg.carne ?? '', nombre: reg.nombre ?? '', cargo: reg.cargo ?? '',
      tipoPersonal: reg.tipoPersonal ?? '', acompanante: reg.acompanante ?? '',
      carneAcompanante: reg.carneAcompanante ?? '', tipoPersonalAcompanante: reg.tipoPersonalAcompanante ?? '',
      cargoAcompanante: reg.cargoAcompanante ?? '',
      anexaDocumento: reg.anexaDocumento ?? 'No', documentoNombre: reg.documentoNombre ?? '',
      documentoImagen: reg.documentoImagen ?? '', motivo: reg.motivo ?? '', observacion: reg.observacion ?? ''
    };
  }

  /** Registros no vacíos de la bitácora, ya normalizados. */
  private registrosDe(c: ControlMes, p: SeccionPlantilla): RespuestaIngreso[] {
    return (c.secciones.find((s) => s.titulo === p.titulo)?.ingresos ?? [])
      .map((x) => this.normalizaIngreso(x))
      .filter((x) => !this.ingresoVacio(x));
  }

  /**
   * Cómo se reparten los ingresos del mes entre individuales y acompañados. Los eventos de la
   * bitácora que hablan del control entero —y no de un registro— guardan este reparto como su
   * «tipo de ingreso»: es la única respuesta honesta cuando el mes tiene de los dos.
   */
  private repartoIngresos(registros: RespuestaIngreso[]): string {
    const acompanados = registros.filter((x) => this.conAcompanante(x)).length;
    return `Individual: ${registros.length - acompanados} · Con acompañante: ${acompanados}`;
  }

  /** Sección de registros de ingreso del control, si la tiene (F0234). */
  ingresosDe(codigo: string): SeccionPlantilla | undefined {
    return this.catalogoDe(codigo)?.plantilla.find((p) => !!p.ingresos);
  }

  /** ¿El técnico declaró que el mes no tuvo ingresos? */
  mesSinIngresos(c: ControlMes): boolean {
    const p = this.ingresosDe(c.codigo);
    if (!p) return false;
    const r = c.secciones.find((s) => s.titulo === p.titulo);
    return (r?.campos?.find((x) => x.id === 'sin-ingresos')?.valor ?? '') === 'Sí';
  }

  /**
   * Qué le falta a un registro de ingreso para estar completo. Devuelve la lista de campos
   * faltantes, con el mensaje exacto de cada regla; vacía = el registro está bien.
   */
  faltasIngreso(crudo: RespuestaIngreso): string[] {
    const reg = this.normalizaIngreso(crudo);
    const faltas: string[] = [];
    if (!reg.fecha.trim()) faltas.push('Debe ingresar la fecha del registro.');
    if (!reg.horaEntrada.trim()) faltas.push('Debe ingresar la hora de entrada.');
    if (!reg.horaSalida.trim()) faltas.push('Debe ingresar la hora de salida.');
    if (reg.horaEntrada.trim() && reg.horaSalida.trim() && reg.horaSalida < reg.horaEntrada) {
      faltas.push(this.MSG_SALIDA_ANTES);
    }
    if (!reg.nombre.trim()) faltas.push(this.MSG_TECNICO);
    if (!reg.motivo.trim()) faltas.push('Debe ingresar el motivo del ingreso.');
    // El tipo de ingreso decide qué más se pide: lo que no se muestra, no se exige.
    if (!reg.tipoIngreso.trim()) faltas.push(this.MSG_TIPO_INGRESO);
    if (this.conAcompanante(reg)) {
      if (!reg.acompanante.trim()) faltas.push(this.MSG_ACOMPANANTE);
      if (!reg.tipoPersonalAcompanante.trim()) faltas.push(this.MSG_TIPO_ACOMPANANTE);
      if (!reg.cargoAcompanante.trim()) faltas.push(this.MSG_CARGO_ACOMPANANTE);
    }
    // El respaldo solo se exige si el propio registro dijo que lo anexa.
    if (this.anexaRespaldo(reg)) {
      if (!reg.documentoNombre.trim() || !reg.documentoImagen.trim()) faltas.push(this.MSG_RESPALDO_IMAGEN);
      else if (!this.formatoRespaldoValido(reg.documentoNombre)) faltas.push(this.MSG_RESPALDO_FORMATO);
    }
    return faltas;
  }

  /** ¿El registro tiene algo escrito? Un registro en blanco no cuenta como incompleto. */
  ingresoVacio(crudo: RespuestaIngreso): boolean {
    const reg = this.normalizaIngreso(crudo);
    return ![reg.fecha, reg.horaEntrada, reg.horaSalida, reg.carne, reg.nombre, reg.cargo,
      reg.tipoPersonal, reg.acompanante, reg.carneAcompanante, reg.tipoPersonalAcompanante,
      reg.cargoAcompanante, reg.motivo, reg.observacion, reg.documentoNombre]
      .some((v) => (v ?? '').trim()) && reg.anexaDocumento !== 'Sí';
  }

  /**
   * Reglas de la bitácora de ingresos del F0234: o el mes tuvo ingresos —y entonces cada registro
   * debe estar completo y coherente— o se declara que no los tuvo y se sustenta por escrito.
   */
  private faltasIngresos(p: SeccionPlantilla, r: RespuestaSeccion | undefined, c: ControlMes): string[] {
    const faltas: string[] = [];
    const registros = (r?.ingresos ?? []).filter((x) => !this.ingresoVacio(x));
    const sinIngresos = (r?.campos?.find((x) => x.id === 'sin-ingresos')?.valor ?? '') === 'Sí';

    if (sinIngresos) {
      if (registros.length) {
        faltas.push(`${p.titulo}: declaró que el mes no tuvo ingresos, pero hay ${registros.length} registro(s). Elimínelos o cambie la declaración.`);
      }
      // La observación del mes sustenta el mes sin ingresos.
      const obs = c.secciones
        .flatMap((s) => s.campos ?? [])
        .find((x) => x.id === 'obs')?.valor ?? '';
      if (!obs.trim()) faltas.push(this.MSG_SIN_INGRESOS);
      return faltas;
    }

    if (!registros.length) {
      faltas.push(`${p.titulo}: registre los ingresos del mes o declare que no hubo ingresos durante el mes.`);
      return faltas;
    }
    for (const [i, reg] of registros.entries()) {
      const propias = this.faltasIngreso(reg);
      for (const f of propias) faltas.push(`${p.titulo} · registro ${i + 1}: ${f}`);
    }
    // El respaldo marcado y no cargado se nombra aparte: es el error que más se escapa.
    if (registros.some((x) => this.anexaRespaldo(x) && !x.documentoImagen.trim())) {
      faltas.push(this.MSG_RESPALDO_INDICADO);
    }
    if (registros.some((x) => this.faltasIngreso(x).length)) {
      faltas.push(this.MSG_REGISTROS_INCOMPLETOS);
    }
    return faltas;
  }

  // ---------------------------------------------------------------- muestra de equipos (F0382)

  /** Mensajes de la verificación por muestra; se reutilizan en el formulario y en la entrega. */
  readonly MSG_EQUIPO_REPETIDO = 'Este equipo ya fue seleccionado.';
  readonly MSG_EQUIPO_AJENO = 'Este equipo no pertenece a la Dirección/Registro del control.';
  readonly MSG_EQUIPO_INACTIVO = 'Este equipo no se encuentra activo en el inventario operativo.';

  /** Sección de muestra del control, si la tiene (F0382). */
  checklistDe(codigo: string): SeccionPlantilla | undefined {
    return this.catalogoDe(codigo)?.plantilla.find((p) => !!p.checklistEquipos);
  }

  /**
   * Equipos que el técnico puede elegir para la muestra: los ACTIVOS de la Dirección/Registro del
   * control, filtrados por el texto del buscador (inventario, nombre, usuario, IP, tipo, marca,
   * modelo o unidad). Nunca aparecen equipos de otra Dirección/Registro ni descargados.
   */
  equiposParaMuestra(c: ControlMes, texto = ''): EquipoOperativo[] {
    const q = texto.trim().toLowerCase();
    const activos = this.equiposDeControl(c);
    if (!q) return activos;
    return activos.filter((e) => [e.inventario, e.nombreEquipo, e.usuarioFinal, e.ip ?? '', e.tipo,
      e.marca, e.modelo, e.unidad, e.serie].join(' ').toLowerCase().includes(q));
  }

  /** ¿Ese equipo puede entrar en la muestra del control? Devuelve el motivo del rechazo o ''. */
  bloqueoEquipoMuestra(c: ControlMes, inventario: string, yaElegidos: string[]): string {
    if (yaElegidos.includes(inventario)) return this.MSG_EQUIPO_REPETIDO;
    if (this.equiposDeControl(c).some((e) => e.inventario === inventario)) return '';
    // El equipo existe pero no está activo aquí: se distingue de «no es de esta Dirección/Registro».
    const ficha = this.equipoDe(inventario);
    if (ficha && ficha.direccion === c.direccion && ficha.unidad === c.unidad) return this.MSG_EQUIPO_INACTIVO;
    return this.MSG_EQUIPO_AJENO;
  }

  /** Ítems del checklist que aplican a un equipo según su clasificación en el formato. */
  itemsDeClasificacion(p: SeccionPlantilla, clasificacion: string): ItemSeguridad[] {
    const items = p.checklistEquipos?.items ?? [];
    const ambos = p.checklistEquipos?.clasificaciones[2] ?? 'Ambos equipos';
    if (!clasificacion || clasificacion === ambos) return items;
    return items.filter((i) => i.grupo === clasificacion || i.grupo === ambos);
  }

  /** Ítems del equipo marcados como «No cumple». */
  itemsIncumplidos(eq: RespuestaEquipoChecklist): RespuestaItemSeguridad[] {
    return eq.items.filter((i) => i.cumplimiento === 'No cumple');
  }

  /** Cuántos ítems aplicables del equipo ya tienen respuesta. */
  itemsVerificados(p: SeccionPlantilla, eq: RespuestaEquipoChecklist): number {
    const aplicables = this.itemsDeClasificacion(p, eq.clasificacion).map((i) => i.id);
    return eq.items.filter((i) => aplicables.includes(i.id) && i.cumplimiento).length;
  }

  /**
   * Estado final del equipo, la columna «Completado / Pendiente» del formato: se deriva de los
   * ítems, no se teclea. Queda «Pendiente» mientras falte responder algo o quede un incumplimiento
   * sin corregir.
   */
  estadoFinalEquipo(p: SeccionPlantilla, eq: RespuestaEquipoChecklist): string {
    const aplicables = this.itemsDeClasificacion(p, eq.clasificacion);
    if (!eq.inventario || this.itemsVerificados(p, eq) < aplicables.length) return 'Pendiente';
    return this.itemsIncumplidos(eq).every((i) => i.estadoItem === 'Corregido') ? 'Completado' : 'Pendiente';
  }

  /**
   * Reglas de la muestra del F0382: cantidad exacta de equipos, sin repetir, todos activos y de la
   * Dirección/Registro del control, con sus ítems respondidos; los incumplimientos exigen
   * descripción, acción correctiva y estado, y los «No aplica», justificación.
   */
  private faltasChecklistEquipos(p: SeccionPlantilla, r: RespuestaSeccion | undefined, c: ControlMes): string[] {
    const faltas: string[] = [];
    const pedidos = p.checklistEquipos!.cantidad;
    const filas = (r?.checklistEquipos ?? []).slice(0, pedidos);
    const elegidos = filas.filter((e) => e.inventario.trim());
    if (elegidos.length < pedidos) {
      faltas.push(`Debe seleccionar ${pedidos} equipos activos del inventario operativo.`);
    }
    const vistos = new Set<string>();
    const activos = this.equiposDeControl(c);
    let incompletos = 0;
    for (const eq of elegidos) {
      const etiqueta = `${p.titulo} · equipo ${eq.inventario}`;
      if (vistos.has(eq.inventario)) { faltas.push(`${etiqueta}: ${this.MSG_EQUIPO_REPETIDO}`); continue; }
      vistos.add(eq.inventario);
      const bloqueo = this.bloqueoEquipoMuestra(c, eq.inventario, []);
      if (bloqueo) { faltas.push(`${etiqueta}: ${bloqueo}`); continue; }
      if (!eq.clasificacion) faltas.push(`${etiqueta}: indique si es equipo de usuario interno o de consulta al público.`);
      const aplicables = this.itemsDeClasificacion(p, eq.clasificacion);
      if (this.itemsVerificados(p, eq) < aplicables.length) { incompletos++; continue; }
      for (const item of aplicables) {
        const resp = eq.items.find((x) => x.id === item.id);
        if (!resp) continue;
        const corto = item.nombre.split(' — ')[0];
        if (resp.cumplimiento === 'No cumple') {
          if (!resp.descripcion.trim()) faltas.push(`${etiqueta}: describa el incumplimiento del ${corto}.`);
          if (!resp.accionCorrectiva.trim()) {
            faltas.push(`Debe registrar acción correctiva para los ítems incumplidos (${etiqueta} · ${corto}).`);
          }
          if (!resp.estadoItem.trim()) faltas.push(`${etiqueta}: indique el estado final del ${corto}.`);
        }
        if (resp.cumplimiento === 'No aplica' && !resp.justificacion.trim()) {
          faltas.push(`Debe justificar los ítems marcados como No aplica (${etiqueta} · ${corto}).`);
        }
      }
    }
    if (incompletos) {
      faltas.push(`Debe completar la verificación de todos los ítems para los ${pedidos} equipos seleccionados (${incompletos} sin terminar).`);
    }
    // Un control con hallazgos no puede quedarse sin observaciones generales: es donde el
    // Encargado lee qué pasó con los equipos de la muestra.
    const malos = elegidos.reduce((n, e) => n + this.itemsIncumplidos(e).length, 0);
    const noAplica = elegidos.reduce((n, e) => n + e.items.filter((i) => i.cumplimiento === 'No aplica').length, 0);
    if (malos || noAplica) {
      const obs = c.secciones.flatMap((s) => s.campos ?? []).find((x) => x.id === 'obs')?.valor ?? '';
      if (!obs.trim()) {
        faltas.push(`Debe completar las observaciones generales: la verificación registró ${malos} ítem(s) incumplido(s) y ${noAplica} marcado(s) como No aplica.`);
      }
    }
    return faltas;
  }

  /**
   * Cuentas de la muestra para el paso de resumen del F0382: cuántos equipos hay, cuántos quedaron
   * verificados de punta a punta, cómo se repartieron los ítems y si el control está listo.
   * No valida nada por su cuenta: la lista de faltas es la misma de la entrega.
   */
  resumenMuestra(c: ControlMes): ResumenMuestra | null {
    const p = this.checklistDe(c.codigo);
    if (!p) return null;
    const r = c.secciones.find((s) => s.titulo === p.titulo);
    const pedidos = p.checklistEquipos!.cantidad;
    const elegidos = (r?.checklistEquipos ?? []).slice(0, pedidos).filter((e) => e.inventario.trim());
    const items = elegidos.flatMap((e) => {
      const aplicables = this.itemsDeClasificacion(p, e.clasificacion).map((i) => i.id);
      return e.items.filter((i) => aplicables.includes(i.id));
    });
    const obs = c.secciones.flatMap((s) => s.campos ?? []).find((x) => x.id === 'obs')?.valor ?? '';
    // Las faltas que se enumeran son las de la muestra; «listo» mira el control entero, porque
    // un F0382 con la muestra impecable tampoco se entrega sin evidencia ni observaciones.
    const faltas = this.faltasChecklistEquipos(p, r, c);
    return {
      pedidos,
      seleccionados: elegidos.length,
      verificados: elegidos.filter((e) => this.itemsVerificados(p, e) === this.itemsDeClasificacion(p, e.clasificacion).length).length,
      itemsCumplidos: items.filter((i) => i.cumplimiento === 'Cumple').length,
      itemsIncumplidos: items.filter((i) => i.cumplimiento === 'No cumple').length,
      itemsNoAplica: items.filter((i) => i.cumplimiento === 'No aplica').length,
      accionesCorrectivas: items.filter((i) => i.cumplimiento === 'No cumple' && i.accionCorrectiva.trim()).length,
      justificaciones: items.filter((i) => i.cumplimiento === 'No aplica' && i.justificacion.trim()).length,
      observaciones: !!obs.trim(),
      listo: !this.validarEntrega(c).length,
      faltas
    };
  }

  /** Reglas de los teléfonos/extensiones verificados (F0387): número, resultado y hora de cada uno. */
  private faltasTelefonos(p: SeccionPlantilla, r: RespuestaSeccion | undefined): string[] {
    const faltas: string[] = [];
    const pedidos = p.telefonos!.cantidad;
    const filas = (r?.telefonos ?? []).slice(0, pedidos);
    const conNumero = filas.filter((t) => t.numero.trim());
    if (conNumero.length < pedidos) {
      faltas.push(`${p.titulo}: debe ingresar ${pedidos} teléfonos o extensiones.`);
    }
    if (conNumero.some((t) => !t.hora.trim())) {
      faltas.push(`${p.titulo}: debe seleccionar la hora de verificación para cada teléfono o extensión.`);
    }
    if (conNumero.some((t) => !t.resultado.trim())) {
      faltas.push(`${p.titulo}: debe registrar el resultado de verificación de cada teléfono o extensión.`);
    }
    return faltas;
  }

  /** Entrega el control: estado según el plazo, documento formal y trazabilidad. */
  entregarControl(id: string, u: UsuarioSistema): { ok: boolean; faltas: string[]; estado?: EstadoControl } {
    const c = this.controlPorId(id);
    if (!c) return { ok: false, faltas: ['El control no existe.'] };
    if (!this.atiende(u, c.direccion, c.unidad)) return { ok: false, faltas: [this.MSG_FUERA_DE_DISTRIBUCION] };
    const faltas = this.validarEntrega(c);
    if (faltas.length) {
      this.trazarEntregaRechazada(c, faltas, u);
      return { ok: false, faltas };
    }
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
    // Los controles con reglas propias cierran su ciclo con una constancia legible en el historial.
    this.trazarCierreCorrecto(c, doc, u);
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

  /**
   * Deja constancia del intento de entrega que el sistema rechazó. Sin esto, el técnico corrige y
   * nadie sabe nunca que el control estuvo incompleto: la trazabilidad guardaría solo el final feliz.
   */
  private trazarEntregaRechazada(c: ControlMes, faltas: string[], u: UsuarioSistema | null): void {
    const base = {
      direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
      moduloOrigen: MODULO_CONTROLES, estadoAnterior: c.estado, estadoNuevo: c.estado
    };
    const pIngresos = this.ingresosDe(c.codigo);
    this.registrarEvento(u, {
      ...base, accion: 'Intento de entrega con campos pendientes',
      tipoIngreso: pIngresos ? this.repartoIngresos(this.registrosDe(c, pIngresos)) : undefined,
      observacion: `${c.codigo} de ${nombreMes(c.mes)} ${c.anio}: la entrega se rechazó por ${faltas.length} punto(s) pendiente(s). ${faltas.slice(0, 3).join(' ')}`
    });
    // Detalle por control: qué quedó a medias, no solo cuántos avisos salieron.
    const pChk = this.checklistDe(c.codigo);
    if (pChk) {
      const r = c.secciones.find((s) => s.titulo === pChk.titulo);
      const elegidos = (r?.checklistEquipos ?? []).filter((e) => e.inventario.trim());
      const pendientes = elegidos.filter((e) => this.itemsVerificados(pChk, e) < this.itemsDeClasificacion(pChk, e.clasificacion).length);
      if (pendientes.length || elegidos.length < pChk.checklistEquipos!.cantidad) {
        this.registrarEvento(u, {
          ...base, accion: 'Ítem incompleto detectado',
          observacion: `${elegidos.length} de ${pChk.checklistEquipos!.cantidad} equipos seleccionados; ${pendientes.length} con ítems sin responder${pendientes.length ? `: ${pendientes.map((e) => e.inventario).join(', ')}` : ''}.`
        });
      }
    }
    const pIng = this.ingresosDe(c.codigo);
    if (pIng) {
      const registros = this.registrosDe(c, pIng);
      const malos = registros.filter((x) => this.faltasIngreso(x).length);
      if (malos.length) {
        this.registrarEvento(u, {
          ...base, tipoIngreso: this.repartoIngresos(registros),
          accion: 'Registro de ingreso incompleto detectado',
          observacion: `${malos.length} de ${registros.length} registro(s) de ingreso sin completar: ${malos.map((x) => x.nombre || 'sin nombre').join(', ')}.`
        });
      }
    }
  }

  /** Constancia de cierre de los controles con reglas propias (bitácora de ingresos y muestra). */
  private trazarCierreCorrecto(c: ControlMes, doc: string, u: UsuarioSistema | null): void {
    const base = {
      direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
      moduloOrigen: MODULO_CONTROLES, documento: doc
    };
    const pIng = this.ingresosDe(c.codigo);
    if (pIng) {
      const registros = this.registrosDe(c, pIng);
      const reparto = this.repartoIngresos(registros);
      this.registrarEvento(u, {
        ...base, accion: `${c.codigo} finalizado correctamente`,
        estadoNuevo: 'Sin campos pendientes', tipoIngreso: reparto,
        observacion: this.mesSinIngresos(c)
          ? `${nombreMes(c.mes)} ${c.anio} se declaró sin ingresos al cuarto de servidores y quedó sustentado en las observaciones.`
          : `${registros.length} registro(s) de ingreso completos (${reparto}), ${registros.filter((x) => this.anexaRespaldo(x)).length} con documento de respaldo anexo.`
      });
      this.registrarEvento(u, {
        ...base, accion: `Documento ${c.codigo} generado`, tipoIngreso: reparto,
        observacion: `Bitácora de ingresos de ${nombreMes(c.mes)} ${c.anio} de ${this.dirUnidad(c.direccion, c.unidad)} impresa en el formato controlado.`
      });
    }
    const pChk = this.checklistDe(c.codigo);
    if (pChk) {
      const r = c.secciones.find((s) => s.titulo === pChk.titulo);
      const elegidos = (r?.checklistEquipos ?? []).filter((e) => e.inventario.trim());
      const malos = elegidos.reduce((n, e) => n + this.itemsIncumplidos(e).length, 0);
      this.registrarEvento(u, {
        ...base, accion: `${c.codigo} finalizado correctamente`,
        estadoNuevo: 'Sin campos pendientes',
        observacion: `${elegidos.length} equipos verificados por completo; ${malos} ítem(s) incumplido(s) con su acción correctiva registrada.`
      });
    }
  }

  /** Cierra un control sin actividad mediante carta de justificación (regla: nunca queda vacío). */
  justificarControl(id: string, motivo: string, texto: string, u: UsuarioSistema): { ok: boolean; error?: string } {
    const c = this.controlPorId(id);
    if (!c) return { ok: false, error: 'El control no existe.' };
    if (!this.catalogoDe(c.codigo)?.permiteJustificacion) return { ok: false, error: 'Este control no admite justificación.' };
    if (!motivo.trim() || !texto.trim()) return { ok: false, error: 'La justificación requiere motivo y texto de la carta.' };
    if (!c.direccion || !c.unidad || !u.nombre) {
      return { ok: false, error: 'No es posible generar la carta sin mes, Dirección/Registro y responsable.' };
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
  // ------------------------------------------------------------------ sincronización automática

  /**
   * Frecuencias que el sistema programa por sí mismo cada mes. Las eventuales y las programadas
   * dependen de que ocurra algo (un traslado de cintas, un mantenimiento correctivo), así que
   * nunca se crean solas: aparecen cuando el hecho existe.
   */
  private readonly FRECUENCIAS_PROGRAMABLES: Frecuencia[] = ['Mensual', 'Semanal con entrega mensual consolidada'];

  /** Estados de un control que ya cerró su ciclo: la sincronización nunca los toca. */
  private readonly ESTADOS_HISTORICOS: EstadoControl[] = ['Entregado', 'Entregado tarde', 'Cerrado', 'Justificado'];

  /**
   * Clave estable de un control del período. No se compara por textos visibles: se arma con el
   * código del formato, el período y el par Dirección/Registro, que es el identificador que ambos
   * módulos comparten.
   */
  claveControl(codigo: string, anio: number, mes: number, direccionId: string, unidad: string): string {
    return `${codigo}|${anio}-${String(mes).padStart(2, '0')}|${direccionId}|${unidad}`;
  }

  /** Identificador estable del técnico a partir de su nombre o de su texto «Nombre — Rol». */
  idTecnico(nombreOTexto: string): string {
    const nombre = this.soportes.soloNombre(nombreOTexto) || nombreOTexto;
    return this.usuarios().find((u) => u.nombre === nombre)?.usuario ?? '';
  }

  /**
   * **Sincronización automática del período.** Es la única función que decide qué controles deben
   * existir en un mes y de quién son. Se ejecuta sola: al abrir cualquier pantalla de período, al
   * cambiar de mes o de año, al editar «Aplica a» del catálogo y al modificar la distribución de
   * soportes. Nunca hay un botón que la dispare.
   *
   * Es idempotente: si nada cambió no toca nada ni deja trazas, de modo que abrir una pantalla dos
   * veces no duplica controles ni ensucia la trazabilidad.
   *
   * Reglas:
   * · Un control que **pasa a aplicar** se crea como Pendiente y se asigna al soporte responsable.
   * · Un control que **deja de aplicar** se marca «No aplica» si sigue abierto; si ya se entregó,
   *   cerró o justificó se conserva como histórico y no se toca.
   * · El **responsable** de los controles abiertos se recalcula con la distribución vigente; los
   *   ya entregados conservan a quien los entregó.
   * · No se inventan obligaciones retroactivas: en un período cuyo plazo ya venció no se crean
   *   controles nuevos, solo se marcan los que dejaron de aplicar.
   */
  autoSyncControls(anio: number, mes: number, u: UsuarioSistema | null = null): ResumenAutoSync {
    const resumen: ResumenAutoSync = { creados: 0, noAplica: 0, reabiertos: 0, responsables: 0 };
    const hoy = isoLocal(new Date());
    const periodoAbierto = !this.plazos.periodoCerrado(anio, mes, hoy);
    const periodo = `${anio}-${String(mes).padStart(2, '0')}`;

    // Lo que el catálogo dice que debe existir este mes, por clave estable.
    const debidos = new Map<string, { codigo: string; direccion: string; unidad: string }>();
    for (const cat of this.catalogo()) {
      if (!cat.activo || !this.FRECUENCIAS_PROGRAMABLES.includes(cat.frecuencia)) continue;
      for (const par of this.paresAplicables(cat.codigo)) {
        debidos.set(this.claveControl(cat.codigo, anio, mes, par.direccion, par.unidad),
          { codigo: cat.codigo, direccion: par.direccion, unidad: par.unidad });
      }
    }

    const delPeriodo = this.controles().filter((c) => c.anio === anio && c.mes === mes);
    const existentes = new Map(delPeriodo.map((c) =>
      [this.claveControl(c.codigo, c.anio, c.mes, c.direccion, c.unidad), c]));

    // 1. Controles que ahora aplican y no existían, o que existían marcados «No aplica».
    for (const [clave, d] of debidos) {
      const previo = existentes.get(clave);
      if (previo && previo.estado !== 'No aplica') continue;
      if (previo) {
        const responsable = this.responsableDe(d.direccion, d.unidad) || previo.responsable;
        this.actualizaControl(previo.id, (c) => ({ ...c, estado: 'Pendiente', responsable }));
        this.registrarEvento(u, {
          direccion: d.direccion, unidad: d.unidad, tipoControl: d.codigo, mes, anio,
          accion: 'Control actualizado automáticamente',
          estadoAnterior: 'No aplica', estadoNuevo: 'Pendiente',
          observacion: `${d.codigo} volvió a aplicar en ${this.dirUnidad(d.direccion, d.unidad)} según la configuración vigente del catálogo; el control del período ${periodo} se reabrió como pendiente.`
        });
        resumen.reabiertos++;
        continue;
      }
      if (!periodoAbierto) continue; // no se crean obligaciones en un período ya vencido
      const nuevo: ControlMes = {
        id: this.idNuevo('CTL'), codigo: d.codigo, anio, mes,
        direccion: d.direccion, unidad: d.unidad,
        responsable: this.responsableDe(d.direccion, d.unidad),
        estado: 'Pendiente',
        fechaLimite: this.plazos.fechaLimiteMensual(anio, mes),
        avance: 0, secciones: [], evidencias: [], observaciones: ''
      };
      this.controles.update((l) => [...l, nuevo]);
      this.registrarEvento(u, {
        direccion: d.direccion, unidad: d.unidad, tipoControl: d.codigo, mes, anio,
        accion: 'Control creado automáticamente',
        estadoNuevo: 'Pendiente',
        observacion: `${d.codigo} pasó a aplicar en ${this.dirUnidad(d.direccion, d.unidad)}; se programó el control de ${nombreMes(mes)} ${anio} con fecha límite ${nuevo.fechaLimite} y responsable ${nuevo.responsable || 'sin asignar'}.`
      });
      resumen.creados++;
    }

    // 2. Controles que dejaron de aplicar.
    for (const [clave, c] of existentes) {
      if (debidos.has(clave)) continue;
      const cat = this.catalogoDe(c.codigo);
      // Los eventuales y programados no los gobierna «Aplica a»: existen porque hubo actividad.
      if (cat && !this.FRECUENCIAS_PROGRAMABLES.includes(cat.frecuencia)) continue;
      if (this.ESTADOS_HISTORICOS.includes(c.estado) || c.estado === 'No aplica') continue;
      this.actualizaControl(c.id, (x) => ({ ...x, estado: 'No aplica' }));
      this.registrarEvento(u, {
        direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes, anio,
        accion: 'Control marcado como No aplica automáticamente',
        estadoAnterior: c.estado, estadoNuevo: 'No aplica',
        observacion: `${c.codigo} dejó de aplicar en ${this.dirUnidad(c.direccion, c.unidad)} según la configuración vigente; deja de contarse como pendiente y como vencido.`
      });
      resumen.noAplica++;
    }

    // 3. Responsables de los controles todavía abiertos, según la distribución vigente.
    for (const c of this.controles().filter((x) => x.anio === anio && x.mes === mes)) {
      if (this.ESTADOS_HISTORICOS.includes(c.estado) || c.estado === 'No aplica') continue;
      const responsable = this.responsableDe(c.direccion, c.unidad);
      if (!responsable || responsable === c.responsable) continue;
      const anterior = c.responsable;
      this.actualizaControl(c.id, (x) => ({ ...x, responsable }));
      this.registrarEvento(u, {
        direccion: c.direccion, unidad: c.unidad, tipoControl: c.codigo, mes, anio,
        accion: 'Responsable actualizado automáticamente',
        estadoAnterior: anterior || 'sin asignar', estadoNuevo: responsable,
        observacion: `La distribución de soportes de ${this.dirUnidad(c.direccion, c.unidad)} cambió: el control ${c.codigo} de ${nombreMes(mes)} ${anio}, que sigue abierto, pasó a ${responsable}.`
      });
      resumen.responsables++;
    }

    const movimientos = resumen.creados + resumen.noAplica + resumen.reabiertos + resumen.responsables;
    if (movimientos) {
      this.persistir();
      // Los KPIs son `computed` sobre estas señales: recalcularlos es consecuencia de guardar.
      this.registrarEvento(u, {
        mes, anio, accion: 'Sincronización automática ejecutada',
        observacion: `Período ${periodo}: ${resumen.creados} control(es) creados, ${resumen.reabiertos} reabiertos, ${resumen.noAplica} marcados «No aplica» y ${resumen.responsables} con responsable actualizado. KPIs recalculados automáticamente.`
      });
    }
    return resumen;
  }

  /**
   * **Sincronización automática del inventario operativo.** Vuelca lo que Gestión de Equipos
   * publicó en el inventario compartido y aplica la cola simulada de eventos. Corre sola al cargar
   * el módulo, al abrir el inventario operativo y cuando el otro módulo escribe; es idempotente y
   * no necesita ninguna acción del usuario.
   */
  autoSyncOperationalInventory(): number { return this.sincronizarInventario(); }

  sincronizarInventario(): number {
    // Primero, lo que Gestión de Equipos publicó en el inventario operativo compartido.
    let aplicados = this.aplicarInventarioCompartido();
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
  /**
   * Vuelca el inventario operativo compartido al inventario del módulo. Es idempotente: un ciclo
   * ya reflejado con los mismos datos no vuelve a tocarse ni deja traza. Devuelve cuántos
   * movimientos se aplicaron.
   */
  private aplicarInventarioCompartido(): number {
    const compartidos = this.compartido.leer();
    if (!compartidos.length) return 0;
    let movimientos = 0;
    for (const c of compartidos) {
      const equipo = this.deCompartido(c);
      const previo = this.cicloEquivalente(equipo.inventario, equipo.expedienteUnico, equipo.ciclo);

      if (!previo) {
        // Un ciclo nuevo cierra el ciclo abierto anterior del mismo número de inventario.
        const abiertos = this.inventario().filter((e) => e.inventario === equipo.inventario
          && e.estado !== 'Descargado' && e.estado !== 'Histórico');
        if (abiertos.length && equipo.estado !== 'Descargado') {
          this.inventario.update((l) => l.map((e) => (abiertos.some((a) => a.ciclo === e.ciclo)
            ? { ...e, estado: 'Histórico' as const } : e)));
          for (const a of abiertos) {
            this.registrarEvento(null, {
              ...this.trazaCompartido(c), accion: 'Equipo movido a histórico operativo',
              estadoAnterior: a.estado, estadoNuevo: 'Histórico',
              observacion: `El equipo inicia un nuevo ciclo en ${this.dirUnidad(equipo.direccion, equipo.unidad)}; el registro anterior de ${this.dirUnidad(a.direccion, a.unidad)} se conserva como histórico.`
            });
          }
        }
        this.inventario.update((l) => [equipo, ...l]);
        this.registrarEvento(null, {
          ...this.trazaCompartido(c),
          accion: equipo.estado === 'Descargado'
            ? 'Equipo retirado del inventario operativo por descargo'
            : 'Inventario operativo actualizado con Zona/Departamento/Dirección',
          estadoAnterior: 'Aceptado en Gestión de Equipos', estadoNuevo: equipo.estado,
          observacion: `${this.dirUnidad(equipo.direccion, equipo.unidad)} · usuario final ${equipo.usuarioFinal}${equipo.ip ? ` · IP ${equipo.ip}` : ' · sin reserva de IP'}. Sincronizado desde el inventario operativo compartido (${c.fechaSincronizacion}).`
        });
        movimientos++;
        continue;
      }

      // Ya estaba: solo se toca si cambió algo real.
      const cambios = this.diferenciasEquipo(previo, equipo);
      if (!cambios.length) continue;
      this.inventario.update((l) => l.map((e) => (e.ciclo === previo.ciclo ? { ...e, ...equipo, ciclo: previo.ciclo } : e)));
      this.registrarEvento(null, {
        ...this.trazaCompartido(c),
        accion: previo.estado !== equipo.estado && equipo.estado === 'Descargado'
          ? 'Equipo retirado del inventario operativo por descargo'
          : 'Equipo actualizado en inventario operativo',
        estadoAnterior: previo.estado, estadoNuevo: equipo.estado,
        observacion: `Cambió: ${cambios.join(', ')}. Sincronizado desde el inventario operativo compartido (${c.fechaSincronizacion}).`
      });
      movimientos++;
    }
    if (movimientos) this.persistir();
    return movimientos;
  }

  /**
   * Ficha ya registrada que corresponde a la MISMA pertenencia: mismo ciclo, o mismo número de
   * inventario y mismo expediente único todavía abierto. Evita que la cola simulada de eventos y
   * el inventario compartido dupliquen el mismo equipo.
   */
  private cicloEquivalente(inventario: string, expedienteUnico: string, ciclo: string): EquipoOperativo | undefined {
    return this.inventario().find((e) => e.ciclo === ciclo)
      ?? this.inventario().find((e) => e.inventario === inventario
        && !!expedienteUnico && e.expedienteUnico === expedienteUnico
        && e.estado !== 'Histórico');
  }

  /** Traduce la ficha compartida al modelo del módulo (la Dirección viaja por nombre, no por id). */
  private deCompartido(c: EquipoOperativoCompartido): EquipoOperativo {
    const estado: EquipoOperativo['estado'] = c.estadoOperativo === 'Activo en Dirección/Registro'
      ? 'Activo en Dirección/Registro'
      : c.estadoOperativo === 'Histórico' ? 'Histórico' : 'Descargado';
    const direccion = this.idDireccion(c.direccion);
    return {
      ciclo: c.id,
      inventario: c.numeroInventario,
      tipo: c.tipoEquipo, marca: c.marca, modelo: c.modelo, serie: c.serie,
      nombreEquipo: c.nombreEquipo,
      ip: c.ip || undefined, mac: c.mac || undefined,
      usuarioFinal: c.usuarioFinal, carne: '—', correoInstitucional: c.correoUsuarioFinal,
      direccion, unidad: c.unidad,
      // Ámbito territorial resuelto al entrar: el equipo llega con Zona, Departamento y
      // Dirección/Registro, no solo con dos nombres (§27).
      zonaId: this.territorio.zonaDe(direccion),
      departamentoId: direccion,
      direccionRegistroId: this.territorio.idRegistro(direccion, c.unidad) || undefined,
      tecnicoConfiguracion: c.tecnicoConfiguracion,
      // El responsable lo manda la distribución vigente; la copia recibida es el respaldo.
      soporteResponsable: this.responsableDe(direccion, c.unidad, c.tecnicoConfiguracion) || c.soporteResponsable,
      fechaAceptacion: c.fechaAceptacion,
      expediente: c.expediente, expedienteUnico: c.expedienteUnico,
      estado, garantia: c.garantia, origen: c.origen || MODULO_EQUIPOS,
      fechaDescargo: c.fechaDescargo, motivoDescargo: c.motivoDescargo,
      accionPosterior: c.accionPosterior
    };
  }

  /** Qué cambió entre la ficha guardada y la recibida; vacío = nada que sincronizar. */
  private diferenciasEquipo(previo: EquipoOperativo, nuevo: EquipoOperativo): string[] {
    const campos: [keyof EquipoOperativo, string][] = [
      ['estado', 'estado operativo'], ['direccion', 'Dirección'], ['unidad', 'Unidad'],
      ['usuarioFinal', 'usuario final'], ['ip', 'IP'], ['mac', 'MAC'],
      ['nombreEquipo', 'nombre del equipo'], ['soporteResponsable', 'soporte responsable'],
      ['garantia', 'garantía'], ['fechaDescargo', 'fecha de descargo']
    ];
    return campos
      .filter(([k]) => (previo[k] ?? '') !== (nuevo[k] ?? ''))
      .map(([, etiqueta]) => etiqueta);
  }

  /** Datos de traza de un movimiento del inventario compartido. */
  private trazaCompartido(c: EquipoOperativoCompartido): Partial<EventoTrazabilidad> {
    return {
      ...this.trazaTerritorio(this.idDireccion(c.direccion), c.unidad),
      direccion: this.idDireccion(c.direccion), unidad: c.unidad,
      moduloOrigen: MODULO_EQUIPOS, moduloDestino: MODULO_CONTROLES,
      inventario: c.numeroInventario,
      equipo: `${c.nombreEquipo || c.tipoEquipo} · ${c.marca} ${c.modelo}`,
      usuarioFinal: c.usuarioFinal, expedienteUnico: c.expedienteUnico
    };
  }

  /** Estado del puente con Gestión de Equipos (para la nota del inventario operativo). */
  readonly puenteEstado = this.puente.estado;
  readonly puenteRecibidos = this.puente.recibidos;

  /** Vuelve a consultar al otro módulo. La acción de depuración del inventario la usa. */
  async reconsultarInventarioCompartido(): Promise<number> {
    await this.puente.consultar();
    return this.sincronizarInventario();
  }

  /** Cuántos ciclos hay en el inventario operativo compartido de este origen. */
  equiposCompartidos(): number { return this.compartido.leer().length; }

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
   * Dirección/Registro y entra **automáticamente** al inventario operativo. Si el mismo número de
   * inventario ya tenía un ciclo abierto (nueva entrega tras un descargo), el ciclo anterior pasa
   * a «Histórico» y se crea un registro operativo nuevo: el historial no se pierde.
   */
  private onEquipmentAccepted(ev: EventoIntegracion): void {
    const previos = this.inventario().filter((e) => e.inventario === ev.equipo.inventario);
    // Ya procesado —por este camino o por el inventario compartido—: no se duplica.
    const mismoCiclo = this.cicloEquivalente(ev.equipo.inventario, ev.equipo.expedienteUnico, ev.equipo.ciclo);
    if (mismoCiclo) return;
    const abiertos = previos.filter((e) => e.estado !== 'Descargado' && e.estado !== 'Histórico');
    const equipo: EquipoOperativo = {
      ...ev.equipo,
      soporteResponsable: this.responsableDe(ev.equipo.direccion, ev.equipo.unidad, ev.equipo.tecnicoConfiguracion)
        || ev.equipo.soporteResponsable,
      estado: 'Activo en Dirección/Registro'
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
      ...this.trazaEquipo(ev), accion: 'Equipo incorporado automáticamente al inventario operativo de Controles Mensuales',
      estadoAnterior: 'Entregado', estadoNuevo: 'Activo en Dirección/Registro',
      observacion: `El Usuario Final aceptó la conformidad (${ev.expedienteUnico || ev.expediente}); el equipo se incorporó automáticamente al inventario operativo de ${this.dirUnidad(equipo.direccion, equipo.unidad)} con sus datos técnicos${equipo.ip ? ` (IP ${equipo.ip})` : ' (sin reserva de IP)'}. Soporte responsable: ${equipo.soporteResponsable || 'sin asignar'}.`
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
   * Reportes formales por Dirección/Registro (mensual, anual, pendientes, operatividad, inventario
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

  /**
   * Deja constancia de lo ocurrido. Además de quién y cuándo, todo evento guarda el **rol activo**
   * con el que se actuó y **todos los roles** que la persona tenía en ese momento: con usuarios
   * multirrol, saber que actuó «Carlos González» ya no basta para auditar, hay que saber si lo
   * hizo como Encargado o como Técnico.
   */
  registrarEvento(u: UsuarioSistema | null, e: Partial<EventoTrazabilidad> & { accion: string }): void {
    const ahora = new Date();
    const evento: EventoTrazabilidad = {
      id: this.idNuevo('TRZ'), fecha: isoLocal(ahora), hora: ahora.toTimeString().slice(0, 5),
      usuario: u?.usuario ?? 'sistema', rol: u?.rol ?? 'Sistema',
      rolesUsuario: u ? etiquetaRoles(u.roles ?? []) : 'Sistema',
      moduloOrigen: MODULO_CONTROLES, ...e
    };
    this.trazabilidad.update((l) => [evento, ...l]);
    this.persistir();
  }

  // ------------------------------------------------------------------ usuarios y roles

  // Mensajes de la administración de usuarios, escritos una sola vez.
  readonly MSG_ROL_PERMISO = 'Solo el Administrador puede modificar los roles de un usuario.';
  readonly MSG_ROL_VACIO = 'El usuario debe conservar al menos un rol.';
  readonly MSG_ROL_INVALIDO = 'El rol indicado no existe en el catálogo del sistema.';
  readonly MSG_ROL_PROPIO_ADMIN =
    'No puede quitarse a sí mismo el rol Administrador: quedaría sin quién administrar el sistema.';
  readonly MSG_ROL_ULTIMO_ADMIN =
    'Debe existir al menos un Administrador activo en el sistema.';
  readonly MSG_ROL_CON_ASIGNACIONES =
    'No se puede quitar el rol Técnico de Soporte: el usuario tiene responsabilidades vigentes en la distribución. Desactive primero sus asignaciones.';

  /**
   * Deja un usuario con sus roles resueltos y coherentes. Acepta el registro heredado —el que
   * traía un solo `clave`— para que una semilla o una foto anteriores sigan abriendo.
   */
  normalizaUsuario(u: UsuarioSistema): UsuarioSistema {
    const roles = ordenaRoles(normalizaRoles(u));
    const activo = rolPrincipal(roles);
    return {
      ...u,
      roles,
      clave: activo ? claveDeRol(activo) : u.clave,
      rol: activo ? nombreRol(activo) : u.rol,
      // Un usuario opera en este módulo si alguno de sus roles lo hace. Hardware existe en el
      // directorio del ecosistema, pero no entra aquí.
      moduloControles: roles.some((r) => ROLES.find((x) => x.rol === r)?.moduloControles === true)
    };
  }

  usuarioPorId(usuario: string): UsuarioSistema | undefined {
    return this.usuarios().find((u) => u.usuario === usuario);
  }

  /** Solo el Administrador toca los roles de otro usuario. */
  puedeAdministrarUsuarios(u: UsuarioSistema | null): boolean {
    return !!u && (u.roles ?? []).includes('ADMINISTRADOR');
  }

  /** Administradores activos del sistema; nunca puede quedar ninguno. */
  private administradoresActivos(exceptoUsuario = ''): UsuarioSistema[] {
    return this.usuarios().filter((u) => u.usuario !== exceptoUsuario
      && u.estado === 'Activo' && (u.roles ?? []).includes('ADMINISTRADOR'));
  }

  /**
   * Cambia el conjunto de roles de un usuario. Es la operación central de
   * Administración → Usuarios: **el rol es un arreglo**, así que agregar y quitar son el mismo
   * movimiento, se aplican de una vez y quedan trazados con los roles anteriores y los nuevos.
   */
  actualizarRoles(usuario: string, roles: RolSistema[], u: UsuarioSistema, observacion = ''): string | null {
    if (!this.puedeAdministrarUsuarios(u)) return this.MSG_ROL_PERMISO;
    const objetivo = this.usuarioPorId(usuario);
    if (!objetivo) return 'El usuario indicado no existe.';
    const validos = new Set(ROLES.map((r) => r.rol));
    if (roles.some((r) => !validos.has(r))) return this.MSG_ROL_INVALIDO;
    const nuevos = ordenaRoles([...new Set(roles)]);
    if (!nuevos.length) return this.MSG_ROL_VACIO;

    const antes = ordenaRoles(objetivo.roles ?? []);
    const quitados = antes.filter((r) => !nuevos.includes(r));
    const agregados = nuevos.filter((r) => !antes.includes(r));
    if (!quitados.length && !agregados.length) return null;

    // Nadie se queda sin administración, ni el sistema sin Administrador.
    if (quitados.includes('ADMINISTRADOR')) {
      if (objetivo.usuario === u.usuario) return this.MSG_ROL_PROPIO_ADMIN;
      if (!this.administradoresActivos(objetivo.usuario).length) return this.MSG_ROL_ULTIMO_ADMIN;
    }
    // Un técnico con responsabilidades vigentes no puede perder el rol que las sostiene: sus
    // Direcciones/Registros quedarían con un responsable que el sistema ya no reconoce.
    if (quitados.includes(ROL_RESPONSABLE_SOPORTE) && this.soportes.deTecnico(objetivo.nombre).length) {
      return this.MSG_ROL_CON_ASIGNACIONES;
    }

    this.aplicarUsuario(usuario, { roles: nuevos });
    const base = {
      usuarioAfectado: objetivo.nombre,
      rolesAnteriores: etiquetaRoles(antes),
      rolesNuevos: etiquetaRoles(nuevos),
      estadoAnterior: etiquetaRoles(antes),
      estadoNuevo: etiquetaRoles(nuevos),
      observacion: observacion.trim()
    };
    for (const r of agregados) {
      this.registrarEvento(u, {
        ...base, accion: 'Rol agregado a usuario',
        observacion: `${objetivo.nombre} recibió el rol ${nombreRol(r)}. ${observacion}`.trim()
      });
    }
    for (const r of quitados) {
      this.registrarEvento(u, {
        ...base, accion: 'Rol quitado a usuario',
        observacion: `${objetivo.nombre} perdió el rol ${nombreRol(r)}. ${observacion}`.trim()
      });
    }
    this.registrarEvento(u, {
      ...base, accion: 'Permisos recalculados',
      observacion: `Los permisos de ${objetivo.nombre} se recalcularon automáticamente: ahora puede usar las funciones de ${etiquetaRoles(nuevos)}. No hay ninguna acción manual de sincronización.`
    });
    return null;
  }

  /** Activa o desactiva un usuario. Un usuario inactivo no inicia sesión ni recibe asignaciones. */
  cambiarEstadoUsuario(usuario: string, estado: 'Activo' | 'Inactivo', u: UsuarioSistema, motivo = ''): string | null {
    if (!this.puedeAdministrarUsuarios(u)) return this.MSG_ROL_PERMISO;
    const objetivo = this.usuarioPorId(usuario);
    if (!objetivo) return 'El usuario indicado no existe.';
    if (objetivo.estado === estado) return null;
    if (estado === 'Inactivo') {
      if (objetivo.usuario === u.usuario) return 'No puede desactivar su propio usuario.';
      if ((objetivo.roles ?? []).includes('ADMINISTRADOR') && !this.administradoresActivos(objetivo.usuario).length) {
        return this.MSG_ROL_ULTIMO_ADMIN;
      }
      if (this.soportes.deTecnico(objetivo.nombre).length) {
        return 'No se puede desactivar: el usuario tiene responsabilidades vigentes en la distribución de soportes. Desactive primero sus asignaciones.';
      }
    }
    this.aplicarUsuario(usuario, { estado });
    this.registrarEvento(u, {
      usuarioAfectado: objetivo.nombre, accion: estado === 'Activo' ? 'Usuario activado' : 'Usuario desactivado',
      estadoAnterior: objetivo.estado, estadoNuevo: estado, motivo: motivo.trim(),
      rolesUsuario: etiquetaRoles(u.roles ?? []),
      observacion: `${objetivo.nombre} (${etiquetaRoles(objetivo.roles ?? [])}) quedó ${estado.toLowerCase()}. ${motivo}`.trim()
    });
    return null;
  }

  /** Deja registrado que alguien cambió de rol activo sin cerrar sesión (§7). */
  registrarCambioRolActivo(u: UsuarioSistema, anterior: RolSistema | null): void {
    this.registrarEvento(u, {
      usuarioAfectado: u.nombre, accion: 'Usuario cambió rol activo',
      estadoAnterior: anterior ? nombreRol(anterior) : 'Sin rol activo', estadoNuevo: u.rol,
      rolesAnteriores: etiquetaRoles(u.roles ?? []), rolesNuevos: etiquetaRoles(u.roles ?? []),
      observacion: `${u.nombre} pasó a operar como ${u.rol}. Conserva sus demás roles (${etiquetaRoles(u.roles ?? [])}); solo cambia cómo se le ordena la interfaz.`
    });
  }

  /** Deja registrado un intento de entrar donde el rol activo no llega (§7). */
  registrarAccesoDenegado(u: UsuarioSistema | null, ruta: string): void {
    this.registrarEvento(u, {
      usuarioAfectado: u?.nombre, accion: 'Intento de acceso denegado',
      estadoNuevo: 'Acceso bloqueado',
      observacion: `El rol activo ${u?.rol ?? 'sin sesión'} no tiene acceso a «${ruta}». Roles del usuario: ${u ? etiquetaRoles(u.roles ?? []) : 'ninguno'}.`
    });
  }

  /** Escribe el cambio en el directorio y lo persiste. */
  private aplicarUsuario(usuario: string, cambios: Partial<UsuarioSistema>): void {
    this.usuarios.update((l) => l.map((x) => (x.usuario === usuario ? this.normalizaUsuario({ ...x, ...cambios }) : x)));
    this.persistir();
  }

  // ------------------------------------------------------------------ administración de la distribución

  // Mensajes de la distribución, escritos una sola vez y verificados por la batería.
  readonly MSG_DIST_TECNICO = 'Debe seleccionar un Técnico de Soporte.';
  readonly MSG_DIST_DIRECCION = 'Debe seleccionar un Departamento.';
  readonly MSG_DIST_UNIDAD = 'Debe seleccionar una Dirección/Registro.';
  readonly MSG_DIST_DUPLICADA = 'Esta asignación ya existe para este Técnico de Soporte.';
  readonly MSG_DIST_MOTIVO = 'Debe ingresar el motivo por el cual se desactiva esta responsabilidad.';
  readonly MSG_DIST_SOLO_SOPORTE = 'Solo se pueden asignar usuarios con rol Técnico de Soporte.';
  readonly MSG_DIST_PERMISO = 'Solo el Encargado de Soporte o el Administrador pueden gestionar la distribución de soportes.';
  readonly MSG_DIST_SINCRONIZADA = 'La distribución de soportes fue actualizada y los controles se recalcularon automáticamente.';

  /**
   * Aviso —no error— de los departamentos que se distribuyen completos. No se muestra como falla:
   * el formulario simplemente deja de pedir la Dirección/Registro y explica por qué.
   */
  readonly MSG_DIST_POR_DEPARTAMENTO =
    'En este Departamento la distribución se realiza por Departamento, no por Dirección/Registro.';

  /** «Para San Salvador debe seleccionar una Dirección/Registro.» */
  msgRegistroObligatorio(departamento: string): string {
    return `Para ${this.territorio.nombreDepartamento(this.territorio.idDepartamento(departamento))} debe seleccionar una Dirección/Registro.`;
  }

  /** ¿Este departamento exige elegir Dirección/Registro? Lo decide el catálogo territorial. */
  exigeRegistro(departamento: string): boolean { return this.soportes.exigeRegistro(departamento); }

  /**
   * Solo el Encargado de Soporte y el Administrador gestionan la distribución. El Coordinador y
   * los Técnicos de Soporte la consultan: un técnico que pudiera editar su propia distribución
   * decidiría qué le toca revisar, que es justo lo que el control interno no permite.
   */
  puedeGestionarDistribucion(u: UsuarioSistema | null): boolean {
    return u?.clave === 'enc-soporte' || u?.clave === 'admin';
  }

  /** Todos ven la pantalla; el Técnico de Soporte, limitado a lo suyo. */
  puedeConsultarDistribucion(u: UsuarioSistema | null): boolean { return !!u; }

  /** El Técnico de Soporte solo consulta sus propias Direcciones/Registros. */
  soloVeLoSuyo(u: UsuarioSistema | null): boolean { return u?.clave === 'tec-soporte'; }

  /**
   * Carga de un Técnico de Soporte: lo que hoy responde por sus Direcciones/Registros vigentes.
   * Es el resumen que la pantalla de edición muestra antes de agregarle o quitarle una más.
   */
  cargaDeSoporte(usuarioOTecnico: string): {
    pares: { direccion: string; unidad: string }[];
    controlesPeriodo: number; pendientes: number; entregados: number; vencidos: number;
    bitacoras: number; equipos: number;
  } {
    const u = this.usuarios().find((x) => x.usuario === usuarioOTecnico);
    const quien = u ? u.nombre : usuarioOTecnico;
    const pares = this.soportes.deTecnico(quien)
      .map((d) => ({ direccion: this.idDireccion(d.direccion), unidad: d.unidad }));
    const suyo = (x: { direccion: string; unidad: string }) =>
      pares.some((p) => p.direccion === x.direccion && p.unidad === x.unidad);
    const p = this.plazos.periodoActivo();
    const delPeriodo = this.controles().filter((c) => c.anio === p.anio && c.mes === p.mes && suyo(c));
    return {
      pares,
      controlesPeriodo: delPeriodo.length,
      pendientes: delPeriodo.filter((c) => ['Pendiente', 'Programado', 'En proceso', 'Listo para entregar'].includes(c.estado)).length,
      entregados: delPeriodo.filter((c) => c.estado === 'Entregado').length,
      vencidos: delPeriodo.filter((c) => c.estado === 'Vencido').length,
      bitacoras: this.bitacoras().filter((b) => suyo(b) && b.estado !== 'Enviada').length,
      equipos: pares.reduce((n, x) => n + this.equiposActivosDe(x.direccion, x.unidad).length, 0)
    };
  }

  /** Controles del período de una Dirección/Registro concreta, para el detalle de la responsabilidad. */
  controlesDeResponsabilidad(direccionId: string, unidad: string): ControlMes[] {
    const p = this.plazos.periodoActivo();
    return this.controles().filter((c) => c.anio === p.anio && c.mes === p.mes
      && c.direccion === direccionId && c.unidad === unidad);
  }

  /** Bitácoras abiertas de una Dirección/Registro. */
  bitacorasDeResponsabilidad(direccionId: string, unidad: string): BitacoraDiaria[] {
    return this.bitacoras().filter((b) => b.direccion === direccionId && b.unidad === unidad);
  }

  /**
   * Asigna un Técnico de Soporte a una Dirección/Registro. El efecto es doble: en este módulo pasa
   * a ver y completar sus controles y bitácoras; en Gestión de Equipos pasa a estar disponible
   * como Técnico de Configuración para los requerimientos de esa Dirección/Registro.
   */
  asignarDistribucion(datos: {
    direccion: string; unidad: string; tecnico: string; observacion: string;
    fechaInicio?: string; activo?: boolean;
  }, u: UsuarioSistema): string | null {
    if (!this.puedeGestionarDistribucion(u)) return this.MSG_DIST_PERMISO;
    if (!datos.tecnico) return this.MSG_DIST_TECNICO;
    if (!datos.direccion) return this.MSG_DIST_DIRECCION;

    // La regla territorial decide qué se exige: en los departamentos que se llevan por
    // Dirección/Registro hay que elegir una; en los demás, la asignación es del departamento
    // completo y un registro escrito se ignora, no se guarda a medias.
    const dep = this.territorio.idDepartamento(datos.direccion);
    const porDireccion = this.territorio.distribuyePorDireccion(dep);
    const registro = porDireccion ? this.territorio.idRegistro(dep, datos.unidad) : '';
    if (porDireccion && !registro) return this.msgRegistroObligatorio(dep);

    const tec = this.usuarios().find((x) => x.usuario === datos.tecnico)
      ?? this.usuarios().find((x) => this.soportes.idTecnico(datos.tecnico) === this.soportes.idTecnico(x.nombre));
    // Hardware y el Coordinador no atienden territorio: no son Técnicos de Soporte. Se comprueba
    // sobre TODOS sus roles, no sobre el activo: quien es Encargado y Técnico sigue siendo Técnico.
    if (!tec || !(tec.roles ?? []).includes(ROL_RESPONSABLE_SOPORTE)) return this.MSG_DIST_SOLO_SOPORTE;
    if ((tec.roles ?? []).some(esRolHardware) && !(tec.roles ?? []).includes(ROL_RESPONSABLE_SOPORTE)) {
      return this.MSG_DIST_SOLO_SOPORTE;
    }
    if (tec.estado !== 'Activo') return 'No se puede asignar un Técnico de Soporte inactivo.';

    const nombreDir = this.territorio.nombreDepartamento(dep);
    const etiqueta = this.territorio.etiqueta(dep, registro);
    const tipo = porDireccion ? 'DIRECCION_REGISTRO' : 'DEPARTAMENTO';
    // El duplicado se comprueba por ID sobre el ámbito exacto, no por el texto de la asignación.
    if (this.soportes.duplicada(tec.nombre, dep, registro)) {
      this.registrarEvento(u, {
        ...this.trazaTerritorio(dep, registro),
        accion: 'Intento de duplicado bloqueado', tecnicoAfectado: tec.nombre,
        observacion: `${tec.nombre} ya atiende ${etiqueta}; no se registró una segunda responsabilidad vigente sobre el mismo ámbito.`
      });
      return this.MSG_DIST_DUPLICADA;
    }
    const ahora = new Date();
    const activo = datos.activo !== false;
    const nuevo: DistribucionSoporte = {
      id: this.soportes.siguienteId(ahora.getFullYear()),
      tecnicoId: this.soportes.idTecnico(tec.nombre),
      tipoAsignacion: tipo,
      zonaId: this.territorio.zonaDe(dep),
      departamentoId: dep,
      direccionRegistroId: registro || null,
      direccionId: dep,
      unidadId: this.soportes.idUnidad(dep, registro),
      direccion: nombreDir,
      unidad: registro ? this.territorio.nombreRegistro(registro) : ETIQUETA_TODO_EL_DEPARTAMENTO,
      tecnico: `${tec.nombre} — ${nombreRol(ROL_RESPONSABLE_SOPORTE)}`,
      asignadoPor: `${u.nombre} — ${u.rol}`,
      // La fecha de inicio la decide quien asigna: una responsabilidad puede empezar antes de
      // que alguien tenga tiempo de registrarla.
      fecha: datos.fechaInicio?.trim() || isoLocal(ahora),
      hora: ahora.toTimeString().slice(0, 5),
      activo, observacion: datos.observacion.trim()
    };
    this.soportes.agregar(nuevo);
    this.persistir();
    this.publicarDistribucion(u, `${tec.nombre} atiende ${etiqueta}.`);
    const base = { ...this.trazaTerritorio(dep, registro), tecnicoAfectado: tec.nombre };
    this.registrarEvento(u, {
      ...base,
      accion: porDireccion ? 'Responsable asignado por Dirección/Registro' : 'Responsable asignado por Departamento',
      moduloOrigen: MODULO_CONTROLES,
      estadoAnterior: 'Sin asignar', estadoNuevo: activo ? 'Activa' : 'Inactiva',
      observacion: porDireccion
        ? `${tec.nombre} atiende ${etiqueta} desde el ${nuevo.fecha}. ${nuevo.observacion}`.trim()
        : `${tec.nombre} atiende TODO el departamento de ${nombreDir} (${this.territorio.registrosDe(dep).length} Direcciones/Registros) desde el ${nuevo.fecha}. ${nuevo.observacion}`.trim()
    });
    this.registrarEvento(u, {
      ...base, accion: 'Responsabilidad de soporte modificada',
      estadoNuevo: `${this.soportes.deTecnico(tec.nombre).length} ámbito(s) atendido(s)`,
      observacion: `Se agregó un ámbito territorial a la responsabilidad de ${tec.nombre}.`
    });
    this.registrarEvento(u, {
      ...base, accion: 'Perfil del soporte actualizado automáticamente',
      observacion: `${tec.nombre} pasa a ver los controles, la bitácora y el inventario operativo de ${etiqueta} sin ninguna acción adicional.`
    });
    if (activo) {
      this.registrarEvento(u, {
        ...base, accion: 'Distribución aplicada en Gestión de Equipos',
        moduloOrigen: MODULO_CONTROLES, moduloDestino: MODULO_EQUIPOS,
        observacion: porDireccion
          ? `Desde esta fecha, Gestión de Equipos ofrece a ${tec.nombre} como Técnico de Configuración para los requerimientos de ${etiqueta}.`
          : `Desde esta fecha, Gestión de Equipos ofrece a ${tec.nombre} como Técnico de Configuración para los requerimientos de cualquier Dirección/Registro de ${nombreDir}.`
      });
    }
    // Los controles abiertos del período pasan solos al nuevo responsable.
    this.sincronizarTrasDistribucion(u, `${tec.nombre} atiende ${etiqueta}`);
    return null;
  }

  /** Campos territoriales comunes de un evento de trazabilidad (§32). */
  private trazaTerritorio(departamento: string, registro: string): Partial<EventoTrazabilidad> {
    const dep = this.territorio.idDepartamento(departamento);
    const reg = this.territorio.idRegistro(dep, registro);
    return {
      zona: this.territorio.nombreZona(this.territorio.zonaDe(dep)),
      departamento: this.territorio.nombreDepartamento(dep),
      direccionRegistro: reg ? this.territorio.nombreRegistro(reg) : ETIQUETA_TODO_EL_DEPARTAMENTO,
      tipoAsignacion: this.territorio.tipoAsignacionDe(dep),
      direccion: dep,
      unidad: reg ? this.territorio.nombreRegistro(reg) : ETIQUETA_TODO_EL_DEPARTAMENTO
    };
  }

  /** Deja constancia de que alguien consultó la distribución de un Técnico de Soporte. */
  registrarConsultaDistribucion(tecnico: string, u: UsuarioSistema | null): void {
    const pares = this.soportes.deTecnico(tecnico);
    this.registrarEvento(u, {
      accion: 'Distribución de soporte consultada', tecnicoAfectado: this.soportes.soloNombre(tecnico),
      observacion: `${this.soportes.soloNombre(tecnico)} atiende ${pares.length} Dirección/Registro vigente(s): ${pares.map((d) => this.soportes.etiqueta(d.direccion, d.unidad)).join('; ') || 'ninguna'}.`
    });
  }

  /**
   * Recalcula el período tras un cambio en la distribución. Se llama al asignar y al desactivar:
   * guardar la distribución es lo único que hace el usuario, el resto ocurre aquí.
   */
  private sincronizarTrasDistribucion(u: UsuarioSistema, cambio: string): void {
    const p = this.plazos.periodoActivo();
    const resumen = this.autoSyncControls(p.anio, p.mes, u);
    this.registrarEvento(u, {
      mes: p.mes, anio: p.anio,
      accion: 'Controles recalculados automáticamente por cambio de distribución',
      observacion: `${cambio}. Período ${nombreMes(p.mes)} ${p.anio}: ${resumen.creados} control(es) creado(s), ${resumen.reabiertos} reabierto(s), ${resumen.noAplica} marcado(s) «No aplica» y ${resumen.responsables} responsable(s) actualizado(s). No hay ningún botón que lo dispare: ocurre al guardar.`
    });
  }

  /**
   * Desactiva una asignación. Nunca se borra: los controles y equipos registrados mientras
   * estuvo vigente siguen apuntando a ella.
   */
  desactivarDistribucion(id: string, motivo: string, u: UsuarioSistema): string | null {
    if (!this.puedeGestionarDistribucion(u)) return this.MSG_DIST_PERMISO;
    const actual = this.distribucion().find((d) => d.id === id);
    if (!actual) return 'No se encontró la asignación indicada.';
    if (!actual.activo) return 'La asignación ya está desactivada.';
    if (!motivo.trim()) return this.MSG_DIST_MOTIVO;
    const dep = actual.departamentoId || this.territorio.idDepartamento(actual.direccion);
    const reg = actual.direccionRegistroId ?? '';
    const etiqueta = this.territorio.etiqueta(dep, reg);
    // El alcance real de la asignación: una departamental cubre todas las Direcciones/Registros.
    const alcance = reg
      ? [{ departamentoId: dep, direccionRegistroId: reg }]
      : this.territorio.registrosDe(dep).map((r) => ({ departamentoId: dep, direccionRegistroId: r.id }));
    const equipos = alcance.flatMap((a) => this.equiposActivosDe(a.departamentoId, a.direccionRegistroId));
    const quedan = this.soportes.deDireccionUnidad(dep, reg).filter((d) => d.id !== id);
    const controlesAbiertos = alcance.flatMap((a) => this.controlesDeResponsabilidad(a.departamentoId, a.direccionRegistroId))
      .filter((c) => !['Cerrado', 'No aplica', 'Entregado', 'Entregado tarde', 'Justificado'].includes(c.estado));
    // §25: un ámbito con controles o equipos activos no puede quedarse sin responsable «porque
    // sí», pero tampoco se bloquea de plano: se permite si queda constancia del motivo, que aquí
    // ya es obligatorio. Lo que nunca ocurre es que el hueco pase inadvertido.
    const quedaSinResponsable = !quedan.length && (equipos.length > 0 || controlesAbiertos.length > 0);

    this.soportes.desactivar(id, `${u.nombre} — ${u.rol}`, isoLocal(new Date()), motivo.trim());
    // Los equipos activos pasan al responsable que queda vigente: nunca quedan sin soporte.
    if (equipos.length && quedan.length) {
      const inventarios = new Set(equipos.map((e) => e.ciclo));
      this.inventario.update((l) => l.map((e) => (inventarios.has(e.ciclo) && e.estado !== 'Descargado'
        ? { ...e, soporteResponsable: this.soportes.responsableDe(e.direccion, e.unidad) || e.soporteResponsable }
        : e)));
    }
    this.persistir();
    const quien = this.soportes.soloNombre(actual.tecnico);
    this.publicarDistribucion(u, `${quien} deja de atender ${etiqueta}.`);
    const base = { ...this.trazaTerritorio(dep, reg), tecnicoAfectado: quien, motivo: motivo.trim() };
    this.registrarEvento(u, {
      ...base, accion: 'Asignación territorial desactivada',
      estadoAnterior: 'Activa', estadoNuevo: 'Desactivada',
      observacion: `${quien} deja de atender ${etiqueta}. Responsable(s) que quedan: ${quedan.map((d) => this.soportes.soloNombre(d.tecnico)).join(' · ') || 'ninguno'}.`
    });
    if (quedaSinResponsable) {
      this.registrarEvento(u, {
        ...base, accion: 'Ámbito territorial sin responsable',
        estadoAnterior: quien, estadoNuevo: 'Sin soporte asignado',
        observacion: `${etiqueta} queda sin Técnico de Soporte responsable con ${equipos.length} equipo(s) activo(s) y ${controlesAbiertos.length} control(es) abierto(s). Se registró el motivo: ${motivo.trim()}`
      });
    }
    this.registrarEvento(u, {
      ...base, accion: 'Responsabilidad de soporte modificada',
      estadoAnterior: this.soportes.soloNombre(actual.tecnico),
      estadoNuevo: quedan.length ? quedan.map((d) => this.soportes.soloNombre(d.tecnico)).join(' · ') : 'Sin soporte asignado',
      observacion: motivo.trim()
    });
    this.registrarEvento(u, {
      ...base, accion: 'Perfil del soporte actualizado automáticamente',
      observacion: `${quien} deja de ver los controles nuevos, la bitácora y el inventario operativo de ${etiqueta}. Lo ya entregado se conserva como historial.`
    });
    this.registrarEvento(u, {
      ...base, accion: 'Distribución aplicada en Gestión de Equipos',
      moduloOrigen: MODULO_CONTROLES, moduloDestino: MODULO_EQUIPOS,
      observacion: `Gestión de Equipos deja de ofrecer a ${quien} como Técnico de Configuración de ${etiqueta}.`
    });
    // Los controles abiertos quedan con el responsable que corresponda ahora.
    this.sincronizarTrasDistribucion(u, `${quien} deja de atender ${etiqueta}`);
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

  /** Una aplicación vacía no se guarda: el control quedaría sin ninguna Dirección/Registro donde correr. */
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
   * Guarda dónde aplica un control. Cambiar la aplicación cambia qué Direcciones/Registros verán
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
    // El período se recalcula aquí mismo: guardar la configuración YA sincroniza los controles.
    const p = this.plazos.periodoActivo();
    this.autoSyncControls(p.anio, p.mes, u);
    return null;
  }
}
