# DASHBOARD_v1 — Especificación técnica

Proyecto: TEXVOZLAB (VozEstudio en código/copy actual).
Alcance: Dashboard, Historial de documentos, base arquitectónica para Carpetas y Etiquetas.
Estado: **especificación, sin código implementado.**
Depende de: sistema de autenticación, planes y cuotas ya cerrado (`app/api/ia-explain/route.ts`, `lib/planUsage.ts`, `lib/supabaseAdmin.ts`, `lib/supabaseServer.ts`) — no se modifica en esta fase.

---

## 0. Resumen ejecutivo

El Dashboard actual (`app/dashboard/page.tsx`) es un Client Component funcional pero incompleto: ya lista, busca, filtra y ordena el historial real de `document_history`, pero lo hace descargando **todo el historial completo sin paginar**, incluyendo el texto completo de cada resultado, y su tarjeta de "Plan y consumo" es un placeholder estático sin conexión a datos reales. No existe borrado seguro (depende de una política RLS `DELETE` que **no existe**), no existe vista de texto original, y no hay ninguna preparación de esquema para Carpetas/Etiquetas.

Esta fase no reescribe el Dashboard: lo completa. La estrategia acordada es paginar el historial, separar metadatos (listado) de contenido pesado (detalle), exponer plan/consumo y borrado mediante dos rutas de servidor nuevas que reutilizan lo ya construido, y mantener la arquitectura de autenticación actual (sin `@supabase/ssr`) como decisión explícita de esta fase.

**RLS de `document_history` — verificado en producción con `pg_policies` (ya no es una suposición):**
- `SELECT`: existe, restringida a `auth.uid() = user_id`. Correcto, sin cambios necesarios.
- `INSERT`: existe, restringida a `auth.uid() = user_id`. (No la usa el flujo actual — el insert real lo hace el backend con el cliente admin en `recordUsage()` — pero está presente y correctamente acotada.)
- `DELETE`: **existen tres políticas duplicadas**, las tres restringidas al propietario. Funcionalmente no son inseguras (todas exigen `auth.uid() = user_id`), pero es deuda técnica de mantenimiento — deberían consolidarse en una sola política antes de construir la Fase F (borrado) sobre esta tabla, para no arrastrar la duplicación a la nueva ruta.
- `UPDATE`: **no existe ninguna política.** Esto confirma que el `update()` que `FileWizard.tsx` ejecuta hoy desde el navegador (para guardar `output_format`/`output_filename`/`result_text` al elegir formato de descarga) está siendo bloqueado por RLS en producción ahora mismo. Es un bug silencioso: la descarga funciona para el usuario (el blob ya se generó antes de la llamada a Supabase), pero la fila nunca queda actualizada — se pierde `output_format`, `output_filename` y la versión formateada de `result_text`. Esta corrección se gestiona como una tarea aparte, previa a la Fase A de este documento (mover el `update` a una ruta de servidor nueva, sin crear una política `UPDATE` para el cliente). No se detalla la solución aquí porque no es parte del alcance de Dashboard V1 — es una corrección al flujo de `FileWizard`/`ia-explain` ya cerrado.

---

## 1. Estado actual

### Páginas y componentes existentes
- `app/dashboard/layout.tsx` — Client Component. Resuelve sesión vía `supabase.auth.getSession()` + `onAuthStateChange()` (localStorage, sin cookies). Redirige a `/` si no hay sesión. Envuelve todo en `DashboardSessionProvider`.
- `app/dashboard/dashboard-session-context.tsx` — Context que expone la sesión ya resuelta (`useDashboardSession()`), no nulo por contrato.
- `app/dashboard/sidebar.tsx` — navegación por anchors (`#herramientas`, `#historial`, `#consumo`) dentro de la misma página `/dashboard`. "Configuración" y "Equipo" ya están reservados y deshabilitados ("Próximamente").
- `app/dashboard/header.tsx` — barra superior, nombre de usuario, logout, menú móvil.
- `app/dashboard/page.tsx` — Client Component único que concentra: bienvenida, tarjeta de plan (placeholder), `FileWizard`, tarjeta de consumo (placeholder), buscador+filtros+historial+modal de detalle+modal de confirmación de borrado.
- `app/components/FileWizard.tsx` — wizard de subida/generación, ya integrado con el sistema de cuotas (envía `fileName`, recibe `historyId`, hace `update` en vez de `insert`).

### Rutas utilizadas
- Página: `/dashboard` (única ruta del área autenticada; no hay `/dashboard/historial/[id]` ni rutas por documento).
- API: `/api/extract-text`, `/api/ia-explain`, `/api/generate-doc` (ya existentes, sin cambios en esta fase).

### Cómo se consulta `document_history` hoy
```ts
supabase.from('document_history')
  .select('id, file_name, mode, result_length, result_text, created_at, user_id, output_format, output_filename')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```
Se ejecuta una sola vez al montar `DashboardPage`, sin `.range()`/`.limit()`: trae el historial completo, incluyendo el `result_text` íntegro de cada fila (usado solo para un preview de 200 caracteres y para el filtro de búsqueda por contenido). **No selecciona `original_text` ni `page_count`** — esta última columna existe en la tabla (agregada en la fase de seguridad anterior) pero el `select` nunca se actualizó.

