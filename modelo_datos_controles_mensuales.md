# Modelo de datos — SISGOST · Controles Mensuales

Modelo simulado del prototipo (JSON + `localStorage`). Las «tablas» son colecciones del
`DataService`; las claves foráneas son referencias por id. Los diagramas entidad-relación y
relacional están en `docs/plantuml/` (ver `diagramas_controles_mensuales.md`).

## Entidades

### DIRECCION
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `DIR-USU`, `DIR-SMI`… |
| nombre, corta | texto | Oficina Departamental de Usulután / `USU` |
| unidades | lista | RPRH, IGCN, DTI… |
| activa | bool | inactivas no generan controles |

**No es un rol del sistema**: es el dato organizacional al que pertenecen controles,
bitácoras, inventario y distribución.

### USUARIO_SISTEMA
| Campo | Tipo | Nota |
|---|---|---|
| usuario | PK | `jrivera` |
| nombre, iniciales, cargo | texto | |
| rol / clave | catálogo | `admin`, `enc-soporte`, `tec-soporte`, `jefatura` |

### DISTRIBUCION_SOPORTE
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `DIS-0001` |
| usuario | FK → USUARIO_SISTEMA | técnico responsable |
| direccion | FK → DIRECCION | |
| unidad | texto | o «Todas las unidades» |
| fechaInicio, estado, observaciones | | `Activa` / `Finalizada` |

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
| nombre, version, descripcion | texto | |
| frecuencia | catálogo | `Mensual, Semanal, Diaria, Eventual, Programado` |
| aplicaA | lista o «Todas» | direcciones donde corre |
| requiereEvidencia, requiereFirma, permiteJustificacion, activo | bool | |
| plantilla | SeccionPlantilla[] | el formulario digital |

`SeccionPlantilla` = título + campos tipados + ítems de checklist (estados propios y
medición opcional) + tabla dinámica (columnas y mínimo de filas).

### CONTROL_MES (instancia por período)
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `CTL-2026-0001` |
| codigo | FK → CONTROL_CATALOGO | |
| anio, mes, semana? | número | semana solo en controles semanales |
| direccion | FK → DIRECCION | unidad en texto |
| responsable | texto | del soporte asignado |
| estado | catálogo | `Programado, Pendiente, En proceso, En revisión, Entregado, Entregado tarde, Vencido, Justificado, Observado, Cerrado, No aplica` |
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
| inventario | PK | `2201-00-101-5890` |
| tipo, marca, modelo, serie, nombreEquipo | texto | |
| usuarioFinal, carne | texto | |
| direccion (FK), unidad | | |
| tecnicoConfiguracion, soporteResponsable | texto | |
| fechaAceptacion, expedienteUnico | | vínculo con Gestión de Equipos |
| estado | catálogo | `Activo en Dirección/Unidad, Descargado, En garantía, Pendiente de revisión, Reingresado a Hardware, No disponible` |
| garantia, ultimoControl? | texto | |

### EVENTO_INTEGRACION
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `EVI-0001` |
| tipo | catálogo | `Entrega aceptada` / `Descargo de equipo` |
| fecha, expedienteUnico | | |
| equipo | EQUIPO_OPERATIVO embebido | |
| aplicado | bool | cola simulada de Gestión de Equipos |

### DOCUMENTO_GENERADO
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `DOC-2026-0001` |
| tipo | catálogo | `Control mensual, Bitácora diaria, Justificación, Reporte mensual consolidado, Reporte por Dirección` |
| nombre, codigo, fecha, hora, generadoPor | | |
| direccion, mes, anio | | o «Todas» |
| hash | texto | huella de integridad simulada |
| estado | `Generado / Descargado` | |
| referencia | FK polimórfica | id del control, bitácora o carta origen |

### EVENTO_TRAZABILIDAD
| Campo | Tipo | Nota |
|---|---|---|
| id | PK | `TRZ-2026-0001` |
| fecha, hora, usuario, rol | | |
| direccion?, tipoControl?, mes?, anio? | | contexto |
| accion | texto | «Control entregado», «Bitácora enviada tarde», «Equipo agregado desde Gestión de Equipos»… |
| estadoAnterior?, estadoNuevo?, observacion?, documento? | | |

## Relaciones principales

```text
DIRECCION 1─N DISTRIBUCION_SOPORTE N─1 USUARIO_SISTEMA
DIRECCION 1─N CONTROL_MES N─1 CONTROL_CATALOGO
DIRECCION 1─N BITACORA_DIARIA
DIRECCION 1─N EQUIPO_OPERATIVO
CONTROL_MES 1─0..1 JUSTIFICACION
CONTROL_MES 1─0..1 DOCUMENTO_GENERADO   (igual bitácora y justificación)
EVENTO_INTEGRACION ─actualiza→ EQUIPO_OPERATIVO
(toda transición) ─registra→ EVENTO_TRAZABILIDAD
```
