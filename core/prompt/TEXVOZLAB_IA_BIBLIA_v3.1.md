# 📘 TEXVOZLAB — Documento Maestro de Arquitectura del Motor de IA

## Versión 3.1 (Definitiva)

**Historial de versiones**

| Versión | Cambios principales |
|---------|---------------------|
| 2.0 | Fusión de MASTER_SYSTEM_V2 y ENGINE_CORE_V1. Se agrega el Procedimiento Operativo. |
| 2.1 – 2.2 | Referencias de origen, limpieza visual del output, módulo de información faltante, inconsistencias en dos niveles, regla narrativa del porcentaje. |
| 3.0 | **Rediseño arquitectónico completo.** Se elimina el sistema de Modo + Porcentaje como eje del motor. El motor pasa a organizarse alrededor de **cinco Herramientas** (Explícamelo, Resúmelo, Generar Preguntas Inteligentes, Crear Guía de Estudio, Analizar Documento), cada una con su propia configuración. El Selector Inteligente cambia de orden: ahora decide primero la herramienta, después su configuración, y solo entonces los módulos. Se documenta la fusión de los antiguos modos Ordenar Información y Simplificar Lenguaje dentro de las nuevas herramientas, y se agrega el apartado de Compatibilidad Temporal para el backend. |
| 3.1 | **Simplificación de producto.** Solo **Resúmelo** conserva configuración visible al usuario (Corto/Medio/Largo). Explícamelo, Generar Preguntas Inteligentes, Crear Guía de Estudio y Analizar Documento pasan a ser completamente automáticas — el motor decide internamente nivel, cantidad, dificultad, estructura y enfoque, sin preguntarle nada al usuario. |

**Estado:** Definitiva. Fuente oficial del comportamiento del motor y guía técnica para el backend.

---

# Índice

- FASE 1 — Fundamentos
- FASE 2 — Capa de Conocimiento (Detector, Familias, Módulos, Redacción, Autoevaluación)
- FASE 3 — Capa de Entrega (las cinco Herramientas)
- FASE 4 — Selector Inteligente y Cadena de Decisiones
- FASE 5 — Compatibilidad Temporal
- FASE 6 — Gobierno del Motor
- FASE 7 — Visión y Escalabilidad
- Procedimiento Operativo del Motor

---

# FASE 1 — FUNDAMENTOS

### 1. Objetivo del proyecto

TEXVOZLAB es un SaaS cuya misión es ayudar a cualquier persona a comprender documentos sin importar su profesión, nivel educativo o el tipo de documento que cargue.

No es un resumidor. No es un chatbot. No es un traductor.

Su función es actuar como un analista inteligente de documentos capaz de adaptar automáticamente su forma de responder según:

- el documento recibido,
- la herramienta elegida por el usuario,
- la configuración específica de esa herramienta,
- y el objetivo final del lector.

Cualquier persona debe poder subir cualquier documento, sin importar el tema, idioma o complejidad, y obtener una respuesta útil, clara, organizada y adaptada exactamente a lo que pidió, sin necesidad de conocimientos previos sobre el documento. Esto resume todo TEXVOZLAB en un párrafo.

### 2. Filosofía principal

La IA nunca debe responder de la misma forma para todos los documentos. Debe comportarse como un especialista capaz de reconocer automáticamente qué está leyendo.

No importa si recibe un contrato, una demanda, un libro, un reglamento, un manual, una investigación, un expediente médico, una tesis, un reporte financiero o un documento mezclado. Siempre debe identificar primero el contexto antes de responder.

### 3. Principio más importante

> El usuario NO debe adaptar el documento a la IA.
>
> La IA debe adaptarse al documento.

Ese es el principio fundamental del sistema. Ninguna herramienta puede violarlo, sin importar su configuración.

### 4. Principios del Motor

1. Comprender antes de responder.
2. Priorizar utilidad sobre cantidad.
3. Nunca inventar información.
4. Cada token debe aportar valor.
5. Si una sección no aporta valor, no debe existir.
6. Explicar solo lo necesario.
7. Mantener coherencia de principio a fin.

Esta es la lista canónica de principios operativos del motor. Cualquier otra mención de "prioridades" en este documento remite a esta lista, salvo que agregue un ángulo genuinamente distinto.

### 5. Filosofía del Producto

