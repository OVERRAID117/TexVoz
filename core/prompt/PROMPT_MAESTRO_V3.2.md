# PROMPT MAESTRO V3.2

Versión: 3.2

Estado: Definitivo

Basado en: TEXVOZLAB_IA_BIBLIA_v3.md (v3.1)

**Relación con la Biblia:** este documento es la implementación operacional de la arquitectura definida en la Biblia. La Biblia es la fuente oficial de conocimiento y reglas — este documento no la contradice ni la repite, solo la referencia para ensamblar la orden final que recibe el modelo.

---

## 1. Documento a Cargar

→ TEXVOZLAB_IA_BIBLIA_v3.md

Contiene identidad, filosofía, la Capa de Conocimiento (familias y módulos), la Capa de Entrega (las cinco herramientas) y el Procedimiento Operativo del motor. Se carga completo, una sola vez, como base de conocimiento.

---

## 2. Variables Dinámicas

- `{{HERRAMIENTA}}` — una de las cinco herramientas oficiales.
- `{{CONFIGURACION}}` — únicamente **Resúmelo** tiene configuración visible al usuario. Las demás herramientas la reciben vacía — el motor decide todo internamente:

| Herramienta | ¿Tiene configuración? | Valores posibles | Referencia en Biblia |
|---|---|---|---|
| Explícamelo | No — automática | — | FASE 3, Herramienta 1 |
| Resúmelo | **Sí** | corto / medio / largo | FASE 3, Herramienta 2 |
| Generar Preguntas Inteligentes | No — automática | — | FASE 3, Herramienta 3 |
| Crear Guía de Estudio | No — automática | — | FASE 3, Herramienta 4 |
| Analizar Documento | No — automática | — | FASE 3, Herramienta 5 |

- `{{IDIOMA}}` — opcional. Si llega vacío, el Detector Inteligente lo infiere directamente del documento (Biblia §2.1).
- `{{DOCUMENTO}}` — el contenido a analizar.

---

## 3. Procedimiento de Ensamblaje

El ensamblaje sigue el mismo orden que gobierna la ejecución del motor. Cada paso solo referencia su sección en la Biblia — ninguna regla se repite aquí.

**3.1 Rol** — inyectar la identidad del motor. → Biblia FASE 1, §6.

**3.2 Objetivo** — inyectar el propósito general del análisis. → Biblia FASE 1, §1 y §7.

**3.3 Reglas Universales** — inyectar los principios que gobiernan cualquier herramienta activa. → Biblia FASE 1, §3–§4; FASE 6, §6.2.

**3.4 Detector** — inyectar `{{DOCUMENTO}}` e `{{IDIOMA}}`. El motor identifica tipo, complejidad y naturaleza (técnica/legal vs narrativa/literaria) antes de continuar. → Biblia §2.1.

**3.5 Herramienta** — inyectar `{{HERRAMIENTA}}`. El motor confirma el objetivo fijo de esa herramienta. → Biblia FASE 3 (sub-sección correspondiente).

**3.6 Configuración** — inyectar `{{CONFIGURACION}}`. Solo tiene contenido cuando la herramienta es Resúmelo; en las demás llega vacía y el motor procede con su comportamiento automático. → Biblia FASE 3 (misma sub-sección) y Compatibilidad Temporal (sección 5 de este documento).

**3.7 Selector de Familias** — el motor determina qué familias son relevantes, combinando la afinidad natural de la herramienta con el tipo de documento detectado. → Biblia §2.2 y la sección "Familias que consulta" de la herramienta activa en FASE 3.

**3.8 Selector de Módulos** — el motor activa únicamente los módulos específicos necesarios dentro de esas familias. → Biblia §2.3.

**3.9 Redactor** — el motor construye la respuesta aplicando los principios de redacción, referencias de origen y limpieza visual. → Biblia §2.4, §2.4.1, §2.4.2.

**3.10 Autoevaluación** — el motor verifica la respuesta contra la lista oficial antes de entregarla. → Biblia §2.6.

**3.11 Respuesta** — se entrega el resultado final, sin variables internas ni metadatos del sistema.

---

## 4. Construcción de la Orden Final

La orden que recibe el modelo se ensambla concatenando, en este orden:

1. Rol (§3.1)
2. Objetivo (§3.2)
3. Reglas Universales (§3.3)
4. Contenido completo de TEXVOZLAB_IA_BIBLIA_v3.md, como base de conocimiento para el resto del procedimiento
5. Herramienta: `{{HERRAMIENTA_REAL}}`
6. Configuración: `{{CONFIGURACION_REAL}}`
7. Idioma: `{{IDIOMA_REAL}}`
8. Documento: `{{DOCUMENTO_REAL}}`
9. Instrucción de ejecución: ejecutar el Procedimiento Operativo del Motor definido en la Biblia, en el orden ahí establecido, sin alterarlo, y entregar únicamente el resultado final.

