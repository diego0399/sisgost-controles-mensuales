# Manual de usuario — SISGOST · Controles Mensuales

Este manual describe, pantalla por pantalla, el uso del prototipo para el personal de
Soporte Técnico del CNR. La contraseña es libre: seleccione su usuario y presione
**Ingresar a SISGOST**. El selector **Ver como** de la barra superior permite cambiar de rol
durante una demostración.

Los usuarios son los mismos de **SISGOST — Gestión de Equipos**. El botón **Ir a Gestión de
Equipos** (barra lateral, barra superior y panel ejecutivo) abre el módulo hermano: los dos
forman un solo sistema y comparten usuarios, Direcciones/Unidades, equipos y la distribución de
soportes.

---

## 1. Panel ejecutivo

La fotografía del mes en curso:

- **Indicadores**: controles del mes, entregados (y cuántos fuera de plazo), pendientes,
  vencidos del año, cartas de justificación emitidas, bitácoras de hoy (enviadas y
  pendientes) y controles próximos a vencer.
- **Alertas accionables**: Dirección/Unidad sin soporte asignado, movimientos de Gestión de
  Equipos por aplicar, controles vencidos sin justificación, bitácoras del día sin enviar,
  controles que vencen dentro de 3 días hábiles y equipos activos sin control asociado. Cada
  alerta lleva a la pantalla donde se resuelve.
- **Tarjeta de SISGOST — Gestión de Equipos**: cuántos equipos activos alimentan hoy el
  inventario operativo, cuántos movimientos esperan aplicarse y el acceso al otro módulo.
- **Avance por Dirección/Unidad**: soporte responsable, equipos activos, entregados/pendientes
  y barra de avance del período.

## 2. Calendario de controles

Mes calendario con los días hábiles, los **feriados del catálogo** (celdas ámbar), los fines
de semana y las **fechas límite** de cada control (fichas azules; verdes si ya se entregó o
justificó; rojas si venció). La leyenda inferior explica cada color y la tabla «Fechas límite
dentro del mes» lista todos los vencimientos del mes visible.

Regla visible en el encabezado: los controles mensuales de un período vencen el **tercer día
hábil del mes siguiente**. En agosto de 2026, por ejemplo, los controles de julio vencen el
**11/08/2026** porque las Fiestas Agostinas y el fin de semana desplazan los días hábiles.

## 3. Historial anual

Al elegir una **Dirección** (y su Unidad) aparece además el resumen **mes a mes de operatividad**
de esa Dirección/Unidad: controles aplicables, entregados, pendientes, vencidos, justificados,
bitácoras, porcentaje y estado. Desde ahí se abre el mes en el detalle o se genera el
**Reporte anual por Dirección**.

Los doce meses del año con su resumen visual (a tiempo / tarde / justificados / vencidos).
Al seleccionar un mes se abre el detalle filtrable por **Dirección, técnico, tipo de control
y estado**, con fecha límite, fecha de entrega, responsable y acceso al documento generado.
El Encargado puede **generar el reporte mensual consolidado** para presentarlo a jefaturas.

## 4. Controles mensuales

La pantalla se organiza **por Dirección/Unidad**, que es como se atienden los controles, y abre
en el **mes actual** del sistema. Con la fecha de demostración (16/08/2026) carga **Agosto 2026**;
la fecha límite de ese período sigue siendo el tercer día hábil del mes siguiente (03/09/2026). Si
elige otro mes en el selector, su elección se mantiene mientras siga en la pantalla.

### Vista por Dirección (predeterminada)

- **Indicadores del período**: Direcciones/Unidades atendidas y su operatividad promedio,
  cuántas están operativas, en observación, críticas y sin soporte asignado.
- **Una tarjeta por Dirección/Unidad** con sus responsables, el porcentaje de operatividad, el
  semáforo institucional y las cifras del período (aplicables, entregados, pendientes, vencidos,
  justificados, equipos activos y con incidencia). El botón **Ver detalle** abre la Dirección.
