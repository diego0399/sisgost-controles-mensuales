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
ng serve
npm run build   # presupuesto: initial 500 kB / estilos por componente 4 kB
```

## 2. Estructura

```text
src/app/
├── core/
│   ├── config/permisos.ts            # menú y permisos por rol (shell + guard comparten tabla)
│   ├── guards/{auth,role}.guard.ts
│   ├── layout/shell.component.ts     # layout con menú lateral (estilos en styles.css)
│   ├── models/models.ts              # todo el modelo de datos del módulo
│   └── services/
│       ├── holiday.service.ts        # catálogo editable de feriados (persistencia propia)
│       ├── business-day.service.ts   # días hábiles: L–V menos feriados
│       ├── control-deadline.service.ts # 3.er día hábil del mes siguiente; límites semanales
│       ├── equipment-integration.service.ts # eventos simulados de Gestión de Equipos
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
| No entregar control obligatorio vacío | `validarEntrega`: obligatorios, checklist completo, mínimos de tabla, evidencia |
| Mes sin actividad → carta, no vacío | `justificarControl` exige motivo y texto; el mínimo de tabla lo sugiere |
| No cerrar bitácora sin revisar atención al público | `validarBitacora`: 9 elementos marcados; fallas con descripción, acción y estado final |
| Bitácora después de las 17:00 | `enviarBitacora` marca `Enviada tarde` |
| Control vencido sin estado claro | reconciliación a `Vencido` + alerta del panel |
| Dirección sin soporte responsable | `direccionesSinSoporte` (computed) + alerta |
| Equipo activo sin Dirección/Unidad | la semilla lo garantiza; la batería de casos lo verifica |

Todo cambio de estado pasa por `registrarEvento` (trazabilidad) y `persistir()`.

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

`EquipmentIntegrationService` expone `pendientes`/`aplicados` y `aplicar(id, usuario)`.
Los eventos (`eventos-integracion.json`) simulan la cola del otro módulo:

- **Entrega aceptada** → el equipo entra al inventario operativo de su Dirección/Unidad.
- **Descargo de equipo** → el equipo pasa a `Descargado` (sale del inventario activo).

No se duplica lógica de Gestión de Equipos: solo se consumen sus efectos, y cada aplicación
queda en trazabilidad («Equipo agregado/descargado desde Gestión de Equipos»).

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
días hábiles que usa la aplicación: 352 controles de enero a agosto de 2026 (mensuales,
semanales F0389/F0387, eventuales y programados) con estados realistas —entregados, tardíos,
vencidos, justificados, observado y abiertos—, 48 bitácoras de los últimos 12 días hábiles,
3 cartas de justificación con el texto real de `Formatos_nuevos_2025_.docx`, ~355 documentos
y ~470 eventos de trazabilidad. La Oficina Departamental de La Unión queda sin soporte
asignado a propósito, para alimentar la alerta del panel.
