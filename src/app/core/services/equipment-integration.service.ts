import { Injectable, computed, inject } from '@angular/core';
import { DataService } from './data.service';
import { EventoIntegracion } from '../models/models';

/**
 * Integración **automática** con SISGOST — Gestión de Equipos.
 *
 * Regla de conexión entre módulos: cuando el flujo de Gestión de Equipos finaliza con la
 * aceptación del Usuario Final, el equipo entra al inventario operativo de la Dirección/Unidad
 * solicitante; cuando Soporte registra el descargo, sale del inventario activo. **Ninguna de las
 * dos cosas se confirma a mano**: no hay botones de «incorporar» ni de «aplicar descargo». El
 * módulo se sincroniza al cargar y lo que se muestra son los movimientos ya sincronizados.
 *
 * Aquí no se duplica la lógica de Gestión de Equipos: solo se consumen sus eventos (cola
 * simulada en la semilla) y se traducen a movimientos del inventario operativo.
 */
@Injectable({ providedIn: 'root' })
export class EquipmentIntegrationService {
  private readonly data = inject(DataService);

  /** Movimientos ya aplicados al inventario operativo, del más reciente al más antiguo. */
  readonly sincronizados = computed(() => this.data.eventosIntegracion()
    .filter((e) => e.aplicado)
    .sort((a, b) => b.fecha.localeCompare(a.fecha)));

  /** Últimos movimientos sincronizados (vista informativa del inventario operativo). */
  ultimos(n = 5): EventoIntegracion[] { return this.sincronizados().slice(0, n); }

  readonly totalSincronizados = computed(() => this.sincronizados().length);
  readonly aceptaciones = computed(() => this.sincronizados().filter((e) => e.tipo === 'Entrega aceptada').length);
  readonly descargos = computed(() => this.sincronizados().filter((e) => e.tipo === 'Descargo de equipo').length);

  /**
   * Fuerza una pasada de sincronización. La normal ocurre sola al cargar el módulo; esta existe
   * para el caso en que lleguen eventos nuevos durante la sesión. Es idempotente: un evento ya
   * procesado no vuelve a aplicarse.
   */
  syncOperationalInventory(): number { return this.data.sincronizarInventario(); }
}
