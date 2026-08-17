import { Injectable, inject } from '@angular/core';
import { BusinessDayService } from './business-day.service';
import { ControlMes, isoLocal } from '../models/models';

/**
 * Plazos de entrega de controles.
 *
 * Regla institucional: los controles mensuales se entregan dentro de los PRIMEROS 3 DÍAS
 * HÁBILES del mes SIGUIENTE al mes que cubren (el control de julio se entrega a inicios
 * de agosto). Sábados, domingos y feriados del catálogo no cuentan como hábiles.
 * Los controles semanales vencen el último día hábil de su semana.
 */
@Injectable({ providedIn: 'root' })
export class ControlDeadlineService {
  private readonly habiles = inject(BusinessDayService);

  /** Fecha límite del control mensual del período dado: 3.º día hábil del mes siguiente. */
  fechaLimiteMensual(anio: number, mes: number): string {
    const [a, m] = mes === 12 ? [anio + 1, 1] : [anio, mes + 1];
    return this.habiles.nHabilDelMes(a, m, 3);
  }

  /** Fecha límite de la semana `n` (1–5) de un control semanal: su viernes, o el último día del mes. */
  fechaLimiteSemanal(anio: number, mes: number, semana: number): string {
    const ultimo = new Date(anio, mes, 0).getDate();
    const dia = Math.min(semana * 7, ultimo);
    let f = new Date(anio, mes - 1, dia);
    // Retrocede hasta el viernes de esa semana sin salirse del mes.
    while (f.getDay() !== 5 && f.getDate() > 1) f = new Date(anio, mes - 1, f.getDate() - 1);
    return isoLocal(f);
  }

  /** Días hábiles restantes para el límite (negativo = vencido). */
  diasRestantes(c: ControlMes): number {
    return this.habiles.habilesHasta(c.fechaLimite);
  }

  /** Estado de entrega derivado de las fechas: a tiempo, tarde o aún vencido. */
  evaluaEntrega(c: ControlMes, fechaEntrega: string): 'Entregado' | 'Entregado tarde' {
    return fechaEntrega <= c.fechaLimite ? 'Entregado' : 'Entregado tarde';
  }

  /** Un control abierto cuya fecha límite ya pasó está vencido. */
  estaVencido(c: ControlMes, hoy = isoLocal(new Date())): boolean {
    const abierto = ['Programado', 'Pendiente', 'En proceso', 'Listo para entregar'].includes(c.estado);
    return abierto && c.fechaLimite < hoy;
  }

  /** ¿El plazo de entrega del período mensual ya venció? */
  periodoCerrado(anio: number, mes: number, hoy = isoLocal(new Date())): boolean {
    return this.fechaLimiteMensual(anio, mes) < hoy;
  }

  /**
   * **Período activo**: el año y el mes de la fecha actual del sistema. Es el período que todas
   * las pantallas cargan al abrirse —controles, vista por Dirección, detalle, calendario,
   * historial y panel—, porque es el mes que el personal está trabajando. El plazo de entrega
   * puede seguir corriendo (agosto se entrega en los primeros días hábiles de septiembre): el mes
   * seleccionado es agosto, no julio.
   */
  periodoActivo(hoy = isoLocal(new Date())): { anio: number; mes: number } {
    const [anio, mes] = hoy.split('-').map(Number);
    return { anio, mes };
  }

  /**
   * Último período **cerrado**: el mes más reciente cuyo plazo de entrega ya venció. No es el
   * período que se muestra por defecto (eso es `periodoActivo`), pero sigue siendo útil para
   * comparar resultados de meses ya vencidos.
   */
  ultimoPeriodoCerrado(hoy = isoLocal(new Date())): { anio: number; mes: number } {
    const f = new Date(hoy);
    let anio = f.getFullYear();
    let mes = f.getMonth() + 1;
    for (let i = 0; i < 24; i++) {
      if (this.periodoCerrado(anio, mes, hoy)) return { anio, mes };
      mes -= 1;
      if (mes === 0) { mes = 12; anio -= 1; }
    }
    return { anio, mes };
  }
}
