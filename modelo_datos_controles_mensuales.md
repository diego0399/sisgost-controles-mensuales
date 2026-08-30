# Modelo de datos — SISGOST · Controles Mensuales

Modelo simulado del prototipo (JSON + `localStorage`). Las «tablas» son colecciones del
`DataService`; las claves foráneas son referencias por id.

**Datos compartidos con SISGOST — Gestión de Equipos** (una sola verdad, sin duplicar):
USUARIO_SISTEMA, DIRECCION/UNIDAD, DISTRIBUCION_SOPORTE y los equipos. Las entidades marcadas
como *compartidas* existen igual en el otro módulo. Los diagramas entidad-relación y
relacional están en `docs/plantuml/` (ver `diagramas_controles_mensuales.md`).

## Entidades

### DIRECCION
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `SS`, `DIR-RPRH`… |
| nombre, corta | texto | Dirección de Registros / `REGS` — el mismo texto que usa Gestión de Equipos |
| unidades | lista | Registro de la Propiedad, Registro de Comercio, IGN, RPRH… |
| activa | bool | inactivas no generan controles |

**No es un rol del sistema**: es el dato organizacional al que pertenecen controles,
bitácoras, inventario y distribución.

### USUARIO_SISTEMA
| Campo | Tipo | Nota |
|---|---|---|
| usuario | PK | `wcarranza` — mismo identificador que en Gestión de Equipos |
| nombre, iniciales, cargo, unidad, estado | texto | |
| rol / clave | catálogo | `admin`, `enc-soporte` (jefe del área), `tec-soporte`, `coordinador` — **sin roles de Hardware** |
| moduloControles | bool | false = usuario del ecosistema que opera solo en Gestión de Equipos |

### DISTRIBUCION_SOPORTE
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `DIST-2026-0001` |
| **tecnicoId** | FK estable | `wendy-carranza` — slug del nombre; con él se compara, no con el texto |
| **direccionId** | FK estable | `SS` — id del catálogo organizacional |
| **unidadId** | FK estable | `SS::SS-RC` — la unidad cuelga de su Dirección |
| direccion, unidad | texto | Dirección/Registro atendida, para mostrar |
| tecnico | texto | «Nombre — Rol», resuelve a USUARIO_SISTEMA |
| asignadoPor, fecha, hora | | quién la registró · `fecha` es la **fecha de inicio**, que decide quien asigna |
| activo | bool | nunca se borra: se desactiva |
| desactivadaPor?, fechaDesactivacion?, motivoDesactivacion? | | historial de la baja; el motivo es obligatorio |
| observacion | texto | motivo de la asignación o de la baja |

**Compartida de verdad.** Se administra en Controles Mensuales, que la publica en
`sisgost_support_distribution` (con `…_updated_at` y `…_version`), y Gestión de Equipos la lee
de ahí para filtrar el Técnico de Configuración del expediente único. En la clave compartida cada
asignación viaja con **IDs y nombres** —`tecnicoId`/`tecnicoNombre`, `direccionId`/`direccionNombre`,
`unidadId`/`unidadNombre`, `activo`, `fechaInicio`, `observaciones`—, de modo que quien recibe no
tiene que volver a resolver ningún texto contra su catálogo.

Gobierna: asignación de controles y bitácoras, alcance del técnico, alerta de dirección sin
soporte.

### FERIADO
| Campo | Tipo | Nota |
|---|---|---|
| fecha | PK (con nombre) | ISO |
| nombre | texto | |
| ambito | catálogo | `Nacional` / `San Salvador` |

Catálogo **editable**; insumo del cálculo de días hábiles.

### CONTROL_CATALOGO
| Campo | Tipo | Nota |
|---|---|---|
| codigo | PK | `F0234`, `F0389`, `GLPI`… |
| plantilla[].equiposIp | bloque | Verificación de N equipos por su IP (F0387: 3) |
| plantilla[].checklistEquipos | bloque | Muestra de N equipos del inventario verificada ítem por ítem (F0382: 5) |
| plantilla[].datosControl | bandera | Paso de solo lectura con los datos del control programado |
| plantilla[].telefonos | bloque | Verificación de N teléfonos/extensiones con hora (F0387: 3) |
| plantilla[].ingresos | bloque | Bitácora de ingresos al cuarto de servidores (F0234): tipos de ingreso, motivos y tipos de personal |
| nombre, version, descripcion | texto | |
| frecuencia | catálogo | `Mensual, Semanal, Diaria, Eventual, Programado, Semanal con entrega mensual consolidada` |
| aplicacion | AplicacionControl | **dónde aplica el control** (editable); ver abajo |
| requiereEvidencia, requiereFirma, permiteJustificacion, activo | bool | |
| plantilla | SeccionPlantilla[] | el formulario digital |

