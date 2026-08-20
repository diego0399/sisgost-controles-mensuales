import { Injectable, computed, signal } from '@angular/core';
import { DistribucionSoporte } from '../models/models';

/**
 * Dirección del catálogo organizacional, tal como la publica `assets/data/direcciones.json`.
 * El mismo archivo se sirve en los dos módulos: es el que da los **IDs estables** con los que
 * trabaja la distribución, en lugar de comparar los nombres visibles.
 */
export interface DireccionOrganizacion {
  id: string;
  nombre: string;
  corta: string;
  unidades: string[];
  activa?: boolean;
}

/**
 * SERVICIO COMPARTIDO DEL ECOSISTEMA SISGOST — distribución de soportes por Dirección/Unidad.
 *
 * El mismo archivo existe en los dos módulos y trabaja sobre el mismo registro
 * (`assets/data/distribucion-soportes.json`), porque la distribución es una sola verdad:
 *
 *   · **Controles Mensuales** la ADMINISTRA (Administración → Distribución de soportes) y la usa
 *     para asignar controles y bitácoras, filtrar el inventario operativo y decidir qué ve cada
 *     Técnico de Soporte.
 *   · **Gestión de Equipos** la CONSUME: al crear el expediente único solo ofrece como Técnico de
 *     Configuración a los técnicos responsables de la Dirección/Unidad del requerimiento, y al
 *     aceptarse la entrega determina con ella el soporte responsable posterior.
 *
 * **Todo se compara por ID, nunca por el texto visible.** Cada asignación guarda `tecnicoId`,
 * `direccionId` y `unidadId`; los nombres se conservan solo para mostrarlos y para poder migrar
 * los registros anteriores. Comparar textos era el origen real de las desincronizaciones
 * («Dirección de Registro» contra «Dirección de Registros», «Registro Propiedad» contra
 * «Registro de la Propiedad»), y una asignación mal comparada deja a un técnico sin ver sus
 * controles o le abre los de otra Dirección.
 *
 * Aquí viven únicamente las consultas y las escrituras planas; las reglas de negocio de cada
 * módulo (quién puede modificar, qué pasa con los equipos activos) quedan en su propio servicio.
 */
@Injectable({ providedIn: 'root' })
export class SupportDistributionService {
  /** Registro compartido completo, incluidas las asignaciones desactivadas (historial). */
  readonly registros = signal<DistribucionSoporte[]>([]);

  /** Catálogo organizacional que resuelve nombre → ID. Lo carga cada módulo al arrancar. */
  readonly organizacion = signal<DireccionOrganizacion[]>([]);

  readonly activas = computed(() => this.registros().filter((d) => d.activo));

  cargar(lista: DistribucionSoporte[]): void { this.registros.set(lista.map((d) => this.normalizar(d))); }

  cargarOrganizacion(lista: DireccionOrganizacion[]): void { this.organizacion.set(lista); }

  // ------------------------------------------------------------------ IDs estables

