import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DataService } from '../../core/services/data.service';
import {
  BitacoraMapService, EstadoAmbitoBitacora, EstadoDepartamentoBitacora, EstadoVisualBitacora,
  FiltroMapaBitacoras, ModoPeriodo
} from '../../core/services/bitacora-map.service';
import { MapaSalvadorComponent, RegionMapa } from '../../shared/mapa-salvador';
import { HelpTipComponent } from '../../shared/ui';
import { DocumentoComponent } from '../../shared/documento';
import { IconComponent } from '../../shared/icon';
import { formateaFecha, isoLocal, nombreMes } from '../../core/models/models';
import { ETIQUETA_TODO_EL_DEPARTAMENTO } from '../../core/models/territorio';

/** Una entrada de la leyenda: el color, su glifo, su nombre y a qué estados corresponde. */
interface EntradaLeyenda {
  color: 'ok' | 'warn' | 'danger' | 'none';
  icono: string;
  titulo: string;
  detalle: string;
}

/**
 * MAPA DE BITÁCORAS — el estado de las bitácoras diarias sobre el mapa de El Salvador.
 *
 * Responde de un vistazo la pregunta con la que el Encargado de Soporte y el Coordinador empiezan
 * el día: **¿qué departamentos ya reportaron y cuáles no?** Antes había que recorrer la tabla del
 * historial de bitácoras departamento por departamento; aquí el país aparece coloreado y el
 * detalle se abre al hacer clic.
 *
 * Las reglas no están aquí: las calcula `BitacoraMapService`, y la geometría la dibuja
 * `ui-mapa-salvador`. Esta pantalla decide **qué se muestra y a quién**.
 *
 * ## Lo que el mapa puede y no puede decir
 *
 * · **No hay botón de sincronizar.** Todo cuelga de signals: cambiar un filtro, enviar una
 *   bitácora en otra pestaña o modificar la distribución repinta el mapa por sí solo.
 * · **Los filtros no borran departamentos**: los atenúan. Un mapa al que le faltan departamentos
 *   deja de ser el país y se lee peor, no mejor.
 * · **El rol activo manda.** El Técnico de Soporte ve el país completo pero solo con color en los
 *   departamentos que atiende; el Coordinador ve todo y no puede editar nada; el Encargado y el
 *   Administrador ven y abren todo.
 */