`SeccionPlantilla` = título + campos tipados + ítems de checklist (estados propios y
medición opcional) + tabla dinámica (columnas y mínimo de filas).

`RespuestaIngreso` (un registro de la bitácora del F0234) = **`tipoIngreso`** (`Individual` o
`Con acompañante`, decide qué se exige) + fecha + hora de entrada y de salida + carné, nombre y
cargo del **Técnico de Soporte** que ingresa + su tipo de personal + acompañante con su carné, **su
propio tipo de personal** y **su cargo o institución** + `anexaDocumento` con `documentoNombre`
y `documentoImagen` (la imagen del respaldo, en *data URL*, reducida a 900 px) + motivo +
observación.

### APLICACION_CONTROL (dentro de CONTROL_CATALOGO)
| Campo | Tipo | Nota |
|---|---|---|
| modo | catálogo | `Todas las direcciones`, `Direcciones específicas`, `Unidades específicas`, `Área técnica específica` |
| direcciones | lista de ids | modo «Direcciones específicas» |
| unidades | lista de pares | modo «Unidades específicas» |
| area | FK → AREA_TECNICA | modo «Área técnica específica» |
| observaciones | texto | motivo institucional que se muestra en el catálogo |

No todos los controles se trabajan en todas las Direcciones/Registros: el calendario solo programa
un control en los pares que resultan de esta configuración, y los controles que revisan equipos
exigen además inventario operativo activo.

### AREA_TECNICA
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `AREA-CSOD`, `AREA-RESP`, `AREA-INFRA`, `AREA-SEG` |
| nombre, descripcion | texto | |
| pares | lista Dirección/Registro | dónde tiene presencia física el área |

### CONTROL_MES (instancia por período)
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `CTL-2026-0001` |
| codigo | FK → CONTROL_CATALOGO | |
| anio, mes, semana? | número | semana solo en controles semanales |
| direccion | FK → DIRECCION | unidad en texto |
| responsable | texto | del soporte asignado |
| estado | catálogo | `Programado, Pendiente, En proceso, Listo para entregar, En revisión, Entregado, Entregado tarde, Vencido, Justificado, Observado, Cerrado, No aplica` |
| fechaLimite | ISO | 3.er día hábil del mes siguiente (o viernes de la semana) |
| fechaEntrega?, horaEntrega? | | |
| avance | 0–100 | secciones con respuesta / secciones de la plantilla |
| secciones | RespuestaSeccion[] | espejo de la plantilla |
| evidencias | lista | nombre, descripción, fecha |
| documento? | FK → DOCUMENTO_GENERADO | al entregar |
| justificacion? | FK → JUSTIFICACION | al justificar |

### BITACORA_DIARIA
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `BIT-2026-0001` |
| fecha | ISO | una por día hábil y dirección |
| direccion | FK → DIRECCION | |
| responsable | texto | |
| estado | catálogo | `Pendiente, En edición, Enviada, Enviada tarde, Vencida, Observada, Cerrada` |
| horaEnvio? | HH:mm | límite institucional 17:00 |
| revision | RevisionAtencion[9] | equipo de atención al público |
| actividades | ActividadDia[] | hora, actividad, área, resultado, observaciones |
| documento? | FK → DOCUMENTO_GENERADO | al enviar |

`RevisionAtencion` = elemento + estado (`Funciona correctamente / Presenta falla / No aplica`)
y, si falla: descripción, acción realizada, estado final (`Resuelto / Pendiente / Escalado /
En observación`) y evidencia opcional.

### JUSTIFICACION
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `JUS-2026-0001` |
| codigoControl | FK → CONTROL_CATALOGO | |
| anio, mes, direccion, responsable | | |
| motivo, texto | texto | carta según `Formatos_nuevos_2025_.docx` |
| estado | catálogo | `Emitida / En revisión / Aceptada` |
| firmas | FirmaJustificacion[3] | técnico, Coordinador, jefatura |
| documento? | FK → DOCUMENTO_GENERADO | |

### EQUIPO_OPERATIVO (inventario)
| Campo | Tipo | Nota |
|---|---|---|
| ciclo | PK | ciclo operativo (`CIC-<inventario>-<expediente>`): un equipo puede tener varios a lo largo del tiempo |
| inventario | id de negocio | `2201-0871-2024` — el mismo número que en Gestión de Equipos |
| tipo, marca, modelo, serie, nombreEquipo | texto | |
| usuarioFinal, carne | texto | |
| direccion (FK), unidad | | |
| tecnicoConfiguracion, soporteResponsable | texto | |
| correoInstitucional | texto | del usuario final |
| fechaAceptacion, expediente, expedienteUnico | | vínculo con Gestión de Equipos |
| origen | texto | módulo del que proviene el registro |
| fechaDescargo?, motivoDescargo?, accionPosterior? | | solo tras el descargo |
| estado | catálogo | `Activo en Dirección/Registro, Descargado, En garantía, Pendiente de revisión, Reingresado a Hardware, No disponible, Histórico` |
| garantia, ultimoControl? | texto | |

