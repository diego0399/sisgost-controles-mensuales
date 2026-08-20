import { Injectable } from '@angular/core';

/**
 * DISTRIBUCIÓN DE SOPORTES COMPARTIDA del ecosistema SISGOST.
 *
 * **Este archivo es el mismo en los dos proyectos** (Controles Mensuales y Gestión de Equipos),
 * igual que `shared-inventory.service.ts` y `support-distribution.service.ts`: es el contrato
 * entre módulos y no debe divergir.
 *
 * Regla del ecosistema: la distribución se **edita en Controles Mensuales** y **se consume en
 * Gestión de Equipos**. Antes cada módulo guardaba su propia copia dentro de su foto de estado, y
 * por eso un cambio hecho en Controles no llegaba nunca al otro lado: al crear el expediente único
 * seguía viéndose la lista con la que Gestión de Equipos había arrancado.
 *
 * · **Controles Mensuales ESCRIBE** aquí cada vez que se guarda un cambio.
 * · **Gestión de Equipos LEE** de aquí al arrancar, al entrar al expediente único, al abrir el
 *   selector de Técnico de Configuración, al cambiar de usuario y cada vez que el navegador avisa
 *   de un cambio o la ventana recupera el foco.
 *
 * Como el prototipo no tiene backend, el transporte es `localStorage` bajo una clave única. Ojo
 * con la misma limitación real que ya tenía el inventario: `localStorage` está aislado **por
 * origen**, y los dos módulos corren en puertos distintos (4200 y 4300), que son orígenes
 * distintos. Por eso Gestión de Equipos completa la lectura con el puente
 * `puente-distribucion.html` que Controles Mensuales publica en su propio origen (ver
 * `SupportDistributionBridgeService`). Servidos ambos módulos desde un mismo origen, la clave
 * compartida basta por sí sola.
 */
export const CLAVE_DISTRIBUCION_COMPARTIDA = 'sisgost_support_distribution';

/** Marca de la última escritura, en ISO. Sirve para saber qué copia es la más fresca. */
export const CLAVE_DISTRIBUCION_ACTUALIZADA = 'sisgost_support_distribution_updated_at';

/** Versión del contrato guardado; una versión distinta se migra, nunca se borra en silencio. */
export const CLAVE_DISTRIBUCION_VERSION = 'sisgost_support_distribution_version';
export const VERSION_DISTRIBUCION_COMPARTIDA = '2026-08-19-shared-distribution-fix';

/** Aviso dentro del mismo origen; entre orígenes distintos avisa el evento `storage`. */
export const EVENTO_DISTRIBUCION_ACTUALIZADA = 'sisgost-support-distribution-updated';

/**
 * Una responsabilidad tal como viaja entre los dos módulos. Lleva **IDs estables y nombres**: los
 * IDs son con lo que se compara y los nombres, lo que se muestra; quien recibe no tiene por qué
 * volver a resolver un texto contra su catálogo.
 */
export interface AsignacionSoporteCompartida {
  id: string;
  tecnicoId: string;
  tecnicoNombre: string;
  tecnicoRol: string;
  direccionId: string;
  direccionNombre: string;
  unidadId: string;
  unidadNombre: string;
  activo: boolean;
  /** Desde cuándo atiende esa Dirección/Unidad (ISO `AAAA-MM-DD`). */
  fechaInicio: string;
  horaInicio: string;
  observaciones: string;
  asignadoPor: string;
  desactivadaPor?: string;
  fechaDesactivacion?: string;
  motivoDesactivacion?: string;
}

@Injectable({ providedIn: 'root' })
export class SharedDistributionService {
  readonly clave = CLAVE_DISTRIBUCION_COMPARTIDA;
  readonly claveActualizada = CLAVE_DISTRIBUCION_ACTUALIZADA;
  readonly claveVersion = CLAVE_DISTRIBUCION_VERSION;
  readonly version = VERSION_DISTRIBUCION_COMPARTIDA;
  readonly evento = EVENTO_DISTRIBUCION_ACTUALIZADA;