### Cómo se abre o descarga hoy un documento
- **Abrir**: modal cliente (`selectedItem`) que muestra `result_text`, `mode`, `result_length`, nombre y fecha. No muestra `original_text` (no hay UI para eso hoy).
- **Descargar**: no existe Supabase Storage en el proyecto (verificado: sin referencias a `storage.from`/`createSignedUrl` en todo `app/`). `downloadFromHistory()`:
  - Si `output_format`/`output_filename` existen → llama a `/api/generate-doc` con el `result_text` guardado, **regenerando el archivo al vuelo** (no descarga un binario almacenado).
  - Si no existen (filas antiguas, o filas de la combinación `action==='ambos'` que nunca pasaron por selección de formato) → arma un `.txt` en el navegador directamente desde `result_text`.
  - Conclusión: **nunca hay un archivo físico persistente**; todo se reconstruye desde el texto guardado en la fila. Este hecho debe tratarse como una regla arquitectónica permanente, no como un caso límite.
- **Eliminar**: `supabase.from('document_history').delete().eq('id', id)` — sin filtro `user_id` en la query, depende enteramente de RLS. Ver nota crítica en el resumen ejecutivo.

### Qué ya funciona
- Listado real, búsqueda y filtro y orden client-side sobre los datos ya cargados.
- Regeneración de descarga desde texto guardado (funciona para ambos casos: con y sin formato elegido).
- Sesión y protección de ruta a nivel de página (client-side).
- Callback `onSaved` desde `FileWizard` que antepone la fila nueva al historial sin re-consultar Supabase.

### Qué está incompleto
- Sin paginación (no escala).
- Tarjeta de plan/consumo 100% hardcodeada.
- Sin vista de texto original.
- `page_count` no se lee ni se muestra en ningún lado.
- Borrado sin ruta segura: la política `DELETE` sí existe (triplicada — tres políticas duplicadas, todas correctamente restringidas al propietario), así que el problema no es una política ausente. Lo pendiente es mover la eliminación a una ruta segura del servidor (ver sección 9) y, después, consolidar las tres políticas duplicadas en una sola.
- Sin ninguna preparación de esquema para carpetas/etiquetas.

### Qué debe conservarse
- El modelo de datos de `document_history` tal como está (con la corrección de qué columnas se seleccionan y cuándo).
- El patrón de autenticación actual (`supabase.auth.getSession()` client-side) — decisión explícita de esta fase, no se toca.
- La lógica de regeneración de descarga desde `result_text` vía `/api/generate-doc` — no se reinventa, se reutiliza también desde la vista de detalle.
- El patrón `checkAuth` + Bearer token ya usado por `ia-explain`, para las rutas nuevas.

### Qué debería reorganizarse
- El `select` de historial: separar en "metadatos para listado" vs. "contenido para detalle" (columnas distintas, momentos distintos).
- El tipo `HistoryRow` (hoy definido dentro de `FileWizard.tsx`, incompleto frente a la tabla real) debería vivir en un lugar compartido y dividirse en dos formas (resumen/detalle).
- La tarjeta de plan/consumo, de estático a conectado a una ruta real.
- El borrado, de directo-desde-cliente a ruta de servidor.

---

## 2. Objetivo de producto

Al entrar a `/dashboard`, el usuario ve primero: su nombre, el estado de su plan (ya no un texto fijo de "Sin plan activo" salvo que realmente no tenga uno), y el punto de entrada para subir un nuevo documento (`FileWizard`). Debajo, su historial reciente ya visible sin tener que buscar nada.

Para encontrar un documento anterior, usa el buscador (por nombre o herramienta) y los filtros (herramienta, fecha, formato); el orden por defecto es "más reciente primero". Al hacer clic en un documento, se abre su detalle: texto original, resultado generado, metadatos (fecha, páginas, herramienta, formato). Desde ahí puede volver a descargar — sabiendo, sin que se le diga explícitamente, que siempre obtiene una versión regenerada y actualizada del resultado, nunca un archivo "guardado" que pueda faltar.

El consumo del plan se entiende de un vistazo: documentos usados/disponibles y páginas usadas/disponibles del periodo actual, sin que el usuario tenga que interpretar números crudos de la base de datos.

---

## 3. Estructura de pantallas

Se mantiene **una sola página** (`/dashboard`), sin nuevas rutas, para no ampliar alcance ni duplicar el patrón de sesión client-side en más lugares de los necesarios. Dentro de ella:

1. **Dashboard principal** (ya existe) — bienvenida, tarjeta de plan, `FileWizard`, tarjeta de consumo, historial.
2. **Vista del historial** — sección dentro de la misma página, ahora paginada.
3. **Vista detallada de documento** — modal (evolución del modal actual), no una ruta nueva. Se abre bajo demanda y trae `original_text`/`result_text` en ese momento, no antes.
4. **Panel/tarjeta de consumo del plan** — ya existe visualmente, se conecta a datos reales.
5. **Buscador** — ya existe, se adapta para funcionar contra datos paginados.
6. **Filtros** — ya existen (parcialmente), se completan y se adaptan a paginación.
7. **Estados vacíos** — nuevo: "sin documentos", "sin resultados de búsqueda" (ya existe este último, se conserva).
8. **Estados de carga** — nuevo: esqueleto/skeleton para listado, para detalle, para consumo.
9. **Estados de error** — nuevo: error de carga de historial, error de carga de consumo, error de borrado.
10. **Confirmaciones/avisos** — ya existe el modal de confirmación de borrado; se conecta a la ruta segura nueva.

No se crea una ruta `/dashboard/historial/[id]` en V1 — es una posible mejora futura (deep-linking a un documento), no un requisito de esta fase.

---

## 4. Diseño del historial