### EVENTO_INTEGRACION
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `INT-2026-0001` |
| tipo | catálogo | `Entrega aceptada` / `Descargo de equipo` |
| aplicado | bool | lo pone la sincronización automática; un evento aplicado no se repite |
| fecha, expediente, expedienteUnico | | |
| moduloOrigen, moduloDestino | texto | Gestión de Equipos → Controles Mensuales |
| detalle | texto | qué ocurrió en el módulo origen |
| equipo | EQUIPO_OPERATIVO embebido | |
| aplicado | bool | cola simulada de Gestión de Equipos |

### DOCUMENTO_GENERADO
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `DOC-2026-0001` |
| tipo | catálogo | `Control mensual, Bitácora diaria, Justificación, Reporte mensual consolidado, Reporte por Dirección` |
| nombre, codigo, fecha, hora, generadoPor | | |
| direccion, unidad, mes, anio | | o «Todas» |
| hash | texto | huella de integridad simulada |
| estado | `Generado / Descargado` | |
| referencia | FK polimórfica | id del control, bitácora o carta origen |

### EVENTO_TRAZABILIDAD
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `TRZ-2026-0001` |
| fecha, hora, usuario, rol | | |
| direccion?, unidad?, tipoControl?, mes?, anio? | | contexto |
| accion | texto | «Control entregado», «Bitácora enviada tarde», «Equipo agregado al inventario operativo de Controles Mensuales»… |
| moduloOrigen?, moduloDestino?, inventario? | texto | eventos de integración entre módulos |
| equipo?, usuarioFinal?, expedienteUnico? | texto | contexto del equipo en los movimientos automáticos |
| tecnicoAfectado?, motivo? | texto | eventos de la distribución de soportes |
| estadoAnterior?, estadoNuevo?, observacion?, documento? | | |

## Indicadores derivados (no se almacenan)

`KpiDireccion` es un **cálculo**, no una tabla: `OperatividadService` lo deriva en cada consulta
de CONTROL_MES, BITACORA_DIARIA, EQUIPO_OPERATIVO, DOCUMENTO_GENERADO y DISTRIBUCION_SOPORTE para
un trío (Dirección, Unidad, período). En una implementación real sería una vista materializada o
un cálculo en consulta; guardarlo duplicaría un dato que cambia con cada entrega.

| Campo | Origen |
|---|---|
| aplicables, entregados, pendientes, vencidos, justificados | CONTROL_MES del período que aplican a la Dirección/Registro |
| bitácoras enviadas / tarde / pendientes / vencidas | BITACORA_DIARIA del período |
| equipos activos / con incidencia / descargados | EQUIPO_OPERATIVO y las respuestas de equipos de los controles |
| responsables | DISTRIBUCION_SOPORTE vigente |
| cumplimiento, operatividad, estado | fórmula documentada en el manual técnico |

## Relaciones principales

```text
DIRECCION 1─N DISTRIBUCION_SOPORTE N─1 USUARIO_SISTEMA
DIRECCION 1─N CONTROL_MES N─1 CONTROL_CATALOGO
DIRECCION 1─N BITACORA_DIARIA
DIRECCION 1─N EQUIPO_OPERATIVO
CONTROL_MES 1─0..1 JUSTIFICACION
CONTROL_MES 1─0..1 DOCUMENTO_GENERADO   (igual bitácora y justificación)
EQUIPO_OPERATIVO 1─N CONTROL_MES        (por RespuestaEquipo, dentro de las secciones)
EVENTO_INTEGRACION ─actualiza→ EQUIPO_OPERATIVO
DISTRIBUCION_SOPORTE ─determina→ responsable de CONTROL_MES, BITACORA_DIARIA y EQUIPO_OPERATIVO
DISTRIBUCION_SOPORTE ─determina→ Técnico de Configuración en SISGOST — Gestión de Equipos
(toda transición) ─registra→ EVENTO_TRAZABILIDAD
```

## Respuestas de equipos dentro de un control

```text
CONTROL_MES.secciones[] : RespuestaSeccion
  ├── campos[]   : { id, valor }
  ├── items[]    : { id, estado, medicion?, nota? }
  ├── filas[][]  : tabla dinámica
  └── equipos[]  : { inventario (FK → EQUIPO_OPERATIVO), incluido, estado,
                     verificaciones[], observacion }
```

La lista de equipos que un control puede responder **no se teclea**: es la de equipos activos de
su Dirección/Registro. `validarEntrega` rechaza cualquier inventario ajeno.
