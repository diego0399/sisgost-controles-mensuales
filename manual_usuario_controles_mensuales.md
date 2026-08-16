# Manual de usuario — SISGOST · Controles Mensuales

Este manual describe, pantalla por pantalla, el uso del prototipo para el personal de
Soporte Técnico del CNR. La contraseña es libre: seleccione su usuario y presione
**Ingresar a SISGOST**. El selector **Ver como** de la barra superior permite cambiar de rol
durante una demostración.

---

## 1. Panel ejecutivo

La fotografía del mes en curso:

- **Indicadores**: controles del mes, entregados (y cuántos fuera de plazo), pendientes,
  vencidos del año, cartas de justificación emitidas, bitácoras de hoy (enviadas y
  pendientes) y controles próximos a vencer.
- **Alertas accionables**: dirección sin soporte asignado, controles vencidos sin
  justificación, bitácoras del día sin enviar, controles que vencen dentro de 3 días hábiles
  y equipos activos sin control asociado. Cada alerta lleva a la pantalla donde se resuelve.
- **Avance por Dirección/Unidad**: entregados/pendientes y barra de avance del período.

## 2. Calendario de controles

Mes calendario con los días hábiles, los **feriados del catálogo** (celdas ámbar), los fines
de semana y las **fechas límite** de cada control (fichas azules; verdes si ya se entregó o
justificó; rojas si venció). La leyenda inferior explica cada color y la tabla «Fechas límite
dentro del mes» lista todos los vencimientos del mes visible.

Regla visible en el encabezado: los controles mensuales de un período vencen el **tercer día
hábil del mes siguiente**. En agosto de 2026, por ejemplo, los controles de julio vencen el
**11/08/2026** porque las Fiestas Agostinas y el fin de semana desplazan los días hábiles.

## 3. Historial anual

Los doce meses del año con su resumen visual (a tiempo / tarde / justificados / vencidos).
Al seleccionar un mes se abre el detalle filtrable por **Dirección, técnico, tipo de control
y estado**, con fecha límite, fecha de entrega, responsable y acceso al documento generado.
El Encargado puede **generar el reporte mensual consolidado** para presentarlo a jefaturas.

## 4. Controles mensuales

Lista de controles del período con fecha límite, **días hábiles restantes**, avance y estado.
El Técnico de Soporte solo ve sus Direcciones asignadas.

### Completar un control

1. Abra el control con **Completar**. El formulario es un *stepper* por secciones construido
   desde el formato institucional (checklists con estados y mediciones, tablas dinámicas con
   **Agregar registro**, campos de fecha/hora/observación).
2. **Guardar avance** conserva el borrador; el avance se refleja en la lista.
3. Si el control exige **evidencia**, adjúntela en el paso «Evidencias».
4. En **Resumen y entrega** el sistema valida obligatorios, checklist completo, mínimos de
   tabla y evidencia; si falta algo lo enumera. **Entregar control** registra fecha y hora,
   marca «Entregado» o «Entregado tarde» según el plazo, genera el **documento formal** y
   deja constancia en trazabilidad.

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

Los equipos activos por Dirección/Unidad que alimentan F0422, el mantenimiento preventivo y
el análisis de vulnerabilidades. El panel **Eventos pendientes de Gestión de Equipos** simula
la integración: **Incorporar al inventario** aplica una entrega aceptada por el Usuario Final
y **Aplicar descargo** retira un equipo descargado. Todo queda en trazabilidad.

## 8. Generador de documentos

Catálogo de todo lo emitido: controles entregados, bitácoras, cartas y reportes. **Vista
previa** abre el documento en el visor institucional (hoja blanca, encabezado con logo,
secciones numeradas, firmas y pie con huella de integridad) con acciones de **Imprimir**
(sale solo la hoja), **Descargar documento**, **Ver firmas** y **Ver evidencias**. El
Encargado genera desde aquí el **reporte mensual consolidado** por Dirección o global.

## 9. Trazabilidad

Línea de tiempo auditada: control programado/iniciado/entregado/vencido/justificado, bitácoras
enviadas o vencidas, documentos generados y descargados, equipos agregados o descargados desde
Gestión de Equipos y cambios de responsable. Filtrable por dirección, mes y acción.

## 10. Administración

- **Usuarios y direcciones** (Administrador): roles del sistema y estructura organizacional;
  botón para restablecer la semilla de demostración.
- **Catálogo de controles** (Administrador edita, Encargado consulta): frecuencia, evidencia,
  firma, justificación y estado de cada control.
- **Distribución de soportes**: qué técnico responde por cada Dirección/Unidad; asignar y
  finalizar asignaciones. Una dirección sin soporte activo genera la alerta del panel.
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