### Información por tarjeta de documento
| Campo | Origen | Comportamiento con datos faltantes |
|---|---|---|
| Nombre del archivo | `file_name` | Siempre presente (columna usada desde el primer insert). |
| Herramienta utilizada | `mode` | Etiqueta ya guardada como texto (`explicar`/`resumir`/`preguntas`/`guia-estudio`/`analizar`/legado `ordenar`/`simplificar`). Mostrar con un mapa de emoji/label tolerante a valores desconocidos (ya existe este patrón: `MODE_EMOJI[item.mode] ?? '🧠'`). |
| Fecha | `created_at` | Siempre presente. |
| Número de páginas | `page_count` | **Nullable en filas antiguas** (antes de esta fase de seguridad). Mostrar `—` cuando sea `null`, nunca `0` ni un error. |
| Formato generado | `output_format` | Puede ser `null` (combo "ambos", o "ia" sin descarga aún). Mostrar como "Sin formato aún" o similar, no como error. |
| Estado de descarga | derivado | Bajo esta arquitectura (sin Storage), la descarga está disponible siempre que `result_text` no esté vacío — que, en la práctica, es siempre para filas creadas por `ia-explain`. No se modela como un estado real de "archivo disponible/no disponible" sino como "hay contenido para regenerar sí/no". |

### Acciones disponibles
- **Abrir** — siempre disponible.
- **Descargar** — disponible si `result_text` no está vacío (regenera vía `/api/generate-doc`, mismo mecanismo que hoy).
- **Eliminar** — disponible, pero debe pasar por la ruta segura de servidor (ver sección 9). No se implementa como policy RLS de `DELETE` para el cliente en esta fase (decisión explícita del usuario).
- **Renombrar** — no se implementa. Se deja como mejora futura; requeriría una columna editable (`file_name` ya lo es a nivel de esquema) y una ruta de actualización acotada — no se diseña más a fondo aquí.
- **Mover a carpeta** — no se implementa. Ver sección 13.
- **Añadir etiquetas** — no se implementa. Ver sección 13.

---

## 5. Búsqueda, filtros y orden

### Búsqueda
- **Por nombre de archivo**: filtro `ilike` sobre `file_name`, ejecutado en Supabase (compatible con paginación), no en el array cargado.
- **Por herramienta**: filtro exacto sobre `mode`, igual de simple.
- **Por contenido (`result_text`)**: si se implementa, debe ser un filtro `ilike`/`textSearch` ejecutado **en Supabase, sin incluir `result_text` en las columnas devueltas** — Postgres/PostgREST permiten filtrar por una columna sin seleccionarla en la respuesta. Esto es obligatorio para no romper la regla de "no descargar contenido pesado en el listado". Se marca como **candidato a Fase D, no obligatorio para el primer corte de listado paginado** (Fase B) — puede diferirse si la búsqueda por nombre/herramienta ya cubre el caso de uso principal.

### Filtros
- **Herramienta/modo** — filtro exacto server-side.
- **Rango de fechas** — filtro `gte`/`lte` sobre `created_at`, server-side.
- **Formato de salida** — filtro exacto sobre `output_format` (incluye poder filtrar explícitamente "sin formato", es decir `is('output_format', null)`), server-side.
- **Documentos con descarga disponible** — bajo la arquitectura actual esto es prácticamente siempre verdadero (ver tabla de la sección 4). Se documenta como filtro de baja prioridad/opcional para V1; no aporta valor real mientras todas las filas tengan `result_text`.

### Orden
- **Más recientes / más antiguos** — `created_at`, ya cubierto por el índice `idx_document_history_user_created (user_id, created_at)` creado en la fase de seguridad anterior.
- **Nombre** — `file_name`, orden alfabético server-side.
- **Mayor número de páginas** — `page_count`, con `nulls last` explícito (las filas antiguas sin página no deben aparecer primero al ordenar descendente).

### Qué va en frontend vs. Supabase
Con paginación, **todo lo anterior (búsqueda, filtros, orden) debe resolverse en la consulta a Supabase**, no en el array ya cargado — porque el array ya cargado es solo una página de resultados, no el historial completo. Esto es un cambio de comportamiento respecto a hoy (donde todo es client-side sobre el array completo) y es intencional.

---

## 6. Vista detallada de documento

### Datos mostrados
Nombre, fecha, modo, extensión/nivel (`result_length`), páginas (`page_count` o `—`), texto original, resultado, formato de salida, nombre del archivo generado, botón de descarga.

### Casos de borde
- **`result_text` vacío**: no debería ocurrir para filas creadas por `ia-explain` (el backend solo llama a `recordUsage` tras una generación exitosa con contenido) — pero si ocurriera (fila corrupta o legado), mostrar un aviso ("Este documento no tiene contenido generado") y deshabilitar el botón de descarga, sin romper la vista.
- **`output_format` inexistente (`null`)**: no es un error — significa "aún no se eligió formato de descarga". El botón de descarga debe, en ese caso, comportarse como hoy lo hace `downloadFromHistory` para filas legado: generar un `.txt` a partir de `result_text` directamente en el navegador (sin pasar por `/api/generate-doc`), o alternativamente ofrecer al usuario elegir un formato ahí mismo y entonces sí regenerar vía `/api/generate-doc` — **esto es una decisión de UX abierta**, ver sección "Decisiones abiertas" al final.
- **El archivo descargable "ya no está almacenado"**: este caso, tal como está planteada la pregunta original, no aplica — nunca hubo un archivo almacenado. Siempre se regenera desde `result_text`. La spec no debe modelar un estado de "archivo perdido", porque no existe tal concepto en esta arquitectura.
- **Qué se puede reconstruir desde `document_history`**: todo lo necesario para mostrar y volver a descargar un documento vive en la fila misma (`original_text`, `result_text`, `output_format`, `output_filename`, `mode`, `result_length`, `page_count`). No se depende de ningún dato externo.