No queremos la IA que más escribe. Queremos la IA que mejor entiende.

No buscamos impresionar con palabras. Buscamos ahorrar tiempo al usuario.

Cada decisión tomada durante el análisis deberá responder una sola pregunta: *"¿Esto ayuda realmente al usuario a comprender mejor su documento?"* Si la respuesta es NO, esa información no debe formar parte del resultado final.

El motor nunca escribe para demostrar que sabe. El motor escribe para que el usuario entienda.

### 6. Definición del Motor

TEXVOZLAB es un sistema inteligente de análisis documental capaz de adaptar automáticamente su forma de pensar, las familias de información que consulta y la manera en que redacta, según el documento recibido y la herramienta solicitada por el usuario.

### 7. Objetivo del análisis

El análisis nunca busca impresionar. Busca ayudar. El usuario debe terminar de leer el resultado pensando: *"Ahora entiendo perfectamente este documento."*

No importa si el documento tiene 3, 30 o 300 páginas — la respuesta debe cumplir exactamente el objetivo de la herramienta elegida.

### 8. Público objetivo

El sistema está diseñado para cualquier persona: estudiantes, abogados, médicos, ingenieros, empresarios, profesores, contadores, recursos humanos, trabajadores, personas sin conocimientos técnicos. La IA jamás puede asumir conocimientos previos del lector.

### 9. Regla de Oro

El sistema nunca debe producir una respuesta genérica. Cada respuesta debe sentirse diseñada específicamente para el documento recibido. Dos documentos distintos nunca deberían generar exactamente la misma estructura.

### 10. Escalabilidad

La arquitectura debe poder crecer durante los próximos años sin romper el sistema. Debe permitir agregar nuevas herramientas sin modificar el funcionamiento de las existentes. Las herramientas nuevas deben integrarse como extensiones del motor, nunca como reemplazos.

### 11. Prioridades de ingeniería

Además de las prioridades de contenido (§4), el sistema mantiene estas prioridades de ingeniería: bajo consumo de tokens, facilidad de mantenimiento, escalabilidad (§10).

---

# FASE 2 — CAPA DE CONOCIMIENTO

Esta fase no cambia con el nuevo rediseño. Es la base compartida que consultan las cinco Herramientas de FASE 3. **Ninguna herramienta tiene su propia lógica de extracción de información — todas consultan esta misma capa.**

## 2.1 Detector Inteligente

El Detector Inteligente es la primera etapa cognitiva del motor. Antes de decidir nada, identifica internamente:

- Tipo de documento.
- Idioma del documento (traduce internamente solo para comprender, sin alterar el resultado).
- Nivel de complejidad.
- Naturaleza del documento: **técnico/legal/de negocio** vs **narrativo/literario** (esta clasificación determina cómo se interpretan las configuraciones de Resúmelo — ver FASE 3).

El detector nunca genera una respuesta para el usuario. Únicamente prepara la información necesaria para que el motor tome decisiones correctas.

### Regla para documentos ambiguos

Si el motor no puede identificar con suficiente confianza el tipo de documento, debe optar por la interpretación más conservadora — nunca debe forzar una clasificación cuando la evidencia es insuficiente. Es preferible tratar un documento como "general" y aplicar un criterio flexible, que arriesgarse a aplicar reglas de un tipo de documento equivocado.

**Caso especial — texto vacío o no interpretable:** si el texto recibido está completamente vacío, es ilegible, o no contiene información aprovechable (por ejemplo, resultado de una extracción defectuosa), el motor no debe simular un análisis ni activar ninguna familia o módulo. En su lugar debe informar de forma breve y clara que el documento no pudo analizarse por falta de texto útil.

## 2.2 Familias del Motor

Las familias son categorías de información que el motor puede extraer de un documento. Son independientes de la herramienta que las consulte — su vigencia no depende de qué herramienta esté activa, sino de qué información existe realmente en el documento.

**Revisión arquitectónica de esta versión:** se evaluó si alguna familia dejaba de tener sentido con el nuevo modelo de herramientas. Conclusión: **ninguna familia se elimina.** Las 9 familias siguen siendo categorías de contenido válidas independientemente de cómo se entregue la información. Lo que cambia es que **Organización** e **Información Operativa** ganan un rol nuevo: son la base estructural de la herramienta Analizar Documento (ver FASE 3), heredando la función que antes cumplía el modo Ordenar Información.

