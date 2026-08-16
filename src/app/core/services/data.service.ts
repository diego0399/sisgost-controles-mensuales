import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ActividadDia, BitacoraDiaria, ControlCatalogo, ControlMes, Direccion, DistribucionSoporte,
  DocumentoGenerado, EquipoOperativo, EstadoControl, EventoIntegracion, EventoTrazabilidad,
  Justificacion, RespuestaSeccion, RevisionAtencion, UsuarioSistema, isoLocal, nombreMes
} from '../models/models';
import { HolidayService } from './holiday.service';
import { BusinessDayService } from './business-day.service';
import { ControlDeadlineService } from './control-deadline.service';

const STORAGE_KEY = 'sisgost.controles.v1';

/** Hora límite institucional de la bitácora diaria. */
export const HORA_LIMITE_BITACORA = '17:00';

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
}

/**
 * Almacén único de SISGOST — Controles Mensuales. Carga la semilla JSON de assets/data,
 * conserva los cambios de la sesión en localStorage y concentra todas las reglas de negocio:
 * entrega dentro de los primeros 3 días hábiles, bitácora antes de las 5:00 p. m.,
 * justificación obligatoria cuando no hay actividad y la integración con Gestión de Equipos.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly feriadosSrv = inject(HolidayService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);

  readonly listo = signal(false);

  readonly usuarios = signal<UsuarioSistema[]>([]);
  readonly direcciones = signal<Direccion[]>([]);
  readonly catalogo = signal<ControlCatalogo[]>([]);
  readonly distribucion = signal<DistribucionSoporte[]>([]);
  readonly controles = signal<ControlMes[]>([]);
  readonly bitacoras = signal<BitacoraDiaria[]>([]);
  readonly justificaciones = signal<Justificacion[]>([]);
  readonly inventario = signal<EquipoOperativo[]>([]);
  readonly eventosIntegracion = signal<EventoIntegracion[]>([]);
  readonly documentos = signal<DocumentoGenerado[]>([]);
  readonly trazabilidad = signal<EventoTrazabilidad[]>([]);

  private secuencia = 1000;

  // ------------------------------------------------------------------ carga y persistencia

  async cargar(): Promise<void> {
    if (this.listo()) return;
    await this.feriadosSrv.cargar();

    const [usuarios, direcciones, catalogo] = await Promise.all([
      this.json<UsuarioSistema[]>('usuarios-sistema'),
      this.json<Direccion[]>('direcciones'),
      this.json<ControlCatalogo[]>('catalogo-controles')
    ]);
    this.usuarios.set(usuarios);
    this.direcciones.set(direcciones);
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
      this.distribucion.set(guardado.distribucion);
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
      this.distribucion.set(distribucion);
    }

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
      documentos: this.documentos(), trazabilidad: this.trazabilidad(), distribucion: this.distribucion()
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* cuota llena: la sesión sigue en memoria */ }
  }

  /** Restablece la semilla original (Administración). */
  reiniciarDatos(): void {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }

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

  /** Crea la bitácora «Pendiente» del día para cada Dirección con soporte activo (solo días hábiles). */
  private asegurarBitacorasDeHoy(): void {
    const hoy = isoLocal(new Date());
    if (!this.habiles.esHabil(hoy)) return;
    const cubiertas = new Set(this.bitacoras().filter((b) => b.fecha === hoy).map((b) => b.direccion));
    const nuevas: BitacoraDiaria[] = [];
    for (const dir of new Set(this.distribucion().filter((d) => d.estado === 'Activa').map((d) => d.direccion))) {
      if (cubiertas.has(dir)) continue;
      const responsable = this.soporteDe(dir)?.tecnico ?? 'Sin asignar';
      nuevas.push({
        id: this.idNuevo('BIT'), fecha: hoy, direccion: dir, unidad: 'Atención al público', responsable,
        estado: 'Pendiente',
        revision: ELEMENTOS_ATENCION.map((elemento) => ({ elemento, estado: '' as const })),
        actividades: [], observaciones: ''
      });
    }
    if (nuevas.length) this.bitacoras.update((l) => [...l, ...nuevas]);
  }

  private idNuevo(prefijo: string): string {
    return `${prefijo}-${new Date().getFullYear()}-${String(++this.secuencia).padStart(4, '0')}`;
  }

  // ------------------------------------------------------------------ consultas de organización

  direccionDe(id: string): Direccion | undefined { return this.direcciones().find((d) => d.id === id); }
  nombreDireccion(id: string): string { return this.direccionDe(id)?.nombre ?? id; }
  cortaDireccion(id: string): string { return this.direccionDe(id)?.corta ?? id; }
  catalogoDe(codigo: string): ControlCatalogo | undefined { return this.catalogo().find((c) => c.codigo === codigo); }

  /** Distribución activa de una Dirección (el primer soporte responsable). */
  soporteDe(direccion: string): DistribucionSoporte | undefined {
    return this.distribucion().find((d) => d.direccion === direccion && d.estado === 'Activa');
  }

  /** Direcciones asignadas a un técnico según la distribución activa. */
  direccionesDe(usuario: string): string[] {
    return [...new Set(this.distribucion().filter((d) => d.usuario === usuario && d.estado === 'Activa').map((d) => d.direccion))];
  }

  /** Direcciones activas sin ningún soporte responsable: alerta del panel ejecutivo. */
  readonly direccionesSinSoporte = computed(() =>
    this.direcciones().filter((d) => d.activa && !this.distribucion().some((x) => x.direccion === d.id && x.estado === 'Activa')));

  /** El Técnico de Soporte solo ve sus Direcciones; los demás roles ven todo. */
  controlesVisibles(u: UsuarioSistema | null): ControlMes[] {
    if (!u) return [];
    if (u.clave !== 'tec-soporte') return this.controles();
    const propias = this.direccionesDe(u.usuario);
    return this.controles().filter((c) => propias.includes(c.direccion));
  }

  bitacorasVisibles(u: UsuarioSistema | null): BitacoraDiaria[] {
    if (!u) return [];
    if (u.clave !== 'tec-soporte') return this.bitacoras();
    const propias = this.direccionesDe(u.usuario);
    return this.bitacoras().filter((b) => propias.includes(b.direccion));
  }

  // ------------------------------------------------------------------ ciclo de vida del control

  controlPorId(id: string): ControlMes | undefined { return this.controles().find((c) => c.id === id); }

  private actualizaControl(id: string, cambio: (c: ControlMes) => ControlMes): void {
    this.controles.update((lista) => lista.map((c) => (c.id === id ? cambio(c) : c)));
    this.persistir();
  }

  iniciarControl(id: string, u: UsuarioSistema): void {
    const c = this.controlPorId(id);
    if (!c || !['Programado', 'Pendiente'].includes(c.estado)) return;
    this.actualizaControl(id, (x) => ({ ...x, estado: 'En proceso', responsable: u.clave === 'tec-soporte' ? u.nombre : x.responsable }));
    this.registrarEvento(u, { direccion: c.direccion, tipoControl: c.codigo, mes: c.mes, anio: c.anio, accion: 'Control iniciado', estadoAnterior: c.estado, estadoNuevo: 'En proceso' });
  }

  guardarAvance(id: string, secciones: RespuestaSeccion[], evidencias: ControlMes['evidencias'], observaciones: string): void {
    this.actualizaControl(id, (c) => ({
      ...c, secciones, evidencias, observaciones,
      estado: c.estado === 'Programado' || c.estado === 'Pendiente' ? 'En proceso' : c.estado,
      avance: this.calculaAvance(c.codigo, secciones)
    }));
  }

  /** Avance = proporción de secciones de la plantilla con alguna respuesta. */
  private calculaAvance(codigo: string, secciones: RespuestaSeccion[]): number {
    const plantilla = this.catalogoDe(codigo)?.plantilla ?? [];
    if (!plantilla.length) return secciones.length ? 100 : 0;
    let conRespuesta = 0;
    for (const p of plantilla) {
      const r = secciones.find((s) => s.titulo === p.titulo);
      if (!r) continue;
      const tiene = (r.campos?.some((x) => x.valor.trim()) ?? false)
        || (r.items?.some((x) => x.estado) ?? false)
        || ((r.filas?.length ?? 0) > 0);
      if (tiene) conRespuesta++;
    }
    return Math.round((conRespuesta / plantilla.length) * 100);
  }

  /**
   * Valida que el control pueda entregarse: campos obligatorios, mínimos de tabla, checklist
   * completo y evidencia cuando el catálogo la exige. Devuelve la lista de faltantes (vacía = ok).
   */
  validarEntrega(c: ControlMes): string[] {
    const faltas: string[] = [];
    const cat = this.catalogoDe(c.codigo);
    for (const p of cat?.plantilla ?? []) {
      const r = c.secciones.find((s) => s.titulo === p.titulo);
      for (const campo of p.campos ?? []) {
        if (campo.obligatorio && !(r?.campos?.find((x) => x.id === campo.id)?.valor ?? '').trim()) {
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
    }
    if (cat?.requiereEvidencia && !c.evidencias.length) faltas.push('Este control requiere al menos una evidencia.');
    return faltas;
  }

  /** Entrega el control: estado según el plazo, documento formal y trazabilidad. */
  entregarControl(id: string, u: UsuarioSistema): { ok: boolean; faltas: string[]; estado?: EstadoControl } {
    const c = this.controlPorId(id);
    if (!c) return { ok: false, faltas: ['El control no existe.'] };
    const faltas = this.validarEntrega(c);
    if (faltas.length) return { ok: false, faltas };
    const hoy = isoLocal(new Date());
    const estado = this.plazos.evaluaEntrega(c, hoy);
    const doc = this.generaDocumento({
      tipo: 'Control mensual',
      nombre: `${c.codigo} — ${c.semana ? `Semana ${c.semana} de ` : ''}${nombreMes(c.mes)} ${c.anio}`,
      codigo: c.codigo, generadoPor: u.nombre, direccion: c.direccion, mes: c.mes, anio: c.anio, referencia: c.id
    });
    this.actualizaControl(id, (x) => ({
      ...x, estado, fechaEntrega: hoy, avance: 100, documento: doc,
      horaEntrega: new Date().toTimeString().slice(0, 5)
    }));
    this.registrarEvento(u, {
      direccion: c.direccion, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
      accion: estado === 'Entregado' ? 'Control entregado' : 'Control entregado tarde',
      estadoAnterior: c.estado, estadoNuevo: estado, documento: doc,
      observacion: estado === 'Entregado tarde' ? 'Entrega registrada fuera del plazo de los primeros tres días hábiles.' : undefined
    });
    return { ok: true, faltas: [], estado };
  }

  /** Cierra un control sin actividad mediante carta de justificación (regla: nunca queda vacío). */
  justificarControl(id: string, motivo: string, texto: string, u: UsuarioSistema): { ok: boolean; error?: string } {
    const c = this.controlPorId(id);
    if (!c) return { ok: false, error: 'El control no existe.' };
    if (!this.catalogoDe(c.codigo)?.permiteJustificacion) return { ok: false, error: 'Este control no admite justificación.' };
    if (!motivo.trim() || !texto.trim()) return { ok: false, error: 'La justificación requiere motivo y texto de la carta.' };
    const hoy = isoLocal(new Date());
    const j: Justificacion = {
      id: this.idNuevo('JUS'), codigoControl: c.codigo, anio: c.anio, mes: c.mes, direccion: c.direccion,
      responsable: u.nombre, motivo: motivo.trim(), texto: texto.trim(), fecha: hoy, estado: 'Emitida',
      firmas: [
        { nombre: u.nombre, cargo: u.cargo, estado: 'Registrada' },
        { nombre: 'Carlos Armando González', cargo: 'Coordinador de Soporte Técnico', estado: 'Pendiente' },
        { nombre: 'Yancy Claribel Moreno', cargo: 'Jefe del Departamento de Soporte Técnico', estado: 'Pendiente' }
      ]
    };
    j.documento = this.generaDocumento({
      tipo: 'Justificación', nombre: `Carta de justificación — ${c.codigo} — ${nombreMes(c.mes)} ${c.anio}`,
      codigo: c.codigo, generadoPor: u.nombre, direccion: c.direccion, mes: c.mes, anio: c.anio, referencia: j.id
    });
    this.justificaciones.update((l) => [j, ...l]);
    this.actualizaControl(id, (x) => ({ ...x, estado: 'Justificado', justificacion: j.id, fechaEntrega: hoy }));
    this.registrarEvento(u, {
      direccion: c.direccion, tipoControl: c.codigo, mes: c.mes, anio: c.anio, accion: 'Control justificado',
      estadoAnterior: c.estado, estadoNuevo: 'Justificado', documento: j.documento,
      observacion: 'No se registró actividad mensual asociada a este control; se generó carta de justificación.'
    });
    return { ok: true };
  }

  /** Revisión del Encargado: observa (devuelve) o cierra un control entregado. */
  revisarControl(id: string, veredicto: 'Cerrado' | 'Observado', observacion: string, u: UsuarioSistema): void {
    const c = this.controlPorId(id);
    if (!c || !['Entregado', 'Entregado tarde', 'En revisión', 'Observado'].includes(c.estado)) return;
    this.actualizaControl(id, (x) => ({ ...x, estado: veredicto, observaciones: veredicto === 'Observado' ? observacion : x.observaciones }));
    this.registrarEvento(u, {
      direccion: c.direccion, tipoControl: c.codigo, mes: c.mes, anio: c.anio,
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
    const faltas = this.validarBitacora(b);
    if (faltas.length) return { ok: false, faltas };
    const ahora = new Date();
    const hora = ahora.toTimeString().slice(0, 5);
    const hoy = isoLocal(ahora);
    const tarde = b.fecha < hoy || hora > HORA_LIMITE_BITACORA;
    const estado = tarde ? 'Enviada tarde' as const : 'Enviada' as const;
    const doc = this.generaDocumento({
      tipo: 'Bitácora diaria', nombre: `Bitácora diaria — ${b.fecha.split('-').reverse().join('/')} — ${this.cortaDireccion(b.direccion)}`,
      codigo: 'BITACORA', generadoPor: u.nombre, direccion: b.direccion, mes: Number(b.fecha.split('-')[1]), anio: Number(b.fecha.split('-')[0]), referencia: b.id
    });
    this.bitacoras.update((l) => l.map((x) => (x.id === id ? { ...x, estado, horaEnvio: hora, documento: doc } : x)));
    this.persistir();
    this.registrarEvento(u, {
      direccion: b.direccion, tipoControl: 'Bitácora diaria', mes: Number(b.fecha.split('-')[1]), anio: Number(b.fecha.split('-')[0]),
      accion: tarde ? 'Bitácora enviada tarde' : 'Bitácora enviada', estadoAnterior: b.estado, estadoNuevo: estado, documento: doc,
      observacion: tarde ? 'La bitácora diaria fue enviada fuera del horario establecido.' : undefined
    });
    return { ok: true, faltas: [], estado };
  }

  // ------------------------------------------------------------------ integración con Gestión de Equipos

  /**
   * Aplica un evento pendiente de Gestión de Equipos: una entrega aceptada incorpora el equipo
   * al inventario operativo de su Dirección/Unidad; un descargo lo retira del inventario activo.
   */
  aplicarEventoIntegracion(id: string, u: UsuarioSistema): void {
    const ev = this.eventosIntegracion().find((e) => e.id === id);
    if (!ev || ev.aplicado) return;
    if (ev.tipo === 'Entrega aceptada') {
      this.inventario.update((l) => [ev.equipo, ...l.filter((e) => e.inventario !== ev.equipo.inventario)]);
      this.registrarEvento(u, {
        direccion: ev.equipo.direccion, accion: 'Equipo agregado desde Gestión de Equipos',
        observacion: `El equipo ${ev.equipo.inventario} fue incorporado al inventario operativo de la Dirección/Unidad posterior a la aceptación del Usuario Final (${ev.expedienteUnico}).`
      });
    } else {
      this.inventario.update((l) => l.map((e) => (e.inventario === ev.equipo.inventario
        ? { ...e, estado: 'Descargado' as const, ultimoControl: `Descargo · ${nombreMes(new Date().getMonth() + 1)} ${new Date().getFullYear()}` }
        : e)));
      this.registrarEvento(u, {
        direccion: ev.equipo.direccion, accion: 'Equipo descargado desde Gestión de Equipos',
        observacion: `El equipo ${ev.equipo.inventario} dejó de estar activo en la Dirección/Unidad por descargo registrado en Gestión de Equipos (${ev.expedienteUnico}).`
      });
    }
    this.eventosIntegracion.update((l) => l.map((e) => (e.id === id ? { ...e, aplicado: true } : e)));
    this.persistir();
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
    this.registrarEvento(u, { direccion: d.direccion, tipoControl: d.codigo, mes: d.mes, anio: d.anio, accion: 'Documento descargado', documento: idDoc });
  }

  /** Reporte mensual consolidado de una Dirección (o de todas) para presentar a jefaturas. */
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

  registrarEvento(u: UsuarioSistema | null, e: Partial<EventoTrazabilidad> & { accion: string }): void {
    const ahora = new Date();
    const evento: EventoTrazabilidad = {
      id: this.idNuevo('TRZ'), fecha: isoLocal(ahora), hora: ahora.toTimeString().slice(0, 5),
      usuario: u?.usuario ?? 'sistema', rol: u?.rol ?? 'Sistema', ...e
    };
    this.trazabilidad.update((l) => [evento, ...l]);
    this.persistir();
  }

  // ------------------------------------------------------------------ administración

  guardarDistribucion(d: DistribucionSoporte, u: UsuarioSistema): void {
    this.distribucion.update((l) => {
      const existe = l.some((x) => x.id === d.id);
      return existe ? l.map((x) => (x.id === d.id ? d : x)) : [...l, { ...d, id: this.idNuevo('DIS') }];
    });
    this.persistir();
    this.registrarEvento(u, {
      direccion: d.direccion, accion: d.estado === 'Activa' ? 'Soporte asignado a Dirección/Unidad' : 'Cambio de responsable',
      observacion: `${d.tecnico} · ${this.nombreDireccion(d.direccion)} · ${d.unidad} (${d.estado.toLowerCase()}).`
    });
  }

  actualizarCatalogo(c: ControlCatalogo, u: UsuarioSistema): void {
    this.catalogo.update((l) => l.map((x) => (x.codigo === c.codigo ? c : x)));
    this.registrarEvento(u, { tipoControl: c.codigo, accion: 'Catálogo de controles actualizado', observacion: `${c.codigo}: frecuencia ${c.frecuencia.toLowerCase()}, ${c.activo ? 'activo' : 'inactivo'}.` });
  }
}
