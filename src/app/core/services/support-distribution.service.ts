import { Injectable, computed, signal } from '@angular/core';
import { DistribucionSoporte } from '../models/models';

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
 * Aquí viven únicamente las consultas y las escrituras planas; las reglas de negocio de cada
 * módulo (quién puede modificar, qué pasa con los equipos activos) quedan en su propio servicio.
 */
@Injectable({ providedIn: 'root' })
export class SupportDistributionService {
  /** Registro compartido completo, incluidas las asignaciones desactivadas (historial). */
  readonly registros = signal<DistribucionSoporte[]>([]);

  readonly activas = computed(() => this.registros().filter((d) => d.activo));

  cargar(lista: DistribucionSoporte[]): void { this.registros.set(lista); }

  private clave(direccion: string, unidad: string): string {
    return `${direccion.trim().toLowerCase()}|${unidad.trim().toLowerCase()}`;
  }

  /** Solo el nombre del técnico, sin el « — Rol» con el que se guarda. */
  soloNombre(tecnico: string): string { return tecnico.split('—')[0].trim(); }

  /** Asignaciones vigentes de una Dirección/Unidad. */
  deDireccionUnidad(direccion: string, unidad: string): DistribucionSoporte[] {
    const k = this.clave(direccion, unidad);
    return this.activas().filter((d) => this.clave(d.direccion, d.unidad) === k);
  }

  /** Asignaciones vigentes de toda una Dirección (cualquiera de sus unidades). */
  deDireccion(direccion: string): DistribucionSoporte[] {
    const d = direccion.trim().toLowerCase();
    return this.activas().filter((x) => x.direccion.trim().toLowerCase() === d);
  }

  /** Técnicos responsables de una Dirección/Unidad, en formato «Nombre — Rol». */
  tecnicosDe(direccion: string, unidad: string): string[] {
    return this.deDireccionUnidad(direccion, unidad).map((d) => d.tecnico);
  }

  /** Direcciones/Unidades que atiende un técnico (por nombre o por «Nombre — Rol»). */
  deTecnico(tecnico: string): DistribucionSoporte[] {
    if (!tecnico) return [];
    const nombre = this.soloNombre(tecnico);
    return this.activas().filter((d) => d.tecnico.includes(nombre));
  }

  /** ¿Este técnico está en la distribución vigente de esa Dirección/Unidad? */
  atiende(tecnico: string, direccion: string, unidad: string): boolean {
    if (!tecnico) return false;
    const nombre = this.soloNombre(tecnico);
    return this.deDireccionUnidad(direccion, unidad).some((d) => d.tecnico.includes(nombre));
  }

  /** ¿Atiende alguna unidad de esa Dirección? */
  atiendeDireccion(tecnico: string, direccion: string): boolean {
    if (!tecnico) return false;
    const nombre = this.soloNombre(tecnico);
    return this.deDireccion(direccion).some((d) => d.tecnico.includes(nombre));
  }

  /**
   * Soporte responsable de una Dirección/Unidad. Si el técnico indicado como preferido
   * (normalmente el que configuró el equipo) la atiende, es él; si no, el primero vigente.
   */
  responsableDe(direccion: string, unidad: string, preferido = ''): string {
    const lista = this.deDireccionUnidad(direccion, unidad);
    if (!lista.length) return '';
    if (preferido) {
      const propio = lista.find((d) => d.tecnico.includes(this.soloNombre(preferido)));
      if (propio) return propio.tecnico;
    }
    return lista[0].tecnico;
  }

  /** Pares Dirección/Unidad presentes en el registro (vigentes o históricos). */
  pares(): { direccion: string; unidad: string }[] {
    const mapa = new Map<string, { direccion: string; unidad: string }>();
    for (const d of this.registros()) mapa.set(this.clave(d.direccion, d.unidad), { direccion: d.direccion, unidad: d.unidad });
    return [...mapa.values()].sort((a, b) => a.direccion.localeCompare(b.direccion) || a.unidad.localeCompare(b.unidad));
  }

  // ------------------------------------------------------------------ escrituras planas

  agregar(d: DistribucionSoporte): void { this.registros.update((l) => [d, ...l]); }

  modificar(id: string, cambios: Partial<DistribucionSoporte>): void {
    this.registros.update((l) => l.map((d) => (d.id === id ? { ...d, ...cambios } : d)));
  }

  /** Nunca se borra: se desactiva conservando el historial. */
  desactivar(id: string, por: string, fecha: string, motivo: string): void {
    this.registros.update((l) => l.map((d) => (d.id === id
      ? { ...d, activo: false, desactivadaPor: por, fechaDesactivacion: fecha, observacion: `${d.observacion} Desactivada: ${motivo}`.trim() }
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
