/**
 * CATÁLOGO TERRITORIAL COMPARTIDO del ecosistema SISGOST — **este archivo es el mismo en los dos
 * proyectos** (Controles Mensuales y Gestión de Equipos) y no debe divergir.
 *
 * La organización territorial del CNR tiene tres niveles:
 *
 *     Zona  →  Departamento  →  Dirección/Registro
 *
 * y de ella depende una regla de negocio que atraviesa los dos módulos: **cómo se distribuyen los
 * Técnicos de Soporte**.
 *
 * · En **San Salvador** la distribución es por **Dirección/Registro**: un soporte responde solo
 *   por el Registro de Comercio, o solo por el IGCN, y así.
 * · En **los demás departamentos** la distribución es por **Departamento**: quien responde por
 *   Santa Ana atiende todas las Direcciones/Registros de Santa Ana, sin asignarse una por una.
 *
 * Qué departamento se distribuye de una forma o de otra **es dato del catálogo**
 * (`Departamento.porDireccion`), nunca una comparación contra el texto «San Salvador»: el día que
 * otro departamento crezca lo suficiente, la regla cambia en el JSON y no en el código.
 */

/** Zona geográfica: Occidental, Central u Oriental. */
export interface Zona {
  id: string;
  nombre: string;
  /** Etiqueta breve para chips y tablas («Occidental»). */
  corta: string;
  orden: number;
}

/** Departamento del país, siempre dentro de una zona. */
export interface Departamento {
  id: string;
  nombre: string;
  zonaId: string;
  corta: string;
  /**
   * `true` = la distribución de soportes se asigna **Dirección/Registro por Dirección/Registro**
   * (hoy, solo San Salvador). `false` = se asigna por **Departamento completo**.
   */
  porDireccion: boolean;
  orden: number;
  activo: boolean;
}

/** Dirección o Registro concreto, dentro de un departamento. */
export interface DireccionRegistro {
  id: string;
  departamentoId: string;
  nombre: string;
  /** Sigla institucional: IGCN, RPRH, RC, ISPI, RGM. */
  corta: string;
  orden: number;
  activa: boolean;
}

export interface CatalogoTerritorial {
  version: string;
  zonas: Zona[];
  departamentos: Departamento[];
  direccionesRegistro: DireccionRegistro[];
}

/**
 * Alcance de una asignación de soporte. Es la traducción directa de la regla territorial y lo
 * que decide si el formulario de distribución exige o no una Dirección/Registro.
 */
export type TipoAsignacion = 'DEPARTAMENTO' | 'DIRECCION_REGISTRO';

/**
 * Marca del alcance «todo el departamento» dentro de un identificador de ámbito. Un ámbito
 * departamental se escribe `STA::*` y uno por registro, `SS::SS-RC`: son IDs estables, y por
 * ellos —nunca por el nombre visible— se compara en todo el ecosistema.
 */
export const ALCANCE_DEPARTAMENTO = '*';

/** Texto con el que se muestra un alcance departamental donde antes iba el nombre de la Unidad. */
export const ETIQUETA_TODO_EL_DEPARTAMENTO = 'Todo el departamento';

/** Ámbito territorial de un control, una asignación o un equipo. */
export interface AmbitoTerritorial {
  zonaId: string;
  departamentoId: string;
  /** `null` cuando el ámbito es el departamento completo. */
  direccionRegistroId: string | null;
  tipo: TipoAsignacion;
}