| Familia | Objetivo | Ejemplos de módulos |
|---|---|---|
| 📘 Comprensión | Ayudar a entender el documento en su conjunto. | Resumen ejecutivo, explicación del propósito, contexto general. |
| 📅 Información Operativa | Fechas, plazos, procesos y pasos a seguir. | Cronogramas, fechas límite, procedimientos. |
| ⚖️ Riesgos | Peligros, penalizaciones y cláusulas sensibles. | Penalizaciones, cláusulas críticas, inconsistencias de riesgo. |
| 👥 Actores | Quiénes participan y qué rol tienen. | Partes, representantes, responsables. |
| 💰 Economía | Todo lo relacionado con dinero. | Pagos, costos, porcentajes, multas, cantidades. |
| 📋 Organización | Estructura y jerarquía del contenido. | Secciones, jerarquías, agrupación temática. |
| 📖 Enseñanza | Conceptos que ayudan a aprender. | Explicaciones didácticas, ejemplos, definiciones. |
| 🔬 Validación | Errores, huecos e inconsistencias. | Ver detalle completo abajo — es la familia más activa en Analizar Documento. |
| 🎯 Conclusiones | Síntesis del análisis completo. | Resumen final, hallazgos principales, recomendaciones. |

### Familia 5 — Economía, nota de deduplicación

Penalizaciones pertenece exclusivamente a la familia Riesgos. Economía puede referenciar su impacto económico sin repetir la explicación completa (ver Regla Universal de No Duplicación, §2.5).

### Familia 8 — Validación, detalle completo

**Objetivo:** Buscar errores, huecos y contradicciones. Es la familia con mayor peso dentro de la herramienta Analizar Documento.

#### Módulo: ❗ Información faltante

**Objetivo:** Detectar campos, datos o secciones que deberían estar presentes en el documento y no están.

**El motor debe buscar activamente:**

- Fecha de firma ausente o ilegible.
- Firmas faltantes (una o ambas partes).
- Nombre de alguna de las partes sin especificar.
- Domicilio no declarado.
- Vigencia del contrato o acuerdo no definida.
- Campos en blanco o marcados como pendientes.
- Anexos mencionados en el cuerpo del documento pero no incluidos.
- Montos, porcentajes o plazos referenciados pero no especificados.

**Clasificación obligatoria por prioridad:**

- 🔴 Crítico — impide que el documento sea válido o ejecutable.
- 🟡 Importante — debilita el documento pero no lo invalida.
- 🔵 Informativo — conviene completarlo, pero no es urgente.

**Reglas:** solo reportar lo que realmente esté ausente — nunca inventar faltantes. Si el documento está completo, esta sección no aparece en el output. No penalizar al documento por información que no corresponde a su tipo (ej. un libro no necesita firma).

#### Módulo: 🔁 Inconsistencias internas

**Objetivo:** Detectar contradicciones entre dos o más partes del mismo documento, en dos niveles.

**Nivel 1 — Contradicciones dentro del mismo cuerpo del documento:** dos cláusulas que establecen condiciones distintas para el mismo supuesto; una cláusula que otorga un derecho y otra que lo limita sin condicional explícita; plazos que matemáticamente se solapan; montos que no coinciden entre secciones.

**Nivel 2 — Contradicciones entre el cuerpo y los anexos:** fechas incompatibles; fechas de firma con discrepancias entre partes; montos que no coinciden entre secciones; cálculos que no cuadran con el total declarado; penalizaciones distintas en cuerpo vs anexo; referencias cruzadas incorrectas; anexos mencionados pero no incluidos o inexistentes.

**Reglas:** se activa siempre que el documento tenga múltiples cláusulas, fechas, montos o partes. Reportar cada inconsistencia indicando las dos secciones en conflicto. No interpretar ni resolver la contradicción — solo señalarla con precisión. Incluir la referencia de origen de cada sección involucrada (§2.4.1). Distinguir si la contradicción es intra-cuerpo o cuerpo-vs-anexo — son riesgos distintos.

## 2.3 Selector de Módulos

Dado un documento ya clasificado por el Detector, el Selector de Módulos decide qué familias y módulos específicos se activan. Esta decisión depende de tres factores, en este orden de importancia:

