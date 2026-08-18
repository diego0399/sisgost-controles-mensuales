import { Injectable } from '@angular/core';

/**
 * INVENTARIO OPERATIVO COMPARTIDO del ecosistema SISGOST.
 *
 * **Este archivo es el mismo en los dos proyectos** (Gestión de Equipos y Controles Mensuales),
 * igual que `support-distribution.service.ts`: es el contrato entre módulos y no debe divergir.
 *
 * Regla del ecosistema: un equipo entra al inventario operativo **solo** cuando el Usuario Final
 * acepta la conformidad en Gestión de Equipos, y sale cuando allí se registra su descargo. Ninguna
 * de las dos cosas se confirma a mano en Controles Mensuales.
 *
 * · **Gestión de Equipos ESCRIBE** aquí al aceptar la conformidad y al registrar el descargo.
 * · **Controles Mensuales LEE** de aquí al cargar su inventario operativo.
 *
 * Como el prototipo no tiene backend, el transporte es `localStorage` bajo una clave única. Ojo
 * con una limitación real: `localStorage` está aislado **por origen**, y los dos módulos corren en
 * puertos distintos (4200 y 4300), que son orígenes distintos. Por eso Controles Mensuales
 * completa la lectura con el puente `puente-inventario.html` que Gestión de Equipos publica en su
 * propio origen (ver `SharedInventoryBridgeService`). Servidos ambos módulos desde un mismo
 * origen, la clave compartida basta por sí sola.
 */
export const CLAVE_INVENTARIO_COMPARTIDO = 'sisgost_operational_inventory';

/** Estados del equipo dentro del inventario operativo compartido. */
export type EstadoOperativoCompartido =
  | 'Activo en Dirección/Unidad'
  | 'Descargado'
  /** Ciclo cerrado porque el equipo volvió a entregarse; se conserva como historia. */
  | 'Histórico';

/** Ficha del equipo tal como viaja entre los dos módulos. */
export interface EquipoOperativoCompartido {
  /** `OP-<n.º de inventario>-<expediente único>`: identifica el ciclo operativo, no al equipo. */
  id: string;
  numeroInventario: string;
  tipoEquipo: string;
  marca: string;
  modelo: string;
  serie: string;
  nombreEquipo: string;
  /** IP reservada en el F0302; '' si el equipo no la tiene. */
  ip: string;
  mac: string;
  usuarioFinal: string;
  correoUsuarioFinal: string;
  /** Nombre institucional de la Dirección, tal como lo escribe el requerimiento. */
  direccion: string;
  unidad: string;
  tecnicoConfiguracion: string;
  soporteResponsable: string;
  /** Requerimiento o solicitud que originó el proceso. */
  expediente: string;
  expedienteUnico: string;
  expedienteTecnico: string;
  fechaAceptacion: string;
  estadoOperativo: EstadoOperativoCompartido;
  garantia: string;
  /** Módulo que produjo el registro. */
  origen: string;
  /** ISO con hora del último write; sirve para saber qué tan fresca está la copia. */
  fechaSincronizacion: string;
  // ---- solo después del descargo
  fechaDescargo?: string;
  motivoDescargo?: string;
  accionPosterior?: string;
}

/** Resultado de un intento de sincronización, para poder trazarlo con precisión. */
export type ResultadoSincronizacion = 'creado' | 'actualizado' | 'sin-cambios' | 'nuevo-ciclo';

/** Datos que Gestión de Equipos entrega al aceptar la conformidad. */
export type AltaInventarioCompartido =
  Omit<EquipoOperativoCompartido, 'id' | 'estadoOperativo' | 'origen' | 'fechaSincronizacion'>;

@Injectable({ providedIn: 'root' })
export class SharedInventoryService {
  readonly clave = CLAVE_INVENTARIO_COMPARTIDO;

  /** Contenido del inventario compartido en este origen. */
  leer(): EquipoOperativoCompartido[] {
    try {
      const crudo = localStorage.getItem(CLAVE_INVENTARIO_COMPARTIDO);
      const lista = crudo ? JSON.parse(crudo) : [];
      return Array.isArray(lista) ? (lista as EquipoOperativoCompartido[]) : [];
    } catch {
      return [];
    }
  }

  guardar(lista: EquipoOperativoCompartido[]): void {
    try {
      localStorage.setItem(CLAVE_INVENTARIO_COMPARTIDO, JSON.stringify(lista));
    } catch {
      /* cuota llena: la sesión continúa en memoria */
    }
  }

