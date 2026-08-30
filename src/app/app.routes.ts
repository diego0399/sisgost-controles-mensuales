import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'panel' },
      { path: 'panel', canActivate: [roleGuard], loadComponent: () => import('./features/panel/panel.component').then((m) => m.PanelComponent) },
      { path: 'calendario', canActivate: [roleGuard], loadComponent: () => import('./features/calendario/calendario.component').then((m) => m.CalendarioComponent) },
      { path: 'historial', canActivate: [roleGuard], loadComponent: () => import('./features/historial/historial.component').then((m) => m.HistorialComponent) },
      { path: 'controles', canActivate: [roleGuard], loadComponent: () => import('./features/controles/controles.component').then((m) => m.ControlesComponent) },
      // La ruta del detalle por Dirección va ANTES que `controles/:id`: si no, `:id` la capturaría.
      { path: 'controles/direccion/:direccion/:unidad', canActivate: [roleGuard], loadComponent: () => import('./features/controles/direccion-detalle.component').then((m) => m.DireccionDetalleComponent) },
      { path: 'controles/:id', canActivate: [roleGuard], loadComponent: () => import('./features/controles/completar-control.component').then((m) => m.CompletarControlComponent) },
      { path: 'bitacora', canActivate: [roleGuard], loadComponent: () => import('./features/bitacora/bitacora.component').then((m) => m.BitacoraComponent) },
      { path: 'bitacora/:id', canActivate: [roleGuard], loadComponent: () => import('./features/bitacora/completar-bitacora.component').then((m) => m.CompletarBitacoraComponent) },
      { path: 'justificaciones', canActivate: [roleGuard], loadComponent: () => import('./features/justificaciones/justificaciones.component').then((m) => m.JustificacionesComponent) },
      { path: 'inventario', canActivate: [roleGuard], loadComponent: () => import('./features/inventario/inventario.component').then((m) => m.InventarioComponent) },
      { path: 'documentos', canActivate: [roleGuard], loadComponent: () => import('./features/documentos/documentos.component').then((m) => m.DocumentosComponent) },
      { path: 'trazabilidad', canActivate: [roleGuard], loadComponent: () => import('./features/trazabilidad/trazabilidad.component').then((m) => m.TrazabilidadComponent) },
      { path: 'administracion', canActivate: [roleGuard], loadComponent: () => import('./features/administracion/admin.component').then((m) => m.AdminComponent) },
      { path: 'catalogo', canActivate: [roleGuard], loadComponent: () => import('./features/administracion/catalogo.component').then((m) => m.CatalogoComponent) },
      { path: 'distribucion', canActivate: [roleGuard], loadComponent: () => import('./features/administracion/distribucion.component').then((m) => m.DistribucionComponent) },
      { path: 'responsables', canActivate: [roleGuard], loadComponent: () => import('./features/administracion/responsables.component').then((m) => m.ResponsablesComponent) },
      { path: 'feriados', canActivate: [roleGuard], loadComponent: () => import('./features/administracion/feriados.component').then((m) => m.FeriadosComponent) },
      { path: 'acceso-restringido', loadComponent: () => import('./features/acceso-restringido/acceso-restringido.component').then((m) => m.AccesoRestringidoComponent) }
    ]
  },
  { path: '**', redirectTo: 'panel' }
];
