import { Component, computed, input, output } from '@angular/core';
import { IconComponent } from './icon';

/**
 * Clasifica un estado libre en una variante visual del badge. El orden de las ramas importa:
 * los estados que contienen subcadenas de otros («Entregado tarde» contiene «Entregado»,
 * «Enviada tarde» contiene «Enviada») se evalúan antes que su versión favorable.
 */
export function estadoKind(estado: string): 'ok' | 'warn' | 'danger' | 'info' | 'gold' | 'neutral' {
  const e = (estado || '').toLowerCase();
  if (/(entregado tarde|enviada tarde|fuera de plazo)/.test(e)) return 'warn';
  if (/(vencid|sin asignar|sin soporte|presenta falla|no cumple|incumpl|descargado|no disponible|no ubicado|crítico pendiente|crítica)/.test(e)) return 'danger';
  if (/(observad|pendiente de revisión|con hallazgo|en garantía|parcial|en remediación|reprogramado)/.test(e)) return 'warn';
  if (/justificad/.test(e)) return 'gold';
  if (/(inactiv|no aplica|finalizada|desactivad|sin cambios|sin garantía)/.test(e)) return 'neutral';
  if (/(entregad|enviad|cerrad|cumple|aceptad|aplicad|resuelto|activo|activa|completad|realizad|verificad|registrada|funciona|al día|emitida|generado|descargado el|vigente|bueno|actualizad|atendido|sin vulnerabilidades|up)/.test(e)) return 'ok';
  if (/(pendiente|en edición|por vencer|programado|escalado|en observación)/.test(e)) return 'warn';
  if (/(en proceso|en revisión|en curso|entrega aceptada)/.test(e)) return 'info';
  return 'neutral';
}

@Component({
  selector: 'ui-badge',
  template: `<span [class]="'badge ' + kind()">{{ estado() }}</span>`
})
export class BadgeComponent {
  readonly estado = input.required<string>();
  protected readonly kind = computed(() => estadoKind(this.estado()));
}

/** Icono «?» con tooltip discreto: la regla institucional aparece cuando el usuario la necesita. */
@Component({
  selector: 'ui-help',
  template: `
    <span class="helptip">
      <button type="button" aria-label="Ver ayuda">?</button>
      <span class="tip" role="tooltip">{{ texto() }}</span>
    </span>
  `
})
export class HelpTipComponent {
  readonly texto = input.required<string>();
}

/** Ventana modal simple para detalles, confirmaciones y formularios cortos. */
@Component({
  selector: 'ui-modal',
  imports: [IconComponent],
  template: `
    <div class="modal-backdrop" (click)="cerrar.emit()">
      <div class="modal" [class.ancho]="ancho()" (click)="$event.stopPropagation()">
        <div class="card-head">
          <div>
            <h3>{{ titulo() }}</h3>
            @if (sub()) { <p class="sub">{{ sub() }}</p> }
          </div>
          <button class="btn btn-ghost btn-sm" type="button" (click)="cerrar.emit()">
            <ui-icon name="x" [size]="14" /> Cerrar
          </button>
        </div>
        <div class="card-body">
          <ng-content />
        </div>
      </div>
    </div>
  `
})
export class ModalComponent {
  readonly titulo = input.required<string>();
  readonly sub = input('');
  readonly ancho = input(false);
  readonly cerrar = output<void>();
}