Ninguna variable puede alterar, sobrescribir o contradecir las reglas de la Biblia.

Las cuatro variables con sufijo `_REAL` de la lista anterior son los únicos placeholders operativos de este documento — cada una aparece exactamente una vez, únicamente en esta sección, y son las que `PromptBuilder` sustituye por los valores reales de la petición. Las variables sin ese sufijo, mencionadas en las secciones 2, 3, 5 y 6, son descriptivas: documentan el concepto para quien lee este archivo, pero no se sustituyen ni deben tratarse como puntos de inyección.

---

## 5. Compatibilidad Temporal

Mientras el backend siga enviando `extension` con los valores `0.25` / `0.5` / `0.75` en lugar de los nombres `corto` / `medio` / `largo`, el prompt debe traducirlos antes de inyectarlos como `{{CONFIGURACION}}` de Resúmelo.

Estos valores numéricos deben interpretarse **únicamente como una implementación temporal** del backend actual — nunca como un porcentaje real de contenido conservado del documento. La interpretación correcta de cada perfil (Corto/Medio/Largo) está definida en la Biblia, FASE 3, Herramienta 2, y en su Regla de Interpretación según Tipo de Documento.

Esta sección desaparecerá cuando el backend envíe directamente los valores nombrados.

---

## 6. Reglas de No Contradicción

- Ninguna variable puede alterar, sobrescribir o anular una regla de la Biblia.
- `{{HERRAMIENTA}}` nunca debe llegar vacía — siempre la selecciona el usuario antes de generar.
- `{{CONFIGURACION}}` llega vacía para Explícamelo, Generar Preguntas Inteligentes, Crear Guía de Estudio y Analizar Documento — esto es el estado esperado, no un error. El motor no debe inventar una configuración para estas herramientas ni pedirla al usuario; debe aplicar directamente el comportamiento automático descrito para cada una en la Biblia, FASE 3.
- Ninguna referencia a Modo, Porcentaje, Ordenar Información o Simplificar Lenguaje debe aparecer en la orden ensamblada — esos conceptos ya fueron absorbidos por la arquitectura de herramientas (Biblia, FASE 3, notas de fusión arquitectónica en Herramienta 1 y Herramienta 5).

---

## Mejoras arquitectónicas aplicadas por versión

### v3.2

**Separación de placeholders descriptivos y operativos para evitar sustituciones ambiguas y duplicación de tokens.** La sección 4 pasa a usar cuatro variables dedicadas y únicas, con sufijo `_REAL`, distintas de las menciones descriptivas del mismo nombre (sin ese sufijo) que ya existían en las secciones 2, 3, 5 y 6. Antes, `PromptBuilder` sustituía cada variable con `String.replace()` (una sola ocurrencia), lo que inyectaba el valor real en la primera mención descriptiva del documento en lugar de en la sección 4, y dejaba la fila oficial de ensamblado con placeholders sin resolver. Con el nuevo esquema, cada variable operativa aparece exactamente una vez, únicamente en la sección 4, lo que permite usar `replaceAll` de forma segura sin depender de la posición del texto, sin expresiones regulares dirigidas a una línea específica, y sin repetir el documento del usuario varias veces en el mismo prompt.

### v3.1

**División de "Selector de Familias" y "Selector de Módulos" en dos pasos del ensamblaje (§3.7–§3.8):** en la versión anterior ambos vivían implícitamente en un solo paso. Separarlos deja explícito que primero se decide *qué tipo de información es relevante* (familias) y solo después *qué módulos específicos dentro de esa familia* se activan — es compatible con el orden que la Biblia ya exige en su FASE 4 (Herramienta → Configuración → Módulos) y hace el ensamblaje más fácil de depurar si algún día un módulo se activa de forma incorrecta: se puede aislar si el error ocurrió al elegir la familia o al elegir el módulo dentro de ella.

**La tabla de configuración por herramienta (sección 2) reemplaza la necesidad de cinco variables separadas** (una por cada tipo de configuración posible). Con una sola variable genérica `{{CONFIGURACION}}` cuyo significado depende de `{{HERRAMIENTA}}`, el Prompt Maestro no necesita crecer cada vez que se agregue una herramienta nueva — solo se agrega una fila a la tabla. Esto es consistente con el patrón de escalabilidad que la Biblia define en FASE 7 para herramientas futuras.
