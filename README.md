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
ng serve        # http://localhost:4200
npm run build
```

Sin backend, sin base de datos, sin Firebase y sin API real: datos simulados en
`public/assets/data/*.json` y persistencia de sesión en `localStorage`
(clave `sisgost.controles.v1`; el catálogo de feriados usa `sisgost.controles.feriados.v1`).
El botón **Restablecer datos de demostración** (Administración) vuelve a la semilla.

## Usuarios de demostración

| Usuario | Rol | Alcance |
|---|---|---|
| `admin` | Administrador | Catálogos, feriados, usuarios y distribución |
| `cgonzalez` | Encargado de Soporte | Consulta todo, asigna responsables, revisa entregas |
| `jrivera` | Técnico de Soporte | Oficina Departamental de Usulután |
| `lmartinez` | Técnico de Soporte | Oficina Departamental de San Miguel |
| `kramirez` | Técnico de Soporte | Santa Ana y Oficina Central de San Salvador |
| `ymoreno` | Jefatura (consulta) | Solo visualización de reportes y estados |

La contraseña es libre (prototipo). **Dirección/Unidad no es un rol del sistema**: es el dato
organizacional al que pertenecen los controles.

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
- **Integración con Gestión de Equipos.** Una entrega aceptada por el Usuario Final incorpora
  el equipo al inventario operativo de su Dirección/Unidad; un descargo lo retira
  (`EquipmentIntegrationService`, eventos simulados).
- **Documentos formales.** Todo control entregado, bitácora enviada, carta y reporte
  consolidado se abre en un visor tipo PDF con encabezado institucional, secciones numeradas,
  firmas y pie de página; la impresión saca solo la hoja.

## Catálogo de controles modelado

Modelado desde la carpeta real `controles/`: F0234 (ingreso a cuartos de servidores),
F0389 (infraestructura del cuarto de servidores, **semanal**), F0382 (políticas de seguridad
TIC), F0384 (inventario de cintas), F0386 (traslado de cintas, eventual/justificable),
F0387 (sincronización de hora, **semanal**), F0422 (inventario de equipos), F0174
(mantenimiento preventivo), F0288 (correctivo, eventual/justificable), GLPI (tiquetes,
justificable), VULN (vulnerabilidades), F0206 (servidores), F0204 (TELCO) y SEGTIC
(verificación ISO/IEC 27001). Cada control define su **plantilla de formulario digital**
(secciones, campos, checklists y tablas) que el stepper de «Completar control» dibuja.

## Documentación

- `manual_usuario_controles_mensuales.md` — guía por pantalla para el personal.
- `manual_tecnico_controles_mensuales.md` — arquitectura, servicios y reglas.
- `modelo_datos_controles_mensuales.md` — entidades y relaciones del modelo simulado.
- `diagramas_controles_mensuales.md` — diagramas del sistema (fuentes PlantUML en `docs/plantuml/`).