### Origen de los datos del detalle
El detalle se obtiene con un `select` puntual por `id`, ejecutado **directamente desde el cliente** (no requiere una ruta de servidor nueva): la política RLS de `SELECT` ya existente (`auth.uid() = user_id`) protege correctamente este acceso — un usuario solo puede leer sus propias filas, sea cual sea la columna pedida. No hay necesidad de duplicar esta lectura detrás de una API propia.

---

## 7. Consumo y plan

### Qué muestra la tarjeta
Plan actual (nombre visible), documentos usados/disponibles, páginas usadas/disponibles, inicio y fin del periodo.

### Origen de los datos
**Ruta de servidor nueva** (p. ej. `GET /api/account/usage`), que:
- Verifica sesión con el mismo patrón `checkAuth` (Bearer token) ya usado en `ia-explain`.
- Reutiliza literalmente `getActiveSubscription` y `getPeriodUsage` de `lib/planUsage.ts` — sin duplicar la lógica de fechas (incluida la corrección del límite exclusivo de fin de periodo ya resuelta ahí) ni el acceso admin.
- Nunca expone `SUPABASE_SERVICE_ROLE_KEY` al cliente — se queda enteramente del lado del servidor, igual que hoy.
- El navegador **no calcula ni puede alterar** el consumo: solo recibe el resultado ya calculado.

**Por qué una ruta nueva y no una lectura RLS directa desde el cliente:** técnicamente, la política `SELECT` ya existente en `user_subscriptions` (`auth.uid() = user_id`) permitiría al cliente leer su propia suscripción directamente, y `plans` ya es de lectura pública. Pero el cálculo de "uso del periodo" depende de la misma lógica de ventana de fechas que ya se resolvió una vez (límite exclusivo de fin de periodo) — reutilizar `lib/planUsage.ts` desde una ruta de servidor evita mantener esa lógica en dos lugares. Es una decisión de mantenibilidad, no solo de seguridad.

### Forma de respuesta propuesta (sin implementar todavía)
- Si hay suscripción activa: plan, límites, uso actual, periodo.
- Si no hay suscripción activa: una respuesta clara de "sin plan activo" (no un error genérico), para que la tarjeta pueda mostrar el estado correspondiente (sección 12).

---

## 8. Arquitectura técnica

### Componentes nuevos
- `HistoryList` / `HistoryCard` (o `HistoryTable` en escritorio + `HistoryCard` en móvil, ver sección 11).
- `DocumentDetailModal` (evolución del modal actual, con texto original agregado).
- `UsageCard` (tarjeta de consumo conectada).
- `SearchBar`, `FiltersBar`.
- `EmptyState`, `LoadingState`, `ErrorState` (genéricos, reutilizables entre historial/detalle/consumo).

### Componentes actuales reutilizables
- El modal shell y el modal de confirmación de borrado ya existentes en `dashboard/page.tsx` (se adaptan, no se recrean desde cero).
- Estilos ya existentes en `dashboard.module.css`.
- El mecanismo `checkAuth` + Bearer token ya validado en producción vía `ia-explain`/`FileWizard`.

### Rutas de página
Ninguna nueva — todo sigue viviendo en `/dashboard`.

### Rutas API necesarias
- `GET /api/account/usage` — plan + consumo (nueva, sección 7).
- `DELETE /api/account/documents/[id]` (o `POST /api/account/documents/delete`, a decidir por convención del proyecto) — borrado seguro (nueva, sección 9).
- Listado y detalle de historial: **no requieren ruta nueva** — se consultan directo desde el cliente vía Supabase, protegidos por la política `SELECT` ya existente.

### Consultas a Supabase
- Listado: `select` acotado a metadatos + `.range()` + filtros + `.order()`.
- Detalle: `select('*')` (o columnas explícitas) por `id`, bajo demanda.
- Ambas ya cubiertas por RLS `SELECT` existente — sin cambios de política requeridos.

### Tipos TypeScript
Reemplazar el `HistoryRow` único y desactualizado (hoy en `FileWizard.tsx`) por dos formas explícitas, en un archivo compartido (p. ej. `lib/types/documentHistory.ts`):
```ts
type DocumentHistorySummary = {
  id: string
  file_name: string
  mode: string
  result_length: string
  page_count: number | null
  output_format: string | null
  output_filename: string | null
  created_at: string
}

type DocumentHistoryDetail = DocumentHistorySummary & {
  original_text: string
  result_text: string
}
```
Esto hace explícito, a nivel de tipos, que el listado nunca carga texto pesado.

### Separación cliente/servidor
Sin `@supabase/ssr` en esta fase (decisión explícita del usuario), **no hay Server Components autenticados reales en V1** — el árbol completo bajo `dashboard/layout.tsx` sigue siendo Client Component porque depende de sesión en `localStorage`, no en cookies. Esto no es un problema a resolver en esta fase, es una restricción aceptada.

Lo que sí se puede y debe hacer: escribir los componentes de presentación nuevos (`HistoryCard`, `UsageCard`, `EmptyState`, etc.) **sin hooks de cliente innecesarios propios** (sin su propio `useState`/`useEffect` si no lo necesitan, recibiendo datos por props) — no porque hoy se rendericen como Server Components (no pueden, están dentro de un árbol `'use client'`), sino para que una futura migración a `@supabase/ssr` + cookies (deuda técnica, fuera de esta fase) pueda convertir esos componentes concretos sin reescribirlos. Server Components autenticados **no son un requisito bloqueante de Dashboard V1**.

### Manejo de autenticación
Mismo patrón ya validado: el cliente adjunta `Authorization: Bearer <session.access_token>` a las dos rutas API nuevas, que lo verifican con `checkAuth` (ya existente en `lib/supabaseServer.ts`, sin modificarlo).

