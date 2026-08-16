import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  tipo: 'ok' | 'error' | 'warn' | 'info';
  titulo: string;
  texto: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  private push(tipo: Toast['tipo'], titulo: string, texto: string): void {
    const t: Toast = { id: ++this.seq, tipo, titulo, texto };
    this.toasts.update((list) => [...list, t]);
    setTimeout(() => this.toasts.update((list) => list.filter((x) => x.id !== t.id)), 5200);
  }

  ok(titulo: string, texto = ''): void { this.push('ok', titulo, texto); }
  error(titulo: string, texto = ''): void { this.push('error', titulo, texto); }
  warn(titulo: string, texto = ''): void { this.push('warn', titulo, texto); }
  info(titulo: string, texto = ''): void { this.push('info', titulo, texto); }
}