@Component({
  selector: 'app-mapa-bitacoras',
  imports: [
    FormsModule, RouterLink, MapaSalvadorComponent, HelpTipComponent,
    DocumentoComponent, IconComponent
  ],
  styles: `
    .filtros { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; }
    @media (max-width: 1180px) { .filtros { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 680px) { .filtros { grid-template-columns: repeat(2, 1fr); } }
    .filtros label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .04em;
      text-transform: uppercase; color: var(--tx-3); margin-bottom: 4px; }
    .atajos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; align-items: center; }

    /* KPIs: cifra grande y etiqueta corta. Sin gráfico, porque son seis cantidades sueltas y un
       número es más rápido de leer que seis barras. */
    .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
    @media (max-width: 1180px) { .kpis { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 560px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    .kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md);
      padding: 13px 15px; box-shadow: var(--shadow-1); }
    .kpi b { display: block; font-size: 25px; line-height: 1.05; color: var(--navy-900); }
    .kpi span { font-size: 11px; color: var(--tx-3); text-transform: uppercase; letter-spacing: .04em; }
    .kpi.ok b { color: var(--ok); } .kpi.danger b { color: var(--danger); }
    .kpi.warn b { color: var(--warn); } .kpi.none b { color: var(--neutral); }

    /* Mapa a la izquierda, detalle a la derecha; apilados en pantalla pequeña (§19). */
    .lienzo { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 1080px) { .lienzo { grid-template-columns: 1fr; } }

    .leyenda { display: flex; flex-wrap: wrap; gap: 8px 16px; }
    .leyenda > div { display: flex; gap: 7px; align-items: flex-start; font-size: 12px; max-width: 210px; }
    .leyenda .muestra { flex: none; width: 15px; height: 15px; border-radius: 4px; margin-top: 1px;
      border: 1.5px solid; display: inline-flex; align-items: center; justify-content: center; }
    .leyenda b { display: block; color: var(--navy-900); font-size: 12px; }
    .leyenda em { font-style: normal; color: var(--tx-3); font-size: 11.5px; line-height: 1.3; }

    /* El chip de estado usa EXACTAMENTE los colores del mapa (§11) y siempre lleva glifo y texto:
       el color nunca informa solo. */
    .chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 6px;
      border-radius: 999px; font-size: 11.5px; font-weight: 700; border: 1px solid; white-space: nowrap; }
    .ok     { --c: #1a7a4c; --f: #e6f4ec; }
    .warn   { --c: #8f6400; --f: #fbf1d8; }
    .danger { --c: #a8302a; --f: #fae6e4; }
    .none   { --c: #6b7c92; --f: #eef2f7; }
    .chip.ok, .chip.warn, .chip.danger, .chip.none { color: var(--c); background: var(--f); border-color: var(--c); }
    .muestra.ok     { background: #4aa36f; border-color: #1a7a4c; color: #0d2240; }
    .muestra.warn   { background: #d4aa30; border-color: #8f6400; color: #0d2240; }
    .muestra.danger { background: #a8302a; border-color: #7d1e19; color: #ffffff; }
    .muestra.none   { background: #c3cedd; border-color: #9aa9bc; color: #0d2240; }
    .muestra.sel    { background: #ffffff; border-color: var(--blue-500); border-width: 3px; }

    .det-fila { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0;
      border-bottom: 1px dashed var(--line); font-size: 13px; }
    .det-fila:last-child { border-bottom: 0; }
    .det-fila .et { color: var(--tx-3); flex: none; }
    .det-fila .vl { text-align: right; color: var(--tx); font-weight: 500; }
    .sub-ambito { border: 1px solid var(--line); border-radius: var(--r-sm); padding: 9px 11px;
      margin-bottom: 7px; background: var(--surface-2); }
    .sub-ambito .row-between { gap: 8px; }
    .alcance-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
    .vacio { text-align: center; padding: 26px 18px; color: var(--tx-3); font-size: 13px; }
    .tarde { color: var(--warn); font-size: 11px; font-weight: 700; }

    /* Ocho columnas en el ancho de la página: sin anchos acotados, «Observación» y las acciones
       se salen de la vista, y la acción es justamente lo que hay que poder pulsar. */
    .tbl th { white-space: normal; line-height: 1.2; vertical-align: bottom; }
    .c-zona { width: 82px; }
    .c-dep { width: 136px; }
    .c-amb { width: 168px; }
    .c-tec { width: 116px; }
    .c-est { width: 124px; }
    .c-hora { width: 72px; }
    .c-obs { width: 196px; font-size: 12px; }
    .c-acc { width: 168px; text-align: right; }
    .c-est .reg { display: block; margin-top: 3px; font-size: 11px; color: var(--tx-3); }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <div class="page-kicker">Seguimiento</div>
          <h1>
            Mapa de bitácoras
            <ui-help texto="Estado de la bitácora diaria de cada departamento en la fecha seleccionada. La bitácora debe enviarse antes de las 5:00 p. m.; en San Salvador se lleva una por Dirección/Registro y en los demás departamentos una por departamento completo." />
          </h1>
          <p class="page-sub">
            Bitácoras por departamento sobre el mapa de El Salvador · distribución de soportes vigente ·
            hora límite <b>{{ mapa.HORA_LIMITE }}</b>.
          </p>
        </div>
        <a class="btn btn-outline" routerLink="/bitacora">
          <ui-icon name="sun" [size]="14" /> Ir a Bitácora diaria
        </a>
      </div>

      <div class="alert" style="margin-bottom: 16px;">
        <span class="alert-ico">i</span>
        <span>
          <b>Cómo leer el mapa.</b> El color responde si la bitácora del día se hizo, no si se hizo
          bien: <b>verde</b> es enviada o cerrada —incluida la enviada tarde, que además se cuenta
          aparte—, <b>amarillo</b> es empezada sin cerrar u observada, <b>rojo</b> es pendiente o
          vencida y <b>gris</b> es que ese departamento no tiene soporte asignado y no hay a quién
          exigirle nada. <b>San Salvador</b> se colorea con el agregado de sus cinco
          Direcciones/Registros: haga clic para ver el desglose. Los filtros no quitan departamentos
          del mapa, los atenúan. Nada se sincroniza a mano.
        </span>
      </div>

      <!-- ------------------------------------------------------------------ filtros -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="card-body">
          <div class="filtros">
            <div>
              <label for="f-modo">Período</label>
              <select id="f-modo" class="control" [(ngModel)]="modo" (ngModelChange)="registraFiltro()">
                <option value="Día">Un día</option>
                <option value="Mes">Un mes completo</option>
              </select>
            </div>
            @if (modo() === 'Día') {
              <div>
                <label for="f-fecha">Fecha</label>
                <input id="f-fecha" class="control" type="date" [(ngModel)]="fecha" (ngModelChange)="registraFiltro()" />
              </div>
            } @else {
              <div>
                <label for="f-mes">Mes</label>
                <select id="f-mes" class="control" [(ngModel)]="mes" (ngModelChange)="registraFiltro()">
                  @for (m of meses; track m.n) { <option [value]="m.n">{{ m.nombre }}</option> }
                </select>
              </div>
            }
            <div>
              <label for="f-anio">Año</label>
              <select id="f-anio" class="control" [(ngModel)]="anio" (ngModelChange)="registraFiltro()">
                @for (a of anios(); track a) { <option [value]="a">{{ a }}</option> }
              </select>
            </div>
            <div>
              <label for="f-zona">Zona</label>
              <select id="f-zona" class="control" [(ngModel)]="zona" (ngModelChange)="registraFiltro()">
                <option value="">Todas las zonas</option>
                @for (z of data.territorio.zonasOrdenadas(); track z.id) {
                  <option [value]="z.id">{{ z.nombre }}</option>
                }
              </select>
            </div>
            <div>
              <label for="f-dep">Departamento</label>
              <select id="f-dep" class="control" [(ngModel)]="departamento" (ngModelChange)="registraFiltro()">
                <option value="">Todos los departamentos</option>
                @for (d of data.territorio.departamentosActivos(); track d.id) {
                  <option [value]="d.id">{{ d.nombre }}</option>
                }
              </select>
            </div>
            <div>
              <label for="f-tec">Técnico de Soporte</label>
              <select id="f-tec" class="control" [(ngModel)]="tecnico" (ngModelChange)="registraFiltro()" [disabled]="limitadoAlTecnico()">
                <option value="">Todos los técnicos</option>
                @for (t of mapa.tecnicosConDistribucion(); track t) { <option [value]="t">{{ t }}</option> }
              </select>
            </div>
            <div>
              <label for="f-est">Estado de bitácora</label>
              <select id="f-est" class="control" [(ngModel)]="estado" (ngModelChange)="registraFiltro()">
                <option value="">Todos los estados</option>
                @for (e of estadosVisuales; track e) { <option [value]="e">{{ e }}</option> }
              </select>
            </div>
          </div>

          <div class="atajos">
            @if (modo() === 'Día') {
              <button class="btn btn-ghost btn-sm" type="button" (click)="irA(hoy)">Hoy</button>
              @if (ultimaConRegistro(); as u) {
                <button class="btn btn-ghost btn-sm" type="button" (click)="irA(u)">
                  Último día con registros ({{ formatea(u) }})
                </button>
              }
            }
            @if (hayFiltros()) {
              <button class="btn btn-ghost btn-sm" type="button" (click)="limpiar()">
                <ui-icon name="undo" [size]="13" /> Quitar filtros
              </button>
            }
            <span class="muted" style="font-size: 12px; margin-left: auto;">
              {{ etiquetaPeriodo() }}
              @if (limitadoAlTecnico()) {
                · <b>Rol activo Técnico de Soporte</b>: con color solo sus departamentos
              }
            </span>
          </div>
        </div>
      </div>

      @if (modo() === 'Día' && !esHabil()) {
        <div class="alert warn" style="margin-bottom: 16px;">
          <span class="alert-ico">!</span>
          <span>
            <b>{{ formatea(fecha()) }} no es día hábil.</b> No se genera bitácora diaria, así que el
            mapa aparece en gris: no hay nada pendiente que reclamar.
          </span>
        </div>
      }

      <!-- ------------------------------------------------------------------ indicadores -->
      <div class="kpis" style="margin-bottom: 16px;">
        <div class="kpi"><b>{{ resumen().cubiertos }}/{{ resumen().departamentos }}</b><span>Departamentos cubiertos</span></div>
        <div class="kpi ok"><b>{{ resumen().realizadas }}</b><span>Bitácoras realizadas</span></div>
        <div class="kpi danger"><b>{{ resumen().pendientes }}</b><span>Pendientes</span></div>
        <div class="kpi danger"><b>{{ resumen().vencidas }}</b><span>Vencidas</span></div>
        <div class="kpi warn"><b>{{ resumen().tarde }}</b><span>Enviadas tarde</span></div>
        <div class="kpi none"><b>{{ resumen().sinSoporte }}</b><span>Sin soporte asignado</span></div>
      </div>

      <!-- ------------------------------------------------------------------ mapa y detalle -->
      <div class="lienzo" style="margin-bottom: 16px;">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>El Salvador · {{ etiquetaPeriodo() }}</h3>
              <p class="sub">
                Haga clic en un departamento para ver su detalle. {{ resumen().ambitos }} ámbitos de bitácora.
                @if (modo() === 'Mes') {
                  · El mes se mide sobre las <b>bitácoras registradas</b>, no sobre los días hábiles
                  esperados: es la misma base con la que el panel ejecutivo calcula la operatividad.
                }
              </p>
            </div>
          </div>
          <div class="card-body">
            <ui-mapa-salvador [regiones]="regiones()" (elegir)="seleccionar($event)" />
            <div class="leyenda" style="margin-top: 14px;">
              @for (l of leyenda; track l.titulo) {
                <div>
                  <span class="muestra {{ l.color }}"><ui-icon [name]="l.icono" [size]="10" /></span>
                  <span><b>{{ l.titulo }}</b><em>{{ l.detalle }}</em></span>
                </div>
              }
              <div>
                <span class="muestra sel"></span>
                <span><b>Seleccionado</b><em>Contorno azul; el relleno conserva su estado</em></span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          @if (detalle(); as d) {
            <div class="card-head">
              <div>
                <h3>{{ d.departamento }}</h3>
                <p class="sub">{{ d.zona }} · {{ d.porDireccion ? 'Distribución por Dirección/Registro' : 'Distribución por departamento completo' }}</p>
              </div>
              <button class="btn btn-ghost btn-sm" type="button" (click)="seleccion.set('')">
                <ui-icon name="x" [size]="13" /> Cerrar
              </button>
            </div>
            <div class="card-body">
              <div class="row-between" style="margin-bottom: 12px;">
                <span class="chip {{ d.color }}">
                  <ui-icon [name]="iconoDe(d.estadoVisual)" [size]="12" /> {{ d.estadoVisual }}
                </span>
                @if (d.totales.tarde) { <span class="tarde">{{ d.totales.tarde }} enviada(s) tarde</span> }
              </div>

              <div class="det-fila"><span class="et">Zona</span><span class="vl">{{ d.zona }}</span></div>
              <div class="det-fila"><span class="et">{{ modo() === 'Día' ? 'Fecha consultada' : 'Período' }}</span><span class="vl">{{ etiquetaPeriodo() }}</span></div>
              <div class="det-fila"><span class="et">Hora límite</span><span class="vl">{{ mapa.HORA_LIMITE }} · 5:00 p. m.</span></div>
              <div class="det-fila">
                <span class="et">Técnico(s) responsable(s)</span>
                <span class="vl">{{ d.responsables.length ? d.responsables.join(' · ') : 'Sin soporte asignado' }}</span>
              </div>
              <div class="det-fila">
                <span class="et">Bitácoras</span>
                <span class="vl">
                  {{ d.totales.realizadas }} realizada(s) ·
                  {{ d.totales.proceso }} en proceso ·
                  {{ d.totales.pendientes + d.totales.vencidas }} faltante(s)
                </span>
              </div>

              <div class="sec-title" style="margin: 16px 0 8px;">
                {{ d.porDireccion ? 'Desglose por Dirección/Registro' : 'Ámbito de la bitácora' }}
              </div>
              @for (a of d.ambitos; track a.clave) {
                <div class="sub-ambito">
                  <div class="row-between" style="margin-bottom: 4px;">
                    <b style="font-size: 12.5px;">{{ a.ambito }}</b>
                    <span class="chip {{ a.color }}">
                      <ui-icon [name]="iconoDe(a.estadoVisual)" [size]="11" /> {{ a.estadoVisual }}
                    </span>
                  </div>
                  <p class="muted" style="font-size: 12px;">
                    {{ a.responsables.length ? a.responsables.join(' · ') : 'Sin soporte asignado' }}
                    @if (a.horaEnvio) { · enviada a las {{ a.horaEnvio }} }
                    @if (a.estado !== a.estadoVisual) { · registro: {{ a.estado }} }
                  </p>
                  @if (a.fallas) {
                    <p class="muted" style="font-size: 12px;">{{ a.fallas }} falla(s) del equipo de atención al público</p>
                  }
                  @if (a.observaciones) {
                    <p class="muted" style="font-size: 12px; margin-top: 4px;">{{ a.observaciones }}</p>
                  }
                  @if (a.bitacoraId || a.documento) {
                    <div class="row" style="gap: 6px; margin-top: 7px;">
                      @if (a.bitacoraId) {
                        <a class="btn btn-ghost btn-sm" [routerLink]="['/bitacora', a.bitacoraId]"
                          (click)="registraApertura(a)">Ver bitácora</a>
                      }
                      @if (a.documento) {
                        <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(a.documento)">Ver documento</button>
                      }
                    </div>
                  } @else {
                    <p class="muted" style="font-size: 11.5px; margin-top: 6px;">Sin registro de bitácora que abrir.</p>
                  }
                </div>
              }

              @if (!d.porDireccion) {
                <div class="sec-title" style="margin: 14px 0 6px;">Direcciones/Registros cubiertos</div>
                <div class="alcance-chips">
                  @for (r of registrosDe(d.departamentoId); track r) { <span class="badge neutral">{{ r }}</span> }
                </div>
                <p class="muted" style="font-size: 11.5px; margin-top: 6px;">
                  El responsable del departamento cubre todas: la regla territorial no pide asignarlas una por una.
                </p>
              }

              <div class="row" style="gap: 8px; margin-top: 16px;">
                <a class="btn btn-outline btn-sm" routerLink="/trazabilidad">
                  <ui-icon name="clock" [size]="13" /> Ver trazabilidad
                </a>
                <a class="btn btn-ghost btn-sm" routerLink="/responsables">
                  <ui-icon name="map" [size]="13" /> Mapa de responsables
                </a>
              </div>
            </div>
          } @else {
            <div class="card-head"><div><h3>Detalle del departamento</h3><p class="sub">Ninguno seleccionado</p></div></div>
            <div class="card-body">
              <p class="vacio">
                Haga clic en un departamento del mapa para ver su estado, su técnico responsable y
                —en San Salvador— el desglose por Dirección/Registro.
              </p>
            </div>
          }
        </div>
      </div>

      <!-- ------------------------------------------------------------------ tabla -->
      <div class="card">
        <div class="card-head">
          <div>
            <h3>Detalle por ámbito</h3>
            <p class="sub">{{ filas().length }} ámbito(s) · el mismo color que el mapa, primero lo que falta</p>
          </div>
        </div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="tbl">
              <thead>
                <tr>
                  <th class="c-zona">Zona</th><th class="c-dep">Departamento</th><th class="c-amb">Dirección/Registro</th>
                  <th class="c-tec">Técnico responsable</th><th class="c-est">Estado bitácora</th>
                  <th class="c-hora">Hora de envío</th><th class="c-obs">Observación</th><th class="c-acc">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (a of filas(); track a.clave) {
                  <tr>
                    <td class="c-zona">{{ a.zona }}</td>
                    <td class="c-dep"><b>{{ a.corta }}</b> <span class="muted">{{ a.departamento }}</span></td>
                    <td class="c-amb">{{ a.ambito }}</td>
                    <td class="c-tec">{{ a.responsables.length ? a.responsables.join(' · ') : '—' }}</td>
                    <td class="c-est">
                      <span class="chip {{ a.color }}">
                        <ui-icon [name]="iconoDe(a.estadoVisual)" [size]="11" /> {{ a.estadoVisual }}
                      </span>
                      <!-- El estado del registro va debajo, no en otra columna: casi siempre dice
                           lo mismo que el visual, y solo importa cuando NO coincide. -->
                      @if (a.estado !== a.estadoVisual) { <span class="reg">Registro: {{ a.estado }}</span> }
                    </td>
                    <td class="mono c-hora">{{ a.horaEnvio || '—' }}</td>
                    <td class="c-obs">
                      @if (a.fallas) { <span class="badge warn">{{ a.fallas }} falla(s)</span> }
                      {{ a.observaciones || (a.fallas ? '' : '—') }}
                    </td>
                    <td class="c-acc">
                      <div class="row" style="gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                        <button class="btn btn-ghost btn-sm" type="button" (click)="seleccionar(a.departamentoId)">Ver en el mapa</button>
                        @if (a.bitacoraId) {
                          <a class="btn btn-ghost btn-sm" [routerLink]="['/bitacora', a.bitacoraId]"
                            (click)="registraApertura(a)">Ver bitácora</a>
                        }
                        @if (a.documento) {
                          <button class="btn btn-ghost btn-sm" type="button" (click)="verDoc.set(a.documento)">Documento</button>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="muted">Ningún ámbito coincide con los filtros seleccionados.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ui-documento [id]="verDoc()" (cerrado)="verDoc.set('')" />
    </div>
  `
})
export class MapaBitacorasComponent {
  protected readonly data = inject(DataService);
  protected readonly mapa = inject(BitacoraMapService);
  private readonly auth = inject(AuthService);