### Manejo de RLS
- `SELECT` en `document_history` y `user_subscriptions`: ya cubre listado y detalle del lado del cliente.
- Ninguna política nueva de `INSERT`/`UPDATE`/`DELETE` para el cliente en esta fase (decisión explícita).
- Todo lo que no sea lectura pasa por rutas de servidor con cliente admin + verificación explícita de propiedad (no solo RLS, defensa en profundidad).

### Manejo de errores
Mismo patrón ya aplicado en `ia-explain`: mensajes genéricos al navegador, detalle completo solo en `console.error` del servidor — aplicado igual a las dos rutas nuevas.

### Paginación
Tamaño de página propuesto: 20 documentos. `.range(from, to)` sobre la consulta ordenada, con un criterio de orden siempre determinista (agregar `id` como desempate cuando el campo de orden principal tenga valores repetidos, típicamente `created_at`) para evitar duplicados o saltos entre páginas.

---

## 9. Seguridad

- Un usuario solo puede ver sus propios documentos: cubierto por RLS `SELECT` existente (`auth.uid() = user_id`), aplicable a listado y detalle sin cambios.
- Las consultas dependen de RLS correctamente configurada para lectura — **no** para escritura, porque no hay política de escritura para el cliente en esta fase.
- `SUPABASE_SERVICE_ROLE_KEY` nunca en componentes cliente — se usa exclusivamente dentro de `lib/planUsage.ts`/`lib/supabaseAdmin.ts`, llamados solo desde las rutas API nuevas (mismo patrón ya establecido).
- No se confía en un `user_id` enviado por el navegador para ninguna operación sensible — las rutas nuevas obtienen el `userId` real desde `checkAuth` (token verificado), nunca del body de la request.
- No permitir modificar documentos ajenos: no aplica una regla nueva aquí porque **no hay modificación de documentos ajenos posible en absoluto en V1** — no hay `UPDATE` de contenido desde el Dashboard. Aparte de esta fase: `FileWizard.tsx` intenta hoy un `UPDATE` directo desde el navegador para guardar `output_format`/`output_filename` al elegir formato de descarga; no existe ninguna política `UPDATE` en `document_history`, por lo que ese flujo está bloqueado por RLS en producción ahora mismo. Se corregirá moviendo esa actualización a una ruta segura del servidor, como corrección previa, antes de continuar con la implementación del Dashboard.
- No exponer errores internos de Supabase: mismo patrón que `ia-explain` (mensaje genérico al cliente, detalle solo en logs de servidor).
- No crear inserciones duplicadas en `document_history`: no aplica ninguna inserción nueva en esta fase — el Dashboard V1 no inserta, solo lee y (mediante ruta segura) borra.

### Eliminación de documentos — diseño seguro
Dado que no existe (ni se va a crear) una política RLS de `DELETE` para el cliente:
1. El cliente llama a la ruta de servidor nueva enviando únicamente el `id` del documento (nunca el `user_id`).
2. La ruta verifica la sesión con `checkAuth` y obtiene el `userId` real del token.
3. La ruta usa el cliente admin (`lib/supabaseAdmin.ts`) para leer la fila por `id` y **comparar su `user_id` contra el `userId` autenticado** antes de borrar — si no coincide, `403`, sin borrar nada.
4. Solo si la propiedad se confirma explícitamente en el servidor, se ejecuta el `delete`.
5. Esto es intencionalmente redundante con RLS (que de todas formas bloquearía un `DELETE` de cliente por no tener política) — la verificación de propiedad vive en la ruta, no se delega únicamente a la base de datos.

**Prerrequisito antes de implementar esta ruta (Fase F) — ya verificado:** `pg_policies` confirmó que `DELETE` en `document_history` tiene **tres políticas duplicadas**, todas restringidas correctamente a `auth.uid() = user_id`. No bloquean el diseño de esta sección (todas son seguras), pero antes de construir la ruta de borrado de la Fase F debe dejarse **una sola política `DELETE`** — consolidar las tres en una evita ambigüedad futura y mantiene la tabla consistente con el resto del esquema (una política por operación, como ya es el caso de `SELECT` e `INSERT`). Esta limpieza de políticas duplicadas es un paso previo de la Fase F, no de esta especificación en sí (no se modifica Supabase al redactar este documento).

---

## 10. Rendimiento

- **Cantidad inicial de documentos**: 20 por página (ver sección 8), no todo el historial.
- **Paginación**: `.range()` server-side, no scroll infinito en V1 (más simple de implementar y de razonar; scroll infinito queda como mejora futura si el patrón de uso lo justifica).
- **Evitar descargar `original_text`/`result_text` en el listado**: resuelto por el `select` acotado a `DocumentHistorySummary` (sección 8).
- **Consultar textos largos solo al abrir el detalle**: resuelto por el `select('*')` puntual por `id` en la vista de detalle.
- **Índices**: `idx_document_history_user_created (user_id, created_at)` ya existe (fase anterior) y cubre el orden por defecto. Si el orden por `file_name` o `page_count` se vuelve frecuente, evaluar índices adicionales — no se crean en esta fase (solo se documenta la recomendación, sin tocar Supabase).
- **Evitar consultas repetidas**: cachear en estado de componente la página actual ya cargada; no re-consultar al reabrir un documento ya visto en la sesión (opcional, no crítico para V1).
- **Evitar renderizados innecesarios**: las tarjetas de historial deben recibir props estables (no recrear objetos/funciones inline en cada render del padre) — recomendación de implementación, no un requisito de diseño de datos.

---

## 11. Diseño responsive

