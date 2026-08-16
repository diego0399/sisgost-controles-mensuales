import { Component, computed, inject, input, output } from '@angular/core';
import { AuthService } from '../core/services/auth.service';
import { DataService } from '../core/services/data.service';
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
        [codigo]="d.codigo === 'BITACORA' ? 'Bitácora diaria' : d.codigo === 'REPORTE' ? 'Reporte consolidado' : d.codigo + (versionCatalogo() ? ' ' + versionCatalogo() : '')"
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
    if (d.tipo === 'Reporte mensual consolidado' || d.tipo === 'Reporte por Dirección') return this.seccionesReporte(d);
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
      salida.push(s);
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
          { etiqueta: 'Pendientes o en proceso', valor: String(cuenta(['Programado', 'Pendiente', 'En proceso', 'En revisión', 'Observado'])) },
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
