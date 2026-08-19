# Bitácora de sesión — SISGOST Controles Mensuales

**Sesión del 16 al 19 de agosto de 2026 · rondas 74 a 80.**

Registro de lo que se pidió y lo que quedó hecho en esta conversación, para poder retomar el
trabajo sin releer el historial. El punto de control completo del proyecto sigue siendo
`analisis/sistema-auditoria-equipos.md` y las rondas acumuladas viven en la memoria del asistente.

Restricciones vigentes en las cuatro rondas: sin emojis (solo iconos reales), sin backend, sin base
de datos, sin Firebase, sin API real; Angular 21 con componentes standalone, servicios mock y datos
simulados; `npm run build` al final de cada ronda.

---

## Ronda 74 — Integración con SISGOST — Gestión de Equipos

**Se pidió** que los dos módulos se sintieran un solo ecosistema: mismos usuarios, roles, técnicos,
Direcciones/Unidades, usuarios finales y equipos; enlace visible entre módulos; el equipo aceptado
en Gestión de Equipos alimenta el inventario operativo de Controles y el descargo lo retira; la
**distribución de soportes se administra desde Controles Mensuales** pero condiciona a Gestión de
Equipos (un técnico solo puede ser Técnico de Configuración donde es responsable); usuario de
demostración con restablecimiento de datos; formularios de control con selección de equipos;
documentos formales; trazabilidad compartida con módulo origen y destino.

**Quedó hecho**

- `SupportDistributionService` es el **mismo archivo en los dos proyectos** sobre el mismo
  `distribucion-soportes.json` (14 registros byte a byte idénticos).
- Datos base unificados: `usuarios-sistema.json`, `direcciones.json`, `areas-tecnicas.json`.
- Inventario operativo alimentado por eventos de integración, con trazabilidad de módulo origen y
  destino, equipo, usuario final y expediente único.
- Enlace «Ir a Gestión de Equipos» en el menú y en el panel; `core/config/modulos.ts` con los
  puertos (Gestión de Equipos 4200, Controles Mensuales 4300).
- Usuario `demo.admin` y «Restablecer datos de demostración» con confirmación.

---

## Ronda 75 — Inventario automático y «Aplica a» configurable

**Se pidió** eliminar los botones manuales «Incorporar al inventario» y «Aplicar descargo» —la
sincronización debe ocurrir sola, ser idempotente y conservar historial— y hacer **editable el
campo «Aplica a»** del catálogo de controles, con efecto en calendario, historial, panel y vistas
del técnico.

**Quedó hecho**

- `sincronizarInventario()`, `onEquipmentAccepted()` y `onEquipmentDischarged()`: la sincronización
  corre al cargar, no duplica equipos ni repite movimientos, y un nuevo ciclo operativo conserva el
  registro anterior como **Histórico**.
- Bloque «Últimos movimientos sincronizados desde Gestión de Equipos»; la tabla muestra por defecto
  solo los equipos activos, con opción de ver descargados e históricos.
- `AplicacionControl` con cuatro modos (todas las direcciones, direcciones específicas, unidades
  específicas, área técnica) editable desde Administración → Catálogo, con validación de aplicación
  vacía y vista previa; `paresAplicables()` gobierna la programación, las listas y el panel. Lo que
  no aplica se muestra como **No aplica** informativo, nunca como pendiente.

---

## Ronda 76 — Operatividad por Dirección y KPIs para el Encargado

**Se pidió** organizar los controles primero por Dirección/Unidad, con la vista por Dirección como
predeterminada para el Encargado de Soporte, pantalla de detalle, 15 KPIs, fórmula de operatividad
con semáforo, filtros globales, comparativo entre Direcciones y seis reportes PDF por Dirección.

**Quedó hecho**

- `OperatividadService` con `KpiDireccion`: operatividad = controles · 0,7 + bitácoras · 0,3;
  semáforo 90 / 75 más los estados **Sin soporte asignado**, **Sin controles aplicables** y
  **En curso**.
- Vista por Dirección predeterminada, detalle por Dirección/Unidad, comparativo y componente
  presentacional `ui-kpi-direcciones`.
- Seis reportes por Dirección (mensual, anual, operatividad, controles pendientes, inventario
  operativo y bitácoras diarias).

---

## Ronda 76 bis — Meses pendientes, F0387 unificado y rol Coordinador

**Se pidió** que al abrir una Dirección se vean los **meses pendientes por completar**; que al
entrar a un mes se listen solo sus controles aplicables con acción **Completar** / **Ver
documento** / **No aplica**, sin ocultar nunca un pendiente; que el **F0387** sea un solo control
mensual con secciones por semana y un único documento consolidado; usar los usuarios de Gestión de
Equipos **excepto los de Hardware**; que el Encargado de Soporte represente al jefe; y reemplazar
«Jefatura» por **Coordinador**, con el usuario **Carlos Durán**.