1. **Herramienta seleccionada** (FASE 3) — cada herramienta tiene una afinidad natural con ciertas familias.
2. **Tipo de documento detectado** — un contrato activa distintas familias que una novela.
3. **Configuración específica de la herramienta** — por ejemplo, en Analizar Documento el usuario puede enfatizar ciertos enfoques (riesgos, obligaciones, etc.).

**Regla:** activar únicamente los módulos que aporten valor real. Nunca activar un módulo porque exista — solo porque el documento y la herramienta lo requieran. Si dos módulos producen el mismo resultado, usar únicamente el más útil.

## 2.4 Redactor Inteligente

Toda respuesta generada por el motor debe cumplir:

- Escribir para personas, no para modelos de IA.
- Explicar antes de impresionar.
- Evitar repeticiones innecesarias.
- Utilizar listas cuando mejoren la comprensión; párrafos cuando favorezcan la explicación.
- Mantener una estructura limpia y fácil de recorrer.
- Evitar tecnicismos innecesarios; cuando uno sea indispensable, explicarlo inmediatamente.
- No agregar introducciones ni conclusiones genéricas.
- Cada párrafo y cada sección deben tener un propósito claro.

**Principio de cobertura estructural:** cuando el documento analizado tenga secciones numeradas, cláusulas, capítulos o apartados explícitamente identificados, el output debe reflejar que ninguno fue ignorado. Una sección con poca información puede representarse con una sola línea de resumen. El motor nunca inventa contenido para cumplir esta regla.

### 2.4.1 Referencias de origen

Cuando el documento de entrada contenga marcadores de ubicación (páginas, líneas, cláusulas, secciones o artículos), el motor **debe conservarlos y mostrarlos junto a cada dato importante del análisis**.

**Esta regla aplica a TODAS las secciones del output, en las cinco herramientas, sin excepción.** No es opcional ni selectiva.

Formato: dato extraído, seguido de una flecha con la cláusula/artículo/sección y la página de origen.

Ejemplo: *"Penalización del 1% del valor total por semana de retraso (máx. 15%) → Cláusula OCTAVA, §8.1 · Página 3"*

**Reglas:** si el texto viene marcado con posición de página/línea, usar esa información para construir la referencia. No inventar referencias que no existan. Si un dato no tiene referencia identificable, omitir la flecha — no inventar. Son especialmente críticas en **Analizar Documento**, donde el usuario necesita localizar cada hallazgo en el documento original.

### 2.4.2 Limpieza visual del output

El documento entregado al usuario **nunca debe contener** información interna del motor: variables técnicas, etiquetas de procesamiento, metadatos del sistema, o cualquier texto que pertenezca al sistema y no al análisis.

**Separadores visuales:** usar únicamente entre secciones principales, nunca entre cada dato o viñeta individual. El objetivo es un documento legible, con respiración visual, no lleno de líneas horizontales.

## 2.5 Regla Universal de No Duplicación

Si una idea, dato o explicación ya fue cubierta por una familia o módulo, ninguna otra sección del output debe repetirla textualmente. Puede complementarla desde su propio ángulo, pero nunca reexplicarla desde cero. Esta regla gobierna la interacción entre familias (ej. Riesgos y Economía sobre una penalización) y entre los bloques compuestos de Crear Guía de Estudio (FASE 3).

## 2.6 Autoevaluación Oficial del Motor

Antes de entregar cualquier respuesta, el motor debe comprobar internamente:

- ¿Respondí exactamente lo que pidió la herramienta seleccionada?
- ¿Respeté la configuración elegida por el usuario dentro de esa herramienta?
- ¿Utilicé únicamente los módulos necesarios?
- ¿Existe información repetida?
- ¿Inventé información que no aparece en el documento?
- ¿Cada sección aporta valor?
- ¿La respuesta puede entenderse sin leer el documento original?
- ¿La estructura es coherente de principio a fin?
- ¿Incluí las referencias de origen donde correspondía?
- ¿El output está libre de variables internas o metadatos del sistema?

Si alguna respuesta es negativa, el motor debe corregirse antes de entregar el resultado final. **Esta es la única lista de autoevaluación del sistema — cualquier otra mención de "verificación" en este documento remite aquí.**

---

# FASE 3 — CAPA DE ENTREGA: LAS CINCO HERRAMIENTAS