- **Comparativo por Dirección**: la misma información en tabla, para comparar de un vistazo.
- **Filtros**: año, mes, Dirección, Unidad, Técnico de Soporte y nivel de operatividad.

El semáforo es **Operativa** (90 % o más), **En observación** (75–89 %), **Crítica** (menos de
75 %), **En curso** (el plazo del período todavía corre), **Sin soporte asignado** y
**Sin controles aplicables**.

### Detalle de una Dirección/Unidad

Abre con **Meses pendientes por completar**: los meses del año con controles pendientes o
vencidos, con su resumen y su estado general (Pendiente, En proceso, Entregado, Entregado tarde,
Vencido, Justificado o Cerrado). Con **Ver historial mensual completo** se ven también los meses ya
cerrados, y con **Ver controles del mes** se entra a los controles aplicables de ese mes: los que
faltan muestran **Completar** (o **Continuar** si ya se empezó) y los entregados, **Ver documento**.
Los que no aplican aparecen al pie como **No aplica** y no cuentan como pendientes.

Reúne además todo lo de esa Dirección/Unidad en el período: responsables, fecha límite, operatividad y
estado, los quince indicadores, sus alertas, los controles que le aplican —y, al pie, los que
**no aplican**—, sus bitácoras diarias, su inventario operativo y los documentos generados.
Desde ahí se generan los **reportes formales por Dirección** (mensual, anual, de operatividad,
de controles pendientes, de inventario operativo y de bitácoras diarias), que se abren en la
vista tipo PDF con **Imprimir**, **Descargar** y **Cerrar**.

### Vista general

La tabla plana de todos los controles del período —código, período, Dirección/Unidad,
responsable, fecha límite, días hábiles restantes, avance y estado— con sus filtros de control y
estado. Sigue disponible en la pestaña **Vista general**.

### Si usted es Técnico de Soporte

La pantalla muestra primero **Mis Direcciones asignadas** y solo las Direcciones/Unidades que la
distribución le asigna, con los controles que le corresponden.

Lista de controles del período con fecha límite, **días hábiles restantes**, avance y estado.
El Técnico de Soporte solo ve —y solo puede completar— las Direcciones/Unidades que la
distribución de soportes le asigna; si abre un control ajeno, el sistema lo advierte y no deja
editarlo.

### Completar un control

1. Abra el control con **Completar**. El formulario es un *stepper* por secciones construido
   desde el formato institucional (checklists con estados y mediciones, tablas dinámicas con
   **Agregar registro**, campos de fecha/hora/observación).
   Los controles que trabajan con equipos —**F0422**, mantenimiento **F0174**, correctivo
   **F0288** y **vulnerabilidades**— abren con la lista de **equipos activos de la
   Dirección/Unidad** tomada del inventario operativo: se marcan los revisados, sus
   verificaciones (existe físicamente, usuario asignado correcto, estado operativo…), el estado
   y una observación. No aparecen equipos de otras Direcciones/Unidades ni se teclean a mano.
2. **Guardar avance** conserva el borrador; el avance se refleja en la lista.
3. Si el control exige **evidencia**, adjúntela en el paso «Evidencias».
4. En **Resumen y entrega** el sistema valida obligatorios, checklist completo, mínimos de
   tabla y evidencia; si falta algo lo enumera. **Entregar control** registra fecha y hora,
   marca «Entregado» o «Entregado tarde» según el plazo, genera el **documento formal** y
   deja constancia en trazabilidad.

### F0387 y F0389: cuatro semanas, un solo documento

El **F0387** y el **F0389** se llenan semana a semana. Al abrirlos se ve una banda con el estado de
cada semana y el formulario tiene un paso por semana. **Guardar avance** conserva lo registrado;
cuando todas las semanas están declaradas —incluidas las marcadas «Semana no aplica»— el control
pasa a **Listo para entregar** y al entregarlo se genera **un único documento del mes** con todas
las semanas, no uno por semana.

