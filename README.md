# SISGOST — Controles Mensuales

Prototipo navegable del módulo **Controles Mensuales** de SISGOST (Sistema de Gestión y
Seguimiento de Soporte Técnico) del Centro Nacional de Registros, conectado conceptualmente
con el módulo **SISGOST — Gestión de Equipos**.

Controla, da seguimiento, completa, justifica, genera y consulta los **controles mensuales**
y las **bitácoras diarias** que realizan los Técnicos de Soporte según las Direcciones/Unidades
que tienen asignadas.

## Ejecución

```bash
npm install
ng serve        # http://localhost:4300
npm run build
```

El puerto está fijado en `angular.json` para que los dos módulos del ecosistema puedan correr a
la vez: **Gestión de Equipos en el 4200** y **Controles Mensuales en el 4300**. El enlace entre
módulos se configura en `src/app/core/config/modulos.ts`.

Sin backend, sin base de datos, sin Firebase y sin API real: datos simulados en
`public/assets/data/*.json` y persistencia de sesión en `localStorage`
(clave `sisgost.controles.v1`; el catálogo de feriados usa `sisgost.controles.feriados.v1`).
La acción **Restablecer datos de demostración** (Administración, solo Administrador) vuelve a la
semilla tras confirmación.

## Usuarios de demostración

Son **los mismos usuarios de SISGOST — Gestión de Equipos**, con la misma identidad y el mismo
rol: no existe un directorio paralelo.

| Usuario | Rol | Alcance en este módulo |
|---|---|---|
| `sadmin` | Administrador | Usuarios, catálogo, aplicación de controles, feriados y datos de demostración |
| `demo.admin` | Administrador | Usuario de demostración: restablece los datos |
| `cgonzalez` | Encargado de Soporte (**jefe del área**) | Ve todas las Direcciones/Unidades, la operatividad, pendientes, vencidos, historial y reportes |
| `cduran` | **Coordinador** | Consulta y seguimiento: panel, operatividad, historial, reportes, documentos y trazabilidad |
| `wcarranza` | Técnico de Soporte | Registro de la Propiedad, Registro de Comercio, RPRH y Gerencia de Tecnología |
| `mmartinez` | Técnico de Soporte | Registro de la Propiedad, Dirección de Registro, IGN e ISPI |
| `dportillo` | Técnico de Soporte | Registro de la Propiedad, Dirección de Registro, IGN, RPRH y Gerencia de Tecnología |

El personal de **Hardware no participa en este módulo**: opera solo en Gestión de Equipos y no
figura en este directorio. Diana Portillo sí aparece porque la distribución compartida le asigna
Direcciones/Unidades en ambos módulos.

La contraseña es libre (prototipo). **Dirección/Unidad no es un rol del sistema**: es el dato
organizacional al que pertenecen los controles, y quién atiende cada una lo decide la
distribución de soportes.

## Reglas institucionales implementadas

- **Primeros 3 días hábiles.** Los controles mensuales del período `M` vencen el tercer día
  hábil del mes `M+1`, excluyendo sábados, domingos y el catálogo **editable** de feriados de
  El Salvador y San Salvador (`HolidayService`, `BusinessDayService`, `ControlDeadlineService`).
  Ninguna fecha va quemada en código: al editar los feriados cambian todas las fechas límite.
- **Bitácora diaria antes de las 5:00 p. m.** con revisión obligatoria del equipo de atención
  al público (tomaturno, kioskos, pantallas, impresoras, red…). Después de la hora queda
  «Enviada tarde»; un día que termina sin envío queda «Vencida».
- **Justificación cuando no hay actividad.** Un control sin actividad mensual (GLPI sin
  tiquetes, F0386 sin traslado de cintas…) no queda vacío: se cierra con carta de justificación
  basada en `Formatos_nuevos_2025_.docx`, con las tres firmas del formato.
- **Integración automática con Gestión de Equipos.** Una entrega aceptada por el Usuario Final
  incorpora el equipo al inventario operativo de su Dirección/Unidad y un descargo lo retira,
  **sin confirmación manual**: el módulo se sincroniza al cargar (`EquipmentIntegrationService`,
  `syncOperationalInventory()`) y la pantalla solo muestra los movimientos ya sincronizados.
  Ver «Un solo ecosistema» abajo.