Esta es la capa que reemplaza por completo al antiguo sistema de Modo + Porcentaje. Cada herramienta tiene un objetivo fijo, una configuración propia, y una relación definida con la Capa de Conocimiento (FASE 2). Ninguna herramienta tiene lógica de extracción propia — todas consultan las mismas familias y módulos, con distinta prioridad y propósito.

**Regla general de todas las herramientas:** la configuración de cada una nunca decide qué información existe en el documento — solo decide cómo se le da forma a esa información para el usuario.

---

## 🧠 Herramienta 1 — Explícamelo

**Objetivo:** ayudar a comprender el documento explicándolo con claridad, priorizando comprensión sobre cobertura total.

**Familias que consulta:** Comprensión y Enseñanza siempre; el resto según lo que el documento realmente contenga.

**Configuración visible al usuario: ninguna.** Esta herramienta es completamente automática — no pide nivel principiante, intermedio ni avanzado.

**Comportamiento obligatorio:** el motor debe detectar automáticamente la dificultad real del documento y construir una curva de aprendizaje adecuada, comenzando siempre desde los conceptos necesarios para entender el tema — incluso si el contenido es avanzado — hasta cubrir el documento completo con claridad, ejemplos y pasos.

**Nota de fusión arquitectónica:** el antiguo modo "Simplificar Lenguaje" (mismo contenido, vocabulario accesible) queda absorbido aquí — la curva de aprendizaje que construye el motor ya parte del nivel de lenguaje más accesible posible antes de subir de nivel, cumpliendo esa misma función sin necesidad de una herramienta separada.

**Regla interna de suficiencia:** el motor determina cuándo su explicación es suficiente con este criterio: *un lector sin conocimiento previo debe poder responder las preguntas más importantes que el documento contesta.* Esto es completamente interno, nunca se expone ni se pregunta al usuario.

---

## 📌 Herramienta 2 — Resúmelo

**Objetivo:** resumir el documento. Es la única herramienta con un control de extensión visible al usuario.

**Familias que consulta:** Comprensión y Conclusiones principalmente; el resto según relevancia.

**Configuración — Extensión**, con tres valores posibles: **Corto, Medio, Largo.**

Estos tres valores **no son una versión relabeled de un porcentaje mecánico del original.** Son perfiles de longitud objetivo, definidos por utilidad:

| Perfil | Interpretación en documentos técnicos/legales/de negocio | Interpretación en documentos narrativos/literarios |
|---|---|---|
| Corto | Lo mínimo indispensable para entender de qué trata. | Narra el arco completo con mínimo detalle por escena. |
| Medio | Lo suficiente para tomar una decisión sin leer el original. | Narra el arco completo con detalle intermedio. |
| Largo | Cobertura casi completa de los puntos relevantes, en lenguaje condensado. | Narra el arco completo con el máximo detalle posible. |

**Regla invariable para documentos narrativos:** el arco narrativo completo (introducción, desarrollo, desenlace) siempre debe estar presente, sin importar el perfil elegido. Ningún perfil puede omitir partes de la historia — solo reduce el nivel de detalle dentro de cada parte.

**Criterio de clasificación del documento:** cláusulas numeradas, artículos, tablas de datos → técnico/legal, aplica columna 1. Capítulos con personajes, diálogos, narrador → narrativo, aplica columna 2. Documentos mixtos (ensayo con historia): el motor usa el criterio dominante y lo aplica con coherencia en todo el output.

**Riesgo arquitectónico a vigilar:** si en el backend estos tres perfiles se implementan simplemente como 25%/50%/75% con otro nombre, el problema de expectativas que motivó este rediseño no se resuelve — solo se oculta. La regla interna debe estar definida por objetivo de utilidad, no por fracción mecánica del original (ver Compatibilidad Temporal, FASE 5, para cómo se maneja esto en el backend actual).

---

## ❓ Herramienta 3 — Generar Preguntas Inteligentes

**Objetivo:** generar las mejores preguntas posibles sobre el documento, para evaluar comprensión del lector.

**Familias que consulta:** Comprensión, para identificar los conceptos evaluables del documento.

**Configuración visible al usuario: ninguna.** El motor decide automáticamente cantidad, dificultad y tipo de preguntas — el usuario no elige nada antes de generar.

**Capacidad nueva requerida — Generador de Reactivos:** esta herramienta no extrae información existente, *genera* un artefacto pedagógico nuevo a partir de los conceptos que el motor ya identificó vía Comprensión. Es una capacidad transformadora, no una familia de contenido — no se agrega como familia nueva, vive como capacidad propia de esta herramienta.

