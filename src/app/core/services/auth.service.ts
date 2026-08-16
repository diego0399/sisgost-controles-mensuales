import { Injectable, computed, signal } from '@angular/core';
import { UsuarioSistema } from '../models/models';

const STORAGE_KEY = 'sisgost.controles.sesion';

/**
 * Sesión simulada de SISGOST — Controles Mensuales. Inician sesión los roles operativos:
 * Administrador, Encargado de Soporte, Técnico de Soporte y Jefatura (solo consulta).
 * Dirección/Unidad NO es un rol: es dato organizacional de los controles.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly usuario = signal<UsuarioSistema | null>(this.leerSesion());

  readonly esAdmin = computed(() => this.usuario()?.clave === 'admin');
  readonly esEncargado = computed(() => this.usuario()?.clave === 'enc-soporte');
  readonly esTecnico = computed(() => this.usuario()?.clave === 'tec-soporte');
  /** Jefatura consulta indicadores y reportes; nunca completa ni entrega. */
  readonly esConsulta = computed(() => this.usuario()?.clave === 'jefatura');
  /** Puede completar/entregar controles y bitácoras (técnico) o revisar (encargado). */
  readonly puedeOperar = computed(() => this.esTecnico() || this.esEncargado() || this.esAdmin());

  private leerSesion(): UsuarioSistema | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as UsuarioSistema) : null;
    } catch {
      return null;
    }
  }

  login(u: UsuarioSistema): void {
    this.usuario.set(u);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  }

  logout(): void {
    this.usuario.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }
}
