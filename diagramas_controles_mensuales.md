# Diagramas — SISGOST · Controles Mensuales

Las fuentes PlantUML están en `docs/plantuml/`. Se renderizan con cualquier visor PlantUML
(extensión de VS Code, `plantuml.jar` o el servidor público):

```bash
java -jar plantuml.jar -charset UTF-8 -tpng docs/plantuml/*.puml
```

Los mismos diagramas, ya renderizados y con su explicación extensa, están en
`../entregables-controles-mensuales/` (`diagramas_controles_mensuales/` y
`explicacion_diagramas_controles_mensuales.md`), junto con el manual de usuario en Word y en
PowerPoint y la presentación final del ecosistema.

| Diagrama | Archivo | Qué muestra |
|---|---|---|
| Casos de uso | `docs/plantuml/casos-de-uso.puml` | Los cuatro roles —Administrador, Encargado de Soporte, Técnico de Soporte y Coordinador— más Gestión de Equipos como actor de sistema, y los 27 casos de uso, con un bloque aparte para los tres que **ocurren solos**. |
| Actividades | `docs/plantuml/actividades.puml` | El ciclo completo del período en cuatro calles: lo que hace el sistema, lo que hace el técnico, lo que revisa el Encargado y lo que consulta el Coordinador. |
| Actividades — control | `docs/plantuml/actividades-control.puml` | Detalle del ciclo de vida de un control: programación con plazo hábil, completado, entrega a tiempo o tarde, justificación, revisión y vencimiento. |
| Actividades — bitácora | `docs/plantuml/actividades-bitacora.puml` | Detalle de la bitácora diaria: revisión obligatoria de atención al público, tratamiento de fallas y el corte de las 5:00 p. m. |
| Componentes | `docs/plantuml/componentes.puml` | Pantallas lazy, componentes compartidos, servicios de negocio y las claves de almacenamiento; la cadena `Holiday → BusinessDay → Deadline → Data` y los dos servicios compartidos con Gestión de Equipos. |
| Arquitectura | `docs/plantuml/arquitectura.puml` | Los dos orígenes del navegador (4300 y 4200), sus almacenamientos separados y las **páginas puente** que hacen cruzar la distribución y el inventario. |
| Entidad-relación | `docs/plantuml/entidad-relacion.puml` | Las entidades del dominio con sus IDs estables, el ciclo del equipo operativo y los campos de trazabilidad. |
| Modelo relacional | `docs/plantuml/modelo-relacional.puml` | Propuesta de tablas para una implementación real: normaliza semanas, equipos revisados, ítems del F0382, ingresos del F0234 y verificaciones por IP; `jsonb` solo para la plantilla. |
| Trazabilidad y flujo integral | `docs/plantuml/trazabilidad.puml` | Secuencia completa del ecosistema y en qué momento se escribe cada evento de trazabilidad. |
| **Integración entre módulos** | `docs/plantuml/integracion-modulos.puml` | Qué comparten los dos módulos y en qué sentido viaja cada dato: la distribución hacia Gestión de Equipos, el inventario hacia acá. |
| Operatividad y KPIs | `docs/plantuml/operatividad.puml` | Qué entra en el cálculo, la fórmula, el semáforo institucional y las pantallas que lo consumen. |
| Pandora | `docs/plantuml/pandora.puml` | Cómo apoyaría Pandora al inventario técnico **sin reemplazar** a SISGOST. |

## Resumen de la conexión entre módulos

```text
SISGOST — Gestión de Equipos                SISGOST — Controles Mensuales
────────────────────────────                ──────────────────────────────
Conformidad aceptada por el          ───►   Equipo activo en la Dirección/Registro
Usuario Final                               (crece el inventario operativo y alimenta
                                             F0422 · F0174 · F0288 · VULN · F0382 · F0387)

Descargo del equipo                  ───►   El equipo sale del inventario activo
                                            (estado «Descargado»; el ciclo queda «Histórico»)

Técnico de Configuración elegible    ◄───   Distribución de soportes
en el expediente único                      (se administra en este módulo)

Usuarios, roles, Direcciones/Registros ◄──►  Los mismos registros, sin duplicar
```

El transporte son dos claves de `localStorage` —`sisgost_support_distribution` y
`sisgost_operational_inventory`—, cada una escrita **solo** por su módulo dueño. Como
`localStorage` está aislado por origen y el puerto forma parte del origen, cada módulo publica
además una página puente en su propio origen (`puente-distribucion.html` y `puente-inventario.html`)
que el otro carga en un iframe oculto y consulta por `postMessage`.

No hay ningún botón de sincronizar: los movimientos entre módulos quedan en **Trazabilidad** con
módulo origen y destino, y la lógica de cada módulo no se duplica en el otro.
