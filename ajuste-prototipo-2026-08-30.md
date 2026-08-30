# Ajuste del prototipo — 30 de agosto de 2026

## Usuarios multirrol y estructura territorial Zona → Departamento → Dirección/Registro

Este ajuste toca los **dos** módulos del ecosistema (Controles Mensuales y Gestión de Equipos) y
cambia dos cosas de fondo: **el rol dejó de ser un texto y pasó a ser un arreglo**, y **la
organización dejó de ser una lista plana de Direcciones/Unidades y pasó a ser territorial**.

---

## 1. Un usuario puede tener varios roles

`UsuarioSistema.rol` era un texto; ahora hay `roles: RolSistema[]`. Una persona que es jefa del
área y además atiende sus propias oficinas es **un solo usuario con dos roles**: no se duplica la
cuenta ni se crea una por rol.

Los seis roles del ecosistema viven en `core/models/roles.ts` —el mismo archivo en los dos
proyectos—:

| Rol | Clave | Opera en Controles |
|---|---|---|
| `ADMINISTRADOR` | `admin` | Sí |
| `ENCARGADO_SOPORTE` | `enc-soporte` | Sí |
| `ENCARGADO_HARDWARE` | `enc-hardware` | No |
| `COORDINADOR` | `coordinador` | Sí |
| `TECNICO_SOPORTE` | `tec-soporte` | Sí |
| `TECNICO_HARDWARE` | `tec-hardware` | No |

Hardware **existe** en el directorio y el sistema lo reconoce, pero no atiende territorio: no
puede quedar como responsable de soporte. El Coordinador tampoco.

### Rol activo

Quien tiene más de un rol elige cuál usar en la sesión. El **rol activo** ordena el menú, el
panel, los filtros y las acciones a la vista; se cambia desde la barra superior **sin cerrar
sesión**. Los demás roles no se pierden: `AuthService.tieneRol()` sigue respondiendo por todos,
de modo que un Administrador que además es Técnico de Soporte entra a Administración y ve sus
asignaciones técnicas con la misma cuenta.

`usuario().clave` y `usuario().rol` reflejan **el rol activo**, así que todas las pantallas que ya
los leían siguen funcionando y pasan a responder al rol elegido.

### Administración → Usuarios y roles

El Administrador marca y desmarca roles por usuario, activa o desactiva la cuenta y deja
observación. Se aplican tres candados: nadie se quita a sí mismo el rol Administrador, el sistema
nunca queda sin Administrador activo, y no se puede quitar `TECNICO_SOPORTE` a quien tiene
responsabilidades vigentes en la distribución.

---

## 2. La organización es territorial

    Zona  →  Departamento  →  Dirección/Registro

Tres zonas, catorce departamentos y cuarenta Direcciones/Registros, en
`public/assets/data/territorio.json` —el mismo archivo en los dos proyectos—.

La estructura plana anterior no desapareció: `direcciones.json` sigue existiendo, pero ahora cada
entrada **es un departamento** y sus `unidades` son sus **Direcciones/Registros**. Por eso el
código que hablaba de «Dirección/Unidad» siguió compilando y solo cambió de significado.

### La regla de distribución

- En **San Salvador** la distribución es por **Dirección/Registro**: quien responde por el
  Registro de Comercio no responde por el IGCN.
- En **los demás departamentos** es por **Departamento**: quien responde por Santa Ana atiende
  sus cuatro Direcciones/Registros y no se le asigna ninguna una por una.

Qué departamento se lleva de una forma u otra **es dato del catálogo**
(`Departamento.porDireccion`), no una comparación contra el texto «San Salvador»: el día que otro
departamento crezca, la regla cambia en el JSON y no en el código.

La regla vive en un solo lugar —`SupportDistributionService.deDireccionUnidad()`—, y de ahí sale
todo lo demás: qué controles existen, quién los entrega, qué equipos cuentan y qué Técnicos de
Configuración ofrece Gestión de Equipos.

### IDs estables

Nada se compara por texto visible:

- Zona: `ZOC`, `ZCEN`, `ZOR`
- Departamento: `SS`, `STA`, `SON`, `SM`…
- Dirección/Registro: `SS-RC`, `STA-IGCN`, `SM-RPRH`…
- Ámbito: `SS::SS-RC` (por Dirección/Registro) · `STA::*` (departamento completo)

---

## 3. Qué cambió en Controles Mensuales

- **Nueva pantalla `/responsables` — Mapa de responsables de soporte.** Quién responde por cada
  Zona, Departamento y Dirección/Registro, con filtros por zona, departamento, Dirección/Registro,
  técnico y estado. Una fila departamental se expande para ver las Direcciones/Registros que
  cubre. El Administrador y el Encargado editan; el Técnico consulta lo suyo; el Coordinador
  consulta y filtra.
- **Distribución de soportes**: el formulario pide Zona → Departamento y solo pide
  Dirección/Registro donde la regla lo exige; donde no, lo explica en lugar de dejar el campo mudo.
- **Controles y bitácoras** se programan por ámbito: por Dirección/Registro en San Salvador y por
  Departamento completo en el resto.
- **KPIs y operatividad** admiten filtro por zona y muestran zona y tipo de asignación.
- **Inventario operativo** guarda `zonaId`, `departamentoId` y `direccionRegistroId`.

## 4. Qué cambió en Gestión de Equipos

- Las **solicitudes** registran Zona, Departamento y Dirección/Registro. Siguen pidiendo un CPU o
  una Laptop: nuevo/usado pertenece al equipo asignado, no al requerimiento.
- El **Técnico de Configuración** se filtra con la regla territorial. En Santa Ana / ISPI aparece
  el responsable de Santa Ana aunque no esté asignado al ISPI; en San Salvador / Registro de
  Comercio aparece solo quien responde por ese Registro.
- Si **no hay responsable**, se bloquea la creación del Expediente Único con el mensaje acordado y
  no se ofrece a nadie más como respaldo.
- La pantalla **Distribución de Soportes** pasó a ser de **consulta**: la distribución se
  administra en Controles Mensuales, que es su única fuente de escritura. Tener dos caminos de
  escritura sobre el mismo registro compartido reabría la desincronización que ese registro vino a
  cerrar.

## 5. Migración de datos

Las claves de estado subieron de versión (`sisgost.controles.v2`, `sisgost.datos.v2`) y el
contrato compartido también (`2026-08-30-territorio-zona-departamento-registro`). Una foto
anterior describe una organización que ya no existe: se **ignora** y el módulo vuelve a sembrar la
demostración. No se borra nada del navegador en silencio.

## 6. Trazabilidad

Eventos nuevos: rol agregado o quitado a usuario, permisos recalculados, cambio de rol activo,
intento de acceso denegado, catálogo territorial actualizado, responsable asignado por
Departamento o por Dirección/Registro, asignación territorial desactivada, ámbito sin responsable,
Gestión de Equipos leyó la distribución territorial, Técnico de Configuración filtrado por
Departamento o por Dirección/Registro, inventario operativo actualizado con
Zona/Departamento/Dirección, y consulta de la pantalla de responsables.

Todo evento guarda además el **rol activo** con el que se actuó y **todos los roles** del usuario:
con usuarios multirrol, saber quién actuó ya no basta para auditar.

## 7. Sincronización

Sigue sin haber ningún botón de sincronizar. Guardar es lo único que hace el usuario; los
controles, los perfiles de los técnicos, el inventario y Gestión de Equipos se recalculan solos.