- **Un control no registra equipos ajenos.** Los controles que trabajan con equipos (F0422,
  F0174, F0288, VULN) solo ofrecen los equipos **activos de su Dirección/Unidad**, tomados del
  inventario operativo; y un Técnico de Soporte solo completa controles de las Direcciones/Unidades
  que la distribución le asigna.
- **Documentos formales.** Todo control entregado, bitácora enviada, carta y reporte
  consolidado se abre en un visor tipo PDF con encabezado institucional, secciones numeradas,
  firmas y pie de página; la impresión saca solo la hoja.

## Aplicación configurable de los controles («Aplica a»)

No todos los controles se trabajan en todas las Direcciones/Unidades, así que **dónde aplica cada
control se configura** en Administración → Catálogo de controles → **Editar aplicación**, con
cuatro modos:

| Modo | Ejemplo |
|---|---|
| Todas las direcciones | **F0422** — cada Dirección/Unidad puede tener equipos activos |
| Direcciones específicas | **VULN** — solo las Direcciones incluidas en el ciclo de escaneo |
| Unidades específicas | **F0174** — solo las unidades con equipos de usuario |
| Área técnica específica | **F0234** → CSOD/Cuarto de servidores; **F0386** → área responsable de respaldos |

Consecuencias en todo el sistema: el calendario **solo programa** cada control donde aplica; un
control que no aplica no figura como pendiente ni vence —queda como **No aplica**, informativo—;
el panel ejecutivo cuenta «controles aplicables del mes» y avisa cuando una Dirección/Unidad
**tiene controles aplicables pero no tiene Técnico de Soporte asignado**; y los controles que
trabajan con equipos solo se programan donde hay inventario operativo activo.

## Todo se sincroniza solo

El módulo **no tiene ninguna acción manual de sincronizar, regenerar ni recalcular**. Lo único que
hace el usuario es guardar su cambio; el resto ocurre en el mismo acto.

| Cuándo | Qué pasa sin pulsar nada |
|---|---|
| Se guarda «Aplica a» en el catálogo | Se recalcula el período: se crean los controles que pasaron a aplicar, se marcan «No aplica» los que dejaron de corresponder y se conservan los históricos |
| Se guarda o desactiva una asignación de la distribución | Los controles **abiertos** pasan al nuevo responsable; los entregados conservan a quien los entregó |
| Se abre una pantalla de período | Pasada silenciosa del período visible (controles + inventario operativo) |
| Se cambia mes, año, Dirección/Unidad, técnico o el usuario de «Ver como» | La pasada se repite para lo que ahora se mira |
| Gestión de Equipos acepta una conformidad o registra un descargo | El equipo entra o sale del inventario operativo por sí solo |

La función central es `autoSyncControls(anio, mes)`, y la del inventario,
`autoSyncOperationalInventory()`. Las dos son **idempotentes**: si nada cambió no escriben nada y
no dejan traza, así que navegar entre pantallas no duplica controles ni ensucia la trazabilidad.

Las comparaciones se hacen con **claves estables** —código del formato, período y par
Dirección/Unidad— y nunca con textos visibles.

Una decisión que conviene conocer: en un período **cuyo plazo ya venció** la sincronización no
crea controles nuevos (no se inventan obligaciones retroactivas); ahí solo marca «No aplica» lo
que dejó de corresponder.

## Inventario operativo compartido con Gestión de Equipos

Un equipo entra al inventario operativo **solo** cuando el Usuario Final acepta la conformidad en
Gestión de Equipos, y sale cuando allí se registra su descargo. Las dos cosas ocurren **solas**:
en Controles Mensuales no hay botón que incorporar ni que aplicar.

El transporte es una clave única de `localStorage`, `sisgost_operational_inventory`, gobernada por
`SharedInventoryService` —**el mismo archivo en los dos proyectos**, como la distribución de
soportes—. Gestión de Equipos escribe al aceptar y al descargar; Controles Mensuales lee al cargar,
al recibir el aviso `storage` de otra pestaña y cuando el Administrador usa la acción de
demostración «Sincronizar inventario desde Gestión de Equipos».

**Un detalle que hay que conocer:** `localStorage` está aislado **por origen**, y el puerto forma
parte del origen. Con Gestión de Equipos en el 4200 y Controles Mensuales en el 4300, la clave
compartida por sí sola no cruza. Por eso Gestión de Equipos publica `puente-inventario.html` en su
propio origen y Controles Mensuales lo carga en un iframe oculto para pedirle el inventario por
`postMessage`. Resultado:

