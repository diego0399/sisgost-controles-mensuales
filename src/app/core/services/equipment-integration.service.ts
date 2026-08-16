import { Injectable, computed, inject } from '@angular/core';
import { DataService } from './data.service';
import { UsuarioSistema } from '../models/models';

/**
 * Integración simulada con SISGOST — Gestión de Equipos.
 *
 * Regla de conexión entre módulos: cuando el flujo de Gestión de Equipos finaliza con la
 * aceptación del Usuario Final, el equipo entra al inventario operativo de la Dirección/Unidad
 * solicitante; un descargo posterior lo retira del inventario activo. Aquí no se duplica la
 * lógica de Gestión de Equipos: solo se consumen sus eventos (cola simulada en la semilla).
 */
@Injectable({ providedIn: 'root' })
export class EquipmentIntegrationService {
  private readonly data = inject(DataService);

  readonly pendientes = computed(() => this.data.eventosIntegracion().filter((e) => !e.aplicado));
  readonly aplicados = computed(() => this.data.eventosIntegracion().filter((e) => e.aplicado));

  /** Aplica el evento sobre el inventario operativo y lo deja constar en trazabilidad. */
  aplicar(idEvento: string, u: UsuarioSistema): void {
    this.data.aplicarEventoIntegracion(idEvento, u);
  }
}
