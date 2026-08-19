import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DataService } from './data.service';

/**
 * Sincronización automática de las pantallas.
 *
 * Regla del módulo: **no hay botones de sincronizar, regenerar ni recalcular**. Cada pantalla que
 * trabaja sobre un período pide una pasada silenciosa al abrirse y cuando cambia lo que mira —mes,
 * año, Dirección/Unidad, técnico o el usuario de «Ver como»—, y la pasada se encarga de que los
 * controles del período, sus responsables y el inventario operativo estén al día.
 *
 * La pasada es idempotente y además se recuerda la última combinación sincronizada, de modo que
 * navegar de una pantalla a otra no repite trabajo ni ensucia la trazabilidad.
 */
@Injectable({ providedIn: 'root' })
export class AutoSyncService {
  private readonly data = inject(DataService);
  private readonly auth = inject(AuthService);

  /** Última clave sincronizada (período + usuario conectado). */
  private ultima = '';

  /**
   * Pone al día el período visible. Se llama desde un `effect` en cada pantalla, así que se
   * dispara solo también al cambiar de mes, de año o de usuario en «Ver como».
   */
  periodo(anio: number, mes: number): void {
    if (!this.data.listo()) return;
    const usuario = this.auth.usuario()?.usuario ?? '';
    const clave = `${anio}-${mes}|${usuario}`;
    if (clave === this.ultima) return;
    this.ultima = clave;
    this.data.autoSyncControls(anio, mes, this.auth.usuario());
    this.data.autoSyncOperationalInventory();
  }

  /**
   * Fuerza la siguiente pasada aunque la combinación no haya cambiado. Lo usan las pantallas de
   * administración después de guardar, porque ahí el período es el mismo pero la configuración no.
   */
  invalidar(): void { this.ultima = ''; }
}