  /** Minúsculas, sin tildes y con guiones: la base de todo ID derivado de un nombre. */
  slug(texto: string): string {
    return (texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /** Solo el nombre del técnico, sin el « — Rol» con el que se guarda. */
  soloNombre(tecnico: string): string { return (tecnico ?? '').split('—')[0].trim(); }

  /**
   * ID estable del Técnico de Soporte: el slug de su nombre (`wendy-carranza`). Acepta el ID ya
   * hecho, el nombre suelto o el «Nombre — Rol» con el que viaja entre módulos.
   */
  idTecnico(tecnico: string): string { return this.slug(this.soloNombre(tecnico)); }

  /**
   * ID estable de la Dirección. Acepta el ID del catálogo (`DIR-REGS`), su forma corta (`REGS`)
   * o el nombre institucional; si no está en el catálogo, deriva `DIR-<slug>` para no perder el
   * registro.
   */
  idDireccion(direccion: string): string {
    const texto = (direccion ?? '').trim();
    if (!texto) return '';
    const cat = this.organizacion();
    const s = this.slug(texto);
    const hallada = cat.find((d) => d.id === texto)
      ?? cat.find((d) => this.slug(d.id) === s)
      ?? cat.find((d) => this.slug(d.nombre) === s)
      ?? cat.find((d) => this.slug(d.corta) === s);
    return hallada ? hallada.id : `DIR-${s.toUpperCase()}`;
  }

  /**
   * ID estable de la Unidad, siempre dentro de su Dirección: dos Direcciones pueden tener una
   * unidad con el mismo nombre y no son la misma.
   */
  idUnidad(direccion: string, unidad: string): string {
    const dir = this.idDireccion(direccion);
    const texto = (unidad ?? '').trim();
    if (!dir) return '';
    return `${dir}::${this.slug(texto) || this.slug(this.nombreDireccion(dir))}`;
  }

  /** Nombre institucional de una Dirección a partir de su ID (o el texto recibido). */
  nombreDireccion(direccion: string): string {
    const id = this.idDireccion(direccion);
    return this.organizacion().find((d) => d.id === id)?.nombre ?? direccion;
  }

  /** Forma corta de la Dirección, para etiquetas y chips. */
  cortaDireccion(direccion: string): string {
    const id = this.idDireccion(direccion);
    return this.organizacion().find((d) => d.id === id)?.corta ?? this.nombreDireccion(direccion);
  }

  /** «Dirección / Unidad» legible; cuando la unidad se llama igual, se escribe una sola vez. */
  etiqueta(direccion: string, unidad: string): string {
    const nombre = this.nombreDireccion(direccion);
    return !unidad || unidad === nombre ? nombre : `${nombre} / ${unidad}`;
  }

  /**
   * Completa los IDs de un registro guardado antes de que existieran. La migración es por texto
   * una sola vez, al cargar: a partir de ahí todo se compara por ID.
   */
  normalizar(d: DistribucionSoporte): DistribucionSoporte {
    return {
      ...d,
      tecnicoId: d.tecnicoId || this.idTecnico(d.tecnico),
      direccionId: d.direccionId || this.idDireccion(d.direccion),
      unidadId: d.unidadId || this.idUnidad(d.direccion, d.unidad)
    };
  }

  // ------------------------------------------------------------------ consultas

  /** Asignaciones vigentes de una Dirección/Unidad. */
  deDireccionUnidad(direccion: string, unidad: string): DistribucionSoporte[] {
    const id = this.idUnidad(direccion, unidad);
    return this.activas().filter((d) => d.unidadId === id);
  }

  /** Asignaciones —vigentes e históricas— de una Dirección/Unidad. */
  historialDe(direccion: string, unidad: string): DistribucionSoporte[] {
    const id = this.idUnidad(direccion, unidad);
    return this.registros().filter((d) => d.unidadId === id);
  }

  /** Asignaciones vigentes de toda una Dirección (cualquiera de sus unidades). */
  deDireccion(direccion: string): DistribucionSoporte[] {
    const id = this.idDireccion(direccion);
    return this.activas().filter((d) => d.direccionId === id);
  }

  /** Técnicos responsables de una Dirección/Unidad, en formato «Nombre — Rol». */
  tecnicosDe(direccion: string, unidad: string): string[] {
    return this.deDireccionUnidad(direccion, unidad).map((d) => d.tecnico);
  }

  /** Direcciones/Unidades que atiende un técnico (por ID, por nombre o por «Nombre — Rol»). */
  deTecnico(tecnico: string): DistribucionSoporte[] {
    const id = this.idTecnico(tecnico);
    if (!id) return [];
    return this.activas().filter((d) => d.tecnicoId === id);
  }

  /** Todo lo que un técnico atiende o atendió: es el historial de su responsabilidad. */
  todasDeTecnico(tecnico: string): DistribucionSoporte[] {
    const id = this.idTecnico(tecnico);
    if (!id) return [];
    return this.registros().filter((d) => d.tecnicoId === id);
  }

  /** ¿Este técnico está en la distribución vigente de esa Dirección/Unidad? */
  atiende(tecnico: string, direccion: string, unidad: string): boolean {
    const id = this.idTecnico(tecnico);
    if (!id) return false;
    return this.deDireccionUnidad(direccion, unidad).some((d) => d.tecnicoId === id);
  }

  /** ¿Atiende alguna unidad de esa Dirección? */
  atiendeDireccion(tecnico: string, direccion: string): boolean {
    const id = this.idTecnico(tecnico);
    if (!id) return false;
    return this.deDireccion(direccion).some((d) => d.tecnicoId === id);
  }

  /**
   * ¿Existe ya esta responsabilidad vigente? La comprobación del duplicado es por IDs: el mismo
   * técnico no puede quedar dos veces activo en la misma Dirección/Unidad aunque el texto con el
   * que se escribió difiera.
   */
  duplicada(tecnico: string, direccion: string, unidad: string): boolean {
    return this.atiende(tecnico, direccion, unidad);
  }

  /**
   * Soporte responsable de una Dirección/Unidad. Si el técnico indicado como preferido
   * (normalmente el que configuró el equipo) la atiende, es él; si no, el primero vigente.
   */
  responsableDe(direccion: string, unidad: string, preferido = ''): string {
    const lista = this.deDireccionUnidad(direccion, unidad);
    if (!lista.length) return '';
    if (preferido) {
      const id = this.idTecnico(preferido);
      const propio = lista.find((d) => d.tecnicoId === id);
      if (propio) return propio.tecnico;
    }
    return lista[0].tecnico;
  }

  /** Pares Dirección/Unidad presentes en el registro (vigentes o históricos). */
  pares(): { direccion: string; unidad: string }[] {
    const mapa = new Map<string, { direccion: string; unidad: string }>();
    for (const d of this.registros()) mapa.set(d.unidadId, { direccion: d.direccion, unidad: d.unidad });
    return [...mapa.values()].sort((a, b) => a.direccion.localeCompare(b.direccion) || a.unidad.localeCompare(b.unidad));
  }

  // ------------------------------------------------------------------ escrituras planas

  agregar(d: DistribucionSoporte): void { this.registros.update((l) => [this.normalizar(d), ...l]); }

  modificar(id: string, cambios: Partial<DistribucionSoporte>): void {
    this.registros.update((l) => l.map((d) => (d.id === id ? this.normalizar({ ...d, ...cambios }) : d)));
  }

  /** Nunca se borra: se desactiva conservando el historial. */
  desactivar(id: string, por: string, fecha: string, motivo: string): void {
    this.registros.update((l) => l.map((d) => (d.id === id
      ? { ...d, activo: false, desactivadaPor: por, fechaDesactivacion: fecha, motivoDesactivacion: motivo, observacion: `${d.observacion} Desactivada: ${motivo}`.trim() }
      : d)));
  }

  /** Vuelve a activar una responsabilidad desactivada (o una creada como inactiva). */
  activar(id: string): void {
    this.registros.update((l) => l.map((d) => (d.id === id
      ? { ...d, activo: true, desactivadaPor: undefined, fechaDesactivacion: undefined, motivoDesactivacion: undefined }
      : d)));
  }

  /** Siguiente correlativo `DIST-AAAA-NNNN`. */
  siguienteId(anio: number): string {
    const prefijo = `DIST-${anio}-`;
    const n = this.registros()
      .filter((d) => d.id.startsWith(prefijo))
      .reduce((max, d) => Math.max(max, Number(d.id.slice(prefijo.length)) || 0), 0);
    return `${prefijo}${String(n + 1).padStart(4, '0')}`;
  }
}
