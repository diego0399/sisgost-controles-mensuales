import { Injectable, inject } from '@angular/core';
import { HolidayService } from './holiday.service';
import { isoLocal } from '../models/models';

/**
 * Días hábiles institucionales: lunes a viernes, excluyendo el catálogo de feriados
 * (nacionales y de San Salvador). Todos los plazos del sistema se calculan aquí.
 */
@Injectable({ providedIn: 'root' })
export class BusinessDayService {
  private readonly feriadosSrv = inject(HolidayService);

  esHabil(iso: string): boolean {
    const [a, m, d] = iso.split('-').map(Number);
    const dia = new Date(a, m - 1, d).getDay();
    if (dia === 0 || dia === 6) return false;
    return !this.feriadosSrv.esFeriado(iso);
  }

  /** N-ésimo día hábil del mes (n comienza en 1). */
  nHabilDelMes(anio: number, mes: number, n: number): string {
    let cuenta = 0;
    const ultimo = new Date(anio, mes, 0).getDate();
    for (let d = 1; d <= ultimo; d++) {
      const iso = isoLocal(new Date(anio, mes - 1, d));
      if (this.esHabil(iso)) {
        cuenta++;
        if (cuenta === n) return iso;
      }
    }
    return isoLocal(new Date(anio, mes, 0));
  }

  /** Días hábiles entre hoy y la fecha dada (0 si es hoy; negativo si ya pasó). */
  habilesHasta(isoLimite: string, desde = isoLocal(new Date())): number {
    if (isoLimite === desde) return 0;
    const paso = isoLimite > desde ? 1 : -1;
    let cuenta = 0;
    let cursor = desde;
    // Tope de seguridad: los plazos del sistema nunca exceden un año.
    for (let i = 0; i < 400 && cursor !== isoLimite; i++) {
      const [a, m, d] = cursor.split('-').map(Number);
      cursor = isoLocal(new Date(a, m - 1, d + paso));
      if (this.esHabil(cursor)) cuenta += paso;
    }
    return cuenta;
  }
}
