# Diagramas — SISGOST · Controles Mensuales

Las fuentes PlantUML están en `docs/plantuml/`. Se renderizan con cualquier visor PlantUML
(extensión de VS Code, `plantuml.jar` o el servidor público).

| Diagrama | Archivo | Qué muestra |
|---|---|---|
| Casos de uso | `docs/plantuml/casos-de-uso.puml` | Los cuatro roles (más Gestión de Equipos como actor de sistema) y los 19 casos de uso del módulo. |
| **Integración entre módulos** | `docs/plantuml/integracion-modulos.puml` | Qué datos comparten los dos módulos, cómo la distribución de soportes filtra el Técnico de Configuración en Gestión de Equipos y cómo el equipo aceptado llega al inventario operativo. |
| Actividades — control | `docs/plantuml/actividades-control.puml` | El ciclo de vida completo de un control: programación con plazo hábil, completado, entrega a tiempo/tarde, justificación, revisión del Encargado y vencimiento. |
| Actividades — bitácora | `docs/plantuml/actividades-bitacora.puml` | La bitácora diaria: revisión obligatoria de atención al público, tratamiento de fallas y el corte de las 5:00 p. m. |
| Componentes | `docs/plantuml/componentes.puml` | Pantallas lazy, componentes compartidos (visor y armador de documentos) y la cadena de servicios `Holiday → BusinessDay → Deadline → Data`. |
| Arquitectura | `docs/plantuml/arquitectura.puml` | El prototipo en el navegador (Angular 21 zoneless), su persistencia local y la integración simulada con Gestión de Equipos. |
| Entidad-relación | `docs/plantuml/entidad-relacion.puml` | Las once entidades del dominio y sus relaciones (control ↔ justificación ↔ documento, integración ↔ inventario). |
| Modelo relacional | `docs/plantuml/modelo-relacional.puml` | Propuesta de tablas para una implementación real (normaliza unidades, revisiones y firmas; JSONB para plantillas y respuestas). |

## Resumen de la conexión entre módulos

```text
SISGOST — Gestión de Equipos                SISGOST — Controles Mensuales
────────────────────────────                ──────────────────────────────
Entrega aceptada por Usuario Final   ───►   Equipo activo en Dirección/Unidad
                                            (crece el inventario operativo,
                                             alimenta F0422 / F0174 / F0288 / VULN)

Descargo del equipo                  ───►   Equipo sale del inventario activo
                                            (estado «Descargado»)

Técnico de Configuración elegible    ◄───   Distribución de soportes
en el expediente único                      (se administra en este módulo)

Usuarios, roles, Direcciones/Unidades ◄──►  Mismos registros, sin duplicar
```

Los movimientos de equipos llegan como eventos (`EquipmentIntegrationService`) y quedan en
trazabilidad con módulo origen y destino; la lógica de Gestión de Equipos no se duplica aquí.
La distribución de soportes es un **registro único** que los dos módulos leen a través del
mismo `SupportDistributionService`.
