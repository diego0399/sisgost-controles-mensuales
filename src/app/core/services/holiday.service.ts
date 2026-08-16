import { Injectable, signal } from '@angular/core';
import { Feriado } from '../models/models';

const STORAGE_KEY = 'sisgost.controles.feriados.v1';

/**
 * Catálogo editable de feriados de El Salvador y de la plaza de San Salvador.
 * Es un servicio propio (y no una tabla más del store) porque el cálculo de días hábiles
 * lo consumen otros servicios antes de que cargue el resto de datos, y porque la regla
 * institucional lo exige configurable: ninguna fecha va quemada en código.
 */
@Injectable({ providedIn: 'root' })
export class HolidayService {
  readonly feriados = signal<Feriado[]>([]);

  async cargar(): Promise<void> {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) {
      try { this.feriados.set(JSON.parse(guardado) as Feriado[]); return; } catch { /* semilla */ }
    }
    const res = await fetch('assets/data/feriados.json');
    this.feriados.set((await res.json()) as Feriado[]);
  }

  esFeriado(iso: string): Feriado | undefined {
    return this.feriados().find((f) => f.fecha === iso);
  }

  agregar(f: Feriado): void {
    this.feriados.update((l) => [...l.filter((x) => x.fecha !== f.fecha || x.nombre !== f.nombre), f]
      .sort((a, b) => a.fecha.localeCompare(b.fecha)));
    this.persistir();
  }

  eliminar(f: Feriado): void {
    this.feriados.update((l) => l.filter((x) => !(x.fecha === f.fecha && x.nombre === f.nombre)));
    this.persistir();
  }

  private persistir(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.feriados()));
  }
}
