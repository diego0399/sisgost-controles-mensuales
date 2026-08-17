# Manual técnico — SISGOST · Controles Mensuales

## 1. Pila tecnológica

- **Angular 21**, componentes *standalone*, señales (`signal`, `computed`, `input`, `effect`)
  y control de flujo `@if`/`@for`/`@switch`. Proyecto **zoneless** (sin `zone.js`): la
  detección de cambios la disparan las señales y los eventos de plantilla.
- Sin backend, sin base de datos, sin Firebase, sin API real. Los datos semilla viven en
  `public/assets/data/*.json`; los cambios de la sesión persisten en `localStorage`.
- Estilos globales en `src/styles.css` (sistema visual heredado de SISGOST — Gestión de
  Equipos: tarjetas, tablas, badges, stepper, visor de documentos y reglas `@media print`).

```bash
npm install
ng serve        # puerto 4300 (Gestión de Equipos usa el 4200)
npm run build   # presupuesto: initial 500 kB / estilos por componente 4 kB
```

## 2. Estructura

```text
src/app/
├── core/
│   ├── config/permisos.ts            # menú y permisos por rol (shell + guard comparten tabla)
│   ├── config/modulos.ts             # enlaces entre los módulos del ecosistema
│   ├── guards/{auth,role}.guard.ts
│   ├── layout/shell.component.ts     # layout con menú lateral (estilos en styles.css)
│   ├── models/models.ts              # todo el modelo de datos del módulo
│   └── services/
│       ├── holiday.service.ts        # catálogo editable de feriados (persistencia propia)
│       ├── business-day.service.ts   # días hábiles: L–V menos feriados
│       ├── control-deadline.service.ts # 3.er día hábil del mes siguiente; límites semanales
│       ├── equipment-integration.service.ts # eventos simulados de Gestión de Equipos
│       ├── support-distribution.service.ts   # COMPARTIDO: distribución de soportes (existe igual en el otro módulo)
│       ├── operatividad.service.ts     # KPIs y semáforo por Dirección/Unidad
│       ├── data.service.ts           # almacén único + todas las reglas de negocio
│       ├── auth.service.ts           # sesión simulada (sessionStorage)
│       └── toast.service.ts
├── shared/
│   ├── icon.ts                       # iconos SVG de línea (sin emojis)
│   ├── ui.ts                         # badge, tooltip de ayuda y modal
│   ├── visor-documento.ts            # hoja institucional tipo PDF (presentacional puro)
│   └── documento.ts                  # arma SeccionDoc[] desde cualquier registro
└── features/                         # una carpeta por pantalla (lazy loading)
```

## 3. Servicios de calendario

La cadena de dependencias evita ciclos:
`HolidayService` ← `BusinessDayService` ← `ControlDeadlineService` ← `DataService`.

- **HolidayService**: señal `feriados` con ámbito `Nacional | San Salvador`, editable desde
  la pantalla Feriados; persiste en `sisgost.controles.feriados.v1`. Se carga **antes** que el
  resto de datos porque la reconciliación de vencidos depende de él.
- **BusinessDayService**: `esHabil(iso)` (lunes a viernes y no feriado), `nHabilDelMes(a, m, n)`
  y `habilesHasta(limite)` (días hábiles con signo, para «restan N días»).
- **ControlDeadlineService**: `fechaLimiteMensual(a, m)` = 3.er hábil del mes siguiente;
  `fechaLimiteSemanal` = viernes de la semana; `evaluaEntrega` decide «Entregado» vs
  «Entregado tarde»; `estaVencido` para la reconciliación. **Ninguna fecha está quemada**:
  agregar un feriado recalcula todos los plazos.

## 4. DataService: reglas de negocio

Almacén único con una señal por colección (controles, bitácoras, justificaciones, inventario,
eventos de integración, documentos, trazabilidad, distribución). `cargar()` intenta el
*snapshot* de `localStorage` (`sisgost.controles.v1`) y cae a la semilla JSON; después ejecuta:

- `reconciliarVencidos()` — controles abiertos con límite pasado → `Vencido`; bitácoras de
  días anteriores sin envío → `Vencida`. Así la semilla es coherente en cualquier fecha.