| Escenario | Qué pasa |
|---|---|
| Los dos módulos en el mismo origen | La clave compartida basta; el puente no hace falta |
| Puertos distintos y Gestión de Equipos levantado | El puente los conecta y el equipo aparece |
| Gestión de Equipos apagado | Controles Mensuales sigue con lo que ya había sincronizado |

Reglas antiduplicado: mismo número de inventario, mismo expediente único y misma Dirección/Unidad
**actualizan** el registro; si nada cambió no se reescribe nada y queda constancia del intento
evitado; un ciclo nuevo del mismo equipo deja el anterior como **Histórico** sin borrarlo. El
equipo aparece **únicamente** en la Dirección/Unidad del requerimiento aceptado, y su soporte
responsable lo decide la distribución de soportes vigente.

## Período activo: el mes actual

Todas las pantallas que trabajan por período —controles mensuales, vista por Dirección, detalle de
Dirección, detalle de control, calendario, historial anual y panel ejecutivo— **abren en el mes
actual del sistema**. Con la fecha de demostración (16/08/2026) cargan **Agosto 2026**, aunque el
plazo de entrega de ese período venza hasta el **03/09/2026**: la fecha límite es del mes
siguiente, el período seleccionado no. La regla vive en un solo lugar,
`ControlDeadlineService.periodoActivo()`, y si el usuario elige otro mes su selección se respeta
mientras permanezca en la pantalla.

## F0387 y F0389: semanales, con entrega mensual consolidada

El **F0387 — Verificación de sincronización de hora de equipos con IP** y el **F0389 — Control de
condiciones de infraestructura del CSOD** se trabajan semana a semana pero se entregan en **un solo
documento mensual**: son un único control por Dirección/Unidad y mes —no cuatro— cuyo formulario
tiene una sección por semana (1 a 5) más el cierre del mes.

| Estado interno de la semana | Efecto |
|---|---|
| Semana pendiente | Todavía no se registró |
| Semana completada | Verificación realizada |
| Semana observada | Se detectó y corrigió un desfase |
| Semana no aplica | El mes no tiene esa semana; no exige los demás datos |

Estado del control: **Pendiente** (ninguna semana), **En proceso** (alguna), **Listo para
entregar** (todas declaradas) y **Entregado** al generar el documento consolidado, que sale una
sola vez por mes. Hay un **reporte consolidado mensual por Dirección** para cada uno.

### Verificación por IP y por extensión (F0387)

Cada semana del F0387 verifica **3 equipos identificados por su IP** y **3 teléfonos o
extensiones**, cada uno con su **hora de verificación**. La IP no se teclea a ciegas: se busca en
el **inventario operativo**, que proviene de las entregas aceptadas en Gestión de Equipos junto con
los datos técnicos del equipo (nombre, IP y MAC del F0302). Al digitar una IP válida el formulario
autocompleta número de inventario, equipo, tipo/marca/modelo, usuario final, Dirección/Unidad y
estado operativo.

Reglas: la IP debe existir en el inventario operativo, pertenecer a un equipo **activo**, ser de la
**misma Dirección/Unidad** del control, no repetirse dentro de la semana, y los 3 equipos y los
3 teléfonos deben llevar hora. Cada Dirección/Unidad usa su propio segmento de red, así que una IP
ajena se rechaza con el mensaje correspondiente.

El F0389, en cambio, registra por semana las **condiciones del cuarto de servidores** (gabinetes,
aire acondicionado con su temperatura, UPS con su carga, alarma, sensores, limpieza y prueba de la
planta eléctrica) y deja para el **cierre del mes** las verificaciones periódicas: iluminación,
techo y piso, deshumidificadores, switches, librera de respaldo, acceso digital, extintor y objetos
extraños.

La bitácora de la última sesión de trabajo (rondas 74 a 77: integración, inventario
automático, operatividad por Dirección, meses pendientes, F0387 con IP y F0389 consolidado) está
en [docs/bitacora-sesion-2026-08-16-17.md](docs/bitacora-sesion-2026-08-16-17.md).

## F0234: bitácora de ingresos al cuarto de servidores

El **F0234** se llena como el formato controlado V4: una entrada por cada visita al cuarto de
servidores, con fecha, hora de entrada y de salida, carné y nombre del personal autorizado, carné y
nombre del acompañante, si es personal técnico de la DTI, interno del CNR o externo, si anexa
documento y la actividad o motivo de la visita.

