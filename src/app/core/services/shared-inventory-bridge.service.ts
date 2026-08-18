import { Injectable, inject, signal } from '@angular/core';
import { URL_GESTION_EQUIPOS } from '../config/modulos';
import { EquipoOperativoCompartido, SharedInventoryService } from './shared-inventory.service';

/**
 * Puente hacia el inventario operativo compartido de SISGOST — Gestión de Equipos.
 *
 * `localStorage` está aislado **por origen** y el puerto forma parte del origen: lo que Gestión de
 * Equipos escribe en `http://localhost:4200` no se ve desde `http://localhost:4300`. Por eso, con
 * los dos módulos en puertos distintos, la clave compartida sola no basta.
 *
 * Este servicio carga un iframe oculto con `puente-inventario.html` —una página que Gestión de
 * Equipos publica en SU propio origen— y le pide el contenido de la clave por `postMessage`. Lo
 * recibido se funde con la copia local, de modo que:
 *
 * · si los dos módulos comparten origen, todo funciona por `localStorage` sin puente;
 * · si están en puertos distintos y Gestión de Equipos está levantado, el puente los conecta;
 * · si Gestión de Equipos no está levantado, Controles Mensuales sigue con lo que ya tenía.
 */
@Injectable({ providedIn: 'root' })
export class SharedInventoryBridgeService {
  private readonly compartido = inject(SharedInventoryService);

  /** Estado del último intento de puente; se muestra en el inventario operativo. */
  readonly estado = signal<'sin-intentar' | 'consultando' | 'conectado' | 'sin-conexion'>('sin-intentar');
  readonly recibidos = signal(0);
  readonly ultimaConsulta = signal('');

  private readonly origenEquipos = new URL(URL_GESTION_EQUIPOS).origin;
  private iframe?: HTMLIFrameElement;
  private secuencia = 0;

  /**
   * Pide el inventario al otro módulo y **funde** lo recibido con la copia local: gana el registro
   * con la sincronización más reciente y nunca se pierde un ciclo que solo exista de un lado.
   * Devuelve cuántos equipos llegaron; 0 si el módulo no respondió.
   */
  async consultar(msEspera = 2500): Promise<number> {
    if (typeof window === 'undefined') return 0;
    this.estado.set('consultando');
    try {
      const remotos = await this.pedir(msEspera);
      this.ultimaConsulta.set(new Date().toTimeString().slice(0, 5));
      if (!remotos) {
        this.estado.set('sin-conexion');
        this.recibidos.set(0);
        return 0;
      }
      this.fundir(remotos);
      this.estado.set('conectado');
      this.recibidos.set(remotos.length);
      return remotos.length;
    } catch {
      this.estado.set('sin-conexion');
      return 0;
    }
  }

  /** Une lo remoto con lo local sin duplicar: por `id` de ciclo, gana lo sincronizado más tarde. */
  private fundir(remotos: EquipoOperativoCompartido[]): void {
    const locales = this.compartido.leer();
    const porId = new Map(locales.map((e) => [e.id, e]));
    for (const r of remotos) {
      const local = porId.get(r.id);
      if (!local || (r.fechaSincronizacion ?? '') >= (local.fechaSincronizacion ?? '')) porId.set(r.id, r);
    }
    this.compartido.guardar([...porId.values()]);
  }

  /** Una consulta al iframe puente. Resuelve `null` si no contesta dentro del plazo. */
  private pedir(msEspera: number): Promise<EquipoOperativoCompartido[] | null> {
    const peticion = ++this.secuencia;
    return new Promise((resolve) => {
      let terminado = false;
      const cerrar = (valor: EquipoOperativoCompartido[] | null) => {
        if (terminado) return;
        terminado = true;
        window.removeEventListener('message', escucha);
        clearTimeout(temporizador);
        resolve(valor);
      };
      const escucha = (ev: MessageEvent) => {
        if (ev.origin !== this.origenEquipos) return;
        const datos = ev.data ?? {};
        if (datos.tipo === 'sisgost:puente-listo') { this.preguntar(peticion); return; }
        if (datos.tipo === 'sisgost:inventario' && datos.peticion === peticion) {
          cerrar(Array.isArray(datos.equipos) ? datos.equipos : []);
        }
      };
      const temporizador = setTimeout(() => cerrar(null), msEspera);
      window.addEventListener('message', escucha);
      this.asegurarIframe();
      // Si el puente ya estaba cargado de una consulta anterior, no habrá «puente-listo».
      this.preguntar(peticion);
    });
  }

  private preguntar(peticion: number): void {
    this.iframe?.contentWindow?.postMessage({ tipo: 'sisgost:leer-inventario', peticion }, this.origenEquipos);
  }

  /** Crea el iframe oculto la primera vez; después se reutiliza. */
  private asegurarIframe(): void {
    if (this.iframe?.isConnected) return;
    const marco = document.createElement('iframe');
    marco.src = `${this.origenEquipos}/puente-inventario.html`;
    marco.setAttribute('aria-hidden', 'true');
    marco.setAttribute('title', 'Puente del inventario operativo de Gestión de Equipos');
    marco.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(marco);
    this.iframe = marco;
  }
}
