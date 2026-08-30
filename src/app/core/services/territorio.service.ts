import { Injectable, computed, signal } from '@angular/core';
import {
  ALCANCE_DEPARTAMENTO, AmbitoTerritorial, CatalogoTerritorial, Departamento, DireccionRegistro,
  ETIQUETA_TODO_EL_DEPARTAMENTO, TipoAsignacion, Zona
} from '../models/territorio';

/**
 * SERVICIO COMPARTIDO DEL ECOSISTEMA SISGOST — catálogo territorial Zona → Departamento →
 * Dirección/Registro. **Este archivo es el mismo en los dos proyectos** y no debe divergir.
 *
 * Es la única fuente que resuelve territorio en los dos módulos: la distribución de soportes, las
 * solicitudes, el inventario operativo, los controles, los KPIs, el historial y la trazabilidad
 * preguntan aquí y comparan siempre por **ID estable** (`SS`, `SS-RC`, `ZCEN`), nunca por el
 * nombre visible.
 *
 * La regla de negocio que sostiene —dónde la distribución es por Dirección/Registro y dónde por
 * Departamento— sale del propio catálogo (`Departamento.porDireccion`), no de comparar el texto
 * «San Salvador» en el código.
 */
@Injectable({ providedIn: 'root' })
export class TerritorioService {
  readonly zonas = signal<Zona[]>([]);
  readonly departamentos = signal<Departamento[]>([]);
  readonly direccionesRegistro = signal<DireccionRegistro[]>([]);
  readonly version = signal('');
  readonly listo = signal(false);

  /** Zonas en el orden institucional (Occidental, Central, Oriental). */
  readonly zonasOrdenadas = computed(() => [...this.zonas()].sort((a, b) => a.orden - b.orden));

  /** Departamentos activos, en el orden institucional del catálogo. */
  readonly departamentosActivos = computed(() =>
    this.departamentos().filter((d) => d.activo).sort((a, b) => a.orden - b.orden));

  /** Departamentos cuya distribución se lleva Dirección/Registro por Dirección/Registro. */
  readonly departamentosPorDireccion = computed(() =>
    this.departamentosActivos().filter((d) => d.porDireccion));

  // ------------------------------------------------------------------ carga

  async cargar(): Promise<void> {
    if (this.listo()) return;
    try {
      const res = await fetch('assets/data/territorio.json');
      this.sembrar((await res.json()) as CatalogoTerritorial);
    } catch {
      // Sin catálogo el módulo sigue funcionando: las consultas devuelven el ID recibido tal cual.
      this.listo.set(true);
    }
  }

  sembrar(c: CatalogoTerritorial): void {
    this.zonas.set(c.zonas ?? []);
    this.departamentos.set(c.departamentos ?? []);
    this.direccionesRegistro.set(c.direccionesRegistro ?? []);
    this.version.set(c.version ?? '');
    this.listo.set(true);
  }

  // ------------------------------------------------------------------ IDs estables

