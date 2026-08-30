import { Injectable, computed, inject, signal } from '@angular/core';
import { DistribucionSoporte } from '../models/models';
import {
  ALCANCE_DEPARTAMENTO, AmbitoTerritorial, ETIQUETA_TODO_EL_DEPARTAMENTO, TipoAsignacion
} from '../models/territorio';
import { AsignacionSoporteCompartida, SharedDistributionService } from './shared-distribution.service';
import { TerritorioService } from './territorio.service';

/**
 * Departamento del catálogo organizacional, tal como lo publica `assets/data/direcciones.json`.
 * El mismo archivo se sirve en los dos módulos y es la vista plana del catálogo territorial: cada
 * entrada es un DEPARTAMENTO y sus `unidades` son sus Direcciones/Registros.
 */
export interface DireccionOrganizacion {
  id: string;
  nombre: string;
  corta: string;
  zonaId?: string;
  porDireccion?: boolean;
  unidades: string[];
  activa?: boolean;
}

/**
 * SERVICIO COMPARTIDO DEL ECOSISTEMA SISGOST — distribución de soportes por territorio.
 *
 * El mismo archivo existe en los dos módulos y trabaja sobre el mismo registro, porque la
 * distribución es una sola verdad:
 *
 *   · **Controles Mensuales** la ADMINISTRA (Administración → Distribución de soportes y el Mapa
 *     de responsables) y la usa para asignar controles y bitácoras, filtrar el inventario
 *     operativo y decidir qué ve cada Técnico de Soporte.
 *   · **Gestión de Equipos** la CONSUME: al crear el expediente único solo ofrece como Técnico de
 *     Configuración a los responsables del requerimiento, y al aceptarse la entrega determina con
 *     ella el soporte responsable posterior.
 *
 * ## La regla territorial
 *
 * La organización es `Zona → Departamento → Dirección/Registro`, y la distribución **no se lleva
 * igual en todas partes**:
 *
 * · En los departamentos marcados `porDireccion` en el catálogo (hoy, **San Salvador**) cada
 *   asignación es de una **Dirección/Registro** concreta: quien responde por el Registro de
 *   Comercio no responde por el IGCN.
 * · En **los demás departamentos** la asignación es del **departamento completo**: quien responde
 *   por Santa Ana atiende sus cuatro Direcciones/Registros, y no se le asigna ninguna una por una.
 *
 * De ahí que `deDireccionUnidad('Santa Ana', 'ISPI')` devuelva al responsable departamental
 * aunque nadie lo haya asignado nunca al ISPI: es exactamente lo que el negocio pide, y es lo que
 * hace que Gestión de Equipos ofrezca el Técnico de Configuración correcto sin lógica propia.
 *
 * **Todo se compara por ID, nunca por el texto visible.** Cada asignación guarda `tecnicoId`,
 * `departamentoId`, `direccionRegistroId` y el `unidadId` del ámbito (`SS::SS-RC`, `STA::*`); los
 * nombres se conservan solo para mostrarlos y para poder migrar los registros anteriores.
 *
 * Aquí viven únicamente las consultas y las escrituras planas; las reglas de negocio de cada
 * módulo (quién puede modificar, qué pasa con los equipos activos) quedan en su propio servicio.
 */
@Injectable({ providedIn: 'root' })
export class SupportDistributionService {
  /** Transporte entre módulos: `localStorage` bajo la clave del ecosistema. */
  readonly compartida = inject(SharedDistributionService);

  /** Catálogo territorial: es quien resuelve todo texto a su ID estable. */
  readonly territorio = inject(TerritorioService);

  /** Registro compartido completo, incluidas las asignaciones desactivadas (historial). */
  readonly registros = signal<DistribucionSoporte[]>([]);

  /** Vista plana del catálogo, conservada para las pantallas que aún la usan. */
  readonly organizacion = signal<DireccionOrganizacion[]>([]);

  readonly activas = computed(() => this.registros().filter((d) => d.activo));

  cargar(lista: DistribucionSoporte[]): void { this.registros.set(lista.map((d) => this.normalizar(d))); }

  cargarOrganizacion(lista: DireccionOrganizacion[]): void { this.organizacion.set(lista); }

  // ------------------------------------------------------------------ IDs estables

  /** Minúsculas, sin tildes y con guiones: la base de todo ID derivado de un nombre. */
  slug(texto: string): string { return this.territorio.slug(texto); }