En el **F0387**, cada semana pide el estado de la semana, la fecha, el resultado general, el
responsable, las observaciones y, sobre todo:

- **3 equipos identificados por su IP**, cada uno con su **hora de verificación**. Al escribir una
  IP el sistema la busca en el inventario operativo y muestra el número de inventario, el equipo,
  el usuario final, la Dirección/Unidad y el estado operativo. Si la IP no existe entre los equipos
  activos, o si pertenece a otra Dirección/Unidad, el formulario lo advierte y no deja entregar.
  Tampoco admite la misma IP dos veces en la misma semana.
- **3 teléfonos o extensiones**, con su ubicación, el resultado de la verificación, su **hora** y
  observaciones.

En el **F0389**, cada semana registra las condiciones del cuarto de servidores (gabinetes, aire
acondicionado, UPS, alarma, sensores, limpieza y planta eléctrica) con sus mediciones, y el cierre
del mes recoge las verificaciones periódicas —extintor, librera, acceso digital, objetos extraños—
y el resultado general del mes.

### Justificar un mes sin actividad

Si el control lo permite (GLPI, F0386, F0288…), el botón **Justificar sin actividad** abre la
carta institucional: elija el motivo, revise el texto pre-redactado («Se informa que en el mes
de … no se realizó el control …, debido a que …») y emita. El control queda **Justificado** y
la carta, con sus tres firmas, disponible en Justificaciones y en el Generador de documentos.

### Revisión del Encargado

Sobre un control entregado, el Encargado puede **Aprobar y cerrar** o **Observar y devolver**
con una observación que el técnico verá en el encabezado del control.

## 5. Bitácora diaria

Cada día hábil el sistema crea la bitácora **Pendiente** de cada Dirección con soporte
asignado. Debe enviarse **antes de las 5:00 p. m.**

1. **Revisión del equipo de atención al público** (obligatoria): equipos de técnicos y de
   consulta, pantallas, kioskos, audio y sistema de tomaturno, impresoras de atención, red y
   periféricos. Cada elemento se marca *Funciona correctamente*, *Presenta falla* o *No aplica*.
2. Si un elemento **presenta falla**, son obligatorios la descripción, la acción realizada y
   el estado final (*Resuelto, Pendiente, Escalado, En observación*), con evidencia si aplica.
3. **Actividades del día**: tabla dinámica con hora, actividad, área, resultado y observaciones
   (al menos una).
4. **Enviar bitácora del día**: dentro del horario queda «Enviada»; después, «Enviada tarde».
   Un día que termina sin envío queda «Vencida». El envío genera el documento formal.

## 6. Justificaciones

Todas las cartas emitidas, con su motivo, período, responsable, avance de firmas
(técnico, Coordinador de Soporte Técnico y jefatura) y acceso a la carta en el visor.

## 7. Inventario operativo

Antes de la tabla de equipos hay un resumen **por Dirección/Unidad**: equipos activos, equipos con
incidencias, descargados del mes, estado del último F0422 y de la última bitácora, con acceso a
los equipos de esa Dirección/Unidad.

Los equipos activos por Dirección/Unidad que alimentan F0422, el mantenimiento preventivo y
el análisis de vulnerabilidades. El inventario se mantiene **solo**: cuando el Usuario Final
acepta la conformidad en Gestión de Equipos el equipo entra automáticamente, y cuando Soporte
registra el descargo sale automáticamente del inventario activo. **No hay nada que confirmar**:
el panel **Últimos movimientos sincronizados desde Gestión de Equipos** muestra lo que ya se
aplicó, y todo queda en trazabilidad.

La tabla lista por defecto **solo los equipos activos**; la casilla «Ver descargados e históricos»
muestra también los que salieron y los ciclos anteriores de un equipo que volvió a entregarse en
otra Dirección/Unidad.