  /** Minúsculas, sin tildes y con guiones: la base de toda comparación derivada de un nombre. */
  slug(texto: string): string {
    return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  /**
   * ID estable del departamento. Acepta el ID (`STA`), la sigla o el nombre institucional; si no
   * figura en el catálogo devuelve el texto recibido, para no perder un registro heredado.
   */
  idDepartamento(texto: string): string {
    const t = (texto ?? '').trim();
    if (!t) return '';
    const s = this.slug(t);
    const lista = this.departamentos();
    const hallado = lista.find((d) => d.id === t)
      ?? lista.find((d) => this.slug(d.id) === s)
      ?? lista.find((d) => this.slug(d.nombre) === s)
      ?? lista.find((d) => this.slug(d.corta) === s);
    return hallado ? hallado.id : t;
  }

  /**
   * ID estable de la Dirección/Registro **dentro de su departamento**: dos departamentos tienen
   * registros con el mismo nombre y no son el mismo. Devuelve '' cuando el texto representa el
   * departamento completo.
   */
  idRegistro(departamento: string, registro: string): string {
    const dep = this.idDepartamento(departamento);
    const t = (registro ?? '').trim();
    if (!dep || !t || t === ALCANCE_DEPARTAMENTO || t === ETIQUETA_TODO_EL_DEPARTAMENTO) return '';
    const s = this.slug(t);
    const lista = this.direccionesRegistro().filter((r) => r.departamentoId === dep);
    const hallado = lista.find((r) => r.id === t)
      ?? lista.find((r) => this.slug(r.id) === s)
      ?? lista.find((r) => this.slug(r.nombre) === s)
      ?? lista.find((r) => this.slug(r.corta) === s);
    return hallado ? hallado.id : '';
  }

  /**
   * Identificador de ámbito con el que se compara en todo el ecosistema: `SS::SS-RC` para un
   * alcance por Dirección/Registro y `STA::*` para uno departamental.
   */
  idAmbito(departamento: string, registro: string): string {
    const dep = this.idDepartamento(departamento);
    if (!dep) return '';
    const reg = this.idRegistro(dep, registro);
    return `${dep}::${reg || ALCANCE_DEPARTAMENTO}`;
  }

  // ------------------------------------------------------------------ consultas

  zona(id: string): Zona | undefined { return this.zonas().find((z) => z.id === id); }
  departamento(id: string): Departamento | undefined {
    return this.departamentos().find((d) => d.id === this.idDepartamento(id));
  }
  registro(id: string): DireccionRegistro | undefined { return this.direccionesRegistro().find((r) => r.id === id); }

  nombreZona(id: string): string { return this.zona(id)?.nombre ?? id; }
  nombreDepartamento(id: string): string { return this.departamento(id)?.nombre ?? id; }
  nombreRegistro(id: string): string { return this.registro(id)?.nombre ?? id; }
  cortaRegistro(id: string): string { return this.registro(id)?.corta ?? id; }

  /** Zona a la que pertenece un departamento. */
  zonaDe(departamento: string): string { return this.departamento(departamento)?.zonaId ?? ''; }

  departamentosDe(zonaId: string): Departamento[] {
    return this.departamentosActivos().filter((d) => d.zonaId === zonaId);
  }

  /** Direcciones/Registros de un departamento, en el orden del catálogo. */
  registrosDe(departamento: string): DireccionRegistro[] {
    const dep = this.idDepartamento(departamento);
    return this.direccionesRegistro().filter((r) => r.departamentoId === dep && r.activa)
      .sort((a, b) => a.orden - b.orden);
  }

  // ------------------------------------------------------------------ regla territorial

  /**
   * ¿La distribución de este departamento se lleva Dirección/Registro por Dirección/Registro?
   * Es la regla del negocio, y sale del catálogo: hoy solo San Salvador la cumple.
   */
  distribuyePorDireccion(departamento: string): boolean {
    return this.departamento(departamento)?.porDireccion === true;
  }

  /** Alcance que corresponde a un departamento según la regla territorial. */
  tipoAsignacionDe(departamento: string): TipoAsignacion {
    return this.distribuyePorDireccion(departamento) ? 'DIRECCION_REGISTRO' : 'DEPARTAMENTO';
  }

  /** Ámbito completo —zona, departamento, registro y alcance— resuelto desde cualquier texto. */
  ambito(departamento: string, registro = ''): AmbitoTerritorial {
    const dep = this.idDepartamento(departamento);
    const porDireccion = this.distribuyePorDireccion(dep);
    const reg = porDireccion ? this.idRegistro(dep, registro) : '';
    return {
      zonaId: this.zonaDe(dep),
      departamentoId: dep,
      direccionRegistroId: reg || null,
      tipo: porDireccion ? 'DIRECCION_REGISTRO' : 'DEPARTAMENTO'
    };
  }

  /**
   * Ámbitos de distribución posibles: uno por cada Dirección/Registro en los departamentos que se
   * llevan por Dirección/Registro, y uno por departamento completo en los demás. Es exactamente
   * la lista que el mapa de responsables muestra y la que la distribución permite asignar.
   */
  ambitosDistribuibles(): AmbitoTerritorial[] {
    const salida: AmbitoTerritorial[] = [];
    for (const d of this.departamentosActivos()) {
      if (d.porDireccion) {
        for (const r of this.registrosDe(d.id)) {
          salida.push({ zonaId: d.zonaId, departamentoId: d.id, direccionRegistroId: r.id, tipo: 'DIRECCION_REGISTRO' });
        }
      } else {
        salida.push({ zonaId: d.zonaId, departamentoId: d.id, direccionRegistroId: null, tipo: 'DEPARTAMENTO' });
      }
    }
    return salida;
  }

  // ------------------------------------------------------------------ etiquetas

  /** «San Salvador / Registro de Comercio» o «Santa Ana / Todo el departamento». */
  etiqueta(departamento: string, registro = ''): string {
    const dep = this.nombreDepartamento(this.idDepartamento(departamento));
    const reg = this.idRegistro(departamento, registro);
    return reg ? `${dep} / ${this.nombreRegistro(reg)}` : `${dep} / ${ETIQUETA_TODO_EL_DEPARTAMENTO}`;
  }

  /** Etiqueta de un ámbito ya resuelto. */
  etiquetaAmbito(a: AmbitoTerritorial): string {
    return a.direccionRegistroId
      ? `${this.nombreDepartamento(a.departamentoId)} / ${this.nombreRegistro(a.direccionRegistroId)}`
      : `${this.nombreDepartamento(a.departamentoId)} / ${ETIQUETA_TODO_EL_DEPARTAMENTO}`;
  }

  /** «Zona Central · San Salvador · Registro de Comercio», para encabezados y documentos. */
  ruta(departamento: string, registro = ''): string {
    const dep = this.idDepartamento(departamento);
    const reg = this.idRegistro(dep, registro);
    const partes = [this.nombreZona(this.zonaDe(dep)), this.nombreDepartamento(dep)];
    if (reg) partes.push(this.nombreRegistro(reg));
    return partes.filter(Boolean).join(' · ');
  }
}
