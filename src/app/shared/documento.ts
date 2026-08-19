import { Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../core/services/auth.service';
import { DataService } from '../core/services/data.service';
import { KpiDireccion, OperatividadService } from '../core/services/operatividad.service';
import { ToastService } from '../core/services/toast.service';
import {
  BitacoraDiaria, ControlMes, DocumentoGenerado, Justificacion, formateaFecha, nombreMes
} from '../core/models/models';
import { CampoDoc, EvidenciaDoc, FirmaDoc, SeccionDoc, VisorDocumentoComponent } from './visor-documento';

/**
 * Abre cualquier documento generado del sistema en el visor institucional. Recibe el id del
 * `DocumentoGenerado`, resuelve el registro de origen (control, bitácora, justificación o
 * reporte consolidado) y arma las secciones de la hoja. Todos los módulos comparten este
 * componente: por eso todos los documentos se ven idénticos.
 */
@Component({
  selector: 'ui-documento',
  imports: [VisorDocumentoComponent],
  template: `
    @if (doc(); as d) {
      <ui-visor-documento
        [abierto]="true"
        [nombre]="d.nombre"
        [subtitulo]="subtitulo()"
        [codigo]="etiquetaCodigo(d)"
        [fecha]="formatea(d.fecha)"
        [hora]="d.hora"
        [generadoPor]="d.generadoPor"
        [estado]="d.estado"
        [huella]="d.hash"
        [referencia]="d.referencia"
        [secciones]="secciones()"
        [evidencias]="evidencias()"
        [firmas]="firmas()"
        (descargar)="descargar()"
        (cerrar)="cerrado.emit()" />
    }
  `
})
export class DocumentoComponent {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly oper = inject(OperatividadService);
  private readonly toast = inject(ToastService);

  /** Id del documento generado; vacío = cerrado. */
  readonly id = input('');
  readonly cerrado = output<void>();

  protected readonly doc = computed<DocumentoGenerado | undefined>(() =>
    this.id() ? this.data.documentoPorId(this.id()) : undefined);

  private readonly control = computed<ControlMes | undefined>(() => {
    const d = this.doc();
    return d?.tipo === 'Control mensual' ? this.data.controlPorId(d.referencia) : undefined;
  });
  private readonly bitacora = computed<BitacoraDiaria | undefined>(() => {
    const d = this.doc();
    return d?.tipo === 'Bitácora diaria' ? this.data.bitacoraPorId(d.referencia) : undefined;
  });
  private readonly justificacion = computed<Justificacion | undefined>(() => {
    const d = this.doc();
    return d?.tipo === 'Justificación' ? this.data.justificaciones().find((j) => j.id === d.referencia) : undefined;
  });

  protected readonly versionCatalogo = computed(() => {
    const d = this.doc();
    const v = d ? this.data.catalogoDe(d.codigo)?.version ?? '' : '';
    return v === '—' ? '' : v;
  });

  protected readonly subtitulo = computed(() => {
    const d = this.doc();
    if (!d) return '';
    const dir = d.direccion === 'Todas'
      ? 'Todas las Direcciones/Unidades'
      : this.data.dirUnidad(d.direccion, d.unidad ?? '');
    return `${dir} · ${nombreMes(d.mes)} ${d.anio}`;
  });

  protected formatea(iso: string): string { return formateaFecha(iso); }

  /** Qué se escribe en «Código del formato» de la hoja según el tipo de documento. */
  protected etiquetaCodigo(d: DocumentoGenerado): string {
    if (d.codigo === 'BITACORA') return 'Bitácora diaria';
    if (d.codigo === 'REPORTE') return d.tipo.endsWith('por Dirección') ? 'Reporte por Dirección' : 'Reporte consolidado';
    return d.codigo + (this.versionCatalogo() ? ' ' + this.versionCatalogo() : '');
  }

  /** Cargo institucional del responsable, tomado del directorio compartido. */
  private cargoDe(nombre: string): string {
    return this.data.usuarios().find((u) => u.nombre === nombre)?.cargo ?? 'Técnico de Soporte Técnico';
  }

  // ------------------------------------------------------------------ armado de secciones

  protected readonly secciones = computed<SeccionDoc[]>(() => {
    const d = this.doc();
    if (!d) return [];
    if (this.control()) return this.seccionesControl(this.control()!);
    if (this.bitacora()) return this.seccionesBitacora(this.bitacora()!);
    if (this.justificacion()) return this.seccionesJustificacion(this.justificacion()!);
    if (d.tipo === 'Reporte mensual consolidado') return this.seccionesReporte(d);
    if (d.tipo.startsWith('Reporte') && d.tipo.endsWith('por Dirección')) return this.seccionesReporteDireccion(d);
    return [];
  });

  private seccionDatos(direccion: string, unidad: string, responsable: string, extra: CampoDoc[] = []): SeccionDoc {
    return {
      titulo: 'Datos generales',
      campos: [
        { etiqueta: 'Dirección/Unidad', valor: this.data.dirUnidad(direccion, unidad) },
        { etiqueta: 'Responsable', valor: responsable },
        ...extra
      ]
    };
  }

  /** Traduce las respuestas del control a secciones de la hoja usando las etiquetas de la plantilla. */
  private seccionesControl(c: ControlMes): SeccionDoc[] {
    const cat = this.data.catalogoDe(c.codigo);
    const salida: SeccionDoc[] = [this.seccionDatos(c.direccion, c.unidad, c.responsable, [
      { etiqueta: 'Control', valor: `${c.codigo} — ${cat?.nombre ?? ''}` },
      { etiqueta: 'Período', valor: `${c.semana ? `Semana ${c.semana} de ` : ''}${nombreMes(c.mes)} ${c.anio}` },
      { etiqueta: 'Frecuencia', valor: cat?.frecuencia ?? '—' },
      { etiqueta: 'Fecha límite de entrega', valor: formateaFecha(c.fechaLimite), mono: true },
      { etiqueta: 'Fecha de entrega', valor: c.fechaEntrega ? `${formateaFecha(c.fechaEntrega)}${c.horaEntrega ? ' · ' + c.horaEntrega : ''}` : 'Sin entrega registrada', mono: true },
      { etiqueta: 'Estado del control', valor: c.estado }
    ])];
    for (const p of cat?.plantilla ?? []) {
      // El paso de datos del control no se imprime: sus datos ya encabezan la hoja.
      if (p.datosControl) continue;
      const r = c.secciones.find((s) => s.titulo === p.titulo);
      const s: SeccionDoc = { titulo: p.titulo };
      if (p.campos?.length) {
        s.campos = p.campos.map((campo) => ({
          etiqueta: campo.etiqueta,
          valor: r?.campos?.find((x) => x.id === campo.id)?.valor ?? '',
          ancho: campo.tipo === 'area'
        }));
      }
      if (p.items?.length) {
        s.items = p.items.map((item) => {
          const resp = r?.items?.find((x) => x.id === item.id);
          return {
            nombre: item.nombre,
            estado: resp?.estado || 'Sin marcar',
            nota: [resp?.medicion ? `${item.medicion ?? 'Medición'}: ${resp.medicion}` : '', resp?.nota ?? ''].filter(Boolean).join(' · ') || undefined
          };
        });
      }
      if (p.tabla) {
        s.columnas = p.tabla.columnas;
        s.filas = r?.filas?.length ? r.filas : [];
        if (!s.filas.length) {
          delete s.columnas;
          delete s.filas;
          s.texto = 'Sin registros en el período. El detalle consta en las observaciones del control.';
        }
      }
      // Secciones que se imprimen DESPUÉS de la sección a la que pertenecen.
      const anexos: SeccionDoc[] = [];
      // Bitácora de ingresos al cuarto de servidores (F0234): el cuadro del formato, o la
      // constancia expresa de que el período no tuvo ingresos.
      if (p.ingresos) {
        const registros = (r?.ingresos ?? []).map((x) => this.data.normalizaIngreso(x))
          .filter((x) => !this.data.ingresoVacio(x));
        if (registros.length) {
          s.columnas = ['N.º', 'Fecha', 'Hora de entrada', 'Hora de salida', 'Tipo de ingreso', 'Carné',
            'Técnico de Soporte que ingresa', 'Cargo', 'Tipo de personal', 'Acompañante o visita',
            'Tipo de personal del acompañante', 'Cargo o institución del acompañante',
            'Anexa documento', 'Actividad o motivo de la visita'];
          s.filas = registros.map((x, i) => {
            // En el ingreso individual las tres columnas del acompañante se imprimen «No aplica»:
            // el formato no admite celdas en blanco que puedan leerse como un olvido.
            const acompanado = this.data.conAcompanante(x);
            return [
              String(i + 1), x.fecha ? formateaFecha(x.fecha) : '—', x.horaEntrada || '—', x.horaSalida || '—',
              x.tipoIngreso || '—', x.carne || '—', x.nombre || '—', x.cargo || '—', x.tipoPersonal || '—',
              acompanado ? `${x.acompanante || 'Sin nombre'}${x.carneAcompanante ? ' · ' + x.carneAcompanante : ''}` : 'No aplica',
              acompanado ? (x.tipoPersonalAcompanante || 'Sin clasificar') : 'No aplica',
              acompanado ? (x.cargoAcompanante || 'Sin cargo registrado') : 'No aplica',
              x.anexaDocumento || '—', x.motivo || '—'
            ];
          });
          const individuales = registros.filter((x) => !this.data.conAcompanante(x)).length;
          s.nota = `Un registro por cada ingreso al cuarto de servidores, con su hora de entrada y de salida. ${individuales} ingreso(s) individual(es) del Técnico de Soporte y ${registros.length - individuales} con acompañante.`;
          // Los documentos de respaldo se imprimen con la hoja: el formato los declara anexos.
          const conRespaldo = registros.filter((x) => x.anexaDocumento === 'Sí');
          const respaldo: SeccionDoc = {
            titulo: 'Documentos de respaldo',
            texto: conRespaldo.length
              ? 'Documento de respaldo anexo.'
              : 'No se anexó documento de respaldo.'
          };
          if (conRespaldo.length) {
            respaldo.columnas = ['Fecha', 'Nombre de quien ingresa', 'Archivo anexo'];
            respaldo.filas = conRespaldo.map((x) => [
              x.fecha ? formateaFecha(x.fecha) : '—', x.nombre || '—',
              x.documentoNombre || 'Imagen sin nombre de archivo'
            ]);
            respaldo.imagenes = conRespaldo.filter((x) => x.documentoImagen).map((x) => ({
              titulo: x.documentoNombre || 'Documento de respaldo',
              datos: x.documentoImagen,
              pie: `Ingreso de ${x.nombre || 'sin nombre'} · ${x.fecha ? formateaFecha(x.fecha) : 'sin fecha'}`
            }));
          }
          anexos.push(respaldo);
          const conObservacion = registros.filter((x) => x.observacion.trim());
          if (conObservacion.length) {
            anexos.push({
              titulo: 'Observaciones de los registros de ingreso',
              columnas: ['Fecha', 'Nombre de quien ingresa', 'Observación'],
              filas: conObservacion.map((x) => [x.fecha ? formateaFecha(x.fecha) : '—', x.nombre || '—', x.observacion])
            });
          }
        } else {
          s.texto = 'Durante el periodo evaluado no se registraron ingresos al cuarto de servidores.';
        }
      }
      // Muestra de equipos verificada ítem por ítem (F0382): primero el cuadro del formato con
      // sus cinco equipos y, debajo, el detalle de cada uno con sus incumplimientos.
      if (p.checklistEquipos) {
        const muestra = (r?.checklistEquipos ?? []).filter((e) => e.inventario.trim());
        if (muestra.length) {
          s.columnas = ['N.º', 'N° de inventario', 'Nombre del usuario', 'Nombre del equipo', 'IP',
            'Clasificación', 'Ítems incumplidos', 'Acción correctiva', 'Estado final'];
          s.filas = muestra.map((e, i) => {
            const eq = this.data.equipoDe(e.inventario);
            const malos = this.data.itemsIncumplidos(e);
            return [
              String(i + 1), e.inventario, eq?.usuarioFinal ?? '—', eq?.nombreEquipo ?? '—',
              eq?.ip ?? '—', e.clasificacion || '—',
              malos.length ? malos.map((m) => this.data.nombreItemSeguridad(p, m.id).split(' — ')[0]).join(', ') : 'Ninguno',
              malos.map((m) => m.accionCorrectiva).filter(Boolean).join(' · ') || '—',
              this.data.estadoFinalEquipo(p, e)
            ];
          });
          s.nota = 'Muestra de equipos activos de la Dirección/Unidad tomada del inventario operativo, proveniente de las entregas aceptadas en SISGOST — Gestión de Equipos.';
          for (const e of muestra) {
            const eq = this.data.equipoDe(e.inventario);
            anexos.push({
              titulo: `Equipo ${e.inventario} · ${eq?.nombreEquipo ?? 'sin nombre registrado'}`,
              columnas: ['Ítem verificado', 'Resultado', 'Observación (Obs)', 'Acción correctiva (AC)', 'Fecha', 'Estado final'],
              filas: e.items.filter((i) => i.cumplimiento).map((i) => [
                this.data.nombreItemSeguridad(p, i.id), i.cumplimiento,
                i.descripcion || i.justificacion || '—', i.accionCorrectiva || '—',
                i.fechaAccion ? formateaFecha(i.fechaAccion) : '—', i.estadoItem || '—'
              ]),
              nota: [
                `${eq?.usuarioFinal ?? 'Usuario no registrado'} · ${eq?.tipo ?? ''} ${eq?.marca ?? ''} ${eq?.modelo ?? ''}`.trim(),
                eq?.ip ? `IP ${eq.ip}` : 'Sin IP registrada',
                e.clasificacion,
                e.observaciones
              ].filter(Boolean).join(' · ')
            });
          }
        } else {
          s.texto = 'No se registraron equipos en la muestra del período.';
        }
      }
      // Equipos verificados por su IP y teléfonos/extensiones (F0387). Van justo después de la
      // semana a la que pertenecen: el documento del mes lleva las cinco semanas en una sola hoja.
      if (p.equiposIp) {
        const conIp = (r?.equiposIp ?? []).filter((e) => e.ip.trim());
        if (conIp.length) {
          anexos.push({
            titulo: `${p.titulo} · Equipos revisados por IP`,
            columnas: ['IP', 'N° de inventario', 'Equipo', 'Usuario final', 'Estado operativo', 'Hora de verificación'],
            filas: conIp.map((e) => {
              const eq = e.inventario ? this.data.equipoDe(e.inventario) : undefined;
              return [
                e.ip, e.inventario || '—',
                eq ? `${eq.nombreEquipo || eq.tipo} · ${eq.marca} ${eq.modelo}` : e.nombreEquipo || '—',
                e.usuarioFinal || '—', e.estadoEquipo || '—', e.hora || '—'
              ];
            }),
            nota: 'Cada IP corresponde a un equipo activo de esta Dirección/Unidad en el inventario operativo, proveniente de las entregas aceptadas en SISGOST — Gestión de Equipos.'
          });
        }
      }
      if (p.telefonos) {
        const conTel = (r?.telefonos ?? []).filter((t) => t.numero.trim());
        if (conTel.length) {
          anexos.push({
            titulo: `${p.titulo} · Teléfonos y extensiones revisados`,
            columnas: ['Teléfono / Extensión', 'Ubicación o área', 'Resultado', 'Hora de verificación', 'Observaciones'],
            filas: conTel.map((t) => [t.numero, t.ubicacion || '—', t.resultado || '—', t.hora || '—', t.observaciones || '—'])
          });
        }
      }
      // Equipos relacionados: se imprimen con los datos vivos del inventario operativo.
      if (p.equipos) {
        const revisados = r?.equipos?.filter((e) => e.incluido) ?? [];
        if (revisados.length) {
          s.columnas = ['N° de inventario', 'Equipo', 'Usuario final', 'Verificaciones aplicadas', 'Observación', 'Estado'];
          s.filas = revisados.map((e) => {
            const eq = this.data.equipoDe(e.inventario);
            return [
              e.inventario,
              eq ? `${eq.nombreEquipo || eq.tipo} · ${eq.marca} ${eq.modelo}` : '—',
              eq?.usuarioFinal ?? '—',
              e.verificaciones.join(' · ') || '—',
              e.observacion || '—',
              e.estado
            ];
          });
          s.nota = 'Equipos activos de la Dirección/Unidad según el inventario operativo, proveniente de las entregas aceptadas en SISGOST — Gestión de Equipos.';
        } else {
          s.texto = 'No se registraron equipos revisados en el período.';
        }
      }
      salida.push(s, ...anexos);
    }
    if (c.observaciones) salida.push({ titulo: 'Observaciones del proceso', texto: c.observaciones });
    return salida;
  }

  private seccionesBitacora(b: BitacoraDiaria): SeccionDoc[] {
    const salida: SeccionDoc[] = [this.seccionDatos(b.direccion, b.unidad, b.responsable, [
      { etiqueta: 'Fecha de la bitácora', valor: formateaFecha(b.fecha), mono: true },
      { etiqueta: 'Hora de envío', valor: b.horaEnvio ? `${b.horaEnvio} (límite 17:00)` : 'Sin envío registrado', mono: true },
      { etiqueta: 'Estado', valor: b.estado }
    ])];
    salida.push({
      titulo: 'Revisión del equipo de atención al público',
      items: b.revision.map((r) => ({ nombre: r.elemento, estado: r.estado || 'Sin revisar' }))
    });
    const fallas = b.revision.filter((r) => r.estado === 'Presenta falla');
    if (fallas.length) {
      salida.push({
        titulo: 'Fallas atendidas',
        columnas: ['Elemento', 'Descripción de la falla', 'Acción realizada', 'Estado final'],
        filas: fallas.map((f) => [f.elemento, f.descripcionFalla ?? '', f.accionRealizada ?? '', f.estadoFinal ?? ''])
      });
    }
    salida.push({
      titulo: 'Actividades del día',
      columnas: ['Hora', 'Actividad realizada', 'Equipo o área', 'Resultado', 'Observaciones'],
      filas: b.actividades.map((a) => [a.hora, a.actividad, a.area, a.resultado, a.observaciones])
    });
    if (b.observaciones) salida.push({ titulo: 'Observaciones generales', texto: b.observaciones });
    return salida;
  }

  private seccionesJustificacion(j: Justificacion): SeccionDoc[] {
    const cat = this.data.catalogoDe(j.codigoControl);
    return [
      this.seccionDatos(j.direccion, j.unidad || 'Todas las unidades', j.responsable, [
        { etiqueta: 'Control justificado', valor: `${j.codigoControl} — ${cat?.nombre ?? ''}` },
        { etiqueta: 'Período', valor: `${nombreMes(j.mes)} ${j.anio}` },
        { etiqueta: 'Motivo', valor: j.motivo },
        { etiqueta: 'Estado de la carta', valor: j.estado }
      ]),
      {
        titulo: 'Carta de justificación',
        texto: j.texto,
        nota: 'Carta emitida conforme al formato institucional de justificaciones (Formatos nuevos 2025).'
      }
    ];
  }

  /** El reporte consolidado se arma con los datos vivos del período: totales, controles y bitácoras. */
  private seccionesReporte(d: DocumentoGenerado): SeccionDoc[] {
    const delPeriodo = this.data.controles().filter((c) =>
      c.anio === d.anio && c.mes === d.mes && (d.direccion === 'Todas' || c.direccion === d.direccion));
    const cuenta = (estados: string[]) => delPeriodo.filter((c) => estados.includes(c.estado)).length;
    const bitacoras = this.data.bitacoras().filter((b) =>
      b.fecha.startsWith(`${d.anio}-${String(d.mes).padStart(2, '0')}`) && (d.direccion === 'Todas' || b.direccion === d.direccion));
    const justs = this.data.justificaciones().filter((j) =>
      j.anio === d.anio && j.mes === d.mes && (d.direccion === 'Todas' || j.direccion === d.direccion));
    const equipos = this.data.inventario().filter((e) =>
      (d.direccion === 'Todas' || e.direccion === d.direccion) && e.estado === 'Activo en Dirección/Unidad');
    return [
      {
        titulo: 'Resumen del período',
        campos: [
          { etiqueta: 'Controles del período', valor: String(delPeriodo.length) },
          { etiqueta: 'Entregados a tiempo', valor: String(cuenta(['Entregado', 'Cerrado'])) },
          { etiqueta: 'Entregados tarde', valor: String(cuenta(['Entregado tarde'])) },
          { etiqueta: 'Justificados', valor: String(cuenta(['Justificado'])) },
          { etiqueta: 'Vencidos', valor: String(cuenta(['Vencido'])) },
          { etiqueta: 'Pendientes o en proceso', valor: String(cuenta(['Programado', 'Pendiente', 'En proceso', 'Listo para entregar', 'En revisión', 'Observado'])) },
          { etiqueta: 'Bitácoras del mes', valor: `${bitacoras.filter((b) => b.estado === 'Enviada' || b.estado === 'Enviada tarde').length} enviadas de ${bitacoras.length}` },
          { etiqueta: 'Equipos activos en inventario operativo', valor: String(equipos.length) }
        ]
      },
      {
        titulo: 'Detalle de controles del período',
        columnas: ['Control', 'Dirección/Unidad', 'Responsable', 'Período', 'Fecha límite', 'Entrega', 'Estado'],
        filas: delPeriodo.map((c) => [
          c.codigo, `${this.data.cortaDireccion(c.direccion)} · ${c.unidad}`, c.responsable,
          c.semana ? `Semana ${c.semana}` : nombreMes(c.mes),
          formateaFecha(c.fechaLimite), c.fechaEntrega ? formateaFecha(c.fechaEntrega) : '—', c.estado
        ])
      },
      {
        titulo: 'Inventario operativo relacionado',
        ...(equipos.length
          ? {
              columnas: ['N° de inventario', 'Equipo', 'Dirección/Unidad', 'Usuario final', 'Soporte responsable', 'Estado'],
              filas: equipos.map((e) => [
                e.inventario, `${e.nombreEquipo || e.tipo} · ${e.marca} ${e.modelo}`,
                `${this.data.cortaDireccion(e.direccion)} · ${e.unidad}`, e.usuarioFinal,
                e.soporteResponsable || 'Sin asignar', e.estado
              ]),
              nota: 'Equipos activos provenientes de las entregas aceptadas en SISGOST — Gestión de Equipos.'
            }
          : { texto: 'Sin equipos activos en el inventario operativo del período.' })
      },
      {
        titulo: 'Justificaciones emitidas',
        ...(justs.length
          ? {
              columnas: ['Control', 'Dirección', 'Motivo', 'Fecha', 'Estado'],
              filas: justs.map((j) => [j.codigoControl, this.data.cortaDireccion(j.direccion), j.motivo, formateaFecha(j.fecha), j.estado])
            }
          : { texto: 'No se emitieron cartas de justificación en el período.' })
      },
      {
        titulo: 'Cumplimiento de bitácora diaria',
        texto: bitacoras.length
          ? `De ${bitacoras.length} bitácoras del mes, ${bitacoras.filter((b) => b.estado === 'Enviada').length} se enviaron dentro del horario, ${bitacoras.filter((b) => b.estado === 'Enviada tarde').length} fuera del horario y ${bitacoras.filter((b) => b.estado === 'Vencida').length} vencieron sin envío.`
          : 'Sin bitácoras registradas en el período.'
      }
    ];
  }

  /**
   * Reportes por Dirección/Unidad (§17-18 del requerimiento). Todos comparten el encabezado de
   * datos generales y el resumen de indicadores; luego cada tipo aporta su detalle y todos
   * cierran con el estado operativo.
   */
  private seccionesReporteDireccion(d: DocumentoGenerado): SeccionDoc[] {
    const unidad = d.unidad ?? '';
    const anual = d.tipo.includes('anual');
    const k = this.oper.kpi(d.direccion, unidad, d.anio, d.mes);
    const controles = this.oper.controlesDe(d.direccion, unidad, d.anio, d.mes);
    const salida: SeccionDoc[] = [
      {
        titulo: 'Datos generales del reporte',
        campos: [
          { etiqueta: 'Reporte', valor: d.tipo },
          { etiqueta: 'Dirección/Unidad', valor: this.data.dirUnidad(d.direccion, unidad) },
          { etiqueta: 'Período', valor: anual ? `Año ${d.anio}` : `${nombreMes(d.mes)} ${d.anio}` },
          { etiqueta: 'Responsable(s)', valor: k.responsables.join(', ') || 'Sin Técnico de Soporte asignado' },
          { etiqueta: 'Fecha límite del período', valor: formateaFecha(k.fechaLimite), mono: true },
          { etiqueta: 'Fecha de generación', valor: `${formateaFecha(d.fecha)} · ${d.hora}`, mono: true },
          { etiqueta: 'Generado por', valor: d.generadoPor },
          { etiqueta: 'Estado operativo', valor: `${k.estado}${k.aplicables ? ` (${k.operatividad} %)` : ''}` }
        ]
      },
      {
        titulo: 'Resumen de indicadores',
        campos: [
          { etiqueta: 'Controles aplicables', valor: String(k.aplicables) },
          { etiqueta: 'Entregados', valor: `${k.entregados + k.entregadosTarde} (${k.entregadosTarde} fuera de plazo)` },
          { etiqueta: 'Pendientes', valor: String(k.pendientes) },
          { etiqueta: 'Vencidos', valor: String(k.vencidos) },
          { etiqueta: 'Justificados', valor: String(k.justificados) },
          { etiqueta: 'Cumplimiento', valor: `${k.cumplimiento} %` },
          { etiqueta: 'Operatividad', valor: `${k.operatividad} %` },
          { etiqueta: 'Bitácoras del período', valor: `${k.bitacorasEnviadas + k.bitacorasTarde} de ${k.bitacoras} enviadas` },
          { etiqueta: 'Equipos activos', valor: String(k.equiposActivos) },
          { etiqueta: 'Equipos con incidencia', valor: String(k.equiposIncidencia) },
          { etiqueta: 'Equipos descargados en el período', valor: String(k.equiposDescargados) },
          { etiqueta: 'Documentos generados', valor: String(k.documentos) }
        ]
      }
    ];

    if (anual) {
      const meses = this.oper.anual(d.direccion, unidad, d.anio);
      salida.push({
        titulo: 'Operatividad mes a mes',
        columnas: ['Mes', 'Aplicables', 'Entregados', 'Pendientes', 'Vencidos', 'Justificados', 'Operatividad', 'Estado'],
        filas: meses.map((m, i) => [
          nombreMes(i + 1), String(m.aplicables), String(m.entregados + m.entregadosTarde),
          String(m.pendientes), String(m.vencidos), String(m.justificados),
          m.aplicables ? `${m.operatividad} %` : '—', m.estado
        ]),
        nota: 'Los meses sin controles aplicables no se puntúan: el catálogo no programa controles en esa Dirección/Unidad.'
      });
    } else if (d.tipo.includes('controles pendientes')) {
      const abiertos = controles.filter((c) => ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar', 'Vencido', 'Observado'].includes(c.estado));
      salida.push({
        titulo: 'Controles pendientes y vencidos',
        ...(abiertos.length
          ? {
              columnas: ['Código', 'Control', 'Responsable', 'Fecha límite', 'Avance', 'Estado'],
              filas: abiertos.map((c) => [
                c.codigo, this.data.catalogoDe(c.codigo)?.nombre ?? '', c.responsable,
                formateaFecha(c.fechaLimite), `${c.avance} %`, c.estado
              ])
            }
          : { texto: 'No hay controles pendientes ni vencidos en el período.' })
      });
    } else if (d.tipo.includes('inventario operativo')) {
      const equipos = this.data.equiposActivosDe(d.direccion, unidad);
      const conIncidencia = new Set(this.oper.equiposConIncidencia(d.direccion, unidad, d.anio, d.mes).map((e) => e.inventario));
      salida.push({
        titulo: 'Inventario operativo de la Dirección/Unidad',
        ...(equipos.length
          ? {
              columnas: ['N° de inventario', 'Tipo', 'Marca y modelo', 'Usuario final', 'Último control', 'Incidencia', 'Garantía', 'Estado'],
              filas: equipos.map((e) => {
                const c = this.data.controlesDeEquipo(e.inventario)[0];
                return [
                  e.inventario, e.tipo, `${e.marca} ${e.modelo}`, e.usuarioFinal,
                  c ? `${c.codigo} · ${nombreMes(c.mes)} ${c.anio}` : 'Sin control asociado',
                  conIncidencia.has(e.inventario) ? 'Sí' : 'No', e.garantia, e.estado
                ];
              }),
              nota: 'Equipos provenientes de las entregas aceptadas en SISGOST — Gestión de Equipos.'
            }
          : { texto: 'La Dirección/Unidad no tiene equipos activos en el inventario operativo.' })
      });
    } else if (d.tipo.includes('bitácoras')) {
      const prefijo = `${d.anio}-${String(d.mes).padStart(2, '0')}`;
      const bits = this.data.bitacoras().filter((b) => b.fecha.startsWith(prefijo)
        && b.direccion === d.direccion && b.unidad === unidad)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      salida.push({
        titulo: 'Bitácoras diarias del período',
        ...(bits.length
          ? {
              columnas: ['Fecha', 'Responsable', 'Hora de envío', 'Fallas registradas', 'Actividades', 'Estado'],
              filas: bits.map((b) => [
                formateaFecha(b.fecha), b.responsable, b.horaEnvio ?? '—',
                String(b.revision.filter((r) => r.estado === 'Presenta falla').length),
                String(b.actividades.length), b.estado
              ]),
              nota: 'Límite institucional de envío: 5:00 p. m. de cada día hábil.'
            }
          : { texto: 'La Dirección/Unidad no lleva bitácora diaria de atención al público.' })
      });
    } else if (d.tipo.includes('F0387') || d.tipo.includes('F0389')) {
      salida.push(...this.seccionesConsolidado(d.tipo.includes('F0387') ? 'F0387' : 'F0389', controles));
    } else if (d.tipo.includes('operatividad')) {
      salida.push({
        titulo: 'Cálculo de la operatividad',
        campos: [
          { etiqueta: 'Controles cumplidos', valor: `${k.entregados + k.entregadosTarde + k.justificados} de ${k.aplicables}` },
          { etiqueta: 'Peso de los controles', valor: `${this.oper.PESO_CONTROLES * 100} %` },
          { etiqueta: 'Bitácoras cumplidas', valor: k.bitacoras ? `${k.bitacorasEnviadas + k.bitacorasTarde} de ${k.bitacoras}` : 'No lleva bitácora' },
          { etiqueta: 'Peso de la bitácora', valor: k.bitacoras ? `${this.oper.PESO_BITACORAS * 100} %` : 'No aplica' },
          { etiqueta: 'Operatividad resultante', valor: `${k.operatividad} %` },
          { etiqueta: 'Semáforo institucional', valor: '90–100 % Operativa · 75–89 % En observación · menos de 75 % Crítica' }
        ],
        nota: 'La operatividad combina el cumplimiento de los controles aplicables con el de la bitácora diaria donde la hay.'
      });
    }

    if (!anual && !d.tipo.includes('inventario') && !d.tipo.includes('bitácoras')
      && !d.tipo.includes('pendientes') && !d.tipo.includes('F0387') && !d.tipo.includes('F0389')) {
      salida.push({
        titulo: 'Controles del período',
        ...(controles.length
          ? {
              columnas: ['Código', 'Control', 'Frecuencia', 'Responsable', 'Fecha límite', 'Entrega', 'Estado'],
              filas: controles.map((c) => [
                c.codigo, this.data.catalogoDe(c.codigo)?.nombre ?? '',
                this.data.catalogoDe(c.codigo)?.frecuencia ?? '', c.responsable,
                formateaFecha(c.fechaLimite), c.fechaEntrega ? formateaFecha(c.fechaEntrega) : '—', c.estado
              ])
            }
          : { texto: 'Ningún control del catálogo aplica a esta Dirección/Unidad en el período.' })
      });
    }

    salida.push({
      titulo: 'Conclusión y estado operativo',
      texto: this.conclusionOperativa(k),
      nota: 'Reporte generado por SISGOST — Controles Mensuales con los datos vigentes del período.'
    });
    return salida;
  }

  /**
   * Reporte de un control **semanal con entrega mensual consolidada** (F0387 o F0389): las cinco
   * semanas del mes en una sola hoja, con su detalle propio —equipos por IP y teléfonos en el
   * F0387, condiciones revisadas en el F0389— y el estado del consolidado. Nunca se imprime un
   * reporte por semana.
   */
  private seccionesConsolidado(codigo: string, controles: ControlMes[]): SeccionDoc[] {
    const cat = this.data.catalogoDe(codigo);
    const control = controles.find((c) => c.codigo === codigo);
    if (!control) {
      return [{
        titulo: `${codigo} · ${cat?.nombre ?? ''}`,
        texto: `El control ${codigo} no aplica a esta Dirección/Unidad en el período, o todavía no fue programado.`
      }];
    }
    const semanas = this.data.estadoSemanas(control);
    const campo = (titulo: string, id: string) =>
      control.secciones.find((x) => x.titulo === titulo)?.campos?.find((c) => c.id === id)?.valor || '—';
    const salida: SeccionDoc[] = [{
      titulo: `${codigo} · Verificaciones semanales del mes`,
      columnas: ['Semana', 'Estado', 'Fecha', 'Resultado', 'Responsable', 'Observaciones'],
      filas: semanas.map((s) => [
        `Semana ${s.semana}`, s.estado, campo(s.titulo, 'fecha'),
        campo(s.titulo, 'resultado'), campo(s.titulo, 'responsable'), campo(s.titulo, 'observaciones')
      ]),
      nota: `El ${codigo} se trabaja semana a semana y se entrega en un único documento mensual consolidado: no se generan documentos separados por semana.`
    }];

    // Detalle propio de cada consolidado.
    if (codigo === 'F0387') {
      const filasIp: string[][] = [];
      const filasTel: string[][] = [];
      for (const s of semanas) {
        const r = control.secciones.find((x) => x.titulo === s.titulo);
        for (const e of r?.equiposIp ?? []) {
          if (e.ip.trim()) filasIp.push([`Semana ${s.semana}`, e.ip, e.inventario || '—', e.nombreEquipo || '—', e.usuarioFinal || '—', e.hora || '—']);
        }
        for (const t of r?.telefonos ?? []) {
          if (t.numero.trim()) filasTel.push([`Semana ${s.semana}`, t.numero, t.ubicacion || '—', t.resultado || '—', t.hora || '—']);
        }
      }
      salida.push({
        titulo: 'Equipos revisados por IP',
        ...(filasIp.length
          ? {
              columnas: ['Semana', 'IP', 'N° de inventario', 'Equipo', 'Usuario final', 'Hora de verificación'],
              filas: filasIp,
              nota: 'Las IP corresponden a equipos activos de esta Dirección/Unidad en el inventario operativo.'
            }
          : { texto: 'Todavía no se registraron equipos por IP en el período.' })
      });
      salida.push({
        titulo: 'Teléfonos y extensiones revisados',
        ...(filasTel.length
          ? {
              columnas: ['Semana', 'Teléfono / Extensión', 'Ubicación o área', 'Resultado', 'Hora de verificación'],
              filas: filasTel
            }
          : { texto: 'Todavía no se registraron teléfonos ni extensiones en el período.' })
      });
    } else {
      const filas: string[][] = [];
      for (const s of semanas) {
        const r = control.secciones.find((x) => x.titulo === s.titulo);
        const plantilla = cat?.plantilla.find((p) => p.titulo === s.titulo);
        for (const i of r?.items ?? []) {
          const nombre = plantilla?.items?.find((x) => x.id === i.id)?.nombre ?? i.id;
          filas.push([`Semana ${s.semana}`, nombre, i.estado || 'Sin marcar', i.medicion || '—']);
        }
      }
      salida.push({
        titulo: 'Condiciones revisadas por semana',
        ...(filas.length
          ? { columnas: ['Semana', 'Condición revisada', 'Estado', 'Medición'], filas }
          : { texto: 'Todavía no se registraron condiciones revisadas en el período.' })
      });
    }

    salida.push({
      titulo: 'Estado del consolidado',
      campos: [
        { etiqueta: 'Estado del control', valor: control.estado },
        { etiqueta: 'Semanas completadas', valor: String(semanas.filter((s) => s.estado === 'Semana completada').length) },
        { etiqueta: 'Semanas observadas', valor: String(semanas.filter((s) => s.estado === 'Semana observada').length) },
        { etiqueta: 'Semanas que no aplican', valor: String(semanas.filter((s) => s.estado === 'Semana no aplica').length) },
        { etiqueta: 'Documento del mes', valor: control.documento ? 'Generado' : 'Pendiente de generar' },
        { etiqueta: 'Fecha de entrega', valor: control.fechaEntrega ? formateaFecha(control.fechaEntrega) : 'Sin entrega registrada', mono: true }
      ]
    });
    return salida;
  }

  /** Redacción institucional del cierre del reporte según el semáforo. */
  private conclusionOperativa(k: KpiDireccion): string {
    const dir = this.data.dirUnidad(k.direccion, k.unidad);
    if (k.estado === 'Sin controles aplicables') {
      return `El catálogo de controles no programa ningún control en ${dir} para el período, por lo que no se registra medición de operatividad.`;
    }
    if (k.estado === 'Sin soporte asignado') {
      return `${dir} tiene ${k.aplicables} control(es) aplicables en el período, pero no posee Técnico de Soporte responsable en la distribución vigente: sus controles no tienen quién los entregue. Se requiere asignar responsable.`;
    }
    const base = `${dir} presenta una operatividad de ${k.operatividad} % en el período, con ${k.entregados + k.entregadosTarde} control(es) entregados y ${k.justificados} justificado(s) de ${k.aplicables} aplicables`;
    if (k.estado === 'Operativa') {
      return `${base}. La Dirección/Unidad se encuentra OPERATIVA: cumple el estándar institucional del 90 %.`;
    }
    if (k.estado === 'En observación') {
      return `${base}. La Dirección/Unidad queda EN OBSERVACIÓN: ${k.pendientes} control(es) pendientes y ${k.vencidos} vencido(s) deben regularizarse antes del cierre del siguiente período.`;
    }
    return `${base}. La Dirección/Unidad se encuentra en estado CRÍTICO: se requiere plan de regularización inmediato sobre los ${k.pendientes + k.vencidos} control(es) sin entregar.`;
  }

  // ------------------------------------------------------------------ evidencias y firmas

  protected readonly evidencias = computed<EvidenciaDoc[]>(() => {
    const c = this.control();
    if (c) return c.evidencias.map((e) => ({ nombre: e.nombre, descripcion: e.descripcion, fecha: formateaFecha(e.fecha) }));
    const b = this.bitacora();
    if (b) {
      return b.revision.filter((r) => r.evidencia).map((r) => ({
        nombre: r.evidencia!, descripcion: `Evidencia de la falla en ${r.elemento.toLowerCase()}`, fecha: formateaFecha(b.fecha)
      }));
    }
    return [];
  });

  protected readonly firmas = computed<FirmaDoc[]>(() => {
    const d = this.doc();
    if (!d) return [];
    const j = this.justificacion();
    if (j) {
      return j.firmas.map((f) => ({
        rotulo: f.cargo, nombre: f.nombre, estado: f.estado === 'Registrada' ? 'Capturada' as const : 'Pendiente' as const,
        fecha: f.estado === 'Registrada' ? formateaFecha(j.fecha) : undefined
      }));
    }
    const c = this.control();
    if (c) {
      const revisado = ['Cerrado', 'Observado'].includes(c.estado);
      const enc = this.data.usuarios().find((x) => x.clave === 'enc-soporte');
      return [
        { rotulo: 'Técnico de Soporte responsable', nombre: c.responsable, rol: this.cargoDe(c.responsable), estado: 'Capturada', fecha: c.fechaEntrega ? formateaFecha(c.fechaEntrega) : undefined, hora: c.horaEntrega },
        { rotulo: 'Revisión del Encargado de Soporte', nombre: enc?.nombre ?? 'Encargado de Soporte', rol: enc?.cargo ?? 'Coordinador de Soporte Técnico', estado: revisado ? 'Capturada' : 'Pendiente' }
      ];
    }
    const b = this.bitacora();
    if (b) {
      return [{ rotulo: 'Técnico de Soporte responsable', nombre: b.responsable, rol: this.cargoDe(b.responsable), estado: 'Capturada', fecha: formateaFecha(b.fecha), hora: b.horaEnvio }];
    }
    return [{ rotulo: 'Generado por', nombre: d.generadoPor, estado: 'Capturada', fecha: formateaFecha(d.fecha), hora: d.hora }];
  });

  // ------------------------------------------------------------------ descarga

  /** Descarga el documento como texto plano con la misma estructura de la hoja. */
  protected descargar(): void {
    const d = this.doc();
    if (!d) return;
    const linea = '='.repeat(72);
    const partes: string[] = [
      linea,
      'CENTRO NACIONAL DE REGISTROS',
      'SISGOST — Controles Mensuales',
      d.nombre,
      this.subtitulo(),
      `Código: ${d.codigo} · Fecha: ${formateaFecha(d.fecha)} ${d.hora} · Huella: ${d.hash}`,
      linea, ''
    ];
    for (const s of this.secciones()) {
      partes.push(s.titulo.toUpperCase(), '-'.repeat(s.titulo.length));
      for (const c of s.campos ?? []) partes.push(`${c.etiqueta}: ${c.valor || '—'}`);
      for (const i of s.items ?? []) partes.push(`[${i.estado}] ${i.nombre}${i.nota ? ` (${i.nota})` : ''}`);
      if (s.filas?.length) {
        if (s.columnas) partes.push(s.columnas.join(' | '));
        for (const f of s.filas) partes.push(f.join(' | '));
      }
      if (s.texto) partes.push(s.texto);
      if (s.nota) partes.push(`Nota: ${s.nota}`);
      partes.push('');
    }
    for (const f of this.firmas()) partes.push(`F. ${'_'.repeat(30)}  ${f.nombre} — ${f.rotulo} (${f.estado})`);
    partes.push('', 'Documento generado por SISGOST — prototipo de demostración.');

    const blob = new Blob([partes.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d.nombre.replace(/[^\p{L}\p{N}]+/gu, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.data.registrarDescarga(d.id, this.auth.usuario()!);
    this.toast.ok('Documento descargado', d.nombre);
  }
}