  /** Solo el nombre del técnico, sin el « — Rol» con el que se guarda. */
  soloNombre(tecnico: string): string { return (tecnico ?? '').split('—')[0].trim(); }

  /**
   * ID estable del Técnico de Soporte: el slug de su nombre (`wendy-carranza`). Acepta el ID ya
   * hecho, el nombre suelto o el «Nombre — Rol» con el que viaja entre módulos.
   */
  idTecnico(tecnico: string): string { return this.slug(this.soloNombre(tecnico)); }

  /**
   * ID estable del **departamento**. Acepta el ID del catálogo (`SS`), su sigla o el nombre
   * institucional. Se llama `idDireccion` porque es lo que el resto del sistema llama «Dirección».
   */
  idDireccion(departamento: string): string { return this.territorio.idDepartamento(departamento); }

  /** ID estable de la Dirección/Registro dentro de su departamento (`SS-RC`); '' si no aplica. */
  idRegistro(departamento: string, registro: string): string {
    return this.territorio.idRegistro(departamento, registro);
  }

  /**
   * ID del **ámbito**: `SS::SS-RC` cuando es una Dirección/Registro y `STA::*` cuando es el
   * departamento completo. Es la clave con la que se comparan controles, bitácoras e inventario.
   */
  idUnidad(departamento: string, registro: string): string {
    return this.territorio.idAmbito(departamento, registro);
  }

  /** Nombre institucional del departamento a partir de su ID (o el texto recibido). */
  nombreDireccion(departamento: string): string {
    return this.territorio.nombreDepartamento(this.idDireccion(departamento));
  }

  /** Sigla del departamento, para etiquetas y chips. */
  cortaDireccion(departamento: string): string {
    return this.territorio.departamento(departamento)?.corta ?? this.nombreDireccion(departamento);
  }

  /** «San Salvador / Registro de Comercio» o «Santa Ana / Todo el departamento». */
  etiqueta(departamento: string, registro: string): string {
    return this.territorio.etiqueta(departamento, registro);
  }

  /** «Zona Central · San Salvador · Registro de Comercio». */
  ruta(departamento: string, registro: string): string {
    return this.territorio.ruta(departamento, registro);
  }

  /** Alcance que la regla territorial impone a un departamento. */
  tipoAsignacionDe(departamento: string): TipoAsignacion {
    return this.territorio.tipoAsignacionDe(departamento);
  }

  /** ¿Este departamento exige elegir una Dirección/Registro al asignar? */
  exigeRegistro(departamento: string): boolean {
    return this.territorio.distribuyePorDireccion(departamento);
  }

  /** Ámbito territorial completo de un par departamento/registro. */
  ambito(departamento: string, registro = ''): AmbitoTerritorial {
    return this.territorio.ambito(departamento, registro);
  }

  /**
   * Completa y corrige los IDs de un registro. La resolución por texto ocurre una sola vez, al
   * cargar; a partir de ahí todo se compara por ID. La regla territorial manda sobre lo guardado:
   * una asignación de un departamento que no se lleva por Dirección/Registro queda siempre como
   * departamental, aunque venga con un registro escrito.
   */
  normalizar(d: DistribucionSoporte): DistribucionSoporte {
    const dep = this.idDireccion(d.departamentoId || d.direccionId || d.direccion);
    const porDireccion = this.territorio.distribuyePorDireccion(dep);
    const reg = porDireccion
      ? (this.territorio.registro(d.direccionRegistroId ?? '')?.id ?? this.idRegistro(dep, d.unidad))
      : '';
    return {
      ...d,
      tecnicoId: d.tecnicoId || this.idTecnico(d.tecnico),
      tipoAsignacion: porDireccion ? 'DIRECCION_REGISTRO' : 'DEPARTAMENTO',
      zonaId: this.territorio.zonaDe(dep),
      departamentoId: dep,
      direccionRegistroId: reg || null,
      direccionId: dep,
      unidadId: `${dep}::${reg || ALCANCE_DEPARTAMENTO}`,
      direccion: this.territorio.nombreDepartamento(dep),
      unidad: reg ? this.territorio.nombreRegistro(reg) : ETIQUETA_TODO_EL_DEPARTAMENTO
    };
  }

  // ------------------------------------------------------------------ consultas