- `asegurarBitacorasDeHoy()` — si hoy es hábil, crea la bitácora `Pendiente` de cada
  Dirección con distribución activa.

Validaciones (regla 30 del requerimiento):

| Regla | Método |
|---|---|
| Un control faltante nunca se oculta | el detalle de la Dirección lista todos los aplicables del mes con su acción |
| Campos numéricos del formulario | `respuestas()` normaliza a texto: `ngModel` sobre `type="number"` devuelve `number` |
| No entregar control obligatorio vacío | `validarEntrega`: obligatorios, checklist completo, mínimos de tabla, evidencia |
| Mes sin actividad → carta, no vacío | `justificarControl` exige motivo y texto; el mínimo de tabla lo sugiere |
| No cerrar bitácora sin revisar atención al público | `validarBitacora`: 9 elementos marcados; fallas con descripción, acción y estado final |
| Bitácora después de las 17:00 | `enviarBitacora` marca `Enviada tarde` |
| Control vencido sin estado claro | reconciliación a `Vencido` + alerta del panel |
| Dirección/Unidad sin soporte responsable | `paresSinSoporte` (computed) + alerta |
| Equipo activo sin Dirección/Unidad | la semilla lo garantiza; la batería de casos lo verifica |
| No programar un control donde no aplica | `paresAplicables(codigo)` desde la configuración del catálogo |
| No guardar una aplicación vacía | `validarAplicacion`; y `actualizarCatalogo` no activa un control sin ella |
| No registrar en un control un equipo de otra Dirección/Unidad | `validarEntrega` compara contra `equiposDeControl(c)` |
| El técnico no completa controles de una Dirección/Unidad ajena | `atiende(u, dir, unidad)` bloquea `entregarControl`, `justificarControl` y `enviarBitacora` |

Todo cambio de estado pasa por `registrarEvento` (trazabilidad) y `persistir()`.

## 4.1 Aplicación de los controles («Aplica a»)

`ControlCatalogo.aplicacion` (`AplicacionControl`) decide **dónde se trabaja cada control**, con
cuatro modos: `Todas las direcciones`, `Direcciones específicas`, `Unidades específicas` y
`Área técnica específica` (las áreas viven en `areas-tecnicas.json` y resuelven a pares
Dirección/Unidad reales: CSOD, respaldos, infraestructura, seguridad informática).

`DataService.paresAplicables(codigo)` traduce esa configuración a los pares donde el control se
programa; si el control trabaja con equipos (`requiereEquipos`), además exige inventario operativo
activo en el par. De ahí salen:

- el **calendario y la semilla**: un control solo se programa donde aplica —el generador de la
  semilla usa el mismo algoritmo, así que los 336 controles del set cumplen la configuración—;
- el **listado de controles**: filtra por control activo y por aplicación;
- el **historial anual**: los controles que no aplican se muestran como **No aplica**, informativo,
  nunca como pendientes ni vencidos (`controlesNoAplicablesDe`);
- el **panel ejecutivo**: cuenta «controles aplicables del mes» y los «no aplicables», y alerta
  cuando una Dirección/Unidad tiene controles aplicables pero no tiene soporte responsable
  (`paresAplicablesSinSoporte`).

La edición vive en Administración → Catálogo de controles → **Editar aplicación**
(`actualizarAplicacion`), con vista previa de en qué Direcciones/Unidades quedaría, validación de
aplicación vacía y traza del cambio. El catálogo se persiste en el *snapshot* porque su
configuración es editable.

## 4.2 Operatividad por Dirección/Unidad

`OperatividadService` calcula los indicadores que alimentan la vista ejecutiva de Controles
mensuales, el detalle de cada Dirección, el panel, el historial anual y los reportes. `kpi(dir,
unidad, año, mes)` devuelve un `KpiDireccion` con controles (aplicables, entregados, tardíos,
pendientes, vencidos, justificados, próximos a vencer), bitácoras, inventario (activos, con
incidencia, descargados del mes), documentos, cumplimiento, operatividad y estado.

```text
controles     = (entregados + entregados tarde + justificados) / aplicables
bitácoras     = (enviadas + enviadas tarde) / bitácoras del período
operatividad  = controles                          (sin bitácora)
              = controles · 0.7 + bitácoras · 0.3   (con bitácora)
cumplimiento  = (entregados a tiempo + justificados) / aplicables
```