  /** ¿Hay ya una distribución compartida en este origen? Decide si se siembra la demostración. */
  existe(): boolean {
    return this.crudo() !== null;
  }

  private crudo(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      return localStorage.getItem(CLAVE_DISTRIBUCION_COMPARTIDA);
    } catch {
      return null;
    }
  }

  /** Contenido compartido en este origen. Una copia ilegible se trata como ausencia, no se borra. */
  leer(): AsignacionSoporteCompartida[] {
    const crudo = this.crudo();
    if (!crudo) return [];
    try {
      const lista = JSON.parse(crudo);
      return Array.isArray(lista) ? lista.filter((x) => !!x && !!x.unidadId) : [];
    } catch {
      return [];
    }
  }

  /** ISO de la última escritura; '' si nunca se escribió. */
  actualizadoEl(): string {
    if (typeof localStorage === 'undefined') return '';
    try {
      return localStorage.getItem(CLAVE_DISTRIBUCION_ACTUALIZADA) ?? '';
    } catch {
      return '';
    }
  }

  /** Versión con la que se guardó lo que hay; '' si es anterior a que existiera la marca. */
  versionGuardada(): string {
    if (typeof localStorage === 'undefined') return '';
    try {
      return localStorage.getItem(CLAVE_DISTRIBUCION_VERSION) ?? '';
    } catch {
      return '';
    }
  }

  /**
   * Publica la distribución: la clave, la marca de tiempo y la versión, y avisa a quien esté
   * escuchando en este mismo origen. Guardar es lo único que hace el usuario; no hay botón de
   * sincronizar en ninguna de las dos aplicaciones.
   */
  guardar(lista: AsignacionSoporteCompartida[]): string {
    const ahora = new Date().toISOString();
    if (typeof localStorage === 'undefined') return ahora;
    try {
      localStorage.setItem(CLAVE_DISTRIBUCION_COMPARTIDA, JSON.stringify(lista));
      localStorage.setItem(CLAVE_DISTRIBUCION_ACTUALIZADA, ahora);
      localStorage.setItem(CLAVE_DISTRIBUCION_VERSION, VERSION_DISTRIBUCION_COMPARTIDA);
    } catch {
      // Sin `localStorage` (o con la cuota llena) el prototipo sigue con su copia en memoria.
    }
    this.avisar(lista.length, ahora);
    return ahora;
  }

  /** Dispara el aviso dentro de esta pestaña; las demás lo reciben por el evento `storage`. */
  private avisar(total: number, ahora: string): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EVENTO_DISTRIBUCION_ACTUALIZADA, {
      detail: { total, actualizadoEl: ahora, version: VERSION_DISTRIBUCION_COMPARTIDA }
    }));
  }

  /**
   * Se suscribe a los tres avisos posibles y llama a `alCambiar` con el motivo:
   *
   * · `storage` — otra pestaña (o el otro módulo, si comparten origen) escribió la clave;
   * · el evento propio del ecosistema — algo cambió en esta misma pestaña;
   * · `focus` — se vuelve a esta ventana después de haber estado editando en la otra, que es el
   *   caso real de esta corrección y el único que ningún evento de almacenamiento cubre cuando
   *   los módulos están en orígenes distintos.
   */
  escuchar(alCambiar: (motivo: 'storage' | 'evento' | 'foco') => void): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (ev: StorageEvent) => {
      if (ev.key === CLAVE_DISTRIBUCION_COMPARTIDA || ev.key === CLAVE_DISTRIBUCION_ACTUALIZADA) {
        alCambiar('storage');
      }
    });
    window.addEventListener(EVENTO_DISTRIBUCION_ACTUALIZADA, () => alCambiar('evento'));
    window.addEventListener('focus', () => alCambiar('foco'));
  }
}