  /**
   * Asignaciones vigentes que **cubren** una Dirección/Registro. Aquí vive la regla territorial:
   * cuenta la asignación exacta de ese Registro y también la del departamento completo, porque
   * fuera de San Salvador el responsable del departamento responde por todos sus Registros.
   */
  deDireccionUnidad(departamento: string, registro: string): DistribucionSoporte[] {
    const dep = this.idDireccion(departamento);
    if (!dep) return [];
    const ambito = this.idUnidad(dep, registro);
    const departamental = `${dep}::${ALCANCE_DEPARTAMENTO}`;
    return this.activas().filter((d) => d.unidadId === ambito || d.unidadId === departamental);
  }

  /** Asignaciones —vigentes e históricas— que cubren esa Dirección/Registro. */
  historialDe(departamento: string, registro: string): DistribucionSoporte[] {
    const dep = this.idDireccion(departamento);
    if (!dep) return [];
    const ambito = this.idUnidad(dep, registro);
    const departamental = `${dep}::${ALCANCE_DEPARTAMENTO}`;
    return this.registros().filter((d) => d.unidadId === ambito || d.unidadId === departamental);
  }

  /** Asignaciones vigentes registradas **exactamente** sobre ese ámbito, sin heredar del departamento. */
  exactasDe(departamento: string, registro: string): DistribucionSoporte[] {
    const ambito = this.idUnidad(departamento, registro);
    return this.activas().filter((d) => d.unidadId === ambito);
  }

  /** Asignaciones vigentes de todo un departamento (departamentales y por Dirección/Registro). */
  deDireccion(departamento: string): DistribucionSoporte[] {
    const dep = this.idDireccion(departamento);
    return this.activas().filter((d) => d.departamentoId === dep);
  }

  /** Técnicos responsables de una Dirección/Registro, en formato «Nombre — Rol». */
  tecnicosDe(departamento: string, registro: string): string[] {
    return this.deDireccionUnidad(departamento, registro).map((d) => d.tecnico);
  }

  /** Ámbitos que atiende un técnico (por ID, por nombre o por «Nombre — Rol»). */
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

  /**
   * Direcciones/Registros que un técnico cubre **en la práctica**: las suyas por asignación
   * directa más todas las del departamento cuando su asignación es departamental. Es lo que la
   * pantalla del técnico debe mostrarle, no la lista cruda de sus asignaciones.
   */
  cobertura(tecnico: string): { departamentoId: string; direccionRegistroId: string }[] {
    const salida: { departamentoId: string; direccionRegistroId: string }[] = [];
    for (const d of this.deTecnico(tecnico)) {
      if (d.direccionRegistroId) {
        salida.push({ departamentoId: d.departamentoId, direccionRegistroId: d.direccionRegistroId });
        continue;
      }
      for (const r of this.territorio.registrosDe(d.departamentoId)) {
        salida.push({ departamentoId: d.departamentoId, direccionRegistroId: r.id });
      }
    }
    return salida;
  }

  /** ¿Este técnico cubre esa Dirección/Registro, sea por asignación directa o departamental? */
  atiende(tecnico: string, departamento: string, registro: string): boolean {
    const id = this.idTecnico(tecnico);
    if (!id) return false;
    return this.deDireccionUnidad(departamento, registro).some((d) => d.tecnicoId === id);
  }

  /** ¿Atiende alguna Dirección/Registro de ese departamento? */
  atiendeDireccion(tecnico: string, departamento: string): boolean {
    const id = this.idTecnico(tecnico);
    if (!id) return false;
    return this.deDireccion(departamento).some((d) => d.tecnicoId === id);
  }

  /**
   * ¿Existe ya esta responsabilidad vigente? Se comprueba sobre el ámbito **exacto**: dos
   * asignaciones al mismo ámbito son el duplicado que hay que impedir, mientras que asignar a un
   * técnico un Registro de San Salvador y además otro departamento completo es lo normal.
   */
  duplicada(tecnico: string, departamento: string, registro: string): boolean {
    const id = this.idTecnico(tecnico);
    if (!id) return false;
    return this.exactasDe(departamento, registro).some((d) => d.tecnicoId === id);
  }

  /**
   * Soporte responsable de una Dirección/Registro. Si el técnico indicado como preferido
   * (normalmente el que configuró el equipo) la cubre, es él; si no, el primero vigente, dando
   * precedencia a quien la tiene asignada directamente sobre el responsable departamental.
   */
  responsableDe(departamento: string, registro: string, preferido = ''): string {
    const lista = this.deDireccionUnidad(departamento, registro);
    if (!lista.length) return '';
    if (preferido) {
      const id = this.idTecnico(preferido);
      const propio = lista.find((d) => d.tecnicoId === id);
      if (propio) return propio.tecnico;
    }
    return (lista.find((d) => !!d.direccionRegistroId) ?? lista[0]).tecnico;
  }

