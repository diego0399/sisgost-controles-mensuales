import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { permiteRuta } from '../config/permisos';

/** Bloquea rutas fuera del menú del rol conectado (misma tabla que el shell). */
export const roleGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = auth.usuario();
  if (!u) return router.parseUrl('/login');
  return permiteRuta(u.clave, state.url) ? true : router.parseUrl('/acceso-restringido');
};
