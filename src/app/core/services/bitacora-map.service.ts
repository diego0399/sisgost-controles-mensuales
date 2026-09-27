import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DataService, HORA_LIMITE_BITACORA } from './data.service';
import { BusinessDayService } from './business-day.service';
import { BitacoraDiaria, EstadoBitacora, isoLocal } from '../models/models';
import { ETIQUETA_TODO_EL_DEPARTAMENTO } from '../models/territorio';
import { ColorMapa } from '../../shared/mapa-salvador';

/**
 * ESTADO DE LAS BITÁCORAS DIARIAS POR TERRITORIO — el cálculo que colorea el mapa.
 *
 * Aquí viven las reglas; la pantalla solo dibuja. Es un servicio propio y no más métodos de
 * `DataService` porque esto no guarda nada: **deriva** el estado visual de tres fuentes que ya
 * existen —las bitácoras, la distribución de soportes vigente y el calendario de días hábiles— y
 * no tiene estado que persistir.
 *
 * ## La regla territorial, que es la parte que se presta a error
 *
 * El ámbito de una bitácora **no es el departamento**: es lo que la distribución asigna.
 *
 * · En **San Salvador** (`porDireccion` en el catálogo) hay una bitácora por **Dirección/Registro**,
 *   así que el departamento tiene cinco y su color es el **agregado** de las cinco: verde si todas
 *   se enviaron, rojo si ninguna, amarillo si unas sí y otras no.
 * · En **los demás departamentos** hay **una sola** bitácora, del responsable departamental, y el
 *   color del departamento es el de esa bitácora.
 *
 * Qué departamento va de una forma u otra sale del catálogo (`Departamento.porDireccion`), nunca de
 * comparar el texto «San Salvador». Y todo el emparejamiento se hace por **id de ámbito**
 * (`SS::SS-RC`, `STA::*`), nunca por el nombre visible del registro.
 *
 * ## Estado visual ≠ estado del registro
 *
 * El mapa tiene cuatro colores y la bitácora, siete estados. Los dos se conservan por separado:
 * `estado` es lo que dice el registro y `estadoVisual` es lo que pinta el mapa. Una «Enviada
 * tarde» es **verde** —se envió, y eso es lo que el mapa responde— pero sigue contándose aparte en
 * los indicadores, porque llegar tarde no es lo mismo que llegar a tiempo.
 */

/** Lo que el mapa responde de un ámbito. Es una lectura visual, no el estado del registro. */
export type EstadoVisualBitacora =
  | 'Realizada' | 'En proceso' | 'Parcial' | 'Pendiente' | 'Vencida'
  | 'Sin soporte asignado'
  /** No es día hábil, o el mes no tuvo ninguna bitácora: no hay nada que exigir. */
  | 'Sin registro';

/** Período que se mira: un día concreto o un mes completo. */
export type ModoPeriodo = 'Día' | 'Mes';

export interface FiltroMapaBitacoras {
  modo: ModoPeriodo;
  /** ISO del día, cuando `modo` es «Día». */
  fecha: string;
  anio: number;
  /** 1–12, cuando `modo` es «Mes». */
  mes: number;
  zona: string;
  departamento: string;
  /** Nombre del Técnico de Soporte, sin el « — Rol». */
  tecnico: string;
  estado: EstadoVisualBitacora | '';
}

/** Cuenta de bitácoras por resultado, dentro de un ámbito o de un departamento. */
export interface TotalesBitacora {
  /** Ámbitos (modo Día) o registros (modo Mes) que se esperaban. */
  esperados: number;
  registros: number;
  realizadas: number;
  proceso: number;
  pendientes: number;
  vencidas: number;
  tarde: number;
  sinSoporte: number;
}