- **Escritorio**: tabla o grid de tarjetas con más columnas visibles (nombre, herramienta, fecha, páginas, formato, acciones en línea).
- **Tablet**: grid de tarjetas de 2 columnas, misma información que escritorio pero sin tabla literal.
- **Móvil**: lista vertical de tarjetas (nunca tabla horizontal con scroll) — cada tarjeta apila nombre, herramienta+fecha, badges de páginas/formato, y acciones como botones de icono o menú contextual. Coincide con el patrón visual que `dashboard/page.tsx` ya usa hoy para las tarjetas de historial (se conserva y se adapta, no se rediseña desde cero).

---

## 12. Estados de interfaz

| Estado | Contenido/comportamiento |
|---|---|
| Sin documentos | Mensaje "Aún no has procesado ningún documento" + CTA hacia `FileWizard` (ya existe algo similar, se conserva). |
| Historial cargando | Skeleton de tarjetas (nuevo). |
| Error al cargar historial | Mensaje genérico + botón de reintentar (nuevo). |
| Documento no encontrado | Al abrir un detalle cuyo `id` ya no existe (borrado en otra pestaña, por ejemplo) — mensaje claro, cerrar el modal, refrescar listado. |
| Documento eliminado | Confirmación visual breve tras borrar + remoción inmediata de la tarjeta (optimista o tras respuesta de la ruta, a decidir en implementación). |
| Descarga no disponible | Solo si `result_text` está vacío (caso raro, sección 6) — botón deshabilitado con tooltip/mensaje explicativo. |
| Cuota casi agotada | Aviso visual en `UsageCard` (p. ej. barra de progreso en color de advertencia) cuando el uso se acerque al límite — umbral exacto a definir en implementación (ej. 80%). |
| Cuota agotada | Aviso claro en `UsageCard`; no bloquea la navegación del Dashboard, solo informa (el bloqueo real ya ocurre en `ia-explain`, `403`). |
| Plan sin suscripción activa | `UsageCard` muestra estado "Sin plan activo" con CTA hacia planes — reemplaza el texto hardcodeado actual por el mismo texto, pero ahora derivado de una respuesta real de `/api/account/usage`. |

---

## 13. Carpetas y etiquetas futuras

No se implementan en esta fase. Preparación arquitectónica exclusivamente a nivel de diseño (sin SQL, sin cambios en Supabase):

- **Carpetas**: modelo pensado como una tabla independiente (`folders` o similar) con relación de pertenencia opcional desde `document_history` (una columna `folder_id` nullable, agregable sin romper filas existentes — todas quedarían sin carpeta por defecto).
- **Etiquetas**: pensadas como relación muchos-a-muchos (una tabla de etiquetas + una tabla puente `document_tags`), no como columna en `document_history`, porque un documento podría tener varias etiquetas.
- **Movimiento de documentos**: una vez exista `folder_id`, "mover" es solo actualizar esa columna — requeriría su propia política de `UPDATE` acotada (no existe hoy, no se crea en esta fase) o, más consistente con la decisión de esta fase, una ruta de servidor dedicada.
- **Filtro por carpeta/etiqueta**: mismo patrón que los filtros ya diseñados en la sección 5 (server-side, compatible con paginación) — no requiere rediseñar el mecanismo de filtros, solo añadir un filtro más.

Lo único que se hace ahora, a nivel de tipos, es dejar espacio: `DocumentHistorySummary`/`DocumentHistoryDetail` pueden anticipar (comentado o como campo opcional no usado) un futuro `folder_id`/`tags`, sin que la ausencia actual de esas columnas en la base de datos genere ningún error.

---

## 14. Fases de implementación

### Fase A — Tipos y consulta básica paginada — ✅ Completada
**Objetivo**: introducir `DocumentHistorySummary`/`DocumentHistoryDetail` y una función de fetch paginado (metadatos únicamente), sin cambiar todavía la UI visible.
**Archivos probables**: nuevo archivo de tipos compartido; función de fetch nueva (junto a `dashboard/page.tsx` o en un helper propio).
**Riesgos**: bajo — no cambia comportamiento visible.
**Prueba manual**: confirmar en consola/logs que la consulta trae solo metadatos y respeta `.range()`.
**Criterio de aceptación**: `tsc`/`next build` sin errores; la función nueva coexiste con la actual sin reemplazarla todavía.

**Resumen de lo implementado y verificado:** se creó `lib/documentHistory.ts` con `DocumentHistorySummary`, `DocumentHistoryDetail`, `PaginatedResult<T>`, `HISTORY_PAGE_SIZE` (20) y `fetchDocumentHistoryPage()` — `page`/`pageSize` normalizados (entero, mínimo 1, `pageSize` acotado a 100), `.range()` + `count: "exact"`, filtro explícito por `user_id`, orden `created_at` descendente, sin `original_text`/`result_text` en el select. No se conectó a `page.tsx` en esta fase. `tsc --noEmit` y `next build` con exit code 0.

### Fase B — Listado del historial paginado — ✅ Completada
**Objetivo**: reemplazar el fetch actual por el paginado; tarjetas muestran `page_count` con fallback `—`.
**Archivos probables**: `app/dashboard/page.tsx`, posible `HistoryCard` nuevo.
**Riesgos**: cambiar el fetch podría romper el callback `onSaved` (inserción optimista de `FileWizard` al historial) si no se concilia con la paginación — revisar cómo conviven "documento recién creado" y "página 1 ya cargada".
**Prueba manual**: generar un documento nuevo y confirmar que aparece sin duplicarse ni desordenar la paginación; navegar entre páginas.
**Criterio de aceptación**: historial visible, paginado, sin cargar texto pesado (verificable inspeccionando la respuesta de red).

