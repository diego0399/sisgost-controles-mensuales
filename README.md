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

## F0387: semanal, con entrega mensual consolidada

El **F0387 — Verificación de sincronización de hora de equipos con IP** se trabaja semana a semana
pero se entrega en **un solo documento mensual**: es un único control por Dirección/Unidad y mes
—no cuatro— cuyo formulario tiene una sección por semana (1 a 5) más el cierre del mes.

| Estado interno de la semana | Efecto |
|---|---|
| Semana pendiente | Todavía no se registró |
| Semana completada | Verificación realizada |
| Semana observada | Se detectó y corrigió un desfase |
| Semana no aplica | El mes no tiene esa semana; no exige los demás datos |

Estado del control: **Pendiente** (ninguna semana), **En proceso** (alguna), **Listo para
entregar** (todas declaradas) y **Entregado** al generar el documento consolidado, que sale una
sola vez por mes. Hay además un **Reporte de F0387 consolidado mensual por Dirección**.

## Catálogo de controles modelado

Modelado desde la carpeta real `controles/`: F0234 (ingreso a cuartos de servidores),
F0389 (infraestructura del cuarto de servidores, **semanal**), F0382 (políticas de seguridad
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
su plazo). Por eso la vista ejecutiva abre en el **último período cerrado**.

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
