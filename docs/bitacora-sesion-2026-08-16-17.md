# Bitácora de sesión — SISGOST Controles Mensuales

**Sesión del 16 y 17 de agosto de 2026 · rondas 74 a 77.**

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

## Estado al cierre de la sesión

| Comprobación | Resultado |
|---|---|
| Batería sobre fuente y semilla | **297 casos, 0 fallos** |
| Suites de navegador (5) | **sin avisos ni errores de consola** |
| `npm run build` · Controles Mensuales | limpio |
| `npm run build` · Gestión de Equipos | correcto, con sus 3 avisos de presupuesto preexistentes |

Semilla vigente: **336 controles** de enero a agosto de 2026, ninguno con campo `semana`; F0387 y
F0389 con 16 controles cada uno y un máximo de **un documento por Dirección/Unidad y mes**;
25 equipos en el inventario operativo, 339 documentos y 455 eventos de trazabilidad.

### Notas para retomar

- Ninguno de los dos prototipos es un repositorio git: **todo el trabajo está sin commit**.
- `ng build` y `ng serve` no cierran su proceso en este entorno: hay que verificar el `dist` y el
  texto «Application bundle generation complete», no el código de salida del envoltorio.
- Sigue sin existir `analisis/prototipo-angular/sistema-auditoria-equipos.md`, el punto de control
  propio de Gestión de Equipos. Falta decidir si se recrea y dónde.