**Resumen de lo implementado y verificado:** `page.tsx` usa `fetchDocumentHistoryPage()` (20/página), con estado `page`/`total`/`totalPages` y botones Anterior/Siguiente deshabilitados en los extremos y durante carga. Tarjetas sin preview de contenido, con badge de páginas (`page_count ?? '—'`). Búsqueda y filtros (nombre, modo, longitud, formato) se retiraron por completo — quedan para la Fase D. `handleNewHistoryItem` recarga `loadPage(1)` en vez de construir un resumen manual, evitando desincronizar `page_count`/`total`. Estados de carga, vacío y error añadidos. `handleDelete` sin modificar (riesgo documentado: `total`/`totalPages` puede quedar desalineado tras borrar, hasta la siguiente carga). `tsc --noEmit` y `next build` con exit code 0.

### Fase C — Vista detallada — ✅ Completada
**Objetivo**: al abrir un documento, fetch puntual de `original_text`+`result_text` por `id`; modal ampliado con texto original.
**Archivos probables**: `app/dashboard/page.tsx` (o `DocumentDetailModal` extraído).
**Riesgos**: manejar el estado de carga del detalle sin bloquear el resto de la página.
**Prueba manual**: abrir varios documentos distintos, confirmar que cada uno trae su propio texto y no el de otro (validación manual de que el filtro por `id` funciona).
**Criterio de aceptación**: texto original visible; descarga sigue funcionando igual que hoy desde el detalle.

**Resumen de lo implementado y verificado:** se agregó `fetchDocumentHistoryDetail()` en `lib/documentHistory.ts` (tipo `DocumentHistoryDetailResult` con `'ok' | 'not_found' | 'error'`), consultado bajo demanda desde el modal — `original_text`/`result_text`/`output_format`/`output_filename` nunca se cargan en el listado. El modal (se mantuvo, sin ruta nueva) muestra nombre, fecha, modo, longitud, páginas, formato, archivo generado, texto original y resultado; el header queda oculto hasta que el detalle está listo, el botón ✕ siempre visible. Estados `loading`/`error`/`not_found` visibles dentro del modal (con reintento en `error`); `original_text`/`result_text` vacíos muestran mensaje en vez de bloque en blanco. Descarga (TXT/DOCX/PDF vía `/api/generate-doc`, fallback TXT, sin Storage) reutiliza el mismo detalle ya cargado, deshabilitada si no hay `result_text`. Protegido por RLS `SELECT` + filtro explícito `id`+`user_id`, sin cliente admin. `tsc --noEmit` y `next build` con exit code 0.

### Fase D — Búsqueda, filtros y orden server-side — ✅ Completada
**Objetivo**: mover búsqueda/filtro/orden de client-side (array completo) a consultas Supabase compatibles con paginación.
**Archivos probables**: `app/dashboard/page.tsx`.
**Riesgos**: mayor complejidad de estado (query params/estado combinando página+búsqueda+filtros+orden); posible regresión de UX si la búsqueda por contenido no se acota bien (ver sección 5).
**Prueba manual**: combinar búsqueda + filtro + orden simultáneamente y confirmar resultados correctos y paginación coherente.
**Criterio de aceptación**: todos los criterios de la sección 5 funcionan contra Supabase, no contra un array en memoria.

**Resumen de lo implementado y verificado:** `fetchDocumentHistoryPage()` (`lib/documentHistory.ts`) acepta un 4º parámetro `DocumentHistoryQuery` (búsqueda, `mode`, `resultLength`, `outputFormat`, `downloadableOnly`, `sort`) y aplica todo server-side, antes de `.range()` — nunca sobre un array en memoria. La búsqueda usa `.or()` sobre `file_name` y `output_filename`; se verificó manualmente con nombres reales y palabras clave. Los casos con caracteres especiales completos no quedaron confirmados uno por uno y deben considerarse prueba pendiente si se requieren coincidencias literales exactas. `original_text`/`result_text` quedan fuera de la búsqueda y del listado, según lo acordado para esta fase. Filtros por modo, longitud y formato (incluye "sin formato"), "solo descargables", y orden por fecha/nombre/páginas (`page_count` nulo siempre al final) quedaron implementados; no se verificaron todos exhaustivamente en combinación. `tsc --noEmit` y `next build` pasaron con exit code 0. El historial cargó correctamente en la app real, y la búsqueda por nombre/palabras clave funcionó en la app real. La columna `page_count` fue agregada en Supabase; los documentos históricos muestran `null`/`—`. Queda pendiente confirmar con una generación nueva que el backend guarde el conteo real. Búsqueda dentro de `original_text`/`result_text` permanece fuera de alcance (candidata a una fase futura, no planificada aún).

### Fase E — Tarjeta de consumo real
**Objetivo**: nueva ruta `GET /api/account/usage`; conectar `UsageCard` reemplazando el hardcode.
**Archivos probables**: nueva ruta API; `app/dashboard/page.tsx` o `UsageCard` nuevo.
**Riesgos**: mismos riesgos ya mitigados en `ia-explain` (fallo de Supabase debe mostrarse como error, no como "0 usado").
**Prueba manual**: verificar con un usuario con plan activo y (si es posible) uno sin plan, que ambos estados se muestren correctamente.
**Criterio de aceptación**: consumo real visible; ninguna lógica de cálculo vive en el cliente.