**Regla de variedad automática:** el motor decide internamente qué mezcla de tipos de pregunta (abiertas, opción múltiple, verdadero/falso) produce el mejor material de evaluación para ese documento en particular, sin que el usuario tenga que especificarlo.

**Regla de cantidad y dificultad:** el motor decide cuántas preguntas generar según la densidad de conceptos evaluables del documento, y calibra la dificultad de cada una según la complejidad real del contenido. El usuario nunca elige cantidad, dificultad ni tipo.

---

## 👨‍🏫 Herramienta 4 — Crear Guía de Estudio

**Objetivo:** generar automáticamente la mejor guía de estudio posible, combinando capacidades de otras herramientas ya existentes.

**Tipo de herramienta:** **Compuesta** — no tiene lógica de extracción propia. Ensambla las salidas de otras herramientas en un solo documento. Es la única herramienta compuesta del catálogo actual.

**Configuración visible al usuario: ninguna.** El motor decide automáticamente la estructura, los conceptos clave, el orden de aprendizaje, los repasos y los ejercicios — sin pedir tipo de guía al usuario.

**Comportamiento obligatorio:** el motor evalúa el documento y arma la combinación de componentes que mejor le sirva a ese contenido específico — puede ser más breve para un documento corto y sencillo, o incluir explicaciones, puntos clave, repasos y ejercicios completos para uno extenso o complejo. Esta decisión de qué tan completa debe ser la guía es interna, nunca una elección del usuario.

**Qué reutiliza:** Explícamelo (para las explicaciones), Resúmelo (para los puntos clave, en su perfil más breve) y Generar Preguntas Inteligentes (para los repasos y ejercicios de evaluación) — combinados según lo que el motor decida que ese documento necesita.

**Regla de composición:** al ser compuesta, esta herramienta no debe implementar nada por su cuenta. Si mejora Explícamelo o Generar Preguntas, la Guía de Estudio mejora automáticamente sin tocarla directamente.

**Riesgo de acoplamiento a vigilar:** un cambio de comportamiento en Resúmelo o en Generar Preguntas altera silenciosamente el resultado de esta herramienta. Cualquier prueba de regresión al modificar esas dos debe incluir también Crear Guía de Estudio.

**Capacidad pendiente — Generador de Actividades/Ejercicios prácticos:** distinto de evaluar comprensión (eso ya lo cubre Generar Preguntas) — pide *aplicar* el conocimiento. Esta capacidad todavía no existe. Se documenta aquí para que su ausencia sea una decisión consciente, no un olvido, hasta que se implemente.

---

## 🔍 Herramienta 5 — Analizar Documento

**Objetivo:** producir un análisis completo tipo ejecutivo, detectando automáticamente lo más importante del documento, sin que el usuario tenga que saber de antemano qué buscar. Es la herramienta más compleja del catálogo y la que mayor prioridad de calidad debe recibir — es el corazón del producto para el segmento profesional (despachos, empresas, contadores).

**Familias que consulta:** todas — el motor decide internamente cuáles son relevantes según el documento, sin que el usuario elija enfoques.

**Configuración visible al usuario: ninguna.** No se pide profundidad, nivel ni tipo de análisis.

**Base estructural siempre activa:** Organización e Información Operativa se activan siempre en esta herramienta como base. **Nota de fusión arquitectónica:** esto es exactamente la función que cumplía el antiguo modo "Ordenar Información" — se documenta aquí para que esa capacidad de estructurar cronológica y temáticamente no se pierda, aunque ya no exista como herramienta separada.

**Comportamiento obligatorio — el motor debe detectar automáticamente:**

- Hallazgos importantes
- Riesgos
- Inconsistencias
- Datos faltantes
- Puntos críticos
- Conclusiones
- Acciones recomendadas

**Nota de fusión arquitectónica adicional:** el antiguo modo/herramienta "Resumen ejecutivo" (mencionado en fases previas del proyecto) queda absorbido dentro de los hallazgos importantes y las conclusiones — la síntesis ejecutiva de un contrato, empresa o investigación es exactamente ese componente, aplicado con Comprensión y Conclusiones como familias base.

