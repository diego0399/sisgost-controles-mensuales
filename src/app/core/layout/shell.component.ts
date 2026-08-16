import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';
import { ToastService } from '../services/toast.service';
import { IconComponent } from '../../shared/icon';
import { NAVEGACION, NavGrupo } from '../config/permisos';
import { MODULOS, URL_GESTION_EQUIPOS } from '../config/modulos';

/**
 * Layout principal: barra lateral con el menú por rol y barra superior con el usuario
 * conectado. Sus estilos viven en styles.css (sección «Shell») para no exceder el
 * presupuesto de CSS por componente.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  template: `
    <aside class="side">
      <div class="brand">
        <img src="assets/logos/LogoCNR_white.png" alt="Centro Nacional de Registros" />
        <div class="b-txt">
          <div class="b-name">SISGO<span class="gold">ST</span></div>
          <div class="b-sub">Controles Mensuales<br />Sistema de Gestión y Seguimiento de Soporte Técnico</div>
        </div>
      </div>
      <div class="brand-rule"></div>

      <!-- Selector de módulo del ecosistema SISGOST -->
      <div class="mod-sel">
        <div class="mod-title">SISGOST</div>
        @for (m of modulos; track m.clave) {
          @if (m.actual) {
            <div class="mod-a on"><ui-icon [name]="m.icono" /><span>{{ m.nombre }}</span></div>
          } @else {
            <a class="mod-a" [href]="m.url" [title]="'Ir a ' + m.nombre + ' — ' + m.descripcion">
              <ui-icon [name]="m.icono" /><span>Ir a {{ m.nombre }}</span>
              <ui-icon name="external" [size]="12" />
            </a>
          }
        }
      </div>

      <nav>
        @for (g of grupos(); track g.titulo) {
          <div class="nav-g">
            <div class="g-title">{{ g.titulo }}</div>
            @for (item of g.items; track item.ruta) {
              <a class="nav-a" [routerLink]="item.ruta" routerLinkActive="on">
                <ui-icon [name]="item.icono" />
                <span>{{ item.titulo }}</span>
              </a>
            }
          </div>
        }
      </nav>

      <div class="side-foot">
        <b>Prototipo institucional</b>
        Datos simulados (JSON) · sin backend<br />
        Conectado con SISGOST — Gestión de Equipos<br />
        Centro Nacional de Registros · DTI
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div>
          <div class="tb-crumb">{{ grupoActual() }}</div>
          <div class="tb-title">{{ tituloActual() }}</div>
        </div>

        <div class="tb-right">
          <a class="btn btn-outline btn-sm" [href]="urlEquipos" title="Abrir el módulo SISGOST — Gestión de Equipos">
            <ui-icon name="box" [size]="13" /> Ir a Gestión de Equipos
          </a>
          <div class="ver-como">
            <label for="vercomo">Ver como</label>
            <select id="vercomo" (change)="cambiarUsuario($event)">
              @for (u of data.usuariosDelModulo(); track u.usuario) {
                <option [value]="u.usuario" [selected]="u.usuario === auth.usuario()?.usuario">{{ u.rol }} · {{ u.nombre }}</option>
              }
            </select>
          </div>
          <div class="user-chip">
            <div class="avatar">{{ auth.usuario()?.iniciales }}</div>
            <div>
              <div class="u-name">{{ auth.usuario()?.nombre }}</div>
              <div class="u-role">{{ auth.usuario()?.rol }}</div>
            </div>
          </div>
          <button class="btn-out" type="button" (click)="salir()" title="Cerrar sesión">
            <ui-icon name="logout" />
          </button>
        </div>
      </header>

      <main class="content">
        <router-outlet />
      </main>
    </div>
  `
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly data = inject(DataService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  /** Módulos del ecosistema: el enlace a Gestión de Equipos vive en la barra lateral y la superior. */
  protected readonly modulos = MODULOS;
  protected readonly urlEquipos = URL_GESTION_EQUIPOS;

  /** Menú por rol (tabla en core/config/permisos.ts, compartida con el guard de rutas). */
  protected readonly grupos = computed<NavGrupo[]>(() => {
    const clave = this.auth.usuario()?.clave;
    return NAVEGACION
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || (!!clave && i.roles.includes(clave))) }))
      .filter((g) => g.items.length > 0);
  });

  private readonly urlActual = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  protected readonly tituloActual = computed(() => {
    const url = this.urlActual();
    for (const g of this.grupos()) {
      const item = g.items.find((i) => url.startsWith(i.ruta));
      if (item) return item.titulo;
    }
    return 'SISGOST — Controles Mensuales';
  });

  protected readonly grupoActual = computed(() => {
    const url = this.urlActual();
    for (const g of this.grupos()) {
      if (g.items.some((i) => url.startsWith(i.ruta))) return g.titulo;
    }
    return 'SISGOST';
  });

  protected cambiarUsuario(ev: Event): void {
    const usuario = (ev.target as HTMLSelectElement).value;
    const u = this.data.usuarios().find((x) => x.usuario === usuario);
    if (u) {
      this.auth.login(u);
      this.toast.info('Vista cambiada', `Ahora navegas como ${u.nombre} (${u.rol}).`);
      this.router.navigateByUrl('/panel');
    }
  }

  protected salir(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