**Quedó hecho**

- «Meses pendientes por completar» con resumen y estado general del mes, historial mensual completo
  a un clic, y controles del mes con **Completar / Continuar / Ver documento**.
- Nueva frecuencia `Semanal con entrega mensual consolidada`, estados internos de semana y estado
  de control **Listo para entregar**; un solo documento del mes y reporte consolidado del F0387.
- Directorio del módulo sin personal de Hardware; `jefatura` → `coordinador` (Carlos Durán, solo
  consulta); Carlos González pasa a Jefe del Departamento de Soporte Técnico. Las cartas las firman
  técnico → Coordinador → Jefe.
- **Defecto real corregido:** `ngModel` sobre `<input type="number">` devuelve un número y
  `(valor ?? '').trim()` reventaba al entregar cualquier control con campo numérico.

---

## Ronda 77 — Mes actual, F0387 con IP y F0389 consolidado

**Se pidió** que la pantalla cargue el **mes actual** (agosto 2026, no julio); que el F0387 pida
**3 equipos por IP** validados contra el inventario operativo y **3 teléfonos o extensiones**, cada
uno con su hora; y que el **F0389** se maneje con la misma lógica de consolidado semanal mensual.

**Quedó hecho**

1. **Período activo.** `ControlDeadlineService.periodoActivo(hoy?)` calcula el período de la fecha
   del sistema y lo usan controles mensuales, vista por Dirección, detalle, calendario, historial
   anual y panel ejecutivo. La fecha límite sigue siendo el tercer día hábil del mes siguiente
   (agosto 2026 → 03/09/2026). La selección manual de otro mes se respeta dentro de la pantalla.
   Esto revierte la decisión de la ronda anterior de abrir en el último período cerrado, que se
   conserva solo para comparar meses ya vencidos.
2. **F0387 por IP y extensiones.** `SeccionPlantilla` gana los bloques `equiposIp` y `telefonos`;
   las respuestas viajan en `RespuestaEquipoIp` y `RespuestaTelefono`. `equipoPorIp()` y
   `buscarEquipoIp()` resuelven la IP contra el inventario operativo y el formulario autocompleta
   inventario, equipo, tipo/marca/modelo, usuario final, Dirección/Unidad y estado operativo. Se
   rechaza la IP inexistente, la de otra Dirección/Unidad y la repetida en la semana, y no se
   entrega sin las horas. `EquipoOperativo` guarda `ip` y `mac`, con un segmento de red por
   Dirección/Unidad; se agregaron dos equipos a Gerencia de Tecnología porque el control exige tres
   distintos. En Gestión de Equipos, `fichaControles` copia nombre de equipo, IP reservada y MAC del
   F0302 a la ficha del inventario operativo.
3. **F0389 consolidado.** Pasa de cuatro controles semanales a **uno mensual** con Semana 1–5
   (condiciones del CSOD con mediciones) y Cierre del mes (verificaciones periódicas). Nuevo
   *Reporte de F0389 consolidado mensual por Dirección*.

---

## Ronda 78 — F0382 fiel al formato, con muestra de cinco equipos

**Se pidió** revisar el documento original del F0382 en `controles/` y rehacer el formulario para
que respete su estructura: cinco equipos elegidos del **inventario operativo** de la
Dirección/Unidad, con buscador y autocompletado, verificación de los ítems del documento equipo por
equipo, acción correctiva para lo que no cumple, justificación para lo que no aplica, documento
formal y efecto en historial, KPIs y trazabilidad.

**Quedó hecho**

- Estructura tomada del PDF real (FORMATO CONTROLADO F0382 V2/v3): cuadro de cinco equipos, nueve
  ítems con su cumplimiento, columna de observación y acción correctiva con fecha, y estado final.
  Los ítems conservan la agrupación del formato: cinco para equipos de usuario interno, tres para
  los de consulta al público y uno para ambos.
- Formulario en cinco pasos, con buscador de inventario (filtra por inventario, nombre, usuario,
  IP, tipo, marca, modelo y unidad), autocompletado de once datos y el rótulo «Dato no registrado
  en inventario operativo» para lo que el inventario no tiene.
- Validaciones: cinco equipos, sin repetir, activos y de la Dirección/Unidad del control, con todos
  sus ítems respondidos; «No cumple» exige descripción, acción correctiva, estado y fecha; «No
  aplica» exige justificación. El estado final de cada equipo se deriva de sus ítems.
- Trazabilidad de la muestra (selección, retiro, verificación, incumplimiento y acción correctiva)
  y documento formal con el cuadro de los cinco equipos y el detalle de cada uno.
- Inventario operativo ampliado a 40 equipos (39 activos) para que toda unidad donde aplica el
  control tenga al menos cinco.

