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
│       ├── operatividad.service.ts     # KPIs y semáforo por Dirección/Registro
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
| Dirección/Registro sin soporte responsable | `paresSinSoporte` (computed) + alerta |
| Equipo activo sin Dirección/Registro | la semilla lo garantiza; la batería de casos lo verifica |
| No programar un control donde no aplica | `paresAplicables(codigo)` desde la configuración del catálogo |
| No guardar una aplicación vacía | `validarAplicacion`; y `actualizarCatalogo` no activa un control sin ella |
| No registrar en un control un equipo de otra Dirección/Registro | `validarEntrega` compara contra `equiposDeControl(c)` |
| El técnico no completa controles de una Dirección/Registro ajena | `atiende(u, dir, unidad)` bloquea `entregarControl`, `justificarControl` y `enviarBitacora` |

Todo cambio de estado pasa por `registrarEvento` (trazabilidad) y `persistir()`.

## 4.1 Aplicación de los controles («Aplica a»)

`ControlCatalogo.aplicacion` (`AplicacionControl`) decide **dónde se trabaja cada control**, con
cuatro modos: `Todas las direcciones`, `Direcciones específicas`, `Unidades específicas` y
`Área técnica específica` (las áreas viven en `areas-tecnicas.json` y resuelven a pares
Dirección/Registro reales: CSOD, respaldos, infraestructura, seguridad informática).

`DataService.paresAplicables(codigo)` traduce esa configuración a los pares donde el control se
programa; si el control trabaja con equipos (`requiereEquipos`), además exige inventario operativo
activo en el par. De ahí salen:

- el **calendario y la semilla**: un control solo se programa donde aplica —el generador de la
  semilla usa el mismo algoritmo, así que los 336 controles del set cumplen la configuración—;
- el **listado de controles**: filtra por control activo y por aplicación;
- el **historial anual**: los controles que no aplican se muestran como **No aplica**, informativo,
  nunca como pendientes ni vencidos (`controlesNoAplicablesDe`);
- el **panel ejecutivo**: cuenta «controles aplicables del mes» y los «no aplicables», y alerta
  cuando una Dirección/Registro tiene controles aplicables pero no tiene soporte responsable
  (`paresAplicablesSinSoporte`).

La edición vive en Administración → Catálogo de controles → **Editar aplicación**
(`actualizarAplicacion`), con vista previa de en qué Direcciones/Registros quedaría, validación de
aplicación vacía y traza del cambio. El catálogo se persiste en el *snapshot* porque su
configuración es editable.

## 4.2 Operatividad por Dirección/Registro

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