  protected readonly hoy = isoLocal(new Date());
  /** Los doce meses con su número, para el selector de período. */
  protected readonly meses = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, nombre: nombreMes(i + 1) }));
  protected readonly estadosVisuales: EstadoVisualBitacora[] = [
    'Realizada', 'En proceso', 'Parcial', 'Pendiente', 'Vencida', 'Sin soporte asignado', 'Sin registro'
  ];

  protected readonly leyenda: EntradaLeyenda[] = [
    { color: 'ok', icono: 'check', titulo: 'Bitácora realizada', detalle: 'Enviada, enviada tarde o cerrada' },
    { color: 'warn', icono: 'clock', titulo: 'En proceso', detalle: 'En edición u observada; en San Salvador, parcial' },
    { color: 'danger', icono: 'alert', titulo: 'Pendiente o vencida', detalle: 'Sin enviar; vencida si pasó la hora límite' },
    { color: 'none', icono: 'circle', titulo: 'Sin soporte asignado', detalle: 'Nadie responde por el departamento, o no es día hábil' }
  ];

  // --------------------------------------------------------------- filtros
  protected readonly modo = signal<ModoPeriodo>('Día');
  protected readonly fecha = signal(this.mapa.fechaPorOmision());
  protected readonly anio = signal(Number(this.mapa.fechaPorOmision().slice(0, 4)));
  protected readonly mes = signal(Number(this.mapa.fechaPorOmision().slice(5, 7)));
  protected readonly zona = signal('');
  protected readonly departamento = signal('');
  protected readonly tecnico = signal('');
  protected readonly estado = signal<EstadoVisualBitacora | ''>('');

  protected readonly seleccion = signal('');
  protected readonly verDoc = signal('');

  /** Firma del último filtro registrado en trazabilidad: evita repetir el mismo evento. */
  private ultimaFirma = '';
  /** Último departamento registrado como seleccionado: un doble clic no es dos consultas. */
  private ultimoSeleccionado = '';

  constructor() {
    // El rol activo Técnico de Soporte trae su propio alcance: el filtro por técnico queda fijo
    // en su nombre y deshabilitado, porque no puede consultar la bitácora de otro (§14).
    const u = this.auth.usuario();
    if (u?.clave === 'tec-soporte') this.tecnico.set(u.nombre);

    // Un solo evento de entrada, con el recuento ya calculado. Deliberadamente NO se registra un
    // evento por ámbito ni por recálculo: el mapa se repinta con cada señal que cambia, y una
    // trazabilidad con cientos de líneas que nadie provocó deja de ser trazabilidad.
    const r = this.mapa.resumen(this.filtro());
    this.data.registrarEvento(u, {
      accion: 'Mapa de bitácoras consultado',
      observacion: `${this.etiquetaPeriodo()} · ${r.realizadas} realizada(s), `
        + `${r.pendientes} pendiente(s), ${r.vencidas} vencida(s), ${r.tarde} tarde, `
        + `${r.sinSoporte} ámbito(s) sin soporte asignado sobre ${r.ambitos} ámbitos de `
        + `${r.departamentos} departamento(s).`
    });
  }

  // --------------------------------------------------------------- estado derivado

  protected readonly filtro = computed<FiltroMapaBitacoras>(() => ({
    modo: this.modo(),
    fecha: this.fecha(),
    anio: Number(this.anio()),
    mes: Number(this.mes()),
    zona: this.zona(),
    departamento: this.departamento(),
    tecnico: this.tecnico(),
    estado: this.estado()
  }));

  protected readonly departamentos = computed(() => this.mapa.departamentos(this.filtro()));
  protected readonly filas = computed(() => this.mapa.filas(this.filtro()));
  protected readonly resumen = computed(() => this.mapa.resumen(this.filtro()));
  protected readonly esHabil = computed(() => this.mapa.esDiaHabil(this.fecha()));
  protected readonly ultimaConRegistro = computed(() => this.mapa.fechasConRegistro()[0] ?? '');

  /** ¿El rol activo limita la vista a los departamentos del propio técnico? */
  protected readonly limitadoAlTecnico = computed(() => this.auth.usuario()?.clave === 'tec-soporte');

  /** Años con bitácoras registradas, más el año en curso. */
  protected readonly anios = computed(() => {
    const años = new Set(this.data.bitacoras().map((b) => Number(b.fecha.slice(0, 4))));
    años.add(new Date().getFullYear());
    return [...años].sort((a, b) => b - a);
  });

  /** Lo que el mapa recibe: los 14 departamentos, con color, atenuación y tooltip. */
  protected readonly regiones = computed<RegionMapa[]>(() => this.departamentos().map((d) => ({
    id: d.departamentoId,
    color: d.color,
    atenuado: !d.enAlcance,
    seleccionado: d.departamentoId === this.seleccion(),
    titulo: this.tooltip(d)
  })));

  protected readonly detalle = computed<EstadoDepartamentoBitacora | undefined>(() =>
    this.departamentos().find((d) => d.departamentoId === this.seleccion()));

  protected readonly hayFiltros = computed(() =>
    !!(this.zona() || this.departamento() || this.estado() || (this.tecnico() && !this.limitadoAlTecnico())));

  protected readonly etiquetaPeriodo = computed(() => this.modo() === 'Día'
    ? formateaFecha(this.fecha())
    : `${nombreMes(Number(this.mes()))} ${this.anio()}`);

  // --------------------------------------------------------------- acciones

  protected seleccionar(departamentoId: string): void {
    this.seleccion.set(departamentoId);
    if (this.ultimoSeleccionado === departamentoId) return;
    this.ultimoSeleccionado = departamentoId;
    const d = this.departamentos().find((x) => x.departamentoId === departamentoId);
    if (!d) return;
    this.data.registrarEvento(this.auth.usuario(), {
      accion: 'Departamento seleccionado en el mapa de bitácoras',
      zona: d.zona, departamento: d.departamento, direccion: d.departamentoId,
      unidad: d.porDireccion ? `${d.ambitos.length} Direcciones/Registros` : ETIQUETA_TODO_EL_DEPARTAMENTO,
      estadoNuevo: d.estadoVisual,
      observacion: `${this.etiquetaPeriodo()} · responsable(s): `
        + `${d.responsables.join(' · ') || 'sin soporte asignado'} · `
        + `estado visual ${d.estadoVisual}, ${d.totales.realizadas} de ${d.totales.esperados} realizada(s).`
    });
  }

  /** Salta a una fecha concreta desde los atajos, dejando el mes y el año coherentes. */
  protected irA(iso: string): void {
    if (!iso) return;
    this.fecha.set(iso);
    this.anio.set(Number(iso.slice(0, 4)));
    this.mes.set(Number(iso.slice(5, 7)));
    this.registraFiltro();
  }

  protected limpiar(): void {
    this.zona.set('');
    this.departamento.set('');
    this.estado.set('');
    if (!this.limitadoAlTecnico()) this.tecnico.set('');
    this.registraFiltro();
  }

  /** Un evento por combinación de filtros efectivamente distinta, no uno por pulsación. */
  protected registraFiltro(): void {
    const f = this.filtro();
    const firma = JSON.stringify(f);
    if (firma === this.ultimaFirma) return;
    this.ultimaFirma = firma;
    this.data.registrarEvento(this.auth.usuario(), {
      accion: 'Filtro aplicado en el mapa de bitácoras',
      zona: f.zona ? this.data.territorio.nombreZona(f.zona) : undefined,
      departamento: f.departamento ? this.data.territorio.nombreDepartamento(f.departamento) : undefined,
      observacion: `Período ${this.etiquetaPeriodo()}`
        + `${f.tecnico ? ` · técnico ${f.tecnico}` : ''}`
        + `${f.estado ? ` · estado ${f.estado}` : ''}.`
    });
  }

  protected registraApertura(a: EstadoAmbitoBitacora): void {
    this.data.registrarEvento(this.auth.usuario(), {
      accion: 'Bitácora consultada desde el mapa',
      zona: a.zona, departamento: a.departamento, direccion: a.departamentoId, unidad: a.ambito,
      estadoNuevo: a.estado,
      observacion: `Bitácora ${a.bitacoraId} · estado visual ${a.estadoVisual}.`
    });
  }

  // --------------------------------------------------------------- apoyo a la plantilla

  protected iconoDe(v: EstadoVisualBitacora): string {
    switch (v) {
      case 'Realizada': return 'check';
      case 'En proceso': case 'Parcial': return 'clock';
      case 'Pendiente': case 'Vencida': return 'alert';
      default: return 'circle';
    }
  }

  protected registrosDe(departamentoId: string): string[] {
    return this.data.territorio.registrosDe(departamentoId).map((r) => r.corta);
  }

  protected formatea(iso: string): string { return formateaFecha(iso); }

  /** Texto del tooltip nativo: departamento, estado, responsables y recuento. */
  private tooltip(d: EstadoDepartamentoBitacora): string {
    const partes = [`${d.departamento} (${d.zona})`, d.estadoVisual];
    partes.push(d.responsables.length ? d.responsables.join(' · ') : 'Sin soporte asignado');
    if (d.totales.esperados > 1) partes.push(`${d.totales.realizadas}/${d.totales.esperados} realizadas`);
    if (!d.enAlcance) partes.push('fuera del filtro');
    return partes.join(' — ');
  }
}