**No siempre hay acompañante.** Cada registro empieza declarando su **tipo de ingreso**:

| Tipo de ingreso | Qué se pide |
|---|---|
| **Individual** | El Técnico de Soporte entra solo: fecha, horas, técnico, motivo y —si la marcó— la imagen del respaldo. Los campos del acompañante ni se muestran ni se exigen. |
| **Con acompañante** | Lo anterior más el **nombre**, el **tipo de personal** y el **cargo o institución** de quien acompaña. |

El técnico que ingresa viene autocompletado con el usuario que está completando el control —es
quien abre el cuarto de servidores— y puede corregirse. Al volver de «Con acompañante» a
«Individual» los datos del acompañante se borran: un campo que deja de mostrarse no puede seguir
viajando con el registro, y nada oculto queda como obligatorio.

En pantalla **no es una tabla horizontal**: cada ingreso se agrega desde un formulario propio y la
tabla solo resume lo registrado, con **Ver detalle**, **Editar** y **Eliminar** por fila. Los tipos
de dato son los correctos —fecha con calendario, horas con selector de hora, motivo como catálogo y
observación multilínea—, y cada registro se valida antes de entrar:

| Regla | Mensaje |
|---|---|
| Falta la fecha, la hora de entrada o la de salida | «Debe ingresar la fecha del registro.» / «…la hora de entrada.» / «…la hora de salida.» |
| Salida anterior a la entrada | «La hora de salida no puede ser menor que la hora de entrada.» |
| No se declaró el tipo de ingreso | «Debe seleccionar el tipo de ingreso.» |
| Falta el técnico o el motivo | «Debe ingresar el nombre del Técnico de Soporte que ingresa.» / «…el motivo del ingreso.» |
| El ingreso es acompañado y falta el acompañante | «Debe ingresar el nombre del acompañante.» / «Debe seleccionar el tipo de personal del acompañante.» / «Debe ingresar el cargo o institución del acompañante.» |
| Se anexa respaldo y no se sube la imagen | «Debe adjuntar la imagen del documento de respaldo.» / «Debe adjuntar el documento de respaldo indicado.» |
| El respaldo no es una imagen | «El documento de respaldo debe ser una imagen en formato PNG, JPG, JPEG o WEBP.» |
| Queda un registro a medias | «Complete o elimine los registros incompletos antes de entregar el control.» |

**Mes sin ingresos.** Si en el mes no hubo ninguna visita, se declara explícitamente: entonces no
se piden registros, pero **sí** se exige la observación que lo sustente, y el documento lo dice con
todas sus letras: *«Durante el periodo evaluado no se registraron ingresos al cuarto de
servidores.»* El control nunca queda simplemente vacío.

**El acompañante también se clasifica.** El formato clasifica a todo el que entra, no solo a quien
firma: en el ingreso acompañado aparecen los tres botones de opción —Personal técnico DTI, Personal
interno CNR, Personal externo al CNR— y son obligatorios. No es texto libre.

**Documento de respaldo.** Vale igual para los dos tipos de ingreso. Una casilla —«Sí, se anexa
documento de respaldo»— decide si se pide archivo. Sin marcar, no se exige nada. Marcada, la imagen es **obligatoria** y solo se admiten
**PNG, JPG, JPEG o WEBP**: un archivo vacío o de otro tipo se rechaza al elegirlo y el registro no
se guarda sin la imagen. La imagen se reduce a 900 px por lado antes de guardarse —el prototipo
guarda su estado en el navegador— y **sale impresa en el documento del control**, que declara
«Documento de respaldo anexo.» o «No se anexó documento de respaldo.» según corresponda. El cuadro
de ingresos imprime el **tipo de ingreso** de cada visita y, en las individuales, «No aplica» en las
tres columnas del acompañante: el formato no admite celdas en blanco que puedan leerse como un
olvido.

El paso de **verificación de cierre** pregunta si se verificó el cierre (Sí / No / No aplica), con
su fecha, hora y responsable, y pide justificación cuando la respuesta no es «Sí».

## F0382: verificación de seguridad sobre una muestra de equipos

El **F0382 — Check list de verificación de políticas y controles de seguridad de TIC** se llena
como el formato físico: un cuadro de **cinco equipos** y, para cada uno, los **nueve ítems** de
seguridad del documento original con su resultado, su observación, su acción correctiva y su
estado final.