Verificación: batería **340/0**, cinco suites de navegador sin avisos ni errores de consola y
`npm run build` limpio en Controles Mensuales. Gestión de Equipos no se modificó en esta ronda.

## Ronda 79 — Integración real del inventario operativo

**Se pidió** corregir la integración: al aceptar la conformidad en Gestión de Equipos, el equipo no
aparecía en Controles Mensuales. Debía usarse un almacenamiento compartido de prototipo
(`sisgost_operational_inventory`), sin botones manuales, sin duplicados, respetando la
Dirección/Unidad y con descargo automático.

**Causa raíz**

La «integración» de Controles Mensuales solo consumía una cola simulada de la semilla: Gestión de
Equipos no escribía nada. Y hay un obstáculo de fondo comprobado en la prueba: `localStorage` está
aislado **por origen**, y el puerto forma parte del origen, así que lo escrito en el 4200 no se ve
desde el 4300.

**Quedó hecho**

- `SharedInventoryService`, archivo idéntico en los dos proyectos, con la clave acordada, la ficha
  completa y las reglas antiduplicado (actualizar, no reescribir sin cambios, histórico al abrir
  ciclo nuevo).
- Gestión de Equipos escribe al aceptar la conformidad y cierra la ficha al registrar el descargo.
- Controles Mensuales lee al cargar, ante el evento `storage` y con una acción de depuración solo
  para el Administrador; traduce la Dirección a su id y recalcula el soporte con la distribución.
- Puente `puente-inventario.html` + `SharedInventoryBridgeService` para cruzar los dos puertos.
- Trazas unificadas de incorporación, actualización, retiro e histórico, con módulo origen y destino.

Verificación con los dos servidores levantados: la aceptación real escribe la ficha, Controles
Mensuales la ve solo en su Dirección/Unidad, sin duplicar al recargar, con su IP, usable en F0422 y
F0382; el descargo la retira y la conserva como histórico. Batería **373/0**, seis suites de
navegador sin avisos, `npm run build` correcto en los dos módulos.

## Ronda 80 — Sincronización automática, sin acciones manuales

**Se pidió** que no exista ningún botón manual de sincronizar, regenerar o recalcular, y que todo
ocurra solo: al editar «Aplica a», al cambiar la distribución, al abrir una pantalla, al cambiar de
mes o de usuario, y en el inventario operativo.

**Quedó hecho**

- Retirada la única acción manual que existía (la de depuración del inventario, agregada en la
  ronda anterior). El botón «Sincronizar controles del periodo» que menciona el requerimiento nunca
  existió, pero el hueco de fondo sí era real: guardar «Aplica a» o la distribución no recalculaba
  nada.
- Nueva función central `autoSyncControls(anio, mes)`: crea lo que pasó a aplicar, reabre lo que
  vuelve a aplicar, marca «No aplica» lo que dejó de corresponder, conserva los históricos y
  recalcula responsables solo de los controles abiertos. Claves estables, sin comparar textos.
- Nuevo `AutoSyncService` que dispara la pasada desde las pantallas de período, y por tanto también
  al cambiar mes, año o el usuario de «Ver como». Idempotente.
- `autoSyncOperationalInventory()` para el inventario, invocado al cargar y al abrir la pantalla.
- Trazas automáticas de cada movimiento y mensaje explícito al guardar en el catálogo.

Verificación: 9 pantallas sin acciones manuales; los tres casos de configuración y los dos de
inventario resueltos sin pulsar nada; 0 controles duplicados e idempotencia comprobada. Batería
**403/0**, siete suites de navegador sin avisos y `npm run build` limpio.

## Estado al cierre de la sesión

| Comprobación | Resultado |
|---|---|
| Batería sobre fuente y semilla | **403 casos, 0 fallos** |
| Suites de navegador (7) | **sin avisos ni errores de consola** |
| `npm run build` · Controles Mensuales | limpio |
| `npm run build` · Gestión de Equipos | correcto, con sus 3 avisos de presupuesto preexistentes |

Semilla vigente: **336 controles** de enero a agosto de 2026, ninguno con campo `semana`; F0387 y
F0389 con 16 controles cada uno y un máximo de **un documento por Dirección/Unidad y mes**;
40 equipos en el inventario operativo (39 activos), 339 documentos y 455 eventos de trazabilidad.

### Notas para retomar

- Ninguno de los dos prototipos es un repositorio git: **todo el trabajo está sin commit**.
- `ng build` y `ng serve` no cierran su proceso en este entorno: hay que verificar el `dist` y el
  texto «Application bundle generation complete», no el código de salida del envoltorio.
- Sigue sin existir `analisis/prototipo-angular/sistema-auditoria-equipos.md`, el punto de control
  propio de Gestión de Equipos. Falta decidir si se recrea y dónde.
