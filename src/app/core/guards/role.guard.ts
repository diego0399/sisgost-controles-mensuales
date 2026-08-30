import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { DataService } from '../services/data.service';
import { permiteRuta } from '../config/permisos';

/**
 * Bloquea rutas fuera del menú del **rol activo** (misma tabla que el shell).
 *
 * Con usuarios multirrol el bloqueo no significa «no puede»: significa «con este rol activo, no».
 * Quien tiene además el rol que la ruta pide solo necesita cambiar de rol activo, sin cerrar
 * sesión. Por eso el intento queda trazado con el rol activo y con todos los roles del usuario:
 * es la diferencia entre un permiso que falta y un rol que no estaba puesto.
 */
export const roleGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const data = inject(DataService);
  const router = inject(Router);
  const u = auth.usuario();
  if (!u) return router.parseUrl('/login');
  if (permiteRuta(u.clave, state.url)) return true;
  data.registrarAccesoDenegado(u, state.url);
  return router.parseUrl('/acceso-restringido');
};