Los equipos **no se escriben**: se eligen del **inventario operativo** de la Dirección/Unidad del
control con un buscador que filtra por número de inventario, nombre del equipo, usuario final, IP,
tipo, marca, modelo o unidad. Al elegir uno, el formulario autocompleta inventario, usuario,
nombre del equipo, tipo, marca, modelo, serie, IP, Dirección, Unidad y estado operativo; lo que el
inventario no tiene se rotula «Dato no registrado en inventario operativo» y no se inventa.

El formulario recorre cinco pasos: **datos generales del control** (solo lectura), **selección de
equipos desde inventario**, **verificación de ítems por equipo**, **observaciones generales** y
**resumen y entrega**.

| Ítem marcado como | El formulario exige |
|---|---|
| Cumple | Nada más |
| No cumple | Descripción del incumplimiento, acción correctiva, estado final y fecha |
| No aplica | Justificación |

Antes de entregar, el paso de resumen muestra el **resumen de validación de la muestra**: equipos
seleccionados y verificados por completo sobre los cinco pedidos, ítems que cumplen, que no cumplen
y que no aplican, acciones correctivas y justificaciones registradas sobre las que hacen falta, si
las observaciones generales están completas y, cerrando, **«Estado listo para entrega: Sí/No»**. Si
la respuesta es «No», debajo se enumera lo que falta y la entrega devuelve «No puede entregar el
control F0382 con campos pendientes.». Un control con hallazgos —incumplimientos o ítems «No
aplica»— tampoco se entrega con las observaciones generales en blanco.

Reglas de entrega: cinco equipos, sin repetir, todos activos y de la Dirección/Unidad del control,
con todos sus ítems respondidos. El **estado final de cada equipo** (Completado / Pendiente) no se
teclea: se deriva de sus ítems. Los nueve ítems conservan la agrupación del formato —cinco para
equipos de usuario interno, tres para los de consulta al público y uno para ambos—, así que a cada
equipo se le piden solo los que le corresponden según su clasificación.

## Catálogo de controles modelado

Modelado desde la carpeta real `controles/`: F0234 (ingreso a cuartos de servidores),
F0389 (infraestructura del cuarto de servidores, **semanal con entrega mensual consolidada**), F0382 (políticas de seguridad, **muestra de 5 equipos**)
TIC), F0384 (inventario de cintas), F0386 (traslado de cintas, eventual/justificable),
F0387 (sincronización de hora, **semanal con entrega mensual consolidada**), F0422 (inventario de equipos), F0174
(mantenimiento preventivo), F0288 (correctivo, eventual/justificable), GLPI (tiquetes,
justificable), VULN (vulnerabilidades), F0206 (servidores), F0204 (TELCO) y SEGTIC
(verificación ISO/IEC 27001). Cada control define su **plantilla de formulario digital**
(secciones, campos, checklists y tablas) que el stepper de «Completar control» dibuja.

## Un solo ecosistema: integración con Gestión de Equipos

Los dos prototipos son aplicaciones Angular independientes que **comparten los datos base**. No
hay usuarios, Direcciones/Unidades ni equipos duplicados con otro nombre.

| Dato | Dónde se administra | Quién lo consume |
|---|---|---|
| Usuarios y roles | Directorio compartido (`usuarios-sistema.json`) | Ambos módulos |
| Direcciones y unidades | Catálogo organizacional | Ambos módulos |
| **Distribución de soportes** | **Controles Mensuales** (Administración → Distribución de soportes) | Ambos módulos |
| Equipos | Gestión de Equipos (preparación → configuración → entrega → aceptación) | Controles Mensuales, como inventario operativo |

Flujo del equipo:

```text
Gestión de Equipos → aceptación del Usuario Final
   → equipo activo en la Dirección/Unidad solicitante
   → se incorpora AUTOMÁTICAMENTE al inventario operativo de Controles Mensuales
   → controles asociados (F0422, F0174, F0288, VULN) y bitácora diaria

Gestión de Equipos → descargo
   → el equipo deja de estar activo
   → sale AUTOMÁTICAMENTE del inventario operativo activo de Controles Mensuales
```

Nada de esto se confirma a mano: no hay botones de «incorporar al inventario» ni de «aplicar
descargo». `EquipmentIntegrationService` sincroniza al cargar (`syncOperationalInventory()`), es
idempotente —un evento ya procesado no duplica el equipo ni repite el movimiento— y si un equipo
vuelve a entregarse en otra Dirección/Unidad, el registro anterior se conserva como **Histórico**
y se abre un ciclo operativo nuevo. La pantalla muestra **Últimos movimientos sincronizados desde
Gestión de Equipos**, y la tabla lista por defecto solo los equipos activos, con opción de ver
descargados e históricos.