**Detalle** de un equipo muestra sus datos (inventario, serie, usuario final, técnico de
configuración, soporte responsable, expediente único, garantía) y su **historial de controles**:
en qué F0422, mantenimientos o análisis de vulnerabilidades ha aparecido.

## 8. Generador de documentos

Catálogo de todo lo emitido: controles entregados, bitácoras, cartas y reportes. **Vista
previa** abre el documento en el visor institucional (hoja blanca, encabezado con logo,
secciones numeradas, firmas y pie con huella de integridad) con acciones de **Imprimir**
(sale solo la hoja), **Descargar documento**, **Ver firmas** y **Ver evidencias**. El
Encargado genera desde aquí el **reporte mensual consolidado** por Dirección o global.

## 9. Trazabilidad

Línea de tiempo auditada: control programado/iniciado/entregado/vencido/justificado, bitácoras
enviadas o vencidas, documentos generados y descargados, equipos agregados o descargados desde
Gestión de Equipos y cambios de distribución. Filtrable por Dirección, mes, acción y
**solo integración entre módulos**. Los eventos de integración muestran el módulo origen y
destino y el número de inventario afectado.

## 10. Administración

- **Usuarios y direcciones** (Administrador): directorio compartido con Gestión de Equipos
  —los usuarios de Hardware aparecen marcados como «Solo Gestión de Equipos»— y la estructura
  organizacional con sus equipos activos y su soporte responsable. Aquí está
  **Restablecer datos de demostración**: pide confirmación, enumera lo que repone y devuelve el
  prototipo a su estado inicial sin romper la navegación.
- **Catálogo de controles** (Administrador edita, Encargado consulta): frecuencia, evidencia,
  firma, justificación, estado y —sobre todo— **Aplica a**: en qué Direcciones, Unidades o área
  técnica se trabaja cada control. Con **Editar aplicación** se elige el modo (todas, Direcciones
  específicas, Unidades específicas o área técnica), se marcan las que corresponden y se escribe el
  motivo; el sistema muestra en qué Direcciones/Unidades quedaría antes de guardar y no permite
  guardar una aplicación vacía. Lo que se configure aquí decide qué controles aparecen en el
  calendario de cada Dirección/Unidad: donde el control no aplica, queda como **No aplica** y no
  cuenta como pendiente ni vence.
- **Distribución de soportes**: qué técnico responde por cada Dirección/Unidad. Permite asignar
  y desactivar asignaciones y consultarlas **por Dirección/Unidad** o **por soporte**. Una
  Dirección/Unidad sin soporte activo genera la alerta del panel. **Esta pantalla gobierna
  también a Gestión de Equipos**: allí solo pueden recibir equipos para configurar los técnicos
  responsables de la Dirección/Unidad del requerimiento.
- **Feriados** (Administrador): catálogo editable nacional y de San Salvador, con la tabla de
  **fechas límite resultantes** del año para ver el efecto de cada cambio.

---

### Mensajes institucionales que muestra el sistema

- «Este control se encuentra pendiente de entrega.»
- «Este control venció el plazo de entrega establecido.»
- «La bitácora diaria fue enviada fuera del horario establecido.»
- «No se registró actividad mensual asociada a este control; se generó carta de justificación.»
- «El equipo fue incorporado al inventario operativo de la Dirección/Unidad posterior a la
  aceptación del Usuario Final.»
- «Este control pertenece a una Dirección/Unidad que no está asignada al técnico en la
  distribución de soportes.»
- «Los datos de demostración fueron restablecidos correctamente.»
- «Debe seleccionar al menos una Dirección, Unidad o área donde aplica este control.»
- «La aplicación del control fue actualizada correctamente.»
- «La Dirección/Unidad tiene controles aplicables, pero no posee Técnico de Soporte asignado.»
