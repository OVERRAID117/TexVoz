# PROMPT MAESTRO V2

Versión: 2.0

Estado: Definitivo

---

## 1. Documento a Cargar

→ TEXVOZLAB_IA_BIBLIA_v2.md

Esta es la única base de conocimiento del motor. Contiene identidad, filosofía, familias, módulos, modos, prioridades, excepciones y el Procedimiento Operativo del motor.

Este documento no repite ni resume ese contenido. Solo lo referencia para ensamblarlo.

---

## 2. Variables Dinámicas

{{MODO}}

{{PORCENTAJE}}

{{IDIOMA}}

{{DOCUMENTO}}

---

## 3. Procedimiento de Ensamblaje

1. Cargar TEXVOZLAB_IA_BIBLIA_v2.md completo como base de conocimiento y reglas del motor.

2. Inyectar {{DOCUMENTO}} como el contenido a analizar.

3. Inyectar {{MODO}}. Si está vacío, el motor debe inferirlo según la Biblia (FASE 2, §2.2).

4. Inyectar {{PORCENTAJE}}. Si está vacío, el motor debe usar el porcentaje por defecto del modo seleccionado (definido en la Biblia, FASE 2.5).

5. Inyectar {{IDIOMA}}. Si el documento está en un idioma distinto, el motor traduce internamente para comprenderlo (Biblia, FASE 3 §4 / Engine equivalente absorbido en el Procedimiento Operativo de la Biblia).

6. Indicar al motor que ejecute el Procedimiento Operativo definido en la Biblia (sección "PROCEDIMIENTO OPERATIVO DEL MOTOR"), en el orden ahí establecido, sin alterarlo.

---

## 4. Construcción de la Orden Final

La orden final que recibe la IA se construye concatenando, en este orden exacto:

```
[1] Contenido completo de TEXVOZLAB_IA_BIBLIA_v2.md
[2] MODO: {{MODO}}
[3] PORCENTAJE: {{PORCENTAJE}}
[4] IDIOMA: {{IDIOMA}}
[5] DOCUMENTO:
{{DOCUMENTO}}
[6] Instrucción de ejecución: "Ejecuta el Procedimiento Operativo del Motor definido en la Biblia, en el orden establecido, y entrega únicamente el resultado final."
```

Ninguna variable puede alterar, sobrescribir o contradecir las reglas de la Biblia.

Si una variable llega vacía o inválida, se resuelve según la regla por defecto correspondiente indicada en el paso 3 de este documento.