  /** Ámbitos presentes en el registro (vigentes o históricos). */
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

  // ------------------------------------------------------------------ fuente compartida

  /** El rol con el que se guardó el técnico («Nombre — Rol»); '' si no lo trae. */
  rolDe(tecnico: string): string {
    const partes = (tecnico ?? '').split('—');
    return partes.length > 1 ? partes.slice(1).join('—').trim() : '';
  }

  /** Una asignación, en la forma con la que viaja entre módulos. */
  aCompartida(d: DistribucionSoporte): AsignacionSoporteCompartida {
    const normal = this.normalizar(d);
    return {
      id: normal.id,
      tecnicoId: normal.tecnicoId,
      tecnicoNombre: this.soloNombre(normal.tecnico),
      tecnicoRol: this.rolDe(normal.tecnico) || 'Técnico de Soporte',
      tipoAsignacion: normal.tipoAsignacion,
      zonaId: normal.zonaId,
      departamentoId: normal.departamentoId,
      direccionRegistroId: normal.direccionRegistroId,
      direccionId: normal.direccionId,
      direccionNombre: normal.direccion,
      unidadId: normal.unidadId,
      unidadNombre: normal.unidad,
      activo: normal.activo,
      fechaInicio: normal.fecha,
      horaInicio: normal.hora,
      observaciones: normal.observacion,
      asignadoPor: normal.asignadoPor,
      desactivadaPor: normal.desactivadaPor,
      fechaDesactivacion: normal.fechaDesactivacion,
      motivoDesactivacion: normal.motivoDesactivacion
    };
  }

  /** El camino de vuelta: lo recibido se reconstruye sin volver a resolver ningún texto. */
  desdeCompartida(a: AsignacionSoporteCompartida): DistribucionSoporte {
    return {
      id: a.id,
      tecnicoId: a.tecnicoId,
      tipoAsignacion: a.tipoAsignacion ?? 'DEPARTAMENTO',
      zonaId: a.zonaId ?? '',
      departamentoId: a.departamentoId ?? a.direccionId,
      direccionRegistroId: a.direccionRegistroId ?? null,
      direccionId: a.direccionId,
      unidadId: a.unidadId,
      direccion: a.direccionNombre,
      unidad: a.unidadNombre,
      tecnico: `${a.tecnicoNombre} — ${a.tecnicoRol}`,
      asignadoPor: a.asignadoPor,
      fecha: a.fechaInicio,
      hora: a.horaInicio ?? '',
      activo: a.activo,
      observacion: a.observaciones ?? '',
      desactivadaPor: a.desactivadaPor,
      fechaDesactivacion: a.fechaDesactivacion,
      motivoDesactivacion: a.motivoDesactivacion
    };
  }

  /**
   * Publica el registro completo en la fuente compartida. Lo llama Controles Mensuales cada vez
   * que se guarda un cambio: es lo que hace que Gestión de Equipos vea la distribución nueva sin
   * que nadie pulse nada. Devuelve la marca de tiempo escrita.
   */
  publicar(): string {
    return this.compartida.guardar(this.registros().map((d) => this.aCompartida(d)));
  }

  /**
   * Adopta lo que venga de la fuente compartida. Devuelve `true` solo si algo cambió, para que
   * quien llama sepa si tiene que recalcular o puede quedarse quieto: se consulta muchas veces
   * (al arrancar, al enfocar la ventana, al abrir un formulario) y casi siempre no hay novedad.
   */
  adoptar(lista: AsignacionSoporteCompartida[]): boolean {
    if (!lista.length) return false;
    const nuevos = lista.map((a) => this.normalizar(this.desdeCompartida(a)));
    const igual = JSON.stringify(nuevos) === JSON.stringify(this.registros());
    if (igual) return false;
    this.registros.set(nuevos);
    return true;
  }

  /** Adopta lo guardado en ESTE origen, si lo hay y si es de esta versión del contrato. */
  adoptarDelOrigen(): boolean {
    return this.compartida.vigente() ? this.adoptar(this.compartida.leer()) : false;
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