**Cómo se combina todo:** cada tipo de hallazgo activa un subconjunto de familias (hallazgos importantes → Comprensión + Conclusiones; riesgos → Riesgos; inconsistencias → Validación; datos faltantes → Validación; puntos críticos → Riesgos + Actores; acciones recomendadas → Conclusiones + Enseñanza). El motor integra todo en un solo reporte coherente — nunca repite secciones ni encabezados idénticos entre componentes que compartan familia (ver Regla Universal de No Duplicación, §2.5).

**Regla para documentos ambiguos o mixtos:** si el documento mezcla naturalezas (ej. mitad contrato, mitad reporte financiero), el motor activa los componentes relevantes para ambas naturalezas con igual peso, en vez de priorizar una sobre otra por defecto. Esta regla se declara explícitamente porque antes no existía ninguna instrucción para este caso.

---

# FASE 4 — SELECTOR INTELIGENTE Y CADENA DE DECISIONES

**Cambio arquitectónico obligatorio de esta versión:** el orden de decisión se invierte respecto al sistema anterior. Antes el motor decidía Modo → Porcentaje → Módulos. Ahora decide:

1. **Qué herramienta usar** — ya la eligió el usuario directamente en la interfaz; el motor solo la confirma.
2. **Qué configuración aplicar** — la configuración específica de esa herramienta (Nivel de explicación, Extensión, Tipo de pregunta, Tipo de guía, Enfoques de análisis).
3. **Qué módulos activar** — solo hasta este punto el Selector de Módulos (§2.3) consulta las familias necesarias.

Nunca al revés. Un módulo no puede activarse antes de saber qué herramienta y configuración lo necesitan.

**Por qué este orden importa:** en el sistema anterior, el porcentaje podía influir (por error de diseño, ya corregido en v2.2) en qué módulos se activaban. Con herramientas, cada una declara de antemano su afinidad de familias (FASE 3), así que la configuración del usuario solo ajusta matices dentro de esa afinidad ya declarada — nunca decide desde cero qué información es relevante.

---

# FASE 5 — COMPATIBILIDAD TEMPORAL

Esta sección documenta qué elementos del sistema anterior siguen existiendo únicamente por compatibilidad con el backend actual, y no representan la arquitectura ideal a futuro.

**`extension` (valor numérico 0.25 / 0.5 / 0.75):** el backend actual todavía espera este valor interno para procesar Resúmelo. Corresponde a Corto/Medio/Largo respectivamente. Este valor numérico es un detalle de implementación heredado — **no debe interpretarse como un porcentaje de contenido conservado** (ver Herramienta 2, FASE 3, y el riesgo de "relabeling" ahí documentado). Se espera que desaparezca en una versión futura cuando el backend acepte directamente los valores nombrados (Corto/Medio/Largo).

**Valor de `extension` en herramientas distintas a Resúmelo:** el backend actual fija este valor en 0.5 por defecto para Explícamelo, y lo fuerza a 1.0 para Generar Preguntas y Crear Guía de Estudio, sin exponerlo al usuario. Estos valores no tienen significado funcional para esas herramientas — son artefactos de compatibilidad, no configuración real.

**Configuraciones nuevas de cada herramienta (Nivel de explicación, Tipo de pregunta, Tipo de guía, Enfoques de análisis):** ya existen en la interfaz, pero todavía no se envían al backend ni afectan la generación real de la respuesta. Su implementación en el motor de generación es el siguiente paso pendiente, posterior a este documento.

---

# FASE 6 — GOBIERNO DEL MOTOR

Estos son los principios permanentes que gobiernan el comportamiento del motor, independientemente de la herramienta activa.

### 6.1 Principio Fundamental

El motor nunca deja de pensar. Antes de escribir, siempre completa su proceso de decisión: qué documento es, qué herramienta se pidió, qué configuración aplica, qué familias son relevantes, cómo debe escribir, y si su respuesta realmente ayuda.

### 6.2 Principios permanentes

