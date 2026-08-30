import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DataService } from './data.service';
import { BusinessDayService } from './business-day.service';
import { ControlDeadlineService } from './control-deadline.service';
import { ControlMes, ESTADOS_ACTIVOS, EquipoOperativo, isoLocal } from '../models/models';

/** Semáforo institucional de una Dirección/Registro. */
export type EstadoOperatividad =
  | 'Operativa' | 'En observación' | 'Crítica' | 'Sin soporte asignado' | 'Sin controles aplicables'
  /** El plazo del período todavía corre: aún no hay resultado que semaforizar. */
  | 'En curso';

/** Indicadores de operatividad de una Dirección/Registro en un período. */
export interface KpiDireccion {
  /** Id del departamento; se llama `direccion` por la nomenclatura heredada de las pantallas. */
  direccion: string;
  /** Nombre de la Dirección/Registro, o «Todo el departamento» cuando el ámbito es departamental. */
  unidad: string;
  /** Nombre institucional del departamento. */
  nombre: string;
  corta: string;
  /** Zona a la que pertenece el departamento (§31: los KPIs se ven también por zona). */
  zonaId: string;
  zona: string;
  /** `true` = el ámbito es una Dirección/Registro; `false` = el departamento completo. */
  porDireccion: boolean;
  /** Técnicos de Soporte responsables según la distribución vigente. */
  responsables: string[];
  // ---- controles
  aplicables: number;
  entregados: number;
  entregadosTarde: number;
  pendientes: number;
  vencidos: number;
  justificados: number;
  enRevision: number;
  proximosAVencer: number;
  fechaLimite: string;
  // ---- bitácoras
  bitacoras: number;
  bitacorasEnviadas: number;
  bitacorasTarde: number;
  bitacorasPendientes: number;
  bitacorasVencidas: number;
  // ---- inventario operativo
  equiposActivos: number;
  equiposIncidencia: number;
  equiposDescargados: number;
  // ---- documentos y resultado
  documentos: number;
  cumplimiento: number;
  operatividad: number;
  estado: EstadoOperatividad;
  /** false = el plazo de entrega del período todavía no vence. */
  periodoCerrado: boolean;
  ultimoF0422: string;
  ultimaBitacora: string;
}

/** Filtros de la vista ejecutiva por Dirección. */
export interface FiltroOperatividad {
  anio: number;
  mes: number;
  direccion?: string;
  unidad?: string;
  tecnico?: string;
  estado?: string;
  codigo?: string;
  nivel?: EstadoOperatividad | '';
  /** Zona del catálogo territorial; acota los departamentos que entran en el cálculo (§31). */
  zona?: string;
}

/**
 * Operatividad por Dirección/Registro: el cálculo que alimenta la vista ejecutiva de Controles
 * mensuales, el panel, el historial anual y los reportes por Dirección.
 *
 * Fórmula (documentada en pantalla y en los reportes):
 *
 *   cumplimiento  = (entregados a tiempo + cerrados + justificados) / controles aplicables
 *   controles     = (entregados —incluidas las entregas tardías— + justificados) / aplicables
 *   bitácoras     = (enviadas + enviadas tarde) / bitácoras del período
 *   operatividad  = controles                    … si la Dirección/Registro no lleva bitácora
 *                 = controles · 0.7 + bitácoras · 0.3 … si la lleva
 *
 * Semáforo: 90–100 % Operativa · 75–89 % En observación · < 75 % Crítica. Tres estados aparte:
 * «Sin soporte asignado» (nadie puede entregar), «Sin controles aplicables» (el catálogo no
 * programa ningún control ahí) y «En curso» (el plazo del período todavía corre y no hay nada
 * vencido: medirlo como incumplimiento castigaría a quien está dentro de su plazo).
 */