Semáforo: 90–100 % Operativa · 75–89 % En observación · < 75 % Crítica, más
`Sin soporte asignado`, `Sin controles aplicables` y `En curso`. Este último evita semaforizar
un período cuyo plazo aún corre: `ControlDeadlineService.periodoCerrado()` decide, y
`ultimoPeriodoCerrado()` es el período con el que abren las vistas ejecutivas.

Otros métodos: `kpis(filtro)` (todas las Direcciones/Unidades visibles, con filtros de Dirección,
Unidad, técnico y nivel), `anual(dir, unidad, año)` para el historial, `resumen(filtro)` para el
panel, `cargaSoportes(filtro)` y `equiposConIncidencia(...)`. El componente presentacional
`ui-kpi-direcciones` (shared) dibuja los mismos KPIs en tarjetas o en tabla comparativa.

Los **reportes por Dirección** (`DataService.generarReporteDireccion`) son seis: mensual, anual,
de operatividad, de controles pendientes, de inventario operativo y de bitácoras diarias.
`DocumentoComponent.seccionesReporteDireccion` arma su hoja con datos generales, resumen de
indicadores, el detalle propio de cada tipo y la conclusión del estado operativo.

## 4.2.1 Período activo

`ControlDeadlineService.periodoActivo(hoy?)` devuelve el año y el mes de la fecha del sistema. Es
el período que cargan al abrirse los controles mensuales, la vista por Dirección, el detalle de
Dirección, el calendario, el historial anual y el panel ejecutivo; ninguna pantalla vuelve a
calcular la regla por su cuenta ni deja el año quemado. `ultimoPeriodoCerrado()` se conserva para
comparar meses cuyo plazo ya venció, pero **no** decide qué se muestra al entrar.

La fecha límite es independiente del período mostrado: `fechaLimiteMensual` sigue devolviendo el
tercer día hábil del mes siguiente, así que agosto de 2026 se muestra como período activo aunque su
plazo venza el 03/09/2026.

## 4.3 Controles semanales con entrega mensual consolidada (F0387 y F0389)

La frecuencia `Semanal con entrega mensual consolidada` marca los controles que se trabajan por
semana pero producen **un solo documento del mes**. Su plantilla lleva secciones con `semana: n`
(1–5) más el cierre del mes. El **F0387** pide por semana estado, fecha, resultado, responsable,
observaciones, **3 equipos por IP** y **3 teléfonos/extensiones**; el **F0389**, estado, fecha,
responsable, observaciones y el checklist de condiciones del CSOD.

| Método (`DataService`) | Qué hace |
|---|---|
| `esSemanalConsolidado(codigo)` | Distingue este tipo de control |
| `estadoSemanas(control)` | Estado interno de cada semana (pendiente / completada / observada / no aplica) |
| `estadoTrasAvance(...)` | Pendiente → En proceso → **Listo para entregar** cuando todas las semanas están declaradas |
| `validarEntrega` | Una semana «no aplica» solo exige su estado; el resto de sus campos no |
| `entregarControl` | Genera **un** documento del mes y registra «F0387 consolidado mensual generado» |

Cada semana que se cierra deja su propia traza («F0387 semana completada»). El formulario muestra
una banda con el avance semanal, y los reportes **F0387 / F0389 consolidado mensual por Dirección**
imprimen las cinco semanas en una sola hoja.

### Verificación por IP (F0387)

`SeccionPlantilla` gana dos bloques declarativos: `equiposIp` (cuántos equipos por IP) y
`telefonos` (cuántas extensiones y qué resultados admite). Sus respuestas viajan en
`RespuestaSeccion.equiposIp` y `RespuestaSeccion.telefonos`.

| Método (`DataService`) | Qué hace |
|---|---|
| `equipoPorIp(ip)` | Equipo **activo** del inventario operativo con esa IP |
| `buscarEquipoIp(ip, dir, unidad)` | Devuelve el equipo o el motivo del rechazo (no existe / es de otra Dirección/Unidad) |
| `ipsDeControl(control)` | IP admitidas: las de los equipos activos de la Dirección/Unidad del control |
| `faltasEquiposIp` / `faltasTelefonos` | Reglas de entrega: cantidad, IP repetida, pertenencia y hora obligatoria |