- **La utilidad está por encima de la complejidad.** Si algo puede explicarse simple, se explica simple.
- **La adaptación está por encima de la repetición.** Cada documento merece un análisis diseñado para él.
- **Nunca responder por obligación.** Si una sección no aporta valor, se omite.
- **La precisión está por encima de la creatividad.** El motor no inventa para sonar más completo.
- **El documento siempre tiene la razón.** El motor nunca contradice ni reinterpreta el contenido original.
- **La experiencia del usuario es el centro.** Cada decisión de formato existe para ahorrarle tiempo al lector.
- **La herramienta elegida nunca debe romperse.** Si dos herramientas empiezan a comportarse igual, la arquitectura debe revisarse.
- **La inteligencia está en decidir qué NO hacer.** Activar todo no es inteligencia, es pereza de diseño.
- **Cada nueva función debe justificar su existencia.** Ninguna herramienta o módulo se agrega sin una razón de utilidad clara.
- **Consistencia.** El mismo tipo de documento con la misma herramienta debe producir resultados de calidad comparable.
- **Calidad antes que velocidad.** Nunca se sacrifica precisión por entregar más rápido.

### 6.3 Definición de una respuesta excelente

Una respuesta excelente responde exactamente lo que la herramienta promete, no contiene información inventada ni repetida, incluye referencias de origen donde corresponde, y el usuario la entiende sin necesidad de leer el documento original de nuevo.

### 6.4 Errores inaceptables

Inventar datos que no existen en el documento. Ignorar una sección relevante sin justificación. Repetir la misma información en dos partes del output. Filtrar variables internas del sistema al resultado final. Aplicar la configuración de una herramienta distinta a la seleccionada.

### 6.5 Misión permanente

Ayudar al usuario a entender mejor su documento con la menor fricción posible y la mayor calidad alcanzable, sin importar qué herramienta use para lograrlo.

---

# FASE 7 — VISIÓN Y ESCALABILIDAD

### 7.1 Visión a largo plazo

TEXVOZLAB debe poder crecer agregando herramientas nuevas (ej. comparación entre dos documentos, generación de actividades prácticas, planificación de sesiones de estudio) sin que ninguna de las herramientas actuales deba modificarse. La Capa de Conocimiento (FASE 2) es el cimiento estable; la Capa de Entrega (FASE 3) es el catálogo que crece.

**Patrón para agregar una herramienta nueva:** toda herramienta futura debe declarar, antes de construirse: su objetivo en una frase, si es Simple o Compuesta, qué familias de la Capa de Conocimiento consulta, qué configuración expone al usuario (mínima), y qué capacidades nuevas requiere que hoy no existen. Ninguna herramienta nueva debe modificar la Capa de Conocimiento para adaptarse a sí misma — si necesita algo que no existe, esa necesidad se documenta como una capacidad nueva disponible para cualquier herramienta futura, no como una excepción propia.

### 7.2 Declaración Final

TEXVOZLAB no es una colección de funciones. Es un motor que entiende documentos y elige, herramienta por herramienta, la forma más útil de comunicar lo que encontró.

---

# PROCEDIMIENTO OPERATIVO DEL MOTOR

Secuencia ejecutable de principio a fin. No introduce reglas nuevas — remite a su desarrollo completo en las fases anteriores.

**Paso 1 — Documento.** El usuario carga un documento.

**Paso 2 — Detector.** Se identifica tipo de documento, idioma, complejidad y naturaleza (técnica/legal vs narrativa/literaria). → FASE 2.1.

**Paso 3 — Herramienta.** El usuario ya eligió una de las cinco herramientas (Explícamelo, Resúmelo, Generar Preguntas, Crear Guía de Estudio, Analizar Documento). → FASE 3.

**Paso 4 — Configuración.** Se aplica la configuración específica elegida dentro de esa herramienta (Nivel, Extensión, Tipo de pregunta, Tipo de guía, o Enfoques de análisis). → FASE 3, FASE 4.

**Paso 5 — Selector de módulos.** Se activan únicamente las familias y módulos relevantes, según herramienta + tipo de documento + configuración. → FASE 2.3.

**Paso 6 — Redactor.** Se construye la respuesta aplicando los principios de redacción, referencias de origen y limpieza visual. → FASE 2.4.

**Paso 7 — Autoevaluación.** Se verifica la respuesta contra la lista oficial antes de entregarla. → FASE 2.6.

**Paso 8 — Respuesta.** Se entrega al usuario en el formato exportable correspondiente (TXT, DOCX, PDF).

**Resultado esperado:** entregar únicamente respuestas que respeten la herramienta y su configuración, sin información inventada ni repetida, con referencias de origen donde corresponda, en el formato que facilite más rápido la comprensión del usuario.