  private ahora(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  /** Identificador del ciclo operativo: un mismo equipo puede tener varios a lo largo del tiempo. */
  idDe(numeroInventario: string, expedienteUnico: string): string {
    return `OP-${numeroInventario}${expedienteUnico ? '-' + expedienteUnico : ''}`;
  }

  /** Ficha ACTIVA de un número de inventario, si la hay. */
  activoDe(numeroInventario: string): EquipoOperativoCompartido | undefined {
    return this.leer().find((e) => e.numeroInventario === numeroInventario
      && e.estadoOperativo === 'Activo en Dirección/Unidad');
  }

  /**
   * Alta o actualización del equipo aceptado. **Nunca duplica**:
   *
   * · Si ya existe activo con el mismo n.º de inventario y el mismo expediente único, se
   *   **actualiza** (y si nada cambió, se informa `sin-cambios` sin reescribir la fecha).
   * · Si existe activo pero de otro expediente único o de otra Dirección/Unidad, el registro
   *   anterior pasa a **Histórico** y se crea el nuevo ciclo.
   * · Si existe descargado o histórico, se crea el nuevo ciclo conservando el anterior.
   */
  registrarAceptacion(datos: AltaInventarioCompartido): {
    resultado: ResultadoSincronizacion;
    registro: EquipoOperativoCompartido;
    anterior?: EquipoOperativoCompartido;
  } {
    const lista = this.leer();
    const id = this.idDe(datos.numeroInventario, datos.expedienteUnico);
    const activo = lista.find((e) => e.numeroInventario === datos.numeroInventario
      && e.estadoOperativo === 'Activo en Dirección/Unidad');

    // Mismo equipo, mismo expediente y misma Dirección/Unidad: es la MISMA pertenencia.
    if (activo && activo.expedienteUnico === datos.expedienteUnico
      && activo.direccion === datos.direccion && activo.unidad === datos.unidad) {
      const actualizado: EquipoOperativoCompartido = {
        ...activo, ...datos, id: activo.id,
        estadoOperativo: 'Activo en Dirección/Unidad',
        origen: activo.origen || 'Gestión de Equipos',
        fechaSincronizacion: this.ahora()
      };
      const igual = this.mismosDatos(activo, actualizado);
      if (igual) return { resultado: 'sin-cambios', registro: activo };
      this.guardar(lista.map((e) => (e.id === activo.id ? actualizado : e)));
      return { resultado: 'actualizado', registro: actualizado, anterior: activo };
    }

    // Ciclo nuevo: el registro anterior se conserva como historia, nunca se borra.
    const registro: EquipoOperativoCompartido = {
      ...datos, id,
      estadoOperativo: 'Activo en Dirección/Unidad',
      origen: 'Gestión de Equipos',
      fechaSincronizacion: this.ahora()
    };
    const resto = activo
      ? lista.map((e) => (e.id === activo.id ? { ...e, estadoOperativo: 'Histórico' as const } : e))
      : lista;
    this.guardar([registro, ...resto.filter((e) => e.id !== registro.id)]);
    return { resultado: activo ? 'nuevo-ciclo' : 'creado', registro, anterior: activo };
  }

  /** Cierra la ficha activa del equipo al registrarse su descargo en Gestión de Equipos. */
  registrarDescargo(numeroInventario: string, datos: {
    fechaDescargo: string; motivoDescargo: string; accionPosterior: string;
  }): EquipoOperativoCompartido | undefined {
    const lista = this.leer();
    const activo = lista.find((e) => e.numeroInventario === numeroInventario
      && e.estadoOperativo === 'Activo en Dirección/Unidad');
    if (!activo) return undefined;
    const cerrado: EquipoOperativoCompartido = {
      ...activo, ...datos, estadoOperativo: 'Descargado', fechaSincronizacion: this.ahora()
    };
    this.guardar(lista.map((e) => (e.id === activo.id ? cerrado : e)));
    return cerrado;
  }

  /** ¿Cambió algo que valga la pena reescribir? (la fecha de sincronización no cuenta) */
  private mismosDatos(a: EquipoOperativoCompartido, b: EquipoOperativoCompartido): boolean {
    const limpia = (x: EquipoOperativoCompartido) => JSON.stringify({ ...x, fechaSincronizacion: '' });
    return limpia(a) === limpia(b);
  }

  /** Fecha del write más reciente, o '' si el inventario compartido está vacío. */
  ultimaSincronizacion(): string {
    return this.leer().map((e) => e.fechaSincronizacion).sort().pop() ?? '';
  }

  /**
   * Avisa cuando OTRA pestaña del mismo origen modifica el inventario compartido. El evento
   * `storage` no se dispara en la pestaña que escribe, solo en las demás.
   */
  escuchar(cb: (lista: EquipoOperativoCompartido[]) => void): () => void {
    const manejador = (ev: StorageEvent) => {
      if (ev.key !== CLAVE_INVENTARIO_COMPARTIDO) return;
      cb(this.leer());
    };
    window.addEventListener('storage', manejador);
    return () => window.removeEventListener('storage', manejador);
  }
}