@Injectable({ providedIn: 'root' })
export class OperatividadService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);
  private readonly plazos = inject(ControlDeadlineService);

  /** Peso de los controles frente a la bitácora diaria en la operatividad. */
  readonly PESO_CONTROLES = 0.7;
  readonly PESO_BITACORAS = 0.3;

  /** Un equipo cuenta como «con incidencia» por su estado o por un hallazgo en el mes. */
  equiposConIncidencia(direccion: string, unidad: string, anio: number, mes: number): EquipoOperativo[] {
    const activos = this.data.equiposActivosDe(direccion, unidad);
    const conHallazgo = new Set<string>();
    for (const c of this.data.controles()) {
      if (c.anio !== anio || c.mes !== mes || c.direccion !== direccion || c.unidad !== unidad) continue;
      for (const s of c.secciones) {
        for (const e of s.equipos ?? []) {
          if (e.incluido && /hallazgo|crítico|no ubicado|escalado|pendiente/i.test(e.estado)) conHallazgo.add(e.inventario);
        }
      }
    }
    return activos.filter((e) => e.estado === 'Pendiente de revisión' || e.estado === 'En garantía'
      || conHallazgo.has(e.inventario));
  }

  /** Controles del período que aplican a la Dirección/Registro (los que el catálogo programa ahí). */
  controlesDe(direccion: string, unidad: string, anio: number, mes: number): ControlMes[] {
    return this.data.controles().filter((c) => c.anio === anio && c.mes === mes
      && c.direccion === direccion && c.unidad === unidad
      && this.data.catalogoDe(c.codigo)?.activo !== false
      && this.data.aplicaEn(c.codigo, c.direccion, c.unidad));
  }

  /** Indicadores de una Dirección/Registro en un período. */
  kpi(direccion: string, unidad: string, anio: number, mes: number): KpiDireccion {
    const hoy = isoLocal(new Date());
    const controles = this.controlesDe(direccion, unidad, anio, mes);
    const cuenta = (estados: string[]) => controles.filter((c) => estados.includes(c.estado)).length;

    const entregados = cuenta(['Entregado', 'Cerrado']);
    const entregadosTarde = cuenta(['Entregado tarde']);
    const justificados = cuenta(['Justificado']);
    const vencidos = cuenta(['Vencido']);
    const pendientes = cuenta(['Programado', 'Pendiente', 'En proceso', 'Listo para entregar']);
    const enRevision = cuenta(['En revisión', 'Observado']);
    const aplicables = controles.length;

    const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
    const bits = this.data.bitacoras().filter((b) => b.fecha.startsWith(prefijo)
      && b.direccion === direccion && b.unidad === unidad);
    const bitacorasEnviadas = bits.filter((b) => b.estado === 'Enviada').length;
    const bitacorasTarde = bits.filter((b) => b.estado === 'Enviada tarde').length;
    const bitacorasPendientes = bits.filter((b) => b.estado === 'Pendiente' || b.estado === 'En edición').length;
    const bitacorasVencidas = bits.filter((b) => b.estado === 'Vencida').length;

    const equipos = this.data.inventario().filter((e) => e.direccion === direccion && e.unidad === unidad);
    const equiposActivos = equipos.filter((e) => ESTADOS_ACTIVOS.includes(e.estado)).length;
    const equiposDescargados = equipos.filter((e) => e.estado === 'Descargado'
      && (e.fechaDescargo ?? '').startsWith(prefijo)).length;

    const responsables = this.data.tecnicosDe(direccion, unidad).map((t) => this.data.soportes.soloNombre(t));

    // ---- cálculo
    const razonControles = aplicables ? (entregados + entregadosTarde + justificados) / aplicables : 0;
    const razonBitacoras = bits.length ? (bitacorasEnviadas + bitacorasTarde) / bits.length : 0;
    const operatividad = aplicables === 0 ? 0 : Math.round(
      (bits.length ? razonControles * this.PESO_CONTROLES + razonBitacoras * this.PESO_BITACORAS : razonControles) * 100);
    const cumplimiento = aplicables ? Math.round(((entregados + justificados) / aplicables) * 100) : 0;

    // Un período cuyo plazo todavía corre no se semaforiza: solo se marca «En curso», salvo que
    // ya tenga controles vencidos (esos sí son un incumplimiento del período anterior o del propio).
    const cerrado = this.plazos.periodoCerrado(anio, mes);
    const estado: EstadoOperatividad = !aplicables ? 'Sin controles aplicables'
      : !responsables.length ? 'Sin soporte asignado'
        : operatividad >= 90 ? 'Operativa'
          : (!cerrado && !vencidos) ? 'En curso'
            : operatividad >= 75 ? 'En observación' : 'Crítica';

    const f0422 = controles.filter((c) => c.codigo === 'F0422')[0];
    const ultimaBit = [...bits].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];

    return {
      direccion, unidad,
      nombre: this.data.nombreDireccion(direccion), corta: this.data.cortaDireccion(direccion),
      zonaId: this.data.territorio.zonaDe(direccion),
      zona: this.data.zonaDe(direccion),
      porDireccion: this.data.exigeRegistro(direccion),
      responsables,
      aplicables, entregados, entregadosTarde, pendientes, vencidos, justificados, enRevision,
      proximosAVencer: controles.filter((c) => ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado)
        && c.fechaLimite >= hoy && this.habiles.habilesHasta(c.fechaLimite, hoy) <= 3).length,
      fechaLimite: this.plazos.fechaLimiteMensual(anio, mes),
      bitacoras: bits.length, bitacorasEnviadas, bitacorasTarde, bitacorasPendientes, bitacorasVencidas,
      equiposActivos,
      equiposIncidencia: this.equiposConIncidencia(direccion, unidad, anio, mes).length,
      equiposDescargados,
      documentos: this.data.documentos().filter((d) => d.anio === anio && d.mes === mes
        && d.direccion === direccion && (!d.unidad || d.unidad === unidad)).length,
      cumplimiento, operatividad, estado, periodoCerrado: cerrado,
      ultimoF0422: f0422 ? f0422.estado : 'No aplica',
      ultimaBitacora: ultimaBit ? ultimaBit.estado : 'Sin bitácora'
    };
  }

  /**
   * Indicadores de todas las Direcciones/Registros visibles para el usuario, con los filtros
   * de la vista ejecutiva aplicados.
   */
  kpis(f: FiltroOperatividad): KpiDireccion[] {
    const u = this.auth.usuario();
    const pares = u?.clave === 'tec-soporte' ? this.data.paresDe(u.usuario) : this.data.pares();
    return pares
      .filter((p) => !f.zona || this.data.territorio.zonaDe(p.direccion) === f.zona)
      .filter((p) => !f.direccion || p.direccion === f.direccion)
      .filter((p) => !f.unidad || p.unidad === f.unidad)
      .filter((p) => !f.tecnico || this.data.tecnicosDe(p.direccion, p.unidad)
        .some((t) => this.data.soportes.soloNombre(t) === f.tecnico))
      .map((p) => this.kpi(p.direccion, p.unidad, f.anio, f.mes))
      .filter((k) => !f.nivel || k.estado === f.nivel)
      .sort((a, b) => a.operatividad - b.operatividad || a.nombre.localeCompare(b.nombre));
  }

  /** Operatividad mes a mes de una Dirección/Registro (historial anual). */
  anual(direccion: string, unidad: string, anio: number): KpiDireccion[] {
    return Array.from({ length: 12 }, (_, i) => this.kpi(direccion, unidad, anio, i + 1));
  }

  /** Resumen global para el panel ejecutivo. */
  resumen(f: FiltroOperatividad): {
    total: number; operativas: number; observacion: number; criticas: number;
    sinSoporte: number; sinControles: number; promedio: number;
  } {
    const lista = this.kpis(f);
    const conMedida = lista.filter((k) => k.aplicables > 0);
    return {
      total: lista.length,
      operativas: lista.filter((k) => k.estado === 'Operativa').length,
      observacion: lista.filter((k) => k.estado === 'En observación').length,
      criticas: lista.filter((k) => k.estado === 'Crítica').length,
      sinSoporte: lista.filter((k) => k.estado === 'Sin soporte asignado').length,
      sinControles: lista.filter((k) => k.estado === 'Sin controles aplicables').length,
      promedio: conMedida.length
        ? Math.round(conMedida.reduce((s, k) => s + k.operatividad, 0) / conMedida.length) : 0
    };
  }

  /** Carga por Técnico de Soporte: Direcciones/Registros atendidas y controles abiertos. */
  cargaSoportes(f: FiltroOperatividad): { tecnico: string; pares: number; abiertos: number; vencidos: number }[] {
    return this.data.tecnicosSoporte().map((t) => {
      const pares = this.data.paresDe(t.usuario);
      const controles = pares.flatMap((p) => this.controlesDe(p.direccion, p.unidad, f.anio, f.mes));
      return {
        tecnico: t.nombre,
        pares: pares.length,
        abiertos: controles.filter((c) => ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado)).length,
        vencidos: controles.filter((c) => c.estado === 'Vencido').length
      };
    }).sort((a, b) => b.abiertos - a.abiertos || b.pares - a.pares);
  }
}