/** Estado de la bitácora de un ámbito territorial en el período consultado. */
export interface EstadoAmbitoBitacora {
  /** Id del ámbito: `SS::SS-RC` o `STA::*`. Es la clave de comparación de todo el ecosistema. */
  clave: string;
  zonaId: string;
  zona: string;
  departamentoId: string;
  departamento: string;
  corta: string;
  direccionRegistroId: string | null;
  /** Nombre de la Dirección/Registro, o «Todo el departamento». */
  ambito: string;
  porDireccion: boolean;
  /** Técnicos responsables según la distribución vigente. */
  responsables: string[];
  /** Id de la bitácora del día; '' cuando no hay registro (o en modo Mes). */
  bitacoraId: string;
  /** El estado REAL del registro, o por qué no hay uno. */
  estado: EstadoBitacora | 'Sin registro' | 'Sin soporte asignado';
  estadoVisual: EstadoVisualBitacora;
  color: ColorMapa;
  horaEnvio: string;
  /** Se envió fuera de las 5:00 p. m.: verde en el mapa, pero contado aparte. */
  tarde: boolean;
  fallas: number;
  actividades: number;
  observaciones: string;
  documento: string;
  totales: TotalesBitacora;
}

/** Estado agregado de un departamento: lo que el mapa pinta. */
export interface EstadoDepartamentoBitacora {
  departamentoId: string;
  departamento: string;
  corta: string;
  zonaId: string;
  zona: string;
  porDireccion: boolean;
  ambitos: EstadoAmbitoBitacora[];
  responsables: string[];
  estadoVisual: EstadoVisualBitacora;
  color: ColorMapa;
  totales: TotalesBitacora;
  /**
   * `false` = el departamento queda fuera del filtro por soporte o del alcance del rol activo. Se
   * dibuja atenuado, no se oculta: un mapa con departamentos ausentes deja de ser el país.
   */
  enAlcance: boolean;
}

/** Estados del registro que significan «la bitácora se hizo». */
const ESTADOS_REALIZADA: EstadoBitacora[] = ['Enviada', 'Enviada tarde', 'Cerrada'];
/** Estados del registro que significan «empezada, sin cerrar». */
const ESTADOS_PROCESO: EstadoBitacora[] = ['En edición', 'Observada'];