Otros métodos: `kpis(filtro)` (todas las Direcciones/Registros visibles, con filtros de Dirección,
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
| `buscarEquipoIp(ip, dir, unidad)` | Devuelve el equipo o el motivo del rechazo (no existe / es de otra Dirección/Registro) |
| `ipsDeControl(control)` | IP admitidas: las de los equipos activos de la Dirección/Registro del control |
| `faltasEquiposIp` / `faltasTelefonos` | Reglas de entrega: cantidad, IP repetida, pertenencia y hora obligatoria |

La IP llega del ecosistema: `EquipoOperativo` guarda `ip` y `mac`, y Gestión de Equipos las
incluye en la ficha del inventario operativo (`fichaControles`) tomándolas de la reserva del F0302
al aceptar la conformidad. Un equipo sin reserva de IP no puede verificarse en el F0387.

## 4.4 Verificación por muestra de equipos (F0382)

El bloque `checklistEquipos` de `SeccionPlantilla` declara cuántos equipos exige el formato, sus
ítems (`ItemSeguridad`, con el grupo del documento original), las respuestas admitidas, los estados
finales del incumplimiento y las clasificaciones de equipo. Las respuestas viajan en
`RespuestaSeccion.checklistEquipos` (`RespuestaEquipoChecklist` → `RespuestaItemSeguridad`), y del
equipo **solo se guarda el número de inventario**: los demás datos se leen del inventario operativo
al dibujar y al imprimir, de modo que nunca quedan copias desactualizadas.

| Método (`DataService`) | Qué hace |
|---|---|
| `checklistDe(codigo)` | Sección de muestra del control, si la tiene |
| `equiposParaMuestra(control, texto)` | Equipos activos de la Dirección/Registro filtrados por el buscador |
| `bloqueoEquipoMuestra(...)` | Motivo por el que un equipo no puede entrar: repetido o de otra Dirección/Registro |
| `itemsDeClasificacion(seccion, clasificacion)` | Ítems que aplican a ese equipo según el grupo del formato |
| `itemsVerificados` / `itemsIncumplidos` | Avance y hallazgos del equipo |
| `estadoFinalEquipo(...)` | Completado / Pendiente derivado de los ítems, no tecleado |
| `faltasChecklistEquipos(...)` | Cantidad exacta, sin repetidos, pertenencia, ítems respondidos, AC y justificaciones |

El formulario divide la sección en **dos pasos** (`PasoForm`): «Selección de equipos desde
inventario» y «Verificación de ítems por equipo». Cambiar el equipo de un hueco descarta su
verificación anterior, porque los ítems son de ese equipo y no del hueco.

`trazarMuestra` compara la muestra antes y después de cada guardado y emite «Equipo seleccionado
desde inventario», «Equipo removido del control», «Ítems de seguridad verificados»,
«Incumplimiento registrado» y «Acción correctiva registrada», cada uno con el número de inventario,
el equipo y su usuario final.

Nota de datos: el formato exige cinco equipos, así que el inventario operativo mantiene al menos
esa cantidad activa en cada Dirección/Registro donde el control aplica.

## 4.4.1 Bitácora de ingresos (F0234)

El bloque `ingresos` de `SeccionPlantilla` declara los motivos y los tipos de personal del
formato; las respuestas viajan en `RespuestaSeccion.ingresos` (`RespuestaIngreso`, con
`horaEntrada`/`horaSalida`, carné propio y del acompañante, `anexaDocumento` y `motivo`).

| Método (`DataService`) | Qué hace |
|---|---|
| `ingresosDe(codigo)` | Sección de bitácora del control, si la tiene |
| `faltasIngreso(registro)` | Reglas del registro, con el mensaje exacto de cada una |
| `ingresoVacio(registro)` | Un registro en blanco no cuenta como incompleto |
| `mesSinIngresos(control)` | Si se declaró que el mes no tuvo visitas |
| `faltasIngresos(...)` | O hay registros completos, o el mes se declara sin ingresos con observación |

`RespuestaIngreso.tipoIngreso` gobierna el registro: con `Individual` el formulario no dibuja
los campos del acompañante y `faltasIngreso` no los pide; con `Con acompañante` (`conAcompanante`)
se exigen nombre, tipo de personal y cargo o institución. `cambiarTipoIngreso` limpia esos campos
al volver a individual, de modo que **nada oculto queda obligatorio ni viaja escondido** en el
registro. Las dos formas salen del catálogo (`IngresosPlantilla.tiposIngreso`), no del código.

El **documento de respaldo** es independiente del tipo de ingreso: se exige solo si el registro
marcó que lo anexa (`anexaRespaldo`). El archivo se valida por extensión contra `FORMATOS_RESPALDO`
(`png`, `jpg`, `jpeg`, `webp`) y la imagen viaja como *data URL* dentro del propio registro,
reducida a 900 px por lado en el componente antes de guardarse.

Los controles guardados en el navegador antes de esta versión no traen los campos nuevos:
`normalizaIngreso` los completa al leerlos, de modo que ni las validaciones ni el documento
tropiezan con un `undefined`. La carga de la imagen es asíncrona y el borrador es un objeto
plano —no una señal—, así que el componente avisa al detector de cambios al terminar: la
aplicación no usa zonas y sin ese aviso la vista previa aparecería una interacción tarde.

El formulario trabaja sobre un **borrador**: el registro solo entra a la lista cuando se guarda, y
el modal muestra en vivo lo que falta. `trazarIngresos` compara la bitácora antes y después de
cada guardado y emite «Registro de ingreso **individual** agregado» o «…**con acompañante**
agregado», «…editado», «…eliminado» y «Mes sin ingresos marcado», identificando cada registro por
fecha + hora de entrada + nombre.

Todos los eventos de la bitácora guardan su `tipoIngreso`. Los que hablan del control entero
—intento de entrega rechazado, control finalizado, documento generado— no tienen uno solo, así que
guardan el **reparto** que calcula `repartoIngresos`: «Individual: 2 · Con acompañante: 1». Es la
única respuesta honesta cuando el mes tiene de los dos.

## 4.4.2 Resumen de validación de la muestra (F0382)

`resumenMuestra(control)` devuelve un `ResumenMuestra` con las cuentas que el paso de resumen
pone en pantalla: equipos seleccionados y verificados por completo, ítems por resultado, acciones
correctivas y justificaciones registradas y si hay observaciones generales. Dos matices
deliberados: `faltas` son las de la **muestra** (`faltasChecklistEquipos`), mientras que
`listo` mira el **control entero** (`validarEntrega`), porque un F0382 con la muestra impecable
tampoco se entrega sin evidencia ni observaciones. El formulario no vuelve a contar por su cuenta:
lo que muestra es exactamente lo que la entrega va a validar.

## 4.4.3 Trazabilidad de los intentos de entrega

`entregarControl` ya no descarta en silencio la entrega rechazada: `trazarEntregaRechazada`
registra «Intento de entrega con campos pendientes» conservando el estado del control, y añade el
detalle propio de cada control —«Ítem incompleto detectado» para la muestra, «Registro de ingreso
incompleto detectado» para la bitácora—. Del otro lado, `trazarCierreCorrecto` deja
«`código` finalizado correctamente» con el recuento de lo entregado. Sin esos eventos la
trazabilidad guardaría solo el final feliz.

## 4.5 Inventario operativo compartido entre módulos

`SharedInventoryService` (archivo idéntico en los dos proyectos) es el contrato: la clave
`sisgost_operational_inventory` y la ficha `EquipoOperativoCompartido` con el ciclo
`OP-<inventario>-<expediente único>`.

| Lado | Qué hace |
|---|---|
| Gestión de Equipos | `syncAcceptedEquipmentToOperationalInventory` al aceptar la conformidad; `registrarDescargo` al descargar |
| Controles Mensuales | `aplicarInventarioCompartido()` dentro de `sincronizarInventario()`, al cargar y ante el evento `storage` |
| Puente | `SharedInventoryBridgeService` + `puente-inventario.html`, porque `localStorage` no cruza puertos |

`deCompartido()` traduce la ficha al modelo del módulo: la Dirección viaja por **nombre** y se
resuelve a su id con `idDireccion`, y el soporte responsable lo decide `responsableDe` con la
distribución vigente (la copia recibida es solo respaldo). `cicloEquivalente()` evita que el mismo
equipo se duplique cuando llega por los dos caminos posibles —el inventario compartido y la cola
simulada de eventos de la semilla—: la equivalencia es número de inventario + expediente único, no
el identificador de ciclo. `diferenciasEquipo()` decide si hay algo real que actualizar, de modo
que recargar la pantalla no genera movimientos ni trazas de más.

## 4.6 Sincronización automática

`DataService.autoSyncControls(anio, mes, usuario?)` es la única función que decide qué controles
deben existir en un mes y de quién son. Devuelve un `ResumenAutoSync` con lo que movió.

| Paso | Regla |
|---|---|
| Qué debe existir | Controles activos de frecuencia mensual o consolidada, en los pares que devuelve `paresAplicables` |
| Pasó a aplicar | Se crea Pendiente con el responsable de la distribución; si existía como «No aplica», se reabre |
| Dejó de aplicar | Se marca «No aplica» si sigue abierto; entregado, cerrado o justificado no se toca |
| Responsables | Se recalculan solo en los controles abiertos |
| Período vencido | No se crean controles nuevos, solo se marcan los que dejaron de corresponder |

Las claves son estables: `claveControl(codigo, anio, mes, direccionId, unidad)` e
`idTecnico(nombre)`. Nada se compara por el texto que se ve en pantalla.

Disparadores: `actualizarAplicacion` y `sincronizarTrasDistribucion` la llaman al guardar, y
`AutoSyncService.periodo(anio, mes)` la llama desde un `effect` en las pantallas de período —así
se dispara también al cambiar de mes, de año o de usuario en «Ver como»—. `AutoSyncService`
recuerda la última combinación sincronizada para no repetir trabajo; `invalidar()` fuerza la
siguiente pasada tras guardar en administración.

El inventario tiene su equivalente, `autoSyncOperationalInventory()`, que corre al cargar el
módulo y al abrir el inventario operativo. **No hay botones**: ni de sincronizar, ni de regenerar,
ni de incorporar equipos, ni de aplicar descargos.

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
Direcciones/Registros, los equipos y `distribucion-soportes.json`. `UsuarioSistema.moduloControles`
distingue quién opera aquí (Soporte, Jefatura, Administración) de quién opera solo allá (Hardware).

### 7.2 `SupportDistributionService` — servicio compartido

El **mismo archivo** existe en `src/app/core/services/support-distribution.service.ts` de los dos
proyectos y es dueño de la señal `registros`. Ofrece `deDireccionUnidad`, `tecnicosDe`,
`deTecnico`, `todasDeTecnico`, `historialDe`, `atiende`, `duplicada`, `responsableDe`, `pares` y
las escrituras planas (`agregar`, `modificar`, `desactivar`, `activar`). Las reglas de cada módulo
quedan en su propio `DataService`:

**Todo se compara por IDs estables.** Cada asignación guarda `tecnicoId`, `direccionId` y
`unidadId`; los nombres quedan solo para mostrarlos. El servicio los deriva con `slug()`
—minúsculas, sin tildes, con guiones— y con el **catálogo organizacional** que los dos módulos
cargan al arrancar (`cargarOrganizacion`, desde `direcciones.json`, publicado ahora también en
Gestión de Equipos):

| ID | Forma | Ejemplo |
|---|---|---|
| `tecnicoId` | slug del nombre | `wendy-carranza` |
| `direccionId` | id del catálogo | `SS` |
| `unidadId` | `<direccionId>::<slug(unidad)>` | `SS::SS-RC` |

`idDireccion()` acepta el id, la forma corta o el nombre institucional, de modo que quien consulta
puede seguir pasando lo que tenga a mano; lo que se **guarda y se compara** es siempre el id.
`normalizar()` completa los IDs de los registros anteriores al cargarlos: la migración por texto
ocurre una sola vez.

| Módulo | Uso |
|---|---|
| Controles Mensuales | **Administra** la distribución; asigna controles y bitácoras, filtra el inventario operativo y decide qué ve cada técnico |
| Gestión de Equipos | **Consume**: `atiendeDireccionUnidad` y `soporteResponsableDe` delegan aquí, y `bloqueoExpedienteUnico` impide elegir un Técnico de Configuración que no atienda la Dirección/Registro del requerimiento |

Guardar un cambio en la distribución dispara `sincronizarTrasDistribucion(u, cambio)`, que llama a
`autoSyncControls` del período activo y deja la traza «Controles recalculados automáticamente por
cambio de distribución» con el resumen de lo movido. **No hay ningún botón** que lo dispare, aquí ni
en ninguna otra pantalla.

### 7.2.b `SharedDistributionService` — la distribución sale del módulo

`support-distribution.service.ts` resuelve las consultas, pero por sí solo no cruzaba de módulo:
cada aplicación guardaba su copia dentro de su propia foto de estado y un cambio hecho aquí no
llegaba nunca allá. El transporte vive en `shared-distribution.service.ts` —también idéntico en
los dos proyectos—:

| Clave / evento | Para qué |
|---|---|
| `sisgost_support_distribution` | La distribución completa, con IDs **y** nombres |
| `sisgost_support_distribution_updated_at` | ISO de la última escritura |
| `sisgost_support_distribution_version` | `2026-08-19-shared-distribution-fix`; una versión distinta se migra, nunca se borra en silencio |
| `sisgost-support-distribution-updated` | `CustomEvent` para avisar dentro del mismo origen |

`publicar()` vuelca `registros()` a esa clave; `adoptar()` hace el camino inverso y **solo
devuelve `true` si algo cambió**, porque se consulta muchas veces y casi nunca hay novedad. Al
arrancar, `alinearDistribucionCompartida()` aplica la regla del ecosistema: si ya hay algo
compartido manda lo compartido —es lo último que se editó y sobrevive a que se borre la foto
local—; si no hay nada, se publica la semilla. Restablecer la demostración repone también estas
claves, porque si no el arranque volvería a adoptar lo editado y el restablecimiento no habría
restablecido nada.

Los dos módulos corren en orígenes distintos (4300 y 4200) y `localStorage` está aislado por
origen, así que este módulo publica `public/puente-distribucion.html`: una página en su propio
origen que responde por `postMessage` a quien le pregunte desde un origen autorizado, y que empuja
un aviso cuando la clave cambia. Es el espejo de `puente-inventario.html`, que publica Gestión de
Equipos para el camino contrario. Los eventos de la distribución —consulta, alta, baja, duplicado
bloqueado, responsabilidad modificada, perfil actualizado, recálculo y aplicación en Gestión de
Equipos— guardan además `tecnicoAfectado` y `motivo`.

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
| `onEquipmentAccepted` | El equipo entra al inventario operativo de su Dirección/Registro, con el soporte responsable resuelto por la distribución (no a mano). |
| `onEquipmentDischarged` | El equipo pasa a `Descargado` y sale del inventario activo. |

Garantías de la sincronización:

- **Idempotente.** Un evento con `aplicado: true` se salta; una aceptación cuyo `ciclo` ya existe
  no duplica el equipo; un descargo sin ficha activa no repite el movimiento.
- **Historial.** Si el equipo vuelve a entregarse teniendo un ciclo abierto, ese ciclo pasa a
  `Histórico` y se crea un registro operativo nuevo: `EquipoOperativo.ciclo` es la clave, no el
  número de inventario.
- **Trazabilidad completa.** Cada movimiento deja un evento con fecha, hora, módulo origen y
  destino, equipo, número de inventario, Dirección/Registro, usuario final, expediente único,
  estado anterior, estado nuevo y observación.

No se duplica lógica de Gestión de Equipos: solo se consumen sus efectos.

### 7.4 Equipos dentro de los formularios

`SeccionPlantilla.equipos` (`EquiposPlantilla`) declara que una sección trabaja sobre el
inventario operativo. `CompletarControlComponent` la dibuja con la lista de
`data.equiposDeControl(c)` —los equipos **activos de la Dirección/Registro del control**— y guarda
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

El **inventario operativo (40 equipos)** se deriva de Gestión de Equipos: los equipos que aquel
módulo ya tiene aceptados se copian con su mismo número de inventario, expediente y técnico de
configuración; el resto es la flota histórica de las mismas Direcciones/Registros, con el soporte
responsable resuelto por la distribución compartida. Cada equipo activo lleva su **IP** y su
**MAC**, con un segmento de red por Dirección/Registro: es lo que el F0387 verifica cada semana.

La unidad **Dirección de Registros / Archivo Registral** queda sin soporte asignado a propósito
(su asignación se desactivó el 31/07/2026): así el panel muestra la alerta de Dirección/Registro sin
responsable y de equipos activos sin soporte.

## 10. Restablecimiento de la demostración

`DataService.restablecerDemostracion()` borra `sisgost.controles.v1` y recarga: vuelven a la
semilla los controles, bitácoras, justificaciones, documentos, trazabilidad, inventario operativo
y la distribución de soportes. La acción vive en Administración, exige confirmación
(«Esta acción restablecerá los datos de demostración del módulo Controles Mensuales. ¿Desea
continuar?»), enumera lo que repone y no toca la estructura ni la navegación del sistema.