### Fase F — Eliminación segura de documentos
**Objetivo**: nueva ruta de borrado con verificación explícita de propiedad; reemplaza el `delete` directo del cliente.
**Archivos probables**: nueva ruta API; `app/dashboard/page.tsx` (conectar el modal de confirmación ya existente).
**Riesgos**: **bloqueado hasta confirmar con `pg_policies` el estado real de RLS en `document_history`** (sección 9) — si ya existe una política de `DELETE` distinta a la documentada aquí, el diseño de esta fase debe revisarse antes de implementar.
**Prueba manual**: intentar borrar un documento ajeno manipulando el `id` en la request (debe fallar con `403`); borrar un documento propio (debe funcionar).
**Criterio de aceptación**: ningún usuario puede borrar documentos ajenos, verificado explícitamente, no solo asumido por RLS.

### Fase G — Responsive, estados y pulido
**Objetivo**: completar todos los estados de la sección 12; verificar diseño en escritorio/tablet/móvil.
**Archivos probables**: `app/dashboard/page.tsx`, `dashboard.module.css`, componentes de estado nuevos.
**Riesgos**: bajo, principalmente de consistencia visual.
**Prueba manual**: recorrer cada estado de la tabla de la sección 12 provocándolo deliberadamente (vaciar historial de prueba, desconectar red, etc.).
**Criterio de aceptación**: ningún estado queda en blanco o roto visualmente; funciona en móvil sin tablas horizontales.

### Fase H — Preparación para carpetas y etiquetas
**Objetivo**: dejar los tipos compartidos con espacio para `folder_id`/`tags` sin implementarlos.
**Archivos probables**: archivo de tipos compartido (de la Fase A).
**Riesgos**: ninguno si se limita estrictamente a tipos, sin tocar Supabase.
**Prueba manual**: `tsc`/`next build` sin errores tras el cambio de tipos.
**Criterio de aceptación**: ninguna funcionalidad nueva visible; solo preparación.

---

## 15. Lista estimada de archivos

### Archivos existentes que probablemente se modificarán
- `app/dashboard/page.tsx` (el más afectado por lejos)
- `app/dashboard/dashboard.module.css`
- `app/dashboard/dashboardLayout.module.css` (posibles ajustes responsive menores)
- `app/components/FileWizard.tsx` (solo si se decide mover `HistoryRow`/tipos compartidos fuera de este archivo — a confirmar en Fase A, hoy exporta `HistoryRow` que consume `dashboard/page.tsx`)

### Archivos nuevos que probablemente se crearán
- Tipos compartidos de historial (ubicación a definir, p. ej. `lib/types/documentHistory.ts`)
- `app/api/account/usage/route.ts`
- `app/api/account/documents/[id]/route.ts` (o convención equivalente para borrado)
- Componentes de presentación: `HistoryCard`, `UsageCard`, `EmptyState`, `LoadingState`, `ErrorState`, `DocumentDetailModal` (nombres y ubicación exacta a definir en Fase B/C, probablemente bajo `app/dashboard/`)

### Archivos que no deberían tocarse
- `app/api/ia-explain/route.ts`
- `lib/planUsage.ts` (se **reutiliza**, no se modifica)
- `lib/supabaseAdmin.ts`, `lib/supabaseServer.ts`
- `app/components/FileWizard/*Options.tsx`
- `app/api/tts/route.ts`, `app/api/voices/route.ts`, `app/api/extract-text/route.ts`, `app/api/generate-doc/route.ts`
- Todo `app/checkout/*`

---

## 16. Criterios finales de aceptación

Dashboard V1 se considera terminado cuando:
- El usuario puede consultar su historial paginado.
- Puede buscar y filtrar (mínimo: por nombre y por herramienta, server-side).
- Puede abrir un documento y ver su detalle completo.
- Puede revisar tanto el texto original como el resultado.
- Puede volver a descargar el resultado (regenerado desde `result_text`).
- Puede consultar su consumo real de plan (documentos y páginas, periodo actual).
- Ningún usuario puede acceder a documentos ajenos (verificado explícitamente para lectura vía RLS y para borrado vía verificación server-side).
- No existen inserciones duplicadas en `document_history` (no aplica ninguna inserción nueva en esta fase, por lo que este criterio se cumple por diseño).
- Funciona en móvil (tarjetas apiladas) y escritorio (tabla/grid), sin tablas horizontales imposibles en móvil.
- `tsc --noEmit` sin errores.
- `next build` termina correctamente.

---

## Fuera de alcance (recordatorio)

No forma parte de esta fase: comparar documentos, motor IA V3, Mercado Pago, webhooks, facturación, panel de administración, equipos/multiusuario, colaboración en tiempo real, compartir documentos públicamente, carpetas y etiquetas *funcionales*, cambios al Prompt Maestro, cambios al procesamiento de DeepSeek, cambios al sistema de cuotas ya cerrado.

---

## Decisiones abiertas (no bloquean la especificación, sí bloquean partes de la implementación)

1. **RLS real de `document_history`** — pendiente de tu verificación con `pg_policies`. Bloquea específicamente la Fase F (borrado) y debería revisarse también por su posible impacto en el `UPDATE` que `FileWizard.tsx` ya ejecuta hoy en producción.
2. **Comportamiento de descarga cuando `output_format` es `null` en la vista de detalle** (sección 6): ¿generar `.txt` automáticamente, igual que hoy en el listado, o pedir al usuario que elija formato ahí mismo? No es necesario resolverlo ahora; se puede decidir al implementar la Fase C.
3. **Nombre y convención exacta de la ruta de borrado** (`DELETE /api/account/documents/[id]` vs. `POST /api/account/documents/delete` vs. otra) — cualquiera es válida, se deja para el momento de implementar la Fase F.
4. **Umbral exacto de "cuota casi agotada"** (sección 12) — propuesto 80%, ajustable sin impacto arquitectónico.