@Injectable({ providedIn: 'root' })
export class BitacoraMapService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly habiles = inject(BusinessDayService);

  readonly HORA_LIMITE = HORA_LIMITE_BITACORA;

  // ------------------------------------------------------------------ período por omisión

  /**
   * Fecha con la que conviene abrir la pantalla: el **último día con actividad registrada** —alguna
   * bitácora que ya salió de «Pendiente»— sin pasar de hoy.
   *
   * No es «hoy» sin más, y la razón es que «hoy» casi nunca informa de nada al abrir. Puede ser
   * sábado o feriado, y entonces no existe bitácora alguna; y si es un día hábil, lo que hay son
   * las bitácoras que el propio sistema acaba de crear en «Pendiente», así que el mapa se abriría
   * en rojo entero por el solo hecho de que la jornada empezó. El último día con actividad siempre
   * tiene algo que responder, y el selector —con su atajo «Hoy»— deja mirar cualquier otro.
   */
  fechaPorOmision(): string {
    const hoy = isoLocal(new Date());
    const hasta = this.data.bitacoras().filter((b) => b.fecha <= hoy);
    const conActividad = hasta.filter((b) => b.estado !== 'Pendiente').map((b) => b.fecha);
    if (conActividad.length) return conActividad.sort().at(-1)!;
    const cualquiera = hasta.map((b) => b.fecha);
    return cualquiera.length ? cualquiera.sort().at(-1)! : hoy;
  }

  /** Fechas con bitácoras registradas, de la más reciente a la más antigua. */
  fechasConRegistro(): string[] {
    return [...new Set(this.data.bitacoras().map((b) => b.fecha))].sort((a, b) => b.localeCompare(a));
  }

  /** ¿La fecha consultada admite bitácora? Un sábado o un feriado no genera ninguna. */
  esDiaHabil(fecha: string): boolean { return this.habiles.esHabil(fecha); }

  // ------------------------------------------------------------------ ámbitos

  /** Id de ámbito de una bitácora ya registrada, resuelto por el catálogo territorial. */
  private claveDe(b: BitacoraDiaria): string {
    return this.data.territorio.idAmbito(b.direccion, b.unidad);
  }

  /**
   * Estado de un ámbito en el período. Es el núcleo del cálculo y la única puerta por la que el
   * estado del registro se traduce a color.
   */
  private estadoAmbito(par: { direccion: string; unidad: string }, f: FiltroMapaBitacoras): EstadoAmbitoBitacora {
    const dep = this.data.territorio.idDepartamento(par.direccion);
    const clave = this.data.territorio.idAmbito(dep, par.unidad);
    const registroId = this.data.territorio.idRegistro(dep, par.unidad);
    const zonaId = this.data.territorio.zonaDe(dep);
    const responsables = this.data.tecnicosDe(dep, par.unidad).map((t) => this.data.soportes.soloNombre(t));

    const base = {
      clave,
      zonaId,
      zona: this.data.territorio.nombreZona(zonaId),
      departamentoId: dep,
      departamento: this.data.territorio.nombreDepartamento(dep),
      corta: this.data.cortaDireccion(dep),
      direccionRegistroId: registroId || null,
      ambito: registroId ? this.data.territorio.nombreRegistro(registroId) : ETIQUETA_TODO_EL_DEPARTAMENTO,
      porDireccion: this.data.territorio.distribuyePorDireccion(dep),
      responsables
    };

    const vacios: TotalesBitacora = {
      esperados: 1, registros: 0, realizadas: 0, proceso: 0, pendientes: 0, vencidas: 0, tarde: 0, sinSoporte: 0
    };
    const sinDatos = {
      ...base, bitacoraId: '', horaEnvio: '', tarde: false, fallas: 0, actividades: 0,
      observaciones: '', documento: ''
    };

    // Sin responsable no hay a quién exigirle la bitácora: el departamento va en gris (§13).
    if (!responsables.length) {
      return {
        ...sinDatos,
        estado: 'Sin soporte asignado', estadoVisual: 'Sin soporte asignado', color: 'none',
        totales: { ...vacios, sinSoporte: 1 }
      };
    }

    const bits = this.bitacorasDe(clave, f);

    if (f.modo === 'Mes') {
      const realizadas = bits.filter((b) => ESTADOS_REALIZADA.includes(b.estado)).length;
      const proceso = bits.filter((b) => ESTADOS_PROCESO.includes(b.estado)).length;
      const pendientes = bits.filter((b) => b.estado === 'Pendiente').length;
      const vencidas = bits.filter((b) => b.estado === 'Vencida').length;
      const totales: TotalesBitacora = {
        esperados: bits.length, registros: bits.length, realizadas, proceso, pendientes, vencidas,
        tarde: bits.filter((b) => b.estado === 'Enviada tarde').length, sinSoporte: 0
      };
      const ultima = [...bits].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
      const visual: EstadoVisualBitacora = !bits.length ? 'Sin registro'
        : (pendientes + vencidas === 0 && proceso === 0) ? 'Realizada'
          : (realizadas === 0 && proceso === 0) ? (vencidas >= pendientes ? 'Vencida' : 'Pendiente')
            : 'Parcial';
      return {
        ...sinDatos,
        bitacoraId: ultima?.id ?? '',
        documento: ultima?.documento ?? '',
        estado: ultima?.estado ?? 'Sin registro',
        estadoVisual: visual,
        color: this.color(visual),
        totales
      };
    }

    // ---- modo Día
    // Un sábado, un domingo o un feriado no genera bitácora: exigirla sería inventar un
    // incumplimiento donde la institución no trabaja.
    if (!this.esDiaHabil(f.fecha)) {
      return { ...sinDatos, estado: 'Sin registro', estadoVisual: 'Sin registro', color: 'none', totales: vacios };
    }

    const b = bits[0];
    if (!b) {
      // Sin registro en un día hábil: pendiente mientras la hora límite no pase, vencida después.
      const visual: EstadoVisualBitacora = this.vencio(f.fecha) ? 'Vencida' : 'Pendiente';
      return {
        ...sinDatos, estado: 'Sin registro', estadoVisual: visual, color: this.color(visual),
        totales: { ...vacios, [visual === 'Vencida' ? 'vencidas' : 'pendientes']: 1 }
      };
    }

    const realizada = ESTADOS_REALIZADA.includes(b.estado);
    const proceso = ESTADOS_PROCESO.includes(b.estado);
    const visual: EstadoVisualBitacora = realizada ? 'Realizada'
      : proceso ? 'En proceso'
        : (b.estado === 'Vencida' || this.vencio(b.fecha)) ? 'Vencida' : 'Pendiente';

    return {
      ...base,
      bitacoraId: b.id,
      estado: b.estado,
      estadoVisual: visual,
      color: this.color(visual),
      horaEnvio: b.horaEnvio ?? '',
      tarde: b.estado === 'Enviada tarde',
      fallas: b.revision.filter((r) => r.estado === 'Presenta falla').length,
      actividades: b.actividades.length,
      observaciones: b.observaciones ?? '',
      documento: b.documento ?? '',
      totales: {
        esperados: 1, registros: 1,
        realizadas: realizada ? 1 : 0,
        proceso: proceso ? 1 : 0,
        pendientes: visual === 'Pendiente' ? 1 : 0,
        vencidas: visual === 'Vencida' ? 1 : 0,
        tarde: b.estado === 'Enviada tarde' ? 1 : 0,
        sinSoporte: 0
      }
    };
  }

  /** Bitácoras del ámbito dentro del período consultado. */
  private bitacorasDe(clave: string, f: FiltroMapaBitacoras): BitacoraDiaria[] {
    const prefijoMes = `${f.anio}-${String(f.mes).padStart(2, '0')}`;
    return this.data.bitacoras()
      .filter((b) => (f.modo === 'Mes' ? b.fecha.startsWith(prefijoMes) : b.fecha === f.fecha))
      .filter((b) => this.claveDe(b) === clave);
  }

  /**
   * ¿Ya pasó el plazo de la bitácora de esa fecha? Un día anterior está vencido siempre; el día en
   * curso, solo después de las 5:00 p. m.
   */
  private vencio(fecha: string): boolean {
    const hoy = isoLocal(new Date());
    if (fecha < hoy) return true;
    if (fecha > hoy) return false;
    return new Date().toTimeString().slice(0, 5) > this.HORA_LIMITE;
  }

  /** Traducción única de estado visual a color del mapa. */
  private color(v: EstadoVisualBitacora): ColorMapa {
    switch (v) {
      case 'Realizada': return 'ok';
      case 'En proceso': case 'Parcial': return 'warn';
      case 'Pendiente': case 'Vencida': return 'danger';
      default: return 'none';
    }
  }

  // ------------------------------------------------------------------ departamentos (el mapa)

  /**
   * Los **14 departamentos**, siempre los 14, con su estado agregado. Los filtros de zona,
   * departamento y técnico no eliminan departamentos del mapa: los marcan fuera de alcance
   * (`enAlcance: false`) para que se dibujen atenuados y el país siga completo.
   */
  departamentos(f: FiltroMapaBitacoras): EstadoDepartamentoBitacora[] {
    const pares = this.data.pares();
    const u = this.auth.usuario();
    // El Técnico de Soporte solo ve lo suyo, y se le pregunta por el rol activo: quien es
    // Encargado y Técnico a la vez ve todo el país mientras opera como Encargado.
    const limitadoATecnico = u?.clave === 'tec-soporte' ? u.nombre : '';

    const porTecnico = f.tecnico || limitadoATecnico;
    const nombreTecnico = porTecnico ? this.data.soportes.soloNombre(porTecnico) : '';

    return this.data.territorio.departamentosActivos().map((d) => {
      const todos = pares
        .filter((p) => this.data.territorio.idDepartamento(p.direccion) === d.id)
        .map((p) => this.estadoAmbito(p, f));

      // Con un técnico elegido, el departamento se reduce a SUS ámbitos. Importa en San Salvador,
      // donde cada Registro tiene su responsable: quien cubre el Registro de Comercio y el ISPI no
      // responde por el IGCN, así que ni el color ni la tabla deben contarle esos tres. Fuera de
      // San Salvador no cambia nada, porque el ámbito es el departamento entero.
      const ambitos = nombreTecnico
        ? todos.filter((a) => a.responsables.includes(nombreTecnico))
        : todos;

      const totales = this.sumar(ambitos);
      const responsables = [...new Set(ambitos.flatMap((a) => a.responsables))];
      const visual = this.agregado(ambitos);

      const enAlcance = (!f.zona || d.zonaId === f.zona)
        && (!f.departamento || d.id === f.departamento)
        && (!nombreTecnico || ambitos.length > 0)
        && (!f.estado || visual === f.estado);

      return {
        departamentoId: d.id,
        departamento: d.nombre,
        corta: d.corta,
        zonaId: d.zonaId,
        zona: this.data.territorio.nombreZona(d.zonaId),
        porDireccion: d.porDireccion,
        ambitos,
        responsables,
        estadoVisual: visual,
        color: this.color(visual),
        totales,
        enAlcance
      };
    });
  }

  /**
   * Color de un departamento con varios ámbitos (§7). Verde solo si **todos** se enviaron; rojo si
   * ninguno; amarillo en cuanto hay mezcla, porque un departamento a medias no es un departamento
   * al día. Los ámbitos sin soporte no cuentan: no se le puede exigir una bitácora a nadie.
   */
  private agregado(ambitos: EstadoAmbitoBitacora[]): EstadoVisualBitacora {
    const exigibles = ambitos.filter((a) => a.estadoVisual !== 'Sin soporte asignado');
    if (!exigibles.length) return 'Sin soporte asignado';
    if (exigibles.length === 1) return exigibles[0].estadoVisual;

    const verdes = exigibles.filter((a) => a.color === 'ok').length;
    const amarillos = exigibles.filter((a) => a.color === 'warn').length;
    const rojos = exigibles.filter((a) => a.color === 'danger').length;
    const sinRegistro = exigibles.filter((a) => a.estadoVisual === 'Sin registro').length;

    if (sinRegistro === exigibles.length) return 'Sin registro';
    if (verdes === exigibles.length) return 'Realizada';
    if (verdes === 0 && amarillos === 0) {
      return exigibles.filter((a) => a.estadoVisual === 'Vencida').length >= rojos / 2 ? 'Vencida' : 'Pendiente';
    }
    return 'Parcial';
  }

  private sumar(ambitos: EstadoAmbitoBitacora[]): TotalesBitacora {
    return ambitos.reduce<TotalesBitacora>((a, x) => ({
      esperados: a.esperados + x.totales.esperados,
      registros: a.registros + x.totales.registros,
      realizadas: a.realizadas + x.totales.realizadas,
      proceso: a.proceso + x.totales.proceso,
      pendientes: a.pendientes + x.totales.pendientes,
      vencidas: a.vencidas + x.totales.vencidas,
      tarde: a.tarde + x.totales.tarde,
      sinSoporte: a.sinSoporte + x.totales.sinSoporte
    }), { esperados: 0, registros: 0, realizadas: 0, proceso: 0, pendientes: 0, vencidas: 0, tarde: 0, sinSoporte: 0 });
  }

  // ------------------------------------------------------------------ tabla e indicadores

  /**
   * Filas de la tabla: un ámbito por fila, ya filtradas. Aquí sí se filtra de verdad —la tabla es
   * una lista, no un mapa— y el orden pone primero lo que hay que atender.
   */
  filas(f: FiltroMapaBitacoras): EstadoAmbitoBitacora[] {
    const peso: Record<EstadoVisualBitacora, number> = {
      'Vencida': 0, 'Pendiente': 1, 'Parcial': 2, 'En proceso': 3,
      'Sin soporte asignado': 4, 'Realizada': 5, 'Sin registro': 6
    };
    return this.departamentos(f)
      .filter((d) => d.enAlcance)
      .flatMap((d) => d.ambitos)
      .filter((a) => !f.estado || a.estadoVisual === f.estado)
      .sort((a, b) => peso[a.estadoVisual] - peso[b.estadoVisual]
        || a.departamento.localeCompare(b.departamento)
        || a.ambito.localeCompare(b.ambito));
  }

  /** Indicadores de la cabecera. Se calculan sobre lo que el filtro deja dentro del alcance. */
  resumen(f: FiltroMapaBitacoras): TotalesBitacora & {
    departamentos: number; cubiertos: number; sinSoporteDep: number; ambitos: number;
  } {
    const deps = this.departamentos(f).filter((d) => d.enAlcance);
    const ambitos = deps.flatMap((d) => d.ambitos);
    return {
      ...this.sumar(ambitos),
      departamentos: deps.length,
      cubiertos: deps.filter((d) => d.responsables.length > 0).length,
      sinSoporteDep: deps.filter((d) => d.estadoVisual === 'Sin soporte asignado').length,
      ambitos: ambitos.length
    };
  }

  /** Técnicos de Soporte que aparecen en la distribución vigente, para el filtro por soporte. */
  tecnicosConDistribucion(): string[] {
    return [...new Set(this.data.soportes.activas().map((d) => this.data.soportes.soloNombre(d.tecnico)))]
      .sort((a, b) => a.localeCompare(b));
  }
}