La IP llega del ecosistema: `EquipoOperativo` guarda `ip` y `mac`, y Gestión de Equipos las
incluye en la ficha del inventario operativo (`fichaControles`) tomándolas de la reserva del F0302
al aceptar la conformidad. Un equipo sin reserva de IP no puede verificarse en el F0387.

## 5. Formularios digitales dirigidos por datos

Cada control del catálogo define su **plantilla** (`SeccionPlantilla[]`): campos tipados
(`texto | fecha | hora | numero | area | opcion`), ítems de checklist con estados propios y
medición opcional (temperatura del aire acondicionado, carga del UPS…), y tablas dinámicas
con mínimo de filas. `CompletarControlComponent` construye el *stepper* desde la plantilla:
**un solo componente completa los 14 controles**. Las respuestas se guardan como
`RespuestaSeccion[]` espejo de la plantilla.

El mismo principio gobierna los documentos: `DocumentoComponent` traduce cualquier registro
(control, bitácora, carta, reporte consolidado) a `SeccionDoc[]` y `ui-visor-documento`
—presentacional puro— dibuja la hoja. Por eso todos los documentos se ven idénticos.

## 6. Visor e impresión

La hoja (`.hoja`) vive dentro del visor (`.visor`, fijo a pantalla completa). En
`@media print`, `body:has(.visor) *` oculta todo y `body:has(.visor) .visor, … .visor *`
lo vuelve visible **con el mismo prefijo de especificidad** (sin él, `body:has(.visor) *`
con especificidad (0,1,1) ganaría a `.visor *` (0,1,0) y no se imprimiría nada). La barra
de acciones se excluye con `display: none`.

## 7. Integración con Gestión de Equipos

### 7.1 Datos base compartidos

Los dos módulos son proyectos Angular distintos que trabajan sobre los **mismos datos base**:
`usuarios-sistema.json` (misma identidad, mismo `usuario`, mismo rol), el catálogo de
Direcciones/Unidades, los equipos y `distribucion-soportes.json`. `UsuarioSistema.moduloControles`
distingue quién opera aquí (Soporte, Jefatura, Administración) de quién opera solo allá (Hardware).

### 7.2 `SupportDistributionService` — servicio compartido

El **mismo archivo** existe en `src/app/core/services/support-distribution.service.ts` de los dos
proyectos y es dueño de la señal `registros`. Ofrece `deDireccionUnidad`, `tecnicosDe`,
`deTecnico`, `atiende`, `responsableDe`, `pares` y las escrituras planas (`agregar`, `modificar`,
`desactivar`). Las reglas de cada módulo quedan en su propio `DataService`:

| Módulo | Uso |
|---|---|
| Controles Mensuales | **Administra** la distribución; asigna controles y bitácoras, filtra el inventario operativo y decide qué ve cada técnico |
| Gestión de Equipos | **Consume**: `atiendeDireccionUnidad` y `soporteResponsableDe` delegan aquí, y `bloqueoExpedienteUnico` impide elegir un Técnico de Configuración que no atienda la Dirección/Unidad del requerimiento |

La pantalla de distribución de Gestión de Equipos quedó en **modo consulta**
(`puedeGestionar = computed(() => false)`) con un aviso y enlace a este módulo: dos pantallas que
editaran el mismo registro serían dos verdades.

### 7.3 Movimientos de equipos: sincronización automática

No hay acción manual. `DataService.sincronizarInventario()` corre **al cargar el módulo**, antes
de reconciliar vencidos, y aplica todos los eventos de `eventos-integracion.json` que aún no lo
estaban. `EquipmentIntegrationService` solo expone la lectura (`sincronizados`, `ultimos(n)`,
contadores) y `syncOperationalInventory()` para forzar una pasada:

| Evento | Efecto |
|---|---|
| `onEquipmentAccepted` | El equipo entra al inventario operativo de su Dirección/Unidad, con el soporte responsable resuelto por la distribución (no a mano). |
| `onEquipmentDischarged` | El equipo pasa a `Descargado` y sale del inventario activo. |

