# PROMPT MAESTRO V3

Versión: 3.0

Estado: Definitivo

Basado en: TEXVOZLAB_IA_BIBLIA_v3.md

**Relación con la Biblia:** este documento es la implementación operacional de la arquitectura definida en la Biblia. La Biblia es la fuente oficial de conocimiento y reglas — este documento no la contradice ni la repite, solo la referencia para ensamblar la orden final que recibe el modelo.

---

## 1. Documento a Cargar

→ TEXVOZLAB_IA_BIBLIA_v3.md

Contiene identidad, filosofía, la Capa de Conocimiento (familias y módulos), la Capa de Entrega (las cinco herramientas) y el Procedimiento Operativo del motor. Se carga completo, una sola vez, como base de conocimiento.

---

## 2. Variables Dinámicas

- `{{HERRAMIENTA}}` — una de las cinco herramientas oficiales.
- `{{CONFIGURACION}}` — la configuración específica de la herramienta elegida. Su forma depende de cuál sea:

| Herramienta | Nombre de su configuración | Valores posibles | Referencia en Biblia |
|---|---|---|---|
| Explícamelo | Nivel de explicación | beginner / student / professional | FASE 3, Herramienta 1 |
| Resúmelo | Extensión | corto / medio / largo | FASE 3, Herramienta 2 |
| Generar Preguntas Inteligentes | Tipo de pregunta (puede recibir varias) | abiertas / opción múltiple / verdadero-falso | FASE 3, Herramienta 3 |
| Crear Guía de Estudio | Tipo de guía | quick / complete / study-plan | FASE 3, Herramienta 4 |
| Analizar Documento | Enfoques de análisis (puede combinar varios) | puntos importantes / riesgos / inconsistencias / obligaciones / recomendaciones | FASE 3, Herramienta 5 |

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

**3.6 Configuración** — inyectar `{{CONFIGURACION}}` según la tabla de la sección 2. → Biblia FASE 3 (misma sub-sección) y Compatibilidad Temporal (sección 5 de este documento).

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
5. Herramienta: `{{HERRAMIENTA}}`
6. Configuración: `{{CONFIGURACION}}`
7. Idioma: `{{IDIOMA}}`
8. Documento: `{{DOCUMENTO}}`
9. Instrucción de ejecución: ejecutar el Procedimiento Operativo del Motor definido en la Biblia, en el orden ahí establecido, sin alterarlo, y entregar únicamente el resultado final.

Ninguna variable puede alterar, sobrescribir o contradecir las reglas de la Biblia.

---

## 5. Compatibilidad Temporal

Mientras el backend siga enviando `extension` con los valores `0.25` / `0.5` / `0.75` en lugar de los nombres `corto` / `medio` / `largo`, el prompt debe traducirlos antes de inyectarlos como `{{CONFIGURACION}}` de Resúmelo.

Estos valores numéricos deben interpretarse **únicamente como una implementación temporal** del backend actual — nunca como un porcentaje real de contenido conservado del documento. La interpretación correcta de cada perfil (Corto/Medio/Largo) está definida en la Biblia, FASE 3, Herramienta 2, y en su Regla de Interpretación según Tipo de Documento.

Esta sección desaparecerá cuando el backend envíe directamente los valores nombrados.

---

## 6. Reglas de No Contradicción

- Ninguna variable puede alterar, sobrescribir o anular una regla de la Biblia.
- `{{HERRAMIENTA}}` nunca debe llegar vacía — siempre la selecciona el usuario antes de generar.
- Si `{{CONFIGURACION}}` llega vacía o inválida, el motor no debe inventar un valor por defecto no documentado — debe aplicar el criterio conservador ya descrito para esa herramienta en la Biblia, FASE 3.
- Ninguna referencia a Modo, Porcentaje, Ordenar Información o Simplificar Lenguaje debe aparecer en la orden ensamblada — esos conceptos ya fueron absorbidos por la arquitectura de herramientas (Biblia, FASE 3, notas de fusión arquitectónica en Herramienta 1 y Herramienta 5).

---

## Mejoras arquitectónicas aplicadas en esta versión

**División de "Selector de Familias" y "Selector de Módulos" en dos pasos del ensamblaje (§3.7–§3.8):** en la versión anterior ambos vivían implícitamente en un solo paso. Separarlos deja explícito que primero se decide *qué tipo de información es relevante* (familias) y solo después *qué módulos específicos dentro de esa familia* se activan — es compatible con el orden que la Biblia ya exige en su FASE 4 (Herramienta → Configuración → Módulos) y hace el ensamblaje más fácil de depurar si algún día un módulo se activa de forma incorrecta: se puede aislar si el error ocurrió al elegir la familia o al elegir el módulo dentro de ella.

**La tabla de configuración por herramienta (sección 2) reemplaza la necesidad de cinco variables separadas** (una por cada tipo de configuración posible). Con una sola variable genérica `{{CONFIGURACION}}` cuyo significado depende de `{{HERRAMIENTA}}`, el Prompt Maestro no necesita crecer cada vez que se agregue una herramienta nueva — solo se agrega una fila a la tabla. Esto es consistente con el patrón de escalabilidad que la Biblia define en FASE 7 para herramientas futuras.