Efecto de la distribución en el otro módulo: en **Gestión de Equipos**, al crear el expediente
único solo se ofrecen como **Técnico de Configuración** los técnicos responsables de la
Dirección/Unidad del requerimiento —los que están aquí—. El registro es único
(`SupportDistributionService`, el mismo servicio en los dos proyectos) y la pantalla de
distribución de Gestión de Equipos quedó en modo consulta, con enlace a esta.

Cada movimiento entre módulos queda en **Trazabilidad** con módulo origen, módulo destino,
Dirección/Unidad, equipo, estado anterior y estado nuevo (filtro «Solo integración entre módulos»).

## Operatividad por Dirección/Unidad

Los controles se atienden **por Dirección/Unidad** —cada una tiene su Técnico de Soporte
responsable—, así que esa es la organización principal de la pantalla **Controles mensuales**:

- **Vista por Dirección** (predeterminada): una tarjeta por Dirección/Unidad con sus responsables,
  su operatividad, el semáforo institucional y las cifras del período, más una **tabla comparativa**
  entre Direcciones. Desde cada tarjeta se entra al **detalle de la Dirección/Unidad**.
- **Vista general**: la tabla plana de todos los controles del período, que se conserva para buscar.

Filtros globales: año, mes, Dirección, Unidad, Técnico de Soporte, tipo de control, estado y
**nivel de operatividad**.

### Cálculo de la operatividad

```text
controles     = (entregados —incluidas las entregas tardías— + justificados) / controles aplicables
bitácoras     = (enviadas + enviadas tarde) / bitácoras del período
operatividad  = controles                         … si la Dirección/Unidad no lleva bitácora
              = controles · 0.7 + bitácoras · 0.3  … si la lleva
cumplimiento  = (entregados a tiempo + justificados) / controles aplicables
```

Semáforo: **90–100 % Operativa · 75–89 % En observación · menos de 75 % Crítica**, más tres estados
aparte: **Sin soporte asignado**, **Sin controles aplicables** y **En curso** (el plazo del período
todavía corre y no hay nada vencido: medirlo como incumplimiento castigaría a quien está dentro de
su plazo). Ese estado es el que permite abrir en el **mes actual** sin marcar en rojo a las
Direcciones que todavía están dentro de su plazo.

### Meses pendientes por completar

El detalle de una Dirección/Unidad abre con los **meses que tienen controles pendientes o
vencidos**, cada uno con su resumen (aplicables, entregados, pendientes, vencidos, justificados) y
su **estado general**: Pendiente, En proceso, Entregado, Entregado tarde, Vencido, Justificado o
Cerrado. Un botón muestra el **historial mensual completo**, y **Ver controles del mes** lista los
controles aplicables de ese mes con su acción: **Completar** o **Continuar** si falta trabajo,
**Ver documento** si ya se entregó. Los controles que no aplican se muestran aparte como
**No aplica** y no cuentan como pendientes.

### Detalle de la Dirección/Unidad

`/controles/direccion/:direccion/:unidad` reúne responsables, fecha límite, los 15 indicadores del
período, las alertas de esa Dirección, los controles que le aplican —y los que **no aplican**—, sus
bitácoras, su inventario operativo y los documentos generados, con acceso directo a los seis
**reportes formales por Dirección**: mensual, anual, de operatividad, de controles pendientes, de
inventario operativo y de bitácoras diarias.

El **Panel ejecutivo** resume lo mismo a nivel global (Direcciones operativas, en observación,
críticas y sin soporte; equipos con incidencias; carga por Técnico de Soporte) y sus **alertas son
por Dirección**. El **Historial anual** muestra la operatividad mes a mes de la Dirección/Unidad
elegida, y el **Inventario operativo** se resume también por Dirección/Unidad.

## Documentación

- `manual_usuario_controles_mensuales.md` — guía por pantalla para el personal.
- `manual_tecnico_controles_mensuales.md` — arquitectura, servicios y reglas.
- `modelo_datos_controles_mensuales.md` — entidades y relaciones del modelo simulado.
- `diagramas_controles_mensuales.md` — diagramas del sistema (fuentes PlantUML en `docs/plantuml/`).