Garantías de la sincronización:

- **Idempotente.** Un evento con `aplicado: true` se salta; una aceptación cuyo `ciclo` ya existe
  no duplica el equipo; un descargo sin ficha activa no repite el movimiento.
- **Historial.** Si el equipo vuelve a entregarse teniendo un ciclo abierto, ese ciclo pasa a
  `Histórico` y se crea un registro operativo nuevo: `EquipoOperativo.ciclo` es la clave, no el
  número de inventario.
- **Trazabilidad completa.** Cada movimiento deja un evento con fecha, hora, módulo origen y
  destino, equipo, número de inventario, Dirección/Unidad, usuario final, expediente único,
  estado anterior, estado nuevo y observación.

No se duplica lógica de Gestión de Equipos: solo se consumen sus efectos.

### 7.4 Equipos dentro de los formularios

`SeccionPlantilla.equipos` (`EquiposPlantilla`) declara que una sección trabaja sobre el
inventario operativo. `CompletarControlComponent` la dibuja con la lista de
`data.equiposDeControl(c)` —los equipos **activos de la Dirección/Unidad del control**— y guarda
`RespuestaEquipo[]`. `validarEntrega` rechaza cualquier inventario que no esté en esa lista.
Lo usan F0422 (todos los equipos), F0174, F0288 y VULN (al menos uno).

### 7.5 Enlace entre módulos

`core/config/modulos.ts` guarda la URL del módulo hermano (4200 ↔ 4300). El enlace aparece en el
selector de módulo de la barra lateral, en la barra superior y en la tarjeta del panel ejecutivo.
Si el otro módulo no está levantado, el enlace simplemente no abre: son dos despliegues distintos.

## 8. Roles y permisos

`core/config/permisos.ts` es la única tabla de navegación y permisos; la comparten el shell
(dibuja el menú) y `roleGuard` (bloquea rutas). Alcances:

- **Técnico de Soporte**: `controlesVisibles`/`bitacorasVisibles` filtran por sus direcciones
  de la distribución activa; solo él completa y entrega.
- **Encargado de Soporte**: ve todo, asigna distribución, revisa entregas (cerrar/observar) y
  genera reportes.
- **Jefatura**: solo consulta (nunca ve botones de operación).
- **Administrador**: catálogos, feriados y usuarios.

## 9. Semilla de datos

Generada por script (no a mano) para que cada `fechaLimite` salga del mismo algoritmo de
días hábiles que usa la aplicación, y sobre la organización compartida con Gestión de Equipos:
**336 controles** de enero a agosto de 2026 (mensuales, los consolidados F0387 y F0389, eventuales y
programados) con estados realistas —entregados, tardíos, vencidos, justificados, observado y
abiertos—, **48 bitácoras** de los últimos 12 días hábiles, 3 cartas de justificación con el
texto real de `Formatos_nuevos_2025_.docx`, ~339 documentos y ~455 eventos de trazabilidad.

El **inventario operativo (25 equipos)** se deriva de Gestión de Equipos: los equipos que aquel
módulo ya tiene aceptados se copian con su mismo número de inventario, expediente y técnico de
configuración; el resto es la flota histórica de las mismas Direcciones/Unidades, con el soporte
responsable resuelto por la distribución compartida. Cada equipo activo lleva su **IP** y su
**MAC**, con un segmento de red por Dirección/Unidad: es lo que el F0387 verifica cada semana.

La unidad **Dirección de Registros / Archivo Registral** queda sin soporte asignado a propósito
(su asignación se desactivó el 31/07/2026): así el panel muestra la alerta de Dirección/Unidad sin
responsable y de equipos activos sin soporte.

## 10. Restablecimiento de la demostración

`DataService.restablecerDemostracion()` borra `sisgost.controles.v1` y recarga: vuelven a la
semilla los controles, bitácoras, justificaciones, documentos, trazabilidad, inventario operativo
y la distribución de soportes. La acción vive en Administración, exige confirmación
(«Esta acción restablecerá los datos de demostración del módulo Controles Mensuales. ¿Desea
continuar?»), enumera lo que repone y no toca la estructura ni la navegación del sistema.
